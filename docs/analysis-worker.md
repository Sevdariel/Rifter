# Analysis pipeline

Turns a cached match into an AI coaching report. Manual trigger only: the
caller enqueues a job, the in-process worker claims it and runs
`packages/analysis` (pipeline internals: `docs/analysis.md`) against the
local Ollama. A succeeded job lands two writes: the full capture on the
`analysis_jobs` row (`docs/analysis-jobs.md`) and the player-facing row in
`reports` (`docs/reports.md`), written first so a succeeded job always has
its report.

## Flow

1. `POST /analysis/jobs {matchId}` — validates the match is cached (and
   normalizes cleanly), then enqueues `(puuid, matchId, contractVersion,
promptVersion)`. Re-POSTing the same match+versions returns the existing
   job (`created: false`) — the dedupe unique key makes enqueue idempotent.
   A `failed` job is _not_ terminal: re-POSTing resets it to `queued` (error
   and timestamps cleared) so transient failures are retryable.
2. `GET /analysis/jobs` / `GET /analysis/jobs/:id` — puuid-scoped status
   polling. The view carries status, attempts, timings, token usage, and the
   model digest — never the captured prompt or report.
3. The worker polls every `ANALYSIS_WORKER_POLL_MS` (default 5 s), claims one
   job atomically (`SKIP LOCKED`), and runs it to completion before claiming
   the next — one job at a time, so Ollama serves a single model.

## Worker pipeline

Per claimed job: version guard → `detect` (Ollama reachable) →
`getNormalized` (match cache) → `resolveModel` → `analyzeMatch` (metrics →
moment detection → prompt → constrained generate → schema validation with
one correction retry) → `reports.upsert` (the player-facing row) →
`markSucceeded` with the full capture (report, prompt, token usage,
timings, retries, model digest). Failures land on
`markFailed` with the error message; a crashed worker's job is re-queued by
the stale-claim sweep (see `docs/analysis-jobs.md`).

- **Version guard**: versions are stamped at enqueue; a job claimed after a
  `PROMPT_VERSION`/`REPORT_CONTRACT_VERSION` bump fails with
  `stale job versions` instead of producing a report with false provenance —
  re-enqueue to get a correctly stamped job.
- **Ollama pre-check**: `detect()` fails the job fast when Ollama is down;
  re-POSTing after Ollama recovers re-queues it.
- **Captured prompt is canonical**: `result.prompt` is the built
  `v${PROMPT_VERSION}` prompt; the correction-augmented text sent on a
  validation retry is not persisted.

## Ollama lifecycle (`src/ollama/`)

- **Loopback only** — `OLLAMA_BASE_URL` rejects non-local hosts at env
  validation.
- **Model selection per job** — free VRAM is probed _at inference time_
  (`nvidia-smi`); `selectModelTier` picks the best manifest tier it can
  serve. `OLLAMA_MODEL` forces a tag (unpinned, `pinned:false`);
  `OLLAMA_FREE_VRAM_MB` forces the probe figure on non-NVIDIA hosts; a
  failed probe degrades to the lowest tier.
- **Manifest-only pull** — only resolved names are pulled (`/api/pull`,
  30 min budget); nothing the API receives can trigger a pull.
- **Verify before serve** — the served digest from `/api/tags` must equal
  the manifest pin; a swapped checkpoint fails the job (`TBD` entries accept
  and record the served digest until eval pins them).
- **Zero VRAM during play** — `keep_alive: 0` unloads the model after each
  report; analysis only ever runs on finished, cached games (see
  `docs/analysis-jobs.md` and Riot compliance rules).

## Configuration

| Env                       | Default                  | Purpose                                  |
| ------------------------- | ------------------------ | ---------------------------------------- |
| `OLLAMA_BASE_URL`         | `http://localhost:11434` | Ollama endpoint (loopback enforced)      |
| `OLLAMA_MODEL`            | unset                    | Force model tag, skip tier selection     |
| `OLLAMA_FREE_VRAM_MB`     | unset                    | Force free VRAM (MiB) for tier selection |
| `OLLAMA_THINK`            | `false`                  | Chain-of-thought capture for debug runs  |
| `ANALYSIS_LOCALE`         | `pl`                     | Report language (`pl`/`en`)              |
| `ANALYSIS_WORKER_ENABLED` | `true`                   | `false` runs the API without the worker  |
| `ANALYSIS_WORKER_POLL_MS` | `5000`                   | Idle poll interval (min 1000)            |

The prompt template resolves through the `@rifter/analysis` exports map
(`prompts/v${PROMPT_VERSION}.md`) — a prompt change is a version bump plus a
new template file in the package.

## Notes

- `POST /analysis/jobs` is throttled to 10/min — each job costs GPU minutes.
- The worker starts only when `DATABASE_URL` is set and
  `ANALYSIS_WORKER_ENABLED` is true; without it jobs stay queued. A missing
  prompt template keeps the worker off (logged at boot) instead of failing
  every job.
- Shutdown never loses a job: an in-flight claim either completes or is
  re-queued by the 1-hour stale sweep on next boot.
- `docker-compose` api has no Ollama reachability guarantee — run Ollama on
  the host and keep `OLLAMA_BASE_URL` at loopback for local dev.
- **Stale reuse limitation** (accepted, dev single-user): the dedupe key has
  no locale or model axis, so a succeeded report is reused across
  `ANALYSIS_LOCALE` switches and model-tier changes. Regeneration needs a
  `PROMPT_VERSION`/`REPORT_CONTRACT_VERSION` bump (or the retention sweep).
- Token budget is bounded per call (32k prompt chars, 4096 output tokens)
  with at most one correction retry — worst case ~2× a single call.
