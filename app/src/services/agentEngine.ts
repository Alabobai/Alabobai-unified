/**
 * Agent Execution Engine
 * Real autonomous agent execution with actual tool usage
 * Inspired by Agent Zero - agents have goals, create plans, execute steps, use tools, report results
 */

import { aiService } from './ai'

// ============================================================================
// TYPES
// ============================================================================

export interface AgentStep {
  id: string
  type: 'think' | 'search' | 'browse' | 'code' | 'analyze' | 'execute' | 'complete'
  description: string
  status: 'pending' | 'running' | 'success' | 'error' | 'retry'
  result?: string
  error?: string
  startTime?: Date
  endTime?: Date
  retryCount: number
  maxRetries: number
  toolUsed?: string
  metadata?: Record<string, unknown>
}

export interface AgentPlan {
  goal: string
  steps: AgentStep[]
  currentStepIndex: number
  status: 'planning' | 'executing' | 'complete' | 'failed' | 'paused'
  createdAt: Date
  outputs: AgentOutput[]
}

export interface AgentOutput {
  id: string
  type: 'code' | 'text' | 'data' | 'file' | 'search_results' | 'web_content'
  title: string
  content: string
  metadata?: Record<string, unknown>
  timestamp: Date
}

export interface AgentExecutionCallbacks {
  onStepStart: (step: AgentStep) => void
  onStepComplete: (step: AgentStep) => void
  onStepError: (step: AgentStep, error: string) => void
  onOutput: (output: AgentOutput) => void
  onPlanUpdate: (plan: AgentPlan) => void
  onLog: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
  onProgress: (percent: number, phase: string) => void
}

// ============================================================================
// REAL TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * DuckDuckGo Web Search - No API key needed
 */
async function webSearch(query: string): Promise<{ results: Array<{ title: string; url: string; snippet: string }> }> {
  try {
    // Try the API endpoint first
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 8 })
    })

    if (response.ok) {
      const data = await response.json()
      return { results: data.results || [] }
    }

    // Fallback: Use DuckDuckGo instant answer API (limited but works)
    const ddgResponse = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (ddgResponse.ok) {
      const ddgData = await ddgResponse.json()
      const results: Array<{ title: string; url: string; snippet: string }> = []

      // Extract from Abstract
      if (ddgData.Abstract && ddgData.AbstractURL) {
        results.push({
          title: ddgData.Heading || 'Wikipedia',
          url: ddgData.AbstractURL,
          snippet: ddgData.Abstract
        })
      }

      // Extract from Related Topics
      if (ddgData.RelatedTopics) {
        for (const topic of ddgData.RelatedTopics.slice(0, 5)) {
          if (topic.FirstURL && topic.Text) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
              url: topic.FirstURL,
              snippet: topic.Text
            })
          }
        }
      }

      return { results }
    }

    return { results: [] }
  } catch (error) {
    console.error('Search error:', error)
    return { results: [] }
  }
}

/**
 * Fetch and parse web page content
 */
