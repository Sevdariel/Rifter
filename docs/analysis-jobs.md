# Analysis jobs

`analysis_jobs` is the pipeline queue behind AI match analysis. Every
analysis run is one row: enqueued by the API, claimed by the in-process
worker (#20), and completed with the captured prompt, validated report,
token usage, timings, and any failure — the observability backbone for the
LLM pipeline.

## Shape

- State machine: `queued → running → succeeded | failed` (`status` enum).
- Idempotent dedupe: unique `(puuid, matchId, contractVersion, promptVersion)`
  — re-requesting the same analysis returns the existing job (`created:false`)
  instead of a duplicate.
- Claim: single `UPDATE ... RETURNING` with `FOR UPDATE SKIP LOCKED` — atomic,
  so concurrent workers can never take the same row.
- Crash recovery: a row claimed longer than `STALE_CLAIM_MS` (1 h) is
  re-queued by the next `claim()` call; `attempts` counts each claim.
- Retention: `sweepRetention` deletes `succeeded|failed` rows older than
  `JOB_RETENTION_DAYS` (default 30). The sweep piggybacks on `claim()` at most
  once per hour — no scheduler dependency.
- FK `(puuid, matchId) → matches` — a job can only exist for a match already
  in the immutable cache. No cascade: `matches` rows are never deleted today,
  so `NO ACTION` never fires; a future match-retention feature must handle
  referencing jobs first.
- Captured per run: `prompt`, `report` (JSONB, validated contract), `error`,
  `tokenUsage`, `timings`, `retries`, `modelDigest`.

## API surface

`AnalysisJobsService` is internal — the worker drives `enqueue → claim →
markSucceeded | markFailed`; status reads go through `getForPuuid` /
`listByPuuid` (puuid-scoped, no IDOR). `mark*` only transitions `running`
rows — anything else throws `JOB_NOT_RUNNING` (409). HTTP endpoints for
enqueue/status land with the analysis module in #20.

## Notes

- Rows live in the same DB as the match cache; no external queue. Postgres
  `SKIP LOCKED` is the claim mechanism — do not add an in-memory queue.
- In-memory state is intentionally limited to the last-sweep timestamp;
  restarting the API only delays a sweep, never loses a job.
- Migration: `drizzle/0001_even_wallflower.sql` (enum + table + FK + dedupe
  unique + claim/finished indexes).
