/**
 * Alabobai Financial Guardian - Cost Estimator
 * Pre-task cost estimation to prevent surprise charges
 *
 * Solves: "400 credits gone without warning", "$1000 on one bug fix"
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Supported LLM providers with their pricing models
 */
export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'mistral' | 'local';

/**
 * Token pricing per 1M tokens (in USD)
 */
export interface TokenPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

/**
 * Model-specific pricing configuration
 */
export interface ModelPricing {
  model: string;
  provider: LLMProvider;
  pricing: TokenPricing;
  contextWindow: number;
  outputLimit: number;
}

/**
 * Task complexity levels for estimation
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'extreme';

/**
 * Estimation input parameters
 */
export interface EstimationParams {
  taskDescription: string;
  complexity?: TaskComplexity;
  model: string;
  provider: LLMProvider;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  includeTools?: boolean;
  expectedIterations?: number;
  useCache?: boolean;
}

/**
 * Detailed cost estimate breakdown
 */
export interface CostEstimate {
  id: string;
  taskDescription: string;
  model: string;
  provider: LLMProvider;

  // Token estimates
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;

  // Cost breakdown (in USD)
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  toolCost: number;
  totalCost: number;

  // Confidence and ranges
  confidence: number; // 0-1, how confident we are in this estimate
  minCost: number;    // Optimistic estimate
  maxCost: number;    // Pessimistic estimate

  // Warnings
  warnings: string[];

  // Metadata
  estimatedAt: Date;
  complexity: TaskComplexity;
  expectedIterations: number;
}

/**
 * Historical estimate accuracy for learning
 */
export interface EstimateAccuracy {
  estimateId: string;
  estimatedCost: number;
  actualCost: number;
  accuracyPercentage: number;
  taskType: string;
  model: string;
  recordedAt: Date;
}

// ============================================================================
// PRICING DATABASE (Updated regularly)
// ============================================================================

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Models
  'claude-opus-4-20250514': {
    model: 'claude-opus-4-20250514',
    provider: 'anthropic',
    pricing: {
      inputPerMillion: 15.00,
      outputPerMillion: 75.00,
      cacheReadPerMillion: 1.50,
      cacheWritePerMillion: 18.75,
    },
    contextWindow: 200000,
    outputLimit: 32000,
  },
  'claude-sonnet-4-20250514': {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    pricing: {
      inputPerMillion: 3.00,
      outputPerMillion: 15.00,
      cacheReadPerMillion: 0.30,
      cacheWritePerMillion: 3.75,
    },
    contextWindow: 200000,
    outputLimit: 64000,
  },
  'claude-3-5-haiku-20241022': {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    pricing: {
      inputPerMillion: 0.80,
      outputPerMillion: 4.00,
      cacheReadPerMillion: 0.08,
      cacheWritePerMillion: 1.00,
    },
    contextWindow: 200000,
    outputLimit: 8192,
  },

  // OpenAI Models
  'gpt-4o': {
    model: 'gpt-4o',
    provider: 'openai',
    pricing: {
      inputPerMillion: 2.50,
      outputPerMillion: 10.00,
      cacheReadPerMillion: 1.25,
    },
    contextWindow: 128000,
    outputLimit: 16384,
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    provider: 'openai',
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.60,
      cacheReadPerMillion: 0.075,
    },
    contextWindow: 128000,
    outputLimit: 16384,
  },
  'o1': {
    model: 'o1',
    provider: 'openai',
    pricing: {
      inputPerMillion: 15.00,
      outputPerMillion: 60.00,
      cacheReadPerMillion: 7.50,
    },
    contextWindow: 200000,
    outputLimit: 100000,
  },

  // Google Models
  'gemini-2.0-flash': {
    model: 'gemini-2.0-flash',
    provider: 'google',
    pricing: {
      inputPerMillion: 0.10,
      outputPerMillion: 0.40,
    },
    contextWindow: 1000000,
    outputLimit: 8192,
  },
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    provider: 'google',
    pricing: {
      inputPerMillion: 1.25,
      outputPerMillion: 5.00,
    },
    contextWindow: 2000000,
    outputLimit: 8192,
  },

  // Local models (free)
  'local': {
    model: 'local',
    provider: 'local',
    pricing: {
      inputPerMillion: 0,
      outputPerMillion: 0,
    },
    contextWindow: 32000,
    outputLimit: 4096,
  },
};

