/**
 * Alabobai Self-Annealing System - Cross-Company Learning
 *
 * Enables learning from aggregate patterns across all companies
 * while maintaining strict privacy through anonymization.
 */

import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import type {
  AggregateInsight,
  InsightType,
  AggregateStatistics,
  Recommendation,
  Benchmark,
  Pattern,
  ExecutionLog,
  Feedback,
  PerformanceMetrics,
} from './types.js';

// ============================================================================
// CROSS-COMPANY LEARNING ENGINE
// ============================================================================

export interface CrossCompanyLearningConfig {
  minimumCompaniesForAggregation: number;  // k-anonymity threshold
  aggregationIntervalHours: number;
  industryCategories: string[];
  enableBenchmarking: boolean;
  piiScrubLevel: 'basic' | 'strict' | 'paranoid';
}

const DEFAULT_CONFIG: CrossCompanyLearningConfig = {
  minimumCompaniesForAggregation: 5,
  aggregationIntervalHours: 24,
  industryCategories: [
    'technology',
    'finance',
    'healthcare',
    'retail',
    'manufacturing',
    'services',
    'education',
    'government',
    'other',
  ],
  enableBenchmarking: true,
  piiScrubLevel: 'strict',
};

export class CrossCompanyLearningEngine extends EventEmitter {
  private config: CrossCompanyLearningConfig;
  private anonymizationSalts: Map<string, string> = new Map();
  private insights: Map<string, AggregateInsight> = new Map();

  // Data accessors
  private getCompanyPatterns: ((companyId: string) => Promise<Pattern[]>) | null = null;
  private getCompanyMetrics: ((companyId: string) => Promise<PerformanceMetrics[]>) | null = null;
  private getCompanyIndustry: ((companyId: string) => Promise<string>) | null = null;
  private persistInsight: ((insight: AggregateInsight) => Promise<void>) | null = null;

