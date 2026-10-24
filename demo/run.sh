#!/usr/bin/env bash
# Start the real detector and its dashboard. SEMANTIC_ENABLED=0 is explicit degraded mode.
set -euo pipefail
cd "$(dirname "$0")/.."

choose_port() {
  local candidate=$1
  while lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; do
    candidate=$((candidate + 1))
  done
  echo "$candidate"
}
API_PORT=$(choose_port "${BLACKBOX_API_PORT:-8000}")
WEB_PORT=$(choose_port "${BLACKBOX_WEB_PORT:-5173}")
RUN_ID=${BLACKBOX_RUN_ID:-"laya_$(date +%s)"}
export SEMANTIC_ENABLED=${SEMANTIC_ENABLED:-1}
# Local inference can exceed the aspirational 150ms budget; never silently time out every claim.
export SEMANTIC_TIMEOUT_MS=${SEMANTIC_TIMEOUT_MS:-2000}
WITH_LAYA=1
case "$SEMANTIC_ENABLED" in
  0|false|False|off|OFF|no) WITH_LAYA=0; echo "explicit degraded mode: semantic verification disabled" ;;
  *) ;;
esac
DETECTOR=""
WEB=""
cleanup() {
  if [[ -n "$WEB" ]]; then kill "$WEB" 2>/dev/null || true; fi
  if [[ -n "$DETECTOR" ]]; then kill "$DETECTOR" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "installing detector dependencies (Python 3.12)..."
if [[ "$WITH_LAYA" == 1 ]]; then
  (cd detector && uv sync --python 3.12 --quiet --extra laya)
else
  (cd detector && uv sync --python 3.12 --quiet)
fi
echo "starting detector on :$API_PORT (first model download/warmup may take several minutes)..."
(cd detector
 if [[ "$WITH_LAYA" == 1 ]]; then
   exec uv run --no-sync --extra laya uvicorn api.main:app --host 127.0.0.1 --port "$API_PORT"
 else
   exec uv run --no-sync uvicorn api.main:app --host 127.0.0.1 --port "$API_PORT"
 fi) &
DETECTOR=$!

STARTUP_SECONDS=${BLACKBOX_STARTUP_TIMEOUT_S:-900}
STARTUP_DEADLINE=$((SECONDS + STARTUP_SECONDS))
HEALTH=""
while (( SECONDS < STARTUP_DEADLINE )); do
  if ! kill -0 "$DETECTOR" 2>/dev/null; then echo "detector exited during startup; inspect its error above"; exit 1; fi
  if HEALTH=$(curl --max-time 2 -fsS "http://127.0.0.1:$API_PORT/health" 2>/dev/null); then break; fi
  sleep 1
done
if [[ -z "$HEALTH" ]]; then echo "detector did not become ready within $STARTUP_SECONDS seconds"; exit 1; fi
if [[ "$WITH_LAYA" == 1 ]] && [[ "$HEALTH" != *'"semantic_status":"laya"'* ]]; then
  echo "Laya did not load: $HEALTH"
  echo "Fix the model error above, or opt into degraded mode with SEMANTIC_ENABLED=0."
  exit 1
fi

echo "starting dashboard on :$WEB_PORT ..."
(cd web && npm install --silent && VITE_API_BASE_URL="http://127.0.0.1:$API_PORT" VITE_USE_MOCK=false \
  exec npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort) &
WEB=$!

echo
echo "detector: $HEALTH"
echo "dashboard (actual backend): http://127.0.0.1:$WEB_PORT/?run_id=$RUN_ID"
echo "in another terminal, replay the recorded run:"
echo "  cd agent && uv run python replay.py runs/demo.jsonl \\"
echo "    --target http://127.0.0.1:$API_PORT --run-id $RUN_ID --delay-ms 350"
echo "Ctrl+C stops both servers."
wait
