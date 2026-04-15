"""Kafka consumer that lands raw events to the Bronze table."""

from __future__ import annotations

import json
import time
from typing import Any

from kafka import KafkaConsumer

from db_utils import get_db


class BronzeConsumer:
    def __init__(
        self,
        bootstrap_servers: str = "localhost:9092",
        topic: str = "customer_raw",
        group_id: str = "bronze-group",
    ) -> None:
        self.topic = topic
        self.group_id = group_id
        self.bootstrap_servers = bootstrap_servers
        self.consumer: KafkaConsumer | None = None
        self.connect()

    def connect(self) -> None:
        retries = 0
        max_retries = 30
        while retries < max_retries:
            try:
                self.consumer = KafkaConsumer(
                    self.topic,
                    bootstrap_servers=self.bootstrap_servers,
                    group_id=self.group_id,
                    value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                    auto_offset_reset="earliest",
                    enable_auto_commit=False,
                    consumer_timeout_ms=5000,
                    max_poll_records=500,
                )
                print(f"Connected to Kafka at {self.bootstrap_servers}")
                return
            except Exception as exc:
                retries += 1
                print(f"Waiting for Kafka {retries}/{max_retries}: {str(exc)[:120]}")
                time.sleep(1)
        raise RuntimeError("Failed to connect to Kafka")

    @staticmethod
    def _bronze_row(event: dict[str, Any], offset: int, partition: int) -> dict[str, Any]:
        payload = event["payload"]
        return {
            "cust_id": payload["cust_id"],
            "first_nm": payload.get("first_nm"),
            "last_nm": payload.get("last_nm"),
            "email_addr": payload.get("email_addr"),
            "phone_num": payload.get("phone_num"),
            "birth_dt": payload.get("birth_dt"),
            "addr_line1": payload.get("addr_line1"),
            "addr_city": payload.get("addr_city"),
            "addr_state": payload.get("addr_state"),
            "source_system": payload.get("source_system") or event.get("source_system"),
            "kafka_offset": offset,
            "kafka_partition": partition,
            "raw_json": json.dumps(payload),
        }

    def consume_and_store(self, max_messages: int | None = None) -> int:
        if self.consumer is None:
            raise RuntimeError("Consumer not connected")

        db = get_db()
        consumed = 0

        print(f"Consuming topic {self.topic} into Bronze")
        for message in self.consumer:
            row = self._bronze_row(message.value, message.offset, message.partition)

            exists = db.fetch_one(
                """
                SELECT bronze_id FROM bronze_customer
                WHERE cust_id = ? AND kafka_offset = ? AND kafka_partition = ?
                """,
                (row["cust_id"], row["kafka_offset"], row["kafka_partition"]),
            )
            if exists is None:
                db.insert_record("bronze_customer", row)
                consumed += 1
                if consumed <= 5 or consumed % 200 == 0:
                    print(
                        f"Bronze stored {consumed}: cust_id={row['cust_id']} partition={row['kafka_partition']} offset={row['kafka_offset']}"
                    )

            self.consumer.commit()
            if max_messages is not None and consumed >= max_messages:
                break

        print(f"Consumer finished: {consumed} bronze rows inserted")
        return consumed

    def close(self) -> None:
        if self.consumer is not None:
            self.consumer.close()


if __name__ == "__main__":
    consumer = BronzeConsumer()
    consumer.consume_and_store()
    consumer.close()
