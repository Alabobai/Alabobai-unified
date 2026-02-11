/**
 * Alabobai Financial Guardian - Budget Manager
 * Comprehensive budget caps: daily, weekly, monthly, per-task, per-agent
 *
 * Features: Hard/soft limits, alerts, permission requests, rollover credits
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Budget period types
 */
export type BudgetPeriod = 'task' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'lifetime';

/**
 * Budget enforcement mode
 */
export type EnforcementMode = 'hard' | 'soft' | 'warn-only';

/**
 * Budget scope
 */
export interface BudgetScope {
  userId?: string;
  agentId?: string;
  taskType?: string;
  model?: string;
  tag?: string;
}

/**
 * Budget configuration
 */
export interface Budget {
  id: string;
  name: string;
  description?: string;

  // Limits
  limit: number;           // Amount in USD
  period: BudgetPeriod;
  enforcement: EnforcementMode;

  // Scope
  scope: BudgetScope;

  // Alerts
  alertThresholds: number[]; // e.g., [0.5, 0.8, 0.95] for 50%, 80%, 95%
  alertsEnabled: boolean;

  // Rollover
  rolloverEnabled: boolean;
  rolloverCap?: number;    // Maximum rollover amount

  // State
  currentSpend: number;
  rolloverCredits: number;
  periodStart: Date;
  periodEnd: Date;

  // Tracking
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  allowed: boolean;
  budgetId: string;
  budgetName: string;

  // Current state
  currentSpend: number;
  limit: number;
  effectiveLimit: number;  // limit + rolloverCredits
  remaining: number;
  percentageUsed: number;

  // Request details
  requestedAmount: number;
  wouldExceed: boolean;
  overageAmount: number;

  // Enforcement
  enforcement: EnforcementMode;
  requiresApproval: boolean;

  // Messages
  message: string;
  warnings: string[];
}

/**
 * Multi-budget check result
 */
export interface MultiBudgetCheckResult {
  allowed: boolean;
  results: BudgetCheckResult[];
  blockedBy: string[]; // Budget IDs that would block
  requiresApproval: boolean;
  approvalReason?: string;
  totalWarnings: string[];
}

/**
 * Budget alert
 */
export interface BudgetAlert {
  id: string;
  budgetId: string;
  budgetName: string;
  threshold: number;
  currentSpend: number;
  limit: number;
  percentageUsed: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: Date;
  acknowledged: boolean;
}

/**
 * Permission request for exceeding soft limits
 */
export interface BudgetPermissionRequest {
  id: string;
  budgetId: string;
  budgetName: string;
  requestedAmount: number;
  currentSpend: number;
  limit: number;
  overageAmount: number;
  reason: string;
  taskDescription: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
  respondedBy?: string;
  responseReason?: string;
}

/**
 * Budget rollover event
 */
export interface RolloverEvent {
  budgetId: string;
  previousPeriodEnd: Date;
  unusedAmount: number;
  rolledOverAmount: number;
  cappedAmount: number;
  newTotal: number;
  timestamp: Date;
}

// ============================================================================
// BUDGET MANAGER CLASS
// ============================================================================

export class BudgetManager extends EventEmitter {
  private budgets: Map<string, Budget> = new Map();
  private alerts: BudgetAlert[] = [];
  private permissionRequests: Map<string, BudgetPermissionRequest> = new Map();
  private triggeredAlerts: Set<string> = new Set(); // Track already-triggered alerts

  constructor() {
    super();
    this.setupDefaultBudgets();
  }

  /**
   * Create a new budget
   */
  createBudget(params: Omit<Budget, 'id' | 'currentSpend' | 'rolloverCredits' | 'periodStart' | 'periodEnd' | 'createdAt' | 'updatedAt'>): Budget {
    const now = new Date();
    const { periodStart, periodEnd } = this.calculatePeriodBounds(params.period, now);

    const budget: Budget = {
      ...params,
      id: this.generateBudgetId(),
      currentSpend: 0,
      rolloverCredits: 0,
      periodStart,
      periodEnd,
      createdAt: now,
      updatedAt: now,
    };

    this.budgets.set(budget.id, budget);
    this.emit('budget-created', budget);
    return budget;
  }

