/**
 * Department Agents with Self-Annealing Capabilities
 * Each department has specialized tools and continuous self-improvement
 */

import { SelfAnnealingEngine, type AnnealingState, type QualityMetrics } from './selfAnnealingEngine'
import { toolRegistry, type ToolDefinition, type ToolResult } from './tools/toolRegistry'

export type DepartmentId =
  | 'engineering'
  | 'design'
  | 'marketing'
  | 'sales'
  | 'research'
  | 'finance'
  | 'legal'
  | 'hr'
  | 'support'
  | 'security'
  | 'data'
  | 'operations'

export interface DepartmentConfig {
  id: DepartmentId
  name: string
  description: string
  icon: string
  color: string
  capabilities: string[]
  toolIds: string[]
  annealingConfig: Partial<AnnealingConfig>
}

interface AnnealingConfig {
  initialTemperature: number
  coolingRate: number
  minTemperature: number
  maxIterations: number
  targetEnergy: number
}

export interface TaskExecution {
  id: string
  departmentId: DepartmentId
  task: string
  status: 'pending' | 'running' | 'annealing' | 'complete' | 'failed'
  progress: number
  iterations: number
  quality: QualityMetrics
  toolsUsed: string[]
  outputs: unknown[]
  annealingState?: AnnealingState
  startTime: Date
  endTime?: Date
  logs: ExecutionLog[]
}

export interface ExecutionLog {
  timestamp: Date
  type: 'info' | 'action' | 'tool' | 'improvement' | 'error'
  message: string
  data?: unknown
}

