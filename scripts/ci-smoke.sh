#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export NODE_ENV=development
export ADMIN_API_KEY="ci-smoke-admin-key"
export PORT=8898

# Prefer project-compatible Node version when nvm is available.
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use --delete-prefix 20 >/dev/null || true
fi

npm run build >/tmp/ci-build.log 2>&1

node dist/index.js >/tmp/ci-server.log 2>&1 &
PID=$!

fail(){
  echo "$1"
  echo "--- /tmp/ci-build.log (tail) ---"
  tail -n 80 /tmp/ci-build.log || true
  echo "--- /tmp/ci-server.log (tail) ---"
  tail -n 120 /tmp/ci-server.log || true
  exit 1
}

cleanup(){
  kill "$PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for i in {1..40}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)
  if [[ "$code" == "200" ]]; then
    break
  fi
  sleep 1
done

health_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)
[[ "$health_code" == "200" ]] || fail "health check failed"

live_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health/live" || true)
[[ "$live_code" == "200" ]] || fail "liveness check failed"

ready_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health/ready" || true)
[[ "$ready_code" == "200" ]] || fail "readiness check failed"

unauth_tasks=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/tasks" || true)
[[ "$unauth_tasks" == "401" ]] || fail "expected 401 for unauth tasks, got $unauth_tasks"

auth_tasks=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/tasks" -H "X-API-Key: ${ADMIN_API_KEY}" || true)
[[ "$auth_tasks" == "200" ]] || fail "expected 200 for auth tasks, got $auth_tasks"

unauth_state=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/state" || true)
[[ "$unauth_state" == "401" ]] || fail "expected 401 for unauth state, got $unauth_state"

auth_state=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/state" -H "X-API-Key: ${ADMIN_API_KEY}" || true)
[[ "$auth_state" == "200" ]] || fail "expected 200 for auth state, got $auth_state"

unauth_manual_health=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${PORT}/api/health/check" || true)
[[ "$unauth_manual_health" == "401" ]] || fail "expected 401 for unauth manual health check, got $unauth_manual_health"

auth_manual_health=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${PORT}/api/health/check" -H "X-API-Key: ${ADMIN_API_KEY}" || true)
[[ "$auth_manual_health" == "200" ]] || fail "expected 200 for auth manual health check, got $auth_manual_health"

echo "smoke ok"
