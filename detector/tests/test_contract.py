"""Envelope validation: schema-invalid input -> 422, never persisted."""

from __future__ import annotations

from tests.conftest import ev, post


def test_valid_event_accepted(client):
    r = post(client, ev("s01", "llm", "hello"))
    assert r.status_code == 200
    v = r.json()
    assert v["level"] == "ok"
    assert v["flags"] == []
    assert v["semantic_status"] in {
        "laya", "fallback", "unavailable", "not_applicable"}


def test_unknown_top_level_field_rejected(client):
    e = ev("s01")
    e["bogus"] = 1
    assert post(client, e).status_code == 422


def test_missing_required_field_rejected(client):
    e = ev("s01")
    del e["step_id"]
    assert post(client, e).status_code == 422


def test_parent_step_id_required_but_nullable(client):
    e = ev("s01")
    del e["parent_step_id"]
    assert post(client, e).status_code == 422


def test_bad_schema_version_rejected(client):
    e = ev("s01")
    e["schema_version"] = "2"
    assert post(client, e).status_code == 422


def test_empty_id_rejected(client):
    e = ev("")
    assert post(client, e).status_code == 422


def test_tool_only_on_tool_call(client):
    assert post(client, ev(
        "s01", "llm", "x", tool={"name": "run_tests",
                                 "args": {"command": "pytest"}},
    )).status_code == 422


def test_tool_call_requires_tool_and_call_id(client):
    assert post(client, ev(
        "s01", "tool_call", "x", call_id="c1",
    )).status_code == 422
    assert post(client, ev(
        "s01", "tool_call", "x",
        tool={"name": "run_tests", "args": {"command": "pytest"}},
    )).status_code == 422


def test_tool_result_requires_call_id(client):
    assert post(client, ev(
        "s01", "tool_result", "x",
    )).status_code == 422


def test_tool_call_id_forbidden_on_plain_types(client):
    for t in ("user", "llm", "final"):
        assert post(client, ev(
            f"{t}1", t, "x", call_id="c1",
        )).status_code == 422


def test_bad_timestamps(client):
    for ts in ("not a date", "2026-10-24 15:00:00",
               "2026-10-24T15:00:00", "2026-10-24T15:00:00+02:00"):
        assert post(client, ev("s01", ts=ts)).status_code == 422


def test_invalid_events_not_persisted(client):
    for bad in (
        {"schema_version": "1"},
        dict(ev("x1"), type="bogus"),
        dict(ev("x2"), run_id=""),
    ):
        assert post(client, bad).status_code == 422
    r = client.get("/runs/r1/steps")
    assert r.status_code == 200
    assert r.json()["steps"] == []
