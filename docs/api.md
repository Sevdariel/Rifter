# API (`apps/api`)

## Purpose

Rifter's NestJS backend. It holds the Riot API key, serves match data and analysis reports to the desktop and web apps, and manages the local Ollama process. It is a localhost-first, single-user service: it binds to loopback, requires a shared token on every non-public route, and is written stateless so a later public deploy is a lift-and-shift behind real auth (RSO).

## Security model

- **Bind**: `HOST` defaults to `127.0.0.1` — only local processes reach the API. Containers override to `0.0.0.0` (compose publishes the port instead).
- **Auth**: every route requires the `X-Rifter-Token` custom header, timing-safe-compared against `API_AUTH_TOKEN` (required env — the API refuses to boot without it). The custom header also blocks browser CSRF/DNS-rebinding posts: cross-origin sends need a preflight the CORS allowlist rejects. `@Public()` exempts `/health` and `/metrics`. RSO later replaces the token — the seam is `IdentityResolver`.
- **Identity**: `IdentityResolver.resolve()` returns `{puuid}`; the dev impl reads `DEV_PUUID` and fails closed when unset. Handlers inject it via the `@Identity()` param decorator; every user-owned resource is scoped to that puuid (no IDOR).
- **CORS**: allowlist from `CORS_ORIGINS` (comma-separated, default `http://localhost:4200`), credentials off. `helmet` sets baseline security headers.
- **Throttling**: global `@nestjs/throttler` floor (300 req/min); stricter per-route limits land with the match-fetch and analyze endpoints that spend Riot calls and GPU minutes.
- **Errors**: one global filter produces `{error: {code, message, fields?}}`. `ApiException` carries a stable `code`; framework exceptions map to generic per-status messages; unknown errors log the stack server-side and return `INTERNAL_ERROR`. No stack traces or internals reach clients.
- **Validation**: zod schemas + `ZodValidationPipe` are the single DTO convention (no class-validator) — consistent with `packages/analysis`.
- **Supply chain**: `minimumReleaseAge: 10080` in `pnpm-workspace.yaml` skips package releases younger than 7 days; asserted in `.devin/tests/config.test.mjs`.
- **Compose exposure**: services publish on `127.0.0.1` only; the committed `rifter-dev-token` fallback is a local dev default, not a secret — set `API_AUTH_TOKEN` in `.env` to override.

## Layout

Vertical slices under `src/`: a slice owns its controller, service, DTOs, table-defs, and specs; cross-slice use goes through exported providers, never deep imports. `shared/` is reserved for true cross-cutting machinery (error contract, validation pipe) — no domain logic.

- `auth/` — token guard, `IdentityResolver` seam, `@Public()`, `@Identity()`, dev resolver.
- `shared/` — `ApiException`, `ApiExceptionFilter`, `ZodValidationPipe`.
- `health/` — public liveness probe (also reports `db` status).
- `config/` — env validation (`src/config/env.validation.ts`).
- `db/` — global Drizzle/postgres.js pool + manual drizzle-kit migrations (`docs/api-database.md`).
- `riot/` — Riot Games API client: sliding-window rate limits, `429`+`Retry-After`, regional/platform routing (`docs/matches.md`).
- `matches/` — immutable Match-V5 cache (raw match + timeline JSONB), sync endpoints, normalize-on-read (`docs/matches.md`).
- `analysis/` — `analysis_jobs` queue + worker + endpoints: `POST /analysis/jobs`, `GET /analysis/jobs[/:id]` (`docs/analysis-jobs.md`, `docs/analysis-worker.md`).
- `ollama/` — local Ollama lifecycle: detect/attach, VRAM-tier model selection, manifest-only pull, digest verify (`docs/analysis-worker.md`).
- `reports/` — player-facing coaching reports: `GET /reports`, `GET /reports/:matchId`, written by the analysis worker (`docs/reports.md`).
- `observability/` — pino request logging, prom-client `/metrics`, Sentry wiring (`docs/observability.md`).

## Configuration

All config is env-driven and zod-validated at boot (`apps/api/.env.example` is the reference). Notables: `API_AUTH_TOKEN` (required), `DEV_PUUID`, `DATABASE_URL`, `RIOT_API_KEY`, `RIOT_REGIONAL_ROUTE`/`RIOT_PLATFORM_ROUTE`, `CORS_ORIGINS`, `OLLAMA_BASE_URL` (loopback-only enforced), `OLLAMA_MODEL`, `OLLAMA_FREE_VRAM_MB`, `OLLAMA_THINK`, `ANALYSIS_LOCALE`, `ANALYSIS_WORKER_ENABLED`, `ANALYSIS_WORKER_POLL_MS`, `JOB_RETENTION_DAYS`, `SENTRY_DSN` (optional).

## Edge cases

- Guard order is throttle-then-authenticate: floods die before auth work.
- Tokens are compared as SHA-256 digests so the timing-safe compare does not leak token length.
- `DEV_PUUID` unset is not an auth failure — the token still gates access — but the resolver runs eagerly per authenticated request, so every protected route 500s until it is set.
- Compose publishes every service on loopback only (`127.0.0.1:port`) — the container itself listens on `0.0.0.0` so the published port works.
- `pnpm clean --lockfile` + `pnpm install` re-resolves the lockfile when the release-age policy flags fresh entries (see #76).

## Related issues

Epic #68 (this security foundation): #69–76. M2 epic #17 covers the domain slices.
