CLAUDE.md — Enterprise Data Unification Platform
Implementation Blueprint for Claude Code
Platform Name: DataFusion Intelligence Platform
Purpose: End-to-end customer master data management with AI-powered deduplication and human-in-the-loop review
Audience: Enterprise clients (Banks, Insurance, Telecom, Retail)
Stack: FastAPI + React 19 + TypeScript + SQLite + Kafka + Azure OpenAI GPT-4.1
🎯 Vision & Framing
This is not a CRUD app. It is an enterprise Master Data Management (MDM) platform that gives clients a live, auditable, AI-assisted view of their customer identity graph. The product must feel like something a Fortune 500 data team would pay for — think Informatica + Salesforce Data Cloud, but modern and explainable.
Pipeline Layer Naming (enterprise-grade, replace bronze/silver/gold):


Old Name
New Name
Rationale
DB2 Source
Ingestion Layer
Raw source pull from upstream systems
Bronze
Raw Vault
Immutable append-only event store
Silver
Canonical Layer
Normalized, validated, business-ready
Matches
Identity Graph
Probabilistic links between entities
Gold
Master Records
Unified, trusted customer master
🏗️ System Architecture (What Claude Code Must Build)
┌─────────────────────────────────────────────────────────────────┐
│                    DataFusion Intelligence Platform              │
│                                                                 │
│  React 19 + TypeScript + Tailwind + Recharts + Framer Motion    │
│                                                                 │
│  Pages:                                                         │
│  ├── /                    Command Center (Dashboard)            │
│  ├── /pipeline            Pipeline Orchestration                │
│  ├── /raw-vault           Raw Vault Explorer                    │
│  ├── /canonical           Canonical Layer Explorer              │
│  ├── /identity-graph      Identity Graph & Match Intelligence   │
│  ├── /review              AI-Assisted Human Review              │
│  ├── /master-records      Master Record Browser                 │
│  ├── /lineage             Data Lineage & Audit                  │
│  └── /settings            Config & API Health                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ REST + SSE (Server-Sent Events)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Python 3.11+)                │
│                                                                 │
│  Routers:                                                       │
│  ├── /pipeline/*          Orchestration endpoints               │
│  ├── /vault/*             Raw Vault CRUD & query               │
│  ├── /canonical/*         Canonical layer query                 │
│  ├── /identity/*          Identity graph & matches              │
│  ├── /review/*            Human review queue                    │
│  ├── /master/*            Master record access                  │
│  ├── /ai/*                GPT-4.1 AI suggestions               │
│  ├── /events              SSE stream for live logs              │
│  └── /health, /summary    System status                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
┌──────────────┐             ┌──────────────────────┐
│   SQLite DB  │             │  Azure OpenAI GPT-4.1 │
│  6 tables    │             │  (ai_suggestions,     │
│              │             │   reasoning, chat)    │
└──────────────┘             └──────────────────────┘
        │
        ▼
┌──────────────┐
│  Kafka Broker│
│  localhost:  │
│  9092        │
└──────────────┘
📦 Backend Implementation (FastAPI)
File Structure
backend/
├── main.py                         # FastAPI app, CORS, router registration
├── config.py                       # Pydantic Settings (env vars)
├── database.py                     # SQLite connection pool
├── models/
│   ├── schemas.py                  # All Pydantic request/response models
│   └── db_models.py                # SQLite table definitions (as dicts)
├── pipeline/
│   ├── orchestrator.py             # Master pipeline coordinator
│   ├── kafka_producer.py           # Reads source, publishes to Kafka
│   ├── kafka_consumer.py           # Consumes Kafka → Raw Vault
│   ├── canonical_transformer.py    # Raw Vault → Canonical Layer
│   ├── identity_engine.py          # Canonical → Identity Graph (matching)
│   ├── decision_engine.py          # Routes matches to AUTO/REVIEW/SEPARATE
│   └── master_merger.py            # Approved pairs → Master Records
├── routers/
│   ├── pipeline.py                 # /pipeline/*
│   ├── vault.py                    # /vault/*
│   ├── canonical.py                # /canonical/*
│   ├── identity.py                 # /identity/*
│   ├── review.py                   # /review/*
│   ├── master.py                   # /master/*
│   ├── ai.py                       # /ai/*  (GPT-4.1 integration)
│   └── events.py                   # /events SSE stream
└── utils/
    ├── normalizers.py              # Name, phone, email, date normalizers
    ├── scoring.py                  # Weighted match scoring logic
    └── union_find.py               # Union-Find for transitive closure
Environment Variables (config.py)
# backend/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    DB_PATH: str = "datafusion.db"
    
    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_RAW: str = "customer_raw_events"
    KAFKA_CONSUMER_GROUP: str = "datafusion_vault"
    
    # Azure OpenAI
    AZURE_OPENAI_API_KEY: str
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4.1"
    AZURE_OPENAI_API_VERSION: str = "2024-02-01"
    
    # Pipeline
    MOCK_RECORD_COUNT: int = 1200
    AUTO_MERGE_THRESHOLD: float = 90.0
    MANUAL_REVIEW_THRESHOLD: float = 70.0
    
    class Config:
        env_file = ".env"

settings = Settings()
Database Schema (database.py)
# All 6 tables — Claude Code must create these on startup

CREATE_TABLES = """
-- Source simulation table
CREATE TABLE IF NOT EXISTS source_customers (
    cust_id TEXT PRIMARY KEY,
    first_nm TEXT, last_nm TEXT,
    email_addr TEXT, phone_num TEXT,
    birth_date TEXT, address TEXT,
    city TEXT, state TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Raw Vault: immutable, append-only, Kafka events
CREATE TABLE IF NOT EXISTS raw_vault (
    vault_id INTEGER PRIMARY KEY AUTOINCREMENT,
    cust_id TEXT NOT NULL,
    kafka_offset INTEGER,
    kafka_partition INTEGER,
    source_system TEXT DEFAULT 'CRM',
    raw_payload TEXT,  -- full JSON blob
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cust_id, kafka_offset, kafka_partition)
);

-- Canonical Layer: normalized, validated
CREATE TABLE IF NOT EXISTS canonical_customers (
    canonical_id INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id INTEGER REFERENCES raw_vault(vault_id),
    cust_id TEXT NOT NULL,
    first_name TEXT, last_name TEXT,
    full_name TEXT,
    email TEXT, email_valid INTEGER DEFAULT 0,
    phone TEXT, phone_valid INTEGER DEFAULT 0,
    birth_date TEXT,
    address TEXT, city TEXT, state TEXT,
    completeness_score REAL DEFAULT 0.0,
    normalized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Identity Graph: match pairs
CREATE TABLE IF NOT EXISTS identity_graph (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    record1_id INTEGER REFERENCES canonical_customers(canonical_id),
    record2_id INTEGER REFERENCES canonical_customers(canonical_id),
    email_score REAL DEFAULT 0.0,
    phone_score REAL DEFAULT 0.0,
    name_score REAL DEFAULT 0.0,
    dob_score REAL DEFAULT 0.0,
    address_score REAL DEFAULT 0.0,
    composite_score REAL DEFAULT 0.0,
    ai_confidence REAL DEFAULT 0.0,
    ai_reasoning TEXT,
    decision TEXT DEFAULT 'PENDING',
    decided_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review Queue: human-in-the-loop
CREATE TABLE IF NOT EXISTS review_queue (
    queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES identity_graph(match_id),
    status TEXT DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED
    reviewer_note TEXT,
    ai_suggestion TEXT,             -- GPT-4.1 recommendation
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Master Records: unified golden truth
CREATE TABLE IF NOT EXISTS master_records (
    master_id TEXT PRIMARY KEY,     -- MR-XXXXXXXX
    canonical_id_primary INTEGER,
    full_name TEXT,
    email_primary TEXT,
    emails_all TEXT,                -- JSON array
    phone TEXT,
    birth_date TEXT,
    address TEXT, city TEXT, state TEXT,
    source_ids TEXT,                -- JSON array of all merged cust_ids
    source_systems TEXT,            -- JSON array
    confidence_score REAL,
    record_count INTEGER DEFAULT 1, -- how many were merged
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""
All Backend Endpoints (routers/)
/pipeline router
# routers/pipeline.py

POST /pipeline/run
    Body: { reset_layers: bool, produce_limit: int | null, dry_run: bool }
    Action: Run all stages end-to-end
    Response: { run_id, status, stats: SummaryStats, duration_ms }
    SSE: Streams progress events to /events

POST /pipeline/run-stage
    Body: { stage: "ingest" | "vault" | "canonical" | "identity" | "decision" | "master" }
    Action: Run only one stage
    Response: { stage, records_processed, duration_ms }

POST /pipeline/rebuild-master
    Action: Regenerate master records from approved decisions only
    Response: { master_records_created, merged_groups }

GET /pipeline/status
    Response: { last_run_at, is_running, current_stage, progress_pct }

GET /pipeline/history
    Response: [{ run_id, started_at, completed_at, stats, status }]
/vault router
# routers/vault.py

GET /vault/records
    Query: limit=100, offset=0, search=<str>
    Response: { records: [VaultRecord], count, total }

GET /vault/records/{vault_id}
    Response: VaultRecord with raw_payload parsed

GET /vault/stats
    Response: { total, by_source_system, ingestion_rate_per_hour }
/canonical router
# routers/canonical.py

GET /canonical/records
    Query: limit=100, offset=0, search=<str>, min_completeness=0
    Response: { records: [CanonicalRecord], count, total }

GET /canonical/records/{canonical_id}
    Response: CanonicalRecord + linked vault record

GET /canonical/stats
    Response: { total, avg_completeness, valid_emails_pct, valid_phones_pct }

GET /canonical/quality-issues
    Response: { low_completeness: [], invalid_emails: [], invalid_phones: [] }
/identity router
# routers/identity.py

GET /identity/graph
    Query: limit=100, offset=0, decision=<filter>, min_score=0
    Response: { matches: [MatchRecord], count, total }

GET /identity/graph/{match_id}
    Response: MatchRecord with full record details + signal breakdown

GET /identity/stats
    Response: {
      total_matches, auto_merged, manual_review, 
      decided_separate, pending,
      avg_confidence, score_distribution: [{range, count}]
    }

GET /identity/network/{canonical_id}
    Response: { nodes: [], edges: [] }  # for graph visualization
/review router
# routers/review.py

GET /review/queue
    Query: limit=20, offset=0
    Response: { queue: [ReviewItem], count }
    # Each ReviewItem includes record1, record2, signals, ai_suggestion

POST /review/decide
    Body: { match_id: int, decision: "approve" | "reject", note: str | null }
    Response: { status, match_id, decision, remaining_queue }

POST /review/bulk-decide
    Body: { decisions: [{match_id, decision}] }
    Response: { processed, failed }

GET /review/stats
    Response: { pending, approved_today, rejected_today, avg_review_time_minutes }

POST /review/ai-suggest/{match_id}
    Action: Call GPT-4.1 to analyze pair and suggest decision
    Response: { suggestion: "approve" | "reject", reasoning: str, confidence: float }
/master router
# routers/master.py

GET /master/records
    Query: limit=100, offset=0, search=<str>
    Response: { records: [MasterRecord], count, total }

GET /master/records/{master_id}
    Response: MasterRecord + source_records + merge_history

GET /master/stats
    Response: { total, merged_count, singleton_count, avg_confidence }

GET /master/export
    Query: format=csv|json
    Response: File download
/ai router (GPT-4.1 Integration)
# routers/ai.py

POST /ai/analyze-match
    Body: { match_id: int }
    Action: Send both records to GPT-4.1 for analysis
    System prompt: See AI prompts section below
    Response: {
      suggestion: "approve" | "reject" | "uncertain",
      confidence: float (0-1),
      reasoning: str,
      key_signals: [str],
      risk_flags: [str]
    }

POST /ai/explain-record/{master_id}
    Action: GPT-4.1 explains why records were merged
    Response: { explanation: str, merge_rationale: str }

POST /ai/data-quality-report
    Action: Analyze canonical layer quality issues
    Response: { issues: [], recommendations: [], quality_score: float }

POST /ai/chat
    Body: { message: str, context: "pipeline" | "records" | "review" }
    Action: Contextual chat with platform data context injected
    Response: { reply: str }
    # This powers the AI Assistant panel on each page
AI Prompts (backend/utils/ai_prompts.py)
MATCH_ANALYSIS_SYSTEM_PROMPT = """
You are an enterprise Master Data Management AI assistant. Your role is to analyze 
potential duplicate customer records and provide a precise, explainable decision.

You will be given two customer records with their similarity signals. 
Analyze all signals and provide a structured assessment.

Rules:
- If email AND phone both match: very high confidence, recommend APPROVE
- If name similarity > 0.85 AND (email OR phone matches): recommend APPROVE
- If only name is similar with no other corroborating signals: recommend REJECT  
- Flag risk if addresses are in different cities/states with no other explanation
- Always consider the possibility of married name changes, typos, format variations

Output ONLY valid JSON. No markdown, no explanation outside the JSON.
Format:
{
  "suggestion": "approve" | "reject" | "uncertain",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence plain English explanation",
  "key_signals": ["list of signals that drove the decision"],
  "risk_flags": ["any concerns or caveats"],
  "alternative_explanation": "could this be a family member or colleague?"
}
"""

MATCH_ANALYSIS_USER_TEMPLATE = """
Analyze these two potential duplicate customer records:

RECORD A:
- Name: {r1_name}
- Email: {r1_email}
- Phone: {r1_phone}
- Date of Birth: {r1_dob}
- Address: {r1_address}, {r1_city}, {r1_state}

RECORD B:
- Name: {r2_name}
- Email: {r2_email}
- Phone: {r2_phone}
- Date of Birth: {r2_dob}
- Address: {r2_address}, {r2_city}, {r2_state}

SIMILARITY SIGNALS:
- Email match: {email_score} (0=no match, 1=exact)
- Phone match: {phone_score}
- Name similarity: {name_score} ({name_score_pct}%)
- Date of birth match: {dob_score}
- Address similarity: {address_score}
- Composite AI confidence: {ai_confidence}%

Should these records be merged into a single master record?
"""

DATA_QUALITY_SYSTEM_PROMPT = """
You are a data quality analyst for an enterprise MDM platform. 
Analyze the provided data quality statistics and return actionable recommendations.
Output ONLY valid JSON.
"""
Kafka Integration (pipeline/kafka_producer.py + kafka_consumer.py)
# pipeline/kafka_producer.py
# MUST BE PROPERLY IMPLEMENTED — not mocked

from confluent_kafka import Producer
import json, uuid
from database import get_db
from config import settings

def produce_records(limit: int | None = None):
    """Read from source_customers, publish each as a Kafka event"""
    producer = Producer({
        'bootstrap.servers': settings.KAFKA_BOOTSTRAP_SERVERS,
        'client.id': 'datafusion-producer'
    })
    
    db = get_db()
    query = "SELECT * FROM source_customers"
    if limit:
        query += f" LIMIT {limit}"
    
    rows = db.fetch_all(query)
    published = 0
    
    for row in rows:
        event = {
            "event_id": str(uuid.uuid4()),
            "source_system": "CRM_MAIN",
            "event_type": "CUSTOMER_RECORD",
            "payload": dict(row),
            "schema_version": "1.0",
            "produced_at": datetime.utcnow().isoformat()
        }
        
        producer.produce(
            topic=settings.KAFKA_TOPIC_RAW,
            key=row['cust_id'],
            value=json.dumps(event),
            callback=delivery_callback
        )
        published += 1
    
    producer.flush()
    return published


# pipeline/kafka_consumer.py
from confluent_kafka import Consumer
import json
from database import get_db
from config import settings

def consume_to_vault(max_messages: int = 5000, timeout_seconds: int = 30):
    """Consume from Kafka topic, store in raw_vault with idempotency"""
    consumer = Consumer({
        'bootstrap.servers': settings.KAFKA_BOOTSTRAP_SERVERS,
        'group.id': settings.KAFKA_CONSUMER_GROUP,
        'auto.offset.reset': 'earliest',
        'enable.auto.commit': False
    })
    
    consumer.subscribe([settings.KAFKA_TOPIC_RAW])
    db = get_db()
    consumed = 0
    
    try:
        while consumed < max_messages:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                break
            if msg.error():
                continue
                
            event = json.loads(msg.value())
            payload = event['payload']
            
            # Idempotent insert: skip if (cust_id, offset, partition) exists
            db.execute_query("""
                INSERT OR IGNORE INTO raw_vault 
                (cust_id, kafka_offset, kafka_partition, source_system, raw_payload)
                VALUES (?, ?, ?, ?, ?)
            """, (
                payload['cust_id'],
                msg.offset(),
                msg.partition(),
                event.get('source_system', 'UNKNOWN'),
                msg.value().decode('utf-8')
            ))
            
            consumer.commit(msg)
            consumed += 1
    finally:
        consumer.close()
    
    return consumed
SSE Events Stream (routers/events.py)
# routers/events.py
# Server-Sent Events for real-time pipeline progress

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio, json
from datetime import datetime

router = APIRouter()
event_queue = asyncio.Queue()

async def event_generator():
    while True:
        try:
            event = await asyncio.wait_for(event_queue.get(), timeout=15.0)
            yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            # Heartbeat to keep connection alive
            yield f"data: {json.dumps({'type': 'heartbeat', 'ts': datetime.utcnow().isoformat()})}\n\n"

@router.get("/events")
async def stream_events():
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Helper: call this from pipeline stages to push updates
async def emit_event(event_type: str, message: str, data: dict = {}):
    await event_queue.put({
        "type": event_type,   # "stage_start" | "stage_complete" | "log" | "error"
        "message": message,
        "data": data,
        "ts": datetime.utcnow().isoformat()
    })
🎨 Frontend Implementation (React 19 + TypeScript)
Design System
Aesthetic Direction: Dark enterprise — deep navy/charcoal base, electric cyan accent, amber for warnings, clean data-dense tables. Think Bloomberg Terminal meets modern SaaS. NOT purple gradients.
Color Tokens (CSS variables in index.css):
:root {
  --bg-primary: #080d14;       /* deep navy-black */
  --bg-surface: #0e1724;       /* card backgrounds */
  --bg-elevated: #152032;      /* hover states, panels */
  --border: #1e3048;           /* subtle borders */
  --border-bright: #2a4668;    /* focused borders */

  --accent-cyan: #00d4ff;      /* primary actions, links */
  --accent-cyan-dim: #0099bb;  /* hover states */
  --accent-amber: #f59e0b;     /* warnings, review */
  --accent-green: #10b981;     /* success, approved */
  --accent-red: #ef4444;       /* errors, rejected */
  --accent-purple: #8b5cf6;    /* AI/ML indicators */

  --text-primary: #e2eaf4;     /* main text */
  --text-secondary: #7a9bb8;   /* labels, metadata */
  --text-muted: #3d5870;       /* placeholders */

  --font-display: 'DM Mono', monospace;   /* numbers, IDs, data */
  --font-body: 'Inter', sans-serif;       /* labels, prose */
  --font-heading: 'Space Grotesk', sans-serif; /* page titles */
}
Import in index.html:
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
File Structure
frontend/src/
├── api/
│   ├── client.ts              # Axios instance
│   ├── pipeline.ts            # Pipeline API calls
│   ├── vault.ts               # Raw Vault API calls
│   ├── canonical.ts           # Canonical API calls
│   ├── identity.ts            # Identity Graph API calls
│   ├── review.ts              # Review Queue API calls
│   ├── master.ts              # Master Records API calls
│   └── ai.ts                  # AI endpoints
├── components/
│   ├── layout/
│   │   ├── Shell.tsx           # Main shell: sidebar + topbar + content
│   │   ├── Sidebar.tsx         # Collapsible nav with stage indicators
│   │   └── TopBar.tsx          # Search, health dot, notifications
│   ├── ui/
│   │   ├── KpiCard.tsx
│   │   ├── DataTable.tsx       # Sortable, searchable, paginated
│   │   ├── ConfidenceBar.tsx   # Animated score bar
│   │   ├── StatusBadge.tsx     # Color-coded status pill
│   │   ├── MatchCard.tsx       # Side-by-side record comparison
│   │   ├── SignalBreakdown.tsx  # Score breakdown with bars
│   │   ├── Toast.tsx
│   │   ├── SidePanel.tsx       # Slide-out detail panel
│   │   ├── PipelineStageFlow.tsx  # Live stage diagram
│   │   ├── LiveLogTerminal.tsx    # SSE-connected log viewer
│   │   ├── AIInsightPanel.tsx     # GPT-4.1 suggestion card
│   │   └── FieldDiff.tsx          # Green/yellow/red field comparison
│   └── charts/
│       ├── ScoreDistribution.tsx   # Histogram of match scores
│       ├── DecisionSplit.tsx       # Donut: auto/review/separate
│       ├── PipelineHealth.tsx      # Funnel chart (records through stages)
│       └── QualityRadar.tsx        # Radar chart: data quality dimensions
├── pages/
│   ├── CommandCenter.tsx      # Dashboard
│   ├── PipelineOrchestration.tsx
│   ├── RawVaultExplorer.tsx
│   ├── CanonicalExplorer.tsx
│   ├── IdentityGraph.tsx
│   ├── ReviewWorkbench.tsx    # Human review (replaces ReviewQueue)
│   ├── MasterRecords.tsx
│   ├── DataLineage.tsx
│   └── Settings.tsx
├── hooks/
│   ├── useSSE.ts              # Server-Sent Events hook
│   ├── usePipeline.ts         # Pipeline state
│   ├── useReviewQueue.ts      # Review queue state
│   └── useAISuggestion.ts     # GPT-4.1 suggestion fetcher
├── store/
│   └── pipelineStore.ts       # Zustand store for pipeline state
├── types/
│   └── api.ts                 # All TypeScript interfaces
└── lib/
    └── utils.ts
