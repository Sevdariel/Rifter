---
name: add-frontend-feature
description: Add or extend an Angular feature in the desktop UI, the web app, or the shared UI package with Vitest tests
triggers:
  - user
  - model
---

# Add a Frontend Feature

Read repository-root `AGENTS.md`, `.devin/rules/frontend.md`, and `.devin/rules/css.md`. Use the `angular-developer` skill with the installed versions.

Standalone: the root applies `.devin/skills/orchestrate/SKILL.md` and owns final review/testing. Within an existing feature workflow, reuse its orchestration context.

Delegated: follow the assigned contract and file ownership. Do not delegate or close final gates; return changes, focused test evidence, and integration needs to the root.

1. Decide where the code belongs: `packages/ui` when both desktop and web render it (report views, 2D replay player, tier badges), otherwise `apps/web/src/app/<feature>/` or `apps/desktop/src/app/<feature>/`. Add only the components, services, models, and routes the request needs.
2. Add Vitest tests for the expected behavior, preferably failing before implementation.
3. Implement standalone components with signals, `input()`/`output()`, native control flow, and `inject()`. HTTP calls live in API services; Tauri calls live in the desktop bridge services; shared components take data through inputs only.
4. Import analysis and report types from `packages/analysis`; never redeclare them.
5. Show the data tier on every match view and disable `full`-only sections with an explanation on `basic` data.
6. A live-game view shows only the player's own visible stats and capture status — no advice. Flag any such view for the Riot compliance gate.
7. Add lazy routes only if the feature needs routes. Respect the single owner of shared routes, providers, and manifests.
8. After adding or migrating template markup, run the view and compare a screenshot against the baseline.
9. Use `run-tests` for assigned focused frontend checks. The root arranges independent code review, UX review where needed, applicable gates, and final verification.
10. Summarize the changes and verification results, then commit locally per the commit policy (never push).
