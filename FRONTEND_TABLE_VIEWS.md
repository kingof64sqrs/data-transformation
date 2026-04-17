# Frontend Pages - Viewing Data From Connected Tables

## 🎨 UI Pages & The Tables They Display

Every page in the frontend queries multiple tables and displays connected data. Here's the complete guide:

---

## 1️⃣ MASTER RECORDS PAGE (`/master-records`)
**Shows:** All master records merged from multiple sources

### What Tables Are Used
```
gold_customer (main display)
    ↓
    ├─ Shows source_ids & source_systems → which silver records merged
    ├─ Shows merge_confidence → from duplicate_matches scores
    └─ Links to correction_history → edits made
```

### What You Can See
```
┌─────────────────────────────────────────────────────────────┐
│ Master Records                                   [Export CSV]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ ID  │ Name      │ Email         │ Phone      │ City  │   │
│ ├─────┼───────────┼───────────────┼────────────┼───────┤   │
│ │ 1   │ John      │ john@acme.com │ 555-0192   │ NY    │   │ ← gold_customer
│ │     │ Smith     │               │            │       │   │
│ ├─────┼───────────┼───────────────┼────────────┼───────┤   │
│ │ 2   │ Sarah     │ sarah@acme.com│ 555-0193   │ TX    │   │
│ │     │ Johnson   │               │            │       │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ Click on a record to see MORE DETAIL:                       │
│                                                              │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ MASTER DETAILS                          [Close]    │    │
│ ├─────────────────────────────────────────────────────┤    │
│ │ Name: John Smith                                    │    │
│ │ Quality Score: 88%  (from gold_customer)            │    │
│ │ Merge Confidence: 98%  (gold_customer)              │    │
│ │                                                     │    │
│ │ SOURCE RECORDS (merged into this master):          │    │
│ │ ┌───────────────────────────────────────────┐      │    │
│ │ │ • CRM-1001        (from silver_id 501)    │      │    │
│ │ │   Name: John Smith                        │      │    │
│ │ │   Email: john@acme.com                    │      │    │
│ │ │   Completeness: 85%  (from silver)        │      │    │
│ │ │   Raw Data: from bronze_id 101            │      │    │
│ │ │                                           │      │    │
│ │ │ • ERP-3004        (from silver_id 502)    │      │    │
│ │ │   Name: Jon Smyth                         │      │    │
│ │ │   Email: jon@acme.com                     │      │    │
│ │ │   Completeness: 92%                       │      │    │
│ │ └───────────────────────────────────────────┘      │    │
│ │                                                     │    │
│ │ CORRECTIONS APPLIED (from correction_history):    │    │
│ │ ┌───────────────────────────────────────────┐      │    │
│ │ │ Email: john@acme.com → john.smith@acme... │      │    │
│ │ │ Applied: 2026-04-17 15:30 by USER         │      │    │
│ │ │ Confidence: 95%                           │      │    │
│ │ └───────────────────────────────────────────┘      │    │
│ │                                                     │    │
│ │ PROPOSED CORRECTIONS (from silver candidates):    │    │
│ │ ┌───────────────────────────────────────────┐      │    │
│ │ │ Field: phone                              │      │    │
│ │ │ Current: +1-800-555-0192                  │      │    │
│ │ │ Proposed: +1-800-555-0191 (confidence 90)│      │    │
│ │ │                           [Apply]         │      │    │
│ │ └───────────────────────────────────────────┘      │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ gold_customer (main content)
- ✅ silver_customer (source records detail)
- ✅ bronze_customer (referenced via silver)
- ✅ correction_history (past corrections)
- ✅ duplicate_matches (merge confidence)

---

## 2️⃣ REVIEW WORKBENCH PAGE (`/review`)
**Shows:** Pending duplicate matches for human decision

### What Tables Are Used
```
review_queue (status)
    ↓
duplicate_matches (scores & pair info)
    ├─ silver_customer (both record details)
    ├─ db2_customer_simulated (source systems)
    └─ Shows "Approve" → Updates duplicate_matches.decision
