/**
 * Alabobai Financial Guardian - Main Orchestrator
 * Complete financial protection for AI operations
 *
 * Prevents: "400 credits gone without warning", "$1000 on one bug fix"
 *
 * Features:
 * - Pre-task cost estimation
 * - Real-time spending tracking
 * - Budget enforcement with hard/soft limits
 * - Permission requests before exceeding limits
 * - Complete audit trail
 * - Itemized billing
 * - Instant refunds
 * - Credits roll over forever
 */

import { EventEmitter } from 'events';
import {
  CostEstimator,
  getCostEstimator,
  CostEstimate,
  EstimationParams,
  LLMProvider,
  MODEL_PRICING,
} from './CostEstimator.js';
import {
  SpendingTracker,
  getSpendingTracker,
  SpendingRecord,
  DashboardData,
  SpendingSummary,
} from './SpendingTracker.js';
import {
  BudgetManager,
  getBudgetManager,
  Budget,
  BudgetScope,
  MultiBudgetCheckResult,
  BudgetPermissionRequest,
  BudgetAlert,
} from './BudgetManager.js';
import {
  TokenAudit,
  getTokenAudit,
  AuditEntry,
  AuditSummary,
  ItemizedInvoice,
} from './TokenAudit.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Task execution context for financial tracking
 */
export interface TaskContext {
  taskId: string;
  sessionId: string;
  userId: string;
  agentId?: string;
  taskDescription: string;
  taskType: string;
  model: string;
  provider: LLMProvider;
  estimateId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Pre-flight check result before task execution
 */
export interface PreFlightResult {
  approved: boolean;
  estimate: CostEstimate;
  budgetCheck: MultiBudgetCheckResult;
  requiresUserApproval: boolean;
  approvalReason?: string;
  warnings: string[];
  suggestions: string[];
}

/**
 * Post-task completion report
 */
export interface CompletionReport {
  taskId: string;
  estimate: CostEstimate | null;
  actualCost: number;
  actualTokens: {
    input: number;
    output: number;
    cache: number;
    total: number;
  };
  variance: {
    cost: number;       // Difference in dollars
    percentage: number; // Percentage over/under
  };
  duration: {
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  };
  budgetImpact: {
    dailyRemaining: number;
    weeklyRemaining: number;
    monthlyRemaining: number;
  };
  auditEntries: string[]; // Entry IDs
  spendingRecordId: string;
}

/**
 * Refund request
 */
export interface RefundRequest {
  id: string;
  taskId: string;
  userId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'processed';
  createdAt: Date;
  processedAt?: Date;
  processedBy?: string;
  responseReason?: string;
}

/**
 * User credit balance
 */
export interface CreditBalance {
  userId: string;
  available: number;
  pending: number;   // Pending refunds
  lifetime: number;  // Total credits ever received
  used: number;      // Total credits ever used
  expired: number;   // Credits that expired (should be 0 with forever rollover)
  lastUpdated: Date;
}

/**
 * Financial Guardian configuration
 */
export interface FinancialGuardianConfig {
  // Default budgets
  defaultDailyBudget: number;
  defaultWeeklyBudget: number;
  defaultMonthlyBudget: number;
  defaultTaskBudget: number;

  // Approval thresholds
  autoApproveUnder: number;     // Auto-approve tasks estimated under this amount
  warnAbove: number;            // Show warning for estimates above this
  requireApprovalAbove: number; // Require explicit approval above this

  // Safety settings
  hardStopEnabled: boolean;      // Completely stop on budget exceeded
  rolloverEnabled: boolean;      // Credits roll over forever
  estimationRequired: boolean;   // Require cost estimate before all tasks

  // Notifications
  alertOnSpike: boolean;
  alertOnBudgetThreshold: boolean;
  alertThresholds: number[];    // e.g., [0.5, 0.8, 0.95]
}

/**
 * Active task tracking
 */
interface ActiveTask {
  context: TaskContext;
  estimate: CostEstimate;
  startedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

// ============================================================================
// FINANCIAL GUARDIAN CLASS
// ============================================================================

export class FinancialGuardian extends EventEmitter {
  private costEstimator: CostEstimator;
  private spendingTracker: SpendingTracker;
  private budgetManager: BudgetManager;
  private tokenAudit: TokenAudit;

