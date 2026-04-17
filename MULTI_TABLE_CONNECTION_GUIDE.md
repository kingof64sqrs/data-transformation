# 🔗 Multi-Table Connection & Master Record Selection Guide

## How Your System Connects Multiple Tables Together

You now have a **complete system** where data from multiple tables is intelligently connected and consolidated into master records.

---

## 📊 The Table Connection Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MULTI-TABLE DATA PIPELINE                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│ SOURCE SYSTEM        │
│ (CRM, ERP, SAP, etc.)│     Real-world customer databases
│                      │     Multiple independent systems
│ CRM-1001: John Smith │
│ First Name: John     │
│ Email: john@acme.com │
└──────────┬───────────┘
           │ [Kafka Event Published]
           │
           ▼
┌──────────────────────────────┐
│ BRONZE_CUSTOMER (Vault)      │     🟤 Row 1
│ Raw Ingestion Layer          │     bronze_id: 101
│ Exactly as received          │     cust_id: CRM-1001
│ JSON payload stored raw      │     raw_json: { full record }
│ Quality metrics tracked      │     raw_completeness: 85%
│ No cleaning yet              │     format_validity: {"first_name": true, ...}
│                              │
│ Linked to: db2_customer      │     Via cust_id ────┐
└──────────┬───────────────────┘                     │
           │                                          │
           │ [Transform Applied]                      │
           │                                          │
           ▼                                          │
┌──────────────────────────────┐                     │
│ SILVER_CUSTOMER (Canonical)  │     🟣 Row 2      │
│ Cleaned & Normalized         │     silver_id: 501 │
│ Standardized names           │     Now linked to: │
│ Validated emails & phones    │     ├─ bronze_customer (One-to-One)
│ Blocking keys for dedup      │     │   bronze_id: 101
│ Track field completeness     │     │
│                              │     └─ duplicate_matches (One-to-Many)
│ Linked to: bronze_customer   │        When paired with other records
└──────────┬───────────────────┘        silver_id_a or silver_id_b
           │
           │ [Compare with Other Systems]
           │ [Run Dedup Engine]
           │
           ▼
┌──────────────────────────────────┐
│ DUPLICATE_MATCHES (Identity)     │     🟠 Row 3
│ Pair Detection & Scoring         │     match_id: 1001
│ Links records that are likely    │     silver_id_a: 501 (CRM)
│ the same person                  │     silver_id_b: 502 (ERP)
│                                  │
│ CRM-1001 (John Smith) vs         │     Scores:
│ ERP-3004 (Jon Smyth)             │     ├─ email_match: 100
│                                  │     ├─ phone_match: 99.9
│ Features compared:               │     ├─ name_similarity: 87.5
│ • Email: john                    │     ├─ dob_match: 100
│ • Phone: +1-800-555-0192         │     ├─ city_sim: 95
│ • Name: John / Jon               │     ├─ address_sim: 81
│ • DOB: 1985-03-15               │     └─ final_score: 98
│                                  │     decision: PENDING
│ Linked to:                       │
│ ├─ silver_customer (both a & b) │     Via silver_id_a & silver_id_b
│ └─ review_queue (if manual)      │     Via match_id (when needing review)
└──────────┬───────────────────────┘
           │
        ┌──┴─────────────────────────────────────────────┐
        │ AUTO-APPROVED      │     PENDING HUMAN REVIEW    │
        │ (≥90% confident)   │     (70-89% confident)      │
        ▼                    ▼
   [Merge]         ┌──────────────────┐
        │          │ REVIEW_QUEUE     │
        │          │ Human Decision   │
        │          │                  │
        │          │ review_id: 2401  │
        │          │ status: PENDING  │
        │          │ match_id: 1001   │
        │          │                  │
        │          │ Linked to:       │
        │          │ • duplicate_     │
        │          │   matches (FK)   │
        │          └────────┬─────────┘
        │                   │ [User Reviews & Approves]
        │                   │
        │                   ▼
        │                [Merge]
        │                   │
        └───────────┬───────┘
                    │
                    ▼
        ┌──────────────────────────────────┐
        │ GOLD_CUSTOMER (Master Records)   │     🟡 Row 4
        │ Unified Master Records           │     golden_id: 1
        │ Single Source of Truth Per       │     name: John Smith (chosen best)
        │ Unique Customer                  │     email: john.smith@acme.com
        │                                  │     phone: +1-800-555-0192
        │ Contains:        │               │
        │ ├─ full_name     │ Selected by   │     Linked to:
        │ ├─ email_primary │ survivorship  │     ├─ silver_customer (multiple via
        │ ├─ phone         │ rules from    │     │   source_ids JSON field)
        │ ├─ address       │ merged        │     │   source_ids: ["CRM-1001","ERP-3004"]
        │ └─ city, state   │ records       │     │   (Two source records merged here)
        │                  │               │     │
        │ source_ids:      │               │     └─ correction_history (One-to-Many)
        │   [CRM-1001      │ Which records │        Tracks all manual corrections
        │    ERP-3004]     │ merged here   │
        │                  │               │
        │ merge_confidence: 98%            │
        │ record_quality_score: 88%        │
        └──────────┬─────────────────────┘
                   │
                   │ [Manual Corrections Applied]
                   │
                   ▼
        ┌──────────────────────────────┐
        │ CORRECTION_HISTORY (Audit)   │     🔴 Row 5
        │ Immutable Audit Trail        │     id: 50001
        │ All changes logged           │     master_id: 1 (Links to gold_customer)
        │                              │     field_name: email_primary
        │ John Smith's email was       │     old_value: john@acme.com
        │ corrected from:              │     new_value: john.smith@acme.com
        │ john@acme.com ➜              │     applied_by: USER
        │ john.smith@acme.com          │     confidence: 95%
        │ (User noticed typo)          │     timestamp: 2026-04-17 15:30:00
        └──────────────────────────────┘
