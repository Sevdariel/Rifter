---
description: Core project rules
trigger: always_on
---

# Core Rules

- Follow the architecture, Riot compliance boundary, development principles, language policy, commit policy, and verification guidance in repository-root `AGENTS.md`.
- Apply target patterns to new and directly changed code within the task; touching existing code is not a mandate for unrelated refactoring.
- Be short and concise in your responses.
- Always respond in the same language as the user's message.
- If a requirement is ambiguous, ask before implementing.
- Never end a thread with a non-compiling worktree: uncommitted moves/renames either go in a WIP commit or get reverted. A continuation thread starts by checking `git status` and a build/typecheck baseline before the first edit.
- Each session that changes files works on its own topic branch named after the driving GitHub issue: `<type>-<issue-number>-<kebab-slug>` where `<type>` is the conventional-commit type matching the issue (feat, fix, docs, chore, ci, refactor, test) and the slug is the issue title in kebab-case, shortened when long — for example `ci-50-github-actions-test-workflow` for issue #50 "CI: GitHub Actions test workflow". Sessions without a driving issue use a PascalCase topic name (e.g. `LiveCapture`). The branch is created before the first mutating change; read-only/question sessions create no branch. The root agent owns the session branch — delegated workers never create or switch branches. Before branching, check `git status` and the current branch, then branch from the freshest `Develop` available — `origin/Develop` after a successful fetch, otherwise local `Develop`. If HEAD is not `Develop`, the repo is mid-merge/rebase or detached, the switch would overwrite local changes, or `Develop` is missing, stop and ask the user — never stash, force, or clean to enable branching. All session commits land on the session branch, never directly on `Develop` or `master`; verify the session branch is checked out before the first commit and report the branch name in the completion summary. A continuation thread for the same task keeps the existing session branch instead of cutting a new one. The agent creates the remote branch at branch creation (`git push -u origin <branch>`) and pushes the whole branch once at task completion — never push commits individually as they land. The agent never merges — merging is left to the user.
- In reviews and analyses, blocking findings require cited file/line evidence; claims about external library, Riot API, or runtime behavior additionally require library source/documentation or executed-check evidence — otherwise report them as unverified hypotheses, not blockers.
- Assess task size and risk even without a slash command. For implementation, configuration changes, or nontrivial delegated work, use `.devin/skills/orchestrate/SKILL.md` once in the root agent; reuse an active context. Workers follow only their assigned contract and return results without starting another pipeline.
- Never commit, log, or paste Riot API keys, LLM API keys, RSO client secrets, LCU lockfile passwords, or personal access tokens. When a secret appears in tool output, stop, tell the user, and recommend rotation.
- Moving a session between machines uses `.devin/skills/session-handover/` (export via `.devin/scripts/session-handover.mjs` into the gitignored `.devin/tmp/`). Never commit handover files — transcripts can contain sensitive session content.
- Every feature or behavior change — product code or agent-facing process — creates or updates its living document at `docs/<feature-or-area>.md` (kebab-case, one document per feature or area): business purpose and usage first, technical notes (components, data flow, commands, edge cases) second. The doc update lands in the same change as the work it describes; missing or stale docs are a review finding. `docs/roadmap.md` and `docs/design/` keep their existing dedicated roles.

## Delegation gates (hard rules)

- Figma document writes are designed and owned by the `figma-designer` subagent. The root never mutates the document on its own initiative; it supplies the designer with reference screenshots captured from the running application (or user-supplied equivalents). Component source alone is not a visual reference. If the designer runtime lacks MCP tools (a documented environment limitation), the root may execute document-mutating `figma_*` tools only as attributed parent-execution of the designer's written spec — under the designer's Task/Change-set ID — and the independent-review gate still applies.
- Visual deliverables (Figma frames, UI screenshots) are verified by an independent reviewer comparing exported previews against the reference evidence — never self-approved by whoever produced them.
- UI implementation (components or views) starts only after the user accepts the matching Figma node. Design-system elements are accepted before views that use them. Agents never accept designs; only an explicit user confirmation records acceptance in `docs/design/acceptance.md`. Follow `.devin/rules/design-acceptance.md`.
- Changes to Riot data collection, live capture, LCU usage, replay handling, or anything shown to the player during a game go through the independent `riot-compliance-reviewer` gate.
- Changes to LLM prompts, model selection, the analysis report contract, or moment detection go through the independent `ai-analysis-reviewer` gate.
- Rust changes go through the independent `rust-reviewer` gate in addition to the code review.
- Before the first mutating tool call in a domain covered by a specialist profile in `.devin/skills/orchestrate/SKILL.md`, name the owning specialist. Retrofitting ownership after manual edits does not satisfy the gate.
- Before the first call to any MCP server, list its tools once and use actual schemas; never guess tool names or argument shapes. For `figma-mcp-bridge`, consult `.devin/references/figma-mcp-bridge.md` first.
- `.devin/` changes that alter agent execution — agent `allowed-tools`/permissions, MCP server configuration, hooks, triggers, or other executable configuration — are security-sensitive and require the `security-reviewer` gate regardless of size. Pure prose changes to rules, skills, or profile descriptions need only the standard code review.
- If a specialist-owned deliverable is rejected on fidelity or evidence grounds, stop manual patching and rerun the evidence pipeline (references -> spec -> build -> independent review). Patching a failed artifact does not make it compliant.

## Scripted edit safety

- Scripted edits (sed/python/awk) that delete or move >20 lines must anchor on a unique pattern — never one known to repeat in the file. Assert the match count/position in the same command before writing, and immediately inspect `git diff --stat` plus the first and last changed hunk afterwards. Prefer line-range edits verified one command earlier over re-derived patterns.
