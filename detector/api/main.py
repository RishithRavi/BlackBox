"""Black Box detector API.

Endpoints (frozen v1 contract):
  POST /events                         -> Verdict (200), 409 conflict, 422 invalid
  GET  /health                         -> readiness + semantic status
  GET  /runs/{run_id}/steps            -> persisted StepRecords
  GET  /runs/{run_id}/stream?after=0   -> SSE catch-up + tail
  GET  /runs/{run_id}/graph            -> evidence/claim provenance graph
  GET  /runs/{run_id}/metrics          -> per-run counters + latency percentiles

Run:  cd detector && uv sync && uv run uvicorn api.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from core.config import Settings
from core.graph import build_graph, build_metrics
from core.pipeline import ApiError, Pipeline
from core.store import Store
from grounding.base import SemanticAdapter
from grounding.laya import build_adapter

from .schemas import EventIn

HEARTBEAT_SECONDS = 15.0  # default; overridden by settings.heartbeat_s


def create_app(
    settings: Settings | None = None,
    adapter: SemanticAdapter | None = None,
    store: Store | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    store = store or Store(settings.db_path)
    adapter = adapter or build_adapter(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Warm the semantic model outside the request path; startup time is
        # excluded from warm-path latency but reported separately.
        await asyncio.to_thread(adapter.load)
        yield
        pipeline.close()
        store.close()

    app = FastAPI(title="Black Box detector", lifespan=lifespan)
    app.state.settings = settings
    app.state.store = store
    app.state.adapter = adapter
    pipeline = Pipeline(store, settings, adapter)
    app.state.pipeline = pipeline

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    # ---- write path ------------------------------------------------------

    @app.post("/events", status_code=200)
    async def post_event(event: EventIn) -> dict[str, Any]:
        try:
            return await pipeline.handle_event(event.normalized())
        except ApiError as e:
            raise HTTPException(status_code=e.status, detail=e.detail)

    # ---- read path --------------------------------------------------------

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "schema_version": "1",
            "semantic_status": adapter.status,
        }

    @app.get("/runs/{run_id}/steps")
    async def get_steps(run_id: str) -> dict[str, Any]:
        records = store.all_steps(run_id)
        return {
            "run_id": run_id,
            "steps": [
                {"seq": r["seq"], "event": r["event"], "verdict": r["verdict"]}
                for r in records
            ],
        }

    @app.get("/runs/{run_id}/graph")
    async def get_graph(run_id: str) -> dict[str, Any]:
        return build_graph(store, run_id)

    @app.get("/runs/{run_id}/metrics")
    async def get_metrics(run_id: str) -> dict[str, Any]:
        return build_metrics(store, run_id)

    @app.get("/runs/{run_id}/stream")
    async def stream(
        request: Request,
        run_id: str,
        after: int = Query(default=0, ge=0),
    ) -> StreamingResponse:
        cursor = after
        last_id = request.headers.get("last-event-id")
        if last_id:
            try:
                cursor = max(cursor, int(last_id))
            except ValueError:
                pass

        async def gen():
            cur = cursor
            seen = pipeline.notifier.version(run_id)
            try:
                while True:
                    if await request.is_disconnected():
                        return
                    for rec in store.steps_after(run_id, cur):
                        envelope = {
                            "schema_version": "1",
                            "kind": "step",
                            "run_id": run_id,
                            "seq": rec["seq"],
                            "event": rec["event"],
                            "verdict": rec["verdict"],
                        }
                        payload = json.dumps(
                            envelope, separators=(",", ":")
                        )
                        yield (
                            f"event: step\nid: {rec['seq']}\n"
                            f"data: {payload}\n\n"
                        )
                        cur = rec["seq"]
                    new_seen = await pipeline.notifier.wait(
                        run_id, seen, settings.heartbeat_s
                    )
                    if new_seen == seen:
                        yield ": heartbeat\n\n"
                    else:
                        seen = new_seen  # loop back and fetch new rows
            except asyncio.CancelledError:
                return

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return app


app = create_app()
