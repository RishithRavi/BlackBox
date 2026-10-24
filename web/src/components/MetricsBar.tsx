import type { Metrics } from "../types";

export function MetricsBar({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) {
    return (
      <section className="metrics" aria-label="Run metrics">
        <h2>Metrics</h2>
        <p className="muted">Unavailable.</p>
      </section>
    );
  }
  const fmt = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} ms`);
  const sc = metrics.semantic_status_counts;
  return (
    <section className="metrics" aria-label="Run metrics">
      <h2>Metrics</h2>
      <div className="metricgrid">
        <div><span className="num">{metrics.step_count}</span> steps</div>
        <div><span className="num">{metrics.flag_count}</span> findings</div>
        <div>
          <span className="badge level-ok">OK {metrics.levels.ok}</span>{" "}
          <span className="badge level-warn">WARN {metrics.levels.warn}</span>{" "}
          <span className="badge level-block">BLOCK {metrics.levels.block}</span>
        </div>
        <div>P50 {fmt(metrics.p50_latency_ms)} · P95 {fmt(metrics.p95_latency_ms)}</div>
        <div className="small muted">
          semantic — laya {sc.laya} · fallback {sc.fallback} · unavailable{" "}
          {sc.unavailable} · n/a {sc.not_applicable}
        </div>
      </div>
    </section>
  );
}
