/**
 * Alabobai Autonomous Agent System
 * An intelligent autonomous execution engine that:
 * - Takes high-level goals and breaks them down into steps
 * - Executes steps rapidly with smart error handling
 * - Self-heals by detecting stuck states and trying alternatives
 * - Validates outputs before proceeding
 * - Learns from failures to avoid repeating them
 * - Maintains memory and context across operations
 */

import { aiService, type Message } from './ai'
import { browserAutomation } from './browserAutomation'
import { SelfAnnealingEngine, type QualityMetrics } from './selfAnnealingEngine'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AutonomousAgentStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'validating'
  | 'self_healing'
  | 'rolling_back'
  | 'complete'
  | 'failed'
  | 'paused'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rolled_back'

export type ToolType =
  | 'web_search'
  | 'code_generation'
  | 'file_operation'
  | 'browser_automation'
  | 'data_analysis'
  | 'ai_reasoning'

export interface AgentMemoryEntry {
  id: string
  timestamp: Date
  type: 'action' | 'observation' | 'thought' | 'error' | 'learning'
  content: string
  metadata?: Record<string, unknown>
  importance: number // 0-1, higher = more important for context
}

export interface FailureRecord {
  id: string
  timestamp: Date
  action: string
  error: string
  context: string
  resolution?: string
  preventionStrategy?: string
  occurrences: number
}

export interface ExecutionStep {
  id: string
  index: number
  description: string
  tool: ToolType
  status: StepStatus
  input?: string
  output?: string
  error?: string
  startTime?: Date
  endTime?: Date
  duration?: number
  retryCount: number
  maxRetries: number
  validationResult?: ValidationResult
  rollbackData?: unknown
  alternatives?: string[]
  alternativeIndex: number
}

export interface ValidationResult {
  isValid: boolean
  score: number // 0-1
  issues: string[]
  suggestions: string[]
}

export interface ExecutionPlan {
  id: string
  goal: string
  steps: ExecutionStep[]
  status: AutonomousAgentStatus
  currentStepIndex: number
  startTime: Date
  endTime?: Date
  totalDuration?: number
  progress: number // 0-100
  outputs: AgentOutput[]
  stuckDetectionCount: number
  lastProgressTime: Date
}

export interface AgentOutput {
  id: string
  type: 'code' | 'text' | 'data' | 'file' | 'search_results' | 'web_content' | 'analysis'
  title: string
  content: string
  metadata?: Record<string, unknown>
  timestamp: Date
  stepId: string
  quality?: QualityMetrics
}

export interface AutonomousAgentCallbacks {
  onStatusChange: (status: AutonomousAgentStatus) => void
  onStepStart: (step: ExecutionStep) => void
  onStepComplete: (step: ExecutionStep) => void
  onStepError: (step: ExecutionStep, error: string) => void
  onOutput: (output: AgentOutput) => void
  onProgress: (progress: number, phase: string) => void
  onMemoryUpdate: (entry: AgentMemoryEntry) => void
  onSelfHeal: (issue: string, resolution: string) => void
  onRollback: (step: ExecutionStep, reason: string) => void
  onLog: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
}

