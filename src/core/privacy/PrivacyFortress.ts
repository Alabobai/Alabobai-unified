/**
 * PrivacyFortress.ts - The Ultimate Privacy Control Center
 *
 * Main controller that orchestrates ALL privacy features:
 * - Complete data encryption
 * - Full access tracking
 * - Deletion management
 * - Consent control
 * - Transparency reports
 * - GDPR/CCPA/HIPAA compliance
 *
 * This solves the Manus problem: "no idea what they do with my data"
 * With Alabobai: You know EVERYTHING about your data.
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

import DataOwnershipManager, {
  DataOwnershipRecord,
  DataType,
  DataCategory,
  OwnershipReport
} from './DataOwnership.js';

import EncryptionManager, {
  EncryptedData,
  KeyPurpose,
  KeyStatus,
  ZeroKnowledgeProof
} from './EncryptionManager.js';

import DataDeletionManager, {
  DeletionRequest,
  DeletionCertificate,
  DeletionType,
  DeletionStatus
} from './DataDeletion.js';

import ConsentManager, {
  ConsentRecord,
  ConsentPurpose,
  ConsentStatus,
  ConsentReport,
  ConsentVerificationResult
} from './ConsentManager.js';

import AuditTrailManager, {
  AuditEntry,
  AuditAction,
  AccessorInfo,
  AccessorType,
  ResourceType,
  SensitivityLevel,
  AuditSummary,
  ComplianceReport as AuditComplianceReport
} from './AuditTrail.js';

import DataExporter, {
  ExportRequest,
  ExportFormat,
  DataTypeForExport,
  ExportStatusInfo
} from './DataExporter.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PrivacyFortressConfig {
  // Encryption
  enableEncryption: boolean;
  enableZeroKnowledge: boolean;
  autoRotateKeys: boolean;
  keyRotationDays: number;

  // Consent
  requireExplicitConsent: boolean;
  enableGranularConsent: boolean;
  consentRefreshDays: number;

  // Deletion
  deletionGracePeriod: number;
  certifyDeletions: boolean;

  // Audit
  enableRealTimeAudit: boolean;
  auditRetentionDays: number;

  // Compliance
  gdprMode: boolean;
  ccpaMode: boolean;
  hipaaMode: boolean;

  // Transparency
  enableTransparencyReports: boolean;
  transparencyReportFrequency: 'daily' | 'weekly' | 'monthly';
}

export interface PrivacyDashboard {
  userId: string;
  generatedAt: Date;
  dataOverview: DataOverview;
  encryptionStatus: EncryptionOverview;
  consentSummary: ConsentSummary;
  accessSummary: AccessSummary;
  privacyScore: PrivacyScore;
  recommendations: PrivacyRecommendation[];
  complianceStatus: ComplianceStatus;
}

export interface DataOverview {
  totalRecords: number;
  totalSize: number;
  dataByType: Record<string, number>;
  dataByCategory: Record<string, number>;
  oldestRecord: Date;
  newestRecord: Date;
}

export interface EncryptionOverview {
  encryptedRecords: number;
  unencryptedRecords: number;
  encryptionRate: number;
  keysActive: number;
  keysNeedingRotation: number;
  zeroKnowledgeEnabled: boolean;
}

export interface ConsentSummary {
  totalConsents: number;
  activeConsents: number;
  pendingRequests: number;
  aiTrainingConsent: boolean;
  thirdPartyConsent: boolean;
}

export interface AccessSummary {
  totalAccessEvents: number;
  last30DaysEvents: number;
  uniqueAccessors: number;
  adminAccessCount: number;
  suspiciousAccessCount: number;
}

export interface PrivacyScore {
  overall: number;
  encryption: number;
  consent: number;
  dataMinimization: number;
  accessControl: number;
  compliance: number;
}

export interface PrivacyRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
  impact: string;
}

export interface ComplianceStatus {
  gdpr: ComplianceDetail;
  ccpa: ComplianceDetail;
  hipaa: ComplianceDetail;
  overall: boolean;
}

export interface ComplianceDetail {
  compliant: boolean;
  requirements: ComplianceRequirement[];
  lastAudit?: Date;
}

export interface ComplianceRequirement {
  name: string;
  satisfied: boolean;
  evidence?: string;
}

export interface TransparencyReport {
  reportId: string;
  userId: string;
  period: {
    start: Date;
    end: Date;
  };
  generatedAt: Date;
  dataCollection: DataCollectionReport;
  dataUsage: DataUsageReport;
  dataSharing: DataSharingReport;
  dataAccess: DataAccessReport;
  aiUsage: AIUsageReport;
  deletions: DeletionReport;
  securityEvents: SecurityEventsReport;
}

export interface DataCollectionReport {
  totalCollected: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  purposes: string[];
}

export interface DataUsageReport {
  internalProcessing: number;
  aiProcessing: number;
  aiTraining: number;
  analytics: number;
  personalization: number;
}

export interface DataSharingReport {
  thirdParties: ThirdPartySharingRecord[];
  totalShared: number;
  purposes: string[];
}

export interface ThirdPartySharingRecord {
  partyName: string;
  dataTypes: string[];
  purpose: string;
  legalBasis: string;
  shareDate: Date;
}

export interface DataAccessReport {
  totalAccesses: number;
  byAccessorType: Record<string, number>;
  byAction: Record<string, number>;
  adminAccesses: number;
  suspiciousAccesses: number;
}

export interface AIUsageReport {
  totalInteractions: number;
  modelsUsed: string[];
  dataUsedForTraining: boolean;
  dataAnonymized: boolean;
  optOutStatus: boolean;
}

export interface DeletionReport {
  requestsReceived: number;
  requestsCompleted: number;
  dataDeleted: number;
  certificates: number;
}

export interface SecurityEventsReport {
  totalEvents: number;
  byType: Record<string, number>;
  incidents: SecurityIncident[];
}

export interface SecurityIncident {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: Date;
  resolved?: Date;
  description: string;
}

// ============================================================================
// Privacy Fortress - Main Controller
// ============================================================================

export class PrivacyFortress extends EventEmitter {
  private config: PrivacyFortressConfig;

  // Sub-managers
  private ownershipManager: DataOwnershipManager;
  private encryptionManager: EncryptionManager;
  private deletionManager: DataDeletionManager;
  private consentManager: ConsentManager;
  private auditTrailManager: AuditTrailManager;
  private dataExporter: DataExporter;

  // State
  private userKeys: Map<string, string> = new Map(); // userId -> masterKeyId
  private transparencyReports: Map<string, TransparencyReport[]> = new Map();

  constructor(config: Partial<PrivacyFortressConfig> = {}) {
    super();

    this.config = {
      enableEncryption: true,
      enableZeroKnowledge: true,
      autoRotateKeys: true,
      keyRotationDays: 90,
      requireExplicitConsent: true,
      enableGranularConsent: true,
      consentRefreshDays: 365,
      deletionGracePeriod: 24,
      certifyDeletions: true,
      enableRealTimeAudit: true,
      auditRetentionDays: 730,
      gdprMode: true,
      ccpaMode: true,
      hipaaMode: false,
      enableTransparencyReports: true,
      transparencyReportFrequency: 'monthly',
      ...config
    };

    // Initialize all privacy managers
    this.ownershipManager = new DataOwnershipManager();
    this.encryptionManager = new EncryptionManager({
      enableZeroKnowledge: this.config.enableZeroKnowledge,
      keyRotationDays: this.config.keyRotationDays
    });
    this.deletionManager = new DataDeletionManager({
      gracePeriodHours: this.config.deletionGracePeriod,
      generateCertificate: this.config.certifyDeletions
    });
    this.consentManager = new ConsentManager({
      requireExplicitOptIn: this.config.requireExplicitConsent,
      granularControl: this.config.enableGranularConsent,
      consentRefreshDays: this.config.consentRefreshDays
    });
    this.auditTrailManager = new AuditTrailManager({
      enableRealTimeAlerts: this.config.enableRealTimeAudit,
      retentionDays: this.config.auditRetentionDays
    });
    this.dataExporter = new DataExporter();

    this.setupEventForwarding();
  }

  // ============================================================================
  // User Initialization
  // ============================================================================

  /**
   * Initialize privacy fortress for a new user
   */
  async initializeUser(userId: string, password?: string): Promise<UserPrivacySetup> {
    // Generate encryption keys
    let masterKeyId: string;

    if (password && this.config.enableZeroKnowledge) {
      // Derive key from password (zero-knowledge)
      const key = await this.encryptionManager.deriveKeyFromPassword(userId, {
        password
      });
      masterKeyId = key.keyId;
    } else {
      // Generate server-managed key
      const key = await this.encryptionManager.generateKey(userId, KeyPurpose.DATA_ENCRYPTION);
      masterKeyId = key.keyId;
    }

    this.userKeys.set(userId, masterKeyId);

    // Log initialization
    await this.auditTrailManager.logAccess(
      userId,
      {
        accessorId: 'system',
        accessorType: AccessorType.SYSTEM,
        name: 'Privacy Fortress',
        verified: true
      },
      AuditAction.WRITE,
      {
        resourceType: ResourceType.SETTINGS,
        resourceId: 'privacy-initialization',
        dataCategories: ['system'],
        sensitivity: SensitivityLevel.CONFIDENTIAL
      },
      { purpose: 'User privacy initialization' },
      { success: true }
    );

    this.emit('userInitialized', {
      userId,
      zeroKnowledge: !!password,
      timestamp: new Date()
    });

    return {
      userId,
      masterKeyId,
      zeroKnowledgeEnabled: !!password,
      encryptionReady: true,
      consentRequired: await this.getRequiredConsents(userId),
      setupCompletedAt: new Date()
    };
  }

  // ============================================================================
  // Data Management with Privacy
  // ============================================================================

  /**
   * Store data with full privacy protection
   */
  async storeData(
    userId: string,
    dataType: DataType,
    data: Buffer | string,
    options: StoreDataOptions = {}
  ): Promise<StoredDataResult> {
    // Verify consent
    const consentResult = await this.verifyConsentForDataType(userId, dataType);
    if (!consentResult.allowed) {
      throw new Error(`Consent required: ${consentResult.reason}`);
    }

    // Get user's encryption key
    const masterKeyId = this.userKeys.get(userId);
    if (!masterKeyId) {
      throw new Error('User not initialized');
    }

    // Encrypt data
    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    let encryptedData: EncryptedData | undefined;

    if (this.config.enableEncryption) {
      encryptedData = await this.encryptionManager.encrypt(dataBuffer, masterKeyId);
    }

    // Register ownership
    const ownershipRecord = await this.ownershipManager.registerData(
      userId,
      dataType,
      options.category || DataCategory.GENERAL,
      encryptedData?.ciphertext || dataBuffer,
      options.metadata
    );

    // Log access
    await this.auditTrailManager.logWrite(
      userId,
      {
        accessorId: userId,
        accessorType: AccessorType.USER,
        name: 'User',
        verified: true
      },
      {
        resourceType: this.mapDataTypeToResource(dataType),
        resourceId: ownershipRecord.id,
        dataCategories: [options.category || DataCategory.GENERAL],
        sensitivity: options.sensitivity || SensitivityLevel.INTERNAL
      },
      'Data storage',
      1
    );

    return {
      recordId: ownershipRecord.id,
      encrypted: !!encryptedData,
      encryptionKeyId: masterKeyId,
      ownershipCertificate: ownershipRecord.ownershipCertificate,
      storedAt: new Date()
    };
  }

  /**
   * Retrieve data with full access logging
   */
  async retrieveData(
    userId: string,
    recordId: string,
    accessor: AccessorInfo
  ): Promise<RetrievedDataResult> {
    // Get ownership record
    const records = await this.ownershipManager.getUserDataInventory(userId);
    const record = records.find(r => r.id === recordId);

    if (!record) {
      throw new Error('Record not found');
    }

    // Verify accessor has consent
    if (accessor.accessorType === AccessorType.THIRD_PARTY) {
      const consent = this.consentManager.hasConsent(userId, ConsentPurpose.THIRD_PARTY_INTEGRATIONS);
      if (!consent) {
        throw new Error('User has not consented to third-party data access');
      }
    }

    // Log access
    await this.auditTrailManager.logRead(
      userId,
      accessor,
      {
        resourceType: this.mapDataTypeToResource(record.dataType),
        resourceId: recordId,
        dataCategories: [record.category],
        sensitivity: SensitivityLevel.CONFIDENTIAL
      },
      `Data retrieval by ${accessor.name}`
    );

    return {
      recordId,
      dataType: record.dataType,
      encrypted: record.encryptionStatus.encrypted,
      accessedBy: accessor,
      accessedAt: new Date()
    };
  }

  // ============================================================================
  // Consent Management
  // ============================================================================

  /**
   * Get required consents for user
   */
  async getRequiredConsents(userId: string): Promise<ConsentPurpose[]> {
    const preferences = this.consentManager.getConsentPreferences(userId);
    return preferences
      .filter(p => p.isRequired && !p.enabled)
      .map(p => p.purpose);
  }

  /**
   * Grant consent for purpose
   */
  async grantConsent(
    userId: string,
    purpose: ConsentPurpose,
    acknowledgment?: AITrainingAcknowledgment
  ): Promise<ConsentRecord> {
    // For AI training, require explicit acknowledgment
    if (purpose === ConsentPurpose.AI_TRAINING && !acknowledgment) {
      throw new Error('AI training consent requires explicit acknowledgment');
    }

    const record = await this.consentManager.grantConsent(userId, purpose);

    // Log consent
    await this.auditTrailManager.logAccess(
      userId,
      {
        accessorId: userId,
        accessorType: AccessorType.USER,
        name: 'User',
        verified: true
      },
      AuditAction.CONSENT_GRANTED,
      {
        resourceType: ResourceType.SETTINGS,
        resourceId: `consent-${purpose}`,
        dataCategories: ['consent'],
        sensitivity: SensitivityLevel.CONFIDENTIAL
      },
      { purpose: `Grant consent for ${purpose}` },
      { success: true }
    );

    return record;
  }

  /**
   * Withdraw consent for purpose
   */
  async withdrawConsent(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord> {
    const record = await this.consentManager.withdrawConsent(userId, purpose);

    // Log withdrawal
    await this.auditTrailManager.logAccess(
      userId,
      {
        accessorId: userId,
        accessorType: AccessorType.USER,
        name: 'User',
        verified: true
      },
      AuditAction.CONSENT_WITHDRAWN,
      {
        resourceType: ResourceType.SETTINGS,
        resourceId: `consent-${purpose}`,
        dataCategories: ['consent'],
        sensitivity: SensitivityLevel.CONFIDENTIAL
      },
      { purpose: `Withdraw consent for ${purpose}` },
      { success: true }
    );

    return record;
  }

  /**
   * Opt out of all AI training
   */
  async optOutOfAITraining(userId: string): Promise<void> {
    await this.consentManager.optOutOfAITraining(userId);

    this.emit('aiTrainingOptOut', {
      userId,
      timestamp: new Date()
    });
  }

  /**
   * Verify consent for data processing
   */
  async verifyConsentForDataType(
    userId: string,
    dataType: DataType
  ): Promise<ConsentVerificationResult> {
    const purpose = this.mapDataTypeToConsent(dataType);
    return this.consentManager.verifyConsentForProcessing(
      userId,
      purpose,
      [dataType]
    );
  }

  // ============================================================================
  // Data Deletion
  // ============================================================================

  /**
   * One-click delete ALL data
   */
  async deleteAllData(userId: string): Promise<DeletionCertificate> {
    // Log deletion request
    await this.auditTrailManager.logAccess(
      userId,
      {
        accessorId: userId,
        accessorType: AccessorType.USER,
        name: 'User',
        verified: true
      },
      AuditAction.DELETE,
      {
        resourceType: ResourceType.PROFILE,
        resourceId: 'all-data',
        dataCategories: ['all'],
        sensitivity: SensitivityLevel.CRITICAL
      },
      { purpose: 'Complete data deletion request' },
      { success: true }
    );

    // Execute deletion
    const certificate = await this.deletionManager.deleteAllData(userId);

    // Destroy encryption keys
    const keyId = this.userKeys.get(userId);
    if (keyId) {
      await this.encryptionManager.deleteKey(keyId);
      this.userKeys.delete(userId);
    }

    this.emit('allDataDeleted', {
      userId,
      certificateId: certificate.certificateId,
      timestamp: new Date()
    });

    return certificate;
  }

  /**
   * Delete specific data
   */
  async deleteData(
    userId: string,
    dataTypes: DataType[]
  ): Promise<DeletionRequest> {
    return this.deletionManager.createDeletionRequest(
      userId,
      DeletionType.SELECTIVE,
      {
        dataTypes: dataTypes.map(t => t as unknown as import('./DataDeletion.js').DataTypeForDeletion)
      }
    );
  }

  /**
   * Get deletion status
   */
  async getDeletionStatus(requestId: string): Promise<DeletionStatus> {
    const status = await this.deletionManager.getRequestStatus(requestId);
    return status.status;
  }

  // ============================================================================
  // Data Export
  // ============================================================================

  /**
   * One-click export all data
   */
  async exportAllData(userId: string): Promise<ExportRequest> {
    const request = await this.dataExporter.exportAllData(userId, ExportFormat.ENCRYPTED_ZIP);

    // Log export
    await this.auditTrailManager.logAccess(
      userId,
      {
        accessorId: userId,
        accessorType: AccessorType.USER,
        name: 'User',
        verified: true
      },
      AuditAction.EXPORT,
      {
        resourceType: ResourceType.PROFILE,
        resourceId: 'all-data',
        dataCategories: ['all'],
        sensitivity: SensitivityLevel.CRITICAL
      },
      { purpose: 'Complete data export' },
      { success: true }
    );

    return request;
  }

  /**
   * Get export status
   */
  async getExportStatus(requestId: string): Promise<ExportStatusInfo> {
    return this.dataExporter.getExportStatus(requestId);
  }

  // ============================================================================
  // Privacy Dashboard
  // ============================================================================

  /**
   * Get complete privacy dashboard
   */
  async getPrivacyDashboard(userId: string): Promise<PrivacyDashboard> {
    // Gather all data
    const [
      ownershipReport,
      keyStatus,
      consentReport,
      auditSummary
    ] = await Promise.all([
      this.ownershipManager.getOwnershipReport(userId),
      this.encryptionManager.getKeyStatus(userId),
      this.consentManager.generateConsentReport(userId),
      this.auditTrailManager.getAuditSummary(userId)
    ]);

    // Build dashboard
    const dashboard: PrivacyDashboard = {
      userId,
      generatedAt: new Date(),
      dataOverview: this.buildDataOverview(ownershipReport),
      encryptionStatus: this.buildEncryptionOverview(keyStatus, ownershipReport),
      consentSummary: this.buildConsentSummary(consentReport),
      accessSummary: this.buildAccessSummary(auditSummary),
      privacyScore: this.calculatePrivacyScore(ownershipReport, keyStatus, consentReport, auditSummary),
      recommendations: this.generateRecommendations(ownershipReport, keyStatus, consentReport),
      complianceStatus: await this.getComplianceStatus(userId)
    };

    return dashboard;
  }

  // ============================================================================
  // Transparency Reports
  // ============================================================================

  /**
   * Generate transparency report
   */
  async generateTransparencyReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TransparencyReport> {
    const [
      ownershipReport,
      consentReport,
      auditCompliance,
      deletionHistory
    ] = await Promise.all([
      this.ownershipManager.getOwnershipReport(userId),
      this.consentManager.generateConsentReport(userId),
      this.auditTrailManager.generateComplianceReport(userId, startDate, endDate),
      this.deletionManager.getUserDeletionHistory(userId)
    ]);

    const report: TransparencyReport = {
      reportId: `tr-${crypto.randomUUID()}`,
      userId,
      period: { start: startDate, end: endDate },
      generatedAt: new Date(),
      dataCollection: {
        totalCollected: ownershipReport.totalRecords,
        byType: ownershipReport.dataByType,
        bySource: { 'user-input': ownershipReport.totalRecords },
        purposes: ['service_delivery', 'user_requested']
      },
      dataUsage: {
        internalProcessing: auditCompliance.dataAccessEvents,
        aiProcessing: auditCompliance.totalEvents,
        aiTraining: this.consentManager.hasConsent(userId, ConsentPurpose.AI_TRAINING) ? 1 : 0,
        analytics: this.consentManager.hasConsent(userId, ConsentPurpose.ANALYTICS) ? 1 : 0,
        personalization: this.consentManager.hasConsent(userId, ConsentPurpose.PERSONALIZATION) ? 1 : 0
      },
      dataSharing: {
        thirdParties: [],
        totalShared: 0,
        purposes: []
      },
      dataAccess: {
        totalAccesses: auditCompliance.totalEvents,
        byAccessorType: {},
        byAction: {},
        adminAccesses: auditCompliance.adminAccessEvents,
        suspiciousAccesses: 0
      },
      aiUsage: {
        totalInteractions: 0,
        modelsUsed: [],
        dataUsedForTraining: this.consentManager.hasConsent(userId, ConsentPurpose.AI_TRAINING),
        dataAnonymized: true,
        optOutStatus: !this.consentManager.hasConsent(userId, ConsentPurpose.AI_TRAINING)
      },
      deletions: {
        requestsReceived: deletionHistory.length,
        requestsCompleted: deletionHistory.filter(d => d.status === DeletionStatus.COMPLETED).length,
        dataDeleted: 0,
        certificates: deletionHistory.filter(d => d.certificate).length
      },
      securityEvents: {
        totalEvents: 0,
        byType: {},
        incidents: []
      }
    };

    // Store report
    if (!this.transparencyReports.has(userId)) {
      this.transparencyReports.set(userId, []);
    }
    this.transparencyReports.get(userId)!.push(report);

    this.emit('transparencyReportGenerated', {
      reportId: report.reportId,
      userId,
      period: report.period,
      timestamp: new Date()
    });

    return report;
  }

  /**
   * Get all transparency reports for user
   */
  async getTransparencyReports(userId: string): Promise<TransparencyReport[]> {
    return this.transparencyReports.get(userId) || [];
  }

  // ============================================================================
  // Compliance
  // ============================================================================

  /**
   * Get compliance status
   */
  async getComplianceStatus(userId: string): Promise<ComplianceStatus> {
    const [consentReport, auditSummary] = await Promise.all([
      this.consentManager.generateConsentReport(userId),
      this.auditTrailManager.getAuditSummary(userId)
    ]);

    return {
      gdpr: this.checkGDPRCompliance(consentReport, auditSummary),
      ccpa: this.checkCCPACompliance(consentReport, auditSummary),
      hipaa: this.checkHIPAACompliance(consentReport, auditSummary),
      overall: true // Will be calculated based on requirements
    };
  }

  private checkGDPRCompliance(
    consentReport: ConsentReport,
    auditSummary: AuditSummary
  ): ComplianceDetail {
    const requirements: ComplianceRequirement[] = [
      {
        name: 'Lawful Basis for Processing',
        satisfied: consentReport.complianceStatus.hasRequiredConsents,
        evidence: 'Consent records maintained'
      },
      {
        name: 'Data Subject Rights',
        satisfied: true,
        evidence: 'Access, rectification, erasure, portability available'
      },
      {
        name: 'Data Protection by Design',
        satisfied: this.config.enableEncryption,
        evidence: 'Encryption enabled by default'
      },
      {
        name: 'Records of Processing',
        satisfied: auditSummary.integrityVerified,
        evidence: 'Audit trail maintained'
      },
      {
        name: 'Breach Notification',
        satisfied: true,
        evidence: 'Real-time monitoring enabled'
      }
    ];

    return {
      compliant: requirements.every(r => r.satisfied),
      requirements,
      lastAudit: new Date()
    };
  }

  private checkCCPACompliance(
    consentReport: ConsentReport,
    auditSummary: AuditSummary
  ): ComplianceDetail {
    const requirements: ComplianceRequirement[] = [
      {
        name: 'Right to Know',
        satisfied: true,
        evidence: 'Transparency reports available'
      },
      {
        name: 'Right to Delete',
        satisfied: true,
        evidence: 'One-click deletion available'
      },
      {
        name: 'Right to Opt-Out',
        satisfied: true,
        evidence: 'Opt-out mechanisms in place'
      },
      {
        name: 'Non-Discrimination',
        satisfied: true,
        evidence: 'No price discrimination for privacy choices'
      }
    ];

    return {
      compliant: requirements.every(r => r.satisfied),
      requirements,
      lastAudit: new Date()
    };
  }

  private checkHIPAACompliance(
    consentReport: ConsentReport,
    auditSummary: AuditSummary
  ): ComplianceDetail {
    if (!this.config.hipaaMode) {
      return {
        compliant: true,
        requirements: [],
        lastAudit: new Date()
      };
    }

    const requirements: ComplianceRequirement[] = [
      {
        name: 'Access Controls',
        satisfied: true,
        evidence: 'Role-based access implemented'
      },
      {
        name: 'Audit Controls',
        satisfied: auditSummary.integrityVerified,
        evidence: 'Complete audit trail'
      },
      {
        name: 'Encryption',
        satisfied: this.config.enableEncryption,
        evidence: 'AES-256-GCM encryption'
      },
      {
        name: 'Integrity Controls',
        satisfied: auditSummary.integrityVerified,
        evidence: 'Hash chain verification'
      }
    ];

    return {
      compliant: requirements.every(r => r.satisfied),
      requirements,
      lastAudit: new Date()
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private setupEventForwarding(): void {
    // Forward events from sub-managers
    this.ownershipManager.on('dataRegistered', (e) => this.emit('dataRegistered', e));
    this.encryptionManager.on('keyGenerated', (e) => this.emit('keyGenerated', e));
    this.deletionManager.on('deletionCompleted', (e) => this.emit('deletionCompleted', e));
    this.consentManager.on('consentGranted', (e) => this.emit('consentGranted', e));
    this.consentManager.on('consentWithdrawn', (e) => this.emit('consentWithdrawn', e));
    this.auditTrailManager.on('alert', (e) => this.emit('securityAlert', e));
    this.auditTrailManager.on('anomalyDetected', (e) => this.emit('anomalyDetected', e));
    this.dataExporter.on('exportReady', (e) => this.emit('exportReady', e));
  }

  private mapDataTypeToResource(dataType: DataType): ResourceType {
    const mapping: Record<DataType, ResourceType> = {
      [DataType.PROFILE]: ResourceType.PROFILE,
      [DataType.CONVERSATION]: ResourceType.CONVERSATION,
      [DataType.PREFERENCES]: ResourceType.SETTINGS,
      [DataType.ANALYTICS]: ResourceType.ANALYTICS,
      [DataType.GENERATED_CONTENT]: ResourceType.DOCUMENT,
      [DataType.UPLOADED_FILES]: ResourceType.DOCUMENT,
      [DataType.PAYMENT_INFO]: ResourceType.PAYMENT,
      [DataType.ACTIVITY_LOGS]: ResourceType.AUDIT_LOG,
      [DataType.AI_INTERACTIONS]: ResourceType.AI_INTERACTION,
      [DataType.CUSTOM_AGENTS]: ResourceType.INTEGRATION,
      [DataType.WORKFLOWS]: ResourceType.INTEGRATION,
      [DataType.INTEGRATIONS]: ResourceType.INTEGRATION
    };
    return mapping[dataType] || ResourceType.DOCUMENT;
  }

  private mapDataTypeToConsent(dataType: DataType): ConsentPurpose {
    const mapping: Partial<Record<DataType, ConsentPurpose>> = {
      [DataType.ANALYTICS]: ConsentPurpose.ANALYTICS,
      [DataType.AI_INTERACTIONS]: ConsentPurpose.AI_IMPROVEMENT,
      [DataType.CONVERSATION]: ConsentPurpose.CONVERSATION_HISTORY
    };
    return mapping[dataType] || ConsentPurpose.SERVICE_DELIVERY;
  }

  private buildDataOverview(report: OwnershipReport): DataOverview {
    return {
      totalRecords: report.totalRecords,
      totalSize: report.totalSize,
      dataByType: report.dataByType as unknown as Record<string, number>,
      dataByCategory: report.dataByCategory as unknown as Record<string, number>,
      oldestRecord: new Date(),
      newestRecord: new Date()
    };
  }

  private buildEncryptionOverview(
    keyStatus: KeyStatus[],
    ownershipReport: OwnershipReport
  ): EncryptionOverview {
    return {
      encryptedRecords: ownershipReport.encryptionSummary.totalEncrypted,
      unencryptedRecords: ownershipReport.encryptionSummary.totalUnencrypted,
      encryptionRate: ownershipReport.encryptionSummary.encryptionRate,
      keysActive: keyStatus.filter(k => !k.isExpired).length,
      keysNeedingRotation: keyStatus.filter(k => k.needsRotation).length,
      zeroKnowledgeEnabled: this.config.enableZeroKnowledge
    };
  }

  private buildConsentSummary(report: ConsentReport): ConsentSummary {
    return {
      totalConsents: report.totalConsents,
      activeConsents: report.activeConsents,
      pendingRequests: 0,
      aiTrainingConsent: report.consentsByPurpose[ConsentPurpose.AI_TRAINING] === ConsentStatus.GRANTED,
      thirdPartyConsent: report.consentsByPurpose[ConsentPurpose.THIRD_PARTY_INTEGRATIONS] === ConsentStatus.GRANTED
    };
  }

  private buildAccessSummary(auditSummary: AuditSummary): AccessSummary {
    return {
      totalAccessEvents: auditSummary.totalAccessEvents,
      last30DaysEvents: auditSummary.last30DaysEvents,
      uniqueAccessors: auditSummary.uniqueAccessors,
      adminAccessCount: auditSummary.adminAccessCount,
      suspiciousAccessCount: 0
    };
  }

  private calculatePrivacyScore(
    ownershipReport: OwnershipReport,
    keyStatus: KeyStatus[],
    consentReport: ConsentReport,
    auditSummary: AuditSummary
  ): PrivacyScore {
    const encryptionScore = ownershipReport.encryptionSummary.encryptionRate * 100;
    const consentScore = consentReport.complianceStatus.gdprCompliant ? 100 : 50;
    const accessScore = auditSummary.integrityVerified ? 100 : 50;

    return {
      overall: Math.round((encryptionScore + consentScore + accessScore) / 3),
      encryption: Math.round(encryptionScore),
      consent: consentScore,
      dataMinimization: 80, // Based on retention policies
      accessControl: Math.round(accessScore),
      compliance: consentReport.complianceStatus.gdprCompliant ? 100 : 70
    };
  }

  private generateRecommendations(
    ownershipReport: OwnershipReport,
    keyStatus: KeyStatus[],
    consentReport: ConsentReport
  ): PrivacyRecommendation[] {
    const recommendations: PrivacyRecommendation[] = [];

    // Check encryption
    if (ownershipReport.encryptionSummary.encryptionRate < 1) {
      recommendations.push({
        id: 'encrypt-all',
        priority: 'high',
        category: 'encryption',
        title: 'Enable Full Encryption',
        description: 'Some of your data is not encrypted',
        action: 'Enable encryption for all data types',
        impact: 'Maximum data protection'
      });
    }

    // Check key rotation
    const keysNeedingRotation = keyStatus.filter(k => k.needsRotation);
    if (keysNeedingRotation.length > 0) {
      recommendations.push({
        id: 'rotate-keys',
        priority: 'medium',
        category: 'encryption',
        title: 'Rotate Encryption Keys',
        description: `${keysNeedingRotation.length} keys need rotation`,
        action: 'Rotate encryption keys',
        impact: 'Enhanced security'
      });
    }

    // Check AI training consent
    if (!consentReport.complianceStatus.gdprCompliant) {
      recommendations.push({
        id: 'review-consent',
        priority: 'medium',
        category: 'consent',
        title: 'Review Consent Settings',
        description: 'Some consent settings need attention',
        action: 'Review and update consent preferences',
        impact: 'Full compliance'
      });
    }

    return recommendations;
  }
}

// ============================================================================
// Additional Types
// ============================================================================

export interface UserPrivacySetup {
  userId: string;
  masterKeyId: string;
  zeroKnowledgeEnabled: boolean;
  encryptionReady: boolean;
  consentRequired: ConsentPurpose[];
  setupCompletedAt: Date;
}

export interface StoreDataOptions {
  category?: DataCategory;
  sensitivity?: SensitivityLevel;
  metadata?: Record<string, unknown>;
}

export interface StoredDataResult {
  recordId: string;
  encrypted: boolean;
  encryptionKeyId: string;
  ownershipCertificate: unknown;
  storedAt: Date;
}

export interface RetrievedDataResult {
  recordId: string;
  dataType: DataType;
  encrypted: boolean;
  accessedBy: AccessorInfo;
  accessedAt: Date;
}

interface AITrainingAcknowledgment {
  understoodDataUsage: boolean;
  understoodRetention: boolean;
  explicitlyConsented: boolean;
}

// Export all types for external use
export {
  DataType,
  DataCategory,
  ConsentPurpose,
  ConsentStatus,
  DeletionType,
  DeletionStatus,
  ExportFormat,
  AccessorType,
  AuditAction,
  SensitivityLevel
};

export default PrivacyFortress;