```

---

## 🔗 Complete Connection Example: "John Smith" Merge Story

### Step 1: Data Arrives from Multiple Systems

```
CRM System                          ERP System
──────────────────────              ──────────────────────
Customer ID: CRM-1001               Customer ID: ERP-3004
First Name: John                    First Name: Jon
Last Name: Smith                    Last Name: Smyth
Email: john@acme.com                Email: jon@acme.com
Phone: +1-800-555-0192              Phone: +1-800-555-0193
City: New York, NY                  City: Dubai, UAE
DOB: 1985-03-15                     DOB: 1985-03-15
Source: Kafka event                 Source: Kafka event
```

### Step 2: Records Land in Bronze_Customer (Raw)

```
bronze_customer Table:
┌────────────────────────────────────────┐
│ ROW 1                                  │
│ bronze_id: 101                         │
│ cust_id: CRM-1001  ──────────┐         │
│ raw_json: {                  │         │
│   first_name: "John",        │         │
│   last_name: "Smith",        │         │
│   email: "john@acme.com",    │         │
│   phone: "+1-800-555-0192",  │         │
│   city: "New York, NY",      │         │
│   dob: "1985-03-15"          │         │
│ }                            │         │
│ raw_completeness: 85%        │         │
│ format_validity: 100%        │         │
│ dlq_flag: false              │         │
└────────────────────────────────────────┘
                               │
                    References db2_customer_simulated
                               │
                               ▼
db2_customer_simulated Table:
┌────────────────────────────────────────┐
│ cust_id: CRM-1001  (PK)                │
│ first_nm: John                         │
│ last_nm: Smith                         │
│ email_addr: john@acme.com              │
│ phone_num: +1-800-555-0192             │
│ source_system: CRM                     │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ ROW 2                                  │
│ bronze_id: 102                         │
│ cust_id: ERP-3004  ───────────┐        │
│ raw_json: {                   │        │
│   first_name: "Jon",          │        │
│   last_name: "Smyth",         │        │
│   email: "jon@acme.com",      │        │
│   phone: "+1-800-555-0193",   │        │
│   city: "Dubai, UAE",         │        │
│   dob: "1985-03-15"           │        │
│ }                             │        │
│ raw_completeness: 92%         │        │
│ format_validity: 95%          │        │
│ dlq_flag: false               │        │
└────────────────────────────────────────┘
                               │
                    References db2_customer_simulated
                               │
                               ▼
db2_customer_simulated Table:
┌────────────────────────────────────────┐
│ cust_id: ERP-3004  (PK)                │
│ first_nm: Jon                          │
│ last_nm: Smyth                         │
│ email_addr: jon@acme.com               │
│ phone_num: +1-800-555-0193             │
│ source_system: ERP                     │
└────────────────────────────────────────┘
```

### Step 3: Records Transformed to Silver (Cleaned)

```
silver_customer Table:
┌────────────────────────────────────────┐
│ ROW 1                                  │
│ silver_id: 501  ◄─────┐                │
│ bronze_id: 101 (FK)   │ One-to-One     │
│ full_name: "John Smith" (standardized) │
│ email: john.smith@acme.com (cleaned)   │
│ phone: +1-800-555-0192 (standardized)  │
│ blocking_keys: ["smith", "john", ...] │
│ completeness: 85.7%                    │
│ field_validity_pct: 95%                │
│ anomaly_flags: []                      │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ ROW 2                                  │
│ silver_id: 502  ◄─────┐                │
│ bronze_id: 102 (FK)   │ One-to-One     │
│ full_name: "Jon Smyth" (standardized)  │
│ email: jon.smith@acme.com (cleaned)    │
│ phone: +1-800-555-0192 (standardized)  │
│ blocking_keys: ["smyth", "jon", ...]  │
│ completeness: 92.1%                    │
│ field_validity_pct: 98%                │
│ anomaly_flags: []                      │
└────────────────────────────────────────┘
```

### Step 4: Dedup Engine Detects Duplicates

```
Dedup Engine Runs:
  Compare silver_id 501 vs silver_id 502:

  Email comparison:
    john.smith@acme.com vs jon.smith@acme.com
    Result: EXACT MATCH (100 points)

  Phone comparison:
    +1-800-555-0192 vs +1-800-555-0192
    Result: EXACT MATCH (99.9 points)

  Name comparison:
    "John Smith" vs "Jon Smyth"
    Result: FUZZY MATCH (87.5 points, Levenshtein ratio)

  DOB comparison:
    1985-03-15 vs 1985-03-15
    Result: EXACT MATCH (100 points)

  Final Score: 98% confidence → AUTO_MERGE approved (≥90%)


