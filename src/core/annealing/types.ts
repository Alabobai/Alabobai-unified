/**
 * Alabobai Self-Annealing System - Core Types
 *
 * The self-annealing system enables agents to learn and improve automatically
 * over time through systematic observation, pattern analysis, and adaptation.
 */

import { z } from 'zod';

// ============================================================================
// EXECUTION LOG TYPES
// ============================================================================

/**
 * Every action taken by an agent is captured in an ExecutionLog
 */
export interface ExecutionLog {
  id: string;
  timestamp: Date;

  // Context
  companyId: string;
  sessionId: string;
  userId: string;
  agentId: string;
  agentName: string;
  taskId: string;

  // Action details
  actionType: ActionType;
  actionName: string;
  actionInput: Record<string, unknown>;
  actionOutput: Record<string, unknown> | null;

  // Execution metrics
  durationMs: number;
  tokenCount: {
    input: number;
    output: number;
    total: number;
  };
  llmModel: string;
  promptVersion: string;

  // Result
  status: ExecutionStatus;
  errorType?: string;
  errorMessage?: string;
  errorStack?: string;

  // Parent execution for nested calls
  parentExecutionId: string | null;
  childExecutionIds: string[];

  // Tool usage
  toolsUsed: ToolUsage[];

  // Context that influenced the decision
  contextFactors: ContextFactor[];
}

export type ActionType =
  | 'intent-classification'
  | 'task-execution'
  | 'tool-call'
  | 'llm-inference'
  | 'approval-request'
  | 'collaboration'
  | 'output-generation';

export type ExecutionStatus =
  | 'success'
  | 'partial-success'
  | 'failure'
  | 'timeout'
  | 'cancelled';

export interface ToolUsage {
  toolName: string;
  invocationCount: number;
  successCount: number;
  totalDurationMs: number;
  parameters: Record<string, unknown>[];
}

export interface ContextFactor {
  name: string;
  value: unknown;
  influence: 'high' | 'medium' | 'low';
}

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

/**
 * Feedback collected from users and systems
 */
export interface Feedback {
  id: string;
  timestamp: Date;
  executionLogId: string;

  // Source
  companyId: string;
  userId: string;
  feedbackType: FeedbackType;

  // Feedback data
  rating?: number;                    // 1-5 stars
  sentiment?: 'positive' | 'neutral' | 'negative';
  comment?: string;

  // Approval feedback
  approvalDecision?: 'approved' | 'rejected' | 'modified';
  modificationsApplied?: Modification[];
  timeToDecision?: number;            // ms from request to decision

  // Output quality
  qualityScore?: number;              // 0-100
  qualityDimensions?: QualityDimension[];

  // Implicit signals
  implicitSignals: ImplicitSignal[];
}

export type FeedbackType =
  | 'explicit-rating'
  | 'explicit-comment'
  | 'approval-decision'
  | 'output-modification'
  | 'implicit-signal'
  | 'system-evaluation';

export interface Modification {
  field: string;
  originalValue: unknown;
  modifiedValue: unknown;
  modificationSize: 'minor' | 'moderate' | 'major';
}

export interface QualityDimension {
  name: string;           // e.g., 'accuracy', 'completeness', 'clarity'
  score: number;          // 0-100
  weight: number;         // importance weight
}

export interface ImplicitSignal {
  signalType: ImplicitSignalType;
  value: number;
  context?: Record<string, unknown>;
}

export type ImplicitSignalType =
  | 'time-to-approval'     // faster = better
  | 'revision-count'       // fewer = better
  | 'undo-count'           // fewer = better
  | 'follow-up-questions'  // fewer = better (unless clarification expected)
  | 'session-continuation' // longer = better engagement
  | 'output-reuse'         // copying output = good
  | 'task-abandonment'     // bad signal
  | 'immediate-retry'      // bad signal - output wasn't satisfactory
  | 'escalation';          // bad signal - had to ask for help

// ============================================================================
// PATTERN TYPES
// ============================================================================

/**
 * Patterns identified from execution and feedback analysis
 */
export interface Pattern {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  patternType: PatternType;
  patternName: string;
  description: string;

  // Statistical significance
  sampleSize: number;
  confidenceLevel: number;         // 0-1
  statisticalSignificance: number; // p-value
  effectSize: number;              // Cohen's d or similar

