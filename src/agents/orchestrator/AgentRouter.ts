/**
 * Alabobai Agent Router
 * Intelligent routing of tasks to the most appropriate agent
 * Uses capability matching, load balancing, and historical performance
 */

import { Agent, AgentCategory, Task, AgentStatus } from '../../core/types.js';
import { LLMClient } from '../../core/llm-client.js';
import { DecomposedTask } from './TaskDecomposer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingDecision {
  agentId: string;
  agentName: string;
  confidence: number;
  reasoning: string;
  alternativeAgents: Array<{ agentId: string; agentName: string; score: number }>;
}

export interface AgentCapabilityProfile {
  agentId: string;
  agentName: string;
  category: AgentCategory;
  skills: string[];
  specializations: string[];
  performance: AgentPerformanceMetrics;
  currentLoad: number;
  maxConcurrentTasks: number;
}

export interface AgentPerformanceMetrics {
  totalTasksCompleted: number;
  successRate: number;
  averageResponseTime: number;
  lastActiveAt: Date | null;
  recentErrors: number;
}

export interface RoutingContext {
  userId?: string;
  sessionId?: string;
  urgency?: 'low' | 'normal' | 'high' | 'critical';
  preferredAgent?: string;
  excludeAgents?: string[];
  requiresHumanHandoff?: boolean;
}

// Agent type definitions with detailed capabilities
const AGENT_PROFILES: Record<string, Omit<AgentCapabilityProfile, 'agentId' | 'performance' | 'currentLoad'>> = {
  WealthLabobai: {
    agentName: 'WealthLabobai',
    category: 'advisory',
    skills: ['portfolio', 'investment', 'tax', 'trading', 'retirement', 'budgeting', 'savings'],
    specializations: ['wealth-management', 'financial-planning', 'tax-optimization'],
    maxConcurrentTasks: 5,
  },
  CreditLabobai: {
    agentName: 'CreditLabobai',
    category: 'advisory',
    skills: ['credit-score', 'debt', 'loans', 'credit-cards', 'disputes', 'collections'],
    specializations: ['credit-repair', 'debt-management', 'loan-qualification'],
    maxConcurrentTasks: 5,
  },
  LegalLabobai: {
    agentName: 'LegalLabobai',
    category: 'advisory',
    skills: ['contracts', 'compliance', 'business-law', 'intellectual-property', 'employment'],
    specializations: ['contract-review', 'legal-compliance', 'business-formation'],
    maxConcurrentTasks: 3,
  },
  BusinessLabobai: {
    agentName: 'BusinessLabobai',
    category: 'advisory',
    skills: ['strategy', 'marketing', 'sales', 'operations', 'scaling', 'fundraising'],
    specializations: ['business-strategy', 'growth-hacking', 'startup-advisory'],
    maxConcurrentTasks: 5,
  },
  HealthLabobai: {
    agentName: 'HealthLabobai',
    category: 'advisory',
    skills: ['wellness', 'fitness', 'nutrition', 'mental-health', 'prevention', 'sleep'],
    specializations: ['health-optimization', 'lifestyle-coaching', 'wellness-planning'],
    maxConcurrentTasks: 5,
  },
  GuardianLabobai: {
    agentName: 'GuardianLabobai',
    category: 'advisory',
    skills: ['security', 'compliance', 'fraud-detection', 'risk-assessment', 'audit', 'privacy'],
    specializations: ['security-review', 'risk-management', 'compliance-monitoring'],
    maxConcurrentTasks: 3,
  },
  ComputerLabobai: {
    agentName: 'ComputerLabobai',
    category: 'computer-control',
    skills: ['screen-control', 'mouse', 'keyboard', 'browser', 'file-system', 'automation'],
    specializations: ['web-automation', 'desktop-control', 'form-filling'],
    maxConcurrentTasks: 2, // Limited due to screen control nature
  },
  BuilderLabobai: {
    agentName: 'BuilderLabobai',
    category: 'builder',
    skills: ['webapp', 'website', 'api', 'mobile-app', 'landing-page', 'dashboard'],
    specializations: ['full-stack-development', 'rapid-prototyping', 'ui-generation'],
    maxConcurrentTasks: 3,
  },
  ResearchLabobai: {
    agentName: 'ResearchLabobai',
    category: 'research',
    skills: ['web-search', 'document-analysis', 'data-extraction', 'summarization', 'comparison'],
    specializations: ['market-research', 'competitive-analysis', 'document-synthesis'],
    maxConcurrentTasks: 5,
  },
};

