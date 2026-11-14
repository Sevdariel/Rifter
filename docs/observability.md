# Observability

Logs, error reports, and metrics for the API — the debugging backbone for
"why did this match/report/job break". Local-first: everything runs on the
player's machine, nothing ships to a hosted service unless `SENTRY_DSN` is
set.

## Stack

- **pino** (`nestjs-pino`) — one JSON line per request plus app logs, each
  stamped with `reqId`. An inbound `x-request-id` header is honored (≤64
  chars) so desktop/web calls correlate with API logs; otherwise a uuid is
  generated. `/health` and `/metrics` are excluded from access logs.
- **Sentry** (`@sentry/nestjs`) — initialized in `src/instrument.ts` before
  Nest exists; without `SENTRY_DSN` it is a no-op. `ApiExceptionFilter`
  reports errors ≥500 (client 4xx and `ApiException`s <500 are expected, not
  reported). `beforeSend` scrubs `authorization`, `cookie`, `x-rifter-token`,
  and `x-riot-token` headers + cookies; puuid/matchId stay — they are the
  debugging identifiers.
- **prom-client** — `GET /metrics` (public, loopback + compose-internal by
  design) in Prometheus exposition format. Labels are closed vocabularies
  only (route templates, endpoint names, statuses) — never puuid/matchId.
  If the API ever binds beyond loopback, `/metrics` must move behind the
  token guard.
- **Loki + Alloy + Prometheus + Grafana** — optional compose profile
  `observability` collects container logs and scrapes metrics. Alloy only
  tails containers from the `rifter*` compose projects — other projects'
  logs may contain secrets we have no business collecting.

## Metrics

| Metric                                  | Labels                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| `rifter_http_request_duration_seconds`  | `method`, `route` (template, e.g. `/reports/:matchId`), `status_code` |
| `rifter_riot_api_requests_total`        | `endpoint` (`account-v1`, `match-v5.*`, `platform`), `status`         |
| `rifter_riot_api_rate_limited_total`    | `endpoint`                                                            |
| `rifter_analysis_jobs_total`            | `status` (`succeeded`/`failed`)                                       |
| `rifter_analysis_job_duration_seconds`  | —                                                                     |
| `rifter_process_*` (default collectors) | —                                                                     |

## Running the local stack

```bash
docker compose --profile observability up          # full profile
docker compose -f docker-compose.backend.yml --profile observability up
```

Then:

- Grafana → http://127.0.0.1:3001 (`admin` / `GRAFANA_ADMIN_PASSWORD`, default `admin`), Loki and Prometheus datasources are provisioned.
- Prometheus → http://127.0.0.1:9090.
- Loki → http://127.0.0.1:3100.
- Alloy UI → http://127.0.0.1:12345.

Alloy tails the Docker engine's containers, relabels them to
`container`/`service`, and pushes to Loki — no app-side log shipping config
needed; pino writes JSON to stdout and Alloy picks it up. The socket source
defaults to `/var/run/docker.sock` (Docker Desktop maps the Windows named
pipe onto that path automatically); override with `DOCKER_SOCK` if a host
needs a different path. Note the boundary: the docker socket grants the
Alloy container engine-level control — the profile is a dev-only,
loopback-published convenience.

Config lives in `deploy/observability/` (`loki-config.yaml`,
`prometheus.yml`, `config.alloy`, `grafana-datasources.yaml`).

## Env

- `LOG_LEVEL` — pino level (default `info`; `debug` for development).
- `SENTRY_DSN` — optional; unset disables error reporting entirely.

## Design notes

- **No `SentryGlobalFilter`.** It renders the default Nest error body and
  would bypass the `{error:{code}}` contract — reporting lives inside
  `ApiExceptionFilter` instead, on exactly the branches that produce 5xx
  (unknown errors, `HttpException ≥500`, and `ApiException`s with a 5xx
  status such as a Riot outage).
- **Middleware, not interceptor.** The duration histogram is recorded in an
  Express middleware registered by `configureApp` and observed on the
  `finish` event — exception filters write the real status before `finish`,
  and guard rejections/unmatched routes are covered too. An interceptor
  would read `statusCode` before the filter sets it (always "200" on error
  paths) and never see guard rejections.
- **Route templates as labels** — the middleware reads `req.route.path`
  (`/reports/:matchId`), so label cardinality stays closed and no player
  identifiers enter the metric set.
- **`x-request-id` is honored but length-capped** — the header is
  caller-controlled, so overlong values are ignored in favor of a uuid.
- **Grafana credentials** — `admin`/`GRAFANA_ADMIN_PASSWORD` (default
  `admin`) is a loopback dev instance; do not expose or reuse the password.
