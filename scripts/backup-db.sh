#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DATABASE_PATH:-$ROOT/data/alabobai.db}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/alabobai-$TS.db"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

cp "$DB_PATH" "$OUT"
gzip -f "$OUT"

echo "Backup created: $OUT.gz"
