"""Decision engine for auto-merge vs manual review routing."""

from __future__ import annotations

from db_utils import get_db


class DecisionEngine:
    AUTO_MERGE_THRESHOLD = 90.0
    MANUAL_REVIEW_THRESHOLD = 70.0

    @classmethod
    def apply_decisions(cls) -> dict[str, int]:
        db = get_db()
        matches = db.fetch_all(
            """
            SELECT match_id, COALESCE(final_score, ai_score) AS final_score, ai_score
            FROM duplicate_matches
            WHERE decision = 'PENDING' OR decision = 'MANUAL_REVIEW'
            ORDER BY COALESCE(final_score, ai_score) DESC
            """
        )

        auto_count = 0
        review_count = 0
        separate_count = 0

        for match in matches:
            final_score = float(match["final_score"] or match["ai_score"] or 0.0)
            if final_score >= cls.AUTO_MERGE_THRESHOLD:
                decision = "AUTO_MERGE"
                auto_count += 1
            elif final_score >= cls.MANUAL_REVIEW_THRESHOLD:
                decision = "MANUAL_REVIEW"
                review_count += 1
            else:
                decision = "SEPARATE"
                separate_count += 1

            db.execute_query(
                "UPDATE duplicate_matches SET decision = ?, final_score = COALESCE(final_score, ai_score) WHERE match_id = ?",
                (decision, match["match_id"]),
            )

            if decision == "MANUAL_REVIEW":
                db.execute_query(
                    "INSERT OR IGNORE INTO review_queue(match_id, status) VALUES(?, 'PENDING')",
                    (match["match_id"],),
                )

        summary = {
            "auto_merge": auto_count,
            "manual_review": review_count,
            "separate": separate_count,
        }
        print(
            "Decision engine summary: "
            f"auto={auto_count}, review={review_count}, separate={separate_count}"
        )
        return summary


if __name__ == "__main__":
    DecisionEngine.apply_decisions()
