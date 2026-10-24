# Black Box

Black Box detects suspicious tool calls and unsupported claims in coding-agent runs, then shows the evidence behind each finding.

The demo replays recorded agent activity through a real detector. It does not execute the recorded tools or stop an agent's actions.

## What it catches

- Invented issue references, missing packages, and nonexistent repository functions.
- Claims that tests passed when the recorded results say otherwise.
- Unsupported summaries, checked by the local open-source **Laya** verifier.
- Repeated tool calls and invalid tool arguments.

Explore findings in the timeline, inspect their source evidence, or open the interactive graph.

![Black Box dashboard](demo/validation/checkout-timeline.png)

## Run it

Requires **Python 3.12**, **uv**, **Node.js 18+**, and **npm**. Initial setup downloads dependencies and the Laya model; no paid API key is required.

```bash
./demo/run.sh
```

Open the dashboard URL it prints, then run its printed replay command in another terminal. The launcher starts both the detector and dashboard and chooses available ports. First model startup can take several minutes. Ctrl+C stops both servers.

For the larger demo:

```bash
BLACKBOX_SCENARIO=checkout ./demo/run.sh
```

| Demo | Activity |
|---|---|
| Cache expiry | 24 steps with five planted failure cases. |
| Checkout reliability | 76 steps, four recorded agent roles, five phases, and a graph with 137 nodes and 155 connections in the validated run. |

Use a fresh run ID for each new replay. **Runs** lets you load a persisted run. **Graph → Expand graph** opens the larger map with search, phase filters, and neighbourhood focus. Dashboard playback animates stored results; it does not rerun detection.

## How it works

Recorded events → **FastAPI** → **rules + Laya** → **score fusion** → **SQLite** → **SSE** → **Vite/React dashboard**.

Checks compare claims with earlier evidence. Results are saved before live updates are published. Graph links distinguish evidence support from event order and inspected context.

Detection is imperfect: the checkout validation caught all nine required planted cases but flagged two clean controls and missed another unsupported claim. Latency varies and is not consistently below 200 ms. See the [detailed results](demo/CHECKOUT_SCENARIO.md).

## Development with Devin

Devin can be used to build and test the project through two separate task briefs:

- [Backend detector](DEVIN_A_BACKEND_DETECTOR.md)
- [Replay and frontend](DEVIN_B_REPLAY_FRONTEND.md)
- [Shared architecture and interface contracts](BLACK_BOX_SHARED_CONTEXT.md)

This is a development workflow; the current demo uses recorded traces rather than a live Devin connection.

## More

- [Two-minute hackathon demo script](demo/HACKATHON_SCRIPT.md)
- [Checkout scenario walkthrough](demo/CHECKOUT_SCENARIO.md)
- [Backend setup and API details](detector/README.md)
- [Real Laya validation](demo/LAYA_VALIDATION.md)

Run frontend checks with `cd web && npm test && npm run build`; backend checks with `cd detector && uv run --extra laya pytest -q`.