// Department configurations with tools and self-annealing settings
const DEPARTMENT_CONFIGS: DepartmentConfig[] = [
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Full-stack development with continuous code quality improvement',
    icon: '⚡',
    color: '#60a5fa',
    capabilities: ['coding', 'testing', 'deployment', 'debugging', 'optimization', 'architecture'],
    toolIds: [
      'bolt_generate_component',
      'bolt_generate_api',
      'bolt_generate_fullstack',
      'playwright_navigate',
      'playwright_click',
      'playwright_evaluate',
      'computer_keyboard_type'
    ],
    annealingConfig: {
      initialTemperature: 100,
      coolingRate: 0.92,
      targetEnergy: 0.08
    }
  },
  {
    id: 'design',
    name: 'Design',
    description: 'UI/UX design with aesthetic optimization',
    icon: '🎨',
    color: '#f472b6',
    capabilities: ['ui_design', 'ux_design', 'branding', 'prototyping', 'animation', 'accessibility'],
    toolIds: [
      'bolt_generate_component',
      'playwright_screenshot',
      'vision_analyze',
      'computer_screen_capture'
    ],
    annealingConfig: {
      initialTemperature: 80,
      coolingRate: 0.95,
      targetEnergy: 0.05
    }
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Content creation and campaign optimization',
    icon: '📣',
    color: '#34d399',
    capabilities: ['content', 'campaigns', 'seo', 'social_media', 'analytics', 'copywriting'],
    toolIds: [
      'ollama_generate',
      'searxng_search',
      'workflow_webhook',
      'crawlee_scrape_page'
    ],
    annealingConfig: {
      initialTemperature: 120,
      coolingRate: 0.90,
      targetEnergy: 0.10
    }
  },
  {
    id: 'sales',
    name: 'Sales',
    description: 'Lead generation and conversion optimization',
    icon: '🎯',
    color: '#f59e0b',
    capabilities: ['lead_gen', 'outreach', 'crm', 'proposals', 'negotiations'],
    toolIds: [
      'ollama_generate',
      'searxng_search',
      'workflow_trigger',
      'workflow_webhook'
    ],
    annealingConfig: {
      initialTemperature: 100,
      coolingRate: 0.93,
      targetEnergy: 0.12
    }
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Deep research with comprehensive data gathering',
    icon: '🔍',
    color: '#a78bfa',
    capabilities: ['web_research', 'data_gathering', 'competitive_analysis', 'trend_analysis', 'academic'],
    toolIds: [
      'searxng_search',
      'crawlee_scrape_page',
      'crawlee_crawl_site',
      'playwright_navigate',
      'playwright_evaluate',
      'langchain_document_load',
      'ollama_embed',
      'chromadb_store',
      'chromadb_query'
    ],
    annealingConfig: {
      initialTemperature: 150,
      coolingRate: 0.88,
      targetEnergy: 0.05
    }
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Financial analysis and reporting',
    icon: '💰',
    color: '#10b981',
    capabilities: ['accounting', 'budgeting', 'forecasting', 'reporting', 'compliance'],
    toolIds: [
      'langchain_document_load',
      'ollama_generate',
      'chromadb_query'
    ],
    annealingConfig: {
      initialTemperature: 60,
      coolingRate: 0.97,
      targetEnergy: 0.02
    }
  },
  {
    id: 'legal',
    name: 'Legal',
    description: 'Contract analysis and compliance',
    icon: '⚖️',
    color: '#6366f1',
    capabilities: ['contracts', 'compliance', 'ip', 'privacy', 'regulations'],
    toolIds: [
      'langchain_document_load',
      'langchain_split_text',
      'ollama_generate',
      'ollama_embed',
      'chromadb_store',
      'chromadb_query'
    ],
    annealingConfig: {
      initialTemperature: 50,
      coolingRate: 0.98,
      targetEnergy: 0.01
    }
  },
  {
    id: 'hr',
    name: 'People Ops',
    description: 'HR automation and talent management',
    icon: '👥',
    color: '#ec4899',
    capabilities: ['recruiting', 'onboarding', 'culture', 'performance', 'benefits'],
    toolIds: [
      'ollama_generate',
      'langchain_document_load',
      'workflow_trigger'
    ],
    annealingConfig: {
      initialTemperature: 70,
      coolingRate: 0.95,
      targetEnergy: 0.08
    }
  },
  {
    id: 'support',
    name: 'Customer Success',
    description: 'Customer support with continuous satisfaction improvement',
    icon: '🎧',
    color: '#06b6d4',
    capabilities: ['tickets', 'chatbot', 'knowledge_base', 'feedback', 'retention'],
    toolIds: [
      'ollama_generate',
      'chromadb_query',
      'searxng_search',
      'workflow_webhook'
    ],
    annealingConfig: {
      initialTemperature: 100,
      coolingRate: 0.91,
      targetEnergy: 0.05
    }
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Security monitoring and vulnerability assessment',
    icon: '🛡️',
    color: '#ef4444',
    capabilities: ['monitoring', 'vulnerability', 'compliance', 'incident', 'audit'],
    toolIds: [
      'playwright_navigate',
      'playwright_evaluate',
      'crawlee_scrape_page',
      'computer_screen_capture'
    ],
    annealingConfig: {
      initialTemperature: 40,
      coolingRate: 0.99,
      targetEnergy: 0.001
    }
  },
  {
    id: 'data',
    name: 'Data & Analytics',
    description: 'Data analysis with continuous insight improvement',
    icon: '📊',
    color: '#fbbf24',
    capabilities: ['data_analysis', 'visualization', 'ml', 'reporting', 'etl'],
    toolIds: [
      'langchain_document_load',
      'langchain_split_text',
      'ollama_embed',
      'chromadb_store',
      'chromadb_query',
      'ollama_generate'
    ],
    annealingConfig: {
      initialTemperature: 100,
      coolingRate: 0.92,
      targetEnergy: 0.05
    }
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Process automation and efficiency optimization',
    icon: '⚙️',
    color: '#8b5cf6',
    capabilities: ['automation', 'processes', 'logistics', 'inventory', 'scheduling'],
    toolIds: [
      'workflow_trigger',
      'workflow_webhook',
      'computer_keyboard_type',
      'computer_keyboard_press'
    ],
    annealingConfig: {
      initialTemperature: 80,
      coolingRate: 0.94,
      targetEnergy: 0.08
    }
  }
]

// Department Agent class with self-annealing
export class DepartmentAgent {
  private config: DepartmentConfig
  private annealingEngine: SelfAnnealingEngine
  private tools: ToolDefinition[]
  private executions: TaskExecution[] = []

  constructor(config: DepartmentConfig) {
    this.config = config
    this.annealingEngine = new SelfAnnealingEngine(config.annealingConfig)
    this.tools = config.toolIds
      .map(id => toolRegistry.getTool(id))
      .filter((t): t is ToolDefinition => t !== undefined)
  }

  get id() { return this.config.id }
  get name() { return this.config.name }
  get description() { return this.config.description }
  get icon() { return this.config.icon }
  get color() { return this.config.color }
  get capabilities() { return this.config.capabilities }

  getTools(): ToolDefinition[] {
    return this.tools
  }