// ============================================================================
// COMPLEXITY MULTIPLIERS
// ============================================================================

const COMPLEXITY_MULTIPLIERS: Record<TaskComplexity, { input: number; output: number; iterations: number }> = {
  simple: { input: 1.0, output: 1.0, iterations: 1 },
  moderate: { input: 1.5, output: 2.0, iterations: 2 },
  complex: { input: 2.5, output: 3.5, iterations: 4 },
  extreme: { input: 5.0, output: 6.0, iterations: 8 },
};

// Base token estimates by task type
const TASK_TYPE_ESTIMATES: Record<string, { input: number; output: number }> = {
  'code-generation': { input: 2000, output: 4000 },
  'code-review': { input: 5000, output: 2000 },
  'bug-fix': { input: 3000, output: 3000 },
  'chat': { input: 500, output: 1000 },
  'analysis': { input: 4000, output: 3000 },
  'translation': { input: 1500, output: 1500 },
  'summarization': { input: 5000, output: 1000 },
  'creative-writing': { input: 1000, output: 5000 },
  'research': { input: 2000, output: 4000 },
  'default': { input: 1500, output: 2000 },
};

// ============================================================================
// COST ESTIMATOR CLASS
// ============================================================================

export class CostEstimator extends EventEmitter {
  private historicalAccuracy: EstimateAccuracy[] = [];
  private customPricing: Map<string, ModelPricing> = new Map();
  private accuracyLearningEnabled = true;

  constructor() {
    super();
  }

  /**
   * Estimate cost for a task before execution
   */
  estimate(params: EstimationParams): CostEstimate {
    const {
      taskDescription,
      complexity = this.inferComplexity(taskDescription),
      model,
      provider,
      estimatedInputTokens,
      estimatedOutputTokens,
      includeTools = false,
      expectedIterations,
      useCache = false,
    } = params;

    const modelPricing = this.getModelPricing(model, provider);
    const complexityMultiplier = COMPLEXITY_MULTIPLIERS[complexity];
    const taskType = this.inferTaskType(taskDescription);
    const baseEstimate = TASK_TYPE_ESTIMATES[taskType] || TASK_TYPE_ESTIMATES.default;

    // Calculate token estimates
    const inputTokens = estimatedInputTokens ||
      Math.round(baseEstimate.input * complexityMultiplier.input);
    const outputTokens = estimatedOutputTokens ||
      Math.round(baseEstimate.output * complexityMultiplier.output);
    const iterations = expectedIterations || complexityMultiplier.iterations;

    // Calculate cache tokens (assume 30% cache hit rate if caching enabled)
    const cacheTokens = useCache ? Math.round(inputTokens * 0.3) : 0;
    const nonCacheInputTokens = inputTokens - cacheTokens;

    // Calculate per-iteration costs
    const inputCostPerIteration = (nonCacheInputTokens / 1_000_000) * modelPricing.pricing.inputPerMillion;
    const outputCostPerIteration = (outputTokens / 1_000_000) * modelPricing.pricing.outputPerMillion;
    const cacheCostPerIteration = cacheTokens > 0 && modelPricing.pricing.cacheReadPerMillion
      ? (cacheTokens / 1_000_000) * modelPricing.pricing.cacheReadPerMillion
      : 0;

    // Total costs with iterations
    const inputCost = inputCostPerIteration * iterations;
    const outputCost = outputCostPerIteration * iterations;
    const cacheCost = cacheCostPerIteration * iterations;

    // Tool usage adds ~20% overhead
    const toolCost = includeTools ? (inputCost + outputCost) * 0.2 : 0;

    const totalCost = inputCost + outputCost + cacheCost + toolCost;

    // Calculate confidence based on historical accuracy
    const confidence = this.calculateConfidence(taskType, model, complexity);

    // Calculate min/max range
    const varianceFactor = 1 - confidence;
    const minCost = totalCost * (1 - varianceFactor * 0.5);
    const maxCost = totalCost * (1 + varianceFactor * 2);

    // Generate warnings
    const warnings = this.generateWarnings(totalCost, maxCost, modelPricing, complexity);

    const estimate: CostEstimate = {
      id: this.generateEstimateId(),
      taskDescription,
      model,
      provider,
      inputTokens: inputTokens * iterations,
      outputTokens: outputTokens * iterations,
      cacheTokens: cacheTokens * iterations,
      totalTokens: (inputTokens + outputTokens) * iterations,
      inputCost: this.roundCost(inputCost),
      outputCost: this.roundCost(outputCost),
      cacheCost: this.roundCost(cacheCost),
      toolCost: this.roundCost(toolCost),
      totalCost: this.roundCost(totalCost),
      confidence,
      minCost: this.roundCost(minCost),
      maxCost: this.roundCost(maxCost),
      warnings,
      estimatedAt: new Date(),
      complexity,
      expectedIterations: iterations,
    };

    this.emit('estimate-created', estimate);
    return estimate;
  }

