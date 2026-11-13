# API database

The API persists match caches, analysis jobs, and reports in Postgres. This
document covers the `db/` slice: how the database is wired, how schema changes
ship, and how to run the integration tests.

## Usage

- `DATABASE_URL` (zod-validated env) points at Postgres. Local dev uses the
  compose database: `postgres://rifter:rifter@localhost:5432/rifter`.
- When `DATABASE_URL` is unset the API still boots — the `DRIZZLE` provider
  resolves to `null` and `/health` reports `db: "disabled"`. Slices that
  require persistence are exercised with the URL configured.
- `/health` reports `db: "up" | "down" | "disabled"` alongside `status`; the
  process stays `ok` either way (liveness, not readiness).

## Layout

- `apps/api/src/db/` — the `db/` vertical slice. `DbModule` is global and
  exports `DRIZZLE` (a `{ db, client }` handle: Drizzle ORM over a
  postgres.js pool, max 10 connections, lazy connect).
- `apps/api/src/db/schema/index.ts` — schema aggregation barrel. Each domain
  slice owns its table files (e.g. `src/matches/schema.ts`) and this barrel
  re-exports them so drizzle-kit sees the whole schema.
- `apps/api/drizzle.config.ts` + `apps/api/drizzle/` — drizzle-kit config and
  generated SQL migrations (committed).

## Migrations

Migrations are a manual, explicit step — the API never migrates on boot:

```bash
pnpm --filter @rifter/api db:generate   # diff schema -> new SQL in drizzle/
pnpm --filter @rifter/api db:migrate    # apply pending migrations
```

`drizzle-kit` runs outside Nest and loads `apps/api/.env` via dotenv.
Automating later (compose init step or CI job) only adds a new caller for
`db:migrate`; the artifacts and code stay identical.

## Tests

- `pnpm --filter @rifter/api test` — unit + e2e, no Docker required.
- `pnpm --filter @rifter/api test:int` — integration specs (`*.int-spec.ts`)
  using testcontainers with `postgres:18-alpine`; requires a running Docker
  daemon.