TypeScript Interfaces (types/api.ts)
export interface SummaryStats {
  source_records: number;
  vault_records: number;
  canonical_records: number;
  identity_matches: number;
  review_pending: number;
  master_records: number;
  auto_merged: number;
  manual_review: number;
  decided_separate: number;
  pipeline_health: 'healthy' | 'degraded' | 'error';
}

export interface VaultRecord {
  vault_id: number;
  cust_id: string;
  source_system: string;
  ingested_at: string;
  raw_payload: Record<string, unknown>;
  kafka_offset: number;
  kafka_partition: number;
}

export interface CanonicalRecord {
  canonical_id: number;
  cust_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  email_valid: boolean;
  phone: string;
  phone_valid: boolean;
  birth_date: string;
  address: string;
  city: string;
  state: string;
  completeness_score: number;  // 0-100
  normalized_at: string;
}

export interface MatchRecord {
  match_id: number;
  record1_id: number;
  record2_id: number;
  record1: CanonicalRecord;
  record2: CanonicalRecord;
  signals: {
    email_score: number;
    phone_score: number;
    name_score: number;
    dob_score: number;
    address_score: number;
  };
  composite_score: number;     // 0-100
  ai_confidence: number;       // 0-100
  ai_reasoning: string;
  decision: 'auto_merged' | 'manual_review' | 'decided_separate' | 'pending';
}