  // Pattern data
  conditions: PatternCondition[];
  outcome: PatternOutcome;

  // Scope
  scope: PatternScope;

  // Status
  status: PatternStatus;
  validatedAt?: Date;
  validatedBy?: string;
}

export type PatternType =
  | 'success-pattern'
  | 'failure-pattern'
  | 'optimization-pattern'
  | 'anti-pattern';

export interface PatternCondition {
  dimension: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'matches' | 'in';
  value: unknown;
}

export interface PatternOutcome {
  metric: string;
  direction: 'increase' | 'decrease';
  magnitude: number;
  baselineValue: number;
  patternValue: number;
}

export interface PatternScope {
  global: boolean;
  companyIds?: string[];
  agentNames?: string[];
  industries?: string[];
  taskTypes?: string[];
}

export type PatternStatus =
  | 'candidate'
  | 'validated'
  | 'applied'
  | 'deprecated'
  | 'rejected';

// ============================================================================
// ADAPTATION TYPES
// ============================================================================

/**
 * Adaptations made based on pattern analysis
 */
export interface Adaptation {
  id: string;
  createdAt: Date;
  appliedAt?: Date;

  adaptationType: AdaptationType;
  name: string;
  description: string;

  // What triggered this
  triggerPatternIds: string[];
  triggerReason: string;

  // The change
  change: AdaptationChange;

  // Rollout
  rolloutStrategy: RolloutStrategy;
  currentRolloutPercentage: number;

  // Results
  status: AdaptationStatus;
  metrics: AdaptationMetric[];

  // Safety
  rollbackConditions: RollbackCondition[];
  rollbackTriggered: boolean;
  rollbackReason?: string;
}

export type AdaptationType =
  | 'prompt-optimization'
  | 'tool-selection'
  | 'execution-strategy'
  | 'output-template'
  | 'context-priority'
  | 'parameter-tuning';

export interface AdaptationChange {
  target: string;           // e.g., 'agent.WealthLabobai.systemPrompt'
  changeType: 'replace' | 'append' | 'prepend' | 'modify' | 'remove';
  previousValue: unknown;
  newValue: unknown;
  changeDiff?: string;      // unified diff format
}

export interface RolloutStrategy {
  type: 'immediate' | 'gradual' | 'a-b-test' | 'canary';
  startPercentage: number;
  targetPercentage: number;
  incrementPercentage: number;
  incrementIntervalHours: number;
  minimumSampleSize: number;
}

export type AdaptationStatus =
  | 'pending-approval'
  | 'approved'
  | 'rolling-out'
  | 'active'
  | 'rolled-back'
  | 'superseded';

export interface AdaptationMetric {
  name: string;
  baselineValue: number;
  currentValue: number;
  targetValue: number;
  measurementCount: number;
  lastMeasuredAt: Date;
}

export interface RollbackCondition {
  metric: string;
  threshold: number;
  operator: 'greater' | 'less';
  windowMinutes: number;
}

// ============================================================================
// CROSS-COMPANY LEARNING TYPES
// ============================================================================

/**
 * Anonymized aggregate insights from across companies
 */
export interface AggregateInsight {
  id: string;
  createdAt: Date;

  insightType: InsightType;
  name: string;
  description: string;

  // Aggregation details
  companyCount: number;
  executionCount: number;
  timeRange: {
    start: Date;
    end: Date;
  };

  // Statistical summary
  statistics: AggregateStatistics;

  // Industry breakdown (if applicable)
  industryBreakdown?: Record<string, AggregateStatistics>;

  // Recommendations
  recommendations: Recommendation[];

  // Benchmark data
  benchmark?: Benchmark;
}

export type InsightType =
  | 'performance-trend'
  | 'best-practice'
  | 'common-failure'
  | 'optimization-opportunity'
  | 'industry-pattern';

export interface AggregateStatistics {
  mean: number;
  median: number;
  standardDeviation: number;
  percentile25: number;
  percentile75: number;
  percentile90: number;
  percentile99: number;
  min: number;
  max: number;
  count: number;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  expectedImprovement: number;
  confidence: number;
  applicableWhen: PatternCondition[];
}

export interface Benchmark {
  metric: string;
  industryAverage: number;
  topQuartile: number;
  topDecile: number;
}

// ============================================================================
// PERFORMANCE METRICS TYPES
// ============================================================================

