---
name: add-desktop-feature
description: Add or extend Tauri desktop functionality (Rust commands, live capture, LCU, replays, upload queue) with cargo and Vitest tests
triggers:
  - user
  - model
---

# Add a Desktop Feature

Read repository-root `AGENTS.md`, `.devin/rules/desktop.md`, `.devin/rules/rust.md`, and `.devin/rules/riot-compliance.md`. For the Angular side also follow `add-frontend-feature`.

Standalone: the root applies `.devin/skills/orchestrate/SKILL.md` and owns final review/testing. Within an existing feature workflow, reuse its orchestration context.

Delegated: follow the assigned Tauri command/event contract and file ownership. Do not delegate or close final gates; return changes, focused test evidence, and integration needs to the root.

1. Identify the Rust module in `apps/desktop/src-tauri/src/` and the UI bridge service. Define the Tauri command signatures and event payloads first; they are a contract with the UI.
2. Classify the feature against the game lifecycle (pre-game, in game, post-game). Anything running in game is capture only. Tell the root to schedule the Riot compliance gate for live, LCU, or replay features.
3. Add `cargo test` tests first, using recorded fixtures (Live Client Data captures, LCU payloads, replay folder layouts) for both Windows and macOS branches. Never require a running game for tests.
4. Implement with typed errors, validated command arguments, no blocking in async code, bounded polling, and secrets only in memory or the OS keychain.
5. If the feature needs a new Tauri capability, permission, plugin, or filesystem scope, keep it minimal and tell the root — it is security-sensitive.
6. Implement the UI side through the bridge service and Vitest tests per `add-frontend-feature`.
7. Use `run-tests` for focused Rust and UI checks (`cargo fmt`, `cargo clippy`, `cargo test`, Vitest). The root arranges code review, the Rust gate, and other applicable gates, plus final verification.
8. Summarize the changes, platform coverage, and verification results, then commit locally per the commit policy (never push).
