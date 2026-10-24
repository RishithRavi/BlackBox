// Pure run-state reducer: steps keyed by server-assigned seq, deduplicated.
// The UI never computes verdicts; it only stores persisted StepRecords.

import type { StepRecord, StreamEnvelope } from "./types";

export interface RunState {
  runId: string;
  /** seq -> record; seq is contiguous from 1 per the contract. */
  steps: Map<number, StepRecord>;
  maxSeq: number;
}

export function emptyRun(runId: string): RunState {
  return { runId, steps: new Map(), maxSeq: 0 };
}

/** Insert a record; identical-seq duplicates are ignored (retry/reconnect safe). */
export function applyRecord(state: RunState, rec: StepRecord): RunState {
  if (rec.seq <= 0 || !Number.isInteger(rec.seq)) return state;
  if (state.steps.has(rec.seq)) return state;
  const steps = new Map(state.steps);
  steps.set(rec.seq, rec);
  return { ...state, steps, maxSeq: Math.max(state.maxSeq, rec.seq) };
}

export function applyRecords(state: RunState, records: StepRecord[]): RunState {
  return records.reduce(applyRecord, state);
}

/** Accept a stream envelope only if it belongs to the active run. */
export function applyEnvelope(
  state: RunState,
  env: StreamEnvelope,
): RunState {
  if (env.kind !== "step" || env.run_id !== state.runId) return state;
  return applyRecord(state, { seq: env.seq, event: env.event, verdict: env.verdict });
}

/** Ordered view for the timeline. */
export function orderedSteps(state: RunState): StepRecord[] {
  return [...state.steps.values()].sort((a, b) => a.seq - b.seq);
}

/** Resolve a graph/evidence node id (e.g. "evidence:s02:repo", "step:s01",
 * "claim:s07:0") to the originating step id, or null. */
export function stepIdFromNodeId(nodeId: string): string | null {
  const parts = nodeId.split(":");
  if (parts.length < 2 || !parts[1]) return null;
  return parts[1];
}
