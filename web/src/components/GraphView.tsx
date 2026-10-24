import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
  ArrowsOutSimple,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { stepTitle, claimState } from "../presentation";
import { graphSlice, layoutGraph } from "../graphLayout";
import { phaseForSeq, type Scenario } from "../scenarios";
import type { GraphNode, RunGraph, StepRecord } from "../types";
import { StepDetail } from "./StepDetail";

type EvidenceNode = Node<
  {
    kind: string;
    label: string;
    stepId: string;
    agent: string;
    level: string;
    selected: boolean;
    compact: boolean;
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
      onClick={(event) => {
        event.stopPropagation();
        data.onSelect(data.stepId);
      }}
      aria-label={`${data.kind}: ${data.label}`}
      className={`nodrag nopan graph-card ${data.level} ${data.selected ? "is-selected" : ""} ${data.compact ? "compact" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Icon size={19} />
      <div>
        <span className="node-kind">{data.kind}</span>
        <strong title={data.label}>{data.label}</strong>
        <span className="node-step">
          {data.stepId}
          {data.kind === "step" && data.agent
            ? ` · ${data.agent.replaceAll("_", " ")}`
            : ""}
        </span>
        {data.kind === "claim" && (
          <span className={`badge ${data.level}`}>
            {data.level === "unverified"
              ? "Unverified"
              : data.level === "ok"
                ? "Supported"
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
  derived_from: "tool result",
  checked_against: "checked against",
};
function levelForNode(
  n: GraphNode,
  record: StepRecord | undefined,
  graph: RunGraph,
) {
  if (n.kind !== "claim") return "ok";
  if (n.status === "supported") return "ok";
  if (n.status === "unknown") return "unverified";
  if (n.status === "unsupported") {
    const hardMatch = record?.verdict.flags.some(
      (f) =>
        f.rule !== "unsupported_claim" &&
        f.span &&
        (n.label.includes(f.span) || f.span.includes(n.label)) &&
        f.confidence >= 0.8,
    );
    return hardMatch ? "block" : "warn";
  }
  return claimState(
    n.label,
    record,
    graph.edges.some((e) => e.source === n.id && e.relation === "supported_by"),
  );
}

export function GraphView({
  graph,
  records,
  selectedStep,
  onSelectStep,
  scenario = null,
  sample = false,
}: {
  graph: RunGraph | null;
  records: StepRecord[];
  selectedStep: string | null;
  onSelectStep: (step: string) => void;
  scenario?: Scenario | null;
  sample?: boolean;
}) {
  const detailed =
    Boolean(scenario?.phases.length) || (graph?.nodes.length ?? 0) > 60;
  const [scope, setScope] = useState(detailed ? "selected" : "all");
  const [phase, setPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [showSequence, setShowSequence] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setScope(detailed ? "selected" : "all");
    setPhase("all");
    setSearch("");
    setShowSequence(true);
  }, [graph?.run_id, detailed]);
  useEffect(() => {
    if (expanded && !dialog.current?.open) dialog.current?.showModal();
    if (!expanded && dialog.current?.open) dialog.current?.close();
  }, [expanded]);
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as EvidenceNode[], edges: [] as Edge[] };
    const filteringGraph = showSequence
      ? graph
      : {
          ...graph,
          edges: graph.edges.filter(
            (e) => !["parent", "derived_from"].includes(e.relation),
          ),
        };
    const sliced = graphSlice(filteringGraph, records, {
      phase,
      scope,
      selectedStep,
      search,
      scenario,
    });
    const recordMap = new Map(records.map((r) => [r.event.step_id, r]));
    const visibleEdges = sliced.edges.filter(
      (e) => showSequence || !["parent", "derived_from"].includes(e.relation),
    );
    const positions = layoutGraph(sliced.nodes, visibleEdges, detailed);
    const ns: EvidenceNode[] = sliced.nodes.map((n) => {
      const record = n.step_id ? recordMap.get(n.step_id) : undefined;
      const label = record && n.kind !== "claim" ? stepTitle(record) : n.label;
      return {
        id: n.id,
        type: "evidenceCard",
        initialWidth: detailed ? 210 : 235,
        initialHeight: n.kind === "claim" ? 140 : 110,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          kind: n.kind,
          label,
          stepId: n.step_id ?? "",
          agent: record?.event.agent ?? "",
          level: levelForNode(n, record, graph),
          selected: n.step_id === selectedStep,
          compact: detailed,
          onSelect: onSelectStep,
        },
        ariaLabel: `${n.kind}: ${label}`,
        focusable: false,
      };
    });
    const es: Edge[] = visibleEdges.map((e) => {
      const color =
        e.relation === "supported_by"
          ? "#07966a"
          : e.relation === "checked_against"
            ? "#b58537"
            : e.relation === "derived_from"
              ? "#9580b3"
              : "#94a0b4";
      return {
        ...e,
        type: "smoothstep",
        label: relationLabels[e.relation],
        style: {
          stroke: color,
          strokeWidth: e.relation === "supported_by" ? 1.7 : 1.1,
          ...(["parent", "derived_from", "checked_against"].includes(e.relation)
            ? { strokeDasharray: "5 4" }
            : {}),
        },
        labelStyle: { fill: color, fontSize: 10 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });
    return { nodes: ns, edges: es };
  }, [
    graph,
    records,
    phase,
    scope,
    selectedStep,
    search,
    scenario,
    showSequence,
    detailed,
    onSelectStep,
  ]);
  const selectedRecord =
    records.find((r) => r.event.step_id === selectedStep) ?? null;
  const changePhase = (id: string) => {
    setPhase(id);
    setScope("all");
    const inPhase = records.filter(
      (r) => id === "all" || phaseForSeq(scenario, r.seq)?.id === id,
    );
    const next = inPhase.find((r) => r.verdict.flags.length) ?? inPhase[0];
    if (next) onSelectStep(next.event.step_id);
  };
  const renderContent = () => (
    <>
      <div className="panel-heading graph-heading">
        <div>
          <h2 id={expanded ? "graph-dialog-title" : "graph-title"}>
            Evidence connections
          </h2>
          <p>
            {nodes.length} visible nodes · {edges.length} connections
            {graph ? ` · ${graph.nodes.length} nodes in run` : ""}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Close expanded graph" : "Expand graph"}
        >
          {expanded ? <X size={18} /> : <ArrowsOutSimple size={18} />}
        </button>
      </div>
      <div className="graph-toolbar">
        {scenario?.phases.length ? (
          <>
            <label
              className="sr-only"
              htmlFor={expanded ? "modal-phase" : "graph-phase"}
            >
              Graph phase
            </label>
            <select
              id={expanded ? "modal-phase" : "graph-phase"}
              value={phase}
              onChange={(e) => changePhase(e.target.value)}
            >
              <option value="all">All phases</option>
              {scenario.phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label
          className="sr-only"
          htmlFor={expanded ? "modal-scope" : "graph-scope"}
        >
          Graph scope
        </label>
        <select
          id={expanded ? "modal-scope" : "graph-scope"}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All nodes</option>
          <option value="selected">Selected + neighbours</option>
        </select>
        <label className="graph-search">
          <MagnifyingGlass size={14} />
          <input
            aria-label="Find graph nodes"
            placeholder="Find a node…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setScope("all");
            }}
          />
        </label>
        <label className="graph-sequence">
          <input
            type="checkbox"
            checked={showSequence}
            onChange={(e) => setShowSequence(e.target.checked)}
          />
          Sequence links
        </label>
      </div>
      <div className={expanded ? "expanded-graph-body" : ""}>
        <div className="graph-visual-area">
          {!detailed && (
            <div className="graph-column-headings" aria-hidden="true">
              <span>Run steps</span>
              <span>Claims</span>
              <span>Evidence</span>
            </div>
          )}
          <div className="graph-canvas">
            {nodes.length ? (
              <ReactFlow
                key={`${scope}-${phase}-${search}-${showSequence}-${graph?.run_id}-${expanded}`}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => onSelectStep(node.data.stepId)}
                fitView
                fitViewOptions={{ padding: 0.12 }}
                minZoom={0.025}
                maxZoom={1.6}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="#dce4ef"
                />
                <Controls showInteractive={false} />
                {detailed && (
                  <MiniMap
                    style={{ width: 110, height: 75 }}
                    pannable
                    zoomable
                    nodeColor={(n) =>
                      n.data.level === "block"
                        ? "#ef9fac"
                        : n.data.level === "warn"
                          ? "#edcb82"
                          : n.data.kind === "evidence"
                            ? "#addbc9"
                            : "#c5d5f6"
                    }
                    maskColor="#eef3fa99"
                  />
                )}
              </ReactFlow>
            ) : (
              <div className="empty">
                <GraphIcon size={30} />
                <h3>No matching connections</h3>
                <p>Try another phase, clear the search, or select a step.</p>
              </div>
            )}
          </div>
          <div className="graph-legend">
            <span>
              <i className="line-swatch support" />
              Evidence support
            </span>
            <span>
              <i className="line-swatch checked" />
              Checked against
            </span>
            <span>
              <i className="line-swatch sequence" />
              Sequence / tool flow
            </span>
            <span>
              <i className="claim-swatch" />
              Unsupported claim
            </span>
          </div>
          <p className="graph-note">
            Sequence shows order, not causation. Checked-against links identify
            inspected evidence, not support. Select a phase or neighbourhood to
            explore the larger map.
          </p>
        </div>
        {expanded && (
          <StepDetail
            record={selectedRecord}
            records={records}
            graph={graph}
            onJumpToStep={onSelectStep}
            sample={sample}
          />
        )}
      </div>
    </>
  );
  return (
    <>
      <section className="panel graph-panel" aria-labelledby="graph-title">
        {expanded ? (
          <div className="empty">
            <GraphIcon size={30} />
            <h3>Graph open in expanded view</h3>
            <button className="text-button" onClick={() => setExpanded(false)}>
              Return to dashboard
            </button>
          </div>
        ) : (
          renderContent()
        )}
      </section>
      <dialog
        className="graph-dialog"
        ref={dialog}
        onCancel={() => setExpanded(false)}
        aria-labelledby="graph-dialog-title"
      >
        {expanded && renderContent()}
      </dialog>
    </>
  );
}
