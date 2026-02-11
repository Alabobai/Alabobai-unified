/**
 * DataOwnership.ts - User Data Ownership System
 *
 * Core principle: Users own ALL their data. Period.
 * - Full transparency on data storage
 * - Complete control over data lifecycle
 * - Legal ownership documentation
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface DataOwnershipRecord {
  id: string;
  userId: string;
  dataType: DataType;
  category: DataCategory;
  createdAt: Date;
  lastModified: Date;
  storageLocation: StorageLocation;
  encryptionStatus: EncryptionStatus;
  retentionPolicy: RetentionPolicy;
  ownershipCertificate: OwnershipCertificate;
  accessHistory: AccessLogEntry[];
  metadata: DataMetadata;
}

export enum DataType {
  PROFILE = 'profile',
  CONVERSATION = 'conversation',
  PREFERENCES = 'preferences',
  ANALYTICS = 'analytics',
  GENERATED_CONTENT = 'generated_content',
  UPLOADED_FILES = 'uploaded_files',
  PAYMENT_INFO = 'payment_info',
  ACTIVITY_LOGS = 'activity_logs',
  AI_INTERACTIONS = 'ai_interactions',
  CUSTOM_AGENTS = 'custom_agents',
  WORKFLOWS = 'workflows',
  INTEGRATIONS = 'integrations'
}

export enum DataCategory {
  PERSONAL_IDENTIFIABLE = 'pii',
  SENSITIVE = 'sensitive',
  BEHAVIORAL = 'behavioral',
  FINANCIAL = 'financial',
  HEALTH = 'health',
  GENERAL = 'general'
}

export interface StorageLocation {
  region: string;
  provider: string;
  encrypted: boolean;
  replicatedTo: string[];
  jurisdiction: string;
}

export interface EncryptionStatus {
  encrypted: boolean;
  algorithm: string;
  keyId: string;
  lastRotated: Date;
  userControlled: boolean;
}

export interface RetentionPolicy {
  duration: number; // days, -1 for indefinite
  autoDelete: boolean;
  deletionScheduled?: Date;
  legalHold: boolean;
  reason: string;
}

export interface OwnershipCertificate {
  certificateId: string;
  issuedAt: Date;
  userId: string;
  dataHash: string;
  signature: string;
  legalStatement: string;
  transferable: boolean;
  portabilityFormat: string[];
}

export interface AccessLogEntry {
  timestamp: Date;
  accessor: string;
  accessType: AccessType;
  purpose: string;
  dataAccessed: string[];
  ipAddress?: string;
  approved: boolean;
}

export enum AccessType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  EXPORT = 'export',
  SHARE = 'share',
  SYSTEM_PROCESS = 'system_process',
  ADMIN_AUDIT = 'admin_audit'
}

export interface DataMetadata {
  size: number;
  format: string;
  checksum: string;
  version: number;
  tags: string[];
  source: string;
}

export interface OwnershipTransfer {
  transferId: string;
  fromUserId: string;
  toUserId: string;
  dataRecords: string[];
  status: TransferStatus;
  initiatedAt: Date;
  completedAt?: Date;
  legalDocumentation: string;
}

export enum TransferStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected'
}

export interface DataOwnershipConfig {
  defaultRetentionDays: number;
  autoEncrypt: boolean;
  defaultStorageRegion: string;
  enableOwnershipCertificates: boolean;
  certificateValidityDays: number;
  maxAccessLogRetention: number;
}

// ============================================================================
// Data Ownership Manager
// ============================================================================

export class DataOwnershipManager extends EventEmitter {
  private config: DataOwnershipConfig;
  private ownershipRecords: Map<string, DataOwnershipRecord> = new Map();
  private userRecordsIndex: Map<string, Set<string>> = new Map();
  private transfers: Map<string, OwnershipTransfer> = new Map();
  private signingKey: crypto.KeyObject;

  private static readonly LEGAL_OWNERSHIP_STATEMENT = `
    This certificate confirms that the data described herein is owned exclusively by the
    certificate holder. The service provider (Alabobai) acts solely as a custodian and
    processor of this data. The owner retains full rights to access, modify, export,
    transfer, or delete this data at any time. This ownership is recognized under GDPR
    Article 20 (Right to Data Portability), CCPA Section 1798.100 (Right to Know),
    and other applicable data protection regulations.
  `.trim();

  constructor(config: Partial<DataOwnershipConfig> = {}) {
    super();
    this.config = {
      defaultRetentionDays: -1, // Indefinite by default - user decides
      autoEncrypt: true,
      defaultStorageRegion: 'user-selected',
      enableOwnershipCertificates: true,
      certificateValidityDays: 365,
      maxAccessLogRetention: 730, // 2 years
      ...config
    };

    // Generate signing key for certificates
    this.signingKey = crypto.generateKeyPairSync('ed25519').privateKey;
  }

  // ============================================================================
  // Data Registration & Ownership
  // ============================================================================

  /**
   * Register new data under user ownership
   */
  async registerData(
    userId: string,
    dataType: DataType,
    category: DataCategory,
    content: Buffer | string,
    metadata: Partial<DataMetadata> = {}
  ): Promise<DataOwnershipRecord> {
    const recordId = this.generateRecordId();
    const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;

    const record: DataOwnershipRecord = {
      id: recordId,
      userId,
      dataType,
      category,
      createdAt: new Date(),
      lastModified: new Date(),
      storageLocation: {
        region: this.config.defaultStorageRegion,
        provider: 'alabobai-secure',
        encrypted: this.config.autoEncrypt,
        replicatedTo: [],
        jurisdiction: this.determineJurisdiction(userId)
      },
      encryptionStatus: {
        encrypted: this.config.autoEncrypt,
        algorithm: 'AES-256-GCM',
        keyId: `key-${userId}-${Date.now()}`,
        lastRotated: new Date(),
        userControlled: true
      },
      retentionPolicy: {
        duration: this.config.defaultRetentionDays,
        autoDelete: false,
        legalHold: false,
        reason: 'User-controlled retention'
      },
      ownershipCertificate: this.generateOwnershipCertificate(userId, recordId, contentBuffer),
      accessHistory: [{
        timestamp: new Date(),
        accessor: userId,
        accessType: AccessType.WRITE,
        purpose: 'Initial data creation',
        dataAccessed: [recordId],
        approved: true
      }],
      metadata: {
        size: contentBuffer.length,
        format: this.detectFormat(dataType, contentBuffer),
        checksum: this.computeChecksum(contentBuffer),
        version: 1,
        tags: [],
        source: 'user-input',
        ...metadata
      }
    };

    this.ownershipRecords.set(recordId, record);
    this.indexUserRecord(userId, recordId);

    this.emit('dataRegistered', {
      recordId,
      userId,
      dataType,
      category,
      timestamp: new Date()
    });

    return record;
  }

  /**
   * Generate legally-binding ownership certificate
   */
  private generateOwnershipCertificate(
    userId: string,
    recordId: string,
    content: Buffer
  ): OwnershipCertificate {
    const certificateId = `cert-${crypto.randomUUID()}`;
    const dataHash = this.computeChecksum(content);

    const certificateData = {
      certificateId,
      issuedAt: new Date().toISOString(),
      userId,
      recordId,
      dataHash,
      legalStatement: DataOwnershipManager.LEGAL_OWNERSHIP_STATEMENT
    };

    const signature = crypto.sign(
      null,
      Buffer.from(JSON.stringify(certificateData)),
      this.signingKey
    ).toString('base64');

    return {
      certificateId,
      issuedAt: new Date(),
      userId,
      dataHash,
      signature,
      legalStatement: DataOwnershipManager.LEGAL_OWNERSHIP_STATEMENT,
      transferable: true,
      portabilityFormat: ['json', 'csv', 'xml', 'parquet']
    };
  }

  // ============================================================================
  // Data Access & Transparency
  // ============================================================================

  /**
   * Get all data owned by a user
   */
  async getUserDataInventory(userId: string): Promise<DataOwnershipRecord[]> {
    const recordIds = this.userRecordsIndex.get(userId);
    if (!recordIds) return [];

    const records: DataOwnershipRecord[] = [];
    for (const id of recordIds) {
      const record = this.ownershipRecords.get(id);
      if (record) {
        records.push(record);
      }
    }

    this.logAccess(userId, userId, AccessType.READ, 'Data inventory request',
      records.map(r => r.id));

    return records;
  }

  /**
   * Get detailed ownership report
   */
  async getOwnershipReport(userId: string): Promise<OwnershipReport> {
    const records = await this.getUserDataInventory(userId);

    const report: OwnershipReport = {
      userId,
      generatedAt: new Date(),
      totalRecords: records.length,
      totalSize: records.reduce((sum, r) => sum + r.metadata.size, 0),
      dataByType: this.groupByType(records),
      dataByCategory: this.groupByCategory(records),
      storageLocations: this.getUniqueStorageLocations(records),
      encryptionSummary: this.getEncryptionSummary(records),
      retentionSummary: this.getRetentionSummary(records),
      accessSummary: this.getAccessSummary(records),
      certificates: records.map(r => r.ownershipCertificate),
      legalRights: this.getLegalRights(userId)
    };

    return report;
  }

  /**
   * Log all data access
   */
  logAccess(
    userId: string,
    accessor: string,
    accessType: AccessType,
    purpose: string,
    dataAccessed: string[],
    ipAddress?: string
  ): void {
    const entry: AccessLogEntry = {
      timestamp: new Date(),
      accessor,
      accessType,
      purpose,
      dataAccessed,
      ipAddress,
      approved: accessor === userId || accessType === AccessType.SYSTEM_PROCESS
    };

    for (const recordId of dataAccessed) {
      const record = this.ownershipRecords.get(recordId);
      if (record) {
        record.accessHistory.push(entry);

        // Trim old access logs based on retention policy
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAccessLogRetention);
        record.accessHistory = record.accessHistory.filter(
          e => e.timestamp > cutoffDate
        );
      }
    }

    this.emit('dataAccessed', {
      userId,
      accessor,
      accessType,
      recordIds: dataAccessed,
      timestamp: new Date()
    });
  }

  // ============================================================================
  // Data Transfer & Portability
  // ============================================================================

  /**
   * Initiate data ownership transfer
   */
  async initiateTransfer(
    fromUserId: string,
    toUserId: string,
    recordIds: string[]
  ): Promise<OwnershipTransfer> {
    // Verify ownership
    for (const recordId of recordIds) {
      const record = this.ownershipRecords.get(recordId);
      if (!record || record.userId !== fromUserId) {
        throw new Error(`Record ${recordId} not owned by user ${fromUserId}`);
      }
      if (!record.ownershipCertificate.transferable) {
        throw new Error(`Record ${recordId} is not transferable`);
      }
    }

    const transfer: OwnershipTransfer = {
      transferId: `transfer-${crypto.randomUUID()}`,
      fromUserId,
      toUserId,
      dataRecords: recordIds,
      status: TransferStatus.PENDING,
      initiatedAt: new Date(),
      legalDocumentation: this.generateTransferDocumentation(fromUserId, toUserId, recordIds)
    };

    this.transfers.set(transfer.transferId, transfer);

    this.emit('transferInitiated', transfer);

    return transfer;
  }

  /**
   * Complete ownership transfer
   */
  async completeTransfer(transferId: string, toUserApproval: boolean): Promise<void> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer ${transferId} not found`);
    }

    if (!toUserApproval) {
      transfer.status = TransferStatus.REJECTED;
      this.emit('transferRejected', transfer);
      return;
    }

    transfer.status = TransferStatus.IN_PROGRESS;

    for (const recordId of transfer.dataRecords) {
      const record = this.ownershipRecords.get(recordId);
      if (record) {
        // Update ownership
        const oldUserId = record.userId;
        record.userId = transfer.toUserId;

        // Generate new certificate
        record.ownershipCertificate = this.generateOwnershipCertificate(
          transfer.toUserId,
          recordId,
          Buffer.from(record.metadata.checksum)
        );

        // Update indexes
        this.userRecordsIndex.get(oldUserId)?.delete(recordId);
        this.indexUserRecord(transfer.toUserId, recordId);

        // Log transfer
        this.logAccess(oldUserId, 'system', AccessType.WRITE,
          `Ownership transferred to ${transfer.toUserId}`, [recordId]);
      }
    }

    transfer.status = TransferStatus.COMPLETED;
    transfer.completedAt = new Date();

    this.emit('transferCompleted', transfer);
  }

  // ============================================================================
  // Retention & Lifecycle Management
  // ============================================================================

  /**
   * Update retention policy for user data
   */
  async updateRetentionPolicy(
    userId: string,
    recordIds: string[],
    policy: Partial<RetentionPolicy>
  ): Promise<void> {
    for (const recordId of recordIds) {
      const record = this.ownershipRecords.get(recordId);
      if (!record || record.userId !== userId) {
        throw new Error(`Unauthorized access to record ${recordId}`);
      }

      record.retentionPolicy = {
        ...record.retentionPolicy,
        ...policy
      };

      if (policy.duration && policy.duration > 0) {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + policy.duration);
        record.retentionPolicy.deletionScheduled = deletionDate;
      }
    }

    this.emit('retentionUpdated', {
      userId,
      recordIds,
      policy,
      timestamp: new Date()
    });
  }

  /**
   * Process scheduled deletions
   */
  async processScheduledDeletions(): Promise<string[]> {
    const deletedRecords: string[] = [];
    const now = new Date();

    for (const [recordId, record] of this.ownershipRecords) {
      if (
        record.retentionPolicy.autoDelete &&
        record.retentionPolicy.deletionScheduled &&
        record.retentionPolicy.deletionScheduled <= now &&
        !record.retentionPolicy.legalHold
      ) {
        await this.deleteRecord(record.userId, recordId);
        deletedRecords.push(recordId);
      }
    }

    return deletedRecords;
  }

  /**
   * Delete ownership record
   */
  private async deleteRecord(userId: string, recordId: string): Promise<void> {
    const record = this.ownershipRecords.get(recordId);
    if (!record) return;

    this.ownershipRecords.delete(recordId);
    this.userRecordsIndex.get(userId)?.delete(recordId);

    this.emit('dataDeleted', {
      recordId,
      userId,
      timestamp: new Date()
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateRecordId(): string {
    return `data-${crypto.randomUUID()}`;
  }

  private computeChecksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private detectFormat(dataType: DataType, content: Buffer): string {
    // Simple format detection
    const header = content.slice(0, 4).toString('hex');

    if (header.startsWith('89504e47')) return 'image/png';
    if (header.startsWith('ffd8ff')) return 'image/jpeg';
    if (header.startsWith('25504446')) return 'application/pdf';
    if (header.startsWith('504b0304')) return 'application/zip';

    // Default based on data type
    const formatMap: Record<DataType, string> = {
      [DataType.PROFILE]: 'application/json',
      [DataType.CONVERSATION]: 'application/json',
      [DataType.PREFERENCES]: 'application/json',
      [DataType.ANALYTICS]: 'application/json',
      [DataType.GENERATED_CONTENT]: 'text/plain',
      [DataType.UPLOADED_FILES]: 'application/octet-stream',
      [DataType.PAYMENT_INFO]: 'application/json',
      [DataType.ACTIVITY_LOGS]: 'application/json',
      [DataType.AI_INTERACTIONS]: 'application/json',
      [DataType.CUSTOM_AGENTS]: 'application/json',
      [DataType.WORKFLOWS]: 'application/json',
      [DataType.INTEGRATIONS]: 'application/json'
    };

    return formatMap[dataType] || 'application/octet-stream';
  }

  private determineJurisdiction(userId: string): string {
    // Would integrate with user profile to determine actual jurisdiction
    return 'user-specified';
  }

  private indexUserRecord(userId: string, recordId: string): void {
    if (!this.userRecordsIndex.has(userId)) {
      this.userRecordsIndex.set(userId, new Set());
    }
    this.userRecordsIndex.get(userId)!.add(recordId);
  }

  private generateTransferDocumentation(
    fromUserId: string,
    toUserId: string,
    recordIds: string[]
  ): string {
    return JSON.stringify({
      type: 'ownership_transfer',
      from: fromUserId,
      to: toUserId,
      records: recordIds,
      timestamp: new Date().toISOString(),
      legalBasis: 'GDPR Article 20 - Right to Data Portability',
      terms: 'Full ownership rights transferred to receiving party'
    });
  }

  private groupByType(records: DataOwnershipRecord[]): Record<DataType, number> {
    const result: Partial<Record<DataType, number>> = {};
    for (const record of records) {
      result[record.dataType] = (result[record.dataType] || 0) + 1;
    }
    return result as Record<DataType, number>;
  }

  private groupByCategory(records: DataOwnershipRecord[]): Record<DataCategory, number> {
    const result: Partial<Record<DataCategory, number>> = {};
    for (const record of records) {
      result[record.category] = (result[record.category] || 0) + 1;
    }
    return result as Record<DataCategory, number>;
  }

  private getUniqueStorageLocations(records: DataOwnershipRecord[]): StorageLocation[] {
    const seen = new Set<string>();
    const locations: StorageLocation[] = [];

    for (const record of records) {
      const key = JSON.stringify(record.storageLocation);
      if (!seen.has(key)) {
        seen.add(key);
        locations.push(record.storageLocation);
      }
    }

    return locations;
  }

  private getEncryptionSummary(records: DataOwnershipRecord[]): EncryptionSummary {
    const encrypted = records.filter(r => r.encryptionStatus.encrypted).length;
    return {
      totalEncrypted: encrypted,
      totalUnencrypted: records.length - encrypted,
      encryptionRate: records.length > 0 ? encrypted / records.length : 1,
      algorithms: [...new Set(records.map(r => r.encryptionStatus.algorithm))]
    };
  }

  private getRetentionSummary(records: DataOwnershipRecord[]): RetentionSummary {
    const indefinite = records.filter(r => r.retentionPolicy.duration === -1).length;
    const scheduled = records.filter(r => r.retentionPolicy.deletionScheduled).length;

    return {
      indefiniteRetention: indefinite,
      scheduledForDeletion: scheduled,
      legalHolds: records.filter(r => r.retentionPolicy.legalHold).length
    };
  }

  private getAccessSummary(records: DataOwnershipRecord[]): AccessSummary {
    const allAccess = records.flatMap(r => r.accessHistory);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAccess = allAccess.filter(a => a.timestamp > thirtyDaysAgo);

    return {
      totalAccessEvents: allAccess.length,
      last30DaysEvents: recentAccess.length,
      uniqueAccessors: new Set(allAccess.map(a => a.accessor)).size,
      accessByType: this.groupAccessByType(allAccess)
    };
  }

  private groupAccessByType(entries: AccessLogEntry[]): Record<AccessType, number> {
    const result: Partial<Record<AccessType, number>> = {};
    for (const entry of entries) {
      result[entry.accessType] = (result[entry.accessType] || 0) + 1;
    }
    return result as Record<AccessType, number>;
  }

  private getLegalRights(userId: string): LegalRights {
    return {
      rightToAccess: true,
      rightToRectification: true,
      rightToErasure: true,
      rightToPortability: true,
      rightToRestriction: true,
      rightToObject: true,
      applicableRegulations: ['GDPR', 'CCPA', 'PIPEDA', 'LGPD'],
      dataProtectionOfficer: 'dpo@alabobai.com',
      supervisoryAuthority: 'Based on user jurisdiction'
    };
  }
}

// ============================================================================
// Report Types
// ============================================================================

export interface OwnershipReport {
  userId: string;
  generatedAt: Date;
  totalRecords: number;
  totalSize: number;
  dataByType: Record<DataType, number>;
  dataByCategory: Record<DataCategory, number>;
  storageLocations: StorageLocation[];
  encryptionSummary: EncryptionSummary;
  retentionSummary: RetentionSummary;
  accessSummary: AccessSummary;
  certificates: OwnershipCertificate[];
  legalRights: LegalRights;
}

export interface EncryptionSummary {
  totalEncrypted: number;
  totalUnencrypted: number;
  encryptionRate: number;
  algorithms: string[];
}

export interface RetentionSummary {
  indefiniteRetention: number;
  scheduledForDeletion: number;
  legalHolds: number;
}

export interface AccessSummary {
  totalAccessEvents: number;
  last30DaysEvents: number;
  uniqueAccessors: number;
  accessByType: Record<AccessType, number>;
}

export interface LegalRights {
  rightToAccess: boolean;
  rightToRectification: boolean;
  rightToErasure: boolean;
  rightToPortability: boolean;
  rightToRestriction: boolean;
  rightToObject: boolean;
  applicableRegulations: string[];
  dataProtectionOfficer: string;
  supervisoryAuthority: string;
}

export default DataOwnershipManager;
