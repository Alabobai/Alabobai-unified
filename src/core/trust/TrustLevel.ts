/**
 * TrustLevel.ts - Trust Architecture Core Definitions
 *
 * Defines the 5-level trust hierarchy for AI agent autonomy.
 * Each level represents a different balance between automation and human oversight.
 *
 * @module TrustLevel
 * @version 1.0.0
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Trust levels defining AI autonomy boundaries
 */
export enum TrustLevel {
  /** L1: AI suggests, user approves everything */
  OBSERVE_ONLY = 1,

  /** L2: Low-risk auto, pause for payments/deletions/external */
  GUIDED = 2,

  /** L3: Most actions auto, human review every 15min */
  SUPERVISED = 3,

  /** L4: Independent with hard limits */
  FULL_AUTONOMY = 4,

  /** L5: Multi-agent with manager AI */
  ENTERPRISE = 5,
}

/**
 * Action risk classification
 */
export enum RiskLevel {
  /** No risk - informational only */
  NONE = 'none',

  /** Low risk - easily reversible */
  LOW = 'low',

  /** Medium risk - requires attention */
  MEDIUM = 'medium',

  /** High risk - significant impact */
  HIGH = 'high',

  /** Critical - irreversible or high-value */
  CRITICAL = 'critical',
}

/**
 * Action categories for permission mapping
 */
export enum ActionCategory {
  /** Read-only operations */
  READ = 'read',

  /** Create new resources */
  CREATE = 'create',

  /** Update existing resources */
  UPDATE = 'update',

  /** Delete resources */
  DELETE = 'delete',

  /** Financial transactions */
  PAYMENT = 'payment',

  /** External API calls */
  EXTERNAL_API = 'external_api',

  /** System configuration changes */
  SYSTEM_CONFIG = 'system_config',

  /** User/permission management */
  USER_MANAGEMENT = 'user_management',

  /** Data export/migration */
  DATA_EXPORT = 'data_export',

  /** Security-sensitive operations */
  SECURITY = 'security',
}

/**
 * Permission decision outcomes
 */
export enum PermissionDecision {
  /** Action is allowed to proceed */
  ALLOW = 'allow',

  /** Action denied - insufficient trust level */
  DENY = 'deny',

  /** Action requires human approval */
  REQUIRE_APPROVAL = 'require_approval',

  /** Action requires 2FA verification */
  REQUIRE_2FA = 'require_2fa',

  /** Action requires manager AI approval (L5) */
  REQUIRE_MANAGER_APPROVAL = 'require_manager_approval',

  /** Action queued for periodic review */
  QUEUE_FOR_REVIEW = 'queue_for_review',
}

/**
 * Handoff reasons for human escalation
 */
export enum HandoffReason {
  /** Trust level insufficient */
  TRUST_LEVEL = 'trust_level',

  /** Action exceeds risk threshold */
  RISK_THRESHOLD = 'risk_threshold',

  /** Loop detection triggered */
  LOOP_DETECTED = 'loop_detected',

  /** Periodic review required */
  PERIODIC_REVIEW = 'periodic_review',

  /** Budget limit reached */
  BUDGET_LIMIT = 'budget_limit',

  /** Explicit user request */
  USER_REQUESTED = 'user_requested',

  /** Error threshold exceeded */
  ERROR_THRESHOLD = 'error_threshold',

  /** Anomaly detected */
  ANOMALY_DETECTED = 'anomaly_detected',

  /** Time-sensitive decision */
  TIME_SENSITIVE = 'time_sensitive',

  /** Policy violation */
  POLICY_VIOLATION = 'policy_violation',
}

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for a specific trust level
 */
export interface TrustLevelConfig {
  /** The trust level */
  level: TrustLevel;

  /** Human-readable name */
  name: string;

  /** Detailed description */
  description: string;

  /** Maximum risk level allowed without approval */
  maxAutoApproveRisk: RiskLevel;

  /** Actions that always require approval */
  alwaysRequireApproval: ActionCategory[];

  /** Actions that are completely denied */
  deniedActions: ActionCategory[];

  /** Periodic review interval in minutes (0 = none) */
  reviewIntervalMinutes: number;

  /** Maximum budget per action in cents (0 = no limit) */
  maxBudgetPerAction: number;

  /** Maximum daily budget in cents (0 = no limit) */
  maxDailyBudget: number;

