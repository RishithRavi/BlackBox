"""Read API: /steps, /graph, /metrics, /health, SSE /stream."""

from __future__ import annotations

import json

from tests.conftest import ev, post, result_content, seed_pair


def _seed_demo(client):
    post(client, ev("s01", "user", "Fix issue 417 please."))
    seed_pair(client, "r1", "s02", "inspect_repo", {},
              result_content("inspect_repo"),
              parent="s01")
    post(client, ev(
        "s03", "tool_call", "pr", parent="s02_res",
        tool={"name": "create_pr",
              "args": {"title": "Fix cache expiry",
                       "body": "Fixes issue 417", "issue_id": 417}},
        call_id="c3"))


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["schema_version"] == "1"
    assert body["semantic_status"] in {"laya", "fallback", "unavailable"}


def test_steps_contiguous_seq(client):
    _seed_demo(client)
    steps = client.get("/runs/r1/steps").json()["steps"]
    assert [s["seq"] for s in steps] == [1, 2, 3, 4]
    assert steps[0]["event"]["step_id"] == "s01"
    assert "verdict" in steps[0]


def test_graph_ids_resolve(client):
    _seed_demo(client)
    g = client.get("/runs/r1/graph").json()
    assert g["run_id"] == "r1"
    node_ids = {n["id"] for n in g["nodes"]}
    assert "step:s01" in node_ids
    assert "evidence:s01:user" in node_ids
    assert "evidence:s02_res:repo" in node_ids
    # every edge endpoint resolves; every claim has a contains edge
    for e in g["edges"]:
        assert e["source"] in node_ids, e
        assert e["target"] in node_ids, e
    claim_nodes = [n for n in g["nodes"] if n["kind"] == "claim"]
    assert claim_nodes
    support_edges = [e for e in g["edges"]
                     if e["relation"] == "supported_by"]
    # the authorized issue_id claim is supported by user evidence
    assert any(e["target"] == "evidence:s01:user" for e in support_edges)
    parent_edges = [e for e in g["edges"] if e["relation"] == "parent"]
    assert any(e["source"] == "step:s03" and e["target"] == "step:s02_res"
               for e in parent_edges)


def test_unsupported_claim_has_no_support_edge(client):
    post(client, ev("s01", "user", "Fix issue 417."))
    post(client, ev(
        "s02", "tool_call", "pr", parent="s01",
        tool={"name": "create_pr",
              "args": {"title": "t", "body": "b", "issue_id": 9999}},
        call_id="c2"))
    g = client.get("/runs/r1/graph").json()
    bad = [e for e in g["edges"]
           if e["relation"] == "supported_by"
           and e["source"].startswith("claim:s02")]
    assert bad == []


def test_metrics(client):
    _seed_demo(client)
    post(client, ev("s04", "llm", "All tests pass.", parent="s03"))
    m = client.get("/runs/r1/metrics").json()
    assert m["step_count"] == 5
    assert m["flag_count"] >= 1
    assert m["levels"]["ok"] >= 3
    assert m["p50_latency_ms"] is not None
    assert m["p95_latency_ms"] is not None
    assert sum(m["semantic_status_counts"].values()) == m["step_count"]


def test_unknown_run_empty_snapshots(client):
    assert client.get("/runs/nope/steps").json() == {
        "run_id": "nope", "steps": []}
    g = client.get("/runs/nope/graph").json()
    assert g["nodes"] == [] and g["edges"] == []
    m = client.get("/runs/nope/metrics").json()
    assert m["step_count"] == 0 and m["p50_latency_ms"] is None


def _read_sse(client, url, max_lines=40):
    lines = []
    with client.stream("GET", url) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        for line in resp.iter_lines():
            lines.append(line)
            if len(lines) >= max_lines:
                break
    return lines


def test_sse_replays_persisted(client):
    _seed_demo(client)
    lines = _read_sse(client, "/runs/r1/stream?after=0", max_lines=16)
    data = [l for l in lines if l.startswith("data: ")]
    ids = [l for l in lines if l.startswith("id: ")]
    assert len(data) == 4
    assert ids == [f"id: {i}" for i in (1, 2, 3, 4)]
    env = json.loads(data[0][6:])
    assert env["kind"] == "step"
    assert env["seq"] == 1
    assert env["event"]["step_id"] == "s01"
    assert "verdict" in env


def test_sse_cursor_after(client):
    _seed_demo(client)
    lines = _read_sse(client, "/runs/r1/stream?after=3", max_lines=4)
    ids = [l for l in lines if l.startswith("id: ")]
    assert ids == ["id: 4"]


def test_sse_empty_run_opens(make_app):
    from fastapi.testclient import TestClient
    from grounding.base import NullAdapter

    with TestClient(make_app(adapter=NullAdapter(),
                             heartbeat_s=0.05)) as c:
        lines = _read_sse(c, "/runs/nope/stream?after=0", max_lines=2)
    assert lines == [] or all(l.startswith(":") or l == "" for l in lines)


def test_graph_exposes_evidence_origin_and_explicit_result_link(client):
    _seed_demo(client)
    graph = client.get('/runs/r1/graph').json()
    assert any(e['relation'] == 'derived_from' and e['source'] == 'step:s02_res'
               and e['target'] == 'step:s02_call' for e in graph['edges'])
    assert any(e['relation'] == 'contains' and e['source'] == 'step:s02_res'
               and e['target'] == 'evidence:s02_res:repo' for e in graph['edges'])
    supported = [n for n in graph['nodes'] if n['kind'] == 'claim']
    assert any(n['status'] == 'supported' for n in supported)


def test_negative_evidence_is_context_not_support(client):
    _seed_demo(client)
    post(client, ev('s04', 'tool_call', 'missing function', parent='s03',
                   tool={'name': 'call_function', 'args': {'symbol': 'missing_helper'}},
                   call_id='missing_call'))
    graph = client.get('/runs/r1/graph').json()
    assert any(e['source'] == 'step:s04' and e['target'] == 'evidence:s02_res:repo'
               and e['relation'] == 'checked_against' for e in graph['edges'])
    claims = [n for n in graph['nodes'] if n.get('step_id') == 's04' and n['kind'] == 'claim']
    assert claims and all(n['status'] == 'unsupported' for n in claims)
    ids = {n['id'] for n in claims}
    assert not any(e['source'] in ids and e['relation'] == 'supported_by' for e in graph['edges'])
