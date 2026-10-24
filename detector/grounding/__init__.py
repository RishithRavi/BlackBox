"""Semantic grounding adapters (Laya primary, explicit unavailable mode)."""

from .base import NullAdapter, SemanticAdapter, SemanticResult
from .claims import extract_semantic_claims, build_evidence_text
from .laya import LayaAdapter

__all__ = [
    "NullAdapter",
    "SemanticAdapter",
    "SemanticResult",
    "LayaAdapter",
    "extract_semantic_claims",
    "build_evidence_text",
]
