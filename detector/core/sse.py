"""Per-run publish/wait notification for SSE readers.

SQLite is the cursor source of truth; the notifier only wakes readers.
A slow or disconnected subscriber cannot block ingestion because publish
is a bounded version bump, not a queue write.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field


@dataclass
class _Channel:
    version: int = 0
    event: asyncio.Event = field(default_factory=asyncio.Event)


class Notifier:
    def __init__(self) -> None:
        self._channels: dict[str, _Channel] = {}

    def _ch(self, run_id: str) -> _Channel:
        ch = self._channels.get(run_id)
        if ch is None:
            ch = _Channel()
            self._channels[run_id] = ch
        return ch

    def version(self, run_id: str) -> int:
        return self._ch(run_id).version

    def publish(self, run_id: str) -> None:
        ch = self._ch(run_id)
        ch.version += 1
        ch.event.set()
        ch.event = asyncio.Event()

    async def wait(self, run_id: str, seen: int, timeout: float) -> int:
        """Return the current version; may equal `seen` on timeout."""
        ch = self._ch(run_id)
        if ch.version > seen:
            return ch.version
        try:
            await asyncio.wait_for(ch.event.wait(), timeout)
        except asyncio.TimeoutError:
            pass
        return ch.version
