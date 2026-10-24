# Black Box detector (Session A)

FastAPI + SQLite + SSE backend that watches a recorded coding-agent run,
flags suspicious tool calls and unsupported claims as steps arrive, and
makes each finding inspectable through a provenance graph.

## Run

```bash
cd detector
uv sync --python 3.12 --extra laya
SEMANTIC_TIMEOUT_MS=2000 uv run --extra laya uvicorn api.main:app --host 127.0.0.1 --port 8000
```

One Uvicorn worker only — per-run serialization uses process-local locks
and they do not protect multiple workers. SQLite lives in
`detector/.data/blackbox.db` (git-ignored, WAL mode).

## Test

```bash
cd detector
uv run --extra laya pytest
```

## Endpoints

| Route | Purpose |
|---|---|
| `POST /events` | ingest one Event -> synchronous Verdict |
| `GET /health` | `{"status","schema_version","semantic_status"}` |
| `GET /runs/{run_id}/steps` | persisted `StepRecord`s, contiguous `seq` from 1 |
| `GET /runs/{run_id}/stream?after=N` | SSE catch-up + tail, `event: step`, `id: <seq>`, comment heartbeat ~15 s, honors `Last-Event-ID` |
| `GET /runs/{run_id}/graph` | step/claim/evidence nodes, `parent`/`contains`/`supported_by`/`derived_from`/`checked_against` edges |
| `GET /runs/{run_id}/metrics` | step/flag/level counts, nearest-rank P50/P95, semantic-status counts |

The frozen wire contract is `../schema.json` (JSON Schema 2020-12, `$defs`
Event, Finding, Verdict, StepRecord, Graph, Metrics, StreamEnvelope).

## Behavior notes

- **Envelope vs findings.** Schema-invalid envelopes return 422 and are
  never persisted. A valid envelope with an unknown tool or invalid tool
  args persists a `block` verdict (`unknown_tool` / `tool_schema`). A
  `tool_result` whose content fails its structured schema returns 422.
- **Integrity.** `(run_id, step_id)` is the idempotency key — an identical
  retry (compared on key-sorted JSON) returns the stored verdict with no
  second record or SSE message; a changed payload returns 409. Nonexistent
  parents, duplicate call IDs and unmatched results return 409.
- **Evidence prefix.** Every check scores a step against earlier evidence
  only; the step's own allowed evidence is appended after its verdict.
  User input and validated tool results are evidence; agent-authored
  assertions never are. Evidence is never shared across runs.
- **Rules.** `arg_provenance` covers designated external identifiers
  (`create_pr.issue_id`) — not every novel string. `package_missing` /
  `symbol_missing` consult recorded registry facts and the repo symbol
  snapshot; when that context is missing they emit an *inconclusive*
  warning, not a claim of proven hallucination. `claim_without_action`
  checks passing-tests assertions against earlier `run_tests` results.
  `loop` flags 3 identical tool calls (ignoring call IDs).
- **Fusion.** `score` = max finding confidence (0 if none). `block` when a
  finding in {arg_provenance, package_missing, symbol_missing,
  unknown_tool, tool_schema, claim_without_action} has confidence >= 0.8;
  `warn` when any finding exists; else `ok`. `unsupported_claim` and
  `loop` can never reach `block` on their own. `block` is observe-only —
  it is a dashboard finding, not enforcement.
- **SSE.** SQLite is the replay cursor; a version-bump notifier wakes
  readers. Persist-before-publish, so catch-up is gap-free. Slow
  subscribers cannot block ingestion.

## Semantic verification — Laya

Primary verifier is **Laya**:

