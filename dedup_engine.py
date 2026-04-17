"""Deduplication engine with blocking and weighted scoring."""

from __future__ import annotations

from collections import defaultdict
from itertools import combinations
import json
from typing import Iterable

from rapidfuzz import fuzz

from db_utils import get_db
from golden_record_platform.utils.score_utils import compute_blocking_keys


class DeduplicationEngine:
    EMAIL_WEIGHT = 0.35
    PHONE_WEIGHT = 0.30
    NAME_WEIGHT = 0.20
    DOB_WEIGHT = 0.10
    CITY_WEIGHT = 0.05
    ADDRESS_WEIGHT = 0.04

    CANDIDATE_MIN_SCORE = 0.55

    @staticmethod
    def _normalized(value: str | None) -> str:
        return (value or "").strip().lower()

    @classmethod
    def _feature_scores(cls, a: dict, b: dict) -> dict:
        email_match = 100.0 if cls._normalized(a.get("email")) and cls._normalized(a.get("email")) == cls._normalized(b.get("email")) else 0.0
        phone_match = 100.0 if cls._normalized(a.get("phone")) and cls._normalized(a.get("phone")) == cls._normalized(b.get("phone")) else 0.0
        dob_match = 100.0 if cls._normalized(a.get("birth_date")) and cls._normalized(a.get("birth_date")) == cls._normalized(b.get("birth_date")) else 0.0

        name_similarity = float(fuzz.token_sort_ratio(a.get("full_name") or "", b.get("full_name") or ""))
        city_similarity = float(fuzz.ratio(a.get("city") or "", b.get("city") or ""))
        address_similarity = float(fuzz.token_sort_ratio(a.get("address") or "", b.get("address") or ""))

        composite = (
            email_match * cls.EMAIL_WEIGHT
            + phone_match * cls.PHONE_WEIGHT
            + name_similarity * cls.NAME_WEIGHT
            + dob_match * cls.DOB_WEIGHT
            + city_similarity * cls.CITY_WEIGHT
            + address_similarity * cls.ADDRESS_WEIGHT
        )

        ai_score = round(min(100.0, composite + (5.0 if phone_match == 100.0 and dob_match == 100.0 else 0.0)), 1)
        blocking_keys = sorted(set(compute_blocking_keys(a) + compute_blocking_keys(b)))

        if ai_score >= 90:
            reasoning = "High confidence: strong deterministic matches across key identifiers"
        elif ai_score >= 70:
            reasoning = "Moderate confidence: partial match requires manual confirmation"
        else:
            reasoning = "Low confidence: likely distinct customers"

        return {
            "email_match": round(email_match, 3),
            "phone_match": round(phone_match, 3),
            "name_similarity": round(name_similarity, 3),
            "dob_match": round(dob_match, 3),
            "city_similarity": round(city_similarity, 3),
            "address_similarity": round(address_similarity, 3),
            "composite_score": round(composite, 2),
            "ai_score": ai_score,
            "final_score": ai_score,
            "ai_reasoning": reasoning,
            "blocking_keys": blocking_keys,
        }

    @classmethod
    def _build_blocks(cls, records: list[dict]) -> list[set[int]]:
        by_email: dict[str, list[int]] = defaultdict(list)
        by_phone: dict[str, list[int]] = defaultdict(list)
        by_name_city: dict[str, list[int]] = defaultdict(list)

        for row in records:
            sid = row["silver_id"]
            email = cls._normalized(row.get("email"))
            phone = cls._normalized(row.get("phone"))
            name = cls._normalized(row.get("full_name"))
            city = cls._normalized(row.get("city"))

            if email:
                by_email[email].append(sid)
            if phone:
                by_phone[phone].append(sid)
            if name and city:
                key = f"{name[:6]}|{city[:5]}"
                by_name_city[key].append(sid)

        blocks: list[set[int]] = []
        for grouped in (by_email, by_phone, by_name_city):
            for _, ids in grouped.items():
                if len(ids) > 1:
                    blocks.append(set(ids))
        return blocks

    @classmethod
    def _candidate_pairs(cls, blocks: Iterable[set[int]]) -> set[tuple[int, int]]:
        pairs: set[tuple[int, int]] = set()
        for block in blocks:
            # Guard against very large blocks.
            if len(block) > 200:
                continue
            for a, b in combinations(sorted(block), 2):
                pairs.add((a, b))
        return pairs

    @classmethod
    def find_duplicates(cls) -> int:
        db = get_db()
        records = db.fetch_all("SELECT * FROM silver_customer ORDER BY silver_id")
        if len(records) < 2:
            print("Not enough Silver records for dedup")
            return 0

        record_by_id = {row["silver_id"]: row for row in records}
        blocks = cls._build_blocks(records)
        pairs = cls._candidate_pairs(blocks)

        inserted = 0
        for idx, (aid, bid) in enumerate(sorted(pairs), start=1):
            a = record_by_id[aid]
            b = record_by_id[bid]
            features = cls._feature_scores(a, b)
            if features["composite_score"] < 55.0:
                continue

            db.execute_query(
                """
                INSERT OR IGNORE INTO duplicate_matches (
                    silver_id_a, silver_id_b, email_match, phone_match, name_similarity,
                    dob_match, city_similarity, address_similarity, composite_score, ai_score,
                    final_score, ai_reasoning, blocking_keys, decision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
                """,
                (
                    aid,
                    bid,
                    features["email_match"],
                    features["phone_match"],
                    features["name_similarity"],
                    features["dob_match"],
                    features["city_similarity"],
                    features["address_similarity"],
                    features["composite_score"],
                    features["ai_score"],
                    features["final_score"],
                    features["ai_reasoning"],
                    json.dumps(features["blocking_keys"]),
                ),
            )

            inserted += 1
            if inserted <= 5 or inserted % 200 == 0:
                print(
                    f"Match candidate {inserted}: silver {aid} vs {bid}, ai_score={features['ai_score']}"
                )

        print(f"Dedup finished: evaluated {len(pairs)} pairs, stored {inserted} candidates")
        return inserted


if __name__ == "__main__":
    DeduplicationEngine.find_duplicates()
