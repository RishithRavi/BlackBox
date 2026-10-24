"""Deterministic claim extraction and evidence text building.

Claims come from agent-authored text (llm/final content, create_pr
title/body). Sentences that assert a passing test state are excluded — the
claim_without_action rule owns those deterministically. Sentences whose only
assertion is an issue reference ("Fixes issue 417") are skipped so issue
linkage stays an arg_provenance concern, not a semantic one.
"""

from __future__ import annotations

import re
from typing import Any

from core.state import RunIndex
from rules.evidence_checks import TESTS_PASS_RE

# Accomplishment/assertion verbs that make a sentence a checkable claim.
ASSERT_RE = re.compile(
    r"\b(add(?:ed|s)?|implement(?:ed|s)?|introduc(?:ed|es)|creat(?:ed|es)"
    r"|updat(?:ed|es)|chang(?:ed|es)|remov(?:ed|es)|refactor(?:ed|s)?"
    r"|improv(?:ed|es)|fix(?:ed|es)?|resolv(?:ed|es)|retr(?:y|ies)"
    r"|backoff|deprecat(?:ed|es)|migrat(?:ed|es)|enabl(?:ed|es)"
    r"|disabl(?:ed|es)|replac(?:ed|es)|writ(?:es|ten)|built)\b",
    re.IGNORECASE,
)

# Pure issue-reference sentences are provenance, not semantic claims.
ISSUE_REF_RE = re.compile(
    r"\b(?:fix(?:es|ed)?|resolv(?:es|ed)|clos(?:es|ed))\s+issue\s*#?\d+\b",
    re.IGNORECASE,
)

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?\n])\s+|\n+")

MAX_CLAIMS = 4
MAX_CLAIM_CHARS = 500
# The default checkpoint (convaiinnovations/laya) has a 512-token context;
# the evidence document must share it with the question head. Keep it tight
# and put the diff first so any tail truncation drops lower-value context.
MAX_EVIDENCE_CHARS = 1400


def _candidate_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]


def extract_semantic_claims(event: dict[str, Any]) -> list[dict[str, str]]:
    """Extract checkable assertions from agent-authored text.

    Returns [{"text": ..., "field_path": ...}] — field_path is the JSON
    Pointer into the event where the claim text lives.
    """
    sources: list[tuple[str, str]] = []  # (text, field_path)
    if event["type"] in {"llm", "final"}:
        sources.append((event["content"], "/content"))
    elif (
        event["type"] == "tool_call"
        and event["tool"]["name"] == "create_pr"
    ):
        args = event["tool"].get("args") or {}
        for key in ("title", "body"):
            if isinstance(args.get(key), str):
                sources.append((args[key], f"/tool/args/{key}"))
    else:
        return []

    claims: list[dict[str, str]] = []
    for text, field_path in sources:
        for sent in _candidate_sentences(text):
            if len(claims) >= MAX_CLAIMS:
                return claims
            if TESTS_PASS_RE.search(sent):
                continue  # owned by claim_without_action
            if ISSUE_REF_RE.search(sent) and not ASSERT_RE.search(
                ISSUE_REF_RE.sub("", sent)
            ):
                continue  # owned by arg_provenance
            if ASSERT_RE.search(sent):
                claims.append(
                    {"text": sent[:MAX_CLAIM_CHARS], "field_path": field_path}
                )
    return claims


def build_evidence_text(index: RunIndex) -> str:
    """Bound evidence document for the semantic verifier.

    Uses the run's structured evidence: repo snapshot (diff + symbols),
    registry facts and test outcomes — never agent-authored text.
    """
    parts: list[str] = []
    snap = index.repo_snapshot
    if snap is not None:
        parts.append("REPO DIFF:\n" + snap["diff"])
        parts.append(
            "DECLARED SYMBOLS: " + ", ".join(sorted(snap["symbols"]))
        )
    for name, fact in index.registry.items():
        parts.append(
            f"REGISTRY: package {name} exists={fact['exists']}"
            f" (source={fact['source']})"
        )
    for res in index.test_results:
        parts.append(
            f"TEST RUN: exit_code={res['exit_code']}"
            f" passed={res['passed']} failed={res['failed']}"
        )
    text = "\n\n".join(parts)
    return text[:MAX_EVIDENCE_CHARS]
