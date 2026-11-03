# Analysis (`packages/analysis`)

## Purpose

Rifter's shared, framework-free analysis library. It turns the player's own match data into an AI coaching report **after** the game ends — deterministic metrics first, then moment detection, then a local LLM (Ollama) that explains curated facts. Desktop, web, and the API all import it; platform adapters (Ollama host management, VRAM probes, file access) live in the apps.

## Pipeline

`Match-V5 (+ timeline) → NormalizedMatch → metrics → moment candidates → prompt → Ollama → validated report`

1. **NormalizedMatch** (`src/normalized-match.ts`) — the canonical input contract every source maps into before any metric runs. The target player is fully modeled (`isTarget`, `targetParticipantId`); the other nine participants carry role/team/champion/stats only — **no puuid, summonerId, names, or any identity field anywhere in the model**. Contents: participants (position, `win`, end-of-game stats subset), per-minute frames (gold/cs/xp/position per participant), normalized timeline events (`champion-kill`, `monster-kill`, `building-kill`, `ward-placed`) tagged `evt-N`, `dataTier`, `gameDurationMs`. Objective events carry `assistingIds` plus explicit team attribution (`killerTeam` on monster kills, `ownerTeam` = building's losing side on building kills); `monsterSubType` distinguishes dragon flavors.
2. **Match-V5 mapper** (`src/match-v5-mapper.ts`) — `matchV5ToNormalized(fixture, targetPuuid)`: consumes only the fields it needs (minimal `MatchV5*` interfaces, incl. `challenges.controlWardsPlaced` — the only place the count exists), marks the target by puuid, converts `gameDuration` s→ms, drops non-essential event types, normalizes non-champion killers (`killerId`/`creatorId` 0 → `undefined`), throws on unknown participant/building `teamId` while a non-100/200 `killerTeamId` (e.g. 300, no credited side) maps `killerTeam` to `undefined`, sorts events and tags stable ids (positional, per-normalization ephemeral). Output is `normalizedMatchSchema.parse`d — shape violations throw.

3. **Report contract** (`src/report-contract.ts`) — Zod v4 schemas are the single source of truth: `z.infer` gives the TS types, `z.toJSONSchema` gives the schema sent to Ollama's `format` parameter.
   - LLM-facing output: `moments[] {t_start, t_end, label, mistake, fix}` (ms from game start, max 10) + `summary` + optional `topPriority` (index into `moments`). Provenance `metadata {matchId, patch, contractVersion, promptVersion, modelDigest, locale, dataTier}` is **pipeline-owned** — excluded from the LLM schema and attached in code after validation, because the model cannot know its own digest or prompt version.
   - `locale: 'pl' | 'en'` — the LLM writes report prose in the player's UI language; `dataTier` lets the UI always show the tier.
   - `REPORT_CONTRACT_VERSION` is bumped on breaking shape changes; stored reports carry their version (a per-version schema map will be needed when v2 lands).
4. **Validation** (`src/report-validation.ts`) — `validateAnalysisReport(raw, {candidates, gameDurationMs, metadata})` parses the LLM output schema and enforces anchoring with **snap semantics**: a moment is valid only when its `[t_start, t_end]` equals a provided candidate window exactly — the LLM selects candidates and never invents timestamps (interior sub-windows would fabricate precision `basic` data does not have). `t_end` must lie inside the game duration; `topPriority` must index an existing moment. Errors carry a `stage` discriminator: `output` errors are strings suitable for LLM retry feedback; `context` errors are pipeline faults and must never be fed back to the model.
5. Moment candidates have shape `{t_start, t_end, kind, anchorEventId}` with `kind: 'death' | 'teamfight' | 'objective-lost'` — produced deterministically (see issue #12), consumed by the prompt builder (#13) and later the clip slicer.

## Invariants

- The LLM never receives raw dumps or other players' identities; it ranks and explains deterministic candidates.
- Analysis never runs on an in-progress game (Riot compliance).
- Tests are Vitest on recorded/sanitized fixtures — no live LLM, no live Riot API.

## Related issues

M1 epic #8: #9 contract, #10 fixtures, #56 normalized model, #11 metrics, #12 moments, #13 prompt, #14 Ollama client, #15 model tiers, #16 golden tests.
