"""Ingestion semantics: idempotency, referential integrity, persistence."""

from __future__ import annotations

import json

from tests.conftest import ev, post, seed_pair


def test_identical_retry_returns_same_verdict(client):
    e = ev("s01", "llm", "hello")
    v1 = post(client, e).json()
    v2 = post(client, e).json()
    assert v1 == v2
    assert len(client.get("/runs/r1/steps").json()["steps"]) == 1


def test_changed_payload_conflicts(client):
    post(client, ev("s01", "llm", "hello"))
    r = post(client, ev("s01", "llm", "different"))
    assert r.status_code == 409


def test_nonexistent_parent_conflicts(client):
    r = post(client, ev("s01", "llm", "x", parent="ghost"))
    assert r.status_code == 409


def test_null_parent_is_root(client):
    assert post(client, ev("s01", "user", "fix issue 417")).status_code == 200


def test_duplicate_call_id_conflicts(client):
    seed_pair(client, "r1", "s01", "run_tests",
              {"command": "pytest"}, '{"exit_code":0,"passed":1,"failed":0}')
    r = post(client, ev(
        "s03", "tool_call", "again",
        tool={"name": "run_tests", "args": {"command": "pytest"}},
        call_id="s01_id"))
    assert r.status_code == 409


def test_unmatched_result_conflicts(client):
    r = post(client, ev("s01", "tool_result", "{}", call_id="ghost"))
    assert r.status_code == 409


def test_invalid_structured_result_rejected(client):
    r = post(client, ev(
        "s01", "tool_call", "lookup",
        tool={"name": "lookup_package", "args": {"name": "foo"}},
        call_id="c1"))
    assert r.status_code == 200
    for bad in ("not json", "{}", json.dumps({"name": "foo", "exists": "yes",
                                             "source": "recorded_registry_snapshot",
                                             "checked_at": "2026-10-24T15:00:00Z"})):
        rr = post(client, ev("s02", "tool_result", bad, call_id="c1"))
        assert rr.status_code == 422, rr.text
    assert len(client.get("/runs/r1/steps").json()["steps"]) == 1


def test_unknown_tool_persists_block(client):
    r = post(client, ev(
        "s01", "tool_call", "x",
        tool={"name": "hack_everything", "args": {}}, call_id="c1"))
    assert r.status_code == 200
    v = r.json()
    assert v["level"] == "block"
    assert v["flags"][0]["rule"] == "unknown_tool"
    assert len(client.get("/runs/r1/steps").json()["steps"]) == 1


def test_bad_tool_args_persist_block(client):
    r = post(client, ev(
        "s01", "tool_call", "x",
        tool={"name": "install_package", "args": {"pkg": 3}}, call_id="c1"))
    assert r.status_code == 200
    v = r.json()
    assert v["level"] == "block"
    assert v["flags"][0]["rule"] == "tool_schema"


def test_cross_run_evidence_never_shared(client):
    # run a1 authorizes 417 via user input
    assert post(client, ev(
        "s01", "user", "please fix issue 417", run_id="a1"
    )).status_code == 200
    # run b1 must not see that evidence
    r = post(client, ev(
        "s01", "tool_call", "pr", run_id="b1",
        tool={"name": "create_pr",
              "args": {"title": "t", "body": "b", "issue_id": 417}},
        call_id="c1"))
    assert r.status_code == 200
    assert r.json()["level"] == "block"
    assert r.json()["flags"][0]["rule"] == "arg_provenance"
