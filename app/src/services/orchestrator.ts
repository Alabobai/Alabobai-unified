/**
 * Clawdbot Agent Orchestrator
 * Coordinates and manages the 12 department agents
 */

export interface Agent {
  id: string
  name: string
  description: string
  capabilities: string[]
  status: 'idle' | 'working' | 'error'
}

export interface Task {
  id: string
  agentId: string
  title: string
  description: string
  status: 'pending' | 'running' | 'complete' | 'error'
  progress?: number
  result?: string
}

// Define the 12 Department Agents
export const DEPARTMENT_AGENTS: Agent[] = [
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: 'Multi-source research with academic precision',
    capabilities: ['web-search', 'academic-search', 'data-analysis', 'report-generation'],
    status: 'idle',
  },
  {
    id: 'code-builder',
    name: 'Code Builder',
    description: 'Full-stack development with modern frameworks',
    capabilities: ['code-generation', 'refactoring', 'debugging', 'testing'],
    status: 'idle',
  },
  {
    id: 'financial-guardian',
    name: 'Financial Guardian',
    description: 'Budget tracking and financial analysis',
    capabilities: ['expense-tracking', 'budget-planning', 'financial-reports', 'alerts'],
    status: 'idle',
  },
  {
    id: 'privacy-fortress',
    name: 'Privacy Fortress',
    description: 'Data security and privacy management',
    capabilities: ['encryption', 'privacy-audit', 'data-protection', 'security-scanning'],
    status: 'idle',
  },
  {
    id: 'trust-architect',
    name: 'Trust Architect',
    description: 'Verification and authentication systems',
    capabilities: ['identity-verification', 'trust-scoring', 'auth-systems', 'compliance'],
    status: 'idle',
  },
  {
    id: 'computer-control',
    name: 'Computer Control',
    description: 'Desktop automation and VM management',
    capabilities: ['screen-capture', 'mouse-keyboard', 'vm-management', 'automation'],
    status: 'idle',
  },
  {
    id: 'voice-interface',
    name: 'Voice Interface',
    description: 'Speech-to-text and text-to-speech',
    capabilities: ['transcription', 'voice-synthesis', 'voice-commands', 'real-time-audio'],
    status: 'idle',
  },
  {
    id: 'integration-hub',
    name: 'Integration Hub',
    description: 'Third-party API and service integration',
    capabilities: ['api-integration', 'webhooks', 'oauth', 'data-sync'],
    status: 'idle',
  },
  {
    id: 'reliability-engine',
    name: 'Reliability Engine',
    description: 'Error handling and system resilience',
    capabilities: ['error-recovery', 'redundancy', 'health-checks', 'auto-scaling'],
    status: 'idle',
  },
  {
    id: 'creative-studio',
    name: 'Creative Studio',
    description: 'Image, video, and content generation',
    capabilities: ['image-generation', 'video-editing', 'content-writing', 'design'],
    status: 'idle',
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Data processing and visualization',
    capabilities: ['data-processing', 'visualization', 'statistics', 'ml-models'],
    status: 'idle',
  },
  {
    id: 'deployment-ops',
    name: 'Deployment Ops',
    description: 'CI/CD and infrastructure management',
    capabilities: ['ci-cd', 'docker', 'kubernetes', 'cloud-deployment'],
    status: 'idle',
  },
]

