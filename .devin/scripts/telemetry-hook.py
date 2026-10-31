#!/usr/bin/env python3
"""Append a compact JSONL telemetry record for a Devin lifecycle hook event.

Reads the hook stdin payload and appends one line to
.devin/telemetry/tool-calls.jsonl under the project root
(DEVIN_PROJECT_DIR, falling back to the current directory).

Deliberately records only metadata — never tool arguments, outputs, or prompt
text — so logs cannot leak secrets or grow unbounded. Durations are derived by
pairing PreToolUse/PostToolUse records during analysis.

The hook must never block or break the session: every failure exits 0 silently
and nothing is printed to stdout (stdout is reserved for hook control output).
"""

import json
import os
import sys
from datetime import datetime, timezone

EVENTS = ("PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd", "PostCompaction")


def build_record(payload: dict) -> dict:
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "event": payload.get("hook_event_name", ""),
        "session_id": payload.get("session_id"),
        "prompt_id": payload.get("prompt_id"),
    }

    tool_name = payload.get("tool_name")
    if tool_name:
        record["tool"] = tool_name
        record["input_bytes"] = len(json.dumps(payload.get("tool_input") or {}).encode("utf-8"))

    if record["event"] == "PostToolUse":
        response = payload.get("tool_response") or {}
        record["ok"] = bool(response.get("success"))
        record["output_bytes"] = len(str(response.get("output") or "").encode("utf-8"))
        error = response.get("error")
        if error:
            record["error_chars"] = len(str(error))
    elif record["event"] == "UserPromptSubmit":
        record["prompt_chars"] = len(str(payload.get("prompt") or ""))
    elif record["event"] == "SessionStart":
        record["source"] = payload.get("source")
    elif record["event"] == "SessionEnd":
        record["reason"] = payload.get("reason")
    elif record["event"] == "PostCompaction":
        record["summary_chars"] = len(str(payload.get("summary") or ""))

    return record


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    if payload.get("hook_event_name") not in EVENTS:
        return
    root = os.environ.get("DEVIN_PROJECT_DIR") or os.getcwd()
    # Write only under a directory that already is a .devin project root;
    # a mis-set DEVIN_PROJECT_DIR must not create files outside the repo.
    if not os.path.isdir(os.path.join(root, ".devin")):
        return
    path = os.path.join(root, ".devin", "telemetry", "tool-calls.jsonl")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(build_record(payload), ensure_ascii=False) + "\n")


try:
    main()
except Exception:
    pass
sys.exit(0)
