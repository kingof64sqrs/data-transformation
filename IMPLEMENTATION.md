# Golden Record Platform - Implementation & Architecture

Complete technical documentation of the frontend, backend, and feature logic.

---

## 📐 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                 │
│  - Pages: Overview, Pipeline, Records, Matches, ReviewQueue │
│  - Components: Charts, Tables, Buttons, Forms               │
│  - API Client: Axios with configurable base URL             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST API
                       │ (localhost:8000)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Python)                  │
│  - 12 REST Endpoints                                        │
│  - Data transformation pipeline                             │
│  - SQLite database integration                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ SQL Queries
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  SQLite Database                            │
│  - db2_customer_simulated (source data)                     │
│  - bronze_customer (raw ingest)                             │
│  - silver_customer (normalized)                             │
│  - duplicate_matches (identified pairs)                     │
│  - review_queue (pending approvals)                         │
│  - gold_customer (final unified records)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Pipeline Flow

### **Stage 1: Source (DB2)**
- **Source:** `db2_customer_simulated` table with 1200 mock records
- **Fields:** First name, last name, email, phone, birth date, address, city, state
- **Purpose:** Simulates a mainframe customer database

### **Stage 2: Producer (Kafka)**
- **Component:** `kafka_producer.py`
- **Action:** Reads DB2 table and publishes events to Kafka topic
- **Topic:** `customer_raw`
- **Format:** JSON events with source_system metadata
- **Output:** Events published to Kafka broker at `localhost:9092`

### **Stage 3: Consumer (Bronze)**
- **Component:** `kafka_consumer.py`
- **Action:** Subscribes to Kafka topic and stores raw events in Bronze table
- **Idempotency:** Deduplicates by `(cust_id, offset, partition)` tuple
- **Storage:** `bronze_customer` table
- **Preservation:** Raw JSON stored for lineage tracking

### **Stage 4: Transformer (Silver)**
- **Component:** `silver_transformer.py`
- **Normalization Rules:**
  ```
  Names:       Title-case (e.g., "JOHN" → "John")
  Emails:      Lowercase, trimmed (e.g., "JOHN@COMPANY" → "john@company")
  Phones:      E.164 format (e.g., "+1 (456) 789-1234" → "+14567891234")
  Dates:       ISO format YYYY-MM-DD (handles %Y-%m-%d, %Y%m%d, %d/%m/%Y)
  Cities:      Title-case with mapping (e.g., "nyc" → "New York")
  Completeness: Score 0-100 based on non-null fields (7 fields total)
  ```
- **Storage:** `silver_customer` table with `full_name` composite field
- **Validation:** Email and phone validity flags

### **Stage 5: Deduplication (Matching)**
- **Component:** `dedup_engine.py`
- **Algorithm:** Blocking + Weighted Scoring
  
  **Blocking (reduces O(n²) to O(k)):**
  - Block 1: Exact email match
  - Block 2: Exact phone match
  - Block 3: First 6 chars of name + first 5 chars of city
  - Only pairs in same block are evaluated

  **Weighted Composite Score (0-100):**
  ```
  composite_score = (
      email_match × 0.35 +      // Exact match = 1.0, else 0
      phone_match × 0.30 +      // Exact match = 1.0, else 0
      name_similarity × 0.20 +  // Fuzzy token_sort_ratio 0-1
      dob_match × 0.10 +        // Exact match = 1.0, else 0
      city_similarity × 0.05    // Fuzzy ratio 0-1
  ) × 100
  
  ai_score = min(100, composite_score + 5 if phone_match AND dob_match else 0)
  ```

  **Candidate Filter:** Only pairs with composite_score ≥ 0.55 (55%) inserted

- **Storage:** `duplicate_matches` table with all feature scores and reasoning

### **Stage 6: Decision Engine**
- **Component:** `decision_engine.py`
- **Routing Logic:**
  ```
  if ai_score >= 90.0:
      decision = "AUTO_MERGE"
      → Automatically approved
  elif 70.0 <= ai_score < 90.0:
      decision = "MANUAL_REVIEW"
      → Inserted into review_queue with status='PENDING'
  else:
      decision = "SEPARATE"
      → Kept separate, no merge
  ```

- **Human Review:** Reviewers see pairs in `review_queue` and can approve/reject
- **Status Updates:** Changed from `PENDING` to `APPROVED` or `REJECTED`

