"""Background worker that continuously ingests Kafka events into Bronze and Silver."""

from __future__ import annotations

import asyncio
import os
import socket
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from kafka_consumer import BronzeConsumer
from silver_transformer import SilverTransformer


WorkerEmitter = Callable[[str, str, dict[str, Any] | None], Awaitable[None]]


class LiveIngestor:
    def __init__(
        self,
        interval_seconds: float = 5.0,
        max_messages_per_cycle: int = 50,
        bootstrap_servers: str | None = None,
        topic: str | None = None,
        group_id: str = "live-ingestor",
    ) -> None:
        self.interval_seconds = interval_seconds
        self.max_messages_per_cycle = max_messages_per_cycle
        self.bootstrap_servers = bootstrap_servers or os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.topic = topic or os.getenv("KAFKA_TOPIC", "customer_raw")
        self.group_id = group_id
        self._last_unavailable_log: datetime | None = None

    def _kafka_available(self) -> bool:
        host, port_text = (
            self.bootstrap_servers.split(":", 1)
            if ":" in self.bootstrap_servers
            else (self.bootstrap_servers, "9092")
        )
        try:
            port = int(port_text)
            with socket.create_connection((host, port), timeout=1.0):
                return True
        except Exception:
            return False

    async def run(self, stop_event: asyncio.Event, emit: WorkerEmitter | None = None) -> None:
        while not stop_event.is_set():
            if not self._kafka_available():
                now = datetime.utcnow()
                should_log = (
                    self._last_unavailable_log is None
                    or now - self._last_unavailable_log >= timedelta(seconds=60)
                )
                if should_log and emit is not None:
                    self._last_unavailable_log = now
                    await emit(
                        "worker_warning",
                        "LiveIngestor waiting for Kafka connectivity",
                        {"worker": "LiveIngestor", "bootstrap_servers": self.bootstrap_servers},
                    )
                await asyncio.sleep(self.interval_seconds)
                continue

            try:
                consumer = BronzeConsumer(
                    bootstrap_servers=self.bootstrap_servers,
                    topic=self.topic,
                    group_id=self.group_id,
                    consumer_timeout_ms=750,
                )
                consumed = consumer.consume_and_store(max_messages=self.max_messages_per_cycle)
                consumer.close()

                if consumed > 0:
                    transformed = SilverTransformer.transform_all()
                    if emit is not None:
                        await emit(
                            "bronze_insert",
                            f"LiveIngestor consumed {consumed} Kafka event(s)",
                            {
                                "worker": "LiveIngestor",
                                "bronze_ingested": consumed,
                                "silver_transformed": transformed,
                            },
                        )
            except Exception as exc:
                if emit is not None:
                    await emit(
                        "worker_error",
                        f"LiveIngestor cycle failed: {exc}",
                        {"worker": "LiveIngestor"},
                    )

            await asyncio.sleep(self.interval_seconds)