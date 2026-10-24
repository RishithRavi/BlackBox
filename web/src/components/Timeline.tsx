import { useEffect, useRef } from "react";
import {
  User,
  Folder,
  TerminalWindow,
  Code,
  FileText,
  Flask,
  WarningCircle,
  ArrowDown,
} from "@phosphor-icons/react";
import { elapsed, stepTitle, formatLatency } from "../presentation";
import type { StepRecord, Level } from "../types";

export function StatusBadge({
  level,
  unverified = false,
}: {
  level: Level;
  unverified?: boolean;
}) {
  return (
    <span
      className={`badge ${unverified && level === "ok" ? "unverified" : level}`}
    >
      {unverified && level === "ok"
        ? "Unverified"
        : { ok: "No findings", warn: "Warning", block: "High risk" }[level]}
    </span>
  );
}
function StepIcon({ record }: { record: StepRecord }) {
  if (record.verdict.flags.length) return <WarningCircle size={19} />;
  const type = record.event.type;
  const Icon =
    type === "user"
      ? User
      : record.event.tool?.name === "inspect_repo"
        ? Folder
        : record.event.tool?.name === "run_tests"
          ? Flask
          : type === "tool_call"
            ? Code
            : type === "tool_result"
              ? TerminalWindow
              : FileText;
  return <Icon size={19} />;
}
export function Timeline({
  records,
  selectedSeq,
  onSelect,
  filter,
  onFilter,
  loading,
}: {
  records: StepRecord[];
  selectedSeq: number | null;
  onSelect: (seq: number) => void;
  filter: boolean;
  onFilter: (value: boolean) => void;
  loading: boolean;
}) {
  const [first] = records;
  const listRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(false);
  const visible = filter
    ? records.filter((r) => r.verdict.flags.length)
    : records;
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(".selected");
    if (row && listRef.current) {
      const list = listRef.current;
      const rowTop =
        row.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        list.scrollTop;
      if (
        rowTop < list.scrollTop ||
        rowTop + row.offsetHeight > list.scrollTop + list.clientHeight
      )
        list.scrollTop = Math.max(
          0,
          Math.floor((rowTop - list.clientHeight / 2) / row.offsetHeight) *
            row.offsetHeight,
        );
    }
  }, [selectedSeq]);
  useEffect(() => {
    if (followRef.current)
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [records.length]);
  return (
    <section className="panel timeline-panel" aria-labelledby="activity-title">
      <div className="panel-heading">
        <h2 id="activity-title">Agent activity</h2>
        <div className="segmented" aria-label="Activity filters">
          {[false, true].map((flagged) => (
            <button
              key={String(flagged)}
              aria-pressed={filter === flagged}
              className={filter === flagged ? "active" : ""}
              onClick={() => onFilter(flagged)}
            >
              {flagged ? "Flagged" : "All"}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-columns">
        <span>#</span>
        <span />
        <span>Time</span>
        <span>Action</span>
        <span>Status</span>
        <span>Latency</span>
      </div>
      <div className="timeline-scroll" ref={listRef}>
        {visible.length ? (
          <ol className="timeline">
            {visible.map((r) => (
              <li key={r.seq}>
                <button
                  className={`timeline-row ${r.seq === selectedSeq ? "selected" : ""}`}
                  aria-current={r.seq === selectedSeq ? "step" : undefined}
                  onClick={() => {
                    followRef.current = false;
                    onSelect(r.seq);
                  }}
                  aria-label={`Step ${r.seq}: ${stepTitle(r)}`}
                >
                  <span className="row-number">
                    {String(r.seq).padStart(2, "0")}
                  </span>
                  <span className={`event-icon ${r.verdict.level}`}>
                    <StepIcon record={r} />
                  </span>
                  <time>
                    {elapsed(r.event.ts, first?.event.ts ?? r.event.ts)}
                  </time>
                  <span className="action-text" title={r.event.content}>
                    {stepTitle(r)}
                  </span>
                  <StatusBadge
                    level={r.verdict.level}
                    unverified={r.verdict.semantic_status === "unavailable"}
                  />
                  <span className="latency">
                    {formatLatency(r.verdict.latency_ms)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty">
            <Folder size={30} />
            <h3>
              {loading
                ? "Connecting to your run…"
                : filter
                  ? "No flagged steps"
                  : "Ready when your agent is"}
            </h3>
            <p>
              {filter
                ? "Findings will appear here as the run progresses."
                : "Load a run or open the sample replay to explore the dashboard."}
            </p>
          </div>
        )}
      </div>
      <div className="panel-footer">
        <span>
          {visible.length} {filter ? "flagged " : ""}steps
        </span>
        <button
          className="text-button muted"
          onClick={() => {
            followRef.current = true;
            listRef.current?.scrollTo({
              top: listRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
        >
          <ArrowDown size={13} /> Follow latest
        </button>
      </div>
    </section>
  );
}
