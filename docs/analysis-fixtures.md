# Analysis fixtures (Match-V5)

## Purpose

The analysis pipeline is developed and verified against recorded, sanitized Match-V5 responses instead of live API calls. Fixtures give metrics, moment detection, and golden tests deterministic, reviewable inputs — and keep other players' identities out of the repository.

## Components

- `packages/analysis/scripts/fetch-fixtures.mjs` — dev tool that downloads the N most recent matches for a Riot account from allowed queues (solo/duo, flex, normal; ARAM excluded) via Account-V1 + Match-V5, sanitizes identity, and writes `fixtures/matches/<matchId>.json`. Key from `RIOT_API_KEY` env or `apps/api/.env`; honors `429`/`Retry-After`. Run via `pnpm -C packages/analysis fetch-fixtures`.
- `packages/analysis/fixtures/matches/*.json` — committed combined match+timeline payloads, pretty-printed JSON.
- `packages/analysis/src/fixtures.spec.ts` — asserts the sanitization invariant, queue allowlist, and target marker on every committed file, plus unit-tests the sanitizer.

## Invariants

- No real `puuid`, `accountId`, `summonerId`, `summonerName`, `riotIdGameName`, or `riotIdTagline` in committed files — deterministic placeholders only (`puuid-target`, `puuid-N`, `PlayerN`, `summoner-N`, `TAG`).
- The account holder is always marked `puuid-target`/`TargetPlayer` so the mapper can locate the analyzed player.
- Real `matchId`s are retained by design (see "Accepted exposure" in `fixtures/README.md`).

Details and regeneration steps: `packages/analysis/fixtures/README.md`.
