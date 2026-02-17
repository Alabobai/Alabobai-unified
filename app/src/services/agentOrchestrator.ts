/**
 * Agent Orchestrator - Powerful Multi-Agent Coordination System
 *
 * A sophisticated orchestration engine that coordinates multiple specialized agents:
 * - ResearchAgent: Web search, content extraction, fact verification
 * - CoderAgent: Code generation, debugging, refactoring
 * - BrowserAgent: Web automation, scraping, form filling
 * - AnalystAgent: Data analysis, visualization, insights
 * - CreativeAgent: Image generation, content writing, design
 *
 * Features:
 * - Parallel Execution: Run multiple agents simultaneously
 * - Agent Communication: Shared context and inter-agent messaging
 * - Task Routing: Intelligent task-to-agent assignment
 * - Progress Tracking: Real-time progress with ETA
 * - Error Recovery: Automatic retry, reassignment, and fallback
 * - Result Aggregation: Combine outputs into coherent results
 */

import { aiService, type Message } from './ai'
import { browserAutomation } from './browserAutomation'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AgentType = 'research' | 'coder' | 'browser' | 'analyst' | 'creative'

export type AgentStatus = 'idle' | 'busy' | 'error' | 'recovering' | 'offline'

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'assigned'
  | 'running'
  | 'waiting_dependency'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled'

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'

export interface Agent {
  id: string
  type: AgentType
  name: string
  description: string
  capabilities: string[]
  status: AgentStatus
  currentTaskId: string | null
  metrics: AgentMetrics
  config: AgentConfig
}

export interface AgentMetrics {
  tasksCompleted: number
  tasksFailed: number
  successRate: number
  averageExecutionTime: number
  lastActiveAt: Date | null
  totalExecutionTime: number
}

export interface AgentConfig {
  maxConcurrentTasks: number
  timeout: number
  retryAttempts: number
  cooldownPeriod: number
  priority: number
}

export interface Task {
  id: string
  title: string
  description: string
  type: TaskType
  priority: TaskPriority
  status: TaskStatus
  assignedAgentId: string | null
  dependencies: string[]
  input: TaskInput
  output: TaskOutput | null
  progress: number
  retryCount: number
  maxRetries: number
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  error: string | null
  metadata: Record<string, unknown>
}

export type TaskType =
  | 'research'
  | 'code_generation'
  | 'code_review'
  | 'code_refactor'
  | 'debug'
  | 'web_scrape'
  | 'form_fill'
  | 'browser_automation'
  | 'data_analysis'
  | 'visualization'
  | 'image_generation'
  | 'content_writing'
  | 'design'
  | 'composite'

export interface TaskInput {
  prompt: string
  context?: string
  data?: unknown
  urls?: string[]
  files?: string[]
  previousResults?: Record<string, TaskOutput>
}

export interface TaskOutput {
  success: boolean
  content: string
  data?: unknown
  artifacts?: Artifact[]
  confidence: number
  sources?: string[]
  suggestions?: string[]
}

export interface Artifact {
  id: string
  type: 'code' | 'text' | 'image' | 'data' | 'chart' | 'html' | 'file'
  title: string
  content: string
  mimeType?: string
  metadata?: Record<string, unknown>
}

export interface SharedContext {
  goal: string
  facts: Map<string, Fact>
  decisions: Decision[]
  artifacts: Map<string, Artifact>
  messages: AgentMessage[]
  memory: Map<string, unknown>
}

export interface Fact {
  id: string
  content: string
  source: string
  confidence: number
  verifiedBy: string[]
  createdAt: Date
}

export interface Decision {
  id: string
  description: string
  madeBy: string
  reasoning: string
  timestamp: Date
  affectedTasks: string[]
}

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: string | 'broadcast'
  type: 'info' | 'request' | 'response' | 'warning' | 'error'
  content: string
  data?: unknown
  timestamp: Date
}

export interface ExecutionPlan {
  id: string
  goal: string
  tasks: Task[]
  phases: ExecutionPhase[]
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  estimatedDuration: number
  actualDuration: number
  startedAt: Date | null
  completedAt: Date | null
}

export interface ExecutionPhase {
  id: string
  name: string
  tasks: string[]
  dependencies: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  parallel: boolean
}

export interface OrchestratorConfig {
  maxParallelTasks: number
  maxParallelAgents: number
  defaultTimeout: number
  retryAttempts: number
  retryDelay: number
  enableAutoRecovery: boolean
  enableAgentCommunication: boolean
  progressUpdateInterval: number
  stuckThreshold: number
}

export interface OrchestratorCallbacks {
  onTaskStart: (task: Task) => void
  onTaskComplete: (task: Task) => void
  onTaskFail: (task: Task, error: string) => void
  onTaskProgress: (task: Task, progress: number) => void
  onPhaseComplete: (phase: ExecutionPhase) => void
  onPlanComplete: (plan: ExecutionPlan) => void
  onAgentMessage: (message: AgentMessage) => void
  onProgress: (overall: number, phase: string, details: string) => void
  onLog: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
}

export interface OrchestratorResult {
  success: boolean
  plan: ExecutionPlan
  outputs: Map<string, TaskOutput>
  aggregatedResult: AggregatedResult
  context: SharedContext
  stats: ExecutionStats
}

export interface AggregatedResult {
  summary: string
  mainContent: string
  artifacts: Artifact[]
  recommendations: string[]
  nextSteps: string[]
}