async function fetchWebPage(url: string): Promise<{ content: string; title: string; links: string[] }> {
  try {
    // Use a CORS proxy for client-side fetching
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`

    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }

    const html = await response.text()

    // Parse HTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Get title
    const title = doc.querySelector('title')?.textContent || url

    // Get main text content
    const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript')
    elementsToRemove.forEach(el => el.remove())

    // Get text from body
    const body = doc.querySelector('body')
    let content = body?.textContent || ''

    // Clean up whitespace
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .slice(0, 5000) // Limit content size

    // Extract links
    const links: string[] = []
    doc.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href')
      if (href && href.startsWith('http')) {
        links.push(href)
      }
    })

    return { content, title, links: links.slice(0, 20) }
  } catch (error) {
    console.error('Fetch error:', error)
    return { content: '', title: url, links: [] }
  }
}

/**
 * Generate code using AI
 */
async function generateCode(prompt: string, context?: string): Promise<string> {
  const systemPrompt = `You are an expert software developer. Generate clean, production-ready code.
${context ? `Context: ${context}` : ''}

Rules:
- Write complete, working code
- Use TypeScript for type safety
- Include comments for complex logic
- Follow best practices
- Make it beautiful with Tailwind CSS for UI
- Return ONLY code, no explanations before or after`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: prompt }
  ]

  try {
    const response = await aiService.chatSync(messages)
    return response
  } catch (error) {
    console.error('Code generation error:', error)
    throw new Error('Failed to generate code')
  }
}

/**
 * Analyze content with AI
 */
async function analyzeContent(content: string, task: string): Promise<string> {
  const messages = [
    {
      role: 'system' as const,
      content: 'You are an expert analyst. Analyze the given content and provide insights.'
    },
    {
      role: 'user' as const,
      content: `Task: ${task}\n\nContent to analyze:\n${content.slice(0, 4000)}`
    }
  ]

  try {
    const response = await aiService.chatSync(messages)
    return response
  } catch (error) {
    console.error('Analysis error:', error)
    throw new Error('Failed to analyze content')
  }
}

/**
 * Create a plan from a goal using AI
 */
async function createPlan(goal: string): Promise<AgentStep[]> {
  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert task planner. Break down goals into specific, actionable steps.

Available actions:
- search: Search the web for information
- browse: Fetch and read a web page
- code: Generate code or create files
- analyze: Analyze data or content
- execute: Run a command or action

Return ONLY a JSON array of steps in this format:
[
  {"type": "search", "description": "Search for X"},
  {"type": "code", "description": "Create component for Y"},
  ...
]

Keep plans focused and practical (3-8 steps typically).`
    },
    {
      role: 'user' as const,
      content: `Create a plan to: ${goal}`
    }
  ]

  try {
    const response = await aiService.chatSync(messages)

    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('No valid plan JSON found')
    }

    const stepsData = JSON.parse(jsonMatch[0])

    return stepsData.map((step: { type: string; description: string }, index: number) => ({
      id: `step-${Date.now()}-${index}`,
      type: step.type as AgentStep['type'],
      description: step.description,
      status: 'pending' as const,
      retryCount: 0,
      maxRetries: 2
    }))
  } catch (error) {
    console.error('Plan creation error:', error)

    // Return a default plan based on keywords
    const steps: AgentStep[] = []
    const lowerGoal = goal.toLowerCase()

    if (lowerGoal.includes('research') || lowerGoal.includes('find') || lowerGoal.includes('search')) {
      steps.push({
        id: `step-${Date.now()}-0`,
        type: 'search',
        description: `Search for information about: ${goal}`,
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      })
    }

    if (lowerGoal.includes('build') || lowerGoal.includes('create') || lowerGoal.includes('landing page') || lowerGoal.includes('website')) {
      steps.push({
        id: `step-${Date.now()}-1`,
        type: 'search',
        description: 'Research modern design trends and best practices',
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      })
      steps.push({
        id: `step-${Date.now()}-2`,
        type: 'analyze',
        description: 'Analyze requirements and plan structure',
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      })
      steps.push({
        id: `step-${Date.now()}-3`,
        type: 'code',
        description: `Generate code for: ${goal}`,
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      })
    }

    if (lowerGoal.includes('analyze') || lowerGoal.includes('data') || lowerGoal.includes('dashboard')) {
      steps.push({
        id: `step-${Date.now()}-4`,
        type: 'analyze',
        description: 'Analyze requirements and data structure',
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      })
    }

    // Always add completion step
    steps.push({
      id: `step-${Date.now()}-final`,
      type: 'complete',
      description: 'Finalize and deliver results',
      status: 'pending',
      retryCount: 0,
      maxRetries: 1
    })

    return steps.length > 1 ? steps : [
      {
        id: `step-${Date.now()}-0`,
        type: 'think',
        description: 'Analyze the goal and determine approach',
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      },
      {
        id: `step-${Date.now()}-1`,
        type: 'execute',
        description: goal,
        status: 'pending',
        retryCount: 0,
        maxRetries: 2
      },
      {
        id: `step-${Date.now()}-2`,
        type: 'complete',
        description: 'Deliver final results',
        status: 'pending',
        retryCount: 0,
        maxRetries: 1
      }
    ]
  }
}

// ============================================================================
// AGENT EXECUTION ENGINE
// ============================================================================

export class AgentExecutionEngine {
  private plan: AgentPlan | null = null
  private callbacks: AgentExecutionCallbacks | null = null
  private isPaused = false
  private isStopped = false
  private context: Map<string, string> = new Map()

  async execute(goal: string, callbacks: AgentExecutionCallbacks): Promise<AgentPlan> {
    this.callbacks = callbacks
    this.isPaused = false
    this.isStopped = false
    this.context.clear()

    // Phase 1: Planning
    callbacks.onProgress(5, 'Planning')
    callbacks.onLog(`Starting autonomous execution for: "${goal}"`, 'info')

    const steps = await createPlan(goal)
    callbacks.onLog(`Created plan with ${steps.length} steps`, 'success')

    this.plan = {
      goal,
      steps,
      currentStepIndex: 0,
      status: 'executing',
      createdAt: new Date(),
      outputs: []
    }
    callbacks.onPlanUpdate(this.plan)

    // Phase 2: Execution
    for (let i = 0; i < this.plan.steps.length; i++) {
      if (this.isStopped) {
        this.plan.status = 'failed'
        callbacks.onLog('Execution stopped by user', 'warning')
        break
      }

      while (this.isPaused) {
        await this.delay(500)
        if (this.isStopped) break
      }

      this.plan.currentStepIndex = i
      const step = this.plan.steps[i]
      const progressPercent = 10 + Math.floor((i / this.plan.steps.length) * 85)

      callbacks.onProgress(progressPercent, `Step ${i + 1}: ${step.description.slice(0, 50)}...`)
      await this.executeStep(step, callbacks)

      callbacks.onPlanUpdate(this.plan)
    }

    // Phase 3: Complete
    if (!this.isStopped) {
      this.plan.status = 'complete'
      callbacks.onProgress(100, 'Complete')
      callbacks.onLog('All tasks completed successfully!', 'success')
    }

    callbacks.onPlanUpdate(this.plan)
    return this.plan
  }

