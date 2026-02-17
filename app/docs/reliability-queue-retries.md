# Reliability Hardening #1: Queue + Retries Core

Date: 2026-02-14

## Summary
Implemented a minimal **durable-ish async job layer** for long-running media work (image/video) with:
- submit/status API flow
- bounded retries with exponential backoff
- degraded/fallback completion behavior to avoid hard backend 500s for common transient failures

This is additive and does not change `/api/execute-task` v1 behavior.

## New APIs

### `POST /api/jobs/submit`
Submit an async job.

Request body:
```json
{
  "type": "image",
  "payload": { "prompt": "clean fintech logo", "width": 512, "height": 512, "style": "logo" },
  "maxAttempts": 3
}
```

Response (`202`):
```json
{
  "ok": true,
  "jobId": "...",
  "status": "queued",
  "statusUrl": "/api/jobs/status?id=...",
  "attempts": { "current": 1, "max": 3 },
  "createdAt": "..."
}
```

### `GET /api/jobs/status?id=<jobId>`
Poll job status/result.

Returns `queued | running | retrying | succeeded | failed` plus attempts, retry timing, and result/error.

## Retry model
- Max attempts: default 3 (env-configurable), bounded to 1..5
- Backoff: exponential (`baseMs * 2^(attempt-1)`), capped (`MAX_RETRY_MS`)
- Retries triggered on known transient patterns (timeout/fetch/network/429/502/503/etc.)

## Durability model
- In-memory queue + best-effort persisted snapshot in `/tmp/alabobai-job-queue.json`
- Snapshot loads on function cold start (same host)
- Pragmatic for tonight; not a distributed queue

## Internal refactor
Extracted reusable media execution into:
- `api/_lib/media-tasks.ts`

Existing sync endpoints now delegate to this shared implementation:
- `/api/generate-image`
- `/api/generate-video`

## Env knobs
- `JOB_QUEUE_STORE_PATH` (default `/tmp/alabobai-job-queue.json`)
- `JOB_RETRY_BASE_MS` (default `1200`)
- `JOB_RETRY_MAX_MS` (default `15000`)
- `JOB_MAX_ATTEMPTS` (default `3`)

## Known limits
- Queue is process/host-local, not globally distributed.
- If no requests hit the service, no worker tick runs (polling/status naturally advances queued jobs).
