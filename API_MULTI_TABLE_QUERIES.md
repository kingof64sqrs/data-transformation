# API Endpoints - How Tables Connect & Display Data

## 🌐 Complete API Reference for Table Queries

All endpoints query across multiple connected tables. Here's how master records fetch data:

---

## 1️⃣ **MASTER RECORDS API** - Core Multi-Table Queries

### `GET /master/records` - Get All Master Records
**Tables Used:** gold_customer + silver_customer + duplicate_matches

```http
GET /master/records?limit=100&offset=0&search=john
```

**SQL Behind the Scenes:**
```sql
SELECT 
  g.golden_id as master_id,
  g.name as full_name,
  g.email_primary,
  g.phone,
  g.city,
  g.state,
  g.source_systems,           ← From which tables (CRM, ERP, etc)
  g.source_ids,               ← Which silver records merged
  g.merge_confidence,         ← Confidence score
  g.record_quality_score,     ← Quality metric
  JSON_ARRAY_LENGTH(g.source_ids) as record_count  ← How many merged
FROM gold_customer g
WHERE g.name LIKE ? OR g.email_primary LIKE ?
ORDER BY g.merge_confidence DESC
LIMIT 100 OFFSET 0
```

**Returns:**
```json
{
  "records": [
    {
      "master_id": 1,
      "full_name": "John Smith",
      "email_primary": "john@acme.com",
      "phone": "+1-800-555-0192",
      "city": "New York",
      "state": "NY",
      "source_systems": ["CRM", "ERP"],
      "source_ids": ["CRM-1001", "ERP-3004"],
      "confidence_score": 0.98,
      "record_quality_score": 0.88,
      "record_count": 2,
      "created_at": "2026-04-17T10:00:00"
    }
  ],
  "total": 45
}
```

---

### `GET /master/records/{master_id}` - Get Single Master with Full Lineage
**Tables Used:** gold_customer + silver_customer + bronze_customer + duplicate_matches + correction_history

```http
GET /master/records/1
```

**Queries across 5 tables:**

```sql
-- Get master record
SELECT * FROM gold_customer WHERE golden_id = ?

-- Get source silver records used in merge
SELECT s.silver_id, s.full_name, s.email, s.phone, s.completeness
FROM silver_customer s
WHERE s.cust_id IN (json_extract(g.source_ids, '$[*]'))

-- Get bronze source (where silver came from)
SELECT b.bronze_id, b.raw_completeness, b.format_validity
FROM bronze_customer b
WHERE b.bronze_id IN (
  SELECT bronze_id FROM silver_customer WHERE silver_id IN (...)
)

-- Get the matches that caused this merge
SELECT dm.match_id, dm.silver_id_a, dm.silver_id_b, dm.final_score, dm.decision
FROM duplicate_matches dm
WHERE (dm.silver_id_a IN (...) AND dm.silver_id_b IN (...))

-- Get correction history
SELECT * FROM correction_history 
WHERE master_id = ?
ORDER BY applied_at DESC
```

**Returns:**
```json
{
  "master": {
    "golden_id": 1,
    "name": "John Smith",
    "email_primary": "john@acme.com",
    "source_ids": ["CRM-1001", "ERP-3004"],
    "merge_confidence": 98,
    "llm_summary": "High quality match between CRM and ERP records..."
  },
  "source_records": [
    {
      "silver_id": 501,
      "full_name": "John Smith",
      "email": "john@acme.com",
      "completeness": 85.7,
      "source_system": "CRM",
      "bronze_record": {
        "bronze_id": 101,
        "raw_completeness": 85,
        "format_validity": {"email": true, "phone": true}
      }
    },
    {
      "silver_id": 502,
      "full_name": "Jon Smyth",
      "email": "jon@acme.com",
      "completeness": 92.1,
      "source_system": "ERP"
    }
  ],
  "merge_pairs": [
    {
      "match_id": 1001,
      "from": "CRM-1001",
      "to": "ERP-3004",
      "final_score": 98.0,
      "decision": "APPROVED"
    }
  ],
  "corrections": [
    {
      "field_name": "email_primary",
      "old_value": "john@acme.com",
      "new_value": "john.smith@acme.com",
      "applied_by": "USER",
      "applied_at": "2026-04-17T15:30:00"
    }
  ]
}
```

