import { describe, expect, it } from "vitest";
import { pipelineSignals } from "./pipelinePresentation";
import { sampleRecords } from "./demoData";

describe("pipeline signal presentation", () => {
  it("keeps rule confidence, semantic confidence and stored fused score distinct", () => {
    const record = sampleRecords[8];
    const combined = {
      ...record,
      verdict: {
        ...record.verdict,
        score: 0.97,
        flags: [
          ...record.verdict.flags,
          {
            rule: "arg_provenance",
            message: "missing source",
            span: "4821",
            field_path: "/content",
            evidence_ids: [],
            confidence: 0.88,
          },
        ],
      },
    };
    expect(pipelineSignals(combined)).toEqual({
      rules: 0.88,
      semantic: 0.93,
      score: 0.97,
      semanticStatus: "laya",
    });
  });
  it("does not turn missing/unavailable semantic results into zero confidence", () => {
    const source = sampleRecords[8];
    const record = {
      ...source,
      verdict: {
        ...source.verdict,
        semantic_status: "unavailable" as const,
        flags: [],
        score: 0,
      },
    };
    expect(pipelineSignals(record)).toEqual({
      rules: null,
      semantic: null,
      score: 0,
      semanticStatus: "unavailable",
    });
  });
  it("does not fabricate a trace for an unselected step", () => {
    expect(pipelineSignals(null)).toEqual({
      rules: null,
      semantic: null,
      score: null,
      semanticStatus: "waiting",
    });
  });
});
