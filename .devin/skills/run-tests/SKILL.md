---
name: run-tests
description: Run LolGameReviewer builds, Vitest, cargo, and agent configuration tests without watch mode
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

The application is not scaffolded yet. When the workspace tooling is created, replace this section with the exact build, lint, and test commands for each unit (`apps/desktop`, `apps/web`, `apps/api`, `packages/analysis`, `packages/ui`, `services/rofl-parser`) and update `.devin/tests/config.test.mjs` to assert them. Until then, report application verification as `BLOCKED: not scaffolded`.

Planned command shapes (confirm against the real manifests before use):

- TypeScript units: `npm --prefix <unit> run build` and `npm --prefix <unit> test -- --watch=false` (Vitest).
- Rust units: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` with `--manifest-path <crate>/Cargo.toml`.
- Desktop bundle (only when packaging is in scope): `npm --prefix apps/desktop run tauri build`.

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`; do not change execution policy.

## Agent Configuration

When changing agent rules, skills, workflows, or MCP configuration, also run:

```text
node --test .devin/tests/config.test.mjs
```

## Results

Report the change-set ID, each command, working directory, exit status, test counts, expected-versus-actual test discovery, and any skipped checks. An exit-zero run with missing expected tests is not sufficient verification. Distinguish failures from blocked checks and pre-existing issues. Implementation owners fix task-caused regressions, then the verification owner reruns affected checks. Ask before unrelated dependency upgrades, tooling migrations, or environment changes. Never weaken tests, security controls, or build budgets to obtain a passing result.
