# Production Hardening Plan (v1)

## Completed in this pass
- Build + typecheck gates green (`app build`, root `typecheck`).
- Chat endpoint no longer hard-fails when Ollama is down (degraded fallback).
- Server-side env validation added (`src/config/env.ts`) with fail-fast startup checks.
- CORS allowlist support via `CORS_ORIGINS` (comma-separated).
- Baseline HTTP hardening headers added.
- Request payload limits reduced (`json: 10mb`, `urlencoded: 2mb`).
- `x-powered-by` disabled.

## P0 to finish before public launch
1. **Auth & Authorization**
   - Protect sensitive routes (`/api/commands`, `/api/companies`, `/api/tasks`, `/api/approvals`).
   - Add role-based access and API tokens.
2. **Secrets & Config hygiene**
   - Move all secrets to a secret manager (not `.env` in prod hosts).
   - Rotate existing provider keys.
3. **Observability**
   - Structured JSON logs + correlation IDs.
   - Error tracking (Sentry) + uptime alerts.
   - Request latency + rate-limit metrics dashboards.
4. **Data safety**
   - Automated DB backups (encrypted) + restore drill.
   - Migration strategy for schema upgrades.
5. **LLM fallback policy**
   - Make degraded/offline policy explicit per endpoint and UI state.
   - Add circuit breaker for repeated upstream failures.

## P1 (next hardening sprint)
- End-to-end smoke tests in CI for key user journeys.
- Dependency security scanning in CI (`npm audit --production`, osv).
- CSP with nonces and tighter security headers.
- WebSocket auth and tenant/session isolation checks.
- Load testing (k6/autocannon) with SLO targets.

## Suggested release gate
A build is deployable only when:
- Root typecheck + tests pass
- App build passes
- API smoke tests pass
- No critical vulnerability (CVSS >= 9) in production deps
- Health/readiness probes return healthy