  /**
   * Quick estimate for simple tasks
   */
  quickEstimate(
    inputTokens: number,
    outputTokens: number,
    model: string,
    provider: LLMProvider = 'anthropic'
  ): number {
    const pricing = this.getModelPricing(model, provider);
    const inputCost = (inputTokens / 1_000_000) * pricing.pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.pricing.outputPerMillion;
    return this.roundCost(inputCost + outputCost);
  }

  /**
   * Get pricing for a model
   */
  getModelPricing(model: string, provider: LLMProvider): ModelPricing {
    // Check custom pricing first
    const customKey = `${provider}:${model}`;
    if (this.customPricing.has(customKey)) {
      return this.customPricing.get(customKey)!;
    }

    // Check built-in pricing
    if (MODEL_PRICING[model]) {
      return MODEL_PRICING[model];
    }

    // Default fallback pricing (conservative)
    return {
      model,
      provider,
      pricing: {
        inputPerMillion: 5.00,
        outputPerMillion: 15.00,
      },
      contextWindow: 100000,
      outputLimit: 8192,
    };
  }

  /**
   * Set custom pricing for a model
   */
  setCustomPricing(model: string, provider: LLMProvider, pricing: TokenPricing): void {
    const key = `${provider}:${model}`;
    this.customPricing.set(key, {
      model,
      provider,
      pricing,
      contextWindow: 100000,
      outputLimit: 8192,
    });
    this.emit('pricing-updated', { model, provider, pricing });
  }

  /**
   * Record actual cost for learning
   */
  recordActualCost(estimateId: string, actualCost: number, taskType: string, model: string): void {
    if (!this.accuracyLearningEnabled) return;

    // Find the original estimate (would need persistence in production)
    const estimate = this.historicalAccuracy.find(e => e.estimateId === estimateId);
    const estimatedCost = estimate?.estimatedCost || actualCost;

    const accuracy: EstimateAccuracy = {
      estimateId,
      estimatedCost,
      actualCost,
      accuracyPercentage: estimatedCost > 0
        ? Math.min(100, (1 - Math.abs(actualCost - estimatedCost) / estimatedCost) * 100)
        : 100,
      taskType,
      model,
      recordedAt: new Date(),
    };

    this.historicalAccuracy.push(accuracy);

    // Keep only last 1000 records
    if (this.historicalAccuracy.length > 1000) {
      this.historicalAccuracy = this.historicalAccuracy.slice(-1000);
    }

    this.emit('accuracy-recorded', accuracy);
  }

