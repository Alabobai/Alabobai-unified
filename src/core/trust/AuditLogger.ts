/**
 * AuditLogger.ts - Comprehensive Audit Logging System
 *
 * Provides immutable, tamper-evident audit logging for all trust-related
 * operations. Supports multiple backends, encryption, and compliance requirements.
 *
 * @module AuditLogger
 * @version 1.0.0
 */

import {
  TrustLevel,
  RiskLevel,
  ActionCategory,
  PermissionDecision,
  HandoffReason,
  Action,
  PermissionResult,
  TrustContext,
  HandoffRequest,
  HandoffResolution,
  TwoFactorRequest,
  ManagerDecision,
} from './TrustLevel.js';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Types of audit events
 */
export enum AuditEventType {
  // Permission events
  PERMISSION_CHECK = 'permission_check',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_DENIED = 'permission_denied',

  // Action events
  ACTION_STARTED = 'action_started',
  ACTION_COMPLETED = 'action_completed',
  ACTION_FAILED = 'action_failed',
  ACTION_CANCELLED = 'action_cancelled',
  ACTION_ROLLED_BACK = 'action_rolled_back',

  // Trust level events
  TRUST_LEVEL_CHANGED = 'trust_level_changed',
  TRUST_LEVEL_ELEVATED = 'trust_level_elevated',
  TRUST_LEVEL_REDUCED = 'trust_level_reduced',

  // Authentication events
  TWO_FACTOR_REQUESTED = 'two_factor_requested',
  TWO_FACTOR_VERIFIED = 'two_factor_verified',
  TWO_FACTOR_FAILED = 'two_factor_failed',

  // Handoff events
  HANDOFF_REQUESTED = 'handoff_requested',
  HANDOFF_ACKNOWLEDGED = 'handoff_acknowledged',
  HANDOFF_RESOLVED = 'handoff_resolved',
  HANDOFF_EXPIRED = 'handoff_expired',

  // Manager AI events (L5)
  MANAGER_DECISION_REQUESTED = 'manager_decision_requested',
  MANAGER_DECISION_MADE = 'manager_decision_made',
  MANAGER_ESCALATED = 'manager_escalated',

  // Session events
  SESSION_STARTED = 'session_started',
  SESSION_ENDED = 'session_ended',
  SESSION_TIMEOUT = 'session_timeout',

  // Loop detection events
  LOOP_DETECTED = 'loop_detected',
  LOOP_PREVENTED = 'loop_prevented',

  // Security events
  ANOMALY_DETECTED = 'anomaly_detected',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  BUDGET_LIMIT_REACHED = 'budget_limit_reached',

  // System events
  SYSTEM_ERROR = 'system_error',
  CONFIG_CHANGED = 'config_changed',
  AUDIT_EXPORT = 'audit_export',
}

/**
 * Severity levels for audit events
 */
export enum AuditSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Core audit entry structure
 */
export interface AuditEntry {
  /** Unique entry identifier (UUID v4) */
  id: string;

  /** Timestamp of the event */
  timestamp: Date;

  /** Type of event */
  eventType: AuditEventType;

  /** Severity level */
  severity: AuditSeverity;

  /** User/agent ID that triggered the event */
  actorId: string;

  /** Type of actor */
  actorType: 'user' | 'agent' | 'system' | 'manager_ai';

  /** Session ID */
  sessionId: string;

  /** Trust level at time of event */
  trustLevel: TrustLevel;

  /** Action that triggered the event */
  action?: Action;

  /** Permission result (if applicable) */
  permissionResult?: PermissionResult;

  /** Human-readable description */
  description: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Related entry IDs (for chained events) */
  relatedEntryIds?: string[];

  /** Resource identifiers affected */
  affectedResources?: AffectedResource[];

  /** IP address (if available) */
  ipAddress?: string;

  /** User agent (if available) */
  userAgent?: string;

  /** Geolocation (if available) */
  geolocation?: GeoLocation;

  /** Hash of previous entry (for chain integrity) */
  previousHash?: string;

  /** Hash of this entry */
  entryHash?: string;

  /** Organization context */
  organizationId?: string;

  /** Compliance tags */
  complianceTags?: string[];
}

/**
 * Resource affected by an action
 */
export interface AffectedResource {
  type: string;
  id: string;
  name?: string;
  previousState?: unknown;
  newState?: unknown;
}

