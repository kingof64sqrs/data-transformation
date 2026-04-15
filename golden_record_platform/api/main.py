"""FastAPI backend — DataFusion Intelligence Platform."""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta
from typing import Any, AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Path setup
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from db_utils import get_db
from golden_record_platform.pipeline.orchestrator import run_pipeline
from golden_record_platform.utils.azure_openai import call_gpt4_json, call_gpt4, is_ai_configured
from golden_record_platform.utils.ai_prompts import (
    MATCH_ANALYSIS_SYSTEM_PROMPT,
    MATCH_ANALYSIS_USER_TEMPLATE,
    DATA_QUALITY_SYSTEM_PROMPT,
    EXPLAIN_MERGE_SYSTEM_PROMPT,
    CHAT_SYSTEM_PROMPT,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# SSE Event Queue
# ============================================================================

_event_queue: asyncio.Queue = asyncio.Queue()
_pipeline_running = False
_pipeline_stage = ""
_last_run_at: str | None = None
_pipeline_history: list[dict] = []


async def emit_event(event_type: str, message: str, data: dict | None = None) -> None:
    await _event_queue.put({
        "type": event_type,
        "message": message,
        "data": data or {},
        "ts": datetime.utcnow().isoformat(),
    })


# ============================================================================
# Pydantic Models
# ============================================================================

class PipelineRunRequest(BaseModel):
    reset_layers: bool = True
    produce_limit: Optional[int] = None
    dry_run: bool = False
    skip_kafka: bool = False


class PipelineStageRequest(BaseModel):
    stage: str  # ingest | vault | canonical | identity | decision | master


class ReviewDecisionRequest(BaseModel):
    match_id: int
    decision: str  # "approve" or "reject"
    note: Optional[str] = None


class BulkDecisionItem(BaseModel):
    match_id: int
    decision: str


class BulkDecisionRequest(BaseModel):
    decisions: list[BulkDecisionItem]


class AIChatRequest(BaseModel):
    message: str
    context: str = "pipeline"


class AIAnalyzeRequest(BaseModel):
    match_id: int


# ============================================================================
# Helper functions
# ============================================================================

def _normalized_decision(value: str | None) -> str:
    mapping = {
        "AUTO_MERGE": "auto_merged",
        "APPROVED": "auto_merged",
        "MANUAL_REVIEW": "manual_review",
        "PENDING": "manual_review",
        "SEPARATE": "decided_separate",
        "REJECTED": "decided_separate",
    }
    return mapping.get((value or "").upper(), "manual_review")


def _split_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.strip().split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return " ".join(parts[:-1]), parts[-1]


def _to_list(value: Any) -> list[str]:
    """Normalize list-like DB values (list, JSON string, CSV string) into string arrays."""
    if value is None:
        return []

    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []

        # Try JSON first because SQLite rows often store arrays as JSON strings.
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(v).strip() for v in parsed if str(v).strip()]
            except Exception:
                pass

        # Fallback to comma-separated values.
        return [item.strip().strip('"').strip("'") for item in text.split(",") if item.strip()]

    return [str(value).strip()]


def _as_frontend_record(row: dict) -> dict:
    full_name = row.get("full_name") or " ".join(
        p for p in [row.get("first_name"), row.get("last_name")] if p
    ).strip()
    return {
        "customer_id": row.get("cust_id") or row.get("silver_id"),
        "first_name": row.get("first_name"),
        "last_name": row.get("last_name"),
        "full_name": full_name or None,
        "email": row.get("email"),
        "phone_number": row.get("phone"),
        "date_of_birth": row.get("birth_date"),
        "address_line1": row.get("address") or "",
        "city": row.get("city"),
        "state": row.get("state"),
        "completeness": row.get("completeness"),
    }


def _gold_record(row: dict) -> dict:
    first_name, last_name = _split_name(row.get("name"))
    source_ids_list = _to_list(row.get("source_ids"))
    source_systems_list = _to_list(row.get("source_systems"))
    if not source_systems_list:
        source_systems_list = ["CRM"]

    confidence = row.get("merge_confidence") or row.get("confidence_score") or 0.0
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    record_count = 1
    if source_ids_list:
        record_count = len(source_ids_list)

    return {
        "master_id": row.get("golden_id"),
        "full_name": row.get("name") or "",
        "email_primary": row.get("email_primary") or row.get("email") or "",
        "emails_all": [row.get("email_primary") or row.get("email") or ""],
        "phone": row.get("phone") or "",
        "birth_date": row.get("birth_date") or "",
        "address": row.get("address") or "",
        "city": row.get("city") or "",
        "state": row.get("state") or "",
        "source_ids": source_ids_list,
        "source_systems": source_systems_list,
        "confidence_score": round(confidence, 4),
        "record_count": record_count,
        "created_at": row.get("created_at") or datetime.utcnow().isoformat(),
        "updated_at": row.get("updated_at") or datetime.utcnow().isoformat(),
    }


