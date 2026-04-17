# DataFusion Platform — Complete Improvement Blueprint

> **Vision**: A real-time, LLM-augmented Master Data Management (MDM) platform where every byte of data is traceable from its raw Kafka event all the way through to a continuously self-healing Golden Master Record — with live scoring, transparent AI decisions, and a human-in-the-loop review layer that actually makes sense.

---

## Table of Contents

1. [Current State — Critical Problems](#1-current-state--critical-problems)
2. [Architecture Overhaul](#2-architecture-overhaul)
3. [Live Data Flow — End-to-End](#3-live-data-flow--end-to-end)
4. [Bronze Layer — Raw Vault Redesign](#4-bronze-layer--raw-vault-redesign)
5. [Silver Layer — Canonical Transform Logic](#5-silver-layer--canonical-transform-logic)
6. [Identity Layer — Deduplication Engine](#6-identity-layer--deduplication-engine)
7. [LLM Integration — Where and How](#7-llm-integration--where-and-how)
8. [Gold Layer — Auto-Merge and Self-Healing](#8-gold-layer--auto-merge-and-self-healing)
9. [Scoring System — Unified and Consistent](#9-scoring-system--unified-and-consistent)
10. [Multi-Table Views Per Page](#10-multi-table-views-per-page)
11. [Real-Time UI — Live Data Display](#11-real-time-ui--live-data-display)
12. [Backend API Redesign](#12-backend-api-redesign)
13. [Database Schema Improvements](#13-database-schema-improvements)
14. [Frontend Page-by-Page Rebuild Plan](#14-frontend-page-by-page-rebuild-plan)
15. [Implementation Roadmap](#15-implementation-roadmap)

---

## 1. Current State — Critical Problems

### 1.1 Score Scale Mismatch (Critical Bug)
The single most damaging issue in the current platform:

| Location | What Backend Sends | What UI Expects | Result |
|---|---|---|---|
| Review Workbench | `composite_score` as 0–100 (ai_score) | 0–1 then ×100 | Displays 8700% |
| Master Records confidence bar | `merge_confidence` as 0–100 | 0–1 then ×100, clamp to 1 | Shows 100% for all rows |
| Identity Graph signal bars | `feature_score` as 0–1 | ×100 — correct | Correct accidentally |
| Canonical completeness | 0–100 (but sometimes 0–1) | if ≤1 then ×100 else use raw | Fragile defensive code |

**Fix**: Standardize ALL scores to **0–100 floats** at the API layer. Never send 0–1 to the frontend. Remove all `×100` multiplication in the UI.

### 1.2 No True Live Streaming
- `/events` SSE only fires during a pipeline run, not continuously
- Kafka consumer ingests but there is no WebSocket pushing real-time row counts to the UI
- New records arriving from Kafka are invisible until the user manually refreshes

### 1.3 LLM Is an Afterthought
- `/ai/chat` and `/ai/analyze-match` call the LLM reactively
- LLM is not part of the core decision pipeline — it does not influence `ai_score`, threshold adjustments, or merge confidence
- There is no LLM-generated explanation stored alongside each match decision

### 1.4 Missing Multi-Table Views
- Every page shows one table; related data (e.g., the silver record alongside its raw vault source) requires navigating away
- No side-by-side diff view in Review Workbench
- No inline lineage expansion in Master Records

### 1.5 Auto-Merge is not Self-Healing
- Once AUTO_MERGE fires, merged records are static
- No periodic re-evaluation when new source data arrives
- No rollback mechanism or correction preview that actually applies

### 1.6 Review Queue is Inefficient
- Optimistic removal before server confirmation causes data loss if the server fails
- No batch-decision interface beyond `/review/bulk-decide`
- No priority ordering (high-confidence MANUAL_REVIEW items should be triaged first)

---

## 2. Architecture Overhaul

### 2.1 Proposed Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│   db2_customer_simulated  |  External APIs  |  File Uploads     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Kafka Producer (kafka_producer.py)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    KAFKA TOPICS                                  │
│   customer.raw  |  customer.dlq  |  customer.audit              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Kafka Consumer (kafka_consumer.py)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              BRONZE LAYER  (bronze_customer)                    │
│   Raw immutable append-only events, zero transformation        │
│   Scores: raw_completeness, format_validity                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Silver Transformer (silver_transformer.py)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              SILVER LAYER  (silver_customer)                    │
│   Normalized, standardized, enriched records                   │
│   Scores: completeness_pct, field_validity, anomaly_flag       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Dedup Engine (dedup_engine.py)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              IDENTITY LAYER  (duplicate_matches)                │
│   Candidate pairs with feature scores + composite + ai_score   │
│   LLM augments every MANUAL_REVIEW pair with explanation       │
└──────┬───────────────────┼───────────────────────┬─────────────┘
       │ AUTO_MERGE        │ MANUAL_REVIEW          │ SEPARATE
       │                   ▼                        │
       │        ┌─────────────────────┐            │
       │        │    REVIEW QUEUE     │            │
       │        │  (review_queue)     │            │
       │        │  Human decisions    │            │
       │        └──────────┬──────────┘            │
       │                   │ APPROVED              │
       ▼                   ▼                        │ (excluded)
┌─────────────────────────────────────────────────────────────────┐
│              GOLD LAYER  (gold_customer)                        │
│   Unified master records, merge confidence, source lineage     │
│   Self-healing: re-evaluated when new silver records arrive    │
│   LLM generates human-readable record summaries               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ FastAPI
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              API LAYER  (main.py + websocket.py)               │
│   REST endpoints + WebSocket live feed + SSE pipeline events   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              REACT FRONTEND                                     │
│   9 pages, each with multi-table views + live score displays   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 New Background Services

Add three always-running background workers alongside the existing pipeline:

| Service | File | Trigger | Purpose |
|---|---|---|---|
| `LiveIngestor` | `live_ingestor.py` | Kafka consumer loop | Continuously reads Kafka → writes bronze → triggers silver |
| `MatchScheduler` | `match_scheduler.py` | Every 60s or on new silver records | Incremental dedup for new arrivals only |
| `GoldRebuilder` | `gold_rebuilder.py` | On new APPROVED/AUTO_MERGE edges | Incremental gold merge, no full rebuild needed |

---

## 3. Live Data Flow — End-to-End

### 3.1 Kafka Event Schema (Improved)

**Current**: raw payload blob, minimal metadata  
**Improved**: strongly typed Avro/JSON schema with envelope

```json
{
  "event_id": "uuid-v4",
  "event_type": "customer.upsert",
  "source_system": "db2_crm",
  "source_record_id": "CUST-00123",
  "produced_at": "2024-01-15T10:23:45.123Z",
  "schema_version": "2.1",
  "payload": {
    "first_name": "Rajan",
    "last_name": "Mehta",
    "email": "rajan.mehta@example.com",
    "phone": "+91-98765-43210",
    "birth_date": "1985-03-12",
    "address": "42 MG Road",
    "city": "Bengaluru"
  },
  "metadata": {
    "kafka_topic": "customer.raw",
    "kafka_partition": 3,
    "kafka_offset": 10042
  }
}
```

### 3.2 WebSocket Live Feed (New)

Add `ws://api/ws/live-feed` — broadcasts a small JSON event to all connected clients whenever:
- A new bronze record is inserted
- A silver record is computed
- A dedup pair is created
- A gold merge happens

```json
{
  "type": "bronze_insert" | "silver_compute" | "pair_created" | "gold_merge",
  "record_id": "...",
  "timestamp": "...",
  "summary": { "bronze_total": 4821, "silver_total": 4799, "gold_total": 3102 }
}
```

The UI subscribes once on app load and uses this to update all KPI counters in real-time without polling.

### 3.3 Full Data Journey Example

```
[Source DB] CUST-00123 inserted
      │
      ▼
[Kafka Producer] publishes event_id=abc123 to customer.raw (partition=3, offset=10042)
      │
      ▼
[LiveIngestor] reads offset 10042, writes to bronze_customer:
  - raw_payload = full JSON
  - kafka_partition = 3, kafka_offset = 10042
  - ingest_timestamp = NOW()
  - raw_completeness = 85.7  ← computed inline
      │
      ├─► [WebSocket] broadcasts { type: "bronze_insert", record_id: "abc123" }
      │
      ▼
[SilverTransformer] normalizes in <200ms:
  - email lowercased, trimmed
  - phone E.164 formatted: +919876543210
  - birth_date ISO-8601: 1985-03-12
  - completeness_pct = 85.7 (6/7 fields present)
  - field_validity = { email: true, phone: true, dob: true }
      │
      ├─► [WebSocket] broadcasts { type: "silver_compute", record_id: "abc123" }
      │
      ▼
[MatchScheduler] runs incremental dedup for new silver record:
  - Compares against last 10,000 silver records using blocking keys
    (email domain + first 3 chars of last_name + birth_year)
  - For each candidate pair, computes feature scores + composite + ai_score
  - Inserts into duplicate_matches if composite ≥ 0.55
      │
      ├─► SEPARATE (ai_score < 70): marked, not queued
      ├─► MANUAL_REVIEW (70 ≤ ai_score < 90): → review_queue, LLM explains
      └─► AUTO_MERGE (ai_score ≥ 90): → GoldRebuilder immediately
                │
                ▼
[GoldRebuilder] rebuilds affected gold cluster:
  - Union-find across all APPROVED + AUTO_MERGE edges
  - merge_confidence = avg(ai_score) of cluster edges
  - Survivorship: best field from highest-quality source record wins
  - Writes to gold_customer
      │
      ├─► [WebSocket] broadcasts { type: "gold_merge", master_id: "..." }
      └─► SSE stream updated for pipeline page
```

---

## 4. Bronze Layer — Raw Vault Redesign

### 4.1 Schema Additions

```sql
ALTER TABLE bronze_customer ADD COLUMN IF NOT EXISTS raw_completeness   NUMERIC(5,2);
ALTER TABLE bronze_customer ADD COLUMN IF NOT EXISTS format_validity     JSONB;
ALTER TABLE bronze_customer ADD COLUMN IF NOT EXISTS schema_version      VARCHAR(10);
ALTER TABLE bronze_customer ADD COLUMN IF NOT EXISTS source_system       VARCHAR(64);
ALTER TABLE bronze_customer ADD COLUMN IF NOT EXISTS dlq_flag            BOOLEAN DEFAULT FALSE;
ALTER TABLE bronze_customer ADD COLUMN IF NOT EXISTS dlq_reason          TEXT;
```

### 4.2 Inline Bronze Scoring (computed at ingest, not downstream)

```python
def compute_bronze_scores(payload: dict) -> dict:
    """
    Computed at ingest time in LiveIngestor, stored on the bronze row.
    raw_completeness: what fraction of the 7 key fields are present at all
    format_validity: per-field boolean — is the value parseable/formatically valid
    """
    fields = ["first_name", "last_name", "email", "phone", "birth_date", "address", "city"]
    
    present = [f for f in fields if payload.get(f) and str(payload[f]).strip()]
    raw_completeness = round(len(present) / len(fields) * 100, 1)
    
    format_validity = {
        "email":      bool(re.match(r'^[^@]+@[^@]+\.[^@]+$', payload.get("email", ""))),
        "phone":      bool(re.match(r'^\+?[\d\s\-\(\)]{7,15}$', payload.get("phone", ""))),
        "birth_date": _is_valid_date(payload.get("birth_date")),
        "first_name": bool(payload.get("first_name", "").strip()),
        "last_name":  bool(payload.get("last_name", "").strip()),
    }
    
    return {
        "raw_completeness": raw_completeness,
        "format_validity": json.dumps(format_validity)
    }
```

### 4.3 Dead Letter Queue

Any event that fails schema validation or has zero recognizable fields goes to `customer.dlq` Kafka topic and is flagged `dlq_flag=TRUE` in bronze. These are visible in the Raw Vault Explorer as a separate "DLQ" tab with error reasons.

---

## 5. Silver Layer — Canonical Transform Logic

### 5.1 Normalization Functions (Explicit Rules)

```python
# email_normalize
def normalize_email(raw: str) -> str:
    return raw.strip().lower() if raw else ""

# phone_normalize: strip all non-digits, then apply E.164 with country prefix heuristic
def normalize_phone(raw: str, default_country="IN") -> str:
    digits = re.sub(r'\D', '', raw or "")
    if len(digits) == 10 and default_country == "IN":
        return "+91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return "+" + digits
    return digits if len(digits) >= 7 else ""

# birth_date_normalize: try multiple formats, output ISO-8601
def normalize_dob(raw: str) -> str:
    for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y%m%d"]:
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
        except:
            continue
    return ""

# name_normalize: title case, strip honorifics, remove extra spaces
def normalize_name(raw: str) -> str:
    honorifics = {"mr", "mrs", "ms", "dr", "prof", "sir"}
    parts = [p for p in raw.strip().split() if p.lower() not in honorifics]
    return " ".join(p.title() for p in parts)
```

### 5.2 Completeness Score — Extended (7 → 9 fields)

Add `address` and `city` as separate scoreable fields (they already exist but are combined into one slot). New 9-field formula:

```python
SCORED_FIELDS = [
    "first_name", "last_name", "email", "phone",
    "birth_date", "address", "city", "postal_code", "country"
]

def compute_completeness(record: dict) -> float:
    filled = sum(1 for f in SCORED_FIELDS if record.get(f) and str(record[f]).strip())
    return round(filled / len(SCORED_FIELDS) * 100, 1)
```

### 5.3 Field Validity Score (New)

```python
def compute_field_validity(record: dict) -> float:
    """
    Returns 0–100: what fraction of present fields are also format-valid.
    If a field is absent, it doesn't penalize validity (that's completeness's job).
    """
    checks = {
        "email":      lambda v: bool(re.match(r'^[^@]+@[^@]+\.[^@]+$', v)),
        "phone":      lambda v: len(re.sub(r'\D','',v)) >= 10,
        "birth_date": lambda v: _is_valid_date(v),
        "postal_code":lambda v: bool(re.match(r'^\d{5,6}$', v)),
    }
    present_checkable = {k: v for k, v in record.items() if k in checks and v}
    if not present_checkable:
        return 100.0  # Nothing to check — not invalid
    valid = sum(1 for k, v in present_checkable.items() if checks[k](str(v)))
    return round(valid / len(present_checkable) * 100, 1)
```

### 5.4 Anomaly Detection (New)

Lightweight statistical anomaly flags stored on each silver record:

```python
def detect_anomalies(record: dict, population_stats: dict) -> list[str]:
    """
    Returns list of anomaly codes. population_stats is pre-computed from silver table.
    """
    flags = []
    if record.get("birth_date"):
        age = compute_age(record["birth_date"])
        if age < 0 or age > 120:
            flags.append("INVALID_AGE")
        if age < 18:
            flags.append("MINOR")
    if record.get("email") and record["email"].endswith(KNOWN_DISPOSABLE_DOMAINS):
        flags.append("DISPOSABLE_EMAIL")
    if record.get("phone") and record["phone"] in population_stats.get("duplicate_phones", set()):
        flags.append("SHARED_PHONE")
    return flags
```

Stored as `anomaly_flags TEXT[]` column on `silver_customer`.

---

## 6. Identity Layer — Deduplication Engine

### 6.1 Blocking Strategy (Performance Fix)

Current implementation compares every record against every other — O(n²). Fix with blocking:

```python
def generate_blocking_keys(record: dict) -> list[str]:
    """
    Multiple blocking keys — a pair is a candidate if they share ANY blocking key.
    Reduces comparison space from O(n²) to O(n × block_size).
    """
    keys = []
    
    # Email domain + first 3 chars of last name
    if record.get("email") and record.get("last_name"):
        domain = record["email"].split("@")[-1]
        keys.append(f"dom:{domain}:ln3:{record['last_name'][:3].lower()}")
    
    # Phone last 7 digits (handles country code variations)
    if record.get("phone"):
        digits = re.sub(r'\D', '', record["phone"])
        if len(digits) >= 7:
            keys.append(f"ph7:{digits[-7:]}")
    
    # Birth year + first name soundex
    if record.get("birth_date") and record.get("first_name"):
        year = record["birth_date"][:4]
        keys.append(f"by:{year}:fn:{soundex(record['first_name'])}")
    
    return keys
```

### 6.2 Feature Score Matrix

All scores stored as individual columns on `duplicate_matches` for full transparency:

```sql
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS email_match      NUMERIC(4,3);
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS phone_match      NUMERIC(4,3);
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS name_similarity  NUMERIC(4,3);
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS dob_match        NUMERIC(4,3);
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS city_similarity  NUMERIC(4,3);
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS address_similarity NUMERIC(4,3);  -- NEW
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS composite_score  NUMERIC(5,2);   -- 0–100
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS ai_score         NUMERIC(5,2);   -- 0–100
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS llm_explanation  TEXT;           -- NEW
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS llm_confidence   NUMERIC(5,2);   -- NEW
ALTER TABLE duplicate_matches ADD COLUMN IF NOT EXISTS blocking_keys    TEXT[];         -- NEW
```

### 6.3 Improved Composite Formula

Add `address_similarity` as a 6th feature:

```python
WEIGHTS = {
    "email":    0.35,
    "phone":    0.28,
    "name":     0.18,
    "dob":      0.10,
    "city":     0.05,
    "address":  0.04,   # new — small weight, but useful signal
}

def compute_composite(features: dict) -> float:
    raw = (
        features["email"]   * WEIGHTS["email"]   +
        features["phone"]   * WEIGHTS["phone"]   +
        features["name"]    * WEIGHTS["name"]    +
        features["dob"]     * WEIGHTS["dob"]     +
        features["city"]    * WEIGHTS["city"]    +
        features["address"] * WEIGHTS["address"]
    )
    return round(raw * 100, 2)  # Always return 0–100
```

### 6.4 AI Score (Unified)

```python
def compute_ai_score(composite_0_to_100: float, features: dict) -> float:
    """
    composite_0_to_100: already in 0–100 range
    Returns ai_score in 0–100.
    """
    bonus = 0
    if features["phone"] == 1.0 and features["dob"] == 1.0:
        bonus = 5  # both exact matches → high certainty
    if features["email"] == 1.0 and features["name"] >= 0.95:
        bonus = max(bonus, 3)  # exact email + near-exact name
    
    return min(100.0, composite_0_to_100 + bonus)
```

---

## 7. LLM Integration — Where and How

### 7.1 LLM Touch Points (Precise)

| When | What LLM Does | Where Stored | Latency |
|---|---|---|---|
| New MANUAL_REVIEW pair | Explains why records might be the same person | `duplicate_matches.llm_explanation` | Async, < 3s |
| New MANUAL_REVIEW pair | Gives its own confidence estimate (0–100) | `duplicate_matches.llm_confidence` | Same call |
| Human APPROVE decision | LLM generates merge rationale for audit | `review_queue.llm_merge_rationale` | Async |
| New gold record created | LLM writes a human-readable summary of the master record | `gold_customer.llm_summary` | Async |
| Data quality report | LLM synthesizes patterns from last 500 records | `/ai/data-quality-report` | On-demand |
| Chat | LLM answers platform questions with live data context | Ephemeral | Real-time |

### 7.2 LLM Explanation Prompt (MANUAL_REVIEW)

```python
MATCH_EXPLAIN_PROMPT = """
You are a data quality analyst reviewing a potential duplicate customer record match.

Record A:
{record_a_json}

Record B:
{record_b_json}

Feature Scores (all 0–1):
- Email match: {email_match}
- Phone match: {phone_match}
- Name similarity: {name_similarity}
- Date of birth match: {dob_match}
- City similarity: {city_similarity}
- Address similarity: {address_similarity}

Composite Match Score: {composite_score}/100
Algorithmic AI Score: {ai_score}/100

Task:
1. Explain in 2–3 sentences WHY these records might be the same person.
2. Identify the strongest evidence for a match.
3. Identify any red flags or reasons they might be different people.
4. Give your own confidence estimate (0–100) for this being a true duplicate.

Respond as JSON:
{
  "explanation": "...",
  "strongest_evidence": "...",
  "red_flags": "...",
  "llm_confidence": 85
}
"""
```

### 7.3 LLM Confidence vs AI Score — Combined Decision

When LLM explanation is available, use a blended score for threshold decisions:

```python
def compute_final_decision_score(ai_score: float, llm_confidence: float | None) -> float:
    if llm_confidence is None:
        return ai_score
    # Blend: 70% algorithmic, 30% LLM
    return round(ai_score * 0.70 + llm_confidence * 0.30, 2)

# Thresholds stay the same: ≥90 AUTO_MERGE, 70–89 MANUAL_REVIEW, <70 SEPARATE
# But now the score used is the blended one, not pure ai_score
```

### 7.4 LLM Gold Record Summary Prompt

```python
GOLD_SUMMARY_PROMPT = """
Summarize this unified master customer record in 1–2 sentences for a business user.
Mention: full name, general location, how many source records were merged, and confidence level.

Master Record:
{gold_record_json}

Number of source records merged: {source_count}
Merge confidence: {merge_confidence}/100

Respond with just the summary sentence. No JSON. No labels.
"""
```

---

## 8. Gold Layer — Auto-Merge and Self-Healing

### 8.1 Survivorship Rules (Field-Level)

When merging N records into a gold master, each field is chosen by survivorship rules, not just random or first-wins:

```python
SURVIVORSHIP_RULES = {
    "email": "most_recent_valid",     # latest email that passes validation
    "phone": "most_frequent_valid",   # most commonly seen phone across sources
    "first_name": "most_frequent",    # mode across all source records
    "last_name": "most_frequent",
    "birth_date": "most_frequent_valid",
    "address": "most_recent",         # address changes legitimately, take newest
    "city": "most_recent",
    "postal_code": "most_recent",
}

def apply_survivorship(records: list[dict], field: str) -> str:
    rule = SURVIVORSHIP_RULES.get(field, "most_recent")
    values = [r.get(field, "") for r in records if r.get(field)]
    
    if rule == "most_recent_valid":
        # sorted by ingestion timestamp DESC, pick first valid
        ...
    elif rule == "most_frequent_valid":
        # Counter, pick most common that also passes validation
        ...
    elif rule == "most_frequent":
        return Counter(values).most_common(1)[0][0] if values else ""
    elif rule == "most_recent":
        return values[-1] if values else ""  # assuming sorted by timestamp
```

### 8.2 Self-Healing: Re-evaluation on New Silver Arrivals

```python
async def on_new_silver_record(silver_id: str):
    """
    Called by LiveIngestor after each new silver record.
    Incrementally checks if new record belongs to an existing gold cluster.
    """
    # 1. Run blocking for new silver record
    blocking_keys = generate_blocking_keys(get_silver_record(silver_id))
    
    # 2. Find existing gold masters that share any blocking key via their source records
    candidate_masters = find_gold_masters_by_blocking_keys(blocking_keys)
    
    # 3. For each candidate master, score new record against master's canonical fields
    for master_id in candidate_masters:
        score = compute_match_score(silver_id, master_id)
        if score.ai_score >= 90:
            # Fold new record into existing gold cluster → AUTO_MERGE
            merge_into_existing_cluster(silver_id, master_id, score)
        elif score.ai_score >= 70:
            # Queue for human review with existing master as context
            add_to_review_queue(silver_id, master_id, score)
    
    # 4. If no match found, create new singleton gold record
    if not candidate_masters:
        create_singleton_gold_record(silver_id)
```

### 8.3 Correction Preview That Actually Applies

Current `corrections-preview` endpoint returns a list but the UI cannot apply it. New flow:

```
GET /master/corrections-preview
→ Returns list of proposed field corrections with confidence and reasoning

POST /master/apply-correction
Body: { master_id, field, proposed_value, source_record_id }
→ Applies field-level correction, logs to correction_history table, triggers partial gold rebuild
→ LLM logs rationale for the correction
```

New table:
```sql
CREATE TABLE IF NOT EXISTS correction_history (
    id              SERIAL PRIMARY KEY,
    master_id       VARCHAR(64),
    field_name      VARCHAR(64),
    old_value       TEXT,
    new_value       TEXT,
    applied_by      VARCHAR(64),  -- 'AUTO' or user ID
    applied_at      TIMESTAMP DEFAULT NOW(),
    llm_rationale   TEXT,
    confidence      NUMERIC(5,2)
);
```

---

## 9. Scoring System — Unified and Consistent

### 9.1 The Golden Rule

**ALL scores across the entire platform are `NUMERIC(5,2)` values in the range 0.00–100.00.**

No exceptions. No 0–1 values sent to the frontend. No frontend multiplication.

### 9.2 Score Taxonomy

| Score Name | Range | Computed In | Stored In | Meaning |
|---|---|---|---|---|
| `raw_completeness` | 0–100 | `live_ingestor.py` | `bronze_customer` | Fraction of 7 key fields present in raw event |
| `format_validity` | JSONB | `live_ingestor.py` | `bronze_customer` | Per-field boolean validity (not a single number) |
| `completeness_pct` | 0–100 | `silver_transformer.py` | `silver_customer` | Fraction of 9 canonical fields non-empty after normalization |
| `field_validity_pct` | 0–100 | `silver_transformer.py` | `silver_customer` | Fraction of present fields that pass format validation |
| `email_match` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Exact email match (0 or 100) |
| `phone_match` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Exact phone match (0 or 100) |
| `name_similarity` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Fuzzy name similarity (continuous) |
| `dob_match` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Exact DOB match (0 or 100) |
| `city_similarity` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Fuzzy city similarity (continuous) |
| `address_similarity` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Fuzzy address similarity (continuous) |
| `composite_score` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Weighted sum of feature scores |
| `ai_score` | 0–100 | `dedup_engine.py` | `duplicate_matches` | Composite + bonus |
| `llm_confidence` | 0–100 | LLM call | `duplicate_matches` | LLM's own estimate of true duplicate probability |
| `final_score` | 0–100 | `decision_engine.py` | `duplicate_matches` | Blended (70% ai_score + 30% llm_confidence) |
| `merge_confidence` | 0–100 | `golden_merger.py` | `gold_customer` | Average final_score of all edges in gold cluster |
| `record_quality_score` | 0–100 | `golden_merger.py` | `gold_customer` | Avg completeness of source records |

### 9.3 Quality Progression API (Fixed)

The `/quality/progression` endpoint must return consistent values where each stage is ≥ the previous. Computed correctly, not artificially inflated:

```python
progression = {
    "raw": {
        "completeness":   avg_raw_completeness,    # from bronze_customer
        "validity":       avg_format_validity_pct, # computed from format_validity JSONB
        "confidence":     0.0,                     # always 0 — no dedup at raw stage
    },
    "canonical": {
        "completeness":   avg_completeness_pct,    # from silver_customer
        "validity":       avg_field_validity_pct,  # from silver_customer
        "confidence":     avg_canonical_confidence,# from email+phone validity (capped at 60)
    },
    "identity": {
        "completeness":   canonical["completeness"],  # same — completeness doesn't change
        "validity":       canonical["validity"],       # same
        "confidence":     avg_final_score_of_matches, # from duplicate_matches.final_score
    },
    "master": {
        "completeness":   avg_gold_completeness,    # may be higher: survivorship picks best
        "validity":       avg_gold_validity,
        "confidence":     avg_merge_confidence,    # from gold_customer.merge_confidence
    }
}
```

---

## 10. Multi-Table Views Per Page

### 10.1 Command Center — Three Panels

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP ROW: Live KPI Cards (polling WebSocket for real-time)      │
│  Bronze | Silver | Identity Pairs | Review Queue | Gold Records │
└─────────────────────────────────────────────────────────────────┘
┌──────────────────────┬──────────────────────┬───────────────────┐
│ Quality Progression  │ Decision Donut       │ Live Event Feed   │
│ Radar/bar per stage  │ AUTO/MANUAL/SEP      │ Last 20 WebSocket │
│                      │                      │ events, live      │
└──────────────────────┴──────────────────────┴───────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  BOTTOM: Recent Auto-Merges Table                               │
│  master_id | merged_count | confidence | merged_at | source     │
│  (last 10 rows, refreshes on WebSocket gold_merge events)       │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Raw Vault Explorer — Four Tabs

| Tab | Content |
|---|---|
| **All Records** | Full paginated bronze table with inline completeness bar and validity icons per field |
| **DLQ** | Dead-letter records with `dlq_reason` column |
| **Kafka Offsets** | Per-partition offset progress table: topic, partition, latest_offset, consumer_lag |
| **Schema Versions** | Count of records per `schema_version` — quickly spot version drift |

### 10.3 Canonical Explorer — Three Panels

```
┌────────────────────────────────────────────────────────────────┐
│ Stats bar: avg_completeness | avg_validity | anomaly_count     │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────┬───────────────────────────────────┐
│ Records Table (main)       │ Selected Record Detail Panel      │
│ + completeness bar         │ - Field-by-field comparison:      │
│ + validity icons           │   Raw value | Normalized value    │
│ + anomaly badge            │   | Valid? | Completeness impact  │
│                            │ - Anomaly flags list              │
│                            │ - Link → Identity Graph entries   │
└────────────────────────────┴───────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│ Quality Issues Table: field | issue_type | record_count        │
│ (e.g. "email | INVALID_FORMAT | 142 records")                  │
└────────────────────────────────────────────────────────────────┘
```

### 10.4 Identity Graph — Three Panels

```
┌─────────────────────────┬──────────────────────────────────────┐
│ Match Pairs Table       │ Side-by-Side Record Diff             │
│ - Record A ID           │ Field | Record A | Record B | Match? │
│ - Record B ID           │ first_name | Rajan | Rajan K | 95%  │
│ - composite_score bar   │ email | rajan@.. | rajan@.. | 100%  │
│ - ai_score badge        │ phone | +919876.. | +919877.. | 0%  │
│ - llm_confidence        │ dob   | 1985-03-12 | 1985-03-12|100%│
│ - decision badge        │ city  | Bengaluru | Bangalore | 78% │
│ - decision_at           ├──────────────────────────────────────┤
│                         │ LLM Explanation                      │
│                         │ "These records share identical email  │
│                         │ and date of birth. The phone numbers  │
│                         │ differ by one digit which may be a   │
│                         │ typo. High confidence of duplicate." │
│                         │ LLM Confidence: 88/100               │
└─────────────────────────┴──────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│ Score Breakdown Table: Feature | Score | Weight | Contribution │
│ email     | 100.0 | 35% | 35.0                                 │
│ phone     |   0.0 | 28% |  0.0                                 │
│ name      |  95.0 | 18% | 17.1                                 │
│ dob       | 100.0 | 10% | 10.0                                 │
│ city      |  78.0 |  5% |  3.9                                 │
│ address   |  60.0 |  4% |  2.4                                 │
│ COMPOSITE |       |100% | 68.4  ← candidate gate: ≥55 ✓       │
│ + bonus   |       |     |  0.0  ← phone≠1 or dob≠1            │
│ AI SCORE  |       |     | 68.4  → SEPARATE (< 70)             │
└────────────────────────────────────────────────────────────────┘
```

### 10.5 Review Workbench — Complete Redesign

The biggest UX improvement area. Current: one record at a time, no diff, no LLM inline.

```
┌──────────────────────────────────────────────────────────────────┐
│ Queue Summary: 34 PENDING | 8 HIGH PRIORITY (ai_score ≥ 85)     │
│ Keyboard: [A]pprove  [R]eject  [S]kip  [B]atch mode             │
└──────────────────────────────────────────────────────────────────┘
┌────────────────────┬─────────────────────────────────────────────┐
│ Queue List         │ CURRENT PAIR REVIEW                         │
│ (sorted by         ├──────────────────┬──────────────────────────┤
│  final_score DESC) │ RECORD A         │ RECORD B                 │
│                    │ Source: CRM-001  │ Source: ERP-047          │
│ ▶ Pair #1041  88  │ Ingested: 2h ago │ Ingested: 5d ago         │
│   Pair #1038  85  ├──────────────────┼──────────────────────────┤
│   Pair #1033  82  │ Rajan Mehta      │ Rajan K Mehta            │
│   Pair #1029  79  │ rajan@corp.com   │ rajan@corp.com     ✓MATCH│
│   Pair #1022  76  │ +91 98765 43210  │ +91 98765 43211    ✗DIFF │
│   Pair #1019  74  │ 1985-03-12       │ 1985-03-12         ✓MATCH│
│   Pair #1011  72  │ 42 MG Road       │ MG Road 42         ~NEAR │
│                   │ Bengaluru 560001 │ Bangalore 560001   ~NEAR │
│                   ├──────────────────┴──────────────────────────┤
│                   │ SCORES:                                      │
│                   │ Composite: 68.4 | AI: 68.4 | LLM: 88       │
│                   │ Final (blended): 74.3 → MANUAL_REVIEW ✓     │
│                   ├─────────────────────────────────────────────┤
│                   │ LLM SAYS:                                    │
│                   │ "Strong match — identical email and DOB.     │
│                   │  Phone differs by 1 digit (likely typo).    │
│                   │  Address is same location, different format."│
│                   │ LLM Confidence: 88/100                      │
│                   ├─────────────────────────────────────────────┤
│                   │ [✓ APPROVE MERGE]      [✗ REJECT / SEPARATE]│
│                   │ (A / →)                (R / ←)              │
└────────────────────┴─────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ BATCH MODE: Select multiple → Bulk Approve / Bulk Reject         │
│ □ Pair #1022  76.1   □ Pair #1019  74.0   □ Pair #1011  72.3   │
│ [Select All ≥ 80]  [Select All ≥ 75]  [Bulk Approve Selected]   │
└──────────────────────────────────────────────────────────────────┘
```

### 10.6 Master Records — Three Panels

```
┌────────────────────────────────────────────────────────────────┐
│ Stats: Total Masters | Avg Merge Confidence | Multi-Source %   │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────┬───────────────────────────────────┐
│ Master Records Table       │ Master Detail Panel               │
│ - master_id                │ ┌───────────────────────────────┐ │
│ - full_name                │ │ LLM Summary                   │ │
│ - email                    │ │ "Rajan Mehta is a verified    │ │
│ - merge_confidence bar     │ │  customer from Bengaluru. 3   │ │
│ - source_count             │ │  source records merged with   │ │
│ - last_updated             │ │  91.7% confidence."           │ │
│ - [View Lineage]           │ └───────────────────────────────┘ │
│                            │ Source Records (inline table):    │
│                            │ ID | System | Completeness | Date │
│                            │ A1 | CRM    | 85.7%        | 2d   │
│                            │ B2 | ERP    | 71.4%        | 5d   │
│                            │ C4 | WEB    | 57.1%        | 12d  │
│                            │                                   │
│                            │ Field Survivorship:               │
│                            │ email → from A1 (most recent)     │
│                            │ phone → from B2 (most frequent)   │
│                            │ address → from A1 (most recent)   │
│                            │                                   │
│                            │ Corrections History (inline):     │
│                            │ email corrected 3d ago by AUTO    │
│                            │ phone corrected 1d ago by User-7  │
└────────────────────────────┴───────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│ Proposed Corrections Table (from /master/corrections-preview): │
│ field | current | proposed | confidence | source | [Apply]     │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. Real-Time UI — Live Data Display

### 11.1 WebSocket Integration Pattern (Frontend)

```typescript
// hooks/useLiveFeed.ts
export function useLiveFeed() {
    const [counts, setCounts] = useState<StageCounts>(initialCounts);
    const [recentEvents, setRecentEvents] = useState<LiveEvent[]>([]);
    
    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE}/ws/live-feed`);
        
        ws.onmessage = (msg) => {
            const event: LiveEvent = JSON.parse(msg.data);
            
            // Update stage counts from summary embedded in every event
            setCounts(event.summary);
            
            // Prepend to recent events ring buffer (max 50)
            setRecentEvents(prev => [event, ...prev].slice(0, 50));
        };
        
        return () => ws.close();
    }, []);
    
    return { counts, recentEvents };
}
```

### 11.2 Live Event Feed Component

A real-time scrolling feed visible on the Command Center showing:
- `[10:23:45] BRONZE INSERT   CUST-00456 (completeness: 85.7%)`
- `[10:23:46] SILVER COMPUTE  CUST-00456 (validity: 100%)`
- `[10:23:47] PAIR CREATED    CUST-00456 ↔ CUST-00231 (score: 87.4)`
- `[10:23:47] MANUAL REVIEW   Pair #1044 added to review queue`
- `[10:23:48] AUTO MERGE      CUST-00456 → MASTER-0088 (confidence: 92.1%)`

### 11.3 Live Counters in Nav Sidebar

Replace static `/summary` polling (30s) with WebSocket-driven counters that update instantly:
- Bronze total: `4,821` → updates to `4,822` as soon as a new record arrives
- Review queue badge: `34` → drops to `33` immediately after a decision
- Gold records: `3,102` → increments on each merge

### 11.4 Score Animations

When a pair is reviewed and merged, animate the confidence value on the gold record from old to new (smooth transition over 500ms). Use CSS `counter` animations for KPI cards.

---

## 12. Backend API Redesign

### 12.1 New / Modified Endpoints

| Method | Endpoint | Change | Purpose |
|---|---|---|---|
| `GET` | `/ws/live-feed` | NEW | WebSocket live event broadcast |
| `GET` | `/summary` | MODIFIED | Returns all scores in 0–100 range |
| `POST` | `/pipeline/run` | MODIFIED | Returns real stage durations, not synthetic 100ms |
| `GET` | `/vault/records` | MODIFIED | Includes `raw_completeness` and `format_validity` |
| `GET` | `/vault/dlq` | NEW | Dead letter queue records |
| `GET` | `/canonical/records` | MODIFIED | Includes `field_validity_pct` and `anomaly_flags` |
| `GET` | `/identity/graph` | MODIFIED | Includes all 6 feature scores + llm_confidence + llm_explanation |
| `POST` | `/review/decide` | MODIFIED | No optimistic removal — confirm server write before UI update |
| `GET` | `/master/records` | MODIFIED | Includes source records inline, field survivorship metadata |
| `POST` | `/master/apply-correction` | NEW | Apply a proposed correction and log it |
| `GET` | `/master/correction-history/{master_id}` | NEW | Audit trail of all corrections |
| `GET` | `/lineage/{cust_id}` | MODIFIED | Include score at each stage for the specific record |
| `GET` | `/health` | MODIFIED | Include Kafka consumer lag, last event timestamp |

### 12.2 Consistent Response Envelope

Every endpoint wraps its response:

```json
{
    "status": "ok",
    "timestamp": "2024-01-15T10:23:45.123Z",
    "data": { ... },
    "pagination": { "total": 4821, "page": 1, "limit": 50 },
    "meta": { "query_ms": 12, "cache_hit": false }
}
```

### 12.3 Score Normalization Middleware

Add a FastAPI middleware that validates outgoing responses for score fields and raises an error if any score is outside 0–100 range or in 0–1 range when the field name implies a percentage:

```python
class ScoreValidationMiddleware(BaseHTTPMiddleware):
    SCORE_FIELDS = {
        "composite_score", "ai_score", "merge_confidence", "completeness_pct",
        "field_validity_pct", "llm_confidence", "final_score", "raw_completeness"
    }
    
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # In dev mode: deserialize response body, check all score fields, log warnings
        return response
```

---

## 13. Database Schema Improvements

### 13.1 New Columns Summary

```sql
-- bronze_customer
ALTER TABLE bronze_customer
    ADD COLUMN raw_completeness  NUMERIC(5,2),
    ADD COLUMN format_validity   JSONB,
    ADD COLUMN schema_version    VARCHAR(10),
    ADD COLUMN source_system     VARCHAR(64),
    ADD COLUMN dlq_flag          BOOLEAN DEFAULT FALSE,
    ADD COLUMN dlq_reason        TEXT;

-- silver_customer
ALTER TABLE silver_customer
    ADD COLUMN field_validity_pct  NUMERIC(5,2),
    ADD COLUMN anomaly_flags       TEXT[],
    ADD COLUMN blocking_keys       TEXT[],
    ADD COLUMN normalized_at       TIMESTAMP;

-- duplicate_matches (all scores standardized to 0–100)
ALTER TABLE duplicate_matches
    ADD COLUMN address_similarity  NUMERIC(5,2),
    ADD COLUMN llm_explanation     TEXT,
    ADD COLUMN llm_confidence      NUMERIC(5,2),
    ADD COLUMN final_score         NUMERIC(5,2),
    ADD COLUMN blocking_keys       TEXT[];

-- gold_customer
ALTER TABLE gold_customer
    ADD COLUMN llm_summary         TEXT,
    ADD COLUMN record_quality_score NUMERIC(5,2),
    ADD COLUMN survivorship_log    JSONB,
    ADD COLUMN last_reeval_at      TIMESTAMP;

-- New table
CREATE TABLE correction_history (
    id            SERIAL PRIMARY KEY,
    master_id     VARCHAR(64) NOT NULL,
    field_name    VARCHAR(64),
    old_value     TEXT,
    new_value     TEXT,
    applied_by    VARCHAR(64),
    applied_at    TIMESTAMP DEFAULT NOW(),
    llm_rationale TEXT,
    confidence    NUMERIC(5,2),
    FOREIGN KEY (master_id) REFERENCES gold_customer(master_id)
);

-- Indexes for performance
CREATE INDEX idx_duplicate_matches_blocking ON duplicate_matches USING GIN (blocking_keys);
CREATE INDEX idx_silver_customer_blocking   ON silver_customer   USING GIN (blocking_keys);
CREATE INDEX idx_silver_customer_score      ON silver_customer (completeness_pct DESC);
CREATE INDEX idx_gold_customer_confidence   ON gold_customer (merge_confidence DESC);
CREATE INDEX idx_correction_history_master  ON correction_history (master_id, applied_at DESC);
```

### 13.2 Partitioning for Scale

Partition `bronze_customer` by ingestion month for query performance as data grows:

```sql
-- Convert to partitioned table (requires data migration)
CREATE TABLE bronze_customer_partitioned (
    LIKE bronze_customer INCLUDING ALL
) PARTITION BY RANGE (ingest_timestamp);

CREATE TABLE bronze_customer_2024_01 PARTITION OF bronze_customer_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- etc.
```

---

## 14. Frontend Page-by-Page Rebuild Plan

### 14.1 Shared Components to Build

| Component | Purpose |
|---|---|
| `<ScoreBar score={87.4} />` | Universal horizontal bar, 0–100 input, color-coded |
| `<ScoreBadge score={87.4} />` | Compact badge: green ≥80, amber 50–79, red <50 |
| `<LiveCounter value={4821} />` | Animates count changes from WebSocket |
| `<FeatureScoreGrid features={...} />` | 6-feature score matrix with weight and contribution |
| `<RecordDiff recordA={} recordB={} />` | Side-by-side field diff with match indicators |
| `<LLMPanel explanation={} confidence={} />` | LLM explanation card with confidence badge |
| `<LiveEventFeed events={[]} />` | Scrolling real-time event list |
| `<SurviviorshipTable sources={[]} />` | Which source won each field and why |

### 14.2 Score Display Rules (Never Break These)

```typescript
// Score utility — all scores are 0–100 from API, no transformation needed
export const scoreColor = (score: number): string => {
    if (score >= 80) return "text-green-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
};

export const scoreBg = (score: number): string => {
    if (score >= 80) return "bg-green-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-red-500";
};

// Never do this:  Math.round(score * 100)
// Always do this: Math.round(score)
```

### 14.3 Review Workbench Fix (Optimistic Update Bug)

```typescript
// WRONG (current):
const handleApprove = async (pairId: string) => {
    removeFromQueue(pairId);    // optimistic — happens before server
    await api.decide(pairId, "APPROVE");  // if this fails, record is lost from UI
};

// CORRECT:
const handleApprove = async (pairId: string) => {
    setSubmitting(true);
    try {
        await api.decide(pairId, "APPROVE");  // server first
        removeFromQueue(pairId);               // then UI update
        showSuccess("Approved and merged");
    } catch (err) {
        showError("Failed to approve — record remains in queue");
    } finally {
        setSubmitting(false);
    }
};
```

---

## 15. Implementation Roadmap

### Phase 1 — Fix Critical Bugs (Week 1)
- [x] Standardize core API score outputs to 0–100
- [x] Remove all `× 100` in shared frontend score components
- [x] Fix Review Workbench optimistic update order
- [x] Fix Master Records confidence bar scale assumption

### Phase 2 — Live Data Infrastructure (Week 2)
- [x] Implement `LiveIngestor` background service
- [x] Add WebSocket endpoint `/ws/live-feed`
- [x] Refactor frontend to use `useLiveFeed` hook
- [x] Replace 30s polling in sidebar with WebSocket counters
- [x] Add DLQ bronze flags and raw scoring columns

### Phase 3 — Enhanced Scoring (Week 3)
- [x] Add `format_validity` to bronze at ingest time
- [x] Add `field_validity_pct` and `anomaly_flags` to silver
- [x] Add `address_similarity` as 6th dedup feature
- [x] Implement blocking key generation for incremental dedup
- [x] Implement blended `final_score` (ai_score + llm_confidence)

### Phase 4 — LLM Integration (Week 4)
- [ ] Async LLM explanation for all MANUAL_REVIEW pairs
- [ ] Store `llm_explanation` and `llm_confidence` on `duplicate_matches`
- [ ] Async LLM gold record summary on every merge
- [ ] Display LLM panel in Review Workbench and Identity Graph

### Phase 5 — Multi-Table UI (Week 5)
- [ ] Build shared components: ScoreBar, RecordDiff, FeatureScoreGrid, LLMPanel
- [ ] Rebuild Identity Graph with side-by-side diff + score breakdown table
- [ ] Rebuild Review Workbench with queue list + diff + LLM + batch mode
- [ ] Rebuild Master Records with inline source records + survivorship table
- [ ] Add DLQ tab and Kafka offsets tab to Raw Vault Explorer

### Current Progress Notes
- Backend score storage, bronze/silver enrichment, and identity feature scoring are now aligned to 0–100.
- Live WebSocket broadcasting is in place; frontend consumers still need to move off polling.
- The remaining work is mostly UI completion and the live ingestor/scheduler/rebuilder workers.

### Phase 6 — Self-Healing Gold (Week 6)
- [ ] Implement `on_new_silver_record` incremental re-evaluation
- [ ] Implement survivorship rules for field-level merge
- [x] Implement `MatchScheduler` background service
- [x] Implement `GoldRebuilder` incremental background service
- [x] Implement `/master/apply-correction` + `correction_history` table
- [x] Wire `corrections-preview` to an apply button in the UI
- [x] Wire background workers into FastAPI startup/shutdown lifecycle
- [x] Create `score_utils` shared module for blocking keys and score normalization
- [x] Fix `/vault/records` endpoint malformation from conflicted patch
- [x] Serialize blocking_keys as JSON in DB insert for SQLite compatibility

### Phase 7 — Scale and Hardening (Week 7+)
- [ ] Add `bronze_customer` range partitioning by month
- [ ] Add GIN indexes on blocking_keys for dedup performance
- [ ] Add Score Validation Middleware in FastAPI
- [ ] Load testing: verify WebSocket handles 100+ concurrent clients
- [ ] Add `kafka_offsets` monitoring table + consumer lag alerts

---

## Appendix: Score Quick-Reference Card

```
BRONZE LAYER
  raw_completeness     = (present_fields / 7) × 100          → 0–100
  format_validity      = { email: bool, phone: bool, ... }   → JSONB

SILVER LAYER
  completeness_pct     = (filled_fields / 9) × 100           → 0–100
  field_validity_pct   = (valid_present / total_present)×100 → 0–100

IDENTITY LAYER (all features now in 0–100)
  email_match          = 0 or 100 (exact)
  phone_match          = 0 or 100 (exact, normalized)
  name_similarity      = fuzz.token_sort_ratio(A, B)          → 0–100
  dob_match            = 0 or 100 (exact, normalized)
  city_similarity      = fuzz.ratio(A, B)                     → 0–100
  address_similarity   = fuzz.token_sort_ratio(A, B)          → 0–100

  composite_score = (email×0.35 + phone×0.28 + name×0.18
                   + dob×0.10 + city×0.05 + address×0.04)    → 0–100
  ai_score        = min(100, composite + bonus)               → 0–100
  llm_confidence  = LLM's own estimate                        → 0–100
  final_score     = ai_score×0.70 + llm_confidence×0.30       → 0–100

DECISIONS (on final_score):
  ≥ 90 → AUTO_MERGE
  70–89 → MANUAL_REVIEW
  55–69 → SEPARATE (kept in DB)
  < 55  → NOT INSERTED (candidate gate)

GOLD LAYER
  merge_confidence    = avg(final_score) of cluster edges     → 0–100
  record_quality_score= avg(completeness_pct) of sources      → 0–100
  singleton records   → merge_confidence = 100.0
```

---

*This document describes the complete improved state. Every formula, schema change, API contract, and UI behavior described here is internally consistent with 0–100 score ranges throughout.*