export interface AutonomousAgentConfig {
  maxRetries: number
  stuckThresholdMs: number
  validationThreshold: number
  memoryCapacity: number
  enableSelfHealing: boolean
  enableLearning: boolean
  enableRollback: boolean
  progressCheckIntervalMs: number
  maxAlternativeAttempts: number
  planningTimeoutMs: number
  stepTimeoutMs: number
  aiTimeoutMs: number
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: AutonomousAgentConfig = {
  maxRetries: 2, // Faster failure handling
  stuckThresholdMs: 8000, // 8 seconds without progress = stuck (faster detection)
  validationThreshold: 0.6, // Slightly lower threshold for faster completion
  memoryCapacity: 100, // Max memory entries
  enableSelfHealing: true,
  enableLearning: true,
  enableRollback: true,
  progressCheckIntervalMs: 2000, // Check every 2 seconds for responsiveness
  maxAlternativeAttempts: 2, // Try alternatives faster
  planningTimeoutMs: 10000, // 10s for full planning (must be > aiTimeoutMs)
  stepTimeoutMs: 8000, // 8s per step
  aiTimeoutMs: 5000 // 5s for AI calls (allows fallback within planning window)
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

const webSearchCache = new Map<string, { results: Array<{ title: string; url: string; snippet: string }>; rawContent: string }>()
const webPageCache = new Map<string, { title: string; content: string; links: string[] }>()
const AI_SYNC_TIMEOUT_MS = 9000

async function chatSyncWithTimeout(messages: Message[], timeoutMs = AI_SYNC_TIMEOUT_MS): Promise<string> {
  let timeoutId: number | undefined
  const timeoutPromise = new Promise<string>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`AI chat timeout after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([aiService.chatSync(messages), timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/**
 * Web search using DuckDuckGo and other sources
 */
async function executeWebSearch(query: string): Promise<{
  results: Array<{ title: string; url: string; snippet: string }>
  rawContent: string
}> {
  const normalizedQuery = query.trim().toLowerCase()
  const cached = webSearchCache.get(normalizedQuery)
  if (cached) return cached

  const results: Array<{ title: string; url: string; snippet: string }> = []

  // Try backend search first (fast timeout)
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 }),
      signal: AbortSignal.timeout(5000)
    })

    if (response.ok) {
      const data = await response.json()
      if (data.results && data.results.length > 0) {
        results.push(...data.results)
      }
    }
  } catch (e) {
    console.log('[AutonomousAgent] Backend search failed, trying DuckDuckGo...')
  }

  // Fallback to DuckDuckGo instant answer (fast)
  if (results.length === 0) {
    try {
      const ddgResponse = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(4000) }
      )

      if (ddgResponse.ok) {
        const ddgData = await ddgResponse.json()

        if (ddgData.Abstract && ddgData.AbstractURL) {
          results.push({
            title: ddgData.Heading || 'Wikipedia',
            url: ddgData.AbstractURL,
            snippet: ddgData.Abstract
          })
        }

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
      }
    } catch (e) {
      console.log('[AutonomousAgent] DuckDuckGo search failed')
    }
  }

  // Try Wikipedia search as last resort (fast)
  if (results.length === 0) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&namespace=0&format=json&origin=*`
      const wikiResponse = await fetch(wikiUrl, { signal: AbortSignal.timeout(3000) })

      if (wikiResponse.ok) {
        const [, titles, snippets, urls] = await wikiResponse.json() as [string, string[], string[], string[]]

        titles.forEach((title, i) => {
          results.push({
            title,
            url: urls[i],
            snippet: snippets[i] || ''
          })
        })
      }
    } catch (e) {
      console.log('[AutonomousAgent] Wikipedia search failed')
    }
  }

