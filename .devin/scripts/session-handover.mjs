#!/usr/bin/env node
// Export a Devin local session to a portable handover markdown file.
// Read-only against the local session store; never writes to the database.
//
// Usage:
//   node .devin/scripts/session-handover.mjs list [--db PATH] [--limit N]
//   node .devin/scripts/session-handover.mjs export <session-id> [--db PATH] [--out FILE] [--tool-chars N]
//
// Default output: .devin/tmp/handover-<session-id>.md (gitignored).
// The handover file may contain sensitive session content — move it between
// machines over a channel you trust and never commit it.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = join(repoRoot, '.devin', 'tmp');

function argValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function defaultDbPath() {
  if (process.env.DEVIN_CLI_DB) return process.env.DEVIN_CLI_DB;
  if (process.platform === 'win32')
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'devin', 'cli', 'sessions.db');
  return join(homedir(), '.local', 'share', 'devin', 'cli', 'sessions.db');
}

function openDb(dbPath) {
  if (!existsSync(dbPath)) {
    console.error(`Session store not found: ${dbPath}`);
    console.error('Pass --db <path> or set DEVIN_CLI_DB. Expected locations:');
    console.error('  Windows: %APPDATA%\\devin\\cli\\sessions.db');
    console.error('  macOS:   ~/.local/share/devin/cli/sessions.db');
    process.exit(2);
  }
  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    console.error(`Cannot open session store read-only: ${err.message}`);
    console.error('Close Devin on this machine and retry — the store may be exclusively locked.');
    process.exit(2);
  }
}

function numFlag(args, name, fallback) {
  const raw = argValue(args, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`Invalid ${name} value: ${raw}`);
    process.exit(2);
  }
  return n;
}

function iso(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : 'unknown';
}

function truncate(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function renderMessage(node, toolChars) {
  let msg;
  try {
    msg = JSON.parse(node.chat_message);
  } catch {
    return `\n> _Unparseable message node ${node.node_id} — skipped._\n`;
  }
  const role = msg.role;
  if (role === 'system') return '';
  if (role === 'user') return `\n### User\n\n${msg.content || ''}\n`;
  if (role === 'assistant') {
    let out = '\n### Assistant\n';
    if (msg.content) out += `\n${msg.content}\n`;
    for (const call of msg.tool_calls || [])
      out += `\n- \`tool: ${call.name}\` ${truncate(JSON.stringify(call.arguments ?? ''), toolChars)}`;
    return out + '\n';
  }
  if (role === 'tool') return `\n> _tool result:_ ${truncate(msg.content, toolChars)}\n`;
  return `\n> _${role}:_ ${truncate(msg.content, toolChars)}\n`;
}

const [, , command, ...rest] = process.argv;
const VALUE_FLAGS = new Set(['--db', '--out', '--limit', '--tool-chars']);
const positional = rest.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(rest[i - 1]));
const dbPath = resolve(argValue(rest, '--db') || defaultDbPath());

if (command === 'list') {
  const limit = numFlag(rest, '--limit', 20);
  const db = openDb(dbPath);
  const rows = db
    .prepare(
      `SELECT id, title, working_directory, model, created_at, last_activity_at
       FROM sessions WHERE hidden = 0 ORDER BY last_activity_at DESC LIMIT ?`,
    )
    .all(limit);
  db.close();
  if (!rows.length) {
    console.log('No sessions found.');
    process.exit(0);
  }
  for (const r of rows) {
    console.log(`${r.id}\t${r.last_activity_at ? iso(r.last_activity_at).slice(0, 10) : '?'}\t${r.working_directory}`);
    console.log(`\t${r.title || '(untitled)'}`);
  }
  process.exit(0);
}

if (command === 'export') {
  const sessionId = positional[0];
  if (!sessionId) {
    console.error('Usage: session-handover.mjs export <session-id> [--db PATH] [--out FILE] [--tool-chars N]');
    process.exit(2);
  }
  const toolChars = numFlag(rest, '--tool-chars', 300);
  const db = openDb(dbPath);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    db.close();
    console.error(`Session not found: ${sessionId}. Run "list" to see available sessions.`);
    process.exit(1);
  }
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  const allNodes = db
    .prepare('SELECT row_id, node_id, parent_node_id, chat_message FROM message_nodes WHERE session_id = ? ORDER BY row_id')
    .all(sessionId);
  db.close();

  const byId = new Map(allNodes.map((n) => [n.node_id, n]));
  const nodes = [];
  if (session.main_chain_id != null && byId.has(session.main_chain_id)) {
    const seen = new Set();
    for (let id = session.main_chain_id; id != null && byId.has(id) && !seen.has(id); id = byId.get(id).parent_node_id) {
      seen.add(id);
      nodes.push(byId.get(id));
    }
    nodes.reverse();
  } else {
    nodes.push(...allNodes);
  }

  let summary = '';
  for (const candidate of [
    join(dirname(dbPath), 'summaries', `${safeId}.md`),
    join(dirname(dirname(dbPath)), 'summaries', `${safeId}.md`),
  ]) {
    if (existsSync(candidate)) {
      summary = readFileSync(candidate, 'utf8').trim();
      break;
    }
  }

  let workspaceDirs = '[]';
  try {
    workspaceDirs = JSON.stringify(JSON.parse(session.workspace_dirs || '[]'));
  } catch {
    workspaceDirs = session.workspace_dirs || '[]';
  }

  const customOut = argValue(rest, '--out');
  const out = customOut ? resolve(customOut) : join(tmpDir, `handover-${safeId}.md`);
  if (customOut && !(out + sep).startsWith(tmpDir + sep))
    console.error(`warning: --out is outside the gitignored ${tmpDir} — do not commit this file.`);

  const lines = [];
  lines.push(`# Session handover: ${session.title || sessionId}`);
  lines.push('');
  lines.push(`- **Session ID:** ${sessionId}`);
  lines.push(`- **Exported at:** ${new Date().toISOString()}`);
  lines.push(`- **Source working directory:** ${session.working_directory}`);
  lines.push(`- **Workspace dirs:** ${workspaceDirs}`);
  lines.push(`- **Model:** ${session.model || 'unknown'}`);
  lines.push(`- **Created:** ${iso(session.created_at)} · **Last activity:** ${iso(session.last_activity_at)}`);
  lines.push('');
  lines.push('## How to resume on another machine');
  lines.push('');
  lines.push('1. Move this file to the target machine over a trusted channel (cloud drive, USB, private share). Do not commit it — it can contain sensitive session content.');
  lines.push('2. Fetch the repository and check out the branch this session was working on.');
  lines.push('3. Start a new Devin session in the repository and attach or paste this file as the first context — the agent continues from here.');
  lines.push('');
  const summaryBlock = summary ? `## Session summary\n\n${summary}\n\n` : '';
  const transcript =
    `## Transcript\n\n_User and assistant messages in order; tool calls and results truncated to ${toolChars} chars. System prompts omitted._\n` +
    nodes.map((node) => renderMessage(node, toolChars)).join('');

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n' + summaryBlock + transcript, { mode: 0o600 });
  console.log(`Wrote ${out} (${nodes.length} main-chain message nodes).`);
  console.log('Move it to the other machine via a trusted channel — do not commit it.');
  process.exit(0);
}

console.error('Usage:');
console.error('  node .devin/scripts/session-handover.mjs list [--db PATH] [--limit N]');
console.error('  node .devin/scripts/session-handover.mjs export <session-id> [--db PATH] [--out FILE] [--tool-chars N]');
process.exit(2);
