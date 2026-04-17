"""Shared score and list normalization helpers."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any


def to_percent(value: Any) -> float:
    """Normalize score-like values to a 0-100 percentage."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0

    if number <= 1.0:
        number *= 100.0
    return max(0.0, min(100.0, round(number, 2)))


def normalize_json_list(value: Any) -> list[str]:
    """Convert JSON/text/list values to a list of non-empty strings."""
    if value is None:
        return []

    parsed: Any = value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except Exception:
            parsed = [part.strip() for part in stripped.split(",") if part.strip()]

    if isinstance(parsed, (tuple, set)):
        parsed = list(parsed)

    if isinstance(parsed, list):
        output: list[str] = []
        for item in parsed:
            text = str(item).strip()
            if text:
                output.append(text)
        return output

    text = str(parsed).strip()
    return [text] if text else []


def _soundex(text: str) -> str:
    if not text:
        return ""

    text = re.sub(r"[^A-Za-z]", "", text).upper()
    if not text:
        return ""

    mappings = {
        "B": "1", "F": "1", "P": "1", "V": "1",
        "C": "2", "G": "2", "J": "2", "K": "2", "Q": "2", "S": "2", "X": "2", "Z": "2",
        "D": "3", "T": "3",
        "L": "4",
        "M": "5", "N": "5",
        "R": "6",
    }

    first = text[0]
    encoded = [mappings.get(ch, "") for ch in text[1:]]

    collapsed: list[str] = []
    last = mappings.get(first, "")
    for code in encoded:
        if code and code != last:
            collapsed.append(code)
        last = code

    result = first + "".join(collapsed)
    return (result + "000")[:4]


def _birth_year(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""

    if len(raw) >= 4 and raw[:4].isdigit():
        return raw[:4]

    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y%m%d"):
        try:
            return str(datetime.strptime(raw, fmt).year)
        except Exception:
            continue
    return ""


def compute_blocking_keys(record: dict[str, Any]) -> list[str]:
    """Generate deterministic blocking keys used by incremental dedup logic."""
    email = str(record.get("email") or "").strip().lower()
    last_name = str(record.get("last_name") or "").strip().lower()
    phone = str(record.get("phone") or "")
    birth_date = str(record.get("birth_date") or "").strip()
    first_name = str(record.get("first_name") or "").strip().lower()

    keys: set[str] = set()

    if email and "@" in email and last_name:
        domain = email.split("@", 1)[1]
        keys.add(f"dom:{domain}:ln3:{last_name[:3]}")

    digits = re.sub(r"\D", "", phone)
    if len(digits) >= 7:
        keys.add(f"ph7:{digits[-7:]}")

    year = _birth_year(birth_date)
    if year and first_name:
        keys.add(f"by:{year}:fn:{_soundex(first_name)}")

    return sorted(keys)
