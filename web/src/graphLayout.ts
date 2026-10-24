import dagre, {
  type Graph,
  type GraphLabel,
  type NodeLabel,
} from "@dagrejs/dagre";
import type { GraphNode, RunGraph, StepRecord } from "./types";
import { phaseForSeq, type Scenario } from "./scenarios";

/** Filter with explicit graph neighbours; no invented evidence or causal links. */
export function graphSlice(
  graph: RunGraph,
  records: StepRecord[],
  options: {
    phase: string;
    scope: string;
    selectedStep: string | null;
    search: string;
    scenario: Scenario | null;
  },
) {
  const recordMap = new Map(records.map((r) => [r.event.step_id, r]));
  const valid = graph.nodes.filter(
    (n) => !n.step_id || recordMap.has(n.step_id),
  );
  const validIds = new Set(valid.map((n) => n.id));
  const validEdges = graph.edges.filter((e) => validIds.has(e.source) && validIds.has(e.target));
  let roots = new Set(
    valid
      .filter((n) => {
        const record = n.step_id ? recordMap.get(n.step_id) : null;
        const phaseMatches =
          options.phase === "all" ||
          (record &&
            phaseForSeq(options.scenario, record.seq)?.id === options.phase);
        const searchMatches =
          !options.search ||
          `${n.id} ${n.label} ${record?.event.agent ?? ""} ${record?.event.content ?? ""}`
            .toLowerCase()
            .includes(options.search.toLowerCase());
        return (
          phaseMatches &&
          searchMatches &&
          (options.scope !== "selected" || n.step_id === options.selectedStep)
        );
      })
      .map((n) => n.id),
  );
  const visible = new Set(roots);
  const depth =
    options.scope === "selected"
      ? 2
      : options.phase !== "all" || options.search
        ? 1
        : 0;
  for (let pass = 0; pass < depth; pass++) {
    const next = new Set<string>();
    for (const edge of validEdges) {
      if (roots.has(edge.source)) {
        visible.add(edge.target);
        next.add(edge.target);
      }
      if (roots.has(edge.target)) {
        visible.add(edge.source);
        next.add(edge.source);
      }
    }
    roots = next;
  }
  const nodes = valid.filter((n) => visible.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: validEdges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

export function layoutGraph(
  nodes: GraphNode[],
  edges: RunGraph["edges"],
  network: boolean,
) {
  const positions = new Map<string, { x: number; y: number }>();
  if (!network) {
    const row: Record<string, number> = { step: 0, claim: 0, evidence: 0 };
    const x: Record<string, number> = { step: 20, claim: 335, evidence: 650 };
    for (const n of nodes)
      positions.set(n.id, { x: x[n.kind], y: 40 + row[n.kind]++ * 145 });
    return positions;
  }
  // Pack independently laid-out evidence components so disconnected
  // observations don't turn the full map into a single tall strip.
  const rankingEdges = edges.filter(
    (e) => e.relation !== "parent" && e.relation !== "derived_from",
  );
  const neighbours = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const edge of rankingEdges) {
    neighbours.get(edge.source)?.push(edge.target);
    neighbours.get(edge.target)?.push(edge.source);
  }
  const visited = new Set<string>();
  const components: {
    ids: string[];
    graph: Graph<GraphLabel, NodeLabel>;
    width: number;
    height: number;
  }[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const ids: string[] = [];
    const pending = [node.id];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      ids.push(id);
      for (const next of neighbours.get(id) ?? [])
        if (!visited.has(next)) pending.push(next);
    }
    const idsSet = new Set(ids);
    const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel>()
      .setGraph({
        rankdir: "LR",
        ranksep: 70,
        nodesep: 28,
        marginx: 0,
        marginy: 0,
      })
      .setDefaultEdgeLabel(() => ({}));
    for (const id of ids)
      g.setNode(id, {
        width: 210,
        height: nodeMap.get(id)?.kind === "claim" ? 140 : 110,
      });
    for (const e of rankingEdges)
      if (idsSet.has(e.source) && idsSet.has(e.target))
        g.setEdge(e.source, e.target);
    dagre.layout(g);
    components.push({
      ids,
      graph: g,
      width: g.graph().width ?? 210,
      height: g.graph().height ?? 110,
    });
  }
  const gap = 90;
  const area = components.reduce(
    (sum, c) => sum + (c.width + gap) * (c.height + gap),
    0,
  );
  const targetWidth = Math.max(
    900,
    Math.sqrt(area * 1.7),
    ...components.map((c) => c.width),
  );
  let x = 24;
  let y = 24;
  let rowHeight = 0;
  for (const component of components) {
    if (x > 24 && x + component.width > targetWidth) {
      x = 24;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    for (const id of component.ids) {
      const p = component.graph.node(id);
      positions.set(id, {
        x: x + (p.x ?? 0) - p.width / 2,
        y: y + (p.y ?? 0) - p.height / 2,
      });
    }
    x += component.width + gap;
    rowHeight = Math.max(rowHeight, component.height);
  }
  return positions;
}
