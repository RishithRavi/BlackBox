import { describe, expect, it } from "vitest";
import { claimState } from "./presentation";
import { sampleRecords } from "./demoData";

describe("graph claim states", () => {
  const unsupported = sampleRecords.find((r) =>
    r.verdict.flags.some((f) => f.rule === "unsupported_claim"),
  )!;
  it("does not label an unavailable semantic check as an unsupported claim", () => {
    const unavailable = {
      ...unsupported,
      verdict: {
        ...unsupported.verdict,
        flags: [],
        semantic_status: "unavailable" as const,
      },
    };
    expect(claimState("Added retry", unavailable, false)).toBe("unverified");
  });
  it("shows a backend semantic finding without inventing support", () => {
    expect(claimState(unsupported.event.content, unsupported, false)).toBe(
      "warn",
    );
    expect(claimState("Unknown claim", undefined, false)).toBe("unverified");
  });
  it("shows support only when the supplied graph has a support edge", () => {
    expect(claimState("Cache expiry updated", sampleRecords[15], true)).toBe(
      "ok",
    );
    expect(claimState("Cache expiry updated", sampleRecords[15], false)).toBe(
      "unverified",
    );
  });
  it("keeps provenance findings separate from unchecked semantic claims", () => {
    const issue = sampleRecords[9];
    expect(claimState("Issue 4821", issue, false)).toBe("block");
    expect(claimState("An unrelated semantic claim", issue, false)).toBe(
      "unverified",
    );
  });
});
