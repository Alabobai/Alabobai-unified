/**
 * Alabobai Open Source Integrations
 *
 * Integrates capabilities from:
 * - OpenManus (AI agent orchestration)
 * - bolt.diy (code generation & app building)
 * - LibreChat (multi-model chat interface)
 * - LangGraph (workflow orchestration)
 * - CrewAI (multi-agent collaboration)
 */

export * from './openmanus'
export * from './bolt'
export * from './librechat'
export * from './langgraph'
export * from './crewai'

// Integration Hub - Central coordinator
export interface Integration {
  id: string
  name: string
  description: string
  status: 'connected' | 'disconnected' | 'error'
  capabilities: string[]
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'openmanus',
    name: 'OpenManus',
    description: 'Open-source AI agent with browser & computer control',
    status: 'disconnected',
    capabilities: ['browser-automation', 'computer-control', 'task-execution', 'web-scraping'],
  },
  {
    id: 'bolt-diy',
    name: 'bolt.diy',
    description: 'AI-powered full-stack app builder',
    status: 'disconnected',
    capabilities: ['code-generation', 'project-scaffold', 'live-preview', 'deployment'],
  },
  {
    id: 'librechat',
    name: 'LibreChat',
    description: 'Multi-model AI chat with plugins',
    status: 'disconnected',
    capabilities: ['multi-model', 'chat-history', 'plugins', 'file-upload'],
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    description: 'Stateful workflow orchestration for agents',
    status: 'disconnected',
    capabilities: ['workflow', 'state-management', 'branching', 'human-in-loop'],
  },
  {
    id: 'crewai',
    name: 'CrewAI',
    description: 'Multi-agent collaboration framework',
    status: 'disconnected',
    capabilities: ['multi-agent', 'role-based', 'task-delegation', 'collaboration'],
  },
]

class IntegrationHub {
  private integrations: Map<string, Integration> = new Map()

  constructor() {
    INTEGRATIONS.forEach(integration => {
      this.integrations.set(integration.id, { ...integration })
    })
  }

  getIntegrations(): Integration[] {
    return Array.from(this.integrations.values())
  }

  getIntegration(id: string): Integration | undefined {
    return this.integrations.get(id)
  }

  async connect(id: string): Promise<boolean> {
    const integration = this.integrations.get(id)
    if (integration) {
      integration.status = 'connected'
      return true
    }
    return false
  }

  async disconnect(id: string): Promise<boolean> {
    const integration = this.integrations.get(id)
    if (integration) {
      integration.status = 'disconnected'
      return true
    }
    return false
  }
}

export const integrationHub = new IntegrationHub()
export default integrationHub
