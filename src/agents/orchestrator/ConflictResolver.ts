/**
 * Alabobai Conflict Resolver
 * Handles disagreements and conflicting recommendations from multiple agents
 * Uses consensus algorithms, priority rules, and LLM-powered arbitration
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { Agent, Task } from '../../core/types.js';
import { AgentResult } from '../../core/agent-registry.js';
import { LLMClient } from '../../core/llm-client.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConflictReport {
  id: string;
  taskId: string;
  conflictType: ConflictType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  agents: ConflictingAgent[];
  description: string;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolution: Resolution | null;
  status: 'detected' | 'analyzing' | 'resolved' | 'escalated';
}

export type ConflictType =
  | 'contradictory-recommendations'  // Agents suggest opposite actions
  | 'incompatible-outputs'          // Outputs cannot be merged
  | 'resource-contention'           // Multiple agents need same resource
  | 'priority-conflict'             // Agents disagree on task priority
  | 'domain-overlap'                // Multiple agents claim authority
  | 'factual-disagreement'          // Agents report conflicting facts
  | 'timeout-conflict';             // One agent slow, others waiting

export interface ConflictingAgent {
  agentId: string;
  agentName: string;
  position: string;
  confidence: number;
  supporting: string[];
  result: AgentResult;
}

export interface Resolution {
  strategy: ResolutionStrategy;
  selectedAgent: string | null;
  mergedOutput: Record<string, unknown> | null;
  explanation: string;
  confidence: number;
  humanReviewRequired: boolean;
}

export type ResolutionStrategy =
  | 'majority-vote'      // Go with what most agents agree on
  | 'highest-confidence' // Trust the most confident agent
  | 'priority-based'     // Use domain priority rules
  | 'merge'              // Combine compatible outputs
  | 'llm-arbitration'    // Use LLM to decide
  | 'human-escalation'   // Escalate to user
  | 'conservative';      // Pick safest/most conservative option

// Domain expertise rankings for priority-based resolution
const DOMAIN_AUTHORITY: Record<string, string[]> = {
  investment: ['WealthLabobai', 'BusinessLabobai', 'ResearchLabobai'],
  credit: ['CreditLabobai', 'WealthLabobai', 'LegalLabobai'],
  legal: ['LegalLabobai', 'GuardianLabobai', 'BusinessLabobai'],
  business: ['BusinessLabobai', 'WealthLabobai', 'LegalLabobai'],
  health: ['HealthLabobai', 'GuardianLabobai'],
  security: ['GuardianLabobai', 'LegalLabobai', 'ComputerLabobai'],
  technical: ['BuilderLabobai', 'ComputerLabobai', 'ResearchLabobai'],
  research: ['ResearchLabobai', 'BusinessLabobai', 'WealthLabobai'],
};

// ============================================================================
// CONFLICT RESOLVER CLASS
// ============================================================================

export class ConflictResolver extends EventEmitter {
  private llm: LLMClient;
  private activeConflicts: Map<string, ConflictReport> = new Map();
  private resolvedConflicts: ConflictReport[] = [];
  private resolutionStrategies: Map<ConflictType, ResolutionStrategy>;

  constructor(llm: LLMClient) {
    super();
    this.llm = llm;
    this.resolutionStrategies = this.initializeDefaultStrategies();
  }

  /**
   * Initialize default resolution strategies for each conflict type
   */
  private initializeDefaultStrategies(): Map<ConflictType, ResolutionStrategy> {
    return new Map([
      ['contradictory-recommendations', 'llm-arbitration'],
      ['incompatible-outputs', 'merge'],
      ['resource-contention', 'priority-based'],
      ['priority-conflict', 'highest-confidence'],
      ['domain-overlap', 'priority-based'],
      ['factual-disagreement', 'llm-arbitration'],
      ['timeout-conflict', 'conservative'],
    ]);
  }

  /**
   * Detects conflicts between multiple agent results
   */
  detectConflicts(
    taskId: string,
    results: Map<string, { agent: Agent; result: AgentResult }>
  ): ConflictReport | null {
    const resultArray = Array.from(results.entries());

    if (resultArray.length < 2) {
      return null; // No conflict possible with single result
    }

    // Check for various conflict types
    const conflicts: Array<{ type: ConflictType; severity: 'low' | 'medium' | 'high' | 'critical'; description: string }> = [];

    // Check for contradictory recommendations
    const contradictions = this.findContradictions(resultArray);
    if (contradictions) {
      conflicts.push({
        type: 'contradictory-recommendations',
        severity: 'high',
        description: contradictions,
      });
    }

    // Check for factual disagreements
    const factualIssues = this.findFactualDisagreements(resultArray);
    if (factualIssues) {
      conflicts.push({
        type: 'factual-disagreement',
        severity: 'medium',
        description: factualIssues,
      });
    }

    // Check for incompatible outputs
    const incompatible = this.findIncompatibleOutputs(resultArray);
    if (incompatible) {
      conflicts.push({
        type: 'incompatible-outputs',
        severity: 'medium',
        description: incompatible,
      });
    }

    if (conflicts.length === 0) {
      return null;
    }

    // Create conflict report for the most severe conflict
    const primaryConflict = conflicts.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })[0];

    const conflictReport: ConflictReport = {
      id: uuid(),
      taskId,
      conflictType: primaryConflict.type,
      severity: primaryConflict.severity,
      agents: resultArray.map(([id, { agent, result }]) => ({
        agentId: id,
        agentName: agent.name,
        position: this.extractPosition(result),
        confidence: this.extractConfidence(result),
        supporting: this.extractSupportingPoints(result),
        result,
      })),
      description: primaryConflict.description,
      detectedAt: new Date(),
      resolvedAt: null,
      resolution: null,
      status: 'detected',
    };

    this.activeConflicts.set(conflictReport.id, conflictReport);
    this.emit('conflict-detected', conflictReport);

    return conflictReport;
  }

  /**
   * Resolves a detected conflict
   */
  async resolve(conflictId: string): Promise<Resolution> {
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    conflict.status = 'analyzing';
    this.emit('conflict-analyzing', { conflictId });

    // Determine resolution strategy
    const strategy = this.resolutionStrategies.get(conflict.conflictType) || 'llm-arbitration';

    let resolution: Resolution;

    switch (strategy) {
      case 'majority-vote':
        resolution = this.resolveMajorityVote(conflict);
        break;
      case 'highest-confidence':
        resolution = this.resolveHighestConfidence(conflict);
        break;
      case 'priority-based':
        resolution = this.resolvePriorityBased(conflict);
        break;
      case 'merge':
        resolution = await this.resolveMerge(conflict);
        break;
      case 'llm-arbitration':
        resolution = await this.resolveLLMArbitration(conflict);
        break;
      case 'conservative':
        resolution = this.resolveConservative(conflict);
        break;
      case 'human-escalation':
      default:
        resolution = this.escalateToHuman(conflict);
        break;
    }

    // Apply resolution
    conflict.resolution = resolution;
    conflict.resolvedAt = new Date();
    conflict.status = resolution.humanReviewRequired ? 'escalated' : 'resolved';

    // Move to resolved
    this.activeConflicts.delete(conflictId);
    this.resolvedConflicts.push(conflict);

    this.emit('conflict-resolved', { conflictId, resolution });

    return resolution;
  }

  /**
   * Resolves by majority vote (most agents agreeing)
   */
  private resolveMajorityVote(conflict: ConflictReport): Resolution {
    // Group agents by similar positions
    const positionGroups = new Map<string, ConflictingAgent[]>();

    for (const agent of conflict.agents) {
      const normalizedPosition = this.normalizePosition(agent.position);
      const group = positionGroups.get(normalizedPosition) || [];
      group.push(agent);
      positionGroups.set(normalizedPosition, group);
    }

    // Find largest group
    let largestGroup: ConflictingAgent[] = [];
    let largestPosition = '';

    for (const [position, agents] of positionGroups) {
      if (agents.length > largestGroup.length) {
        largestGroup = agents;
        largestPosition = position;
      }
    }

    const selectedAgent = largestGroup[0];

    return {
      strategy: 'majority-vote',
      selectedAgent: selectedAgent.agentId,
      mergedOutput: selectedAgent.result.output,
      explanation: `${largestGroup.length}/${conflict.agents.length} agents agreed on: ${largestPosition}`,
      confidence: largestGroup.length / conflict.agents.length,
      humanReviewRequired: largestGroup.length <= conflict.agents.length / 2,
    };
  }

  /**
   * Resolves by selecting highest confidence agent
   */
  private resolveHighestConfidence(conflict: ConflictReport): Resolution {
    const sorted = [...conflict.agents].sort((a, b) => b.confidence - a.confidence);
    const selected = sorted[0];

    return {
      strategy: 'highest-confidence',
      selectedAgent: selected.agentId,
      mergedOutput: selected.result.output,
      explanation: `Selected ${selected.agentName} with ${(selected.confidence * 100).toFixed(0)}% confidence`,
      confidence: selected.confidence,
      humanReviewRequired: selected.confidence < 0.7,
    };
  }

  /**
   * Resolves based on domain authority
   */
  private resolvePriorityBased(conflict: ConflictReport): Resolution {
    // Infer domain from conflict description
    const domain = this.inferDomain(conflict);
    const authorities = DOMAIN_AUTHORITY[domain] || [];

    // Find highest-ranked agent in the conflict
    let selectedAgent: ConflictingAgent | null = null;
    let rank = Infinity;

    for (const agent of conflict.agents) {
      const agentRank = authorities.indexOf(agent.agentName);
      if (agentRank !== -1 && agentRank < rank) {
        rank = agentRank;
        selectedAgent = agent;
      }
    }

    // Fallback to highest confidence if no domain match
    if (!selectedAgent) {
      return this.resolveHighestConfidence(conflict);
    }

    return {
      strategy: 'priority-based',
      selectedAgent: selectedAgent.agentId,
      mergedOutput: selectedAgent.result.output,
      explanation: `${selectedAgent.agentName} has authority in ${domain} domain (rank #${rank + 1})`,
      confidence: 0.8 - (rank * 0.1), // Decrease confidence for lower-ranked authorities
      humanReviewRequired: rank > 1,
    };
  }

  /**
   * Attempts to merge compatible outputs
   */
  private async resolveMerge(conflict: ConflictReport): Promise<Resolution> {
    // Try to merge all outputs
    const merged: Record<string, unknown> = {};
    const conflicts: string[] = [];

    for (const agent of conflict.agents) {
      const output = agent.result.output;

      for (const [key, value] of Object.entries(output)) {
        if (key in merged) {
          // Check if values are compatible
          if (JSON.stringify(merged[key]) !== JSON.stringify(value)) {
            conflicts.push(`${key}: ${agent.agentName} disagrees`);
            // Keep higher confidence agent's value
            const existingAgent = conflict.agents.find(a =>
              JSON.stringify(a.result.output[key]) === JSON.stringify(merged[key])
            );
            if (existingAgent && agent.confidence > existingAgent.confidence) {
              merged[key] = value;
            }
          }
        } else {
          merged[key] = value;
        }
      }
    }

    const success = conflicts.length < Object.keys(merged).length / 2;

    return {
      strategy: 'merge',
      selectedAgent: null,
      mergedOutput: merged,
      explanation: success
        ? `Merged outputs from ${conflict.agents.length} agents`
        : `Partial merge with ${conflicts.length} unresolved conflicts`,
      confidence: 1 - (conflicts.length / Object.keys(merged).length),
      humanReviewRequired: !success,
    };
  }

  /**
   * Uses LLM to arbitrate between conflicting positions
   */
  private async resolveLLMArbitration(conflict: ConflictReport): Promise<Resolution> {
    const prompt = `You are an AI arbiter resolving a conflict between multiple AI agents.

Conflict Type: ${conflict.conflictType}
Description: ${conflict.description}

Agent Positions:
${conflict.agents.map(a => `
${a.agentName} (${(a.confidence * 100).toFixed(0)}% confident):
Position: ${a.position}
Supporting points: ${a.supporting.join(', ')}
`).join('\n')}

Analyze the positions and determine:
1. Which position is most likely correct or beneficial
2. Can the positions be reconciled?
3. What is the best resolution?

Respond in JSON format:
{
  "selectedAgent": "agent name or null if merge",
  "explanation": "brief explanation of decision",
  "confidence": 0.0-1.0,
  "mergedRecommendation": "if applicable, merged advice",
  "requiresHumanReview": true/false
}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are a neutral AI arbiter. Make fair, logical decisions.' },
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const selectedAgent = parsed.selectedAgent
          ? conflict.agents.find(a => a.agentName === parsed.selectedAgent)
          : null;

        return {
          strategy: 'llm-arbitration',
          selectedAgent: selectedAgent?.agentId || null,
          mergedOutput: selectedAgent?.result.output || { recommendation: parsed.mergedRecommendation },
          explanation: parsed.explanation,
          confidence: parsed.confidence || 0.75,
          humanReviewRequired: parsed.requiresHumanReview || false,
        };
      }
    } catch (error) {
      console.error('[ConflictResolver] LLM arbitration failed:', error);
    }

    // Fallback to highest confidence
    return this.resolveHighestConfidence(conflict);
  }

  /**
   * Selects the most conservative/safe option
   */
  private resolveConservative(conflict: ConflictReport): Resolution {
    // Look for keywords indicating conservative positions
    const conservativeKeywords = ['wait', 'caution', 'review', 'consult', 'verify', 'safe', 'risk'];

    let mostConservative: ConflictingAgent | null = null;
    let highestScore = -1;

    for (const agent of conflict.agents) {
      const position = (agent.position + agent.supporting.join(' ')).toLowerCase();
      let score = 0;

      for (const keyword of conservativeKeywords) {
        if (position.includes(keyword)) score++;
      }

      if (score > highestScore) {
        highestScore = score;
        mostConservative = agent;
      }
    }

    if (!mostConservative) {
      return this.resolveHighestConfidence(conflict);
    }

    return {
      strategy: 'conservative',
      selectedAgent: mostConservative.agentId,
      mergedOutput: mostConservative.result.output,
      explanation: `Selected most conservative approach from ${mostConservative.agentName}`,
      confidence: 0.7,
      humanReviewRequired: true, // Conservative strategy often warrants human review
    };
  }

  /**
   * Escalates conflict to human for resolution
   */
  private escalateToHuman(conflict: ConflictReport): Resolution {
    return {
      strategy: 'human-escalation',
      selectedAgent: null,
      mergedOutput: null,
      explanation: `Conflict requires human decision. ${conflict.agents.length} agents have different positions on: ${conflict.description}`,
      confidence: 0,
      humanReviewRequired: true,
    };
  }

  /**
   * Finds contradictory recommendations in results
   */
  private findContradictions(
    results: Array<[string, { agent: Agent; result: AgentResult }]>
  ): string | null {
    const recommendations = results.map(([id, { agent, result }]) => ({
      agent: agent.name,
      text: result.message?.toLowerCase() || '',
    }));

    // Check for opposing action words
    const opposites = [
      ['buy', 'sell'],
      ['increase', 'decrease'],
      ['approve', 'reject'],
      ['proceed', 'stop'],
      ['yes', 'no'],
      ['recommend', 'avoid'],
    ];

    for (const [word1, word2] of opposites) {
      const hasWord1 = recommendations.some(r => r.text.includes(word1));
      const hasWord2 = recommendations.some(r => r.text.includes(word2));

      if (hasWord1 && hasWord2) {
        const agent1 = recommendations.find(r => r.text.includes(word1))?.agent;
        const agent2 = recommendations.find(r => r.text.includes(word2))?.agent;
        return `${agent1} recommends "${word1}" while ${agent2} recommends "${word2}"`;
      }
    }

    return null;
  }

  /**
   * Finds factual disagreements between results
   */
  private findFactualDisagreements(
    results: Array<[string, { agent: Agent; result: AgentResult }]>
  ): string | null {
    // Extract numerical claims and compare
    const numericalClaims: Array<{ agent: string; value: number; context: string }> = [];

    for (const [, { agent, result }] of results) {
      const text = result.message || JSON.stringify(result.output);
      const numbers = text.match(/\$?[\d,]+(?:\.\d+)?%?/g) || [];

      for (const num of numbers) {
        const value = parseFloat(num.replace(/[$,%]/g, ''));
        if (!isNaN(value)) {
          numericalClaims.push({ agent: agent.name, value, context: num });
        }
      }
    }

    // Check for significantly different numbers
    for (let i = 0; i < numericalClaims.length; i++) {
      for (let j = i + 1; j < numericalClaims.length; j++) {
        const diff = Math.abs(numericalClaims[i].value - numericalClaims[j].value);
        const avg = (numericalClaims[i].value + numericalClaims[j].value) / 2;

        if (avg > 0 && diff / avg > 0.5) { // More than 50% difference
          return `${numericalClaims[i].agent} reports ${numericalClaims[i].context} vs ${numericalClaims[j].agent} reports ${numericalClaims[j].context}`;
        }
      }
    }

    return null;
  }

  /**
   * Finds incompatible output formats
   */
  private findIncompatibleOutputs(
    results: Array<[string, { agent: Agent; result: AgentResult }]>
  ): string | null {
    const outputTypes = results.map(([, { agent, result }]) => ({
      agent: agent.name,
      keys: Object.keys(result.output),
      type: typeof result.output,
    }));

    // Check if outputs have completely different structures
    if (outputTypes.length >= 2) {
      const firstKeys = new Set(outputTypes[0].keys);
      const hasOverlap = outputTypes.slice(1).some(o =>
        o.keys.some(k => firstKeys.has(k))
      );

      if (!hasOverlap && outputTypes[0].keys.length > 0) {
        return `Output structures are incompatible: ${outputTypes.map(o => `${o.agent}: [${o.keys.join(', ')}]`).join(' vs ')}`;
      }
    }

    return null;
  }

  /**
   * Extracts the main position from a result
   */
  private extractPosition(result: AgentResult): string {
    if (result.message) {
      // Take first sentence
      return result.message.split(/[.!?]/)[0].trim();
    }
    return JSON.stringify(result.output).substring(0, 100);
  }

  /**
   * Extracts confidence from a result
   */
  private extractConfidence(result: AgentResult): number {
    if (result.output && typeof result.output === 'object') {
      const output = result.output as Record<string, unknown>;
      if (typeof output.confidence === 'number') return output.confidence;
    }
    return result.success ? 0.75 : 0.25;
  }

  /**
   * Extracts supporting points from a result
   */
  private extractSupportingPoints(result: AgentResult): string[] {
    const points: string[] = [];

    if (result.message) {
      // Extract bullet points or numbered items
      const bullets = result.message.match(/[-•*]\s+([^-•*\n]+)/g) || [];
      points.push(...bullets.map(b => b.replace(/^[-•*]\s+/, '').trim()));
    }

    return points.slice(0, 3); // Limit to top 3
  }

  /**
   * Normalizes a position for comparison
   */
  private normalizePosition(position: string): string {
    return position.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Infers domain from conflict context
   */
  private inferDomain(conflict: ConflictReport): string {
    const text = conflict.description.toLowerCase();

    if (text.includes('invest') || text.includes('portfolio') || text.includes('stock')) return 'investment';
    if (text.includes('credit') || text.includes('loan') || text.includes('debt')) return 'credit';
    if (text.includes('legal') || text.includes('contract') || text.includes('compliance')) return 'legal';
    if (text.includes('business') || text.includes('company') || text.includes('market')) return 'business';
    if (text.includes('health') || text.includes('wellness') || text.includes('fitness')) return 'health';
    if (text.includes('security') || text.includes('risk') || text.includes('fraud')) return 'security';
    if (text.includes('build') || text.includes('code') || text.includes('app')) return 'technical';

    return 'research'; // Default
  }

  /**
   * Gets active conflicts
   */
  getActiveConflicts(): ConflictReport[] {
    return Array.from(this.activeConflicts.values());
  }

  /**
   * Gets conflict resolution statistics
   */
  getResolutionStats(): Record<string, unknown> {
    const strategyCount: Record<string, number> = {};
    const typeCount: Record<string, number> = {};

    for (const conflict of this.resolvedConflicts) {
      if (conflict.resolution) {
        strategyCount[conflict.resolution.strategy] = (strategyCount[conflict.resolution.strategy] || 0) + 1;
      }
      typeCount[conflict.conflictType] = (typeCount[conflict.conflictType] || 0) + 1;
    }

    return {
      totalConflicts: this.resolvedConflicts.length,
      activeConflicts: this.activeConflicts.size,
      byStrategy: strategyCount,
      byType: typeCount,
      escalationRate: this.resolvedConflicts.filter(c => c.resolution?.humanReviewRequired).length /
                      (this.resolvedConflicts.length || 1) * 100 + '%',
    };
  }

  /**
   * Sets custom resolution strategy for a conflict type
   */
  setResolutionStrategy(conflictType: ConflictType, strategy: ResolutionStrategy): void {
    this.resolutionStrategies.set(conflictType, strategy);
  }
}

/**
 * Factory function to create a ConflictResolver
 */
export function createConflictResolver(llm: LLMClient): ConflictResolver {
  return new ConflictResolver(llm);
}

export default ConflictResolver;