  /**
   * Update an existing budget
   */
  updateBudget(budgetId: string, updates: Partial<Budget>): Budget | null {
    const budget = this.budgets.get(budgetId);
    if (!budget) return null;

    const updated: Budget = {
      ...budget,
      ...updates,
      id: budget.id, // Prevent ID changes
      updatedAt: new Date(),
    };

    this.budgets.set(budgetId, updated);
    this.emit('budget-updated', updated);
    return updated;
  }

  /**
   * Delete a budget
   */
  deleteBudget(budgetId: string): boolean {
    const budget = this.budgets.get(budgetId);
    if (!budget) return false;

    this.budgets.delete(budgetId);
    this.emit('budget-deleted', budget);
    return true;
  }

  /**
   * Get a budget by ID
   */
  getBudget(budgetId: string): Budget | undefined {
    return this.budgets.get(budgetId);
  }

  /**
   * Get all budgets
   */
  getAllBudgets(): Budget[] {
    return Array.from(this.budgets.values());
  }

  /**
   * Get budgets matching a scope
   */
  getBudgetsForScope(scope: BudgetScope): Budget[] {
    return Array.from(this.budgets.values()).filter(budget => {
      if (!budget.isActive) return false;

      // Check each scope property
      if (budget.scope.userId && budget.scope.userId !== scope.userId) return false;
      if (budget.scope.agentId && budget.scope.agentId !== scope.agentId) return false;
      if (budget.scope.taskType && budget.scope.taskType !== scope.taskType) return false;
      if (budget.scope.model && budget.scope.model !== scope.model) return false;
      if (budget.scope.tag && budget.scope.tag !== scope.tag) return false;

      return true;
    });
  }

  /**
   * Check if spending is allowed against all applicable budgets
   */
  checkBudget(amount: number, scope: BudgetScope): MultiBudgetCheckResult {
    const applicableBudgets = this.getBudgetsForScope(scope);

    // Also get global budgets (no scope restrictions)
    const globalBudgets = Array.from(this.budgets.values()).filter(
      b => b.isActive && Object.keys(b.scope).length === 0
    );

    const allBudgets = [...applicableBudgets, ...globalBudgets];
    const uniqueBudgets = Array.from(new Map(allBudgets.map(b => [b.id, b])).values());

    // Check each budget
    const results: BudgetCheckResult[] = [];
    const blockedBy: string[] = [];
    const totalWarnings: string[] = [];
    let requiresApproval = false;

    for (const budget of uniqueBudgets) {
      // Check if period needs to be rolled over
      this.checkAndRolloverBudget(budget);

      const result = this.checkSingleBudget(budget, amount);
      results.push(result);

      if (!result.allowed) {
        blockedBy.push(budget.id);
      }
      if (result.requiresApproval) {
        requiresApproval = true;
      }
      totalWarnings.push(...result.warnings);
    }

    const allowed = blockedBy.length === 0 && !requiresApproval;

    return {
      allowed,
      results,
      blockedBy,
      requiresApproval,
      approvalReason: requiresApproval
        ? `Spending would exceed soft budget limit(s): ${results.filter(r => r.requiresApproval).map(r => r.budgetName).join(', ')}`
        : undefined,
      totalWarnings,
    };
  }

  /**
   * Record spending against budgets
   */
  recordSpending(amount: number, scope: BudgetScope): void {
    const applicableBudgets = this.getBudgetsForScope(scope);
    const globalBudgets = Array.from(this.budgets.values()).filter(
      b => b.isActive && Object.keys(b.scope).length === 0
    );
    const allBudgets = [...applicableBudgets, ...globalBudgets];
    const uniqueBudgets = Array.from(new Map(allBudgets.map(b => [b.id, b])).values());

    for (const budget of uniqueBudgets) {
      // Check if period needs to be rolled over
      this.checkAndRolloverBudget(budget);

      budget.currentSpend += amount;
      budget.updatedAt = new Date();

      // Check for alerts
      this.checkAlerts(budget);

      this.emit('spending-recorded', { budgetId: budget.id, amount, newTotal: budget.currentSpend });
    }
  }

