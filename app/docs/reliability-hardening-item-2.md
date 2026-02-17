# Reliability hardening item #2: circuit breakers + health-gated routing

## What was added

### 1) Shared reliability layer
- New file: `api/_lib/reliability.ts`
- Provides:
  - In-memory circuit breaker registry (`closed` / `open` / `half-open`)
  - Failure/success tracking per dependency key
  - Service health probe with short TTL caching
  - Snapshot exports for diagnostics/status

### 2) Health-gated routing
- `api/chat.ts`
  - Checks Ollama health before primary execution.
  - Routes to fallback immediately when local unhealthy.
  - Adds circuit breaker protection around:
    - local chat (`chat.ollama`)
    - cloud fallback (`chat.cloudFallback`)

- `api/local-ai/chat.ts`
  - Checks Ollama health before chat execution.
  - Returns degraded local response (instead of hard fail) when unhealthy.
  - RAG search now gracefully skips when Qdrant unhealthy.
  - Circuit breaker protection around:
    - Ollama chat (`local-ai.ollama.chat`)
    - Ollama embeddings (`local-ai.ollama.embed`)
    - Qdrant search (`local-ai.qdrant.search`)

- `api/generate-image.ts`
  - Health-gates A1111/ComfyUI before generation.
  - Circuit breaker protection around backend calls.
  - Keeps existing SVG fallback behavior with warning metadata.

- `api/generate-video.ts`
  - Health-gates video backend before generation.
  - Circuit breaker protection around backend call.
  - Keeps existing animated fallback behavior with warning metadata.

### 3) Machine-readable health aggregation
- Extended `api/local-ai/status.ts`
  - Adds `machineReadable: true`
  - Aggregates health for:
    - Ollama
    - Qdrant
    - image backend
    - video backend
  - Exposes `circuitBreakers` snapshot
  - Exposes `healthCache` snapshot
  - Preserves prior route contract (`status`, `services`, `models`) while adding diagnostics fields.

## Smoke checks run

- Lint on changed files:

```bash
npx eslint api/chat.ts api/local-ai/chat.ts api/local-ai/status.ts api/generate-image.ts api/generate-video.ts api/_lib/reliability.ts
```

Result: passed (no lint errors reported).

## Suggested runtime smoke checks (manual)

1. Healthy path:
```bash
curl -s http://localhost:3000/api/local-ai/status | jq
```
Expect `machineReadable: true`, services mostly connected, and circuit states present.

2. Unhealthy local chat path (stop Ollama):
```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"stream":false,"messages":[{"role":"user","content":"hello"}]}' | jq
```
Expect graceful degraded/cloud-fallback response (not hard 500).

3. Unhealthy media path (stop image/video backends):
```bash
curl -s -X POST http://localhost:3000/api/generate-image \
  -H 'content-type: application/json' \
  -d '{"prompt":"brand logo"}' | jq

curl -s -X POST http://localhost:3000/api/generate-video \
  -H 'content-type: application/json' \
  -d '{"prompt":"futuristic flythrough"}' | jq
```
Expect `fallback: true` with warning and circuit metadata.
