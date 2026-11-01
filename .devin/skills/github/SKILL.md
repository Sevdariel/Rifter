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
  - Verify first: `gh auth status`. Project operations need the `project` scope — if missing: `gh auth refresh -s project`.
- **github MCP** — usable for plain issue/PR reads and comments, but it has no project, label, milestone, or sub-issue tools. Prefer `gh` for anything structured.

## Repository conventions

- Repo `Sevdariel/Rifter`; the user-level project board `Rifter` is project number `1` (`--owner Sevdariel`).
- Milestones: `M0 Repository scaffold`, `M1 packages/analysis`, `M2 apps/api`, `M3 apps/web dev-harness`, `M4 Design system + first views`, `Backlog`. Discover current ones with `gh api repos/Sevdariel/Rifter/milestones` — do not hardcode beyond this list.
- Milestone epics are issues labeled `epic` (#1 M0, #8 M1, #17 M2, #24 M3, #27 M4, #33 Backlog); their tasks are native sub-issues.
- New work item: create the issue with the right `-m "<milestone title>"`, attach it to the matching epic as a sub-issue, add it to the project board.
- Issue bodies in English: scope + acceptance criteria. Titles imperative and short.
- Commits and PRs may reference `#N`; GitHub links them automatically. `Fixes #N` in a commit message closes the issue — use deliberately, never by accident.

## Cookbook

Create an issue with a milestone and add it to the board:

```bash
gh issue create -R Sevdariel/Rifter -t "Title" -b "scope + acceptance" -m "M1 packages/analysis"
gh project item-add 1 --owner Sevdariel --url https://github.com/Sevdariel/Rifter/issues/<N>
```

Attach an issue to an epic as a sub-issue (needs node IDs, not issue numbers):

```bash
PID=$(gh issue view <EPIC_NUM> -R Sevdariel/Rifter --json id -q .id)
CID=$(gh issue view <N> -R Sevdariel/Rifter --json id -q .id)
gh api graphql -f 'query=mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c}){subIssue{number}}}' -F p=$PID -F c=$CID
```

New milestone (no `gh milestone` command exists — use REST):

```bash
gh api -X POST repos/Sevdariel/Rifter/milestones -f title="M5 ..."
```

New label:

```bash
gh label create <name> -R Sevdariel/Rifter -c "#RRGGBB" -d "description"
```

Close with a reference, list board items, inspect an issue's hierarchy:

```bash
gh issue close <N> -R Sevdariel/Rifter -c "Done in <commit/PR>"
gh project item-list 1 --owner Sevdariel -L 100
gh api repos/Sevdariel/Rifter/issues/<N> -q '.sub_issues_summary'
```

Bulk seeding: drive `gh` from a Node script (`execFileSync`, manifest array of epics+tasks, same calls as above). Put such scripts in gitignored `.devin/tmp/` and remove them after the run.

## Boundaries

- Never print, paste, or commit tokens (`gh auth token` output is off-limits for logs, issues, files, and chat).
- No push or merge on the user's behalf — the standing policy applies here too.
- Issues and comments are user-visible: keep them factual, English, and free of secrets, keys, and personal game data.
- Closing issues: prefer a completion comment referencing the commit/PR; never silently close a user question or open decision.
- Board status fields and views: prefer reading to modifying; bulk field edits (`gh project item-edit`) need the field IDs from `gh project field-list` and a stated reason.
