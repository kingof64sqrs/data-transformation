"""Pipeline orchestrator wrapper around the tested top-level modules."""

from __future__ import annotations

from db_utils import get_db
from decision_engine import DecisionEngine
from dedup_engine import DeduplicationEngine
from golden_merger import GoldenRecordMerger
from kafka_consumer import BronzeConsumer
from kafka_producer import DB2Producer
from silver_transformer import SilverTransformer


def run_pipeline(reset_layers: bool = True, produce_limit: int | None = None) -> dict[str, int]:
    db = get_db()

    if reset_layers:
        db.reset_pipeline_tables()

    producer = DB2Producer()
    produced = producer.produce_records(limit=produce_limit)
    producer.close()

    consumer = BronzeConsumer()
    consumed = consumer.consume_and_store(max_messages=produced)
    consumer.close()

    silver_count = SilverTransformer.transform_all()
    match_count = DeduplicationEngine.find_duplicates()
    decisions = DecisionEngine.apply_decisions()
    gold_count = GoldenRecordMerger.rebuild_golden_records()

    stats = db.fetch_one(
        """
        SELECT
            (SELECT COUNT(*) FROM db2_customer_simulated) AS db2_records,
            (SELECT COUNT(*) FROM bronze_customer) AS bronze_records,
            (SELECT COUNT(*) FROM silver_customer) AS silver_records,
            (SELECT COUNT(*) FROM duplicate_matches) AS duplicate_matches,
            (SELECT COUNT(*) FROM review_queue WHERE status = 'PENDING') AS pending_reviews,
            (SELECT COUNT(*) FROM gold_customer) AS golden_records
        """
    )

    return {
        "produced": produced,
        "consumed": consumed,
        "silver_count": silver_count,
        "match_count": match_count,
        "auto_merge": decisions["auto_merge"],
        "manual_review": decisions["manual_review"],
        "separate": decisions["separate"],
        "gold_count": gold_count,
        "db2_records": stats["db2_records"],
        "bronze_records": stats["bronze_records"],
        "silver_records": stats["silver_records"],
        "duplicate_matches": stats["duplicate_matches"],
        "pending_reviews": stats["pending_reviews"],
        "golden_records": stats["golden_records"],
    }
