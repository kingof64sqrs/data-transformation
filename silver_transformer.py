"""Silver transformation: clean and normalize Bronze records."""

from __future__ import annotations

import re
from datetime import datetime

from db_utils import get_db


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
        ]
        filled = sum(1 for item in fields if item)
        return round((filled / len(fields)) * 100, 1)

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
        }
        row["completeness"] = cls.completeness(row)
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
