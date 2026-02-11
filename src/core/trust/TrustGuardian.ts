/**
 * TrustGuardian.ts - Main Trust Architecture Orchestrator
 *
 * The central coordinator for all trust-related operations. Integrates permission
 * checking, audit logging, 2FA verification, loop detection, and human handoff
 * into a unified, production-ready system.
 *
 * @module TrustGuardian
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
  HandoffRequest,
  HandoffResolution,
  LoopDetectionState,
  TwoFactorRequest,
  ManagerDecision,
  getTrustLevelName,
  getRiskLevelValue,
} from './TrustLevel.js';

import {
  PermissionManager,
  PermissionManagerConfig,
  getPermissionManager,
} from './PermissionManager.js';

import {
  AuditLogger,
  AuditLoggerConfig,
  AuditEventType,
  AuditEntry,
  InMemoryAuditBackend,
  getAuditLogger,
} from './AuditLogger.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for TrustGuardian
 */
export interface TrustGuardianConfig {
  /** Permission manager configuration */
  permissionConfig?: PermissionManagerConfig;

  /** Audit logger configuration */
  auditConfig?: AuditLoggerConfig;

  /** Loop detection configuration */
  loopDetection?: LoopDetectionConfig;

  /** 2FA configuration */
  twoFactorConfig?: TwoFactorConfig;

  /** Handoff configuration */
  handoffConfig?: HandoffConfig;

  /** Manager AI configuration (for L5) */
  managerAIConfig?: ManagerAIConfig;

  /** Enable debug mode */
  debug?: boolean;

  /** Custom action handlers */
  actionHandlers?: Map<string, ActionHandler>;

  /** Pre-action hooks */
  preActionHooks?: PreActionHook[];

  /** Post-action hooks */
  postActionHooks?: PostActionHook[];
}

/**
 * Loop detection configuration
 */
export interface LoopDetectionConfig {
  /** Window size for pattern detection */
  windowSize: number;

  /** Minimum repetitions to trigger detection */
  minRepetitions: number;

  /** Reset interval in ms */
  resetIntervalMs: number;

  /** Patterns to always flag */
  alwaysFlagPatterns?: string[];

  /** Enable fuzzy matching */
  fuzzyMatching?: boolean;
}

/**
 * 2FA configuration
 */
export interface TwoFactorConfig {
  /** Supported challenge types */
  supportedTypes: ('totp' | 'sms' | 'email' | 'push' | 'hardware_key')[];

  /** Challenge expiry in seconds */
  challengeExpirySeconds: number;

  /** Maximum verification attempts */
  maxAttempts: number;

  /** Cooldown period after max attempts (seconds) */
  cooldownSeconds: number;

  /** 2FA provider callbacks */
  providers?: TwoFactorProviders;
}

/**
 * 2FA provider callbacks
 */
export interface TwoFactorProviders {
  sendChallenge: (
    userId: string,
    type: string,
    action: Action
  ) => Promise<string>;
  verifyChallenge: (
    userId: string,
    type: string,
    response: string,
    challengeId: string
  ) => Promise<boolean>;
}

/**
 * Handoff configuration
 */
export interface HandoffConfig {
  /** Default deadline for handoff resolution (minutes) */
  defaultDeadlineMinutes: number;

  /** Escalation path */
  escalationPath: string[];

  /** Notification callbacks */
  notifications?: HandoffNotifications;

  /** Auto-resolve timeout (minutes, 0 = no auto-resolve) */
  autoResolveTimeoutMinutes: number;

  /** Default resolution if auto-resolved */
  autoResolveDecision: 'approve' | 'deny';
}

/**
 * Handoff notification callbacks
 */
export interface HandoffNotifications {
  onHandoffCreated: (request: HandoffRequest) => Promise<void>;
  onHandoffAcknowledged: (request: HandoffRequest) => Promise<void>;
  onHandoffResolved: (request: HandoffRequest) => Promise<void>;
  onHandoffExpired: (request: HandoffRequest) => Promise<void>;
}

/**
 * Manager AI configuration (L5)
 */
export interface ManagerAIConfig {
  /** Manager agent ID */
  managerAgentId: string;

  /** Decision callback */
  requestDecision: (
    action: Action,
    subordinateContext: TrustContext
  ) => Promise<ManagerDecision>;

  /** Confidence threshold for auto-approval */
  confidenceThreshold: number;

  /** Always escalate these categories to humans */
  alwaysEscalateCategories: ActionCategory[];
}

/**
 * Action handler function
 */
export type ActionHandler = (
  action: Action,
  context: TrustContext
) => Promise<ActionResult>;

/**
 * Action result
 */
export interface ActionResult {
  success: boolean;
  result?: unknown;
  error?: Error;
  affectedResources?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  duration?: number;
}

