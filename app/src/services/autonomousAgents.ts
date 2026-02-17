/**
 * Autonomous Agent System
 * Real autonomous agent execution - agents work together, use real tools, and produce real results
 * Powered by AgentExecutionEngine for actual task execution
 */

import { AgentExecutionEngine, type AgentStep, type AgentOutput, type AgentPlan } from './agentEngine'

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'delegating' | 'reviewing' | 'complete' | 'error'

export interface AgentMessage {
  id: string
  agentId: string
  type: 'thought' | 'action' | 'result' | 'delegation' | 'error'
  content: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface AgentTask {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'delegated' | 'complete' | 'failed'
  assignedTo: string
  delegatedFrom?: string
  result?: string
  attempts: number
  maxAttempts: number
  createdAt: Date
  completedAt?: Date
}

export interface Agent {
  id: string
  name: string
  role: string
  avatar: string
  color: string
  capabilities: string[]
  status: AgentStatus
  currentTask?: AgentTask
  messages: AgentMessage[]
  collaborators: string[]
}

export interface AgentExecution {
  id: string
  goal: string
  status: 'running' | 'paused' | 'complete' | 'failed'
  agents: Agent[]
  tasks: AgentTask[]
  currentPhase: string
  progress: number
  startTime: Date
  endTime?: Date
  logs: AgentMessage[]
  outputs: AgentOutput[]
  plan?: AgentPlan
}

// Create the agent roster
export const createAgentRoster = (): Agent[] => [
  {
    id: 'orchestrator',
    name: 'Atlas',
    role: 'Chief Orchestrator',
    avatar: 'TG',
    color: '#d9a07a',
    capabilities: ['coordination', 'planning', 'delegation', 'monitoring'],
    status: 'idle',
    messages: [],
    collaborators: ['engineer', 'designer', 'marketer', 'researcher', 'analyst']
  },
  {
    id: 'engineer',
    name: 'Nova',
    role: 'Lead Engineer',
    avatar: 'OP',
    color: '#60a5fa',
    capabilities: ['coding', 'testing', 'deployment', 'debugging', 'optimization'],
    status: 'idle',
    messages: [],
    collaborators: ['designer', 'analyst']
  },
  {
    id: 'designer',
    name: 'Pixel',
    role: 'Creative Director',
    avatar: 'DS',
    color: '#f472b6',
    capabilities: ['ui_design', 'ux_design', 'branding', 'prototyping', 'animation'],
    status: 'idle',
    messages: [],
    collaborators: ['engineer', 'marketer']
  },
  {
    id: 'marketer',
    name: 'Echo',
    role: 'Growth Lead',
    avatar: 'MK',
    color: '#34d399',
    capabilities: ['content', 'campaigns', 'seo', 'social_media', 'analytics'],
    status: 'idle',
    messages: [],
    collaborators: ['designer', 'analyst', 'researcher']
  },
  {
    id: 'researcher',
    name: 'Scout',
    role: 'Deep Researcher',
    avatar: 'RS',
    color: '#a78bfa',
    capabilities: ['web_research', 'data_gathering', 'competitive_analysis', 'trend_analysis'],
    status: 'idle',
    messages: [],
    collaborators: ['analyst', 'marketer']
  },
  {
    id: 'analyst',
    name: 'Logic',
    role: 'Data Analyst',
    avatar: 'DA',
    color: '#fbbf24',
    capabilities: ['data_analysis', 'reporting', 'forecasting', 'optimization'],
    status: 'idle',
    messages: [],
    collaborators: ['researcher', 'engineer']
  }
]

// Utility functions
const generateId = () => crypto.randomUUID()

// Map step types to agent assignments
const stepTypeToAgent: Record<string, string> = {
  'search': 'researcher',
  'browse': 'researcher',
  'analyze': 'analyst',
  'code': 'engineer',
  'think': 'orchestrator',
  'execute': 'engineer',
  'complete': 'orchestrator'
}

// Main Autonomous Agent Orchestrator
export class AutonomousOrchestrator {
  private agents: Map<string, Agent> = new Map()
  private execution: AgentExecution | null = null
  private engine: AgentExecutionEngine
  private onUpdate?: (execution: AgentExecution) => void

