# Rifter Roadmap

Last updated: 2026-11-01. Source of truth for scope and sequencing (see `AGENTS.md`). Task-level tracking lives in GitHub Issues + Projects, not here.

## Goal

Analyze a player's own League of Legends games and return an AI coaching report after the match. Collect live, coach after the game (Riot boundary).

## MVP: post-match analyzer

Pipeline: Match-V5 → deterministic metrics → moment detection → local LLM → validated report JSON → web.

- **M0 Repository scaffold** — pnpm workspaces (corepack, Node per `.nvmrc`), `apps/api`, `apps/web`, `packages/analysis`, `packages/ui`, `packages/design-tokens`, docker-compose (full: db + api + web; backend-only: db + api), Postgres + migrations, `run-tests` commands, GitHub Issues backlog seed.
- **M1 `packages/analysis`** — report contract + schema, deterministic metrics, moment detection, versioned prompt building, Ollama HTTP client (schema `format`, `keep_alive: 0`), free-VRAM detection + model tier map, golden tests on committed Match-V5 fixtures (queues: solo/duo, flex, normal — no ARAM).
- **M2 `apps/api`** — `matches` (fetch + cache), `analysis` (pipeline run + Ollama lifecycle: detect/attach over HTTP — spawn only when the api runs on host — lazy load post-game, unload), `reports`, `analysis_jobs` observability table, pino logging, `/health`, Sentry, Riot key via env (never committed).
- **M3 `apps/web` dev-harness** — dev-only report viewer and routing shell. Not product UI; exempt from the design gate.
- **M4 Design start** — Figma design system page (Variables for tokens, custom components), token sync pipeline (bridge → `packages/design-tokens` codegen), first view designs → user acceptance → UI implementation.

## Post-MVP backlog

- **Desktop** — Tauri scaffold (Angular UI + Rust crate), Live Client Data capture, LCU gameflow watch, auto `.rofl` download, offline-safe upload queue, replay seek, OS keychain.
- **Replays/data** — `.rofl` parser decision (`roflxd.cs` vs Rust ROFL-X; license check required), `services/rofl-parser`, `.rofl` retention policy, MinIO/S3 storage, clip slicer, `full`-tier 2D player.
- **AI** — model eval harness + final per-tier picks, prompt tuning, report cache keyed by matchId + contract version + prompt version.
- **Auth** — RSO + Riot product registration; required before external users and before any public deploy. Interim token acceptable for a solo deploy.
- **Deploy** — web on Vercel, api on a container host (Fly.io/Render/Railway/VPS), managed Postgres. API is written stateless from day one so deploy is lift-and-shift.
- **Observability** — Prometheus/Grafana self-hosted metrics when real load exists; uptime checks once deployed.
- **CI** — GitHub Actions for the test suite on push.
- **Process** — GitHub Issues + Projects board as the task tracker.

## Key decisions (grilling session 2026-11-01)

- **LLM is local**: Ollama on the host, managed by the API. Lazy load after game end, `keep_alive: 0` unload — zero VRAM cost during play (compliance already gates analysis to post-game).
- **Adaptive model tiers** by free VRAM at inference time: ≥14 GB → `gpt-oss-20b` (default on RTX 5080 16 GB), ~12 GB → Gemma 4 12B / Ministral-3-14B, ~8 GB → Qwen3.5-9B, below → degraded/CPU. Partial offload to RAM on overflow; override in config; model pinned by digest; final picks via golden eval.
- **Single-user first**: account from `Sev#1864`; dev Riot key in `apps/api/.env`; production key + RSO later.
- **UI**: custom components, no library; Figma Variables are the token source of truth → generated `tokens.css` + `tokens.ts`.
- **Observability**: pino + `/health` + Sentry SaaS + `analysis_jobs` (status, prompt version, model digest, timings, retries, raw response on failure) + Riot/429 counters.
- **Process**: README maintained per policy; `.devin/` security gate narrowed to execution-affecting changes; GitHub Issues for tasks.

## Deferred / out of scope

- `.rofl` parser choice and retention policy — decided before the `full` tier work starts.
- Linux — never a target (League does not run there).
- ARAM analysis — intentionally excluded.
- Public deployment — blocked on auth; design for it, don't build it yet.
