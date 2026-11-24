# Dev harness (apps/web)

Dev-only Angular pages that exercise the M2 API end-to-end: sync matches from
Riot, enqueue analysis jobs, watch job status, and view the generated coaching
reports. Built to debug the pipeline without curl.

**This is not product UI.** It is exempt from the Figma design-acceptance gate
(`.devin/rules/design-acceptance.md`), uses no design-system components, and
will be replaced by the real views in M4.

## Usage

1. Start the stack (`docker compose -f docker-compose.backend.yml up` or
   `pnpm -C apps/api start:dev` + Postgres + migrations).
2. Copy `apps/web/public/config.json` to `config.local.json` (gitignored) and
   set `apiToken` to the same value as `API_AUTH_TOKEN` in `apps/api/.env`.
   `sentryDsn` is optional — leave empty to keep error reporting off.
3. `pnpm -C apps/web start` → http://localhost:4200/dev/matches.
   Without `config.local.json` the harness boots but shows a "no API token"
   banner; API calls would 401.

## Pages

- `/dev/matches` — match list from `GET /matches` joined with `GET /reports`
  (tier badge) and `GET /analysis/jobs` (latest job per match). Controls:
  _Sync recent 5_, _Sync all_ (background, polled via
  `GET /matches/sync/status`), per-row _Analyze_ (`POST /analysis/jobs`).
  While a sync or job is active the page polls every 3 s.
- `/dev/reports/:matchId` — `GET /reports/:matchId`: metadata strip (data
  tier, locale, patch, contract/prompt versions, model digest), summary,
  moments table (`t_start`–`t_end` as m:ss, `topPriority` highlighted) and the
  raw report JSON under a `<details>`.

## Technical notes

- Runtime config: `AppConfig` (`core/config`) fetches `config.json` then
  overlays `config.local.json` in a `provideAppInitializer` — the API never
  sees secrets at build time and nothing secret is committed.
  `config.local.json` is gitignored, excluded from `ng build` assets
  (`angular.json` `ignore`) and from Docker build contexts (`.dockerignore`) —
  it exists only on the dev server. A `.devin/tests/config.test.mjs` assertion
  pins all three exclusions.
- `authTokenInterceptor` attaches `X-Rifter-Token` only to requests whose
  origin matches the configured `apiBaseUrl` (parsed-URL comparison, not a
  string prefix — a lookalike host gets no token).
- Wire DTOs in `core/api/api.models.ts` mirror `apps/api` response types
  (dates serialize to ISO strings). `AnalysisReport` comes from
  `@rifter/analysis`; the product UI replaces these copies with a proper
  contract layer.
- Sentry (`core/sentry`): initialized from `sentryDsn` after config load —
  error reporting only (`tracesSampleRate: 0`), `beforeSend` scrub mirrors
  `apps/api` (redacts `X-Rifter-Token`, cookies, request bodies, query
  strings). `Sentry.createErrorHandler` provides the Angular `ErrorHandler`
  (the issue's "error boundary").
- Dates in wire DTOs are ISO strings, not `Date` objects.
