"""Runtime configuration for the Black Box detector.

All knobs are environment-driven so `uv run uvicorn api.main:app` works with no
setup, and model behaviour can be configured without code changes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# convaiinnovations/laya on Hugging Face, Apache-2.0.
# Verified revision recorded for provenance (see detector/README.md).
DEFAULT_LAYA_MODEL_ID = "convaiinnovations/laya"
DEFAULT_LAYA_REVISION = "7b928d828b7b0e022f929d9bd2e44165aa270148"

_DEFAULT_DB = (
    Path(__file__).resolve().parent.parent / ".data" / "blackbox.db"
)


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


@dataclass(frozen=True)
class Settings:
    db_path: str
    laya_model_id: str
    laya_revision: str
    laya_device: str
    semantic_enabled: bool
    semantic_timeout_ms: int
    semantic_workers: int
    heartbeat_s: float
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db_path=os.environ.get("BLACKBOX_DB_PATH", str(_DEFAULT_DB)),
            laya_model_id=os.environ.get("LAYA_MODEL_ID", DEFAULT_LAYA_MODEL_ID),
            laya_revision=os.environ.get("LAYA_REVISION", DEFAULT_LAYA_REVISION),
            laya_device=os.environ.get("LAYA_DEVICE", "auto"),
            semantic_enabled=_bool_env("SEMANTIC_ENABLED", True),
            semantic_timeout_ms=int(os.environ.get("SEMANTIC_TIMEOUT_MS", "150")),
            semantic_workers=int(os.environ.get("SEMANTIC_WORKERS", "1")),
            heartbeat_s=float(
                os.environ.get("BLACKBOX_HEARTBEAT_S", "15")
            ),
            cors_origins=tuple(
                o.strip()
                for o in os.environ.get(
                    "BLACKBOX_CORS_ORIGINS",
                    "http://localhost:5173,http://127.0.0.1:5173",
                ).split(",")
                if o.strip()
            ),
        )
