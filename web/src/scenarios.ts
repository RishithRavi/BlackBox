import checkout from "./checkoutScenario.json";
import type { StepRecord } from "./types";
export interface ScenarioPhase {
  id: string;
  title: string;
  description: string;
  start: number;
  end: number;
}
export interface Scenario {
  id: string;
  title: string;
  description: string;
  run_id: string;
  run_prefix: string;
  recording: string;
  step_count: number;
  phases: ScenarioPhase[];
  step_labels: Record<string, string>;
}
export const checkoutScenario: Scenario = checkout;
export const cacheScenario: Scenario = {
  id: "cache",
  title: "Fix cache expiry",
  description: "The original five-failure walkthrough.",
  run_id: "laya_live_001",
  run_prefix: "laya_",
  recording: "agent/runs/demo.jsonl",
  step_count: 24,
  phases: [],
  step_labels: {},
};
export const scenarioExamples = [cacheScenario, checkoutScenario];
export function scenarioForRun(runId: string): Scenario | null {
  if (runId.startsWith(checkoutScenario.run_prefix)) return checkoutScenario;
  if (
    runId.startsWith("demo_") ||
    runId.startsWith("laya_") ||
    runId === "sample"
  )
    return cacheScenario;
  return null;
}
export function phaseForSeq(scenario: Scenario | null, seq: number) {
  return scenario?.phases.find((p) => seq >= p.start && seq <= p.end);
}
export function scenarioStepLabel(record: StepRecord): string | undefined {
  return scenarioForRun(record.event.run_id)?.step_labels[record.event.step_id];
}
