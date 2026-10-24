import type { SemanticStatus, StepRecord } from "../types";

interface Props {
  records: StepRecord[];
  selectedSeq: number | null;
  onSelect: (seq: number) => void;
}

const LEVEL_LABEL = { ok: "OK", warn: "WARN", block: "BLOCK" } as const;
const TYPE_LABEL = {
  user: "user",
  llm: "llm",
  tool_call: "call",
  tool_result: "result",
  final: "final",
} as const;

function semanticBadge(s: SemanticStatus) {
  if (s === "not_applicable") return null;
  if (s === "unavailable")
    return <span className="badge semantic-unavailable">semantic: unverified</span>;
  return <span className={`badge semantic-${s}`}>semantic: {s}</span>;
}

export function Timeline({ records, selectedSeq, onSelect }: Props) {
  if (records.length === 0) {
    return <p className="empty">No persisted steps yet — stream is open.</p>;
  }
  return (
    <ol className="timeline" aria-label="Run timeline">
      {records.map((r) => {
        const { event, verdict } = r;
        const sel = r.seq === selectedSeq;
        return (
          <li key={r.seq}>
            <button
              type="button"
              className={`row level-${verdict.level} ${sel ? "selected" : ""}`}
              aria-current={sel ? "true" : undefined}
              onClick={() => onSelect(r.seq)}
            >
              <span className="seq">#{r.seq}</span>
              <span className="stepid">{event.step_id}</span>
              <span className="type">{TYPE_LABEL[event.type]}</span>
              <span className="tool">
                {event.type === "tool_call" ? event.tool?.name : ""}
              </span>
              <span className={`badge level-${verdict.level}`}>
                {LEVEL_LABEL[verdict.level]}
              </span>
              {verdict.flags.length > 0 && (
                <span className="flags" title={verdict.flags.map((f) => f.rule).join(", ")}>
                  {verdict.flags.length} flag{verdict.flags.length > 1 ? "s" : ""}
                </span>
              )}
              {semanticBadge(verdict.semantic_status)}
              <span className="latency">{verdict.latency_ms.toFixed(1)} ms</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
