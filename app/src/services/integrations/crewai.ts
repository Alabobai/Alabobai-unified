/**
 * CrewAI Integration
 *
 * Multi-agent collaboration framework.
 * Based on: https://github.com/joaomdmoura/crewAI
 *
 * Capabilities:
 * - Role-based AI agents
 * - Task delegation
 * - Agent collaboration
 * - Sequential and parallel execution
 */

export interface CrewAgent {
  id: string
  role: string
  goal: string
  backstory: string
  tools: string[]
  verbose: boolean
}

export interface CrewTask {
  id: string
  description: string
  agent: string // Agent ID
  expectedOutput: string
  dependencies?: string[] // Task IDs
}

export interface Crew {
  id: string
  name: string
  agents: CrewAgent[]
  tasks: CrewTask[]
  process: 'sequential' | 'parallel'
}

export interface CrewExecution {
  crewId: string
  status: 'running' | 'completed' | 'failed'
  results: { taskId: string; output: string; agentId: string }[]
}

// Pre-built crew templates
export const CREW_TEMPLATES: Crew[] = [
  {
    id: 'content-creation-crew',
    name: 'Content Creation Crew',
    process: 'sequential',
    agents: [
      {
        id: 'researcher',
        role: 'Research Analyst',
        goal: 'Find accurate and relevant information on any topic',
        backstory: 'Expert researcher with years of experience in data analysis',
        tools: ['web-search', 'document-reader'],
        verbose: true,
      },
      {
        id: 'writer',
        role: 'Content Writer',
        goal: 'Create engaging and informative content',
        backstory: 'Seasoned writer with expertise in technical and creative writing',
        tools: ['text-editor', 'grammar-checker'],
        verbose: true,
      },
      {
        id: 'editor',
        role: 'Content Editor',
        goal: 'Polish and perfect written content',
        backstory: 'Meticulous editor with an eye for detail and clarity',
        tools: ['text-editor', 'plagiarism-checker'],
        verbose: true,
      },
    ],
    tasks: [
      {
        id: 'research',
        description: 'Research the topic thoroughly',
        agent: 'researcher',
        expectedOutput: 'Comprehensive research notes with sources',
      },
      {
        id: 'write',
        description: 'Write the content based on research',
        agent: 'writer',
        expectedOutput: 'Complete draft article',
        dependencies: ['research'],
      },
      {
        id: 'edit',
        description: 'Edit and polish the content',
        agent: 'editor',
        expectedOutput: 'Final polished content ready for publishing',
        dependencies: ['write'],
      },
    ],
  },
  {
    id: 'software-dev-crew',
    name: 'Software Development Crew',
    process: 'sequential',
    agents: [
      {
        id: 'architect',
        role: 'Software Architect',
        goal: 'Design robust and scalable software architectures',
        backstory: 'Senior architect with 15+ years building enterprise systems',
        tools: ['diagram-tool', 'code-analyzer'],
        verbose: true,
      },
      {
        id: 'developer',
        role: 'Full-Stack Developer',
        goal: 'Write clean, efficient, and maintainable code',
        backstory: 'Experienced developer proficient in multiple languages',
        tools: ['code-editor', 'debugger', 'terminal'],
        verbose: true,
      },
      {
        id: 'tester',
        role: 'QA Engineer',
        goal: 'Ensure software quality through comprehensive testing',
        backstory: 'Quality-focused engineer with expertise in test automation',
        tools: ['test-runner', 'coverage-tool'],
        verbose: true,
      },
    ],
    tasks: [
      {
        id: 'design',
        description: 'Design the system architecture',
        agent: 'architect',
        expectedOutput: 'Architecture document with diagrams',
      },
      {
        id: 'implement',
        description: 'Implement the designed system',
        agent: 'developer',
        expectedOutput: 'Working codebase with documentation',
        dependencies: ['design'],
      },
      {
        id: 'test',
        description: 'Test the implementation thoroughly',
        agent: 'tester',
        expectedOutput: 'Test report with coverage metrics',
        dependencies: ['implement'],
      },
    ],
  },
  {
    id: 'marketing-crew',
    name: 'Marketing Crew',
    process: 'parallel',
    agents: [
      {
        id: 'strategist',
        role: 'Marketing Strategist',
        goal: 'Develop effective marketing strategies',
        backstory: 'Marketing expert with track record of successful campaigns',
        tools: ['analytics', 'market-research'],
        verbose: true,
      },
      {
        id: 'copywriter',
        role: 'Copywriter',
        goal: 'Create compelling marketing copy',
        backstory: 'Creative writer specialized in persuasive content',
        tools: ['text-editor', 'headline-analyzer'],
        verbose: true,
      },
      {
        id: 'designer',
        role: 'Graphic Designer',
        goal: 'Create visually stunning marketing materials',
        backstory: 'Designer with expertise in brand identity and digital media',
        tools: ['image-editor', 'design-templates'],
        verbose: true,
      },
    ],
    tasks: [
      {
        id: 'strategy',
        description: 'Develop marketing strategy',
        agent: 'strategist',
        expectedOutput: 'Marketing strategy document',
      },
      {
        id: 'copy',
        description: 'Write marketing copy',
        agent: 'copywriter',
        expectedOutput: 'Marketing copy for all channels',
        dependencies: ['strategy'],
      },
      {
        id: 'design',
        description: 'Create marketing visuals',
        agent: 'designer',
        expectedOutput: 'Marketing visual assets',
        dependencies: ['strategy'],
      },
    ],
  },
]

