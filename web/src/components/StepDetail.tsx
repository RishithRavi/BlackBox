import { ArrowUpRight, FileText, Info } from "@phosphor-icons/react";
import { stepIdFromNodeId } from "../runState";
import {
  resultObject,
  RULE_TITLES,
  stepTitle,
  formatLatency,
} from "../presentation";
import type { RunGraph, StepRecord } from "../types";
import { StatusBadge } from "./Timeline";

function Highlight({ text, spans }: { text: string; spans: string[] }) {
  const span = spans.find((s) => s && text.includes(s));
  if (!span) return <>{text}</>;
  return (
    <>
      {text.split(span).map((part, index) => (
        <span key={index}>
          {index > 0 && <mark>{span}</mark>}
          {part}
        </span>
      ))}
    </>
  );
}
export function StepDetail({
  record,
  records,
  graph,
  onJumpToStep,
  sample,
}: {
  record: StepRecord | null;
  records: StepRecord[];
  graph: RunGraph | null;
  onJumpToStep: (id: string) => void;
  sample: boolean;
}) {
  if (!record)
    return (
      <aside className="panel detail-panel empty">
        <FileText size={28} />
        <h3>A closer look</h3>
        <p>
          Select a step or graph node to inspect its findings and source
          evidence.
        </p>
      </aside>
    );
  const { event, verdict } = record;
  const flags = verdict.flags;
  const spans = flags.map((f) => f.span);
  const evidenceIds = new Set(flags.flatMap((f) => f.evidence_ids));
  const graphEvidence = [
    ...(graph?.edges ?? [])
      .filter(
        (e) =>
          e.relation === "supported_by" &&
          graph?.nodes.find((n) => n.id === e.source)?.step_id ===
            event.step_id,
      )
      .map((e) => e.target),
    ...evidenceIds,
  ];
  const sourceIds = new Set(
    graphEvidence
      .map(
        (id) =>
          graph?.nodes.find((n) => n.id === id)?.step_id ??
          stepIdFromNodeId(id),
      )
      .filter(Boolean),
  );
  const previous = records.filter((r) => r.seq < record.seq);
  // Comparison context is deliberately distinct from evidence supporting a claim.
  const context = flags.some((f) => f.rule === "arg_provenance")
    ? previous.filter((r) => r.event.type === "user").slice(-1)
    : flags.some((f) =>
          ["unsupported_claim", "symbol_missing"].includes(f.rule),
        )
      ? previous
          .filter(
            (r) => typeof resultObject(r.event.content)?.diff === "string",
          )
          .slice(-1)
      : [];
  const sources = records.filter((r) => sourceIds.has(r.event.step_id));
  const evidence = sources.length ? sources : context;
  const isClaim = event.type === "llm" || event.type === "final";
  const primary = flags[0];
  return (
    <aside className="panel detail-panel" aria-labelledby="detail-title">
      <div className="detail-label">
        <h2>{isClaim ? "Claim details" : "Step details"}</h2>
        <span className="step-pill">{String(record.seq).padStart(2, "0")}</span>
      </div>
      <div className="detail-title-row">
        <h3 id="detail-title">{stepTitle(record)}</h3>
        <StatusBadge
          level={verdict.level}
          unverified={verdict.semantic_status === "unavailable"}
        />
      </div>
      <p className="explanation">
        {primary?.message ??
          "No findings were reported for this step. Inspect the recorded content below."}
      </p>
      {verdict.semantic_status === "unavailable" && (
        <p className="notice warning">
          <Info size={16} />
          Semantic check unavailable. This content has not been semantically
          verified.
        </p>
      )}
      <h4>
        {event.tool
          ? primary?.rule === "arg_provenance"
            ? "Flagged argument"
            : "Tool argument"
          : isClaim
            ? "Agent claim"
            : "Recorded content"}
      </h4>
      <pre className="code-block">
        <Highlight
          text={
            event.tool
              ? `${event.tool.name}(${JSON.stringify(primary?.rule === "arg_provenance" && primary.field_path.startsWith("/tool/args/") ? { [primary.field_path.split("/").pop()!]: event.tool.args[primary.field_path.split("/").pop()!] } : event.tool.args, null, 2)})`
              : event.content
          }
          spans={spans}
        />
      </pre>
      <h4>
        {sources.length
          ? "Referenced evidence"
          : context.length
            ? "Earlier context"
            : "Evidence"}
      </h4>
      {evidence.length ? (
        evidence.map((source) => {
          const obj = resultObject(source.event.content);
          const text =
            typeof obj?.diff === "string" ? obj.diff : source.event.content;
          return (
            <div className="evidence-box" key={source.event.step_id}>
              {typeof obj?.diff === "string" ? (
                <pre className="diff">
                  {text.split("\n").map((line, i) => (
                    <span
                      key={i}
                      className={
                        line.startsWith("+")
                          ? "addition"
                          : line.startsWith("-")
                            ? "deletion"
                            : ""
                      }
                    >
                      {line}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              ) : (
                <p>{text}</p>
              )}
              <button
                className="text-button"
                onClick={() => onJumpToStep(source.event.step_id)}
              >
                View source step <ArrowUpRight size={14} />
              </button>
            </div>
          );
        })
      ) : (
        <p className="evidence-empty">
          {primary
            ? "No supporting evidence was recorded before this step."
            : "No evidence references attached to this step."}
        </p>
      )}
      {flags.length > 1 && (
        <div className="other-findings">
          <h4>Additional findings</h4>
          {flags.slice(1).map((flag, i) => (
            <p key={i}>
              <strong>{RULE_TITLES[flag.rule] ?? flag.rule}</strong>
              <br />
              {flag.message}
            </p>
          ))}
        </div>
      )}
      <dl className="detail-metadata">
        <div>
          <dt>Detection method</dt>
          <dd>
            {primary
              ? primary.rule === "unsupported_claim"
                ? "Semantic grounding"
                : primary.rule === "arg_provenance"
                  ? "Argument provenance"
                  : primary.rule.replaceAll("_", " ")
              : "Step checks"}
          </dd>
        </div>
        {verdict.semantic_status !== "not_applicable" && (
          <div>
            <dt>Semantic verifier</dt>
            <dd>
              {sample
                ? "Laya · illustrative"
                : verdict.semantic_status === "laya"
                  ? "Laya"
                  : verdict.semantic_status === "fallback"
                    ? "Fallback verifier"
                    : "Unavailable"}
            </dd>
          </div>
        )}
        <div>
          <dt>Latency</dt>
          <dd>{formatLatency(verdict.latency_ms)}</dd>
        </div>
        <div>
          <dt>Source step</dt>
          <dd>
            {event.step_id} · {event.agent}
          </dd>
        </div>
      </dl>
      <details className="raw-event">
        <summary>View full event</summary>
        <pre className="code-block">{JSON.stringify(event, null, 2)}</pre>
      </details>
    </aside>
  );
}
