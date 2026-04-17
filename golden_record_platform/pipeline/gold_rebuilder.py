"""Background worker for periodic incremental golden record refresh."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from golden_merger import GoldenRecordMerger


WorkerEmitter = Callable[[str, str, dict[str, Any] | None], Awaitable[None]]


class GoldRebuilder:
    def __init__(self, interval_seconds: float = 45.0) -> None:
        self.interval_seconds = interval_seconds

    async def run(self, stop_event: asyncio.Event, emit: WorkerEmitter | None = None) -> None:
        while not stop_event.is_set():
            try:
                rebuilt = GoldenRecordMerger.rebuild_golden_records()
                if emit is not None and rebuilt > 0:
                    await emit(
                        "gold_merge",
                        f"GoldRebuilder refreshed {rebuilt} master record(s)",
                        {"worker": "GoldRebuilder", "master_records": rebuilt},
                    )
            except Exception as exc:
                if emit is not None:
                    await emit(
                        "worker_error",
                        f"GoldRebuilder cycle failed: {exc}",
                        {"worker": "GoldRebuilder"},
                    )

            await asyncio.sleep(self.interval_seconds)