export interface ExecutionStats {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  retriedTasks: number
  averageTaskTime: number
  totalExecutionTime: number
  agentUtilization: Map<string, number>
  parallelEfficiency: number
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxParallelTasks: 5,
  maxParallelAgents: 4,
  defaultTimeout: 60000,
  retryAttempts: 3,
  retryDelay: 2000,
  enableAutoRecovery: true,
  enableAgentCommunication: true,
  progressUpdateInterval: 1000,
  stuckThreshold: 30000
}

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

const AGENT_DEFINITIONS: Record<AgentType, Omit<Agent, 'id' | 'status' | 'currentTaskId' | 'metrics'>> = {
  research: {
    type: 'research',
    name: 'ResearchAgent',
    description: 'Web search, content extraction, and fact verification specialist',
    capabilities: [
      'web_search', 'content_extraction', 'fact_verification',
      'source_analysis', 'summarization', 'citation_tracking'
    ],
    config: {
      maxConcurrentTasks: 3,
      timeout: 45000,
      retryAttempts: 3,
      cooldownPeriod: 1000,
      priority: 1
    }
  },
  coder: {
    type: 'coder',
    name: 'CoderAgent',
    description: 'Code generation, debugging, and refactoring expert',
    capabilities: [
      'code_generation', 'debugging', 'refactoring',
      'code_review', 'testing', 'documentation'
    ],
    config: {
      maxConcurrentTasks: 2,
      timeout: 90000,
      retryAttempts: 2,
      cooldownPeriod: 500,
      priority: 2
    }
  },
  browser: {
    type: 'browser',
    name: 'BrowserAgent',
    description: 'Web automation, scraping, and form filling specialist',
    capabilities: [
      'web_scraping', 'form_filling', 'screenshot',
      'navigation', 'interaction', 'data_extraction'
    ],
    config: {
      maxConcurrentTasks: 2,
      timeout: 60000,
      retryAttempts: 3,
      cooldownPeriod: 2000,
      priority: 3
    }
  },
  analyst: {
    type: 'analyst',
    name: 'AnalystAgent',
    description: 'Data analysis, visualization, and insights generation',
    capabilities: [
      'data_analysis', 'visualization', 'pattern_recognition',
      'statistical_analysis', 'trend_identification', 'reporting'
    ],
    config: {
      maxConcurrentTasks: 2,
      timeout: 120000,
      retryAttempts: 2,
      cooldownPeriod: 1000,
      priority: 2
    }
  },
  creative: {
    type: 'creative',
    name: 'CreativeAgent',
    description: 'Image generation, content writing, and design',
    capabilities: [
      'image_generation', 'content_writing', 'copywriting',
      'design_suggestions', 'branding', 'storytelling'
    ],
    config: {
      maxConcurrentTasks: 2,
      timeout: 120000,
      retryAttempts: 2,
      cooldownPeriod: 2000,
      priority: 4
    }
  }
}

// ============================================================================
// TASK-TO-AGENT ROUTING MAP
// ============================================================================

const TASK_AGENT_MAP: Record<TaskType, AgentType[]> = {
  research: ['research'],
  code_generation: ['coder'],
  code_review: ['coder', 'analyst'],
  code_refactor: ['coder'],
  debug: ['coder'],
  web_scrape: ['browser', 'research'],
  form_fill: ['browser'],
  browser_automation: ['browser'],
  data_analysis: ['analyst'],
  visualization: ['analyst', 'creative'],
  image_generation: ['creative'],
  content_writing: ['creative', 'research'],
  design: ['creative'],
  composite: ['research', 'coder', 'analyst', 'creative']
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// SEMAPHORE FOR CONCURRENCY CONTROL
// ============================================================================

class Semaphore {
  private permits: number
  private waiting: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }
    return new Promise(resolve => {
      this.waiting.push(resolve)
    })
  }

  release(): void {
    this.permits++
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--
      const next = this.waiting.shift()
      if (next) next()
    }
  }

  get available(): number {
    return this.permits
  }
}

// ============================================================================
// AGENT ORCHESTRATOR CLASS
// ============================================================================

export class AgentOrchestrator {
  private config: OrchestratorConfig
  private callbacks: Partial<OrchestratorCallbacks> = {}
  private agents: Map<string, Agent> = new Map()
  private tasks: Map<string, Task> = new Map()
  private context: SharedContext | null = null
  private currentPlan: ExecutionPlan | null = null
  private semaphore: Semaphore
  private isRunning = false
  private isCancelled = false
  private progressInterval: ReturnType<typeof setInterval> | null = null

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.semaphore = new Semaphore(this.config.maxParallelTasks)
    this.initializeAgents()
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeAgents(): void {
    for (const [type, definition] of Object.entries(AGENT_DEFINITIONS)) {
      const agent: Agent = {
        id: `agent-${type}-${generateId()}`,
        ...definition,
        status: 'idle',
        currentTaskId: null,
        metrics: {
          tasksCompleted: 0,
          tasksFailed: 0,
          successRate: 1.0,
          averageExecutionTime: 0,
          lastActiveAt: null,
          totalExecutionTime: 0
        }
      }
      this.agents.set(agent.id, agent)
    }
    this.log(`Initialized ${this.agents.size} agents`, 'info')
  }

  setCallbacks(callbacks: Partial<OrchestratorCallbacks>): void {
    this.callbacks = callbacks
  }

