/**
 * Alabobai Self-Annealing System - Pattern Analyzer
 *
 * Identifies success and failure patterns from execution logs and feedback.
 * Uses statistical analysis to ensure patterns are significant.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  Pattern,
  PatternType,
  PatternCondition,
  PatternOutcome,
  PatternScope,
  PatternStatus,
  ExecutionLog,
  Feedback,
} from './types.js';

// ============================================================================
// PATTERN ANALYZER CLASS
// ============================================================================

export interface PatternAnalyzerConfig {
  minimumSampleSize: number;          // Minimum samples before considering a pattern
  confidenceThreshold: number;        // Minimum confidence (0-1) to validate
  significanceLevel: number;          // p-value threshold (default 0.05)
  analysisIntervalMinutes: number;    // How often to run analysis
  maxPatternsPerType: number;         // Limit patterns of each type
  enableAutomaticAnalysis: boolean;   // Run on schedule
}

const DEFAULT_CONFIG: PatternAnalyzerConfig = {
  minimumSampleSize: 50,
  confidenceThreshold: 0.75,
  significanceLevel: 0.05,
  analysisIntervalMinutes: 60,
  maxPatternsPerType: 100,
  enableAutomaticAnalysis: true,
};

export interface AnalysisResult {
  patternsDiscovered: Pattern[];
  patternsValidated: Pattern[];
  patternsDeprecated: Pattern[];
  analysisTimestamp: Date;
  sampleSizeAnalyzed: number;
}

export class PatternAnalyzer extends EventEmitter {
  private config: PatternAnalyzerConfig;
  private analysisTimer: NodeJS.Timeout | null = null;
  private patterns: Map<string, Pattern> = new Map();

  // Data accessors
  private getExecutionLogs: (() => Promise<ExecutionLog[]>) | null = null;
  private getFeedback: (() => Promise<Feedback[]>) | null = null;
  private persistPattern: ((pattern: Pattern) => Promise<void>) | null = null;

  constructor(config: Partial<PatternAnalyzerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set data accessors
   */
  setDataAccessors(accessors: {
    getExecutionLogs: () => Promise<ExecutionLog[]>;
    getFeedback: () => Promise<Feedback[]>;
    persistPattern: (pattern: Pattern) => Promise<void>;
  }): void {
    this.getExecutionLogs = accessors.getExecutionLogs;
    this.getFeedback = accessors.getFeedback;
    this.persistPattern = accessors.persistPattern;
  }

  /**
   * Start automatic analysis
   */
  startAutomaticAnalysis(): void {
    if (this.config.enableAutomaticAnalysis && !this.analysisTimer) {
      this.analysisTimer = setInterval(
        () => this.runAnalysis(),
        this.config.analysisIntervalMinutes * 60 * 1000
      );
    }
  }

  /**
   * Stop automatic analysis
   */
  stopAutomaticAnalysis(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
  }

  /**
   * Run a full pattern analysis
   */
  async runAnalysis(): Promise<AnalysisResult> {
    if (!this.getExecutionLogs || !this.getFeedback) {
      throw new Error('Data accessors not configured');
    }

    console.log('[PatternAnalyzer] Starting analysis...');

    const logs = await this.getExecutionLogs();
    const feedback = await this.getFeedback();

    const result: AnalysisResult = {
      patternsDiscovered: [],
      patternsValidated: [],
      patternsDeprecated: [],
      analysisTimestamp: new Date(),
      sampleSizeAnalyzed: logs.length,
    };

    // Discover success patterns
    const successPatterns = await this.discoverSuccessPatterns(logs, feedback);
    result.patternsDiscovered.push(...successPatterns);

    // Discover failure patterns
    const failurePatterns = await this.discoverFailurePatterns(logs, feedback);
    result.patternsDiscovered.push(...failurePatterns);

    // Discover optimization opportunities
    const optimizationPatterns = await this.discoverOptimizationPatterns(logs, feedback);
    result.patternsDiscovered.push(...optimizationPatterns);

    // Validate candidate patterns
    for (const pattern of this.patterns.values()) {
      if (pattern.status === 'candidate') {
        const isValid = this.validatePattern(pattern, logs, feedback);
        if (isValid) {
          pattern.status = 'validated';
          pattern.validatedAt = new Date();
          result.patternsValidated.push(pattern);
        } else if (pattern.sampleSize > this.config.minimumSampleSize * 2) {
          // Enough samples but still not valid - deprecate
          pattern.status = 'deprecated';
          result.patternsDeprecated.push(pattern);
        }
      }
    }

    // Persist all patterns
    if (this.persistPattern) {
      for (const pattern of [...result.patternsDiscovered, ...result.patternsValidated, ...result.patternsDeprecated]) {
        await this.persistPattern(pattern);
      }
    }

    this.emit('analysis-complete', result);
    console.log(`[PatternAnalyzer] Analysis complete: ${result.patternsDiscovered.length} discovered, ${result.patternsValidated.length} validated`);

    return result;
  }

  // ============================================================================
  // PATTERN DISCOVERY
  // ============================================================================

  /**
   * Discover success patterns - what leads to good outcomes
   */
  private async discoverSuccessPatterns(
    logs: ExecutionLog[],
    feedback: Feedback[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Group logs by agent
    const byAgent = this.groupBy(logs, 'agentName');

    for (const [agentName, agentLogs] of Object.entries(byAgent)) {
      const successLogs = agentLogs.filter(l => l.status === 'success');
      const feedbackMap = this.createFeedbackMap(feedback);

      // Analyze tool combinations that lead to success
      const toolCombinations = this.analyzeToolCombinations(successLogs, feedbackMap);
      for (const combo of toolCombinations) {
        if (combo.successRate > 0.8 && combo.sampleSize >= this.config.minimumSampleSize) {
          patterns.push(this.createPattern({
            patternType: 'success-pattern',
            patternName: `${agentName}_tool_combo_${combo.tools.join('_')}`,
            description: `Using ${combo.tools.join(' + ')} leads to ${(combo.successRate * 100).toFixed(0)}% success rate`,
            conditions: [
              { dimension: 'agent_name', operator: 'equals', value: agentName },
              { dimension: 'tools_used', operator: 'contains', value: combo.tools },
            ],
            outcome: {
              metric: 'success_rate',
              direction: 'increase',
              magnitude: combo.successRate - this.calculateBaselineSuccessRate(agentLogs, feedbackMap),
              baselineValue: this.calculateBaselineSuccessRate(agentLogs, feedbackMap),
              patternValue: combo.successRate,
            },
            sampleSize: combo.sampleSize,
            confidenceLevel: this.calculateConfidence(combo.sampleSize, combo.successRate),
          }));
        }
      }

      // Analyze context factors that correlate with success
      const contextPatterns = this.analyzeContextFactors(successLogs, agentLogs, feedbackMap);
      patterns.push(...contextPatterns.map(cp => this.createPattern({
        patternType: 'success-pattern',
        patternName: `${agentName}_context_${cp.factor}`,
        description: `When ${cp.factor}=${cp.value}, success rate improves by ${(cp.improvement * 100).toFixed(0)}%`,
        conditions: [
          { dimension: 'agent_name', operator: 'equals', value: agentName },
          { dimension: `context.${cp.factor}`, operator: 'equals', value: cp.value },
        ],
        outcome: {
          metric: 'success_rate',
          direction: 'increase',
          magnitude: cp.improvement,
          baselineValue: cp.baseline,
          patternValue: cp.patternRate,
        },
        sampleSize: cp.sampleSize,
        confidenceLevel: this.calculateConfidence(cp.sampleSize, cp.patternRate),
      })));
    }

    return patterns;
  }

  /**
   * Discover failure patterns - what leads to bad outcomes
   */
  private async discoverFailurePatterns(
    logs: ExecutionLog[],
    feedback: Feedback[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Analyze error patterns
    const errorLogs = logs.filter(l => l.status === 'failure' || l.status === 'timeout');
    const errorsByType = this.groupBy(errorLogs, 'errorType');

    for (const [errorType, errorTypeLogs] of Object.entries(errorsByType)) {
      if (!errorType || errorTypeLogs.length < this.config.minimumSampleSize) continue;

      // Find common conditions for this error type
      const commonConditions = this.findCommonConditions(errorTypeLogs);

      patterns.push(this.createPattern({
        patternType: 'failure-pattern',
        patternName: `error_${errorType}`,
        description: `${errorType} errors occur under specific conditions`,
        conditions: commonConditions,
        outcome: {
          metric: 'error_rate',
          direction: 'increase',
          magnitude: errorTypeLogs.length / logs.length,
          baselineValue: 0,
          patternValue: errorTypeLogs.length / logs.length,
        },
        sampleSize: errorTypeLogs.length,
        confidenceLevel: this.calculateConfidence(errorTypeLogs.length, errorTypeLogs.length / logs.length),
      }));
    }

    // Analyze low feedback scores
    const feedbackMap = this.createFeedbackMap(feedback);
    const lowScoreLogs = logs.filter(l => {
      const fb = feedbackMap.get(l.id);
      return fb && fb.some(f => (f.rating && f.rating <= 2) || (f.qualityScore && f.qualityScore < 50));
    });

    if (lowScoreLogs.length >= this.config.minimumSampleSize) {
      const byAgent = this.groupBy(lowScoreLogs, 'agentName');

      for (const [agentName, agentLowLogs] of Object.entries(byAgent)) {
        if (agentLowLogs.length < this.config.minimumSampleSize / 2) continue;

        const commonConditions = this.findCommonConditions(agentLowLogs);

        patterns.push(this.createPattern({
          patternType: 'anti-pattern',
          patternName: `${agentName}_low_satisfaction`,
          description: `Conditions leading to low user satisfaction for ${agentName}`,
          conditions: [
            { dimension: 'agent_name', operator: 'equals', value: agentName },
            ...commonConditions,
          ],
          outcome: {
            metric: 'user_satisfaction',
            direction: 'decrease',
            magnitude: 0,
            baselineValue: 0,
            patternValue: 0,
          },
          sampleSize: agentLowLogs.length,
          confidenceLevel: 0.5,
        }));
      }
    }

    return patterns;
  }

  /**
   * Discover optimization opportunities
   */
  private async discoverOptimizationPatterns(
    logs: ExecutionLog[],
    feedback: Feedback[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Find executions that are successful but slow
    const successfulSlowLogs = logs.filter(l =>
      l.status === 'success' && l.durationMs > 10000 // > 10 seconds
    );

    const byAgent = this.groupBy(successfulSlowLogs, 'agentName');

    for (const [agentName, agentSlowLogs] of Object.entries(byAgent)) {
      if (agentSlowLogs.length < this.config.minimumSampleSize / 2) continue;

      // Find what these slow executions have in common
      const commonConditions = this.findCommonConditions(agentSlowLogs);

      // Find fast executions for comparison
      const fastLogs = logs.filter(l =>
        l.agentName === agentName && l.status === 'success' && l.durationMs < 3000
      );

      if (fastLogs.length > 0) {
        const avgSlowDuration = agentSlowLogs.reduce((s, l) => s + l.durationMs, 0) / agentSlowLogs.length;
        const avgFastDuration = fastLogs.reduce((s, l) => s + l.durationMs, 0) / fastLogs.length;

        patterns.push(this.createPattern({
          patternType: 'optimization-pattern',
          patternName: `${agentName}_slow_execution`,
          description: `Slow executions (${(avgSlowDuration / 1000).toFixed(1)}s avg) could be optimized to match fast ones (${(avgFastDuration / 1000).toFixed(1)}s)`,
          conditions: [
            { dimension: 'agent_name', operator: 'equals', value: agentName },
            ...commonConditions,
          ],
          outcome: {
            metric: 'duration_ms',
            direction: 'decrease',
            magnitude: avgSlowDuration - avgFastDuration,
            baselineValue: avgSlowDuration,
            patternValue: avgFastDuration,
          },
          sampleSize: agentSlowLogs.length,
          confidenceLevel: this.calculateConfidence(agentSlowLogs.length, 0.8),
        }));
      }
    }

    // Find high token usage that could be optimized
    const avgTokens = logs.reduce((s, l) => s + l.tokenCount.total, 0) / logs.length;
    const highTokenLogs = logs.filter(l => l.tokenCount.total > avgTokens * 2);

    if (highTokenLogs.length >= this.config.minimumSampleSize) {
      const byAgent2 = this.groupBy(highTokenLogs, 'agentName');

      for (const [agentName, agentHighTokenLogs] of Object.entries(byAgent2)) {
        if (agentHighTokenLogs.length < this.config.minimumSampleSize / 2) continue;

        const avgHighTokens = agentHighTokenLogs.reduce((s, l) => s + l.tokenCount.total, 0) / agentHighTokenLogs.length;
        const normalLogs = logs.filter(l => l.agentName === agentName && l.tokenCount.total < avgTokens * 1.5);
        const avgNormalTokens = normalLogs.length > 0
          ? normalLogs.reduce((s, l) => s + l.tokenCount.total, 0) / normalLogs.length
          : avgTokens;

        patterns.push(this.createPattern({
          patternType: 'optimization-pattern',
          patternName: `${agentName}_high_tokens`,
          description: `High token usage (${avgHighTokens.toFixed(0)} avg) could be reduced to ${avgNormalTokens.toFixed(0)}`,
          conditions: [
            { dimension: 'agent_name', operator: 'equals', value: agentName },
          ],
          outcome: {
            metric: 'token_count',
            direction: 'decrease',
            magnitude: avgHighTokens - avgNormalTokens,
            baselineValue: avgHighTokens,
            patternValue: avgNormalTokens,
          },
          sampleSize: agentHighTokenLogs.length,
          confidenceLevel: 0.6,
        }));
      }
    }

    return patterns;
  }

  // ============================================================================
  // PATTERN VALIDATION
  // ============================================================================

  /**
   * Validate a pattern using statistical tests
   */
  private validatePattern(
    pattern: Pattern,
    logs: ExecutionLog[],
    feedback: Feedback[]
  ): boolean {
    // Check minimum sample size
    if (pattern.sampleSize < this.config.minimumSampleSize) {
      return false;
    }

    // Check confidence threshold
    if (pattern.confidenceLevel < this.config.confidenceThreshold) {
      return false;
    }

    // Perform chi-square test for significance
    const pValue = this.calculatePValue(pattern, logs, feedback);
    pattern.statisticalSignificance = pValue;

    if (pValue > this.config.significanceLevel) {
      return false; // Not statistically significant
    }

    // Calculate effect size
    pattern.effectSize = this.calculateEffectSize(pattern);

    // Effect size should be meaningful
    if (Math.abs(pattern.effectSize) < 0.2) {
      return false; // Effect too small to be meaningful
    }

    return true;
  }

  // ============================================================================
  // STATISTICAL HELPERS
  // ============================================================================

  private calculateConfidence(sampleSize: number, successRate: number): number {
    // Wilson score interval for binomial proportions
    const z = 1.96; // 95% confidence
    const n = sampleSize;
    const p = successRate;

    const denominator = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denominator;
    const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denominator;

    // Confidence is 1 - width of interval
    return Math.min(1, Math.max(0, 1 - margin * 2));
  }

  private calculatePValue(
    pattern: Pattern,
    logs: ExecutionLog[],
    _feedback: Feedback[]
  ): number {
    // Simplified chi-square approximation
    // In production, use a proper stats library

    const matchingLogs = this.filterLogsByConditions(logs, pattern.conditions);
    const nonMatchingLogs = logs.filter(l => !matchingLogs.includes(l));

    const observed = pattern.outcome.patternValue;
    const expected = pattern.outcome.baselineValue;

    if (expected === 0) return 1;

    const chiSquare = Math.pow(observed - expected, 2) / expected;

    // Approximate p-value from chi-square with 1 degree of freedom
    // This is a rough approximation - use proper stats library in production
    const pValue = Math.exp(-chiSquare / 2);

    return pValue;
  }

  private calculateEffectSize(pattern: Pattern): number {
    // Cohen's d for effect size
    const diff = pattern.outcome.patternValue - pattern.outcome.baselineValue;
    const pooledStdDev = Math.abs(pattern.outcome.baselineValue) * 0.5 || 1;

    return diff / pooledStdDev;
  }

  private calculateBaselineSuccessRate(
    logs: ExecutionLog[],
    feedbackMap: Map<string, Feedback[]>
  ): number {
    const successCount = logs.filter(l => l.status === 'success').length;
    return logs.length > 0 ? successCount / logs.length : 0;
  }

  // ============================================================================
  // ANALYSIS HELPERS
  // ============================================================================

  private analyzeToolCombinations(
    logs: ExecutionLog[],
    feedbackMap: Map<string, Feedback[]>
  ): Array<{ tools: string[]; successRate: number; sampleSize: number }> {
    const combinations = new Map<string, { success: number; total: number }>();

    for (const log of logs) {
      const tools = log.toolsUsed.map(t => t.toolName).sort();
      const key = tools.join(',');

      if (!combinations.has(key)) {
        combinations.set(key, { success: 0, total: 0 });
      }

      const combo = combinations.get(key)!;
      combo.total++;

      // Check if this was a successful execution with good feedback
      const fb = feedbackMap.get(log.id) || [];
      const hasGoodFeedback = fb.some(f =>
        (f.rating && f.rating >= 4) || (f.approvalDecision === 'approved')
      );

      if (log.status === 'success' && (hasGoodFeedback || fb.length === 0)) {
        combo.success++;
      }
    }

    return Array.from(combinations.entries())
      .map(([key, data]) => ({
        tools: key.split(',').filter(t => t),
        successRate: data.total > 0 ? data.success / data.total : 0,
        sampleSize: data.total,
      }))
      .filter(c => c.tools.length > 0);
  }

  private analyzeContextFactors(
    successLogs: ExecutionLog[],
    allLogs: ExecutionLog[],
    feedbackMap: Map<string, Feedback[]>
  ): Array<{ factor: string; value: unknown; improvement: number; baseline: number; patternRate: number; sampleSize: number }> {
    const results: Array<{ factor: string; value: unknown; improvement: number; baseline: number; patternRate: number; sampleSize: number }> = [];

    // Extract all context factors
    const factorValues = new Map<string, Map<string, ExecutionLog[]>>();

    for (const log of allLogs) {
      for (const factor of log.contextFactors) {
        const factorName = factor.name;
        const valueKey = JSON.stringify(factor.value);

        if (!factorValues.has(factorName)) {
          factorValues.set(factorName, new Map());
        }

        if (!factorValues.get(factorName)!.has(valueKey)) {
          factorValues.get(factorName)!.set(valueKey, []);
        }

        factorValues.get(factorName)!.get(valueKey)!.push(log);
      }
    }

    const baseline = successLogs.length / allLogs.length;

    // Find factors that correlate with success
    for (const [factorName, values] of factorValues) {
      for (const [valueKey, logs] of values) {
        if (logs.length < this.config.minimumSampleSize / 2) continue;

        const successCount = logs.filter(l =>
          successLogs.some(s => s.id === l.id)
        ).length;
        const patternRate = successCount / logs.length;

        if (patternRate > baseline + 0.1) {
          results.push({
            factor: factorName,
            value: JSON.parse(valueKey),
            improvement: patternRate - baseline,
            baseline,
            patternRate,
            sampleSize: logs.length,
          });
        }
      }
    }

    return results;
  }

  private findCommonConditions(logs: ExecutionLog[]): PatternCondition[] {
    const conditions: PatternCondition[] = [];

    // Find common action types
    const actionTypes = this.groupBy(logs, 'actionType');
    const dominantActionType = Object.entries(actionTypes)
      .sort((a, b) => b[1].length - a[1].length)[0];

    if (dominantActionType && dominantActionType[1].length > logs.length * 0.7) {
      conditions.push({
        dimension: 'action_type',
        operator: 'equals',
        value: dominantActionType[0],
      });
    }

    // Find common tools
    const toolCounts = new Map<string, number>();
    for (const log of logs) {
      for (const tool of log.toolsUsed) {
        toolCounts.set(tool.toolName, (toolCounts.get(tool.toolName) || 0) + 1);
      }
    }

    for (const [tool, count] of toolCounts) {
      if (count > logs.length * 0.7) {
        conditions.push({
          dimension: 'tools_used',
          operator: 'contains',
          value: tool,
        });
      }
    }

    return conditions;
  }

  private filterLogsByConditions(logs: ExecutionLog[], conditions: PatternCondition[]): ExecutionLog[] {
    return logs.filter(log => {
      for (const condition of conditions) {
        const value = this.getLogValue(log, condition.dimension);

        switch (condition.operator) {
          case 'equals':
            if (value !== condition.value) return false;
            break;
          case 'contains':
            if (!Array.isArray(value) || !value.includes(condition.value)) return false;
            break;
          case 'greater':
            if (typeof value !== 'number' || value <= (condition.value as number)) return false;
            break;
          case 'less':
            if (typeof value !== 'number' || value >= (condition.value as number)) return false;
            break;
          case 'in':
            if (!Array.isArray(condition.value) || !condition.value.includes(value)) return false;
            break;
        }
      }
      return true;
    });
  }

  private getLogValue(log: ExecutionLog, dimension: string): unknown {
    const parts = dimension.split('.');
    let value: unknown = log;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
    return items.reduce((groups, item) => {
      const value = String(item[key] || 'unknown');
      if (!groups[value]) groups[value] = [];
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private createFeedbackMap(feedback: Feedback[]): Map<string, Feedback[]> {
    const map = new Map<string, Feedback[]>();
    for (const f of feedback) {
      if (!map.has(f.executionLogId)) {
        map.set(f.executionLogId, []);
      }
      map.get(f.executionLogId)!.push(f);
    }
    return map;
  }

  private createPattern(params: {
    patternType: PatternType;
    patternName: string;
    description: string;
    conditions: PatternCondition[];
    outcome: PatternOutcome;
    sampleSize: number;
    confidenceLevel: number;
    scope?: PatternScope;
  }): Pattern {
    const pattern: Pattern = {
      id: uuid(),
      createdAt: new Date(),
      updatedAt: new Date(),
      patternType: params.patternType,
      patternName: params.patternName,
      description: params.description,
      sampleSize: params.sampleSize,
      confidenceLevel: params.confidenceLevel,
      statisticalSignificance: 0,
      effectSize: 0,
      conditions: params.conditions,
      outcome: params.outcome,
      scope: params.scope || { global: false },
      status: 'candidate',
    };

    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Get all discovered patterns
   */
  getPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get validated patterns
   */
  getValidatedPatterns(): Pattern[] {
    return Array.from(this.patterns.values()).filter(p => p.status === 'validated');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let analyzerInstance: PatternAnalyzer | null = null;

export function getPatternAnalyzer(config?: Partial<PatternAnalyzerConfig>): PatternAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new PatternAnalyzer(config);
  }
  return analyzerInstance;
}

export function createPatternAnalyzer(config?: Partial<PatternAnalyzerConfig>): PatternAnalyzer {
  return new PatternAnalyzer(config);
}
