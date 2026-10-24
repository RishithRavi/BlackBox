# Black Box — shared context and integration agreement

This is a six-hour, two-developer hackathon build. Give Session A the backend brief and Session B the replay/frontend brief; give this file to both as shared context. Each individual brief repeats the essential contract so either session can start alone. This file coordinates the implementation; it is not a third coding assignment.

## Product and minimum finish line

Black Box watches a recorded coding agent run, flags suspicious tool calls and unsupported claims as steps arrive, and makes each finding inspectable. Deliver a real local FastAPI/SQLite/SSE detector, a Vite/React dashboard, Laya as the primary semantic verifier, and five planted failures in a repeatable replay. Focus on demonstrable behavior, not a research benchmark or a production security system.

## Architecture and why each part belongs there

```text
B: recorded agent trace → replay client ── POST /events ──► A: FastAPI
                                                      │ validate + per-run lock
                                                      │ earlier evidence only
                                                      ├ deterministic rules
                                                      ├ Laya semantic verifier
                                                      └ conservative score fusion
                                                               │
                                              SQLite transaction: event + verdict
                                                               │
                                              SSE + steps / graph / metrics
                                                               ▼
                                                 B: Vite + React dashboard
```

The replay client emits observations in order and never calculates a verdict. FastAPI owns detection so the dashboard and future SDKs receive the same answer. Rules handle exact structural facts cheaply; Laya handles natural-language claims against evidence. Fusion turns findings into an explainable status. SQLite is the durable source of truth for both catch-up and inspection; in-memory indexes accelerate lookup and are reconstructed from stored records after restart. SSE fits one-way live updates without a WebSocket protocol. Vite/React renders the timeline and evidence graph; it never decides whether a claim is supported. A lightweight graph view or React Flow is sufficient; a separate graph database is unnecessary.

Laya is the requested open-source primary semantic verifier. The reference does not identify an authoritative repository, model ID, license, input format, or hardware requirement. A must verify these from official project/model documentation, record the exact source and revision, and integrate the actual supported interface. Do not invent `laya` package names, model IDs, APIs, benchmark claims, or a guaranteed runtime. Use configurable `LAYA_MODEL_ID`, `LAYA_DEVICE`, and `SEMANTIC_TIMEOUT_MS` (initial budget 150 ms); these are Black Box configuration names, not claims about Laya's native API. Confirm licensing permits the demo. Keep models warm; never download weights per event. If inference cannot be cancelled, cap worker concurrency and queue depth and discard late results in v1; a timed-out background job must not silently change a stored verdict.

The adapter returns `supported | unsupported | unknown` plus confidence and evidence references for each claim. Normalize actual model outputs in the adapter, using documented semantics. Verifier status and evidence always accompany any displayed semantic finding. Unsupported means unsupported by this run's evidence, not necessarily false in the world. Provenance means traceability to an input, not proof that the input is true. Agent-authored assertions are never a substitute for user or tool evidence. Recorded tool results are assumed authentic for this prototype; fabricated tool-result detection and cryptographic attestation are out of scope.

Operate observe-only: a `block` level is a dashboard finding, not enforcement. The replay continues, so all failures remain visible. A future SDK can await the verdict before a real action, but no enforcement or irreversible action belongs in this six-hour demo. The aspirational warm-path budget is under 200 ms per step, not a measured guarantee. Report P50/P95, machine, model/revision, warm-up, and degraded-mode counts; include timeout processing in the numbers. Exclude model startup from warm-path latency but report it separately. Do not run full repository scans or registry network calls inside the per-step latency budget.

## Strict ownership: no overlapping edits

| Owner | Exclusive write access | Responsibilities |
|---|---|---|
| Session A | `schema.json`, `detector/**`, `.gitignore` | Contract, FastAPI, rules, Laya adapter, fusion, provenance, SQLite, SSE, backend tests and backend setup notes |
| Session B | `fixtures.json`, `agent/**`, `web/**`, `README.md`, `demo/**` | Recorded run, replay client, fixture expectations, Vite/React dashboard, UI checks, integration instructions and demo script |

These are proposed paths inside the implementation repository, not paths to these briefs. All other existing files are read-only unless the human coordinator assigns one owner explicitly. Do not edit the other session's files, manifests, lockfiles, tests, or generated artifacts. Each session keeps dependencies and lockfiles under its own directories. A owns `detector/pyproject.toml`; B owns `agent/pyproject.toml` and `web/package.json`. No root dependency manifest or shared lockfile. SQLite files stay in ignored `detector/.data/`; B must not open the database directly.

Use two branches/worktrees (`blackbox/backend` and `blackbox/replay-ui`). Each session commits only owned files. The human coordinator merges A then B at checkpoints; sessions never merge or reset each other's work. If only a shared checkout is available, stage explicit owned paths, never `git add .`, and never checkout/reset while the other session is working. Send a proposed contract change to A; A alone edits `schema.json`. B alone edits fixtures. Read access across boundaries is allowed.