export interface ReviewItem extends MatchRecord {
  queue_id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  ai_suggestion: AISuggestion | null;
}

export interface AISuggestion {
  suggestion: 'approve' | 'reject' | 'uncertain';
  confidence: number;
  reasoning: string;
  key_signals: string[];
  risk_flags: string[];
  alternative_explanation: string;
}

export interface MasterRecord {
  master_id: string;           // MR-00000001
  full_name: string;
  email_primary: string;
  emails_all: string[];
  phone: string;
  birth_date: string;
  address: string;
  city: string;
  state: string;
  source_ids: string[];
  source_systems: string[];
  confidence_score: number;
  record_count: number;        // number of source records merged
  created_at: string;
  updated_at: string;
}

export interface PipelineEvent {
  type: 'stage_start' | 'stage_complete' | 'log' | 'error' | 'heartbeat';
  message: string;
  data: Record<string, unknown>;
  ts: string;
}

export interface PipelineRunResult {
  run_id: string;
  status: 'completed' | 'failed' | 'partial';
  stats: SummaryStats;
  duration_ms: number;
  stages: StageResult[];
}

export interface StageResult {
  stage: string;
  records_in: number;
  records_out: number;
  duration_ms: number;
  status: 'completed' | 'failed' | 'skipped';
}
📄 Page-by-Page Implementation
1. Command Center (/) — The Dashboard
Purpose: Executive overview. What is the health of our customer data right now?
Sections to build:
┌─────────────────────────────────────────────────────┐
│  HEADER: "Customer Master Data — Live Intelligence"  │
│  Subtitle: Last pipeline run: 2m ago | 1,200 events  │
├─────────────────────────────────────────────────────┤
│  KPI ROW (6 cards):                                  │
│  [Source Records] [Vault Records] [Canonical]        │
│  [Identity Matches] [Pending Review] [Master Records]│
├─────────────────────────────────────────────────────┤
│  PIPELINE FUNNEL (left, 60%)  │  DECISION SPLIT      │
│  Animated funnel showing      │  Donut chart:        │
│  record counts per stage      │  Auto/Review/Sep     │
├─────────────────────────────────────────────────────┤
│  MATCH SCORE DISTRIBUTION     │  DATA QUALITY RADAR  │
│  Histogram 0-100              │  5-dimension spider  │
├─────────────────────────────────────────────────────┤
│  RECENT ACTIVITY FEED         │  AI HEALTH SUMMARY   │
│  Real events from DB          │  GPT-4.1 paragraph   │
└─────────────────────────────────────────────────────┘
Data sources:
/summary → all KPI cards
/identity/stats → score distribution histogram
/canonical/stats → quality radar
/ai/data-quality-report → AI health summary (cache 5min)
Auto-refresh: Every 30 seconds, show "Updated X seconds ago" indicator
AI Health Summary: On page load, call /ai/data-quality-report. Render GPT response in a panel titled "AI Data Intelligence" with a purple ✦ AI badge. Show skeleton loader while fetching.
2. Pipeline Orchestration (/pipeline)
Purpose: Operators run and monitor the data pipeline end-to-end.
Sections to build:
┌─────────────────────────────────────────────────────┐
│  CONTROLS PANEL                                      │
│  [✓] Reset All Layers  [Record Limit: ____]          │
│  [✓] Skip Kafka (use existing vault)                 │
│  [Run Stages: ●●●●●●] (toggle individual stages)    │
│  [  RUN PIPELINE  ] [  REBUILD MASTER  ]             │
├─────────────────────────────────────────────────────┤
│  PIPELINE STAGE DIAGRAM (live, animated)             │
│  Source → Raw Vault → Canonical → Identity Graph     │
│         → Decision Engine → Master Records           │
│  Each node shows: stage name, record count, status   │
│  Animated flow arrows while running                  │
├─────────────────────────────────────────────────────┤
│  LIVE LOG TERMINAL (SSE-connected)                   │
│  [timestamp] [LEVEL] message                         │
│  Real log lines from backend SSE stream              │
│  Color-coded: green=info, amber=warn, red=error      │
├─────────────────────────────────────────────────────┤
│  RUN STATS (shown after completion)                  │
│  Records per stage, duration, throughput/sec         │
└─────────────────────────────────────────────────────┘
Implementation notes:
// useSSE.ts hook
export function useSSE(url: string, onEvent: (e: PipelineEvent) => void) {
  useEffect(() => {
    const source = new EventSource(url);
    source.onmessage = (e) => onEvent(JSON.parse(e.data));
    source.onerror = () => source.close();
    return () => source.close();
  }, [url]);
}

