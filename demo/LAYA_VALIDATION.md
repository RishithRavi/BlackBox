# Real Laya verification — local demo

Validated on October 24, 2026. This run used the actual local model, not the UI's illustrative sample data or a test adapter.

## Runtime

- Apple M2 MacBook Air, 24 GB RAM; Laya device selection `auto`, Apple MPS available.
- Python 3.12.13; Laya 0.4.14; Torch 2.14.1; Transformers 5.20.2.
- Model: `convaiinnovations/laya`; pinned revision `7b928d828b7b0e022f929d9bd2e44165aa270148`.
- `SEMANTIC_ENABLED=1`, `SEMANTIC_TIMEOUT_MS=2000`, one semantic worker.
- FastAPI on port 8100; Vite on port 5174; SQLite at ignored `detector/.data/laya-live.db`.
- `/health` returned `{"status":"ok","schema_version":"1","semantic_status":"laya"}` after loading/warmup.

## Recorded replay

Run `laya_live_001` processed the existing 24-event recording through the actual `/events` endpoint. All five planted failure cases and all 18 clean controls passed the fixture check.

| Step | Detection | Level | Reported risk | Processing time |
|---|---|---|---|---|
| s08 | Missing package | block | 0.9500 | 0.068 ms |
| s12 | Missing repository symbol | block | 0.9000 | 0.036 ms |
| s16 | Tests-pass claim without earlier test result | warn | 0.6000 | 0.078 ms |
| s21 | Unsupported exponential-backoff summary — real Laya | warn | 0.8821 | 302.626 ms |
| s22 | Fabricated issue ID plus unsupported PR-body claim | block | 0.9500 | 222.867 ms |

The PR-body semantic finding at s22 had confidence 0.9235; fusion retained the stronger provenance finding at 0.95. The repeated final claim at s24 also produced a real Laya warning (0.9240, 170.248 ms). Therefore the UI correctly shows six flagged steps and seven findings across five planted failure types.

Run-wide nearest-rank processing latency: P50 **0.057 ms**, P95 **222.867 ms**. Three steps used Laya; zero were unavailable; the other 21 were not applicable. These are backend processing times and exclude network travel, startup and model loading. The under-200-ms goal is not consistently met on this machine.

## Matched semantic controls

Run `laya_controls_001` reused the same earlier repository evidence:

- True claim: “I changed EXPIRY_SECONDS from 3600 to 300.” Laya returned supported; no finding; a `supported_by` graph edge links to the repository evidence. Processing: 204.075 ms.
- False/unsupported claim: “Added automatic retry with exponential backoff for failed cache writes.” Laya returned an unsupported finding with confidence 0.9213. Processing: 436.270 ms.

These controls show that the integration distinguishes a matching change from an unsupported one; they do not establish general accuracy. Scores are heuristic, not calibrated correctness probabilities. The upstream runtime emitted a temperature-clamping warning for a `choice:11+` entry; this adapter uses `noul`, and this validation makes no calibration claim.

## Reproduce

```bash
./demo/run.sh
```

The launcher installs the Laya extra on Python 3.12, waits for model readiness, selects available ports and prints an actual-backend URL plus a replay command with a fresh run ID. Keep `--extra laya` on manual `uv run` commands. Model weights download at startup and stay outside Git.

After running the printed replay command:

```bash
python3 demo/verify_run.py --target http://127.0.0.1:PRINTED_PORT --run-id PRINTED_RUN_ID
```

The verifier reads persisted results and fixture expectations separately; expected labels never enter detector requests. Exit status is nonzero if Laya is unavailable, a required finding is missing, or a clean control fails.

Explicit degraded mode remains available via `SEMANTIC_ENABLED=0 ./demo/run.sh`. Default model-enabled startup exits with an error if Laya fails to load instead of silently presenting degraded mode as a real verifier.

## Evidence

- `validation/laya-live-verdicts.json`: five-case checks, all clean controls, real persisted scores and metrics.
- `validation/laya-controls.json` and `validation/laya-controls-graph.json`: matched controls and evidence link.
- `validation/laya-live-dashboard.png`: actual run, Laya connected, no illustrative label.
- Backend regression suite: 54 passed. The updated launcher was exercised with the actual model, not just syntax-checked.
