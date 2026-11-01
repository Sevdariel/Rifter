---
description: Rust rules for the desktop crate and the ROFL parser service
trigger: glob
globs:
  - '**/*.rs'
  - '**/Cargo.toml'
---

# Rust Rules

Follow repository-root `AGENTS.md` for scope, tests, and verification.

- Use the toolchain and edition pinned by the repository (`rust-toolchain.toml` / `Cargo.toml`). Do not change them without approval.
- Code must pass `cargo fmt --check` and `cargo clippy` with warnings denied in CI-equivalent runs (exact commands in `run-tests`).
- No `unsafe` without a written justification comment and an independent `rust-reviewer` sign-off. Prefer safe crates.
- No `unwrap()`/`expect()` on fallible input or I/O in production paths; propagate errors with typed errors (`thiserror`-style) at library boundaries and contextual errors in application code. Panics are bugs.
- Parsing untrusted input (`.rofl`, HTTP responses, lockfile) is bounds-checked: validate lengths before allocation, cap decompressed sizes, and reject malformed data with an error instead of panicking. Add regression fixtures for every malformed-input bug.
- Async code uses one runtime; never block inside async tasks (use `spawn_blocking` for CPU-heavy parsing). Propagate cancellation; avoid detached tasks without an owner.
- Do not hold locks across `.await`. Prefer message passing for capture/upload pipelines.
- Logging through `tracing`; never log secrets, tokens, or the LCU password.
- New dependencies require justification (maintenance, license, audit status). Prefer crates already in `Cargo.lock`.
- Tests: unit tests next to the code, integration tests in `tests/`, recorded fixtures for Riot API payloads and `.rofl` samples. The ROFL format changes per patch; fixtures carry the patch version in their name.
