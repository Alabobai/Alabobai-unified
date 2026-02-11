/**
 * PermissionManager.ts - Permission Checking System
 *
 * Evaluates whether actions are permitted based on trust level, risk assessment,
 * and contextual factors. Core component of the Trust Architecture.
 *
 * @module PermissionManager
 * @version 1.0.0
 */

import {
  TrustLevel,
  TrustLevelConfig,
  TRUST_LEVEL_CONFIGS,
  RiskLevel,
  ActionCategory,
  PermissionDecision,
  HandoffReason,
  Action,
  PermissionResult,
  TrustContext,
  CustomPermission,
  HardLimits,
  DEFAULT_HARD_LIMITS,
  riskExceedsThreshold,
  getRiskLevelValue,
} from './TrustLevel.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for the PermissionManager
 */
export interface PermissionManagerConfig {
  /** Custom trust level configurations */
  trustLevelOverrides?: Partial<Record<TrustLevel, Partial<TrustLevelConfig>>>;

  /** Global hard limits override */
  hardLimitsOverride?: Partial<HardLimits>;

  /** Enable strict mode (deny on any uncertainty) */
  strictMode?: boolean;

  /** Custom permission evaluators */
  customEvaluators?: PermissionEvaluator[];

  /** Time window for rate limiting (ms) */
  rateLimitWindow?: number;

  /** Enable detailed logging */
  verboseLogging?: boolean;
}

/**
 * Custom permission evaluator function
 */
export interface PermissionEvaluator {
  /** Evaluator name for logging */
  name: string;

  /** Priority (higher = evaluated first) */
  priority: number;

  /** Evaluation function */
  evaluate: (
    action: Action,
    context: TrustContext,
    config: TrustLevelConfig
  ) => PermissionEvaluatorResult | null;
}

/**
 * Result from a custom evaluator
 */
export interface PermissionEvaluatorResult {
  /** Decision from evaluator */
  decision: PermissionDecision;

  /** Reason for decision */
  reason: string;

  /** Whether to stop further evaluation */
  final: boolean;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Rate limit tracking entry
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Budget tracking entry
 */
interface BudgetEntry {
  spent: number;
  date: string;
}

// =============================================================================
// PERMISSION MANAGER CLASS
// =============================================================================

/**
 * Manages permission evaluation for the Trust Architecture
 */
export class PermissionManager {
  private readonly config: Required<PermissionManagerConfig>;
  private readonly trustConfigs: Map<TrustLevel, TrustLevelConfig>;
  private readonly hardLimits: HardLimits;
  private readonly rateLimits: Map<string, RateLimitEntry>;
  private readonly budgetTracking: Map<string, BudgetEntry>;
  private readonly evaluators: PermissionEvaluator[];

