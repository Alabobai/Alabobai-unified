#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash first." >&2
  exit 1
fi

STAMP="rollback-backup-$(date +%Y%m%d-%H%M%S)"
git branch "$STAMP"

git reset --hard HEAD~1

echo "Rolled back 1 commit. Backup branch created: $STAMP"
