# Reliability Tooling Stack — Overnight Integration Plan

## Current recurring failure modes observed
- Browser flows can regress silently (view switches, chunk/session race, preview navigation).
- API behavior drifts (status code/envelope mismatch on edge cases like invalid control action).
- UI routes are present but become unreachable/wrongly wired after refactors.
- Green pass can hide intermittent flakes unless repeated.
- No lightweight synthetic monitor loop for key runtime endpoints.
- Limited quick visibility into autonomous runtime health (stale/retrying runs).

---

## Candidate OSS tools (prioritized)

| Tool | Why it fixes a current failure mode | Integration effort | Immediate patch plan | Proof strategy |
|---|---|---:|---|---|
| **Playwright** | Catches UI/runtime regressions in browser automation, sidebar routing, preview URL flows, API smoke in same framework | **Low** (already installed) | Add deterministic flow-replay specs + contract/smoke API specs; enable retry/trace/video | Green run for `reliability:test`, artifacts from failed retries, repeated runs via flaky scan |
| **MSW (Mock Service Worker)** | Stabilizes provider-dependent tests where external APIs are flaky/blocked; prevents false negatives | Medium | Add handlers for search/image/video provider paths and run deterministic CI mode | Compare live-mode vs mocked-mode failure rate; ensure mocked contract tests always green |
| **k6** | Synthetic monitoring + latency/error thresholding for key API routes | Medium | Add `k6` script targeting `/api/search`, `/api/execute-task`, `/api/company`; wire nightly command | Threshold report with pass/fail, p95 latency + error-rate trend |
| **OpenTelemetry JS (or Pino + metrics bridge)** | Adds structured observability around autonomous runs/retries/stalls | Medium | Add lightweight runtime metrics and event counters endpoint/script | Verify stale-run/retry metrics emitted and visible in report |
| **Playwright repeat-each flake scan** (same tool, separate mode) | Exposes intermittent failures hidden by one-shot pass | Low | Add `reliability:flaky-scan` script with `--repeat-each` and JSON parsing | Flaky report showing unexpected test count = 0 |

---

## Top choices implemented tonight (feasible now)

1. **Playwright flow replay + API contract smoke expansion**
   - Added:
     - `tests/reliability/flow-replay.spec.ts`
     - `tests/reliability/contracts-and-smoke.spec.ts`
   - Coverage added:
     - Critical UI section replay via sidebar.
     - Browser preview arbitrary URL input flow.
     - API contract smoke for `/api/search`, `/api/execute-task`, `/api/task-runs` invalid action path.

2. **Flaky-test detection harness**
   - Added: `scripts/flaky-scan.mjs`
   - Script runs Playwright with `--repeat-each` and reports unexpected/flaky counts.

3. **Synthetic monitoring probe (tonight-friendly)**
   - Added: `scripts/synthetic-monitor.mjs`
   - Probes `/api/search`, `/api/execute-task`, `/api/company` with timeout and p95 summary.

4. **Autonomous-agent observability snapshot**
   - Added: `scripts/autonomy-observability.mjs`
   - Reads runtime store/events (`/tmp/alabobai-task-runs.json*`) and reports:
     - state distribution
     - stale run candidates
     - recent retry signal

5. **NPM runbook wiring**
   - Updated `package.json` scripts:
     - `reliability:test:api`
     - `reliability:test:ui`
     - `reliability:flaky-scan`
     - `reliability:synthetic`
     - `reliability:autonomy-observability`

---

## Next step (not yet integrated tonight)
- Add MSW handlers for provider-dependent endpoints in reliability tests.
- Add k6 threshold script once k6 runtime is present on host.
- Promote observability output into a lightweight `/api/runtime-health` endpoint for dashboards.
