"""SQLite persistence for Black Box.

Single connection guarded by a lock; WAL + busy timeout keep reads responsive
while SSE readers poll. All writes are short transactions. One Uvicorn worker
is assumed — process-local locks are documented as not multi-worker safe.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS steps (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  verdict_json TEXT NOT NULL,
  claims_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at REAL NOT NULL,
  PRIMARY KEY (run_id, seq),
  UNIQUE (run_id, step_id)
);
"""


class Store:
    def __init__(self, db_path: str):
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ---- writes ---------------------------------------------------------

    def insert_step(
        self,
        run_id: str,
        seq: int,
        step_id: str,
        event: dict[str, Any],
        verdict: dict[str, Any],
        claims: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
    ) -> None:
        with self._lock:
            with self._conn:
                self._conn.execute(
                    "INSERT INTO steps (run_id, seq, step_id, event_json,"
                    " verdict_json, claims_json, evidence_json, created_at)"
                    " VALUES (?,?,?,?,?,?,?,?)",
                    (
                        run_id,
                        seq,
                        step_id,
                        json.dumps(event, sort_keys=True, separators=(",", ":")),
                        json.dumps(verdict, sort_keys=True, separators=(",", ":")),
                        json.dumps(claims, separators=(",", ":")),
                        json.dumps(evidence, separators=(",", ":")),
                        time.time(),
                    ),
                )

    # ---- reads ----------------------------------------------------------

    def max_seq(self, run_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COALESCE(MAX(seq),0) FROM steps WHERE run_id=?",
                (run_id,),
            ).fetchone()
        return int(row[0])

    def get_by_step_id(self, run_id: str, step_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT seq, event_json, verdict_json, claims_json,"
                " evidence_json FROM steps WHERE run_id=? AND step_id=?",
                (run_id, step_id),
            ).fetchone()
        return self._row_to_record(row) if row else None

    def steps_after(self, run_id: str, after: int) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT seq, event_json, verdict_json, claims_json,"
                " evidence_json FROM steps WHERE run_id=? AND seq>?"
                " ORDER BY seq",
                (run_id, after),
            ).fetchall()
        return [self._row_to_record(r) for r in rows]

    def all_steps(self, run_id: str) -> list[dict[str, Any]]:
        return self.steps_after(run_id, 0)

    def run_ids(self) -> list[str]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT DISTINCT run_id FROM steps"
            ).fetchall()
        return [r[0] for r in rows]

    # ---- helpers --------------------------------------------------------

    @staticmethod
    def _row_to_record(row: tuple) -> dict[str, Any]:
        return {
            "seq": row[0],
            "event": json.loads(row[1]),
            "verdict": json.loads(row[2]),
            "claims": json.loads(row[3]),
            "evidence": json.loads(row[4]),
        }