duplicate_matches Table:
┌────────────────────────────────────────┐
│ ROW 1                                  │
│ match_id: 1001                         │
│ silver_id_a: 501 (FK)  ────┐           │
│ silver_id_b: 502 (FK)  ────┤ Links    │
│ email_match: 100           │ to       │
│ phone_match: 99.9          │ silver   │
│ name_similarity: 87.5      │          │
│ dob_match: 100             │          │
│ composite_score: 98        │          │
│ ai_score: 98               │          │
│ final_score: 98            │          │
│ decision: "AUTO_MERGE"     │          │
│ created_at: 2026-04-17...  │          │
└────────────────────────────────────────┘
```

### Step 5: Merge Approved → Create Master Record

```
Merge Logic:
  ✓ Score 98% ≥ 90% threshold
  ✓ AUTO_MERGE decision
  ✗ No manual review needed


gold_customer Table:
┌────────────────────────────────────────────────┐
│ ROW 1 (NEW MASTER RECORD)                      │
│ golden_id: 1  (PK)                             │
│                                                │
│ === Merged from ===                            │
│ source_ids: ["CRM-1001", "ERP-3004"]          │
│    (Which silver records merged)               │
│                                                │
│ source_systems: ["CRM", "ERP"]                │
│    (Which source systems contributed)          │
│                                                │
│ === Best Values Selected (Survivorship) ===   │
│ name: "John Smith"                             │
│    (CRM value chosen: better spelling)         │
│                                                │
│ email_primary: "john.smith@acme.com"          │
│    (Inferred from both + correction applied)   │
│                                                │
│ phone: "+1-800-555-0192"                      │
│    (CRM & ERP agree → EXACT match)             │
│                                                │
│ address: "New York, NY"                        │
│    (CRM source: more recent)                   │
│                                                │
│ city: "New York"                               │
│ state: "NY"                                    │
│                                                │
│ === Quality & Match Data ===                   │
│ merge_confidence: 98%                          │
│ record_quality_score: 88.9%                    │
│    (Average of source completeness)            │
│    (85.7% from CRM + 92.1% from ERP) / 2       │
│                                                │
│ survivorship_log: {                            │
│   "rule": "most_recent_valid"                  │
│ }                                              │
│                                                │
│ merged_at: 2026-04-17 14:30:00                │
│ created_at: 2026-04-17 14:15:00                │
└────────────────────────────────────────────────┘
```

### Step 6: User Notices & Corrects an Error

```
User View in Master Records:
┌────────────────────────────────────┐
│ Master ID: 1                       │
│ Name: John Smith ✓                 │
│ Email: john.smith@acme.com ⚠️      │
│       (should be john.smith@       │
│        acmecorp.com)               │
│ Phone: +1-800-555-0192 ✓           │
│ City: New York, NY ✓               │
│                                    │
│ Sources:                           │
│ • CRM-1001 ✓                       │
│ • ERP-3004 ✓                       │
│                                    │
│ Confidence: 98%                    │
│ Quality: 88.9%                     │
│                                    │
│ [Apply Correction]                 │
└────────────────────────────────────┘

User corrects email from:
  john.smith@acme.com
to:
  john.smith@acmecorp.com


correction_history Table:
┌────────────────────────────────────┐
│ ROW 1 (NEW CORRECTION LOG)          │
│ id: 50001                          │
│ master_id: 1 (FK)  ──────┐         │
│ field_name: "email_primary"        │
│ old_value: "john.smith@acme.com"  │
│ new_value: "john.smith@acmecorp.." │
│ applied_by: "USER"                 │
│ confidence: 95%                    │
│ applied_at: 2026-04-17 15:30:00   │
│ created_at: 2026-04-17 15:30:00   │
└────────────────────────────────────┘