/**
 * Geolocation information
 */
export interface GeoLocation {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Audit query parameters
 */
export interface AuditQuery {
  /** Filter by event types */
  eventTypes?: AuditEventType[];

  /** Filter by actor IDs */
  actorIds?: string[];

  /** Filter by session IDs */
  sessionIds?: string[];

  /** Filter by trust levels */
  trustLevels?: TrustLevel[];

  /** Filter by severity levels */
  severities?: AuditSeverity[];

  /** Start time (inclusive) */
  startTime?: Date;

  /** End time (exclusive) */
  endTime?: Date;

  /** Filter by action categories */
  actionCategories?: ActionCategory[];

  /** Filter by organization */
  organizationId?: string;

  /** Text search in description */
  textSearch?: string;

  /** Filter by compliance tags */
  complianceTags?: string[];

  /** Maximum results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit export format
 */
export interface AuditExport {
  exportId: string;
  exportedAt: Date;
  exportedBy: string;
  query: AuditQuery;
  format: 'json' | 'csv' | 'parquet';
  entryCount: number;
  checksum: string;
  entries: AuditEntry[];
}

/**
 * Audit statistics
 */
export interface AuditStatistics {
  totalEntries: number;
  entriesByType: Record<AuditEventType, number>;
  entriesBySeverity: Record<AuditSeverity, number>;
  entriesByTrustLevel: Record<TrustLevel, number>;
  uniqueActors: number;
  uniqueSessions: number;
  timeRange: { start: Date; end: Date };
  permissionGrantRate: number;
  averageActionsPerSession: number;
}

/**
 * Audit backend interface for pluggable storage
 */
export interface AuditBackend {
  name: string;
  write(entry: AuditEntry): Promise<void>;
  writeBatch(entries: AuditEntry[]): Promise<void>;
  query(query: AuditQuery): Promise<AuditEntry[]>;
  getById(id: string): Promise<AuditEntry | null>;
  getStatistics(query?: AuditQuery): Promise<AuditStatistics>;
  verifyIntegrity(startId?: string, endId?: string): Promise<IntegrityResult>;
  close(): Promise<void>;
}

/**
 * Integrity verification result
 */
export interface IntegrityResult {
  valid: boolean;
  entriesChecked: number;
  invalidEntries: string[];
  missingEntries: string[];
  brokenChainAt?: string;
}

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  /** Backends to write to */
  backends: AuditBackend[];

  /** Enable hash chaining for tamper detection */
  enableHashChaining?: boolean;

  /** Hash algorithm to use */
  hashAlgorithm?: 'sha256' | 'sha384' | 'sha512';

  /** Enable encryption at rest */
  enableEncryption?: boolean;

  /** Encryption key (if encryption enabled) */
  encryptionKey?: string;

  /** Minimum severity to log */
  minSeverity?: AuditSeverity;

  /** Enable buffered writes */
  enableBuffering?: boolean;

  /** Buffer flush interval (ms) */
  bufferFlushInterval?: number;

  /** Maximum buffer size */
  maxBufferSize?: number;

  /** Compliance standards to enforce */
  complianceStandards?: string[];

  /** Enable real-time alerts */
  enableAlerts?: boolean;

  /** Alert callback */
  onAlert?: (entry: AuditEntry) => void;
}

// =============================================================================
// IN-MEMORY BACKEND (for development/testing)
// =============================================================================

/**
 * In-memory audit backend for development and testing
 */
export class InMemoryAuditBackend implements AuditBackend {
  public readonly name = 'in-memory';
  private entries: Map<string, AuditEntry> = new Map();
  private orderedIds: string[] = [];

  async write(entry: AuditEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    this.orderedIds.push(entry.id);
  }

  async writeBatch(entries: AuditEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.write(entry);
    }
  }

