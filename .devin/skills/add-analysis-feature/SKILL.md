---
name: add-analysis-feature
description: Add or change a metric, moment detector, LLM prompt, or report contract in the shared analysis library with fixture and golden tests
triggers:
  - user
  - model
---

# Add an Analysis Feature

Read repository-root `AGENTS.md`, `.devin/rules/analysis.md`, and `.devin/rules/riot-compliance.md`.

Standalone: the root applies `.devin/skills/orchestrate/SKILL.md` and owns final review/testing. Within an existing feature workflow, reuse its orchestration context.

Delegated: follow the assigned contract and file ownership in `packages/analysis`. Do not delegate or close final gates; return changes, focused test evidence, and integration needs to the root.

1. Classify the change: deterministic metric, moment detector, prompt, model/provider configuration, or report contract. Anything except a pure metric needs the AI analysis gate; tell the root.
2. Declare the minimum data tier (`basic` or `full`) for each new metric or detector and its behavior on lower tiers.
3. Add Vitest tests first on recorded, anonymized fixtures (normalized match models built from Match-V5, Live Client Data captures, or parsed `.rofl`). Fixtures contain no real Riot IDs of other players.
4. Implement metrics and detectors as pure functions on the normalized match model. Detectors return candidate windows anchored to timeline events.
5. Prompt changes: edit the versioned prompt file, bump the prompt version, update the prompt-builder golden test, and keep curated-facts-only input.
6. Report contract changes: bump the contract version, update the schema validator and every consumer (desktop, web, API, stored-report migration or compatibility read). Tell the root which apps are affected.
7. Never call a live LLM or the live Riot API in tests; use recorded responses.
8. Use `run-tests` for focused package checks. The root arranges code review, the AI analysis gate, and final verification.
9. Summarize the changes, versions bumped, affected consumers, and verification results, then commit locally per the commit policy (never push).
