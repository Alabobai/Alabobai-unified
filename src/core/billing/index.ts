/**
 * Alabobai Financial Guardian - Billing Module
 *
 * Complete financial protection for AI operations:
 * - Pre-task cost estimation
 * - Real-time spending tracking
 * - Budget enforcement (daily, weekly, monthly, per-task)
 * - Complete audit trail
 * - Itemized billing
 * - Instant refunds
 * - Credits roll over forever
 *
 * Prevents: "400 credits gone without warning", "$1000 on one bug fix"
 */

// Main orchestrator
export {
  FinancialGuardian,
  getFinancialGuardian,
  createFinancialGuardian,
} from './FinancialGuardian.js';
export type {
  TaskContext,
  PreFlightResult,
  CompletionReport,
  RefundRequest,
  CreditBalance,
  FinancialGuardianConfig,
} from './FinancialGuardian.js';

// Cost estimation
export {
  CostEstimator,
  getCostEstimator,
  createCostEstimator,
  MODEL_PRICING,
} from './CostEstimator.js';
export type {
  LLMProvider,
  TokenPricing,
  ModelPricing,
  TaskComplexity,
  EstimationParams,
  CostEstimate,
  EstimateAccuracy,
} from './CostEstimator.js';

// Spending tracking
export {
  SpendingTracker,
  getSpendingTracker,
  createSpendingTracker,
} from './SpendingTracker.js';
export type {
  SpendingRecord,
  SpendingSummary,
  SpendingDataPoint,
  SpendingAnomaly,
  DashboardData,
} from './SpendingTracker.js';

// Budget management
export {
  BudgetManager,
  getBudgetManager,
  createBudgetManager,
} from './BudgetManager.js';
export type {
  BudgetPeriod,
  EnforcementMode,
  BudgetScope,
  Budget,
  BudgetCheckResult,
  MultiBudgetCheckResult,
  BudgetAlert,
  BudgetPermissionRequest,
  RolloverEvent,
} from './BudgetManager.js';

// Token auditing
export {
  TokenAudit,
  getTokenAudit,
  createTokenAudit,
} from './TokenAudit.js';
export type {
  TokenType,
  AuditEntry,
  AuditSummary,
  InvoiceLineItem,
  ItemizedInvoice,
  ReconciliationResult,
  AuditQueryOptions,
} from './TokenAudit.js';