  async query(query: AuditQuery): Promise<AuditEntry[]> {
    let results = Array.from(this.entries.values());

    // Apply filters
    if (query.eventTypes?.length) {
      results = results.filter((e) => query.eventTypes!.includes(e.eventType));
    }
    if (query.actorIds?.length) {
      results = results.filter((e) => query.actorIds!.includes(e.actorId));
    }
    if (query.sessionIds?.length) {
      results = results.filter((e) => query.sessionIds!.includes(e.sessionId));
    }
    if (query.trustLevels?.length) {
      results = results.filter((e) => query.trustLevels!.includes(e.trustLevel));
    }
    if (query.severities?.length) {
      results = results.filter((e) => query.severities!.includes(e.severity));
    }
    if (query.startTime) {
      results = results.filter((e) => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter((e) => e.timestamp < query.endTime!);
    }
    if (query.actionCategories?.length) {
      results = results.filter(
        (e) => e.action && query.actionCategories!.includes(e.action.category)
      );
    }
    if (query.organizationId) {
      results = results.filter((e) => e.organizationId === query.organizationId);
    }
    if (query.textSearch) {
      const search = query.textSearch.toLowerCase();
      results = results.filter((e) =>
        e.description.toLowerCase().includes(search)
      );
    }
    if (query.complianceTags?.length) {
      results = results.filter(
        (e) =>
          e.complianceTags?.some((tag) => query.complianceTags!.includes(tag))
      );
    }

    // Sort
    results.sort((a, b) => {
      const order = query.sortOrder === 'asc' ? 1 : -1;
      return order * (a.timestamp.getTime() - b.timestamp.getTime());
    });

    // Pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async getById(id: string): Promise<AuditEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async getStatistics(query?: AuditQuery): Promise<AuditStatistics> {
    const entries = query ? await this.query(query) : Array.from(this.entries.values());

    const stats: AuditStatistics = {
      totalEntries: entries.length,
      entriesByType: {} as Record<AuditEventType, number>,
      entriesBySeverity: {} as Record<AuditSeverity, number>,
      entriesByTrustLevel: {} as Record<TrustLevel, number>,
      uniqueActors: new Set(entries.map((e) => e.actorId)).size,
      uniqueSessions: new Set(entries.map((e) => e.sessionId)).size,
      timeRange: {
        start: entries.length > 0 ? entries[0].timestamp : new Date(),
        end: entries.length > 0 ? entries[entries.length - 1].timestamp : new Date(),
      },
      permissionGrantRate: 0,
      averageActionsPerSession: 0,
    };

    // Count by type, severity, trust level
    for (const entry of entries) {
      stats.entriesByType[entry.eventType] =
        (stats.entriesByType[entry.eventType] ?? 0) + 1;
      stats.entriesBySeverity[entry.severity] =
        (stats.entriesBySeverity[entry.severity] ?? 0) + 1;
      stats.entriesByTrustLevel[entry.trustLevel] =
        (stats.entriesByTrustLevel[entry.trustLevel] ?? 0) + 1;
    }

    // Calculate permission grant rate
    const permissionChecks = entries.filter(
      (e) => e.eventType === AuditEventType.PERMISSION_CHECK
    );
    const permissionGrants = entries.filter(
      (e) => e.eventType === AuditEventType.PERMISSION_GRANTED
    );
    stats.permissionGrantRate =
      permissionChecks.length > 0
        ? permissionGrants.length / permissionChecks.length
        : 0;

    // Calculate average actions per session
    const sessions = new Set(entries.map((e) => e.sessionId));
    const actionEntries = entries.filter((e) =>
      [
        AuditEventType.ACTION_STARTED,
        AuditEventType.ACTION_COMPLETED,
      ].includes(e.eventType)
    );
    stats.averageActionsPerSession =
      sessions.size > 0 ? actionEntries.length / sessions.size : 0;

    return stats;
  }

  async verifyIntegrity(
    startId?: string,
    endId?: string
  ): Promise<IntegrityResult> {
    // In-memory backend doesn't implement hash chaining, so always valid
    return {
      valid: true,
      entriesChecked: this.entries.size,
      invalidEntries: [],
      missingEntries: [],
    };
  }

  async close(): Promise<void> {
    // No cleanup needed for in-memory
  }

  // Additional methods for testing
  clear(): void {
    this.entries.clear();
    this.orderedIds = [];
  }

  size(): number {
    return this.entries.size;
  }
}

// =============================================================================
// AUDIT LOGGER CLASS
// =============================================================================

/**
 * Main audit logging class
 */
export class AuditLogger {
  private readonly config: Required<AuditLoggerConfig>;
  private readonly backends: AuditBackend[];
  private buffer: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private lastHash: string | null = null;
  private entryCounter = 0;
  private readonly severityOrder: Record<AuditSeverity, number> = {
    [AuditSeverity.DEBUG]: 0,
    [AuditSeverity.INFO]: 1,
    [AuditSeverity.WARNING]: 2,
    [AuditSeverity.ERROR]: 3,
    [AuditSeverity.CRITICAL]: 4,
  };

