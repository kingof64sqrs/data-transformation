"""Background worker for periodic duplicate matching and decisioning."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from decision_engine import DecisionEngine
from dedup_engine import DeduplicationEngine


WorkerEmitter = Callable[[str, str, dict[str, Any] | None], Awaitable[None]]


class MatchScheduler:
    def __init__(self, interval_seconds: float = 60.0) -> None:
        self.interval_seconds = interval_seconds

    async def run(self, stop_event: asyncio.Event, emit: WorkerEmitter | None = None) -> None:
        while not stop_event.is_set():
            try:
                inserted = DeduplicationEngine.find_duplicates()
                decisions = DecisionEngine.apply_decisions()

                if emit is not None and (inserted > 0 or sum(decisions.values()) > 0):
                    await emit(
                        "pair_created",
                        f"MatchScheduler processed {inserted} candidate pair(s)",
                        {
                            "worker": "MatchScheduler",
                            "pairs_created": inserted,
                            "auto_merge": decisions.get("auto_merge", 0),
                            "manual_review": decisions.get("manual_review", 0),
                            "separate": decisions.get("separate", 0),
                        },
                    )
            except Exception as exc:
                if emit is not None:
                    await emit(
                        "worker_error",
                        f"MatchScheduler cycle failed: {exc}",
                        {"worker": "MatchScheduler"},
                    )

            await asyncio.sleep(self.interval_seconds)