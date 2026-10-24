"""Evidence-backed checks: package registry facts, repo symbol snapshot,
and claim-vs-action for passing-tests assertions.

Missing context produces an inconclusive warning with explanation, never a
claim of proven hallucination. Known-negative facts take precedence over
generic provenance for the same fields.
"""

from __future__ import annotations

import re

from .base import RuleContext

# Sentences that assert a passing test state.
TESTS_PASS_RE = re.compile(
    r"(\ball tests (?:are )?(?:now )?pass(?:ing|ed)?\b"
    r"|\btests? (?:are |is )?(?:all )?(?:now )?pass(?:ing|ed)\b"
    r"|\btest suite is green\b"
    r"|\b\d+\s+tests?\s+pass(?:ed|ing)?\b"
    r"|\bno (?:test )?failures?\b"
    r"|\beverything passes\b)",
    re.IGNORECASE,
)


def check_package_missing(ctx: RuleContext) -> None:
    event = ctx.event
    if event["type"] != "tool_call" or not ctx.tool_known:
        return
    tool = event["tool"]
    if tool["name"] != "install_package":
        return
    args = tool.get("args") or {}
    name = args.get("name")
    if not isinstance(name, str):
        return  # tool_schema already flagged
    fact = ctx.index.registry.get(name)
    if fact is None:
        ctx.flag(
            "package_missing",
            f"no recorded registry lookup for package '{name}';"
            " existence is unverified",
            span=name,
            field_path="/tool/args/name",
            confidence=0.5,
        )
        ctx.claim(f"package {name} exists in the registry", "unknown", None)
    elif fact["exists"]:
        ctx.claim(
            f"package {name} exists in the registry",
            "supported",
            fact["evidence_id"],
        )
    else:
        ctx.flag(
            "package_missing",
            f"recorded registry lookup says package '{name}' does not exist",
            span=name,
            field_path="/tool/args/name",
            evidence_ids=[fact["evidence_id"]],
            confidence=0.95,
        )
        ctx.claim(
            f"package {name} exists in the registry",
            "unsupported",
            None,
        )


def check_symbol_missing(ctx: RuleContext) -> None:
    event = ctx.event
    if event["type"] != "tool_call" or not ctx.tool_known:
        return
    tool = event["tool"]
    if tool["name"] != "call_function":
        return
    args = tool.get("args") or {}
    symbol = args.get("symbol")
    if not isinstance(symbol, str):
        return
    snap = ctx.index.repo_snapshot
    if snap is None:
        ctx.flag(
            "symbol_missing",
            f"no repo snapshot precedes this call; symbol '{symbol}'"
            " is unverified",
            span=symbol,
            field_path="/tool/args/symbol",
            confidence=0.5,
        )
        ctx.claim(f"symbol {symbol} is declared in the repo", "unknown", None)
    elif symbol in snap["symbols"]:
        ctx.claim(
            f"symbol {symbol} is declared in the repo",
            "supported",
            snap["evidence_id"],
        )
    else:
        ctx.flag(
            "symbol_missing",
            f"symbol '{symbol}' is absent from the declared repo symbol"
            " list",
            span=symbol,
            field_path="/tool/args/symbol",
            evidence_ids=[snap["evidence_id"]],
            confidence=0.9,
        )
        ctx.claim(
            f"symbol {symbol} is declared in the repo",
            "unsupported",
            None,
        )


def check_claim_without_action(ctx: RuleContext) -> None:
    event = ctx.event
    if event["type"] not in {"llm", "final"}:
        return
    match = TESTS_PASS_RE.search(event["content"])
    if not match:
        return
    last = ctx.index.last_test_result()
    claim_text = match.group(0)
    if last is None:
        ctx.flag(
            "claim_without_action",
            "passing-tests claim has no earlier run_tests result",
            span=claim_text,
            field_path="/content",
            confidence=0.6,
        )
        ctx.claim(claim_text, "unsupported", None)
    elif last["exit_code"] == 0 and last["failed"] == 0:
        ctx.claim(claim_text, "supported", last["evidence_id"])
    else:
        ctx.flag(
            "claim_without_action",
            "passing-tests claim contradicts the earlier failed"
            " run_tests result",
            span=claim_text,
            field_path="/content",
            evidence_ids=[last["evidence_id"]],
            confidence=0.85,
        )
        ctx.claim(claim_text, "unsupported", None)