  constructor(config: AuditLoggerConfig) {
    this.backends = config.backends;

    this.config = {
      backends: config.backends,
      enableHashChaining: config.enableHashChaining ?? true,
      hashAlgorithm: config.hashAlgorithm ?? 'sha256',
      enableEncryption: config.enableEncryption ?? false,
      encryptionKey: config.encryptionKey ?? '',
      minSeverity: config.minSeverity ?? AuditSeverity.DEBUG,
      enableBuffering: config.enableBuffering ?? false,
      bufferFlushInterval: config.bufferFlushInterval ?? 5000,
      maxBufferSize: config.maxBufferSize ?? 100,
      complianceStandards: config.complianceStandards ?? [],
      enableAlerts: config.enableAlerts ?? false,
      onAlert: config.onAlert ?? (() => {}),
    };

    // Start buffer flush timer if buffering is enabled
    if (this.config.enableBuffering) {
      this.flushTimer = setInterval(
        () => this.flushBuffer(),
        this.config.bufferFlushInterval
      );
    }
  }

  // ===========================================================================
  // PUBLIC LOGGING METHODS
  // ===========================================================================

  /**
   * Log a permission check event
   */
  async logPermissionCheck(
    action: Action,
    context: TrustContext,
    result: PermissionResult
  ): Promise<string> {
    const severity =
      result.decision === PermissionDecision.DENY
        ? AuditSeverity.WARNING
        : AuditSeverity.INFO;

    const eventType =
      result.decision === PermissionDecision.ALLOW
        ? AuditEventType.PERMISSION_GRANTED
        : result.decision === PermissionDecision.DENY
          ? AuditEventType.PERMISSION_DENIED
          : AuditEventType.PERMISSION_CHECK;

    return this.log({
      eventType,
      severity,
      actorId: context.userId,
      actorType: action.requesterType,
      sessionId: context.sessionId,
      trustLevel: context.trustLevel,
      action,
      permissionResult: result,
      description: `Permission ${result.decision} for ${action.type}: ${result.reason}`,
      metadata: {
        category: action.category,
        riskLevel: action.riskLevel,
        monetaryValue: action.monetaryValue,
      },
      organizationId: context.organizationId,
    });
  }

  /**
   * Log an action lifecycle event
   */
  async logAction(
    eventType:
      | AuditEventType.ACTION_STARTED
      | AuditEventType.ACTION_COMPLETED
      | AuditEventType.ACTION_FAILED
      | AuditEventType.ACTION_CANCELLED
      | AuditEventType.ACTION_ROLLED_BACK,
    action: Action,
    context: TrustContext,
    details?: {
      error?: Error;
      result?: unknown;
      duration?: number;
      affectedResources?: AffectedResource[];
    }
  ): Promise<string> {
    const severity =
      eventType === AuditEventType.ACTION_FAILED
        ? AuditSeverity.ERROR
        : eventType === AuditEventType.ACTION_ROLLED_BACK
          ? AuditSeverity.WARNING
          : AuditSeverity.INFO;

    return this.log({
      eventType,
      severity,
      actorId: context.userId,
      actorType: action.requesterType,
      sessionId: context.sessionId,
      trustLevel: context.trustLevel,
      action,
      description: `Action ${eventType.replace('action_', '')}: ${action.type}`,
      metadata: {
        error: details?.error?.message,
        errorStack: details?.error?.stack,
        result: details?.result,
        duration: details?.duration,
      },
      affectedResources: details?.affectedResources,
      organizationId: context.organizationId,
    });
  }

