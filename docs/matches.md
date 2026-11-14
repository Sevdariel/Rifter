# Matches module

The `matches` slice keeps an immutable local cache of the authenticated
player's own games from Riot's Match-V5 API. Analysis, reports, and the web
dev-harness all read from this cache — Riot is only ever hit during a sync.

## Endpoints

All routes require the `X-Rifter-Token` header and resolve to `DEV_PUUID`.

| Route                                                | Behavior                                                                                                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /matches/sync/one` `{matchId}`                 | Fetches one match + timeline. Stores it only if the player participated and the queue is a Summoner's Rift queue.                                                                                                          |
| `POST /matches/sync/recent` `{count}`                | Syncs up to `count` (≤20) most recent games synchronously and returns per-outcome counters.                                                                                                                                |
| `POST /matches/sync/all` `{from?: {date \| season}}` | Returns `202` + the initial `SyncStatus` and pages the full match history in a background loop; resumable because cached rows are skipped. `from` accepts an ISO `date` or a `season` year key mapped via `SEASON_STARTS`. |
| `GET /matches/sync/status`                           | In-memory progress of the background sync (`running`, `listed`, `fetched`, `stored`, `skippedCached`, `skippedNonSr`, `failed`, `lastError`).                                                                              |
| `GET /matches`                                       | Cached match summaries for the player, newest first.                                                                                                                                                                       |
| `GET /matches/:matchId`                              | The cached game normalized on read via `packages/analysis` (`dataTier: basic`).                                                                                                                                            |

## Behavior notes

- **Queue filter**: only Summoner's Rift queues are stored (`400, 420, 430,
440, 490, 700` — draft, solo/duo, blind, flex, quickplay, clash). ARAM,
  Arena, co-op vs AI, and special modes are skipped; their timeline is never
  fetched. The match-ids list carries no queue info, so the filter applies
  after fetching the match JSON.
- **Ownership**: `sync/one` verifies the player's puuid is a participant —
  the cache only ever holds the player's own games.
- **Rate limiting**: every Riot call goes through a sliding-window limiter
  (20 req/1s, 100 req/2min dev limits) and honors `429` + `Retry-After` with
  bounded retries. A full sync of a large history runs at the sustained
  ~0.83 req/s ceiling — expect hours, not minutes.
- **Routing**: Match-V5 and account-v1 use the regional cluster
  (`RIOT_REGIONAL_ROUTE`, default `europe`); `RIOT_PLATFORM_ROUTE` (default
  `euw1`) is reserved for future platform-shard APIs.
- **Caching**: rows are `(puuid, match_id)` → raw `match` + `timeline` JSONB,
  written once, never updated (`onConflictDoNothing`). Normalization is
  recomputed on read so contract changes don't require re-syncing.
- Sync endpoints carry a stricter throttle (10/min) than the global floor.
- Per-match failures inside a full sync are counted in `failed` and skipped —
  one poison match never wedges the run; only a listing failure aborts it.

## Errors

`RIOT_NOT_CONFIGURED` (503), `RIOT_UNAUTHORIZED` (502 — dev key expired,
refresh `RIOT_API_KEY`), `RIOT_NOT_FOUND` (404), `RIOT_RATE_LIMITED` (502),
`SYNC_IN_PROGRESS` (409), `MATCH_NOT_CACHED` (404), `DB_NOT_CONFIGURED`
(503).

## Local setup

`RIOT_API_KEY` + `DEV_PUUID` + `DATABASE_URL` must be set in `apps/api/.env`.
`DEV_PUUID` is resolved once per account via account-v1
(`/riot/account/v1/accounts/by-riot-id/<gameName>/<tagLine>`). The dev key
expires every 24 h — `401` responses mean refresh it.

Under `docker compose`, env comes from the project-root `.env` (or the
shell), not `apps/api/.env` — set the same vars there when running the API
in a container.