```

### What You Can See
```
┌────────────────────────────────────────────────────────┐
│ MATCH #1001                      [Status: PENDING]     │
│ 213 matches pending review...    [12 reviewed today]   │
├─────────────────────┬──────────────────────────────────┤
│                     │                                  │
│  RECORD A           │     RECORD B                     │
│  ─────────────────  │     ──────────────────          │
│  silver_id: 501     │     silver_id: 502              │
│  Name: John Smith   │     Name: Jon Smyth  (similar)  │
│  Email: john@acme   │     Email: jon@acme   (exact ✓)  │ ← from silver
│  Phone: 555-0192    │     Phone: 555-0193   (99.9%)    │
│  Source: CRM        │     Source: ERP       (different)│ ← from db2
│                     │                                  │
├─────────────────────┴──────────────────────────────────┤
│                                                        │
│ MATCH SIGNALS (from duplicate_matches):               │
│ ├─ Email Match:      ████████████████ 100%   (exact) │
│ ├─ Phone Match:      ███████████████░ 99.9%  (close) │
│ ├─ Name Similarity:  ███████████░░░░░ 87%    (fuzzy) │
│ ├─ DOB Match:        ████████████████ 100%   (exact) │
│ └─ City Match:       ███████████░░░░░ 95%    (fuzzy) │
│                                                        │
│ OVERALL SCORE: 98%  (final_score in duplicate_matches)│
│                                                        │
│ AI REASONING:                                          │
│ "High confidence: strong deterministic matches..."     │
│                                                        │
├────────────────────────────────────────────────────────┤
│ [← REJECT]                          [APPROVE →]        │ ← Updates review_queue
│ (Updates: review_queue.status = REJECTED)              │   + duplicate_matches.decision
│ (Updates: duplicate_matches.decision = REJECTED)       │
├────────────────────────────────────────────────────────┤
│ MINI QUEUE (right side):                               │
│ ▼ #1001  John Smith ↔ Jon Smyth        98%   PENDING   │
│   #1002  Sarah Johnson ↔ Sara Jonson    96%   PENDING   │
│   #1003  Mike Davis ↔ Michael Davis     91%   PENDING   │
│   ...                                                   │
└────────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ review_queue (pending status)
- ✅ duplicate_matches (scores)
- ✅ silver_customer (both records)
- ✅ db2_customer_simulated (source systems)

---

## 3️⃣ IDENTITY GRAPH PAGE (`/identity-graph`)
**Shows:** All detected duplicate pairs across entire database

### What Tables Are Used
```
duplicate_matches (all pairs)
    ├─ silver_customer (2 joins: silver_id_a & silver_id_b)
    └─ Shows decision status (PENDING, AUTO_MERGE, REJECTED, etc)
```

### What You Can See
```
┌──────────────────────────────────────────────────────┐
│ DUPLICATE PAIRS                                       │
├──────────────────────────────────────────────────────┤
│ Tabs: All (847) | Auto-Merged ✓(634) | In Review(213)│
│                                                      │
│ ┌─────────────────────────────────────┐             │
│ │ ┌──────────────┐  ┌──────────────┐  │             │
│ │ │ RECORD A     │  │ RECORD B     │  │             │
│ │ ├──────────────┤  ├──────────────┤  │             │
│ │ │ John Smith   │  │ Jon Smyth    │  │             │
│ │ │ john@acme    │  │ jon@acme     │  │ ← silver    │
│ │ │ 555-0192     │  │ 555-0193     │  │   customer  │
│ │ ├──────────────┤  ├──────────────┤  │             │
│ │ │ Score: 98%   │  │ Decision:    │  │ ← from      │
│ │ │ Status:      │  │ AUTO-MERGE ✓ │  │   duplicate │
│ │ │ AUTO-MERGE   │  │ Confidence:  │  │   _matches  │
│ │ │              │  │ 98%          │  │             │
│ │ └──────────────┘  └──────────────┘  │             │
│ └─────────────────────────────────────┘             │
│                                                      │
│ ┌─────────────────────────────────────┐             │
│ │ Sarah Johnson ↔ Sara Jonson         │             │
│ │ Score: 96% | Decision: MANUAL_REVIEW│ ← pending   │
│ │ Status: IN REVIEW                   │   review    │
│ └─────────────────────────────────────┘             │
│                                                      │
│ ┌─────────────────────────────────────┐             │
│ │ Mike Brown ↔ Michael Brown          │             │
│ │ Score: 45% | Decision: SEPARATE     │ ← rejected  │
│ │ Status: REJECTED (not same person)  │             │
│ └─────────────────────────────────────┘             │
└──────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ duplicate_matches (scores, decisions, reasoning)
- ✅ silver_customer (record A & B details)

---

## 4️⃣ RAW VAULT EXPLORER PAGE (`/raw-vault`)
**Shows:** Raw Kafka-ingested events before cleaning

### What Tables Are Used
```
bronze_customer (raw events)
    ├─ db2_customer_simulated (source system details)
    └─ Shows quality metrics (completeness, validity)