  /**
   * Request permission to exceed a soft budget
   */
  requestPermission(
    budgetId: string,
    requestedAmount: number,
    taskDescription: string,
    reason: string
  ): BudgetPermissionRequest | null {
    const budget = this.budgets.get(budgetId);
    if (!budget || budget.enforcement !== 'soft') return null;

    const request: BudgetPermissionRequest = {
      id: this.generateRequestId(),
      budgetId,
      budgetName: budget.name,
      requestedAmount,
      currentSpend: budget.currentSpend,
      limit: budget.limit,
      overageAmount: Math.max(0, budget.currentSpend + requestedAmount - budget.limit - budget.rolloverCredits),
      reason,
      taskDescription,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minute expiry
    };

    this.permissionRequests.set(request.id, request);
    this.emit('permission-requested', request);
    return request;
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    requestId: string,
    approved: boolean,
    respondedBy: string,
    responseReason?: string
  ): BudgetPermissionRequest | null {
    const request = this.permissionRequests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    request.status = approved ? 'approved' : 'denied';
    request.respondedAt = new Date();
    request.respondedBy = respondedBy;
    request.responseReason = responseReason;

    this.emit('permission-responded', request);
    return request;
  }

  /**
   * Get pending permission requests
   */
  getPendingPermissions(): BudgetPermissionRequest[] {
    const now = new Date();
    return Array.from(this.permissionRequests.values())
      .filter(r => r.status === 'pending' && r.expiresAt > now);
  }

  /**
   * Get all alerts
   */
  getAlerts(unacknowledgedOnly: boolean = false): BudgetAlert[] {
    if (unacknowledgedOnly) {
      return this.alerts.filter(a => !a.acknowledged);
    }
    return [...this.alerts];
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    this.emit('alert-acknowledged', alert);
    return true;
  }

  /**
   * Add rollover credits manually
   */
  addRolloverCredits(budgetId: string, amount: number): boolean {
    const budget = this.budgets.get(budgetId);
    if (!budget) return false;

    budget.rolloverCredits += amount;
    budget.updatedAt = new Date();

    this.emit('credits-added', { budgetId, amount, newTotal: budget.rolloverCredits });
    return true;
  }

  /**
   * Process refund - add credits back
   */
  processRefund(amount: number, scope: BudgetScope, reason: string): void {
    const applicableBudgets = this.getBudgetsForScope(scope);

    for (const budget of applicableBudgets) {
      budget.currentSpend = Math.max(0, budget.currentSpend - amount);
      budget.updatedAt = new Date();

      this.emit('refund-processed', { budgetId: budget.id, amount, reason, newSpend: budget.currentSpend });
    }
  }

  /**
   * Get budget status summary
   */
  getBudgetStatus(budgetId: string): {
    budget: Budget;
    effectiveLimit: number;
    remaining: number;
    percentageUsed: number;
    status: 'ok' | 'warning' | 'critical' | 'exceeded';
    nextReset: Date;
  } | null {
    const budget = this.budgets.get(budgetId);
    if (!budget) return null;

    const effectiveLimit = budget.limit + budget.rolloverCredits;
    const remaining = Math.max(0, effectiveLimit - budget.currentSpend);
    const percentageUsed = effectiveLimit > 0 ? (budget.currentSpend / effectiveLimit) * 100 : 0;

    let status: 'ok' | 'warning' | 'critical' | 'exceeded';
    if (percentageUsed >= 100) {
      status = 'exceeded';
    } else if (percentageUsed >= 95) {
      status = 'critical';
    } else if (percentageUsed >= 80) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    return {
      budget,
      effectiveLimit,
      remaining,
      percentageUsed,
      status,
      nextReset: budget.periodEnd,
    };
  }

