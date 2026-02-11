/**
 * Alabobai Self-Annealing System - Adaptation Engine
 *
 * Applies learnings from pattern analysis to improve agent behavior.
 * Manages prompt optimization, tool selection, and execution strategies.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  Adaptation,
  AdaptationType,
  AdaptationChange,
  AdaptationStatus,
  AdaptationMetric,
  RolloutStrategy,
  RollbackCondition,
  Pattern,
  SafetyRail,
} from './types.js';

// ============================================================================
// ADAPTATION ENGINE CLASS
// ============================================================================

export interface AdaptationEngineConfig {
  requireApprovalForGlobalChanges: boolean;
  defaultRolloutStrategy: RolloutStrategy;
  maxConcurrentAdaptations: number;
  metricsRetentionDays: number;
  enableAutoRollback: boolean;
}

const DEFAULT_CONFIG: AdaptationEngineConfig = {
  requireApprovalForGlobalChanges: true,
  defaultRolloutStrategy: {
    type: 'gradual',
    startPercentage: 10,
    targetPercentage: 100,
    incrementPercentage: 10,
    incrementIntervalHours: 24,
    minimumSampleSize: 100,
  },
  maxConcurrentAdaptations: 5,
  metricsRetentionDays: 90,
  enableAutoRollback: true,
};

export class AdaptationEngine extends EventEmitter {
  private config: AdaptationEngineConfig;
  private adaptations: Map<string, Adaptation> = new Map();
  private safetyRails: SafetyRail[] = [];

  // Callbacks for applying changes
  private applyPromptChange: ((agentName: string, promptType: string, newPrompt: string) => Promise<void>) | null = null;
  private applyToolConfig: ((agentName: string, config: Record<string, unknown>) => Promise<void>) | null = null;
  private persistAdaptation: ((adaptation: Adaptation) => Promise<void>) | null = null;

  constructor(config: Partial<AdaptationEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callbacks for applying changes
   */
  setCallbacks(callbacks: {
    applyPromptChange: (agentName: string, promptType: string, newPrompt: string) => Promise<void>;
    applyToolConfig: (agentName: string, config: Record<string, unknown>) => Promise<void>;
    persistAdaptation: (adaptation: Adaptation) => Promise<void>;
  }): void {
    this.applyPromptChange = callbacks.applyPromptChange;
    this.applyToolConfig = callbacks.applyToolConfig;
    this.persistAdaptation = callbacks.persistAdaptation;
  }

  /**
   * Set safety rails
   */
  setSafetyRails(rails: SafetyRail[]): void {
    this.safetyRails = rails;
  }

  // ============================================================================
  // ADAPTATION CREATION
  // ============================================================================

  /**
   * Create a prompt optimization adaptation
   */
  async createPromptOptimization(params: {
    agentName: string;
    promptType: 'system' | 'user-template' | 'tool-description';
    patterns: Pattern[];
    currentPrompt: string;
    optimizedPrompt: string;
    reason: string;
  }): Promise<Adaptation> {
    const adaptation = this.createAdaptation({
      adaptationType: 'prompt-optimization',
      name: `Optimize ${params.agentName} ${params.promptType} prompt`,
      description: params.reason,
      triggerPatternIds: params.patterns.map(p => p.id),
      triggerReason: params.reason,
      change: {
        target: `agent.${params.agentName}.${params.promptType}`,
        changeType: 'replace',
        previousValue: params.currentPrompt,
        newValue: params.optimizedPrompt,
        changeDiff: this.createDiff(params.currentPrompt, params.optimizedPrompt),
      },
      rollbackConditions: [
        {
          metric: 'success_rate',
          threshold: -0.05, // 5% drop
          operator: 'less',
          windowMinutes: 60,
        },
        {
          metric: 'user_rating',
          threshold: -0.3, // 0.3 star drop
          operator: 'less',
          windowMinutes: 120,
        },
      ],
    });

    return adaptation;
  }

  /**
   * Create a tool selection optimization
   */
  async createToolSelectionOptimization(params: {
    agentName: string;
    patterns: Pattern[];
    currentConfig: Record<string, unknown>;
    optimizedConfig: Record<string, unknown>;
    reason: string;
  }): Promise<Adaptation> {
    const adaptation = this.createAdaptation({
      adaptationType: 'tool-selection',
      name: `Optimize ${params.agentName} tool selection`,
      description: params.reason,
      triggerPatternIds: params.patterns.map(p => p.id),
      triggerReason: params.reason,
      change: {
        target: `agent.${params.agentName}.toolConfig`,
        changeType: 'modify',
        previousValue: params.currentConfig,
        newValue: params.optimizedConfig,
      },
      rollbackConditions: [
        {
          metric: 'success_rate',
          threshold: -0.05,
          operator: 'less',
          windowMinutes: 60,
        },
      ],
    });

    return adaptation;
  }

  /**
   * Create an execution strategy optimization
   */
  async createExecutionStrategyOptimization(params: {
    agentName: string;
    patterns: Pattern[];
    strategyName: string;
    previousStrategy: Record<string, unknown>;
    newStrategy: Record<string, unknown>;
    reason: string;
  }): Promise<Adaptation> {
    const adaptation = this.createAdaptation({
      adaptationType: 'execution-strategy',
      name: `Update ${params.agentName} ${params.strategyName} strategy`,
      description: params.reason,
      triggerPatternIds: params.patterns.map(p => p.id),
      triggerReason: params.reason,
      change: {
        target: `agent.${params.agentName}.strategy.${params.strategyName}`,
        changeType: 'replace',
        previousValue: params.previousStrategy,
        newValue: params.newStrategy,
      },
      rollbackConditions: [
        {
          metric: 'latency_p95',
          threshold: 2.0, // 2x increase
          operator: 'greater',
          windowMinutes: 30,
        },
      ],
    });

    return adaptation;
  }

  /**
   * Create an output template optimization
   */
  async createOutputTemplateOptimization(params: {
    agentName: string;
    taskType: string;
    patterns: Pattern[];
    currentTemplate: string;
    optimizedTemplate: string;
    reason: string;
  }): Promise<Adaptation> {
    const adaptation = this.createAdaptation({
      adaptationType: 'output-template',
      name: `Optimize ${params.agentName} output for ${params.taskType}`,
      description: params.reason,
      triggerPatternIds: params.patterns.map(p => p.id),
      triggerReason: params.reason,
      change: {
        target: `agent.${params.agentName}.outputTemplate.${params.taskType}`,
        changeType: 'replace',
        previousValue: params.currentTemplate,
        newValue: params.optimizedTemplate,
        changeDiff: this.createDiff(params.currentTemplate, params.optimizedTemplate),
      },
      rollbackConditions: [
        {
          metric: 'modification_rate',
          threshold: 0.2, // 20% more modifications
          operator: 'greater',
          windowMinutes: 120,
        },
      ],
    });

    return adaptation;
  }

  /**
   * Create a context priority optimization
   */
  async createContextPriorityOptimization(params: {
    agentName: string;
    patterns: Pattern[];
    previousPriorities: Record<string, number>;
    newPriorities: Record<string, number>;
    reason: string;
  }): Promise<Adaptation> {
    const adaptation = this.createAdaptation({
      adaptationType: 'context-priority',
      name: `Update ${params.agentName} context priorities`,
      description: params.reason,
      triggerPatternIds: params.patterns.map(p => p.id),
      triggerReason: params.reason,
      change: {
        target: `agent.${params.agentName}.contextPriorities`,
        changeType: 'replace',
        previousValue: params.previousPriorities,
        newValue: params.newPriorities,
      },
      rollbackConditions: [
        {
          metric: 'success_rate',
          threshold: -0.03,
          operator: 'less',
          windowMinutes: 60,
        },
      ],
    });

    return adaptation;
  }

  // ============================================================================
  // ADAPTATION LIFECYCLE
  // ============================================================================

  /**
   * Approve an adaptation for rollout
   */
  async approveAdaptation(adaptationId: string, approvedBy: string): Promise<void> {
    const adaptation = this.adaptations.get(adaptationId);
    if (!adaptation) {
      throw new Error(`Adaptation not found: ${adaptationId}`);
    }

    if (adaptation.status !== 'pending-approval') {
      throw new Error(`Adaptation ${adaptationId} is not pending approval`);
    }

    // Check safety rails
    const railBlock = this.checkSafetyRails(adaptation);
    if (railBlock) {
      throw new Error(`Safety rail blocked: ${railBlock.action.message}`);
    }

    adaptation.status = 'approved';
    await this.persist(adaptation);

    this.emit('adaptation-approved', { adaptationId, approvedBy });

    // Start rollout if auto-rollout enabled
    await this.startRollout(adaptationId);
  }

  /**
   * Start rolling out an adaptation
   */
  async startRollout(adaptationId: string): Promise<void> {
    const adaptation = this.adaptations.get(adaptationId);
    if (!adaptation) {
      throw new Error(`Adaptation not found: ${adaptationId}`);
    }

    if (adaptation.status !== 'approved') {
      throw new Error(`Adaptation ${adaptationId} is not approved`);
    }

    // Check concurrent adaptation limit
    const rollingOut = Array.from(this.adaptations.values())
      .filter(a => a.status === 'rolling-out').length;

    if (rollingOut >= this.config.maxConcurrentAdaptations) {
      throw new Error('Maximum concurrent adaptations reached');
    }

    adaptation.status = 'rolling-out';
    adaptation.appliedAt = new Date();
    adaptation.currentRolloutPercentage = adaptation.rolloutStrategy.startPercentage;

    // Initialize metrics tracking
    adaptation.metrics = [
      {
        name: 'success_rate',
        baselineValue: 0,
        currentValue: 0,
        targetValue: 0,
        measurementCount: 0,
        lastMeasuredAt: new Date(),
      },
      {
        name: 'user_rating',
        baselineValue: 0,
        currentValue: 0,
        targetValue: 0,
        measurementCount: 0,
        lastMeasuredAt: new Date(),
      },
      {
        name: 'latency_p95',
        baselineValue: 0,
        currentValue: 0,
        targetValue: 0,
        measurementCount: 0,
        lastMeasuredAt: new Date(),
      },
    ];

    await this.persist(adaptation);
    await this.applyChange(adaptation);

    this.emit('rollout-started', { adaptationId, percentage: adaptation.currentRolloutPercentage });
  }

  /**
   * Progress rollout to next stage
   */
  async progressRollout(adaptationId: string): Promise<void> {
    const adaptation = this.adaptations.get(adaptationId);
    if (!adaptation) {
      throw new Error(`Adaptation not found: ${adaptationId}`);
    }

    if (adaptation.status !== 'rolling-out') {
      throw new Error(`Adaptation ${adaptationId} is not rolling out`);
    }

    // Check rollback conditions
    const shouldRollback = this.checkRollbackConditions(adaptation);
    if (shouldRollback) {
      await this.rollback(adaptationId, shouldRollback.reason);
      return;
    }

    // Check if we have enough samples
    const totalSamples = adaptation.metrics.reduce(
      (sum, m) => sum + m.measurementCount, 0
    );

    if (totalSamples < adaptation.rolloutStrategy.minimumSampleSize) {
      console.log(`[AdaptationEngine] Not enough samples for ${adaptationId}, waiting...`);
      return;
    }

    // Progress to next percentage
    const nextPercentage = Math.min(
      adaptation.currentRolloutPercentage + adaptation.rolloutStrategy.incrementPercentage,
      adaptation.rolloutStrategy.targetPercentage
    );

    adaptation.currentRolloutPercentage = nextPercentage;

    if (nextPercentage >= adaptation.rolloutStrategy.targetPercentage) {
      adaptation.status = 'active';
      this.emit('rollout-complete', { adaptationId });
    } else {
      this.emit('rollout-progressed', { adaptationId, percentage: nextPercentage });
    }

    await this.persist(adaptation);
  }

  /**
   * Rollback an adaptation
   */
  async rollback(adaptationId: string, reason: string): Promise<void> {
    const adaptation = this.adaptations.get(adaptationId);
    if (!adaptation) {
      throw new Error(`Adaptation not found: ${adaptationId}`);
    }

    if (adaptation.status !== 'rolling-out' && adaptation.status !== 'active') {
      throw new Error(`Adaptation ${adaptationId} cannot be rolled back`);
    }

    // Revert the change
    await this.revertChange(adaptation);

    adaptation.status = 'rolled-back';
    adaptation.rollbackTriggered = true;
    adaptation.rollbackReason = reason;

    await this.persist(adaptation);

    this.emit('adaptation-rolled-back', { adaptationId, reason });
  }

  /**
   * Record metrics for an adaptation
   */
  recordMetric(adaptationId: string, metricName: string, value: number): void {
    const adaptation = this.adaptations.get(adaptationId);
    if (!adaptation) return;

    const metric = adaptation.metrics.find(m => m.name === metricName);
    if (metric) {
      // Update running average
      const oldSum = metric.currentValue * metric.measurementCount;
      metric.measurementCount++;
      metric.currentValue = (oldSum + value) / metric.measurementCount;
      metric.lastMeasuredAt = new Date();
    }
  }

  /**
   * Check if a request should use an adaptation (based on rollout percentage)
   */
  shouldApplyAdaptation(adaptationId: string, requestHash: number): boolean {
    const adaptation = this.adaptations.get(adaptationId);
    if (!adaptation) return false;

    if (adaptation.status !== 'rolling-out' && adaptation.status !== 'active') {
      return false;
    }

    // Use consistent hashing for deterministic assignment
    const bucket = requestHash % 100;
    return bucket < adaptation.currentRolloutPercentage;
  }

  // ============================================================================
  // AUTOMATIC ADAPTATION GENERATION
  // ============================================================================

  /**
   * Generate prompt improvement from patterns
   */
  generatePromptImprovement(
    currentPrompt: string,
    successPatterns: Pattern[],
    failurePatterns: Pattern[]
  ): { improvedPrompt: string; changes: string[] } {
    const changes: string[] = [];
    let improvedPrompt = currentPrompt;

    // Analyze success patterns for what to emphasize
    for (const pattern of successPatterns) {
      if (pattern.conditions.some(c => c.dimension.includes('output'))) {
        // Pattern relates to output quality - add guidance
        const guidance = this.extractGuidanceFromPattern(pattern);
        if (guidance && !improvedPrompt.includes(guidance)) {
          improvedPrompt += `\n\nIMPORTANT: ${guidance}`;
          changes.push(`Added guidance: "${guidance}"`);
        }
      }
    }

    // Analyze failure patterns for what to avoid
    for (const pattern of failurePatterns) {
      const avoidance = this.extractAvoidanceFromPattern(pattern);
      if (avoidance && !improvedPrompt.includes(avoidance)) {
        improvedPrompt += `\n\nAVOID: ${avoidance}`;
        changes.push(`Added avoidance: "${avoidance}"`);
      }
    }

    // Optimize prompt length if needed
    if (currentPrompt.length > 4000) {
      improvedPrompt = this.condensePrompt(improvedPrompt);
      changes.push('Condensed prompt to reduce token usage');
    }

    return { improvedPrompt, changes };
  }

  /**
   * Generate tool configuration from patterns
   */
  generateToolConfigImprovement(
    agentName: string,
    currentConfig: Record<string, unknown>,
    patterns: Pattern[]
  ): { improvedConfig: Record<string, unknown>; changes: string[] } {
    const changes: string[] = [];
    const improvedConfig = { ...currentConfig };

    for (const pattern of patterns) {
      // Check for tool-related patterns
      const toolConditions = pattern.conditions.filter(c => c.dimension.includes('tools'));

      for (const condition of toolConditions) {
        if (condition.operator === 'contains' && pattern.patternType === 'success-pattern') {
          // Increase preference for successful tools
          const toolName = condition.value as string;
          if (!improvedConfig.preferredTools) {
            improvedConfig.preferredTools = [];
          }
          if (!((improvedConfig.preferredTools as string[]).includes(toolName))) {
            (improvedConfig.preferredTools as string[]).push(toolName);
            changes.push(`Added ${toolName} to preferred tools`);
          }
        }

        if (condition.operator === 'contains' && pattern.patternType === 'failure-pattern') {
          // Decrease preference for failing tools
          const toolName = condition.value as string;
          if (!improvedConfig.deprioritizedTools) {
            improvedConfig.deprioritizedTools = [];
          }
          if (!((improvedConfig.deprioritizedTools as string[]).includes(toolName))) {
            (improvedConfig.deprioritizedTools as string[]).push(toolName);
            changes.push(`Added ${toolName} to deprioritized tools`);
          }
        }
      }
    }

    return { improvedConfig, changes };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createAdaptation(params: {
    adaptationType: AdaptationType;
    name: string;
    description: string;
    triggerPatternIds: string[];
    triggerReason: string;
    change: AdaptationChange;
    rollbackConditions: RollbackCondition[];
  }): Adaptation {
    const isGlobalChange = params.change.target.split('.').length <= 2;
    const needsApproval = isGlobalChange && this.config.requireApprovalForGlobalChanges;

    const adaptation: Adaptation = {
      id: uuid(),
      createdAt: new Date(),
      adaptationType: params.adaptationType,
      name: params.name,
      description: params.description,
      triggerPatternIds: params.triggerPatternIds,
      triggerReason: params.triggerReason,
      change: params.change,
      rolloutStrategy: { ...this.config.defaultRolloutStrategy },
      currentRolloutPercentage: 0,
      status: needsApproval ? 'pending-approval' : 'approved',
      metrics: [],
      rollbackConditions: params.rollbackConditions,
      rollbackTriggered: false,
    };

    this.adaptations.set(adaptation.id, adaptation);
    this.emit('adaptation-created', adaptation);

    return adaptation;
  }

  private checkSafetyRails(adaptation: Adaptation): SafetyRail | null {
    for (const rail of this.safetyRails) {
      if (!rail.enabled) continue;

      if (rail.severity === 'block') {
        // Check if this adaptation matches the rail condition
        const matches = this.matchesSafetyCondition(adaptation, rail);
        if (matches) {
          return rail;
        }
      }
    }

    return null;
  }

  private matchesSafetyCondition(adaptation: Adaptation, rail: SafetyRail): boolean {
    const condition = rail.condition;

    // Check change scope
    if (condition.patternMatch) {
      for (const pattern of condition.patternMatch) {
        if (pattern.dimension === 'scope.global' && pattern.value === true) {
          // Check if this is a global change
          const targetParts = adaptation.change.target.split('.');
          if (targetParts.length <= 2) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private checkRollbackConditions(adaptation: Adaptation): { shouldRollback: boolean; reason: string } | null {
    if (!this.config.enableAutoRollback) return null;

    for (const condition of adaptation.rollbackConditions) {
      const metric = adaptation.metrics.find(m => m.name === condition.metric);
      if (!metric || metric.measurementCount === 0) continue;

      const diff = metric.currentValue - metric.baselineValue;

      if (condition.operator === 'less' && diff < condition.threshold) {
        return {
          shouldRollback: true,
          reason: `${condition.metric} degraded by ${diff.toFixed(2)} (threshold: ${condition.threshold})`,
        };
      }

      if (condition.operator === 'greater' && diff > condition.threshold) {
        return {
          shouldRollback: true,
          reason: `${condition.metric} increased by ${diff.toFixed(2)} (threshold: ${condition.threshold})`,
        };
      }
    }

    return null;
  }

  private async applyChange(adaptation: Adaptation): Promise<void> {
    const targetParts = adaptation.change.target.split('.');

    if (targetParts[0] === 'agent' && targetParts.length >= 3) {
      const agentName = targetParts[1];
      const changeArea = targetParts[2];

      switch (changeArea) {
        case 'system':
        case 'user-template':
        case 'tool-description':
          if (this.applyPromptChange) {
            await this.applyPromptChange(
              agentName,
              changeArea,
              adaptation.change.newValue as string
            );
          }
          break;

        case 'toolConfig':
          if (this.applyToolConfig) {
            await this.applyToolConfig(
              agentName,
              adaptation.change.newValue as Record<string, unknown>
            );
          }
          break;
      }
    }
  }

  private async revertChange(adaptation: Adaptation): Promise<void> {
    const targetParts = adaptation.change.target.split('.');

    if (targetParts[0] === 'agent' && targetParts.length >= 3) {
      const agentName = targetParts[1];
      const changeArea = targetParts[2];

      switch (changeArea) {
        case 'system':
        case 'user-template':
        case 'tool-description':
          if (this.applyPromptChange && adaptation.change.previousValue) {
            await this.applyPromptChange(
              agentName,
              changeArea,
              adaptation.change.previousValue as string
            );
          }
          break;

        case 'toolConfig':
          if (this.applyToolConfig && adaptation.change.previousValue) {
            await this.applyToolConfig(
              agentName,
              adaptation.change.previousValue as Record<string, unknown>
            );
          }
          break;
      }
    }
  }

  private async persist(adaptation: Adaptation): Promise<void> {
    if (this.persistAdaptation) {
      await this.persistAdaptation(adaptation);
    }
  }

  private createDiff(oldText: string, newText: string): string {
    // Simple line-by-line diff
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff: string[] = [];

    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      if (i >= oldLines.length) {
        diff.push(`+ ${newLines[i]}`);
      } else if (i >= newLines.length) {
        diff.push(`- ${oldLines[i]}`);
      } else if (oldLines[i] !== newLines[i]) {
        diff.push(`- ${oldLines[i]}`);
        diff.push(`+ ${newLines[i]}`);
      }
    }

    return diff.join('\n');
  }

  private extractGuidanceFromPattern(pattern: Pattern): string | null {
    // Extract actionable guidance from pattern description
    const desc = pattern.description.toLowerCase();

    if (desc.includes('success rate improves')) {
      return `Focus on ${pattern.patternName} approach for better results.`;
    }

    if (desc.includes('leads to')) {
      return `When possible, follow the ${pattern.patternName} pattern.`;
    }

    return null;
  }

  private extractAvoidanceFromPattern(pattern: Pattern): string | null {
    const desc = pattern.description.toLowerCase();

    if (desc.includes('error') || desc.includes('failure')) {
      return `Avoid conditions that lead to ${pattern.patternName}.`;
    }

    return null;
  }

  private condensePrompt(prompt: string): string {
    // Remove redundant whitespace
    let condensed = prompt.replace(/\n{3,}/g, '\n\n');
    condensed = condensed.replace(/  +/g, ' ');

    // Remove duplicate instructions
    const lines = condensed.split('\n');
    const seen = new Set<string>();
    const uniqueLines = lines.filter(line => {
      const normalized = line.toLowerCase().trim();
      if (normalized.length > 20 && seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    return uniqueLines.join('\n');
  }

  /**
   * Get all adaptations
   */
  getAdaptations(): Adaptation[] {
    return Array.from(this.adaptations.values());
  }

  /**
   * Get active adaptations
   */
  getActiveAdaptations(): Adaptation[] {
    return Array.from(this.adaptations.values()).filter(
      a => a.status === 'active' || a.status === 'rolling-out'
    );
  }

  /**
   * Get pending adaptations
   */
  getPendingAdaptations(): Adaptation[] {
    return Array.from(this.adaptations.values()).filter(
      a => a.status === 'pending-approval'
    );
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let engineInstance: AdaptationEngine | null = null;

export function getAdaptationEngine(config?: Partial<AdaptationEngineConfig>): AdaptationEngine {
  if (!engineInstance) {
    engineInstance = new AdaptationEngine(config);
  }
  return engineInstance;
}

export function createAdaptationEngine(config?: Partial<AdaptationEngineConfig>): AdaptationEngine {
  return new AdaptationEngine(config);
}