// In PipelineOrchestration.tsx:
const [logs, setLogs] = useState<LogLine[]>([]);
const [stageStatus, setStageStatus] = useState<Record<string, StageState>>({});

useSSE('/events', (event) => {
  if (event.type === 'log') {
    setLogs(prev => [...prev.slice(-200), { ...event, id: Date.now() }]);
  }
  if (event.type === 'stage_complete') {
    setStageStatus(prev => ({ ...prev, [event.data.stage]: 'complete' }));
  }
});
Stage diagram states: idle | running | complete | error
Idle: gray border, dim icon
Running: pulsing cyan border, spinning icon
Complete: green border, checkmark
Error: red border, X icon
3. Raw Vault Explorer (/raw-vault)
Purpose: Full audit trail of every Kafka event ever ingested. Immutable.
Sections:
┌─────────────────────────────────────────────────────┐
│  HEADER: "Raw Vault — Immutable Event Store"         │
│  Stats: 1,200 events | 1 source system | Since: ...  │
├─────────────────────────────────────────────────────┤
│  SEARCH & FILTERS                                    │
│  [Search by ID, source...] [Source System ▼]         │
├─────────────────────────────────────────────────────┤
│  TABLE: vault_id | cust_id | source_system |          │
│         kafka_offset | ingested_at | [View Raw →]    │
│  1,200 rows, paginated 100/page                      │
├─────────────────────────────────────────────────────┤
│  SIDE PANEL (on row click):                          │
│  Full raw JSON payload, pretty-printed               │
│  Kafka metadata: topic, partition, offset            │
│  Link: "View in Canonical Layer →"                   │
└─────────────────────────────────────────────────────┘
Key constraint to implement: Table must have a small pill badge "IMMUTABLE" in the header to communicate to clients that this data cannot be deleted or modified.
4. Canonical Explorer (/canonical)
Purpose: See the cleaned, normalized version of every record. Show data quality.
Sections:
┌─────────────────────────────────────────────────────┐
│  HEADER: "Canonical Layer — Normalized & Validated"  │
│  Stats bar: Avg completeness 84% | 97% valid emails  │
├─────────────────────────────────────────────────────┤
│  QUALITY ISSUES BANNER (if issues exist)             │
│  ⚠ 23 records with completeness < 50%               │
│  ⚠ 8 records with invalid email format              │
│  [View Issues] button → filters table               │
├─────────────────────────────────────────────────────┤
│  SEARCH & FILTERS                                    │
│  [Search] [Min Completeness: slider] [Valid Only ✓]  │
├─────────────────────────────────────────────────────┤
│  TABLE: canonical_id | full_name | email ✓/✗ |       │
│  phone ✓/✗ | city, state | completeness bar | [→]   │
├─────────────────────────────────────────────────────┤
│  SIDE PANEL:                                         │
│  All fields with normalization notes                 │
│  e.g. "Phone: +14567891234 (normalized from raw)"   │
│  Link: "View in Identity Graph →"                   │
└─────────────────────────────────────────────────────┘
Completeness bar color: Red <50%, Amber 50-80%, Green >80%
5. Identity Graph (/identity-graph)
Purpose: Show all detected duplicate pairs, their scores, and decisions.
Sections:
┌─────────────────────────────────────────────────────┐
│  HEADER: "Identity Graph — Probabilistic Match Engine"│
│  Stats: 524 pairs | Avg confidence 78% | ...        │
├─────────────────────────────────────────────────────┤
│  FILTER TABS:                                        │
│  [All 524] [Auto-Merged 291] [In Review 182]         │
│  [Confirmed Separate 51]                             │
├─────────────────────────────────────────────────────┤
│  VIEW TOGGLE: [Card Grid] [Table View]               │
├─────────────────────────────────────────────────────┤
│  CARD GRID / TABLE                                   │
│  Each Match Card shows:                              │
│  - Match ID and status badge                         │
│  - Record A vs Record B (side-by-side key fields)   │
│  - Signal breakdown bars (email/phone/name/dob/city) │
│  - Composite score + AI confidence                   │
│  - Decision badge                                    │
│  - [View Detail →] button                           │
├─────────────────────────────────────────────────────┤
│  SIDE PANEL (on card click):                         │
│  Full field-by-field comparison with color coding    │
│  AI reasoning text                                   │
│  Signal scores with explanations                     │
└─────────────────────────────────────────────────────┘
MatchCard color coding:
Auto-merged: green left border
In review: amber left border
Separate: gray left border
SignalBreakdown component:
// Shows each signal as a labeled bar
// email_score: [████████░░] 80%
// phone_score: [██████████] 100%
// name_score:  [███████░░░] 70%
// dob_score:   [██████████] 100%
// city_score:  [█████░░░░░] 50%
6. Review Workbench (/review) — Most Critical Page
Purpose: Human reviewers make final calls on ambiguous matches. Must be fast, keyboard-driven, and explainable.
Layout:
┌─────────────────────────────────────────────────────┐
│  HEADER: "Review Workbench"                          │
│  Progress: 12 of 182 reviewed today (7%)            │
│  Keyboard: [A] Approve  [R] Reject  [S] Skip        │
├──────────────────┬──────────────────────────────────┤
│                  │                                   │
│   RECORD A       │   RECORD B                        │
│   ──────────     │   ──────────                      │
│   Name: Jon S.   │   Name: John Smith   ← DIFF       │
│   Email: (same)  │   Email: (same)      ← MATCH      │
│   Phone: (same)  │   Phone: (same)      ← MATCH      │
│   DOB: (same)    │   DOB: (same)        ← MATCH      │
│   City: NY       │   City: New York     ← SIMILAR    │
│                  │                                   │
├──────────────────┴──────────────────────────────────┤
│  SIGNAL BREAKDOWN                                    │
│  email ████████ 100%   phone ████████ 100%           │
│  name  ██████░░  75%   dob   ████████ 100%           │
│  city  ███████░  90%                                 │
│  COMPOSITE: ████████░░ 83% | AI CONFIDENCE: 87%      │
├─────────────────────────────────────────────────────┤
│  ✦ AI RECOMMENDATION                                 │
│  [purple panel]                                      │
│  "Recommend: APPROVE (87% confidence)"               │
│  "Phone and email match exactly. Name variation      │
│   likely a typo or nickname (Jon vs John).           │
│   Date of birth confirms same person."               │
│  Key signals: [phone match] [email match] [dob match]│
│  Risk flags: [none]                                  │
├─────────────────────────────────────────────────────┤
│  [✗ REJECT]              [✓ APPROVE]                 │
│  (red, left)             (green, right)              │
├─────────────────────────────────────────────────────┤
│  QUEUE PREVIEW (next 5 items as mini cards below)   │
└─────────────────────────────────────────────────────┘
Implementation requirements:
AI Suggestion auto-loads when review item is displayed. Call /ai/analyze-match/{match_id} on mount. Show skeleton while loading.
FieldDiff component: Each field row shows:
🟢 Green background = exact match
🟡 Amber underline = fuzzy match (similarity > 60%)
🔴 Red bold = different values
Gray = both null/missing
Keyboard shortcuts:
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'a' || e.key === 'ArrowRight') handleDecide('approve');
    if (e.key === 'r' || e.key === 'ArrowLeft') handleDecide('reject');
    if (e.key === 's') handleSkip();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [current]);
