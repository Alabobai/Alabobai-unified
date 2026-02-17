# ENTERPRISE_HARDENING_PROGRESS

## 2026-02-14 — Platform/Reliability hardening pass

### Scope completed
Focused on high-confidence hardening only (no broad UX behavior changes):
- readiness/health semantics
- auth boundary tightening for operational endpoints
- audit/manual health action safety
- CI smoke reliability
- production runbook completeness

---

## 1) Readiness/health semantics

### Change
- Removed duplicate top-level `GET /api/health` handler in `src/api/server.ts` to avoid route ambiguity and ensure health semantics are consistently owned by `src/api/routes/health.ts`.
- Kept explicit probe endpoints as source of truth:
  - `/api/health`
  - `/api/health/live`
  - `/api/health/ready`
  - `/api/health/readiness`

### Before
- Two `GET /api/health` implementations existed (router + direct route), increasing drift/maintenance risk.

### After
- Single health surface through health router.
- CI smoke now explicitly validates live + ready in addition to health.

---

## 2) Auth boundaries

### Change
In `src/api/server.ts`, added `viewer` role middleware to operational read endpoints:
- `GET /api/state`
- `GET /api/agents`
- `GET /api/agents/:id`
- `GET /api/chat/:sessionId/history`

### Before
- These endpoints were unauthenticated and exposed internal topology/state.

### After
- Role-aware access controls align with enterprise least-privilege model.
- Dev UX remains stable via existing dev-open behavior when no keys are configured and `NODE_ENV !== production`.

---

## 3) Audit logging / manual health action safety

### Change
In `src/api/routes/health.ts`:
- Introduced shared admin-key guard helper for sensitive health endpoints.
- Enforced admin key for:
  - `GET /api/health/audit`
  - `POST /api/health/check`

### Before
- `POST /api/health/check` was callable without admin auth.

### After
- Both operationally sensitive endpoints require admin key when configured.

---

## 4) CI smoke reliability

### Change
Updated `scripts/ci-smoke.sh`:
- Added failure helper with build/server log tail output.
- Expanded checks:
  - `/api/health` == 200
  - `/api/health/live` == 200
  - `/api/health/ready` == 200
  - unauth `/api/tasks` == 401
  - auth `/api/tasks` == 200
  - unauth `/api/state` == 401
  - auth `/api/state` == 200
  - unauth `POST /api/health/check` == 401
  - auth `POST /api/health/check` == 200

### Before
- Smoke checked only basic health and tasks auth.

### After
- Smoke now validates readiness semantics + tightened auth boundaries.

---

## 5) Dependency/runtime reliability

### Change
`package.json`:
- Added missing runtime dependency: `compression`
- Added typings: `@types/compression`

### Before
- `compression` was used by server but not declared (extraneous install risk on clean environments).

### After
- Deterministic dependency graph for clean CI/prod installs.

---

## 6) Production runbook completeness

### Change
Updated `PROD_RUNBOOK.md` with:
- explicit liveness/readiness checks
- readiness matrix endpoint
- smoke gate execution (`./scripts/ci-smoke.sh`)
- SLO and audit inspection quick checks

---

## Verification (executed)

- `npm run build` ✅
- `./scripts/ci-smoke.sh` ✅ (`smoke ok`)

Observed smoke evidence from server log included:
- `GET /live 200`
- `GET /ready 200`
- `GET /api/tasks [401]` and authenticated `200`
- `GET /api/state [401]` and authenticated `200`
- `POST /check [401]` and authenticated `200`

---

## Go / No-Go

### Go
- Build passes.
- Smoke passes with expanded enterprise checks.
- Health/readiness semantics are consistent and test-covered.
- Sensitive operational endpoints have stronger auth boundaries.
- Runbook includes production probe and smoke gate sequence.

### Residual risk / follow-up (non-blocking)
- Public chat endpoints (`/api/chat`, `/api/v2/chat*`) remain intentionally open for current UX; if enterprise tenancy requires strict API auth at edge, enforce via gateway policy or add explicit auth mode flag in a controlled release.