### **Stage 7: Merger (Golden)**
- **Component:** `golden_merger.py`
- **Algorithm:** Union-Find Clustering
  ```
  1. Collect all pairs with decision='AUTO_MERGE' or 'APPROVED'
  2. Build union-find structure to group transitive matches
     Example: A↔B and B↔C → Group {A, B, C}
  3. For each group:
     • Select best values for each field (longest string, first non-null)
     • Combine emails (primary + secondary list)
     • Aggregate source systems and IDs
     • Calculate group confidence from all pairwise scores
  4. Add non-grouped records as individual golden records
  ```

- **Confidence:** Average AI score of all pairs in group
- **Storage:** `gold_customer` table with merged fields

---

## 🛠️ Backend Implementation

### **FastAPI Application (`golden_record_platform/api/main.py`)**

#### **Pydantic Models (Data Contracts)**
```python
# Request payload
class PipelineRunRequest:
    reset_layers: bool = True      # Wipe existing data before run
    produce_limit: Optional[int]   # Limit records to process (for testing)

class ReviewDecisionRequest:
    match_id: int                  # Which pair to approve/reject
    decision: str                  # "approve" or "reject"

# Response payload
class SummaryResponse:
    db2_records: int
    bronze_records: int
    silver_records: int
    duplicate_matches: int
    review_queue: int
    golden_records: int
    auto_merged: int               # Decision counts
    manual_review: int
    decided_separate: int

class RecordResponse:
    records: list                  # Normalized records for frontend
    count: int
```

#### **12 REST Endpoints**

| Method | Path | Purpose | Frontend Integration |
|--------|------|---------|----------------------|
| GET | `/health` | System status check | TopNavBar connection indicator |
| GET | `/info` | Available endpoints | Settings page |
| GET | `/summary` | Pipeline statistics | Overview KPI cards |
| POST | `/pipeline/run` | Execute full pipeline | Pipeline page "RUN" button |
| GET | `/records/db2` | Raw source data | Records tab |
| GET | `/records/bronze` | Ingested data | Records tab |
| GET | `/records/silver` | Normalized data | Records tab |
| GET | `/records/gold` | Final unified records | Records tab |
| GET | `/matches` | All identified pairs | Match Intelligence page |
| GET | `/review-queue` | Pending human review | Review Queue page modal |
| POST | `/review/decide` | Submit approval/rejection | ReviewQueue approve/reject buttons |
| POST | `/rebuild/golden` | Regenerate from decisions | Pipeline page after review |

#### **Data Normalization Helpers**

```python
def _as_frontend_record(row: dict) -> dict:
    """Convert SQLite row to frontend shape"""
    return {
        "customer_id": row["cust_id"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "full_name": row["full_name"],
        "email": row["email"],
        "phone_number": row["phone"],
        "date_of_birth": row["birth_date"],
        "address_line1": row["address"],
        "city": row["city"],
        "state": row["state"]
    }

def _normalized_decision(value: str) -> str:
    """Convert database decision to frontend status"""
    mapping = {
        "AUTO_MERGE": "auto_merged",
        "APPROVED": "auto_merged",
        "MANUAL_REVIEW": "manual_review",
        "SEPARATE": "decided_separate",
        "REJECTED": "decided_separate"
    }
    return mapping.get(value, "manual_review")

def _fetch_match_rows(limit: int, review_only: bool = False) -> list:
    """Fetch matches with joined record data and normalized field names"""
    # Retrieves from duplicate_matches, joins with silver_customer (2 copies)
    # Returns list with structure:
    # {
    #   match_id, record1_id, record2_id,
    #   confidence_score (0-1 scale),
    #   decision (normalized),
    #   record1, record2 (normalized records),
    #   signals (feature scores dict)
    # }
```

#### **Transaction Safety**
```python
# All database updates use parameterized queries:
db.execute_query(
    "UPDATE duplicate_matches SET decision = ? WHERE match_id = ?",
    (decision_value, match_id)
)
# Prevents SQL injection and handles SQLite transactions properly
```

---

## 🎨 Frontend Implementation

### **Technology Stack**
- **Framework:** React 19.2.4 with TypeScript
- **Routing:** React Router 7.14.1
- **HTTP:** Axios 1.15.0
- **Charts:** Recharts 3.8.1
- **Styling:** Tailwind CSS 4.2.2 with custom CSS variables
- **Build:** Vite 8.0.4 with @vitejs/plugin-react
- **State:** Zustand 5.0.12 (optional, for shared state)
- **Animation:** Framer Motion 12.38.0