  private config: FinancialGuardianConfig;
  private activeTasks: Map<string, ActiveTask> = new Map();
  private refundRequests: Map<string, RefundRequest> = new Map();
  private creditBalances: Map<string, CreditBalance> = new Map();
  private pendingApprovals: Map<string, { context: TaskContext; estimate: CostEstimate; resolve: (approved: boolean) => void }> = new Map();

  constructor(config?: Partial<FinancialGuardianConfig>) {
    super();

    // Initialize components
    this.costEstimator = getCostEstimator();
    this.spendingTracker = getSpendingTracker();
    this.budgetManager = getBudgetManager();
    this.tokenAudit = getTokenAudit();

    // Default configuration
    this.config = {
      defaultDailyBudget: 10.00,
      defaultWeeklyBudget: 50.00,
      defaultMonthlyBudget: 150.00,
      defaultTaskBudget: 5.00,
      autoApproveUnder: 0.10,
      warnAbove: 0.50,
      requireApprovalAbove: 2.00,
      hardStopEnabled: true,
      rolloverEnabled: true,
      estimationRequired: true,
      alertOnSpike: true,
      alertOnBudgetThreshold: true,
      alertThresholds: [0.5, 0.8, 0.95],
      ...config,
    };

    // Set up event forwarding
    this.setupEventForwarding();

    // Update spending tracker with budget info
    this.spendingTracker.setBudgets(
      this.config.defaultDailyBudget,
      this.config.defaultWeeklyBudget,
      this.config.defaultMonthlyBudget
    );
  }

  // ============================================================================
  // MAIN WORKFLOW METHODS
  // ============================================================================

  /**
   * Pre-flight check: Estimate cost and check budgets BEFORE task execution
   */
  async preflight(context: TaskContext): Promise<PreFlightResult> {
    // Generate cost estimate
    const estimate = this.costEstimator.estimate({
      taskDescription: context.taskDescription,
      model: context.model,
      provider: context.provider,
      includeTools: true,
    });

    // Check all applicable budgets
    const scope: BudgetScope = {
      userId: context.userId,
      agentId: context.agentId,
      taskType: context.taskType,
      model: context.model,
    };
    const budgetCheck = this.budgetManager.checkBudget(estimate.maxCost, scope);

    // Determine if user approval is needed
    const requiresUserApproval =
      budgetCheck.requiresApproval ||
      estimate.totalCost >= this.config.requireApprovalAbove ||
      estimate.warnings.length > 0;

    // Generate warnings and suggestions
    const warnings: string[] = [...estimate.warnings, ...budgetCheck.totalWarnings];
    const suggestions: string[] = [];

    // Add suggestions for cost reduction
    if (estimate.totalCost > this.config.warnAbove) {
      suggestions.push('Consider using a smaller model for simple tasks');
      if (estimate.complexity === 'extreme') {
        suggestions.push('Break this task into smaller subtasks');
      }
    }

    // Check if cheaper model available
    const cheaperModel = this.suggestCheaperModel(context.model, context.provider);
    if (cheaperModel && estimate.totalCost > 0.10) {
      const cheaperEstimate = this.costEstimator.estimate({
        taskDescription: context.taskDescription,
        model: cheaperModel.model,
        provider: cheaperModel.provider,
      });
      if (cheaperEstimate.totalCost < estimate.totalCost * 0.5) {
        suggestions.push(
          `Switch to ${cheaperModel.model} to save ~$${(estimate.totalCost - cheaperEstimate.totalCost).toFixed(2)}`
        );
      }
    }

    const approved = budgetCheck.allowed &&
      !requiresUserApproval &&
      estimate.totalCost < this.config.autoApproveUnder;

    const result: PreFlightResult = {
      approved,
      estimate,
      budgetCheck,
      requiresUserApproval,
      approvalReason: requiresUserApproval
        ? this.formatApprovalReason(estimate, budgetCheck)
        : undefined,
      warnings,
      suggestions,
    };

    this.emit('preflight-complete', result);
    return result;
  }

