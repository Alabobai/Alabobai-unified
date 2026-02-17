#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${LAUNCH_HEALTH_OUT_DIR:-/tmp/alabobai-launch-health}"
mkdir -p "$OUT_DIR"

LINT_LOG="$OUT_DIR/lint.log"
BUILD_LOG="$OUT_DIR/build.log"
ACC_LOG="$OUT_DIR/acceptance.log"
BENCH_JSON="$OUT_DIR/benchmark.json"
BENCH_ERR="$OUT_DIR/benchmark.err"
SUMMARY_JSON="$OUT_DIR/summary.json"

RUNS="${BENCH_RUNS:-12}"
CONCURRENCY="${BENCH_CONCURRENCY:-4}"
WAIT_TIMEOUT_MS="${BENCH_WAIT_TIMEOUT_MS:-12000}"
GLOBAL_TIMEOUT_MS="${BENCH_GLOBAL_TIMEOUT_MS:-90000}"

pass=true

run_step() {
  local name="$1"
  shift
  if "$@"; then
    echo "$name:PASS"
  else
    echo "$name:FAIL"
    pass=false
  fi
}

run_step "lint" bash -lc "npm run lint > '$LINT_LOG' 2>&1"
run_step "build" bash -lc "npm run build > '$BUILD_LOG' 2>&1"
run_step "acceptance" bash -lc "bash scripts/run-acceptance.sh > '$ACC_LOG' 2>&1"
benchmark_step() {
  BENCH_RUNS="$RUNS" BENCH_CONCURRENCY="$CONCURRENCY" BENCH_WAIT_TIMEOUT_MS="$WAIT_TIMEOUT_MS" BENCH_GLOBAL_TIMEOUT_MS="$GLOBAL_TIMEOUT_MS" \
    npx tsx scripts/autonomy-benchmark.ts > "$BENCH_JSON" 2> "$BENCH_ERR" &
  local pid=$!
  local deadline=$(( $(date +%s) + (GLOBAL_TIMEOUT_MS / 1000) + 20 ))

  while kill -0 "$pid" 2>/dev/null; do
    if [[ $(date +%s) -ge $deadline ]]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      echo "benchmark timeout after ${GLOBAL_TIMEOUT_MS}ms" >> "$BENCH_ERR"
      return 1
    fi
    sleep 1
  done

  wait "$pid"
}

run_step "benchmark" benchmark_step

# Extract compact facts from benchmark (no jq dependency)
bench_summary="{}"
if [[ -s "$BENCH_JSON" ]]; then
  bench_summary="$(node - "$BENCH_JSON" <<'NODE'
const fs = require('fs');
const p = process.argv[2];
const raw = fs.readFileSync(p,'utf8');
const j = JSON.parse(raw);
const out = {
  totalRuns: j.summary?.totalRuns,
  succeeded: j.summary?.succeeded,
  failed: j.summary?.failed,
  successRate: j.summary?.successRate,
  p50LatencyMs: j.summary?.p50LatencyMs,
  p95LatencyMs: j.summary?.p95LatencyMs,
  throughputRunsPerMin: j.summary?.throughputRunsPerMin,
};
process.stdout.write(JSON.stringify(out));
NODE
)"
fi

cat > "$SUMMARY_JSON" <<EOF
{
  "go": $pass,
  "artifacts": {
    "lintLog": "$LINT_LOG",
    "buildLog": "$BUILD_LOG",
    "acceptanceLog": "$ACC_LOG",
    "benchmarkJson": "$BENCH_JSON",
    "benchmarkErr": "$BENCH_ERR"
  },
  "benchmark": $bench_summary
}
EOF

if [[ "$pass" == "true" ]]; then
  echo "LAUNCH_HEALTH: GO"
else
  echo "LAUNCH_HEALTH: NO_GO"
fi

echo "SUMMARY_JSON: $SUMMARY_JSON"