  // Execute a task with self-annealing for continuous improvement
  async executeTask(
    task: string,
    onProgress?: (execution: TaskExecution) => void
  ): Promise<TaskExecution> {
    const execution: TaskExecution = {
      id: crypto.randomUUID(),
      departmentId: this.config.id,
      task,
      status: 'running',
      progress: 0,
      iterations: 0,
      quality: {
        accuracy: 0,
        completeness: 0,
        performance: 0,
        reliability: 0,
        userSatisfaction: 0,
        errorRate: 1
      },
      toolsUsed: [],
      outputs: [],
      startTime: new Date(),
      logs: []
    }

    this.executions.push(execution)
    this.log(execution, 'info', `Starting task: ${task}`)

    // Phase 1: Initial execution
    await this.initialExecution(execution, onProgress)

    // Phase 2: Self-annealing optimization
    execution.status = 'annealing'
    this.log(execution, 'info', 'Starting self-annealing optimization')
    await this.selfAnneal(execution, onProgress)

    // Phase 3: Finalization
    execution.status = 'complete'
    execution.progress = 100
    execution.endTime = new Date()
    this.log(execution, 'info', `Task completed with quality score: ${this.calculateOverallQuality(execution.quality).toFixed(2)}`)

    onProgress?.(execution)
    return execution
  }

  private async initialExecution(
    execution: TaskExecution,
    onProgress?: (execution: TaskExecution) => void
  ) {
    // Select relevant tools based on task
    const relevantTools = this.selectToolsForTask(execution.task)

    for (let i = 0; i < relevantTools.length; i++) {
      const tool = relevantTools[i]
      execution.toolsUsed.push(tool.id)

      this.log(execution, 'tool', `Executing: ${tool.name}`)

      const result = await toolRegistry.executeTool(tool.id, {
        task: execution.task,
        context: this.config.capabilities
      })

      execution.outputs.push(result.output)
      execution.progress = Math.round(((i + 1) / relevantTools.length) * 50)

      // Update quality based on tool results
      this.updateQuality(execution, result)

      onProgress?.(execution)
    }
  }

  private async selfAnneal(
    execution: TaskExecution,
    onProgress?: (execution: TaskExecution) => void
  ) {
    const initialQuality = this.calculateOverallQuality(execution.quality)

    const { state } = await this.annealingEngine.anneal(
      execution.quality,
      async (quality) => {
        // Energy = 1 - overall quality (lower is better)
        return 1 - this.calculateOverallQuality(quality)
      },
      async (quality, temperature) => {
        // Mutate quality by running improvement tools
        return await this.improveQuality(quality, temperature, execution)
      },
      (state, _quality) => {
        execution.annealingState = state
        execution.iterations = state.iterations
        execution.progress = 50 + Math.round(state.convergence * 50)

        if (state.iterations % 5 === 0) {
          this.log(execution, 'improvement',
            `Iteration ${state.iterations}: Quality ${(1 - state.bestEnergy).toFixed(3)}, Temp: ${state.temperature.toFixed(2)}`
          )
        }

        onProgress?.(execution)
      }
    )

    execution.annealingState = state
    const finalQuality = this.calculateOverallQuality(execution.quality)

    this.log(execution, 'info',
      `Self-annealing complete. Quality improved from ${initialQuality.toFixed(3)} to ${finalQuality.toFixed(3)} (${state.improvements} improvements in ${state.iterations} iterations)`
    )
  }

  private async improveQuality(
    quality: QualityMetrics,
    temperature: number,
    execution: TaskExecution
  ): Promise<QualityMetrics> {
    // Higher temperature = more aggressive mutations
    const mutationStrength = temperature / 100

    // Simulate improvement attempts using tools
    const improvementTools = this.tools.filter(t =>
      t.selfAnnealing && Math.random() < mutationStrength
    )

    let improved = { ...quality }

    for (const tool of improvementTools.slice(0, 2)) {
      const result = await toolRegistry.executeTool(tool.id, {
        task: execution.task,
        improvement: true
      })

      if (result.success) {
        // Apply improvements based on tool quality
        const boost = result.metrics.quality * mutationStrength * 0.1

        improved = {
          accuracy: Math.min(1, improved.accuracy + boost * (Math.random() - 0.3)),
          completeness: Math.min(1, improved.completeness + boost * (Math.random() - 0.3)),
          performance: Math.min(1, improved.performance + boost * (Math.random() - 0.3)),
          reliability: Math.min(1, improved.reliability + boost * (Math.random() - 0.3)),
          userSatisfaction: Math.min(1, improved.userSatisfaction + boost * (Math.random() - 0.3)),
          errorRate: Math.max(0, improved.errorRate - boost * Math.random())
        }

        // Apply suggestions if any
        if (result.suggestions && result.suggestions.length > 0) {
          this.log(execution, 'improvement', `Suggestion: ${result.suggestions[0]}`)
        }
      }
    }

    // Ensure quality metrics stay in valid range
    Object.keys(improved).forEach(key => {
      const k = key as keyof QualityMetrics
      if (k === 'errorRate') {
        improved[k] = Math.max(0, Math.min(1, improved[k]))
      } else {
        improved[k] = Math.max(0, Math.min(1, improved[k]))
      }
    })

    execution.quality = improved
    return improved
  }

