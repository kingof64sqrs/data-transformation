"""CLI helper to inspect SQLite pipeline tables and summary stats."""

from __future__ import annotations

import json
import sys

from tabulate import tabulate

from db_utils import get_db


TABLE_MAP = {
    "db2": "db2_customer_simulated",
    "bronze": "bronze_customer",
    "silver": "silver_customer",
    "matches": "duplicate_matches",
    "reviews": "review_queue",
    "gold": "gold_customer",
}


def show_stats() -> None:
    db = get_db()
    stats = db.fetch_one(
        """
        SELECT
            (SELECT COUNT(*) FROM db2_customer_simulated) AS db2,
            (SELECT COUNT(*) FROM bronze_customer) AS bronze,
            (SELECT COUNT(*) FROM silver_customer) AS silver,
            (SELECT COUNT(*) FROM duplicate_matches) AS matches,
            (SELECT COUNT(*) FROM duplicate_matches WHERE decision = 'AUTO_MERGE') AS auto_merge,
            (SELECT COUNT(*) FROM duplicate_matches WHERE decision = 'MANUAL_REVIEW') AS manual_review,
            (SELECT COUNT(*) FROM duplicate_matches WHERE decision = 'SEPARATE') AS separate,
            (SELECT COUNT(*) FROM duplicate_matches WHERE decision = 'APPROVED') AS approved,
            (SELECT COUNT(*) FROM review_queue WHERE status = 'PENDING') AS pending,
            (SELECT COUNT(*) FROM gold_customer) AS gold
        """
    )
    rows = [[k, v] for k, v in stats.items()]
    print(tabulate(rows, headers=["metric", "value"], tablefmt="grid"))


def show_table(alias: str, limit: int | None) -> None:
    db = get_db()
    table = TABLE_MAP[alias]
    sql = f"SELECT * FROM {table}"
    if limit:
        sql += f" LIMIT {limit}"

    rows = db.fetch_all(sql)
    if not rows:
        print(f"No rows in {table}")
        return

    headers = list(rows[0].keys())
    data = []
    for row in rows:
        normalized = []
        for h in headers:
            value = row[h]
            if isinstance(value, str) and value.startswith("[") and value.endswith("]"):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    pass
            normalized.append(value)
        data.append(normalized)

    print(tabulate(data, headers=headers, tablefmt="grid"))


def usage() -> None:
    print("Usage: python query_db.py stats | <db2|bronze|silver|matches|reviews|gold> [limit]")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        usage()
        sys.exit(1)

    command = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None

    if command == "stats":
        show_stats()
    elif command in TABLE_MAP:
        show_table(command, limit)
    else:
        usage()
        sys.exit(1)
