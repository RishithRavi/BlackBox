import type {
  Health,
  Metrics,
  RunGraph,
  StepRecord,
  StepsResponse,
} from "./types";

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, { signal });
  if (!resp.ok) {
    let detail: unknown = await resp.text();
    try {
      detail = JSON.parse(detail as string);
    } catch {
      /* keep text */
    }
    throw new ApiError(resp.status, detail);
  }
  return (await resp.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(
      `HTTP ${status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
}

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return getJson<Health>("/health", signal);
}

export async function getSteps(
  runId: string,
  signal?: AbortSignal,
): Promise<StepRecord[]> {
  const data = await getJson<StepsResponse>(
    `/runs/${encodeURIComponent(runId)}/steps`,
    signal,
  );
  return data.steps;
}

export function getGraph(
  runId: string,
  signal?: AbortSignal,
): Promise<RunGraph> {
  return getJson<RunGraph>(`/runs/${encodeURIComponent(runId)}/graph`, signal);
}

export function getMetrics(
  runId: string,
  signal?: AbortSignal,
): Promise<Metrics> {
  return getJson<Metrics>(`/runs/${encodeURIComponent(runId)}/metrics`, signal);
}

export function streamUrl(runId: string, after: number): string {
  return `${API_BASE}/runs/${encodeURIComponent(runId)}/stream?after=${after}`;
}

/** Factory seam so the dev mock can substitute a non-network source. */
export type StepStream = Pick<
  EventSource,
  "addEventListener" | "close" | "onopen" | "onerror" | "readyState"
>;

export function openStream(runId: string, after: number): StepStream {
  return new EventSource(streamUrl(runId, after));
}
