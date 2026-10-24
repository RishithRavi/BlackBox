import { useState } from "react";
import {
  ArrowRight,
  CaretDown,
  Checks,
  Database,
  Broadcast,
  Brain,
  Funnel,
  PlugsConnected,
  Info,
} from "@phosphor-icons/react";
import type { StepRecord } from "../types";
import type { ConnStatus } from "../useRun";
import { formatLatency } from "../presentation";
import { pipelineSignals } from "../pipelinePresentation";

const stages = [
  {
    id: "intake",
    label: "FastAPI",
    icon: PlugsConnected,
    subtitle: "Event intake",
  },
  {
    id: "rules",
    label: "Rules",
    icon: Checks,
    subtitle: "Deterministic checks",
  },
  { id: "laya", label: "Laya", icon: Brain, subtitle: "Semantic verification" },
  {
    id: "fusion",
    label: "Score fusion",
    icon: Funnel,
    subtitle: "Signal aggregation",
  },
  {
    id: "sqlite",
    label: "SQLite",
    icon: Database,
    subtitle: "Durable records",
  },
  { id: "sse", label: "SSE", icon: Broadcast, subtitle: "Live delivery" },
] as const;
type StageId = (typeof stages)[number]["id"];

export function DetectionPipeline({
  record,
  sample,
  status,
  runId,
  cursor,
  persistedCount,
}: {
  record: StepRecord | null;
  sample: boolean;
  status: ConnStatus;
  runId: string;
  cursor: number;
  persistedCount: number;
}) {
  const illustrative = sample || status === "mock";
  const [active, setActive] = useState<StageId | null>(null);
  const signals = pipelineSignals(record);
  const semanticStatus = signals.semanticStatus;
  const semanticText =
    semanticStatus === "waiting"
      ? "Waiting"
      : semanticStatus === "unavailable"
        ? "Unavailable"
        : semanticStatus === "not_applicable"
          ? "Not needed"
          : signals.semantic !== null
            ? `${signals.semantic.toFixed(2)} confidence`
            : semanticStatus === "fallback"
              ? "Fallback check"
              : "Checked";
  const live = status === "live";
  const values: Record<StageId, string> = {
    intake: record
      ? illustrative
        ? "Example event"
        : "POST /events"
      : "Awaiting events",
    rules: record
      ? signals.rules === null
        ? "No findings"
        : `${signals.rules.toFixed(2)} confidence`
      : "Waiting",
    laya: semanticText,
    fusion:
      signals.score === null ? "Waiting" : `${signals.score.toFixed(2)} risk`,
    sqlite: record
      ? `${illustrative ? "Example" : "Stored"} #${record.seq}`
      : "No selection",
    sse: sample
      ? "Sample channel"
      : status === "mock"
        ? "Mock channel"
        : live
          ? "Connected"
          : status === "connecting"
            ? "Connecting"
            : status === "reconnecting"
              ? "Reconnecting"
              : "Disconnected",
  };
  const selected = stages.find((s) => s.id === active);
  const descriptions: Record<
    StageId,
    { title: string; body: string; detail: string }
  > = {
    intake: {
      title: "One event, one backend verdict",
      body: "The replay client posts each recorded agent event to FastAPI. The backend validates its schema and checks references within this run.",
      detail: "POST /events → Event validation → Per-run processing",
    },
    rules: {
      title: "Cheap checks before semantic inference",
      body: "Deterministic checks inspect tool schemas, argument provenance, recorded package facts, repository symbols, and claimed actions. Their findings feed score fusion.",
      detail:
        "A missing finding means no rule finding was reported; it is not a guarantee that the entire step is correct.",
    },
    laya: {
      title:
        semanticStatus === "unavailable"
          ? "Semantic verification is unavailable"
          : semanticStatus === "not_applicable"
            ? "No semantic check was needed for this step"
            : "Claims checked against earlier evidence",
      body:
        semanticStatus === "unavailable"
          ? "The backend could not complete semantic verification for this step. It still returns deterministic findings, and the claim remains unverified."
          : semanticStatus === "not_applicable"
            ? "This event did not require a semantic check. Laya is used for extracted natural-language claims, not every tool or input event."
            : "The semantic adapter checks extracted claims against evidence from earlier steps. Unsupported claims can contribute a warning; they do not independently block an action.",
      detail:
        signals.semantic !== null
          ? "The number shown is confidence in a reported semantic finding, not the raw Laya support probability."
          : semanticStatus === "laya"
            ? "A completed check without a finding may be supported or inconclusive. The v1 verdict does not expose raw model probabilities."
            : semanticStatus === "fallback"
              ? "The backend reports a fallback verifier for this step; this is not a Laya inference result."
              : "No numeric model score is inferred or filled in when a check is unavailable or not applicable.",
    },
    fusion: {
      title: "A conservative, explainable decision",
      body: "The backend uses the highest finding confidence as the risk score. A hard-rule finding at or above 0.80 produces “High risk”; other findings produce “Warning”; no findings produce “No findings”.",
      detail:
        "Semantic findings require confidence ≥ 0.65 and cannot block on their own. These are heuristic scores, not calibrated probabilities.",
    },
    sqlite: {
      title: "Commit first. Publish second.",
      body: "The backend commits the event, verdict, claims, and evidence to SQLite before publishing a stream notification. Sequence numbers preserve order and retries do not create new records.",
      detail: illustrative
        ? "Preview mode only: this page is displaying illustrative records, not writing to SQLite."
        : `${persistedCount} persisted records loaded for ${runId}. The selected record may have arrived from a saved snapshot or the live stream.`,
    },
    sse: {
      title: "Catch up, then follow the run live",
      body: "The browser loads persisted records, then subscribes to Server-Sent Events after its last sequence. Reconnects resume the stream and the UI ignores duplicate sequences.",
      detail: illustrative
        ? "Preview mode only: no real backend EventSource connection is opened."
        : `Resume cursor #${cursor}: GET /runs/${encodeURIComponent(runId)}/stream?after=${cursor}. Selected records may have loaded from a saved snapshot or the live stream.`,
    },
  };
  const toggle = (id: StageId) =>
    setActive((current) => (current === id ? null : id));
  return (
    <section
      className={`detection-pipeline ${active ? "expanded" : ""}`}
      aria-label="Detection pipeline"
    >
      <div className="pipeline-caption">
        <span>DETECTION PIPELINE</span>
        <span>
          {record
            ? `Selected step ${String(record.seq).padStart(2, "0")}`
            : "Select a step"}
          {sample
            ? " · illustrative"
            : status === "mock"
              ? " · development mock"
              : ""}
        </span>
        <button
          onClick={() => setActive(active ? null : "fusion")}
          aria-expanded={active !== null}
          aria-controls="pipeline-explanation"
        >
          {active ? "Hide details" : "How it works"}
          <CaretDown size={12} className={active ? "rotate" : ""} />
        </button>
      </div>
      <div className="pipeline-track">
        {stages.map(({ id, label, icon: Icon }, index) => (
          <div className="pipeline-track-item" key={id}>
            <button
              className={`pipeline-stage ${active === id ? "selected" : ""} ${id === "laya" && semanticStatus === "unavailable" ? "degraded" : ""}`}
              onClick={() => toggle(id)}
              aria-expanded={active === id}
              aria-controls="pipeline-explanation"
              aria-label={`Inspect ${label}`}
            >
              <Icon size={18} />
              <span>
                <strong>{label}</strong>
                <small>{values[id]}</small>
              </span>
            </button>
            {index < stages.length - 1 && (
              <ArrowRight
                size={12}
                className="stage-arrow"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
      {active && selected && (
        <div className="pipeline-explanation" id="pipeline-explanation">
          <div className="pipeline-story">
            <span className="eyebrow">{selected.subtitle}</span>
            <h3>{descriptions[active].title}</h3>
            <p>{descriptions[active].body}</p>
            <p className="pipeline-footnote">
              <Info size={13} />
              <span>{descriptions[active].detail}</span>
            </p>
          </div>
          <div className="signal-breakdown">
            <div className="signal-heading">
              <h4>Inside this verdict</h4>
              <span>
                {illustrative
                  ? "Illustrative"
                  : record
                    ? record.event.step_id
                    : "Waiting"}
              </span>
            </div>
            <div className="signal-row">
              <span>
                <Checks size={15} />
                Rule finding confidence
              </span>
              <strong>
                {signals.rules === null ? "—" : signals.rules.toFixed(2)}
              </strong>
            </div>
            <div className="signal-row">
              <span>
                <Brain size={15} />
                Semantic finding confidence
              </span>
              <strong>
                {signals.semantic === null ? "—" : signals.semantic.toFixed(2)}
              </strong>
            </div>
            <div className="fused-signal">
              <div>
                <span>Backend fused risk</span>
                <strong>
                  {signals.score === null ? "—" : signals.score.toFixed(2)}
                </strong>
              </div>
              <meter
                min={0}
                max={1}
                value={signals.score ?? 0}
                aria-label="Backend fused risk"
              />
              <p>
                {record
                  ? `${{ ok: "No findings", warn: "Warning", block: "High risk" }[record.verdict.level]} · ${formatLatency(record.verdict.latency_ms)} total processing`
                  : "Choose a step to inspect its reported verdict."}
              </p>
            </div>
            <p className="signal-note">
              No finding is shown as “—”. Unavailable checks are not treated as
              a zero-risk signal.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
