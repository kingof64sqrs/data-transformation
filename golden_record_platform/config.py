"""Runtime configuration helpers for the Golden Record platform."""

from __future__ import annotations

from dataclasses import dataclass
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class AppConfig:
    db_path: str = os.getenv("DB_PATH", "./golden_record.db")
    mock_record_count: int = int(os.getenv("MOCK_RECORD_COUNT", "1200"))
    kafka_bootstrap_servers: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    kafka_topic: str = os.getenv("KAFKA_TOPIC", "customer_raw")


config = AppConfig()