class CrewAIService {
  private crews: Map<string, Crew> = new Map()
  private executions: Map<string, CrewExecution> = new Map()

  constructor() {
    CREW_TEMPLATES.forEach(c => this.crews.set(c.id, { ...c }))
  }

  getTemplates(): Crew[] {
    return CREW_TEMPLATES
  }

  getCrew(id: string): Crew | undefined {
    return this.crews.get(id)
  }

  createCrew(crew: Omit<Crew, 'id'>): Crew {
    const id = crypto.randomUUID()
    const newCrew = { ...crew, id }
    this.crews.set(id, newCrew)
    return newCrew
  }

  async executeCrew(
    crewId: string,
    _input: string,
    onProgress?: (execution: CrewExecution) => void
  ): Promise<CrewExecution> {
    const crew = this.crews.get(crewId)
    if (!crew) {
      throw new Error(`Crew ${crewId} not found`)
    }

    const execution: CrewExecution = {
      crewId,
      status: 'running',
      results: [],
    }

    this.executions.set(crewId, execution)

    // Sort tasks by dependencies
    const sortedTasks = this.topologicalSort(crew.tasks)

    // Execute tasks
    for (const task of sortedTasks) {
      const agent = crew.agents.find(a => a.id === task.agent)
      if (!agent) continue

      console.log(`[CrewAI] Agent "${agent.role}" working on: ${task.description}`)

      // Simulate task execution
      await new Promise(resolve => setTimeout(resolve, 800))

      const output = `${agent.role} completed: ${task.expectedOutput}`
      execution.results.push({
        taskId: task.id,
        output,
        agentId: agent.id,
      })

      if (onProgress) {
        onProgress({ ...execution })
      }
    }

    execution.status = 'completed'
    return execution
  }

  private topologicalSort(tasks: CrewTask[]): CrewTask[] {
    const sorted: CrewTask[] = []
    const visited = new Set<string>()

    const visit = (task: CrewTask) => {
      if (visited.has(task.id)) return
      visited.add(task.id)

      for (const depId of task.dependencies || []) {
        const dep = tasks.find(t => t.id === depId)
        if (dep) visit(dep)
      }

      sorted.push(task)
    }

    tasks.forEach(visit)
    return sorted
  }
}

export const crewAIService = new CrewAIService()
export default crewAIService
