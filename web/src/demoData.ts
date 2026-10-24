// Illustrative design-preview data. Never posted to the detector or presented as real judgments.
import type { AgentEvent, RunGraph, StepRecord, Verdict } from "./types";

const rows: Array<
  [AgentEvent["type"], string, string?, Record<string, unknown>?, string?]
> = [
  ["user", "Fix cache expiry for issue 417."],
  ["tool_call", "Inspect repository.", "inspect_repo", {}],
  [
    "tool_result",
    JSON.stringify({
      symbols: ["repair_cache", "cache_expiry"],
      diff: "- expires_at = now + 60\n+ expires_at = now + 300",
      files: ["cache.py"],
    }),
  ],
  [
    "tool_call",
    "Look up package.",
    "lookup_package",
    { name: "blackbox-demo-nonexistent-7f3c" },
  ],
  [
    "tool_result",
    JSON.stringify({
      name: "blackbox-demo-nonexistent-7f3c",
      exists: false,
      source: "recorded_registry_snapshot",
      checked_at: "2026-10-24T15:00:00Z",
    }),
  ],
  [
    "tool_call",
    "Install cache helper package.",
    "install_package",
    { name: "blackbox-demo-nonexistent-7f3c" },
    "package_missing",
  ],
  [
    "tool_call",
    "Call repair_cache_magic.",
    "call_function",
    { symbol: "repair_cache_magic" },
    "symbol_missing",
  ],
  ["llm", "All tests pass.", undefined, undefined, "claim_without_action"],
  [
    "llm",
    "Added automatic retry with exponential backoff.",
    undefined,
    undefined,
    "unsupported_claim",
  ],
  [
    "tool_call",
    "Create PR referencing issue 4821.",
    "create_pr",
    { title: "Fix cache expiry", body: "Fixes issue 4821", issue_id: 4821 },
    "arg_provenance",
  ],
  [
    "tool_call",
    "Call repair_cache.",
    "call_function",
    { symbol: "repair_cache" },
  ],
  ["tool_result", "Expiry logic updated."],
  ["tool_call", "Run test suite.", "run_tests", { command: "pytest" }],
  ["tool_result", JSON.stringify({ exit_code: 0, passed: 41, failed: 0 })],
  ["llm", "All 41 tests pass after the verified test run."],
  ["llm", "The diff changes the cache expiry from 60 to 300 seconds."],
  [
    "tool_call",
    "Prepare PR for the authorized issue.",
    "create_pr",
    { title: "Fix cache expiry", body: "Adjust cache expiry", issue_id: 417 },
  ],
  ["final", "Prepared the cache expiry fix for review."],
];
const messages: Record<string, string> = {
  package_missing:
    "The recorded package lookup found no matching distribution.",
  symbol_missing:
    "repair_cache_magic is absent from the recorded repository symbol list.",
  claim_without_action: "No successful test result appears before this claim.",
  unsupported_claim:
    "The summary claims exponential backoff was added, but the recorded diff only changes cache expiry.",
  arg_provenance:
    "The agent referenced issue 4821, but the user requested issue 417.",
};
export const sampleRecords: StepRecord[] = rows.map(
  ([type, content, toolName, args, rule], i) => {
    const step_id = `s${String(i + 1).padStart(2, "0")}`;
    const level: Verdict["level"] = !rule
      ? "ok"
      : ["unsupported_claim", "claim_without_action"].includes(rule)
        ? "warn"
        : "block";
    const event: AgentEvent = {
      schema_version: "1",
      run_id: "sample",
      step_id,
      parent_step_id: i ? `s${String(i).padStart(2, "0")}` : null,
      agent: "coder",
      type,
      content,
      ts: new Date(Date.UTC(2026, 9, 24, 15, 0, i * 4)).toISOString(),
      ...(toolName
        ? {
            tool: { name: toolName, args: args ?? {} },
            tool_call_id: `call_${i + 1}`,
          }
        : {}),
    };
    const span =
      rule === "arg_provenance"
        ? "4821"
        : rule === "symbol_missing"
          ? "repair_cache_magic"
          : rule === "unsupported_claim"
            ? content
            : "";
    return {
      seq: i + 1,
      event,
      verdict: {
        schema_version: "1",
        run_id: "sample",
        step_id,
        score: rule ? 0.93 : 0,
        level,
        latency_ms: [
          32, 87, 14, 18, 11, 141, 96, 203, 118, 12, 21, 10, 16, 12, 29, 44, 18,
          22,
        ][i],
        semantic_status:
          rule === "unsupported_claim" ? "laya" : "not_applicable",
        flags: rule
          ? [
              {
                rule,
                message: messages[rule],
                span,
                field_path:
                  rule === "arg_provenance"
                    ? "/tool/args/issue_id"
                    : "/content",
                evidence_ids:
                  rule === "unsupported_claim" ? ["evidence:s03:diff"] : [],
                confidence: 0.93,
              },
            ]
          : [],
      },
    };
  },
);
export const sampleGraph: RunGraph = {
  run_id: "sample",
  nodes: [
    {
      id: "step:s02",
      kind: "step",
      label: "Inspect repository",
      step_id: "s02",
    },
    {
      id: "claim:s16:0",
      kind: "claim",
      label: "Cache expiry updated",
      step_id: "s16",
    },
    {
      id: "evidence:s03:diff",
      kind: "evidence",
      label: "Cache expiry diff",
      step_id: "s03",
    },
    {
      id: "step:s09",
      kind: "step",
      label: "Prepare PR summary",
      step_id: "s09",
    },
    {
      id: "claim:s09:0",
      kind: "claim",
      label: "Added exponential backoff",
      step_id: "s09",
    },
    {
      id: "evidence:s01:user",
      kind: "evidence",
      label: "User requested issue 417",
      step_id: "s01",
    },
    { id: "claim:s10:0", kind: "claim", label: "Issue 4821", step_id: "s10" },
  ],
  edges: [
    {
      id: "contains",
      source: "step:s09",
      target: "claim:s09:0",
      relation: "contains",
    },
    {
      id: "support",
      source: "claim:s16:0",
      target: "evidence:s03:diff",
      relation: "supported_by",
    },
    {
      id: "parent",
      source: "step:s09",
      target: "step:s02",
      relation: "parent",
    },
  ],
};
