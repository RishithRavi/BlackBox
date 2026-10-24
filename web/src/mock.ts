// DEV MOCK — offline UI development only (VITE_USE_MOCK=true).
// Produces canned envelopes so the timeline can be built without a backend.
// It is NEVER the detection source for the real demo and is clearly labeled
// in the UI when active.

import type {
  AgentEvent,
  Metrics,
  RunGraph,
  StepRecord,
  Verdict,
} from "./types";
import type { StepStream } from "./api";

let seq = 0;

function ev(
  stepId: string,
  type: AgentEvent["type"],
  content: string,
  extra: Partial<AgentEvent> = {},
): AgentEvent {
  return {
    schema_version: "1",
    run_id: "mock",
    step_id: stepId,
    parent_step_id: stepId === "s01" ? null : `s${String(Number(stepId.slice(1)) - 1).padStart(2, "0")}`,
    agent: "coder",
    type,
    content,
    ts: "2026-10-24T15:00:00Z",
    ...extra,
  };
}

function verdict(
  stepId: string,
  level: Verdict["level"],
  rules: string[],
  semantic: Verdict["semantic_status"] = "not_applicable",
): Verdict {
  return {
    schema_version: "1",
    run_id: "mock",
    step_id: stepId,
    score: level === "ok" ? 0 : 0.9,
    level,
    flags: rules.map((rule) => ({
      rule,
      message: `mock finding for ${rule}`,
      span: "",
      field_path: "/content",
      evidence_ids: [],
      confidence: 0.9,
    })),
    latency_ms: 5 + seq,
    semantic_status: semantic,
  };
}

const SCRIPT: Array<[AgentEvent, Verdict]> = [
  [ev("s01", "user", "Fix the cache expiry bug, then open a PR for issue 417."), verdict("s01", "ok", [])],
  [ev("s02", "tool_call", "Inspect repo.", { tool: { name: "inspect_repo", args: {} }, tool_call_id: "call_01" }), verdict("s02", "ok", [])],
  [ev("s03", "tool_result", '{"symbols":["repair_cache"],"diff":"-EXPIRY=3600\\n+EXPIRY=300","files":["cache.py"]}', { tool_call_id: "call_01" }), verdict("s03", "ok", [])],
  [ev("s04", "tool_call", "Install missing package.", { tool: { name: "install_package", "args": { name: "blackbox-demo-nonexistent-7f3c" } }, tool_call_id: "call_02" }), verdict("s04", "block", ["package_missing"])],
  [ev("s05", "llm", "All tests pass."), verdict("s05", "warn", ["claim_without_action"])],
  [ev("s06", "llm", "Summary: Added automatic retry with exponential backoff."), verdict("s06", "warn", ["unsupported_claim"], "unavailable")],
  [ev("s07", "final", "Done."), verdict("s07", "ok", [])],
];

function toRecord([event, v]: [AgentEvent, Verdict]): StepRecord {
  seq += 1;
  return { seq, event: { ...event }, verdict: v };
}

export function mockSteps(): StepRecord[] {
  seq = 0;
  return [];
}

export function mockGraph(): RunGraph {
  return { run_id: "mock", nodes: [], edges: [] };
}

export function mockMetrics(): Metrics {
  return {
    run_id: "mock",
    step_count: 0,
    flag_count: 0,
    levels: { ok: 0, warn: 0, block: 0 },
    p50_latency_ms: null,
    p95_latency_ms: null,
    semantic_status_counts: { laya: 0, fallback: 0, unavailable: 0, not_applicable: 0 },
  };
}

/** Emits the canned script as SSE-shaped messages on a timer. */
export function openMockStream(): StepStream {
  const listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  let i = 0;
  let closed = false;
  const timer = setInterval(() => {
    if (closed || i >= SCRIPT.length) return;
    const rec = toRecord(SCRIPT[i]);
    i += 1;
    const env = {
      schema_version: "1",
      kind: "step",
      run_id: "mock",
      seq: rec.seq,
      event: { ...rec.event, run_id: "mock" },
      verdict: { ...rec.verdict, run_id: "mock" },
    };
    const msg = { data: JSON.stringify(env), lastEventId: String(rec.seq) } as MessageEvent;
    for (const fn of listeners.get("step") ?? []) fn(msg);
  }, 600);
  return {
    readyState: 0,
    onopen: null,
    onerror: null,
    addEventListener(type: string, fn: (e: MessageEvent) => void) {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    close() {
      closed = true;
      clearInterval(timer);
    },
  } as StepStream;
}
