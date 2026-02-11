/**
 * DataExporter.ts - One-Click Data Export
 *
 * Download ALL your data in one click:
 * - Complete data portability (GDPR Article 20)
 * - Multiple format support
 * - Structured, machine-readable output
 * - Includes all metadata and audit trails
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as zlib from 'zlib';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ExportRequest {
  requestId: string;
  userId: string;
  format: ExportFormat;
  scope: ExportScope;
  status: ExportStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  downloadUrl?: string;
  metadata: ExportMetadata;
}

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  XML = 'xml',
  PARQUET = 'parquet',
  ZIP = 'zip',
  ENCRYPTED_ZIP = 'encrypted_zip'
}

export interface ExportScope {
  dataTypes: DataTypeForExport[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  includeMetadata: boolean;
  includeAuditTrail: boolean;
  includeEncryptionKeys: boolean;
  includeDeletedData: boolean;
}

export enum DataTypeForExport {
  PROFILE = 'profile',
  CONVERSATIONS = 'conversations',
  PREFERENCES = 'preferences',
  GENERATED_CONTENT = 'generated_content',
  UPLOADED_FILES = 'uploaded_files',
  PAYMENT_HISTORY = 'payment_history',
  ACTIVITY_LOGS = 'activity_logs',
  AI_INTERACTIONS = 'ai_interactions',
  CUSTOM_AGENTS = 'custom_agents',
  WORKFLOWS = 'workflows',
  INTEGRATIONS = 'integrations',
  ANALYTICS = 'analytics',
  CONSENT_RECORDS = 'consent_records',
  AUDIT_TRAIL = 'audit_trail',
  ALL = 'all'
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PACKAGING = 'packaging',
  ENCRYPTING = 'encrypting',
  READY = 'ready',
  DOWNLOADED = 'downloaded',
  EXPIRED = 'expired',
  FAILED = 'failed'
}

export interface ExportMetadata {
  requestedVia: RequestSource;
  ipAddress?: string;
  estimatedSize: number;
  actualSize?: number;
  fileCount?: number;
  compressionRatio?: number;
  encryptionMethod?: string;
  checksum?: string;
}

export enum RequestSource {
  USER_INTERFACE = 'ui',
  API = 'api',
  GDPR_REQUEST = 'gdpr',
  CCPA_REQUEST = 'ccpa',
  LEGAL_REQUEST = 'legal'
}

export interface ExportedData {
  exportId: string;
  userId: string;
  exportedAt: Date;
  format: ExportFormat;
  version: string;
  sections: ExportSection[];
  manifest: ExportManifest;
}

export interface ExportSection {
  name: string;
  dataType: DataTypeForExport;
  recordCount: number;
  data: unknown;
  schema?: DataSchema;
  metadata?: Record<string, unknown>;
}

export interface ExportManifest {
  exportId: string;
  userId: string;
  createdAt: Date;
  version: string;
  format: ExportFormat;
  sections: ManifestSection[];
  totalRecords: number;
  totalSize: number;
  checksum: string;
  signature: string;
  legalStatement: string;
}

export interface ManifestSection {
  name: string;
  dataType: DataTypeForExport;
  filename: string;
  recordCount: number;
  size: number;
  checksum: string;
}

export interface DataSchema {
  fields: SchemaField[];
  version: string;
  description: string;
}

export interface SchemaField {
  name: string;
  type: string;
  description: string;
  nullable: boolean;
  sensitive: boolean;
}

export interface ExportConfig {
  maxExportSize: number; // bytes
  exportRetentionHours: number;
  compressionLevel: number;
  enableEncryption: boolean;
  signExports: boolean;
  maxConcurrentExports: number;
}

// ============================================================================
// Data Exporter
// ============================================================================

export class DataExporter extends EventEmitter {
  private config: ExportConfig;
  private exportRequests: Map<string, ExportRequest> = new Map();
  private activeExports: Map<string, ExportedData> = new Map();
  private userExportQueue: Map<string, string[]> = new Map();
  private signingKey: crypto.KeyObject;

  private static readonly EXPORT_VERSION = '1.0.0';
  private static readonly PORTABILITY_STATEMENT = `
    This export contains all personal data associated with your account in compliance
    with GDPR Article 20 (Right to Data Portability), CCPA Section 1798.100 (Right to Know),
    and other applicable data protection regulations. The data is provided in a structured,
    commonly used, and machine-readable format to facilitate transfer to another service.
  `.trim();

  constructor(config: Partial<ExportConfig> = {}) {
    super();
    this.config = {
      maxExportSize: 10 * 1024 * 1024 * 1024, // 10GB
      exportRetentionHours: 72,
      compressionLevel: 6,
      enableEncryption: true,
      signExports: true,
      maxConcurrentExports: 3,
      ...config
    };

    this.signingKey = crypto.generateKeyPairSync('ed25519').privateKey;
  }

  // ============================================================================
  // Export Request Management
  // ============================================================================

  /**
   * Create a new export request
   */
  async createExportRequest(
    userId: string,
    format: ExportFormat = ExportFormat.JSON,
    scope: Partial<ExportScope> = {},
    source: RequestSource = RequestSource.USER_INTERFACE
  ): Promise<ExportRequest> {
    // Check concurrent export limit
    const userQueue = this.userExportQueue.get(userId) || [];
    const activeCount = userQueue.filter(reqId => {
      const req = this.exportRequests.get(reqId);
      return req && req.status === ExportStatus.PROCESSING;
    }).length;

    if (activeCount >= this.config.maxConcurrentExports) {
      throw new Error(`Maximum concurrent exports (${this.config.maxConcurrentExports}) reached`);
    }

    const requestId = this.generateRequestId();

    const fullScope: ExportScope = {
      dataTypes: [DataTypeForExport.ALL],
      includeMetadata: true,
      includeAuditTrail: true,
      includeEncryptionKeys: false, // Security: never export encryption keys by default
      includeDeletedData: false,
      ...scope
    };

    const request: ExportRequest = {
      requestId,
      userId,
      format,
      scope: fullScope,
      status: ExportStatus.PENDING,
      createdAt: new Date(),
      expiresAt: this.calculateExpiryDate(),
      metadata: {
        requestedVia: source,
        estimatedSize: await this.estimateExportSize(userId, fullScope)
      }
    };

    this.exportRequests.set(requestId, request);
    userQueue.push(requestId);
    this.userExportQueue.set(userId, userQueue);

    this.emit('exportRequested', {
      requestId,
      userId,
      format,
      timestamp: new Date()
    });

    return request;
  }

  /**
   * One-click export all data
   */
  async exportAllData(
    userId: string,
    format: ExportFormat = ExportFormat.ENCRYPTED_ZIP
  ): Promise<ExportRequest> {
    const request = await this.createExportRequest(
      userId,
      format,
      {
        dataTypes: [DataTypeForExport.ALL],
        includeMetadata: true,
        includeAuditTrail: true,
        includeDeletedData: false
      }
    );

    // Start processing immediately
    await this.processExport(request.requestId);

    return this.exportRequests.get(request.requestId)!;
  }

  /**
   * Process export request
   */
  async processExport(requestId: string): Promise<void> {
    const request = this.exportRequests.get(requestId);
    if (!request) {
      throw new Error(`Export request ${requestId} not found`);
    }

    request.status = ExportStatus.PROCESSING;
    request.startedAt = new Date();

    this.emit('exportStarted', {
      requestId,
      userId: request.userId,
      timestamp: new Date()
    });

    try {
      // Collect all data
      const sections = await this.collectData(request.userId, request.scope);

      // Create export package
      request.status = ExportStatus.PACKAGING;
      const exportData = await this.packageExport(request, sections);

      // Encrypt if needed
      if (request.format === ExportFormat.ENCRYPTED_ZIP && this.config.enableEncryption) {
        request.status = ExportStatus.ENCRYPTING;
        await this.encryptExport(request, exportData);
      }

      // Generate manifest and finalize
      const manifest = this.generateManifest(request, exportData);
      exportData.manifest = manifest;

      // Store export
      this.activeExports.set(requestId, exportData);

      // Generate download URL
      request.downloadUrl = await this.generateDownloadUrl(requestId);
      request.status = ExportStatus.READY;
      request.completedAt = new Date();
      request.metadata.actualSize = this.calculateExportSize(exportData);
      request.metadata.fileCount = sections.length;
      request.metadata.checksum = manifest.checksum;

      this.emit('exportReady', {
        requestId,
        userId: request.userId,
        downloadUrl: request.downloadUrl,
        size: request.metadata.actualSize,
        timestamp: new Date()
      });

    } catch (error) {
      request.status = ExportStatus.FAILED;

      this.emit('exportFailed', {
        requestId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });

      throw error;
    }
  }

  // ============================================================================
  // Data Collection
  // ============================================================================

  /**
   * Collect all data for export
   */
  private async collectData(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection[]> {
    const sections: ExportSection[] = [];
    const dataTypes = scope.dataTypes.includes(DataTypeForExport.ALL)
      ? Object.values(DataTypeForExport).filter(t => t !== DataTypeForExport.ALL)
      : scope.dataTypes;

    for (const dataType of dataTypes) {
      const section = await this.collectDataType(userId, dataType, scope);
      if (section) {
        sections.push(section);
      }
    }

    return sections;
  }

  /**
   * Collect specific data type
   */
  private async collectDataType(
    userId: string,
    dataType: DataTypeForExport,
    scope: ExportScope
  ): Promise<ExportSection | null> {
    const collectors: Record<DataTypeForExport, () => Promise<ExportSection | null>> = {
      [DataTypeForExport.PROFILE]: () => this.collectProfile(userId),
      [DataTypeForExport.CONVERSATIONS]: () => this.collectConversations(userId, scope),
      [DataTypeForExport.PREFERENCES]: () => this.collectPreferences(userId),
      [DataTypeForExport.GENERATED_CONTENT]: () => this.collectGeneratedContent(userId, scope),
      [DataTypeForExport.UPLOADED_FILES]: () => this.collectUploadedFiles(userId, scope),
      [DataTypeForExport.PAYMENT_HISTORY]: () => this.collectPaymentHistory(userId, scope),
      [DataTypeForExport.ACTIVITY_LOGS]: () => this.collectActivityLogs(userId, scope),
      [DataTypeForExport.AI_INTERACTIONS]: () => this.collectAIInteractions(userId, scope),
      [DataTypeForExport.CUSTOM_AGENTS]: () => this.collectCustomAgents(userId),
      [DataTypeForExport.WORKFLOWS]: () => this.collectWorkflows(userId),
      [DataTypeForExport.INTEGRATIONS]: () => this.collectIntegrations(userId),
      [DataTypeForExport.ANALYTICS]: () => this.collectAnalytics(userId, scope),
      [DataTypeForExport.CONSENT_RECORDS]: () => this.collectConsentRecords(userId),
      [DataTypeForExport.AUDIT_TRAIL]: () => this.collectAuditTrail(userId, scope),
      [DataTypeForExport.ALL]: () => Promise.resolve(null)
    };

    const collector = collectors[dataType];
    if (!collector) return null;

    return collector();
  }

  // ============================================================================
  // Data Collection Methods
  // ============================================================================

  private async collectProfile(userId: string): Promise<ExportSection> {
    // In production, would fetch from database
    const profileData = {
      userId,
      email: 'user@example.com',
      name: 'User Name',
      createdAt: new Date(),
      lastLogin: new Date(),
      settings: {}
    };

    return {
      name: 'Profile',
      dataType: DataTypeForExport.PROFILE,
      recordCount: 1,
      data: profileData,
      schema: this.getProfileSchema()
    };
  }

  private async collectConversations(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    // In production, would fetch from database
    const conversations: unknown[] = [];

    return {
      name: 'Conversations',
      dataType: DataTypeForExport.CONVERSATIONS,
      recordCount: conversations.length,
      data: conversations,
      schema: this.getConversationSchema(),
      metadata: {
        dateRange: scope.dateRange
      }
    };
  }

  private async collectPreferences(userId: string): Promise<ExportSection> {
    const preferences = {
      theme: 'dark',
      language: 'en',
      notifications: {},
      privacy: {}
    };

    return {
      name: 'Preferences',
      dataType: DataTypeForExport.PREFERENCES,
      recordCount: 1,
      data: preferences,
      schema: this.getPreferencesSchema()
    };
  }

  private async collectGeneratedContent(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    const content: unknown[] = [];

    return {
      name: 'Generated Content',
      dataType: DataTypeForExport.GENERATED_CONTENT,
      recordCount: content.length,
      data: content,
      schema: this.getGeneratedContentSchema()
    };
  }

  private async collectUploadedFiles(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    const files: unknown[] = [];

    return {
      name: 'Uploaded Files',
      dataType: DataTypeForExport.UPLOADED_FILES,
      recordCount: files.length,
      data: files,
      metadata: {
        note: 'File contents are included as base64-encoded data'
      }
    };
  }

  private async collectPaymentHistory(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    const payments: unknown[] = [];

    return {
      name: 'Payment History',
      dataType: DataTypeForExport.PAYMENT_HISTORY,
      recordCount: payments.length,
      data: payments,
      schema: this.getPaymentSchema()
    };
  }

  private async collectActivityLogs(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    const logs: unknown[] = [];

    return {
      name: 'Activity Logs',
      dataType: DataTypeForExport.ACTIVITY_LOGS,
      recordCount: logs.length,
      data: logs
    };
  }

  private async collectAIInteractions(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    const interactions: unknown[] = [];

    return {
      name: 'AI Interactions',
      dataType: DataTypeForExport.AI_INTERACTIONS,
      recordCount: interactions.length,
      data: interactions,
      schema: this.getAIInteractionSchema()
    };
  }

  private async collectCustomAgents(userId: string): Promise<ExportSection> {
    const agents: unknown[] = [];

    return {
      name: 'Custom Agents',
      dataType: DataTypeForExport.CUSTOM_AGENTS,
      recordCount: agents.length,
      data: agents
    };
  }

  private async collectWorkflows(userId: string): Promise<ExportSection> {
    const workflows: unknown[] = [];

    return {
      name: 'Workflows',
      dataType: DataTypeForExport.WORKFLOWS,
      recordCount: workflows.length,
      data: workflows
    };
  }

  private async collectIntegrations(userId: string): Promise<ExportSection> {
    const integrations: unknown[] = [];

    return {
      name: 'Integrations',
      dataType: DataTypeForExport.INTEGRATIONS,
      recordCount: integrations.length,
      data: integrations
    };
  }

  private async collectAnalytics(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection> {
    const analytics: unknown[] = [];

    return {
      name: 'Analytics',
      dataType: DataTypeForExport.ANALYTICS,
      recordCount: analytics.length,
      data: analytics
    };
  }

  private async collectConsentRecords(userId: string): Promise<ExportSection> {
    const consents: unknown[] = [];

    return {
      name: 'Consent Records',
      dataType: DataTypeForExport.CONSENT_RECORDS,
      recordCount: consents.length,
      data: consents
    };
  }

  private async collectAuditTrail(
    userId: string,
    scope: ExportScope
  ): Promise<ExportSection | null> {
    if (!scope.includeAuditTrail) return null;

    const auditTrail: unknown[] = [];

    return {
      name: 'Audit Trail',
      dataType: DataTypeForExport.AUDIT_TRAIL,
      recordCount: auditTrail.length,
      data: auditTrail
    };
  }

  // ============================================================================
  // Export Packaging
  // ============================================================================

  /**
   * Package export data
   */
  private async packageExport(
    request: ExportRequest,
    sections: ExportSection[]
  ): Promise<ExportedData> {
    const exportData: ExportedData = {
      exportId: request.requestId,
      userId: request.userId,
      exportedAt: new Date(),
      format: request.format,
      version: DataExporter.EXPORT_VERSION,
      sections,
      manifest: {} as ExportManifest // Will be filled later
    };

    // Format-specific processing
    if (request.format === ExportFormat.CSV) {
      await this.convertToCSV(exportData);
    } else if (request.format === ExportFormat.XML) {
      await this.convertToXML(exportData);
    }

    // Compress if ZIP format
    if (request.format === ExportFormat.ZIP || request.format === ExportFormat.ENCRYPTED_ZIP) {
      await this.compressExport(exportData);
    }

    return exportData;
  }

  /**
   * Encrypt export package
   */
  private async encryptExport(
    request: ExportRequest,
    exportData: ExportedData
  ): Promise<void> {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    // In production, would encrypt the actual export file
    request.metadata.encryptionMethod = 'AES-256-GCM';

    this.emit('exportEncrypted', {
      requestId: request.requestId,
      userId: request.userId,
      timestamp: new Date()
    });
  }

  /**
   * Compress export data
   */
  private async compressExport(exportData: ExportedData): Promise<void> {
    // In production, would create actual ZIP archive
    const compressionRatio = 0.4; // Simulated compression ratio
    this.emit('exportCompressed', {
      exportId: exportData.exportId,
      compressionRatio,
      timestamp: new Date()
    });
  }

  /**
   * Convert to CSV format
   */
  private async convertToCSV(exportData: ExportedData): Promise<void> {
    for (const section of exportData.sections) {
      if (Array.isArray(section.data)) {
        section.data = this.arrayToCSV(section.data as Record<string, unknown>[]);
      }
    }
  }

  /**
   * Convert to XML format
   */
  private async convertToXML(exportData: ExportedData): Promise<void> {
    for (const section of exportData.sections) {
      section.data = this.objectToXML(section.data, section.name);
    }
  }

  // ============================================================================
  // Manifest Generation
  // ============================================================================

  /**
   * Generate export manifest
   */
  private generateManifest(
    request: ExportRequest,
    exportData: ExportedData
  ): ExportManifest {
    const manifestSections: ManifestSection[] = exportData.sections.map(section => ({
      name: section.name,
      dataType: section.dataType,
      filename: `${section.dataType}.${this.getFileExtension(request.format)}`,
      recordCount: section.recordCount,
      size: this.calculateSectionSize(section),
      checksum: this.calculateChecksum(section)
    }));

    const totalRecords = manifestSections.reduce((sum, s) => sum + s.recordCount, 0);
    const totalSize = manifestSections.reduce((sum, s) => sum + s.size, 0);

    const manifest: ExportManifest = {
      exportId: request.requestId,
      userId: request.userId,
      createdAt: new Date(),
      version: DataExporter.EXPORT_VERSION,
      format: request.format,
      sections: manifestSections,
      totalRecords,
      totalSize,
      checksum: this.calculateManifestChecksum(manifestSections),
      signature: this.signManifest(manifestSections),
      legalStatement: DataExporter.PORTABILITY_STATEMENT
    };

    return manifest;
  }

  // ============================================================================
  // Download Management
  // ============================================================================

  /**
   * Generate secure download URL
   */
  private async generateDownloadUrl(requestId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    // In production, would create signed URL
    return `https://export.alabobai.com/download/${requestId}?token=${token}`;
  }

  /**
   * Download export
   */
  async downloadExport(requestId: string): Promise<ExportDownload> {
    const request = this.exportRequests.get(requestId);
    if (!request) {
      throw new Error(`Export request ${requestId} not found`);
    }

    if (request.status !== ExportStatus.READY) {
      throw new Error(`Export is not ready. Current status: ${request.status}`);
    }

    if (request.expiresAt && request.expiresAt < new Date()) {
      request.status = ExportStatus.EXPIRED;
      throw new Error('Export has expired');
    }

    const exportData = this.activeExports.get(requestId);
    if (!exportData) {
      throw new Error('Export data not found');
    }

    request.status = ExportStatus.DOWNLOADED;

    this.emit('exportDownloaded', {
      requestId,
      userId: request.userId,
      timestamp: new Date()
    });

    return {
      requestId,
      format: request.format,
      data: exportData,
      checksum: request.metadata.checksum!,
      downloadedAt: new Date()
    };
  }

  /**
   * Get export status
   */
  async getExportStatus(requestId: string): Promise<ExportStatusInfo> {
    const request = this.exportRequests.get(requestId);
    if (!request) {
      throw new Error(`Export request ${requestId} not found`);
    }

    return {
      requestId: request.requestId,
      status: request.status,
      createdAt: request.createdAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      expiresAt: request.expiresAt,
      downloadUrl: request.downloadUrl,
      estimatedSize: request.metadata.estimatedSize,
      actualSize: request.metadata.actualSize,
      fileCount: request.metadata.fileCount
    };
  }

  /**
   * Get user's export history
   */
  async getUserExportHistory(userId: string): Promise<ExportRequest[]> {
    const requestIds = this.userExportQueue.get(userId) || [];
    return requestIds
      .map(id => this.exportRequests.get(id))
      .filter((r): r is ExportRequest => !!r)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ============================================================================
  // Schema Definitions
  // ============================================================================

  private getProfileSchema(): DataSchema {
    return {
      version: '1.0',
      description: 'User profile information',
      fields: [
        { name: 'userId', type: 'string', description: 'Unique user identifier', nullable: false, sensitive: false },
        { name: 'email', type: 'string', description: 'Email address', nullable: false, sensitive: true },
        { name: 'name', type: 'string', description: 'Display name', nullable: true, sensitive: true },
        { name: 'createdAt', type: 'datetime', description: 'Account creation date', nullable: false, sensitive: false },
        { name: 'lastLogin', type: 'datetime', description: 'Last login timestamp', nullable: true, sensitive: false }
      ]
    };
  }

  private getConversationSchema(): DataSchema {
    return {
      version: '1.0',
      description: 'Conversation history with AI',
      fields: [
        { name: 'conversationId', type: 'string', description: 'Conversation identifier', nullable: false, sensitive: false },
        { name: 'createdAt', type: 'datetime', description: 'Conversation start time', nullable: false, sensitive: false },
        { name: 'messages', type: 'array', description: 'List of messages', nullable: false, sensitive: true },
        { name: 'metadata', type: 'object', description: 'Conversation metadata', nullable: true, sensitive: false }
      ]
    };
  }

  private getPreferencesSchema(): DataSchema {
    return {
      version: '1.0',
      description: 'User preferences and settings',
      fields: [
        { name: 'theme', type: 'string', description: 'UI theme preference', nullable: false, sensitive: false },
        { name: 'language', type: 'string', description: 'Language preference', nullable: false, sensitive: false },
        { name: 'notifications', type: 'object', description: 'Notification settings', nullable: false, sensitive: false },
        { name: 'privacy', type: 'object', description: 'Privacy settings', nullable: false, sensitive: false }
      ]
    };
  }

  private getGeneratedContentSchema(): DataSchema {
    return {
      version: '1.0',
      description: 'AI-generated content',
      fields: [
        { name: 'contentId', type: 'string', description: 'Content identifier', nullable: false, sensitive: false },
        { name: 'type', type: 'string', description: 'Content type', nullable: false, sensitive: false },
        { name: 'content', type: 'string', description: 'Generated content', nullable: false, sensitive: true },
        { name: 'createdAt', type: 'datetime', description: 'Generation timestamp', nullable: false, sensitive: false }
      ]
    };
  }

  private getPaymentSchema(): DataSchema {
    return {
      version: '1.0',
      description: 'Payment and billing history',
      fields: [
        { name: 'transactionId', type: 'string', description: 'Transaction identifier', nullable: false, sensitive: false },
        { name: 'amount', type: 'number', description: 'Transaction amount', nullable: false, sensitive: true },
        { name: 'currency', type: 'string', description: 'Currency code', nullable: false, sensitive: false },
        { name: 'date', type: 'datetime', description: 'Transaction date', nullable: false, sensitive: false },
        { name: 'status', type: 'string', description: 'Transaction status', nullable: false, sensitive: false }
      ]
    };
  }

  private getAIInteractionSchema(): DataSchema {
    return {
      version: '1.0',
      description: 'AI interaction logs',
      fields: [
        { name: 'interactionId', type: 'string', description: 'Interaction identifier', nullable: false, sensitive: false },
        { name: 'model', type: 'string', description: 'AI model used', nullable: false, sensitive: false },
        { name: 'input', type: 'string', description: 'User input', nullable: false, sensitive: true },
        { name: 'output', type: 'string', description: 'AI output', nullable: false, sensitive: true },
        { name: 'timestamp', type: 'datetime', description: 'Interaction timestamp', nullable: false, sensitive: false }
      ]
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateRequestId(): string {
    return `export-${crypto.randomUUID()}`;
  }

  private calculateExpiryDate(): Date {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + this.config.exportRetentionHours);
    return expiry;
  }

  private async estimateExportSize(userId: string, scope: ExportScope): Promise<number> {
    // In production, would calculate based on actual data
    return 50 * 1024 * 1024; // 50MB estimate
  }

  private calculateExportSize(exportData: ExportedData): number {
    return Buffer.from(JSON.stringify(exportData)).length;
  }

  private calculateSectionSize(section: ExportSection): number {
    return Buffer.from(JSON.stringify(section.data)).length;
  }

  private calculateChecksum(section: ExportSection): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify(section.data))
      .digest('hex');
  }

  private calculateManifestChecksum(sections: ManifestSection[]): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify(sections))
      .digest('hex');
  }

  private signManifest(sections: ManifestSection[]): string {
    return crypto.sign(
      null,
      Buffer.from(JSON.stringify(sections)),
      this.signingKey
    ).toString('base64');
  }

  private getFileExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      [ExportFormat.JSON]: 'json',
      [ExportFormat.CSV]: 'csv',
      [ExportFormat.XML]: 'xml',
      [ExportFormat.PARQUET]: 'parquet',
      [ExportFormat.ZIP]: 'zip',
      [ExportFormat.ENCRYPTED_ZIP]: 'zip.enc'
    };
    return extensions[format];
  }

  private arrayToCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private objectToXML(data: unknown, rootName: string): string {
    const convert = (obj: unknown, name: string): string => {
      if (obj === null || obj === undefined) {
        return `<${name}/>`;
      }
      if (Array.isArray(obj)) {
        return obj.map(item => convert(item, name)).join('');
      }
      if (typeof obj === 'object') {
        const children = Object.entries(obj as Record<string, unknown>)
          .map(([key, value]) => convert(value, key))
          .join('');
        return `<${name}>${children}</${name}>`;
      }
      return `<${name}>${String(obj)}</${name}>`;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>${convert(data, rootName)}`;
  }
}

// ============================================================================
// Additional Types
// ============================================================================

export interface ExportDownload {
  requestId: string;
  format: ExportFormat;
  data: ExportedData;
  checksum: string;
  downloadedAt: Date;
}

export interface ExportStatusInfo {
  requestId: string;
  status: ExportStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  downloadUrl?: string;
  estimatedSize: number;
  actualSize?: number;
  fileCount?: number;
}

export default DataExporter;
