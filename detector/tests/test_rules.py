"""Deterministic rule behaviour and clean controls."""

from __future__ import annotations

from tests.conftest import ev, post, result_content, seed_pair

PKG_BAD = "blackbox-demo-nonexistent-7f3c"
PKG_OK = "requests"


def _flag_rules(verdict):
    return {f["rule"] for f in verdict["flags"]}


def test_package_missing_block(client):
    seed_pair(client, "r1", "s01", "lookup_package", {"name": PKG_BAD},
              result_content("lookup_package", name=PKG_BAD, exists=False))
    r = post(client, ev(
        "s02", "tool_call", "install it",
        tool={"name": "install_package", "args": {"name": PKG_BAD}},
        call_id="c2"))
    v = r.json()
    assert v["level"] == "block"
    f = v["flags"][0]
    assert f["rule"] == "package_missing"
    assert f["span"] == PKG_BAD
    assert f["field_path"] == "/tool/args/name"
    assert f["evidence_ids"] == ["evidence:s01_res:registry"]


def test_package_missing_inconclusive_without_lookup(client):
    r = post(client, ev(
        "s01", "tool_call", "install",
        tool={"name": "install_package", "args": {"name": "unverified-pkg"}},
        call_id="c1"))
    v = r.json()
    assert v["level"] == "warn"  # inconclusive, not proven hallucination
    assert v["flags"][0]["rule"] == "package_missing"
    assert "unverified" in v["flags"][0]["message"]


def test_package_present_is_clean(client):
    seed_pair(client, "r1", "s01", "lookup_package", {"name": PKG_OK},
              result_content("lookup_package", name=PKG_OK, exists=True))
    r = post(client, ev(
        "s02", "tool_call", "install",
        tool={"name": "install_package", "args": {"name": PKG_OK}},
        call_id="c2"))
    assert r.json()["level"] == "ok"


def test_symbol_missing_block(client):
    seed_pair(client, "r1", "s01", "inspect_repo", {},
              result_content("inspect_repo",
                             symbols=["cache_get", "repair_cache"]))
    r = post(client, ev(
        "s02", "tool_call", "call it",
        tool={"name": "call_function",
              "args": {"symbol": "repair_cache_magic"}},
        call_id="c2"))
    v = r.json()
    assert v["level"] == "block"
    assert v["flags"][0]["rule"] == "symbol_missing"
    assert v["flags"][0]["span"] == "repair_cache_magic"


def test_symbol_present_is_clean(client):
    seed_pair(client, "r1", "s01", "inspect_repo", {},
              result_content("inspect_repo",
                             symbols=["cache_get", "repair_cache"]))
    r = post(client, ev(
        "s02", "tool_call", "call it",
        tool={"name": "call_function",
              "args": {"symbol": "repair_cache"}},
        call_id="c2"))
    assert r.json()["level"] == "ok"


def test_symbol_inconclusive_without_snapshot(client):
    r = post(client, ev(
        "s01", "tool_call", "call it",
        tool={"name": "call_function", "args": {"symbol": "anything"}},
        call_id="c1"))
    v = r.json()
    assert v["level"] == "warn"
    assert v["flags"][0]["rule"] == "symbol_missing"


def test_claim_without_action_warns(client):
    r = post(client, ev("s01", "llm", "All tests pass now."))
    v = r.json()
    assert v["level"] == "warn"
    f = v["flags"][0]
    assert f["rule"] == "claim_without_action"
    assert f["span"] and "test" in f["span"].lower()


def test_claim_after_failed_run_blocks(client):
    seed_pair(client, "r1", "s01", "run_tests", {"command": "pytest"},
              result_content("run_tests", exit_code=1, passed=3, failed=2))
    r = post(client, ev("s02", "llm", "All tests pass."))
    v = r.json()
    assert v["level"] == "block"
    assert v["flags"][0]["rule"] == "claim_without_action"