  /**
   * Request user approval for a task
   */
  requestApproval(context: TaskContext, estimate: CostEstimate): Promise<boolean> {
    return new Promise((resolve) => {
      const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      this.pendingApprovals.set(approvalId, { context, estimate, resolve });

      this.emit('approval-requested', {
        approvalId,
        context,
        estimate,
        message: this.formatApprovalRequest(context, estimate),
      });

      // Auto-expire after 5 minutes
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve(false);
          this.emit('approval-expired', { approvalId });
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Respond to an approval request
   */
  respondToApproval(approvalId: string, approved: boolean, respondedBy?: string): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;

    pending.resolve(approved);
    this.pendingApprovals.delete(approvalId);

    this.emit('approval-responded', { approvalId, approved, respondedBy });
    return true;
  }

  /**
   * Start tracking a task (call after approval)
   */
  startTask(context: TaskContext, estimate: CostEstimate): void {
    const activeTask: ActiveTask = {
      context,
      estimate,
      startedAt: new Date(),
    };

    this.activeTasks.set(context.taskId, activeTask);
    this.emit('task-started', { taskId: context.taskId, estimate });
  }

  /**
   * Record token usage during task execution
   */
  recordUsage(params: {
    taskId: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    operation?: string;
    processingTimeMs?: number;
  }): AuditEntry[] {
    const activeTask = this.activeTasks.get(params.taskId);
    if (!activeTask) {
      throw new Error(`No active task found with ID: ${params.taskId}`);
    }

    const { context } = activeTask;
    const pricing = this.costEstimator.getModelPricing(context.model, context.provider);

    return this.tokenAudit.logApiCall({
      taskId: context.taskId,
      sessionId: context.sessionId,
      userId: context.userId,
      agentId: context.agentId,
      model: context.model,
      provider: context.provider,
      operation: params.operation || 'chat',
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cacheReadTokens: params.cacheReadTokens,
      cacheWriteTokens: params.cacheWriteTokens,
      inputPricePerMillion: pricing.pricing.inputPerMillion,
      outputPricePerMillion: pricing.pricing.outputPerMillion,
      cacheReadPricePerMillion: pricing.pricing.cacheReadPerMillion,
      cacheWritePricePerMillion: pricing.pricing.cacheWritePerMillion,
      processingTimeMs: params.processingTimeMs,
      tags: context.tags,
      metadata: context.metadata,
    });
  }

  /**
   * Complete a task and generate final report
   */
  completeTask(taskId: string): CompletionReport {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      throw new Error(`No active task found with ID: ${taskId}`);
    }

    const completedAt = new Date();
    const { context, estimate, startedAt } = activeTask;

    // Get all audit entries for this task
    const auditEntries = this.tokenAudit.getTaskEntries(taskId);
    const actualCost = auditEntries.reduce((sum, e) => sum + e.cost, 0);

    // Calculate actual tokens
    const actualTokens = {
      input: 0,
      output: 0,
      cache: 0,
      total: 0,
    };
    for (const entry of auditEntries) {
      switch (entry.tokenType) {
        case 'input':
        case 'system':
        case 'tool':
          actualTokens.input += entry.tokenCount;
          break;
        case 'output':
          actualTokens.output += entry.tokenCount;
          break;
        case 'cache-read':
        case 'cache-write':
          actualTokens.cache += entry.tokenCount;
          break;
      }
      actualTokens.total += entry.tokenCount;
    }

    // Calculate variance from estimate
    const variance = {
      cost: actualCost - estimate.totalCost,
      percentage: estimate.totalCost > 0
        ? ((actualCost - estimate.totalCost) / estimate.totalCost) * 100
        : 0,
    };

    // Record to spending tracker
    const spendingRecord = this.spendingTracker.recordFromUsage({
      taskId,
      userId: context.userId,
      agentId: context.agentId,
      inputTokens: actualTokens.input,
      outputTokens: actualTokens.output,
      cacheTokens: actualTokens.cache,
      model: context.model,
      provider: context.provider,
      taskDescription: context.taskDescription,
      taskType: context.taskType,
      startedAt,
      completedAt,
      estimateId: estimate.id,
      estimatedCost: estimate.totalCost,
      inputPricePerMillion: this.costEstimator.getModelPricing(context.model, context.provider).pricing.inputPerMillion,
      outputPricePerMillion: this.costEstimator.getModelPricing(context.model, context.provider).pricing.outputPerMillion,
      tags: context.tags,
      metadata: context.metadata,
    });

    // Record spending against budgets
    const scope: BudgetScope = {
      userId: context.userId,
      agentId: context.agentId,
      taskType: context.taskType,
      model: context.model,
    };
    this.budgetManager.recordSpending(actualCost, scope);

    // Record estimate accuracy for learning
    this.costEstimator.recordActualCost(
      estimate.id,
      actualCost,
      context.taskType,
      context.model
    );

    // Get budget remaining
    const statuses = this.budgetManager.getAllBudgetStatuses();
    const dailyStatus = statuses.find(s => s?.budget.period === 'daily');
    const weeklyStatus = statuses.find(s => s?.budget.period === 'weekly');
    const monthlyStatus = statuses.find(s => s?.budget.period === 'monthly');

    const report: CompletionReport = {
      taskId,
      estimate,
      actualCost: Math.round(actualCost * 10000) / 10000,
      actualTokens,
      variance: {
        cost: Math.round(variance.cost * 10000) / 10000,
        percentage: Math.round(variance.percentage * 10) / 10,
      },
      duration: {
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
      budgetImpact: {
        dailyRemaining: dailyStatus?.remaining || 0,
        weeklyRemaining: weeklyStatus?.remaining || 0,
        monthlyRemaining: monthlyStatus?.remaining || 0,
      },
      auditEntries: auditEntries.map(e => e.id),
      spendingRecordId: spendingRecord.id,
    };

    // Clean up
    this.activeTasks.delete(taskId);

    this.emit('task-completed', report);
    return report;
  }

  /**
   * Abort a task (no cost recorded for incomplete work)
   */
  abortTask(taskId: string, reason: string): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) return;

    this.activeTasks.delete(taskId);
    this.emit('task-aborted', { taskId, reason });
  }

