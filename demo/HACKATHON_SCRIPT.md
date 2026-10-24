# Black Box — two-minute hackathon demo

Target: 1:50–1:58, including clicks. Spoken narration: approximately 220 words.

## Before recording

Open checkout_reliability_002 with Laya connected. Keep the timeline ready at step 39; use Flagged to find it quickly. Rehearse switching to step 58, expanding Graph, choosing All nodes, then returning to Selected + neighbours. Keep pipeline disclosures collapsed until the technical section.

The current repository has a recorded-trace replay client and event API, not a live Devin connector. Do not describe the trace as captured from Devin. If Devin was used to build the project, show the actual sessions as separate evidence; that is distinct from runtime integration.

## 0:00–0:15 — Hook
**Screen:** Dashboard title and summary.

“An AI coding agent says all tests pass. Three tests actually failed. Black Box catches that mismatch at the step where it happens, and shows the evidence behind the warning.”

## 0:15–0:30 — Devin connection
**Screen:** Briefly show the recorded replay entering POST /events, then the timeline.

“We designed Black Box for coding-agent workflows like Devin. Its event API accepts actions, tool results, and claims. Today’s demo replays a recorded trace through the real detector; the live Devin connector is still to be built.”

## 0:30–0:55 — Concrete failures
**Screen:** Step 39, then step 58 and its highlighted issue ID.

“Here, the agent claims success after failed payment tests. Black Box links the warning to the earlier test result.

“Later, it proposes issue 9999, which the user never supplied, and adds capabilities unsupported by the recorded diff. Provenance catches the invented ID; Laya checks the written claims.”

## 0:55–1:15 — Novelty
**Screen:** Graph → Expand graph → All nodes, then Selected + neighbours.

“This example spans 76 steps and four recorded agent roles. Its graph has 137 nodes and 155 connections.

“The difference is traceability: inspect each claim, its originating step, and its evidence. Sequence links are explicitly separate from support.”

## 1:15–1:40 — Technical depth
**Screen:** Close expanded graph; open Score fusion, then SQLite / SSE.

“FastAPI combines deterministic rules with local, open-source Laya verification. Checks use earlier evidence, preventing later results from justifying earlier claims.

“Fusion produces an inspectable verdict. SQLite commits it before SSE publishes it; reconnecting clients resume without duplicate steps.”

## 1:40–1:55 — Results and close
**Screen:** Return to the graph or dashboard summary.

“We detected all nine required planted failures. We also expose false positives and a missed claim.

“Black Box makes agent reliability inspectable, one step at a time.”

## Delivery notes

- Aim for 125–135 words per minute; leave the final five seconds as buffer.
- Start with persisted results. Dashboard Play replay animates stored records; it does not rerun Laya. A separate JSONL replay into a fresh run demonstrates real ingestion.
- Do not claim automatic blocking, a frontier-model second opinion, perfect accuracy, or consistently sub-200ms verification. Those are not current capabilities.