---

## 2️⃣ **IDENTITY MATCHING API** - Pair Detection Across Tables

### `GET /identity/graph` - Get All Duplicate Pairs
**Tables Used:** duplicate_matches + silver_customer (2x join) + db2_customer_simulated

```http
GET /identity/graph?decision=MANUAL_REVIEW&limit=50&offset=0
```

**Fetches:**
- Left record details from silver_customer
- Right record details from silver_customer  
- Source system info from db2_customer_simulated (via source fields)
- Match scores from duplicate_matches

**Returns:**
```json
{
  "matches": [
    {
      "match_id": 1001,
      "record1": {
        "silver_id": 501,
        "full_name": "John Smith",
        "email": "john@acme.com",
        "phone": "+1-800-555-0192",
        "source_system": "CRM"
      },
      "record2": {
        "silver_id": 502,
        "full_name": "Jon Smyth",
        "email": "jon@acme.com",
        "phone": "+1-800-555-0193",
        "source_system": "ERP"
      },
      "signals": {
        "email_score": 100,
        "phone_score": 99.9,
        "name_score": 87.5,
        "dob_score": 100,
        "city_score": 95
      },
      "final_score": 98,
      "decision": "MANUAL_REVIEW",
      "ai_reasoning": "High confidence match..."
    }
  ],
  "total": 213,
  "stats": {
    "auto_merged": 634,
    "manual_review": 213,
    "decided_separate": 0
  }
}
```

---

## 3️⃣ **VAULT (BRONZE) EXPLORER** - Track Raw Data Ingestion

### `GET /vault/records` - Browse Ingested Events
**Tables Used:** bronze_customer + db2_customer_simulated

```http
GET /vault/records?limit=50&offset=0&search=john
```

**Shows:**
- Raw ingested events from Kafka
- Links back to source db2_customer_simulated
- Quality metrics (completeness, validity)
- Dead-letter queue status

**Returns:**
```json
{
  "records": [
    {
      "vault_id": 101,
      "cust_id": "CRM-1001",
      "source_system": "CRM",
      "kafka_offset": 1005,
      "kafka_partition": 2,
      "raw_completeness": 85.7,
      "format_validity": {
        "email": true,
        "phone": true,
        "first_name": true,
        "last_name": true
      },
      "dlq_flag": false,
      "raw_payload": {
        "first_nm": "John",
        "last_nm": "Smith",
        "email_addr": "john@acme.com"
      },
      "ingested_at": "2026-04-17T10:00:00"
    }
  ],
  "total": 1200
}
```

---

## 4️⃣ **CANONICAL (SILVER) EXPLORER** - Cleaned Data View

### `GET /canonical/records` - View Normalized Records
**Tables Used:** silver_customer + bronze_customer

```http
GET /canonical/records?completeness_min=80&limit=50
```

**Shows:**
- Cleaned & standardized data
- Reference back to bronze (raw) version
- Quality scores (completeness, field validity)
- Blocking keys for dedup

**Returns:**
```json
{
  "records": [
    {
      "silver_id": 501,
      "bronze_id": 101,
      "cust_id": "CRM-1001",
      "full_name": "John Smith",
      "email": "john@acme.com",
      "phone": "+1-800-555-0192",
      "completeness": 85.7,
      "field_validity_pct": 94.5,
      "anomaly_flags": [],
      "blocking_keys": ["dom:acme.com:ln3:smi", "ph7:5550192"],
      "cleaned_at": "2026-04-17T10:05:00"
    }
  ],
  "total": 1187
}
```

---

## 5️⃣ **REVIEW QUEUE API** - Manual Matching Workflow

### `GET /review/queue` - Get Pending Reviews
**Tables Used:** review_queue + duplicate_matches + silver_customer (2x join)

