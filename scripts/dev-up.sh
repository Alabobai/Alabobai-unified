#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/alaboebai/Alabobai/alabobai-unified"
APP="$ROOT/app"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
source "$NVM_DIR/nvm.sh"

# Force project-compatible Node and clear prefix conflicts
nvm use --delete-prefix 20 >/dev/null

# Stop previous local services
pkill -f "$ROOT/node_modules/.bin/tsx watch src/index.ts" || true
pkill -f "uvicorn local_media_bridge:app" || true
pkill -f "$APP/node_modules/.bin/tsx scripts/runtime-api-bridge.ts" || true
pkill -f "$APP/node_modules/.bin/vite --port 3001" || true
pkill -f "npm run dev -- --port 3001" || true

# Start services
nohup npm run dev > /tmp/alabobai-server.log 2>&1 &
nohup /Library/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python -m uvicorn local_media_bridge:app --app-dir "$ROOT/scripts" --host 127.0.0.1 --port 8890 > /tmp/alabobai-bridge.log 2>&1 &
(
  cd "$APP"
  nohup npx tsx scripts/runtime-api-bridge.ts > /tmp/alabobai-runtime-api-bridge.log 2>&1 &
  nohup npm run dev:vite -- --port 3001 > /tmp/alabobai-vite.log 2>&1 &
)

echo "Started. Logs:"
echo "  /tmp/alabobai-server.log"
echo "  /tmp/alabobai-bridge.log"
echo "  /tmp/alabobai-runtime-api-bridge.log"
echo "  /tmp/alabobai-vite.log"
