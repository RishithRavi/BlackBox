# Hackathon video script — ~75 seconds

Format: screen recording + voiceover. Record in a clean window at
`http://localhost:5173/?run_id=demo_vid`. Say the VO lines; do the SCREEN
actions as they play.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00 | Dashboard open, empty timeline | "Black Box watches a coding agent's run and catches it hallucinating — live." |
| 0:07 | Terminal: run `replay.py --run-id demo_vid --delay-ms 350` | "We replay a recorded trace — an agent fixing a cache bug — through a real FastAPI detector. Nothing is executed." |
| 0:15 | Timeline filling in; point at red rows | "Every step gets a verdict. Watch it catch four failures it was never told about." |
| 0:25 | Click **s08** | "It installs a package the recorded registry said doesn't exist — `package_missing`, blocked." |
| 0:33 | Click **s12** | "It calls a function missing from the repo snapshot — `symbol_missing`." |
| 0:40 | Click **s16** | "'All tests pass' — before any test run happened. `claim_without_action`." |
| 0:47 | Click **s22**, highlight `4821` span | "And the PR cites issue 4821 — the user authorized 417. `arg_provenance`, with the exact span and the evidence that proves it." |
| 0:57 | Scroll to evidence graph | "Every claim links to evidence — or visibly has none. Unsupported claims get no `supported_by` edge." |
| 1:05 | Metrics bar + click **s21** | "Latency stays under a millisecond. And the verdicts are honest — a claim the semantic checker couldn't verify says *unverified*, not *ok*." |
| 1:13 | Full timeline view | "24 steps, 4 catches, every finding inspectable. Black Box — flight recorder for agent runs." |

**Runtime: ~1:15.**

## Before recording

- `./demo/run.sh` up, replay a fresh run ID so the stream animates live.
- State the semantic mode in the video or a text overlay:
  `semantic check: Laya` or `semantic check: unavailable — s21 shown unverified`.
- If Laya is down, don't present s21 as a detection — 4 deterministic
  catches + 1 disclosed unverified is the honest story.