### **Folder Structure**
```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts           # Axios instance with VITE_API_BASE_URL fallback
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BaseLayout.tsx   # Main layout wrapper with sidebar & topnav
│   │   │   ├── Sidebar.tsx      # Navigation menu
│   │   │   └── TopNavBar.tsx    # Header with health indicator
│   │   └── ui/
│   │       ├── Button.tsx       # Styled button component
│   │       ├── ConfidenceBar.tsx# Visual score bar (0-100)
│   │       ├── DecisionButtons.tsx # Approve/Reject buttons with keyboard shortcuts
│   │       ├── KpiCard.tsx      # Metric display card
│   │       ├── MatchCard.tsx    # Match pair comparison card
│   │       ├── PipelineFlow.tsx # Stage diagram with counts
│   │       ├── RecordTable.tsx  # Sortable/searchable table
│   │       ├── SidePanel.tsx    # Detail panel slide-out
│   │       ├── StatusBadge.tsx  # Status indicator pill
│   │       ├── TerminalLog.tsx  # Scrollable log display
│   │       └── Toast.tsx        # Toast notification system
│   ├── pages/
│   │   ├── Overview.tsx         # Dashboard with KPIs & charts
│   │   ├── Pipeline.tsx         # Run controls & terminal log
│   │   ├── Records.tsx          # Layer-aware record browsing
│   │   ├── MatchIntelligence.tsx # Duplicate pair visualizations
│   │   ├── ReviewQueue.tsx      # Human review modal
│   │   └── DataLineage.tsx      # Audit trail (stub)
│   ├── lib/
│   │   └── utils.ts            # Tailwind classname merge (clsx)
│   ├── App.tsx                 # Router setup
│   └── main.tsx                # React entry point
```

### **Page Logic Flow**

#### **Overview Page**
1. **Load:** Fetch `/summary` on mount
2. **Layout:**
   - **Zone 1:** 5 KPI cards (db2, silver, golden, manual_review, auto_merged)
   - **Zone 2:** Pipeline flow diagram showing stage counts
   - **Zone 3:** Mock activity feed (hardcoded for now)
   - **Zone 4:** Top merged records placeholder
   - **Zone 5:** Score distribution & decision split pie charts
3. **Chart Rendering:**
   - BarChart (Recharts) with responsive container
   - PieChart with custom donut inner label
   - Responders handle missing/null counts with defaults
4. **Update:** Re-fetch summary every 10s if user viewing

#### **Pipeline Page**
1. **Controls:**
   - Checkbox: "Reset All Layers" (sets reset_layers param)
   - Input: "Record Limit" (sets produce_limit param)
   - Checkbox: "Dry Run Mode" (not yet implemented in backend)
   - Button: "RUN PIPELINE" → POST `/pipeline/run`
2. **Terminal Log:**
   - Mock log lines for now (hardcoded messages)
   - Real implementation: SSE or WebSocket for live updates
   - Shows: [HH:MM:SS] [LEVEL] Message
3. **Stats Display:**
   - Reads response, displays counts in grid
   - Handles timeout (10s) with error message

#### **Records Page**
1. **Layer Tabs:**
   - "Raw (DB2)" → `/records/db2`
   - "Bronze" → `/records/bronze`
   - "Silver" → `/records/silver`
   - "Gold ✨" → `/records/gold`
2. **Dynamic Columns (Layer-Aware):**
   ```
   DB2:   customer_id, first_nm, last_nm, email_addr, phone_num, addr_city, addr_state
   Bronze: cust_id, first_nm, last_nm, email_addr, phone_num, addr_city, addr_state
   Silver: silver_id, first_name, last_name, email, phone, city, state, completeness
   Gold:   golden_id, name, email_primary, phone, city, state, source_records (merged count)
   ```
3. **Features:**
   - Search by name, email, phone, ID (client-side filter)
   - Click row → side panel with full record details
   - Export CSV button (stub)
   - Pagination via limit query param
4. **Normalization:**
   - Maps API field names to display names
   - Handles missing fields gracefully (shows "-")
   - Gold records show merged count badge

#### **Match Intelligence Page**
1. **Filter Tabs:**
   - ALL (count)
   - AUTO-MERGED (count)
   - IN REVIEW (count)
   - REJECTED (count)
2. **Card Grid:**
   - Calls `/matches` to fetch all pairs
   - Renders MatchCard for each
   - Cards show:
     - Match ID & status badge
     - Two-column record comparison
     - Signal breakdown (name, email, phone, address scores)
     - Overall confidence bar
     - Approve/Reject buttons (only for `pending` status)
3. **Color Coding:**
   - Green (auto-merged)
   - Yellow (in review)
   - Red (rejected)

#### **Review Queue Page**
1. **Load:** GET `/review-queue` on mount
2. **Display:**
   - Shows first queue[0] item in modal
   - Two-column comparison of record1 vs record2
   - Field highlighting:
     - Exact match → green highlight
     - Fuzzy match → yellow underline
     - Different → red bold
   - Confidence bar (0-100 scale)
   - Signal breakdown (actual feature scores from backend)
