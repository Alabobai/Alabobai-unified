#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

echo "Capability Engine smoke tests against ${BASE_URL}"
echo "Expected behavior: each request returns HTTP 200 with status in {ok,partial,degraded,no-match}"

test_case() {
  local name="$1"
  local payload="$2"
  echo "\n--- ${name} ---"
  curl -sS -X POST "${BASE_URL}/api/execute-task" \
    -H 'Content-Type: application/json' \
    -d "${payload}" | jq '{status, intent: .intent.label, planSteps: (.plan|length), execSteps: (.execution.steps|length), degraded: .diagnostics.degraded}'
}

# 1) Company plan
# Expected: status ok|partial, intent likely company.plan

test_case "company-plan" '{"task":"create company plan for an AI accounting startup"}'

# 2) Research query
# Expected: status ok|partial, intent likely research.search

test_case "research-topic" '{"task":"research topic: latest battery recycling methods"}'

# 3) Image generation
# Expected: status ok|partial (or degraded fallback)

test_case "generate-image" '{"task":"generate image of futuristic city skyline at dusk"}'

# 4) Video generation
# Expected: status ok|partial (or degraded fallback)

test_case "generate-video" '{"task":"generate video of ocean waves with cinematic lighting"}'

# 5) dryRun sanity
# Expected: status ok, execution steps include dryRun payload

test_case "dry-run" '{"task":"create company plan for fintech", "dryRun":true}'

# 6) no-match handling
# Expected: status no-match (not 500)

test_case "no-match" '{"task":""}'

echo "\nSmoke suite complete."
