# 90-second demo script

Goal: show a recorded agent run streaming in, five planted failures flagged
live, and each finding inspectable with evidence.

## Before you start (one-time)

```bash
cd detector && uv sync && uv run uvicorn api.main:app --host 127.0.0.1 --port 8000   # Session A
cd web && npm install && npm run dev -- --host 127.0.0.1 --port 5173                  # Session B
```

Open `http://localhost:5173/?run_id=demo_001`. Header should show
"connecting…" then "live" once the stream opens; note the
"backend semantic:" indicator (laya / fallback / unavailable).

## Walkthrough (~90s)

1. **(0:00) Narrate:** "A coding agent was recorded fixing a cache-expiry bug.
   We replay that recording through the detector — nothing is executed —
   and watch findings land in real time."
2. **(0:10) Replay:**
   ```bash
   cd agent && uv sync && uv run python replay.py runs/demo.jsonl \
     --target http://localhost:8000 --run-id demo_001 --delay-ms 350
   ```
   The console prints each step's verdict as the dashboard timeline fills in.
3. **(0:25) Timeline:** rows stream in with OK/WARN/BLOCK levels, finding
   counts, per-step latency, and verifier mode. Metrics bar updates (step
   count, level totals, P50/P95).
4. **(0:40) Inspect failures — click each flagged row:**
   - **s08** `package_missing` — install of a package the recorded registry
     snapshot said doesn't exist; click the evidence reference to jump to the
     s07 lookup result (`exists:false`).
   - **s12** `symbol_missing` — `repair_cache_magic` isn't in the repo
     snapshot's symbol list (s03); contrast with clean `repair_cache` at s14.
   - **s16** `claim_without_action` — "All tests pass" with no successful
     test run before it; the real passing run at s18 does not retroactively
     justify it, and s19's identical claim is clean.
   - **s21** `unsupported_claim` — the "automatic retry with exponential
     backoff" summary vs. a diff that only lowers the TTL. Show the semantic
     badge. If it reads **unavailable — unverified**, say so honestly.
   - **s22** `arg_provenance` — PR references issue **4821**; user authorized
     **417**. The exact `4821` span is highlighted in the args.
5. **(1:05) Graph:** step → claim → evidence columns; `supported_by` edges
   only where evidence exists — the unsupported claim has none. Parent edges
   are order, not contamination.
6. **(1:15) Robustness beat (optional):** refresh the page — the run reloads
   from persisted steps; re-run the replay with a **new** run ID
   (`--run-id demo_002`) for a second clean pass. Re-POSTing the same event
   returns the original verdict without duplicate records.
7. **(1:25) Close:** "Five planted failures, each with rule, span, evidence —
   or an explicit reason evidence is missing. Semantic status is shown, not
   assumed."

## Honesty checklist for screenshots/video

- Record which semantic mode was active (laya / fallback / unavailable).
- If unavailable: four deterministic detections + s21 shown as unverified —
  do not present it as five detections.
- Label any mock-mode footage as DEV MOCK; never use it as the demo.
