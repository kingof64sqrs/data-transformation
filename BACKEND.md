# Golden Record Platform - FastAPI Backend

FastAPI-only backend for the Golden Record data deduplication platform.

## Quick Start

### 1. Ensure Kafka is Running
```bash
docker-compose up -d
```

### 2. Run the Backend Server

#### Option A: Using the startup script
```bash
./start_backend.sh          # Production mode (4 workers)
./start_backend.sh dev      # Development mode (auto-reload)
```

#### Option B: Direct uvicorn command
```bash
# Development mode (with auto-reload)
uvicorn golden_record_platform.api.main:app --host 0.0.0.0 --port 8000 --reload

# Production mode (4 workers)
uvicorn golden_record_platform.api.main:app --host 0.0.0.0 --port 8000 --workers 4
```

#### Option C: Python module execution
```bash
python -m uvicorn golden_record_platform.api.main:app --host 0.0.0.0 --port 8000
```

## API Endpoints

### Health & Info
- `GET /health` - Health check
- `GET /info` - API information and available endpoints

### Pipeline Management
- `POST /pipeline/run` - Execute full pipeline
  - Request body:
    ```json
    {
      "reset_layers": true,
      "produce_limit": null
    }
    ```

### Data Inspection
- `GET /summary` - Summary statistics across all layers
- `GET /records/db2?limit=100` - Raw DB2 source records
- `GET /records/bronze?limit=100` - Bronze layer (raw ingest)
- `GET /records/silver?limit=100` - Silver layer (normalized)
- `GET /records/gold?limit=100` - Golden records (unified)

### Deduplication & Review
- `GET /matches?limit=100` - Identified duplicate pairs
- `GET /review-queue?limit=100` - Matches awaiting manual review
- `POST /review/decide` - Submit review decision
  - Request body:
    ```json
    {
      "match_id": 1,
      "decision": "approve"
    }
    ```

### Utilities
- `POST /rebuild/golden` - Rebuild golden records from decisions

## Testing the API

### Using curl

```bash
# Health check
curl http://localhost:8000/health

# Get summary
curl http://localhost:8000/summary

# Run pipeline
curl -X POST http://localhost:8000/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"reset_layers": true, "produce_limit": 100}'

# Get bronze records
curl http://localhost:8000/records/bronze?limit=10

# Get golden records
curl http://localhost:8000/records/gold?limit=10
```

### Using Python requests

```python
import requests

base_url = "http://localhost:8000"

# Health check
response = requests.get(f"{base_url}/health")
print(response.json())

# Run pipeline
response = requests.post(f"{base_url}/pipeline/run", json={
    "reset_layers": True,
    "produce_limit": 100
})
print(response.json())

# Get summary
response = requests.get(f"{base_url}/summary")
print(response.json())
```

## Interactive API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Configuration

Configuration is managed via `.env` file:

```env
DB_PATH=./golden_record.db
MOCK_RECORD_COUNT=1200
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC=customer_raw
```

## Architecture

The FastAPI backend exposes the Golden Record pipeline with these layers:

1. **DB2** (Source) → 2. **Bronze** (Raw Ingest) → 3. **Silver** (Normalized) → 4. **Dedup** (Matching) → 5. **Decision** (Routing) → 6. **Golden** (Unified Records)

Each layer can be inspected via the `/records/*` endpoints.

## Pipeline Flow

1. **Produce**: Read from SQLite DB2 table, produce events to Kafka
2. **Consume**: Subscribe to Kafka, store raw events in Bronze
3. **Transform**: Normalize names, emails, phones, dates, cities → Silver
4. **Dedup**: Identify duplicates using blocking + weighted scoring
5. **Decide**: Route to auto-merge (≥90%), manual review (70-89%), or separate (<70%)
6. **Merge**: Create unified Golden records from approved matches

## Utility Scripts

Query the database from CLI:

```bash
# View pipeline statistics
python query_db.py stats

# View records in each layer
python query_db.py db2 [limit]
python query_db.py bronze [limit]
python query_db.py silver [limit]
python query_db.py gold [limit]
python query_db.py matches [limit]
python query_db.py reviews [limit]
```

## Troubleshooting

### Kafka Connection Error
Ensure Kafka is running:
```bash
docker-compose up -d
docker-compose logs kafka
```

### Port Already in Use
Change the port in the startup command:
```bash
uvicorn golden_record_platform.api.main:app --host 0.0.0.0 --port 8001
```

### Import Errors
Ensure the package is installed:
```bash
uv pip install -e .
```

## Performance

- **Development mode**: Auto-reload on file changes, single worker
- **Production mode**: 4 workers for concurrent requests
- **Database**: SQLite (in-memory queries are fast)
- **Pipeline**: ~3 seconds for 1200 records end-to-end

## Next Steps

1. Start the server: `./start_backend.sh` or `./start_backend.sh dev`
2. Open http://localhost:8000/docs in browser
3. Run `/pipeline/run` to execute the full pipeline
4. Browse `/records/*` endpoints to inspect data
5. Use `/review-queue` to view matches needing approval
6. Submit decisions via `/review/decide`
