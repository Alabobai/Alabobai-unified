/**
 * Alabobai Agent Registry
 * Central registry for all agents in the system
 */

import { v4 as uuid } from 'uuid';
import { Agent, AgentCategory, AgentStatus, Task } from './types.js';
import { EventEmitter } from 'events';
import type { LLMClient, LLMMessage } from './llm-client.js';
import type { MemoryStore } from './memory.js';

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

export interface AgentDefinition {
  name: string;
  category: AgentCategory;
  skills: string[];
  icon: string;
  description: string;
  handler: AgentHandler;
}

export type AgentHandler = (task: Task, context: AgentContext) => Promise<AgentResult>;

export interface AgentContext {
  agent: Agent;
  llm: LLMClient;
  memory: MemoryStore;
  emit: (event: string, data: unknown) => void;
  requestApproval: (action: string, details: Record<string, unknown>) => Promise<boolean>;
  collaborate: (agentName: string, subtask: Partial<Task>) => Promise<unknown>;
}

export interface AgentResult {
  success: boolean;
  output: Record<string, unknown>;
  message?: string;
  error?: string;
}

// ============================================================================
// AGENT REGISTRY CLASS
// ============================================================================

export class AgentRegistry extends EventEmitter {
  private definitions: Map<string, AgentDefinition> = new Map();
  private instances: Map<string, Agent> = new Map();
  private taskQueue: Task[] = [];

  constructor() {
    super();
    this.registerDefaultAgents();
  }

  // Register a new agent type
  register(definition: AgentDefinition): void {
    this.definitions.set(definition.name, definition);
    console.log(`[Registry] Registered agent: ${definition.name}`);
  }

  // Spawn an instance of an agent
  spawn(agentName: string): Agent {
    const definition = this.definitions.get(agentName);
    if (!definition) {
      throw new Error(`Unknown agent type: ${agentName}`);
    }

    const agent: Agent = {
      id: uuid(),
      name: definition.name,
      category: definition.category,
      skills: definition.skills,
      status: 'idle',
      icon: definition.icon,
      description: definition.description,
      currentTask: null,
      completedTasks: 0,
      createdAt: new Date(),
    };

    this.instances.set(agent.id, agent);
    this.emit('agent-spawned', { agentId: agent.id, name: agent.name });
    console.log(`[Registry] Spawned agent: ${agent.name} (${agent.id})`);

    return agent;
  }

  // Get all active agents
  getAgents(): Agent[] {
    return Array.from(this.instances.values());
  }

  // Get agent by ID
  getAgent(id: string): Agent | undefined {
    return this.instances.get(id);
  }

  // Get agents by category
  getAgentsByCategory(category: AgentCategory): Agent[] {
    return this.getAgents().filter(a => a.category === category);
  }

  // Get idle agents that can handle specific skills
  findAvailableAgent(requiredSkills: string[]): Agent | undefined {
    return this.getAgents().find(agent => {
      if (agent.status !== 'idle') return false;
      return requiredSkills.some(skill => agent.skills.includes(skill));
    });
  }