def _fetch_match_rows(
    limit: int,
    offset: int = 0,
    review_only: bool = False,
    decision_filter: str | None = None,
    min_score: float = 0.0,
) -> tuple[list[dict], int]:
    db = get_db()

    conditions = []
    if review_only:
        conditions.append("rq.status = 'PENDING'")
    if decision_filter:
        decision_map = {
            "auto_merged": ("AUTO_MERGE", "APPROVED"),
            "manual_review": ("MANUAL_REVIEW", "PENDING"),
            "decided_separate": ("SEPARATE", "REJECTED"),
        }
        if decision_filter in decision_map:
            vals = decision_map[decision_filter]
            placeholders = ",".join(f"'{v}'" for v in vals)
            conditions.append(f"dm.decision IN ({placeholders})")
    if min_score > 0:
        conditions.append(f"dm.ai_score >= {min_score}")

    join_clause = ""
    if review_only:
        join_clause = "JOIN review_queue rq ON rq.match_id = dm.match_id"

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_row = db.fetch_one(
        f"""
        SELECT COUNT(*) as total FROM duplicate_matches dm
        JOIN silver_customer s1 ON dm.silver_id_a = s1.silver_id
        JOIN silver_customer s2 ON dm.silver_id_b = s2.silver_id
        {join_clause}
        {where_clause}
        """
    )
    total = count_row["total"] if count_row else 0

    rows = db.fetch_all(
        f"""
        SELECT
            dm.match_id, dm.silver_id_a, dm.silver_id_b, dm.ai_score,
            dm.decision, dm.email_match, dm.phone_match, dm.name_similarity,
            dm.dob_match, dm.city_similarity, dm.ai_reasoning,
            s1.silver_id AS s1_silver_id, s1.cust_id AS s1_cust_id,
            s1.first_name AS s1_first_name, s1.last_name AS s1_last_name,
            s1.full_name AS s1_full_name, s1.email AS s1_email,
            s1.phone AS s1_phone, s1.birth_date AS s1_birth_date,
            s1.address AS s1_address, s1.city AS s1_city, s1.state AS s1_state,
            s2.silver_id AS s2_silver_id, s2.cust_id AS s2_cust_id,
            s2.first_name AS s2_first_name, s2.last_name AS s2_last_name,
            s2.full_name AS s2_full_name, s2.email AS s2_email,
            s2.phone AS s2_phone, s2.birth_date AS s2_birth_date,
            s2.address AS s2_address, s2.city AS s2_city, s2.state AS s2_state
        FROM duplicate_matches dm
        JOIN silver_customer s1 ON dm.silver_id_a = s1.silver_id
        JOIN silver_customer s2 ON dm.silver_id_b = s2.silver_id
        {join_clause}
        {where_clause}
        ORDER BY dm.ai_score DESC, dm.match_id ASC
        LIMIT {limit} OFFSET {offset}
        """
    )

    formatted: list[dict] = []
    for row in rows:
        score = float(row["ai_score"] or 0.0)
        email_s = float(row["email_match"] or 0.0)
        phone_s = float(row["phone_match"] or 0.0)
        name_s = float(row["name_similarity"] or 0.0)
        dob_s = float(row["dob_match"] or 0.0)
        city_s = float(row["city_similarity"] or 0.0)

        r1 = _as_frontend_record({
            "silver_id": row["s1_silver_id"], "cust_id": row["s1_cust_id"],
            "first_name": row["s1_first_name"], "last_name": row["s1_last_name"],
            "full_name": row["s1_full_name"], "email": row["s1_email"],
            "phone": row["s1_phone"], "birth_date": row["s1_birth_date"],
            "address": row["s1_address"], "city": row["s1_city"], "state": row["s1_state"],
        })
        r2 = _as_frontend_record({
            "silver_id": row["s2_silver_id"], "cust_id": row["s2_cust_id"],
            "first_name": row["s2_first_name"], "last_name": row["s2_last_name"],
            "full_name": row["s2_full_name"], "email": row["s2_email"],
            "phone": row["s2_phone"], "birth_date": row["s2_birth_date"],
            "address": row["s2_address"], "city": row["s2_city"], "state": row["s2_state"],
        })

        formatted.append({
            "match_id": row["match_id"],
            "record1_id": row["silver_id_a"],
            "record2_id": row["silver_id_b"],
            "composite_score": round(score, 2),
            "ai_confidence": round(score, 2),
            "ai_reasoning": row["ai_reasoning"] or "",
            "decision": _normalized_decision(row["decision"]),
            "record1": r1,
            "record2": r2,
            "signals": {
                "email_score": round(email_s, 4),
                "phone_score": round(phone_s, 4),
                "name_score": round(name_s, 4),
                "dob_score": round(dob_s, 4),
                "address_score": round(city_s, 4),
            },
        })

    return formatted, total


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="DataFusion Intelligence Platform API",
    description="Enterprise Master Data Management with AI-powered deduplication",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health & Summary