// ============================================================================
// AGENT ROUTER CLASS
// ============================================================================

export class AgentRouter {
  private llm: LLMClient;
  private agentProfiles: Map<string, AgentCapabilityProfile> = new Map();
  private routingHistory: Map<string, RoutingDecision[]> = new Map();
  private loadBalancer: LoadBalancer;

  constructor(llm: LLMClient) {
    this.llm = llm;
    this.loadBalancer = new LoadBalancer();
    this.initializeProfiles();
  }

  /**
   * Initialize agent profiles with default metrics
   */
  private initializeProfiles(): void {
    for (const [name, profile] of Object.entries(AGENT_PROFILES)) {
      this.agentProfiles.set(name, {
        agentId: `agent-${name.toLowerCase()}`,
        ...profile,
        performance: {
          totalTasksCompleted: 0,
          successRate: 1.0,
          averageResponseTime: 5000,
          lastActiveAt: null,
          recentErrors: 0,
        },
        currentLoad: 0,
      });
    }
  }

  /**
   * Routes a task to the best available agent
   */
  async route(
    task: DecomposedTask | Task,
    availableAgents: Agent[],
    context?: RoutingContext
  ): Promise<RoutingDecision> {
    // Step 1: Filter agents by category and availability
    const candidates = this.filterCandidates(task, availableAgents, context);

    if (candidates.length === 0) {
      // No suitable agents - return fallback
      return this.createFallbackDecision(task, availableAgents);
    }

    // Step 2: Score each candidate
    const scoredCandidates = await this.scoreCandidates(task, candidates, context);

    // Step 3: Apply load balancing
    const balancedCandidates = this.loadBalancer.balance(scoredCandidates);

    // Step 4: Select best candidate
    const best = balancedCandidates[0];
    const alternatives = balancedCandidates.slice(1, 4);

    const decision: RoutingDecision = {
      agentId: best.agent.id,
      agentName: best.agent.name,
      confidence: best.score,
      reasoning: this.generateReasoning(task, best),
      alternativeAgents: alternatives.map(c => ({
        agentId: c.agent.id,
        agentName: c.agent.name,
        score: c.score,
      })),
    };

    // Store routing decision for learning
    this.recordRoutingDecision(task.id, decision);

    return decision;
  }

  /**
   * Routes multiple tasks efficiently
   */
  async routeBatch(
    tasks: DecomposedTask[],
    availableAgents: Agent[],
    context?: RoutingContext
  ): Promise<Map<string, RoutingDecision>> {
    const decisions = new Map<string, RoutingDecision>();
    const agentAssignments = new Map<string, number>();

    // Sort tasks by priority for better distribution
    const sortedTasks = [...tasks].sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const task of sortedTasks) {
      // Adjust agent availability based on previous assignments
      const adjustedAgents = availableAgents.map(agent => {
        const assignedCount = agentAssignments.get(agent.id) || 0;
        const profile = this.agentProfiles.get(agent.name);
        const maxTasks = profile?.maxConcurrentTasks || 5;

        if (assignedCount >= maxTasks) {
          return { ...agent, status: 'working' as AgentStatus };
        }
        return agent;
      });

      const decision = await this.route(task, adjustedAgents, context);
      decisions.set(task.id, decision);

      // Track assignment
      const currentCount = agentAssignments.get(decision.agentId) || 0;
      agentAssignments.set(decision.agentId, currentCount + 1);
    }

