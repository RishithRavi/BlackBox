import { useCallback, useEffect, useState } from "react";
import { USE_MOCK } from "./api";
import { GraphView } from "./components/GraphView";
import { MetricsBar } from "./components/MetricsBar";
import { StepDetail } from "./components/StepDetail";
import { Timeline } from "./components/Timeline";
import { useRun, type ConnStatus } from "./useRun";

function runIdFromLocation(): string {
  const p = new URLSearchParams(window.location.search).get("run_id");
  return p && p.trim() ? p.trim() : "demo_001";
}

const STATUS_TEXT: Record<ConnStatus, string> = {
  connecting: "connecting…",
  live: "live",
  reconnecting: "reconnecting…",
  offline: "offline",
  mock: "mock stream",
};

export default function App() {
  const [initial] = useState(runIdFromLocation);
  const { runId, records, status, health, graph, metrics, error, setRunId } =
    useRun(initial);
  const [input, setInput] = useState(runId);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);

  useEffect(() => setInput(runId), [runId]);

  const selectStep = useCallback(
    (seq: number) => setSelectedSeq(seq),
    [],
  );

  const jumpToStep = useCallback(
    (stepId: string) => {
      const rec = records.find((r) => r.event.step_id === stepId);
      if (rec) selectStep(rec.seq);
    },
    [records, selectStep],
  );

  const submitRun = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim() || "demo_001";
    setSelectedSeq(null);
    setRunId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("run_id", id);
    window.history.replaceState(null, "", url);
  };

  const selected = records.find((r) => r.seq === selectedSeq) ?? null;

  return (
    <div className="app">
      <header>
        <h1>Black Box</h1>
        <span className="badge recorded">Recorded replay</span>
        {USE_MOCK && (
          <span className="badge mock">DEV MOCK — not real detection</span>
        )}
        <form onSubmit={submitRun} className="runform">
          <label htmlFor="runid">run</label>
          <input
            id="runid"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="demo_001"
          />
          <button type="submit">Load</button>
        </form>
        <span className={`conn conn-${status}`} role="status" aria-live="polite">
          {STATUS_TEXT[status]}
        </span>
        <span className="health">
          backend semantic:{" "}
          <strong>{health ? health.semantic_status : "unreachable"}</strong>
        </span>
      </header>

      {error && (
        <div className="error" role="alert">
          {error} — stream remains open for this run.
        </div>
      )}

      <main>
        <div className="left">
          <MetricsBar metrics={metrics} />
          <Timeline
            records={records}
            selectedSeq={selectedSeq}
            onSelect={selectStep}
          />
        </div>
        <div className="right">
          <StepDetail record={selected} graph={graph} onJumpToStep={jumpToStep} />
          <GraphView graph={graph} onSelectStep={jumpToStep} />
        </div>
      </main>

      <footer>
        Tool calls and results are recorded observations — nothing is executed.
        Observe-only: a BLOCK level is a finding, not enforcement.
      </footer>
    </div>
  );
}