  /** Whether 2FA is required for high-risk actions */
  require2FAForHighRisk: boolean;

  /** Whether manager AI approval is available */
  allowManagerApproval: boolean;

  /** Maximum consecutive actions without human check */
  maxActionsWithoutCheck: number;

  /** Hard limits that cannot be overridden */
  hardLimits: HardLimits;
}

/**
 * Hard limits that apply regardless of trust level
 */
export interface HardLimits {
  /** Maximum single transaction amount in cents */
  maxTransactionAmount: number;

  /** Maximum records that can be deleted in one action */
  maxDeleteCount: number;

  /** Maximum data export size in bytes */
  maxExportSize: number;

  /** Rate limit: max actions per minute */
  maxActionsPerMinute: number;

  /** Rate limit: max API calls per minute */
  maxApiCallsPerMinute: number;

  /** Maximum concurrent operations */
  maxConcurrentOperations: number;
}

/**
 * Represents an action to be evaluated
 */
export interface Action {
  /** Unique action identifier */
  id: string;

  /** Action type/name */
  type: string;

  /** Category of the action */
  category: ActionCategory;

  /** Risk level of the action */
  riskLevel: RiskLevel;

  /** Detailed description */
  description: string;

  /** Target resource identifier */
  resourceId?: string;

  /** Target resource type */
  resourceType?: string;

  /** Monetary value in cents (if applicable) */
  monetaryValue?: number;

  /** Number of records affected */
  affectedCount?: number;

  /** Whether the action is reversible */
  reversible: boolean;

  /** Time the action was requested */
  requestedAt: Date;

  /** Metadata for logging/debugging */
  metadata?: Record<string, unknown>;

  /** Parent action ID (for chained actions) */
  parentActionId?: string;

  /** Requesting agent/user ID */
  requesterId: string;

  /** Requester type */
  requesterType: 'user' | 'agent' | 'system';
}

/**
 * Result of a permission check
 */
export interface PermissionResult {
  /** The decision */
  decision: PermissionDecision;

  /** The action that was evaluated */
  action: Action;

  /** The trust level used for evaluation */
  trustLevel: TrustLevel;

  /** Reason for the decision */
  reason: string;

  /** Additional details */
  details?: string;

  /** Suggested alternatives if denied */
  alternatives?: string[];

  /** Time until auto-approval (if queued) */
  autoApproveAfter?: Date;

  /** Handoff reason if human intervention needed */
  handoffReason?: HandoffReason;

  /** Timestamp of the decision */
  decidedAt: Date;

  /** Expiry time for approval (if applicable) */
  expiresAt?: Date;
}

/**
 * User/agent context for trust evaluation
 */
export interface TrustContext {
  /** User/agent identifier */
  userId: string;

  /** Current trust level */
  trustLevel: TrustLevel;

  /** Session identifier */
  sessionId: string;

  /** Session start time */
  sessionStartedAt: Date;

  /** Actions performed this session */
  sessionActionCount: number;

  /** Errors encountered this session */
  sessionErrorCount: number;

  /** Daily action count */
  dailyActionCount: number;

  /** Daily budget spent in cents */
  dailyBudgetSpent: number;

  /** Time of last human review */
  lastHumanReview?: Date;

  /** Time of last action */
  lastActionAt?: Date;

  /** Recent action types (for loop detection) */
  recentActionTypes: string[];

  /** Whether 2FA is verified for this session */
  twoFactorVerified: boolean;

  /** Custom permissions/overrides */
  customPermissions?: CustomPermission[];

  /** Organization/team context */
  organizationId?: string;

  /** Role within organization */
  role?: string;
}

/**
 * Custom permission override
 */
export interface CustomPermission {
  /** Action category or specific action type */
  target: ActionCategory | string;

  /** Override decision */
  decision: PermissionDecision;

  /** Reason for override */
  reason: string;

  /** Who granted this permission */
  grantedBy: string;

  /** When the permission was granted */
  grantedAt: Date;

  /** When the permission expires */
  expiresAt?: Date;
}

/**
 * Human handoff request
 */
export interface HandoffRequest {
  /** Unique request identifier */
  id: string;

  /** The action requiring handoff */
  action: Action;

  /** Reason for handoff */
  reason: HandoffReason;