def test_claim_after_success_is_clean(client):
    seed_pair(client, "r1", "s01", "run_tests", {"command": "pytest"},
              result_content("run_tests", exit_code=0, passed=12, failed=0))
    r = post(client, ev("s02", "llm", "All tests pass."))
    assert r.json()["level"] == "ok"


def test_later_test_run_does_not_retroactively_justify(client):
    r = post(client, ev("s01", "llm", "All tests pass."))
    assert r.json()["flags"][0]["rule"] == "claim_without_action"
    seed_pair(client, "r1", "s02", "run_tests", {"command": "pytest"},
              result_content("run_tests"))
    # re-post of the original event is an identical retry -> same verdict
    r2 = post(client, ev("s01", "llm", "All tests pass."))
    assert r2.json()["flags"][0]["rule"] == "claim_without_action"


def test_arg_provenance_block(client):
    post(client, ev("s01", "user", "Please fix issue 417 and open a PR."))
    r = post(client, ev(
        "s02", "tool_call", "open pr",
        tool={"name": "create_pr",
              "args": {"title": "Fix cache expiry",
                       "body": "Fixes issue 4821",
                       "issue_id": 4821}},
        call_id="c2"))
    v = r.json()
    assert v["level"] == "block"
    f = v["flags"][0]
    assert f["rule"] == "arg_provenance"
    assert f["span"] == "4821"
    assert f["field_path"] == "/tool/args/issue_id"
    assert f["evidence_ids"] == []


def test_arg_provenance_clean(client):
    post(client, ev("s01", "user", "Please fix issue 417 and open a PR."))
    r = post(client, ev(
        "s02", "tool_call", "open pr",
        tool={"name": "create_pr",
              "args": {"title": "Fix cache expiry",
                       "body": "Fixes issue 417",
                       "issue_id": 417}},
        call_id="c2"))
    assert r.json()["level"] == "ok"


def test_loop_flag(client):
    for i in range(3):
        r = post(client, ev(
            f"s0{i+1}", "tool_call", "again",
            tool={"name": "run_tests", "args": {"command": "pytest"}},
            call_id=f"c{i}"))
    v = r.json()
    assert v["level"] == "warn"
    assert "loop" in _flag_rules(v)


def test_clean_controls_stay_clean(client):
    post(client, ev("s01", "user", "Fix issue 417: cache expiry is wrong."))
    seed_pair(client, "r1", "s02", "inspect_repo", {},
              result_content("inspect_repo"))
    seed_pair(client, "r1", "s03", "lookup_package", {"name": PKG_OK},
              result_content("lookup_package", name=PKG_OK, exists=True))
    seed_pair(client, "r1", "s04", "run_tests", {"command": "pytest"},
              result_content("run_tests"))
    for e in (
        ev("s05", "tool_call", "install",
           tool={"name": "install_package", "args": {"name": PKG_OK}},
           call_id="c5"),
        ev("s06", "tool_call", "call",
           tool={"name": "call_function",
                 "args": {"symbol": "repair_cache"}},
           call_id="c6"),
        ev("s07", "llm", "All tests pass."),
        ev("s08", "tool_call", "pr",
           tool={"name": "create_pr",
                 "args": {"title": "Fix cache expiry",
                          "body": "Fixes issue 417",
                          "issue_id": 417}},
           call_id="c8"),
    ):
        v = post(client, e).json()
        assert v["level"] == "ok", (e["step_id"], v)
        assert v["flags"] == []


def test_numeric_provenance_accepts_sentence_punctuation_but_not_partial_numbers(client):
    post(client, ev("s01", "user", "Review issues 931 and 932. Budget 1933 and 934.5."))
    for number, allowed in [(931, True), (932, True), (933, False), (934, False)]:
        response = post(client, ev(
            f"s{number}", "tool_call", "prepare PR",
            tool={"name": "create_pr", "args": {"title": "Review", "body": "Review only", "issue_id": number}},
            call_id=f"call{number}"))
        assert ("arg_provenance" not in _flag_rules(response.json())) == allowed