# ============================================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "datafusion-api",
        "ai_configured": is_ai_configured(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/summary")
async def get_summary():
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT
                COALESCE((SELECT COUNT(*) FROM db2_customer_simulated), 0) AS source_records,
                COALESCE((SELECT COUNT(DISTINCT cust_id) FROM bronze_customer), 0) AS vault_records,
                COALESCE((SELECT COUNT(DISTINCT cust_id) FROM silver_customer), 0) AS canonical_records,
                COALESCE((SELECT COUNT(*) FROM bronze_customer), 0) AS vault_event_records,
                COALESCE((SELECT COUNT(*) FROM silver_customer), 0) AS canonical_event_records,
                COALESCE((SELECT COUNT(*) FROM duplicate_matches), 0) AS identity_matches,
                COALESCE((SELECT COUNT(*) FROM review_queue WHERE status='PENDING'), 0) AS review_pending,
                COALESCE((SELECT COUNT(*) FROM gold_customer), 0) AS master_records,
                COALESCE((SELECT COUNT(*) FROM duplicate_matches WHERE decision IN ('AUTO_MERGE','APPROVED')), 0) AS auto_merged,
                COALESCE((SELECT COUNT(*) FROM review_queue WHERE status='PENDING'), 0) AS manual_review,
                COALESCE((SELECT COUNT(*) FROM duplicate_matches WHERE decision IN ('SEPARATE','REJECTED')), 0) AS decided_separate
            """
        )
        data = dict(row)
        vault = data.get("vault_records", 0)
        canonical = data.get("canonical_records", 0)
        identity = data.get("identity_matches", 0)
        health = "healthy"
        if vault == 0 or canonical == 0:
            health = "degraded"
        if identity == 0 and canonical > 0:
            health = "degraded"
        data["pipeline_health"] = health
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SSE Events Stream
# ============================================================================

async def _event_generator() -> AsyncGenerator[str, None]:
    while True:
        try:
            event = await asyncio.wait_for(_event_queue.get(), timeout=15.0)
            yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'heartbeat', 'ts': datetime.utcnow().isoformat()})}\n\n"


@app.get("/events")
async def stream_events():
    return StreamingResponse(_event_generator(), media_type="text/event-stream")


# ============================================================================
# Pipeline Endpoints
# ============================================================================

@app.get("/pipeline/status")
async def pipeline_status():
    return {
        "is_running": _pipeline_running,
        "current_stage": _pipeline_stage,
        "last_run_at": _last_run_at,
        "progress_pct": 100 if not _pipeline_running else 50,
    }


@app.get("/pipeline/history")
async def pipeline_history():
    return {"history": list(reversed(_pipeline_history[-20:]))}


@app.post("/pipeline/run")
async def run_pipeline_endpoint(request: PipelineRunRequest):
    global _pipeline_running, _pipeline_stage, _last_run_at
    if _pipeline_running:
        raise HTTPException(status_code=409, detail="Pipeline already running")

    run_id = str(uuid.uuid4())[:8].upper()
    started_at = datetime.utcnow().isoformat()
    _pipeline_running = True

    stages_order = ["ingest", "vault", "canonical", "identity", "decision", "master"]
    stage_results = []

    try:
        for stage in stages_order:
            _pipeline_stage = stage
            await emit_event("stage_start", f"Starting stage: {stage}", {"stage": stage})

            t0 = datetime.utcnow()
            await asyncio.sleep(0)  # yield to event loop

        result = run_pipeline(
            reset_layers=request.reset_layers,
            produce_limit=request.produce_limit,
        )

        for stage in stages_order:
            stage_results.append({
                "stage": stage,
                "records_in": result.get(f"{stage}_records", 0),
                "records_out": result.get(f"{stage}_records", 0),
                "duration_ms": 100,
                "status": "completed",
            })
            await emit_event("stage_complete", f"Stage complete: {stage}", {"stage": stage})

        _last_run_at = datetime.utcnow().isoformat()
        completed_at = _last_run_at

        stats = {
            "source_records": result.get("db2_records", 0),
            "vault_records": result.get("bronze_records", 0),
            "canonical_records": result.get("silver_records", 0),
            "identity_matches": result.get("match_count", result.get("duplicate_matches", 0)),
            "review_pending": result.get("manual_review", 0),
            "master_records": result.get("golden_records", 0),
            "auto_merged": result.get("auto_merge", 0),
            "manual_review": result.get("manual_review", 0),
            "decided_separate": result.get("separate", 0),
            "pipeline_health": "healthy",
        }

        run_record = {
            "run_id": run_id,
            "started_at": started_at,
            "completed_at": completed_at,
            "stats": stats,
            "status": "completed",
            "duration_ms": 5000,
        }
        _pipeline_history.append(run_record)

        await emit_event("pipeline_complete", "Pipeline run completed successfully", stats)

        return {"run_id": run_id, "status": "completed", "stats": stats, "stages": stage_results, "duration_ms": 5000}

    except Exception as e:
        await emit_event("error", f"Pipeline failed: {str(e)}", {"error": str(e)})
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")
    finally:
        _pipeline_running = False
        _pipeline_stage = ""


@app.post("/pipeline/run-stage")
async def run_single_stage(request: PipelineStageRequest):
    valid_stages = {"ingest", "vault", "canonical", "identity", "decision", "master"}
    if request.stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Valid: {valid_stages}")

    await emit_event("stage_start", f"Running stage: {request.stage}", {"stage": request.stage})

    try:
        result = run_pipeline(reset_layers=False, produce_limit=None)
        await emit_event("stage_complete", f"Stage {request.stage} done", {"stage": request.stage})
        return {
            "stage": request.stage,
            "records_processed": result.get("silver_records", 0),
            "duration_ms": 1500,
            "status": "completed",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/rebuild-master")
async def rebuild_master():
    try:
        from golden_record_platform.pipeline.merger import rebuild_golden
        count = rebuild_golden()
        return {"status": "success", "master_records_created": count, "merged_groups": count}
    except ImportError:
        try:
            from golden_merger import rebuild_golden_records
            count = rebuild_golden_records()
            return {"status": "success", "master_records_created": count, "merged_groups": count}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Raw Vault (Bronze) Endpoints
# ============================================================================

@app.get("/vault/records")
async def vault_records(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = Query(""),
):
    try:
        db = get_db()
        where = ""
        params: list[Any] = []
        if search:
            where = "WHERE b.cust_id LIKE ? OR b.source_system LIKE ?"
            params = [f"%{search}%", f"%{search}%"]

        total_row = db.fetch_one(
            f"SELECT COUNT(*) as total FROM bronze_customer b {where}", params
        )
        total = total_row["total"] if total_row else 0

        rows = db.fetch_all(
            f"""
            SELECT b.*, d.email_addr, d.phone_num, d.first_nm, d.last_nm,
                   d.birth_dt, d.addr_city, d.addr_state
            FROM bronze_customer b
            LEFT JOIN db2_customer_simulated d ON b.cust_id = d.cust_id
            {where}
            ORDER BY b.ingested_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )

        records = []
        for r in rows:
            payload = {}
            try:
                payload = json.loads(r.get("raw_payload") or "{}")
            except Exception:
                pass
            records.append({
                "vault_id": r.get("bronze_id"),
                "cust_id": r.get("cust_id"),
                "source_system": r.get("source_system") or "CRM",
                "ingested_at": r.get("ingested_at") or "",
                "kafka_offset": r.get("kafka_offset") or 0,
                "kafka_partition": r.get("kafka_partition") or 0,
                "raw_payload": payload or {
                    "first_name": r.get("first_nm"),
                    "last_name": r.get("last_nm"),
                    "email": r.get("email_addr"),
                    "phone": r.get("phone_num"),
                    "birth_date": r.get("birth_dt"),
                    "city": r.get("addr_city"),
                    "state": r.get("addr_state"),
                },
            })
        return {"records": records, "count": len(records), "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/vault/records/{vault_id}")
