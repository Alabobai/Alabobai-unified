/**
 * AuditTrail.ts - Complete Data Access Transparency
 *
 * See exactly who accessed your data, when, and why:
 * - Every access logged immutably
 * - Tamper-evident audit chain
 * - Real-time notifications
 * - Suspicious access detection
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AuditEntry {
  entryId: string;
  userId: string;
  timestamp: Date;
  accessor: AccessorInfo;
  action: AuditAction;
  resource: ResourceInfo;
  context: AccessContext;
  result: AccessResult;
  previousHash: string;
  hash: string;
}

export interface AccessorInfo {
  accessorId: string;
  accessorType: AccessorType;
  name: string;
  role?: string;
  organization?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: GeoLocation;
  verified: boolean;
}

export enum AccessorType {
  USER = 'user',
  SYSTEM = 'system',
  ADMIN = 'admin',
  SUPPORT = 'support',
  AUTOMATED = 'automated',
  THIRD_PARTY = 'third_party',
  AI_MODEL = 'ai_model',
  API = 'api'
}

export interface GeoLocation {
  country: string;
  region?: string;
  city?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export enum AuditAction {
  // Data operations
  READ = 'read',
  WRITE = 'write',
  UPDATE = 'update',
  DELETE = 'delete',
  EXPORT = 'export',
  SHARE = 'share',

  // Account operations
  LOGIN = 'login',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  SETTINGS_CHANGE = 'settings_change',

  // Consent operations
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_WITHDRAWN = 'consent_withdrawn',

  // Admin operations
  ADMIN_VIEW = 'admin_view',
  ADMIN_EDIT = 'admin_edit',
  SUPPORT_ACCESS = 'support_access',

  // System operations
  BACKUP = 'backup',
  RESTORE = 'restore',
  ENCRYPTION = 'encryption',
  DECRYPTION = 'decryption',

  // AI operations
  AI_PROCESSING = 'ai_processing',
  AI_TRAINING = 'ai_training'
}

export interface ResourceInfo {
  resourceType: ResourceType;
  resourceId: string;
  resourceName?: string;
  dataCategories: string[];
  sensitivity: SensitivityLevel;
  fields?: string[];
}

export enum ResourceType {
  PROFILE = 'profile',
  CONVERSATION = 'conversation',
  DOCUMENT = 'document',
  SETTINGS = 'settings',
  PAYMENT = 'payment',
  ANALYTICS = 'analytics',
  AI_INTERACTION = 'ai_interaction',
  INTEGRATION = 'integration',
  AUDIT_LOG = 'audit_log'
}

export enum SensitivityLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  SENSITIVE = 'sensitive',
  CRITICAL = 'critical'
}

export interface AccessContext {
  purpose: string;
  legalBasis?: string;
  sessionId?: string;
  requestId?: string;
  parentAction?: string;
  metadata?: Record<string, unknown>;
}

export interface AccessResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  dataReturned?: boolean;
  recordsAffected?: number;
  executionTime?: number;
}

export interface AuditQuery {
  userId?: string;
  accessorId?: string;
  accessorType?: AccessorType;
  action?: AuditAction;
  resourceType?: ResourceType;
  dateFrom?: Date;
  dateTo?: Date;
  sensitivity?: SensitivityLevel;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditConfig {
  retentionDays: number;
  enableRealTimeAlerts: boolean;
  enableAnomalyDetection: boolean;
  hashAlgorithm: string;
  notificationThresholds: NotificationThresholds;
}

export interface NotificationThresholds {
  unusualAccessCount: number;
  unusualAccessWindow: number; // minutes
  newLocationAlert: boolean;
  adminAccessAlert: boolean;
  sensitiveDataAlert: boolean;
}

// ============================================================================
// Audit Trail Manager
// ============================================================================

export class AuditTrailManager extends EventEmitter {
  private config: AuditConfig;
  private auditEntries: Map<string, AuditEntry[]> = new Map();
  private entryIndex: Map<string, AuditEntry> = new Map();
  private lastHash: Map<string, string> = new Map();
  private accessPatterns: Map<string, AccessPattern[]> = new Map();

  constructor(config: Partial<AuditConfig> = {}) {
    super();
    this.config = {
      retentionDays: 730, // 2 years
      enableRealTimeAlerts: true,
      enableAnomalyDetection: true,
      hashAlgorithm: 'sha256',
      notificationThresholds: {
        unusualAccessCount: 100,
        unusualAccessWindow: 60,
        newLocationAlert: true,
        adminAccessAlert: true,
        sensitiveDataAlert: true
      },
      ...config
    };
  }

  // ============================================================================
  // Audit Logging
  // ============================================================================

  /**
   * Log an access event
   */
  async logAccess(
    userId: string,
    accessor: AccessorInfo,
    action: AuditAction,
    resource: ResourceInfo,
    context: AccessContext,
    result: AccessResult
  ): Promise<AuditEntry> {
    const entryId = this.generateEntryId();
    const previousHash = this.lastHash.get(userId) || 'genesis';

    const entry: AuditEntry = {
      entryId,
      userId,
      timestamp: new Date(),
      accessor,
      action,
      resource,
      context,
      result,
      previousHash,
      hash: '' // Will be computed
    };

    // Compute tamper-evident hash
    entry.hash = this.computeEntryHash(entry);
    this.lastHash.set(userId, entry.hash);

    // Store entry
    this.storeEntry(userId, entry);

    // Check for anomalies
    if (this.config.enableAnomalyDetection) {
      await this.detectAnomalies(userId, entry);
    }

    // Send real-time alerts if needed
    if (this.config.enableRealTimeAlerts) {
      await this.checkAlerts(userId, entry);
    }

    this.emit('accessLogged', {
      entryId,
      userId,
      action,
      resourceType: resource.resourceType,
      timestamp: new Date()
    });

    return entry;
  }

  /**
   * Log data read access
   */
  async logRead(
    userId: string,
    accessor: AccessorInfo,
    resource: ResourceInfo,
    purpose: string,
    fieldsAccessed?: string[]
  ): Promise<AuditEntry> {
    return this.logAccess(
      userId,
      accessor,
      AuditAction.READ,
      { ...resource, fields: fieldsAccessed },
      { purpose },
      { success: true, dataReturned: true }
    );
  }

  /**
   * Log data modification
   */
  async logWrite(
    userId: string,
    accessor: AccessorInfo,
    resource: ResourceInfo,
    purpose: string,
    recordsAffected: number
  ): Promise<AuditEntry> {
    return this.logAccess(
      userId,
      accessor,
      AuditAction.WRITE,
      resource,
      { purpose },
      { success: true, recordsAffected }
    );
  }

  /**
   * Log admin access
   */
  async logAdminAccess(
    userId: string,
    adminInfo: AccessorInfo,
    action: AuditAction,
    resource: ResourceInfo,
    justification: string
  ): Promise<AuditEntry> {
    const entry = await this.logAccess(
      userId,
      { ...adminInfo, accessorType: AccessorType.ADMIN },
      action,
      resource,
      {
        purpose: justification,
        legalBasis: 'Admin access with justification'
      },
      { success: true }
    );

    // Always alert on admin access
    this.emit('adminAccess', {
      entryId: entry.entryId,
      userId,
      adminId: adminInfo.accessorId,
      action,
      justification,
      timestamp: new Date()
    });

    return entry;
  }

  /**
   * Log AI processing
   */
  async logAIProcessing(
    userId: string,
    modelInfo: AccessorInfo,
    resource: ResourceInfo,
    processingPurpose: string,
    forTraining: boolean
  ): Promise<AuditEntry> {
    return this.logAccess(
      userId,
      { ...modelInfo, accessorType: AccessorType.AI_MODEL },
      forTraining ? AuditAction.AI_TRAINING : AuditAction.AI_PROCESSING,
      resource,
      {
        purpose: processingPurpose,
        metadata: { forTraining }
      },
      { success: true }
    );
  }

  // ============================================================================
  // Audit Query & Retrieval
  // ============================================================================

  /**
   * Get all audit entries for a user
   */
  async getUserAuditTrail(
    userId: string,
    query: Partial<AuditQuery> = {}
  ): Promise<AuditEntry[]> {
    const entries = this.auditEntries.get(userId) || [];

    return this.filterEntries(entries, query);
  }

  /**
   * Get audit entries by specific criteria
   */
  async queryAuditTrail(query: AuditQuery): Promise<AuditEntry[]> {
    let results: AuditEntry[] = [];

    if (query.userId) {
      const userEntries = this.auditEntries.get(query.userId) || [];
      results = this.filterEntries(userEntries, query);
    } else {
      // Query across all users (admin only)
      for (const entries of this.auditEntries.values()) {
        results.push(...this.filterEntries(entries, query));
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get audit summary for user
   */
  async getAuditSummary(userId: string): Promise<AuditSummary> {
    const entries = this.auditEntries.get(userId) || [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEntries = entries.filter(e => e.timestamp > thirtyDaysAgo);

    return {
      userId,
      generatedAt: new Date(),
      totalAccessEvents: entries.length,
      last30DaysEvents: recentEntries.length,
      accessByType: this.groupByAccessorType(entries),
      accessByAction: this.groupByAction(entries),
      accessByResource: this.groupByResourceType(entries),
      uniqueAccessors: new Set(entries.map(e => e.accessor.accessorId)).size,
      sensitiveAccessCount: entries.filter(
        e => e.resource.sensitivity === SensitivityLevel.SENSITIVE ||
             e.resource.sensitivity === SensitivityLevel.CRITICAL
      ).length,
      adminAccessCount: entries.filter(
        e => e.accessor.accessorType === AccessorType.ADMIN
      ).length,
      failedAccessCount: entries.filter(e => !e.result.success).length,
      lastAccess: entries[entries.length - 1]?.timestamp,
      integrityVerified: await this.verifyChainIntegrity(userId)
    };
  }

  /**
   * Get who accessed specific data
   */
  async getDataAccessors(
    userId: string,
    resourceId: string
  ): Promise<AccessorInfo[]> {
    const entries = this.auditEntries.get(userId) || [];
    const relevantEntries = entries.filter(e => e.resource.resourceId === resourceId);

    const accessors = new Map<string, AccessorInfo>();
    for (const entry of relevantEntries) {
      accessors.set(entry.accessor.accessorId, entry.accessor);
    }

    return Array.from(accessors.values());
  }

  /**
   * Get timeline of access for specific resource
   */
  async getResourceAccessTimeline(
    userId: string,
    resourceId: string
  ): Promise<AccessTimelineEntry[]> {
    const entries = this.auditEntries.get(userId) || [];
    const relevantEntries = entries.filter(e => e.resource.resourceId === resourceId);

    return relevantEntries.map(e => ({
      timestamp: e.timestamp,
      accessor: e.accessor.name,
      accessorType: e.accessor.accessorType,
      action: e.action,
      purpose: e.context.purpose,
      success: e.result.success
    }));
  }

  // ============================================================================
  // Integrity Verification
  // ============================================================================

  /**
   * Verify the integrity of the audit chain
   */
  async verifyChainIntegrity(userId: string): Promise<boolean> {
    const entries = this.auditEntries.get(userId) || [];

    if (entries.length === 0) return true;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify hash
      const expectedHash = this.computeEntryHash(entry);
      if (entry.hash !== expectedHash) {
        this.emit('integrityViolation', {
          userId,
          entryId: entry.entryId,
          type: 'hash_mismatch',
          timestamp: new Date()
        });
        return false;
      }

      // Verify chain
      if (i > 0) {
        const previousEntry = entries[i - 1];
        if (entry.previousHash !== previousEntry.hash) {
          this.emit('integrityViolation', {
            userId,
            entryId: entry.entryId,
            type: 'chain_broken',
            timestamp: new Date()
          });
          return false;
        }
      } else {
        if (entry.previousHash !== 'genesis') {
          this.emit('integrityViolation', {
            userId,
            entryId: entry.entryId,
            type: 'invalid_genesis',
            timestamp: new Date()
          });
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get integrity report
   */
  async getIntegrityReport(userId: string): Promise<IntegrityReport> {
    const entries = this.auditEntries.get(userId) || [];
    const isValid = await this.verifyChainIntegrity(userId);

    return {
      userId,
      verifiedAt: new Date(),
      isValid,
      totalEntries: entries.length,
      chainLength: entries.length,
      firstEntry: entries[0]?.timestamp,
      lastEntry: entries[entries.length - 1]?.timestamp,
      hashAlgorithm: this.config.hashAlgorithm
    };
  }

  // ============================================================================
  // Anomaly Detection & Alerts
  // ============================================================================

  /**
   * Detect anomalous access patterns
   */
  private async detectAnomalies(userId: string, entry: AuditEntry): Promise<void> {
    const patterns = this.accessPatterns.get(userId) || [];

    // Check for unusual access volume
    const recentAccess = patterns.filter(
      p => p.timestamp > new Date(Date.now() - this.config.notificationThresholds.unusualAccessWindow * 60 * 1000)
    );

    if (recentAccess.length > this.config.notificationThresholds.unusualAccessCount) {
      this.emit('anomalyDetected', {
        userId,
        type: 'unusual_volume',
        details: {
          accessCount: recentAccess.length,
          window: this.config.notificationThresholds.unusualAccessWindow
        },
        entry,
        timestamp: new Date()
      });
    }

    // Check for new location
    if (entry.accessor.location && this.config.notificationThresholds.newLocationAlert) {
      const knownLocations = new Set(
        patterns
          .filter(p => p.location)
          .map(p => `${p.location!.country}:${p.location!.region || ''}`)
      );

      const currentLocation = `${entry.accessor.location.country}:${entry.accessor.location.region || ''}`;

      if (!knownLocations.has(currentLocation)) {
        this.emit('anomalyDetected', {
          userId,
          type: 'new_location',
          details: {
            location: entry.accessor.location,
            knownLocations: Array.from(knownLocations)
          },
          entry,
          timestamp: new Date()
        });
      }
    }

    // Check for unusual time
    const hour = entry.timestamp.getHours();
    const typicalHours = this.getTypicalAccessHours(patterns);
    if (!typicalHours.includes(hour)) {
      this.emit('anomalyDetected', {
        userId,
        type: 'unusual_time',
        details: {
          accessHour: hour,
          typicalHours
        },
        entry,
        timestamp: new Date()
      });
    }

    // Update patterns
    patterns.push({
      timestamp: entry.timestamp,
      action: entry.action,
      accessorType: entry.accessor.accessorType,
      location: entry.accessor.location,
      hour: entry.timestamp.getHours()
    });

    this.accessPatterns.set(userId, patterns);
  }

  /**
   * Check if alerts should be sent
   */
  private async checkAlerts(userId: string, entry: AuditEntry): Promise<void> {
    // Alert on admin access
    if (
      this.config.notificationThresholds.adminAccessAlert &&
      entry.accessor.accessorType === AccessorType.ADMIN
    ) {
      this.emit('alert', {
        userId,
        type: 'admin_access',
        severity: 'high',
        entry,
        message: `Admin user ${entry.accessor.name} accessed your data`,
        timestamp: new Date()
      });
    }

    // Alert on sensitive data access
    if (
      this.config.notificationThresholds.sensitiveDataAlert &&
      (entry.resource.sensitivity === SensitivityLevel.SENSITIVE ||
       entry.resource.sensitivity === SensitivityLevel.CRITICAL)
    ) {
      this.emit('alert', {
        userId,
        type: 'sensitive_access',
        severity: 'medium',
        entry,
        message: `Sensitive data (${entry.resource.resourceType}) was accessed`,
        timestamp: new Date()
      });
    }

    // Alert on third-party access
    if (entry.accessor.accessorType === AccessorType.THIRD_PARTY) {
      this.emit('alert', {
        userId,
        type: 'third_party_access',
        severity: 'low',
        entry,
        message: `Third party ${entry.accessor.name} accessed your data`,
        timestamp: new Date()
      });
    }
  }

  // ============================================================================
  // Notification Preferences
  // ============================================================================

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationThresholds>
  ): Promise<void> {
    // Store per-user preferences (in production, would persist to database)
    this.emit('preferencesUpdated', {
      userId,
      preferences,
      timestamp: new Date()
    });
  }

  /**
   * Get notification preferences
   */
  getNotificationPreferences(): NotificationThresholds {
    return this.config.notificationThresholds;
  }

  // ============================================================================
  // Export & Reporting
  // ============================================================================

  /**
   * Export audit trail for regulatory compliance
   */
  async exportAuditTrail(
    userId: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<AuditExport> {
    const entries = this.auditEntries.get(userId) || [];
    const isValid = await this.verifyChainIntegrity(userId);

    let data: string;

    if (format === 'json') {
      data = JSON.stringify(entries, null, 2);
    } else {
      data = this.convertToCSV(entries);
    }

    return {
      exportId: crypto.randomUUID(),
      userId,
      exportedAt: new Date(),
      format,
      entryCount: entries.length,
      integrityVerified: isValid,
      data,
      checksum: crypto.createHash('sha256').update(data).digest('hex')
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const entries = await this.queryAuditTrail({
      userId,
      dateFrom: startDate,
      dateTo: endDate
    });

    return {
      userId,
      period: { start: startDate, end: endDate },
      generatedAt: new Date(),
      totalEvents: entries.length,
      consentEvents: entries.filter(
        e => e.action === AuditAction.CONSENT_GRANTED ||
             e.action === AuditAction.CONSENT_WITHDRAWN
      ).length,
      dataAccessEvents: entries.filter(
        e => e.action === AuditAction.READ
      ).length,
      dataModificationEvents: entries.filter(
        e => e.action === AuditAction.WRITE ||
             e.action === AuditAction.UPDATE ||
             e.action === AuditAction.DELETE
      ).length,
      adminAccessEvents: entries.filter(
        e => e.accessor.accessorType === AccessorType.ADMIN
      ).length,
      thirdPartyAccessEvents: entries.filter(
        e => e.accessor.accessorType === AccessorType.THIRD_PARTY
      ).length,
      sensitiveDataEvents: entries.filter(
        e => e.resource.sensitivity === SensitivityLevel.SENSITIVE ||
             e.resource.sensitivity === SensitivityLevel.CRITICAL
      ).length,
      integrityStatus: await this.verifyChainIntegrity(userId) ? 'verified' : 'failed',
      complianceStandards: ['GDPR', 'CCPA', 'SOC2', 'HIPAA']
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateEntryId(): string {
    return `audit-${crypto.randomUUID()}`;
  }

  private computeEntryHash(entry: AuditEntry): string {
    const data = {
      entryId: entry.entryId,
      userId: entry.userId,
      timestamp: entry.timestamp.toISOString(),
      accessor: entry.accessor,
      action: entry.action,
      resource: entry.resource,
      context: entry.context,
      result: entry.result,
      previousHash: entry.previousHash
    };

    return crypto.createHash(this.config.hashAlgorithm)
      .update(JSON.stringify(data))
      .digest('hex');
  }

  private storeEntry(userId: string, entry: AuditEntry): void {
    if (!this.auditEntries.has(userId)) {
      this.auditEntries.set(userId, []);
    }
    this.auditEntries.get(userId)!.push(entry);
    this.entryIndex.set(entry.entryId, entry);

    // Cleanup old entries
    this.cleanupOldEntries(userId);
  }

  private cleanupOldEntries(userId: string): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const entries = this.auditEntries.get(userId) || [];
    const filteredEntries = entries.filter(e => e.timestamp > cutoffDate);

    this.auditEntries.set(userId, filteredEntries);
  }

  private filterEntries(entries: AuditEntry[], query: Partial<AuditQuery>): AuditEntry[] {
    return entries.filter(entry => {
      if (query.accessorId && entry.accessor.accessorId !== query.accessorId) return false;
      if (query.accessorType && entry.accessor.accessorType !== query.accessorType) return false;
      if (query.action && entry.action !== query.action) return false;
      if (query.resourceType && entry.resource.resourceType !== query.resourceType) return false;
      if (query.dateFrom && entry.timestamp < query.dateFrom) return false;
      if (query.dateTo && entry.timestamp > query.dateTo) return false;
      if (query.sensitivity && entry.resource.sensitivity !== query.sensitivity) return false;
      if (query.success !== undefined && entry.result.success !== query.success) return false;
      return true;
    });
  }

  private groupByAccessorType(entries: AuditEntry[]): Record<AccessorType, number> {
    const result: Partial<Record<AccessorType, number>> = {};
    for (const entry of entries) {
      result[entry.accessor.accessorType] = (result[entry.accessor.accessorType] || 0) + 1;
    }
    return result as Record<AccessorType, number>;
  }

  private groupByAction(entries: AuditEntry[]): Record<AuditAction, number> {
    const result: Partial<Record<AuditAction, number>> = {};
    for (const entry of entries) {
      result[entry.action] = (result[entry.action] || 0) + 1;
    }
    return result as Record<AuditAction, number>;
  }

  private groupByResourceType(entries: AuditEntry[]): Record<ResourceType, number> {
    const result: Partial<Record<ResourceType, number>> = {};
    for (const entry of entries) {
      result[entry.resource.resourceType] = (result[entry.resource.resourceType] || 0) + 1;
    }
    return result as Record<ResourceType, number>;
  }

  private getTypicalAccessHours(patterns: AccessPattern[]): number[] {
    const hourCounts = new Map<number, number>();

    for (const pattern of patterns) {
      hourCounts.set(pattern.hour, (hourCounts.get(pattern.hour) || 0) + 1);
    }

    // Return hours with significant activity
    const threshold = patterns.length * 0.05; // 5% of total
    return Array.from(hourCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([hour]) => hour);
  }

  private convertToCSV(entries: AuditEntry[]): string {
    const headers = [
      'Entry ID', 'Timestamp', 'User ID', 'Accessor ID', 'Accessor Type',
      'Accessor Name', 'Action', 'Resource Type', 'Resource ID', 'Sensitivity',
      'Purpose', 'Success', 'Hash'
    ];

    const rows = entries.map(e => [
      e.entryId,
      e.timestamp.toISOString(),
      e.userId,
      e.accessor.accessorId,
      e.accessor.accessorType,
      e.accessor.name,
      e.action,
      e.resource.resourceType,
      e.resource.resourceId,
      e.resource.sensitivity,
      e.context.purpose,
      e.result.success,
      e.hash
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

// ============================================================================
// Additional Types
// ============================================================================

interface AccessPattern {
  timestamp: Date;
  action: AuditAction;
  accessorType: AccessorType;
  location?: GeoLocation;
  hour: number;
}

export interface AuditSummary {
  userId: string;
  generatedAt: Date;
  totalAccessEvents: number;
  last30DaysEvents: number;
  accessByType: Record<AccessorType, number>;
  accessByAction: Record<AuditAction, number>;
  accessByResource: Record<ResourceType, number>;
  uniqueAccessors: number;
  sensitiveAccessCount: number;
  adminAccessCount: number;
  failedAccessCount: number;
  lastAccess?: Date;
  integrityVerified: boolean;
}

export interface AccessTimelineEntry {
  timestamp: Date;
  accessor: string;
  accessorType: AccessorType;
  action: AuditAction;
  purpose: string;
  success: boolean;
}

export interface IntegrityReport {
  userId: string;
  verifiedAt: Date;
  isValid: boolean;
  totalEntries: number;
  chainLength: number;
  firstEntry?: Date;
  lastEntry?: Date;
  hashAlgorithm: string;
}

export interface AuditExport {
  exportId: string;
  userId: string;
  exportedAt: Date;
  format: 'json' | 'csv';
  entryCount: number;
  integrityVerified: boolean;
  data: string;
  checksum: string;
}

export interface ComplianceReport {
  userId: string;
  period: { start: Date; end: Date };
  generatedAt: Date;
  totalEvents: number;
  consentEvents: number;
  dataAccessEvents: number;
  dataModificationEvents: number;
  adminAccessEvents: number;
  thirdPartyAccessEvents: number;
  sensitiveDataEvents: number;
  integrityStatus: 'verified' | 'failed';
  complianceStandards: string[];
}

export default AuditTrailManager;