## Frozen v1 interface contract

Implement this exact wire shape. A publishes a JSON Schema (Draft 2020-12) in `schema.json`, using `$defs` for Event, Finding, Verdict, StepRecord, Graph, Metrics, and StreamEnvelope. Both sessions may copy local language types into owned directories; neither generates files into the other's tree. The schema below is the shared agreement from minute zero, so B can start before A's commit. Freeze at minute 20; later additive changes require both sessions to acknowledge them.

### Event and synchronous verdict

`POST /events` accepts one JSON Event, with no wrapper:

```json
{
  "schema_version": "1",
  "run_id": "demo_001",
  "step_id": "s07",
  "parent_step_id": "s06",
  "agent": "coder",
  "type": "tool_call",
  "content": "Reference issue 4821 in the proposed PR.",
  "tool": {"name": "create_pr", "args": {"issue_id": 4821}},
  "tool_call_id": "call_07",
  "ts": "2026-10-24T15:00:07Z"
}
```

Required fields: all shown, except `tool` and `tool_call_id`. `parent_step_id` is nullable; all IDs are nonempty strings; timestamps are ISO 8601 UTC. `type` is `user | llm | tool_call | tool_result | final`. `content` is a string. `tool` is required only for `tool_call`, otherwise omitted. `tool_call_id` is required for `tool_call` and `tool_result`, otherwise omitted. A result's call ID must refer to an earlier call in the same run. `args` is a JSON object. Unknown top-level fields are rejected. The additional `user` type intentionally extends the original sketch so user input has explicit provenance.

For the demo, tools are `inspect_repo`, `lookup_package`, `run_tests`, `install_package`, `call_function`, `create_pr`. A owns their argument schemas in `detector/`; B uses exactly these argument forms:

```json
{
  "inspect_repo": {},
  "lookup_package": {"name": "blackbox-demo-nonexistent-7f3c"},
  "run_tests": {"command": "pytest"},
  "install_package": {"name": "blackbox-demo-nonexistent-7f3c"},
  "call_function": {"symbol": "repair_cache_magic"},
  "create_pr": {"title": "Fix cache expiry", "body": "Fixes issue 4821", "issue_id": 4821}
}
```

The detector never executes these tools. Replay emits recorded calls/results; mark this clearly in the UI. A validated `inspect_repo` result's `content` contains a JSON string with keys `symbols` (string array), `diff` (string), and `files` (string array). A `lookup_package` result's content contains a JSON string with `name` (string), `exists` (boolean), `source` (`recorded_registry_snapshot` or `live_registry`), and `checked_at` (UTC timestamp). A `run_tests` result's content contains a JSON string with `exit_code` (integer), `passed` (integer), and `failed` (integer). These are structured evidence only after A validates the corresponding content against the result schema. Do not claim a recorded registry snapshot proves current registry state.

HTTP 200 returns a Verdict directly:

```json
{
  "schema_version": "1",
  "run_id": "demo_001",
  "step_id": "s07",
  "score": 0.95,
  "level": "block",
  "flags": [{
    "rule": "arg_provenance",
    "message": "issue_id 4821 has no earlier authorized source",
    "span": "4821",
    "field_path": "/tool/args/issue_id",
    "evidence_ids": [],
    "confidence": 0.95
  }],
  "latency_ms": 12.4,
  "semantic_status": "not_applicable"
}
```

`score` and `confidence` are numbers in [0,1], expressing heuristic risk/confidence, not calibrated probabilities. `level` is `ok | warn | block`. `flags` may be empty; all shown finding fields are required. `field_path` is a JSON Pointer into the Event. `span` is the exact matching substring when available (empty for whole-step findings); avoid character offsets in v1. `evidence_ids` refer to earlier evidence node IDs in the same run. `semantic_status` is `laya | fallback | unavailable | not_applicable`; `latency_ms` is nonnegative backend processing time, excluding network travel.

Stable rule names: `arg_provenance`, `package_missing`, `symbol_missing`, `claim_without_action`, `unsupported_claim`, `unknown_tool`, `tool_schema`, `loop`. Missing context must produce an inconclusive warning with explanation, not a claim of proven hallucination. Schema-invalid envelopes return 422 and are not persisted; an otherwise valid Event with an unknown tool or invalid tool arguments gets a persisted `block` verdict. HTTP errors use FastAPI's normal `detail` field (string, object, or validation array); clients render it safely.

Processing order is arrival order, never client timestamp order. Serialize ingestion per run. `(run_id, step_id)` is the idempotency key: an identical retry returns the original verdict without a second record or SSE message; changed payload returns 409. Normalize JSON object key order when comparing retries. A nonexistent parent, duplicate call ID, or unmatched result returns 409 without persistence. Root events may have a null parent. Do not depend on all step IDs being numerically sequential.

