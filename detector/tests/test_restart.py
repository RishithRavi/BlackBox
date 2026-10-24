"""Restart durability: sequences, verdicts and graph IDs survive reopening
the same SQLite file; retries still dedupe; new steps can parent onto
pre-restart steps."""

from __future__ import annotations

from fastapi.testclient import TestClient
from grounding.base import NullAdapter

from tests.conftest import ev, post, result_content, seed_pair


def test_restart_preserves_run(make_app):
    adapter = NullAdapter()
    with TestClient(make_app(adapter=adapter)) as c:
        post(c, ev("s01", "user", "Fix issue 417."))
        seed_pair(c, "r1", "s02", "inspect_repo", {},
                  result_content("inspect_repo"), parent="s01")
        before_steps = c.get("/runs/r1/steps").json()["steps"]
        before_graph = c.get("/runs/r1/graph").json()

    with TestClient(make_app(adapter=NullAdapter())) as c2:
        after_steps = c2.get("/runs/r1/steps").json()["steps"]
        after_graph = c2.get("/runs/r1/graph").json()
        assert after_steps == before_steps
        assert after_graph == before_graph

        # identical retry still dedupes across restart
        v = post(c2, ev("s01", "user", "Fix issue 417.")).json()
        assert v == before_steps[0]["verdict"]
        assert len(c2.get("/runs/r1/steps").json()["steps"]) == 3

        # new events can parent onto pre-restart steps and see old evidence
        r = post(c2, ev(
            "s03", "tool_call", "call", parent="s02_res",
            tool={"name": "call_function",
                  "args": {"symbol": "repair_cache_magic"}},
            call_id="c9"))
        assert r.json()["flags"][0]["rule"] == "symbol_missing"
