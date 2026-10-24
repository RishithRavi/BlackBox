import { stepIdFromNodeId } from "../runState";
import type { RunGraph, StepRecord } from "../types";

interface Props {
  record: StepRecord | null;
  graph: RunGraph | null;
  onJumpToStep: (stepId: string) => void;
}

/** Highlight the finding's exact span inside the content when present. */
function Content({ text, spans }: { text: string; spans: string[] }) {
  const usable = spans.filter((s) => s.length > 0 && text.includes(s));
  if (usable.length === 0) return <pre className="content">{text}</pre>;
  const span = usable[0];
  const idx = text.indexOf(span);
  return (
    <pre className="content">
      {text.slice(0, idx)}
      <mark>{span}</mark>
      {text.slice(idx + span.length)}
    </pre>
  );
}

export function StepDetail({ record, graph, onJumpToStep }: Props) {
  if (!record) {
    return <aside className="detail empty">Select a step to inspect it.</aside>;
  }
  const { event, verdict } = record;
  const spans = verdict.flags.map((f) => f.span);

  return (
    <aside className="detail" aria-label="Step detail">
      <h2>
        {event.step_id} <span className="muted">seq #{record.seq}</span>
      </h2>
      <dl className="kv">
        <dt>type</dt>
        <dd>{event.type}</dd>
        <dt>agent</dt>
        <dd>{event.agent}</dd>
        <dt>ts</dt>
        <dd>{event.ts}</dd>
        <dt>parent</dt>
        <dd>{event.parent_step_id ?? "—"}</dd>
        {event.tool_call_id && (
          <>
            <dt>call id</dt>
            <dd>{event.tool_call_id}</dd>
          </>
        )}
      </dl>

      {event.tool && (
        <>
          <h3>Tool call</h3>
          <pre className="content">
            {event.tool.name}({JSON.stringify(event.tool.args, null, 2)})
          </pre>
        </>
      )}

      <h3>Content</h3>
      <Content text={event.content} spans={spans} />

      <h3>
        Verdict <span className={`badge level-${verdict.level}`}>{verdict.level.toUpperCase()}</span>
      </h3>
      <dl className="kv">
        <dt>score</dt>
        <dd>{verdict.score.toFixed(2)}</dd>
        <dt>latency</dt>
        <dd>{verdict.latency_ms.toFixed(1)} ms</dd>
        <dt>semantic</dt>
        <dd>
          {verdict.semantic_status === "unavailable" ? (
            <span className="badge semantic-unavailable">
              unavailable — claim not verified
            </span>
          ) : (
            verdict.semantic_status
          )}
        </dd>
      </dl>

      {verdict.flags.length === 0 ? (
        <p className="muted">No findings.</p>
      ) : (
        <ul className="findings">
          {verdict.flags.map((f, i) => (
            <li key={i} className="finding">
              <div>
                <strong className="rule">{f.rule}</strong>{" "}
                <span className="muted">conf {f.confidence.toFixed(2)}</span>
              </div>
              <div>{f.message}</div>
              <div className="muted small">
                field <code>{f.field_path}</code>
                {f.span && (
                  <>
                    {" "}· span <code>{f.span}</code>
                  </>
                )}
              </div>
              {f.evidence_ids.length > 0 && (
                <div className="evidence">
                  evidence:{" "}
                  {f.evidence_ids.map((eid) => {
                    const node = graph?.nodes.find((n) => n.id === eid);
                    const target = node?.step_id ?? stepIdFromNodeId(eid);
                    return (
                      <button
                        key={eid}
                        type="button"
                        className="link"
                        title={eid}
                        onClick={() => target && onJumpToStep(target)}
                      >
                        {node?.label ?? eid}
                      </button>
                    );
                  })}
                </div>
              )}
              {f.evidence_ids.length === 0 && (
                <div className="muted small">no supporting evidence on record</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
