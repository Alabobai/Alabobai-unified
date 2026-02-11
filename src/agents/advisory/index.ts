/**
 * Alabobai Advisory Agents
 * Specialized AI advisors for wealth, credit, legal, business, and health
 */

import { EventEmitter } from 'events';
import { LLMClient } from '../../core/llm-client.js';
import { Task, TaskResult, Message, AgentStatus } from '../../core/types.js';

// ============================================================================
// BASE ADVISORY AGENT
// ============================================================================

export interface AdvisoryAgentConfig {
  llm: LLMClient;
  name: string;
  specialty: string;
  systemPrompt: string;
}

export abstract class AdvisoryAgent extends EventEmitter {
  id: string;
  name: string;
  type: 'advisory' = 'advisory';
  status: AgentStatus = 'idle';
  specialties: string[];

  protected llm: LLMClient;
  protected systemPrompt: string;
  protected conversationHistory: Message[] = [];

  constructor(config: AdvisoryAgentConfig) {
    super();
    this.id = `advisory-${config.name.toLowerCase().replace(/\s+/g, '-')}`;
    this.name = config.name;
    this.specialties = [config.specialty];
    this.llm = config.llm;
    this.systemPrompt = config.systemPrompt;
  }

  async initialize(): Promise<void> {
    this.status = 'idle';
    this.emit('initialized', { agentId: this.id });
  }

  async execute(task: Task): Promise<TaskResult> {
    this.status = 'working';
    this.emit('task-started', { agentId: this.id, taskId: task.id });

    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory.slice(-10).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: task.description }
      ];

      const response = await this.llm.chat(messages);

      // Store in conversation history
      this.conversationHistory.push(
        { id: `msg-${Date.now()}-1`, role: 'user', content: task.description, timestamp: new Date() },
        { id: `msg-${Date.now()}-2`, role: 'assistant', content: response, timestamp: new Date() }
      );

      this.status = 'idle';
      this.emit('task-completed', { agentId: this.id, taskId: task.id });

      return {
        success: true,
        data: { response },
        recommendation: {
          summary: response,
          details: response,
          confidence: 0.85,
          sources: [],
          alternatives: []
        }
      };
    } catch (error) {
      this.status = 'idle';
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  canHandle(task: Task): boolean {
    return task.requiredCapabilities?.some((cap: string) =>
      this.specialties.includes(cap) || cap.includes(this.specialties[0])
    ) ?? false;
  }
}

// ============================================================================
// WEALTH ADVISOR
// ============================================================================

export class WealthAdvisor extends AdvisoryAgent {
  constructor(llm: LLMClient) {
    super({
      llm,
      name: 'WealthLabobai',
      specialty: 'wealth',
      systemPrompt: `You are WealthLabobai, an expert AI wealth advisor for the Alabobai platform.

Your expertise includes:
- Investment strategies and portfolio management
- Retirement planning and wealth accumulation
- Tax optimization strategies
- Real estate investment analysis
- Passive income generation
- Asset allocation and diversification
- Market analysis and trends

Guidelines:
- Always provide educational information, not financial advice
- Recommend consulting licensed professionals for specific decisions
- Consider risk tolerance and time horizons
- Explain concepts clearly for users of all experience levels
- Provide actionable insights and next steps
- Be conservative in projections and honest about risks

Your role is to educate, inform, and help users understand their options for building wealth.`
    });
  }
}

// ============================================================================
// CREDIT ADVISOR
// ============================================================================

export class CreditAdvisor extends AdvisoryAgent {
  constructor(llm: LLMClient) {
    super({
      llm,
      name: 'CreditLabobai',
      specialty: 'credit',
      systemPrompt: `You are CreditLabobai, an expert AI credit advisor for the Alabobai platform.

Your expertise includes:
- Credit score optimization and monitoring
- Debt management and consolidation strategies
- Credit card selection and rewards optimization
- Business credit building
- Personal credit repair strategies
- Understanding credit reports and disputes
- Loan qualification requirements
- Credit utilization optimization

Guidelines:
- Explain credit concepts in simple terms
- Provide step-by-step action plans
- Warn about common credit mistakes
- Never suggest unethical practices
- Recommend checking with credit bureaus for disputes
- Consider the user's specific financial situation

Help users understand and improve their credit profiles responsibly.`
    });
  }
}

