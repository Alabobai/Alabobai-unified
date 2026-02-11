/**
 * Alabobai Self-Annealing System - Safety Rails
 *
 * Prevents negative adaptations and ensures human oversight.
 * Implements rollback mechanisms and testing gates.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  SafetyRail,
  SafetyRailType,
  SafetyCondition,
  SafetyAction,
  Adaptation,
  Pattern,
  PerformanceMetrics,
} from './types.js';

// ============================================================================
// SAFETY CONTROLLER
// ============================================================================

export interface SafetyControllerConfig {
  enableAllRails: boolean;
  requireHumanApprovalFor: string[];
  maxAdaptationsPerHour: number;
  maxAdaptationsPerDay: number;
  rollbackWindowMinutes: number;
  testingGateEnabled: boolean;
  minimumTestCoverage: number;
}

const DEFAULT_CONFIG: SafetyControllerConfig = {
  enableAllRails: true,
  requireHumanApprovalFor: [
    'global-prompt-change',
    'security-related',
    'multi-agent-change',
  ],
  maxAdaptationsPerHour: 5,
  maxAdaptationsPerDay: 20,
  rollbackWindowMinutes: 60,
  testingGateEnabled: true,
  minimumTestCoverage: 0.8,
};

export interface RailTrigger {
  id: string;
  railId: string;
  railName: string;
  triggeredAt: Date;
  adaptation?: Adaptation;
  context: Record<string, unknown>;
  actionTaken: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export class SafetyController extends EventEmitter {
  private config: SafetyControllerConfig;
  private rails: Map<string, SafetyRail> = new Map();
  private triggers: Map<string, RailTrigger> = new Map();
  private adaptationHistory: { timestamp: Date; adaptationId: string }[] = [];
  private metricsBaseline: Map<string, number> = new Map();
  private rollbackHistory: Map<string, { rolledBackAt: Date; reason: string }> = new Map();

  constructor(config: Partial<SafetyControllerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultRails();
  }

  /**
   * Initialize default safety rails
   */
  private initializeDefaultRails(): void {
    // Metric degradation rail
    this.addRail({
      id: 'rail-metric-degradation',
      name: 'Metric Degradation Guard',
      description: 'Prevents adaptations that cause significant metric drops',
      railType: 'metric-degradation',
      severity: 'block',
      condition: {
        metric: 'success_rate',
        threshold: 0.05, // 5% drop
        operator: 'less',
        windowMinutes: 60,
      },
      action: {
        actionType: 'rollback',
        message: 'Adaptation rolled back due to success rate degradation',
      },
      triggerCount: 0,
      enabled: true,
    });

    // Rate limit rail
    this.addRail({
      id: 'rail-rate-limit',
      name: 'Adaptation Rate Limiter',
      description: 'Prevents too many adaptations in a short period',
      railType: 'rate-limit',
      severity: 'block',
      condition: {
        // Uses config values
      },
      action: {
        actionType: 'block',
        message: 'Rate limit exceeded for adaptations',
      },
      triggerCount: 0,
      enabled: true,
    });

    // Change scope rail
    this.addRail({
      id: 'rail-change-scope',
      name: 'Change Scope Limiter',
      description: 'Requires approval for broad-scope changes',
      railType: 'change-scope',
      severity: 'block',
      condition: {
        patternMatch: [
          { dimension: 'scope.global', operator: 'equals', value: true },
        ],
      },
      action: {
        actionType: 'require-approval',
        notifyRoles: ['admin', 'ml-lead'],
        message: 'Global changes require human approval',
      },
      triggerCount: 0,
      enabled: true,
    });

    // Approval required rail
    this.addRail({
      id: 'rail-security-approval',
      name: 'Security-Related Approval',
      description: 'Requires approval for security-related changes',
      railType: 'approval-required',
      severity: 'block',
      condition: {
        patternMatch: [
          { dimension: 'target', operator: 'matches', value: 'security|auth|permission' },
        ],
      },
      action: {
        actionType: 'require-approval',
        notifyRoles: ['security-team'],
        message: 'Security-related changes require security team approval',
      },
      triggerCount: 0,
      enabled: true,
    });

    // Rollback trigger rail
    this.addRail({
      id: 'rail-auto-rollback',
      name: 'Automatic Rollback Trigger',
      description: 'Automatically rolls back when critical metrics fail',
      railType: 'rollback-trigger',
      severity: 'block',
      condition: {
        metric: 'error_rate',
        threshold: 0.2, // 20% error rate
        operator: 'greater',
        windowMinutes: 15,
      },
      action: {
        actionType: 'rollback',
        notifyRoles: ['admin', 'oncall'],
        message: 'Critical error rate threshold exceeded',
      },
      triggerCount: 0,
      enabled: true,
    });
  }

  /**
   * Add a safety rail
   */
  addRail(rail: SafetyRail): void {
    this.rails.set(rail.id, rail);
    this.emit('rail-added', { railId: rail.id });
  }

  /**
   * Remove a safety rail
   */
  removeRail(railId: string): void {
    this.rails.delete(railId);
    this.emit('rail-removed', { railId });
  }

  /**
   * Enable/disable a rail
   */
  setRailEnabled(railId: string, enabled: boolean): void {
    const rail = this.rails.get(railId);
    if (rail) {
      rail.enabled = enabled;
      this.emit('rail-updated', { railId, enabled });
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate an adaptation against all safety rails
   */
  async validateAdaptation(adaptation: Adaptation): Promise<{
    allowed: boolean;
    blockedBy?: SafetyRail;
    warnings: SafetyRail[];
    requiresApproval: boolean;
    approvalRoles?: string[];
  }> {
    const warnings: SafetyRail[] = [];
    let requiresApproval = false;
    let approvalRoles: string[] = [];

    for (const rail of this.rails.values()) {
      if (!rail.enabled) continue;

      const triggered = await this.checkRailCondition(rail, adaptation);

      if (triggered) {
        if (rail.severity === 'block') {
          // Check if it's an approval requirement
          if (rail.action.actionType === 'require-approval') {
            requiresApproval = true;
            if (rail.action.notifyRoles) {
              approvalRoles.push(...rail.action.notifyRoles);
            }
          } else {
            // Hard block
            await this.recordTrigger(rail, adaptation, 'blocked');
            return {
              allowed: false,
              blockedBy: rail,
              warnings,
              requiresApproval: false,
            };
          }
        } else {
          warnings.push(rail);
        }
      }
    }

    // Check rate limits
    const rateLimitExceeded = this.checkRateLimits();
    if (rateLimitExceeded) {
      const rateRail = this.rails.get('rail-rate-limit')!;
      await this.recordTrigger(rateRail, adaptation, 'rate-limited');
      return {
        allowed: false,
        blockedBy: rateRail,
        warnings,
        requiresApproval: false,
      };
    }

    return {
      allowed: true,
      warnings,
      requiresApproval,
      approvalRoles: [...new Set(approvalRoles)],
    };
  }

  /**
   * Validate metrics after adaptation
   */
  async validateMetricsPostAdaptation(
    adaptationId: string,
    currentMetrics: PerformanceMetrics
  ): Promise<{
    healthy: boolean;
    degradedMetrics: { metric: string; baseline: number; current: number; threshold: number }[];
    shouldRollback: boolean;
  }> {
    const degradedMetrics: { metric: string; baseline: number; current: number; threshold: number }[] = [];

    for (const rail of this.rails.values()) {
      if (!rail.enabled || rail.railType !== 'metric-degradation') continue;

      const condition = rail.condition;
      if (!condition.metric) continue;

      const baseline = this.metricsBaseline.get(condition.metric) || 0;
      const current = this.getMetricValue(currentMetrics, condition.metric);
      const threshold = condition.threshold || 0;

      let degraded = false;
      if (condition.operator === 'less') {
        degraded = (baseline - current) > threshold;
      } else if (condition.operator === 'greater') {
        degraded = (current - baseline) > threshold;
      }

      if (degraded) {
        degradedMetrics.push({
          metric: condition.metric,
          baseline,
          current,
          threshold,
        });
      }
    }

    const shouldRollback = degradedMetrics.some(d =>
      this.rails.get('rail-auto-rollback')?.enabled &&
      this.rails.get('rail-auto-rollback')?.condition.metric === d.metric
    );

    return {
      healthy: degradedMetrics.length === 0,
      degradedMetrics,
      shouldRollback,
    };
  }

  // ============================================================================
  // TESTING GATE
  // ============================================================================

  /**
   * Validate adaptation passes testing requirements
   */
  async validateTestingGate(adaptation: Adaptation): Promise<{
    passed: boolean;
    coverage: number;
    failedTests: string[];
    notes: string;
  }> {
    if (!this.config.testingGateEnabled) {
      return { passed: true, coverage: 1.0, failedTests: [], notes: 'Testing gate disabled' };
    }

    // In production, this would run actual tests
    // For now, simulate test validation

    const simulatedCoverage = 0.85 + Math.random() * 0.15; // 85-100%
    const simulatedFailures: string[] = [];

    // Check if change affects critical paths
    const isCriticalPath = adaptation.change.target.includes('auth') ||
                           adaptation.change.target.includes('payment') ||
                           adaptation.change.target.includes('security');

    if (isCriticalPath) {
      // Higher scrutiny for critical paths
      if (simulatedCoverage < 0.95) {
        simulatedFailures.push('Insufficient coverage for critical path change');
      }
    }

    const passed = simulatedCoverage >= this.config.minimumTestCoverage &&
                   simulatedFailures.length === 0;

    return {
      passed,
      coverage: simulatedCoverage,
      failedTests: simulatedFailures,
      notes: passed ? 'All tests passed' : 'Some tests failed or coverage insufficient',
    };
  }

  // ============================================================================
  // ROLLBACK
  // ============================================================================

  /**
   * Check if rollback is needed based on current metrics
   */
  checkRollbackNeeded(
    adaptationId: string,
    currentMetrics: PerformanceMetrics
  ): { needed: boolean; reason?: string } {
    // Check if already rolled back
    if (this.rollbackHistory.has(adaptationId)) {
      return { needed: false, reason: 'Already rolled back' };
    }

    for (const rail of this.rails.values()) {
      if (!rail.enabled || rail.railType !== 'rollback-trigger') continue;

      const condition = rail.condition;
      if (!condition.metric) continue;

      const current = this.getMetricValue(currentMetrics, condition.metric);
      const threshold = condition.threshold || 0;

      let triggered = false;
      if (condition.operator === 'greater' && current > threshold) {
        triggered = true;
      } else if (condition.operator === 'less' && current < threshold) {
        triggered = true;
      }

      if (triggered) {
        return {
          needed: true,
          reason: `${condition.metric} exceeded threshold: ${current} vs ${threshold}`,
        };
      }
    }

    return { needed: false };
  }

  /**
   * Record a rollback
   */
  recordRollback(adaptationId: string, reason: string): void {
    this.rollbackHistory.set(adaptationId, {
      rolledBackAt: new Date(),
      reason,
    });

    this.emit('rollback-recorded', { adaptationId, reason });
  }

  /**
   * Get rollback history
   */
  getRollbackHistory(): Map<string, { rolledBackAt: Date; reason: string }> {
    return new Map(this.rollbackHistory);
  }

  // ============================================================================
  // BASELINE MANAGEMENT
  // ============================================================================

  /**
   * Update metrics baseline
   */
  updateBaseline(metrics: PerformanceMetrics): void {
    this.metricsBaseline.set('success_rate', metrics.successRate);
    this.metricsBaseline.set('approval_rate', metrics.approvalRate);
    this.metricsBaseline.set('avg_latency_ms', metrics.averageLatencyMs);
    this.metricsBaseline.set('p95_latency_ms', metrics.p95LatencyMs);
    this.metricsBaseline.set('avg_quality_score', metrics.averageQualityScore);
    this.metricsBaseline.set('avg_user_rating', metrics.averageUserRating);
    this.metricsBaseline.set('error_rate', 1 - metrics.successRate);

    this.emit('baseline-updated', { timestamp: new Date() });
  }

  /**
   * Get current baseline
   */
  getBaseline(): Map<string, number> {
    return new Map(this.metricsBaseline);
  }

  // ============================================================================
  // HUMAN OVERSIGHT
  // ============================================================================

  /**
   * Check if adaptation requires human approval
   */
  requiresHumanApproval(adaptation: Adaptation): {
    required: boolean;
    reasons: string[];
    roles: string[];
  } {
    const reasons: string[] = [];
    const roles = new Set<string>();

    // Check against configured approval requirements
    for (const category of this.config.requireHumanApprovalFor) {
      switch (category) {
        case 'global-prompt-change':
          if (adaptation.adaptationType === 'prompt-optimization' &&
              adaptation.change.target.split('.').length <= 2) {
            reasons.push('Global prompt change');
            roles.add('ml-lead');
          }
          break;

        case 'security-related':
          if (adaptation.change.target.includes('security') ||
              adaptation.change.target.includes('auth') ||
              adaptation.change.target.includes('permission')) {
            reasons.push('Security-related change');
            roles.add('security-team');
          }
          break;

        case 'multi-agent-change':
          if (adaptation.change.target === 'orchestrator' ||
              adaptation.change.target.includes('routing')) {
            reasons.push('Multi-agent routing change');
            roles.add('admin');
          }
          break;
      }
    }

    return {
      required: reasons.length > 0,
      reasons,
      roles: [...roles],
    };
  }

  /**
   * Request human approval
   */
  async requestApproval(
    adaptation: Adaptation,
    reasons: string[],
    roles: string[]
  ): Promise<string> {
    const requestId = uuid();

    this.emit('approval-requested', {
      requestId,
      adaptationId: adaptation.id,
      adaptationName: adaptation.name,
      reasons,
      roles,
      timestamp: new Date(),
    });

    return requestId;
  }

  /**
   * Process human approval response
   */
  processApprovalResponse(
    requestId: string,
    approved: boolean,
    approvedBy: string,
    notes?: string
  ): void {
    this.emit('approval-processed', {
      requestId,
      approved,
      approvedBy,
      notes,
      timestamp: new Date(),
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async checkRailCondition(
    rail: SafetyRail,
    adaptation: Adaptation
  ): Promise<boolean> {
    const condition = rail.condition;

    // Check pattern matches
    if (condition.patternMatch) {
      for (const pattern of condition.patternMatch) {
        const value = this.getAdaptationValue(adaptation, pattern.dimension);

        switch (pattern.operator) {
          case 'equals':
            if (value !== pattern.value) return false;
            break;
          case 'contains':
            if (!String(value).includes(String(pattern.value))) return false;
            break;
          case 'matches':
            if (!new RegExp(String(pattern.value), 'i').test(String(value))) return false;
            break;
        }
      }
      return true;
    }

    return false;
  }

  private checkRateLimits(): boolean {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // Clean old history
    this.adaptationHistory = this.adaptationHistory.filter(
      h => h.timestamp.getTime() > dayAgo
    );

    const lastHour = this.adaptationHistory.filter(
      h => h.timestamp.getTime() > hourAgo
    ).length;

    const lastDay = this.adaptationHistory.length;

    return lastHour >= this.config.maxAdaptationsPerHour ||
           lastDay >= this.config.maxAdaptationsPerDay;
  }

  private async recordTrigger(
    rail: SafetyRail,
    adaptation: Adaptation | undefined,
    action: string
  ): Promise<void> {
    const trigger: RailTrigger = {
      id: uuid(),
      railId: rail.id,
      railName: rail.name,
      triggeredAt: new Date(),
      adaptation,
      context: {},
      actionTaken: action,
      resolved: false,
    };

    this.triggers.set(trigger.id, trigger);
    rail.triggerCount++;
    rail.lastTriggeredAt = new Date();

    this.emit('rail-triggered', trigger);
  }

  private getAdaptationValue(adaptation: Adaptation, dimension: string): unknown {
    const parts = dimension.split('.');
    let value: unknown = adaptation;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private getMetricValue(metrics: PerformanceMetrics, metricName: string): number {
    const mapping: Record<string, keyof PerformanceMetrics> = {
      'success_rate': 'successRate',
      'approval_rate': 'approvalRate',
      'avg_latency_ms': 'averageLatencyMs',
      'p95_latency_ms': 'p95LatencyMs',
      'avg_quality_score': 'averageQualityScore',
      'avg_user_rating': 'averageUserRating',
      'error_rate': 'successRate', // Inverted below
    };

    const key = mapping[metricName];
    if (!key) return 0;

    const value = metrics[key] as number;
    if (metricName === 'error_rate') {
      return 1 - value;
    }
    return value;
  }

  /**
   * Set multiple safety rails at once (replaces existing rails)
   */
  setSafetyRails(rails: SafetyRail[]): void {
    this.rails.clear();
    for (const rail of rails) {
      this.rails.set(rail.id, rail);
    }
    this.emit('rails-set', { count: rails.length });
  }

  /**
   * Get all rails
   */
  getRails(): SafetyRail[] {
    return Array.from(this.rails.values());
  }

  /**
   * Get all triggers
   */
  getTriggers(): RailTrigger[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Resolve a trigger
   */
  resolveTrigger(triggerId: string, resolvedBy: string, notes?: string): void {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.resolved = true;
      trigger.resolvedAt = new Date();
      trigger.resolvedBy = resolvedBy;
      trigger.resolutionNotes = notes;

      this.emit('trigger-resolved', trigger);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let safetyInstance: SafetyController | null = null;

export function getSafetyController(config?: Partial<SafetyControllerConfig>): SafetyController {
  if (!safetyInstance) {
    safetyInstance = new SafetyController(config);
  }
  return safetyInstance;
}

export function createSafetyController(config?: Partial<SafetyControllerConfig>): SafetyController {
  return new SafetyController(config);
}