  /** Detailed explanation */
  explanation: string;

  /** Context at time of handoff */
  context: TrustContext;

  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'critical';

  /** When the request was created */
  createdAt: Date;

  /** Deadline for response */
  deadline?: Date;

  /** Suggested actions for human */
  suggestions?: string[];

  /** Related action history */
  relatedActions?: string[];

  /** Current status */
  status: 'pending' | 'acknowledged' | 'resolved' | 'expired';

  /** Resolution details */
  resolution?: HandoffResolution;
}

/**
 * Resolution of a handoff request
 */
export interface HandoffResolution {
  /** Who resolved it */
  resolvedBy: string;

  /** When it was resolved */
  resolvedAt: Date;

  /** Decision made */
  decision: 'approve' | 'deny' | 'modify' | 'escalate';

  /** Explanation of decision */
  explanation?: string;

  /** Modified action (if decision is 'modify') */
  modifiedAction?: Partial<Action>;

  /** Trust level adjustment (if any) */
  trustLevelAdjustment?: TrustLevel;
}

/**
 * Loop detection state
 */
export interface LoopDetectionState {
  /** Recent action signatures */
  recentSignatures: string[];

  /** Pattern match counts */
  patternCounts: Map<string, number>;

  /** Last reset time */
  lastReset: Date;

  /** Whether loop was detected */
  loopDetected: boolean;

  /** Detected pattern description */
  detectedPattern?: string;
}

/**
 * 2FA verification request
 */
export interface TwoFactorRequest {
  /** Request identifier */
  id: string;

  /** Action requiring 2FA */
  action: Action;

  /** Challenge type */
  challengeType: 'totp' | 'sms' | 'email' | 'push' | 'hardware_key';

  /** When the request was created */
  createdAt: Date;

  /** When the request expires */
  expiresAt: Date;

  /** Number of attempts made */
  attempts: number;

  /** Maximum attempts allowed */
  maxAttempts: number;

  /** Current status */
  status: 'pending' | 'verified' | 'failed' | 'expired';
}

/**
 * Manager AI decision (for L5)
 */
export interface ManagerDecision {
  /** Decision identifier */
  id: string;

  /** Manager agent ID */
  managerAgentId: string;

  /** Action being evaluated */
  action: Action;

  /** Subordinate agent context */
  subordinateContext: TrustContext;

  /** Decision made */
  decision: PermissionDecision;

  /** Reasoning for decision */
  reasoning: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Whether to escalate to human */
  escalateToHuman: boolean;

