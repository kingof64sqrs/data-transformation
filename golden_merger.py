"""Golden record merger from approved duplicate decisions."""

from __future__ import annotations

import json
from collections import defaultdict

from db_utils import get_db


class GoldenRecordMerger:
    @staticmethod
    def _best_non_empty(records: list[dict], key: str):
        values = [r.get(key) for r in records if r.get(key)]
        if not values:
            return None
        return sorted(values, key=lambda v: len(str(v)), reverse=True)[0]

    @classmethod
    def _group_merge_candidates(cls, edges: list[tuple[int, int]]) -> list[set[int]]:
        parent: dict[int, int] = {}

        def find(x: int) -> int:
            parent.setdefault(x, x)
            if parent[x] != x:
                parent[x] = find(parent[x])
            return parent[x]

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra

        for a, b in edges:
            union(a, b)

        groups: dict[int, set[int]] = defaultdict(set)
        for node in list(parent.keys()):
            groups[find(node)].add(node)

        return list(groups.values())

    @classmethod
    def rebuild_golden_records(cls) -> int:
        db = get_db()

        approved_pairs = db.fetch_all(
            """
            SELECT silver_id_a, silver_id_b, ai_score
            FROM duplicate_matches
            WHERE decision IN ('AUTO_MERGE', 'APPROVED')
            """
        )

        edges = [(row["silver_id_a"], row["silver_id_b"]) for row in approved_pairs]
        groups = cls._group_merge_candidates(edges)

        db.execute_query("DELETE FROM gold_customer")

        merged_silver_ids: set[int] = set()
        created = 0

        for group in groups:
            silver_rows = []
            for sid in sorted(group):
                row = db.fetch_one("SELECT * FROM silver_customer WHERE silver_id = ?", (sid,))
                if row:
                    silver_rows.append(row)
                    merged_silver_ids.add(sid)

            if not silver_rows:
                continue

            primary_email = cls._best_non_empty(silver_rows, "email")
            all_emails = sorted({r["email"] for r in silver_rows if r.get("email")})
            email_secondary = [e for e in all_emails if e != primary_email]

            source_systems = sorted({r["source_system"] for r in silver_rows if r.get("source_system")})
            source_ids = [r["cust_id"] for r in silver_rows if r.get("cust_id")]

            # Estimate confidence from all pairwise links in this group.
            if len(group) > 1:
                score_rows = db.fetch_all(
                    f"""
                    SELECT ai_score FROM duplicate_matches
                    WHERE decision IN ('AUTO_MERGE', 'APPROVED')
                    AND silver_id_a IN ({','.join(['?'] * len(group))})
                    AND silver_id_b IN ({','.join(['?'] * len(group))})
                    """,
                    tuple(group) + tuple(group),
                )
                confidence = round(
                    sum(float(r["ai_score"] or 0.0) for r in score_rows) / max(1, len(score_rows)),
                    1,
                )
            else:
                confidence = 100.0

            db.insert_record(
                "gold_customer",
                {
                    "name": cls._best_non_empty(silver_rows, "full_name") or "Unknown",
                    "email_primary": primary_email,
                    "email_secondary": email_secondary,
                    "phone": cls._best_non_empty(silver_rows, "phone"),
                    "birth_date": cls._best_non_empty(silver_rows, "birth_date"),
                    "address": cls._best_non_empty(silver_rows, "address"),
                    "city": cls._best_non_empty(silver_rows, "city"),
                    "state": cls._best_non_empty(silver_rows, "state"),
                    "source_systems": source_systems,
                    "source_ids": source_ids,
                    "merge_confidence": confidence,
                },
            )
            created += 1

        # Add records not part of any merged group.
        singles = db.fetch_all("SELECT * FROM silver_customer ORDER BY silver_id")
        for row in singles:
            if row["silver_id"] in merged_silver_ids:
                continue
            db.insert_record(
                "gold_customer",
                {
                    "name": row.get("full_name") or "Unknown",
                    "email_primary": row.get("email"),
                    "email_secondary": [],
                    "phone": row.get("phone"),
                    "birth_date": row.get("birth_date"),
                    "address": row.get("address"),
                    "city": row.get("city"),
                    "state": row.get("state"),
                    "source_systems": [row.get("source_system")] if row.get("source_system") else [],
                    "source_ids": [row.get("cust_id")] if row.get("cust_id") else [],
                    "merge_confidence": 100.0,
                },
            )
            created += 1

        print(f"Golden merge finished: created {created} records")
        return created


if __name__ == "__main__":
    GoldenRecordMerger.rebuild_golden_records()
