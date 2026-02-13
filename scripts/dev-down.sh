#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/alaboebai/Alabobai/alabobai-unified"
APP="$ROOT/app"

pkill -f "$ROOT/node_modules/.bin/tsx watch src/index.ts" || true
pkill -f "uvicorn local_media_bridge:app" || true
pkill -f "$APP/node_modules/.bin/vite --port 3001" || true
pkill -f "npm run dev -- --port 3001" || true

echo "Stopped Alabobai local dev services (backend, bridge, frontend)."
