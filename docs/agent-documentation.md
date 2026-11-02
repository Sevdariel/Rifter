# Agent documentation policy

Every feature or behavior change — product code or agent-facing process — keeps a living document under `docs/` so the repository carries both the business "what and why" and the technical "how", not just code.

## Usage

- One document per feature or area: `docs/<feature-or-area>.md` (kebab-case).
- Content order: business purpose and usage first, technical notes (components, data flow, commands, edge cases) second.
- The doc update lands in the same change as the work it describes — a feature is not done without its doc, and missing or stale docs are a review finding.
- `docs/roadmap.md` (plan/decisions) and `docs/design/` (Figma acceptance) keep their dedicated roles and are not per-feature docs.

Examples: `docs/agent-branching.md`, `docs/agent-session-handover.md`, this document.

## Technical notes

- Canonical rule: `.devin/rules/core.md` (living docs bullet). Mirrored by `AGENTS.md` principle 8, `README.md` Documentation section, and the `feature`/`bugfix` skill reminders; pinned by `.devin/tests/config.test.mjs` (`documentation rule…` test).
