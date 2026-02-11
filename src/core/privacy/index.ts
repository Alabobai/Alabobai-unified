/**
 * Privacy Fortress - Complete Privacy Protection System
 *
 * Alabobai's answer to "no idea what they do with my data":
 * You know EVERYTHING about your data.
 *
 * Features:
 * - Complete data ownership with legal certificates
 * - Military-grade encryption (AES-256-GCM, zero-knowledge option)
 * - One-click data deletion with certified proof
 * - Opt-IN only consent management
 * - Full audit trail of all data access
 * - One-click data export (GDPR Article 20)
 * - GDPR/CCPA/HIPAA compliant
 */

// Main controller
export { default as PrivacyFortress } from './PrivacyFortress.js';
export type {
  PrivacyFortressConfig,
  PrivacyDashboard,
  TransparencyReport,
  ComplianceStatus,
  PrivacyScore,
  UserPrivacySetup,
  StoreDataOptions,
  StoredDataResult,
  RetrievedDataResult
} from './PrivacyFortress.js';

// Data Ownership
export { default as DataOwnershipManager } from './DataOwnership.js';
export type {
  DataOwnershipRecord,
  OwnershipCertificate,
  OwnershipReport,
  DataOwnershipConfig,
  OwnershipTransfer,
  AccessLogEntry
} from './DataOwnership.js';
export {
  DataType,
  DataCategory,
  AccessType,
  TransferStatus
} from './DataOwnership.js';

// Encryption
export { default as EncryptionManager } from './EncryptionManager.js';
export type {
  EncryptionKey,
  EncryptedData,
  KeyPair,
  ZeroKnowledgeProof,
  EncryptionConfig,
  KeyDerivationParams,
  KeyStatus,
  ClientSideParams,
  WrappedKey,
  RangeProof
} from './EncryptionManager.js';
export {
  EncryptionAlgorithm,
  KeyPurpose
} from './EncryptionManager.js';

// Data Deletion
export { default as DataDeletionManager } from './DataDeletion.js';
export type {
  DeletionRequest,
  DeletionCertificate,
  DeletionScope,
  DeletionConfig,
  DeletedDataRecord,
  ThirdPartyNotification,
  RetentionExemption,
  DeletionRequestStatus
} from './DataDeletion.js';
export {
  DeletionType,
  DeletionStatus,
  DataTypeForDeletion,
  DataCategoryForDeletion,
  WipeMethod
} from './DataDeletion.js';

// Consent Management
export { default as ConsentManager } from './ConsentManager.js';
export type {
  ConsentRecord,
  ConsentRequest,
  ConsentPreference,
  ConsentConfig,
  ConsentReport,
  ConsentExport,
  AITrainingConsentOptions,
  AITrainingConsentRequest,
  AITrainingAcknowledgment,
  ConsentVerificationResult,
  ComplianceStatus as ConsentComplianceStatus
} from './ConsentManager.js';
export {
  ConsentPurpose,
  ConsentStatus,
  ConsentAction,
  LegalBasis,
  RequestMethod
} from './ConsentManager.js';

// Audit Trail
export { default as AuditTrailManager } from './AuditTrail.js';
export type {
  AuditEntry,
  AccessorInfo,
  ResourceInfo,
  AccessContext,
  AccessResult,
  AuditQuery,
  AuditConfig,
  NotificationThresholds,
  AuditSummary,
  AccessTimelineEntry,
  IntegrityReport,
  AuditExport,
  ComplianceReport,
  GeoLocation
} from './AuditTrail.js';
export {
  AuditAction,
  AccessorType,
  ResourceType,
  SensitivityLevel
} from './AuditTrail.js';

// Data Export
export { default as DataExporter } from './DataExporter.js';
export type {
  ExportRequest,
  ExportedData,
  ExportSection,
  ExportManifest,
  ExportScope,
  ExportConfig,
  ExportStatusInfo,
  ExportDownload,
  DataSchema,
  SchemaField
} from './DataExporter.js';
export {
  ExportFormat,
  ExportStatus,
  DataTypeForExport,
  RequestSource
} from './DataExporter.js';

/**
 * Quick Start:
 *
 * ```typescript
 * import { PrivacyFortress, ConsentPurpose } from '@alabobai/privacy';
 *
 * // Initialize the fortress
 * const fortress = new PrivacyFortress({
 *   enableEncryption: true,
 *   enableZeroKnowledge: true,
 *   gdprMode: true,
 *   ccpaMode: true
 * });
 *
 * // Initialize for a user
 * const setup = await fortress.initializeUser('user-123', 'userPassword');
 *
 * // Store data with full privacy protection
 * const result = await fortress.storeData('user-123', DataType.CONVERSATION, myData);
 *
 * // Get privacy dashboard
 * const dashboard = await fortress.getPrivacyDashboard('user-123');
 *
 * // One-click export all data
 * const exportRequest = await fortress.exportAllData('user-123');
 *
 * // One-click delete all data
 * const deletionCert = await fortress.deleteAllData('user-123');
 *
 * // Opt out of AI training
 * await fortress.optOutOfAITraining('user-123');
 *
 * // Generate transparency report
 * const report = await fortress.generateTransparencyReport(
 *   'user-123',
 *   new Date('2024-01-01'),
 *   new Date('2024-12-31')
 * );
 * ```
 */
