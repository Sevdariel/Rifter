# Agent session branching

Session work always lands on a topic branch named after its driving GitHub issue, so the task id is visible in every branch, commit list, and PR — never on `Develop` or `master` directly.

## Usage

When an agent session that changes files starts, it creates the branch before the first mutating change:

```
<type>-<issue-number>-<kebab-slug>
```

- `<type>` — conventional-commit type matching the issue: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`.
- `<issue-number>` — the driving GitHub issue id (e.g. `50`). The driving issue is always a **task-level** issue: milestone epics and stories that only group sub-issues do not get one shared branch — each sub-issue gets its own session branch.
- `<kebab-slug>` — issue title in kebab-case, shortened when long.

Examples: `ci-50-github-actions-test-workflow` (issue #50 "CI: GitHub Actions test workflow"), `fix-52-fix-branch-naming` (issue #52).

Sessions without a driving issue use a PascalCase topic name (e.g. `LiveCapture`). A continuation thread for the same task keeps the existing branch. When the assigned scope (issue, story, epic) is done, the session stops — the next issue gets a new session and a new branch.

## Pushing

- The remote branch is created when the local branch is created: `git push -u origin <branch>`.
- When the task completes, the whole branch is pushed once: `git push`. Commits are never pushed one at a time as they land.
- The agent never merges — merging to `Develop` is the user's call, and nothing is pushed directly to `Develop` or `master`.
- After the user merges the branch to `Develop`, verify the commits are ancestors of `origin/Develop` and re-run the applicable checks on the merged `Develop` state — merge resolutions can silently break files.

## Technical notes

- Canonical rule: `.devin/rules/core.md` (session branch bullet). Mirrored in `AGENTS.md` §5 and `.devin/skills/github/SKILL.md`; pinned by `.devin/tests/config.test.mjs` (`session branch rule…` test).
- Branch base: freshest `Develop` — `origin/Develop` after fetch, else local `Develop`.
- Git ref names cannot contain `:` or spaces — the issue-style `feat-50: title` notation maps to the kebab slug above.
