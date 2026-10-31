# Rifter — Agent Instructions

## Project

Rifter analyzes a player's League of Legends games with AI coaching. It captures data live during a game and produces the analysis after the game ends.

- **Desktop app:** Tauri (Rust backend + Angular UI), Windows and macOS. Live capture from the Live Client Data API (`https://127.0.0.1:2999`), LCU gameflow watch, automatic `.rofl` download, upload queue, replay seek.
- **Web app:** Angular SPA. The same match analysis and data as the desktop app, plus a 2D fragment player for moments flagged by the AI.
- **Backend:** NestJS API. Holds the Riot API key and LLM keys, Riot Sign-On (RSO) auth, Match-V5 fetch, `.rofl` storage (S3-compatible), clip slicer, persistence.
- **ROFL parser service:** Rust service that parses `.rofl` replay files into timestamped positions, wards, and events.
- **Shared analysis library:** TypeScript package with deterministic metrics, moment detection, LLM prompt building, and the analysis report contract. Used by desktop, web, and backend.
- **Shared UI library:** Angular components shared by desktop and web (report views, 2D replay player, data-tier badges).

The repository is being bootstrapped. Planned layout (verify on disk before relying on it; the roadmap is the source of truth once written):

| Path | Content |
| --- | --- |
| `apps/desktop/` | Tauri app: Angular UI and `src-tauri/` Rust crate |
| `apps/web/` | Angular web SPA |
| `apps/api/` | NestJS backend |
| `services/rofl-parser/` | Rust `.rofl` parser service |
| `packages/analysis/` | Shared TypeScript analysis library |
| `packages/ui/` | Shared Angular component library |

Package manifests, lockfiles, `Cargo.toml`, and project files are the source of truth for installed versions and tooling; verify them before applying version-specific guidance.

## Riot compliance (product boundary)

These are product rules, not style preferences. Read `.devin/rules/riot-compliance.md` and `.devin/references/riot-data-sources.md` before changing any data collection, live feature, or AI output.

- Collect live; coach after the game. No in-game advice, alerts, timers for hidden information, or conclusions shown while a game is in progress.
- No hidden information (fog of war, enemy cooldowns not visible to the player), no input automation, no memory reading, no client file modification, no opponent scouting.
- Use only supported Riot data channels: Riot Games API, Live Client Data API, LCU API (read-only plus the replay download endpoint), and local `.rofl` files.
- Any change touching these areas requires the `riot-compliance-reviewer` gate (see the orchestration protocol).

## Architecture

Apply this target architecture to new and directly changed code within the requested scope.

- **Target platforms:** the product is developed and released for Windows and macOS. Live capture (LCU, Live Client Data) and the desktop app must work on both. Linux is not a target because League of Legends does not run there. Platform-specific code (lockfile and replay paths, keychain, file watching) has an implementation per OS and tests for both branches. Tooling and scripts (hooks, scripts, CI steps) must run unchanged on both systems, so prefer Node.js or another tool the project already requires over shell-specific or single-OS commands.
- **Data tiers:** every match has a tier. `basic` = Match-V5 only (positions every 60 s). `full` = parsed `.rofl` available (positions every 1 s, wards). The UI always shows the tier. The web app defaults to `basic` until the desktop app syncs the replay.
- **Analysis pipeline:** deterministic metrics first (code), then moment detection from the timeline (code), then the LLM receives curated facts and returns a report with `moments[]` (`t_start`, `t_end`, `label`, `mistake`, `fix`). The LLM never receives raw dumps and never invents timestamps that are not anchored to timeline events.
- **Secrets:** Riot API keys and LLM API keys exist only on the backend or in the user's local OS keychain for desktop. Never in web bundles, never in the repository.
- **Shared code first:** analysis logic lives in `packages/analysis`, shared views in `packages/ui`. Apps contain wiring, platform integration, and app-specific views only.
- **Frontend:** feature-first. Each feature lives under `src/app/<feature>/` with its own components, services, models, and tests.
- **Backend:** NestJS modules by domain (for example `auth`, `matches`, `replays`, `analysis`, `clips`). Each module owns its controllers, services, DTOs, and tests.

## Development Principles