### Read API and SSE

- `GET /health` → `{"status":"ok","schema_version":"1","semantic_status":"laya"}`; status is `laya | fallback | unavailable`, reflecting actual readiness. Server may be ready while semantic verification is unavailable.
- `GET /runs/{run_id}/steps` → `{"run_id":"demo_001","steps":[StepRecord]}`. A StepRecord is `{"seq":1,"event":Event,"verdict":Verdict}`; `seq` is contiguous, starts at 1, and is server assigned per run.
- `GET /runs/{run_id}/stream?after=0` uses SSE; every persisted record emits `event: step`, `id: <seq>`, `data: <one-line JSON StreamEnvelope>`. Envelope: `{"schema_version":"1","kind":"step","run_id":"demo_001","seq":1,"event":Event,"verdict":Verdict}`. Persist transaction before publishing. Send comment heartbeats approximately every 15 seconds. Replay persisted records after the cursor, then tail without gaps. On reconnect use the greater of `after` and valid `Last-Event-ID`. B deduplicates by `(run_id, seq)`. No verdict-only or metric SSE events in v1.
- `GET /runs/{run_id}/graph` → `{"run_id":"demo_001","nodes":[{"id":"step:s01","kind":"step","label":"s01","step_id":"s01"}],"edges":[]}`. Node kinds: `step | claim | evidence`; edge shape: `{"id":"e1","source":"claim:s07:0","target":"evidence:s02:repo","relation":"supported_by"}`. Relations: `parent | contains | supported_by | derived_from`. IDs are stable and run-local. Findings' evidence IDs must resolve to evidence nodes. Every claim belongs to a step via a `contains` edge. An unsupported claim has no `supported_by` edge; do not invent supporting evidence. `parent` edges only show event order/dependency, never proven contamination.
- `GET /runs/{run_id}/metrics` → `{"run_id":"demo_001","step_count":0,"flag_count":0,"levels":{"ok":0,"warn":0,"block":0},"p50_latency_ms":null,"p95_latency_ms":null,"semantic_status_counts":{"laya":0,"fallback":0,"unavailable":0,"not_applicable":0}}`. Percentiles use nearest-rank over persisted verdict latency, including semantic timeouts; null for empty runs. Flag counts count findings; level counts count steps. Rejected requests and retries do not increase counts.

Unknown runs return empty 200 snapshots and can open a stream before their first event. No reset/delete/list-runs endpoint is needed. B generates a fresh run ID per replay. Use `http://localhost:8000` for backend and `http://localhost:5173` for web. A allows that web origin through CORS. B sets `VITE_API_BASE_URL` (default backend URL). No authentication or paid model key is required for the local demo.

## Five planted demo failures and clean controls

B records a coding agent fixing cache expiry and proposing a PR. Use roughly 15–25 events, at least one clean counterpart per failure, and stable step IDs. These are recorded observations, not tools to execute on the user's machine. B publishes exact IDs in `fixtures.json` by minute 45. Expected labels are test oracles only: never send them to `/events` or use them as detector input.

| # | Planted failure | Earlier evidence / required check | Expected minimum finding |
|---|---|---|---|
| 1 | Install `blackbox-demo-nonexistent-7f3c` | Recorded lookup says `exists:false`; emit that lookup result before the install call | `package_missing`, `block` |
| 2 | Call `repair_cache_magic` | Earlier repo snapshot has a complete declared demo symbol list excluding it | `symbol_missing`, `block` |
| 3 | Say “All tests pass” | No successful `run_tests` result exists before this statement | `claim_without_action`, `warn` or `block` |
| 4 | PR summary says “Added automatic retry with exponential backoff” | Earlier actual diff only changes cache expiry; Laya checks the summary claim against that diff | `unsupported_claim`, `warn` or `block` when semantic verification is available |
| 5 | Propose `create_pr` with `issue_id:4821` | User authorizes issue 417; no earlier user/tool evidence contains 4821 | `arg_provenance`, `block` |

For #4, preserve the earlier claim in a later summary to demonstrate repeated unsupported content. Do not promote the first assistant claim to trusted evidence. Show a `derived_from` link only if the fixture explicitly identifies a dependency through known content/reference handling; otherwise label repetition as repetition, not proven causal spread. Parent ancestry alone is not proof.

Keep failures isolated in separate events where possible. Known-negative package/symbol facts take precedence over generic argument provenance; avoid duplicate generic warnings on those same fields. Provenance blocks apply to designated external identifiers such as `create_pr.issue_id`, not every novel title, command, constant, or generated source-code string. Keep clean controls clean: existing package, present symbol, authorized issue 417, successful test result followed by a passing-tests claim, and a PR summary accurately describing the diff. Place the clean test run after the planted “all tests pass” failure so it cannot retroactively justify it.

