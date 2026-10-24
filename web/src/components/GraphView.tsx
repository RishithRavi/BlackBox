import { memo, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import {
  FileText,
  Code,
  Folder,
  Graph as GraphIcon,
} from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { stepTitle, claimState } from "../presentation";
import type { RunGraph, StepRecord } from "../types";

type EvidenceNode = Node<
  {
    kind: string;
    label: string;
    stepId: string;
    level: string;
    selected: boolean;
    onSelect: (step: string) => void;
  },
  "evidenceCard"
>;
const EvidenceCard = memo(function EvidenceCard({
  data,
}: NodeProps<EvidenceNode>) {
  const Icon =
    data.kind === "step" ? Folder : data.kind === "claim" ? FileText : Code;
  return (
    <button
      type="button"
      onClick={() => data.onSelect(data.stepId)}
      aria-label={`${data.kind}: ${data.label}`}
      className={`graph-card ${data.level} ${data.selected ? "is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Icon size={21} />
      <div>
        <span className="node-kind">{data.kind}</span>
        <strong title={data.label}>{data.label}</strong>
        <span className="node-step">{data.stepId}</span>
        {data.kind === "claim" && data.level !== "ok" && (
          <span className={`badge ${data.level}`}>
            {data.level === "unverified"
              ? "Unverified"
              : data.level === "block"
                ? "Untraceable"
                : "Unsupported"}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </button>
  );
});
const nodeTypes = { evidenceCard: EvidenceCard };
const relationLabels = {
  parent: "step sequence",
  contains: "contains",
  supported_by: "supported by",
  derived_from: "derived from",
};

export function GraphView({
  graph,
  records,
  selectedStep,
  onSelectStep,
}: {
  graph: RunGraph | null;
  records: StepRecord[];
  selectedStep: string | null;
  onSelectStep: (step: string) => void;
}) {
  const [scope, setScope] = useState("all");
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const validSteps = new Map(records.map((r) => [r.event.step_id, r]));
    let raw = graph.nodes.filter(
      (n) => !n.step_id || validSteps.has(n.step_id),
    );
    if (scope === "selected" && selectedStep) {
      const roots = new Set(
        raw.filter((n) => n.step_id === selectedStep).map((n) => n.id),
      );
      const ids = new Set(roots);
      for (const edge of graph.edges)
        if (roots.has(edge.source) || roots.has(edge.target)) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      raw = raw.filter((n) => ids.has(n.id));
    }
    const rows: Record<string, number> = { step: 0, claim: 0, evidence: 0 };
    const positions: Record<string, number> = {
      step: 20,
      claim: 335,
      evidence: 650,
    };
    const ns: EvidenceNode[] = raw.map((n) => {
      const rec = n.step_id ? validSteps.get(n.step_id) : null;
      return {
        id: n.id,
        type: "evidenceCard",
        position: { x: positions[n.kind], y: 40 + rows[n.kind]++ * 145 },
        data: {
          kind: n.kind,
          label: n.kind === "step" && rec ? stepTitle(rec) : n.label,
          stepId: n.step_id ?? "",
          level:
            n.kind === "claim"
              ? claimState(
                  n.label,
                  rec ?? undefined,
                  graph.edges.some(
                    (e) => e.source === n.id && e.relation === "supported_by",
                  ),
                )
              : "ok",
          selected: n.step_id === selectedStep,
          onSelect: onSelectStep,
        },
        ariaLabel: `${n.kind}: ${n.label}`,
        focusable: false,
        selected: n.step_id === selectedStep,
      };
    });
    const ids = new Set(ns.map((n) => n.id));
    const es: Edge[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        label: relationLabels[e.relation],
        style: {
          stroke: e.relation === "supported_by" ? "#07966a" : "#8e98aa",
          strokeWidth: 1.3,
          ...(e.relation === "parent" ? { strokeDasharray: "5 4" } : {}),
        },
        labelStyle: {
          fill: e.relation === "supported_by" ? "#067653" : "#607088",
          fontSize: 11,
        },
        labelBgStyle: {
          fill: e.relation === "supported_by" ? "#e8f7ef" : "#f5f7fa",
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.relation === "supported_by" ? "#07966a" : "#8e98aa",
        },
      }));
    return { nodes: ns, edges: es };
  }, [graph, records, scope, selectedStep, onSelectStep]);
  return (
    <section className="panel graph-panel" aria-labelledby="graph-title">
      <div className="panel-heading graph-heading">
        <div>
          <h2 id="graph-title">Evidence connections</h2>
          <p>Trace claims back to their sources</p>
        </div>
        <label className="sr-only" htmlFor="graph-scope">
          Graph scope
        </label>
        <select
          id="graph-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All nodes</option>
          <option value="selected">Selected step</option>
        </select>
      </div>
      <div className="graph-column-headings" aria-hidden="true">
        <span>Run steps</span>
        <span>Claims</span>
        <span>Evidence</span>
      </div>
      <div className="graph-canvas">
        {nodes.length ? (
          <ReactFlow
            key={`${scope}-${graph?.run_id}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.12}
            maxZoom={1.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#dce4ef"
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="empty">
            <GraphIcon size={30} />
            <h3>No connections yet</h3>
            <p>Evidence connections appear as your run progresses.</p>
          </div>
        )}
      </div>
      <div className="graph-legend">
        <span>
          <i className="line-swatch sequence" />
          Step sequence
        </span>
        <span>
          <i className="line-swatch support" />
          Evidence support
        </span>
        <span>
          <i className="claim-swatch" />
          Unsupported claim
        </span>
      </div>
      <p className="graph-note">
        Sequence shows order, not proof of causation. Unsupported claims have no
        support edge.
      </p>
    </section>
  );
}
