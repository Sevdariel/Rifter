---
description: Desktop Tauri rules
trigger: glob
globs:
  - "apps/desktop/**"
---

# Desktop Rules

Follow repository-root `AGENTS.md`, `.devin/rules/rust.md` for Rust code, `.devin/rules/frontend.md` for the Angular UI, and `.devin/rules/riot-compliance.md` for every game-facing feature.

- Verify installed Tauri, plugin, and Rust toolchain versions in `Cargo.toml`, `Cargo.lock`, and the JS manifests before applying version-specific guidance.
- Supported targets: Windows and macOS. Every platform-specific path (LCU lockfile location, replay folder, keychain) is resolved through one platform module with an implementation per OS and tests for both branches.
- Tauri capabilities and permissions follow least privilege: expose only the commands, plugins, and filesystem scopes a window needs. Do not enable broad filesystem or shell scopes. Capability changes are security-sensitive.
- Keep a strict Content Security Policy. Do not load remote scripts into the webview. Remote calls go to the project backend and Riot endpoints only.
- Tauri commands validate all arguments, return typed errors, and never accept arbitrary paths, URLs, or shell arguments from the UI.
- Live Client Data API: poll `https://127.0.0.1:2999` only. It uses a self-signed certificate; accept it only for `127.0.0.1:2999` (pinned to the Riot root certificate when available), never globally disable TLS verification.
- LCU: read the lockfile for port and password at runtime, keep the password in memory only, connect only to `127.0.0.1`, and never log or persist it.
- Capture state machine is driven by LCU gameflow phases. Capture runs while in game; analysis and any coaching output start only after the game ends.
- Replay download: after the post-game phase, request the player's own replay via the LCU replay endpoint, then watch the replay folder for the `.rofl` file. Handle missing, delayed, and failed downloads explicitly.
- Upload queue is persistent and offline-safe: survives restarts, retries with backoff, idempotent by game ID, resumable. The user can disable automatic recording and automatic sync in settings; both settings are visible and respected immediately.
- Store API tokens in the OS keychain (Windows Credential Manager / macOS Keychain), never in plain config files.
- Background polling must stay lightweight: bounded intervals, no busy loops, stop when no game is running. The app must not degrade game performance.
- Use `cargo test` for Rust logic and Vitest for the Angular UI. Test platform-independent logic (state machine, queue, parsers) without a running game by using recorded fixtures.