  constructor() {
    createAgentRoster().forEach(agent => {
      this.agents.set(agent.id, agent)
    })
    this.engine = new AgentExecutionEngine()
  }

  async startExecution(
    goal: string,
    onUpdate?: (execution: AgentExecution) => void
  ): Promise<AgentExecution> {
    this.onUpdate = onUpdate

    // Reset all agents
    this.agents.forEach(agent => {
      agent.status = 'idle'
      agent.messages = []
      agent.currentTask = undefined
    })

    this.execution = {
      id: generateId(),
      goal,
      status: 'running',
      agents: Array.from(this.agents.values()),
      tasks: [],
      currentPhase: 'Planning',
      progress: 0,
      startTime: new Date(),
      logs: [],
      outputs: []
    }

    this.notifyUpdate()

    // Start the orchestrator agent
    const orchestrator = this.agents.get('orchestrator')!
    this.setAgentStatus(orchestrator, 'thinking')
    this.addMessage(orchestrator.id, 'thought', `Analyzing goal: "${goal}"`)

    // Execute using the real engine
    await this.engine.execute(goal, {
      onStepStart: (step) => this.handleStepStart(step),
      onStepComplete: (step) => this.handleStepComplete(step),
      onStepError: (step, error) => this.handleStepError(step, error),
      onOutput: (output) => this.handleOutput(output),
      onPlanUpdate: (plan) => this.handlePlanUpdate(plan),
      onLog: (message, type) => this.handleLog(message, type),
      onProgress: (percent, phase) => this.handleProgress(percent, phase)
    })

    return this.execution
  }

  private handleStepStart(step: AgentStep): void {
    if (!this.execution) return

    // Determine which agent handles this step
    const agentId = stepTypeToAgent[step.type] || 'orchestrator'
    const agent = this.agents.get(agentId)

    if (agent) {
      this.setAgentStatus(agent, 'working')
      agent.currentTask = {
        id: step.id,
        description: step.description,
        status: 'in_progress',
        assignedTo: agentId,
        attempts: step.retryCount,
        maxAttempts: step.maxRetries,
        createdAt: new Date()
      }

      this.addMessage(agentId, 'action', `Working on: ${step.description}`)

      if (step.toolUsed) {
        this.addMessage(agentId, 'action', `Using tool: ${step.toolUsed}`)
      }
    }

    this.notifyUpdate()
  }

  private handleStepComplete(step: AgentStep): void {
    if (!this.execution) return

    const agentId = stepTypeToAgent[step.type] || 'orchestrator'
    const agent = this.agents.get(agentId)

    if (agent) {
      this.setAgentStatus(agent, 'idle')

      if (agent.currentTask) {
        agent.currentTask.status = 'complete'
        agent.currentTask.result = step.result?.slice(0, 200)
        agent.currentTask.completedAt = new Date()
      }

      this.addMessage(agentId, 'result', `Completed: ${step.description}`)

      if (step.result) {
        this.addMessage(agentId, 'result', step.result.slice(0, 300) + (step.result.length > 300 ? '...' : ''))
      }
    }

    this.notifyUpdate()
  }

  private handleStepError(step: AgentStep, error: string): void {
    if (!this.execution) return

    const agentId = stepTypeToAgent[step.type] || 'orchestrator'
    const agent = this.agents.get(agentId)

    if (agent) {
      this.setAgentStatus(agent, 'error')

      if (agent.currentTask) {
        agent.currentTask.status = 'failed'
      }

      this.addMessage(agentId, 'error', `Error: ${error}`)
    }

    this.notifyUpdate()
  }

