# Database Schema Overview - Multiple Connected Tables

## 📊 Complete Table Structure & Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW PIPELINE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

SOURCE LAYER (Raw External Systems)
    ↓
    └─→ db2_customer_simulated  (External ERP/CRM system data)
         ↓
DATA INGESTION LAYER (Bronze Vault)
    ↓
    └─→ bronze_customer  (Raw events from Kafka, ForeignKey: cust_id)
         ↓
DATA TRANSFORMATION LAYER (Silver/Canonical)
    ↓
    └─→ silver_customer  (Cleaned & normalized, ForeignKey: bronze_id)
         ↓
IDENTITY MATCHING LAYER (Duplicate Detection)
    ├─→ duplicate_matches  (Pair comparisons, ForeignKeys: silver_id_a, silver_id_b)
    │   ↓
    │   └─→ review_queue  (Manual review queue, ForeignKey: match_id)
    │
MASTER RECORD LAYER (Unified Golden Records)
    ↓
    └─→ gold_customer  (Master records merged from silver, ForeignKey from correction_history)
         ↓
AUDIT & CORRECTION LAYER
    ↓
    ├─→ correction_history  (Field corrections applied, ForeignKey: master_id → golden_id)
    │
OPERATIONAL LAYER
    │
    └─→ kafka_offsets  (Kafka consumer progress tracking)

CACHE LAYER
  │
  └─→ column_profiles  (Persisted column profile cards for Records view)