3. **Actions:**
   - Approve button → POST `/review/decide` with "approve"
   - Reject button → POST `/review/decide` with "reject"
   - Keyboard: Arrow Right or 'A' = Approve, Arrow Left or 'R' = Reject
4. **Flow:**
   - Optimistic UI: Remove item from queue immediately
   - Send POST request
   - On error: Re-fetch queue from `/review-queue`
   - Auto-refresh queue every 5s

### **API Client Configuration**
```typescript
// frontend/src/api/client.ts
const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const api = axios.create({
    baseURL,
    timeout: 30000,  // 30s for long pipeline runs
});

export default api;
```

**Environment Variable:**
```
# .env or .env.local
VITE_API_BASE_URL=http://localhost:8000
```

### **Component Communication Pattern**
```
Page Component (e.g., ReviewQueue)
    ↓ useCallback
    ↓ api.get/post
    ↓ response.data.queue || response.data.records
    ↓ setQueue(state)
    ↓ render children
    ↓ DecisionButtons onClick → handleDecision('approve')
    ↓ api.post('/review/decide', {match_id, decision})
    ↓ optimistic update + refetch
```

---

## 🔗 Frontend-Backend Integration Points

### **Request Flow Example: Review & Decision**

1. **Frontend (ReviewQueue.tsx)**
   ```typescript
   const handleDecision = async (decision: 'approve' | 'reject') => {
     const current = queue[0];
     setQueue(prev => prev.slice(1));  // Optimistic
     
     try {
       await api.post('/review/decide', {
         match_id: current.match_id,
         decision: decision
       });
     } catch (e) {
       fetchQueue();  // Revert on error
     }
   };
   ```

2. **Backend (api/main.py)**
   ```python
   @app.post("/review/decide")
   async def submit_review_decision(request: ReviewDecisionRequest):
       db = get_db()
       
       # Update review_queue status
       db.execute_query(
           "UPDATE review_queue SET status = ? WHERE match_id = ?",
           ("APPROVED" if request.decision == "approve" else "REJECTED",
            request.match_id)
       )
       
       # Update duplicate_matches decision
       db.execute_query(
           "UPDATE duplicate_matches SET decision = ? WHERE match_id = ?",
           ("APPROVED" if request.decision == "approve" else "REJECTED",
            request.match_id)
       )
       
       return {"status": "success", "message": "..."}
   ```

3. **Database (SQLite)**
   ```sql
   -- Two tables updated in same transaction
   -- review_queue: status PENDING → APPROVED/REJECTED
   -- duplicate_matches: decision MANUAL_REVIEW → APPROVED/REJECTED
   ```

### **Data Shape Contracts**

**Match Object (from `/matches` and `/review-queue`):**
```json
{
  "match_id": 525,
  "record1_id": 1222,
  "record2_id": 1245,
  "confidence_score": 0.85,
  "decision": "manual_review",
  "record1": {
    "customer_id": "C00000022",
    "first_name": "Jon",
    "last_name": "Smyth",
    "email": "jon.smyth@company.ae",
    "phone_number": "+10569741328",
    "date_of_birth": "1975-05-06",
    "address_line1": "313 Hill St",
    "city": "New York",
    "state": "NY",
    "zip_code": null
  },
  "record2": { /* same structure */ },
  "signals": {
    "email_match": 0.0,
    "phone_match": 1.0,
    "name_similarity": 1.0,
    "dob_match": 1.0,
    "city_similarity": 1.0,
    "ai_reasoning": "Moderate confidence: partial match requires manual confirmation"
  }
}
```

**Summary Object (from `/summary`):**
```json
{
  "db2_records": 1200,
  "bronze_records": 1200,
  "silver_records": 1200,
  "duplicate_matches": 524,
  "review_queue": 182,
  "golden_records": 944,
  "auto_merged": 291,
  "manual_review": 182,
  "decided_separate": 51
}
```

**Record Object (from `/records/{layer}`):**
```json
{
  "records": [
    {
      "customer_id": "C00000022",
      "first_name": "Jon",
      "last_name": "Smyth",
      "full_name": "Jon Smyth",
      "email": "jon.smyth@company.ae",
      "phone_number": "+10569741328",
      "date_of_birth": "1975-05-06",
      "address_line1": "313 Hill St",
      "city": "New York",
      "state": "NY",
      "zip_code": null
    }
  ],
  "count": 100
}
```

---

## 🎯 Feature Implementations