  // ============================================================================
  // REFUND METHODS
  // ============================================================================

  /**
   * Request a refund
   */
  requestRefund(taskId: string, userId: string, amount: number, reason: string): RefundRequest {
    const request: RefundRequest = {
      id: `refund_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      userId,
      amount,
      reason,
      status: 'pending',
      createdAt: new Date(),
    };

    this.refundRequests.set(request.id, request);
    this.emit('refund-requested', request);
    return request;
  }

  /**
   * Process a refund (instant credit)
   */
  processRefund(refundId: string, approved: boolean, processedBy: string, responseReason?: string): RefundRequest | null {
    const request = this.refundRequests.get(refundId);
    if (!request || request.status !== 'pending') return null;

    request.status = approved ? 'processed' : 'denied';
    request.processedAt = new Date();
    request.processedBy = processedBy;
    request.responseReason = responseReason;

    if (approved) {
      // Add credits instantly
      this.addCredits(request.userId, request.amount, `Refund: ${request.reason}`);

      // Record against budgets (reduces spent amount)
      this.budgetManager.processRefund(request.amount, { userId: request.userId }, request.reason);
    }

    this.emit('refund-processed', request);
    return request;
  }

  /**
   * Get pending refund requests
   */
  getPendingRefunds(): RefundRequest[] {
    return Array.from(this.refundRequests.values())
      .filter(r => r.status === 'pending');
  }

  // ============================================================================
  // CREDIT METHODS
  // ============================================================================

  /**
   * Get user credit balance
   */
  getCreditBalance(userId: string): CreditBalance {
    if (!this.creditBalances.has(userId)) {
      this.creditBalances.set(userId, {
        userId,
        available: 0,
        pending: 0,
        lifetime: 0,
        used: 0,
        expired: 0, // Always 0 with forever rollover
        lastUpdated: new Date(),
      });
    }
    return this.creditBalances.get(userId)!;
  }

  /**
   * Add credits to user account (from refunds, promotions, etc.)
   */
  addCredits(userId: string, amount: number, reason: string): CreditBalance {
    const balance = this.getCreditBalance(userId);
    balance.available += amount;
    balance.lifetime += amount;
    balance.lastUpdated = new Date();

    // Also add as rollover credits to budgets
    const budgets = this.budgetManager.getBudgetsForScope({ userId });
    for (const budget of budgets) {
      if (budget.rolloverEnabled) {
        this.budgetManager.addRolloverCredits(budget.id, amount);
      }
    }

    this.emit('credits-added', { userId, amount, reason, newBalance: balance.available });
    return balance;
  }

  /**
   * Use credits (called internally during task completion)
   */
  useCredits(userId: string, amount: number): boolean {
    const balance = this.getCreditBalance(userId);
    if (balance.available < amount) return false;

    balance.available -= amount;
    balance.used += amount;
    balance.lastUpdated = new Date();

    this.emit('credits-used', { userId, amount, remaining: balance.available });
    return true;
  }

  // ============================================================================
  // DASHBOARD & REPORTING METHODS
  // ============================================================================

  /**
   * Get real-time dashboard data
   */
  getDashboard(): DashboardData {
    return this.spendingTracker.getDashboardData();
  }

  /**
   * Get spending summary for a period
   */
  getSpendingSummary(startDate?: Date, endDate?: Date): SpendingSummary {
    return this.spendingTracker.getSummary(startDate, endDate);
  }

  /**
   * Get audit summary for a period
   */
  getAuditSummary(startDate?: Date, endDate?: Date): AuditSummary {
    return this.tokenAudit.getSummary(startDate, endDate);
  }

  /**
   * Generate itemized invoice
   */
  generateInvoice(userId: string, startDate: Date, endDate: Date): ItemizedInvoice {
    const balance = this.getCreditBalance(userId);
    return this.tokenAudit.generateInvoice(
      userId,
      startDate,
      endDate,
      [],
      balance.available,
      0
    );
  }

  /**
   * Get all budget statuses
   */
  getBudgetStatuses() {
    return this.budgetManager.getAllBudgetStatuses();
  }

  /**
   * Get unacknowledged alerts
   */
  getAlerts(): BudgetAlert[] {
    return this.budgetManager.getAlerts(true);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    return this.budgetManager.acknowledgeAlert(alertId);
  }

  // ============================================================================
  // CONFIGURATION METHODS
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FinancialGuardianConfig>): void {
    this.config = { ...this.config, ...updates };
    this.spendingTracker.setBudgets(
      this.config.defaultDailyBudget,
      this.config.defaultWeeklyBudget,
      this.config.defaultMonthlyBudget
    );
    this.emit('config-updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): FinancialGuardianConfig {
    return { ...this.config };
  }

  /**
   * Create a custom budget
   */
  createBudget(params: Parameters<BudgetManager['createBudget']>[0]): Budget {
    return this.budgetManager.createBudget(params);
  }

  /**
   * Update model pricing
   */
  updatePricing(model: string, provider: LLMProvider, pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
  }): void {
    this.costEstimator.setCustomPricing(model, provider, pricing);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Format cost for display
   */
  formatCost(amount: number): string {
    return this.costEstimator.formatCurrency(amount);
  }

  /**
   * Get cost estimate without pre-flight check
   */
  estimate(params: EstimationParams): CostEstimate {
    return this.costEstimator.estimate(params);
  }

  /**
   * Quick estimate for simple cases
   */
  quickEstimate(inputTokens: number, outputTokens: number, model: string, provider: LLMProvider = 'anthropic'): number {
    return this.costEstimator.quickEstimate(inputTokens, outputTokens, model, provider);
  }

  /**
   * Get available models with pricing
   */
  getAvailableModels(): typeof MODEL_PRICING {
    return MODEL_PRICING;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Set up event forwarding from sub-components
   */
  private setupEventForwarding(): void {
    // Forward spending tracker events
    this.spendingTracker.on('spending-recorded', (record: SpendingRecord) => {
      this.emit('spending-recorded', record);
    });
    this.spendingTracker.on('anomaly-detected', (anomaly) => {
      this.emit('anomaly-detected', anomaly);
    });

    // Forward budget manager events
    this.budgetManager.on('alert-triggered', (alert: BudgetAlert) => {
      this.emit('budget-alert', alert);
    });
    this.budgetManager.on('rollover-processed', (event) => {
      this.emit('credits-rolled-over', event);
    });

    // Forward audit events
    this.tokenAudit.on('integrity-violation', (violation) => {
      this.emit('audit-integrity-violation', violation);
    });
  }

  /**
   * Suggest a cheaper model alternative
   */
  private suggestCheaperModel(currentModel: string, currentProvider: LLMProvider): { model: string; provider: LLMProvider } | null {
    const currentPricing = MODEL_PRICING[currentModel];
    if (!currentPricing) return null;

    const currentCostPer1K = (currentPricing.pricing.inputPerMillion + currentPricing.pricing.outputPerMillion) / 2 / 1000;

    let cheapestModel: { model: string; provider: LLMProvider } | null = null;
    let cheapestCost = currentCostPer1K;

    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      if (model === currentModel) continue;

      const costPer1K = (pricing.pricing.inputPerMillion + pricing.pricing.outputPerMillion) / 2 / 1000;
      if (costPer1K < cheapestCost * 0.5) { // Must be significantly cheaper
        cheapestCost = costPer1K;
        cheapestModel = { model, provider: pricing.provider };
      }
    }

    return cheapestModel;
  }

  /**
   * Format approval reason for user
   */
  private formatApprovalReason(estimate: CostEstimate, budgetCheck: MultiBudgetCheckResult): string {
    const reasons: string[] = [];

    if (estimate.totalCost >= this.config.requireApprovalAbove) {
      reasons.push(`Estimated cost (${this.formatCost(estimate.totalCost)}) exceeds auto-approve threshold`);
    }

    if (budgetCheck.requiresApproval) {
      reasons.push(budgetCheck.approvalReason || 'Budget limit would be exceeded');
    }

    if (estimate.warnings.length > 0) {
      reasons.push('Cost warnings detected');
    }

    return reasons.join('; ');
  }

  /**
   * Format approval request message
   */
  private formatApprovalRequest(context: TaskContext, estimate: CostEstimate): string {
    return [
      `Task: ${context.taskDescription}`,
      `Model: ${context.model}`,
      `Estimated Cost: ${this.formatCost(estimate.totalCost)}`,
      `Range: ${this.formatCost(estimate.minCost)} - ${this.formatCost(estimate.maxCost)}`,
      `Confidence: ${Math.round(estimate.confidence * 100)}%`,
      '',
      estimate.warnings.length > 0 ? `Warnings:\n${estimate.warnings.map(w => `  - ${w}`).join('\n')}` : '',
      '',
      'Do you approve this task execution?',
    ].filter(Boolean).join('\n');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let financialGuardianInstance: FinancialGuardian | null = null;

export function getFinancialGuardian(config?: Partial<FinancialGuardianConfig>): FinancialGuardian {
  if (!financialGuardianInstance) {
    financialGuardianInstance = new FinancialGuardian(config);
  }
  return financialGuardianInstance;
}

export function createFinancialGuardian(config?: Partial<FinancialGuardianConfig>): FinancialGuardian {
  return new FinancialGuardian(config);
}

// Re-export types from sub-modules for convenience
export type {
  CostEstimate,
  EstimationParams,
  LLMProvider,
  SpendingRecord,
  DashboardData,
  SpendingSummary,
  Budget,
  BudgetScope,
  BudgetAlert,
  BudgetPermissionRequest,
  AuditEntry,
  AuditSummary,
  ItemizedInvoice,
};