  private async executeStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.status = 'running'
    step.startTime = new Date()
    callbacks.onStepStart(step)
    callbacks.onLog(`Executing: ${step.description}`, 'info')

    try {
      switch (step.type) {
        case 'search':
          await this.executeSearchStep(step, callbacks)
          break
        case 'browse':
          await this.executeBrowseStep(step, callbacks)
          break
        case 'code':
          await this.executeCodeStep(step, callbacks)
          break
        case 'analyze':
          await this.executeAnalyzeStep(step, callbacks)
          break
        case 'think':
          await this.executeThinkStep(step, callbacks)
          break
        case 'execute':
          await this.executeActionStep(step, callbacks)
          break
        case 'complete':
          await this.executeCompleteStep(step, callbacks)
          break
        default:
          step.result = 'Step type not implemented'
      }

      step.status = 'success'
      step.endTime = new Date()
      callbacks.onStepComplete(step)
      callbacks.onLog(`Completed: ${step.description}`, 'success')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (step.retryCount < step.maxRetries) {
        step.retryCount++
        step.status = 'retry'
        callbacks.onLog(`Retrying (${step.retryCount}/${step.maxRetries}): ${errorMessage}`, 'warning')
        await this.delay(1000)
        await this.executeStep(step, callbacks)
      } else {
        step.status = 'error'
        step.error = errorMessage
        step.endTime = new Date()
        callbacks.onStepError(step, errorMessage)
        callbacks.onLog(`Failed: ${errorMessage}`, 'error')
      }
    }
  }

  private async executeSearchStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'web_search'

    // Extract search query from description
    const query = step.description.replace(/^search\s+(for\s+)?/i, '').trim()
    callbacks.onLog(`Searching: "${query}"`, 'info')

    const searchResults = await webSearch(query)

    if (searchResults.results.length === 0) {
      throw new Error('No search results found')
    }

    // Format results
    const formattedResults = searchResults.results.map((r, i) =>
      `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
    ).join('\n\n')

    step.result = formattedResults

    // Store in context for later use
    this.context.set('search_results', formattedResults)
    this.context.set('search_urls', searchResults.results.map(r => r.url).join('\n'))

    // Create output
    const output: AgentOutput = {
      id: `output-${Date.now()}`,
      type: 'search_results',
      title: `Search: ${query}`,
      content: formattedResults,
      metadata: { query, resultCount: searchResults.results.length },
      timestamp: new Date()
    }

    this.plan?.outputs.push(output)
    callbacks.onOutput(output)
  }

  private async executeBrowseStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'web_fetch'

    // Extract URL from description or use from search results
    let url = ''
    const urlMatch = step.description.match(/https?:\/\/[^\s]+/)
    if (urlMatch) {
      url = urlMatch[0]
    } else {
      // Try to get first URL from search results
      const searchUrls = this.context.get('search_urls')
      if (searchUrls) {
        url = searchUrls.split('\n')[0]
      }
    }

    if (!url) {
      throw new Error('No URL to browse')
    }

    callbacks.onLog(`Fetching: ${url}`, 'info')
    const pageContent = await fetchWebPage(url)

    if (!pageContent.content) {
      throw new Error('Failed to fetch page content')
    }

    step.result = `Title: ${pageContent.title}\n\nContent:\n${pageContent.content.slice(0, 2000)}`

    // Store in context
    this.context.set('page_content', pageContent.content)
    this.context.set('page_title', pageContent.title)

    // Create output
    const output: AgentOutput = {
      id: `output-${Date.now()}`,
      type: 'web_content',
      title: pageContent.title,
      content: pageContent.content,
      metadata: { url, linksFound: pageContent.links.length },
      timestamp: new Date()
    }

    this.plan?.outputs.push(output)
    callbacks.onOutput(output)
  }

  private async executeCodeStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'code_generation'

    // Build context from previous steps
    let context = ''
    if (this.context.has('search_results')) {
      context += `Research findings:\n${this.context.get('search_results')?.slice(0, 1000)}\n\n`
    }
    if (this.context.has('analysis')) {
      context += `Analysis:\n${this.context.get('analysis')}\n\n`
    }

    callbacks.onLog('Generating code...', 'info')
    const code = await generateCode(step.description, context || undefined)

    step.result = code

    // Store in context
    this.context.set('generated_code', code)

    // Create output
    const output: AgentOutput = {
      id: `output-${Date.now()}`,
      type: 'code',
      title: `Generated Code: ${step.description.slice(0, 50)}...`,
      content: code,
      timestamp: new Date()
    }

    this.plan?.outputs.push(output)
    callbacks.onOutput(output)
  }

  private async executeAnalyzeStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'ai_analysis'

    // Get content to analyze from context
    let contentToAnalyze = ''
    if (this.context.has('page_content')) {
      contentToAnalyze = this.context.get('page_content') || ''
    } else if (this.context.has('search_results')) {
      contentToAnalyze = this.context.get('search_results') || ''
    } else {
      contentToAnalyze = this.plan?.goal || step.description
    }

    callbacks.onLog('Analyzing...', 'info')
    const analysis = await analyzeContent(contentToAnalyze, step.description)

    step.result = analysis

    // Store in context
    this.context.set('analysis', analysis)

    // Create output
    const output: AgentOutput = {
      id: `output-${Date.now()}`,
      type: 'text',
      title: `Analysis: ${step.description.slice(0, 50)}...`,
      content: analysis,
      timestamp: new Date()
    }

    this.plan?.outputs.push(output)
    callbacks.onOutput(output)
  }

  private async executeThinkStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'reasoning'

    callbacks.onLog('Thinking...', 'info')

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a strategic thinker. Analyze the task and provide clear insights and recommendations.'
      },
      {
        role: 'user' as const,
        content: `Goal: ${this.plan?.goal}\n\nCurrent task: ${step.description}\n\nContext available: ${Array.from(this.context.keys()).join(', ')}`
      }
    ]

    const thought = await aiService.chatSync(messages)

    step.result = thought
    this.context.set('thoughts', thought)

    // Create output
    const output: AgentOutput = {
      id: `output-${Date.now()}`,
      type: 'text',
      title: 'Strategic Thinking',
      content: thought,
      timestamp: new Date()
    }

    this.plan?.outputs.push(output)
    callbacks.onOutput(output)
  }

  private async executeActionStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'action_execution'

    // Determine what action to take based on description
    const desc = step.description.toLowerCase()

    if (desc.includes('search') || desc.includes('find') || desc.includes('research')) {
      await this.executeSearchStep(step, callbacks)
    } else if (desc.includes('build') || desc.includes('create') || desc.includes('generate') || desc.includes('code')) {
      await this.executeCodeStep(step, callbacks)
    } else if (desc.includes('analyze') || desc.includes('review')) {
      await this.executeAnalyzeStep(step, callbacks)
    } else {
      // Default: use AI to execute
      const result = await analyzeContent(step.description, 'Execute this task and provide results')
      step.result = result

      const output: AgentOutput = {
        id: `output-${Date.now()}`,
        type: 'text',
        title: step.description,
        content: result,
        timestamp: new Date()
      }

      this.plan?.outputs.push(output)
      callbacks.onOutput(output)
    }
  }

  private async executeCompleteStep(step: AgentStep, callbacks: AgentExecutionCallbacks): Promise<void> {
    step.toolUsed = 'completion'

    // Summarize all outputs
    const outputs = this.plan?.outputs || []
    const summary = outputs.map(o => `- ${o.title}`).join('\n')

    step.result = `Completed ${outputs.length} outputs:\n${summary}`

    callbacks.onLog(`Generated ${outputs.length} outputs`, 'success')
  }

  pause(): void {
    this.isPaused = true
    if (this.plan) {
      this.plan.status = 'paused'
      this.callbacks?.onPlanUpdate(this.plan)
      this.callbacks?.onLog('Execution paused', 'warning')
    }
  }

  resume(): void {
    this.isPaused = false
    if (this.plan) {
      this.plan.status = 'executing'
      this.callbacks?.onPlanUpdate(this.plan)
      this.callbacks?.onLog('Execution resumed', 'info')
    }
  }

  stop(): void {
    this.isStopped = true
    this.isPaused = false
    if (this.plan) {
      this.plan.status = 'failed'
      this.callbacks?.onPlanUpdate(this.plan)
      this.callbacks?.onLog('Execution stopped', 'error')
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Singleton instance
export const agentEngine = new AgentExecutionEngine()