async def vault_record_detail(vault_id: int):
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT b.*, d.email_addr, d.phone_num, d.first_nm, d.last_nm,
                   d.birth_dt, d.addr_city, d.addr_state
            FROM bronze_customer b
            LEFT JOIN db2_customer_simulated d ON b.cust_id = d.cust_id
            WHERE b.bronze_id = ?
            """,
            [vault_id],
        )
        if not row:
            raise HTTPException(status_code=404, detail="Vault record not found")
        payload = {}
        try:
            payload = json.loads(row.get("raw_payload") or "{}")
        except Exception:
            pass
        return {
            "vault_id": row.get("bronze_id"),
            "cust_id": row.get("cust_id"),
            "source_system": row.get("source_system") or "CRM",
            "ingested_at": row.get("ingested_at") or "",
            "kafka_offset": row.get("kafka_offset") or 0,
            "kafka_partition": row.get("kafka_partition") or 0,
            "raw_payload": payload or {
                "first_name": row.get("first_nm"),
                "last_name": row.get("last_nm"),
                "email": row.get("email_addr"),
                "phone": row.get("phone_num"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/vault/stats")
async def vault_stats():
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT
                COUNT(*) as total,
                COUNT(DISTINCT source_system) as source_systems,
                MIN(ingested_at) as first_ingested,
                MAX(ingested_at) as last_ingested
            FROM bronze_customer
            """
        )
        return {
            "total": row["total"] if row else 0,
            "source_systems": row["source_systems"] if row else 0,
            "first_ingested": row["first_ingested"] if row else None,
            "last_ingested": row["last_ingested"] if row else None,
            "ingestion_rate_per_hour": 0,
            "by_source_system": [{"source_system": "CRM", "count": row["total"] if row else 0}],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Canonical Layer (Silver) Endpoints
# ============================================================================

@app.get("/canonical/records")
async def canonical_records(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = Query(""),
    min_completeness: float = Query(0.0, ge=0.0, le=100.0),
):
    try:
        db = get_db()
        conditions = []
        params: list[Any] = []
        if search:
            conditions.append("(full_name LIKE ? OR email LIKE ? OR cust_id LIKE ?)")
            params += [f"%{search}%", f"%{search}%", f"%{search}%"]
        if min_completeness > 0:
            conditions.append(f"completeness >= {min_completeness}")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        total_row = db.fetch_one(
            f"SELECT COUNT(*) as total FROM silver_customer {where}", params
        )
        total = total_row["total"] if total_row else 0

        rows = db.fetch_all(
            f"""
            SELECT * FROM silver_customer {where}
            ORDER BY completeness DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )

        records = []
        for r in rows:
            comp = float(r.get("completeness") or 0.0)
            records.append({
                "canonical_id": r.get("silver_id"),
                "cust_id": r.get("cust_id"),
                "first_name": r.get("first_name"),
                "last_name": r.get("last_name"),
                "full_name": r.get("full_name") or "",
                "email": r.get("email") or "",
                "email_valid": bool(r.get("email") and "@" in str(r.get("email", ""))),
                "phone": r.get("phone") or "",
                "phone_valid": bool(r.get("phone") and len(str(r.get("phone", ""))) >= 10),
                "birth_date": r.get("birth_date") or "",
                "address": r.get("address") or "",
                "city": r.get("city") or "",
                "state": r.get("state") or "",
                "completeness_score": round(comp * 100 if comp <= 1.0 else comp, 1),
                "normalized_at": r.get("created_at") or datetime.utcnow().isoformat(),
            })
        return {"records": records, "count": len(records), "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/canonical/records/{canonical_id}")
async def canonical_record_detail(canonical_id: int):
    try:
        db = get_db()
        row = db.fetch_one("SELECT * FROM silver_customer WHERE silver_id = ?", [canonical_id])
        if not row:
            raise HTTPException(status_code=404, detail="Canonical record not found")
        comp = float(row.get("completeness") or 0.0)
        return {
            "canonical_id": row.get("silver_id"),
            "cust_id": row.get("cust_id"),
            "first_name": row.get("first_name"),
            "last_name": row.get("last_name"),
            "full_name": row.get("full_name") or "",
            "email": row.get("email") or "",
            "email_valid": bool(row.get("email") and "@" in str(row.get("email", ""))),
            "phone": row.get("phone") or "",
            "phone_valid": bool(row.get("phone") and len(str(row.get("phone", ""))) >= 10),
            "birth_date": row.get("birth_date") or "",
            "address": row.get("address") or "",
            "city": row.get("city") or "",
            "state": row.get("state") or "",
            "completeness_score": round(comp * 100 if comp <= 1.0 else comp, 1),
            "normalized_at": row.get("created_at") or datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/canonical/stats")
async def canonical_stats():
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT
                COUNT(*) as total,
                AVG(CASE WHEN completeness <= 1.0 THEN completeness * 100 ELSE completeness END) as avg_completeness,
                SUM(CASE WHEN email IS NOT NULL AND email LIKE '%@%' THEN 1 ELSE 0 END) as valid_emails,
                SUM(CASE WHEN phone IS NOT NULL AND length(phone) >= 10 THEN 1 ELSE 0 END) as valid_phones
            FROM silver_customer
            """
        )
        total = row["total"] if row else 0
        valid_emails = row["valid_emails"] if row else 0
        valid_phones = row["valid_phones"] if row else 0
        avg_comp = float(row["avg_completeness"] or 0)
        return {
            "total": total,
            "avg_completeness": round(avg_comp, 1),
            "valid_emails_pct": round((valid_emails / total * 100) if total > 0 else 0, 1),
            "valid_phones_pct": round((valid_phones / total * 100) if total > 0 else 0, 1),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/canonical/quality-issues")
async def canonical_quality_issues():
    try:
        db = get_db()
        threshold = 0.5
        low_comp = db.fetch_all(
            f"""
            SELECT silver_id, cust_id, full_name, completeness
            FROM silver_customer
            WHERE completeness < {threshold} OR completeness IS NULL
            LIMIT 50
            """
        )
        invalid_emails = db.fetch_all(
            """
            SELECT silver_id, cust_id, full_name, email
            FROM silver_customer
            WHERE email IS NULL OR email NOT LIKE '%@%'
            LIMIT 50
            """
        )
        invalid_phones = db.fetch_all(
            """
            SELECT silver_id, cust_id, full_name, phone
            FROM silver_customer
            WHERE phone IS NULL OR length(phone) < 10
            LIMIT 50
            """
        )
        return {
            "low_completeness": [dict(r) for r in low_comp],
            "invalid_emails": [dict(r) for r in invalid_emails],
            "invalid_phones": [dict(r) for r in invalid_phones],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Identity Graph (Duplicate Matches) Endpoints
# ============================================================================

@app.get("/identity/graph")
async def identity_graph(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    decision: str = Query(""),
    min_score: float = Query(0.0, ge=0.0, le=100.0),
):
    try:
        records, total = _fetch_match_rows(
            limit=limit,
            offset=offset,
            decision_filter=decision or None,
            min_score=min_score,
        )
        return {"matches": records, "count": len(records), "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/identity/graph/{match_id}")
async def identity_graph_detail(match_id: int):
    try:
        records, _ = _fetch_match_rows(limit=1, offset=0)
        db = get_db()
        rows = db.fetch_all(
            """
            SELECT dm.*,
                s1.silver_id AS s1_silver_id, s1.cust_id AS s1_cust_id,
                s1.first_name AS s1_first_name, s1.last_name AS s1_last_name,
                s1.full_name AS s1_full_name, s1.email AS s1_email,
                s1.phone AS s1_phone, s1.birth_date AS s1_birth_date,
                s1.address AS s1_address, s1.city AS s1_city, s1.state AS s1_state,
                s2.silver_id AS s2_silver_id, s2.cust_id AS s2_cust_id,
                s2.first_name AS s2_first_name, s2.last_name AS s2_last_name,
                s2.full_name AS s2_full_name, s2.email AS s2_email,
                s2.phone AS s2_phone, s2.birth_date AS s2_birth_date,
                s2.address AS s2_address, s2.city AS s2_city, s2.state AS s2_state
            FROM duplicate_matches dm
            JOIN silver_customer s1 ON dm.silver_id_a = s1.silver_id
            JOIN silver_customer s2 ON dm.silver_id_b = s2.silver_id
            WHERE dm.match_id = ?
            """,
            [match_id],
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Match not found")
        row = rows[0]
        score = float(row["ai_score"] or 0.0)
        r1 = _as_frontend_record({
            "silver_id": row["s1_silver_id"], "cust_id": row["s1_cust_id"],
            "first_name": row["s1_first_name"], "last_name": row["s1_last_name"],
            "full_name": row["s1_full_name"], "email": row["s1_email"],
            "phone": row["s1_phone"], "birth_date": row["s1_birth_date"],
            "address": row["s1_address"], "city": row["s1_city"], "state": row["s1_state"],
        })
        r2 = _as_frontend_record({
            "silver_id": row["s2_silver_id"], "cust_id": row["s2_cust_id"],
            "first_name": row["s2_first_name"], "last_name": row["s2_last_name"],
            "full_name": row["s2_full_name"], "email": row["s2_email"],
            "phone": row["s2_phone"], "birth_date": row["s2_birth_date"],
            "address": row["s2_address"], "city": row["s2_city"], "state": row["s2_state"],
        })
        return {
            "match_id": row["match_id"],
            "record1_id": row["silver_id_a"],
            "record2_id": row["silver_id_b"],
            "composite_score": round(score, 2),
            "ai_confidence": round(score, 2),
            "ai_reasoning": row["ai_reasoning"] or "",
            "decision": _normalized_decision(row["decision"]),
            "record1": r1,
            "record2": r2,
            "signals": {
                "email_score": round(float(row["email_match"] or 0), 4),
                "phone_score": round(float(row["phone_match"] or 0), 4),
                "name_score": round(float(row["name_similarity"] or 0), 4),
                "dob_score": round(float(row["dob_match"] or 0), 4),
                "address_score": round(float(row["city_similarity"] or 0), 4),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/identity/stats")
async def identity_stats():
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT
                COUNT(*) as total_matches,
                SUM(CASE WHEN decision IN ('AUTO_MERGE','APPROVED') THEN 1 ELSE 0 END) as auto_merged,
                SUM(CASE WHEN decision IN ('MANUAL_REVIEW','PENDING') THEN 1 ELSE 0 END) as manual_review,
                SUM(CASE WHEN decision IN ('SEPARATE','REJECTED') THEN 1 ELSE 0 END) as decided_separate,
                SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END) as pending,
                AVG(ai_score) as avg_confidence
            FROM duplicate_matches
            """
        )
        total = row["total_matches"] if row else 0
        avg = float(row["avg_confidence"] or 0)

        # Score distribution buckets
        buckets = db.fetch_all(
            """
            SELECT
                CASE
                    WHEN ai_score < 10 THEN '0-10'
                    WHEN ai_score < 20 THEN '10-20'
                    WHEN ai_score < 30 THEN '20-30'
                    WHEN ai_score < 40 THEN '30-40'
                    WHEN ai_score < 50 THEN '40-50'
                    WHEN ai_score < 60 THEN '50-60'
                    WHEN ai_score < 70 THEN '60-70'
                    WHEN ai_score < 80 THEN '70-80'
                    WHEN ai_score < 90 THEN '80-90'
                    ELSE '90-100'
                END as range,
                COUNT(*) as count
            FROM duplicate_matches
            GROUP BY range
            ORDER BY range
            """
        )

        return {
            "total_matches": total,
            "auto_merged": row["auto_merged"] if row else 0,
            "manual_review": row["manual_review"] if row else 0,
            "decided_separate": row["decided_separate"] if row else 0,
            "pending": row["pending"] if row else 0,
            "avg_confidence": round(avg, 1),
            "score_distribution": [dict(b) for b in buckets],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Review Queue Endpoints
# ============================================================================

@app.get("/review/queue")
async def review_queue(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    try:
        records, total = _fetch_match_rows(limit=limit, offset=offset, review_only=True)
        queue_items = []
        for r in records:
            queue_items.append({
                **r,
                "queue_id": r["match_id"],
                "status": "PENDING",
                "ai_suggestion": None,
            })
        return {"queue": queue_items, "count": len(queue_items), "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/review/decide")
async def review_decide(request: ReviewDecisionRequest):
    try:
        if request.decision not in ("approve", "reject"):
            raise HTTPException(status_code=400, detail="Decision must be 'approve' or 'reject'")
        db = get_db()
        review_status = "APPROVED" if request.decision == "approve" else "REJECTED"
        match_decision = "APPROVED" if request.decision == "approve" else "REJECTED"

        db.execute_query(
            "UPDATE review_queue SET status = ? WHERE match_id = ?",
            (review_status, request.match_id),
        )
        db.execute_query(
            "UPDATE duplicate_matches SET decision = ? WHERE match_id = ?",
            (match_decision, request.match_id),
        )

        remaining = db.fetch_one(
            "SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'"
        )
        return {
            "status": "success",
            "match_id": request.match_id,
            "decision": request.decision,
            "remaining_queue": remaining["cnt"] if remaining else 0,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/review/bulk-decide")
async def review_bulk_decide(request: BulkDecisionRequest):
    processed, failed = 0, 0
    for item in request.decisions:
        try:
            db = get_db()
            review_status = "APPROVED" if item.decision == "approve" else "REJECTED"
            match_decision = "APPROVED" if item.decision == "approve" else "REJECTED"
            db.execute_query(
                "UPDATE review_queue SET status = ? WHERE match_id = ?",
                (review_status, item.match_id),
            )
            db.execute_query(
                "UPDATE duplicate_matches SET decision = ? WHERE match_id = ?",
                (match_decision, item.match_id),
            )
            processed += 1
        except Exception:
            failed += 1
    return {"processed": processed, "failed": failed}


@app.get("/review/stats")
async def review_stats():
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT
                SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as approved_today,
                SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) as rejected_today
            FROM review_queue
            """
        )
        return {
            "pending": row["pending"] if row else 0,
            "approved_today": row["approved_today"] if row else 0,
            "rejected_today": row["rejected_today"] if row else 0,
            "avg_review_time_minutes": 2.5,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/review/ai-suggest/{match_id}")
async def review_ai_suggest(match_id: int):
    return await ai_analyze_match(AIAnalyzeRequest(match_id=match_id))


# ============================================================================
# Master Records (Gold) Endpoints
# ============================================================================

@app.get("/master/records")
async def master_records(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = Query(""),
):
    try:
        db = get_db()
        conditions = []
        params: list[Any] = []
        if search:
            conditions.append("(name LIKE ? OR email_primary LIKE ? OR golden_id LIKE ?)")
            params += [f"%{search}%", f"%{search}%", f"%{search}%"]

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        total_row = db.fetch_one(
            f"SELECT COUNT(*) as total FROM gold_customer {where}", params
        )
        total = total_row["total"] if total_row else 0

        rows = db.fetch_all(
            f"SELECT * FROM gold_customer {where} ORDER BY merged_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        return {"records": [_gold_record(dict(r)) for r in rows], "count": len(rows), "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/master/records/{master_id}")
async def master_record_detail(master_id: str):
    try:
        db = get_db()
        row = db.fetch_one("SELECT * FROM gold_customer WHERE golden_id = ?", [master_id])
        if not row:
            raise HTTPException(status_code=404, detail="Master record not found")
        return _gold_record(dict(row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/master/stats")
async def master_stats():
    try:
        db = get_db()
        row = db.fetch_one(
            """
            SELECT
                COUNT(*) as total,
                AVG(merge_confidence) as avg_confidence,
                SUM(CASE WHEN source_ids IS NOT NULL AND source_ids != '' THEN 1 ELSE 0 END) as merged_count
            FROM gold_customer
            """
        )
        total = row["total"] if row else 0
        merged = row["merged_count"] if row else 0
        return {
            "total": total,
            "merged_count": merged,
            "singleton_count": total - merged,
            "avg_confidence": round(float(row["avg_confidence"] or 0), 4),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/master/export")
async def master_export(format: str = Query("csv")):
    try:
        db = get_db()
        rows = db.fetch_all("SELECT * FROM gold_customer ORDER BY merged_at DESC")

        if format == "json":
            data = [_gold_record(dict(r)) for r in rows]
            return StreamingResponse(
                io.StringIO(json.dumps(data, indent=2)),
                media_type="application/json",
                headers={"Content-Disposition": "attachment; filename=master_records.json"},
            )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "master_id", "full_name", "email", "phone", "birth_date",
            "address", "city", "state", "source_ids", "confidence_score",
            "record_count", "created_at",
        ])
        for r in rows:
            gr = _gold_record(dict(r))
            writer.writerow([
                gr["master_id"], gr["full_name"], gr["email_primary"],
                gr["phone"], gr["birth_date"], gr["address"], gr["city"],
                gr["state"], ",".join(gr["source_ids"]), gr["confidence_score"],
                gr["record_count"], gr["created_at"],
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=master_records.csv"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Data Lineage Endpoint
# ============================================================================

@app.get("/lineage/{cust_id}")
async def get_lineage(cust_id: str):
    try:
        db = get_db()

        source = db.fetch_one(
            "SELECT * FROM db2_customer_simulated WHERE cust_id = ?", [cust_id]
        )
        vault = db.fetch_one(
            "SELECT * FROM bronze_customer WHERE cust_id = ?", [cust_id]
        )
        canonical = db.fetch_one(
            "SELECT * FROM silver_customer WHERE cust_id = ?", [cust_id]
        )

        matches = []
        if canonical:
            silver_id = canonical["silver_id"]
            match_rows = db.fetch_all(
                """
                SELECT dm.*, s2.cust_id as partner_cust_id, s2.full_name as partner_name
                FROM duplicate_matches dm
                JOIN silver_customer s2 ON (
                    CASE WHEN dm.silver_id_a = ? THEN dm.silver_id_b ELSE dm.silver_id_a END = s2.silver_id
                )
                WHERE dm.silver_id_a = ? OR dm.silver_id_b = ?
                LIMIT 10
                """,
                [silver_id, silver_id, silver_id],
            )
            for m in match_rows:
                matches.append({
                    "match_id": m["match_id"],
                    "composite_score": round(float(m["ai_score"] or 0), 2),
                    "decision": _normalized_decision(m["decision"]),
                    "partner_cust_id": m["partner_cust_id"],
                    "partner_name": m["partner_name"],
                })

        master = None
        if source:
            master_row = db.fetch_one(
                "SELECT * FROM gold_customer WHERE source_ids LIKE ?", [f"%{cust_id}%"]
            )
            if master_row:
                master = _gold_record(dict(master_row))

        timeline = []
        if source:
            timeline.append({"stage": "Source", "event": "Record created in source system", "ts": source.get("load_ts") or ""})
        if vault:
            timeline.append({"stage": "Raw Vault", "event": "Ingested via Kafka", "ts": vault.get("ingested_at") or ""})
        if canonical:
            timeline.append({"stage": "Canonical", "event": "Normalized and validated", "ts": canonical.get("created_at") or ""})
        for m in matches:
            timeline.append({"stage": "Identity Graph", "event": f"Matched (score {m['composite_score']}%)", "ts": ""})
        if master:
            timeline.append({"stage": "Master Record", "event": "Merged into master record", "ts": master.get("created_at", "")})

        return {
            "cust_id": cust_id,
            "source": dict(source) if source else None,
            "vault": dict(vault) if vault else None,
            "canonical": dict(canonical) if canonical else None,
            "matches": matches,
            "master": master,
            "timeline": timeline,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/lineage-search")
async def lineage_search(q: str = Query(..., min_length=1)):
    try:
        db = get_db()
        rows = db.fetch_all(
            """
            SELECT cust_id, first_nm, last_nm, email_addr
            FROM db2_customer_simulated
            WHERE cust_id LIKE ? OR first_nm LIKE ? OR last_nm LIKE ? OR email_addr LIKE ?
            LIMIT 10
            """,
            [f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"],
        )
        results = []
        for row in rows:
            first = (row.get("first_nm") or "").strip()
            last = (row.get("last_nm") or "").strip()
            name = " ".join(part for part in [first, last] if part) or None
            results.append(
                {
                    "cust_id": row.get("cust_id"),
                    "name": name,
                    "email": row.get("email_addr"),
                }
            )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AI Endpoints
# ============================================================================

@app.post("/ai/analyze-match")
async def ai_analyze_match(request: AIAnalyzeRequest):
    match_id = request.match_id
    try:
        rows, _ = _fetch_match_rows(limit=1000, offset=0)
        match = next((r for r in rows if r["match_id"] == match_id), None)

        if not match:
            db = get_db()
            mrows = db.fetch_all(
                """
                SELECT dm.*, s1.full_name as r1_name, s1.email as r1_email,
                    s1.phone as r1_phone, s1.birth_date as r1_dob,
                    s1.address as r1_addr, s1.city as r1_city, s1.state as r1_state,
                    s2.full_name as r2_name, s2.email as r2_email,
                    s2.phone as r2_phone, s2.birth_date as r2_dob,
                    s2.address as r2_addr, s2.city as r2_city, s2.state as r2_state
                FROM duplicate_matches dm
                JOIN silver_customer s1 ON dm.silver_id_a = s1.silver_id
                JOIN silver_customer s2 ON dm.silver_id_b = s2.silver_id
                WHERE dm.match_id = ?
                """,
                [match_id],
            )
            if not mrows:
                raise HTTPException(status_code=404, detail="Match not found")
            row = mrows[0]
            match = {
                "match_id": match_id,
                "composite_score": float(row["ai_score"] or 0),
                "signals": {
                    "email_score": float(row["email_match"] or 0),
                    "phone_score": float(row["phone_match"] or 0),
                    "name_score": float(row["name_similarity"] or 0),
                    "dob_score": float(row["dob_match"] or 0),
                    "address_score": float(row["city_similarity"] or 0),
                },
                "record1": {"full_name": row["r1_name"], "email": row["r1_email"], "phone_number": row["r1_phone"], "date_of_birth": row["r1_dob"], "address_line1": row["r1_addr"], "city": row["r1_city"], "state": row["r1_state"]},
                "record2": {"full_name": row["r2_name"], "email": row["r2_email"], "phone_number": row["r2_phone"], "date_of_birth": row["r2_dob"], "address_line1": row["r2_addr"], "city": row["r2_city"], "state": row["r2_state"]},
            }

        if not is_ai_configured():
            score = match["composite_score"]
            sig = match.get("signals", {})
            if score >= 90:
                sugg, conf, reason = "approve", 0.92, "High composite score with multiple matching signals strongly indicates same person."
                keys = ["high composite score", "multiple signal match"]
            elif score >= 70:
                sugg, conf, reason = "uncertain", 0.65, "Moderate confidence. Review key signals before deciding."
                keys = ["moderate composite score"]
            else:
                sugg, conf, reason = "reject", 0.80, "Low confidence score. Signals do not sufficiently support merge."
                keys = ["low composite score"]
            return {
                "suggestion": sugg,
                "confidence": conf,
                "reasoning": reason,
                "key_signals": keys,
                "risk_flags": [],
                "alternative_explanation": "Could be different individuals with similar details.",
            }

        r1 = match["record1"]
        r2 = match["record2"]
        sig = match.get("signals", {})
        user_msg = MATCH_ANALYSIS_USER_TEMPLATE.format(
            r1_name=r1.get("full_name", ""),
            r1_email=r1.get("email", ""),
            r1_phone=r1.get("phone_number", ""),
            r1_dob=r1.get("date_of_birth", ""),
            r1_address=r1.get("address_line1", ""),
            r1_city=r1.get("city", ""),
            r1_state=r1.get("state", ""),
            r2_name=r2.get("full_name", ""),
            r2_email=r2.get("email", ""),
            r2_phone=r2.get("phone_number", ""),
            r2_dob=r2.get("date_of_birth", ""),
            r2_address=r2.get("address_line1", ""),
            r2_city=r2.get("city", ""),
            r2_state=r2.get("state", ""),
            email_score=round(sig.get("email_score", 0), 2),
            phone_score=round(sig.get("phone_score", 0), 2),
            name_score=round(sig.get("name_score", 0), 2),
            name_score_pct=round(sig.get("name_score", 0) * 100, 1),
            dob_score=round(sig.get("dob_score", 0), 2),
            address_score=round(sig.get("address_score", 0), 2),
            ai_confidence=round(match["composite_score"], 1),
        )

        result = await call_gpt4_json(MATCH_ANALYSIS_SYSTEM_PROMPT, user_msg)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("AI analyze-match error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/explain-record/{master_id}")
async def ai_explain_record(master_id: str):
    try:
        db = get_db()
        row = db.fetch_one("SELECT * FROM gold_customer WHERE golden_id = ?", [master_id])
        if not row:
            raise HTTPException(status_code=404, detail="Master record not found")
        gr = _gold_record(dict(row))

        if not is_ai_configured():
            return {
                "explanation": f"Master record {master_id} consolidates {gr['record_count']} source record(s) with {round(gr['confidence_score']*100, 1)}% confidence.",
                "merge_rationale": "Records were merged based on high similarity scores across email, phone, and name fields.",
            }

        user_msg = (
            f"Explain why these {gr['record_count']} records were merged into master record {master_id}.\n"
            f"Name: {gr['full_name']}, Email: {gr['email_primary']}, Phone: {gr['phone']}\n"
            f"Source IDs: {', '.join(gr['source_ids'])}\n"
            f"Confidence: {gr['confidence_score']}"
        )
        explanation = await call_gpt4(EXPLAIN_MERGE_SYSTEM_PROMPT, user_msg, max_tokens=300)
        return {
            "explanation": explanation,
            "merge_rationale": f"Merged {gr['record_count']} records with {round(gr['confidence_score']*100,1)}% confidence.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/data-quality-report")
async def ai_data_quality_report():
    try:
        stats = await canonical_stats()
        identity = await identity_stats()

        if not is_ai_configured():
            qs = float(stats.get("avg_completeness", 0))
            return {
                "quality_score": round(qs, 1),
                "issues": [
                    f"{100 - stats.get('valid_emails_pct', 100):.1f}% of records have invalid or missing email addresses.",
                    f"{100 - stats.get('valid_phones_pct', 100):.1f}% of records have invalid or missing phone numbers.",
                ],
                "recommendations": [
                    "Run a data enrichment pass on records with missing email addresses.",
                    "Validate phone number formats using E.164 standardization.",
                    "Review low-completeness records for potential deduplication.",
                ],
                "summary": (
                    f"Overall data quality score is {qs:.1f}%. "
                    f"The canonical layer contains {stats.get('total', 0)} records with "
                    f"{stats.get('valid_emails_pct', 0):.1f}% valid emails. "
                    f"Identity graph has {identity.get('total_matches', 0)} matches with "
                    f"{identity.get('auto_merged', 0)} auto-merged."
                ),
            }

        user_msg = json.dumps({
            "canonical_stats": stats,
            "identity_stats": identity,
        })
        result = await call_gpt4_json(DATA_QUALITY_SYSTEM_PROMPT, user_msg)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/chat")
async def ai_chat(request: AIChatRequest):
    try:
        context_map = {
            "/": "pipeline overview and data quality",
            "pipeline": "pipeline orchestration and stage monitoring",
            "records": "raw vault and canonical records",
            "review": "human review of duplicate customer records",
            "identity-graph": "identity matching and deduplication scoring",
            "master-records": "master data management and golden records",
            "lineage": "data lineage tracking from source to master",
            "settings": "platform configuration and API health",
        }
        context_label = context_map.get(request.context, request.context)

        if not is_ai_configured():
            return {
                "reply": (
                    "Azure OpenAI is not configured yet. Please add your AZURE_OPENAI_API_KEY "
                    "and AZURE_OPENAI_ENDPOINT to the .env file to enable AI chat. "
                    "I can still help you navigate the platform — what would you like to explore?"
                )
            }

        system = CHAT_SYSTEM_PROMPT.format(context=context_label)
        reply = await call_gpt4(system, request.message, max_tokens=500)
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Legacy endpoints (kept for compatibility)
# ============================================================================

@app.get("/records/db2")
async def get_db2_records(limit: int = Query(100, ge=1, le=10000)):
    try:
        db = get_db()
        records = db.fetch_all(f"SELECT * FROM db2_customer_simulated LIMIT {limit}")
        return {"records": [dict(r) for r in records], "count": len(records)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/records/bronze")
async def get_bronze_records(limit: int = Query(100, ge=1, le=10000)):
    vault_result = await vault_records(limit=limit, offset=0, search="")
    return {"records": vault_result["records"], "count": vault_result["count"]}


@app.get("/records/silver")
async def get_silver_records(limit: int = Query(100, ge=1, le=10000)):
    result = await canonical_records(limit=limit, offset=0, search="", min_completeness=0)
    return {"records": result["records"], "count": result["count"]}


@app.get("/records/gold")
async def get_golden_records(limit: int = Query(100, ge=1, le=10000)):
    result = await master_records(limit=limit, offset=0, search="")
    return {"records": result["records"], "count": result["count"]}


@app.get("/matches")
async def get_duplicate_matches(limit: int = Query(100, ge=1, le=10000)):
    result = await identity_graph(limit=limit, offset=0, decision="", min_score=0)
    return {"matches": result["matches"], "records": result["matches"], "count": result["count"]}


@app.get("/review-queue")
async def get_review_queue_legacy(limit: int = Query(100, ge=1, le=10000)):
    result = await review_queue(limit=limit, offset=0)
    return {"queue": result["queue"], "records": result["queue"], "count": result["count"]}


@app.post("/review/decide")
async def submit_review_decision(request: ReviewDecisionRequest):
    return await review_decide(request)


@app.post("/rebuild/golden")
async def rebuild_golden_records():
    return await rebuild_master()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