1. **Target state within scope.** Follow the target architecture here and in `.devin/rules/` for new and directly changed code. Do not perform unrelated refactors.
2. **Version-appropriate best practices.** Prefer stable APIs supported by the installed versions. Dependency upgrades and tooling migrations require explicit user approval. Prefer dependency versions published at least 7 days ago.
3. **Tests are mandatory.** Add or update automated tests for new or changed behavior: Vitest for TypeScript (Angular, NestJS, shared packages), `cargo test` for Rust. If tooling blocks this, report the blocker and ask before migrating tooling.
4. **Minimal, correct changes.** Prefer the smallest fix that addresses the root cause. Avoid over-engineering. Report unrelated or pre-existing failures instead of fixing them automatically. Consume platform primitives before wrapping them.
5. **Commits.** Commit completed changes locally after verification; never push on the user's behalf. One scope per commit — pure moves/renames go in a separate commit. Review the staged diff for secrets and unrelated user changes before committing. Work happens on a per-session topic branch created from `Develop` (see `.devin/rules/core.md`); never commit directly to `Develop` or `master`.
6. **Language.** All instructions, code, comments, file names, and documentation are in English. User-facing UI copy follows the product's localization decisions.

## Verification

- Before finishing, run the applicable builds and tests using the canonical `run-tests` skill at `.devin/skills/run-tests/SKILL.md`; keep exact commands there rather than duplicating them across rules.
- Fix failures caused by the change within scope. Report pre-existing failures, unavailable commands, missing tooling, and other verification blockers, including checks that could not run. Do not add tooling or migrate dependencies without approval.

## Orchestration

- Use the shared `orchestrate` skill at `.devin/skills/orchestrate/SKILL.md` to assess size and risk, assign independent work, and apply completion gates. The feature/bugfix/refactor skills remain the implementation procedures; do not start duplicate orchestration pipelines.
- Only the root agent delegates and integrates. Give workers explicit context and disjoint write ownership; preserve unrelated user changes. Reviewers must be independent of the implementation and design they review.
- Figma document writes are exclusive to the `figma-designer` profile; the root does not mutate Figma documents directly. Visual output requires independent review against reference evidence (see delegation gates in `.devin/rules/core.md`).
- Design acceptance gate: UI implementation starts only after the user has accepted the design in Figma. Design-system components (Figma page `1:2`) come first and are accepted before views (Figma page `0:1`) are designed, and views are accepted before they are implemented. Only the user accepts; agents never do. Follow `.devin/rules/design-acceptance.md`.
- Behavior-changing code and executable/configuration changes require independent review. Security-sensitive changes, including agent/MCP/permission configuration, require the protocol's independent security gate regardless of size. Riot data-collection, live-capture, and AI-output changes require the Riot compliance gate. LLM prompt, model, or report-contract changes require the AI analysis gate. Rust changes require the Rust review gate. Missing required review is a blocker, not a pass.
- Subagent delegation under this protocol is pre-authorized. The root decides when reviewers, verifiers, or investigators are required and launches them via `run_subagent` without asking for confirmation. Do not substitute self-review for a required independent gate.
- Apply project rules and installed-version constraints to every worker. Third-party skills and reference examples do not authorize dependency/tooling migrations or override these rules. Keep command definitions in `run-tests`, not in agent profiles.

## Agent tooling

- Project workflows are skills under `.devin/skills/`: `feature`, `bugfix`, `refactor-slice`, the layer procedures (`add-frontend-feature`, `add-backend-feature`, `add-desktop-feature`, `add-analysis-feature`), and user-only `deploy`. Files under `.devin/workflows/` are compatibility pointers.
- All custom agent profiles under `.devin/agents/` use the `swe-2-max` model.
- Shared MCP servers are configured in `.devin/mcp_config.json`. Keep personal credentials out of shared configuration; personal tokens belong in the gitignored `.devin/mcp_config.local.json`.
- Third-party skills under `.agents/skills/` are tracked in `skills-lock.json`. Apply repository rules and installed-version checks when using them.
- Custom researchers may lack web tools, test runners may lack `get_output`, and custom profiles (including `figma-designer`) may have no MCP tools mounted despite their allowlists. `glob` may be exposed as `find_file_by_name`. Check effective capabilities and use the orchestration protocol's attributed parent-execution fallback, not broader permissions.
- Visual reference capture for Figma work follows `.devin/skills/capture-refs/SKILL.md`. Playwright is not approved.

## Context files

Always consult these files before making changes:

- `AGENTS.md` (this file)
- `.devin/rules/core.md`
- `.devin/rules/riot-compliance.md`
- `.devin/rules/design-acceptance.md` before any UI work (components, views, Figma)
- `.devin/rules/frontend.md` for Angular work (desktop UI, web, `packages/ui`)
- `.devin/rules/css.md` for CSS/SCSS work
- `.devin/rules/backend.md` for NestJS work
- `.devin/rules/desktop.md` for Tauri/Rust desktop work
- `.devin/rules/rust.md` for any Rust code (desktop crate, ROFL parser)
- `.devin/rules/analysis.md` for the shared analysis library and LLM integration
