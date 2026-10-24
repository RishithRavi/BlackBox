import { describe, expect, it } from "vitest";
import {
  applyEnvelope,
  applyRecords,
  emptyRun,
  orderedSteps,
  stepIdFromNodeId,
} from "./runState";
import type { StepRecord, StreamEnvelope } from "./types";

function rec(seq: number, stepId = `s${seq}`): StepRecord {
  return {
    seq,
    event: {
      schema_version: "1",
      run_id: "r1",
      step_id: stepId,
      parent_step_id: null,
      agent: "coder",
      type: "llm",
      content: `step ${seq}`,
      ts: "2026-10-24T15:00:00Z",
    },
    verdict: {
      schema_version: "1",
      run_id: "r1",
      step_id: stepId,
      score: 0,
      level: "ok",
      flags: [],
      latency_ms: 1,
      semantic_status: "not_applicable",
    },
  };
}

function env(seq: number, runId = "r1"): StreamEnvelope {
  const r = rec(seq);
  return {
    schema_version: "1",
    kind: "step",
    run_id: runId,
    seq,
    event: r.event,
    verdict: r.verdict,
  };
}

describe("runState", () => {
  it("stores snapshot records and tracks max seq", () => {
    const s = applyRecords(emptyRun("r1"), [rec(1), rec(2), rec(3)]);
    expect(s.maxSeq).toBe(3);
    expect(orderedSteps(s).map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it("deduplicates reconnect/redelivery by seq", () => {
    let s = applyRecords(emptyRun("r1"), [rec(1), rec(2)]);
    s = applyEnvelope(s, env(2));
    s = applyEnvelope(s, env(1));
    expect(s.steps.size).toBe(2);
    expect(s.maxSeq).toBe(2);
  });

  it("orders out-of-order arrivals by seq", () => {
    let s = emptyRun("r1");
    s = applyEnvelope(s, env(3));
    s = applyEnvelope(s, env(1));
    s = applyEnvelope(s, env(2));
    expect(orderedSteps(s).map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it("drops envelopes from a different run (stale stream)", () => {
    const s = applyEnvelope(emptyRun("r1"), env(1, "other_run"));
    expect(s.steps.size).toBe(0);
    expect(s.maxSeq).toBe(0);
  });

  it("switching runs starts from a clean map", () => {
    const a = applyRecords(emptyRun("r1"), [rec(1), rec(2)]);
    const b = emptyRun("r2");
    expect(a.steps.size).toBe(2);
    expect(b.steps.size).toBe(0);
    expect(b.maxSeq).toBe(0);
  });

  it("maps graph node ids back to step ids", () => {
    expect(stepIdFromNodeId("step:s01")).toBe("s01");
    expect(stepIdFromNodeId("claim:s07:0")).toBe("s07");
    expect(stepIdFromNodeId("evidence:s02:repo")).toBe("s02");
    expect(stepIdFromNodeId("bogus")).toBeNull();
  });
});
