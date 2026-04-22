"""SQLite database utilities for the Golden Record pipeline."""

from __future__ import annotations

import json
import os
import random
import sqlite3
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from dotenv import load_dotenv

load_dotenv()


@dataclass
class MockPerson:
    first_name: str
    last_name: str
    email: str
    phone: str
    birth_date: str
    address: str
    city: str
    state: str


class DatabaseConnection:
    def __init__(self) -> None:
        self.db_path = os.getenv("DB_PATH", "./golden_record.db")
        self.mock_record_count = int(os.getenv("MOCK_RECORD_COUNT", "1200"))
        self.conn: sqlite3.Connection | None = None
        self.connect()
        self.init_schema()

    def connect(self) -> sqlite3.Connection:
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row
            print(f"Connected to SQLite database: {self.db_path}")
            return self.conn
        except sqlite3.Error as exc:
            raise RuntimeError(f"Failed to connect to SQLite: {exc}") from exc

    def init_schema(self) -> None:
        assert self.conn is not None
        self.conn.execute("PRAGMA foreign_keys = ON")
        self._create_tables()
        self._migrate_schema()
        self._insert_or_expand_mock_data(self.mock_record_count)

    def _create_tables(self) -> None:
        assert self.conn is not None
        cursor = self.conn.cursor()

        if self._requires_rebuild():
            self._drop_pipeline_tables()

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS db2_customer_simulated (
                cust_id TEXT PRIMARY KEY,
                first_nm TEXT NOT NULL,
                last_nm TEXT NOT NULL,
                email_addr TEXT,
                phone_num TEXT,
                birth_dt TEXT,
                addr_line1 TEXT,
                addr_city TEXT,
                addr_state TEXT,
                source_system TEXT,
                load_ts TEXT,
                rec_status TEXT DEFAULT 'A'
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS bronze_customer (
                bronze_id INTEGER PRIMARY KEY AUTOINCREMENT,
                cust_id TEXT,
                first_nm TEXT,
                last_nm TEXT,
                email_addr TEXT,
                phone_num TEXT,
                birth_dt TEXT,
                addr_line1 TEXT,
                addr_city TEXT,
                addr_state TEXT,
                source_system TEXT,
                kafka_offset INTEGER,
                kafka_partition INTEGER,
                raw_json TEXT,
                raw_completeness REAL,
                format_validity TEXT,
                schema_version TEXT,
                dlq_flag INTEGER DEFAULT 0,
                dlq_reason TEXT,
                ingested_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS silver_customer (
                silver_id INTEGER PRIMARY KEY AUTOINCREMENT,
                bronze_id INTEGER UNIQUE,
                cust_id TEXT,
                first_name TEXT,
                last_name TEXT,
                full_name TEXT,
                email TEXT,
                phone TEXT,
                birth_date TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                source_system TEXT,
                email_valid INTEGER,
                phone_valid INTEGER,
                completeness REAL,
                field_validity_pct REAL,
                anomaly_flags TEXT,
                blocking_keys TEXT,
                normalized_at TEXT,
                cleaned_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(bronze_id) REFERENCES bronze_customer(bronze_id)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS duplicate_matches (
                match_id INTEGER PRIMARY KEY AUTOINCREMENT,
                silver_id_a INTEGER,
                silver_id_b INTEGER,
                email_match REAL,
                phone_match REAL,
                name_similarity REAL,
                dob_match REAL,
                city_similarity REAL,
                address_similarity REAL,
                composite_score REAL,
                ai_score REAL,
                final_score REAL,
                llm_explanation TEXT,
                llm_confidence REAL,
                blocking_keys TEXT,
                ai_reasoning TEXT,
                decision TEXT DEFAULT 'PENDING',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(silver_id_a, silver_id_b),
                FOREIGN KEY(silver_id_a) REFERENCES silver_customer(silver_id),
                FOREIGN KEY(silver_id_b) REFERENCES silver_customer(silver_id)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS review_queue (
                review_id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER UNIQUE,
                status TEXT DEFAULT 'PENDING',
                reviewer_comment TEXT,
                reviewed_by TEXT,
                reviewed_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(match_id) REFERENCES duplicate_matches(match_id)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS gold_customer (
                golden_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email_primary TEXT,
                email_secondary TEXT,
                phone TEXT,
                birth_date TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                source_systems TEXT,
                source_ids TEXT NOT NULL,
                merge_confidence REAL,
                record_quality_score REAL,
                llm_summary TEXT,
                survivorship_log TEXT,
                last_reeval_at TEXT,
                merged_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS column_profiles (
                profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
                layer TEXT NOT NULL,
                table_name TEXT NOT NULL,
                column_name TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                profile_json TEXT NOT NULL,
                generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(layer, table_name, column_name)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS kafka_offsets (
                topic TEXT,
                partition INTEGER,
                offset INTEGER,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (topic, partition)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS correction_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                master_id TEXT NOT NULL,
                field_name TEXT,
                old_value TEXT,
                new_value TEXT,
                applied_by TEXT,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
                llm_rationale TEXT,
                confidence REAL,
                FOREIGN KEY(master_id) REFERENCES gold_customer(golden_id)
            )
            """
        )

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_db2_phone ON db2_customer_simulated(phone_num)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_db2_email ON db2_customer_simulated(email_addr)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_bronze_cust ON bronze_customer(cust_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_silver_phone ON silver_customer(phone)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_silver_email ON silver_customer(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_decision ON duplicate_matches(decision)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_review_status ON review_queue(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gold_confidence ON gold_customer(merge_confidence)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_correction_history_master ON correction_history(master_id, applied_at DESC)")

        self.conn.commit()

    def _table_exists(self, table_name: str) -> bool:
        row = self.fetch_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            (table_name,),
        )
        return row is not None

    def _column_exists(self, table_name: str, column_name: str) -> bool:
        rows = self.fetch_all(f"PRAGMA table_info({table_name})")
        return any(row.get("name") == column_name for row in rows)

    def _add_column_if_missing(self, table_name: str, column_name: str, column_sql: str) -> None:
        assert self.conn is not None
        if self._column_exists(table_name, column_name):
            return
        self.conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")

    def _requires_rebuild(self) -> bool:
        if self._table_exists("db2_customer_simulated") and not self._column_exists("db2_customer_simulated", "phone_num"):
            return True
        if self._table_exists("silver_customer") and not self._column_exists("silver_customer", "full_name"):
            return True
        if self._table_exists("duplicate_matches") and not self._column_exists("duplicate_matches", "composite_score"):
            return True
        return False

    def _migrate_schema(self) -> None:
        assert self.conn is not None

        if self._table_exists("bronze_customer"):
            self._add_column_if_missing("bronze_customer", "raw_completeness", "REAL")
            self._add_column_if_missing("bronze_customer", "format_validity", "TEXT")
            self._add_column_if_missing("bronze_customer", "schema_version", "TEXT")
            self._add_column_if_missing("bronze_customer", "source_system", "TEXT")
            self._add_column_if_missing("bronze_customer", "dlq_flag", "INTEGER DEFAULT 0")
            self._add_column_if_missing("bronze_customer", "dlq_reason", "TEXT")

        if self._table_exists("silver_customer"):
            self._add_column_if_missing("silver_customer", "field_validity_pct", "REAL")
            self._add_column_if_missing("silver_customer", "anomaly_flags", "TEXT")
            self._add_column_if_missing("silver_customer", "blocking_keys", "TEXT")
            self._add_column_if_missing("silver_customer", "normalized_at", "TEXT")

        if self._table_exists("duplicate_matches"):
            self._add_column_if_missing("duplicate_matches", "address_similarity", "REAL")
            self._add_column_if_missing("duplicate_matches", "llm_explanation", "TEXT")
            self._add_column_if_missing("duplicate_matches", "llm_confidence", "REAL")
            self._add_column_if_missing("duplicate_matches", "final_score", "REAL")
            self._add_column_if_missing("duplicate_matches", "blocking_keys", "TEXT")

        if self._table_exists("gold_customer"):
            self._add_column_if_missing("gold_customer", "llm_summary", "TEXT")
            self._add_column_if_missing("gold_customer", "record_quality_score", "REAL")
            self._add_column_if_missing("gold_customer", "survivorship_log", "TEXT")
            self._add_column_if_missing("gold_customer", "last_reeval_at", "TEXT")

        self.conn.commit()

    def _drop_pipeline_tables(self) -> None:
        assert self.conn is not None
        cursor = self.conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS correction_history")
        cursor.execute("DROP TABLE IF EXISTS review_queue")
        cursor.execute("DROP TABLE IF EXISTS duplicate_matches")
        cursor.execute("DROP TABLE IF EXISTS silver_customer")
        cursor.execute("DROP TABLE IF EXISTS bronze_customer")
        cursor.execute("DROP TABLE IF EXISTS gold_customer")
        cursor.execute("DROP TABLE IF EXISTS kafka_offsets")
        cursor.execute("DROP TABLE IF EXISTS db2_customer_simulated")
        self.conn.commit()

    def _insert_or_expand_mock_data(self, target_count: int) -> None:
        current_row = self.fetch_one("SELECT COUNT(*) AS c FROM db2_customer_simulated")
        current_count = int(current_row["c"] if current_row else 0)
        if current_count >= target_count:
            print(f"Mock DB2 already has {current_count} records")
            return

        to_create = target_count - current_count
        print(f"Generating {to_create} additional DB2 mock records")

        rng = random.Random(42 + current_count)
        people = self._generate_people(to_create, rng)

        start_idx = current_count + 1
        rows: list[tuple[Any, ...]] = []
        for idx, person in enumerate(people, start=start_idx):
            cust_id = f"C{idx:08d}"
            rows.append(
                (
                    cust_id,
                    person.first_name,
                    person.last_name,
                    person.email,
                    person.phone,
                    person.birth_date,
                    person.address,
                    person.city,
                    person.state,
                    rng.choice(["AS4K", "CRM1", "ERP2"]),
                    datetime.utcnow().isoformat(timespec="seconds"),
                    "A",
                )
            )

        assert self.conn is not None
        self.conn.executemany(
            """
            INSERT INTO db2_customer_simulated (
                cust_id, first_nm, last_nm, email_addr, phone_num, birth_dt,
                addr_line1, addr_city, addr_state, source_system, load_ts, rec_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        self.conn.commit()

    def _generate_people(self, record_count: int, rng: random.Random) -> list[MockPerson]:
        first_names = [
            "Mohammed", "Mohammad", "Sara", "Sarah", "Ali", "Aly", "Noah", "Nora", "John", "Jon",
            "Aisha", "Ayesha", "Priya", "Pryia", "Ravi", "Krish", "Krishna", "David", "Daniel", "Anita",
        ]
        last_names = [
            "Al Rashid", "Alrashid", "Johnson", "Jhonson", "Khan", "Khann", "Smith", "Smyth", "Reddy",
            "Reddi", "Patel", "Pateel", "Wilson", "Wilsn", "Mehta", "Sharma", "Nair", "Gupta", "Brown", "Miller",
        ]
        cities = [
            ("Dubai", "DU"),
            ("Abu Dhabi", "AD"),
            ("Bangalore", "KA"),
            ("Mumbai", "MH"),
            ("New York", "NY"),
            ("Chicago", "IL"),
            ("London", "LN"),
            ("Riyadh", "RD"),
        ]

        base_count = max(1, int(record_count * 0.65))
        base_people: list[MockPerson] = []
        for _ in range(base_count):
            fn = rng.choice(first_names)
            ln = rng.choice(last_names)
            city, state = rng.choice(cities)
            local = f"{fn}.{ln}".lower().replace(" ", "").replace("-", "")
            domain = rng.choice(["gmail.com", "outlook.com", "company.ae", "corp.org"])
            email = f"{local}{rng.randint(1, 9999)}@{domain}"
            phone = self._make_phone(rng)
            birth = self._make_birth_date(rng)
            address = f"{rng.randint(1, 999)} {rng.choice(['Main', 'Park', 'Lake', 'King', 'Hill'])} St"
            base_people.append(MockPerson(fn, ln, email, phone, birth, address, city, state))

        people: list[MockPerson] = list(base_people)
        while len(people) < record_count:
            base = rng.choice(base_people)
            people.append(self._mutate_person(base, rng))

        rng.shuffle(people)
        return people

    @staticmethod
    def _make_phone(rng: random.Random) -> str:
        prefix = rng.choice(["+1", "+44", "+91", "+971"])
        return prefix + "".join(rng.choice(string.digits) for _ in range(10))

    @staticmethod
    def _make_birth_date(rng: random.Random) -> str:
        start = datetime(1965, 1, 1)
        end = datetime(2003, 12, 31)
        dt = start + timedelta(days=rng.randint(0, (end - start).days))
        return dt.strftime("%Y-%m-%d")

    @staticmethod
    def _mutate_person(person: MockPerson, rng: random.Random) -> MockPerson:
        first_name = person.first_name
        last_name = person.last_name
        email = person.email
        phone = person.phone
        birth_date = person.birth_date
        address = person.address
        city = person.city
        state = person.state

        mutations = rng.sample(["name", "email", "phone", "address", "city"], k=rng.randint(1, 3))
        for mutation in mutations:
            if mutation == "name":
                if len(first_name) > 2 and rng.random() < 0.5:
                    first_name = first_name[:-1]
                if " " in last_name and rng.random() < 0.5:
                    last_name = last_name.replace(" ", "")
            elif mutation == "email":
                if "@" in email:
                    local, domain = email.split("@", 1)
                    if rng.random() < 0.5:
                        local = local.replace(".", "")
                    else:
                        local = f"{local}{rng.randint(1, 9)}"
                    email = f"{local}@{domain}"
            elif mutation == "phone":
                if phone.startswith("+") and rng.random() < 0.5:
                    phone = phone.replace("+", "00", 1)
                else:
                    phone = phone.replace("-", "")
            elif mutation == "address":
                address = address.replace("Street", "St").replace(" St", " Street") if rng.random() < 0.5 else address
            elif mutation == "city":
                replacements = {"New York": "NY", "Bangalore": "Bengaluru", "Dubai": "Dubai UAE", "Chicago": "CHI"}
                city = replacements.get(city, city)

        return MockPerson(first_name, last_name, email, phone, birth_date, address, city, state)

    def reset_pipeline_tables(self) -> None:
        assert self.conn is not None
        cursor = self.conn.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute("DELETE FROM review_queue")
        cursor.execute("DELETE FROM duplicate_matches")
        cursor.execute("DELETE FROM correction_history")
        cursor.execute("DELETE FROM gold_customer")
        cursor.execute("DELETE FROM silver_customer")
        cursor.execute("DELETE FROM bronze_customer")
        cursor.execute("DELETE FROM kafka_offsets")
        cursor.execute("PRAGMA foreign_keys = ON")
        self.conn.commit()

    def execute_query(self, query: str, params: tuple[Any, ...] | list[Any] | None = None, fetch: bool = False):
        assert self.conn is not None
        cursor = self.conn.cursor()
        cursor.execute(query, params or ())
        if fetch:
            rows = cursor.fetchall()
            cursor.close()
            return rows
        self.conn.commit()
        cursor.close()
        return None

    def fetch_one(self, query: str, params: tuple[Any, ...] | list[Any] | None = None) -> dict[str, Any] | None:
        assert self.conn is not None
        cursor = self.conn.cursor()
        cursor.execute(query, params or ())
        row = cursor.fetchone()
        cursor.close()
        return dict(row) if row else None

    def fetch_all(self, query: str, params: tuple[Any, ...] | list[Any] | None = None) -> list[dict[str, Any]]:
        assert self.conn is not None
        cursor = self.conn.cursor()
        cursor.execute(query, params or ())
        rows = cursor.fetchall()
        cursor.close()
        return [dict(row) for row in rows]

    def insert_record(self, table: str, data: dict[str, Any]) -> dict[str, Any] | None:
        assert self.conn is not None
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?"] * len(data))
        values = [json.dumps(v) if isinstance(v, (list, dict)) else v for v in data.values()]
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"

        cursor = self.conn.cursor()
        cursor.execute(query, values)
        self.conn.commit()

        rowid = cursor.lastrowid
        cursor.execute(f"SELECT * FROM {table} WHERE rowid = ?", (rowid,))
        row = cursor.fetchone()
        cursor.close()
        return dict(row) if row else None

    def close(self) -> None:
        if self.conn:
            self.conn.close()


_db: DatabaseConnection | None = None


def get_db() -> DatabaseConnection:
    global _db
    if _db is None:
        _db = DatabaseConnection()
    return _db