Optimistic UI: Remove from queue immediately, POST in background, revert on error.
Queue counter: Show "X remaining" prominently. Celebrate with confetti or animation when queue hits 0.
7. Master Records (/master-records)
Purpose: Browse the final, unified customer master data.
Sections:
┌─────────────────────────────────────────────────────┐
│  HEADER: "Master Records — Unified Customer Truth"   │
│  944 master records | 256 merged groups             │
├─────────────────────────────────────────────────────┤
│  SEARCH & FILTER                                     │
│  [Search name, email, phone, ID]                    │
│  [Show Merged Only] [Min Confidence ▼] [State ▼]   │
├─────────────────────────────────────────────────────┤
│  TABLE:                                              │
│  master_id | name | email | phone | city | sources   │
│  confidence | merged_count badge | [→]              │
│  "Merged: 3" badge in amber for multi-source records│
├─────────────────────────────────────────────────────┤
│  SIDE PANEL:                                         │
│  Master Record detail                                │
│  All emails list, all source IDs                     │
│  "Merged from:" section showing original records     │
│  Confidence score with breakdown                     │
│  [Export Record] button                             │
│  Lineage: Source → Vault → Canonical → Master        │
└─────────────────────────────────────────────────────┘
Export: CSV button at top of page calls /master/export?format=csv
8. Data Lineage (/lineage) — NOT A STUB
Purpose: Show the full audit trail of how any record traveled through all stages.
Implementation:
Search: [Customer ID or Name or Email]
                    ↓
