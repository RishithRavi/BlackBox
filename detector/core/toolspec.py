"""Tool argument and tool-result content schemas for the demo tool surface.

The detector never executes these tools; it only validates the recorded call
arguments and the structured JSON string inside `tool_result` content.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

# Tool name -> {"required": {field: type}, "optional": {field: type}}
# "type" values are python types checked with isinstance (bool before int).
TOOL_ARG_SPECS: dict[str, dict[str, dict[str, type]]] = {
    "inspect_repo": {"required": {}, "optional": {}},
    "lookup_package": {"required": {"name": str}, "optional": {}},
    "run_tests": {"required": {"command": str}, "optional": {}},
    "install_package": {"required": {"name": str}, "optional": {}},
    "call_function": {"required": {"symbol": str}, "optional": {}},
    "create_pr": {
        "required": {"issue_id": int},
        "optional": {"title": str, "body": str},
    },
}

# Tools whose tool_result content is structured evidence we can validate.
RESULT_TOOLS = {"inspect_repo", "lookup_package", "run_tests"}


def _is_type(value: Any, typ: type) -> bool:
    # bool is a subclass of int; keep them distinct for issue_id / exit_code.
    if typ is int:
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, typ)


def validate_tool_args(name: str, args: Any) -> list[str]:
    """Return a list of arg-schema violations; empty means valid."""
    if not isinstance(args, dict):
        return ["args is not a JSON object"]
    spec = TOOL_ARG_SPECS.get(name)
    if spec is None:
        return []  # unknown tool is handled by the unknown_tool rule
    errors: list[str] = []
    for field, typ in spec["required"].items():
        if field not in args:
            errors.append(f"missing required arg '{field}'")
        elif not _is_type(args[field], typ):
            errors.append(f"arg '{field}' has wrong type")
    allowed = set(spec["required"]) | set(spec["optional"])
    for field in args:
        if field not in allowed:
            errors.append(f"unexpected arg '{field}'")
        elif field in spec["optional"] and not _is_type(
            args[field], spec["optional"][field]
        ):
            errors.append(f"arg '{field}' has wrong type")
    return errors


def _is_utc_ts(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return dt.tzinfo is not None and dt.utcoffset() == timezone.utc.utcoffset(dt)


def validate_tool_result_content(tool_name: str, content: str) -> list[str]:
    """Validate the JSON string inside a tool_result's content.

    Returns violation messages; empty means valid structured evidence.
    Only tools in RESULT_TOOLS are validated; other results are opaque.
    """
    if tool_name not in RESULT_TOOLS:
        return []
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return ["content is not valid JSON"]
    if not isinstance(data, dict):
        return ["content JSON is not an object"]

    if tool_name == "inspect_repo":
        errors: list[str] = []
        if not _str_list(data.get("symbols")):
            errors.append("symbols is not a string array")
        if not isinstance(data.get("diff"), str):
            errors.append("diff is not a string")
        if not _str_list(data.get("files")):
            errors.append("files is not a string array")
        return errors

    if tool_name == "lookup_package":
        errors = []
        if not isinstance(data.get("name"), str) or not data.get("name"):
            errors.append("name is not a nonempty string")
        if not isinstance(data.get("exists"), bool):
            errors.append("exists is not a boolean")
        if data.get("source") not in {"recorded_registry_snapshot", "live_registry"}:
            errors.append("source is not a known registry source")
        if not _is_utc_ts(data.get("checked_at")):
            errors.append("checked_at is not an ISO 8601 UTC timestamp")
        return errors

    if tool_name == "run_tests":
        errors = []
        for field in ("exit_code", "passed", "failed"):
            if not _is_type(data.get(field), int):
                errors.append(f"{field} is not an integer")
        return errors

    return []


def _str_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(x, str) for x in value)


def parse_result_json(tool_name: str, content: str) -> dict[str, Any] | None:
    """Parse validated tool-result content back into a dict."""
    if tool_name not in RESULT_TOOLS:
        return None
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None