```

---

## 📋 Table-by-Table Details with Foreign Keys

### 1️⃣ **db2_customer_simulated** (SOURCE)
**Purpose:** External source system data (ERP/CRM)
**Role:** Raw unprocessed customer records

| Column | Type | Notes |
|--------|------|-------|
| `cust_id` (PK) | TEXT | Unique source identifier |
| `first_nm` | TEXT | First name |
| `last_nm` | TEXT | Last name |
| `email_addr` | TEXT | Email |
| `phone_num` | TEXT | Phone |
| `birth_dt` | TEXT | Birth date |
| `addr_line1` | TEXT | Address |
| `addr_city` | TEXT | City |
| `addr_state` | TEXT | State |
| `source_system` | TEXT | Which system (CRM, ERP, etc.) |
| `load_ts` | TEXT | When loaded |
| `rec_status` | TEXT | Record status (A=Active) |

**Index:** `idx_db2_phone`, `idx_db2_email` (fast lookups)

---

### 2️⃣ **bronze_customer** (VAULT - Raw ingestion)
**Purpose:** Landing zone for Kafka events
**Foreign Key:** Links to source via `cust_id`
**Relationship:** Many-to-One with db2_customer_simulated

| Column | Type | FK | Notes |
|--------|------|----|----|
| `bronze_id` (PK) | INTEGER | | Auto-increment |
| `cust_id` | TEXT | ← db2_customer_simulated | Source identifier |
| `first_nm`, `last_nm`, `email_addr`, etc. | TEXT | | Raw fields |
| `raw_json` | TEXT | | Full Kafka event payload |
| `kafka_offset` | INTEGER | | Kafka offset tracking |
| `kafka_partition` | INTEGER | | Kafka partition |
| `raw_completeness` | REAL | | % of fields present (0-100) |
| `format_validity` | TEXT | | JSON: {email: bool, phone: bool, ...} |
| `dlq_flag` | INTEGER | | Dead-letter queue flag |
| `dlq_reason` | TEXT | | Why marked DLQ |
| `ingested_at` | TEXT | | Timestamp |

**Index:** `idx_bronze_cust` (fast cust_id lookups)

---

### 3️⃣ **silver_customer** (CANONICAL - Cleaned layer)
**Purpose:** Normalized & standardized customer records
**Foreign Key:** `bronze_id` → bronze_customer.primary
**Relationship:** One-to-One with bronze_customer

| Column | Type | FK | Notes |
|--------|------|----|----|
| `silver_id` (PK) | INTEGER | | Auto-increment |
| `bronze_id` (UNIQUE) | INTEGER | → bronze_customer | Points to source |
| `cust_id` | TEXT | | Cross-reference |
| `first_name`, `last_name` | TEXT | | Normalized |
| `full_name` | TEXT | | Combined name |
| `email`, `phone` | TEXT | | Standardized |
| `birth_date`, `address`, `city`, `state` | TEXT | | Cleaned |
| `completeness` | REAL | | % fields filled (0-100) |
| `field_validity_pct` | REAL | | Validity check % |
| `anomaly_flags` | TEXT | | JSON: ["INVALID_AGE", "DISPOSABLE_EMAIL"] |
| `blocking_keys` | TEXT | | JSON: deterministic dedup keys |
| `normalized_at` | TEXT | | When normalized |
| `cleaned_at` | TEXT | | Timestamp |

**Indexes:** `idx_silver_phone`, `idx_silver_email` (dedup matching)

---

### 4️⃣ **duplicate_matches** (IDENTITY - Pair detection)
**Purpose:** All detected duplicate candidate pairs
**Foreign Keys:** 
  - `silver_id_a` → silver_customer
  - `silver_id_b` → silver_customer
**Relationship:** Many-to-Many with silver_customer

| Column | Type | FK | Notes |
|--------|------|----|----|
| `match_id` (PK) | INTEGER | | Auto-increment |
| `silver_id_a` | INTEGER | → silver_customer | First record |
| `silver_id_b` | INTEGER | → silver_customer | Second record |
| `email_match` | REAL | | 0 or 100 (exact match) |
| `phone_match` | REAL | | 0 or 100 (exact match) |
| `name_similarity` | REAL | | Fuzzy score (0-100) |
| `dob_match` | REAL | | 0 or 100 (exact match) |
| `city_similarity` | REAL | | Fuzzy score (0-100) |
| `address_similarity` | REAL | | Fuzzy score (0-100) |
| `composite_score` | REAL | | Weighted average (0-100) |
| `ai_score` | REAL | | LLM score (0-100) |
| `final_score` | REAL | | Final decision score (0-100) |
| `llm_explanation` | TEXT | | Why matched |
| `llm_confidence` | REAL | | LLM confidence % |
| `blocking_keys` | TEXT | | JSON keys used |
| `ai_reasoning` | TEXT | | Decision logic |
| `decision` | TEXT | | PENDING, AUTO_MERGE, APPROVED, REJECTED, SEPARATE |
| `created_at` | TEXT | | Timestamp |

**Index:** `idx_match_decision` (filter by decision status)

---

### 5️⃣ **review_queue** (MANUAL REVIEW)
**Purpose:** Queue of matches pending human review
**Foreign Key:** `match_id` → duplicate_matches
**Relationship:** One-to-One with duplicate_matches

| Column | Type | FK | Notes |
|--------|------|----|----|
| `review_id` (PK) | INTEGER | | Auto-increment |
| `match_id` (UNIQUE) | INTEGER | → duplicate_matches | The pair to review |
| `status` | TEXT | | PENDING, APPROVED, REJECTED |
| `reviewer_comment` | TEXT | | Human feedback |
| `reviewed_by` | TEXT | | User who reviewed |
| `reviewed_at` | TEXT | | Review timestamp |
| `created_at` | TEXT | | When queued |

**Index:** `idx_review_status` (filter pending reviews)

---

### 6️⃣ **gold_customer** (MASTER - Unified Records)
**Purpose:** Final merged master records
**Sources:** Merges multiple silver_customer records based on approved matches
**Relationship:** One-to-Many with source silver_customer (via source_ids JSON)

| Column | Type | Notes |
|--------|------|-------|
| `golden_id` (PK) | INTEGER | Master record ID |
| `name` | TEXT | Best name (survivorship rule) |
| `email_primary` | TEXT | Primary email |
| `email_secondary` | TEXT | JSON array of other emails |
| `phone` | TEXT | Primary phone |
| `birth_date` | TEXT | Birth date |
| `address` | TEXT | Best address |
| `city`, `state` | TEXT | Location |
| `source_systems` | TEXT | JSON: ["CRM", "ERP"] → which systems contributed |
| `source_ids` | TEXT | JSON: ["cust_123", "cust_456"] → which silver records merged |
| `merge_confidence` | REAL | Confidence of merge (0-100) |
| `record_quality_score` | REAL | Data quality % |
| `llm_summary` | TEXT | AI summary |
| `survivorship_log` | TEXT | JSON: {"rule": "most_recent_valid"} |
| `last_reeval_at` | TEXT | Last re-evaluation timestamp |
| `merged_at` | TEXT | Merge timestamp |

**Index:** `idx_gold_confidence` (filter by quality)

---

### 7️⃣ **correction_history** (AUDIT TRAIL)
**Purpose:** Track all manual corrections to master records
**Foreign Key:** `master_id` → gold_customer.golden_id
**Relationship:** Many-to-One with gold_customer

| Column | Type | FK | Notes |
|--------|------|----|----|
| `id` (PK) | INTEGER | | Auto-increment |
| `master_id` | TEXT | → gold_customer | Which master was corrected |
| `field_name` | TEXT | | Which field (email, phone, etc.) |
| `old_value` | TEXT | | Previous value |
| `new_value` | TEXT | | New value |
| `applied_by` | TEXT | | Who applied (USER, AUTO) |
| `applied_at` | TEXT | | Timestamp |
| `llm_rationale` | TEXT | | Why correction made |
| `confidence` | REAL | | Confidence in correction |

**Index:** `idx_correction_history_master` (find corrections per master)

---

### 8️⃣ **kafka_offsets** (OPERATIONAL)
**Purpose:** Track consumer progress
**No Foreign Keys** (operational metadata)

| Column | Type | Notes |
|--------|------|-------|
| `topic` (PK) | TEXT | Kafka topic |
| `partition` (PK) | INTEGER | Kafka partition |
| `offset` | INTEGER | Current offset |
| `updated_at` | TEXT | Last update |

---

### 9️⃣ **column_profiles** (CACHE)
**Purpose:** Persist column profiling results for quick reuse in the Records view
**No Foreign Keys** (cached metadata)

| Column | Type | Notes |
|--------|------|-------|
| `profile_id` (PK) | INTEGER | Auto-increment |
| `layer` | TEXT | db2, bronze, silver, or gold |
| `table_name` | TEXT | Underlying table name |
| `column_name` | TEXT | Profiled column |
| `row_count` | INTEGER | Table row count when cached |
| `profile_json` | TEXT | Serialized profile payload |
| `generated_at` | TEXT | Cache timestamp |

---

## 🔗 Foreign Key Relationships (Complete)

```
db2_customer_simulated
    │
    ├─→ (cust_id) → bronze_customer.cust_id (Many-to-One)
    │
    