  /**
   * Get all budget statuses
   */
  getAllBudgetStatuses(): ReturnType<BudgetManager['getBudgetStatus']>[] {
    return Array.from(this.budgets.keys())
      .map(id => this.getBudgetStatus(id))
      .filter((status): status is NonNullable<typeof status> => status !== null);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Setup default budgets
   */
  private setupDefaultBudgets(): void {
    // Default daily budget - soft limit
    this.createBudget({
      name: 'Default Daily Budget',
      description: 'Default daily spending limit for all users',
      limit: 10.00,
      period: 'daily',
      enforcement: 'soft',
      scope: {},
      alertThresholds: [0.5, 0.8, 0.95],
      alertsEnabled: true,
      rolloverEnabled: true,
      rolloverCap: 50.00,
      isActive: true,
    });

    // Default weekly budget - soft limit
    this.createBudget({
      name: 'Default Weekly Budget',
      description: 'Default weekly spending limit for all users',
      limit: 50.00,
      period: 'weekly',
      enforcement: 'soft',
      scope: {},
      alertThresholds: [0.5, 0.8, 0.95],
      alertsEnabled: true,
      rolloverEnabled: true,
      rolloverCap: 100.00,
      isActive: true,
    });

    // Default per-task budget - hard limit
    this.createBudget({
      name: 'Per-Task Maximum',
      description: 'Maximum spending for a single task',
      limit: 5.00,
      period: 'task',
      enforcement: 'hard',
      scope: {},
      alertThresholds: [0.5, 0.8],
      alertsEnabled: true,
      rolloverEnabled: false,
      isActive: true,
    });
  }

  /**
   * Check a single budget against a spending amount
   */
  private checkSingleBudget(budget: Budget, amount: number): BudgetCheckResult {
    const effectiveLimit = budget.limit + budget.rolloverCredits;
    const remaining = Math.max(0, effectiveLimit - budget.currentSpend);
    const percentageUsed = effectiveLimit > 0 ? (budget.currentSpend / effectiveLimit) * 100 : 0;
    const wouldExceed = budget.currentSpend + amount > effectiveLimit;
    const overageAmount = Math.max(0, budget.currentSpend + amount - effectiveLimit);

    const warnings: string[] = [];
    if (percentageUsed >= 80) {
      warnings.push(`Budget "${budget.name}" is at ${percentageUsed.toFixed(1)}%`);
    }
    if (wouldExceed && budget.enforcement === 'warn-only') {
      warnings.push(`This would exceed budget "${budget.name}" by $${overageAmount.toFixed(2)}`);
    }

    let allowed = true;
    let requiresApproval = false;
    let message = 'Spending allowed';

    if (wouldExceed) {
      switch (budget.enforcement) {
        case 'hard':
          allowed = false;
          message = `Budget "${budget.name}" would be exceeded. Remaining: $${remaining.toFixed(2)}`;
          break;
        case 'soft':
          allowed = false;
          requiresApproval = true;
          message = `Budget "${budget.name}" would be exceeded. Approval required.`;
          break;
        case 'warn-only':
          allowed = true;
          message = `Warning: Budget "${budget.name}" will be exceeded`;
          break;
      }
    }

    return {
      allowed,
      budgetId: budget.id,
      budgetName: budget.name,
      currentSpend: budget.currentSpend,
      limit: budget.limit,
      effectiveLimit,
      remaining,
      percentageUsed,
      requestedAmount: amount,
      wouldExceed,
      overageAmount,
      enforcement: budget.enforcement,
      requiresApproval,
      message,
      warnings,
    };
  }

  /**
   * Check and process period rollover
   */
  private checkAndRolloverBudget(budget: Budget): void {
    const now = new Date();

    if (now >= budget.periodEnd) {
      // Process rollover
      if (budget.rolloverEnabled) {
        const unusedAmount = Math.max(0, budget.limit + budget.rolloverCredits - budget.currentSpend);
        let rolledOverAmount = unusedAmount;

        // Apply cap if set
        if (budget.rolloverCap !== undefined) {
          rolledOverAmount = Math.min(rolledOverAmount, budget.rolloverCap);
        }

        const rolloverEvent: RolloverEvent = {
          budgetId: budget.id,
          previousPeriodEnd: budget.periodEnd,
          unusedAmount,
          rolledOverAmount,
          cappedAmount: unusedAmount - rolledOverAmount,
          newTotal: rolledOverAmount,
          timestamp: now,
        };

        budget.rolloverCredits = rolledOverAmount;
        this.emit('rollover-processed', rolloverEvent);
      } else {
        budget.rolloverCredits = 0;
      }

      // Reset spending and advance period
      const { periodStart, periodEnd } = this.calculatePeriodBounds(budget.period, now);
      budget.currentSpend = 0;
      budget.periodStart = periodStart;
      budget.periodEnd = periodEnd;
      budget.updatedAt = now;

      // Clear triggered alerts for new period
      this.triggeredAlerts = new Set(
        Array.from(this.triggeredAlerts).filter(key => !key.startsWith(budget.id))
      );

      this.emit('budget-reset', budget);
    }
  }

  /**
   * Check and trigger alerts
   */
  private checkAlerts(budget: Budget): void {
    if (!budget.alertsEnabled) return;

    const effectiveLimit = budget.limit + budget.rolloverCredits;
    const percentageUsed = effectiveLimit > 0 ? budget.currentSpend / effectiveLimit : 0;

    for (const threshold of budget.alertThresholds) {
      const alertKey = `${budget.id}:${threshold}`;

      if (percentageUsed >= threshold && !this.triggeredAlerts.has(alertKey)) {
        const alert: BudgetAlert = {
          id: this.generateAlertId(),
          budgetId: budget.id,
          budgetName: budget.name,
          threshold,
          currentSpend: budget.currentSpend,
          limit: effectiveLimit,
          percentageUsed: percentageUsed * 100,
          message: `Budget "${budget.name}" has reached ${(percentageUsed * 100).toFixed(1)}% ($${budget.currentSpend.toFixed(2)} / $${effectiveLimit.toFixed(2)})`,
          severity: threshold >= 0.95 ? 'critical' : threshold >= 0.8 ? 'warning' : 'info',
          createdAt: new Date(),
          acknowledged: false,
        };

        this.alerts.push(alert);
        this.triggeredAlerts.add(alertKey);

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
          this.alerts = this.alerts.slice(-100);
        }

        this.emit('alert-triggered', alert);
      }
    }
  }

