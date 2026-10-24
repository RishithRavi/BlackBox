"""Semantic adapter protocol and the degraded-mode null adapter.

Adapters return, per claim: status supported|unsupported|unknown plus a
confidence in [0,1] and an optional evidence id. `unsupported` means
unsupported by this run's evidence — not necessarily false in the world.
"""

from __future__ import annotations

from typing import Any, Protocol, TypedDict


class SemanticResult(TypedDict):
    status: str  # "supported" | "unsupported" | "unknown"
    confidence: float
    evidence_id: str | None


class SemanticAdapter(Protocol):
    """Blocking verifier. Pipeline runs it in a bounded worker pool."""

    @property
    def status(self) -> str:
        """'laya' | 'fallback' | 'unavailable' — drives semantic_status."""
        ...

    @property
    def ready(self) -> bool: ...

    def load(self) -> None:
        """Warm the model. Called once at startup; must be idempotent."""
        ...

    def verify(
        self, claims: list[str], evidence_text: str
    ) -> list[SemanticResult]:
        """Verify each claim against the evidence text. Blocking."""
        ...


class NullAdapter:
    """Explicit degraded mode: no semantic backend available."""

    def __init__(self, reason: str = "semantic verification disabled"):
        self.reason = reason

    @property
    def status(self) -> str:
        return "unavailable"

    @property
    def ready(self) -> bool:
        return False

    def load(self) -> None:
        return None

    def verify(
        self, claims: list[str], evidence_text: str
    ) -> list[SemanticResult]:
        return [
            SemanticResult(status="unknown", confidence=0.0, evidence_id=None)
            for _ in claims
        ]
