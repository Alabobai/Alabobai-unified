/**
 * Alabobai Self-Annealing System - Feedback Collector
 *
 * Collects explicit and implicit feedback from users and systems.
 * Tracks approvals, modifications, ratings, and behavioral signals.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  Feedback,
  FeedbackType,
  Modification,
  QualityDimension,
  ImplicitSignal,
  ImplicitSignalType,
} from './types.js';

// ============================================================================
// FEEDBACK COLLECTOR CLASS
// ============================================================================

export interface FeedbackCollectorConfig {
  autoCalculateQuality: boolean;
  trackImplicitSignals: boolean;
  implicitSignalWeights: Record<ImplicitSignalType, number>;
  qualityDimensions: QualityDimensionConfig[];
}

export interface QualityDimensionConfig {
  name: string;
  weight: number;
  evaluator: (output: Record<string, unknown>, context: FeedbackContext) => number;
}

export interface FeedbackContext {
  executionLogId: string;
  companyId: string;
  userId: string;
  agentName: string;
  taskType: string;
  executionOutput: Record<string, unknown>;
  executionDurationMs: number;
}

const DEFAULT_CONFIG: FeedbackCollectorConfig = {
  autoCalculateQuality: true,
  trackImplicitSignals: true,
  implicitSignalWeights: {
    'time-to-approval': 1.0,
    'revision-count': 1.5,
    'undo-count': 2.0,
    'follow-up-questions': 0.8,
    'session-continuation': 0.5,
    'output-reuse': 1.2,
    'task-abandonment': 3.0,
    'immediate-retry': 2.5,
    'escalation': 2.0,
  },
  qualityDimensions: [],
};

export class FeedbackCollector extends EventEmitter {
  private config: FeedbackCollectorConfig;
  private pendingFeedback: Map<string, Partial<Feedback>> = new Map();
  private sessionSignals: Map<string, SessionSignalTracker> = new Map();
  private persistFn: ((feedback: Feedback) => Promise<void>) | null = null;

  constructor(config: Partial<FeedbackCollectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the persistence function
   */
  setPersistFunction(fn: (feedback: Feedback) => Promise<void>): void {
    this.persistFn = fn;
  }

  // ============================================================================
  // EXPLICIT FEEDBACK
  // ============================================================================

  /**
   * Record explicit rating from user (1-5 stars)
   */
  async recordRating(
    executionLogId: string,
    context: FeedbackContext,
    rating: number,
    comment?: string
  ): Promise<string> {
    const feedback: Feedback = {
      id: uuid(),
      timestamp: new Date(),
      executionLogId,
      companyId: context.companyId,
      userId: context.userId,
      feedbackType: 'explicit-rating',
      rating: Math.max(1, Math.min(5, Math.round(rating))),
      sentiment: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
      comment,
      implicitSignals: [],
    };

    await this.persistFeedback(feedback);
    return feedback.id;
  }

  /**
   * Record text comment from user
   */
  async recordComment(
    executionLogId: string,
    context: FeedbackContext,
    comment: string
  ): Promise<string> {
    // Analyze sentiment from comment
    const sentiment = this.analyzeSentiment(comment);

    const feedback: Feedback = {
      id: uuid(),
      timestamp: new Date(),
      executionLogId,
      companyId: context.companyId,
      userId: context.userId,
      feedbackType: 'explicit-comment',
      sentiment,
      comment,
      implicitSignals: [],
    };

    await this.persistFeedback(feedback);
    return feedback.id;
  }

  // ============================================================================
  // APPROVAL FEEDBACK
  // ============================================================================

  /**
   * Start tracking an approval request
   */
  startApprovalTracking(executionLogId: string, context: FeedbackContext): void {
    this.pendingFeedback.set(executionLogId, {
      id: uuid(),
      timestamp: new Date(),
      executionLogId,
      companyId: context.companyId,
      userId: context.userId,
      feedbackType: 'approval-decision',
      implicitSignals: [],
    });
  }

  /**
   * Record approval decision
   */
  async recordApprovalDecision(
    executionLogId: string,
    decision: 'approved' | 'rejected',
    reason?: string
  ): Promise<string | null> {
    const pending = this.pendingFeedback.get(executionLogId);
    if (!pending) return null;

    const feedback: Feedback = {
      ...pending as Feedback,
      approvalDecision: decision,
      timeToDecision: Date.now() - (pending.timestamp?.getTime() || 0),
      sentiment: decision === 'approved' ? 'positive' : 'negative',
      comment: reason,
      implicitSignals: [
        {
          signalType: 'time-to-approval',
          value: Date.now() - (pending.timestamp?.getTime() || 0),
        },
      ],
    };

    this.pendingFeedback.delete(executionLogId);
    await this.persistFeedback(feedback);
    return feedback.id;
  }

  /**
   * Record that user modified the output before approval
   */
  async recordModification(
    executionLogId: string,
    context: FeedbackContext,
    originalOutput: Record<string, unknown>,
    modifiedOutput: Record<string, unknown>
  ): Promise<string> {
    const modifications = this.calculateModifications(originalOutput, modifiedOutput);

    const feedback: Feedback = {
      id: uuid(),
      timestamp: new Date(),
      executionLogId,
      companyId: context.companyId,
      userId: context.userId,
      feedbackType: 'output-modification',
      approvalDecision: 'modified',
      modificationsApplied: modifications,
      sentiment: modifications.some(m => m.modificationSize === 'major') ? 'negative' : 'neutral',
      implicitSignals: [
        {
          signalType: 'revision-count',
          value: modifications.length,
        },
      ],
    };

    await this.persistFeedback(feedback);
    return feedback.id;
  }

  // ============================================================================
  // IMPLICIT SIGNAL TRACKING
  // ============================================================================

  /**
   * Start tracking signals for a session
   */
  startSessionTracking(sessionId: string, companyId: string, userId: string): void {
    if (!this.sessionSignals.has(sessionId)) {
      this.sessionSignals.set(sessionId, new SessionSignalTracker(sessionId, companyId, userId));
    }
  }

  /**
   * Record an implicit signal
   */
  recordImplicitSignal(
    sessionId: string,
    executionLogId: string,
    signalType: ImplicitSignalType,
    value: number,
    context?: Record<string, unknown>
  ): void {
    const tracker = this.sessionSignals.get(sessionId);
    if (tracker) {
      tracker.addSignal(executionLogId, signalType, value, context);
    }
  }

  /**
   * Record undo action
   */
  recordUndo(sessionId: string, executionLogId: string): void {
    this.recordImplicitSignal(sessionId, executionLogId, 'undo-count', 1);
  }

  /**
   * Record follow-up question
   */
  recordFollowUp(sessionId: string, executionLogId: string): void {
    this.recordImplicitSignal(sessionId, executionLogId, 'follow-up-questions', 1);
  }

  /**
   * Record immediate retry (user immediately asks for same thing again)
   */
  recordImmediateRetry(sessionId: string, executionLogId: string): void {
    this.recordImplicitSignal(sessionId, executionLogId, 'immediate-retry', 1);
  }

  /**
   * Record task abandonment
   */
  recordAbandonment(sessionId: string, executionLogId: string): void {
    this.recordImplicitSignal(sessionId, executionLogId, 'task-abandonment', 1);
  }

  /**
   * Record escalation (user asked for human help)
   */
  recordEscalation(sessionId: string, executionLogId: string): void {
    this.recordImplicitSignal(sessionId, executionLogId, 'escalation', 1);
  }

  /**
   * Record output reuse (user copied the output)
   */
  recordOutputReuse(sessionId: string, executionLogId: string): void {
    this.recordImplicitSignal(sessionId, executionLogId, 'output-reuse', 1);
  }

  /**
   * End session and persist all implicit signals
   */
  async endSession(sessionId: string): Promise<void> {
    const tracker = this.sessionSignals.get(sessionId);
    if (!tracker) return;

    // Calculate session continuation value (session length in minutes)
    const sessionDuration = (Date.now() - tracker.startTime) / 60000;
    tracker.addSignal('session', 'session-continuation', sessionDuration);

    // Persist all signals as feedback
    for (const [executionLogId, signals] of tracker.getSignals()) {
      if (executionLogId === 'session') continue;

      const feedback: Feedback = {
        id: uuid(),
        timestamp: new Date(),
        executionLogId,
        companyId: tracker.companyId,
        userId: tracker.userId,
        feedbackType: 'implicit-signal',
        implicitSignals: signals,
      };

      await this.persistFeedback(feedback);
    }

    this.sessionSignals.delete(sessionId);
  }

  // ============================================================================
  // QUALITY EVALUATION
  // ============================================================================

  /**
   * Evaluate output quality using configured dimensions
   */
  async evaluateQuality(
    executionLogId: string,
    context: FeedbackContext,
    customEvaluators?: QualityDimensionConfig[]
  ): Promise<string> {
    const evaluators = customEvaluators || this.config.qualityDimensions;
    const dimensions: QualityDimension[] = [];

    // Run each evaluator
    for (const evaluator of evaluators) {
      try {
        const score = evaluator.evaluator(context.executionOutput, context);
        dimensions.push({
          name: evaluator.name,
          score: Math.max(0, Math.min(100, score)),
          weight: evaluator.weight,
        });
      } catch (error) {
        console.error(`[FeedbackCollector] Evaluator ${evaluator.name} failed:`, error);
      }
    }

    // Add default dimensions if none configured
    if (dimensions.length === 0) {
      dimensions.push(
        ...this.getDefaultQualityDimensions(context)
      );
    }

    // Calculate weighted average
    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    const qualityScore = totalWeight > 0
      ? dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight
      : 0;

    const feedback: Feedback = {
      id: uuid(),
      timestamp: new Date(),
      executionLogId,
      companyId: context.companyId,
      userId: context.userId,
      feedbackType: 'system-evaluation',
      qualityScore: Math.round(qualityScore),
      qualityDimensions: dimensions,
      implicitSignals: [],
    };

    await this.persistFeedback(feedback);
    return feedback.id;
  }

  // ============================================================================
  // AGGREGATED FEEDBACK SCORE
  // ============================================================================

  /**
   * Calculate an overall feedback score for an execution
   */
  calculateFeedbackScore(feedbackItems: Feedback[]): {
    score: number;
    confidence: number;
    breakdown: Record<string, number>;
  } {
    if (feedbackItems.length === 0) {
      return { score: 50, confidence: 0, breakdown: {} };
    }

    const breakdown: Record<string, number> = {};
    let totalScore = 0;
    let totalWeight = 0;

    // Process explicit ratings
    const ratings = feedbackItems.filter(f => f.rating !== undefined);
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((s, f) => s + (f.rating || 0), 0) / ratings.length;
      const normalizedRating = (avgRating - 1) / 4 * 100; // Convert 1-5 to 0-100
      breakdown.explicit_rating = normalizedRating;
      totalScore += normalizedRating * 3; // Weight: 3
      totalWeight += 3;
    }

    // Process approval decisions
    const approvals = feedbackItems.filter(f => f.approvalDecision !== undefined);
    if (approvals.length > 0) {
      const approvalRate = approvals.filter(f => f.approvalDecision === 'approved').length / approvals.length;
      const approvalScore = approvalRate * 100;
      breakdown.approval_rate = approvalScore;
      totalScore += approvalScore * 2; // Weight: 2
      totalWeight += 2;
    }

    // Process quality scores
    const qualities = feedbackItems.filter(f => f.qualityScore !== undefined);
    if (qualities.length > 0) {
      const avgQuality = qualities.reduce((s, f) => s + (f.qualityScore || 0), 0) / qualities.length;
      breakdown.quality_score = avgQuality;
      totalScore += avgQuality * 2; // Weight: 2
      totalWeight += 2;
    }

    // Process implicit signals
    const implicitItems = feedbackItems.filter(f => f.implicitSignals.length > 0);
    if (implicitItems.length > 0) {
      const implicitScore = this.calculateImplicitScore(
        implicitItems.flatMap(f => f.implicitSignals)
      );
      breakdown.implicit_signals = implicitScore;
      totalScore += implicitScore * 1; // Weight: 1
      totalWeight += 1;
    }

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 50;
    const confidence = Math.min(1, feedbackItems.length / 10); // Full confidence at 10+ feedback items

    return {
      score: Math.round(finalScore),
      confidence,
      breakdown,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async persistFeedback(feedback: Feedback): Promise<void> {
    if (this.persistFn) {
      try {
        await this.persistFn(feedback);
      } catch (error) {
        console.error('[FeedbackCollector] Failed to persist feedback:', error);
      }
    }
    this.emit('feedback-collected', feedback);
  }

  private analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const lowerText = text.toLowerCase();

    // Positive indicators
    const positiveWords = ['great', 'good', 'excellent', 'perfect', 'love', 'thanks', 'helpful', 'amazing', 'awesome', 'fantastic'];
    const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;

    // Negative indicators
    const negativeWords = ['bad', 'wrong', 'terrible', 'awful', 'hate', 'useless', 'broken', 'fail', 'stupid', 'worst'];
    const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private calculateModifications(
    original: Record<string, unknown>,
    modified: Record<string, unknown>
  ): Modification[] {
    const modifications: Modification[] = [];

    const compareObjects = (orig: unknown, mod: unknown, path: string) => {
      if (orig === mod) return;

      if (typeof orig !== typeof mod) {
        modifications.push({
          field: path,
          originalValue: orig,
          modifiedValue: mod,
          modificationSize: 'major',
        });
        return;
      }

      if (typeof orig === 'object' && orig !== null && mod !== null) {
        const origObj = orig as Record<string, unknown>;
        const modObj = mod as Record<string, unknown>;
        const allKeys = new Set([...Object.keys(origObj), ...Object.keys(modObj)]);

        for (const key of allKeys) {
          compareObjects(origObj[key], modObj[key], path ? `${path}.${key}` : key);
        }
        return;
      }

      if (typeof orig === 'string' && typeof mod === 'string') {
        const sizeDiff = Math.abs(orig.length - mod.length) / Math.max(orig.length, 1);
        modifications.push({
          field: path,
          originalValue: orig,
          modifiedValue: mod,
          modificationSize: sizeDiff > 0.5 ? 'major' : sizeDiff > 0.2 ? 'moderate' : 'minor',
        });
        return;
      }

      modifications.push({
        field: path,
        originalValue: orig,
        modifiedValue: mod,
        modificationSize: 'moderate',
      });
    };

    compareObjects(original, modified, '');
    return modifications;
  }

  private calculateImplicitScore(signals: ImplicitSignal[]): number {
    // Start at neutral
    let score = 50;

    for (const signal of signals) {
      const weight = this.config.implicitSignalWeights[signal.signalType] || 1;

      switch (signal.signalType) {
        case 'time-to-approval':
          // Fast approval is good (under 30 seconds = +20 points)
          if (signal.value < 30000) score += 20 / weight;
          else if (signal.value > 300000) score -= 10 * weight; // > 5 min is bad
          break;

        case 'revision-count':
          // Fewer revisions = better
          score -= signal.value * 5 * weight;
          break;

        case 'undo-count':
          // Undos are very bad signals
          score -= signal.value * 10 * weight;
          break;

        case 'follow-up-questions':
          // Some follow-ups are normal, many are bad
          if (signal.value > 2) score -= (signal.value - 2) * 5 * weight;
          break;

        case 'session-continuation':
          // Longer sessions are generally good
          score += Math.min(20, signal.value * 0.5);
          break;

        case 'output-reuse':
          // User copied output = very good
          score += 15 * weight;
          break;

        case 'task-abandonment':
          // Very bad
          score -= 30 * weight;
          break;

        case 'immediate-retry':
          // Bad - first attempt wasn't satisfactory
          score -= 25 * weight;
          break;

        case 'escalation':
          // Bad - needed human help
          score -= 20 * weight;
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private getDefaultQualityDimensions(context: FeedbackContext): QualityDimension[] {
    const dimensions: QualityDimension[] = [];

    // Completeness: Does output have content?
    const output = context.executionOutput;
    const hasContent = output && Object.keys(output).length > 0;
    dimensions.push({
      name: 'completeness',
      score: hasContent ? 80 : 20,
      weight: 1,
    });

    // Speed: Was it fast?
    const durationScore = context.executionDurationMs < 5000 ? 90
      : context.executionDurationMs < 15000 ? 70
      : context.executionDurationMs < 30000 ? 50
      : 30;
    dimensions.push({
      name: 'speed',
      score: durationScore,
      weight: 0.5,
    });

    return dimensions;
  }
}

// ============================================================================
// SESSION SIGNAL TRACKER
// ============================================================================

class SessionSignalTracker {
  public readonly sessionId: string;
  public readonly companyId: string;
  public readonly userId: string;
  public readonly startTime: number;
  private signals: Map<string, ImplicitSignal[]> = new Map();

  constructor(sessionId: string, companyId: string, userId: string) {
    this.sessionId = sessionId;
    this.companyId = companyId;
    this.userId = userId;
    this.startTime = Date.now();
  }

  addSignal(
    executionLogId: string,
    signalType: ImplicitSignalType,
    value: number,
    context?: Record<string, unknown>
  ): void {
    if (!this.signals.has(executionLogId)) {
      this.signals.set(executionLogId, []);
    }

    this.signals.get(executionLogId)!.push({
      signalType,
      value,
      context,
    });
  }

  getSignals(): Map<string, ImplicitSignal[]> {
    return this.signals;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let collectorInstance: FeedbackCollector | null = null;

export function getFeedbackCollector(config?: Partial<FeedbackCollectorConfig>): FeedbackCollector {
  if (!collectorInstance) {
    collectorInstance = new FeedbackCollector(config);
  }
  return collectorInstance;
}

export function createFeedbackCollector(config?: Partial<FeedbackCollectorConfig>): FeedbackCollector {
  return new FeedbackCollector(config);
}
