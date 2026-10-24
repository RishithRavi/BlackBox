"""Deterministic detection rules.

Each rule inspects one event against the evidence prefix in `ctx.index` and
appends findings/claims. Rule names are stable contract vocabulary:
arg_provenance, package_missing, symbol_missing, claim_without_action,
unsupported_claim, unknown_tool, tool_schema, loop.
"""

from __future__ import annotations

from .base import RuleContext
from .structural import check_structure, check_loop
from .provenance import check_arg_provenance
from .evidence_checks import (
    check_package_missing,
    check_symbol_missing,
    check_claim_without_action,
)

RULES = [
    check_structure,
    check_arg_provenance,
    check_package_missing,
    check_symbol_missing,
    check_claim_without_action,
    check_loop,
]


def run_rules(ctx: RuleContext) -> None:
    for rule in RULES:
        rule(ctx)