bronze_customer
    │
    ├─→ (bronze_id) → silver_customer.bronze_id (One-to-One)
    │
    
silver_customer
    │
    ├─→ (silver_id) → duplicate_matches.silver_id_a (One-to-Many)
    └─→ (silver_id) → duplicate_matches.silver_id_b (One-to-Many)
    │
    └─→ (silver_id) → Source for gold_customer (via JSON source_ids)
    
duplicate_matches
    │
    └─→ (match_id) → review_queue.match_id (One-to-One)
    
gold_customer
    │
    └─→ (golden_id) → correction_history.master_id (One-to-Many)
```

---

## 📊 Data Flow Example: How Records Move Through Tables

### **Scenario: John Smith exists in both CRM and ERP**

**Step 1: Ingestion (SOURCE → BRONZE)**
```
db2_customer_simulated:
  cust_id: "CRM-1001"
  first_nm: "John"
  last_nm: "Smith"
  email_addr: "john@acme.com"
  
        ↓ Kafka Event ↓

bronze_customer:
  bronze_id: 101
  cust_id: "CRM-1001"
  first_nm: "John"
  raw_completeness: 85.7%
  ingested_at: "2026-04-17T10:00:00"
```

**Step 2: Cleaning (BRONZE → SILVER)**
```
silver_customer:
  silver_id: 501
  bronze_id: 101
  cust_id: "CRM-1001"
  first_name: "John"
  full_name: "John Smith"
  email: "john@acme.com"
  completeness: 85.7%
  blocking_keys: ["dom:acme.com:ln3:smi", "ph7:5550192"]
```

**Step 3: Duplicate Detection (SILVER → DUPLICATE_MATCHES)**
```
Another silver record exists:
  silver_id: 502  (from ERP)
  full_name: "Jon Smyth"
  email: "jon@acme.com"
  phone: "+1-800-555-0192"

Dedup Engine compares 501 vs 502:

duplicate_matches:
  match_id: 1001
  silver_id_a: 501
  silver_id_b: 502
  email_match: 100
  phone_match: 100
  name_similarity: 87.5
  final_score: 98.0
  decision: "PENDING"  → Goes to review_queue
```

**Step 4: Review (DUPLICATE_MATCHES → REVIEW_QUEUE)**
```
review_queue:
  review_id: 5001
  match_id: 1001
  status: "PENDING"
  
User approves merge:
  status: "APPROVED"
  reviewed_by: "data_steward_1"
  
Update duplicate_matches:
  decision: "APPROVED"
```

**Step 5: Master Merge (SILVER → GOLD_CUSTOMER)**
```
GoldenRecordMerger finds all APPROVED groups:
- silver_id 501 + 502 are approved pairs → merge into one golden record

