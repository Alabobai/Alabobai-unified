import type { CapabilityMatch, PlanStep, TaskIntent } from './types'

function buildPayload(intent: TaskIntent, task: string, capability: CapabilityMatch): Record<string, unknown> {
  const defaults = capability.capability.defaultPayload || {}

  if (capability.capability.id === 'company.plan') {
    return {
      ...defaults,
      name: 'Generated Company',
      companyType: 'technology',
      description: task,
    }
  }

  if (capability.capability.id === 'company.create') {
    return {
      ...defaults,
      name: 'Generated Company',
      companyType: 'technology',
      description: task,
    }
  }

  if (capability.capability.id === 'company.name') {
    return {
      ...defaults,
      companyType: 'technology',
      industry: 'technology',
      description: task,
    }
  }

  if (capability.capability.id === 'research.search') {
    return {
      ...defaults,
      query: task,
    }
  }

  if (capability.capability.id === 'media.image.generate') {
    return {
      ...defaults,
      prompt: task,
    }
  }

  if (capability.capability.id === 'media.video.generate') {
    return {
      ...defaults,
      prompt: task,
    }
  }

  if (capability.capability.id === 'proxy.search') {
    return {
      ...defaults,
      query: task,
    }
  }

  if (capability.capability.id === 'chat.general') {
    return {
      ...defaults,
      messages: [{ role: 'user', content: task }],
    }
  }

  return {
    ...defaults,
    task,
    intent: intent.label,
  }
}

export function planExecution(intent: TaskIntent, task: string, matches: CapabilityMatch[]): PlanStep[] {
  if (matches.length === 0) return []

  // v1 deterministic template: execute top-ranked capability only for lower latency and fewer false blocks.
  const selected = matches.slice(0, 1)

  return selected.map((match, idx) => ({
    step: idx + 1,
    capabilityId: match.capability.id,
    route: match.capability.route,
    method: match.capability.method,
    goal: `Execute ${match.capability.name} for intent ${intent.label}`,
    payload: match.capability.method === 'POST' ? buildPayload(intent, task, match) : undefined,
  }))
}
