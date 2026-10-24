import { scenarioStepLabel } from "./scenarios";
import type { StepRecord } from "./types";

export const RULE_TITLES: Record<string, string> = {
  arg_provenance: "Unknown issue reference",
  package_missing: "Package not found",
  symbol_missing: "Missing function",
  claim_without_action: "Unverified test claim",
  unsupported_claim: "Unsupported claim",
  unknown_tool: "Unknown tool",
  tool_schema: "Invalid tool arguments",
  loop: "Repeated tool call",
};
export function stepTitle(r: StepRecord): string {
  const scenarioLabel = scenarioStepLabel(r);
  if (scenarioLabel) return scenarioLabel;
  const rule = r.verdict.flags[0]?.rule;
  if (rule) return RULE_TITLES[rule] ?? rule.replaceAll("_", " ");
  if (r.event.type === "user") return r.event.content.slice(0, 90);
  if (r.event.tool) {
    const names: Record<string, string> = {
      inspect_repo: "Inspect repository",
      lookup_package: "Look up package",
      install_package: "Install package",
      call_function: "Call repository function",
      run_tests: "Run test suite",
      create_pr: "Prepare pull request",
    };
    return names[r.event.tool.name] ?? r.event.tool.name;
  }
  if (r.event.type === "tool_result") return "Recorded tool result";
  return r.event.content
    .replace(/^(Accurate PR summary:|PR summary:|Summary:)\s*/i, "")
    .slice(0, 100);
}
export function resultObject(content: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
export function elapsed(ts: string, first: string): string {
  const seconds =
    Math.max(0, Math.floor((Date.parse(ts) - Date.parse(first)) / 1000)) || 0;
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Display backend evidence without upgrading missing semantic checks to findings. */
export function claimState(
  label: string,
  record: StepRecord | undefined,
  hasSupport: boolean,
): "ok" | "warn" | "block" | "unverified" {
  if (hasSupport) return "ok";
  if (!record) return "unverified";
  const flags = record.verdict.flags;
  const provenance = flags.find(
    (f) => f.rule === "arg_provenance" && f.span && label.includes(f.span),
  );
  if (provenance) return "block";
  if (record.verdict.semantic_status === "unavailable") return "unverified";
  if (
    flags.some(
      (f) =>
        f.rule === "unsupported_claim" || f.rule === "claim_without_action",
    )
  )
    return "warn";
  return "unverified";
}

export function formatLatency(value: number): string {
  return value < 1 ? `${value.toFixed(3)} ms` : `${Math.round(value)} ms`;
}