```

### What You Can See
```
┌─────────────────────────────────────────────────────┐
│ RAW VAULT (Bronze Layer)                            │
├─────────────────────────────────────────────────────┤
│ Filter: DLQ Flag  Dead-Letter Quality Status         │
│ Search: [filter by cust_id or source]               │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ ID │ Cust ID   │ Source │ Completeness │ Valid ││
│ ├────┼───────────┼────────┼──────────────┼───────┤│
│ │101 │ CRM-1001  │ CRM    │ 85.7% ✓      │ All ✓ ││ ← from bronze
│ │102 │ ERP-3004  │ ERP    │ 92.1% ✓      │ All ✓ ││
│ │103 │ CRM-2005  │ CRM    │ 42.0% ⚠      │ Name ✗││
│ │104 │ NULL      │ CRM    │  0.0% ✗ DLQ  │ Full ✗││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Click on record to see RAW PAYLOAD:                 │
│                                                     │
│ Bronze ID: 101 (Kafka offset: 1005, partition: 2)  │
│ Raw Completeness: 85.7%  (from bronze_customer)    │
│ Format Validity:                                    │
│   - Email: valid ✓                                  │
│   - Phone: valid ✓                                  │
│   - Birth Date: valid ✓                             │
│   - Address: MISSING ✗                              │
│                                                     │
│ RAW JSON PAYLOAD:                                   │
│ {                                                   │
│   "cust_id": "CRM-1001",                            │
│   "first_nm": "John",                               │
│   "last_nm": "Smith",                               │
│   "email_addr": "john@acme.com",                    │
│   "phone_num": "+1-800-555-0192",                   │
│   "birth_dt": "1990-05-15",                         │
│   "source_system": "CRM"                            │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ bronze_customer (raw data, completeness, validity)
- ✅ db2_customer_simulated (source system reference)

---

## 5️⃣ CANONICAL EXPLORER PAGE (`/canonical`)
**Shows:** Cleaned & normalized records

### What Tables Are Used
```
silver_customer (cleaned data)
    ├─ bronze_customer (reference to raw source)
    └─ Shows quality scores and blocking keys
```

### What You Can See
```
┌─────────────────────────────────────────────────────┐
│ CANONICAL (Silver Layer) - Cleaned Data             │
├─────────────────────────────────────────────────────┤
│ Filter: Min Completeness [80%] | Sort: [Quality▼]  │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ ID │ Name       │ Email      │ Complete │ Valid ││
│ ├────┼────────────┼────────────┼──────────┼───────┤│
│ │501 │ John Smith │ john@acme  │ 85.7% ✓  │ 94.5% ││ ← from silver
│ │502 │ Jon Smyth  │ jon@acme   │ 92.1% ✓  │ 100%  ││   _customer
│ │503 │ Sarah Joe  │ sarah@acme │ 88.3% ✓  │ 97.2% ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Click for DETAILED VIEW:                            │
│                                                     │
│ Silver ID: 501                                      │
│ Full Name: John Smith   (normalized from raw)       │
│ Email: john@acme.com                                │
│ Phone: +1-800-555-0192                              │
│ Completeness: 85.7%  (from silver_customer)         │
│ Field Validity: 94.5%  (email ✓ phone ✓ dob ✓...)  │
│ Anomaly Flags: None  (valid age, not disposable)    │
│                                                     │
│ BLOCKING KEYS (for dedup matching):                 │
│ • dom:acme.com:ln3:smi  (email domain + last3)      │
│ • ph7:5550192           (last 7 phone digits)       │
│ • by:1990:fn:JNNNN      (birth year + soundex)      │
│                                                     │
│ CLEANED AT: 2026-04-17 10:05:00                     │
│ SOURCE: bronze_id 101 → (raw_completeness: 85%)     │
│                                                     │
│ [Show Raw] [Trace Lineage]                          │
└─────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ silver_customer (cleaned & normalized)
- ✅ bronze_customer (reference to raw source)

---

## 6️⃣ DATA LINEAGE PAGE (`/lineage`)
**Shows:** How a single record flows through entire pipeline

### What Tables Are Used
```
db2_customer_simulated (source)
    ↓ (via cust_id)
bronze_customer (ingested)
    ↓ (via bronze_id)
silver_customer (cleaned)
    ↓ (via silver_id)
duplicate_matches (paired)
    ↓ (via decision)
gold_customer (merged)
```

### What You Can See
```
Search for a record: [CRM-1001 ___________]  [Search]

┌─────────────────────────────────────────────────────┐
│ LINEAGE TRACE: CRM-1001                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [1] SOURCE (db2_customer_simulated)                 │
│     └─ cust_id: CRM-1001                            │
│        Name: John Smith                             │
│        System: CRM                                  │
│        Loaded: 2026-04-17 09:00                     │
│        Status: ACTIVE                               │
│                                                     │
│        ↓                                            │
│        Kafka Event Published                        │
│        ─────────────────────                        │
│                                                     │
│ [2] VAULT (bronze_customer)                         │
│     └─ bronze_id: 101                               │
│        Raw Completeness: 85.7%                      │
│        Format Valid: email ✓ phone ✓                │
│        Ingested: 2026-04-17 10:00                   │
│        Kafka Offset: 1005 | Partition: 2            │
│                                                     │
│        ↓                                            │
│        Silver Transform Applied                     │
│        ─────────────────────────                    │
│                                                     │
│ [3] CANONICAL (silver_customer)                     │
│     └─ silver_id: 501                               │
│        Full Name: John Smith  (normalized)          │
│        Email: john@acme.com   (standardized)        │
│        Completeness: 85.7%                          │
│        Blocking Keys: 3 keys generated              │
│        Cleaned: 2026-04-17 10:05                    │
│                                                     │
│        ↓                                            │
│        Dedup Engine Ran                             │
│        ─────────────────                            │
│                                                     │
│ [4] IDENTITY (duplicate_matches)                    │
│     └─ match_id: 1001                               │
│        Paired With: silver_id 502 (Jon Smyth, ERP)  │
│        Final Score: 98%                             │
│        Decision: APPROVED                           │
│                                                     │
│        ↓                                            │
│        Golden Merge Applied                        │
│        ───────────────────                         │
│                                                     │
│ [5] MASTER (gold_customer)                          │
│     └─ golden_id: 1                                 │
│        Name: John Smith   (merged value)            │
│        Email: john@acme.com                         │
│        Merged From: ["CRM-1001", "ERP-3004"]        │
│        Confidence: 98%                              │
│        Merged: 2026-04-17 11:00                     │
│                                                     │
│        ↓                                            │
│        Correction Applied                          │
│        ────────────────                            │
│                                                     │
│ [6] CORRECTIONS (correction_history)                │
│     └─ Field: email_primary                         │
│        Changed: john@ → john.smith@                 │
│        Applied: 2026-04-17 15:30 by USER            │
│        Confidence: 95%                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ db2_customer_simulated (source)
- ✅ bronze_customer (ingestion)
- ✅ silver_customer (cleaning)
- ✅ duplicate_matches (matching)
- ✅ gold_customer (master)
- ✅ correction_history (audit)

---

## 7️⃣ COMMAND CENTER DASHBOARD (`/`)
**Shows:** Live summary statistics from all tables

### What Tables Are Used
```
All tables combined:
├─ db2_customer_simulated (source record count)
├─ bronze_customer (ingestion metrics)
├─ silver_customer (quality metrics)
├─ duplicate_matches (matching stats)
├─ review_queue (pending reviews)
└─ gold_customer (master record count)
```

### What You Can See
```
┌──────────────────────────────────────────────────────┐
│ PIPELINE OVERVIEW Dashboard                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │  1,200   │ │  1,200   │ │  1,187   │ │   847    ││
│ │ Raw Recs │ │ Ingested │ │ Canonical│ │Duplicates││
│ │ (db2)    │ │ (bronze) │ │ (silver) │ │ (matches)││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │    213   │ │   634    │ │   521    │             │
│ │  Pending │ │Auto-Merge│ │ Masters  │             │
│ │  Review  │ │          │ │ (gold)   │             │
│ │(review_q)│ │(matches) │ │          │             │
│ └──────────┘ └──────────┘ └──────────┘             │
│                                                      │
│ PIPELINE FLOW VISUALIZATION:                        │
│                                                      │
│  [SOURCE] ──→ [BRONZE] ──→ [SILVER]──→[MATCHING]──→│
│   1,200       1,200       1,187       847          │
│   ●            ●            ●           ●          │
│                                                      │
│  ──→ [GOLD] ──→ [REVIEW]                           │
│     521        213                                  │
│     ●          ●                                    │
│                                                      │
│ QUALITY PROGRESSION (across all tables):            │
│                                                      │
│ Raw Quality:       0%  ─────────────────────────    │
│ Vault Quality:    42%  ─────────────────────────    │
│ Canonical Qual:   71%  ─────────────────────────    │
│ Identity Qual:    84%  ─────────────────────────    │
│ Master Quality:   94%  ─────────────────────────    │
│                                                      │
│ LIVE ACTIVITY FEED (real-time events):             │
│                                                      │
│ 00:02 ago  ✓ Auto-merged  ID:4821 ↔ ID:4822      │
│ 00:15 ago  ⚠ Flagged review  ID:1103 ↔ ID:2204   │
│ 01:32 ago  ℹ Pipeline run complete  1,200 records│
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Tables Visible Here:**
- ✅ All 8 tables (summary aggregates)

---

## 📊 Table Access Summary

| Page | URL | Primary Tables | Joined Tables |
|------|-----|-----------------|---------------|
| Master Records | `/master-records` | gold_customer | silver, bronze, matches, corrections |
| Review Workbench | `/review` | review_queue | duplicate_matches, silver (2x), db2 |
| Identity Graph | `/identity-graph` | duplicate_matches | silver (2x), db2 |
| Raw Vault | `/raw-vault` | bronze_customer | db2 |
| Canonical | `/canonical` | silver_customer | bronze |
| Data Lineage | `/lineage` | ALL 6 core tables | (full pipeline) |
| Dashboard | `/` | AGGREGATE | All 8 tables |
| Settings | `/settings` | kafka_offsets | (metadata) |

---

## ✅ Complete Picture

**You now have:**
- ✅ **8 fully connected tables** with proper foreign keys
- ✅ **Multiple pages** viewing different aspects of the data
- ✅ **Data flows** from source → master → corrections
- ✅ **Master records** pull data from multiple sources via silver_customer
- ✅ **Complete lineage** tracking from source all the way to master
- ✅ **Audit trail** of all corrections applied

**All tables are connected and the UI allows viewing data at every layer of the pipeline!**