┌─────────────────────────────────────────────────────┐
│  LINEAGE TRACE: Jon Smyth / C00000022               │
│                                                     │
│  SOURCE          RAW VAULT       CANONICAL           │
│  ──────          ─────────       ─────────           │
│  C00000022  →→→  VLT-001234  →→→  CAN-000456        │
│  [view raw]      [view event]    [view record]      │
│                                                     │
│  IDENTITY GRAPH        MASTER RECORD                │
│  ─────────────         ─────────────                │
│  Match #525       →→→  MR-00000088                  │
│  with C00000045        [view master]                │
│  [view match]                                       │
│                                                     │
│  TIMELINE of all events with timestamps             │
└─────────────────────────────────────────────────────┘
Backend endpoint needed:
GET /lineage/{cust_id}
Response: {
  source: SourceRecord,
  vault: VaultRecord,
  canonical: CanonicalRecord,
  matches: [MatchRecord],
  master: MasterRecord | null,
  timeline: [{ stage, event, ts }]
}
🤖 AI Integration — Full Implementation
Where AI Appears
Command Center: AI Data Quality summary paragraph
Review Workbench: Per-match suggestion with reasoning (auto-loads)
Identity Graph: "Get AI Opinion" button on each card
Master Records: "Explain this merge" button per record
Every page: AI Assistant floating panel (bottom-right ?)
AI Assistant Panel (global component)
// components/ui/AIAssistantPanel.tsx
// Floating button (bottom-right) that opens a slide-up chat panel
// Sends message to /ai/chat with current page context

