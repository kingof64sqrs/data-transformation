"""Kafka producer that streams DB2 simulated rows as raw customer events."""

from __future__ import annotations

import json
import time
from datetime import datetime

from kafka import KafkaProducer

from db_utils import get_db


class DB2Producer:
    def __init__(self, bootstrap_servers: str = "localhost:9092", topic: str = "customer_raw") -> None:
        self.topic = topic
        self.bootstrap_servers = bootstrap_servers
        self.producer: KafkaProducer | None = None
        self.connect()

    def connect(self) -> None:
        retries = 0
        max_retries = 30
        while retries < max_retries:
            try:
                self.producer = KafkaProducer(
                    bootstrap_servers=self.bootstrap_servers,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                    acks="all",
                    linger_ms=20,
                    batch_size=64 * 1024,
                )
                print(f"Connected to Kafka at {self.bootstrap_servers}")
                return
            except Exception as exc:
                retries += 1
                print(f"Waiting for Kafka {retries}/{max_retries}: {str(exc)[:120]}")
                time.sleep(1)
        raise RuntimeError("Failed to connect to Kafka")

    def produce_records(self, limit: int | None = None) -> int:
        if self.producer is None:
            raise RuntimeError("Producer not connected")

        db = get_db()
        query = "SELECT * FROM db2_customer_simulated ORDER BY cust_id"
        params = ()
        if limit is not None:
            query += " LIMIT ?"
            params = (limit,)

        records = db.fetch_all(query, params)
        produced = 0

        print(f"Producing {len(records)} records to topic {self.topic}")
        for row in records:
            event = {
                "event_type": "INSERT",
                "source_system": row["source_system"],
                "table": "CUST_MASTER",
                "ingested_at": datetime.utcnow().isoformat(timespec="seconds"),
                "payload": {
                    "cust_id": row["cust_id"],
                    "first_nm": row["first_nm"],
                    "last_nm": row["last_nm"],
                    "email_addr": row["email_addr"],
                    "phone_num": row["phone_num"],
                    "birth_dt": row["birth_dt"],
                    "addr_line1": row["addr_line1"],
                    "addr_city": row["addr_city"],
                    "addr_state": row["addr_state"],
                    "source_system": row["source_system"],
                },
            }

            future = self.producer.send(self.topic, key=row["cust_id"].encode("utf-8"), value=event)
            metadata = future.get(timeout=15)
            produced += 1
            if produced <= 5 or produced % 200 == 0:
                print(
                    f"Produced {produced}: {row['cust_id']} partition={metadata.partition} offset={metadata.offset}"
                )

        self.producer.flush()
        print(f"Producer finished: {produced} events")
        return produced

    def close(self) -> None:
        if self.producer is not None:
            self.producer.close()


if __name__ == "__main__":
    producer = DB2Producer()
    producer.produce_records()
    producer.close()
