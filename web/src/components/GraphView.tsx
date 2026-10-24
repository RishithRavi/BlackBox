import type { NodeKind, Relation, RunGraph } from "../types";

interface Props {
  graph: RunGraph | null;
  onSelectStep: (stepId: string) => void;
}

const COL_X: Record<NodeKind, number> = { step: 90, claim: 340, evidence: 590 };
const ROW_H = 34;
const WIDTH = 680;

const EDGE_STYLE: Record<Relation, { stroke: string; dash?: string }> = {
  parent: { stroke: "#55677e" },
  contains: { stroke: "#39465a", dash: "3 3" },
  supported_by: { stroke: "#3fb950" },
  derived_from: { stroke: "#d29922", dash: "6 3" },
};

const KIND_FILL: Record<NodeKind, string> = {
  step: "#1c2735",
  claim: "#1b2a45",
  evidence: "#14301f",
};

const KIND_STROKE: Record<NodeKind, string> = {
  step: "#33445a",
  claim: "#2c4a7a",
  evidence: "#25633c",
};

export function GraphView({ graph, onSelectStep }: Props) {
  if (!graph || graph.nodes.length === 0) {
    return (
      <section className="graph empty" aria-label="Evidence graph">
        <h2>Evidence graph</h2>
        <p className="muted">No graph nodes yet.</p>
      </section>
    );
  }

  // Layout: one column per node kind, rows in insertion order.
  const rowOf = new Map<string, number>();
  const counts: Record<NodeKind, number> = { step: 0, claim: 0, evidence: 0 };
  for (const n of graph.nodes) {
    rowOf.set(n.id, counts[n.kind]++);
  }
  const pos = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return null;
    return { x: COL_X[node.kind], y: 24 + (rowOf.get(id) ?? 0) * ROW_H };
  };
  const height = 48 + Math.max(counts.step, counts.claim, counts.evidence) * ROW_H;

  return (
    <section className="graph" aria-label="Evidence graph">
      <h2>Evidence graph</h2>
      <div className="legend">
        <span style={{ color: EDGE_STYLE.parent.stroke }}>— parent</span>
        <span style={{ color: EDGE_STYLE.contains.stroke }}>··· contains</span>
        <span style={{ color: EDGE_STYLE.supported_by.stroke }}>— supported_by</span>
        <span style={{ color: EDGE_STYLE.derived_from.stroke }}>- - derived_from</span>
      </div>
      <svg width={WIDTH} height={height} role="group" aria-label="Run evidence graph">
        {(["step", "claim", "evidence"] as NodeKind[]).map((k) => (
          <text key={k} x={COL_X[k]} y={12} textAnchor="middle" className="colhead">
            {k}s
          </text>
        ))}
        {graph.edges.map((e) => {
          const s = pos(e.source);
          const t = pos(e.target);
          if (!s || !t) return null;
          const st = EDGE_STYLE[e.relation] ?? EDGE_STYLE.parent;
          const midY = (s.y + t.y) / 2;
          return (
            <path
              key={e.id}
              d={`M ${s.x} ${s.y} C ${s.x + 60} ${midY}, ${t.x - 60} ${midY}, ${t.x} ${t.y}`}
              fill="none"
              stroke={st.stroke}
              strokeDasharray={st.dash}
              strokeWidth={1.5}
            >
              <title>{`${e.relation}: ${e.source} → ${e.target}`}</title>
            </path>
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos(n.id)!;
          const clickable = Boolean(n.step_id);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x}, ${p.y})`}
              onClick={() => n.step_id && onSelectStep(n.step_id)}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " "))
                  onSelectStep(n.step_id!);
              }}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              <rect
                x={-70}
                y={-11}
                width={140}
                height={22}
                rx={6}
                fill={KIND_FILL[n.kind]}
                stroke={KIND_STROKE[n.kind]}
              />
              <text textAnchor="middle" dominantBaseline="middle" className="nodelabel">
                {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                <title>{n.id}</title>
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted small">
        parent edges show event order only — not proven contamination. Unsupported
        claims have no supported_by edge.
      </p>
    </section>
  );
}