const context_map = {
  '/': 'pipeline overview and data quality',
  '/review': 'human review of duplicate records',
  '/identity-graph': 'identity matching and deduplication',
  '/master-records': 'master data management',
};

// Example user questions it can answer:
// "Why was Jon Smyth merged with John Smith?"
// "What's the quality of our customer emails?"
// "How many records still need review?"
// "What does the name similarity score mean?"
Azure OpenAI Client (backend/utils/azure_openai.py)
import httpx
from config import settings

async def call_gpt4(system_prompt: str, user_message: str) -> str:
    """Call Azure OpenAI GPT-4.1"""
    url = f"{settings.AZURE_OPENAI_ENDPOINT}/openai/deployments/{settings.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={settings.AZURE_OPENAI_API_VERSION}"
    
    headers = {
        "api-key": settings.AZURE_OPENAI_API_KEY,
        "Content-Type": "application/json"
    }
    
    body = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "max_tokens": 1000,
        "temperature": 0.2  # Low temp for deterministic MDM decisions
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
🔧 Sidebar Navigation
DataFusion ⬡                    ← logo + brand
─────────────────
⬡ Command Center               ← /
─────────────────
PIPELINE
  ⬡ Orchestration               ← /pipeline
─────────────────  
DATA LAYERS
  ⬡ Raw Vault                   ← /raw-vault   [1,200]
  ⬡ Canonical Layer             ← /canonical   [1,200]
  ⬡ Identity Graph              ← /identity-graph [524]
  ⬡ Master Records              ← /master-records [944]
