# Reports

Player-facing coaching reports — the read surface for what the analysis
pipeline produces. One report per `(puuid, matchId)`; the latest successful
analysis wins. Written only by the analysis worker, read by the owner.

## Endpoints

All routes require `X-Rifter-Token` and scope every read to the
authenticated `puuid` — another player's matchId returns 404, never data.

- `GET /reports` — list of report summaries, newest game first. Each entry
  carries `dataTier`, `locale`, contract/prompt versions, model digest, the
  report `summary` line, the real `gameCreationMs` (joined from the match
  cache), and `updatedAt` — everything a list view needs without parsing
  the report JSONB.
- `GET /reports/:matchId` — the summary fields plus the full validated
  `AnalysisReport` payload. `REPORT_NOT_FOUND` (404) for unknown matchIds.

## Storage

The `reports` table (`src/reports/schema.ts`) stores the full
`AnalysisReport` JSONB and denormalizes the fields list views filter on —
`dataTier`, `locale`, `contractVersion`, `promptVersion`, `modelDigest`,
`summary`. `dataTier` is always surfaced as a column: the UI badge never
parses report JSON. Match dates are not copied — `NormalizedMatch` has no
`gameCreationMs`, so reads join the immutable `matches` row instead.

- Unique `(puuid, matchId)` — the upsert conflict target; re-analysis
  overwrites in place.
- FK `(puuid, matchId) → matches` — a report cannot exist for an uncached
  match.
- Index `(puuid, updated_at)` for the owner's list.

## Write path

The worker writes the report row after a successful pipeline run and
_before_ `markSucceeded` (`docs/analysis-worker.md`). If the write fails,
the job fails — a succeeded job always has its report row. Re-analysis
(prompt/contract bump, retry after failure) upserts the same row.

## Related

- `docs/analysis-worker.md` — the pipeline that produces reports.
- `docs/analysis.md` — the report contract and `dataTier` semantics.
- `docs/api.md` — slice layout and auth.
