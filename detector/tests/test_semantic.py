"""Semantic path: stubbed adapter for timeout/unknown/error, plus
unsupported_claim flag behaviour. The real Laya adapter is smoke-tested
separately (it needs model weights)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from grounding.base import NullAdapter

from tests.conftest import StubAdapter, ev, post


def _app_with(make_app, adapter, **over):
    return make_app(adapter=adapter, **over)


def test_semantic_supported_no_flag(make_app):
    stub = StubAdapter(results=[{"status": "supported", "confidence": 0.9}])
    with TestClient(_app_with(make_app, stub)) as c:
        r = post(c, ev("s01", "llm",
                       "I updated the cache expiry constant."))
        v = r.json()
        assert v["semantic_status"] == "laya"
        assert v["flags"] == []
        assert v["level"] == "ok"
        assert stub.calls  # the claim was actually sent


def test_semantic_unsupported_flags(make_app):
    stub = StubAdapter(results=[{"status": "unsupported", "confidence": 0.9}])
    with TestClient(_app_with(make_app, stub)) as c:
        r = post(c, ev(
            "s01", "llm",
            "Added automatic retry with exponential backoff."))
        v = r.json()
        assert v["semantic_status"] == "laya"
        assert v["level"] == "warn"  # semantic findings cap at warn
        f = v["flags"][0]
        assert f["rule"] == "unsupported_claim"
        assert f["span"] == "Added automatic retry with exponential backoff."


def test_semantic_low_confidence_no_flag(make_app):
    stub = StubAdapter(results=[{"status": "unsupported", "confidence": 0.5}])
    with TestClient(_app_with(make_app, stub)) as c:
        v = post(c, ev("s01", "llm", "I updated the cache expiry.")).json()
        assert v["semantic_status"] == "laya"
        assert v["flags"] == []
        assert v["level"] == "ok"


def test_semantic_timeout_is_unavailable(make_app):
    stub = StubAdapter(delay=0.5)
    with TestClient(_app_with(make_app, stub,
                              semantic_timeout_ms=50)) as c:
        v = post(c, ev("s01", "llm", "I updated the cache expiry.")).json()
        assert v["semantic_status"] == "unavailable"
        assert v["flags"] == []
        assert v["level"] == "ok"


def test_semantic_error_is_unavailable(make_app):
    def boom(claims, text):
        raise RuntimeError("model exploded")
    stub = StubAdapter(results=boom)
    with TestClient(_app_with(make_app, stub)) as c:
        v = post(c, ev("s01", "llm", "I updated the cache expiry.")).json()
        assert v["semantic_status"] == "unavailable"
        assert v["flags"] == []


def test_no_claims_is_not_applicable(make_app):
    stub = StubAdapter()
    with TestClient(_app_with(make_app, stub)) as c:
        v = post(c, ev(
            "s01", "tool_call", "install",
            tool={"name": "install_package",
                  "args": {"name": "x"}},
            call_id="c1")).json()
        assert v["semantic_status"] == "not_applicable"
        assert stub.calls == []


def test_unavailable_adapter_status(make_app):
    with TestClient(_app_with(make_app, NullAdapter())) as c:
        assert c.get("/health").json()["semantic_status"] == "unavailable"
        v = post(c, ev("s01", "llm", "I updated the cache expiry.")).json()
        assert v["semantic_status"] == "unavailable"
        assert v["flags"] == []


def test_fallback_status_reflected(make_app):
    stub = StubAdapter(status="fallback",
                       results=[{"status": "supported", "confidence": 0.9}])
    with TestClient(_app_with(make_app, stub)) as c:
        assert c.get("/health").json()["semantic_status"] == "fallback"
        v = post(c, ev("s01", "llm", "I updated the cache expiry.")).json()
        assert v["semantic_status"] == "fallback"
