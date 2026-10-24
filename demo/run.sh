#!/usr/bin/env bash
# Black Box — one-command local demo (Session B).
# Starts the detector backend + Vite dashboard, waits for readiness,
# prints the replay command. Ctrl+C stops both servers.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=8000
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  PORT=8100
  echo "port 8000 is busy — using :$PORT for the detector instead"
fi

echo "starting detector on :$PORT ..."
(cd detector && uv sync --quiet && \
  uv run uvicorn api.main:app --host 127.0.0.1 --port "$PORT") &
DETECTOR=$!

echo "starting dashboard on :5173 ..."
(cd web && npm install --silent && \
  VITE_API_BASE_URL="http://localhost:$PORT" \
  npm run dev -- --host 127.0.0.1 --port 5173) &
WEB=$!

cleanup() { kill "$DETECTOR" "$WEB" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
HEALTH=$(curl -fsS "http://localhost:$PORT/health") || {
  echo "detector did not start — check output above"; exit 1; }

echo
echo "detector:   $HEALTH"
echo "dashboard:  http://localhost:5173/?run_id=demo_001"
echo
echo "in another terminal, replay the recorded run:"
echo "  cd agent && uv sync && uv run python replay.py runs/demo.jsonl \\"
echo "    --target http://localhost:$PORT --run-id demo_001 --delay-ms 350"
echo
echo "Ctrl+C here stops both servers."
wait
