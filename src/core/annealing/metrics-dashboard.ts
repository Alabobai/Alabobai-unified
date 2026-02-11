/**
 * Alabobai Self-Annealing System - Metrics Dashboard
 *
 * Provides performance monitoring, alerting, and A/B testing framework.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  PerformanceMetrics,
  MetricScope,
  ABTest,
  ABTestStatus,
  TestVariant,
  ABTestResults,
  Adaptation,
} from './types.js';

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

export interface MetricsCollectorConfig {
  aggregationIntervals: ('minute' | 'hour' | 'day' | 'week' | 'month')[];
  alertThresholds: AlertThreshold[];
  retentionDays: Record<string, number>;
}

export interface AlertThreshold {
  metric: string;
  condition: 'above' | 'below' | 'change';
  threshold: number;
  severity: 'warning' | 'critical';
  windowMinutes: number;
  notifyChannels: string[];
}

const DEFAULT_CONFIG: MetricsCollectorConfig = {
  aggregationIntervals: ['minute', 'hour', 'day'],
  alertThresholds: [
    {
      metric: 'success_rate',
      condition: 'below',
      threshold: 0.9,
      severity: 'warning',
      windowMinutes: 15,
      notifyChannels: ['slack'],
    },
    {
      metric: 'success_rate',
      condition: 'below',
      threshold: 0.8,
      severity: 'critical',
      windowMinutes: 5,
      notifyChannels: ['slack', 'pagerduty'],
    },
    {
      metric: 'p95_latency_ms',
      condition: 'above',
      threshold: 30000,
      severity: 'warning',
      windowMinutes: 10,
      notifyChannels: ['slack'],
    },
    {
      metric: 'error_rate',
      condition: 'above',
      threshold: 0.1,
      severity: 'critical',
      windowMinutes: 5,
      notifyChannels: ['slack', 'pagerduty'],
    },
  ],
  retentionDays: {
    minute: 1,
    hour: 7,
    day: 365,
    week: 730,
    month: 9999,
  },
};

export class MetricsCollector extends EventEmitter {
  private config: MetricsCollectorConfig;
  private metricsBuffer: Map<string, number[]> = new Map();
  private alertStates: Map<string, { triggeredAt: Date; acknowledged: boolean }> = new Map();
  private persistMetrics: ((metrics: PerformanceMetrics) => Promise<void>) | null = null;

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set persistence function
   */
  setPersistFunction(fn: (metrics: PerformanceMetrics) => Promise<void>): void {
    this.persistMetrics = fn;
  }

  /**
   * Record a metric value
   */
  recordMetric(
    scope: MetricScope,
    metricName: string,
    value: number
  ): void {
    const key = this.getScopeKey(scope) + ':' + metricName;

    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, []);
    }

    this.metricsBuffer.get(key)!.push(value);

    // Check alert thresholds
    this.checkAlerts(metricName, value, scope);
  }

  /**
   * Record execution completion
   */
  recordExecution(params: {
    scope: MetricScope;
    success: boolean;
    approved?: boolean;
    latencyMs: number;
    tokenCount: number;
    toolCalls: number;
    qualityScore?: number;
    userRating?: number;
    modified?: boolean;
  }): void {
    const { scope } = params;

    this.recordMetric(scope, 'execution_count', 1);
    this.recordMetric(scope, 'success', params.success ? 1 : 0);
    if (params.approved !== undefined) {
      this.recordMetric(scope, 'approval', params.approved ? 1 : 0);
    }
    this.recordMetric(scope, 'latency_ms', params.latencyMs);
    this.recordMetric(scope, 'token_count', params.tokenCount);
    this.recordMetric(scope, 'tool_calls', params.toolCalls);
    if (params.qualityScore !== undefined) {
      this.recordMetric(scope, 'quality_score', params.qualityScore);
    }
    if (params.userRating !== undefined) {
      this.recordMetric(scope, 'user_rating', params.userRating);
    }
    if (params.modified !== undefined) {
      this.recordMetric(scope, 'modification', params.modified ? 1 : 0);
    }
  }

  /**
   * Aggregate buffered metrics and persist
   */
  async aggregateAndPersist(
    granularity: 'minute' | 'hour' | 'day' | 'week' | 'month'
  ): Promise<PerformanceMetrics[]> {
    const aggregatedMetrics: PerformanceMetrics[] = [];
    const scopeMetrics = new Map<string, Map<string, number[]>>();

    // Group by scope
    for (const [key, values] of this.metricsBuffer) {
      const [scopeKey, metricName] = key.split(':');

      if (!scopeMetrics.has(scopeKey)) {
        scopeMetrics.set(scopeKey, new Map());
      }

      scopeMetrics.get(scopeKey)!.set(metricName, values);
    }

    // Aggregate each scope
    for (const [scopeKey, metrics] of scopeMetrics) {
      const scope = this.parseScopeKey(scopeKey);

      const executionCounts = metrics.get('execution_count') || [];
      const successValues = metrics.get('success') || [];
      const approvalValues = metrics.get('approval') || [];
      const latencyValues = metrics.get('latency_ms') || [];
      const qualityValues = metrics.get('quality_score') || [];
      const ratingValues = metrics.get('user_rating') || [];
      const modificationValues = metrics.get('modification') || [];
      const tokenValues = metrics.get('token_count') || [];
      const toolCallValues = metrics.get('tool_calls') || [];

      const performanceMetrics: PerformanceMetrics = {
        id: uuid(),
        timestamp: new Date(),
        granularity,
        scope,

        // Core metrics
        executionCount: executionCounts.reduce((s, v) => s + v, 0),
        successRate: this.average(successValues),
        approvalRate: this.average(approvalValues),

        // Speed metrics
        averageLatencyMs: this.average(latencyValues),
        p50LatencyMs: this.percentile(latencyValues, 50),
        p95LatencyMs: this.percentile(latencyValues, 95),
        p99LatencyMs: this.percentile(latencyValues, 99),

        // Quality metrics
        averageQualityScore: this.average(qualityValues),
        averageUserRating: this.average(ratingValues),
        modificationRate: this.average(modificationValues),

        // Efficiency metrics
        averageTokenCount: this.average(tokenValues),
        averageToolCalls: this.average(toolCallValues),
        costPerExecution: this.average(tokenValues) * 0.00001, // Rough estimate

        // Learning metrics (placeholder - would be populated by annealing system)
        adaptationCount: 0,
        patternDiscoveryRate: 0,
        improvementRate: 0,
      };

      aggregatedMetrics.push(performanceMetrics);

      if (this.persistMetrics) {
        await this.persistMetrics(performanceMetrics);
      }
    }

    // Clear buffer
    this.metricsBuffer.clear();

    return aggregatedMetrics;
  }

  // ============================================================================
  // ALERTING
  // ============================================================================

  private checkAlerts(metricName: string, value: number, scope: MetricScope): void {
    for (const threshold of this.config.alertThresholds) {
      if (threshold.metric !== metricName) continue;

      let triggered = false;

      switch (threshold.condition) {
        case 'above':
          triggered = value > threshold.threshold;
          break;
        case 'below':
          triggered = value < threshold.threshold;
          break;
        case 'change':
          // Would need historical data
          break;
      }

      if (triggered) {
        const alertKey = `${metricName}:${threshold.severity}:${this.getScopeKey(scope)}`;
        const existingAlert = this.alertStates.get(alertKey);

        if (!existingAlert) {
          this.alertStates.set(alertKey, {
            triggeredAt: new Date(),
            acknowledged: false,
          });

          this.emit('alert', {
            metric: metricName,
            value,
            threshold: threshold.threshold,
            condition: threshold.condition,
            severity: threshold.severity,
            scope,
            channels: threshold.notifyChannels,
          });
        }
      }
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertKey: string): void {
    const alert = this.alertStates.get(alertKey);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert-acknowledged', { alertKey });
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Array<{
    key: string;
    triggeredAt: Date;
    acknowledged: boolean;
  }> {
    return Array.from(this.alertStates.entries()).map(([key, state]) => ({
      key,
      triggeredAt: state.triggeredAt,
      acknowledged: state.acknowledged,
    }));
  }

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  /**
   * Get dashboard summary
   */
  getDashboardSummary(): Record<string, unknown> {
    const summary: Record<string, unknown> = {};

    for (const [key, values] of this.metricsBuffer) {
      const [scopeKey, metricName] = key.split(':');

      if (!summary[scopeKey]) {
        summary[scopeKey] = {};
      }

      (summary[scopeKey] as Record<string, unknown>)[metricName] = {
        count: values.length,
        avg: this.average(values),
        min: Math.min(...values),
        max: Math.max(...values),
        p95: this.percentile(values, 95),
      };
    }

    return summary;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getScopeKey(scope: MetricScope): string {
    return [
      scope.companyId || 'all',
      scope.agentId || 'all',
      scope.taskType || 'all',
      scope.industry || 'all',
    ].join('|');
  }

  private parseScopeKey(key: string): MetricScope {
    const [companyId, agentId, taskType, industry] = key.split('|');
    return {
      companyId: companyId !== 'all' ? companyId : undefined,
      agentId: agentId !== 'all' ? agentId : undefined,
      taskType: taskType !== 'all' ? taskType : undefined,
      industry: industry !== 'all' ? industry : undefined,
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// ============================================================================
// A/B TESTING FRAMEWORK
// ============================================================================

export class ABTestingFramework extends EventEmitter {
  private tests: Map<string, ABTest> = new Map();
  private exposures: Map<string, Map<string, string>> = new Map(); // testId -> userId -> variantId
  private persistTest: ((test: ABTest) => Promise<void>) | null = null;
  private recordExposure: ((testId: string, userId: string, variantId: string) => Promise<void>) | null = null;

  /**
   * Set persistence functions
   */
  setPersistFunctions(fns: {
    persistTest: (test: ABTest) => Promise<void>;
    recordExposure: (testId: string, userId: string, variantId: string) => Promise<void>;
  }): void {
    this.persistTest = fns.persistTest;
    this.recordExposure = fns.recordExposure;
  }

  /**
   * Create a new A/B test
   */
  async createTest(params: {
    name: string;
    description: string;
    hypothesis: string;
    controlVariant: Omit<TestVariant, 'sampleSize' | 'metrics'>;
    treatmentVariants: Omit<TestVariant, 'sampleSize' | 'metrics'>[];
    trafficAllocation?: Record<string, number>;
    primaryMetric: string;
    secondaryMetrics?: string[];
    minimumDetectableEffect?: number;
    requiredSampleSize?: number;
    targetingRules?: any[];
  }): Promise<ABTest> {
    const controlVariant: TestVariant = {
      ...params.controlVariant,
      sampleSize: 0,
      metrics: {},
    };

    const treatmentVariants: TestVariant[] = params.treatmentVariants.map(v => ({
      ...v,
      sampleSize: 0,
      metrics: {},
    }));

    // Default traffic allocation: equal split
    const allVariants = [controlVariant, ...treatmentVariants];
    const defaultAllocation: Record<string, number> = {};
    const share = 100 / allVariants.length;
    for (const variant of allVariants) {
      defaultAllocation[variant.id] = share;
    }

    const test: ABTest = {
      id: uuid(),
      name: params.name,
      description: params.description,
      hypothesis: params.hypothesis,
      createdAt: new Date(),
      status: 'draft',
      controlVariant,
      treatmentVariants,
      trafficAllocation: params.trafficAllocation || defaultAllocation,
      targetingRules: params.targetingRules || [],
      primaryMetric: params.primaryMetric,
      secondaryMetrics: params.secondaryMetrics || [],
      minimumDetectableEffect: params.minimumDetectableEffect || 0.05,
      requiredSampleSize: params.requiredSampleSize || 1000,
    };

    this.tests.set(test.id, test);
    this.exposures.set(test.id, new Map());

    if (this.persistTest) {
      await this.persistTest(test);
    }

    return test;
  }

  /**
   * Start an A/B test
   */
  async startTest(testId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test not found: ${testId}`);

    if (test.status !== 'draft') {
      throw new Error(`Test ${testId} is not in draft status`);
    }

    test.status = 'running';
    test.startedAt = new Date();

    if (this.persistTest) {
      await this.persistTest(test);
    }

    this.emit('test-started', { testId });
  }

  /**
   * Get variant assignment for a user
   */
  async getVariantAssignment(
    testId: string,
    userId: string
  ): Promise<TestVariant | null> {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') return null;

    // Check if user is already assigned
    const testExposures = this.exposures.get(testId);
    if (testExposures?.has(userId)) {
      const variantId = testExposures.get(userId)!;
      return this.getVariantById(test, variantId);
    }

    // Check targeting rules
    // (In production, would evaluate rules against user context)

    // Assign based on traffic allocation
    const variant = this.assignVariant(test, userId);

    // Record exposure
    if (!testExposures) {
      this.exposures.set(testId, new Map());
    }
    this.exposures.get(testId)!.set(userId, variant.id);
    variant.sampleSize++;

    if (this.recordExposure) {
      await this.recordExposure(testId, userId, variant.id);
    }

    return variant;
  }

  /**
   * Record a metric for a test variant
   */
  recordMetric(
    testId: string,
    userId: string,
    metricName: string,
    value: number
  ): void {
    const test = this.tests.get(testId);
    if (!test) return;

    const variantId = this.exposures.get(testId)?.get(userId);
    if (!variantId) return;

    const variant = this.getVariantById(test, variantId);
    if (!variant) return;

    if (!variant.metrics[metricName]) {
      variant.metrics[metricName] = { value: 0, variance: 0, sampleSize: 0 };
    }

    // Update running statistics
    const metric = variant.metrics[metricName];
    const oldMean = metric.value;
    const n = ++metric.sampleSize;
    metric.value = oldMean + (value - oldMean) / n;
    if (n > 1) {
      metric.variance = metric.variance + (value - oldMean) * (value - metric.value);
    }
  }

  /**
   * Analyze test results
   */
  analyzeResults(testId: string): ABTestResults | null {
    const test = this.tests.get(testId);
    if (!test) return null;

    const allVariants = [test.controlVariant, ...test.treatmentVariants];
    const control = test.controlVariant;
    const controlMetric = control.metrics[test.primaryMetric];

    if (!controlMetric || controlMetric.sampleSize < 30) {
      return {
        conclusive: false,
        statisticalSignificance: 0,
        confidenceInterval: [0, 0],
        relativeImprovement: 0,
        analysisNotes: 'Insufficient sample size in control',
      };
    }

    // Find best performing variant
    let bestVariant: TestVariant | null = null;
    let bestImprovement = 0;
    let bestSignificance = 0;

    for (const variant of test.treatmentVariants) {
      const variantMetric = variant.metrics[test.primaryMetric];
      if (!variantMetric || variantMetric.sampleSize < 30) continue;

      const improvement = (variantMetric.value - controlMetric.value) / controlMetric.value;
      const significance = this.calculateSignificance(
        controlMetric,
        variantMetric
      );

      if (improvement > bestImprovement && significance > 0.95) {
        bestVariant = variant;
        bestImprovement = improvement;
        bestSignificance = significance;
      }
    }

    // Calculate confidence interval
    const ci = bestVariant
      ? this.calculateConfidenceInterval(
          controlMetric,
          bestVariant.metrics[test.primaryMetric]
        )
      : [0, 0] as [number, number];

    return {
      winner: bestVariant?.id,
      conclusive: bestVariant !== null && bestSignificance >= 0.95,
      statisticalSignificance: bestSignificance,
      confidenceInterval: ci,
      relativeImprovement: bestImprovement,
      analysisNotes: bestVariant
        ? `Variant "${bestVariant.name}" shows ${(bestImprovement * 100).toFixed(1)}% improvement`
        : 'No variant shows statistically significant improvement',
    };
  }

  /**
   * Complete a test
   */
  async completeTest(testId: string): Promise<ABTestResults> {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test not found: ${testId}`);

    const results = this.analyzeResults(testId);
    if (!results) throw new Error('Could not analyze results');

    test.status = 'completed';
    test.endedAt = new Date();
    test.results = results;

    if (this.persistTest) {
      await this.persistTest(test);
    }

    this.emit('test-completed', { testId, results });
    return results;
  }

  /**
   * Stop a test early
   */
  async stopTest(testId: string, reason: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test not found: ${testId}`);

    test.status = 'stopped';
    test.endedAt = new Date();
    test.results = {
      conclusive: false,
      statisticalSignificance: 0,
      confidenceInterval: [0, 0],
      relativeImprovement: 0,
      analysisNotes: `Test stopped: ${reason}`,
    };

    if (this.persistTest) {
      await this.persistTest(test);
    }

    this.emit('test-stopped', { testId, reason });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getVariantById(test: ABTest, variantId: string): TestVariant | null {
    if (test.controlVariant.id === variantId) {
      return test.controlVariant;
    }
    return test.treatmentVariants.find(v => v.id === variantId) || null;
  }

  private assignVariant(test: ABTest, userId: string): TestVariant {
    // Use consistent hashing for deterministic assignment
    const hash = this.hashString(userId + test.id);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const [variantId, allocation] of Object.entries(test.trafficAllocation)) {
      cumulative += allocation;
      if (bucket < cumulative) {
        return this.getVariantById(test, variantId) || test.controlVariant;
      }
    }

    return test.controlVariant;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private calculateSignificance(
    control: { value: number; variance: number; sampleSize: number },
    treatment: { value: number; variance: number; sampleSize: number }
  ): number {
    // Two-sample z-test
    const pooledVariance = (control.variance + treatment.variance) / 2;
    const standardError = Math.sqrt(
      pooledVariance * (1 / control.sampleSize + 1 / treatment.sampleSize)
    );

    if (standardError === 0) return 0;

    const zScore = (treatment.value - control.value) / standardError;
    // Approximate p-value to confidence
    const confidence = 1 - Math.exp(-Math.abs(zScore) / 2);

    return confidence;
  }

  private calculateConfidenceInterval(
    control: { value: number; variance: number; sampleSize: number },
    treatment: { value: number; variance: number; sampleSize: number }
  ): [number, number] {
    const diff = treatment.value - control.value;
    const pooledVariance = (control.variance + treatment.variance) / 2;
    const standardError = Math.sqrt(
      pooledVariance * (1 / control.sampleSize + 1 / treatment.sampleSize)
    );

    const z = 1.96; // 95% confidence
    return [diff - z * standardError, diff + z * standardError];
  }

  /**
   * Get all tests
   */
  getTests(): ABTest[] {
    return Array.from(this.tests.values());
  }

  /**
   * Get running tests
   */
  getRunningTests(): ABTest[] {
    return Array.from(this.tests.values()).filter(t => t.status === 'running');
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

let metricsInstance: MetricsCollector | null = null;
let abTestingInstance: ABTestingFramework | null = null;

export function getMetricsCollector(config?: Partial<MetricsCollectorConfig>): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector(config);
  }
  return metricsInstance;
}

export function getABTestingFramework(): ABTestingFramework {
  if (!abTestingInstance) {
    abTestingInstance = new ABTestingFramework();
  }
  return abTestingInstance;
}