  /**
   * Calculate period boundaries
   */
  private calculatePeriodBounds(period: BudgetPeriod, referenceDate: Date): { periodStart: Date; periodEnd: Date } {
    const now = referenceDate;

    switch (period) {
      case 'task':
        // Task budgets reset immediately
        return { periodStart: now, periodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000) };

      case 'hourly':
        const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
        return { periodStart: hourStart, periodEnd: new Date(hourStart.getTime() + 60 * 60 * 1000) };

      case 'daily':
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { periodStart: dayStart, periodEnd: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };

      case 'weekly':
        const dayOfWeek = now.getDay();
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        return { periodStart: weekStart, periodEnd: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) };

      case 'monthly':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { periodStart: monthStart, periodEnd: nextMonth };

      case 'yearly':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const nextYear = new Date(now.getFullYear() + 1, 0, 1);
        return { periodStart: yearStart, periodEnd: nextYear };

      case 'lifetime':
        return { periodStart: new Date(0), periodEnd: new Date(9999, 11, 31) };

      default:
        return { periodStart: now, periodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
    }
  }

  /**
   * Generate unique budget ID
   */
  private generateBudgetId(): string {
    return `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let budgetManagerInstance: BudgetManager | null = null;

export function getBudgetManager(): BudgetManager {
  if (!budgetManagerInstance) {
    budgetManagerInstance = new BudgetManager();
  }
  return budgetManagerInstance;
}

export function createBudgetManager(): BudgetManager {
  return new BudgetManager();
}
