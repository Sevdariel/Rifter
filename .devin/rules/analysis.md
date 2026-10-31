---
description: Shared analysis library and LLM integration rules
trigger: glob
globs:
  - "packages/analysis/**"
  - "apps/api/src/analysis/**"
---

# Analysis Rules

Follow repository-root `AGENTS.md` and `.devin/rules/riot-compliance.md`.

## Library shape

- `packages/analysis` is framework-free TypeScript: no Angular, NestJS, Tauri, or Node-only APIs in its core, so desktop, web, and backend all import it. Platform adapters live in the apps.
- It owns the canonical contracts: normalized match model, data tier (`basic` | `full`), metrics, detected moments, LLM request input, and the analysis report (including `moments[]` with `t_start`, `t_end`, `label`, `mistake`, `fix`). Version the report contract; stored reports carry their contract version.
- Inputs from Match-V5, Live Client Data captures, and parsed `.rofl` are normalized into one match model before any metric runs. Metrics never read raw source payloads.

## Deterministic first

- Metrics (CS/min, KP%, vision, damage share, gold diff at fixed minutes, death timings, objective participation) are pure functions with unit tests on recorded fixtures.
- Moment detection (deaths, fights, lost objectives, missed waves) is deterministic code that produces candidate windows anchored to timeline events. The LLM ranks, explains, and selects candidates; it does not invent windows.
- Every metric and moment declares the minimum data tier it needs. On `basic` data, tier-limited outputs are marked as low precision or omitted; never fabricate 1-second precision from 60-second frames.

## LLM integration

- One provider-agnostic interface; model name, temperature, token limits, and timeout come from configuration. Provider SDK specifics stay in adapters.
- Prompts are versioned files, not inline strings. A prompt change is a contract change and goes through the `ai-analysis-reviewer` gate.
- Send curated facts only (metrics, candidate moments, relevant events). Never send raw dumps, API keys, Riot IDs of other players, or other personal data beyond what the analysis needs.
- Require structured output validated against the report schema. Reject or repair invalid output; validate that every `moment` timestamp lies inside a provided candidate window and inside the game duration.
- Feedback must reference concrete evidence (timestamp, event, metric). No generic advice without evidence.
- Track token usage per analysis and enforce a per-analysis budget. Cache reports by match ID, contract version, and prompt version.
- Analysis never runs on an in-progress game (see Riot compliance rules).

## Tests

- Vitest. Metrics and moment detection have fixture-based tests. LLM adapters are tested with recorded responses; tests never call a live LLM or the live Riot API.
- Add golden tests for the prompt builder output so prompt changes are visible in review.