gold_customer Table (Updated):
┌────────────────────────────────────┐
│ golden_id: 1                       │
│ email_primary: "john.smith@..."    │
│ (Master record updated)            │
│ But correction logged separately   │
│ in correction_history is also kept │
└────────────────────────────────────┘
```

---

## 📋 Summary: How Tables Connect

| From Table | To Table | Connection Type | Via Field | Purpose |
|-----------|----------|-----------------|-----------|---------|
| **db2_customer** | **bronze_customer** | One-to-Many | `cust_id` | Source system → Raw ingestion |
| **bronze_customer** | **silver_customer** | One-to-One | `bronze_id` | Raw data → Cleaned data |
| **silver_customer** | **duplicate_matches** | One-to-Many | `silver_id_a`, `silver_id_b` | Clean records → Pair comparison |
| **duplicate_matches** | **review_queue** | One-to-One | `match_id` | Matches → Manual review queue |
| **silver_customer** | **gold_customer** | Many-to-One | `source_ids` (JSON) | Multiple sources → Merged master |
| **gold_customer** | **correction_history** | One-to-Many | `master_id` | Master record → Audit trail |

---

## 🎯 Master Record Selection Logic

### How Does Master Record "Select" Data from Multiple Tables?

```
When creating gold_customer (master record):

Step 1: Identify merged sources
   FROM duplicate_matches
   WHERE decision = "APPROVED"
   Get: silver_id_a = 501, silver_id_b = 502

Step 2: Fetch all source records
   FROM silver_customer
   WHERE silver_id IN (501, 502)
   Get: 2 records with all fields

Step 3: Store source references
   gold_customer.source_ids = ["CRM-1001", "ERP-3004"]
   gold_customer.source_systems = ["CRM", "ERP"]

Step 4: Apply survivorship rules
   FOR each field in gold_customer:
     IF all sources agree:
       Use the agreed-upon value
     ELIF one is higher quality:
       Use the higher-quality value
     ELIF one is more recent:
       Use the more recent value
     ELSE:
       Use default rule (first, highest, etc.)

Step 5: Populate master record fields
   gold_customer.name = "John Smith" (CRM value, better spelling)
   gold_customer.email_primary = "john.smith@acme.com" (cleaned)
   gold_customer.phone = "+1-800-555-0192" (both agree)
   gold_customer.address = "New York, NY" (CRM, more complete)
   gold_customer.city = "New York" (CRM)
   gold_customer.state = "NY" (CRM)
```

### Example: How Master Selects Best Email

```
Source 1 (CRM):           Source 2 (ERP):
email: john@acme.com      email: jon@acme.com

Comparison:
├─ Both valid format? YES
├─ Both active? YES  
├─ Email match? 100%
│  └─ john vs jon = typo variation
│  └─ acme.com = EXACT match
│  └─ CONCLUSION: Same email with typo
│
└─ Selection logic:
   Rule: most_recent_valid
   └─ Both equally recent
   └─ Rule: higher_completeness
      └─ Both same completeness (7 chars each)
      └─ Rule: better_format_validity
         └─ "john@acme.com" has proper capitalization
         └─ SELECTED: john@acme.com (CRM source)

gold_customer.email_primary = "john@acme.com"

User later corrects to:
gold_customer.email_primary = "john.smith@acmecorp.com"
└─ Logged in correction_history table
```

---

## 🔐 Data Integrity Features

1. **Source Lineage**: Always know which records were merged
   - `source_ids`: Exact silver_customer IDs
   - `source_systems`: Exact system names

2. **Audit Trail**: Complete history of all changes
   - `correction_history`: Every manual correction
   - Timestamp, user, confidence, old/new values

3. **Quality Metrics**: Track data quality at each stage
   - Bronze: `raw_completeness`, `format_validity`
   - Silver: `field_validity_pct`, `completeness`
   - Gold: `merge_confidence`, `record_quality_score`

4. **Validation**: Records are verified before merging
   - Duplicate detection scores
   - Format validation
   - Blocking key matches

---

## 🚀 What You Can Now Do

✅ **View Master Record with Source Connections**
- See exactly which source systems contributed (CRM, ERP, SAP, etc.)
- Click detail panel to see source_ids ["CRM-1001", "ERP-3004"]
- Understand why data was merged

✅ **Filter by Source Table**
- Show only records from CRM
- Show only records from ERP  
- Show merged records (CRM + ERP)

✅ **Load to Database**
- Validate filtered records exist
- Log the load operation
- Get summary of what was loaded

✅ **Make Corrections**
- Fix master record data
- Changes logged automatically
- Audit trail maintained

✅ **Export with Full Context**
- CSV includes source_systems column
- Source_ids array shows merges
- Full lineage included