### **Feature 1: Automatic Duplicate Detection**
- **Backend:** `dedup_engine.py` blocking algorithm
- **Frontend:** Match Intelligence page with card grid
- **User Flow:** Open app → see matches grouped by confidence level
- **Output:** `duplicate_matches` table populated

### **Feature 2: Human-in-the-Loop Review**
- **Backend:** `decision_engine.py` routing (70-90% threshold)
- **Frontend:** Review Queue modal with side-by-side comparison
- **User Flow:** See pending match → click Approve/Reject → get next match
- **Output:** `review_queue` status updated, `duplicate_matches.decision` set to APPROVED/REJECTED

### **Feature 3: Golden Record Creation**
- **Backend:** `golden_merger.py` union-find clustering
- **Frontend:** Records page, Gold tab showing unified records
- **User Flow:** Run pipeline → see consolidated records
- **Output:** `gold_customer` table with merged fields and confidence scores

### **Feature 4: Record Normalization**
- **Backend:** `silver_transformer.py` with regex & format rules
- **Frontend:** Records page, Silver tab showing cleaned data
- **User Flow:** View raw data → see normalized version
- **Output:** `silver_customer` table with validated fields

### **Feature 5: Pipeline Orchestration**
- **Backend:** `golden_record_platform/pipeline/orchestrator.py` linking all stages
- **Frontend:** Pipeline page with RUN button and terminal log
- **User Flow:** Click RUN → watch progress → see final stats
- **Output:** All tables filled end-to-end

### **Feature 6: Data Lineage**
- **Backend:** Raw JSON stored in bronze, source_ids aggregated in gold
- **Frontend:** Records page side panel shows source records for gold entries
- **User Flow:** Click gold record → see "merged from IDs" badge
- **Output:** Traceability from source through all stages

---

## 🚀 Deployment Features

### **Configuration**
- **Environment:** `.env` file with:
  - `DB_PATH`: SQLite file location
  - `MOCK_RECORD_COUNT`: Number of synthetic records (default 1200)
  - `KAFKA_BOOTSTRAP_SERVERS`: Kafka broker address
  - `KAFKA_TOPIC`: Topic name for events

### **Error Handling**
- **Frontend:** Try/catch blocks with toast notifications
- **Backend:** HTTPException with status codes (400, 500) and detail messages
- **Database:** Parameterized queries to prevent SQL injection

### **Performance**
- **Database:** Indexes on frequently queried columns (email, phone, decision)
- **Backend:** Timeout 30s on requests to allow long pipeline runs
- **Frontend:** Lazy loading, optimistic UI updates, debounced search

### **Logging**
- **Backend:** Uvicorn logs request/response
- **Frontend:** Console.error on API failures

---

## 📊 Testing Workflow

1. **Start System:**
   ```bash
   docker-compose up -d      # Kafka
   ./start_backend.sh        # FastAPI
   cd frontend && npm run dev # Vite dev server
   ```

2. **End-to-End Test:**
   - Open http://localhost:5173 (frontend)
   - Click Overview → see KPI cards
   - Click Pipeline → RUN PIPELINE
   - Watch stats update
   - Click Records → Gold tab → see 944 golden records
   - Click Review Queue → approve/reject a match
   - Click Pipeline → REBUILD GOLDEN
   - See gold count update

3. **API Direct Test:**
   ```bash
   curl http://localhost:8000/summary
   curl -X POST http://localhost:8000/pipeline/run \
     -H "Content-Type: application/json" \
     -d '{"reset_layers": true}'
   ```

---

## 🔮 Future Enhancements

1. **Real-time Updates:** WebSocket for live pipeline progress
2. **Batch Review:** Select multiple matches for bulk approve/reject
3. **Custom Rules:** Let users define blocking criteria
4. **ML Scoring:** Replace deterministic weights with trained model
5. **API Documentation:** OpenAPI/Swagger fully documented endpoints
6. **Audit Trail:** Complete activity log with user attribution
7. **Data Export:** CSV/JSON export of golden records
8. **Advanced Search:** Elasticsearch or full-text search on records
9. **Multi-user:** User authentication and role-based access
10. **Scheduled Runs:** Cron jobs for periodic pipeline execution

---

## 📝 Key Takeaways

- **Pipeline:** 7 stages from raw data → unified records
- **Matching:** Blocking algorithm + weighted scoring (deterministic, not ML)
- **Human Review:** 70-90% confidence threshold routes to manual queue
- **Merging:** Union-find handles transitive closure (A↔B, B↔C → group {A,B,C})
- **Frontend:** React pages consume normalized API contracts
- **Backend:** FastAPI exposes 12 endpoints for all operations
- **Database:** SQLite with 6 core tables + transaction safety