  /**
   * Get accuracy statistics
   */
  getAccuracyStats(): {
    averageAccuracy: number;
    totalEstimates: number;
    byTaskType: Record<string, number>;
    byModel: Record<string, number>;
  } {
    if (this.historicalAccuracy.length === 0) {
      return {
        averageAccuracy: 75, // Default assumption
        totalEstimates: 0,
        byTaskType: {},
        byModel: {},
      };
    }

    const avgAccuracy = this.historicalAccuracy.reduce(
      (sum, a) => sum + a.accuracyPercentage, 0
    ) / this.historicalAccuracy.length;

    const byTaskType: Record<string, number> = {};
    const byModel: Record<string, number> = {};

    for (const accuracy of this.historicalAccuracy) {
      // By task type
      if (!byTaskType[accuracy.taskType]) {
        byTaskType[accuracy.taskType] = 0;
      }
      byTaskType[accuracy.taskType] += accuracy.accuracyPercentage;

      // By model
      if (!byModel[accuracy.model]) {
        byModel[accuracy.model] = 0;
      }
      byModel[accuracy.model] += accuracy.accuracyPercentage;
    }

    // Normalize to averages
    const taskTypeCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};
    for (const accuracy of this.historicalAccuracy) {
      taskTypeCounts[accuracy.taskType] = (taskTypeCounts[accuracy.taskType] || 0) + 1;
      modelCounts[accuracy.model] = (modelCounts[accuracy.model] || 0) + 1;
    }
    for (const type in byTaskType) {
      byTaskType[type] /= taskTypeCounts[type];
    }
    for (const model in byModel) {
      byModel[model] /= modelCounts[model];
    }