  // Update agent status
  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.instances.get(agentId);
    if (agent) {
      agent.status = status;
      this.emit('agent-status-changed', { agentId, status });
    }
  }

  // Assign task to agent
  async assignTask(agentId: string, task: Task, context: Omit<AgentContext, 'agent'>): Promise<AgentResult> {
    const agent = this.instances.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const definition = this.definitions.get(agent.name);
    if (!definition) {
      throw new Error(`Agent definition not found: ${agent.name}`);
    }

    // Update agent state
    agent.status = 'working';
    agent.currentTask = task;
    this.emit('agent-started', { agentId, taskId: task.id });

    try {
      // Execute the agent's handler
      const result = await definition.handler(task, { ...context, agent });

      // Update completion stats
      agent.completedTasks++;
      agent.status = 'idle';
      agent.currentTask = null;

      this.emit('agent-completed', { agentId, taskId: task.id, result });
      return result;
    } catch (error) {
      agent.status = 'error';
      agent.currentTask = null;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('agent-error', { agentId, taskId: task.id, error: errorMessage });

      return {
        success: false,
        output: {},
        error: errorMessage,
      };
    }
  }

  // Register default agents
  private registerDefaultAgents(): void {
    // Advisory Agents
    this.register({
      name: 'WealthLabobai',
      category: 'advisory',
      skills: ['portfolio', 'investment', 'tax', 'trading', 'retirement', 'budgeting'],
      icon: 'Wallet',
      description: 'Personal wealth management and financial advisory',
      handler: this.createAdvisoryHandler('wealth'),
    });

    this.register({
      name: 'CreditLabobai',
      category: 'advisory',
      skills: ['credit-score', 'debt', 'loans', 'credit-cards', 'disputes'],
      icon: 'CreditCard',
      description: 'Credit optimization and debt management',
      handler: this.createAdvisoryHandler('credit'),
    });

    this.register({
      name: 'LegalLabobai',
      category: 'advisory',
      skills: ['contracts', 'compliance', 'business-law', 'intellectual-property'],
      icon: 'Scale',
      description: 'Legal guidance and contract analysis',
      handler: this.createAdvisoryHandler('legal'),
    });

    this.register({
      name: 'BusinessLabobai',
      category: 'advisory',
      skills: ['strategy', 'marketing', 'sales', 'operations', 'scaling'],
      icon: 'TrendingUp',
      description: 'Business strategy and growth advisory',
      handler: this.createAdvisoryHandler('business'),
    });

    this.register({
      name: 'HealthLabobai',
      category: 'advisory',
      skills: ['wellness', 'fitness', 'nutrition', 'mental-health', 'prevention'],
      icon: 'Heart',
      description: 'Health and wellness optimization',
      handler: this.createAdvisoryHandler('health'),
    });

    // Guardian Agent
    this.register({
      name: 'GuardianLabobai',
      category: 'advisory',
      skills: ['security', 'compliance', 'fraud-detection', 'risk-assessment', 'audit'],
      icon: 'Shield',
      description: 'Security, compliance, and risk management',
      handler: this.createAdvisoryHandler('guardian'),
    });

    // Computer Control Agent
    this.register({
      name: 'ComputerLabobai',
      category: 'computer-control',
      skills: ['screen-control', 'mouse', 'keyboard', 'browser', 'file-system', 'automation'],
      icon: 'Monitor',
      description: 'Computer control and automation',
      handler: this.createComputerControlHandler(),
    });

    // Builder Agent
    this.register({
      name: 'BuilderLabobai',
      category: 'builder',
      skills: ['webapp', 'website', 'api', 'mobile-app', 'landing-page', 'dashboard'],
      icon: 'Hammer',
      description: 'Full-stack application builder',
      handler: this.createBuilderHandler(),
    });

    // Research Agent
    this.register({
      name: 'ResearchLabobai',
      category: 'research',
      skills: ['web-search', 'document-analysis', 'data-extraction', 'summarization'],
      icon: 'Search',
      description: 'Web research and document analysis',
      handler: this.createResearchHandler(),
    });

    console.log(`[Registry] Registered ${this.definitions.size} default agents`);
  }

  // Handler factories
  private createAdvisoryHandler(domain: string): AgentHandler {
    return async (task, context) => {
      const { llm, memory } = context;

      const systemPrompt = this.getAdvisorySystemPrompt(domain);
      const response = await llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.description },
      ]);

      return {
        success: true,
        output: { advice: response, domain },
        message: response,
      };
    };
  }

  private createComputerControlHandler(): AgentHandler {
    return async (task, context) => {
      // This will be implemented by the computer control integration
      context.emit('computer-control-requested', { task });

      return {
        success: true,
        output: { status: 'Computer control handler - pending integration' },
        message: 'Computer control task queued',
      };
    };
  }

  private createBuilderHandler(): AgentHandler {
    return async (task, context) => {
      // This will be implemented by the Bolt.diy integration
      context.emit('builder-requested', { task });

      return {
        success: true,
        output: { status: 'Builder handler - pending integration' },
        message: 'Build task queued',
      };
    };
  }

  private createResearchHandler(): AgentHandler {
    return async (task, context) => {
      const { llm } = context;

      const response = await llm.chat([
        { role: 'system', content: 'You are a research assistant. Analyze the request and provide comprehensive research.' },
        { role: 'user', content: task.description },
      ]);

      return {
        success: true,
        output: { research: response },
        message: response,
      };
    };
  }

  private getAdvisorySystemPrompt(domain: string): string {
    const prompts: Record<string, string> = {
      wealth: `You are WealthLabobai, a personal wealth management AI advisor.
        Help users with: portfolio analysis, investment strategies, tax optimization, retirement planning.
        Always provide clear, actionable advice. Include appropriate disclaimers for financial advice.
        Be conversational and supportive. Keep responses concise unless detail is requested.`,

      credit: `You are CreditLabobai, a credit optimization specialist.
        Help users with: credit score improvement, debt management, loan comparisons, dispute guidance.
        Provide specific, actionable steps. Be encouraging about progress.`,

      legal: `You are LegalLabobai, a legal guidance assistant.
        Help users understand: contracts, business law, compliance requirements, intellectual property.
        Always recommend consulting a licensed attorney for specific legal matters.
        Explain concepts clearly without unnecessary jargon.`,

      business: `You are BusinessLabobai, a business strategy advisor.
        Help users with: business planning, marketing strategy, sales optimization, scaling operations.
        Be direct and results-focused. Provide frameworks and actionable steps.`,

      health: `You are HealthLabobai, a wellness optimization assistant.
        Help users with: fitness planning, nutrition guidance, mental wellness, preventive health.
        Always recommend consulting healthcare professionals for medical advice.
        Be supportive and encouraging.`,

      guardian: `You are GuardianLabobai, a security and compliance specialist.
        Help users with: security best practices, compliance requirements, risk assessment.
        Be thorough and vigilant. Flag potential risks proactively.`,
    };

    return prompts[domain] || prompts.business;
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