```http
GET /review/queue?limit=20&offset=0
```

**Combines:**
- review_queue status
- duplicate_matches pair & scores
- silver_customer details for both records

**Returns:**
```json
{
  "queue": [
    {
      "queue_id": 5001,
      "match_id": 1001,
      "status": "PENDING",
      "record_a": {
        "silver_id": 501,
        "full_name": "John Smith",
        "email": "john@acme.com"
      },
      "record_b": {
        "silver_id": 502,
        "full_name": "Jon Smyth",
        "email": "jon@acme.com"
      },
      "final_score": 98,
      "signals": {
        "email_score": 100,
        "phone_score": 99.9,
        "name_score": 87.5
      }
    }
  ],
  "pending_count": 213
}
```

---

## 6️⃣ **LINEAGE API** - Track Data Journey

### `GET /lineage/{cust_id}` - See Record Journey Through Pipeline
**Tables Used:** db2_customer_simulated → bronze_customer → silver_customer → duplicate_matches → gold_customer

```http
GET /lineage/CRM-1001
```

**Traces path:** Source → Vault → Cleaned → Match → Master

**Returns:**
```json
{
  "source_record": {
    "cust_id": "CRM-1001",
    "name": "John Smith",
    "source_system": "CRM",
    "loaded_at": "2026-04-17T09:00:00"
  },
  "vault_record": {
    "bronze_id": 101,
    "raw_completeness": 85.7,
    "ingested_at": "2026-04-17T10:00:00"
  },
  "canonical_record": {
    "silver_id": 501,
    "full_name": "John Smith",
    "completeness": 85.7,
    "cleaned_at": "2026-04-17T10:05:00"
  },
  "matches": [
    {
      "match_id": 1001,
      "matched_with": {
        "silver_id": 502,
        "name": "Jon Smyth",
        "source_system": "ERP"
      },
      "final_score": 98,
      "decision": "APPROVED"
    }
  ],
  "master_record": {
    "golden_id": 1,
    "name": "John Smith",
    "merged_at": "2026-04-17T11:00:00",
    "source_systems": ["CRM", "ERP"]
  }
}
```

---

## 7️⃣ **CORRECTIONS API** - Apply Changes to Master

### `GET /master/corrections-preview` - Proposed Corrections
**Tables Used:** gold_customer + silver_customer (candidate comparisons)

```http
GET /master/corrections-preview?limit=5
```

**Shows:**
- Master records
- Proposed field corrections from best silver candidates
- Confidence for each suggestion

**Returns:**
```json
{
  "examples": [
    {
      "cust_id": "CRM-1001",
      "master": {
        "master_id": "1",
        "full_name": "John Smith",
        "email_primary": "john@acme.com"
      },
      "corrections": [
        {
          "field_name": "email_primary",
          "current_value": "john@acme.com",
          "proposed_value": "john.smith@acme.com",
          "confidence": 95,
          "source_record_id": "ERP-3004"
        }
      ]
    }
  ]
}
```

### `POST /master/apply-correction` - Update Master Record
**Tables Involved:** gold_customer (UPDATE) + correction_history (INSERT)

```http
POST /master/apply-correction
{
  "master_id": 1,
  "field_name": "email_primary",
  "proposed_value": "john.smith@acme.com",
  "confidence": 95
}
```

**Updates 2 tables:**
1. `gold_customer` - Updates the field
2. `correction_history` - Logs the change

**Returns:**
```json
{
  "status": "success",
  "master": {
    "golden_id": 1,
    "email_primary": "john.smith@acme.com",
    "last_reeval_at": "2026-04-17T15:30:00"
  }
}
```

---

## 📊 Complete Query Map - Which Endpoint Uses Which Tables