gold_customer:
  golden_id: 1
  name: "John Smith"  (best value from survivorship rule)
  email_primary: "john@acme.com"
  phone: "+1-800-555-0192"
  source_systems: ["CRM", "ERP"]
  source_ids: ["CRM-1001", "ERP-3004"]
  merge_confidence: 98.0
  source_ids: JSON array for lineage
```

**Step 6: Correction (GOLD_CUSTOMER → CORRECTION_HISTORY)**
```
User corrects a field in Master:

correction_history:
  id: 10001
  master_id: "1"
  field_name: "email_primary"
  old_value: "john@acme.com"
  new_value: "john.smith@acme.com"
  applied_by: "USER"
  confidence: 100

gold_customer updated:
  email_primary: "john.smith@acme.com"
  last_reeval_at: "2026-04-17T15:30:00"
```

---

## 🎯 Master Record Data Selection Strategy

### **How gold_customer selects & combines data from silver_customer:**

**1. Survivorship Rules** (pick best value)
```python
For each field (name, email, phone, address, city, state):
  - Get all values from source silver records
  - Apply rule: MOST_RECENT_VALID  (use most recent non-null)
  - Store in gold_customer
  - Log rule used in survivorship_log JSON
```

**2. Source Tracking**
```json
gold_customer.source_systems = ["CRM", "ERP"]     // Systems contributed
gold_customer.source_ids = ["CRM-1001", "ERP-3004"]  // Which silver records
```

**3. Quality Scoring**
```python
record_quality_score = avg(silver_customer.completeness) 
                       for all merged records
                       
Example:
- silver_id 501: completeness 85%
- silver_id 502: completeness 92%
- gold record: record_quality_score = 88.5%
```

**4. Confidence Tracking**
```python
merge_confidence = avg(duplicate_matches.final_score)
                   for all approved pairs in group
                   
Example:
- pair (501, 502): final_score 98%
- pair (501, 503): final_score 92%
- gold record: merge_confidence = 95%
```

---

## 📈 Querying Examples

### **Get Master Record with All Source Details**
```sql
SELECT 
  g.golden_id,
  g.name,
  g.email_primary,
  g.source_systems,
  g.source_ids,
  g.merge_confidence,
  COUNT(DISTINCT s.silver_id) as num_merged,
  AVG(s.completeness) as avg_quality
FROM gold_customer g
LEFT JOIN silver_customer s ON INSTR(',' || g.source_ids || ',', ',' || s.cust_id || ',') > 0
WHERE g.golden_id = ?
GROUP BY g.golden_id
```

### **Get Master with Correction History**
```sql
SELECT 
  g.golden_id,
  g.name,
  c.field_name,
  c.old_value,
  c.new_value,
  c.applied_by,
  c.applied_at
FROM gold_customer g
LEFT JOIN correction_history c ON c.master_id = g.golden_id
WHERE g.golden_id = ?
ORDER BY c.applied_at DESC
```

### **Get Pending Review Matches (bronze → silver → matches)**
```sql
SELECT 
  dm.match_id,
  s1.silver_id as silver_a_id,
  s1.full_name as name_a,
  s2.silver_id as silver_b_id,
  s2.full_name as name_b,
  dm.final_score,
  rq.status
FROM duplicate_matches dm
JOIN silver_customer s1 ON dm.silver_id_a = s1.silver_id
JOIN silver_customer s2 ON dm.silver_id_b = s2.silver_id
LEFT JOIN review_queue rq ON dm.match_id = rq.match_id
WHERE rq.status = 'PENDING'
ORDER BY dm.final_score DESC
```

---

## ✅ Summary

| Layer | Table | Role | Connected To |
|-------|-------|------|--------------|
| **Input** | db2_customer_simulated | Raw source | bronze_customer |
| **Vault** | bronze_customer | Event landing | silver_customer |
| **Canonical** | silver_customer | Cleaned data | duplicate_matches, gold_customer |
| **Identity** | duplicate_matches | Pair detection | review_queue, gold_customer |
| **Review** | review_queue | Human loop | duplicate_matches |
| **Master** | gold_customer | Unified record | correction_history |
| **Audit** | correction_history | Change log | gold_customer |
| **Ops** | kafka_offsets | Progress tracking | (none) |

---

**Total Tables: 8 | Total Foreign Keys: 7 | Data Flow: Source → Vault → Canonical → Identity → Master**