    return {
      averageAccuracy: avgAccuracy,
      totalEstimates: this.historicalAccuracy.length,
      byTaskType,
      byModel,
    };
  }

  /**
   * Infer task complexity from description
   */
  private inferComplexity(description: string): TaskComplexity {
    const lowerDesc = description.toLowerCase();

    // Extreme complexity indicators
    if (
      lowerDesc.includes('entire codebase') ||
      lowerDesc.includes('full application') ||
      lowerDesc.includes('complete system') ||
      lowerDesc.includes('from scratch') ||
      lowerDesc.includes('major refactor')
    ) {
      return 'extreme';
    }

    // Complex indicators
    if (
      lowerDesc.includes('multi-file') ||
      lowerDesc.includes('architecture') ||
      lowerDesc.includes('integrate') ||
      lowerDesc.includes('complex') ||
      lowerDesc.includes('multiple components')
    ) {
      return 'complex';
    }

    // Moderate indicators
    if (
      lowerDesc.includes('implement') ||
      lowerDesc.includes('create') ||
      lowerDesc.includes('build') ||
      lowerDesc.includes('add feature') ||
      lowerDesc.includes('modify')
    ) {
      return 'moderate';
    }

    // Default to simple
    return 'simple';
  }

  /**
   * Infer task type from description
   */
  private inferTaskType(description: string): string {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('bug') || lowerDesc.includes('fix') || lowerDesc.includes('error')) {
      return 'bug-fix';
    }
    if (lowerDesc.includes('review') || lowerDesc.includes('check')) {
      return 'code-review';
    }
    if (lowerDesc.includes('generate') || lowerDesc.includes('create') || lowerDesc.includes('build')) {
      return 'code-generation';
    }
    if (lowerDesc.includes('analyze') || lowerDesc.includes('explain')) {
      return 'analysis';
    }
    if (lowerDesc.includes('translate')) {
      return 'translation';
    }
    if (lowerDesc.includes('summarize') || lowerDesc.includes('summary')) {
      return 'summarization';
    }
    if (lowerDesc.includes('write') || lowerDesc.includes('story') || lowerDesc.includes('creative')) {
      return 'creative-writing';
    }
    if (lowerDesc.includes('research') || lowerDesc.includes('find') || lowerDesc.includes('search')) {
      return 'research';
    }
    if (lowerDesc.includes('chat') || lowerDesc.includes('conversation')) {
      return 'chat';
    }

    return 'default';
  }

  /**
   * Calculate confidence based on historical data
   */
  private calculateConfidence(taskType: string, model: string, complexity: TaskComplexity): number {
    const stats = this.getAccuracyStats();

    // Base confidence from historical accuracy
    let confidence = stats.averageAccuracy / 100;

    // Adjust based on task type accuracy if available
    if (stats.byTaskType[taskType]) {
      confidence = (confidence + stats.byTaskType[taskType] / 100) / 2;
    }

    // Adjust based on model accuracy if available
    if (stats.byModel[model]) {
      confidence = (confidence + stats.byModel[model] / 100) / 2;
    }

    // Reduce confidence for complex tasks
    const complexityPenalty: Record<TaskComplexity, number> = {
      simple: 0,
      moderate: 0.05,
      complex: 0.15,
      extreme: 0.25,
    };
    confidence -= complexityPenalty[complexity];

    // Clamp to valid range
    return Math.max(0.3, Math.min(0.95, confidence));
  }

  /**
   * Generate warnings for an estimate
   */
  private generateWarnings(
    totalCost: number,
    maxCost: number,
    modelPricing: ModelPricing,
    complexity: TaskComplexity
  ): string[] {
    const warnings: string[] = [];

    if (totalCost > 1.00) {
      warnings.push(`Estimated cost exceeds $1.00 (${this.formatCurrency(totalCost)})`);
    }
    if (totalCost > 5.00) {
      warnings.push(`HIGH COST WARNING: Estimated at ${this.formatCurrency(totalCost)}`);
    }
    if (maxCost > totalCost * 2) {
      warnings.push(`Wide cost range: ${this.formatCurrency(totalCost)} - ${this.formatCurrency(maxCost)}`);
    }
    if (complexity === 'extreme') {
      warnings.push('Extreme complexity task - costs may vary significantly');
    }
    if (modelPricing.pricing.outputPerMillion > 30) {
      warnings.push(`Using premium model with high output costs (${modelPricing.model})`);
    }

    return warnings;
  }

  /**
   * Generate unique estimate ID
   */
  private generateEstimateId(): string {
    return `est_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Round cost to reasonable precision
   */
  private roundCost(cost: number): number {
    if (cost < 0.01) {
      return Math.round(cost * 10000) / 10000; // 4 decimal places for tiny amounts
    }
    return Math.round(cost * 100) / 100; // 2 decimal places normally
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    if (amount < 0.01) {
      return `$${amount.toFixed(4)}`;
    }
    return `$${amount.toFixed(2)}`;
  }

  /**
   * Format estimate as human-readable string
   */
  formatEstimate(estimate: CostEstimate): string {
    const lines = [
      `Cost Estimate for: ${estimate.taskDescription}`,
      `Model: ${estimate.model} (${estimate.provider})`,
      `Complexity: ${estimate.complexity}`,
      '',
      `Tokens: ${estimate.totalTokens.toLocaleString()} (${estimate.inputTokens.toLocaleString()} in, ${estimate.outputTokens.toLocaleString()} out)`,
      `Expected iterations: ${estimate.expectedIterations}`,
      '',
      'Cost Breakdown:',
      `  Input:  ${this.formatCurrency(estimate.inputCost)}`,
      `  Output: ${this.formatCurrency(estimate.outputCost)}`,
      estimate.cacheCost > 0 ? `  Cache:  ${this.formatCurrency(estimate.cacheCost)}` : '',
      estimate.toolCost > 0 ? `  Tools:  ${this.formatCurrency(estimate.toolCost)}` : '',
      `  TOTAL:  ${this.formatCurrency(estimate.totalCost)}`,
      '',
      `Range: ${this.formatCurrency(estimate.minCost)} - ${this.formatCurrency(estimate.maxCost)} (${Math.round(estimate.confidence * 100)}% confidence)`,
    ];

    if (estimate.warnings.length > 0) {
      lines.push('', 'Warnings:');
      for (const warning of estimate.warnings) {
        lines.push(`  - ${warning}`);
      }
    }

    return lines.filter(l => l !== '').join('\n');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let costEstimatorInstance: CostEstimator | null = null;

export function getCostEstimator(): CostEstimator {
  if (!costEstimatorInstance) {
    costEstimatorInstance = new CostEstimator();
  }
  return costEstimatorInstance;
}

export function createCostEstimator(): CostEstimator {
  return new CostEstimator();
}
