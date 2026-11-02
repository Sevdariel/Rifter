# Agent session handover

Move a Devin local session from one computer to another — for example start a task on the Windows PC and continue it on the macOS laptop. Both machines run Devin Local with the same agents and skills; only the OS differs.

## Usage

On the source machine, from the repository root:

```bash
node .devin/scripts/session-handover.mjs list
node .devin/scripts/session-handover.mjs export <session-id>
```

The export writes `.devin/tmp/handover-<session-id>.md` (gitignored). Move it to the other machine over a trusted channel, fetch the repository, check out the branch the session was on, and start a new Devin session with the file as the first context. The agent continues the task from the transcript. Full flow: `.devin/skills/session-handover/SKILL.md`.

## Technical notes

- The Devin local session store is a per-machine SQLite database (`sessions.db`): Windows `%APPDATA%\devin\cli\sessions.db`, macOS `~/.local/share/devin/cli/sessions.db`. Override with `--db <path>` or `DEVIN_CLI_DB`.
- The script (`node:sqlite`, Node ≥22) opens the store read-only and never writes to it. A live store in WAL mode is still readable; if the open fails, close Devin and retry.
- Export follows `sessions.main_chain_id` back through `message_nodes.parent_node_id`, so side branches (edited/resubmitted prompts) are excluded. User and assistant messages render in full; tool calls and tool results truncate at `--tool-chars` (default 300); system prompts are skipped. `list` hides sessions flagged `hidden`.
- A session summary is embedded when present; the script probes `<store>/cli/summaries/<session-id>.md` and `<store>/summaries/<session-id>.md` (layout varies between Devin versions).
- Flags: `--limit` (list size, default 20), `--out` (default `.devin/tmp/handover-<id>.md`), `--tool-chars`, `--db`.
- Handover transfers conversation context, not the session itself — the resumed work runs as a new session with a new id. Git is the real carrier of code state: the handover header records the source working directory, and the target agent checks out the branch.
- Limitations: the store schema is undocumented and may change with Devin updates (fallback: `/handoff` via Devin Cloud or a manual summary). Handover files can contain secrets or personal data — `.devin/tmp/` is gitignored and the files must never be committed.
