from __future__ import annotations

import dataclasses
import json
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from core.config import Settings
from grounding.base import SemanticResult

TS = "2026-10-24T15:00:00Z"


class StubAdapter:
    """Controllable semantic adapter for tests.

    results: list of {"status","confidence"} per claim, or a callable.
    delay: seconds to sleep inside verify (timeout tests).
    """

    def __init__(
        self,
        results: Any = None,
        ready: bool = True,
        status: str = "laya",
        delay: float = 0.0,
    ):
        self._results = results
        self._ready = ready
        self._status = status
        self.delay = delay
        self.calls: list[tuple[list[str], str]] = []

    @property
    def status(self) -> str:
        return self._status if self._ready else "unavailable"

    @property
    def ready(self) -> bool:
        return self._ready

    def load(self) -> None:
        return None

    def verify(self, claims, evidence_text):
        if self.delay:
            time.sleep(self.delay)
        self.calls.append((list(claims), evidence_text))
        if callable(self._results):
            return self._results(claims, evidence_text)
        if self._results is not None:
            return [
                SemanticResult(
                    status=r["status"],
                    confidence=r["confidence"],
                    evidence_id=r.get("evidence_id"),
                )
                for r in self._results
            ]
        return [
            SemanticResult(status="unknown", confidence=0.0,
                           evidence_id=None)
            for _ in claims
        ]


@pytest.fixture
def make_app(tmp_path):
    def _make(adapter=None, **over):
        settings = dataclasses.replace(
            Settings.from_env(),
            db_path=str(tmp_path / "blackbox.db"),
            **{k: v for k, v in over.items()
               if k in Settings.__dataclass_fields__},
        )
        return create_app(settings=settings, adapter=adapter)

    return _make


@pytest.fixture
def client(make_app):
    # Default: semantic verification unavailable (NullAdapter via
    # SEMANTIC_ENABLED default? No — build_adapter finds no laya spec
    # only if package absent; force an explicit unavailable adapter).
    from grounding.base import NullAdapter

    with TestClient(make_app(adapter=NullAdapter())) as c:
        yield c


def ev(
    step_id: str,
    type: str = "llm",
    content: str = "",
    run_id: str = "r1",
    parent: str | None = None,
    tool: dict | None = None,
    call_id: str | None = None,
    agent: str = "coder",
    ts: str = TS,
) -> dict:
    e: dict[str, Any] = {
        "schema_version": "1",
        "run_id": run_id,
        "step_id": step_id,
        "parent_step_id": parent,
        "agent": agent,
        "type": type,
        "content": content,
        "ts": ts,
    }
    if tool is not None:
        e["tool"] = tool
    if call_id is not None:
        e["tool_call_id"] = call_id
    return e


def result_content(tool: str, **kw) -> str:
    if tool == "inspect_repo":
        return json.dumps(
            {
                "symbols": kw.get(
                    "symbols", ["cache_get", "cache_set", "repair_cache"]
                ),
                "diff": kw.get(
                    "diff", "diff --git a/cache.py\n- TTL = 60\n+ TTL = 30"
                ),
                "files": kw.get("files", ["cache.py"]),
            }
        )
    if tool == "lookup_package":
        return json.dumps(
            {
                "name": kw["name"],
                "exists": kw["exists"],
                "source": kw.get("source", "recorded_registry_snapshot"),
                "checked_at": kw.get("checked_at", TS),
            }
        )
    if tool == "run_tests":
        return json.dumps(
            {
                "exit_code": kw.get("exit_code", 0),
                "passed": kw.get("passed", 12),
                "failed": kw.get("failed", 0),
            }
        )
    return json.dumps(kw)


def post(client: TestClient, event: dict) -> Any:
    return client.post("/events", json=event)


def seed_pair(
    client: TestClient,
    run_id: str,
    prefix: str,
    tool: str,
    args: dict,
    result: str,
    parent: str | None = None,
) -> None:
    """Emit a tool_call + tool_result pair for the run."""
    r = post(
        client,
        ev(f"{prefix}_call", "tool_call", f"calling {tool}",
           run_id=run_id, parent=parent,
           tool={"name": tool, "args": args}, call_id=f"{prefix}_id"),
    )
    assert r.status_code == 200, r.text
    r = post(
        client,
        ev(f"{prefix}_res", "tool_result", result, run_id=run_id,
           parent=f"{prefix}_call", call_id=f"{prefix}_id"),
    )
    assert r.status_code == 200, r.text