- package: [`laya`](https://pypi.org/project/laya/) on PyPI, Apache-2.0
- model: [`convaiinnovations/laya`](https://huggingface.co/convaiinnovations/laya)
  on Hugging Face, Apache-2.0, verified revision
  `7b928d828b7b0e022f929d9bd2e44165aa270148`
- interface: `laya.load(model_id, device=…, revision=…)` ->
  `agent.predict(state, questions)` — one non-autoregressive forward pass
  answers all per-claim `noul` questions at once.

Each extracted claim (assertion sentences from `llm`/`final` content and
`create_pr` body — titles are labels, not assertions; max 4) is embedded
in the *state* next to the evidence document, which measured far more
discriminating than claim-in-question prompts, and all per-claim states
run through a single `predict_batch` call. The `noul` score normalizes
to `supported` at p >= 0.70, `unsupported` at p <= 0.35 (confidence 1-p),
and `unknown` in between. An `unsupported` result at confidence >= 0.65
produces an `unsupported_claim` warning. If Laya reports the evidence
document was truncated by its 512-token context, unsupported confidence
is capped at 0.60 — a truncated read never flags.

To enable it:

```bash
cd detector
uv sync --python 3.12 --extra laya    # installs runtime; first server startup downloads weights
LAYA_MODEL_ID=convaiinnovations/laya \
SEMANTIC_TIMEOUT_MS=2000 \
uv run --extra laya uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Keep `--extra laya` on later `uv run` commands so environment synchronization retains the optional verifier. Python 3.12 is pinned in `.python-version`. The root `./demo/run.sh` installs/enables Laya by default, waits for a real `semantic_status:laya`, and chooses available API/web ports. Use `SEMANTIC_ENABLED=0 ./demo/run.sh` only for explicit degraded mode.

### Configuration

| Env | Default | Meaning |
|---|---|---|
| `BLACKBOX_DB_PATH` | `detector/.data/blackbox.db` | SQLite file |
| `LAYA_MODEL_ID` | `convaiinnovations/laya` | HF repo or registry alias (`english`, `multilingual`, `typed-decisions`) |
| `LAYA_REVISION` | `7b928d8…` (pinned) | Hub revision to load |
| `LAYA_DEVICE` | `auto` | torch device hint passed to `laya.load` |
| `SEMANTIC_ENABLED` | `1` | `0` forces `unavailable` |
| `SEMANTIC_TIMEOUT_MS` | `150` | per-step semantic budget |
| `SEMANTIC_WORKERS` | `1` | bounded inference threads |
| `BLACKBOX_HEARTBEAT_S` | `15` | SSE comment heartbeat |
| `BLACKBOX_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | allowed web origins |

Without the `laya` extra the detector runs in explicit degraded mode:
`/health` reports `semantic_status: unavailable`, claim-bearing events get
`semantic_status: unavailable`, and **no** `unsupported_claim` findings
are emitted. On the validated M2 setup, semantic checks took 170–436 ms; use
`SEMANTIC_TIMEOUT_MS=2000` for this local demo rather than the 150ms
aspirational budget. See `../demo/LAYA_VALIDATION.md` for the measured run. Timeouts never mutate a stored verdict: the
blocking inference runs in a bounded thread pool, `asyncio.wait_for`
bounds the wait, and late results are discarded.

## Known limitations

- Single-worker process; no multi-worker deployment or distributed state.
- `recorded_registry_snapshot` evidence reflects the recording, not live
  registry state; fabricated tool-result detection is out of scope.
- Claim extraction is heuristic (verb/sentence patterns), capped at 4
  claims per event; evidence text is bounded to the English checkpoint's
  512-token context (~1400 chars) — set `LAYA_MODEL_ID=multilingual` for a
  larger context if your fixtures need it.
- `derived_from` links a recorded tool result to its exact tool call via
  `tool_call_id`. `contains` links steps to their persisted claims/evidence.
  `checked_against` links a finding to its referenced evidence; it does not
  imply support. Only persisted supported claims get `supported_by` links.
  Claim nodes expose their stored status. Parent order and repeated language
  do not establish causal spread between claims.
- Warm-path latency target is aspirational (<200 ms/step); see metrics
  for the measured P50/P95 on your machine.

## Verified local model run

See `../demo/LAYA_VALIDATION.md` for the measured real-model replay, matched positive/negative controls, runtime versions, and limitations. This is separate from the illustrative `?sample=1` UI.
