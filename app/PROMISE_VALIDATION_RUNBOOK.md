# Promise Validation Runbook

_Last updated: 2026-02-21 23:56 PST_

## Goal
Move from "system is stable" to "platform reliably delivers what we promise users."

---

## 1) Core promises to validate daily

Define success by outcomes, not internal features.

### P1. Business plan generation
**Promise:** A founder can generate a usable company plan quickly.
- **Pass criteria:**
  - Plan generation endpoint succeeds (no 5xx/timeouts)
  - Output includes: mission, target customer, offer, GTM steps
  - Output is non-empty and coherent enough for immediate editing

### P2. Actionable execution steps
**Promise:** The platform turns intent into concrete execution tasks.
- **Pass criteria:**
  - `/api/execute-task` returns intent + non-empty execution steps
  - Steps are ordered and include at least one actionable verb

### P3. Code sandbox utility
**Promise:** Users can run basic snippets/tools successfully.
- **Pass criteria:**
  - Sandbox health endpoint returns 200
  - Trivial execute returns success envelope + output

### P4. Memory usefulness
**Promise:** Users can store and retrieve context reliably.
- **Pass criteria:**
  - remember endpoint accepts new context
  - search/stats/context endpoints return expected shape
  - no regression to empty/invalid schema responses

### P5. Preview UX reachability
**Promise:** A user can open and navigate major product surfaces.
- **Pass criteria:**
  - Preview URL returns 200 + HTML
  - Major sections reachable via UI checks

### P6. Reliability under repeat load
**Promise:** Core flow remains stable under repeated execution.
- **Pass criteria:**
  - flaky scan reports unexpected=0, flaky=0
  - observability run reports staleCandidateCount=0

---

## 2) Daily Promise Sweep (operator sequence)

Run from:
`/Users/alaboebai/Alabobai/alabobai-unified/app`

```bash
npm run lint
npm run build
npm run reliability:test:api
PREVIEW_URL=http://127.0.0.1:4173 npm run reliability:test:ui
PREVIEW_URL=http://127.0.0.1:4173 npm run reliability:test
npm run reliability:autonomy-observability
npm run reliability:flaky-scan
```

### Backend truth pass (required once backend is available)

```bash
API_BACKEND_ORIGIN=http://127.0.0.1:8888 npm run reliability:backend-hard-check
STRICT_NON_DEGRADED=1 npm run reliability:test:api
STRICT_NON_DEGRADED=1 PREVIEW_URL=http://127.0.0.1:4173 npm run reliability:test
```

---

## 3) Promise scorecard format (post-run)

Record in `OVERNIGHT_EXECUTION_STATUS.md` and include:

- **P1 Business plan:** PASS/FAIL/DEGRADED
- **P2 Execution steps:** PASS/FAIL/DEGRADED
- **P3 Sandbox:** PASS/FAIL/DEGRADED
- **P4 Memory:** PASS/FAIL/DEGRADED
- **P5 Preview UX:** PASS/FAIL/DEGRADED
- **P6 Repeat stability:** PASS/FAIL/DEGRADED

### Status labels
- **PASS:** fully validated and non-degraded in current target scope
- **DEGRADED:** fallback mode works, but upstream/full capability not proven
- **FAIL:** user-facing promise broken

---

## 4) Triage policy (what to fix first)

- **P0 (Immediate):** Any FAIL on P1–P4 (core user value)
- **P1 (Same day):** P5/P6 fails or repeated degraded state on P1–P4
- **P2 (Planned):** Skipped/gated scenarios without active customer impact

---

## 5) Exit criteria for “platform works as offered”

Declare this milestone only when:

1. P1–P6 are PASS for 3 consecutive sweeps
2. Backend hard-check is non-skipped and PASS in at least 1 daily run
3. Degraded headers are absent (or explicitly accepted) for core promise routes
4. No flaky/unexpected failures in repeat scans for two consecutive days

---

## 6) Ready-now command (run this immediately)

Use this single command to validate promise coverage with current stable checks:

```bash
npm run reliability:test:promises-now
```

It currently validates, end-to-end:
- Business-plan/company generation contract
- Execute-task intent + execution steps
- Code sandbox execution
- Preview reachability + major section navigation
- Flow replay path
- Repeat stability + observability

If backend is available and you want strict upstream truth in the same session, run after that:

```bash
API_BACKEND_ORIGIN=http://127.0.0.1:8888 npm run reliability:backend-hard-check
STRICT_NON_DEGRADED=1 npm run reliability:test:api
STRICT_NON_DEGRADED=1 PREVIEW_URL=http://127.0.0.1:4173 npm run reliability:test
```

## 7) Next hardening (optional)

When you want deeper business-claim granularity, add dedicated `tests/promise/*.spec.ts` files. Not required to start tonight because `reliability:test:promises-now` is already runnable now.