  // ============================================================================
  // MAIN ORCHESTRATION ENTRY POINT
  // ============================================================================

  async orchestrate(goal: string): Promise<OrchestratorResult> {
    const startTime = Date.now()
    this.isRunning = true
    this.isCancelled = false

    this.log(`Starting orchestration for goal: "${goal}"`, 'info')
    this.callbacks.onProgress?.(0, 'Planning', 'Analyzing goal and creating execution plan...')

    try {
      // Phase 1: Initialize shared context
      this.context = this.createSharedContext(goal)

      // Phase 2: Decompose goal into tasks
      this.callbacks.onProgress?.(5, 'Planning', 'Decomposing goal into tasks...')
      const tasks = await this.decomposeGoal(goal)

      // Phase 3: Create execution plan
      this.callbacks.onProgress?.(10, 'Planning', 'Creating execution plan...')
      this.currentPlan = await this.createExecutionPlan(goal, tasks)

      // Phase 4: Execute plan
      this.callbacks.onProgress?.(15, 'Executing', 'Starting task execution...')
      this.startProgressTracking()

      const outputs = await this.executePlan(this.currentPlan)

      // Phase 5: Aggregate results
      this.callbacks.onProgress?.(95, 'Aggregating', 'Combining results...')
      const aggregatedResult = await this.aggregateResults(outputs)

      // Phase 6: Finalize
      this.currentPlan.status = 'completed'
      this.currentPlan.completedAt = new Date()
      this.currentPlan.actualDuration = Date.now() - startTime
      this.currentPlan.progress = 100

      this.callbacks.onProgress?.(100, 'Complete', 'Orchestration completed successfully!')
      this.callbacks.onPlanComplete?.(this.currentPlan)
      this.log('Orchestration completed successfully!', 'success')

      return {
        success: true,
        plan: this.currentPlan,
        outputs,
        aggregatedResult,
        context: this.context,
        stats: this.calculateStats()
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log(`Orchestration failed: ${errorMessage}`, 'error')

      if (this.currentPlan) {
        this.currentPlan.status = 'failed'
        this.currentPlan.completedAt = new Date()
        this.currentPlan.actualDuration = Date.now() - startTime
      }

      return {
        success: false,
        plan: this.currentPlan || this.createEmptyPlan(goal),
        outputs: new Map(),
        aggregatedResult: this.createErrorResult(errorMessage),
        context: this.context || this.createSharedContext(goal),
        stats: this.calculateStats()
      }

    } finally {
      this.isRunning = false
      this.stopProgressTracking()
    }
  }

  // ============================================================================
  // GOAL DECOMPOSITION
  // ============================================================================

  private async decomposeGoal(goal: string): Promise<Task[]> {
    this.log('Decomposing goal into tasks...', 'info')

    const systemPrompt = `You are an expert task planner for a multi-agent AI system.

Available agents and their capabilities:
1. ResearchAgent: Web search, content extraction, fact verification, summarization
2. CoderAgent: Code generation, debugging, refactoring, code review
3. BrowserAgent: Web scraping, form filling, browser automation
4. AnalystAgent: Data analysis, visualization, pattern recognition
5. CreativeAgent: Image generation, content writing, design

Break down the goal into specific, executable tasks. Consider:
- Which agent is best suited for each task
- Dependencies between tasks (what must complete before what)
- What can run in parallel
- Keep tasks atomic and focused

Return ONLY a JSON array with this structure:
[
  {
    "title": "Brief task title",
    "description": "Detailed description of what to do",
    "type": "research|code_generation|code_review|code_refactor|debug|web_scrape|form_fill|browser_automation|data_analysis|visualization|image_generation|content_writing|design|composite",
    "priority": "low|normal|high|critical",
    "dependencies": [],
    "estimatedDuration": 10000
  }
]

Create 3-10 focused tasks that together achieve the goal.`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Decompose this goal into tasks: ${goal}` }
    ]

    try {
      const response = await aiService.chatSync(messages)
      const jsonMatch = response.match(/\[[\s\S]*\]/)

      if (!jsonMatch) {
        throw new Error('No valid JSON found in response')
      }

      const tasksData = JSON.parse(jsonMatch[0])

      return tasksData.map((t: {
        title: string
        description: string
        type: TaskType
        priority: TaskPriority
        dependencies: string[]
        estimatedDuration?: number
      }, index: number): Task => {
        const task: Task = {
          id: `task-${generateId()}`,
          title: t.title,
          description: t.description,
          type: t.type || 'composite',
          priority: t.priority || 'normal',
          status: 'pending',
          assignedAgentId: null,
          dependencies: t.dependencies || [],
          input: {
            prompt: t.description,
            context: goal
          },
          output: null,
          progress: 0,
          retryCount: 0,
          maxRetries: this.config.retryAttempts,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
          error: null,
          metadata: { index, estimatedDuration: t.estimatedDuration || 15000 }
        }
        this.tasks.set(task.id, task)
        return task
      })

    } catch (error) {
      this.log('AI decomposition failed, using heuristic approach', 'warning')
      return this.heuristicDecomposition(goal)
    }
  }

  private heuristicDecomposition(goal: string): Task[] {
    const tasks: Task[] = []
    const lowerGoal = goal.toLowerCase()

    // Research phase
    tasks.push(this.createTask({
      title: 'Research and gather information',
      description: `Research relevant information for: ${goal}`,
      type: 'research',
      priority: 'high'
    }))

    // Code generation if needed
    if (lowerGoal.includes('build') || lowerGoal.includes('create') ||
        lowerGoal.includes('develop') || lowerGoal.includes('app') ||
        lowerGoal.includes('website') || lowerGoal.includes('page')) {

      tasks.push(this.createTask({
        title: 'Generate code structure',
        description: `Generate the code structure for: ${goal}`,
        type: 'code_generation',
        priority: 'high',
        dependencies: [tasks[0].id]
      }))
    }

    // Design/Creative if needed
    if (lowerGoal.includes('design') || lowerGoal.includes('landing') ||
        lowerGoal.includes('ui') || lowerGoal.includes('visual') ||
        lowerGoal.includes('image') || lowerGoal.includes('logo')) {

      tasks.push(this.createTask({
        title: 'Create design elements',
        description: `Design visual elements for: ${goal}`,
        type: 'design',
        priority: 'normal',
        dependencies: [tasks[0].id]
      }))
    }

    // Content writing if needed
    if (lowerGoal.includes('content') || lowerGoal.includes('copy') ||
        lowerGoal.includes('text') || lowerGoal.includes('landing') ||
        lowerGoal.includes('marketing')) {

      tasks.push(this.createTask({
        title: 'Write content and copy',
        description: `Write compelling content for: ${goal}`,
        type: 'content_writing',
        priority: 'normal',
        dependencies: [tasks[0].id]
      }))
    }

    // Analysis if needed
    if (lowerGoal.includes('analyze') || lowerGoal.includes('data') ||
        lowerGoal.includes('report') || lowerGoal.includes('insight')) {

      tasks.push(this.createTask({
        title: 'Analyze data and generate insights',
        description: `Analyze information and provide insights for: ${goal}`,
        type: 'data_analysis',
        priority: 'normal',
        dependencies: tasks.length > 1 ? [tasks[tasks.length - 1].id] : []
      }))
    }

    // Final assembly task
    const dependencyIds = tasks.map(t => t.id)
    tasks.push(this.createTask({
      title: 'Assemble final deliverable',
      description: `Combine all components into final deliverable for: ${goal}`,
      type: 'composite',
      priority: 'critical',
      dependencies: dependencyIds
    }))

    return tasks
  }

  private createTask(partial: Partial<Task> & { title: string; description: string; type: TaskType }): Task {
    const task: Task = {
      id: `task-${generateId()}`,
      title: partial.title,
      description: partial.description,
      type: partial.type,
      priority: partial.priority || 'normal',
      status: 'pending',
      assignedAgentId: null,
      dependencies: partial.dependencies || [],
      input: {
        prompt: partial.description,
        context: ''
      },
      output: null,
      progress: 0,
      retryCount: 0,
      maxRetries: this.config.retryAttempts,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      metadata: partial.metadata || {}
    }
    this.tasks.set(task.id, task)
    return task
  }

  // ============================================================================
  // EXECUTION PLAN CREATION
  // ============================================================================

  private async createExecutionPlan(goal: string, tasks: Task[]): Promise<ExecutionPlan> {
    // Build phases based on dependencies
    const phases = this.buildExecutionPhases(tasks)

    // Estimate duration
    const estimatedDuration = phases.reduce((total, phase) => {
      const phaseDuration = phase.parallel
        ? Math.max(...phase.tasks.map(id =>
            (this.tasks.get(id)?.metadata.estimatedDuration as number) || 15000
          ))
        : phase.tasks.reduce((sum, id) =>
            sum + ((this.tasks.get(id)?.metadata.estimatedDuration as number) || 15000), 0
          )
      return total + phaseDuration
    }, 0)

    const plan: ExecutionPlan = {
      id: `plan-${generateId()}`,
      goal,
      tasks,
      phases,
      status: 'planning',
      progress: 0,
      estimatedDuration,
      actualDuration: 0,
      startedAt: null,
      completedAt: null
    }

    return plan
  }

  private buildExecutionPhases(tasks: Task[]): ExecutionPhase[] {
    const phases: ExecutionPhase[] = []
    const completed = new Set<string>()
    const remaining = [...tasks]

    while (remaining.length > 0) {
      // Find tasks whose dependencies are all completed
      const ready = remaining.filter(task =>
        task.dependencies.every(dep => completed.has(dep))
      )

      if (ready.length === 0) {
        // Circular dependency or missing dependency - force progress
        this.log('Potential circular dependency detected', 'warning')
        const forced = remaining.shift()
        if (forced) {
          phases.push({
            id: `phase-${generateId()}`,
            name: `Phase ${phases.length + 1}`,
            tasks: [forced.id],
            dependencies: phases.length > 0 ? [phases[phases.length - 1].id] : [],
            status: 'pending',
            parallel: false
          })
          completed.add(forced.id)
        }
        continue
      }

      // Group ready tasks into a phase
      const phase: ExecutionPhase = {
        id: `phase-${generateId()}`,
        name: `Phase ${phases.length + 1}`,
        tasks: ready.map(t => t.id),
        dependencies: phases.length > 0 ? [phases[phases.length - 1].id] : [],
        status: 'pending',
        parallel: ready.length > 1
      }

      phases.push(phase)

      // Mark tasks as scheduled
      for (const task of ready) {
        completed.add(task.id)
        const idx = remaining.indexOf(task)
        if (idx > -1) remaining.splice(idx, 1)
      }
    }

    return phases
  }

  // ============================================================================
  // PLAN EXECUTION
  // ============================================================================

  private async executePlan(plan: ExecutionPlan): Promise<Map<string, TaskOutput>> {
    const outputs = new Map<string, TaskOutput>()
    plan.status = 'executing'
    plan.startedAt = new Date()

    for (const phase of plan.phases) {
      if (this.isCancelled) {
        this.log('Execution cancelled', 'warning')
        break
      }

      this.log(`Executing ${phase.name} with ${phase.tasks.length} tasks`, 'info')
      phase.status = 'running'

      try {
        const phaseOutputs = await this.executePhase(phase, outputs)

        for (const [taskId, output] of phaseOutputs) {
          outputs.set(taskId, output)
        }

        phase.status = 'completed'
        this.callbacks.onPhaseComplete?.(phase)

      } catch (error) {
        phase.status = 'failed'
        if (!this.config.enableAutoRecovery) {
          throw error
        }
        this.log(`Phase ${phase.name} failed, continuing with recovery`, 'warning')
      }

      // Update plan progress
      const completedPhases = plan.phases.filter(p => p.status === 'completed').length
      plan.progress = Math.round((completedPhases / plan.phases.length) * 100)
    }

    return outputs
  }

  private async executePhase(
    phase: ExecutionPhase,
    previousOutputs: Map<string, TaskOutput>
  ): Promise<Map<string, TaskOutput>> {
    const outputs = new Map<string, TaskOutput>()

    if (phase.parallel) {
      // Execute tasks in parallel
      const promises = phase.tasks.map(async taskId => {
        await this.semaphore.acquire()
        try {
          const task = this.tasks.get(taskId)
          if (!task) throw new Error(`Task not found: ${taskId}`)

          // Inject previous outputs as context
          task.input.previousResults = Object.fromEntries(previousOutputs)

          const output = await this.executeTask(task)
          return { taskId, output }
        } finally {
          this.semaphore.release()
        }
      })

      const results = await Promise.allSettled(promises)

      for (const result of results) {
        if (result.status === 'fulfilled') {
          outputs.set(result.value.taskId, result.value.output)
        }
      }

    } else {
      // Execute tasks sequentially
      for (const taskId of phase.tasks) {
        if (this.isCancelled) break

        const task = this.tasks.get(taskId)
        if (!task) continue

        // Inject previous outputs as context
        task.input.previousResults = Object.fromEntries(previousOutputs)

        const output = await this.executeTask(task)
        outputs.set(taskId, output)
        previousOutputs.set(taskId, output)
      }
    }

    return outputs
  }

  // ============================================================================
  // TASK EXECUTION
  // ============================================================================

  private async executeTask(task: Task): Promise<TaskOutput> {
    this.log(`Executing task: ${task.title}`, 'info')
    task.status = 'running'
    task.startedAt = new Date()
    this.callbacks.onTaskStart?.(task)

    // Route task to appropriate agent
    const agent = this.routeTaskToAgent(task)
    if (!agent) {
      throw new Error(`No suitable agent found for task type: ${task.type}`)
    }

    task.assignedAgentId = agent.id
    agent.status = 'busy'
    agent.currentTaskId = task.id

    try {
      // Execute based on task type
      const output = await this.executeTaskWithAgent(task, agent)

      // Update task
      task.output = output
      task.status = 'completed'
      task.completedAt = new Date()
      task.progress = 100

      // Update agent metrics
      this.updateAgentMetrics(agent, true, Date.now() - task.startedAt!.getTime())

      // Store fact if research task
      if (task.type === 'research' && output.success) {
        this.storeFactsFromOutput(task, output)
      }

      // Store artifact
      for (const artifact of output.artifacts || []) {
        this.context?.artifacts.set(artifact.id, artifact)
      }

      this.callbacks.onTaskComplete?.(task)
      this.log(`Completed task: ${task.title}`, 'success')

      return output

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      task.error = errorMessage

      // Update agent metrics
      this.updateAgentMetrics(agent, false, Date.now() - (task.startedAt?.getTime() || Date.now()))

      // Retry logic
      if (task.retryCount < task.maxRetries && this.config.enableAutoRecovery) {
        task.retryCount++
        task.status = 'retrying'
        this.log(`Retrying task: ${task.title} (${task.retryCount}/${task.maxRetries})`, 'warning')

        await delay(this.config.retryDelay * task.retryCount)

        // Try with a different agent if available
        const alternateAgent = this.findAlternateAgent(task, agent)
        if (alternateAgent) {
          task.assignedAgentId = alternateAgent.id
        }

        return this.executeTask(task)
      }

      task.status = 'failed'
      task.completedAt = new Date()

      this.callbacks.onTaskFail?.(task, errorMessage)
      this.log(`Failed task: ${task.title} - ${errorMessage}`, 'error')

      return {
        success: false,
        content: `Task failed: ${errorMessage}`,
        confidence: 0
      }

    } finally {
      agent.status = 'idle'
      agent.currentTaskId = null
    }
  }

  private async executeTaskWithAgent(task: Task, agent: Agent): Promise<TaskOutput> {
    const artifacts: Artifact[] = []
    let content = ''
    let data: unknown = undefined

    // Build context from previous results
    const previousContext = task.input.previousResults
      ? Object.entries(task.input.previousResults)
          .map(([id, output]) => `[Previous: ${id}]\n${output.content.slice(0, 500)}`)
          .join('\n\n')
      : ''

    const fullContext = [task.input.context, previousContext].filter(Boolean).join('\n\n')

    switch (agent.type) {
      case 'research':
        content = await this.executeResearchTask(task, fullContext)
        break

      case 'coder':
        content = await this.executeCoderTask(task, fullContext)
        if (content.includes('```')) {
          artifacts.push({
            id: `artifact-${generateId()}`,
            type: 'code',
            title: task.title,
            content: content,
            metadata: { taskId: task.id }
          })
        }
        break

      case 'browser':
        content = await this.executeBrowserTask(task, fullContext)
        break

      case 'analyst':
        const analysisResult = await this.executeAnalystTask(task, fullContext)
        content = analysisResult.content
        data = analysisResult.data
        if (analysisResult.visualization) {
          artifacts.push({
            id: `artifact-${generateId()}`,
            type: 'chart',
            title: `Analysis: ${task.title}`,
            content: analysisResult.visualization,
            metadata: { taskId: task.id }
          })
        }
        break

      case 'creative':
        content = await this.executeCreativeTask(task, fullContext)
        artifacts.push({
          id: `artifact-${generateId()}`,
          type: task.type === 'image_generation' ? 'image' : 'text',
          title: task.title,
          content: content,
          metadata: { taskId: task.id }
        })
        break
    }