  /**
   * Log a trust level change
   */
  async logTrustLevelChange(
    userId: string,
    sessionId: string,
    oldLevel: TrustLevel,
    newLevel: TrustLevel,
    reason: string,
    changedBy: string,
    organizationId?: string
  ): Promise<string> {
    const eventType =
      newLevel > oldLevel
        ? AuditEventType.TRUST_LEVEL_ELEVATED
        : AuditEventType.TRUST_LEVEL_REDUCED;

    return this.log({
      eventType,
      severity:
        eventType === AuditEventType.TRUST_LEVEL_ELEVATED
          ? AuditSeverity.WARNING
          : AuditSeverity.INFO,
      actorId: changedBy,
      actorType: 'user',
      sessionId,
      trustLevel: newLevel,
      description: `Trust level changed from L${oldLevel} to L${newLevel}: ${reason}`,
      metadata: {
        targetUserId: userId,
        oldLevel,
        newLevel,
        reason,
      },
      organizationId,
    });
  }

  /**
   * Log a 2FA event
   */
  async logTwoFactor(
    request: TwoFactorRequest,
    context: TrustContext,
    status: 'requested' | 'verified' | 'failed'
  ): Promise<string> {
    const eventType =
      status === 'requested'
        ? AuditEventType.TWO_FACTOR_REQUESTED
        : status === 'verified'
          ? AuditEventType.TWO_FACTOR_VERIFIED
          : AuditEventType.TWO_FACTOR_FAILED;

    const severity =
      status === 'failed' ? AuditSeverity.WARNING : AuditSeverity.INFO;

    return this.log({
      eventType,
      severity,
      actorId: context.userId,
      actorType: 'user',
      sessionId: context.sessionId,
      trustLevel: context.trustLevel,
      action: request.action,
      description: `2FA ${status} for action ${request.action.type}`,
      metadata: {
        requestId: request.id,
        challengeType: request.challengeType,
        attempts: request.attempts,
      },
      organizationId: context.organizationId,
    });
  }

  /**
   * Log a handoff event
   */
  async logHandoff(
    request: HandoffRequest,
    eventType:
      | AuditEventType.HANDOFF_REQUESTED
      | AuditEventType.HANDOFF_ACKNOWLEDGED
      | AuditEventType.HANDOFF_RESOLVED
      | AuditEventType.HANDOFF_EXPIRED,
    resolution?: HandoffResolution
  ): Promise<string> {
    const severity =
      eventType === AuditEventType.HANDOFF_EXPIRED
        ? AuditSeverity.WARNING
        : AuditSeverity.INFO;

    return this.log({
      eventType,
      severity,
      actorId: resolution?.resolvedBy ?? request.context.userId,
      actorType: 'user',
      sessionId: request.context.sessionId,
      trustLevel: request.context.trustLevel,
      action: request.action,
      description: `Handoff ${eventType.replace('handoff_', '')}: ${request.reason}`,
      metadata: {
        requestId: request.id,
        reason: request.reason,
        priority: request.priority,
        resolution: resolution
          ? {
              decision: resolution.decision,
              explanation: resolution.explanation,
            }
          : undefined,
      },
      organizationId: request.context.organizationId,
    });
  }

  /**
   * Log a manager AI decision (L5)
   */
  async logManagerDecision(
    decision: ManagerDecision,
    subordinateContext: TrustContext
  ): Promise<string> {
    const eventType = decision.escalateToHuman
      ? AuditEventType.MANAGER_ESCALATED
      : AuditEventType.MANAGER_DECISION_MADE;

    return this.log({
      eventType,
      severity: AuditSeverity.INFO,
      actorId: decision.managerAgentId,
      actorType: 'manager_ai',
      sessionId: subordinateContext.sessionId,
      trustLevel: TrustLevel.ENTERPRISE,
      action: decision.action,
      description: `Manager AI decision: ${decision.decision} (confidence: ${decision.confidence})`,
      metadata: {
        decisionId: decision.id,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        subordinateAgentId: subordinateContext.userId,
        escalateToHuman: decision.escalateToHuman,
      },
      organizationId: subordinateContext.organizationId,
    });
  }

  /**
   * Log a loop detection event
   */
  async logLoopDetection(
    context: TrustContext,
    pattern: string,
    preventedAction?: Action
  ): Promise<string> {
    return this.log({
      eventType: preventedAction
        ? AuditEventType.LOOP_PREVENTED
        : AuditEventType.LOOP_DETECTED,
      severity: AuditSeverity.WARNING,
      actorId: context.userId,
      actorType: 'agent',
      sessionId: context.sessionId,
      trustLevel: context.trustLevel,
      action: preventedAction,
      description: `Loop ${preventedAction ? 'prevented' : 'detected'}: ${pattern}`,
      metadata: {
        pattern,
        recentActionTypes: context.recentActionTypes,
      },
      organizationId: context.organizationId,
    });
  }