    return decisions;
  }

  /**
   * Filters candidates based on category and availability
   */
  private filterCandidates(
    task: DecomposedTask | Task,
    agents: Agent[],
    context?: RoutingContext
  ): Agent[] {
    return agents.filter(agent => {
      // Exclude specific agents if requested
      if (context?.excludeAgents?.includes(agent.id)) return false;

      // Check if agent is available
      if (agent.status !== 'idle' && agent.status !== 'collaborating') {
        // Allow collaborating agents for multi-task scenarios
        if (agent.status === 'working') {
          const profile = this.agentProfiles.get(agent.name);
          if (profile && profile.currentLoad >= profile.maxConcurrentTasks) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Prefer matching category but don't strictly require it
      if (task.category && agent.category !== task.category) {
        // Only exclude if we have better options
        return false;
      }

      return true;
    });
  }

  /**
   * Scores candidates based on skill match and performance
   */
  private async scoreCandidates(
    task: DecomposedTask | Task,
    candidates: Agent[],
    context?: RoutingContext
  ): Promise<Array<{ agent: Agent; score: number; reasons: string[] }>> {
    const scored = candidates.map(agent => {
      const profile = this.agentProfiles.get(agent.name);
      const reasons: string[] = [];
      let score = 0.5; // Base score

      // Skill match scoring (0-0.3)
      const requiredSkills = 'requiredCapabilities' in task
        ? task.requiredCapabilities || []
        : [];

      if (requiredSkills.length > 0) {
        const matchedSkills = requiredSkills.filter(skill =>
          agent.skills.includes(skill) ||
          profile?.skills.includes(skill) ||
          profile?.specializations.some(s => s.includes(skill))
        );
        const skillScore = (matchedSkills.length / requiredSkills.length) * 0.3;
        score += skillScore;
        if (matchedSkills.length > 0) {
          reasons.push(`Matches ${matchedSkills.length}/${requiredSkills.length} required skills`);
        }
      } else {
        score += 0.15; // Default skill score when no specific skills required
      }

      // Performance scoring (0-0.2)
      if (profile) {
        const perfScore = profile.performance.successRate * 0.2;
        score += perfScore;
        if (profile.performance.successRate > 0.9) {
          reasons.push('High success rate');
        }
      }

      // Load scoring (0-0.15) - prefer less loaded agents
      if (profile) {
        const loadRatio = profile.currentLoad / profile.maxConcurrentTasks;
        const loadScore = (1 - loadRatio) * 0.15;
        score += loadScore;
        if (loadRatio < 0.3) {
          reasons.push('Low current load');
        }
      }

      // Recency scoring (0-0.1) - prefer recently active agents (warmed up)
      if (profile?.performance.lastActiveAt) {
        const minutesSinceActive = (Date.now() - profile.performance.lastActiveAt.getTime()) / 60000;
        if (minutesSinceActive < 5) {
          score += 0.1;
          reasons.push('Recently active');
        } else if (minutesSinceActive < 30) {
          score += 0.05;
        }
      }

      // Preferred agent bonus (0.1)
      if (context?.preferredAgent === agent.id) {
        score += 0.1;
        reasons.push('User preferred');
      }

      // Error penalty
      if (profile && profile.performance.recentErrors > 2) {
        score -= 0.1;
        reasons.push('Recent errors');
      }

      return { agent, score: Math.min(1, Math.max(0, score)), reasons };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Creates a fallback decision when no suitable agent is found
   */
  private createFallbackDecision(task: DecomposedTask | Task, agents: Agent[]): RoutingDecision {
    // Find any idle agent
    const fallbackAgent = agents.find(a => a.status === 'idle') || agents[0];

    return {
      agentId: fallbackAgent?.id || 'unknown',
      agentName: fallbackAgent?.name || 'Unknown',
      confidence: 0.3,
      reasoning: 'No optimal agent found; using fallback selection',
      alternativeAgents: [],
    };
  }

  /**
   * Generates human-readable reasoning for routing decision
   */
  private generateReasoning(
    task: DecomposedTask | Task,
    candidate: { agent: Agent; score: number; reasons: string[] }
  ): string {
    const parts = [
      `Selected ${candidate.agent.name} (${(candidate.score * 100).toFixed(0)}% confidence)`,
    ];

    if (candidate.reasons.length > 0) {
      parts.push(`Reasons: ${candidate.reasons.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Records routing decision for future learning
   */
  private recordRoutingDecision(taskId: string, decision: RoutingDecision): void {
    const history = this.routingHistory.get(decision.agentId) || [];
    history.push(decision);

    // Keep only last 100 decisions per agent
    if (history.length > 100) {
      history.shift();
    }

    this.routingHistory.set(decision.agentId, history);
  }

  /**
   * Updates agent performance metrics after task completion
   */
  updateAgentMetrics(
    agentName: string,
    success: boolean,
    responseTime: number
  ): void {
    const profile = this.agentProfiles.get(agentName);
    if (!profile) return;

    profile.performance.totalTasksCompleted++;
    profile.performance.lastActiveAt = new Date();

    // Update success rate (rolling average)
    const total = profile.performance.totalTasksCompleted;
    const oldRate = profile.performance.successRate;
    profile.performance.successRate = ((oldRate * (total - 1)) + (success ? 1 : 0)) / total;

    // Update average response time (rolling average)
    const oldAvg = profile.performance.averageResponseTime;
    profile.performance.averageResponseTime = ((oldAvg * (total - 1)) + responseTime) / total;

    // Track recent errors
    if (!success) {
      profile.performance.recentErrors++;
    } else if (profile.performance.recentErrors > 0) {
      profile.performance.recentErrors--; // Decay errors on success
    }
  }

  /**
   * Updates current load for an agent
   */
  updateAgentLoad(agentName: string, delta: number): void {
    const profile = this.agentProfiles.get(agentName);
    if (profile) {
      profile.currentLoad = Math.max(0, profile.currentLoad + delta);
    }
  }

  /**
   * Gets routing statistics for monitoring
   */
  getRoutingStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [name, profile] of this.agentProfiles) {
      stats[name] = {
        totalTasks: profile.performance.totalTasksCompleted,
        successRate: (profile.performance.successRate * 100).toFixed(1) + '%',
        avgResponseTime: Math.round(profile.performance.averageResponseTime) + 'ms',
        currentLoad: `${profile.currentLoad}/${profile.maxConcurrentTasks}`,
        recentErrors: profile.performance.recentErrors,
      };
    }

    return stats;
  }

  /**
   * Suggests agent for a capability query
   */
  suggestAgentForCapability(capability: string): string | null {
    for (const [name, profile] of this.agentProfiles) {
      if (profile.skills.includes(capability) ||
          profile.specializations.some(s => s.includes(capability))) {
        return name;
      }
    }
    return null;
  }
}

// ============================================================================
// LOAD BALANCER
// ============================================================================

class LoadBalancer {
  private weights: Map<string, number> = new Map();

  /**
   * Balances candidates based on current load
   */
  balance(
    candidates: Array<{ agent: Agent; score: number; reasons: string[] }>
  ): Array<{ agent: Agent; score: number; reasons: string[] }> {
    // Apply load-based adjustments
    return candidates.map(candidate => {
      const weight = this.weights.get(candidate.agent.id) || 1;
      return {
        ...candidate,
        score: candidate.score * weight,
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Updates weight for an agent based on load
   */
  updateWeight(agentId: string, load: number, maxLoad: number): void {
    // Weight decreases as load increases
    const loadRatio = load / maxLoad;
    const weight = 1 - (loadRatio * 0.5); // Max 50% penalty at full load
    this.weights.set(agentId, weight);
  }
}

/**
 * Factory function to create an AgentRouter
 */
export function createAgentRouter(llm: LLMClient): AgentRouter {
  return new AgentRouter(llm);
}

export default AgentRouter;