| Endpoint | GET/POST | Tables Used | Purpose |
|----------|----------|-------------|---------|
| `/master/records` | GET | gold + silver | List all masters |
| `/master/records/{id}` | GET | gold + silver + bronze + matches + corrections | Master detail |
| `/master/corrections-preview` | GET | gold + silver | Suggest corrections |
| `/master/apply-correction` | POST | gold (update) + corrections (insert) | Apply correction |
| `/identity/graph` | GET | matches + silver (2x) + db2 | List all pairs |
| `/vault/records` | GET | bronze + db2 | Raw ingestion data |
| `/canonical/records` | GET | silver + bronze | Cleaned data |
| `/review/queue` | GET | review + matches + silver (2x) | Pending reviews |
| `/review/decide` | POST | review (update) + matches (update) | Approve/reject |
| `/lineage/{cust_id}` | GET | db2 + bronze + silver + matches + gold | Track journey |

---

## 🎯 Frontend Display - Data From Multiple Tables

### **Master Records Page** (Shows merged data)
```
┌────────────────────────────────────────┐
│ Master ID: 1 - John Smith              │
├────────────────────────────────────────┤
│ Email (gold_customer): john.smith@acme.com
│ Phone (gold_customer): +1-800-555-0192 │
│ Quality (gold_customer): 88%            │
│ Confidence (gold_customer): 98%         │
├────────────────────────────────────────┤
│ MERGED FROM (source_ids in gold):       │
│ • CRM-1001 (silver_id 501)              │
│ • ERP-3004 (silver_id 502)              │
├────────────────────────────────────────┤
│ ORIGINAL DATA (silver_customer):        │
│ • CRM: John Smith / john@acme.com       │
│ • ERP: Jon Smyth / jon@acme.com         │
├────────────────────────────────────────┤
│ CORRECTIONS (correction_history):       │
│ ✎ Email changed: john@ → john.smith@   │
│   Applied by: USER | 2026-04-17 15:30  │
└────────────────────────────────────────┘
```

### **Identity Graph Page** (Shows matching)
```
┌─────────────────────────────────────────────┐
│ MATCH #1001                                  │
├──────────────────┬──────────────────────────┤
│ Record A         │ Record B                 │
│ (silver_id 501)  │ (silver_id 502)          │
├──────────────────┼──────────────────────────┤
│ John Smith       │ Jon Smyth                │
│ john@acme.com    │ jon@acme.com             │
│ CRM              │ ERP                      │
├──────────────────┼──────────────────────────┤
│ SIGNALS (from duplicate_matches):            │
│ Email: 100% | Phone: 99.9% | Name: 87.5%   │
│ Overall Score (final_score): 98%            │
├──────────────────────────────────────────────┤
│ [Approve] [Reject]  (review_queue)          │
└──────────────────────────────────────────────┘
```

### **Raw Vault Page** (Shows ingestion)
```
┌──────────────────────────────────────────┐
│ Kafka Event ID: 101 (bronze_customer)     │
├──────────────────────────────────────────┤
│ Source System: CRM   (from db2)           │
│ Raw Completeness: 85.7%  (bronze)         │
│ Format Valid: email ✓ phone ✓   (bronze)  │
│ Kafka Offset: 1005 | Partition: 2         │
│ DLQ Flag: No                              │
├──────────────────────────────────────────┤
│ RAW PAYLOAD:                              │
│ {first_nm: John, last_nm: Smith, ...}     │
└──────────────────────────────────────────┘
```

---

## ✅ Summary

**You have 8 fully connected tables:**
1. ✅ `db2_customer_simulated` - Source system data
2. ✅ `bronze_customer` - Raw Kafka ingestion (connects to db2 via cust_id)
3. ✅ `silver_customer` - Cleaned data (connects to bronze via bronze_id)
4. ✅ `duplicate_matches` - Pair detection (connects to silver via silver_id_a/b)
5. ✅ `review_queue` - Manual review (connects to matches via match_id)
6. ✅ `gold_customer` - Master records (references silver via source_ids JSON)
7. ✅ `correction_history` - Audit trail (connects to gold via master_id)
8. ✅ `kafka_offsets` - Operational tracking

**All APIs query across multiple tables to show complete data lineage and allow master records to pull from any source!**
