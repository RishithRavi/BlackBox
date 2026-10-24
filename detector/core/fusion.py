"""Conservative score fusion.

score  = max finding confidence (0.0 when no findings).
level  = "block" when a hard structural/provenance/evidence finding has
         confidence >= BLOCK_THRESHOLD; otherwise "warn" when any finding
         exists; otherwise "ok".
Semantic findings (unsupported_claim) and unknown-evidence outcomes can
never promote a step to "block" on their own — they are excluded from
BLOCK_RULES. Thresholds documented in detector/README.md.
"""

from __future__ import annotations

from typing import Any

BLOCK_RULES = {
    "arg_provenance",
    "package_missing",
    "symbol_missing",
    "unknown_tool",
    "tool_schema",
    "claim_without_action",
}
BLOCK_THRESHOLD = 0.8
SEMANTIC_FLAG_THRESHOLD = 0.65  # unsupported_claim flag needs conf >= 0.65


def build_verdict(
    run_id: str,
    step_id: str,
    findings: list[dict[str, Any]],
    semantic_status: str,
    latency_ms: float,
) -> dict[str, Any]:
    score = max((f["confidence"] for f in findings), default=0.0)
    if any(
        f["rule"] in BLOCK_RULES and f["confidence"] >= BLOCK_THRESHOLD
        for f in findings
    ):
        level = "block"
    elif findings:
        level = "warn"
    else:
        level = "ok"
    return {
        "schema_version": "1",
        "run_id": run_id,
        "step_id": step_id,
        "score": round(score, 4),
        "level": level,
        "flags": findings,
        "latency_ms": latency_ms,
        "semantic_status": semantic_status,
    }
