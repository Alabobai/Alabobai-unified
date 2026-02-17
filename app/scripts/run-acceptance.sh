#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Uses tsx runner to support TS/ESM API modules directly.
npx tsx scripts/acceptance-e2e.mjs
