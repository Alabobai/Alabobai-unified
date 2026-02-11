/**
 * ConsentManager.ts - Privacy-First Consent Management
 *
 * OPT-IN ONLY for all data usage:
 * - Explicit consent required for everything
 * - Granular control over each data use
 * - Training data usage requires separate explicit consent
 * - Easy consent withdrawal at any time
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ConsentRecord {
  consentId: string;
  userId: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  grantedAt?: Date;
  withdrawnAt?: Date;
  expiresAt?: Date;
  version: number;
  legalBasis: LegalBasis;
  metadata: ConsentMetadata;
  history: ConsentHistoryEntry[];
}

export enum ConsentPurpose {
  // Core functionality
  SERVICE_DELIVERY = 'service_delivery',
  ACCOUNT_MANAGEMENT = 'account_management',

  // Optional features
  PERSONALIZATION = 'personalization',
  ANALYTICS = 'analytics',
  MARKETING_EMAIL = 'marketing_email',
  MARKETING_PUSH = 'marketing_push',
  THIRD_PARTY_INTEGRATIONS = 'third_party_integrations',

  // AI-specific
  AI_TRAINING = 'ai_training',
  AI_IMPROVEMENT = 'ai_improvement',
  AI_RESEARCH = 'ai_research',
  CONVERSATION_HISTORY = 'conversation_history',

  // Data sharing
  DATA_SHARING_PARTNERS = 'data_sharing_partners',
  DATA_SHARING_ANALYTICS = 'data_sharing_analytics',
  DATA_SHARING_ADVERTISING = 'data_sharing_advertising',

  // Sensitive
  BIOMETRIC_PROCESSING = 'biometric_processing',
  HEALTH_DATA_PROCESSING = 'health_data_processing',
  FINANCIAL_DATA_PROCESSING = 'financial_data_processing'
}

export enum ConsentStatus {
  NOT_REQUESTED = 'not_requested',
  PENDING = 'pending',
  GRANTED = 'granted',
  DENIED = 'denied',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired'
}

export enum LegalBasis {
  CONSENT = 'consent',
  CONTRACT = 'contract',
  LEGAL_OBLIGATION = 'legal_obligation',
  VITAL_INTERESTS = 'vital_interests',
  PUBLIC_TASK = 'public_task',
  LEGITIMATE_INTERESTS = 'legitimate_interests'
}

export interface ConsentMetadata {
  requestMethod: RequestMethod;
  ipAddress?: string;
  userAgent?: string;
  consentText: string;
  consentLanguage: string;
  documentVersion: string;
  dataCategories: string[];
  retentionPeriod: number; // days
  thirdParties?: string[];
}

export enum RequestMethod {
  UI_BANNER = 'ui_banner',
  UI_SETTINGS = 'ui_settings',
  API = 'api',
  EMAIL = 'email',
  ONBOARDING = 'onboarding',
  EXPLICIT_FORM = 'explicit_form'
}

export interface ConsentHistoryEntry {
  timestamp: Date;
  action: ConsentAction;
  previousStatus: ConsentStatus;
  newStatus: ConsentStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export enum ConsentAction {
  REQUESTED = 'requested',
  GRANTED = 'granted',
  DENIED = 'denied',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
  RENEWED = 'renewed',
  UPDATED = 'updated'
}

export interface ConsentRequest {
  requestId: string;
  userId: string;
  purposes: ConsentPurpose[];
  requestedAt: Date;
  expiresAt: Date;
  status: 'pending' | 'completed' | 'expired';
  responses: Map<ConsentPurpose, boolean>;
}

export interface ConsentPreference {
  purpose: ConsentPurpose;
  enabled: boolean;
  lastModified: Date;
  canWithdraw: boolean;
  isRequired: boolean;
  description: string;
}

export interface ConsentConfig {
  defaultConsentDuration: number; // days
  requireExplicitOptIn: boolean;
  allowBundledConsent: boolean;
  consentRefreshDays: number;
  granularControl: boolean;
  doubleOptInRequired: boolean;
}

// ============================================================================
// Consent Definitions
// ============================================================================

const CONSENT_DEFINITIONS: Record<ConsentPurpose, ConsentDefinition> = {
  [ConsentPurpose.SERVICE_DELIVERY]: {
    required: true,
    canBundle: false,
    legalBasis: LegalBasis.CONTRACT,
    description: 'Essential for providing the core service',
    dataCategories: ['account', 'usage'],
    retentionDays: -1
  },
  [ConsentPurpose.ACCOUNT_MANAGEMENT]: {
    required: true,
    canBundle: false,
    legalBasis: LegalBasis.CONTRACT,
    description: 'Managing your account and preferences',
    dataCategories: ['account', 'preferences'],
    retentionDays: -1
  },
  [ConsentPurpose.PERSONALIZATION]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Personalizing your experience based on usage patterns',
    dataCategories: ['usage', 'preferences', 'behavioral'],
    retentionDays: 365
  },
  [ConsentPurpose.ANALYTICS]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Analyzing usage to improve our service',
    dataCategories: ['usage', 'technical'],
    retentionDays: 90
  },
  [ConsentPurpose.MARKETING_EMAIL]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Receiving marketing emails about new features and offers',
    dataCategories: ['contact'],
    retentionDays: 730
  },
  [ConsentPurpose.MARKETING_PUSH]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Receiving push notifications about updates',
    dataCategories: ['contact', 'device'],
    retentionDays: 365
  },
  [ConsentPurpose.THIRD_PARTY_INTEGRATIONS]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Connecting with third-party services you authorize',
    dataCategories: ['account', 'usage'],
    retentionDays: 365
  },
  [ConsentPurpose.AI_TRAINING]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Using your interactions to train and improve AI models',
    dataCategories: ['conversations', 'generated_content'],
    retentionDays: 730,
    sensitivityLevel: 'high'
  },
  [ConsentPurpose.AI_IMPROVEMENT]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Using anonymized data to improve AI responses',
    dataCategories: ['conversations_anonymized'],
    retentionDays: 365
  },
  [ConsentPurpose.AI_RESEARCH]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Contributing to AI safety and alignment research',
    dataCategories: ['conversations_anonymized', 'feedback'],
    retentionDays: 1095
  },
  [ConsentPurpose.CONVERSATION_HISTORY]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Storing conversation history for your reference',
    dataCategories: ['conversations'],
    retentionDays: 365
  },
  [ConsentPurpose.DATA_SHARING_PARTNERS]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Sharing data with trusted partners for service improvement',
    dataCategories: ['usage_anonymized'],
    retentionDays: 365
  },
  [ConsentPurpose.DATA_SHARING_ANALYTICS]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Sharing anonymized data with analytics providers',
    dataCategories: ['usage_anonymized', 'technical'],
    retentionDays: 90
  },
  [ConsentPurpose.DATA_SHARING_ADVERTISING]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Sharing data for personalized advertising',
    dataCategories: ['behavioral', 'preferences'],
    retentionDays: 365
  },
  [ConsentPurpose.BIOMETRIC_PROCESSING]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Processing biometric data for authentication',
    dataCategories: ['biometric'],
    retentionDays: 365,
    sensitivityLevel: 'critical'
  },
  [ConsentPurpose.HEALTH_DATA_PROCESSING]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Processing health-related data you provide',
    dataCategories: ['health'],
    retentionDays: 365,
    sensitivityLevel: 'critical'
  },
  [ConsentPurpose.FINANCIAL_DATA_PROCESSING]: {
    required: false,
    canBundle: false,
    legalBasis: LegalBasis.CONSENT,
    description: 'Processing financial data for services',
    dataCategories: ['financial'],
    retentionDays: 2555, // 7 years for tax compliance
    sensitivityLevel: 'critical'
  }
};

interface ConsentDefinition {
  required: boolean;
  canBundle: boolean;
  legalBasis: LegalBasis;
  description: string;
  dataCategories: string[];
  retentionDays: number;
  sensitivityLevel?: 'normal' | 'high' | 'critical';
}

// ============================================================================
// Consent Manager
// ============================================================================

export class ConsentManager extends EventEmitter {
  private config: ConsentConfig;
  private consents: Map<string, Map<ConsentPurpose, ConsentRecord>> = new Map();
  private pendingRequests: Map<string, ConsentRequest> = new Map();
  private consentTexts: Map<ConsentPurpose, string> = new Map();

  constructor(config: Partial<ConsentConfig> = {}) {
    super();
    this.config = {
      defaultConsentDuration: 365,
      requireExplicitOptIn: true,
      allowBundledConsent: false, // NEVER bundle consent
      consentRefreshDays: 365,
      granularControl: true,
      doubleOptInRequired: true,
      ...config
    };

    this.initializeConsentTexts();
  }

  // ============================================================================
  // Consent Collection
  // ============================================================================

  /**
   * Request consent from user
   */
  async requestConsent(
    userId: string,
    purposes: ConsentPurpose[],
    method: RequestMethod = RequestMethod.UI_SETTINGS
  ): Promise<ConsentRequest> {
    const requestId = this.generateRequestId();

    // Filter out required consents (handled separately)
    const optionalPurposes = purposes.filter(p => !CONSENT_DEFINITIONS[p].required);

    const request: ConsentRequest = {
      requestId,
      userId,
      purposes: optionalPurposes,
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours to respond
      status: 'pending',
      responses: new Map()
    };

    this.pendingRequests.set(requestId, request);

    this.emit('consentRequested', {
      requestId,
      userId,
      purposes: optionalPurposes,
      method,
      timestamp: new Date()
    });

    return request;
  }

  /**
   * Grant consent for specific purpose
   */
  async grantConsent(
    userId: string,
    purpose: ConsentPurpose,
    metadata: Partial<ConsentMetadata> = {}
  ): Promise<ConsentRecord> {
    const definition = CONSENT_DEFINITIONS[purpose];
    const consentId = this.generateConsentId();

    // For sensitive purposes, require explicit confirmation
    if (definition.sensitivityLevel === 'critical' || definition.sensitivityLevel === 'high') {
      if (!metadata.requestMethod || metadata.requestMethod !== RequestMethod.EXPLICIT_FORM) {
        throw new Error(`Purpose ${purpose} requires explicit form consent`);
      }
    }

    const record: ConsentRecord = {
      consentId,
      userId,
      purpose,
      status: ConsentStatus.GRANTED,
      grantedAt: new Date(),
      expiresAt: definition.retentionDays > 0
        ? new Date(Date.now() + definition.retentionDays * 24 * 60 * 60 * 1000)
        : undefined,
      version: 1,
      legalBasis: definition.legalBasis,
      metadata: {
        requestMethod: metadata.requestMethod || RequestMethod.UI_SETTINGS,
        consentText: this.consentTexts.get(purpose) || '',
        consentLanguage: 'en',
        documentVersion: '1.0',
        dataCategories: definition.dataCategories,
        retentionPeriod: definition.retentionDays,
        ...metadata
      },
      history: [{
        timestamp: new Date(),
        action: ConsentAction.GRANTED,
        previousStatus: ConsentStatus.NOT_REQUESTED,
        newStatus: ConsentStatus.GRANTED
      }]
    };

    this.storeConsent(userId, purpose, record);

    this.emit('consentGranted', {
      consentId,
      userId,
      purpose,
      timestamp: new Date()
    });

    return record;
  }

  /**
   * Deny consent for specific purpose
   */
  async denyConsent(
    userId: string,
    purpose: ConsentPurpose,
    reason?: string
  ): Promise<ConsentRecord> {
    const definition = CONSENT_DEFINITIONS[purpose];

    if (definition.required) {
      throw new Error(`Cannot deny required consent: ${purpose}`);
    }

    const existing = this.getConsent(userId, purpose);
    const consentId = existing?.consentId || this.generateConsentId();

    const record: ConsentRecord = {
      consentId,
      userId,
      purpose,
      status: ConsentStatus.DENIED,
      version: existing ? existing.version + 1 : 1,
      legalBasis: definition.legalBasis,
      metadata: {
        requestMethod: RequestMethod.UI_SETTINGS,
        consentText: this.consentTexts.get(purpose) || '',
        consentLanguage: 'en',
        documentVersion: '1.0',
        dataCategories: definition.dataCategories,
        retentionPeriod: definition.retentionDays
      },
      history: [
        ...(existing?.history || []),
        {
          timestamp: new Date(),
          action: ConsentAction.DENIED,
          previousStatus: existing?.status || ConsentStatus.NOT_REQUESTED,
          newStatus: ConsentStatus.DENIED,
          reason
        }
      ]
    };

    this.storeConsent(userId, purpose, record);

    this.emit('consentDenied', {
      consentId,
      userId,
      purpose,
      reason,
      timestamp: new Date()
    });

    return record;
  }

  /**
   * Withdraw previously granted consent
   */
  async withdrawConsent(
    userId: string,
    purpose: ConsentPurpose,
    reason?: string
  ): Promise<ConsentRecord> {
    const existing = this.getConsent(userId, purpose);

    if (!existing || existing.status !== ConsentStatus.GRANTED) {
      throw new Error(`No active consent found for purpose: ${purpose}`);
    }

    const definition = CONSENT_DEFINITIONS[purpose];

    if (definition.required) {
      throw new Error(`Cannot withdraw required consent: ${purpose}. Please close your account instead.`);
    }

    existing.status = ConsentStatus.WITHDRAWN;
    existing.withdrawnAt = new Date();
    existing.version += 1;
    existing.history.push({
      timestamp: new Date(),
      action: ConsentAction.WITHDRAWN,
      previousStatus: ConsentStatus.GRANTED,
      newStatus: ConsentStatus.WITHDRAWN,
      reason
    });

    this.storeConsent(userId, purpose, existing);

    this.emit('consentWithdrawn', {
      consentId: existing.consentId,
      userId,
      purpose,
      reason,
      timestamp: new Date()
    });

    // Trigger data processing stop for this purpose
    this.emit('stopDataProcessing', {
      userId,
      purpose,
      timestamp: new Date()
    });

    return existing;
  }

  // ============================================================================
  // AI Training Consent (Special Handling)
  // ============================================================================

  /**
   * Request explicit consent for AI training
   */
  async requestAITrainingConsent(
    userId: string,
    options: AITrainingConsentOptions = {}
  ): Promise<AITrainingConsentRequest> {
    const requestId = this.generateRequestId();

    const request: AITrainingConsentRequest = {
      requestId,
      userId,
      purposes: [
        ConsentPurpose.AI_TRAINING,
        ConsentPurpose.AI_IMPROVEMENT,
        ConsentPurpose.AI_RESEARCH
      ],
      options: {
        includeConversations: options.includeConversations ?? false,
        includeGeneratedContent: options.includeGeneratedContent ?? false,
        anonymizeData: options.anonymizeData ?? true,
        allowResearch: options.allowResearch ?? false,
        retentionPeriod: options.retentionPeriod ?? 365
      },
      requestedAt: new Date(),
      status: 'pending',
      requiresDoubleOptIn: this.config.doubleOptInRequired
    };

    this.pendingRequests.set(requestId, request as unknown as ConsentRequest);

    this.emit('aiTrainingConsentRequested', {
      requestId,
      userId,
      timestamp: new Date()
    });

    return request;
  }

  /**
   * Grant AI training consent with explicit acknowledgment
   */
  async grantAITrainingConsent(
    requestId: string,
    acknowledgment: AITrainingAcknowledgment
  ): Promise<ConsentRecord[]> {
    const request = this.pendingRequests.get(requestId) as unknown as AITrainingConsentRequest;

    if (!request) {
      throw new Error(`AI training consent request ${requestId} not found`);
    }

    // Verify acknowledgment
    if (!acknowledgment.understoodDataUsage ||
        !acknowledgment.understoodRetention ||
        !acknowledgment.explicitlyConsented) {
      throw new Error('AI training consent requires explicit acknowledgment of all terms');
    }

    const records: ConsentRecord[] = [];

    for (const purpose of request.purposes) {
      const record = await this.grantConsent(request.userId, purpose, {
        requestMethod: RequestMethod.EXPLICIT_FORM
      });
      records.push(record);
    }

    this.pendingRequests.delete(requestId);

    this.emit('aiTrainingConsentGranted', {
      requestId,
      userId: request.userId,
      purposes: request.purposes,
      timestamp: new Date()
    });

    return records;
  }

  /**
   * Opt out of all AI training
   */
  async optOutOfAITraining(userId: string): Promise<void> {
    const aiPurposes = [
      ConsentPurpose.AI_TRAINING,
      ConsentPurpose.AI_IMPROVEMENT,
      ConsentPurpose.AI_RESEARCH
    ];

    for (const purpose of aiPurposes) {
      const consent = this.getConsent(userId, purpose);
      if (consent?.status === ConsentStatus.GRANTED) {
        await this.withdrawConsent(userId, purpose, 'User opted out of AI training');
      }
    }

    this.emit('aiTrainingOptOut', {
      userId,
      timestamp: new Date()
    });
  }

  // ============================================================================
  // Consent Verification
  // ============================================================================

  /**
   * Check if user has granted consent for purpose
   */
  hasConsent(userId: string, purpose: ConsentPurpose): boolean {
    const consent = this.getConsent(userId, purpose);

    if (!consent) {
      // Check if required consent
      const definition = CONSENT_DEFINITIONS[purpose];
      return definition.required;
    }

    // Check expiration
    if (consent.expiresAt && consent.expiresAt < new Date()) {
      this.handleExpiredConsent(userId, purpose, consent);
      return false;
    }

    return consent.status === ConsentStatus.GRANTED;
  }

  /**
   * Check multiple consents at once
   */
  hasAllConsents(userId: string, purposes: ConsentPurpose[]): boolean {
    return purposes.every(p => this.hasConsent(userId, p));
  }

  /**
   * Check if any of the consents are granted
   */
  hasAnyConsent(userId: string, purposes: ConsentPurpose[]): boolean {
    return purposes.some(p => this.hasConsent(userId, p));
  }

  /**
   * Verify consent before data processing
   */
  async verifyConsentForProcessing(
    userId: string,
    purpose: ConsentPurpose,
    dataCategories: string[]
  ): Promise<ConsentVerificationResult> {
    const consent = this.getConsent(userId, purpose);
    const definition = CONSENT_DEFINITIONS[purpose];

    // Check if consent exists and is valid
    if (!consent || consent.status !== ConsentStatus.GRANTED) {
      if (!definition.required) {
        return {
          allowed: false,
          reason: 'Consent not granted',
          requiresConsent: true
        };
      }
    }

    // Check if consent covers required data categories
    const coveredCategories = consent?.metadata.dataCategories || definition.dataCategories;
    const missingCategories = dataCategories.filter(c => !coveredCategories.includes(c));

    if (missingCategories.length > 0) {
      return {
        allowed: false,
        reason: `Consent does not cover data categories: ${missingCategories.join(', ')}`,
        requiresConsent: true,
        missingCategories
      };
    }

    // Check expiration
    if (consent?.expiresAt && consent.expiresAt < new Date()) {
      return {
        allowed: false,
        reason: 'Consent has expired',
        requiresConsent: true,
        expiredAt: consent.expiresAt
      };
    }

    return {
      allowed: true,
      consentId: consent?.consentId,
      expiresAt: consent?.expiresAt
    };
  }

  // ============================================================================
  // Consent Management
  // ============================================================================

  /**
   * Get all consents for user
   */
  getUserConsents(userId: string): ConsentRecord[] {
    const userConsents = this.consents.get(userId);
    if (!userConsents) return [];

    return Array.from(userConsents.values());
  }

  /**
   * Get consent preferences summary
   */
  getConsentPreferences(userId: string): ConsentPreference[] {
    const preferences: ConsentPreference[] = [];

    for (const purpose of Object.values(ConsentPurpose)) {
      const consent = this.getConsent(userId, purpose);
      const definition = CONSENT_DEFINITIONS[purpose];

      preferences.push({
        purpose,
        enabled: this.hasConsent(userId, purpose),
        lastModified: consent?.history[consent.history.length - 1]?.timestamp || new Date(),
        canWithdraw: !definition.required,
        isRequired: definition.required,
        description: definition.description
      });
    }

    return preferences;
  }

  /**
   * Bulk update consent preferences
   */
  async updateConsentPreferences(
    userId: string,
    preferences: Record<ConsentPurpose, boolean>
  ): Promise<void> {
    for (const [purpose, enabled] of Object.entries(preferences)) {
      const consentPurpose = purpose as ConsentPurpose;
      const currentlyEnabled = this.hasConsent(userId, consentPurpose);

      if (enabled && !currentlyEnabled) {
        await this.grantConsent(userId, consentPurpose);
      } else if (!enabled && currentlyEnabled) {
        await this.withdrawConsent(userId, consentPurpose);
      }
    }

    this.emit('preferencesUpdated', {
      userId,
      preferences,
      timestamp: new Date()
    });
  }

  /**
   * Get consent history for user
   */
  getConsentHistory(userId: string): ConsentHistoryEntry[] {
    const userConsents = this.consents.get(userId);
    if (!userConsents) return [];

    const allHistory: Array<ConsentHistoryEntry & { purpose: ConsentPurpose }> = [];

    for (const [purpose, record] of userConsents) {
      for (const entry of record.history) {
        allHistory.push({ ...entry, purpose });
      }
    }

    return allHistory.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Refresh expiring consents
   */
  async refreshExpiringConsents(userId: string): Promise<ConsentPurpose[]> {
    const expiringPurposes: ConsentPurpose[] = [];
    const refreshThreshold = new Date();
    refreshThreshold.setDate(refreshThreshold.getDate() + this.config.consentRefreshDays);

    const userConsents = this.consents.get(userId);
    if (!userConsents) return [];

    for (const [purpose, record] of userConsents) {
      if (record.expiresAt && record.expiresAt < refreshThreshold) {
        expiringPurposes.push(purpose);
      }
    }

    if (expiringPurposes.length > 0) {
      this.emit('consentsExpiringSoon', {
        userId,
        purposes: expiringPurposes,
        timestamp: new Date()
      });
    }

    return expiringPurposes;
  }

  // ============================================================================
  // Compliance Reporting
  // ============================================================================

  /**
   * Generate consent report for compliance
   */
  async generateConsentReport(userId: string): Promise<ConsentReport> {
    const consents = this.getUserConsents(userId);
    const history = this.getConsentHistory(userId);

    return {
      userId,
      generatedAt: new Date(),
      totalConsents: consents.length,
      activeConsents: consents.filter(c => c.status === ConsentStatus.GRANTED).length,
      withdrawnConsents: consents.filter(c => c.status === ConsentStatus.WITHDRAWN).length,
      deniedConsents: consents.filter(c => c.status === ConsentStatus.DENIED).length,
      consentsByPurpose: this.groupConsentsByPurpose(consents),
      consentsByLegalBasis: this.groupConsentsByLegalBasis(consents),
      historyCount: history.length,
      lastActivity: history[0]?.timestamp,
      complianceStatus: this.assessComplianceStatus(userId, consents)
    };
  }

  /**
   * Export consent records for regulatory request
   */
  async exportConsentRecords(userId: string): Promise<ConsentExport> {
    const consents = this.getUserConsents(userId);

    return {
      exportId: crypto.randomUUID(),
      userId,
      exportedAt: new Date(),
      format: 'json',
      records: consents,
      history: this.getConsentHistory(userId),
      signature: this.signExport(consents)
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateConsentId(): string {
    return `consent-${crypto.randomUUID()}`;
  }

  private generateRequestId(): string {
    return `req-${crypto.randomUUID()}`;
  }

  private getConsent(userId: string, purpose: ConsentPurpose): ConsentRecord | undefined {
    return this.consents.get(userId)?.get(purpose);
  }

  private storeConsent(userId: string, purpose: ConsentPurpose, record: ConsentRecord): void {
    if (!this.consents.has(userId)) {
      this.consents.set(userId, new Map());
    }
    this.consents.get(userId)!.set(purpose, record);
  }

  private handleExpiredConsent(
    userId: string,
    purpose: ConsentPurpose,
    consent: ConsentRecord
  ): void {
    consent.status = ConsentStatus.EXPIRED;
    consent.history.push({
      timestamp: new Date(),
      action: ConsentAction.EXPIRED,
      previousStatus: ConsentStatus.GRANTED,
      newStatus: ConsentStatus.EXPIRED
    });

    this.emit('consentExpired', {
      consentId: consent.consentId,
      userId,
      purpose,
      timestamp: new Date()
    });
  }

  private initializeConsentTexts(): void {
    for (const [purpose, definition] of Object.entries(CONSENT_DEFINITIONS)) {
      this.consentTexts.set(
        purpose as ConsentPurpose,
        `I consent to ${definition.description.toLowerCase()}. ` +
        `Data categories involved: ${definition.dataCategories.join(', ')}. ` +
        `Retention period: ${definition.retentionDays > 0 ? `${definition.retentionDays} days` : 'Until account deletion'}.`
      );
    }
  }

  private groupConsentsByPurpose(
    consents: ConsentRecord[]
  ): Record<ConsentPurpose, ConsentStatus> {
    const result: Partial<Record<ConsentPurpose, ConsentStatus>> = {};
    for (const consent of consents) {
      result[consent.purpose] = consent.status;
    }
    return result as Record<ConsentPurpose, ConsentStatus>;
  }

  private groupConsentsByLegalBasis(
    consents: ConsentRecord[]
  ): Record<LegalBasis, number> {
    const result: Partial<Record<LegalBasis, number>> = {};
    for (const consent of consents) {
      result[consent.legalBasis] = (result[consent.legalBasis] || 0) + 1;
    }
    return result as Record<LegalBasis, number>;
  }

  private assessComplianceStatus(
    userId: string,
    consents: ConsentRecord[]
  ): ComplianceStatus {
    const requiredConsents = Object.entries(CONSENT_DEFINITIONS)
      .filter(([, def]) => def.required)
      .map(([purpose]) => purpose as ConsentPurpose);

    const hasAllRequired = requiredConsents.every(purpose => {
      const consent = consents.find(c => c.purpose === purpose);
      return consent?.status === ConsentStatus.GRANTED;
    });

    return {
      gdprCompliant: hasAllRequired,
      ccpaCompliant: hasAllRequired,
      hasRequiredConsents: hasAllRequired,
      missingConsents: requiredConsents.filter(p =>
        !consents.find(c => c.purpose === p && c.status === ConsentStatus.GRANTED)
      )
    };
  }

  private signExport(consents: ConsentRecord[]): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify(consents))
      .digest('hex');
  }
}

