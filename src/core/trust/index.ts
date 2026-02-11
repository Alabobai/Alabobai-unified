/**
 * Trust Architecture - Main Export Module
 *
 * The Trust Architecture provides a comprehensive system for managing AI agent
 * autonomy with appropriate human oversight. It implements 5 trust levels ranging
 * from full human control to multi-agent enterprise operations.
 *
 * @module trust
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   TrustGuardian,
 *   TrustLevel,
 *   ActionCategory,
 *   RiskLevel,
 * } from '@alabobai/core/trust';
 *
 * // Initialize the guardian
 * const guardian = getTrustGuardian();
 *
 * // Create a session at GUIDED trust level
 * const context = guardian.createSession('user-123', TrustLevel.GUIDED);
 *
 * // Execute an action
 * const result = await guardian.executeAction({
 *   action: {
 *     id: 'action-1',
 *     type: 'create_document',
 *     category: ActionCategory.CREATE,
 *     riskLevel: RiskLevel.LOW,
 *     description: 'Create a new document',
 *     reversible: true,
 *     requestedAt: new Date(),
 *     requesterId: 'user-123',
 *     requesterType: 'user',
 *   },
 *   context,
 * });
 *
 * if (result.executed) {
 *   console.log('Action executed successfully');
 * } else if (result.handoffRequest) {
 *   console.log('Human approval required:', result.handoffRequest.id);
 * }
 * ```
 */

// =============================================================================
// TRUST LEVEL EXPORTS
// =============================================================================

export {
  // Enums
  TrustLevel,
  RiskLevel,
  ActionCategory,
  PermissionDecision,
  HandoffReason,

  // Interfaces
  TrustLevelConfig,
  HardLimits,
  Action,
  PermissionResult,
  TrustContext,
  CustomPermission,
  HandoffRequest,
  HandoffResolution,
  LoopDetectionState,
  TwoFactorRequest,
  ManagerDecision,

  // Constants
  DEFAULT_HARD_LIMITS,
  TRUST_LEVEL_CONFIGS,

  // Type guards & utilities
  isTrustLevel,
  isRiskLevel,
  isActionCategory,
  getTrustLevelName,
  getRiskLevelValue,
  compareRiskLevels,
  riskExceedsThreshold,
} from './TrustLevel.js';

// =============================================================================
// PERMISSION MANAGER EXPORTS
// =============================================================================

export {
  // Class
  PermissionManager,

  // Interfaces
  PermissionManagerConfig,
  PermissionEvaluator,
  PermissionEvaluatorResult,

  // Factory
  getPermissionManager,
  resetPermissionManager,

  // Built-in evaluators
  suspiciousPatternEvaluator,
  organizationPolicyEvaluator,
} from './PermissionManager.js';

// =============================================================================
// AUDIT LOGGER EXPORTS
// =============================================================================

export {
  // Class
  AuditLogger,

  // Enums
  AuditEventType,
  AuditSeverity,

  // Interfaces
  AuditEntry,
  AffectedResource,
  GeoLocation,
  AuditQuery,
  AuditExport,
  AuditStatistics,
  AuditBackend,
  IntegrityResult,
  AuditLoggerConfig,

  // Backends
  InMemoryAuditBackend,

  // Factory
  getAuditLogger,
  resetAuditLogger,
} from './AuditLogger.js';

// =============================================================================
// TRUST GUARDIAN EXPORTS
// =============================================================================

export {
  // Class
  TrustGuardian,

  // Interfaces
  TrustGuardianConfig,
  LoopDetectionConfig,
  TwoFactorConfig,
  TwoFactorProviders,
  HandoffConfig,
  HandoffNotifications,
  ManagerAIConfig,
  ActionHandler,
  ActionResult,
  PreActionHook,
  PostActionHook,
  ExecutionRequest,
  ExecutionResponse,

  // Factory
  getTrustGuardian,
  resetTrustGuardian,
} from './TrustGuardian.js';

// =============================================================================
// CONVENIENCE RE-EXPORTS
// =============================================================================

/**
 * Quick start function to create a fully configured Trust Architecture instance
 */
export function createTrustArchitecture(options?: {
  debug?: boolean;
  strictMode?: boolean;
  complianceStandards?: string[];
}): {
  guardian: import('./TrustGuardian.js').TrustGuardian;
  permissionManager: import('./PermissionManager.js').PermissionManager;
  auditLogger: import('./AuditLogger.js').AuditLogger;
} {
  const { getTrustGuardian } = require('./TrustGuardian.js');
  const { getPermissionManager } = require('./PermissionManager.js');
  const { getAuditLogger, InMemoryAuditBackend } = require('./AuditLogger.js');

  const permissionManager = getPermissionManager({
    strictMode: options?.strictMode,
  });

  const auditLogger = getAuditLogger({
    backends: [new InMemoryAuditBackend()],
    complianceStandards: options?.complianceStandards,
    enableHashChaining: true,
  });

  const guardian = getTrustGuardian({
    debug: options?.debug,
  });

  return { guardian, permissionManager, auditLogger };
}

/**
 * Type-safe action builder
 */
export function createAction(params: {
  type: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  description: string;
  requesterId: string;
  requesterType: 'user' | 'agent' | 'system';
  reversible?: boolean;
  monetaryValue?: number;
  affectedCount?: number;
  resourceId?: string;
  resourceType?: string;
  metadata?: Record<string, unknown>;
}): Action {
  const { ActionCategory, RiskLevel } = require('./TrustLevel.js');

  return {
    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: params.type,
    category: params.category,
    riskLevel: params.riskLevel,
    description: params.description,
    requesterId: params.requesterId,
    requesterType: params.requesterType,
    reversible: params.reversible ?? true,
    requestedAt: new Date(),
    monetaryValue: params.monetaryValue,
    affectedCount: params.affectedCount,
    resourceId: params.resourceId,
    resourceType: params.resourceType,
    metadata: params.metadata,
  };
}

// Import types for re-export
import type { Action } from './TrustLevel.js';
import type { ActionCategory, RiskLevel } from './TrustLevel.js';
