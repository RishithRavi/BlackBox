"""Graph and metrics read models, derived from persisted step records."""

from __future__ import annotations

import math
from typing import Any

from .store import Store


def build_graph(store: Store, run_id: str) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for rec in store.all_steps(run_id):
        ev = rec["event"]
        sid = ev["step_id"]
        nodes.append(
            {"id": f"step:{sid}", "kind": "step", "label": sid, "step_id": sid}
        )
        parent = ev.get("parent_step_id")
        if parent:
            edges.append(
                {
                    "id": f"e:parent:{sid}",
                    "source": f"step:{sid}",
                    "target": f"step:{parent}",
                    "relation": "parent",
                }
            )
        for claim in rec["claims"]:
            cid = claim["id"]
            nodes.append(
                {
                    "id": cid,
                    "kind": "claim",
                    "label": claim["text"][:80],
                    "step_id": sid,
                }
            )
            edges.append(
                {
                    "id": f"e:contains:{cid}",
                    "source": f"step:{sid}",
                    "target": cid,
                    "relation": "contains",
                }
            )
            if claim["status"] == "supported" and claim.get("evidence_id"):
                edges.append(
                    {
                        "id": f"e:support:{cid}",
                        "source": cid,
                        "target": claim["evidence_id"],
                        "relation": "supported_by",
                    }
                )
        for node in rec["evidence"]:
            nodes.append(node)
    return {"run_id": run_id, "nodes": nodes, "edges": edges}


def _nearest_rank(values: list[float], pct: float) -> float:
    idx = max(0, math.ceil(pct / 100 * len(values)) - 1)
    return values[idx]


def build_metrics(store: Store, run_id: str) -> dict[str, Any]:
    records = store.all_steps(run_id)
    latencies: list[float] = []
    levels = {"ok": 0, "warn": 0, "block": 0}
    status_counts = {
        "laya": 0,
        "fallback": 0,
        "unavailable": 0,
        "not_applicable": 0,
    }
    flag_count = 0
    for rec in records:
        v = rec["verdict"]
        flag_count += len(v["flags"])
        levels[v["level"]] = levels.get(v["level"], 0) + 1
        ss = v["semantic_status"]
        status_counts[ss] = status_counts.get(ss, 0) + 1
        latencies.append(v["latency_ms"])
    latencies.sort()
    return {
        "run_id": run_id,
        "step_count": len(records),
        "flag_count": flag_count,
        "levels": levels,
        "p50_latency_ms": (
            _nearest_rank(latencies, 50) if latencies else None
        ),
        "p95_latency_ms": (
            _nearest_rank(latencies, 95) if latencies else None
        ),
        "semantic_status_counts": status_counts,
    }