// ============================================================================
// Additional Types
// ============================================================================

export interface AITrainingConsentOptions {
  includeConversations?: boolean;
  includeGeneratedContent?: boolean;
  anonymizeData?: boolean;
  allowResearch?: boolean;
  retentionPeriod?: number;
}

export interface AITrainingConsentRequest {
  requestId: string;
  userId: string;
  purposes: ConsentPurpose[];
  options: Required<AITrainingConsentOptions>;
  requestedAt: Date;
  status: 'pending' | 'granted' | 'denied';
  requiresDoubleOptIn: boolean;
}

export interface AITrainingAcknowledgment {
  understoodDataUsage: boolean;
  understoodRetention: boolean;
  understoodWithdrawalRights: boolean;
  explicitlyConsented: boolean;
  timestamp: Date;
}

export interface ConsentVerificationResult {
  allowed: boolean;
  reason?: string;
  requiresConsent?: boolean;
  missingCategories?: string[];
  expiredAt?: Date;
  consentId?: string;
  expiresAt?: Date;
}

export interface ConsentReport {
  userId: string;
  generatedAt: Date;
  totalConsents: number;
  activeConsents: number;
  withdrawnConsents: number;
  deniedConsents: number;
  consentsByPurpose: Record<ConsentPurpose, ConsentStatus>;
  consentsByLegalBasis: Record<LegalBasis, number>;
  historyCount: number;
  lastActivity?: Date;
  complianceStatus: ComplianceStatus;
}

export interface ComplianceStatus {
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  hasRequiredConsents: boolean;
  missingConsents: ConsentPurpose[];
}

export interface ConsentExport {
  exportId: string;
  userId: string;
  exportedAt: Date;
  format: string;
  records: ConsentRecord[];
  history: ConsentHistoryEntry[];
  signature: string;
}

export default ConsentManager;
