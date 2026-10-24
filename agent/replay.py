#!/usr/bin/env python3
"""Black Box replay client (Session B).

Replays a recorded agent trace (JSONL of Event objects) against the detector
backend via POST /events, in file order, observe-only: it never computes a
verdict and continues after `block` verdicts. No real tools are executed.

Usage:
    uv run python replay.py runs/demo.jsonl --target http://localhost:8000 \
        --run-id demo_001 --delay-ms 350
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

EVENT_TYPES = {"user", "llm", "tool_call", "tool_result", "final"}
TOP_LEVEL_FIELDS = {
    "schema_version",
    "run_id",
    "step_id",
    "parent_step_id",
    "agent",
    "type",
    "content",
    "tool",
    "tool_call_id",
    "ts",
}
TOOL_ARG_KEYS = {
    "inspect_repo": set(),
    "lookup_package": {"name"},
    "run_tests": {"command"},
    "install_package": {"name"},
    "call_function": {"symbol"},
    "create_pr": {"title", "body", "issue_id"},
}


class ReplayError(Exception):
    pass


def validate_event(raw, index, seen_steps, seen_calls):
    """Validate one decoded JSON object against the v1 Event contract and
    local parent/call references. Returns the event dict."""
    where = f"line {index + 1}"
    if not isinstance(raw, dict):
        raise ReplayError(f"{where}: event is not a JSON object")

    unknown = set(raw) - TOP_LEVEL_FIELDS
    if unknown:
        raise ReplayError(f"{where}: unknown top-level fields: {sorted(unknown)}")

    for field in ("schema_version", "run_id", "step_id", "agent", "type", "content", "ts"):
        if field not in raw:
            raise ReplayError(f"{where}: missing required field {field!r}")
    if "parent_step_id" not in raw:
        raise ReplayError(f"{where}: missing required field 'parent_step_id' (nullable)")

    if raw["schema_version"] != "1":
        raise ReplayError(f"{where}: schema_version must be '1', got {raw['schema_version']!r}")

    for field in ("run_id", "step_id", "agent"):
        if not isinstance(raw[field], str) or not raw[field]:
            raise ReplayError(f"{where}: {field} must be a nonempty string")

    if raw["parent_step_id"] is not None:
        if not isinstance(raw["parent_step_id"], str) or not raw["parent_step_id"]:
            raise ReplayError(f"{where}: parent_step_id must be null or a nonempty string")
        if raw["parent_step_id"] not in seen_steps:
            raise ReplayError(
                f"{where}: parent_step_id {raw['parent_step_id']!r} does not refer "
                "to an earlier step"
            )

    if raw["step_id"] in seen_steps:
        raise ReplayError(f"{where}: duplicate step_id {raw['step_id']!r}")

    if not isinstance(raw["content"], str):
        raise ReplayError(f"{where}: content must be a string")

    etype = raw["type"]
    if etype not in EVENT_TYPES:
        raise ReplayError(f"{where}: type must be one of {sorted(EVENT_TYPES)}, got {etype!r}")

    ts = raw["ts"]
    if not isinstance(ts, str):
        raise ReplayError(f"{where}: ts must be an ISO 8601 string")
    try:
        parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        raise ReplayError(f"{where}: ts {ts!r} is not valid ISO 8601")
    if parsed.tzinfo is None:
        raise ReplayError(f"{where}: ts {ts!r} must include a UTC offset")

    has_tool = "tool" in raw
    has_call_id = "tool_call_id" in raw

    if etype == "tool_call":
        if not has_tool:
            raise ReplayError(f"{where}: tool_call event requires 'tool'")
        if not has_call_id:
            raise ReplayError(f"{where}: tool_call event requires 'tool_call_id'")
        tool = raw["tool"]
        if not isinstance(tool, dict) or set(tool) != {"name", "args"}:
            raise ReplayError(f"{where}: tool must be an object with 'name' and 'args'")
        if tool["name"] not in TOOL_ARG_KEYS:
            raise ReplayError(f"{where}: unknown tool {tool['name']!r}")
        if not isinstance(tool["args"], dict):
            raise ReplayError(f"{where}: tool.args must be a JSON object")
        missing = TOOL_ARG_KEYS[tool["name"]] - set(tool["args"])
        if missing:
            raise ReplayError(
                f"{where}: tool {tool['name']!r} missing arg keys: {sorted(missing)}"
            )
        if raw["tool_call_id"] in seen_calls:
            raise ReplayError(f"{where}: duplicate tool_call_id {raw['tool_call_id']!r}")
        seen_calls.add(raw["tool_call_id"])
    else:
        if has_tool:
            raise ReplayError(f"{where}: 'tool' is only allowed on tool_call events")

    if etype == "tool_result":
        if not has_call_id:
            raise ReplayError(f"{where}: tool_result event requires 'tool_call_id'")
        if raw["tool_call_id"] not in seen_calls:
            raise ReplayError(
                f"{where}: tool_result call id {raw['tool_call_id']!r} has no "
                "earlier tool_call"
            )
    elif etype != "tool_call" and has_call_id:
        raise ReplayError(f"{where}: 'tool_call_id' is only allowed on call/result events")

    seen_steps.add(raw["step_id"])
    return raw


def load_events(path):
    events = []
    seen_steps = set()
    seen_calls = set()
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ReplayError(f"line {i + 1}: invalid JSON: {exc}")
            events.append(validate_event(raw, i, seen_steps, seen_calls))
    if not events:
        raise ReplayError(f"{path}: no events found")
    return events


def post_event(target, event, timeout, max_attempts=4):
    """POST one event; retry only network-level failures with bounded backoff.
    Returns (verdict_dict, http_status). Raises ReplayError on HTTP errors."""
    url = target.rstrip("/") + "/events"
    body = json.dumps(event).encode("utf-8")
    delay = 0.25
    for attempt in range(1, max_attempts + 1):
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8")), resp.status
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ReplayError(
                f"POST /events step {event['step_id']!r} -> HTTP {exc.code}: {detail}"
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt == max_attempts:
                raise ReplayError(
                    f"POST /events step {event['step_id']!r}: network error after "
                    f"{max_attempts} attempts: {exc}"
                )
            print(
                f"  network error ({exc}); retrying identical body in {delay:.2f}s "
                f"(attempt {attempt + 1}/{max_attempts})",
                file=sys.stderr,
            )
            time.sleep(delay)
            delay = min(delay * 2, 4.0)


def verdict_line(verdict):
    flags = verdict.get("flags") or []
    rules = ",".join(f.get("rule", "?") for f in flags) or "-"
    return (
        f"  -> level={verdict.get('level')} score={verdict.get('score')} "
        f"rules=[{rules}] semantic={verdict.get('semantic_status')} "
        f"latency_ms={verdict.get('latency_ms')}"
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description="Replay a recorded Black Box run.")
    parser.add_argument("jsonl", help="Path to recorded run JSONL (one Event per line)")
    parser.add_argument("--target", default="http://localhost:8000",
                        help="Detector base URL (default http://localhost:8000)")
    parser.add_argument("--run-id", required=True,
                        help="Run ID to stamp on every event (fresh ID per replay)")
    parser.add_argument("--delay-ms", type=float, default=350,
                        help="Delay between events in milliseconds (default 350)")
    parser.add_argument("--timeout", type=float, default=10.0,
                        help="Per-request timeout seconds (default 10)")
    parser.add_argument("--check", action="store_true",
                        help="Validate the JSONL only; do not POST")
    args = parser.parse_args(argv)

    try:
        events = load_events(args.jsonl)
    except ReplayError as exc:
        print(f"replay: invalid recording: {exc}", file=sys.stderr)
        return 2

    print(f"loaded {len(events)} recorded events from {args.jsonl}")
    print("note: recorded replay - no tools are executed; expected labels are never sent")

    if args.check:
        print("check ok: all events valid against v1 contract and local references")
        return 0

    delay_s = max(args.delay_ms, 0) / 1000.0
    for i, event in enumerate(events):
        event = dict(event)
        event["run_id"] = args.run_id  # override every event's run ID consistently
        print(
            f"[{i + 1}/{len(events)}] {event['step_id']} {event['type']}"
            + (f" {event['tool']['name']}" if event["type"] == "tool_call" else "")
        )
        try:
            verdict, _ = post_event(args.target, event, args.timeout)
        except ReplayError as exc:
            print(f"replay: stopping: {exc}", file=sys.stderr)
            return 1
        print(verdict_line(verdict))
        if delay_s and i < len(events) - 1:
            time.sleep(delay_s)

    print("replay complete (observe-only; block verdicts did not stop the run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