  private selectToolsForTask(task: string): ToolDefinition[] {
    const taskLower = task.toLowerCase()
    const keywords = taskLower.split(/\s+/)

    // Score tools based on relevance
    const scored = this.tools.map(tool => {
      let score = 0
      const toolKeywords = [
        ...tool.capabilities,
        ...tool.name.toLowerCase().split(/\s+/),
        ...tool.description.toLowerCase().split(/\s+/)
      ]

      keywords.forEach(kw => {
        if (toolKeywords.some(tk => tk.includes(kw) || kw.includes(tk))) {
          score++
        }
      })

      return { tool, score }
    })

    // Return top tools, minimum 2
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(2, Math.min(5, scored.filter(s => s.score > 0).length)))
      .map(s => s.tool)
  }

  private updateQuality(execution: TaskExecution, result: ToolResult) {
    const weight = 0.3 // How much each tool result affects quality
    const { metrics } = result

    execution.quality = {
      accuracy: execution.quality.accuracy * (1 - weight) + metrics.quality * weight,
      completeness: execution.quality.completeness * (1 - weight) + (result.success ? metrics.quality : 0) * weight,
      performance: execution.quality.performance * (1 - weight) + (1 - metrics.executionTime / 10000) * weight,
      reliability: execution.quality.reliability * (1 - weight) + metrics.confidence * weight,
      userSatisfaction: execution.quality.userSatisfaction * (1 - weight) + metrics.quality * weight,
      errorRate: execution.quality.errorRate * (1 - weight) + (result.success ? 0 : 1) * weight
    }
  }

  private calculateOverallQuality(quality: QualityMetrics): number {
    const weights = {
      accuracy: 0.25,
      completeness: 0.20,
      performance: 0.15,
      reliability: 0.20,
      userSatisfaction: 0.15,
      errorRate: 0.05 // Negative weight handled below
    }

    return (
      quality.accuracy * weights.accuracy +
      quality.completeness * weights.completeness +
      quality.performance * weights.performance +
      quality.reliability * weights.reliability +
      quality.userSatisfaction * weights.userSatisfaction +
      (1 - quality.errorRate) * weights.errorRate
    )
  }

  private log(execution: TaskExecution, type: ExecutionLog['type'], message: string, data?: unknown) {
    execution.logs.push({
      timestamp: new Date(),
      type,
      message,
      data
    })
  }

  getExecutions(): TaskExecution[] {
    return this.executions
  }

  getLatestExecution(): TaskExecution | undefined {
    return this.executions[this.executions.length - 1]
  }
}

// Department Agent Manager
export class DepartmentAgentManager {
  private agents: Map<DepartmentId, DepartmentAgent> = new Map()

  constructor() {
    DEPARTMENT_CONFIGS.forEach(config => {
      this.agents.set(config.id, new DepartmentAgent(config))
    })
  }

  getAgent(id: DepartmentId): DepartmentAgent | undefined {
    return this.agents.get(id)
  }

  getAllAgents(): DepartmentAgent[] {
    return Array.from(this.agents.values())
  }

  async executeAcrossDepartments(
    task: string,
    departmentIds: DepartmentId[],
    onProgress?: (departmentId: DepartmentId, execution: TaskExecution) => void
  ): Promise<Map<DepartmentId, TaskExecution>> {
    const results = new Map<DepartmentId, TaskExecution>()

    // Execute in parallel across departments
    await Promise.all(
      departmentIds.map(async (id) => {
        const agent = this.agents.get(id)
        if (agent) {
          const execution = await agent.executeTask(task, (exec) => {
            onProgress?.(id, exec)
          })
          results.set(id, execution)
        }
      })
    )

    return results
  }

  // Find best department for a task
  findBestDepartment(requiredCapabilities: string[]): DepartmentAgent | undefined {
    let bestAgent: DepartmentAgent | undefined
    let bestScore = 0

    for (const agent of this.agents.values()) {
      const score = requiredCapabilities.filter(cap =>
        agent.capabilities.includes(cap)
      ).length

      if (score > bestScore) {
        bestScore = score
        bestAgent = agent
      }
    }

    return bestAgent
  }
}

export const departmentAgentManager = new DepartmentAgentManager()