/**
 * Pre-action hook
 */
export interface PreActionHook {
  name: string;
  priority: number;
  execute: (
    action: Action,
    context: TrustContext
  ) => Promise<{ proceed: boolean; reason?: string; modifiedAction?: Action }>;
}

/**
 * Post-action hook
 */
export interface PostActionHook {
  name: string;
  priority: number;
  execute: (
    action: Action,
    context: TrustContext,
    result: ActionResult
  ) => Promise<void>;
}

/**
 * Execution request
 */
export interface ExecutionRequest {
  action: Action;
  context: TrustContext;
  skipPermissionCheck?: boolean;
  twoFactorResponse?: string;
  managerApproval?: ManagerDecision;
  humanApproval?: HandoffResolution;
}

/**
 * Execution response
 */
export interface ExecutionResponse {
  /** Whether the action was executed */
  executed: boolean;

  /** The permission result */
  permissionResult: PermissionResult;

  /** The action result (if executed) */
  actionResult?: ActionResult;

  /** Pending 2FA request (if needed) */
  twoFactorRequest?: TwoFactorRequest;

  /** Pending handoff request (if needed) */
  handoffRequest?: HandoffRequest;

  /** Pending manager approval request (if needed) */
  managerApprovalPending?: boolean;

  /** Updated context */
  updatedContext: TrustContext;

  /** Audit entry ID */
  auditEntryId: string;
}

/**
 * Session state
 */
interface SessionState {
  context: TrustContext;
  loopState: LoopDetectionState;
  pending2FA: Map<string, TwoFactorRequest>;
  pendingHandoffs: Map<string, HandoffRequest>;
  pendingManagerApprovals: Map<string, Action>;
  actionHistory: Action[];
}

// =============================================================================
// TRUST GUARDIAN CLASS
// =============================================================================

/**
 * Main Trust Architecture orchestrator
 */
export class TrustGuardian {
  private readonly config: Required<TrustGuardianConfig>;
  private readonly permissionManager: PermissionManager;
  private readonly auditLogger: AuditLogger;
  private readonly sessions: Map<string, SessionState> = new Map();
  private readonly preHooks: PreActionHook[];
  private readonly postHooks: PostActionHook[];
  private readonly actionHandlers: Map<string, ActionHandler>;

  constructor(config: TrustGuardianConfig = {}) {
    // Set defaults
    this.config = {
      permissionConfig: config.permissionConfig ?? {},
      auditConfig: config.auditConfig ?? {
        backends: [new InMemoryAuditBackend()],
      },
      loopDetection: config.loopDetection ?? {
        windowSize: 20,
        minRepetitions: 3,
        resetIntervalMs: 300000, // 5 minutes
        fuzzyMatching: true,
      },
      twoFactorConfig: config.twoFactorConfig ?? {
        supportedTypes: ['totp', 'email'],
        challengeExpirySeconds: 300,
        maxAttempts: 3,
        cooldownSeconds: 900,
      },
      handoffConfig: config.handoffConfig ?? {
        defaultDeadlineMinutes: 30,
        escalationPath: ['supervisor', 'manager', 'admin'],
        autoResolveTimeoutMinutes: 0,
        autoResolveDecision: 'deny',
      },
      managerAIConfig: config.managerAIConfig ?? {
        managerAgentId: 'manager-ai-default',
        requestDecision: async () => {
          throw new Error('Manager AI not configured');
        },
        confidenceThreshold: 0.8,
        alwaysEscalateCategories: [ActionCategory.SECURITY],
      },
      debug: config.debug ?? false,
      actionHandlers: config.actionHandlers ?? new Map(),
      preActionHooks: config.preActionHooks ?? [],
      postActionHooks: config.postActionHooks ?? [],
    };

    // Initialize components
    this.permissionManager = getPermissionManager(this.config.permissionConfig);
    this.auditLogger = getAuditLogger(this.config.auditConfig);

    // Sort hooks by priority
    this.preHooks = [...this.config.preActionHooks].sort(
      (a, b) => b.priority - a.priority
    );
    this.postHooks = [...this.config.postActionHooks].sort(
      (a, b) => b.priority - a.priority
    );
    this.actionHandlers = this.config.actionHandlers;
  }

