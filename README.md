# Golden Record Platform - FastAPI Backend

A production-ready FastAPI backend for enterprise data deduplication and golden record management using SQLite, Apache Kafka, and probabilistic matching.

## Quick Start

### Prerequisites
- Python 3.11+
- Docker & Docker Compose (for Kafka)
- uv package manager

### Setup

1. **Install dependencies:**
   ```bash
   uv pip install -e .
   ```

2. **Start Kafka:**
   ```bash
   docker-compose up -d
   ```

3. **Start the FastAPI backend:**
   ```bash
   ./start_backend.sh
   ```
   Or for development with auto-reload:
   ```bash
   ./start_backend.sh dev
   ```

4. **Access the API:**
   - **Swagger UI**: http://localhost:8000/docs
   - **ReDoc**: http://localhost:8000/redoc
   - **Health**: http://localhost:8000/health

## Architecture

### Data Pipeline (3-Layer Design)

```
DB2 Source
    ↓
Bronze Layer (Raw Kafka Ingest)
    ↓
Silver Layer (Normalized Data)
    ↓
Dedup Engine (Blocking + Scoring)
    ↓
Decision Engine (Auto/Manual/Separate)
    ↓
Golden Records (Unified)
```

### Key Components

- **Producer**: Reads SQLite source, publishes events to Kafka
- **Consumer**: Subscribes to Kafka, idempotently stores in Bronze
- **Transformer**: Normalizes names, emails, phones, dates, cities
- **Dedup Engine**: Blocking-based matching with weighted composite scoring
- **Decision Engine**: Routes to auto-merge (≥90%), manual review (70-89%), separate (<70%)
- **Merger**: Builds unified Golden records via union-find clustering

## FastAPI Endpoints

See [BACKEND.md](BACKEND.md) for complete API documentation.

### Core Endpoints

```
POST   /pipeline/run          Execute the full pipeline
GET    /summary               Summary statistics
GET    /records/{layer}       Inspect records (db2, bronze, silver, gold)
GET    /matches               View duplicate pairs
GET    /review-queue          View matches awaiting approval
POST   /review/decide         Submit review decision
```

## Configuration

Edit `.env` to customize:

```env
DB_PATH=./golden_record.db
MOCK_RECORD_COUNT=1200
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC=customer_raw
```

## Testing

### Using curl

```bash
# Health check
curl http://localhost:8000/health

# Run full pipeline
curl -X POST http://localhost:8000/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"reset_layers": true, "produce_limit": 100}'

# Get summary
curl http://localhost:8000/summary
```

### Using Python

```python
import requests

# Run pipeline
response = requests.post("http://localhost:8000/pipeline/run")
print(response.json())

# Get summary
response = requests.get("http://localhost:8000/summary")
print(response.json())
```

## Database Inspection

Use the CLI utility to inspect data:

```bash
python query_db.py stats       # Pipeline statistics
python query_db.py db2 [n]     # DB2 source records
python query_db.py bronze [n]  # Bronze layer (raw)
python query_db.py silver [n]  # Silver layer (normalized)
python query_db.py gold [n]    # Golden records
python query_db.py matches [n] # Duplicate pairs
python query_db.py reviews [n] # Review queue
```

## Performance

- **End-to-end pipeline**: ~3 seconds for 1200 records
- **Database**: SQLite (file-based, zero ops overhead)
- **API**: FastAPI with optional 4-worker production mode
- **Kafka**: Apache Kafka 7.5.0 (docker-compose)

## Features

✅ **Probabilistic Matching**: Weighted composite scoring (email 0.35, phone 0.30, name 0.20, DOB 0.10, city 0.05)  
✅ **Blocking Algorithm**: Reduces all-pairs comparison from O(n²) to O(k)  
✅ **Human-in-the-Loop**: Manual review workflow for 70-89% confidence matches  
✅ **Transitive Closure**: Union-find clustering for multi-record groups  
✅ **Deterministic**: Reproducible results across runs  
✅ **SQLite-Native**: Zero external dependencies, single-file database  
✅ **Kafka Event Sourcing**: Full lineage and audit trail  
✅ **REST API**: Complete inspection and control via FastAPI  

## Project Structure

```
├── golden_record_platform/       # Main package
│   ├── api/
│   │   └── main.py              # FastAPI application
│   ├── pipeline/
│   │   ├── orchestrator.py       # Unified pipeline runner
│   │   ├── producer.py           # Kafka producer wrapper
│   │   ├── consumer.py           # Kafka consumer wrapper
│   │   ├── silver.py             # Normalizer wrapper
│   │   ├── dedup.py              # Matching wrapper
│   │   ├── decision.py           # Routing wrapper
│   │   └── merger.py             # Merger wrapper
│   └── config.py                 # Configuration
├── db_utils.py                   # SQLite connection & schema
├── kafka_producer.py             # Producer implementation
├── kafka_consumer.py             # Consumer implementation
├── silver_transformer.py          # Normalization logic
├── dedup_engine.py               # Matching algorithm
├── decision_engine.py            # Decision routing
├── golden_merger.py              # Golden record building
├── query_db.py                   # CLI inspection utility
├── start_backend.sh              # Backend startup script
├── docker-compose.yml            # Kafka setup
└── pyproject.toml                # Dependencies
```

## Development

### Running in development mode:
```bash
./start_backend.sh dev
```

This enables:
- Auto-reload on file changes
- Debug mode enabled
- Single worker (easier debugging)

### Running in production mode:
```bash
./start_backend.sh
```

This enables:
- Multiple workers (4 by default)
- Optimized for throughput
- No auto-reload

## License

MIT

## Support

For issues or questions, refer to [BACKEND.md](BACKEND.md) for detailed API documentation and troubleshooting.
