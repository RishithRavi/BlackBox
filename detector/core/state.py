"""Per-run in-memory index.

Rebuilt from persisted records on restart using only deterministic derivation
(no model calls). Indexes the evidence *prefix* — every check scores a step
against evidence from earlier steps only, then the step's own allowed evidence
is appended.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .toolspec import parse_result_json

# Evidence node kinds (suffix of `evidence:<step_id>:<kind>`).
KIND_BY_TOOL = {
    "inspect_repo": "repo",
    "lookup_package": "registry",
    "run_tests": "tests",
}


@dataclass
class CallInfo:
    step_id: str
    name: str
    args: dict[str, Any]


@dataclass
class EvidenceNode:
    id: str
    kind: str
    label: str
    step_id: str
    text: str  # searchable content for provenance checks

    def to_graph(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": "evidence",
            "label": self.label,
            "step_id": self.step_id,
        }


@dataclass
class RunIndex:
    """Mutable per-run state. Updated only after a step's verdict is decided."""

    step_ids: set[str] = field(default_factory=set)
    canonical: dict[str, str] = field(default_factory=dict)
    verdicts: dict[str, dict[str, Any]] = field(default_factory=dict)
    calls: dict[str, CallInfo] = field(default_factory=dict)
    prior_call_sigs: list[tuple[str, str]] = field(default_factory=list)
    evidence_nodes: dict[str, EvidenceNode] = field(default_factory=dict)
    searchable: list[tuple[str, str]] = field(default_factory=list)
    registry: dict[str, dict[str, Any]] = field(default_factory=dict)
    repo_snapshot: dict[str, Any] | None = None
    test_results: list[dict[str, Any]] = field(default_factory=list)

    # ---- lookups --------------------------------------------------------

    def find_authorized(self, value: Any) -> str | None:
        """Return the evidence id whose text contains `value` as a token.

        Used by arg_provenance: designated external identifiers (e.g.
        create_pr.issue_id) must appear in earlier user/tool evidence.
        """
        token = re.escape(str(value))
        # A sentence-ending period is punctuation, while .<digit> continues
        # a numeric token. Never accept 932 inside 1932 or 932.5.
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            pattern = re.compile(rf"(?<![\w.]){token}(?!\w|\.\d)")
        else:
            pattern = re.compile(rf"(?<![\w.]){token}(?![\w.])")
        for ev_id, text in self.searchable:
            if pattern.search(text):
                return ev_id
        return None

    def last_test_result(self) -> dict[str, Any] | None:
        return self.test_results[-1] if self.test_results else None

    # ---- mutation (post-verdict only) -----------------------------------

    def ingest(self, event: dict[str, Any]) -> list[dict[str, Any]]:
        """Append this step's allowed evidence; return new evidence nodes."""
        sid = event["step_id"]
        self.step_ids.add(sid)
        nodes: list[EvidenceNode] = []

        if event["type"] == "user":
            node = EvidenceNode(
                id=f"evidence:{sid}:user",
                kind="user",
                label=f"user input ({sid})",
                step_id=sid,
                text=event["content"],
            )
            nodes.append(node)

        elif event["type"] == "tool_call":
            tool = event["tool"]
            self.calls[event["tool_call_id"]] = CallInfo(
                step_id=sid, name=tool["name"], args=tool.get("args") or {}
            )
            import json as _json

            self.prior_call_sigs.append(
                (tool["name"], _json.dumps(
                    tool.get("args") or {}, sort_keys=True,
                    separators=(",", ":")))
            )

        elif event["type"] == "tool_result":
            call = self.calls.get(event["tool_call_id"])
            name = call.name if call else "unknown"
            kind = KIND_BY_TOOL.get(name, "result")
            node = EvidenceNode(
                id=f"evidence:{sid}:{kind}",
                kind=kind,
                label=f"{name} result ({sid})",
                step_id=sid,
                text=event["content"],
            )
            data = parse_result_json(name, event["content"])
            if name == "inspect_repo" and data:
                self.repo_snapshot = {
                    "symbols": set(data["symbols"]),
                    "diff": data["diff"],
                    "files": data["files"],
                    "evidence_id": node.id,
                    "step_id": sid,
                }
            elif name == "lookup_package" and data:
                self.registry[data["name"]] = {
                    "exists": data["exists"],
                    "source": data["source"],
                    "evidence_id": node.id,
                }
            elif name == "run_tests" and data:
                self.test_results.append(
                    {
                        "exit_code": data["exit_code"],
                        "passed": data["passed"],
                        "failed": data["failed"],
                        "evidence_id": node.id,
                    }
                )
            nodes.append(node)

        for node in nodes:
            self.evidence_nodes[node.id] = node
            self.searchable.append((node.id, node.text))
        return [n.to_graph() for n in nodes]


def rebuild_index(records: list[dict[str, Any]]) -> RunIndex:
    """Reconstruct a RunIndex from persisted step records (seq order)."""
    import json as _json

    idx = RunIndex()
    for rec in records:
        ev = rec["event"]
        idx.ingest(ev)
        idx.canonical[ev["step_id"]] = _json.dumps(
            ev, sort_keys=True, separators=(",", ":")
        )
        idx.verdicts[ev["step_id"]] = rec["verdict"]
    return idx