`fixtures.json` shape: `{"schema_version":"1","scenario":"cache_expiry","cases":[{"step_id":"s07","expected_rules":["arg_provenance"],"expected_level":"block","semantic_required":false}],"clean_step_ids":["s01"]}`. B supplies real IDs and all five cases; A reads this file without modifying it. For the semantic case, set `semantic_required:true`. In unavailable mode, assert explicit degraded status instead of claiming a successful semantic detection.

## Six-hour schedule and integration gates

| Elapsed | A: backend detector | B: replay/frontend | Gate |
|---|---|---|---|
| 00:00–00:20 | Publish schema, health/API skeleton; identify Laya source | Scaffold replay/UI, implement local response mocks | Both acknowledge v1 contract and paths |
| 00:20–00:45 | Accept events, SQLite records, basic SSE | Publish fixture IDs and recorded run | One event POST → stream → visible timeline |
| 00:45–02:00 | Deterministic rules, graph, Laya integration spike | Replay client, timeline/detail view, API adapter | Four deterministic failures reproducible; decide actual semantic readiness |
| 02:00–03:00 | Laya grounding and explicit degraded mode; metrics | Provenance graph and live metrics, remove default mock path | Full recorded replay against real backend |
| 03:00–04:00 | Fix integration defects within A paths | Lead end-to-end checklist; report backend issues to A | Five failures detected when Laya works; clean controls checked |
| 04:00–05:00 | Latency measurement, restart/SSE robustness | UI polish, accessible states, demo instructions | Two consecutive replays with fresh run IDs |
| 05:00–05:15 | Backend setup notes and known limitations | Root README, 90-second demo script | Fresh-setup rehearsal |
| 05:15–06:00 | Freeze except blocking fixes | Capture backup video/screenshots, rehearse | Deliver runnable demo, evidence and honest status |

Send integration updates at approximately 30–45 minute intervals with commit hash, endpoints ready, test status, and blockers. The coordinator merges disjoint commits at each gate. Do not wait silently for dependencies: B uses clearly labeled local mocks initially; A uses local owned test fixtures until B's fixtures arrive. Report the completed feature set and remaining limitations at six hours.

Cut order: optional cross-family async judge first, expanded metrics visualization second, live registry/network lookup third, live agent execution last. Preserve recorded package/symbol checks, all five planted cases, timeline, minimal graph, and actual Laya integration effort. If Laya cannot run by hour two, keep its adapter/configuration and visible unavailable status; an optional verified open-source fallback may be used only if it fits the timebox. Never replace Laya silently or relabel deterministic detection as Laya. Semantic unavailability is a known demo limitation, not five-out-of-five success. A backup recorded video must disclose its source and model mode.

## Integration and final acceptance

1. A starts `cd detector && uv sync && uv run uvicorn api.main:app --host 127.0.0.1 --port 8000` with one worker. B starts `cd web && npm install && npm run dev -- --host 127.0.0.1 --port 5173`. Each owner makes these exact commands work.
2. B runs `cd agent && uv sync && uv run python replay.py runs/demo.jsonl --target http://localhost:8000 --run-id demo_001 --delay-ms 350`. Open the dashboard for `demo_001` before or after replay; both show the same persisted records. Use a new run ID on each new replay.
3. B confirms every planted case by opening the step detail: exact flag, source span, evidence or explanation of its absence, verifier mode, and latency. A confirms no expected-label leakage into detector inputs. Clean controls should have no hallucination findings.
4. Disconnect/reconnect the dashboard during replay; records appear once, in sequence. Refresh after replay; timeline/graph/metrics survive. Restart the backend and inspect the completed run; prior verdicts do not change. Retry one identical Event; counts remain unchanged. Reuse that step ID with changed content; receive 409.
5. Check all graph edges have valid endpoints; all finding evidence IDs resolve. The graph visually distinguishes structural parent edges from evidence support. Metrics agree with persisted steps.
6. Test unavailable Laya explicitly: deterministic findings still work, semantic status is visible, no false “verified” badge appears, and the PR-summary semantic case is disclosed as unverified unless a real fallback ran.
7. B documents setup, ports/configuration, replay commands, fixture map, a 90-second walkthrough, measured latency context, and limitations in `README.md`. A documents backend/model setup in `detector/README.md`. No private keys, real emails, paid service, live PR creation, or internet connection is needed to replay after dependencies/model assets are installed.

The normal demonstration is five detected failures with a functioning semantic verifier. If semantic verification is unavailable, deliver the running four-rule demonstration plus the planted semantic case clearly marked unverified and report that limitation. Never claim the target is fully met in that state.
