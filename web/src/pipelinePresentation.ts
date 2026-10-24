import type { StepRecord } from "./types";

export function pipelineSignals(record: StepRecord | null) {
  if (!record)
    return {
      rules: null,
      semantic: null,
      score: null,
      semanticStatus: "waiting" as const,
    };
  const ruleFindings = record.verdict.flags.filter(
    (f) => f.rule !== "unsupported_claim",
  );
  const semanticFindings = record.verdict.flags.filter(
    (f) => f.rule === "unsupported_claim",
  );
  return {
    rules: ruleFindings.length
      ? Math.max(...ruleFindings.map((f) => f.confidence))
      : null,
    semantic: semanticFindings.length
      ? Math.max(...semanticFindings.map((f) => f.confidence))
      : null,
    // Always show the backend's verdict. This view never calculates a new verdict.
    score: record.verdict.score,
    semanticStatus: record.verdict.semantic_status,
  };
}
