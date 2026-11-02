---
name: github
description: Operate GitHub issues, milestones, sub-issues, labels, and the Rifter project board — gh CLI canonical, github MCP for plain issue/PR reads and comments
triggers:
  - user
  - model
---

# GitHub

GitHub Issues + Projects are the task tracker for Rifter (`docs/roadmap.md` holds milestone content; this skill is the how-to for operating them). Use it whenever work involves creating, updating, linking, or reporting on issues and the project board.

## Toolchain

- **Canonical: `gh` CLI** — authenticated as `Sevdariel` with `repo`, `read:org`, `project` scopes.
  - Binary: `gh` normally; on Windows MSYS the fallback path is `"C:/Program Files/GitHub CLI/gh.exe"`.
  - Verify first: `gh auth status`. Project operations need the `project` scope — if missing: `gh auth refresh -s project` (interactive OAuth flow that can block a headless session — ask the user to run it).
- **github MCP** — usable for plain issue/PR reads and comments, but it has no project, label, milestone, or sub-issue tools. Prefer `gh` for anything structured.

## Repository conventions

- Repo `Sevdariel/Rifter`; the user-level project board `Rifter` is project number `1` (`--owner Sevdariel`).
- Milestones: `M0 Repository scaffold`, `M1 packages/analysis`, `M2 apps/api`, `M3 apps/web dev-harness`, `M4 Design system + first views`, `Backlog`. Discover current ones with `gh api repos/Sevdariel/Rifter/milestones` — do not hardcode beyond this list.
- Milestone epics are issues labeled `epic` — discover them with `gh issue list -R Sevdariel/Rifter -l epic` rather than trusting hardcoded numbers (seed state: #1 M0, #8 M1, #17 M2, #24 M3, #27 M4, #33 Backlog); their tasks are native sub-issues.
- New work item: create the issue with the right `-m "<milestone title>"`, attach it to the matching epic as a sub-issue, add it to the project board.
- Issue bodies in English: scope + acceptance criteria. Titles imperative and short.
- Commits and PRs may reference `#N`; GitHub links them automatically. `Fixes #N` in a commit message closes the issue — use deliberately, never by accident.
- Branches for issue-driven work are named `<type>-<issue-number>-<kebab-slug>` after the driving issue (for example `ci-50-github-actions-test-workflow`) — see `.devin/rules/core.md` for the full session-branch rule.

## Cookbook

Create an issue with a milestone and add it to the board:

```bash
gh issue create -R Sevdariel/Rifter -t "Title" -b "scope + acceptance" -m "M1 packages/analysis"
gh project item-add 1 --owner Sevdariel --url https://github.com/Sevdariel/Rifter/issues/<N>
```

Attach an issue to an epic as a sub-issue (needs node IDs, not issue numbers):

```bash
PARENT_ID=$(gh issue view <EPIC_NUM> -R Sevdariel/Rifter --json id -q .id)
CHILD_ID=$(gh issue view <N> -R Sevdariel/Rifter --json id -q .id)
gh api graphql -f 'query=mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c}){subIssue{number}}}' -F p=$PARENT_ID -F c=$CHILD_ID
```

New milestone (no `gh milestone` command exists — use REST):

```bash
gh api -X POST repos/Sevdariel/Rifter/milestones -f title="M5 ..."
```

New label:

```bash
gh label create <name> -R Sevdariel/Rifter -c RRGGBB -d "description"
```

Close with a reference, list board items, inspect an issue's hierarchy:

```bash
gh issue close <N> -R Sevdariel/Rifter -c "Done in <commit/PR>"
gh project item-list 1 --owner Sevdariel -L 100
gh api repos/Sevdariel/Rifter/issues/<N> -q '.sub_issues_summary'
```

Bulk seeding: drive `gh` from a Node script (`execFileSync`, manifest array of epics+tasks, same calls as above). Put such scripts in gitignored `.devin/tmp/` and remove them after the run.

## Board status flow

- `Todo` → `In Progress` when a session starts the task.
- `Code review` when the change is committed on the session branch. It means waiting for the user's acceptance — merging to `Develop` is the user's call, and the item stays in `Code review` until then.
- `Done` after the merge to `Develop` is verified on the remote: the agent sets `Done` and closes the issue with a completion comment (commit + merge ref).
- `Closed` once the change lands on `master` (release merge). The agent sets `Closed` after verifying the commit is on `origin/master`.

Review feedback for a task is recorded as comments on the task issue — both the user's requests and the agent's change notes — so the issue carries the full review history. Post them with `gh issue comment <N>`.

Per-subtask status checklist: set `In Progress` when the session starts, `Code review` when the change is committed, `Done` + close with a completion comment only after the remote merge is verified (`git merge-base --is-ancestor <sha> origin/Develop`). Do not leave statuses stale between transitions.

Warning — editing Status field options (`updateProjectV2Field` `singleSelectOptions`) regenerates every option ID and nulls all items' status values. Before such an edit snapshot current statuses (`gh project item-list`), then restore every item afterwards with `item-edit`. Avoid option edits when a rename/add can be done in the UI.

```bash
gh project item-edit 1 --owner Sevdariel --url https://github.com/Sevdariel/Rifter/issues/<N> --field Status --value "<Todo|In Progress|Code review|Done|Closed>"
```

## Boundaries

- Never print, paste, or commit tokens (`gh auth token` output is off-limits for logs, issues, files, and chat).
- Pushing follows the session-branch policy in `.devin/rules/core.md` — remote created at branch creation, one push of the whole branch at task completion, never per-commit. Never push to `Develop`/`master` and never merge — merging is the user's call.
- Run only the operations listed in this skill. Any other `gh`/MCP call — deletes, releases, repo settings, secrets, PR create/merge — requires explicit user instruction first.
- Issues and comments are externally visible (the repo may be public): keep them factual, English, and free of secrets, keys, and personal game data.
- Do not interpolate untrusted or external text into quoted `-t`/`-b` arguments; use `execFileSync`-style argv or `--body-file` for content that did not come from you.
- Closing issues: prefer a completion comment referencing the commit/PR; never silently close a user question or open decision.
- Board status fields and views: prefer reading to modifying; bulk field edits (`gh project item-edit`) need the field IDs from `gh project field-list` and a stated reason.
