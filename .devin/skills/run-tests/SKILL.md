---
name: run-tests
description: Run Rifter builds, Vitest, cargo, and agent configuration tests without watch mode
triggers:
  - user
  - model
---

# Run Tests

Run commands from the repository root. Use the installed toolchains and project-local CLIs; do not fetch different CLI versions or migrate tooling to make verification pass.

## Verification scope

- During implementation, run assigned focused tests for the affected app or package. Record their scope; they do not substitute for final integrated verification.
- For final application verification, run the full builds and suites below for the affected units and integration boundaries. A change in `packages/analysis` or `packages/ui` affects every consuming app. For configuration-only agent changes, run the agent configuration suite and the orchestration protocol's independent reviews/runtime exercises; application builds are unnecessary unless application/build behavior also changed.
- For read-only reviews, still run the builds and tests able to confirm or refute candidate findings. Report skipped checks under Limitations. Do not install missing tooling; report absent capabilities and request approval separately.
- Use one runner per suite and shared resource set. Run independent units concurrently only when their outputs, ports, databases, and inputs cannot interfere. Use approved local/test resources, never production data, the live Riot API, or live LLM providers.
- The root assigns a change-set ID and final verification owner under `.devin/skills/orchestrate/SKILL.md`. Run final checks on stable integrated inputs with no concurrent writers. After fixes, rerun affected checks and refresh evidence.
- A delegated test runner reports results; it does not fix implementation, weaken tests, or approve the overall task. Missing approvals or prerequisites mean blocked verification, not a pass.

## Application suites

Run from the repository root. All TypeScript units use Vitest and exit after one run. Workspace-wide: `pnpm -r test` and `pnpm -r build` (five projects).

- `apps/api` (`@rifter/api`): `pnpm -C apps/api test` (`vitest run`), `pnpm -C apps/api build` (`nest build`). Dev server: `pnpm -C apps/api start:dev` on :3000.
- `apps/web` (`@rifter/web`): `pnpm -C apps/web test` (`ng test` via `@angular/build:unit-test`, Vitest), `pnpm -C apps/web build` (`ng build` → `dist/web`). Dev server: `pnpm -C apps/web start` on :4200.
- `packages/analysis` (`@rifter/analysis`): `pnpm -C packages/analysis test` (`vitest run`), `pnpm -C packages/analysis build` (tsc → `dist/`).
- `packages/design-tokens` (`@rifter/design-tokens`): `pnpm -C packages/design-tokens test` (`vitest run`), `pnpm -C packages/design-tokens build` (tsc → `dist/`).
- `packages/ui` (`@rifter/ui`): `pnpm -C packages/ui test` (`ng test` via `@angular/build:unit-test`, Vitest), `pnpm -C packages/ui build` (`ng build` → ng-packagr `dist/`).
- Rust units (not scaffolded yet — `services/rofl-parser`, `apps/desktop/src-tauri`): `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --manifest-path <crate>/Cargo.toml` when the crates exist.
- Desktop bundle (only when packaging is in scope and `apps/desktop` exists): `pnpm -C apps/desktop run tauri build`.

Lint and format (root, whole repo): `pnpm lint` (ESLint, `eslint.config.mjs`) and `pnpm format:check` (Prettier); fix with `pnpm format`. CI enforces both on task branches and PRs.

Compose checks: `docker compose config --quiet` and `docker compose -f docker-compose.backend.yml config --quiet` for static validation; `docker compose up -d` then curl `http://localhost:3000/health` and `http://localhost:4200/` then `docker compose down` for the live check. Do not run compose alongside the local dev servers — ports 3000, 4200, and 5432 overlap.

On Windows PowerShell, use `npm.cmd`/`pnpm.cmd` if execution policy blocks the `.ps1` shims; do not change execution policy. Environment quirks and output discipline: `.devin/references/env-windows.md`.

## Agent Configuration

When changing agent rules, skills, workflows, or MCP configuration, also run:

```text
node --test .devin/tests/config.test.mjs
```

## Results

Report the change-set ID, each command, working directory, exit status, test counts, expected-versus-actual test discovery, and any skipped checks. An exit-zero run with missing expected tests is not sufficient verification. Distinguish failures from blocked checks and pre-existing issues. Implementation owners fix task-caused regressions, then the verification owner reruns affected checks. Ask before unrelated dependency upgrades, tooling migrations, or environment changes. Never weaken tests, security controls, or build budgets to obtain a passing result.