  constructor(config: PermissionManagerConfig = {}) {
    // Set default configuration
    this.config = {
      trustLevelOverrides: config.trustLevelOverrides ?? {},
      hardLimitsOverride: config.hardLimitsOverride ?? {},
      strictMode: config.strictMode ?? false,
      customEvaluators: config.customEvaluators ?? [],
      rateLimitWindow: config.rateLimitWindow ?? 60000, // 1 minute
      verboseLogging: config.verboseLogging ?? false,
    };

    // Initialize trust level configurations with overrides
    this.trustConfigs = new Map();
    for (const level of Object.values(TrustLevel).filter(
      (v) => typeof v === 'number'
    ) as TrustLevel[]) {
      const baseConfig = TRUST_LEVEL_CONFIGS[level];
      const override = this.config.trustLevelOverrides[level] ?? {};
      this.trustConfigs.set(level, { ...baseConfig, ...override });
    }

    // Initialize hard limits with overrides
    this.hardLimits = {
      ...DEFAULT_HARD_LIMITS,
      ...this.config.hardLimitsOverride,
    };

    // Initialize tracking maps
    this.rateLimits = new Map();
    this.budgetTracking = new Map();

    // Initialize evaluators (sorted by priority descending)
    this.evaluators = [...this.config.customEvaluators].sort(
      (a, b) => b.priority - a.priority
    );
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Check if an action is permitted
   */
  public checkPermission(
    action: Action,
    context: TrustContext
  ): PermissionResult {
    const trustConfig = this.getTrustConfig(context.trustLevel);
    const startTime = Date.now();

    try {
      // Run through evaluation chain
      const result = this.evaluateAction(action, context, trustConfig);

      if (this.config.verboseLogging) {
        console.log(
          `[PermissionManager] Evaluated ${action.type} in ${Date.now() - startTime}ms: ${result.decision}`
        );
      }

      return result;
    } catch (error) {
      // On error, default to requiring approval (fail-safe)
      return this.createResult(
        PermissionDecision.REQUIRE_APPROVAL,
        action,
        context.trustLevel,
        'Error during permission evaluation - defaulting to require approval',
        HandoffReason.ANOMALY_DETECTED
      );
    }
  }

  /**
   * Check multiple actions in batch
   */
  public checkPermissions(
    actions: Action[],
    context: TrustContext
  ): Map<string, PermissionResult> {
    const results = new Map<string, PermissionResult>();
    for (const action of actions) {
      results.set(action.id, this.checkPermission(action, context));
    }
    return results;
  }

  /**
   * Quick check if an action type is allowed at a trust level
   */
  public isActionTypeAllowed(
    actionType: string,
    category: ActionCategory,
    trustLevel: TrustLevel
  ): boolean {
    const config = this.getTrustConfig(trustLevel);
    return !config.deniedActions.includes(category);
  }

  /**
   * Get the maximum allowed risk level for a trust level
   */
  public getMaxAllowedRisk(trustLevel: TrustLevel): RiskLevel {
    const config = this.getTrustConfig(trustLevel);
    return config.maxAutoApproveRisk;
  }

  /**
   * Check if 2FA is required for an action
   */
  public requires2FA(action: Action, context: TrustContext): boolean {
    const config = this.getTrustConfig(context.trustLevel);

    // Already verified this session
    if (context.twoFactorVerified) {
      return false;
    }

    // Check if high risk and 2FA required
    if (config.require2FAForHighRisk) {
      if (
        getRiskLevelValue(action.riskLevel) >= getRiskLevelValue(RiskLevel.HIGH)
      ) {
        return true;
      }
    }

    // Check monetary threshold
    if (action.monetaryValue && action.monetaryValue > config.maxBudgetPerAction) {
      return true;
    }

    return false;
  }

  /**
   * Check if human handoff is required
   */
  public requiresHandoff(
    action: Action,
    context: TrustContext
  ): { required: boolean; reason?: HandoffReason } {
    const config = this.getTrustConfig(context.trustLevel);

    // Check periodic review
    if (config.reviewIntervalMinutes > 0 && context.lastHumanReview) {
      const minutesSinceReview =
        (Date.now() - context.lastHumanReview.getTime()) / 60000;
      if (minutesSinceReview >= config.reviewIntervalMinutes) {
        return { required: true, reason: HandoffReason.PERIODIC_REVIEW };
      }
    }

    // Check action count threshold
    if (context.sessionActionCount >= config.maxActionsWithoutCheck) {
      return { required: true, reason: HandoffReason.PERIODIC_REVIEW };
    }

    // Check error threshold
    if (context.sessionErrorCount >= 5) {
      return { required: true, reason: HandoffReason.ERROR_THRESHOLD };
    }

    // Check budget limits
    if (context.dailyBudgetSpent >= config.maxDailyBudget && config.maxDailyBudget > 0) {
      return { required: true, reason: HandoffReason.BUDGET_LIMIT };
    }

    return { required: false };
  }

  /**
   * Add a custom permission evaluator
   */
  public addEvaluator(evaluator: PermissionEvaluator): void {
    this.evaluators.push(evaluator);
    this.evaluators.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a custom permission evaluator
   */
  public removeEvaluator(name: string): boolean {
    const index = this.evaluators.findIndex((e) => e.name === name);
    if (index !== -1) {
      this.evaluators.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get trust level configuration
   */
  public getTrustConfig(level: TrustLevel): TrustLevelConfig {
    return this.trustConfigs.get(level) ?? TRUST_LEVEL_CONFIGS[level];
  }

  /**
   * Get current hard limits
   */
  public getHardLimits(): HardLimits {
    return { ...this.hardLimits };
  }

  /**
   * Reset rate limits (for testing or admin operations)
   */
  public resetRateLimits(userId?: string): void {
    if (userId) {
      this.rateLimits.delete(userId);
    } else {
      this.rateLimits.clear();
    }
  }

  /**
   * Reset budget tracking (for testing or admin operations)
   */
  public resetBudgetTracking(userId?: string): void {
    if (userId) {
      this.budgetTracking.delete(userId);
    } else {
      this.budgetTracking.clear();
    }
  }

  // ===========================================================================
  // PRIVATE EVALUATION METHODS
  // ===========================================================================

  private evaluateAction(
    action: Action,
    context: TrustContext,
    config: TrustLevelConfig
  ): PermissionResult {
    // Step 1: Check hard limits first (these always apply)
    const hardLimitResult = this.checkHardLimits(action, context);
    if (hardLimitResult) {
      return hardLimitResult;
    }

    // Step 2: Check rate limits
    const rateLimitResult = this.checkRateLimits(action, context);
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Step 3: Check custom evaluators
    const customResult = this.runCustomEvaluators(action, context, config);
    if (customResult) {
      return customResult;
    }

    // Step 4: Check custom permissions on context
    const customPermResult = this.checkCustomPermissions(action, context);
    if (customPermResult) {
      return customPermResult;
    }

    // Step 5: Check denied actions
    if (config.deniedActions.includes(action.category)) {
      return this.createResult(
        PermissionDecision.DENY,
        action,
        context.trustLevel,
        `Action category ${action.category} is denied at trust level ${config.name}`,
        HandoffReason.TRUST_LEVEL
      );
    }

    // Step 6: Check always require approval
    if (config.alwaysRequireApproval.includes(action.category)) {
      // For L5 (Enterprise), route to manager AI
      if (config.allowManagerApproval) {
        return this.createResult(
          PermissionDecision.REQUIRE_MANAGER_APPROVAL,
          action,
          context.trustLevel,
          `Action category ${action.category} requires manager AI approval`
        );
      }
      return this.createResult(
        PermissionDecision.REQUIRE_APPROVAL,
        action,
        context.trustLevel,
        `Action category ${action.category} always requires human approval at trust level ${config.name}`,
        HandoffReason.TRUST_LEVEL
      );
    }

    // Step 7: Check risk level
    if (riskExceedsThreshold(action.riskLevel, config.maxAutoApproveRisk)) {
      // Check if 2FA would satisfy the requirement
      if (this.requires2FA(action, context)) {
        return this.createResult(
          PermissionDecision.REQUIRE_2FA,
          action,
          context.trustLevel,
          `Action risk level ${action.riskLevel} exceeds auto-approve threshold - 2FA required`
        );
      }

      return this.createResult(
        PermissionDecision.REQUIRE_APPROVAL,
        action,
        context.trustLevel,
        `Action risk level ${action.riskLevel} exceeds maximum auto-approve level ${config.maxAutoApproveRisk}`,
        HandoffReason.RISK_THRESHOLD
      );
    }

    // Step 8: Check budget limits
    const budgetResult = this.checkBudgetLimits(action, context, config);
    if (budgetResult) {
      return budgetResult;
    }

    // Step 9: Check periodic review requirement
    const handoffCheck = this.requiresHandoff(action, context);
    if (handoffCheck.required) {
      return this.createResult(
        PermissionDecision.QUEUE_FOR_REVIEW,
        action,
        context.trustLevel,
        'Periodic human review required',
        handoffCheck.reason
      );
    }

    // All checks passed - allow the action
    return this.createResult(
      PermissionDecision.ALLOW,
      action,
      context.trustLevel,
      'Action permitted within trust boundaries'
    );
  }

  private checkHardLimits(
    action: Action,
    context: TrustContext
  ): PermissionResult | null {
    // Check transaction amount
    if (
      action.monetaryValue &&
      action.monetaryValue > this.hardLimits.maxTransactionAmount
    ) {
      return this.createResult(
        PermissionDecision.DENY,
        action,
        context.trustLevel,
        `Transaction amount ${action.monetaryValue} exceeds hard limit of ${this.hardLimits.maxTransactionAmount}`,
        HandoffReason.BUDGET_LIMIT
      );
    }

    // Check delete count
    if (
      action.category === ActionCategory.DELETE &&
      action.affectedCount &&
      action.affectedCount > this.hardLimits.maxDeleteCount
    ) {
      return this.createResult(
        PermissionDecision.DENY,
        action,
        context.trustLevel,
        `Delete count ${action.affectedCount} exceeds hard limit of ${this.hardLimits.maxDeleteCount}`,
        HandoffReason.RISK_THRESHOLD
      );
    }

    return null;
  }

  private checkRateLimits(
    action: Action,
    context: TrustContext
  ): PermissionResult | null {
    const key = `${context.userId}:${action.requesterType}`;
    const now = Date.now();
    const entry = this.rateLimits.get(key);

    if (entry) {
      if (now - entry.windowStart < this.config.rateLimitWindow) {
        if (entry.count >= this.hardLimits.maxActionsPerMinute) {
          return this.createResult(
            PermissionDecision.DENY,
            action,
            context.trustLevel,
            `Rate limit exceeded: ${entry.count} actions in window`,
            HandoffReason.ANOMALY_DETECTED
          );
        }
        entry.count++;
      } else {
        // Reset window
        entry.count = 1;
        entry.windowStart = now;
      }
    } else {
      this.rateLimits.set(key, { count: 1, windowStart: now });
    }

    return null;
  }

  private runCustomEvaluators(
    action: Action,
    context: TrustContext,
    config: TrustLevelConfig
  ): PermissionResult | null {
    for (const evaluator of this.evaluators) {
      try {
        const result = evaluator.evaluate(action, context, config);
        if (result) {
          const permResult = this.createResult(
            result.decision,
            action,
            context.trustLevel,
            `[${evaluator.name}] ${result.reason}`
          );
          if (result.final) {
            return permResult;
          }
        }
      } catch (error) {
        console.error(`Custom evaluator ${evaluator.name} failed:`, error);
        if (this.config.strictMode) {
          return this.createResult(
            PermissionDecision.REQUIRE_APPROVAL,
            action,
            context.trustLevel,
            `Evaluator ${evaluator.name} failed - strict mode requires approval`,
            HandoffReason.ANOMALY_DETECTED
          );
        }
      }
    }
    return null;
  }

  private checkCustomPermissions(
    action: Action,
    context: TrustContext
  ): PermissionResult | null {
    if (!context.customPermissions || context.customPermissions.length === 0) {
      return null;
    }

    const now = new Date();
    for (const permission of context.customPermissions) {
      // Check if permission applies to this action
      if (
        permission.target !== action.category &&
        permission.target !== action.type
      ) {
        continue;
      }

      // Check if permission is expired
      if (permission.expiresAt && permission.expiresAt < now) {
        continue;
      }

      return this.createResult(
        permission.decision,
        action,
        context.trustLevel,
        `Custom permission: ${permission.reason} (granted by ${permission.grantedBy})`
      );
    }

    return null;
  }

  private checkBudgetLimits(
    action: Action,
    context: TrustContext,
    config: TrustLevelConfig
  ): PermissionResult | null {
    if (!action.monetaryValue || action.monetaryValue <= 0) {
      return null;
    }

    // Check per-action budget
    if (
      config.maxBudgetPerAction > 0 &&
      action.monetaryValue > config.maxBudgetPerAction
    ) {
      return this.createResult(
        PermissionDecision.REQUIRE_APPROVAL,
        action,
        context.trustLevel,
        `Action cost ${action.monetaryValue} exceeds per-action limit of ${config.maxBudgetPerAction}`,
        HandoffReason.BUDGET_LIMIT
      );
    }

    // Check daily budget
    if (config.maxDailyBudget > 0) {
      const today = new Date().toISOString().split('T')[0];
      const budgetKey = `${context.userId}:${today}`;
      const entry = this.budgetTracking.get(budgetKey);
      const currentSpent = entry?.spent ?? context.dailyBudgetSpent;

      if (currentSpent + action.monetaryValue > config.maxDailyBudget) {
        return this.createResult(
          PermissionDecision.REQUIRE_APPROVAL,
          action,
          context.trustLevel,
          `Daily budget would exceed limit: ${currentSpent} + ${action.monetaryValue} > ${config.maxDailyBudget}`,
          HandoffReason.BUDGET_LIMIT
        );
      }

      // Track budget (will be confirmed in audit log)
      this.budgetTracking.set(budgetKey, {
        spent: currentSpent + action.monetaryValue,
        date: today,
      });
    }

    return null;
  }

  private createResult(
    decision: PermissionDecision,
    action: Action,
    trustLevel: TrustLevel,
    reason: string,
    handoffReason?: HandoffReason
  ): PermissionResult {
    const result: PermissionResult = {
      decision,
      action,
      trustLevel,
      reason,
      decidedAt: new Date(),
    };

    if (handoffReason) {
      result.handoffReason = handoffReason;
    }

    // Add expiry for approvals
    if (
      decision === PermissionDecision.REQUIRE_APPROVAL ||
      decision === PermissionDecision.REQUIRE_2FA ||
      decision === PermissionDecision.REQUIRE_MANAGER_APPROVAL
    ) {
      result.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    // Add alternatives for denials
    if (decision === PermissionDecision.DENY) {
      result.alternatives = this.suggestAlternatives(action, trustLevel);
    }

    return result;
  }

  private suggestAlternatives(
    action: Action,
    trustLevel: TrustLevel
  ): string[] {
    const alternatives: string[] = [];

    if (action.category === ActionCategory.DELETE) {
      alternatives.push('Consider using soft-delete instead');
      alternatives.push('Archive the resource rather than deleting');
    }

    if (action.monetaryValue) {
      const config = this.getTrustConfig(trustLevel);
      if (action.monetaryValue > config.maxBudgetPerAction) {
        alternatives.push(
          `Split into multiple transactions under ${config.maxBudgetPerAction / 100}`
        );
      }
    }

    if (action.affectedCount && action.affectedCount > 100) {
      alternatives.push('Process in smaller batches');
    }

    alternatives.push('Request human approval for this specific action');
    alternatives.push('Request temporary trust level elevation');

    return alternatives;
  }
}

// =============================================================================
// FACTORY & SINGLETON
// =============================================================================

let defaultInstance: PermissionManager | null = null;

/**
 * Get or create the default PermissionManager instance
 */
export function getPermissionManager(
  config?: PermissionManagerConfig
): PermissionManager {
  if (!defaultInstance || config) {
    defaultInstance = new PermissionManager(config);
  }
  return defaultInstance;
}

/**
 * Reset the default instance (for testing)
 */
export function resetPermissionManager(): void {
  defaultInstance = null;
}

// =============================================================================
// BUILT-IN EVALUATORS
// =============================================================================

/**
 * Evaluator that checks for suspicious patterns
 */
export const suspiciousPatternEvaluator: PermissionEvaluator = {
  name: 'suspicious-pattern',
  priority: 100,
  evaluate: (action, context) => {
    // Check for unusual timing (very late night in user's timezone)
    const hour = new Date().getHours();
    if (
      (hour >= 2 && hour <= 5) &&
      getRiskLevelValue(action.riskLevel) >= getRiskLevelValue(RiskLevel.MEDIUM)
    ) {
      return {
        decision: PermissionDecision.REQUIRE_APPROVAL,
        reason: 'Unusual timing detected for medium+ risk action',
        final: false,
      };
    }

    // Check for rapid-fire high-value actions
    if (
      context.sessionActionCount > 10 &&
      action.monetaryValue &&
      action.monetaryValue > 10000
    ) {
      return {
        decision: PermissionDecision.REQUIRE_2FA,
        reason: 'Multiple high-value actions in session',
        final: false,
      };
    }

    return null;
  },
};

/**
 * Evaluator that enforces organization policies
 */
export const organizationPolicyEvaluator: PermissionEvaluator = {
  name: 'organization-policy',
  priority: 90,
  evaluate: (action, context) => {
    // Example: Deny certain actions for specific roles
    if (
      context.role === 'readonly' &&
      [ActionCategory.CREATE, ActionCategory.UPDATE, ActionCategory.DELETE].includes(
        action.category
      )
    ) {
      return {
        decision: PermissionDecision.DENY,
        reason: 'Read-only role cannot perform write operations',
        final: true,
      };
    }

    return null;
  },
};

export default PermissionManager;