  private handleOutput(output: AgentOutput): void {
    if (!this.execution) return

    this.execution.outputs.push(output)

    // Determine which agent produced this
    let agentId = 'orchestrator'
    if (output.type === 'search_results' || output.type === 'web_content') {
      agentId = 'researcher'
    } else if (output.type === 'code') {
      agentId = 'engineer'
    } else if (output.type === 'data') {
      agentId = 'analyst'
    }

    this.addMessage(agentId, 'result', `Generated output: ${output.title}`)
    this.notifyUpdate()
  }

  private handlePlanUpdate(plan: AgentPlan): void {
    if (!this.execution) return

    this.execution.plan = plan

    // Update status based on plan status
    if (plan.status === 'complete') {
      this.execution.status = 'complete'
      this.execution.endTime = new Date()

      // Set all agents to complete
      this.agents.forEach(agent => {
        this.setAgentStatus(agent, 'complete')
      })
    } else if (plan.status === 'failed') {
      this.execution.status = 'failed'
    } else if (plan.status === 'paused') {
      this.execution.status = 'paused'
    }

    // Create tasks from plan steps
    this.execution.tasks = plan.steps.map(step => ({
      id: step.id,
      description: step.description,
      status: step.status === 'success' ? 'complete' as const :
              step.status === 'error' ? 'failed' as const :
              step.status === 'running' ? 'in_progress' as const : 'pending' as const,
      assignedTo: stepTypeToAgent[step.type] || 'orchestrator',
      attempts: step.retryCount,
      maxAttempts: step.maxRetries,
      createdAt: step.startTime || new Date(),
      completedAt: step.endTime,
      result: step.result?.slice(0, 200)
    }))

    this.notifyUpdate()
  }

  private handleLog(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    if (!this.execution) return

    // Map log types to message types
    const messageType: AgentMessage['type'] = type === 'error' ? 'error' :
                                               type === 'success' ? 'result' : 'thought'

    // Determine which agent is logging based on content
    let agentId = 'orchestrator'
    const lowerMessage = message.toLowerCase()
    if (lowerMessage.includes('search') || lowerMessage.includes('fetch')) {
      agentId = 'researcher'
    } else if (lowerMessage.includes('code') || lowerMessage.includes('generat')) {
      agentId = 'engineer'
    } else if (lowerMessage.includes('analyz')) {
      agentId = 'analyst'
    }

    this.addMessage(agentId, messageType, message)
    this.notifyUpdate()
  }

  private handleProgress(percent: number, phase: string): void {
    if (!this.execution) return

    this.execution.progress = percent
    this.execution.currentPhase = phase
    this.notifyUpdate()
  }

  private setAgentStatus(agent: Agent, status: AgentStatus): void {
    agent.status = status
    this.agents.set(agent.id, agent)
  }

  private addMessage(agentId: string, type: AgentMessage['type'], content: string): void {
    if (!this.execution) return

    const message: AgentMessage = {
      id: generateId(),
      agentId,
      type,
      content,
      timestamp: new Date()
    }

    const agent = this.agents.get(agentId)
    if (agent) {
      agent.messages.push(message)
    }
    this.execution.logs.push(message)
  }

  private notifyUpdate(): void {
    if (this.execution && this.onUpdate) {
      this.execution.agents = Array.from(this.agents.values())
      this.onUpdate({ ...this.execution })
    }
  }

  pause(): void {
    this.engine.pause()
    if (this.execution) {
      this.execution.status = 'paused'
      this.agents.forEach(agent => {
        if (agent.status === 'working') {
          agent.status = 'idle'
        }
      })
      this.notifyUpdate()
    }
  }

  resume(): void {
    this.engine.resume()
    if (this.execution) {
      this.execution.status = 'running'
      this.notifyUpdate()
    }
  }

  stop(): void {
    this.engine.stop()
    if (this.execution) {
      this.execution.status = 'failed'
      this.agents.forEach(agent => {
        agent.status = 'idle'
      })
      this.notifyUpdate()
    }
  }
}

// Singleton instance
export const autonomousOrchestrator = new AutonomousOrchestrator()
