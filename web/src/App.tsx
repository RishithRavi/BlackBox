import { useEffect, useState } from "react";
import {
  Cube,
  Play,
  Pause,
  ArrowCounterClockwise,
  CaretDown,
  X,
  GearSix,
  ArrowUpRight,
  CheckCircle,
  Circle,
  Info,
} from "@phosphor-icons/react";
import { formatLatency } from "./presentation";
import { API_BASE, USE_MOCK } from "./api";
import { sampleGraph, sampleRecords } from "./demoData";
import { GraphView } from "./components/GraphView";
import { StepDetail } from "./components/StepDetail";
import { Timeline } from "./components/Timeline";
import { useRun } from "./useRun";

function initialLocation() {
  const p = new URLSearchParams(window.location.search);
  return {
    id: p.get("run_id")?.trim() || "demo_001",
    sample: p.get("sample") === "1",
  };
}

export default function App() {
  const [initial] = useState(initialLocation);
  const [sample, setSample] = useState(initial.sample);
  const run = useRun(initial.id, !sample);
  const [runInput, setRunInput] = useState(initial.id);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<"timeline" | "graph">("timeline");
  const [flagged, setFlagged] = useState(false);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [speed, setSpeed] = useState("1");
  const allRecords = sample ? sampleRecords : run.records;
  const records = cursor === null ? allRecords : allRecords.slice(0, cursor);
  const fullGraph = sample ? sampleGraph : run.graph;
  const graph = fullGraph
    ? {
        ...fullGraph,
        nodes: fullGraph.nodes.filter(
          (n) =>
            !n.step_id || records.some((r) => r.event.step_id === n.step_id),
        ),
      }
    : null;
  const preferred =
    records.find((r) =>
      r.verdict.flags.some((f) => f.rule === "arg_provenance"),
    ) ??
    records.find((r) => r.verdict.flags.length) ??
    records[0];
  const selected =
    selectedSeq === null
      ? (preferred ?? null)
      : (records.find((r) => r.seq === selectedSeq) ?? null);
  const flagCount = records.filter((r) => r.verdict.flags.length).length;
  const latency = records
    .map((r) => r.verdict.latency_ms)
    .sort((a, b) => a - b);
  const p95 = latency.length
    ? latency[Math.ceil(latency.length * 0.95) - 1]
    : null;
  const semantic = sample
    ? "Sample judgments"
    : run.health?.semantic_status === "laya"
      ? "Laya connected"
      : run.health?.semantic_status === "fallback"
        ? "Fallback verifier"
        : run.health
          ? "Semantic checks unavailable"
          : "Backend disconnected";
  const ready =
    sample ||
    run.health?.semantic_status === "laya" ||
    run.health?.semantic_status === "fallback";
  useEffect(() => {
    if (!playing) return;
    if ((cursor ?? 0) >= allRecords.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setCursor((n) => (n ?? 0) + 1),
      700 / Number(speed),
    );
    return () => clearTimeout(timer);
  }, [playing, cursor, allRecords.length, speed]);
  useEffect(() => {
    if (!settings) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettings(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [settings]);
  const resetView = () => {
    setPlaying(false);
    setCursor(null);
    setSelectedSeq(null);
    setFlagged(false);
  };
  const setMode = (nextSample: boolean, id = run.runId) => {
    resetView();
    setSample(nextSample);
    setSettings(false);
    setRunInput(id);
    if (!nextSample) run.setRunId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("run_id", id);
    if (nextSample) url.searchParams.set("sample", "1");
    else url.searchParams.delete("sample");
    window.history.replaceState(null, "", url);
  };
  const jump = (stepId: string) => {
    const r = records.find((r) => r.event.step_id === stepId);
    if (r) {
      setSelectedSeq(r.seq);
      if (tab === "timeline") setFlagged(false);
    }
  };
  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (cursor === null || cursor >= allRecords.length) {
      setCursor(0);
      setSelectedSeq(null);
    }
    setPlaying(true);
  };
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Black Box home">
          <Cube size={29} weight="bold" />
          <span>Black Box</span>
        </a>
        <nav aria-label="Main navigation">
          <button className="nav-item active" onClick={() => setSettings(true)}>
            Runs
          </button>
          <button className="nav-item" onClick={() => setSettings(true)}>
            Settings
          </button>
        </nav>
        <div className="topbar-right">
          <span
            className={`connection ${run.status === "live" && !sample ? "connected" : ""}`}
            role="status"
          >
            {sample
              ? "Sample preview"
              : run.status === "live"
                ? "Live connection"
                : run.status === "connecting"
                  ? "Connecting…"
                  : run.status === "reconnecting"
                    ? "Reconnecting…"
                    : "Offline"}
          </span>
          <button
            className="avatar"
            onClick={() => setSettings(true)}
            aria-label="Open workspace settings"
          >
            BB
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="breadcrumb">
          <button onClick={() => setSettings(true)}>Runs</button>
          <span>/</span>
          <button className="run-switch" onClick={() => setSettings(true)}>
            {sample ? "sample_preview" : run.runId}
            <CaretDown size={12} />
          </button>
        </div>
        <div className="run-header">
          <div>
            <div className="run-title">
              <h1>Fix cache expiry</h1>
              <span
                className="observe-badge"
                title="Findings are recorded without stopping agent actions."
              >
                Observe only
              </span>
            </div>
            <p className="subtitle">
              Coding agent <span>·</span> Recorded replay
            </p>
          </div>
          <div className="replay-controls">
            <button
              className="icon-button"
              aria-label="Restart replay"
              disabled={!allRecords.length}
              onClick={() => {
                setCursor(0);
                setPlaying(false);
                setSelectedSeq(null);
              }}
            >
              <ArrowCounterClockwise size={18} />
            </button>
            <label className="sr-only" htmlFor="speed">
              Replay speed
            </label>
            <select
              id="speed"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
            >
              <option value=".5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
            <button
              className="primary-button"
              onClick={play}
              disabled={!allRecords.length}
            >
              {playing ? (
                <Pause size={16} weight="fill" />
              ) : (
                <Play size={16} weight="fill" />
              )}
              {playing
                ? "Pause replay"
                : cursor !== null && cursor > 0 && cursor < allRecords.length
                  ? "Resume replay"
                  : "Play replay"}
            </button>
          </div>
        </div>
        <div className="summary-strip">
          <div className="summary-items">
            <span>
              <strong>{records.length}</strong> steps
            </span>
            <span>
              <strong>{flagCount}</strong> flagged
            </span>
            <span>
              P95 latency{" "}
              <strong>{p95 === null ? "—" : formatLatency(p95)}</strong>
            </span>
            <span className={`semantic-readiness ${ready ? "ready" : ""}`}>
              <Circle size={9} weight="fill" />
              {semantic}
            </span>
          </div>
          <span className="data-label">
            {sample
              ? "Illustrative demo data"
              : USE_MOCK
                ? "Development mock data"
                : "Persisted run data"}
          </span>
        </div>
        {sample ? null : run.error ? (
          <div className="notice error" role="alert">
            <Info size={17} />
            <span>Unable to load this run. {run.error}</span>
            <button onClick={() => setMode(true)}>Explore sample</button>
          </div>
        ) : !records.length ? (
          <div className="sample-note">
            <Info size={15} />
            <span>
              Waiting for recorded events. You can explore the light dashboard
              with sample data.
            </span>
            <button onClick={() => setMode(true)}>
              Open sample replay <ArrowUpRight size={13} />
            </button>
          </div>
        ) : null}
        <div className="view-tabs" role="tablist" aria-label="Run view">
          {(["timeline", "graph"] as const).map((view) => (
            <button
              key={view}
              role="tab"
              id={`${view}-tab`}
              aria-controls="run-view"
              aria-selected={view === tab}
              className={view === tab ? "active" : ""}
              onClick={() => setTab(view)}
            >
              {view === "timeline" ? "Timeline" : "Graph"}
            </button>
          ))}
          <span className="tabs-hint">
            {tab === "timeline"
              ? "Every step. A clearer picture."
              : "Follow the evidence."}
          </span>
        </div>
        <div
          className="dashboard-grid"
          id="run-view"
          role="tabpanel"
          aria-labelledby={`${tab}-tab`}
        >
          <div className="main-panel">
            {tab === "timeline" ? (
              <Timeline
                records={records}
                selectedSeq={selected?.seq ?? null}
                onSelect={setSelectedSeq}
                filter={flagged}
                onFilter={setFlagged}
                loading={!sample && run.status === "connecting"}
              />
            ) : (
              <GraphView
                graph={graph}
                records={records}
                selectedStep={selected?.event.step_id ?? null}
                onSelectStep={jump}
              />
            )}
          </div>
          <StepDetail
            record={selected}
            records={records}
            graph={graph}
            onJumpToStep={jump}
            sample={sample}
          />
        </div>
        <div className="replay-footer">
          <progress
            aria-label="Replay progress"
            max={Math.max(allRecords.length, 1)}
            value={records.length}
          />
          <span>
            {records.length} of {allRecords.length} steps
          </span>
          <span className="replay-status">
            {playing
              ? "Replaying recorded steps"
              : cursor !== null && cursor < allRecords.length
                ? "Replay paused"
                : records.length
                  ? "Replay ready"
                  : "Waiting for events"}
          </span>
        </div>
        {sample && (
          <div className="sample-note">
            <Info size={15} />
            <span>
              Sample preview. Findings and model status are illustrative; no
              detector is running.
            </span>
            <button onClick={() => setMode(false)}>
              Connect a real run <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        <footer className="page-footer">
          <CheckCircle size={14} /> Observe only. Recorded calls are never
          executed by this dashboard.
        </footer>
      </main>
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                const elements = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button,input,select,a[href]",
                  ),
                );
                const first = elements[0],
                  last = elements[elements.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="panel-heading">
              <h2 id="settings-title">
                <GearSix size={20} /> Workspace
              </h2>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setSettings(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p>Open a recorded run or explore the sample dashboard.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMode(false, runInput.trim() || "demo_001");
              }}
            >
              <label htmlFor="run-id">Run ID</label>
              <input
                id="run-id"
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                placeholder="demo_001"
              />
              <button className="primary-button" type="submit">
                Load live run
              </button>
            </form>
            <button className="secondary-button" onClick={() => setMode(true)}>
              Explore sample replay
            </button>
            <div className="connection-info">
              <span>Detector endpoint</span>
              <code>{API_BASE}</code>
              <span>
                Replay controls play back existing records. They do not start an
                agent or change stored verdicts.
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
