import catalog from '@/capabilities/catalog.v1.json'
import type {
  CapabilityDefinition,
  CapabilityMatch,
  RetrievalInput,
  TaskIntent,
} from './types'

interface CatalogShape {
  version: string
  capabilities: CapabilityDefinition[]
}

interface MatchDiagnostics {
  score: number
  reasons: string[]
  exactTriggerHits: number
  phraseHits: number
  exactTagHits: number
}

const typedCatalog = catalog as CatalogShape

const INTENT_HINTS: Array<{ label: string; words: string[] }> = [
  { label: 'company.plan', words: ['company plan', 'business plan', 'startup plan'] },
  { label: 'company.create', words: ['create company', 'new company'] },
  { label: 'research.search', words: ['research', 'search', 'find sources'] },
  { label: 'media.image.generate', words: ['image', 'logo', 'illustration'] },
  { label: 'media.video.generate', words: ['video', 'animation', 'motion'] },
]

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'please',
  'that',
  'the',
  'to',
  'want',
  'with',
  'you',
])

const ACTION_KEYWORDS: Record<string, string[]> = {
  create: ['create', 'new', 'build', 'start', 'setup'],
  plan: ['plan', 'strategy', 'roadmap'],
  name: ['name', 'naming', 'brand'],
  search: ['search', 'research', 'find', 'lookup', 'discover'],
  fetch: ['fetch', 'open', 'load', 'read', 'visit', 'crawl'],
  extract: ['extract', 'parse', 'scrape', 'summarize'],
  generate: ['generate', 'make', 'design', 'draw', 'produce'],
  chat: ['chat', 'talk', 'ask', 'explain', 'help'],
  models: ['model', 'models', 'list models'],
  stats: ['stats', 'statistics', 'metrics'],
  ingest: ['ingest', 'index', 'embed', 'store'],
  dispatch: ['dispatch', 'send', 'trigger'],
  events: ['events', 'logs', 'history'],
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(input: string): string[] {
  return normalize(input)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function toTokenSet(input: string): Set<string> {
  return new Set(tokenize(input))
}

function hasPhrase(task: string, phrase: string): boolean {
  if (!phrase) return false
  const normalizedPhrase = normalize(phrase)
  if (!normalizedPhrase) return false
  const pattern = new RegExp(`(^|\\s)${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
  return pattern.test(task)
}

function scoreActionAlignment(taskTokens: Set<string>, capability: CapabilityDefinition): number {
  const idAction = capability.id.split('.')[1] || ''
  const candidateActions = new Set<string>([idAction])

  if (capability.id.includes('generate')) candidateActions.add('generate')
  if (capability.id.includes('search')) candidateActions.add('search')
  if (capability.id.includes('fetch')) candidateActions.add('fetch')

  let score = 0
  for (const action of candidateActions) {
    const words = ACTION_KEYWORDS[action]
    if (!words) continue
    if (words.some((word) => taskTokens.has(word))) {
      score += 1.2
    }
  }
  return score
}

function applyGuardrails(task: string, taskTokens: Set<string>, capability: CapabilityDefinition, score: number, reasons: string[]): number {
  const id = capability.id
  const hasUrlHints = /https?:\/\//.test(task) || ['url', 'website', 'webpage', 'page', 'link'].some((t) => taskTokens.has(t))

  if ((id === 'research.fetch-page' || id === 'proxy.fetch' || id === 'proxy.extract') && !hasUrlHints) {
    score -= 2.2
    reasons.push('guardrail:needs-url-context')
  }

  if (id.startsWith('webhook.') && !['webhook', 'integration', 'event', 'events', 'dispatch'].some((t) => taskTokens.has(t))) {
    score -= 2.8
    reasons.push('guardrail:webhook-context-missing')
  }

  if ((id === 'localai.models' || id === 'localai.stats') && !['model', 'models', 'stats', 'statistics', 'knowledge'].some((t) => taskTokens.has(t))) {
    score -= 2
    reasons.push('guardrail:system-query-mismatch')
  }

  if (id.startsWith('localai.') && !['local', 'ollama', 'ondevice', 'on-device', 'selfhosted', 'self-hosted', 'model', 'models'].some((t) => taskTokens.has(t))) {
    score -= 2.4
    reasons.push('guardrail:localai-context-missing')
  }

  return score
}

function scoreCapability(task: string, taskTokens: Set<string>, capability: CapabilityDefinition): MatchDiagnostics {
  let score = 0
  const reasons: string[] = []
  let exactTriggerHits = 0
  let phraseHits = 0
  let exactTagHits = 0

  const capabilityNameTokens = toTokenSet(capability.name)
  const capabilityDescTokens = toTokenSet(capability.description)
  const idTokens = toTokenSet(capability.id.replace(/\./g, ' '))

  for (const tag of capability.tags) {
    const tagTokens = toTokenSet(tag)
    const overlap = [...tagTokens].filter((token) => taskTokens.has(token))

    if (overlap.length === tagTokens.size && tagTokens.size > 0) {
      score += tagTokens.size > 1 ? 3.3 : 2.6
      exactTagHits += 1
      reasons.push(`tag-exact:${tag.toLowerCase()}`)
    } else if (overlap.length > 0) {
      score += overlap.length * 1.1
      reasons.push(`tag-partial:${tag.toLowerCase()}`)
    }
  }

  for (const trigger of capability.triggers) {
    if (hasPhrase(task, trigger)) {
      score += 5
      exactTriggerHits += 1
      reasons.push(`trigger-exact:${trigger.toLowerCase()}`)
      continue
    }

    const triggerTokens = toTokenSet(trigger)
    const overlap = [...triggerTokens].filter((token) => taskTokens.has(token))

    if (overlap.length >= Math.max(1, Math.ceil(triggerTokens.size * 0.6))) {
      score += Math.min(3, overlap.length * 1.25)
      phraseHits += 1
      reasons.push(`trigger-partial:${trigger.toLowerCase()}`)
    }
  }

  for (const token of taskTokens) {
    if (capabilityNameTokens.has(token)) {
      score += 1.4
      reasons.push(`name:${token}`)
    } else if (idTokens.has(token)) {
      score += 1.2
      reasons.push(`id:${token}`)
    } else if (capabilityDescTokens.has(token)) {
      score += 0.7
      reasons.push(`desc:${token}`)
    }
  }

  if (taskTokens.has(capability.domain)) {
    score += 1.4
    reasons.push(`domain:${capability.domain}`)
  }

  const actionAlignment = scoreActionAlignment(taskTokens, capability)
  if (actionAlignment > 0) {
    score += actionAlignment
    reasons.push('action-alignment')
  }

  score = applyGuardrails(task, taskTokens, capability, score, reasons)

  if (capability.id === 'chat.general') {
    // Keep chat.general as broad fallback, but reduce accidental dominance.
    score = score * 0.6
    reasons.push('guardrail:broad-fallback-penalty')
  }

  return {
    score: Number(score.toFixed(4)),
    reasons,
    exactTriggerHits,
    phraseHits,
    exactTagHits,
  }
}

function compareMatches(a: CapabilityMatch, b: CapabilityMatch): number {
  if (b.score !== a.score) return b.score - a.score

  const triggerA = a.reasons.filter((reason) => reason.startsWith('trigger-exact:')).length
  const triggerB = b.reasons.filter((reason) => reason.startsWith('trigger-exact:')).length
  if (triggerB !== triggerA) return triggerB - triggerA

  const tagA = a.reasons.filter((reason) => reason.startsWith('tag-exact:')).length
  const tagB = b.reasons.filter((reason) => reason.startsWith('tag-exact:')).length
  if (tagB !== tagA) return tagB - tagA

  return a.capability.id.localeCompare(b.capability.id)
}

export function inferIntent(task: string): TaskIntent {
  const normalizedTask = task.trim().toLowerCase()
  let best = { label: 'chat.general', confidence: 0.4 }

  for (const hint of INTENT_HINTS) {
    const hitCount = hint.words.reduce((count, word) => {
      return count + (normalizedTask.includes(word) ? 1 : 0)
    }, 0)

    if (hitCount > 0) {
      const confidence = Math.min(0.55 + hitCount * 0.2, 0.95)
      if (confidence > best.confidence) {
        best = { label: hint.label, confidence }
      }
    }
  }

  return {
    label: best.label,
    confidence: Number(best.confidence.toFixed(2)),
    normalizedTask,
  }
}

export function retrieveCapabilities(input: RetrievalInput): CapabilityMatch[] {
  const limit = Math.max(1, Math.min(input.limit ?? 5, 10))
  const task = normalize(input.task?.trim() || '')

  if (!task) return []

  const taskTokens = new Set(tokenize(task))
  const scoredMatches = typedCatalog.capabilities
    .map((capability) => {
      const diagnostics = scoreCapability(task, taskTokens, capability)
      return {
        capability,
        score: diagnostics.score,
        reasons: diagnostics.reasons,
        tieBreak: {
          exactTriggerHits: diagnostics.exactTriggerHits,
          phraseHits: diagnostics.phraseHits,
          exactTagHits: diagnostics.exactTagHits,
        },
      }
    })
    .filter((match) => match.score > 0)

  if (scoredMatches.length === 0) {
    const fallback = typedCatalog.capabilities.find((c) => c.id === 'chat.general')
    return fallback
      ? [{ capability: fallback, score: 1, reasons: ['fallback:chat.general'] }]
      : []
  }

  scoredMatches.sort((a, b) => compareMatches(a, b))

  const bestScore = scoredMatches[0]?.score ?? 0
  const floor = Math.max(2.4, bestScore * 0.45)

  const filtered = scoredMatches.filter((match) => {
    if (match.capability.id === 'chat.general' && bestScore >= 4.5 && match.score < bestScore * 0.85) {
      return false
    }
    return match.score >= floor
  })

  const finalMatches = filtered.length > 0
    ? filtered
    : (() => {
        const fallback = typedCatalog.capabilities.find((c) => c.id === 'chat.general')
        return fallback ? [{ capability: fallback, score: 1, reasons: ['fallback:chat.general'] }] : []
      })()

  return finalMatches.slice(0, limit).map(({ capability, score, reasons }) => ({
    capability,
    score,
    reasons,
  }))
}

export function getCapabilityCatalogVersion(): string {
  return typedCatalog.version
}
