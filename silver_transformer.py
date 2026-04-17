"""Silver transformation: clean and normalize Bronze records."""

from __future__ import annotations

import re
from datetime import datetime

from db_utils import get_db
from golden_record_platform.utils.score_utils import compute_blocking_keys


class SilverTransformer:
    CITY_MAPPING = {
        "ny": "New York",
        "nyc": "New York",
        "new york": "New York",
        "bengaluru": "Bangalore",
        "bangalore": "Bangalore",
        "dubai uae": "Dubai",
        "chi": "Chicago",
    }

    @staticmethod
    def normalize_name(value: str | None) -> str | None:
        if not value:
            return None
        return " ".join(value.strip().split()).title()

    @staticmethod
    def normalize_email(value: str | None) -> str | None:
        if not value:
            return None
        return value.strip().lower()

    @staticmethod
    def normalize_phone(value: str | None) -> str | None:
        if not value:
            return None
        raw = value.strip().replace(" ", "").replace("-", "")
        if raw.startswith("00"):
            raw = "+" + raw[2:]
        if raw and raw[0] != "+":
            return "+" + re.sub(r"\D", "", raw)
        return "+" + re.sub(r"\D", "", raw[1:])

    @staticmethod
    def normalize_date(value: str | None) -> str | None:
        if not value:
            return None
        text = value.strip()
        for fmt in ["%Y-%m-%d", "%Y%m%d", "%d/%m/%Y"]:
            try:
                return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return text

    @classmethod
    def normalize_city(cls, value: str | None) -> str | None:
        if not value:
            return None
        cleaned = " ".join(value.strip().split()).title()
        key = cleaned.lower()
        return cls.CITY_MAPPING.get(key, cleaned)

    @staticmethod
    def normalize_address(value: str | None) -> str | None:
        if not value:
            return None
        return " ".join(value.strip().split()).title()

    @staticmethod
    def completeness(row: dict) -> float:
        fields = [
            row.get("first_name"),
            row.get("last_name"),
            row.get("email"),
            row.get("phone"),
            row.get("birth_date"),
            row.get("address"),
            row.get("city"),
            row.get("state"),
            row.get("cust_id"),
        ]
        filled = sum(1 for item in fields if item)
        return round((filled / len(fields)) * 100, 1)

    @staticmethod
    def field_validity(row: dict) -> float:
        checks = {
            "email": lambda value: bool(value and re.match(r"^[^@]+@[^@]+\.[^@]+$", value)),
            "phone": lambda value: bool(value and re.match(r"^\+?\d{7,15}$", re.sub(r"\D", "", value))),
            "birth_date": lambda value: bool(value and re.match(r"^\d{4}-\d{2}-\d{2}$", value)),
            "state": lambda value: bool(value and len(str(value).strip()) >= 2),
        }
        present = {key: value for key, value in row.items() if key in checks and value}
        if not present:
            return 100.0
        valid = sum(1 for key, value in present.items() if checks[key](str(value)))
        return round((valid / len(present)) * 100, 1)

    @staticmethod
    def detect_anomalies(row: dict) -> list[str]:
        flags: list[str] = []
        birth_date = row.get("birth_date") or ""
        if birth_date:
            try:
                year = datetime.strptime(birth_date, "%Y-%m-%d").year
                age = datetime.utcnow().year - year
                if age < 0 or age > 120:
                    flags.append("INVALID_AGE")
            except ValueError:
                flags.append("INVALID_DOB")
        email = (row.get("email") or "").lower()
        if email.endswith(("mailinator.com", "tempmail.com", "10minutemail.com")):
            flags.append("DISPOSABLE_EMAIL")
        return flags

    @classmethod
    def transform_record(cls, bronze: dict) -> dict:
        first_name = cls.normalize_name(bronze.get("first_nm"))
        last_name = cls.normalize_name(bronze.get("last_nm"))
        email = cls.normalize_email(bronze.get("email_addr"))
        phone = cls.normalize_phone(bronze.get("phone_num"))
        birth_date = cls.normalize_date(bronze.get("birth_dt"))
        address = cls.normalize_address(bronze.get("addr_line1"))
        city = cls.normalize_city(bronze.get("addr_city"))

        row = {
            "bronze_id": bronze["bronze_id"],
            "cust_id": bronze.get("cust_id"),
            "first_name": first_name,
            "last_name": last_name,
            "full_name": " ".join(x for x in [first_name, last_name] if x) or None,
            "email": email,
            "phone": phone,
            "birth_date": birth_date,
            "address": address,
            "city": city,
            "state": cls.normalize_name(bronze.get("addr_state")),
            "source_system": bronze.get("source_system"),
            "email_valid": 1 if email and re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email) else 0,
            "phone_valid": 1 if phone and re.match(r"^\+\d{10,15}$", phone) else 0,
            "completeness": 0.0,
            "field_validity_pct": 0.0,
            "anomaly_flags": [],
            "blocking_keys": [],
            "normalized_at": datetime.utcnow().isoformat(timespec="seconds"),
        }
        row["completeness"] = cls.completeness(row)
        row["field_validity_pct"] = cls.field_validity(row)
        row["anomaly_flags"] = cls.detect_anomalies(row)
        row["blocking_keys"] = compute_blocking_keys(row)
        return row

    @classmethod
    def transform_all(cls) -> int:
        db = get_db()
        bronze_rows = db.fetch_all(
            """
            SELECT * FROM bronze_customer
            WHERE bronze_id NOT IN (SELECT bronze_id FROM silver_customer)
            ORDER BY bronze_id
            """
        )
        if not bronze_rows:
            print("No new Bronze rows for Silver transformation")
            return 0

        transformed = 0
        for bronze in bronze_rows:
            db.insert_record("silver_customer", cls.transform_record(bronze))
            transformed += 1
            if transformed <= 5 or transformed % 200 == 0:
                print(f"Silver transformed {transformed}: bronze_id={bronze['bronze_id']}")

        print(f"Silver transformation finished: {transformed} rows")
        return transformed


if __name__ == "__main__":
    SilverTransformer.transform_all()