─────────────────
OPERATIONS
  ⬡ Review Workbench            ← /review      [182 🔴]
  ⬡ Data Lineage                ← /lineage
─────────────────
⬡ Settings                     ← /settings
─────────────────
● API Connected                 ← health dot
Record counts in sidebar update every 30 seconds. Review count shows red badge when > 0.
⚠️ Critical Implementation Rules
1. No Mock Data in Production Code
Every page must fetch from real API endpoints. No hardcoded arrays. If data is missing, show an empty state with a helpful message.
2. Proper Error Boundaries
Each page wraps in ErrorBoundary. API failures show a toast, not a crash.
3. Loading States Everywhere
Every data fetch must show a skeleton loader, not a blank page. Use a <Skeleton> component with shimmer animation.
4. Kafka Must Actually Work
kafka_producer.py and kafka_consumer.py must use real confluent-kafka library, not simulated. If Kafka is down, the pipeline stage must fail gracefully with a clear error message.
5. SSE for Pipeline Logs
The terminal log on the Pipeline page MUST connect to /events via EventSource. No setTimeout mock logs.
6. AI Calls are Async and Non-Blocking
AI suggestions on the Review Workbench must not block the display of the match. Show the comparison first, stream in the AI suggestion as it loads.
7. All Numbers are Real
Every KPI card, every badge count, every percentage — pulled from the database. No hardcoded "944" or "182".
8. Pagination Required
No page should load more than 100 records at a time. Every table needs limit/offset pagination.
9. The Review Workbench Must Be Fast
Target: reviewer can process 30 matches in 5 minutes. Keyboard shortcuts mandatory. Next item must pre-fetch before current is decided.
10. Export Works
Master Records export to CSV must actually download a file, not just log to console.
🚀 Startup & Dev Commands
# Backend
cd backend
pip install fastapi uvicorn confluent-kafka httpx pydantic-settings aiosqlite

# Create .env
cat > .env << EOF
DB_PATH=datafusion.db
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC_RAW=customer_raw_events
KAFKA_CONSUMER_GROUP=datafusion_vault
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_API_VERSION=2024-02-01
MOCK_RECORD_COUNT=1200
AUTO_MERGE_THRESHOLD=90.0
MANUAL_REVIEW_THRESHOLD=70.0
EOF

uvicorn main:app --reload --port 8000

# Kafka (Docker)
docker run -d --name kafka \
  -p 9092:9092 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  confluentinc/cp-kafka:latest

# Frontend
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
npm run dev
📋 Implementation Order (for Claude Code)
Build in this exact order to avoid dependency issues:
config.py — settings and env vars
database.py — connection + CREATE TABLE statements
models/schemas.py — all Pydantic models
pipeline/kafka_producer.py + kafka_consumer.py
pipeline/canonical_transformer.py
pipeline/identity_engine.py — matching + scoring
pipeline/decision_engine.py
pipeline/master_merger.py
pipeline/orchestrator.py — wires all stages
utils/azure_openai.py — GPT-4.1 client
routers/events.py — SSE stream
All routers (pipeline, vault, canonical, identity, review, master, ai)
main.py — register all routers
Frontend: types/api.ts — all TS interfaces
Frontend: api/*.ts — all API client functions
Frontend: hooks/useSSE.ts + other hooks
Frontend: components/ui/* — all shared components
Frontend: components/charts/* — chart components
Frontend: Pages in order: CommandCenter → Pipeline → RawVault → Canonical → IdentityGraph → ReviewWorkbench → MasterRecords → DataLineage
Frontend: components/layout/Shell.tsx + Sidebar
🎯 Enterprise Presentation Checklist
Before showing to a client, verify:
[ ] All 6 database tables populated after a single pipeline run
[ ] KPI cards show real counts from DB
[ ] Pipeline stage diagram animates correctly during a run
[ ] SSE terminal shows real log lines during pipeline execution
[ ] AI suggestion appears on Review Workbench within 3 seconds
[ ] Keyboard shortcuts (A/R) work on Review Workbench
[ ] Export CSV downloads a real file with correct data
[ ] Master records show correct "merged from N sources" count
[ ] Lineage page traces any record from source to master
[ ] All tables paginate correctly (no infinite scroll bugs)
[ ] Empty states are handled gracefully (no blank pages)
[ ] Health dot in sidebar shows green when API is reachable
[ ] Mobile responsive layout (sidebar collapses)
[ ] No console errors in browser dev tools
This document is the source of truth for Claude Code implementation. Every section must be implemented completely — no stubs, no hardcoded data, no TODO comments left in production code.