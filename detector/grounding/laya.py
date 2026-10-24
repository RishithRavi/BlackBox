"""Laya semantic verifier adapter.

Upstream (verified; full provenance in detector/README.md):
  - package: `laya` on PyPI, Apache-2.0
  - model:   convaiinnovations/laya on Hugging Face, Apache-2.0
  - API:     laya.load(model_id, device=..., revision=...) -> Agent;
             agent.predict(state, questions) -> one non-autoregressive
             forward pass answering every question at once.

Each claim is embedded in the *state* alongside the evidence document —
measured to be far more discriminating than putting the claim in the
question head — and all per-claim states run through a single
`predict_batch` call. The `noul` score (probability the claim is
supported) normalizes to:
  p >= 0.70  -> supported    (confidence p)
  p <= 0.35  -> unsupported  (confidence 1-p)
  otherwise  -> unknown
"unsupported" means unsupported by this run's evidence — not necessarily
false in the world. If Laya reports the evidence document was truncated
by its context budget, an "unsupported" answer is capped below the flag
threshold: we will not flag what the model could not fully read.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import NullAdapter, SemanticResult

log = logging.getLogger("blackbox.grounding")

_QUESTION = {
    "support": {
        "type": "noul",
        "instructions": "Is the agent's claim supported by the evidence?",
    }
}
_STATE_TEMPLATE = (
    'The agent made this claim about its work: "{claim}"\n\n'
    "EVIDENCE:\n{evidence}"
)
_SUPPORTED_P = 0.70
_UNSUPPORTED_P = 0.35
# Below SEMANTIC_FLAG_THRESHOLD (0.65): a truncated read never flags.
_TRUNCATED_CAP = 0.60


class LayaAdapter:
    def __init__(
        self,
        model_id: str,
        revision: str | None = None,
        device: str = "auto",
    ) -> None:
        self.model_id = model_id
        self.revision = revision or None
        self.device = device
        self._agent: Any = None
        self._ready = False
        self.load_error: str | None = None

    @property
    def status(self) -> str:
        return "laya" if self._ready else "unavailable"

    @property
    def ready(self) -> bool:
        return self._ready

    def load(self) -> None:
        """Blocking warmup; run off the event loop at startup."""
        try:
            import laya  # type: ignore

            device = None if self.device in {"", "auto"} else self.device
            agent = laya.load(
                self.model_id,
                device=device,
                revision=self.revision,
            )
            # One warmup pass keeps the first live request off a cold model.
            agent.predict(
                _STATE_TEMPLATE.format(
                    claim="the work is done", evidence="warmup"
                ),
                _QUESTION,
            )
            self._agent = agent
            self._ready = True
        except Exception as exc:  # import, download, or init failure
            self.load_error = f"{type(exc).__name__}: {exc}"
            log.warning("laya adapter unavailable: %s", self.load_error)
            self._ready = False

    def verify(
        self, claims: list[str], evidence_text: str
    ) -> list[SemanticResult]:
        unknown = [
            SemanticResult(status="unknown", confidence=0.0,
                           evidence_id=None)
            for _ in claims
        ]
        if not self._ready or self._agent is None:
            return unknown
        states = [
            _STATE_TEMPLATE.format(
                claim=c, evidence=evidence_text or "(no recorded evidence)"
            )
            for c in claims
        ]
        try:
            results = self._agent.predict_batch(states, _QUESTION)
        except Exception as exc:
            log.warning("laya predict_batch failed: %s", exc)
            return unknown

        out: list[SemanticResult] = []
        for i in range(len(claims)):
            result = results[i] if i < len(results) else {}
            answers = result.get("answers", {})
            truncated = bool((result.get("usage") or {}).get("truncated"))
            ans = answers.get("support") or {}
            p = ans.get("noul")
            if not isinstance(p, (int, float)):
                out.append(
                    SemanticResult(
                        status="unknown", confidence=0.0,
                        evidence_id=None,
                    )
                )
            elif p >= _SUPPORTED_P:
                out.append(
                    SemanticResult(
                        status="supported", confidence=float(p),
                        evidence_id=None,
                    )
                )
            elif p <= _UNSUPPORTED_P:
                conf = 1.0 - float(p)
                if truncated:
                    conf = min(conf, _TRUNCATED_CAP)
                out.append(
                    SemanticResult(
                        status="unsupported", confidence=conf,
                        evidence_id=None,
                    )
                )
            else:
                out.append(
                    SemanticResult(
                        status="unknown", confidence=0.0,
                        evidence_id=None,
                    )
                )
        return out


def build_adapter(settings) -> Any:
    """Select the semantic adapter from configuration and availability."""
    import importlib.util

    if not settings.semantic_enabled:
        return NullAdapter("SEMANTIC_ENABLED is off")
    if importlib.util.find_spec("laya") is None:
        return NullAdapter("laya package not installed")
    return LayaAdapter(
        model_id=settings.laya_model_id,
        revision=settings.laya_revision,
        device=settings.laya_device,
    )
