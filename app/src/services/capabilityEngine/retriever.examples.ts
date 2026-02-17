import { retrieveCapabilities } from './retriever'

interface RetrievalExample {
  task: string
  expectedTop: string
  note: string
}

export const RETRIEVER_EXAMPLES: RetrievalExample[] = [
  {
    task: 'create a business plan for an AI bookkeeping startup',
    expectedTop: 'company.plan',
    note: 'Prefer specific company planning over generic create company',
  },
  {
    task: 'open this url https://example.com and extract the key points',
    expectedTop: 'proxy.extract',
    note: 'Prefer URL-aware extract path over broad search/chat',
  },
  {
    task: 'show local ai models available on this machine',
    expectedTop: 'localai.models',
    note: 'Action+entity alignment for local-ai model listing',
  },
  {
    task: 'generate a logo for a robotics startup',
    expectedTop: 'media.image.generate',
    note: 'Image generation should outrank chat/general',
  },
]

export function runRetrieverExamples(): Array<{ task: string; top: string | null; ok: boolean }> {
  return RETRIEVER_EXAMPLES.map((example) => {
    const [topMatch] = retrieveCapabilities({ task: example.task, limit: 3 })
    const top = topMatch?.capability.id ?? null

    return {
      task: example.task,
      top,
      ok: top === example.expectedTop,
    }
  })
}
