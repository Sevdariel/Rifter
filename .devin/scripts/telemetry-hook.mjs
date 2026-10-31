#!/usr/bin/env node
// Append a compact JSONL telemetry record for a Devin lifecycle hook event.
//
// Reads the hook stdin payload and appends one line to
// .devin/telemetry/tool-calls.jsonl under the project root
// (DEVIN_PROJECT_DIR, falling back to the current directory).
//
// Deliberately records only metadata: never tool arguments, outputs, or prompt
// text, so logs cannot leak secrets or grow unbounded. Durations are derived by
// pairing PreToolUse/PostToolUse records during analysis.
//
// Runs on Node.js, which the project already requires, so the same hook command
// works on Windows and macOS. Every failure exits 0 silently and nothing is
// printed to stdout (stdout is reserved for hook control output).

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const EVENTS = new Set(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'PostCompaction']);
const bytes = (value) => Buffer.byteLength(value, 'utf8');
const text = (value) => (value ? String(value) : '');
const chars = (value) => [...text(value)].length;

export function buildRecord(payload) {
  const record = {
    ts: new Date().toISOString(),
    event: payload.hook_event_name ?? '',
    session_id: payload.session_id ?? null,
    prompt_id: payload.prompt_id ?? null,
  };

  if (payload.tool_name) {
    record.tool = payload.tool_name;
    record.input_bytes = bytes(JSON.stringify(payload.tool_input || {}));
  }

  switch (record.event) {
    case 'PostToolUse': {
      const response = payload.tool_response || {};
      record.ok = Boolean(response.success);
      record.output_bytes = bytes(text(response.output));
      if (response.error) record.error_chars = chars(response.error);
      break;
    }
    case 'UserPromptSubmit':
      record.prompt_chars = chars(payload.prompt);
      break;
    case 'SessionStart':
      record.source = payload.source ?? null;
      break;
    case 'SessionEnd':
      record.reason = payload.reason ?? null;
      break;
    case 'PostCompaction':
      record.summary_chars = chars(payload.summary);
      break;
  }

  return record;
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!EVENTS.has(payload.hook_event_name)) return;

  const root = process.env.DEVIN_PROJECT_DIR || process.cwd();
  // Write only under a directory that already is a .devin project root;
  // a mis-set DEVIN_PROJECT_DIR must not create files outside the repo.
  if (!existsSync(join(root, '.devin'))) return;

  const path = join(root, '.devin', 'telemetry', 'tool-calls.jsonl');
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(buildRecord(payload))}\n`, 'utf8');
}

try {
  await main();
} catch {
  // Telemetry must never block or break the session.
}
process.exitCode = 0;