  // ===========================================================================
  // PUBLIC API - SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new session
   */
  createSession(
    userId: string,
    trustLevel: TrustLevel,
    organizationId?: string,
    role?: string
  ): TrustContext {
    const sessionId = this.generateId();
    const now = new Date();

    const context: TrustContext = {
      userId,
      trustLevel,
      sessionId,
      sessionStartedAt: now,
      sessionActionCount: 0,
      sessionErrorCount: 0,
      dailyActionCount: 0,
      dailyBudgetSpent: 0,
      recentActionTypes: [],
      twoFactorVerified: false,
      organizationId,
      role,
    };

    const state: SessionState = {
      context,
      loopState: {
        recentSignatures: [],
        patternCounts: new Map(),
        lastReset: now,
        loopDetected: false,
      },
      pending2FA: new Map(),
      pendingHandoffs: new Map(),
      pendingManagerApprovals: new Map(),
      actionHistory: [],
    };

    this.sessions.set(sessionId, state);

    // Log session start
    this.auditLogger.logSession(AuditEventType.SESSION_STARTED, context);

    if (this.config.debug) {
      console.log(
        `[TrustGuardian] Session created: ${sessionId} for user ${userId} at L${trustLevel}`
      );
    }

    return context;
  }

  /**
   * Get session context
   */
  getSession(sessionId: string): TrustContext | null {
    return this.sessions.get(sessionId)?.context ?? null;
  }

  /**
   * Update session context
   */
  updateSession(
    sessionId: string,
    updates: Partial<TrustContext>
  ): TrustContext | null {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return null;
    }