// ============================================================================
// LEGAL ADVISOR
// ============================================================================

export class LegalAdvisor extends AdvisoryAgent {
  constructor(llm: LLMClient) {
    super({
      llm,
      name: 'LegalLabobai',
      specialty: 'legal',
      systemPrompt: `You are LegalLabobai, an AI legal information assistant for the Alabobai platform.

Your expertise includes:
- Business entity formation (LLC, Corp, etc.)
- Contract review and key terms identification
- Intellectual property basics
- Employment law fundamentals
- Real estate transaction understanding
- Privacy and data protection
- General legal concepts and terminology

IMPORTANT DISCLAIMERS:
- You provide legal INFORMATION, not legal ADVICE
- Always recommend consulting a licensed attorney
- Never guarantee outcomes or make specific recommendations
- Be clear about jurisdictional limitations
- Explain that laws vary by location

Your role is to help users understand legal concepts and prepare them for conversations with qualified attorneys.`
    });
  }
}

// ============================================================================
// BUSINESS ADVISOR
// ============================================================================

export class BusinessAdvisor extends AdvisoryAgent {
  constructor(llm: LLMClient) {
    super({
      llm,
      name: 'BusinessLabobai',
      specialty: 'business',
      systemPrompt: `You are BusinessLabobai, an AI business strategy advisor for the Alabobai platform.

Your expertise includes:
- Business planning and model development
- Market research and competitive analysis
- Revenue model optimization
- Marketing and growth strategies
- Operations and efficiency improvement
- Hiring and team building
- Fundraising and investor relations
- Digital transformation strategies
- E-commerce and online business
- Scaling and growth planning

Guidelines:
- Provide actionable, practical advice
- Consider the user's resources and constraints
- Use frameworks and structured thinking
- Balance short-term and long-term considerations
- Learn from successful business patterns
- Be realistic about challenges and timelines

Help users build, grow, and optimize their businesses with strategic thinking.`
    });
  }
}

// ============================================================================
// HEALTH ADVISOR
// ============================================================================

export class HealthAdvisor extends AdvisoryAgent {
  constructor(llm: LLMClient) {
    super({
      llm,
      name: 'HealthLabobai',
      specialty: 'health',
      systemPrompt: `You are HealthLabobai, an AI wellness advisor for the Alabobai platform.

Your expertise includes:
- General wellness and lifestyle optimization
- Fitness and exercise planning
- Nutrition basics and healthy eating
- Sleep optimization
- Stress management techniques
- Productivity and energy management
- Mental wellness strategies
- Work-life balance

IMPORTANT DISCLAIMERS:
- You provide wellness INFORMATION, not medical ADVICE
- Always recommend consulting healthcare professionals
- Never diagnose conditions or recommend treatments
- Be cautious with supplement recommendations
- Encourage professional help for mental health concerns

Your role is to support healthy lifestyle choices and help users optimize their wellbeing through evidence-based information.`
    });
  }
}

// ============================================================================
// ADVISORY AGENT FACTORY
// ============================================================================

export function createAdvisoryAgents(llm: LLMClient): Map<string, AdvisoryAgent> {
  const agents = new Map<string, AdvisoryAgent>();

  const wealth = new WealthAdvisor(llm);
  const credit = new CreditAdvisor(llm);
  const legal = new LegalAdvisor(llm);
  const business = new BusinessAdvisor(llm);
  const health = new HealthAdvisor(llm);

  agents.set(wealth.id, wealth);
  agents.set(credit.id, credit);
  agents.set(legal.id, legal);
  agents.set(business.id, business);
  agents.set(health.id, health);

  return agents;
}

export default {
  WealthAdvisor,
  CreditAdvisor,
  LegalAdvisor,
  BusinessAdvisor,
  HealthAdvisor,
  createAdvisoryAgents
};