/**
 * Metrics tracked for system performance
 */
export interface PerformanceMetrics {
  id: string;
  timestamp: Date;
  granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';

  // Scope
  scope: MetricScope;

  // Core metrics
  executionCount: number;
  successRate: number;
  approvalRate: number;

  // Speed metrics
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Quality metrics
  averageQualityScore: number;
  averageUserRating: number;
  modificationRate: number;

  // Efficiency metrics
  averageTokenCount: number;
  averageToolCalls: number;
  costPerExecution: number;

  // Learning metrics
  adaptationCount: number;
  patternDiscoveryRate: number;
  improvementRate: number;
}

export interface MetricScope {
  companyId?: string;
  agentId?: string;
  taskType?: string;
  industry?: string;
}

// ============================================================================
// A/B TESTING TYPES
// ============================================================================

/**
 * A/B test configuration and results
 */
export interface ABTest {
  id: string;
  name: string;
  description: string;
  hypothesis: string;

  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;

  status: ABTestStatus;

  // Variants
  controlVariant: TestVariant;
  treatmentVariants: TestVariant[];

  // Traffic allocation
  trafficAllocation: Record<string, number>; // variant id -> percentage

  // Targeting
  targetingRules: PatternCondition[];

  // Success metrics
  primaryMetric: string;
  secondaryMetrics: string[];
  minimumDetectableEffect: number;
  requiredSampleSize: number;

  // Results
  results?: ABTestResults;
}

export type ABTestStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped';

export interface TestVariant {
  id: string;
  name: string;
  description: string;
  changes: AdaptationChange[];
  sampleSize: number;
  metrics: Record<string, VariantMetric>;
}

export interface VariantMetric {
  value: number;
  variance: number;
  sampleSize: number;
}

export interface ABTestResults {
  winner?: string;          // variant id
  conclusive: boolean;
  statisticalSignificance: number;
  confidenceInterval: [number, number];
  relativeImprovement: number;
  analysisNotes: string;
}

// ============================================================================
// SAFETY RAIL TYPES
// ============================================================================

/**
 * Safety constraints on adaptations
 */
export interface SafetyRail {
  id: string;
  name: string;
  description: string;

  railType: SafetyRailType;
  severity: 'warning' | 'block';

  // Condition
  condition: SafetyCondition;

  // Action
  action: SafetyAction;

  // Tracking
  triggerCount: number;
  lastTriggeredAt?: Date;
  enabled: boolean;
}

export type SafetyRailType =
  | 'metric-degradation'
  | 'rate-limit'
  | 'change-scope'
  | 'approval-required'
  | 'rollback-trigger';

export interface SafetyCondition {
  metric?: string;
  threshold?: number;
  operator?: 'greater' | 'less' | 'equals';
  windowMinutes?: number;
  patternMatch?: PatternCondition[];
}

export interface SafetyAction {
  actionType: 'block' | 'rollback' | 'notify' | 'require-approval' | 'pause';
  target?: string;
  notifyRoles?: string[];
  message: string;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const ExecutionLogSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  agentId: z.string(),
  taskId: z.string().uuid(),
  actionType: z.enum([
    'intent-classification',
    'task-execution',
    'tool-call',
    'llm-inference',
    'approval-request',
    'collaboration',
    'output-generation'
  ]),
  actionName: z.string().min(1).max(200),
  actionInput: z.record(z.unknown()),
});

export const FeedbackSchema = z.object({
  executionLogId: z.string().uuid(),
  feedbackType: z.enum([
    'explicit-rating',
    'explicit-comment',
    'approval-decision',
    'output-modification',
    'implicit-signal',
    'system-evaluation'
  ]),
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().max(5000).optional(),
});

export const PatternSchema = z.object({
  patternType: z.enum([
    'success-pattern',
    'failure-pattern',
    'optimization-pattern',
    'anti-pattern'
  ]),
  patternName: z.string().min(1).max(200),
  confidenceLevel: z.number().min(0).max(1),
  sampleSize: z.number().min(1),
});

export const AdaptationSchema = z.object({
  adaptationType: z.enum([
    'prompt-optimization',
    'tool-selection',
    'execution-strategy',
    'output-template',
    'context-priority',
    'parameter-tuning'
  ]),
  name: z.string().min(1).max(200),
  triggerPatternIds: z.array(z.string().uuid()),
});
