"""Structural rules: unknown tools, tool-argument schema, repeated-call loops."""

from __future__ import annotations

import json

from core.toolspec import TOOL_ARG_SPECS, validate_tool_args

from .base import RuleContext

LOOP_REPEAT_THRESHOLD = 3  # identical (tool, args) calls, ignoring call ids


def check_structure(ctx: RuleContext) -> None:
    event = ctx.event
    if event["type"] != "tool_call":
        return
    name = event["tool"]["name"]
    if name not in TOOL_ARG_SPECS:
        ctx.tool_known = False
        ctx.flag(
            "unknown_tool",
            f"tool '{name}' is not in the demo tool surface",
            span=name,
            field_path="/tool/name",
            confidence=0.99,
        )
        return
    errors = validate_tool_args(name, event["tool"].get("args"))
    if errors:
        ctx.flag(
            "tool_schema",
            f"invalid arguments for {name}: {'; '.join(errors)}",
            field_path="/tool/args",
            confidence=0.9,
        )


def check_loop(ctx: RuleContext) -> None:
    event = ctx.event
    if event["type"] != "tool_call" or not ctx.tool_known:
        return
    tool = event["tool"]
    sig = (
        tool["name"],
        json.dumps(tool.get("args") or {}, sort_keys=True,
                   separators=(",", ":")),
    )
    prior = ctx.index.prior_call_sigs
    if sum(1 for s in prior if s == sig) >= LOOP_REPEAT_THRESHOLD - 1:
        ctx.flag(
            "loop",
            f"tool call {tool['name']} repeated {LOOP_REPEAT_THRESHOLD}+"
            " times with identical arguments",
            field_path="/tool",
            confidence=0.6,
        )