    state.context = { ...state.context, ...updates };
    return state.context;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return;
    }

    // Expire any pending requests
    const handoffs = Array.from(state.pendingHandoffs.values());
    for (const handoff of handoffs) {
      handoff.status = 'expired';
      await this.auditLogger.logHandoff(handoff, AuditEventType.HANDOFF_EXPIRED);
    }

    // Log session end
    await this.auditLogger.logSession(
      AuditEventType.SESSION_ENDED,
      state.context
    );

    this.sessions.delete(sessionId);

    if (this.config.debug) {
      console.log(`[TrustGuardian] Session ended: ${sessionId}`);
    }
  }

  // ===========================================================================
  // PUBLIC API - TRUST LEVEL MANAGEMENT
  // ===========================================================================

  /**
   * Change trust level for a session
   */
  async changeTrustLevel(
    sessionId: string,
    newLevel: TrustLevel,
    reason: string,
    changedBy: string
  ): Promise<boolean> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return false;
    }

    const oldLevel = state.context.trustLevel;

    // Log the change
    await this.auditLogger.logTrustLevelChange(
      state.context.userId,
      sessionId,
      oldLevel,
      newLevel,
      reason,
      changedBy,
      state.context.organizationId
    );

    // Update context
    state.context.trustLevel = newLevel;

    // Reset verification status on elevation
    if (newLevel > oldLevel) {
      state.context.twoFactorVerified = false;
    }

    if (this.config.debug) {
      console.log(
        `[TrustGuardian] Trust level changed: ${sessionId} from L${oldLevel} to L${newLevel}`
      );
    }

    return true;
  }

  /**
   * Get trust level configuration
   */
  getTrustLevelConfig(level: TrustLevel): TrustLevelConfig {
    return TRUST_LEVEL_CONFIGS[level];
  }

  // ===========================================================================
  // PUBLIC API - ACTION EXECUTION
  // ===========================================================================

  /**
   * Execute an action with full trust checks
   */
  async executeAction(request: ExecutionRequest): Promise<ExecutionResponse> {
    const { action, context } = request;
    const state = this.sessions.get(context.sessionId);

    if (!state) {
      throw new Error(`Session not found: ${context.sessionId}`);
    }

    const startTime = Date.now();
    let auditEntryId = '';

    try {
      // Step 1: Run pre-action hooks
      const hookResult = await this.runPreHooks(action, context);
      if (!hookResult.proceed) {
        const result = this.createDeniedResponse(
          action,
          context,
          `Pre-hook blocked: ${hookResult.reason}`
        );
        auditEntryId = await this.auditLogger.logPermissionCheck(
          action,
          context,
          result.permissionResult
        );
        return { ...result, auditEntryId };
      }
      const effectiveAction = hookResult.modifiedAction ?? action;

      // Step 2: Check for loops
      const loopCheck = this.checkForLoop(effectiveAction, state);
      if (loopCheck.detected) {
        await this.auditLogger.logLoopDetection(
          context,
          loopCheck.pattern!,
          effectiveAction
        );
        return this.createHandoffResponse(
          effectiveAction,
          context,
          HandoffReason.LOOP_DETECTED,
          `Loop detected: ${loopCheck.pattern}`,
          state
        );
      }

      // Step 3: Check permissions (unless skipped)
      let permissionResult: PermissionResult;
      if (request.skipPermissionCheck) {
        permissionResult = {
          decision: PermissionDecision.ALLOW,
          action: effectiveAction,
          trustLevel: context.trustLevel,
          reason: 'Permission check skipped',
          decidedAt: new Date(),
        };
      } else {
        permissionResult = this.permissionManager.checkPermission(
          effectiveAction,
          context
        );
      }

      // Log permission check
      auditEntryId = await this.auditLogger.logPermissionCheck(
        effectiveAction,
        context,
        permissionResult
      );

      // Step 4: Handle different permission decisions
      switch (permissionResult.decision) {
        case PermissionDecision.ALLOW:
          return this.executeAllowedAction(
            effectiveAction,
            context,
            permissionResult,
            state,
            auditEntryId,
            startTime
          );

        case PermissionDecision.DENY:
          return {
            executed: false,
            permissionResult,
            updatedContext: state.context,
            auditEntryId,
          };

        case PermissionDecision.REQUIRE_2FA:
          return this.handle2FARequired(
            effectiveAction,
            context,
            permissionResult,
            state,
            request.twoFactorResponse,
            auditEntryId
          );

        case PermissionDecision.REQUIRE_APPROVAL:
          return this.handleApprovalRequired(
            effectiveAction,
            context,
            permissionResult,
            state,
            request.humanApproval,
            auditEntryId
          );

        case PermissionDecision.REQUIRE_MANAGER_APPROVAL:
          return this.handleManagerApprovalRequired(
            effectiveAction,
            context,
            permissionResult,
            state,
            request.managerApproval,
            auditEntryId
          );

        case PermissionDecision.QUEUE_FOR_REVIEW:
          return this.handleQueueForReview(
            effectiveAction,
            context,
            permissionResult,
            state,
            auditEntryId
          );

        default:
          throw new Error(`Unknown permission decision: ${permissionResult.decision}`);
      }
    } catch (error) {
      // Log error
      await this.auditLogger.logError(error as Error, context);
      state.context.sessionErrorCount++;

      throw error;
    }
  }

  /**
   * Quick permission check without execution
   */
  checkPermission(action: Action, context: TrustContext): PermissionResult {
    return this.permissionManager.checkPermission(action, context);
  }

  /**
   * Register an action handler
   */
  registerActionHandler(actionType: string, handler: ActionHandler): void {
    this.actionHandlers.set(actionType, handler);
  }

  /**
   * Add a pre-action hook
   */
  addPreHook(hook: PreActionHook): void {
    this.preHooks.push(hook);
    this.preHooks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Add a post-action hook
   */
  addPostHook(hook: PostActionHook): void {
    this.postHooks.push(hook);
    this.postHooks.sort((a, b) => b.priority - a.priority);
  }

  // ===========================================================================
  // PUBLIC API - 2FA
  // ===========================================================================

  /**
   * Verify 2FA response
   */
  async verify2FA(
    sessionId: string,
    requestId: string,
    response: string
  ): Promise<{ verified: boolean; action?: Action }> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { verified: false };
    }

    const request = state.pending2FA.get(requestId);
    if (!request) {
      return { verified: false };
    }

    // Check expiry
    if (new Date() > request.expiresAt) {
      request.status = 'expired';
      state.pending2FA.delete(requestId);
      return { verified: false };
    }

    // Check attempts
    request.attempts++;
    if (request.attempts > request.maxAttempts) {
      request.status = 'failed';
      await this.auditLogger.logTwoFactor(request, state.context, 'failed');
      state.pending2FA.delete(requestId);
      return { verified: false };
    }

    // Verify with provider
    let verified = false;
    if (this.config.twoFactorConfig.providers) {
      verified = await this.config.twoFactorConfig.providers.verifyChallenge(
        state.context.userId,
        request.challengeType,
        response,
        requestId
      );
    } else {
      // Default: accept any response (for development)
      verified = response.length > 0;
    }

    if (verified) {
      request.status = 'verified';
      state.context.twoFactorVerified = true;
      await this.auditLogger.logTwoFactor(request, state.context, 'verified');
      state.pending2FA.delete(requestId);
      return { verified: true, action: request.action };
    }

    return { verified: false };
  }

  // ===========================================================================
  // PUBLIC API - HANDOFF
  // ===========================================================================

  /**
   * Create a human handoff request
   */
  async createHandoff(
    action: Action,
    context: TrustContext,
    reason: HandoffReason,
    explanation: string
  ): Promise<HandoffRequest> {
    const state = this.sessions.get(context.sessionId);
    if (!state) {
      throw new Error(`Session not found: ${context.sessionId}`);
    }

    const request: HandoffRequest = {
      id: this.generateId(),
      action,
      reason,
      explanation,
      context: { ...context },
      priority: this.determineHandoffPriority(action, reason),
      createdAt: new Date(),
      deadline: new Date(
        Date.now() + this.config.handoffConfig.defaultDeadlineMinutes * 60 * 1000
      ),
      suggestions: this.generateHandoffSuggestions(action, reason),
      relatedActions: state.actionHistory.slice(-5).map((a) => a.id),
      status: 'pending',
    };

    state.pendingHandoffs.set(request.id, request);

    // Log and notify
    await this.auditLogger.logHandoff(request, AuditEventType.HANDOFF_REQUESTED);
    if (this.config.handoffConfig.notifications?.onHandoffCreated) {
      await this.config.handoffConfig.notifications.onHandoffCreated(request);
    }

    if (this.config.debug) {
      console.log(
        `[TrustGuardian] Handoff created: ${request.id} for action ${action.type}`
      );
    }

    return request;
  }

  /**
   * Acknowledge a handoff request
   */
  async acknowledgeHandoff(
    sessionId: string,
    handoffId: string,
    acknowledgedBy: string
  ): Promise<boolean> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return false;
    }

    const request = state.pendingHandoffs.get(handoffId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'acknowledged';

    await this.auditLogger.logHandoff(
      request,
      AuditEventType.HANDOFF_ACKNOWLEDGED
    );
    if (this.config.handoffConfig.notifications?.onHandoffAcknowledged) {
      await this.config.handoffConfig.notifications.onHandoffAcknowledged(
        request
      );
    }

    return true;
  }

  /**
   * Resolve a handoff request
   */
  async resolveHandoff(
    sessionId: string,
    handoffId: string,
    resolution: HandoffResolution
  ): Promise<{ resolved: boolean; action?: Action }> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { resolved: false };
    }

    const request = state.pendingHandoffs.get(handoffId);
    if (!request) {
      return { resolved: false };
    }

    request.status = 'resolved';
    request.resolution = resolution;

    await this.auditLogger.logHandoff(
      request,
      AuditEventType.HANDOFF_RESOLVED,
      resolution
    );
    if (this.config.handoffConfig.notifications?.onHandoffResolved) {
      await this.config.handoffConfig.notifications.onHandoffResolved(request);
    }

    // Apply trust level adjustment if specified
    if (resolution.trustLevelAdjustment !== undefined) {
      await this.changeTrustLevel(
        sessionId,
        resolution.trustLevelAdjustment,
        `Adjusted during handoff resolution`,
        resolution.resolvedBy
      );
    }

    // Update last human review time
    state.context.lastHumanReview = new Date();

    state.pendingHandoffs.delete(handoffId);

    if (resolution.decision === 'approve') {
      return {
        resolved: true,
        action: resolution.modifiedAction
          ? { ...request.action, ...resolution.modifiedAction }
          : request.action,
      };
    }

    return { resolved: true };
  }

  /**
   * Get pending handoffs for a session
   */
  getPendingHandoffs(sessionId: string): HandoffRequest[] {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return [];
    }
    return Array.from(state.pendingHandoffs.values());
  }

  // ===========================================================================
  // PUBLIC API - MANAGER AI (L5)
  // ===========================================================================

  /**
   * Request manager AI decision
   */
  async requestManagerDecision(
    action: Action,
    context: TrustContext
  ): Promise<ManagerDecision> {
    if (context.trustLevel !== TrustLevel.ENTERPRISE) {
      throw new Error('Manager AI approval only available at L5 (Enterprise)');
    }

    const decision = await this.config.managerAIConfig.requestDecision(
      action,
      context
    );

    await this.auditLogger.logManagerDecision(decision, context);

    return decision;
  }

  // ===========================================================================
  // PUBLIC API - AUDIT
  // ===========================================================================

  /**
   * Get audit logger for direct queries
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Query audit entries
   */
  async queryAudit(
    sessionId?: string,
    limit = 100
  ): Promise<AuditEntry[]> {
    return this.auditLogger.query({
      sessionIds: sessionId ? [sessionId] : undefined,
      limit,
      sortOrder: 'desc',
    });
  }

  // ===========================================================================
  // PRIVATE METHODS - EXECUTION
  // ===========================================================================

  private async executeAllowedAction(
    action: Action,
    context: TrustContext,
    permissionResult: PermissionResult,
    state: SessionState,
    auditEntryId: string,
    startTime: number
  ): Promise<ExecutionResponse> {
    // Log action start
    await this.auditLogger.logAction(
      AuditEventType.ACTION_STARTED,
      action,
      context
    );

    // Execute the action
    let actionResult: ActionResult;
    const handler = this.actionHandlers.get(action.type);

    if (handler) {
      actionResult = await handler(action, context);
    } else {
      // Default: simulate successful execution
      actionResult = {
        success: true,
        duration: Date.now() - startTime,
      };
    }

    // Update state
    this.updateStateAfterAction(action, actionResult, state);

    // Log action completion/failure
    await this.auditLogger.logAction(
      actionResult.success
        ? AuditEventType.ACTION_COMPLETED
        : AuditEventType.ACTION_FAILED,
      action,
      context,
      {
        result: actionResult.result,
        error: actionResult.error,
        duration: actionResult.duration,
        affectedResources: actionResult.affectedResources,
      }
    );

    // Run post-hooks
    await this.runPostHooks(action, context, actionResult);

    return {
      executed: true,
      permissionResult,
      actionResult,
      updatedContext: state.context,
      auditEntryId,
    };
  }

  private async handle2FARequired(
    action: Action,
    context: TrustContext,
    permissionResult: PermissionResult,
    state: SessionState,
    twoFactorResponse?: string,
    auditEntryId?: string
  ): Promise<ExecutionResponse> {
    // Check if we have a pending 2FA for this action
    const existingRequest = Array.from(state.pending2FA.values()).find(
      (r) => r.action.id === action.id && r.status === 'pending'
    );

    if (existingRequest && twoFactorResponse) {
      // Verify the response
      const { verified } = await this.verify2FA(
        context.sessionId,
        existingRequest.id,
        twoFactorResponse
      );

      if (verified) {
        // Re-execute with 2FA verified
        state.context.twoFactorVerified = true;
        return this.executeAction({
          action,
          context: state.context,
          skipPermissionCheck: true, // We already checked
        });
      }

      return {
        executed: false,
        permissionResult: {
          ...permissionResult,
          reason: '2FA verification failed',
        },
        twoFactorRequest: existingRequest,
        updatedContext: state.context,
        auditEntryId: auditEntryId || '',
      };
    }

    // Create new 2FA request
    const request = await this.create2FARequest(action, context, state);

    return {
      executed: false,
      permissionResult,
      twoFactorRequest: request,
      updatedContext: state.context,
      auditEntryId: auditEntryId || '',
    };
  }

  private async handleApprovalRequired(
    action: Action,
    context: TrustContext,
    permissionResult: PermissionResult,
    state: SessionState,
    humanApproval?: HandoffResolution,
    auditEntryId?: string
  ): Promise<ExecutionResponse> {
    // Check if we have approval
    if (humanApproval && humanApproval.decision === 'approve') {
      const effectiveAction = humanApproval.modifiedAction
        ? { ...action, ...humanApproval.modifiedAction }
        : action;

      return this.executeAction({
        action: effectiveAction,
        context: state.context,
        skipPermissionCheck: true,
      });
    }

    // Create handoff request
    const handoff = await this.createHandoff(
      action,
      context,
      permissionResult.handoffReason || HandoffReason.TRUST_LEVEL,
      permissionResult.reason
    );

    return {
      executed: false,
      permissionResult,
      handoffRequest: handoff,
      updatedContext: state.context,
      auditEntryId: auditEntryId || '',
    };
  }

  private async handleManagerApprovalRequired(
    action: Action,
    context: TrustContext,
    permissionResult: PermissionResult,
    state: SessionState,
    managerApproval?: ManagerDecision,
    auditEntryId?: string
  ): Promise<ExecutionResponse> {
    // Check if we have manager approval
    if (managerApproval) {
      if (managerApproval.decision === PermissionDecision.ALLOW) {
        return this.executeAction({
          action,
          context: state.context,
          skipPermissionCheck: true,
        });
      }

      if (managerApproval.escalateToHuman) {
        // Escalate to human
        return this.handleApprovalRequired(
          action,
          context,
          permissionResult,
          state,
          undefined,
          auditEntryId
        );
      }

      return {
        executed: false,
        permissionResult: {
          ...permissionResult,
          decision: managerApproval.decision,
          reason: `Manager AI: ${managerApproval.reasoning}`,
        },
        updatedContext: state.context,
        auditEntryId: auditEntryId || '',
      };
    }

    // Request manager decision
    state.pendingManagerApprovals.set(action.id, action);

    // Log manager decision request via security event
    await this.auditLogger.logSecurityEvent(
      AuditEventType.ANOMALY_DETECTED,
      context,
      `Manager AI decision requested for ${action.type}`,
      { actionId: action.id, actionType: action.type }
    );

    return {
      executed: false,
      permissionResult,
      managerApprovalPending: true,
      updatedContext: state.context,
      auditEntryId: auditEntryId || '',
    };
  }

  private async handleQueueForReview(
    action: Action,
    context: TrustContext,
    permissionResult: PermissionResult,
    state: SessionState,
    auditEntryId: string
  ): Promise<ExecutionResponse> {
    // For queue for review, we execute the action but mark for periodic review
    const result = await this.executeAllowedAction(
      action,
      context,
      permissionResult,
      state,
      auditEntryId,
      Date.now()
    );

    // Create a low-priority handoff for review
    const handoff = await this.createHandoff(
      action,
      context,
      HandoffReason.PERIODIC_REVIEW,
      'Queued for periodic human review'
    );
    handoff.priority = 'low';

    return {
      ...result,
      handoffRequest: handoff,
    };
  }

  // ===========================================================================
  // PRIVATE METHODS - 2FA
  // ===========================================================================

  private async create2FARequest(
    action: Action,
    context: TrustContext,
    state: SessionState
  ): Promise<TwoFactorRequest> {
    const request: TwoFactorRequest = {
      id: this.generateId(),
      action,
      challengeType: this.config.twoFactorConfig.supportedTypes[0],
      createdAt: new Date(),
      expiresAt: new Date(
        Date.now() + this.config.twoFactorConfig.challengeExpirySeconds * 1000
      ),
      attempts: 0,
      maxAttempts: this.config.twoFactorConfig.maxAttempts,
      status: 'pending',
    };

    state.pending2FA.set(request.id, request);

    // Send challenge if provider configured
    if (this.config.twoFactorConfig.providers) {
      await this.config.twoFactorConfig.providers.sendChallenge(
        context.userId,
        request.challengeType,
        action
      );
    }

    await this.auditLogger.logTwoFactor(request, context, 'requested');

    return request;
  }

  // ===========================================================================
  // PRIVATE METHODS - LOOP DETECTION
  // ===========================================================================

  private checkForLoop(
    action: Action,
    state: SessionState
  ): { detected: boolean; pattern?: string } {
    const loopState = state.loopState;
    const now = Date.now();

    // Reset if interval passed
    if (now - loopState.lastReset.getTime() > this.config.loopDetection.resetIntervalMs) {
      loopState.recentSignatures = [];
      loopState.patternCounts.clear();
      loopState.lastReset = new Date();
      loopState.loopDetected = false;
    }

    // Create action signature
    const signature = this.createActionSignature(action);
    loopState.recentSignatures.push(signature);

    // Trim to window size
    if (loopState.recentSignatures.length > this.config.loopDetection.windowSize) {
      loopState.recentSignatures.shift();
    }

    // Check for patterns
    const patterns = this.detectPatterns(loopState.recentSignatures);
    for (const pattern of patterns) {
      const count = loopState.patternCounts.get(pattern) ?? 0;
      loopState.patternCounts.set(pattern, count + 1);

      if (count + 1 >= this.config.loopDetection.minRepetitions) {
        loopState.loopDetected = true;
        loopState.detectedPattern = pattern;
        return { detected: true, pattern };
      }
    }

    // Check always-flag patterns
    const alwaysFlag = this.config.loopDetection.alwaysFlagPatterns ?? [];
    for (const flagPattern of alwaysFlag) {
      if (signature.includes(flagPattern)) {
        return { detected: true, pattern: `Always-flag: ${flagPattern}` };
      }
    }

    return { detected: false };
  }

  private createActionSignature(action: Action): string {
    const parts = [action.type, action.category];
    if (action.resourceType) parts.push(action.resourceType);
    if (action.resourceId) parts.push(action.resourceId.substring(0, 8));
    return parts.join(':');
  }

  private detectPatterns(signatures: string[]): string[] {
    const patterns: string[] = [];

    // Simple pattern: same action repeated
    const lastSignature = signatures[signatures.length - 1];
    let repeatCount = 0;
    for (let i = signatures.length - 1; i >= 0; i--) {
      if (signatures[i] === lastSignature) {
        repeatCount++;
      } else {
        break;
      }
    }
    if (repeatCount >= 2) {
      patterns.push(`repeat:${lastSignature}`);
    }

    // Alternating pattern: A-B-A-B
    if (signatures.length >= 4) {
      const last4 = signatures.slice(-4);
      if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
        patterns.push(`alternate:${last4[0]}:${last4[1]}`);
      }
    }

    // Cycle pattern: A-B-C-A-B-C
    if (signatures.length >= 6) {
      const last6 = signatures.slice(-6);
      if (
        last6[0] === last6[3] &&
        last6[1] === last6[4] &&
        last6[2] === last6[5]
      ) {
        patterns.push(`cycle:${last6[0]}:${last6[1]}:${last6[2]}`);
      }
    }

    return patterns;
  }

  // ===========================================================================
  // PRIVATE METHODS - HOOKS
  // ===========================================================================

  private async runPreHooks(
    action: Action,
    context: TrustContext
  ): Promise<{ proceed: boolean; reason?: string; modifiedAction?: Action }> {
    let currentAction = action;

    for (const hook of this.preHooks) {
      try {
        const result = await hook.execute(currentAction, context);
        if (!result.proceed) {
          return { proceed: false, reason: result.reason };
        }
        if (result.modifiedAction) {
          currentAction = result.modifiedAction;
        }
      } catch (error) {
        if (this.config.debug) {
          console.error(`[TrustGuardian] Pre-hook ${hook.name} failed:`, error);
        }
        return { proceed: false, reason: `Hook ${hook.name} failed` };
      }
    }

    return { proceed: true, modifiedAction: currentAction };
  }

  private async runPostHooks(
    action: Action,
    context: TrustContext,
    result: ActionResult
  ): Promise<void> {
    for (const hook of this.postHooks) {
      try {
        await hook.execute(action, context, result);
      } catch (error) {
        if (this.config.debug) {
          console.error(`[TrustGuardian] Post-hook ${hook.name} failed:`, error);
        }
      }
    }
  }

  // ===========================================================================
  // PRIVATE METHODS - UTILITIES
  // ===========================================================================

  private updateStateAfterAction(
    action: Action,
    result: ActionResult,
    state: SessionState
  ): void {
    // Update counters
    state.context.sessionActionCount++;
    state.context.dailyActionCount++;
    state.context.lastActionAt = new Date();

    if (!result.success) {
      state.context.sessionErrorCount++;
    }

    // Update budget
    if (action.monetaryValue && result.success) {
      state.context.dailyBudgetSpent += action.monetaryValue;
    }

    // Update recent action types (for loop detection)
    state.context.recentActionTypes.push(action.type);
    if (state.context.recentActionTypes.length > 20) {
      state.context.recentActionTypes.shift();
    }

    // Add to history
    state.actionHistory.push(action);
    if (state.actionHistory.length > 100) {
      state.actionHistory.shift();
    }
  }

  private createDeniedResponse(
    action: Action,
    context: TrustContext,
    reason: string
  ): ExecutionResponse {
    return {
      executed: false,
      permissionResult: {
        decision: PermissionDecision.DENY,
        action,
        trustLevel: context.trustLevel,
        reason,
        decidedAt: new Date(),
      },
      updatedContext: context,
      auditEntryId: '',
    };
  }

  private createHandoffResponse(
    action: Action,
    context: TrustContext,
    reason: HandoffReason,
    explanation: string,
    state: SessionState
  ): ExecutionResponse {
    const handoffPromise = this.createHandoff(action, context, reason, explanation);

    // We need to return sync, so we'll create a placeholder
    const placeholderHandoff: HandoffRequest = {
      id: this.generateId(),
      action,
      reason,
      explanation,
      context,
      priority: this.determineHandoffPriority(action, reason),
      createdAt: new Date(),
      status: 'pending',
    };

    // Actually create the handoff async
    handoffPromise.then((h) => {
      state.pendingHandoffs.set(h.id, h);
    });

    return {
      executed: false,
      permissionResult: {
        decision: PermissionDecision.REQUIRE_APPROVAL,
        action,
        trustLevel: context.trustLevel,
        reason: explanation,
        handoffReason: reason,
        decidedAt: new Date(),
      },
      handoffRequest: placeholderHandoff,
      updatedContext: state.context,
      auditEntryId: '',
    };
  }

  private determineHandoffPriority(
    action: Action,
    reason: HandoffReason
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical reasons
    if (
      [HandoffReason.ANOMALY_DETECTED, HandoffReason.POLICY_VIOLATION].includes(
        reason
      )
    ) {
      return 'critical';
    }

    // High risk actions
    if (
      getRiskLevelValue(action.riskLevel) >= getRiskLevelValue(RiskLevel.HIGH)
    ) {
      return 'high';
    }

    // Medium for most approval needs
    if (
      [HandoffReason.TRUST_LEVEL, HandoffReason.RISK_THRESHOLD].includes(reason)
    ) {
      return 'medium';
    }

    // Low for periodic reviews
    return 'low';
  }

  private generateHandoffSuggestions(
    action: Action,
    reason: HandoffReason
  ): string[] {
    const suggestions: string[] = [];

    suggestions.push(`Review the ${action.type} action details`);

    if (reason === HandoffReason.BUDGET_LIMIT) {
      suggestions.push('Consider adjusting the daily budget limit');
      suggestions.push('Split the transaction into smaller amounts');
    }

    if (reason === HandoffReason.LOOP_DETECTED) {
      suggestions.push('Check if this is an expected automation pattern');
      suggestions.push('Consider adding this pattern to the allowed list');
    }

    if (action.category === ActionCategory.DELETE) {
      suggestions.push('Verify the data can be restored if needed');
      suggestions.push('Consider archiving instead of deleting');
    }

    suggestions.push('Approve to proceed, deny to block, or modify the action');

    return suggestions;
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// =============================================================================
// FACTORY & SINGLETON
// =============================================================================

let defaultGuardian: TrustGuardian | null = null;

/**
 * Get or create the default TrustGuardian instance
 */
export function getTrustGuardian(config?: TrustGuardianConfig): TrustGuardian {
  if (!defaultGuardian || config) {
    defaultGuardian = new TrustGuardian(config);
  }
  return defaultGuardian;
}

/**
 * Reset the default guardian (for testing)
 */
export function resetTrustGuardian(): void {
  defaultGuardian = null;
}

export default TrustGuardian;