  constructor(config: Partial<CrossCompanyLearningConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set data accessors
   */
  setDataAccessors(accessors: {
    getCompanyPatterns: (companyId: string) => Promise<Pattern[]>;
    getCompanyMetrics: (companyId: string) => Promise<PerformanceMetrics[]>;
    getCompanyIndustry: (companyId: string) => Promise<string>;
    persistInsight: (insight: AggregateInsight) => Promise<void>;
  }): void {
    this.getCompanyPatterns = accessors.getCompanyPatterns;
    this.getCompanyMetrics = accessors.getCompanyMetrics;
    this.getCompanyIndustry = accessors.getCompanyIndustry;
    this.persistInsight = accessors.persistInsight;
  }

  // ============================================================================
  // ANONYMIZATION
  // ============================================================================

  /**
   * Anonymize a company ID with consistent hashing
   */
  anonymizeCompanyId(companyId: string): string {
    let salt = this.anonymizationSalts.get(companyId);
    if (!salt) {
      salt = uuid();
      this.anonymizationSalts.set(companyId, salt);
    }

    return createHash('sha256')
      .update(companyId + salt)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Anonymize execution log for cross-company analysis
   */
  anonymizeExecutionLog(log: ExecutionLog): Record<string, unknown> {
    return {
      // Anonymized identifiers
      anonymousCompanyId: this.anonymizeCompanyId(log.companyId),
      // No session, user, or task IDs

      // Preserved operational data
      agentName: log.agentName,
      actionType: log.actionType,
      actionName: this.generalizeActionName(log.actionName),

      // Metrics only
      durationMs: log.durationMs,
      tokenCount: log.tokenCount,
      status: log.status,
      errorType: log.errorType ? this.generalizeErrorType(log.errorType) : null,

      // Generalized tool usage
      toolsUsed: log.toolsUsed.map(t => ({
        toolName: t.toolName,
        invocationCount: t.invocationCount,
        successCount: t.successCount,
        totalDurationMs: t.totalDurationMs,
        // No parameters
      })),

      // Generalized context
      contextFactorTypes: log.contextFactors.map(c => c.name),

      // Time bucket (hourly, not exact)
      timeBucket: this.getTimeBucket(log.timestamp),
    };
  }

  /**
   * Anonymize feedback for cross-company analysis
   */
  anonymizeFeedback(feedback: Feedback): Record<string, unknown> {
    return {
      // Anonymized identifiers
      anonymousCompanyId: this.anonymizeCompanyId(feedback.companyId),

      // Feedback type and scores
      feedbackType: feedback.feedbackType,
      rating: feedback.rating,
      sentiment: feedback.sentiment,
      approvalDecision: feedback.approvalDecision,
      qualityScore: feedback.qualityScore,

      // Generalized modification info
      hasModifications: (feedback.modificationsApplied?.length || 0) > 0,
      modificationCount: feedback.modificationsApplied?.length || 0,
      majorModifications: feedback.modificationsApplied?.filter(
        m => m.modificationSize === 'major'
      ).length || 0,

      // Implicit signals (no context)
      implicitSignalTypes: feedback.implicitSignals.map(s => s.signalType),

      // Time bucket
      timeBucket: this.getTimeBucket(feedback.timestamp),
    };
  }

  /**
   * Scrub any remaining PII from data
   */
  private scrubPII(data: Record<string, unknown>): Record<string, unknown> {
    const scrubbed = { ...data };

    if (this.config.piiScrubLevel === 'basic' || this.config.piiScrubLevel === 'strict' || this.config.piiScrubLevel === 'paranoid') {
      // Remove any string that looks like an email
      for (const [key, value] of Object.entries(scrubbed)) {
        if (typeof value === 'string') {
          if (value.includes('@') || value.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/)) {
            delete scrubbed[key];
          }
        }
      }
    }

    if (this.config.piiScrubLevel === 'strict' || this.config.piiScrubLevel === 'paranoid') {
      // Remove any free-text fields
      delete scrubbed.comment;
      delete scrubbed.description;
      delete scrubbed.errorMessage;
    }

    if (this.config.piiScrubLevel === 'paranoid') {
      // Only keep enumerated values and numbers
      for (const [key, value] of Object.entries(scrubbed)) {
        if (typeof value === 'string' && value.length > 50) {
          delete scrubbed[key];
        }
      }
    }

    return scrubbed;
  }

  // ============================================================================
  // AGGREGATE PATTERN EXTRACTION
  // ============================================================================

  /**
   * Generate aggregate insights from cross-company data
   */
  async generateAggregateInsights(
    companyIds: string[]
  ): Promise<AggregateInsight[]> {
    if (companyIds.length < this.config.minimumCompaniesForAggregation) {
      throw new Error(
        `Need at least ${this.config.minimumCompaniesForAggregation} companies for aggregation, got ${companyIds.length}`
      );
    }

    if (!this.getCompanyPatterns || !this.getCompanyMetrics || !this.getCompanyIndustry) {
      throw new Error('Data accessors not configured');
    }

    const insights: AggregateInsight[] = [];

    // Collect all patterns
    const allPatterns: Pattern[] = [];
    const industryPatterns: Map<string, Pattern[]> = new Map();

    for (const companyId of companyIds) {
      const patterns = await this.getCompanyPatterns(companyId);
      const industry = await this.getCompanyIndustry(companyId);

      allPatterns.push(...patterns);

      if (!industryPatterns.has(industry)) {
        industryPatterns.set(industry, []);
      }
      industryPatterns.get(industry)!.push(...patterns);
    }

    // Find common success patterns
    const successPatterns = allPatterns.filter(p => p.patternType === 'success-pattern');
    const commonSuccessPatterns = this.findCommonPatterns(successPatterns, companyIds.length);

    for (const pattern of commonSuccessPatterns) {
      insights.push(await this.createInsight({
        insightType: 'best-practice',
        name: `Best Practice: ${pattern.patternName}`,
        description: pattern.description,
        companyCount: pattern.companyCount,
        executionCount: pattern.sampleSize,
        recommendations: [
          {
            priority: 'high',
            action: `Implement ${pattern.patternName} pattern`,
            expectedImprovement: pattern.outcome.magnitude,
            confidence: pattern.confidenceLevel,
            applicableWhen: pattern.conditions,
          },
        ],
      }));
    }

    // Find common failure patterns
    const failurePatterns = allPatterns.filter(p => p.patternType === 'failure-pattern');
    const commonFailures = this.findCommonPatterns(failurePatterns, companyIds.length);

    for (const pattern of commonFailures) {
      insights.push(await this.createInsight({
        insightType: 'common-failure',
        name: `Common Issue: ${pattern.patternName}`,
        description: pattern.description,
        companyCount: pattern.companyCount,
        executionCount: pattern.sampleSize,
        recommendations: [
          {
            priority: 'high',
            action: `Avoid ${pattern.patternName} conditions`,
            expectedImprovement: Math.abs(pattern.outcome.magnitude),
            confidence: pattern.confidenceLevel,
            applicableWhen: pattern.conditions,
          },
        ],
      }));
    }

    // Generate industry-specific insights
    for (const [industry, patterns] of industryPatterns) {
      if (patterns.length >= this.config.minimumCompaniesForAggregation) {
        const industrySuccess = patterns.filter(p => p.patternType === 'success-pattern');
        const bestPractice = this.findBestPattern(industrySuccess);

        if (bestPractice) {
          insights.push(await this.createInsight({
            insightType: 'industry-pattern',
            name: `${industry} Best Practice: ${bestPractice.patternName}`,
            description: `Top performing pattern in ${industry} industry`,
            companyCount: patterns.length,
            executionCount: bestPractice.sampleSize,
            recommendations: [
              {
                priority: 'medium',
                action: bestPractice.description,
                expectedImprovement: bestPractice.outcome.magnitude,
                confidence: bestPractice.confidenceLevel,
                applicableWhen: [
                  { dimension: 'industry', operator: 'equals', value: industry },
                  ...bestPractice.conditions,
                ],
              },
            ],
          }));
        }
      }
    }

    // Persist insights
    if (this.persistInsight) {
      for (const insight of insights) {
        await this.persistInsight(insight);
      }
    }

    this.emit('insights-generated', { count: insights.length });
    return insights;
  }

  // ============================================================================
  // BENCHMARKING
  // ============================================================================

  /**
   * Generate benchmarks from cross-company metrics
   */
  async generateBenchmarks(
    companyIds: string[]
  ): Promise<Map<string, Benchmark>> {
    if (!this.config.enableBenchmarking) {
      return new Map();
    }

    if (companyIds.length < this.config.minimumCompaniesForAggregation) {
      throw new Error('Not enough companies for benchmarking');
    }

    if (!this.getCompanyMetrics || !this.getCompanyIndustry) {
      throw new Error('Data accessors not configured');
    }

    const benchmarks = new Map<string, Benchmark>();
    const metricsByIndustry: Map<string, Map<string, number[]>> = new Map();

    // Collect metrics by industry
    for (const companyId of companyIds) {
      const metrics = await this.getCompanyMetrics(companyId);
      const industry = await this.getCompanyIndustry(companyId);

      if (!metricsByIndustry.has(industry)) {
        metricsByIndustry.set(industry, new Map());
      }

      const industryMetrics = metricsByIndustry.get(industry)!;

      for (const metric of metrics) {
        const metricKeys = [
          'success_rate:successRate',
          'approval_rate:approvalRate',
          'avg_latency:averageLatencyMs',
          'avg_quality:averageQualityScore',
          'avg_rating:averageUserRating',
        ];

        for (const keyPair of metricKeys) {
          const [benchKey, metricKey] = keyPair.split(':');
          const value = (metric as any)[metricKey];
          if (value !== undefined && value !== null) {
            if (!industryMetrics.has(benchKey)) {
              industryMetrics.set(benchKey, []);
            }
            industryMetrics.get(benchKey)!.push(value);
          }
        }
      }
    }

    // Calculate benchmarks
    for (const [industry, metrics] of metricsByIndustry) {
      for (const [metricName, values] of metrics) {
        if (values.length < this.config.minimumCompaniesForAggregation) continue;

        values.sort((a, b) => a - b);

        const benchmark: Benchmark = {
          metric: metricName,
          industryAverage: values.reduce((s, v) => s + v, 0) / values.length,
          topQuartile: values[Math.floor(values.length * 0.75)],
          topDecile: values[Math.floor(values.length * 0.9)],
        };

        benchmarks.set(`${industry}:${metricName}`, benchmark);
      }
    }

    return benchmarks;
  }

  /**
   * Compare company metrics against benchmarks
   */
  async compareAgainstBenchmarks(
    companyId: string,
    benchmarks: Map<string, Benchmark>
  ): Promise<{
    metric: string;
    companyValue: number;
    industryAverage: number;
    percentile: number;
    recommendation?: string;
  }[]> {
    if (!this.getCompanyMetrics || !this.getCompanyIndustry) {
      throw new Error('Data accessors not configured');
    }

    const metrics = await this.getCompanyMetrics(companyId);
    const industry = await this.getCompanyIndustry(companyId);
    const comparisons: any[] = [];

    // Get latest metrics
    const latestMetrics = metrics.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    )[0];

    if (!latestMetrics) return comparisons;

    const metricMappings: [string, keyof PerformanceMetrics][] = [
      ['success_rate', 'successRate'],
      ['approval_rate', 'approvalRate'],
      ['avg_latency', 'averageLatencyMs'],
      ['avg_quality', 'averageQualityScore'],
      ['avg_rating', 'averageUserRating'],
    ];

    for (const [benchKey, metricKey] of metricMappings) {
      const benchmark = benchmarks.get(`${industry}:${benchKey}`);
      const companyValue = (latestMetrics as any)[metricKey];

      if (!benchmark || companyValue === undefined) continue;

      // Estimate percentile
      let percentile: number;
      if (companyValue >= benchmark.topDecile) {
        percentile = 90 + (companyValue - benchmark.topDecile) /
          (benchmark.topDecile - benchmark.topQuartile) * 10;
      } else if (companyValue >= benchmark.topQuartile) {
        percentile = 75 + (companyValue - benchmark.topQuartile) /
          (benchmark.topDecile - benchmark.topQuartile) * 15;
      } else if (companyValue >= benchmark.industryAverage) {
        percentile = 50 + (companyValue - benchmark.industryAverage) /
          (benchmark.topQuartile - benchmark.industryAverage) * 25;
      } else {
        percentile = companyValue / benchmark.industryAverage * 50;
      }

      percentile = Math.max(0, Math.min(100, percentile));

      let recommendation: string | undefined;
      if (percentile < 25) {
        recommendation = `${benchKey} is significantly below industry average. Consider reviewing agent configurations.`;
      } else if (percentile < 50) {
        recommendation = `${benchKey} is below industry average. Look for optimization opportunities.`;
      }

      comparisons.push({
        metric: benchKey,
        companyValue,
        industryAverage: benchmark.industryAverage,
        percentile: Math.round(percentile),
        recommendation,
      });
    }

    return comparisons;
  }