  /** Timestamp */
  decidedAt: Date;
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/**
 * Default hard limits (safety boundaries)
 */
export const DEFAULT_HARD_LIMITS: HardLimits = {
  maxTransactionAmount: 1000000, // $10,000
  maxDeleteCount: 1000,
  maxExportSize: 1073741824, // 1GB
  maxActionsPerMinute: 60,
  maxApiCallsPerMinute: 100,
  maxConcurrentOperations: 10,
};

/**
 * Default configurations for each trust level
 */
export const TRUST_LEVEL_CONFIGS: Record<TrustLevel, TrustLevelConfig> = {
  [TrustLevel.OBSERVE_ONLY]: {
    level: TrustLevel.OBSERVE_ONLY,
    name: 'Observe Only',
    description: 'AI suggests, user approves everything. Maximum human oversight.',
    maxAutoApproveRisk: RiskLevel.NONE,
    alwaysRequireApproval: Object.values(ActionCategory),
    deniedActions: [],
    reviewIntervalMinutes: 0, // Every action requires approval
    maxBudgetPerAction: 0,
    maxDailyBudget: 0,
    require2FAForHighRisk: true,
    allowManagerApproval: false,
    maxActionsWithoutCheck: 0,
    hardLimits: DEFAULT_HARD_LIMITS,
  },

  [TrustLevel.GUIDED]: {
    level: TrustLevel.GUIDED,
    name: 'Guided',
    description: 'Low-risk auto, pause for payments/deletions/external.',
    maxAutoApproveRisk: RiskLevel.LOW,
    alwaysRequireApproval: [
      ActionCategory.DELETE,
      ActionCategory.PAYMENT,
      ActionCategory.EXTERNAL_API,
      ActionCategory.SECURITY,
      ActionCategory.USER_MANAGEMENT,
    ],
    deniedActions: [],
    reviewIntervalMinutes: 0, // Review on flagged actions only
    maxBudgetPerAction: 1000, // $10
    maxDailyBudget: 10000, // $100
    require2FAForHighRisk: true,
    allowManagerApproval: false,
    maxActionsWithoutCheck: 10,
    hardLimits: DEFAULT_HARD_LIMITS,
  },

  [TrustLevel.SUPERVISED]: {
    level: TrustLevel.SUPERVISED,
    name: 'Supervised',
    description: 'Most actions auto, human review every 15min.',
    maxAutoApproveRisk: RiskLevel.MEDIUM,
    alwaysRequireApproval: [
      ActionCategory.SECURITY,
      ActionCategory.USER_MANAGEMENT,
    ],
    deniedActions: [],
    reviewIntervalMinutes: 15,
    maxBudgetPerAction: 10000, // $100
    maxDailyBudget: 100000, // $1,000
    require2FAForHighRisk: true,
    allowManagerApproval: false,
    maxActionsWithoutCheck: 50,
    hardLimits: DEFAULT_HARD_LIMITS,
  },

  [TrustLevel.FULL_AUTONOMY]: {
    level: TrustLevel.FULL_AUTONOMY,
    name: 'Full Autonomy',
    description: 'Independent operation with hard limits only.',
    maxAutoApproveRisk: RiskLevel.HIGH,
    alwaysRequireApproval: [
      ActionCategory.SECURITY,
    ],
    deniedActions: [],
    reviewIntervalMinutes: 60,
    maxBudgetPerAction: 100000, // $1,000
    maxDailyBudget: 1000000, // $10,000
    require2FAForHighRisk: false, // Trusted to operate independently
    allowManagerApproval: false,
    maxActionsWithoutCheck: 200,
    hardLimits: DEFAULT_HARD_LIMITS,
  },

  [TrustLevel.ENTERPRISE]: {
    level: TrustLevel.ENTERPRISE,
    name: 'Enterprise',
    description: 'Multi-agent with manager AI oversight.',
    maxAutoApproveRisk: RiskLevel.HIGH,
    alwaysRequireApproval: [], // Manager AI handles approvals
    deniedActions: [],
    reviewIntervalMinutes: 120,
    maxBudgetPerAction: 1000000, // $10,000
    maxDailyBudget: 10000000, // $100,000
    require2FAForHighRisk: false,
    allowManagerApproval: true,
    maxActionsWithoutCheck: 1000,
    hardLimits: {
      ...DEFAULT_HARD_LIMITS,
      maxTransactionAmount: 10000000, // $100,000
      maxActionsPerMinute: 200,
      maxConcurrentOperations: 50,
    },
  },
};

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Type guard for TrustLevel
 */
export function isTrustLevel(value: unknown): value is TrustLevel {
  return typeof value === 'number' &&
    value >= TrustLevel.OBSERVE_ONLY &&
    value <= TrustLevel.ENTERPRISE;
}

/**
 * Type guard for RiskLevel
 */
export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' &&
    Object.values(RiskLevel).includes(value as RiskLevel);
}

/**
 * Type guard for ActionCategory
 */
export function isActionCategory(value: unknown): value is ActionCategory {
  return typeof value === 'string' &&
    Object.values(ActionCategory).includes(value as ActionCategory);
}

/**
 * Get trust level name
 */
export function getTrustLevelName(level: TrustLevel): string {
  return TRUST_LEVEL_CONFIGS[level]?.name ?? 'Unknown';
}

/**
 * Get risk level numeric value for comparison
 */
export function getRiskLevelValue(risk: RiskLevel): number {
  const values: Record<RiskLevel, number> = {
    [RiskLevel.NONE]: 0,
    [RiskLevel.LOW]: 1,
    [RiskLevel.MEDIUM]: 2,
    [RiskLevel.HIGH]: 3,
    [RiskLevel.CRITICAL]: 4,
  };
  return values[risk] ?? 0;
}

/**
 * Compare risk levels
 */
export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  return getRiskLevelValue(a) - getRiskLevelValue(b);
}

/**
 * Check if risk level exceeds threshold
 */
export function riskExceedsThreshold(risk: RiskLevel, threshold: RiskLevel): boolean {
  return getRiskLevelValue(risk) > getRiskLevelValue(threshold);
}
