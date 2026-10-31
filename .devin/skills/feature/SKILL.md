---
name: feature
description: Plan and implement a LolGameReviewer feature across only the affected apps and packages
triggers:
  - user
  - model
---

# Feature Workflow

Root agent: apply `.devin/skills/orchestrate/SKILL.md` once, or reuse the active orchestration context. It owns triage, delegation, integration, and final gates.

Delegated: execute only the assigned feature work, respect file ownership, and return evidence to the root. Do not delegate or approve the overall feature.

1. Read repository-root `AGENTS.md`, `.devin/rules/riot-compliance.md`, and the relevant domain rules. Clarify ambiguous behavior and acceptance criteria before implementation; planning-only requests remain read-only.
2. Identify the affected units: `packages/analysis`, `packages/ui`, `apps/desktop`, `apps/web`, `apps/api`, `services/rofl-parser`. Do not add work to units the request does not need. For large or uncertain work, synthesize focused research, architecture, UX, compliance (`DESIGN_REVIEW`), and threat analysis as applicable before implementing.
3. Agree on contracts first when several units change: `packages/analysis` types, API endpoints, Tauri commands/events. Then invoke `add-analysis-feature`, `add-frontend-feature`, `add-backend-feature`, and/or `add-desktop-feature`, or assign those procedures to workers. Parallelize only independent assignments with disjoint writes; serialize dependencies and reserve shared integration files (workspace manifests, lockfiles, route files) for one owner.
4. Add automated tests for the acceptance criteria and verify integration boundaries. Workers run assigned focused checks; the root integrates their results and establishes a stable change-set ID.
5. The root arranges independent code review, the security gate, the Riot compliance gate, the AI analysis gate, and the Rust gate when they apply, and final integrated verification through `run-tests`. Reuse evidence only under the orchestration protocol's freshness rules. Recheck fixes before closing gates.
6. Summarize behavior, changed files, specialist results, gate decisions, tests, and remaining limitations, then commit locally per the commit policy (never push, never deploy).
