import { describe, expect, it } from "vitest";
import { graphSlice, layoutGraph } from "./graphLayout";
import { checkoutScenario } from "./scenarios";
import type { RunGraph, StepRecord } from "./types";
const records = [10, 14, 21].map((seq) => ({
  seq,
  event: {
    step_id: `c${seq}`,
    agent: "inventory_coder",
    content: "",
    run_id: "checkout_test",
  },
})) as StepRecord[];
const graph: RunGraph = {
  run_id: "checkout_test",
  nodes: [
    { id: "step:c14", kind: "step", label: "Missing symbol", step_id: "c14" },
    {
      id: "claim:c14:0",
      kind: "claim",
      label: "reserve_inventory_atomic",
      step_id: "c14",
      status: "unsupported",
    },
    {
      id: "evidence:c10:repo",
      kind: "evidence",
      label: "Earlier snapshot",
      step_id: "c10",
    },
    { id: "step:c21", kind: "step", label: "Later snapshot", step_id: "c21" },
    {
      id: "step:future",
      kind: "step",
      label: "Unrevealed event",
      step_id: "future",
    },
  ],
  edges: [
    {
      id: "contains",
      source: "step:c14",
      target: "claim:c14:0",
      relation: "contains",
    },
    {
      id: "check",
      source: "step:c14",
      target: "evidence:c10:repo",
      relation: "checked_against",
    },
    {
      id: "sequence",
      source: "step:c21",
      target: "step:c14",
      relation: "parent",
    },
    {
      id: "future",
      source: "step:future",
      target: "step:c21",
      relation: "parent",
    },
  ],
};
const base = {
  phase: "all",
  scope: "all",
  search: "",
  selectedStep: "c14",
  scenario: checkoutScenario,
};
describe("evidence graph navigation", () => {
  it("keeps real earlier evidence across a phase boundary without inventing support", () => {
    const phase = checkoutScenario.phases.find(
      (p) => p.start <= 14 && p.end >= 14,
    )!;
    const result = graphSlice(graph, records, { ...base, phase: phase.id });
    expect(result.nodes.some((n) => n.id === "evidence:c10:repo")).toBe(true);
    expect(result.edges.some((e) => e.relation === "checked_against")).toBe(
      true,
    );
    expect(result.edges.some((e) => e.relation === "supported_by")).toBe(false);
  });
  it("excludes unrevealed records and leaves no dangling edges", () => {
    const result = graphSlice(graph, records, { ...base, scope: "selected" });
    const ids = new Set(result.nodes.map((n) => n.id));
    expect(ids.has("step:future")).toBe(false);
    expect(
      result.edges.every((e) => ids.has(e.source) && ids.has(e.target)),
    ).toBe(true);
    expect(
      result.edges.every((e) =>
        graph.edges.some((source) => source.id === e.id),
      ),
    ).toBe(true);
  });
  it("finds claims and preserves their direct source context", () => {
    const result = graphSlice(graph, records, {
      ...base,
      search: "reserve_inventory_atomic",
    });
    expect(result.nodes.map((n) => n.id).sort()).toEqual([
      "claim:c14:0",
      "step:c14",
    ]);
  });
  it("lays out a branching map with finite positions and handles an empty search", () => {
    const positions = layoutGraph(graph.nodes, graph.edges, true);
    expect(positions.size).toBe(graph.nodes.length);
    expect(
      [...positions.values()].every(
        (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
      ),
    ).toBe(true);
    expect(
      graphSlice(graph, records, { ...base, search: "no matches" }).nodes,
    ).toEqual([]);
  });
});