// Agent Orchestrator Class
class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map()
  private tasks: Map<string, Task> = new Map()
  private taskCallbacks: Map<string, (task: Task) => void> = new Map()

  constructor() {
    // Initialize agents
    DEPARTMENT_AGENTS.forEach(agent => {
      this.agents.set(agent.id, { ...agent })
    })
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  // Analyze user request and determine which agents to use
  analyzeRequest(request: string): string[] {
    const requestLower = request.toLowerCase()
    const matchedAgents: string[] = []

    // Keyword mapping to agents
    const keywordMap: Record<string, string[]> = {
      'deep-research': ['research', 'find', 'search', 'analyze', 'study', 'investigate'],
      'code-builder': ['code', 'build', 'create', 'develop', 'program', 'app', 'website', 'api'],
      'financial-guardian': ['budget', 'finance', 'money', 'expense', 'cost', 'price'],
      'privacy-fortress': ['privacy', 'security', 'encrypt', 'protect', 'secure'],
      'trust-architect': ['verify', 'authenticate', 'trust', 'identity', 'credential'],
      'computer-control': ['automate', 'desktop', 'screen', 'click', 'type', 'vm'],
      'voice-interface': ['voice', 'speak', 'listen', 'transcribe', 'audio'],
      'integration-hub': ['integrate', 'connect', 'api', 'webhook', 'sync'],
      'reliability-engine': ['error', 'recover', 'reliable', 'failover', 'backup'],
      'creative-studio': ['design', 'image', 'video', 'creative', 'art', 'content'],
      'data-analyst': ['data', 'chart', 'graph', 'statistics', 'visualize', 'analyze'],
      'deployment-ops': ['deploy', 'ci', 'cd', 'docker', 'kubernetes', 'cloud'],
    }

    for (const [agentId, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(keyword => requestLower.includes(keyword))) {
        matchedAgents.push(agentId)
      }
    }

    // Default to code-builder if no specific match
    if (matchedAgents.length === 0) {
      matchedAgents.push('code-builder')
    }

    return matchedAgents
  }

  // Create a new task for an agent
  createTask(agentId: string, title: string, description: string): Task {
    const taskId = crypto.randomUUID()
    const task: Task = {
      id: taskId,
      agentId,
      title,
      description,
      status: 'pending',
      progress: 0,
    }

    this.tasks.set(taskId, task)

    // Update agent status
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = 'working'
    }

    return task
  }

  // Update task progress
  updateTask(taskId: string, updates: Partial<Task>): void {
    const task = this.tasks.get(taskId)
    if (task) {
      Object.assign(task, updates)

      // If task is complete, update agent status
      if (updates.status === 'complete' || updates.status === 'error') {
        const agent = this.agents.get(task.agentId)
        if (agent) {
          agent.status = updates.status === 'error' ? 'error' : 'idle'
        }
      }

      // Trigger callback if registered
      const callback = this.taskCallbacks.get(taskId)
      if (callback) {
        callback(task)
      }
    }
  }

  // Register a callback for task updates
  onTaskUpdate(taskId: string, callback: (task: Task) => void): void {
    this.taskCallbacks.set(taskId, callback)
  }

  // Execute a task (simulated)
  async executeTask(task: Task): Promise<void> {
    this.updateTask(task.id, { status: 'running', progress: 0 })

    // Simulate task execution with progress updates
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 300))
      this.updateTask(task.id, { progress: i * 10 })
    }

    this.updateTask(task.id, {
      status: 'complete',
      progress: 100,
      result: `Task "${task.title}" completed successfully by ${this.getAgent(task.agentId)?.name}`,
    })
  }

  // Orchestrate a complex workflow
  async orchestrate(request: string, onProgress?: (agents: Agent[], tasks: Task[]) => void): Promise<string> {
    const agentIds = this.analyzeRequest(request)
    const results: string[] = []

    for (const agentId of agentIds) {
      const agent = this.getAgent(agentId)
      if (!agent) continue

      const task = this.createTask(agentId, `${agent.name} task`, request)

      if (onProgress) {
        this.onTaskUpdate(task.id, () => {
          onProgress(this.getAgents(), this.getTasks())
        })
      }

      await this.executeTask(task)

      const completedTask = this.tasks.get(task.id)
      if (completedTask?.result) {
        results.push(completedTask.result)
      }
    }

    return results.join('\n')
  }
}

export const orchestrator = new AgentOrchestrator()
export default orchestrator
