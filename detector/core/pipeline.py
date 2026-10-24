"""Event processing pipeline: referential checks, rules, semantic
verification, fusion, persistence, and SSE publish.

Ordering guarantees:
- ingestion is serialized per run (asyncio lock, single worker)
- every check sees only the evidence prefix that precedes this step
- the record is persisted before any SSE publish
- an identical (run_id, step_id) retry returns the stored verdict without
  a second record or stream message
"""

from __future__ import annotations

import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from grounding.base import SemanticAdapter
from grounding.claims import build_evidence_text, extract_semantic_claims
from rules import RuleContext, run_rules

from .config import Settings
from .fusion import SEMANTIC_FLAG_THRESHOLD, build_verdict
from .sse import Notifier
from .state import RunIndex, rebuild_index
from .store import Store
from .toolspec import validate_tool_result_content


class ApiError(Exception):
    def __init__(self, status: int, detail: Any):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


def canonical(event: dict[str, Any]) -> str:
    return json.dumps(event, sort_keys=True, separators=(",", ":"))


class Pipeline:
    def __init__(
        self,
        store: Store,
        settings: Settings,
        adapter: SemanticAdapter,
    ) -> None:
        self.store = store
        self.settings = settings
        self.adapter = adapter
        self.notifier = Notifier()
        self._locks: dict[str, asyncio.Lock] = {}
        self._indexes: dict[str, RunIndex] = {}
        self._executor = ThreadPoolExecutor(
            max_workers=max(1, settings.semantic_workers),
            thread_name_prefix="semantic",
        )
        # Rebuild per-run indexes from persisted records (deterministic
        # derivation only; model judgments are never rerun).
        for run_id in self.store.run_ids():
            self._indexes[run_id] = rebuild_index(
                self.store.all_steps(run_id)
            )

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    # ---- helpers ---------------------------------------------------------

    def _lock_for(self, run_id: str) -> asyncio.Lock:
        lock = self._locks.get(run_id)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[run_id] = lock
        return lock

    def _index_for(self, run_id: str) -> RunIndex:
        idx = self._indexes.get(run_id)
        if idx is None:
            idx = RunIndex()
            self._indexes[run_id] = idx
        return idx

    # ---- main entry ------------------------------------------------------

    async def handle_event(self, event: dict[str, Any]) -> dict[str, Any]:
        run_id = event["run_id"]
        async with self._lock_for(run_id):
            t0 = time.perf_counter()
            idx = self._index_for(run_id)

            prior = idx.canonical.get(event["step_id"])
            if prior is not None:
                if prior == canonical(event):
                    return idx.verdicts[event["step_id"]]  # idempotent retry
                raise ApiError(
                    409,
                    f"step_id '{event['step_id']}' already exists with a"
                    " different payload",
                )

            self._check_references(idx, event)

            ctx = RuleContext(event=event, index=idx)
            run_rules(ctx)

            semantic_status = await self._run_semantic(
                idx, event, ctx
            )

            latency_ms = round((time.perf_counter() - t0) * 1000, 3)
            verdict = build_verdict(
                run_id,
                event["step_id"],
                ctx.findings,
                semantic_status,
                latency_ms,
            )

            claims = [
                {
                    "id": f"claim:{event['step_id']}:{i}",
                    "text": c["text"],
                    "status": c["status"],
                    "evidence_id": c.get("evidence_id"),
                }
                for i, c in enumerate(ctx.claims)
            ]
            # Score against the prefix, THEN append this step's evidence.
            evidence_nodes = idx.ingest(event)

            seq = self.store.max_seq(run_id) + 1
            self.store.insert_step(
                run_id, seq, event["step_id"], event, verdict,
                claims, evidence_nodes,
            )
            idx.canonical[event["step_id"]] = canonical(event)
            idx.verdicts[event["step_id"]] = verdict

        # Publish only after the transaction committed and the per-run
        # lock is released (never hold the lock for a stream's lifetime).
        self.notifier.publish(run_id)
        return verdict

    # ---- referential integrity -------------------------------------------

    def _check_references(
        self, idx: RunIndex, event: dict[str, Any]
    ) -> None:
        parent = event["parent_step_id"]
        if parent is not None and parent not in idx.step_ids:
            raise ApiError(
                409, f"parent_step_id '{parent}' does not exist in this run"
            )
        etype = event["type"]
        call_id = event.get("tool_call_id")
        if etype == "tool_call":
            if call_id in idx.calls:
                raise ApiError(
                    409, f"tool_call_id '{call_id}' is already used"
                )
        elif etype == "tool_result":
            call = idx.calls.get(call_id)
            if call is None:
                raise ApiError(
                    409,
                    f"tool_result references unknown tool_call_id"
                    f" '{call_id}'",
                )
            errors = validate_tool_result_content(
                call.name, event["content"]
            )
            if errors:
                raise ApiError(
                    422,
                    {
                        "detail": "invalid structured tool_result content",
                        "errors": errors,
                    },
                )

    # ---- semantic verification -------------------------------------------

    async def _run_semantic(
        self,
        idx: RunIndex,
        event: dict[str, Any],
        ctx: RuleContext,
    ) -> str:
        claims = extract_semantic_claims(event)
        if not claims:
            return "not_applicable"
        # Unknown tools already carry a block; don't spend semantic budget.
        if not ctx.tool_known:
            return "not_applicable"
        if not self.adapter.ready:
            return "unavailable"

        evidence_text = build_evidence_text(idx)
        texts = [c["text"] for c in claims]
        loop = asyncio.get_running_loop()
        try:
            results = await asyncio.wait_for(
                loop.run_in_executor(
                    self._executor, self.adapter.verify, texts, evidence_text
                ),
                timeout=self.settings.semantic_timeout_ms / 1000,
            )
        except (asyncio.TimeoutError, Exception):
            # Late results are discarded; the stored verdict is unchanged.
            return "unavailable"

        for claim, res in zip(claims, results):
            if res["status"] == "supported":
                ctx.claim(
                    claim["text"], "supported",
                    res.get("evidence_id") or _default_evidence(idx),
                )
            elif (
                res["status"] == "unsupported"
                and res["confidence"] >= SEMANTIC_FLAG_THRESHOLD
            ):
                ctx.flag(
                    "unsupported_claim",
                    "claim is not supported by this run's earlier evidence",
                    span=claim["text"],
                    field_path=claim["field_path"],
                    confidence=res["confidence"],
                )
                ctx.claim(claim["text"], "unsupported", None)
            else:
                ctx.claim(claim["text"], "unknown", None)
        return self.adapter.status


def _default_evidence(idx: RunIndex) -> str | None:
    if idx.repo_snapshot is not None:
        return idx.repo_snapshot["evidence_id"]
    if idx.evidence_nodes:
        return next(reversed(idx.evidence_nodes))
    return None
