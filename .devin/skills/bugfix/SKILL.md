---
name: bugfix
description: Reproduce and fix a Rifter bug with a failing regression test and minimal scope
triggers:
  - user
  - model
---

# Bugfix Workflow

Root agent: apply `.devin/skills/orchestrate/SKILL.md` once, or reuse the active context. A small patch does not exempt security-sensitive, compliance-relevant, or Rust behavior from its gates.

Delegated: reproduce and fix only the assigned bug within the owned files; report focused verification to the root. Do not delegate or approve final gates.

1. Read repository-root `AGENTS.md` and relevant rules. Reproduce the bug and trace its root cause before changing code. Delegate independent investigation only when it adds evidence.
2. Add a regression test in the affected app or package and confirm it fails for the reported reason. Bugs tied to a game or replay use a recorded fixture (Live Client Data capture, Match-V5 payload, or `.rofl` sample named by patch), never a live game or the live Riot API. If automation cannot reproduce the issue, document the limitation and reproduction steps.
3. Apply the smallest root-cause fix within the directly affected code. Do not expand into unrelated refactoring or migrations.
4. Confirm the regression test passes. The root stabilizes the integrated change, arranges independent review and any applicable security, compliance, AI analysis, or Rust gate, and uses `run-tests` for final verification. Recheck review fixes and affected tests.
5. Summarize the root cause, fix, regression coverage, gate results, and remaining limitations, then commit locally per the commit policy (never push, never deploy). If the fix changed documented behavior, update the feature's living doc under `docs/` in the same change (see `.devin/rules/core.md`).