  // ============================================================================
  // INSIGHT GENERATION
  // ============================================================================

  /**
   * Generate performance trend insight
   */
  async generatePerformanceTrendInsight(
    allMetrics: PerformanceMetrics[]
  ): Promise<AggregateInsight | null> {
    if (allMetrics.length < this.config.minimumCompaniesForAggregation) {
      return null;
    }

    // Group by time period
    const byPeriod = new Map<string, number[]>();

    for (const metric of allMetrics) {
      const period = this.getTimeBucket(metric.timestamp);
      if (!byPeriod.has(period)) {
        byPeriod.set(period, []);
      }
      byPeriod.get(period)!.push(metric.successRate);
    }

    // Calculate trend
    const periods = Array.from(byPeriod.keys()).sort();
    if (periods.length < 2) return null;

    const firstPeriodAvg = byPeriod.get(periods[0])!.reduce((s, v) => s + v, 0) /
      byPeriod.get(periods[0])!.length;
    const lastPeriodAvg = byPeriod.get(periods[periods.length - 1])!.reduce((s, v) => s + v, 0) /
      byPeriod.get(periods[periods.length - 1])!.length;

    const trend = lastPeriodAvg - firstPeriodAvg;

    return this.createInsight({
      insightType: 'performance-trend',
      name: `Platform Success Rate ${trend >= 0 ? 'Improving' : 'Declining'}`,
      description: `Success rate changed by ${(trend * 100).toFixed(1)}% over the analysis period`,
      companyCount: allMetrics.length,
      executionCount: allMetrics.reduce((s, m) => s + m.executionCount, 0),
      statistics: {
        mean: lastPeriodAvg,
        median: this.calculateMedian(byPeriod.get(periods[periods.length - 1])!),
        standardDeviation: this.calculateStdDev(byPeriod.get(periods[periods.length - 1])!),
        percentile25: 0,
        percentile75: 0,
        percentile90: 0,
        percentile99: 0,
        min: Math.min(...byPeriod.get(periods[periods.length - 1])!),
        max: Math.max(...byPeriod.get(periods[periods.length - 1])!),
        count: byPeriod.get(periods[periods.length - 1])!.length,
      },
      recommendations: trend < 0 ? [
        {
          priority: 'high',
          action: 'Review recent changes and patterns for regression',
          expectedImprovement: Math.abs(trend),
          confidence: 0.7,
          applicableWhen: [],
        },
      ] : [],
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private generalizeActionName(actionName: string): string {
    // Remove company-specific parts
    return actionName
      .replace(/[A-Za-z0-9]{8,}/g, 'ID')  // Replace long alphanumeric strings
      .replace(/\d+/g, 'N')                // Replace numbers
      .toLowerCase()
      .trim();
  }

  private generalizeErrorType(errorType: string): string {
    // Generalize to common categories
    const errorLower = errorType.toLowerCase();

    if (errorLower.includes('timeout')) return 'TIMEOUT';
    if (errorLower.includes('network') || errorLower.includes('connection')) return 'NETWORK';
    if (errorLower.includes('auth') || errorLower.includes('permission')) return 'AUTH';
    if (errorLower.includes('validation') || errorLower.includes('invalid')) return 'VALIDATION';
    if (errorLower.includes('rate') || errorLower.includes('limit')) return 'RATE_LIMIT';

    return 'OTHER';
  }

  private getTimeBucket(timestamp: Date): string {
    // Round to hour for privacy
    const date = new Date(timestamp);
    date.setMinutes(0, 0, 0);
    return date.toISOString().slice(0, 13);
  }

  private findCommonPatterns(
    patterns: Pattern[],
    companyCount: number
  ): (Pattern & { companyCount: number })[] {
    // Group similar patterns
    const patternGroups = new Map<string, Pattern[]>();

    for (const pattern of patterns) {
      const key = pattern.patternName.split('_').slice(1).join('_'); // Remove agent prefix
      if (!patternGroups.has(key)) {
        patternGroups.set(key, []);
      }
      patternGroups.get(key)!.push(pattern);
    }

    // Filter to patterns found in multiple companies
    const commonPatterns: (Pattern & { companyCount: number })[] = [];

    for (const [key, group] of patternGroups) {
      if (group.length >= this.config.minimumCompaniesForAggregation) {
        // Merge into single pattern
        const merged = { ...group[0], companyCount: group.length };
        merged.sampleSize = group.reduce((s, p) => s + p.sampleSize, 0);
        merged.confidenceLevel = group.reduce((s, p) => s + p.confidenceLevel, 0) / group.length;
        commonPatterns.push(merged);
      }
    }

    return commonPatterns;
  }

  private findBestPattern(patterns: Pattern[]): Pattern | null {
    if (patterns.length === 0) return null;

    return patterns.reduce((best, current) => {
      const currentScore = current.confidenceLevel * current.outcome.magnitude * Math.log(current.sampleSize);
      const bestScore = best.confidenceLevel * best.outcome.magnitude * Math.log(best.sampleSize);
      return currentScore > bestScore ? current : best;
    });
  }

  private async createInsight(params: {
    insightType: InsightType;
    name: string;
    description: string;
    companyCount: number;
    executionCount: number;
    statistics?: AggregateStatistics;
    recommendations?: Recommendation[];
    benchmark?: Benchmark;
  }): Promise<AggregateInsight> {
    const insight: AggregateInsight = {
      id: uuid(),
      createdAt: new Date(),
      insightType: params.insightType,
      name: params.name,
      description: params.description,
      companyCount: params.companyCount,
      executionCount: params.executionCount,
      timeRange: {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        end: new Date(),
      },
      statistics: params.statistics || this.emptyStatistics(),
      recommendations: params.recommendations || [],
      benchmark: params.benchmark,
    };

    this.insights.set(insight.id, insight);
    return insight;
  }

  private emptyStatistics(): AggregateStatistics {
    return {
      mean: 0,
      median: 0,
      standardDeviation: 0,
      percentile25: 0,
      percentile75: 0,
      percentile90: 0,
      percentile99: 0,
      min: 0,
      max: 0,
      count: 0,
    };
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squareDiffs.reduce((s, v) => s + v, 0) / values.length);
  }

  /**
   * Get all insights
   */
  getInsights(): AggregateInsight[] {
    return Array.from(this.insights.values());
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let learningInstance: CrossCompanyLearningEngine | null = null;

export function getCrossCompanyLearning(config?: Partial<CrossCompanyLearningConfig>): CrossCompanyLearningEngine {
  if (!learningInstance) {
    learningInstance = new CrossCompanyLearningEngine(config);
  }
  return learningInstance;
}

export function createCrossCompanyLearning(config?: Partial<CrossCompanyLearningConfig>): CrossCompanyLearningEngine {
  return new CrossCompanyLearningEngine(config);
}
