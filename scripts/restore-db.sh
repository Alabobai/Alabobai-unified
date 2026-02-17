#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file(.db|.db.gz)>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DATABASE_PATH:-$ROOT/data/alabobai.db}"
INPUT="$1"

if [[ ! -f "$INPUT" ]]; then
  echo "Backup file not found: $INPUT" >&2
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ "$INPUT" == *.gz ]]; then
  gunzip -c "$INPUT" > "$TMP"
else
  cp "$INPUT" "$TMP"
fi

cp "$TMP" "$DB_PATH"

echo "Database restored to: $DB_PATH"
