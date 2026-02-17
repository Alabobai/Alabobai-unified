# Production Runbook

## Pre-deploy checklist
- `npm run typecheck`
- `npm run build`
- `cd app && npm run build`
- Ensure env vars are set:
  - `ADMIN_API_KEY`
  - `SESSION_TOKEN_SECRET`
  - `CORS_ORIGINS`
  - provider key for `LLM_PROVIDER`

## Deploy
1. Pull latest release commit.
2. Install deps (`npm ci`, `cd app && npm ci`).
3. Start services via your process manager.
4. Verify health and readiness:
   - `GET /api/health` => 200
   - `GET /api/health/live` => 200
   - `GET /api/health/ready` => 200
   - `GET /api/health/readiness` => `ready: true`
   - Protected endpoint unauth => 401 (`GET /api/state`)
   - Protected endpoint auth => 200 (`GET /api/state` with `X-API-Key`)
   - Manual health check unauth => 401 (`POST /api/health/check`)
5. Run smoke gate:
   - `./scripts/ci-smoke.sh`

## Incident quick checks
- Check API health and latency.
- Check readiness dependency matrix (`/api/health/readiness`).
- Check SLO burn (`/api/health/slo`).
- Check bridge health (`http://127.0.0.1:8890/health`).
- Tail logs for requestId and status spikes.
- Pull structured audit sample (`GET /api/health/audit?limit=100` with admin key).

## Rollback
- Use script: `./scripts/rollback-last.sh`
- Redeploy and verify health checks.

## Backups
- Create backup: `npm run db:backup`
- Restore backup: `npm run db:restore -- <path-to-backup.db.gz>`
