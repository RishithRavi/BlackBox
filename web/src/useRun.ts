import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  USE_MOCK,
  getGraph,
  getHealth,
  getMetrics,
  getSteps,
  openStream,
} from "./api";
import { mockGraph, mockMetrics, openMockStream } from "./mock";
import {
  applyEnvelope,
  applyRecords,
  emptyRun,
  orderedSteps,
  type RunState,
} from "./runState";
import type { Health, Metrics, RunGraph, StepRecord } from "./types";

export type ConnStatus =
  "connecting" | "live" | "reconnecting" | "offline" | "mock";

export interface UseRun {
  runId: string;
  state: RunState;
  records: StepRecord[];
  status: ConnStatus;
  health: Health | null;
  graph: RunGraph | null;
  metrics: Metrics | null;
  error: string | null;
  setRunId: (id: string) => void;
}

const DEBOUNCE_MS = 400;
const HEALTH_POLL_MS = 10000;

export function useRun(initialRunId: string, enabled = true): UseRun {
  const [runId, setRunId] = useState(initialRunId);
  const [state, setState] = useState<RunState>(() => emptyRun(initialRunId));
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [health, setHealth] = useState<Health | null>(null);
  const [graph, setGraph] = useState<RunGraph | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Backend health: polled so degraded semantic status stays visible.
  useEffect(() => {
    if (!enabled) return;
    if (USE_MOCK) {
      setHealth({
        status: "ok",
        schema_version: "1",
        semantic_status: "unavailable",
      });
      return;
    }
    let cancelled = false;
    const tick = () => {
      getHealth()
        .then((h) => !cancelled && setHealth(h))
        .catch(() => !cancelled && setHealth(null));
    };
    tick();
    const t = setInterval(tick, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  // Run lifecycle: fresh state, snapshot load, then tail via SSE.
  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const generation = { current: true };
    const abort = new AbortController();
    let stream: ReturnType<typeof openStream> | null = null;

    // Clear run-specific state so two runs never mix.
    setState(emptyRun(runId));
    setGraph(null);
    setMetrics(null);
    setError(null);
    setStatus(USE_MOCK ? "mock" : "connecting");

    let derivedRequest = 0;
    const refreshDerived = () => {
      const request = ++derivedRequest;
      if (USE_MOCK) {
        setGraph(mockGraph());
        setMetrics(mockMetrics());
        return;
      }
      getGraph(runId, abort.signal)
        .then(
          (g) =>
            generation.current && request === derivedRequest && setGraph(g),
        )
        .catch(() => {});
      getMetrics(runId, abort.signal)
        .then(
          (m) =>
            generation.current && request === derivedRequest && setMetrics(m),
        )
        .catch(() => {});
    };

    const scheduleDerived = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refreshDerived, DEBOUNCE_MS);
    };

    if (USE_MOCK) {
      stream = openMockStream();
      stream.addEventListener("step", (e: Event) => {
        if (!generation.current) return;
        const msg = e as MessageEvent<string>;
        try {
          const env = { ...JSON.parse(msg.data), run_id: runId };
          env.event = { ...env.event, run_id: runId };
          env.verdict = { ...env.verdict, run_id: runId };
          setState((s) => applyEnvelope(s, env));
        } catch {
          /* ignore malformed mock line */
        }
        scheduleDerived();
      });
      refreshDerived();
      return () => {
        generation.current = false;
        stream?.close();
      };
    }

    getSteps(runId, abort.signal)
      .then((records) => {
        if (!generation.current) return;
        setState((s) => applyRecords(s, records));
        return records;
      })
      .then((records) => {
        if (!generation.current || !records) return;
        const maxSeq = records.reduce((m, r) => Math.max(m, r.seq), 0);
        stream = openStream(runId, maxSeq);
        stream.onopen = () => {
          if (generation.current) {
            setStatus("live");
            setError(null);
            refreshDerived();
          }
        };
        stream.onerror = () => generation.current && setStatus("reconnecting");
        stream.addEventListener("step", (e: Event) => {
          if (!generation.current) return;
          const msg = e as MessageEvent<string>;
          try {
            const env = JSON.parse(msg.data);
            setState((s) => applyEnvelope(s, env));
          } catch {
            /* ignore malformed SSE data */
          }
          scheduleDerived();
        });
        refreshDerived();
      })
      .catch((err) => {
        if (!generation.current || abort.signal.aborted) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(String(err));
        }
        setStatus("offline");
        // Even when the snapshot fails, still open a stream so a run that
        // starts later (or a backend that comes up) can be tailed.
        stream = openStream(runId, 0);
        stream.onopen = () => {
          if (generation.current) {
            setStatus("live");
            setError(null);
            refreshDerived();
          }
        };
        stream.onerror = () => generation.current && setStatus("reconnecting");
        stream.addEventListener("step", (e: Event) => {
          if (!generation.current) return;
          const msg = e as MessageEvent<string>;
          try {
            setState((s) => applyEnvelope(s, JSON.parse(msg.data)));
          } catch {
            /* ignore */
          }
          scheduleDerived();
        });
      });

    return () => {
      generation.current = false;
      abort.abort();
      stream?.close();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runId, enabled]);

  const records = orderedSteps(state);

  const setRunIdSafe = useCallback((id: string) => {
    setRunId(id.trim() || "demo_001");
  }, []);

  return {
    runId,
    state,
    records,
    status,
    health,
    graph,
    metrics,
    error,
    setRunId: setRunIdSafe,
  };
}
