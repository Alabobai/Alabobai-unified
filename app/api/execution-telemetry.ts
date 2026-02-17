export const config = {
  runtime: 'edge',
}

import { getExecutionTelemetryEvents, getExecutionTelemetrySummary } from '../src/services/capabilityEngine/telemetry'

function responseJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return responseJson({}, 200)
  if (req.method !== 'GET') return responseJson({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const limitParam = Number(url.searchParams.get('limit') || '25')
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, Math.floor(limitParam))) : 25

  return responseJson(
    {
      summary: getExecutionTelemetrySummary(),
      records: getExecutionTelemetryEvents(limit),
    },
    200
  )
}
