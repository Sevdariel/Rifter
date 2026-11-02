---
name: add-backend-feature
description: Add or extend a NestJS module in the Rifter API with Vitest tests
triggers:
  - user
  - model
---

# Add a Backend Feature

Read repository-root `AGENTS.md`, `.devin/rules/backend.md`, and `.devin/rules/riot-compliance.md`. Create a module in `apps/api/src/<module>/` or extend an existing one, limited to the requested behavior.

Standalone: the root applies `.devin/skills/orchestrate/SKILL.md` and owns final review/testing. Within an existing feature workflow, reuse its orchestration context.

Delegated: follow the assigned API contract and file ownership. Do not delegate or close final gates; return changes, focused test evidence, and integration needs to the root.

1. Identify the affected API contract and module. Add only the needed controllers, services, DTOs, and entities.
2. Add Vitest tests for the expected behavior, preferably failing before implementation, including the ownership check (requests for another player's resource fail).
3. Implement validated DTOs, thin controllers, services with per-PUUID ownership checks, and typed domain exceptions. Riot API calls go through the Riot client services with rate-limit handling; LLM calls go through the analysis provider service.
4. Background work (replay parsing, LLM analysis) runs as idempotent jobs; endpoints return a job status instead of blocking.
5. Register the module in the application root through its assigned owner. If a shared integration file belongs to another worker or the root, hand off the change instead of editing it concurrently.
6. Uploads, auth, secrets, and external integrations are security-sensitive: tell the root so it schedules the security gate.
7. Docker/compose authoring follows `.devin/references/env-windows.md` — `**/.env*` dockerignore patterns with decoy verification, `"files": ["dist"]` for `pnpm deploy`, `USER node`, no corepack in `node:26` images, postgres 18+ volume at `/var/lib/postgresql`, zod-validated env keys omitted rather than empty.
8. Use `run-tests` for assigned focused backend checks. The root arranges independent code review, applicable gates, and final verification.
9. Summarize the changes and verification results, then commit locally per the commit policy (never deploy; the branch is pushed once at task completion — see `.devin/rules/core.md`).
