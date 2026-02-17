# Capability Engine Spec (v1)

## Status
Production slice v1 (additive, non-breaking)

## API Contract

### `POST /api/execute-task`

Request:

```json
{
  "task": "create company plan for ai bookkeeping startup",
  "context": { "userId": "u_123" },
  "dryRun": false
}
```

Response shape:

```json
{
  "intent": { "label": "company.plan", "confidence": 0.92, "normalizedTask": "..." },
  "matchedCapabilities": [
    {
      "capability": { "id": "company.plan", "route": "/api/company", "method": "POST" },
      "score": 8.7,
      "reasons": ["trigger:business plan", "tag:company"]
    }
  ],
  "plan": [
    {
      "step": 1,
      "capabilityId": "company.plan",
      "route": "/api/company",
      "method": "POST",
      "goal": "Execute Generate Company Plan for intent company.plan",
      "payload": { "action": "generate-plan", "name": "Generated Company" }
    }
  ],
  "execution": {
    "dryRun": false,
    "steps": [
      {
        "step": 1,
        "capabilityId": "company.plan",
        "ok": true,
        "status": 200,
        "route": "/api/company",
        "method": "POST",
        "data": { "plan": {} }
      }
    ]
  },
  "status": "ok",
  "diagnostics": { "degraded": false, "notes": [], "failures": [] }
}
```

## Status values

- `ok`: all planned steps succeeded
- `partial`: some steps succeeded, some failed
- `degraded`: plan/execution degraded but system responded safely
- `no-match`: no capability could be selected
- `error`: reserved for future terminal states (not emitted in normal v1)

## Retrieval (v1.1 hardening)

Current retrieval is deterministic and lightweight, but now uses weighted ranking and precision guardrails:

- Normalize + tokenize task text with stop-word filtering
- Weighted scoring across:
  - exact trigger phrase hits (high weight)
  - exact/partial tag overlap
  - name/id/description token overlap
  - domain match + action-alignment (`create`, `search`, `fetch`, `generate`, etc.)
- Guardrails to reduce false positives:
  - URL-oriented capabilities (`fetch`/`extract`) are penalized without URL/page context
  - webhook/local-ai system endpoints require matching context words
  - `chat.general` is kept as fallback but receives a broadness penalty
- Tie-breakers prioritize precision signals in deterministic order:
  1. score
  2. exact trigger hits
  3. exact tag hits
  4. stable lexical capability id
- Dynamic floor keeps only sufficiently relevant matches relative to the best score

### Retrieval examples (before → after intent quality)

- `"create a business plan for an AI bookkeeping startup"`
  - before: could over-rank `company.create`
  - after: `company.plan` ranks first due to trigger+action alignment
- `"open this url https://example.com and extract key points"`
  - before: could drift toward generic research/search
  - after: `proxy.extract` or `research.fetch-page` rank above broad routes
- `"show local ai models available"`
  - before: could match `localai.chat` from generic chat terms
  - after: `localai.models` ranks first from models-specific alignment
- `"generate a logo for a robotics startup"`
  - before: chat fallback occasionally noisy in top-k
  - after: `media.image.generate` ranks first; `chat.general` demoted unless truly needed

See `src/services/capabilityEngine/retriever.examples.ts` for executable example fixtures.

## Planning (v1)

Deterministic template:
- top capability as primary step
- optional second step from ranked list as fallback/secondary
- map task text into capability-specific payload fields (`prompt`, `query`, etc.)

## Execution (v1)

- Execute each step by route+method using `fetch`
- On `dryRun`, do not call downstream APIs
- Capture status/data/error per step
- Never throw for common step failures; report structured diagnostics

## UI Integration (v1)

Chat flow supports command-path routing to capability engine when prompt matches task patterns such as:
- create company plan
- research topic
- generate image
- generate video

Display includes:
- intent
- matched capabilities
- execution status
- concise result snapshot

## Catalog Coverage (v1)

Catalog includes mapped capabilities for:
- chat
- company create/plan/name
- deep research/search
- image generation
- video generation
- local-ai chat/models/stats/ingest/search
- proxy fetch/extract/search
- webhook events/dispatch

## Non-goals (v1)

- autonomous replanning loops
- long-running job orchestration
- persistent retries/queueing
- circuit breaker persistence

## Execution Telemetry (v1 hardening item #4)

Telemetry is captured per execution step with low overhead and no payload/body logging.

Structured event fields:
- `capabilityId`
- `step`
- `latencyMs`
- `failureClass` (`success | http_error | runtime_error | dry_run`)
- `fallbackUsed` (true when secondary step is used)
- `status` (HTTP status when available)
- `ts` (ISO timestamp)

Storage strategy:
- In-memory ring buffer (max 500 events per runtime instance)
- Optional JSONL file sink for local dev via `CAPABILITY_TELEMETRY_LOG_FILE=/tmp/capability-telemetry.log`
- File sink is best-effort and never blocks or fails request execution

### `GET /api/execution-telemetry`

Returns a quick summary and recent records.

Query params:
- `limit` (optional, default `25`, max `200`)

Response example:

```json
{
  "summary": {
    "total": 4,
    "successful": 3,
    "successRate": 0.75,
    "fallbackUsed": 1,
    "fallbackRate": 0.25,
    "avgLatencyMs": 142,
    "byCapability": {
      "company.plan": { "count": 2, "errors": 1, "avgLatencyMs": 201 },
      "research.search": { "count": 2, "errors": 0, "avgLatencyMs": 84 }
    },
    "latestTimestamp": "2026-02-15T07:31:02.120Z"
  },
  "records": [
    {
      "ts": "2026-02-15T07:30:59.901Z",
      "capabilityId": "company.plan",
      "step": 1,
      "latencyMs": 188,
      "failureClass": "success",
      "fallbackUsed": false,
      "status": 200
    }
  ]
}
```

## TODO v2

- queue + retries + breaker state
- semantic embeddings retrieval + rerank
- execution idempotency keys
- richer tool auth policy and allowlist constraints