    // Update task progress during execution
    task.progress = 100
    this.callbacks.onTaskProgress?.(task, 100)

    return {
      success: true,
      content,
      data,
      artifacts,
      confidence: 0.85,
      suggestions: this.extractSuggestions(content)
    }
  }

  // ============================================================================
  // AGENT-SPECIFIC TASK EXECUTION
  // ============================================================================

  private async executeResearchTask(task: Task, context: string): Promise<string> {
    const systemPrompt = `You are a research specialist. Your job is to gather, verify, and synthesize information.

Context from previous tasks:
${context || 'None'}

Guidelines:
- Search for relevant, authoritative sources
- Verify facts across multiple sources
- Provide citations where possible
- Summarize key findings clearly
- Identify gaps in information
- Suggest areas for further research`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.input.prompt }
    ]

    // Simulate web search
    let searchResults = ''
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: task.input.prompt, limit: 5 }),
        signal: AbortSignal.timeout(10000)
      })

      if (response.ok) {
        const data = await response.json()
        if (data.results?.length > 0) {
          searchResults = data.results.map((r: { title: string; snippet: string; url: string }, i: number) =>
            `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
          ).join('\n\n')
        }
      }
    } catch {
      // Web search failed, proceed with AI knowledge
    }

    if (searchResults) {
      messages.push({
        role: 'user',
        content: `Here are search results to incorporate:\n\n${searchResults}`
      })
    }

    return await aiService.chatSync(messages)
  }

  private async executeCoderTask(task: Task, context: string): Promise<string> {
    const systemPrompt = `You are an expert software developer. Generate clean, production-ready code.

Context from previous tasks:
${context || 'None'}

Guidelines:
- Write complete, working code
- Use TypeScript for type safety
- Include comments for complex logic
- Follow modern best practices
- Use Tailwind CSS for styling
- Make code modular and reusable
- Handle edge cases and errors
- Return code wrapped in markdown code blocks`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.input.prompt }
    ]

    return await aiService.chatSync(messages)
  }

  private async executeBrowserTask(task: Task, context: string): Promise<string> {
    const urls = task.input.urls || []

    if (urls.length > 0) {
      const results: string[] = []

      for (const url of urls) {
        try {
          const pageData = await browserAutomation.extractContent(url)
          if (pageData) {
            results.push(`URL: ${url}\nTitle: ${pageData.title}\n\n${pageData.text.slice(0, 3000)}`)
          } else {
            results.push(`URL: ${url}\nError: No content extracted`)
          }
        } catch (error) {
          results.push(`URL: ${url}\nError: Failed to fetch content`)
        }
      }

      return results.join('\n\n---\n\n')
    }

    // If no URLs, use AI to determine what browser actions to take
    const systemPrompt = `You are a browser automation specialist. Based on the task, describe what web actions would be needed.

Context:
${context || 'None'}

Describe the steps that would be taken to accomplish this task using browser automation.`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.input.prompt }
    ]

    return await aiService.chatSync(messages)
  }

  private async executeAnalystTask(task: Task, context: string): Promise<{
    content: string
    data?: unknown
    visualization?: string
  }> {
    const systemPrompt = `You are a data analyst expert. Analyze data and provide actionable insights.

Context from previous tasks:
${context || 'None'}

Guidelines:
- Identify patterns and trends
- Provide statistical analysis where appropriate
- Generate clear visualizations (describe as ASCII or suggest chart types)
- Highlight key findings
- Make data-driven recommendations
- Present findings in a structured format`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.input.prompt }
    ]

    const content = await aiService.chatSync(messages)

    return {
      content,
      data: task.input.data,
      visualization: content.includes('chart') || content.includes('graph') ? content : undefined
    }
  }

  private async executeCreativeTask(task: Task, context: string): Promise<string> {
    const isImageTask = task.type === 'image_generation'

    const systemPrompt = isImageTask
      ? `You are a creative image prompt specialist. Generate detailed image generation prompts.

Context:
${context || 'None'}

Create a detailed prompt for image generation that captures:
- Visual style and mood
- Color palette
- Composition
- Key elements and subjects
- Technical specifications (resolution, aspect ratio)`

      : `You are a creative content specialist. Generate compelling, engaging content.

Context:
${context || 'None'}

Guidelines:
- Write with clarity and impact
- Match the appropriate tone and voice
- Create engaging headlines and copy
- Structure content for readability
- Include calls to action where appropriate
- Make content memorable and shareable`

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.input.prompt }
    ]

    return await aiService.chatSync(messages)
  }

  // ============================================================================
  // AGENT ROUTING & MANAGEMENT
  // ============================================================================

  private routeTaskToAgent(task: Task): Agent | null {
    const suitableTypes = TASK_AGENT_MAP[task.type] || ['research']

    // Find available agents of suitable types, sorted by priority
    const candidates = Array.from(this.agents.values())
      .filter(agent =>
        suitableTypes.includes(agent.type) &&
        agent.status === 'idle'
      )
      .sort((a, b) => {
        // Prioritize by success rate, then by load
        const scoreA = a.metrics.successRate * 100 - a.config.priority
        const scoreB = b.metrics.successRate * 100 - b.config.priority
        return scoreB - scoreA
      })

    if (candidates.length === 0) {
      // All suitable agents are busy, find one with least load
      return Array.from(this.agents.values())
        .filter(agent => suitableTypes.includes(agent.type))
        .sort((a, b) => a.metrics.tasksCompleted - b.metrics.tasksCompleted)[0] || null
    }

    return candidates[0]
  }

  private findAlternateAgent(task: Task, excludeAgent: Agent): Agent | null {
    const suitableTypes = TASK_AGENT_MAP[task.type] || ['research']

    return Array.from(this.agents.values())
      .filter(agent =>
        agent.id !== excludeAgent.id &&
        suitableTypes.includes(agent.type) &&
        agent.status === 'idle'
      )
      .sort((a, b) => b.metrics.successRate - a.metrics.successRate)[0] || null
  }

  private updateAgentMetrics(agent: Agent, success: boolean, duration: number): void {
    const metrics = agent.metrics

    if (success) {
      metrics.tasksCompleted++
    } else {
      metrics.tasksFailed++
    }

    const total = metrics.tasksCompleted + metrics.tasksFailed
    metrics.successRate = metrics.tasksCompleted / total
    metrics.totalExecutionTime += duration
    metrics.averageExecutionTime = metrics.totalExecutionTime / total
    metrics.lastActiveAt = new Date()
  }

  // ============================================================================
  // RESULT AGGREGATION
  // ============================================================================

  private async aggregateResults(outputs: Map<string, TaskOutput>): Promise<AggregatedResult> {
    const successfulOutputs = Array.from(outputs.values()).filter(o => o.success)

    if (successfulOutputs.length === 0) {
      return this.createErrorResult('No successful task outputs to aggregate')
    }

    // Collect all content and artifacts
    const allContent = successfulOutputs.map(o => o.content).join('\n\n---\n\n')
    const allArtifacts = successfulOutputs.flatMap(o => o.artifacts || [])
    const allSuggestions = [...new Set(successfulOutputs.flatMap(o => o.suggestions || []))]

    // Generate summary using AI
    const summaryPrompt = `Summarize these task results into a coherent final deliverable:

${allContent.slice(0, 4000)}

Create:
1. A concise executive summary (2-3 sentences)
2. Key deliverables and outputs
3. Recommendations for next steps`

    const messages: Message[] = [
      { role: 'system', content: 'You are an expert at synthesizing multiple work streams into coherent deliverables.' },
      { role: 'user', content: summaryPrompt }
    ]

    const summary = await aiService.chatSync(messages)

    return {
      summary: summary.split('\n')[0] || 'Orchestration completed successfully',
      mainContent: allContent,
      artifacts: allArtifacts,
      recommendations: allSuggestions.slice(0, 5),
      nextSteps: this.extractNextSteps(summary)
    }
  }

  // ============================================================================
  // CONTEXT & KNOWLEDGE MANAGEMENT
  // ============================================================================

  private createSharedContext(goal: string): SharedContext {
    return {
      goal,
      facts: new Map(),
      decisions: [],
      artifacts: new Map(),
      messages: [],
      memory: new Map()
    }
  }

  private storeFactsFromOutput(task: Task, output: TaskOutput): void {
    if (!this.context) return

    // Extract key facts from research output
    const factMatches = output.content.match(/(?:Key finding|Fact|Important):\s*([^.]+\.)/gi) || []

    for (const match of factMatches) {
      const fact: Fact = {
        id: `fact-${generateId()}`,
        content: match.replace(/^(?:Key finding|Fact|Important):\s*/i, ''),
        source: task.id,
        confidence: output.confidence,
        verifiedBy: [task.assignedAgentId || 'unknown'],
        createdAt: new Date()
      }
      this.context.facts.set(fact.id, fact)
    }
  }

  sendAgentMessage(fromAgentId: string, toAgentId: string | 'broadcast', content: string, data?: unknown): void {
    if (!this.context || !this.config.enableAgentCommunication) return

    const message: AgentMessage = {
      id: `msg-${generateId()}`,
      fromAgentId,
      toAgentId,
      type: 'info',
      content,
      data,
      timestamp: new Date()
    }

    this.context.messages.push(message)
    this.callbacks.onAgentMessage?.(message)
  }

  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================

  private startProgressTracking(): void {
    this.progressInterval = setInterval(() => {
      if (!this.currentPlan || !this.isRunning) return

      const totalTasks = this.currentPlan.tasks.length
      const completedTasks = this.currentPlan.tasks.filter(t => t.status === 'completed').length
      const runningTasks = this.currentPlan.tasks.filter(t => t.status === 'running')

      const overallProgress = Math.round((completedTasks / totalTasks) * 100)

      const currentPhase = this.currentPlan.phases.find(p => p.status === 'running')
      const phaseName = currentPhase?.name || 'Processing'

      const details = runningTasks.length > 0
        ? `Running: ${runningTasks.map(t => t.title).join(', ')}`
        : `${completedTasks}/${totalTasks} tasks completed`

      this.callbacks.onProgress?.(overallProgress, phaseName, details)
    }, this.config.progressUpdateInterval)
  }

  private stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private extractSuggestions(content: string): string[] {
    const suggestions: string[] = []
    const patterns = [
      /(?:suggest|recommend|consider|should)\s+([^.]+\.)/gi,
      /(?:next step|follow-up):\s*([^.]+\.)/gi
    ]

    for (const pattern of patterns) {
      const matches = content.match(pattern) || []
      suggestions.push(...matches.slice(0, 3))
    }

    return [...new Set(suggestions)].slice(0, 5)
  }

  private extractNextSteps(content: string): string[] {
    const steps: string[] = []
    const lines = content.split('\n')

    let inNextSteps = false
    for (const line of lines) {
      if (line.toLowerCase().includes('next step')) {
        inNextSteps = true
        continue
      }
      if (inNextSteps && line.trim().match(/^[\d\-\*]/)) {
        steps.push(line.replace(/^[\d\-\*\.]\s*/, '').trim())
      }
      if (steps.length >= 5) break
    }

    return steps
  }

  private calculateStats(): ExecutionStats {
    const tasks = Array.from(this.tasks.values())
    const completedTasks = tasks.filter(t => t.status === 'completed')
    const failedTasks = tasks.filter(t => t.status === 'failed')
    const retriedTasks = tasks.filter(t => t.retryCount > 0)

    const executionTimes = completedTasks
      .filter(t => t.startedAt && t.completedAt)
      .map(t => t.completedAt!.getTime() - t.startedAt!.getTime())

    const totalTime = executionTimes.reduce((sum, t) => sum + t, 0)
    const avgTime = executionTimes.length > 0 ? totalTime / executionTimes.length : 0

    const agentUtilization = new Map<string, number>()
    for (const agent of this.agents.values()) {
      const agentTasks = tasks.filter(t => t.assignedAgentId === agent.id)
      agentUtilization.set(agent.id, agentTasks.length / Math.max(1, tasks.length))
    }

    return {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      retriedTasks: retriedTasks.length,
      averageTaskTime: avgTime,
      totalExecutionTime: this.currentPlan?.actualDuration || totalTime,
      agentUtilization,
      parallelEfficiency: this.semaphore.available / this.config.maxParallelTasks
    }
  }

  private createEmptyPlan(goal: string): ExecutionPlan {
    return {
      id: `plan-${generateId()}`,
      goal,
      tasks: [],
      phases: [],
      status: 'failed',
      progress: 0,
      estimatedDuration: 0,
      actualDuration: 0,
      startedAt: null,
      completedAt: null
    }
  }

  private createErrorResult(error: string): AggregatedResult {
    return {
      summary: `Orchestration failed: ${error}`,
      mainContent: '',
      artifacts: [],
      recommendations: ['Review the error and try again', 'Simplify the goal if it\'s too complex'],
      nextSteps: ['Analyze the failure', 'Adjust parameters', 'Retry with modifications']
    }
  }

  private log(message: string, level: 'info' | 'success' | 'warning' | 'error'): void {
    console.log(`[AgentOrchestrator] [${level.toUpperCase()}] ${message}`)
    this.callbacks.onLog?.(message, level)
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  cancel(): void {
    this.isCancelled = true
    if (this.currentPlan) {
      this.currentPlan.status = 'cancelled'
    }
    this.log('Orchestration cancelled', 'warning')
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  getAgentByType(type: AgentType): Agent | undefined {
    return Array.from(this.agents.values()).find(a => a.type === type)
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id)
  }

  getCurrentPlan(): ExecutionPlan | null {
    return this.currentPlan
  }

  getContext(): SharedContext | null {
    return this.context
  }

  getStats(): ExecutionStats {
    return this.calculateStats()
  }

  isActive(): boolean {
    return this.isRunning
  }

  reset(): void {
    this.tasks.clear()
    this.context = null
    this.currentPlan = null
    this.isCancelled = false

    // Reset agent metrics
    for (const agent of this.agents.values()) {
      agent.status = 'idle'
      agent.currentTaskId = null
    }

    this.log('Orchestrator reset', 'info')
  }

  updateConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.maxParallelTasks) {
      this.semaphore = new Semaphore(config.maxParallelTasks)
    }
    this.log('Configuration updated', 'info')
  }
}

// ============================================================================
// SINGLETON INSTANCE & EXPORTS
// ============================================================================

export const agentOrchestrator = new AgentOrchestrator()

export default agentOrchestrator
