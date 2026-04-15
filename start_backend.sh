#!/bin/bash
# Start the FastAPI backend server

set -e

echo "🚀 Starting Golden Record Platform API..."
echo ""

# Check if running with specific options
if [ "$1" == "dev" ]; then
    echo "📝 Starting in DEVELOPMENT mode (with auto-reload)..."
    uvicorn golden_record_platform.api.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "⚡ Starting in PRODUCTION mode..."
    uvicorn golden_record_platform.api.main:app --host 0.0.0.0 --port 8000 --workers 4
fi
