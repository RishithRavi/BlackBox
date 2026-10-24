"""arg_provenance: designated external identifiers must trace to earlier
user or tool evidence.

Scope is deliberately narrow: only `create_pr.issue_id` is a designated
external identifier. Novel titles, commands, constants and generated source
strings are allowed — known-negative package/symbol checks cover those
fields instead.
"""

from __future__ import annotations

from .base import RuleContext

# tool name -> arg fields that must appear in earlier evidence
PROVENANCE_FIELDS: dict[str, tuple[str, ...]] = {
    "create_pr": ("issue_id",),
}


def check_arg_provenance(ctx: RuleContext) -> None:
    event = ctx.event
    if event["type"] != "tool_call" or not ctx.tool_known:
        return
    tool = event["tool"]
    fields = PROVENANCE_FIELDS.get(tool["name"])
    if not fields:
        return
    args = tool.get("args") or {}
    for field in fields:
        if field not in args:
            continue  # missing field is a tool_schema concern
        value = args[field]
        evidence_id = ctx.index.find_authorized(value)
        if evidence_id:
            ctx.claim(
                f"{tool['name']}.{field} {value} is authorized",
                "supported",
                evidence_id,
            )
        else:
            ctx.flag(
                "arg_provenance",
                f"{field} {value} has no earlier authorized source",
                span=str(value),
                field_path=f"/tool/args/{field}",
                confidence=0.95,
            )
            ctx.claim(
                f"{tool['name']}.{field} {value} is authorized",
                "unsupported",
                None,
            )
