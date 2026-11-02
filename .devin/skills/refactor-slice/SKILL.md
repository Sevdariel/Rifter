---
name: refactor-slice
description: Refactor an explicitly requested app feature, backend module, Rust module, or shared package to the target architecture
triggers:
  - user
  - model
---

# Refactor Slice / Module

Read repository-root `AGENTS.md` and the applicable domain rules. Ask for the target if unclear. Do not turn an unrelated bugfix into a module-wide refactor.

Root agent: apply `.devin/skills/orchestrate/SKILL.md` once, or reuse the active context. Obtain architecture analysis when dependencies or contracts are uncertain.

Delegated: restructure only the assigned files and preserve the agreed contracts. Do not delegate or approve final gates; return evidence to the root.

1. Identify the requested unit (an Angular feature, a NestJS module, a Rust module, or a shared package). Map consumers and public contracts before dividing work — `packages/analysis` and `packages/ui` are consumed by several apps. Serialize shared-file changes and dependent refactors.
2. Establish existing behavior and add characterization tests before restructuring. Preserve public contracts, stored report shapes, Tauri command signatures, and behavior unless a change is requested.
3. Moving logic from an app into a shared package (or back) is a contract change: update every consumer in the same change set and keep the package free of platform-specific imports.
4. For Angular work, use the `angular-developer` skill and apply the facade shape contract: facades orchestrate data only, view-local UI state lives in the component, derived values are `computed()` signals, subscriptions are never nested.
5. After template migrations, run the affected views and compare screenshots against the pre-change baseline for every rendered state.
6. Workers run assigned focused checks from `run-tests`. The root integrates the change, obtains independent contract/regression review and any applicable security, Rust, AI analysis, or compliance gate, and arranges final verification through `run-tests`.
7. Summarize the changes, preserved contracts, review decisions, and verification results, then commit locally per the commit policy (push the branch once at task completion per `.devin/rules/core.md`). Pure moves/renames go in a separate commit.
