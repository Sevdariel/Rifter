# Rifter

AI coaching for League of Legends. Rifter analyzes your own games and produces a coaching report after each match — collect data live, coach after the game.

## Status

Bootstrapping. The repository scaffold is in progress; see `docs/roadmap.md` for the MVP plan and backlog.

## Architecture

```
apps/desktop/   Tauri app (Angular UI + Rust) — live capture, LCU, replays      [post-MVP]
apps/web/       Angular SPA — match history, reports, 2D fragment player
apps/api/       NestJS backend — Riot API key, Match-V5, analysis, persistence,
                manages the local Ollama LLM process on the host
packages/analysis/   Shared TS: metrics, moment detection, prompts, report contract
packages/ui/         Shared Angular components (custom, token-driven)
packages/design-tokens/  Design tokens generated from Figma Variables
services/rofl-parser/    Rust .rofl parser service                            [post-MVP]
```

The LLM runs locally via Ollama on the player's machine — loaded after the game ends, unloaded after the report. Model is chosen adaptively by free VRAM.

## Requirements

- Node.js (version pinned in `.nvmrc`), pnpm via `npm i -g pnpm@<pin>` (`packageManager` field carries the version; Node 26 has no corepack)
- Docker Desktop (compose: Postgres + api + web)
- Ollama installed on the host (managed automatically by the API)
- Windows or macOS

## Quickstart

```bash
pnpm install               # workspace install (Node per .nvmrc, pnpm via packageManager pin)
pnpm -C apps/api start:dev # API dev server on :3000 (/health)
pnpm -C apps/web start     # web dev server on :4200
docker compose up          # full stack: db + api + web
docker compose -f docker-compose.backend.yml up   # backend only, for frontend work
```

Valid once the scaffold lands (M0). A Riot development API key goes in `apps/api/.env` — never committed.

## Documentation

- `docs/<feature-or-area>.md` — living per-feature docs (business purpose, then technical notes), updated in the same change as the work (policy: `docs/agent-documentation.md`)
- `docs/roadmap.md` — MVP plan, backlog, decisions
- `AGENTS.md` — architecture, compliance boundary, agent rules
- `docs/design/acceptance.md` — Figma design acceptance log
- `.devin/rules/` — always-on and domain rules

## Legal

Rifter is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