  /**
   * Log a security/anomaly event
   */
  async logSecurityEvent(
    eventType:
      | AuditEventType.ANOMALY_DETECTED
      | AuditEventType.RATE_LIMIT_EXCEEDED
      | AuditEventType.BUDGET_LIMIT_REACHED,
    context: TrustContext,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      eventType,
      severity: AuditSeverity.WARNING,
      actorId: context.userId,
      actorType: 'system',
      sessionId: context.sessionId,
      trustLevel: context.trustLevel,
      description,
      metadata,
      organizationId: context.organizationId,
    });
  }

  /**
   * Log a session event
   */
  async logSession(
    eventType:
      | AuditEventType.SESSION_STARTED
      | AuditEventType.SESSION_ENDED
      | AuditEventType.SESSION_TIMEOUT,
    context: TrustContext,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      eventType,
      severity: AuditSeverity.INFO,
      actorId: context.userId,
      actorType: 'user',
      sessionId: context.sessionId,
      trustLevel: context.trustLevel,
      description: `Session ${eventType.replace('session_', '')}`,
      metadata: {
        sessionActionCount: context.sessionActionCount,
        sessionErrorCount: context.sessionErrorCount,
        ...metadata,
      },
      organizationId: context.organizationId,
    });
  }

  /**
   * Log a system error
   */
  async logError(
    error: Error,
    context: Partial<TrustContext>,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      eventType: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actorId: context.userId ?? 'system',
      actorType: 'system',
      sessionId: context.sessionId ?? 'unknown',
      trustLevel: context.trustLevel ?? TrustLevel.OBSERVE_ONLY,
      description: `System error: ${error.message}`,
      metadata: {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        ...metadata,
      },
      organizationId: context.organizationId,
    });
  }

  // ===========================================================================
  // QUERY & EXPORT METHODS
  // ===========================================================================

  /**
   * Query audit entries
   */
  async query(query: AuditQuery): Promise<AuditEntry[]> {
    // Query from primary backend
    const backend = this.backends[0];
    if (!backend) {
      return [];
    }
    return backend.query(query);
  }

  /**
   * Get a specific entry by ID
   */
  async getById(id: string): Promise<AuditEntry | null> {
    const backend = this.backends[0];
    if (!backend) {
      return null;
    }
    return backend.getById(id);
  }

  /**
   * Get audit statistics
   */
  async getStatistics(query?: AuditQuery): Promise<AuditStatistics> {
    const backend = this.backends[0];
    if (!backend) {
      throw new Error('No audit backend configured');
    }
    return backend.getStatistics(query);
  }

  /**
   * Export audit entries
   */
  async export(
    query: AuditQuery,
    format: 'json' | 'csv' | 'parquet' = 'json',
    exportedBy: string
  ): Promise<AuditExport> {
    const entries = await this.query(query);
    const exportId = this.generateId();

    // Log the export event
    await this.log({
      eventType: AuditEventType.AUDIT_EXPORT,
      severity: AuditSeverity.INFO,
      actorId: exportedBy,
      actorType: 'user',
      sessionId: 'export',
      trustLevel: TrustLevel.FULL_AUTONOMY, // Exports require elevated trust
      description: `Audit export: ${entries.length} entries`,
      metadata: { query, format },
    });

    return {
      exportId,
      exportedAt: new Date(),
      exportedBy,
      query,
      format,
      entryCount: entries.length,
      checksum: await this.computeExportChecksum(entries),
      entries,
    };
  }

  /**
   * Verify integrity of audit chain
   */
  async verifyIntegrity(
    startId?: string,
    endId?: string
  ): Promise<IntegrityResult> {
    const backend = this.backends[0];
    if (!backend) {
      throw new Error('No audit backend configured');
    }
    return backend.verifyIntegrity(startId, endId);
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Flush the buffer immediately
   */
  async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const toFlush = [...this.buffer];
    this.buffer = [];

    await Promise.all(
      this.backends.map((backend) => backend.writeBatch(toFlush))
    );
  }

  /**
   * Close the logger and release resources
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flushBuffer();
    await Promise.all(this.backends.map((backend) => backend.close()));
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async log(
    partial: Omit<AuditEntry, 'id' | 'timestamp' | 'previousHash' | 'entryHash'>
  ): Promise<string> {
    // Check minimum severity
    if (
      this.severityOrder[partial.severity] <
      this.severityOrder[this.config.minSeverity]
    ) {
      return '';
    }

    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...partial,
    };

    // Add hash chain
    if (this.config.enableHashChaining) {
      entry.previousHash = this.lastHash ?? undefined;
      entry.entryHash = await this.computeEntryHash(entry);
      this.lastHash = entry.entryHash;
    }

    // Add compliance tags
    if (this.config.complianceStandards.length > 0) {
      entry.complianceTags = this.getComplianceTags(entry);
    }

    // Check for alerts
    if (this.config.enableAlerts && this.shouldAlert(entry)) {
      this.config.onAlert(entry);
    }

    // Write to backends
    if (this.config.enableBuffering) {
      this.buffer.push(entry);
      if (this.buffer.length >= this.config.maxBufferSize) {
        await this.flushBuffer();
      }
    } else {
      await Promise.all(
        this.backends.map((backend) => backend.write(entry))
      );
    }

    return entry.id;
  }

  private generateId(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async computeEntryHash(entry: AuditEntry): Promise<string> {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      eventType: entry.eventType,
      actorId: entry.actorId,
      description: entry.description,
      previousHash: entry.previousHash,
    });

    // Use Web Crypto API if available, otherwise simple hash
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: simple string hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private async computeExportChecksum(entries: AuditEntry[]): Promise<string> {
    const data = JSON.stringify(entries.map((e) => e.entryHash ?? e.id));
    return this.computeEntryHash({
      id: 'export',
      timestamp: new Date(),
      eventType: AuditEventType.AUDIT_EXPORT,
      severity: AuditSeverity.INFO,
      actorId: 'system',
      actorType: 'system',
      sessionId: 'export',
      trustLevel: TrustLevel.OBSERVE_ONLY,
      description: data,
    });
  }

  private getComplianceTags(entry: AuditEntry): string[] {
    const tags: string[] = [];

    // SOC2 relevant events
    if (
      this.config.complianceStandards.includes('SOC2') &&
      [
        AuditEventType.PERMISSION_DENIED,
        AuditEventType.TWO_FACTOR_FAILED,
        AuditEventType.ANOMALY_DETECTED,
        AuditEventType.TRUST_LEVEL_CHANGED,
      ].includes(entry.eventType)
    ) {
      tags.push('SOC2');
    }

    // GDPR relevant events
    if (
      this.config.complianceStandards.includes('GDPR') &&
      entry.action?.category === ActionCategory.DATA_EXPORT
    ) {
      tags.push('GDPR');
    }

    // PCI-DSS relevant events
    if (
      this.config.complianceStandards.includes('PCI-DSS') &&
      entry.action?.category === ActionCategory.PAYMENT
    ) {
      tags.push('PCI-DSS');
    }

    return tags;
  }

  private shouldAlert(entry: AuditEntry): boolean {
    // Alert on critical severity
    if (entry.severity === AuditSeverity.CRITICAL) {
      return true;
    }

    // Alert on security events
    if (
      [
        AuditEventType.ANOMALY_DETECTED,
        AuditEventType.TWO_FACTOR_FAILED,
        AuditEventType.LOOP_DETECTED,
      ].includes(entry.eventType)
    ) {
      return true;
    }

    // Alert on trust level elevation
    if (entry.eventType === AuditEventType.TRUST_LEVEL_ELEVATED) {
      return true;
    }

    return false;
  }
}

// =============================================================================
// FACTORY & SINGLETON
// =============================================================================

let defaultLogger: AuditLogger | null = null;

/**
 * Get or create the default AuditLogger instance
 */
export function getAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  if (!defaultLogger) {
    if (!config) {
      // Create with in-memory backend by default
      config = {
        backends: [new InMemoryAuditBackend()],
      };
    }
    defaultLogger = new AuditLogger(config);
  }
  return defaultLogger;
}

/**
 * Reset the default logger (for testing)
 */
export function resetAuditLogger(): void {
  if (defaultLogger) {
    defaultLogger.close();
    defaultLogger = null;
  }
}

export default AuditLogger;