  const rawContent = results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`
  ).join('\n\n')

  const payload = { results, rawContent }
  webSearchCache.set(normalizedQuery, payload)
  return payload
}

/**
 * Fetch and extract web page content
 */
async function fetchWebPage(url: string): Promise<{
  title: string
  content: string
  links: string[]
}> {
  const normalizedUrl = url.trim()
  const cached = webPageCache.get(normalizedUrl)
  if (cached) return cached

  try {
    // Try using the browser automation service
    const result = await browserAutomation.extractContent(url)

    if (result && result.text) {
      const payload = {
        title: result.title,
        content: result.text,
        links: result.links.map(l => l.href)
      }
      webPageCache.set(normalizedUrl, payload)
      return payload
    }
  } catch (e) {
    console.log('[AutonomousAgent] Browser automation fetch failed, trying CORS proxy...')
  }

  // Fallback to CORS proxy (fast timeout)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) })

    if (response.ok) {
      const html = await response.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      const title = doc.querySelector('title')?.textContent || url

      // Remove non-content elements
      const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript')
      elementsToRemove.forEach(el => el.remove())

      const content = doc.body?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 8000) || ''

      const links: string[] = []
      doc.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href')
        if (href?.startsWith('http')) {
          links.push(href)
        }
      })

      const payload = { title, content, links: links.slice(0, 20) }
      webPageCache.set(normalizedUrl, payload)
      return payload
    }
  } catch (e) {
    console.log('[AutonomousAgent] CORS proxy fetch failed')
  }

  return { title: url, content: '', links: [] }
}

/**
 * Generate code using AI
 */
async function generateCode(
  prompt: string,
  context?: string,
  language?: string
): Promise<string> {
  const systemPrompt = `You are an expert software developer. Generate clean, production-ready code.
${context ? `\nContext:\n${context}` : ''}
${language ? `\nLanguage: ${language}` : ''}

Rules:
- Write complete, working code
- Use TypeScript for type safety when applicable
- Include comments for complex logic
- Follow best practices and modern patterns
- Use Tailwind CSS for UI components
- Return ONLY the code, no explanations before or after
- Wrap code in appropriate markdown code blocks`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ]

  return await chatSyncWithTimeout(messages)
}

/**
 * Perform AI analysis/reasoning
 */
async function aiReasoning(
  task: string,
  context?: string
): Promise<string> {
  const systemPrompt = `You are an intelligent reasoning agent. Analyze the given task and provide clear, actionable insights.
${context ? `\nContext:\n${context}` : ''}

Be thorough but concise. Focus on practical recommendations.`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ]

  return await chatSyncWithTimeout(messages)
}

/**
 * Simulate file operations (client-side)
 */
function simulateFileOperation(
  operation: 'read' | 'write' | 'delete' | 'list',
  path: string,
  content?: string
): { success: boolean; result: string } {
  // In a real implementation, this would use a backend API
  // For now, we simulate file operations

  switch (operation) {
    case 'write':
      return {
        success: true,
        result: `File written successfully: ${path}\nContent length: ${content?.length || 0} characters`
      }
    case 'read':
      return {
        success: true,
        result: `[Simulated] Contents of ${path}:\n${content || 'File content would be here'}`
      }
    case 'delete':
      return {
        success: true,
        result: `File deleted: ${path}`
      }
    case 'list':
      return {
        success: true,
        result: `Files in ${path}:\n- file1.ts\n- file2.ts\n- index.ts`
      }
    default:
      return {
        success: false,
        result: 'Unknown file operation'
      }
  }
}

// ============================================================================
// AUTONOMOUS AGENT CLASS
// ============================================================================

export class AutonomousAgent {
  private config: AutonomousAgentConfig
  private callbacks: Partial<AutonomousAgentCallbacks> = {}
  private plan: ExecutionPlan | null = null
  private memory: AgentMemoryEntry[] = []
  private failureHistory: Map<string, FailureRecord> = new Map()
  private selfAnnealingEngine: SelfAnnealingEngine

  private isPaused = false
  private isStopped = false
  private progressCheckInterval: number | null = null

  constructor(config?: Partial<AutonomousAgentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.selfAnnealingEngine = new SelfAnnealingEngine({
      initialTemperature: 100,
      coolingRate: 0.95,
      minTemperature: 0.1,
      maxIterations: 50,
      targetEnergy: 0.1
    })
  }

  /**
   * Set callbacks for event handling
   */
  setCallbacks(callbacks: Partial<AutonomousAgentCallbacks>): void {
    this.callbacks = callbacks
  }

  /**
   * Execute a goal autonomously
   */
  async execute(goal: string): Promise<ExecutionPlan> {
    this.isPaused = false
    this.isStopped = false

    this.log(`Starting autonomous execution: "${goal}"`, 'info')
    this.callbacks.onStatusChange?.('planning')

    // Phase 1: Create execution plan
    const steps = await this.withTimeout(this.createPlan(goal), this.config.planningTimeoutMs, 'Plan generation')

    this.plan = {
      id: this.generateId(),
      goal,
      steps,
      status: 'executing',
      currentStepIndex: 0,
      startTime: new Date(),
      progress: 0,
      outputs: [],
      stuckDetectionCount: 0,
      lastProgressTime: new Date()
    }

    this.addMemory('thought', `Created execution plan with ${steps.length} steps`, 0.9)
    this.callbacks.onStatusChange?.('executing')

    // Start progress monitoring
    this.startProgressMonitoring()

    // Phase 2: Execute steps
    try {
      for (let i = 0; i < this.plan.steps.length; i++) {
        if (this.isStopped) {
          this.plan.status = 'failed'
          this.log('Execution stopped by user', 'warning')
          break
        }

        while (this.isPaused) {
          await this.delay(500)
          if (this.isStopped) break
        }

        this.plan.currentStepIndex = i
        const step = this.plan.steps[i]

        const progress = Math.round(10 + (i / this.plan.steps.length) * 85)
        this.plan.progress = progress
        this.callbacks.onProgress?.(progress, `Step ${i + 1}: ${step.description.slice(0, 40)}...`)

        await this.withTimeout(this.executeStep(step), this.config.stepTimeoutMs, `Step ${i + 1}`)

        // Check if we need to validate the output
        if (step.status === 'success' && step.output) {
          step.validationResult = await this.validateOutput(step)

          if (!step.validationResult.isValid && this.config.enableSelfHealing) {
            await this.selfHeal(step, step.validationResult)
          }
        }

        this.plan.lastProgressTime = new Date()
      }

      // Phase 3: Finalize
      if (!this.isStopped) {
        const hasFailedSteps = this.plan.steps.some(s => s.status === 'failed')
        this.plan.status = hasFailedSteps ? 'failed' : 'complete'
        this.plan.progress = hasFailedSteps ? this.plan.progress : 100
        this.plan.endTime = new Date()
        this.plan.totalDuration = this.plan.endTime.getTime() - this.plan.startTime.getTime()

        this.callbacks.onStatusChange?.(this.plan.status)
        this.callbacks.onProgress?.(this.plan.progress, hasFailedSteps ? 'Completed with failures' : 'Complete')
        this.log(
          hasFailedSteps
            ? 'Autonomous execution finished with failed steps'
            : 'Autonomous execution completed successfully!',
          hasFailedSteps ? 'warning' : 'success'
        )

        // Record successful execution for learning
        if (this.config.enableLearning && !hasFailedSteps) {
          this.recordLearning(this.plan)
        }
      }
    } catch (error) {
      this.plan.status = 'failed'
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log(`Execution failed: ${errorMessage}`, 'error')
      this.callbacks.onStatusChange?.('failed')
    } finally {
      this.stopProgressMonitoring()
    }

    return this.plan
  }

  /**
   * Create an execution plan from a goal
   */
  private async createPlan(goal: string): Promise<ExecutionStep[]> {
    this.log('Analyzing goal and creating execution plan...', 'info')

    // Check if we have learned approaches for similar tasks
    const learnedApproach = this.getBestApproachFromHistory(goal)

    const systemPrompt = `You are an expert task planner. Break down goals into specific, executable steps.

Available tools:
- web_search: Search the web for information
- code_generation: Generate code or create files
- file_operation: Read, write, or manage files
- browser_automation: Navigate and interact with web pages
- data_analysis: Analyze data and generate insights
- ai_reasoning: Think through problems and make decisions

${learnedApproach ? `\nPreviously successful approach for similar tasks:\n${learnedApproach}` : ''}

Return ONLY a JSON array of steps in this format:
[
  {"tool": "web_search", "description": "Search for...", "alternatives": ["Alternative approach 1", "Alternative approach 2"]},
  {"tool": "code_generation", "description": "Generate...", "alternatives": ["Use different framework", "Simpler implementation"]}
]

Keep plans focused (3-10 steps). Each step should be independently executable.
Always include alternative approaches for each step in case the primary approach fails.`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create an execution plan for: ${goal}` }
    ]

    try {
      const response = await this.safeAiChat(messages, 'Planning')

      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('No valid plan JSON found')
      }

      const stepsData = JSON.parse(jsonMatch[0])

      return stepsData.map((step: { tool: string; description: string; alternatives?: string[] }, index: number): ExecutionStep => ({
        id: this.generateId(),
        index,
        description: step.description,
        tool: step.tool as ToolType,
        status: 'pending',
        retryCount: 0,
        maxRetries: this.config.maxRetries,
        alternatives: step.alternatives || [],
        alternativeIndex: 0
      }))
    } catch (error) {
      this.log('Failed to generate plan via AI, using heuristic plan...', 'warning')
      return this.createHeuristicPlan(goal)
    }
  }

  /**
   * Create a plan based on keywords (fallback)
   */
  private createHeuristicPlan(goal: string): ExecutionStep[] {
    const steps: ExecutionStep[] = []
    const lowerGoal = goal.toLowerCase()

    // Always start with thinking
    steps.push({
      id: this.generateId(),
      index: 0,
      description: `Analyze the goal: "${goal}"`,
      tool: 'ai_reasoning',
      status: 'pending',
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      alternatives: ['Use simpler analysis', 'Skip analysis and proceed'],
      alternativeIndex: 0
    })

    // Add search step if research is needed
    if (lowerGoal.includes('research') || lowerGoal.includes('find') || lowerGoal.includes('search') || lowerGoal.includes('learn')) {
      steps.push({
        id: this.generateId(),
        index: steps.length,
        description: `Search for information about: ${goal}`,
        tool: 'web_search',
        status: 'pending',
        retryCount: 0,
        maxRetries: this.config.maxRetries,
        alternatives: ['Try different search terms', 'Search specific sources'],
        alternativeIndex: 0
      })
    }

    // Add code generation step if building is needed
    if (lowerGoal.includes('build') || lowerGoal.includes('create') || lowerGoal.includes('generate') ||
        lowerGoal.includes('code') || lowerGoal.includes('app') || lowerGoal.includes('website') ||
        lowerGoal.includes('component') || lowerGoal.includes('page')) {

      if (!lowerGoal.includes('research') && !lowerGoal.includes('find')) {
        steps.push({
          id: this.generateId(),
          index: steps.length,
          description: 'Research best practices and modern patterns',
          tool: 'web_search',
          status: 'pending',
          retryCount: 0,
          maxRetries: this.config.maxRetries,
          alternatives: ['Use existing knowledge', 'Check documentation'],
          alternativeIndex: 0
        })
      }

      steps.push({
        id: this.generateId(),
        index: steps.length,
        description: `Generate code for: ${goal}`,
        tool: 'code_generation',
        status: 'pending',
        retryCount: 0,
        maxRetries: this.config.maxRetries,
        alternatives: ['Use simpler implementation', 'Try different framework'],
        alternativeIndex: 0
      })
    }

    // Add analysis step if data analysis is needed
    if (lowerGoal.includes('analyze') || lowerGoal.includes('data') || lowerGoal.includes('dashboard') ||
        lowerGoal.includes('report')) {
      steps.push({
        id: this.generateId(),
        index: steps.length,
        description: `Analyze and synthesize findings for: ${goal}`,
        tool: 'data_analysis',
        status: 'pending',
        retryCount: 0,
        maxRetries: this.config.maxRetries,
        alternatives: ['Use simplified analysis', 'Focus on key metrics only'],
        alternativeIndex: 0
      })
    }

    // Always end with completion step
    steps.push({
      id: this.generateId(),
      index: steps.length,
      description: 'Finalize and deliver results',
      tool: 'ai_reasoning',
      status: 'pending',
      retryCount: 0,
      maxRetries: 1,
      alternatives: [],
      alternativeIndex: 0
    })

    return steps
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: ExecutionStep): Promise<void> {
    step.status = 'running'
    step.startTime = new Date()

    this.callbacks.onStepStart?.(step)
    this.log(`Executing: ${step.description}`, 'info')
    this.addMemory('action', `Starting step: ${step.description}`, 0.7)

    try {
      // Execute based on tool type
      let output: string

      switch (step.tool) {
        case 'web_search':
          output = await this.executeWebSearchStep(step)
          break
        case 'code_generation':
          output = await this.executeCodeGenerationStep(step)
          break
        case 'file_operation':
          output = await this.executeFileOperationStep(step)
          break
        case 'browser_automation':
          output = await this.executeBrowserAutomationStep(step)
          break
        case 'data_analysis':
          output = await this.executeDataAnalysisStep(step)
          break
        case 'ai_reasoning':
          output = await this.executeAiReasoningStep(step)
          break
        default:
          throw new Error(`Unknown tool type: ${step.tool}`)
      }

      step.output = output
      step.status = 'success'
      step.endTime = new Date()
      step.duration = step.endTime.getTime() - step.startTime.getTime()

      this.callbacks.onStepComplete?.(step)
      this.log(`Completed: ${step.description}`, 'success')
      this.addMemory('observation', `Step completed successfully: ${output.slice(0, 200)}...`, 0.8)

      // Create output
      const agentOutput = this.createOutput(step)
      if (agentOutput) {
        this.plan?.outputs.push(agentOutput)
        this.callbacks.onOutput?.(agentOutput)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      step.error = errorMessage

      // Check if we should retry or try alternative (fast retry)
      if (step.retryCount < step.maxRetries) {
        step.retryCount++
        this.log(`Retrying (${step.retryCount}/${step.maxRetries}): ${errorMessage}`, 'warning')
        this.addMemory('error', `Step failed, retrying: ${errorMessage}`, 0.9)
        await this.delay(500 * step.retryCount) // Fast backoff
        return this.executeStep(step)
      }

      // Try alternative approach
      if (step.alternatives && step.alternativeIndex < step.alternatives.length &&
          step.alternativeIndex < this.config.maxAlternativeAttempts) {
        const alternative = step.alternatives[step.alternativeIndex]
        step.alternativeIndex++
        step.retryCount = 0
        this.log(`Trying alternative approach: ${alternative}`, 'warning')
        this.addMemory('thought', `Primary approach failed, trying: ${alternative}`, 0.9)
        step.description = alternative
        return this.executeStep(step)
      }

      // Mark as failed
      step.status = 'failed'
      step.endTime = new Date()
      step.duration = step.endTime.getTime() - (step.startTime?.getTime() || Date.now())

      this.callbacks.onStepError?.(step, errorMessage)
      this.log(`Failed: ${errorMessage}`, 'error')
      this.addMemory('error', `Step failed permanently: ${errorMessage}`, 1.0)

      // Record failure for learning
      this.recordFailure(step, errorMessage)
    }
  }

  /**
   * Execute web search step
   */
  private async executeWebSearchStep(step: ExecutionStep): Promise<string> {
    const query = step.input || step.description.replace(/^search\s+(for\s+)?/i, '').trim()
    const { results, rawContent } = await executeWebSearch(query)

    if (results.length === 0) {
      throw new Error('No search results found')
    }

    // Store results in context
    this.addMemory('observation', `Found ${results.length} search results for: ${query}`, 0.8)

    return rawContent
  }

  /**
   * Execute code generation step
   */
  private async executeCodeGenerationStep(step: ExecutionStep): Promise<string> {
    // Build context from memory
    const relevantMemory = this.getRelevantMemory(step.description)
    const context = relevantMemory.map(m => m.content).join('\n')

    const code = await generateCode(step.description, context)

    if (!code || code.length < 10) {
      throw new Error('Code generation produced no output')
    }

    return code
  }

  /**
   * Execute file operation step
   */
  private async executeFileOperationStep(step: ExecutionStep): Promise<string> {
    // Parse operation from description
    const desc = step.description.toLowerCase()
    let operation: 'read' | 'write' | 'delete' | 'list' = 'read'

    if (desc.includes('write') || desc.includes('create') || desc.includes('save')) {
      operation = 'write'
    } else if (desc.includes('delete') || desc.includes('remove')) {
      operation = 'delete'
    } else if (desc.includes('list') || desc.includes('directory')) {
      operation = 'list'
    }

    const pathMatch = step.description.match(/['"]([^'"]+)['"]/)?.[1] || '/virtual/file.txt'
    const content = step.input || ''

    const result = simulateFileOperation(operation, pathMatch, content)

    if (!result.success) {
      throw new Error(result.result)
    }

    return result.result
  }

  /**
   * Execute browser automation step
   */
  private async executeBrowserAutomationStep(step: ExecutionStep): Promise<string> {
    // Extract URL from description
    const urlMatch = step.description.match(/https?:\/\/[^\s]+/)
    const url = urlMatch?.[0] || step.input

    if (!url) {
      throw new Error('No URL provided for browser automation')
    }

    const result = await fetchWebPage(url)

    if (!result.content) {
      throw new Error('Failed to fetch page content')
    }

    return `Title: ${result.title}\n\nContent:\n${result.content.slice(0, 3000)}\n\nLinks found: ${result.links.length}`
  }

  /**
   * Execute data analysis step
   */
  private async executeDataAnalysisStep(step: ExecutionStep): Promise<string> {
    // Get data from memory
    const dataMemory = this.getRelevantMemory('data')
    const dataContext = dataMemory.map(m => m.content).join('\n')

    const analysis = await aiReasoning(
      step.description,
      dataContext || 'No previous data context available'
    )

    return analysis
  }

  /**
   * Execute AI reasoning step
   */
  private async executeAiReasoningStep(step: ExecutionStep): Promise<string> {
    // Build comprehensive context
    const relevantMemory = this.getRelevantMemory(step.description, 5)
    const context = relevantMemory.map(m => `[${m.type}] ${m.content}`).join('\n')

    const thought = await aiReasoning(step.description, context)

    return thought
  }

  /**
   * Validate step output
   */
  private async validateOutput(step: ExecutionStep): Promise<ValidationResult> {
    const issues: string[] = []
    const suggestions: string[] = []
    let score = 1.0

    if (!step.output || step.output.length === 0) {
      issues.push('Output is empty')
      score = 0
    }

    // Tool-specific validation
    switch (step.tool) {
      case 'code_generation':
        // Check for code blocks
        if (!step.output?.includes('```')) {
          issues.push('No code blocks found in output')
          suggestions.push('Ensure code is wrapped in markdown code blocks')
          score -= 0.3
        }
        // Check for common syntax errors
        if (step.output?.includes('syntax error') || step.output?.includes('SyntaxError')) {
          issues.push('Potential syntax errors in generated code')
          suggestions.push('Review and fix syntax errors')
          score -= 0.5
        }
        break

      case 'web_search':
        // Check for actual results
        if (!step.output?.includes('http')) {
          issues.push('No URLs found in search results')
          suggestions.push('Try different search terms')
          score -= 0.4
        }
        break

      case 'ai_reasoning':
        // Check for substantive response
        if (step.output && step.output.length < 100) {
          issues.push('Response is too brief')
          suggestions.push('Request more detailed analysis')
          score -= 0.2
        }
        break
    }

    // General quality checks
    if (step.output && step.output.includes('[error]')) {
      issues.push('Output contains error markers')
      score -= 0.3
    }

    const isValid = score >= this.config.validationThreshold

    return { isValid, score, issues, suggestions }
  }

  /**
   * Self-heal when validation fails
   */
  private async selfHeal(step: ExecutionStep, validation: ValidationResult): Promise<void> {
    if (!this.config.enableSelfHealing) return

    this.callbacks.onStatusChange?.('self_healing')
    this.callbacks.onSelfHeal?.(
      `Validation failed: ${validation.issues.join(', ')}`,
      'Attempting self-healing...'
    )
    this.addMemory('thought', `Self-healing triggered: ${validation.issues.join(', ')}`, 1.0)

    // Check for known failure patterns
    const knownResolution = this.getKnownResolution(step, validation)

    if (knownResolution) {
      this.log(`Applying known resolution: ${knownResolution}`, 'info')
      step.description = `${step.description} (${knownResolution})`
      step.retryCount = 0
      await this.executeStep(step)
      return
    }

    // Try alternative approaches
    if (step.alternatives && step.alternativeIndex < step.alternatives.length) {
      const alternative = step.alternatives[step.alternativeIndex]
      step.alternativeIndex++
      this.log(`Trying alternative: ${alternative}`, 'info')
      step.description = alternative
      step.retryCount = 0
      await this.executeStep(step)
      return
    }

    // Use AI to suggest fix
    const fixSuggestion = await aiReasoning(
      `The following step failed validation: "${step.description}"
Issues: ${validation.issues.join(', ')}
Suggestions: ${validation.suggestions.join(', ')}
Previous output: ${step.output?.slice(0, 500)}

How should we fix this? Provide a specific action to take.`,
      'Self-healing context'
    )

    this.callbacks.onSelfHeal?.(validation.issues.join(', '), fixSuggestion.slice(0, 200))
    this.addMemory('learning', `Self-healing resolution: ${fixSuggestion.slice(0, 300)}`, 1.0)
  }

  /**
   * Rollback a failed step
   */
  private async rollback(step: ExecutionStep, reason: string): Promise<void> {
    if (!this.config.enableRollback) return

    this.callbacks.onStatusChange?.('rolling_back')
    this.callbacks.onRollback?.(step, reason)
    this.log(`Rolling back step: ${step.description} - Reason: ${reason}`, 'warning')

    step.status = 'rolled_back'
    this.addMemory('action', `Rolled back step: ${step.description}`, 0.9)

    // Remove outputs from this step
    if (this.plan) {
      this.plan.outputs = this.plan.outputs.filter(o => o.stepId !== step.id)
    }
  }

  /**
   * Start progress monitoring
   */
  private startProgressMonitoring(): void {
    this.progressCheckInterval = window.setInterval(() => {
      this.checkForStuckState()
    }, this.config.progressCheckIntervalMs)
  }

  /**
   * Stop progress monitoring
   */
  private stopProgressMonitoring(): void {
    if (this.progressCheckInterval) {
      clearInterval(this.progressCheckInterval)
      this.progressCheckInterval = null
    }
  }

  /**
   * Check if agent is stuck
   */
  private checkForStuckState(): void {
    if (!this.plan || this.isPaused || this.isStopped) return

    const timeSinceProgress = Date.now() - this.plan.lastProgressTime.getTime()

    if (timeSinceProgress > this.config.stuckThresholdMs) {
      this.plan.stuckDetectionCount++
      this.log(`Stuck detection triggered (${this.plan.stuckDetectionCount} times)`, 'warning')
      this.addMemory('error', `Agent appears stuck - no progress for ${timeSinceProgress}ms`, 1.0)

      // Faster recovery - trigger after 2 detections instead of 3
      if (this.plan.stuckDetectionCount >= 2 && this.config.enableSelfHealing) {
        this.handleStuckState()
      }
    }
  }

  /**
   * Handle stuck state
   */
  private async handleStuckState(): Promise<void> {
    if (!this.plan) return

    const currentStep = this.plan.steps[this.plan.currentStepIndex]

    this.callbacks.onSelfHeal?.(
      'Agent appears to be stuck',
      'Attempting recovery...'
    )

    // Try to skip or modify current step
    if (currentStep.alternatives && currentStep.alternativeIndex < currentStep.alternatives.length) {
      currentStep.description = currentStep.alternatives[currentStep.alternativeIndex]
      currentStep.alternativeIndex++
      currentStep.status = 'pending'
      currentStep.retryCount = 0
      this.plan.lastProgressTime = new Date()
      this.log('Switched to alternative approach due to stuck state', 'info')
    } else {
      // Skip the step
      currentStep.status = 'skipped'
      this.plan.currentStepIndex++
      this.plan.lastProgressTime = new Date()
      this.log('Skipped stuck step and moving to next', 'warning')
    }

    this.plan.stuckDetectionCount = 0
  }

  /**
   * Create output from step result
   */
  private createOutput(step: ExecutionStep): AgentOutput | null {
    if (!step.output) return null

    let type: AgentOutput['type'] = 'text'

    switch (step.tool) {
      case 'web_search':
        type = 'search_results'
        break
      case 'code_generation':
        type = 'code'
        break
      case 'browser_automation':
        type = 'web_content'
        break
      case 'data_analysis':
        type = 'analysis'
        break
    }

    return {
      id: this.generateId(),
      type,
      title: step.description.slice(0, 60),
      content: step.output,
      timestamp: new Date(),
      stepId: step.id
    }
  }

  /**
   * Add entry to memory
   */
  private addMemory(type: AgentMemoryEntry['type'], content: string, importance: number): void {
    const entry: AgentMemoryEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      content,
      importance
    }

    this.memory.push(entry)
    this.callbacks.onMemoryUpdate?.(entry)

    // Trim memory if over capacity
    if (this.memory.length > this.config.memoryCapacity) {
      // Remove least important entries
      this.memory.sort((a, b) => b.importance - a.importance)
      this.memory = this.memory.slice(0, this.config.memoryCapacity)
    }
  }

  /**
   * Get relevant memory entries
   */
  private getRelevantMemory(context: string, limit = 10): AgentMemoryEntry[] {
    const contextWords = context.toLowerCase().split(/\s+/)

    return this.memory
      .map(entry => {
        const entryWords = entry.content.toLowerCase().split(/\s+/)
        const matchCount = contextWords.filter(w =>
          entryWords.some(ew => ew.includes(w) || w.includes(ew))
        ).length
        return { entry, relevance: matchCount / contextWords.length + entry.importance }
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(({ entry }) => entry)
  }

  /**
   * Record failure for learning
   */
  private recordFailure(step: ExecutionStep, error: string): void {
    const key = `${step.tool}:${step.description.slice(0, 50)}`

    const existing = this.failureHistory.get(key)

    if (existing) {
      existing.occurrences++
      existing.error = error
    } else {
      this.failureHistory.set(key, {
        id: this.generateId(),
        timestamp: new Date(),
        action: step.description,
        error,
        context: this.memory.slice(-3).map(m => m.content).join('\n'),
        occurrences: 1
      })
    }
  }

  /**
   * Get known resolution for failure
   */
  private getKnownResolution(step: ExecutionStep, validation: ValidationResult): string | null {
    const key = `${step.tool}:${step.description.slice(0, 50)}`
    const failure = this.failureHistory.get(key)

    if (failure?.resolution) {
      return failure.resolution
    }

    // Check for common patterns
    for (const issue of validation.issues) {
      if (issue.includes('empty') || issue.includes('no output')) {
        return 'Add more specific instructions'
      }
      if (issue.includes('syntax error')) {
        return 'Request simpler code structure'
      }
      if (issue.includes('no results')) {
        return 'Use broader search terms'
      }
    }

    return null
  }

  /**
   * Get best approach from history
   */
  private getBestApproachFromHistory(goal: string): string | null {
    const approach = this.selfAnnealingEngine.getBestApproach(goal.split(' ')[0])

    if (approach && approach.confidence > 0.7) {
      return `Use tools: ${approach.tools.join(', ')}`
    }

    return null
  }

  /**
   * Record successful execution for learning
   */
  private recordLearning(plan: ExecutionPlan): void {
    const successfulSteps = plan.steps.filter(s => s.status === 'success')
    const tools = successfulSteps.map(s => s.tool)

    this.selfAnnealingEngine.recordLearning({
      id: this.generateId(),
      timestamp: new Date(),
      taskType: plan.goal.split(' ')[0],
      input: plan.goal,
      output: plan.outputs.map(o => o.content).join('\n').slice(0, 1000),
      quality: {
        accuracy: successfulSteps.length / plan.steps.length,
        completeness: plan.progress / 100,
        performance: plan.totalDuration ? 1000 / plan.totalDuration : 0.5,
        reliability: 1 - (plan.stuckDetectionCount / 10),
        userSatisfaction: 0.8,
        errorRate: (plan.steps.length - successfulSteps.length) / plan.steps.length
      },
      improvements: [],
      toolsUsed: tools,
      duration: plan.totalDuration || 0
    })
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.isPaused = true
    if (this.plan) {
      this.plan.status = 'paused'
      this.callbacks.onStatusChange?.('paused')
      this.log('Execution paused', 'warning')
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    this.isPaused = false
    if (this.plan) {
      this.plan.status = 'executing'
      this.callbacks.onStatusChange?.('executing')
      this.log('Execution resumed', 'info')
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.isStopped = true
    this.isPaused = false
    if (this.plan) {
      this.plan.status = 'failed'
      this.callbacks.onStatusChange?.('failed')
      this.log('Execution stopped', 'error')
    }
  }

  /**
   * Get current status
   */
  getStatus(): AutonomousAgentStatus {
    return this.plan?.status || 'idle'
  }

  /**
   * Get current plan
   */
  getPlan(): ExecutionPlan | null {
    return this.plan
  }

  /**
   * Get memory
   */
  getMemory(): AgentMemoryEntry[] {
    return [...this.memory]
  }

  /**
   * Clear memory
   */
  clearMemory(): void {
    this.memory = []
    this.failureHistory.clear()
    this.log('Memory cleared', 'info')
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: number | undefined
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  private async safeAiChat(messages: Message[], label: string): Promise<string> {
    return this.withTimeout(aiService.chatSync(messages), this.config.aiTimeoutMs, label)
  }

  /**
   * Helper: Log message
   */
  private log(message: string, level: 'info' | 'success' | 'warning' | 'error'): void {
    console.log(`[AutonomousAgent] [${level.toUpperCase()}] ${message}`)
    this.callbacks.onLog?.(message, level)
  }

  /**
   * Helper: Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Helper: Delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const autonomousAgent = new AutonomousAgent()

export default autonomousAgent
