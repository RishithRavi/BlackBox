"""Rule evaluation context shared by all deterministic rules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.state import RunIndex


@dataclass
class RuleContext:
    event: dict[str, Any]
    index: RunIndex
    findings: list[dict[str, Any]] = field(default_factory=list)
    claims: list[dict[str, Any]] = field(default_factory=list)
    tool_known: bool = True

    def flag(
        self,
        rule: str,
        message: str,
        *,
        span: str = "",
        field_path: str = "",
        evidence_ids: list[str] | None = None,
        confidence: float = 0.5,
    ) -> None:
        self.findings.append(
            {
                "rule": rule,
                "message": message,
                "span": span,
                "field_path": field_path,
                "evidence_ids": evidence_ids or [],
                "confidence": confidence,
            }
        )

    def claim(
        self,
        text: str,
        status: str,
        evidence_id: str | None = None,
    ) -> None:
        """Register a graph claim: status supported|unsupported|unknown."""
        self.claims.append(
            {"text": text, "status": status, "evidence_id": evidence_id}
        )
