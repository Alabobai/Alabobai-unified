#!/usr/bin/env bash
set -euo pipefail

check_http() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  if [[ "$code" == "200" ]]; then
    echo "✅ $name: UP ($code)"
  else
    echo "❌ $name: DOWN ($code)"
  fi
}

echo "Alabobai local dev status"
echo "-------------------------"
check_http "Backend API" "http://localhost:8888/api/health"
check_http "Frontend" "http://localhost:3001/"
check_http "Local bridge" "http://localhost:8890/health"
check_http "Local AI models endpoint" "http://localhost:3001/api/local-ai/models"
proxy_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3001/api/proxy" -H "content-type: application/json" -d '{"action":"fetch","url":"https://example.com"}' || true)
if [[ "$proxy_code" == "200" ]]; then
  echo "✅ Proxy endpoint (POST fetch): UP ($proxy_code)"
else
  echo "❌ Proxy endpoint (POST fetch): DOWN ($proxy_code)"
fi

echo
echo "Relevant processes:"
ps aux | grep -E "tsx watch src/index.ts|uvicorn local_media_bridge:app|vite --port 3001" | grep -v grep || true
