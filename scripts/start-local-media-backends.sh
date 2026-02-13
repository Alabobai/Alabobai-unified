#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/local_media_inference.py"
LOG_DIR="${TMPDIR:-/tmp}/alabobai-media"

mkdir -p "$LOG_DIR"

start_on_port() {
  local port="$1"
  local log_file="$LOG_DIR/media-${port}.log"
  local pid_file="$LOG_DIR/media-${port}.pid"

  if [[ -f "$pid_file" ]]; then
    local old_pid
    old_pid="$(cat "$pid_file" || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "Port ${port}: already running (pid ${old_pid})"
      return 0
    fi
  fi

  nohup python3 -m uvicorn local_media_inference:app \
    --app-dir "$ROOT_DIR/scripts" \
    --host 127.0.0.1 \
    --port "$port" \
    >"$log_file" 2>&1 &

  local pid=$!
  echo "$pid" >"$pid_file"
  echo "Port ${port}: started (pid ${pid})"
}

start_on_port 7860
start_on_port 8000

echo "Logs: $LOG_DIR"
echo "Image health: curl http://127.0.0.1:7860/health"
echo "Video health: curl http://127.0.0.1:8000/health"
