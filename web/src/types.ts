// Local copy of the frozen v1 wire contract (Session B copy; A owns schema.json).

export type EventType = "user" | "llm" | "tool_call" | "tool_result" | "final";
export type Level = "ok" | "warn" | "block";
export type SemanticStatus =
  "laya" | "fallback" | "unavailable" | "not_applicable";

export interface ToolSpec {
  name: string;
  args: Record<string, unknown>;
}

export interface AgentEvent {
  schema_version: string;
  run_id: string;
  step_id: string;
  parent_step_id: string | null;
  agent: string;
  type: EventType;
  content: string;
  tool?: ToolSpec;
  tool_call_id?: string;
  ts: string;
}

export interface Finding {
  rule: string;
  message: string;
  span: string;
  field_path: string;
  evidence_ids: string[];
  confidence: number;
}

export interface Verdict {
  schema_version: string;
  run_id: string;
  step_id: string;
  score: number;
  level: Level;
  flags: Finding[];
  latency_ms: number;
  semantic_status: SemanticStatus;
}

export interface StepRecord {
  seq: number;
  event: AgentEvent;
  verdict: Verdict;
}

export interface StreamEnvelope {
  schema_version: string;
  kind: "step";
  run_id: string;
  seq: number;
  event: AgentEvent;
  verdict: Verdict;
}

export type NodeKind = "step" | "claim" | "evidence";
export type Relation =
  "parent" | "contains" | "supported_by" | "derived_from" | "checked_against";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  step_id?: string;
  status?: "supported" | "unsupported" | "unknown";
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: Relation;
}

export interface RunGraph {
  run_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Metrics {
  run_id: string;
  step_count: number;
  flag_count: number;
  levels: { ok: number; warn: number; block: number };
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  semantic_status_counts: {
    laya: number;
    fallback: number;
    unavailable: number;
    not_applicable: number;
  };
}

export interface Health {
  status: string;
  schema_version: string;
  semantic_status: "laya" | "fallback" | "unavailable";
}

export interface StepsResponse {
  run_id: string;
  steps: StepRecord[];
}
