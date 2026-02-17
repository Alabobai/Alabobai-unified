/**
 * Alabobai File Storage Service
 * Handles file storage, metadata persistence, cleanup, and deduplication
 */

import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, createReadStream, createWriteStream } from 'fs';
import crypto from 'crypto';
import { ProcessedFile, FileMetadata } from './fileProcessor.js';

// ============================================================================
// TYPES
// ============================================================================

export interface StorageConfig {
  basePath: string;
  metadataPath: string;
  maxStorageMB?: number;
  fileExpirationHours?: number;
  enableDeduplication?: boolean;
  cloudBackup?: {
    enabled: boolean;
    provider: 's3' | 'gcs' | 'azure';
    bucket?: string;
    region?: string;
  };
}

export interface StoredFileInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  thumbnailPath?: string;
  hash: string;
  uploadedAt: Date;
  expiresAt?: Date;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  extractedText?: string;
  chunks?: Array<{ id: string; content: string; index: number }>;
  analysisReady: boolean;
  processingStatus: 'pending' | 'processing' | 'complete' | 'error';
  accessCount: number;
  lastAccessedAt: Date;
}

export interface StorageStats {
  totalFiles: number;
  totalSizeMB: number;
  usedPercentage: number;
  filesByType: Record<string, number>;
  duplicatesAvoided: number;
  spacesSavedMB: number;
}

// ============================================================================
// FILE STORAGE SERVICE
// ============================================================================

export class FileStorageService {
  private config: Required<StorageConfig>;
  private metadata: Map<string, StoredFileInfo> = new Map();
  private hashIndex: Map<string, string> = new Map(); // hash -> fileId
  private initialized: boolean = false;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      basePath: config.basePath || './data/uploads',
      metadataPath: config.metadataPath || './data/file-metadata.json',
      maxStorageMB: config.maxStorageMB || 5000, // 5GB default
      fileExpirationHours: config.fileExpirationHours || 168, // 7 days
      enableDeduplication: config.enableDeduplication ?? true,
      cloudBackup: config.cloudBackup || { enabled: false, provider: 's3' },
    };
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure storage directories exist
      await fs.mkdir(this.config.basePath, { recursive: true });
      await fs.mkdir(path.dirname(this.config.metadataPath), { recursive: true });

      // Load existing metadata
      await this.loadMetadata();

      // Clean up expired files
      await this.cleanupExpiredFiles();

      this.initialized = true;
      console.log('[FileStorage] Initialized successfully');
      console.log(`[FileStorage] Storage path: ${this.config.basePath}`);
      console.log(`[FileStorage] Files loaded: ${this.metadata.size}`);
    } catch (error) {
      console.error('[FileStorage] Initialization error:', error);
      throw error;
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      if (existsSync(this.config.metadataPath)) {
        const data = await fs.readFile(this.config.metadataPath, 'utf-8');
        const parsed = JSON.parse(data) as StoredFileInfo[];

        for (const file of parsed) {
          // Convert date strings back to Date objects
          file.uploadedAt = new Date(file.uploadedAt);
          file.lastAccessedAt = new Date(file.lastAccessedAt);
          if (file.expiresAt) {
            file.expiresAt = new Date(file.expiresAt);
          }

          this.metadata.set(file.id, file);

          // Build hash index for deduplication
          if (file.hash) {
            this.hashIndex.set(file.hash, file.id);
          }
        }
      }
    } catch (error) {
      console.warn('[FileStorage] Could not load metadata, starting fresh:', error);
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      const data = Array.from(this.metadata.values());
      await fs.writeFile(this.config.metadataPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[FileStorage] Failed to save metadata:', error);
    }
  }

  // --------------------------------------------------------------------------
  // FILE OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Store a file and return its metadata
   */
  async storeFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    options?: {
      userId?: string;
      sessionId?: string;
      expirationHours?: number;
      processedData?: Partial<ProcessedFile>;
    }
  ): Promise<StoredFileInfo> {
    await this.ensureInitialized();

    // Calculate hash for deduplication
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check for duplicate
    if (this.config.enableDeduplication && this.hashIndex.has(hash)) {
      const existingId = this.hashIndex.get(hash)!;
      const existingFile = this.metadata.get(existingId);

      if (existingFile && existsSync(existingFile.storagePath)) {
        console.log(`[FileStorage] Duplicate detected, reusing file: ${existingId}`);

        // Update access info
        existingFile.accessCount++;
        existingFile.lastAccessedAt = new Date();
        await this.saveMetadata();

        return existingFile;
      }
    }

    // Generate storage path
    const fileId = uuid();
    const extension = path.extname(originalName) || this.getExtensionFromMime(mimeType);
    const storagePath = path.join(
      this.config.basePath,
      this.getSubdirectory(mimeType),
      `${fileId}${extension}`
    );

    // Ensure subdirectory exists
    await fs.mkdir(path.dirname(storagePath), { recursive: true });

    // Write file
    await fs.writeFile(storagePath, buffer);

    // Calculate expiration
    const expirationHours = options?.expirationHours || this.config.fileExpirationHours;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    // Create file info
    const fileInfo: StoredFileInfo = {
      id: fileId,
      originalName,
      mimeType,
      size: buffer.length,
      storagePath,
      hash,
      uploadedAt: new Date(),
      expiresAt,
      userId: options?.userId,
      sessionId: options?.sessionId,
      metadata: options?.processedData?.metadata,
      extractedText: options?.processedData?.extractedText,
      chunks: options?.processedData?.chunks,
      thumbnailPath: options?.processedData?.thumbnailPath,
      analysisReady: options?.processedData?.analysisReady ?? false,
      processingStatus: options?.processedData?.processingStatus ?? 'pending',
      accessCount: 0,
      lastAccessedAt: new Date(),
    };

    // Store metadata
    this.metadata.set(fileId, fileInfo);
    this.hashIndex.set(hash, fileId);
    await this.saveMetadata();

    // Trigger cloud backup if enabled
    if (this.config.cloudBackup.enabled) {
      this.scheduleCloudBackup(fileInfo).catch(err => {
        console.error('[FileStorage] Cloud backup failed:', err);
      });
    }

    console.log(`[FileStorage] Stored file: ${fileId} (${originalName})`);
    return fileInfo;
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: string): Promise<{ info: StoredFileInfo; buffer: Buffer } | null> {
    await this.ensureInitialized();

    const info = this.metadata.get(fileId);
    if (!info) {
      return null;
    }

    // Check if file exists on disk
    if (!existsSync(info.storagePath)) {
      console.warn(`[FileStorage] File not found on disk: ${fileId}`);
      this.metadata.delete(fileId);
      if (info.hash) {
        this.hashIndex.delete(info.hash);
      }
      await this.saveMetadata();
      return null;
    }

    // Update access info
    info.accessCount++;
    info.lastAccessedAt = new Date();
    await this.saveMetadata();

    const buffer = await fs.readFile(info.storagePath);
    return { info, buffer };
  }

  /**
   * Get file metadata only
   */
  async getFileInfo(fileId: string): Promise<StoredFileInfo | null> {
    await this.ensureInitialized();
    return this.metadata.get(fileId) || null;
  }

  /**
   * Update file metadata
   */
  async updateFileInfo(fileId: string, updates: Partial<StoredFileInfo>): Promise<StoredFileInfo | null> {
    await this.ensureInitialized();

    const info = this.metadata.get(fileId);
    if (!info) {
      return null;
    }

    // Apply updates (don't allow changing id, storagePath, hash)
    const allowedUpdates = ['metadata', 'extractedText', 'chunks', 'analysisReady', 'processingStatus'];
    for (const key of allowedUpdates) {
      if (key in updates) {
        (info as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
      }
    }

    await this.saveMetadata();
    return info;
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<boolean> {
    await this.ensureInitialized();

    const info = this.metadata.get(fileId);
    if (!info) {
      return false;
    }

    try {
      // Delete main file
      if (existsSync(info.storagePath)) {
        await fs.unlink(info.storagePath);
      }

      // Delete thumbnail if exists
      if (info.thumbnailPath && existsSync(info.thumbnailPath)) {
        await fs.unlink(info.thumbnailPath);
      }

      // Remove from metadata
      this.metadata.delete(fileId);
      if (info.hash) {
        this.hashIndex.delete(info.hash);
      }

      await this.saveMetadata();
      console.log(`[FileStorage] Deleted file: ${fileId}`);
      return true;
    } catch (error) {
      console.error(`[FileStorage] Error deleting file ${fileId}:`, error);
      return false;
    }
  }

  /**
   * List files with optional filtering
   */
  async listFiles(options?: {
    userId?: string;
    sessionId?: string;
    mimeType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: StoredFileInfo[]; total: number }> {
    await this.ensureInitialized();

    let files = Array.from(this.metadata.values());

    // Apply filters
    if (options?.userId) {
      files = files.filter(f => f.userId === options.userId);
    }
    if (options?.sessionId) {
      files = files.filter(f => f.sessionId === options.sessionId);
    }
    if (options?.mimeType) {
      files = files.filter(f => f.mimeType.startsWith(options.mimeType!));
    }

    // Sort by upload date (newest first)
    files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    const total = files.length;

    // Apply pagination
    if (options?.offset) {
      files = files.slice(options.offset);
    }
    if (options?.limit) {
      files = files.slice(0, options.limit);
    }

    return { files, total };
  }

  // --------------------------------------------------------------------------
  // CLEANUP & MAINTENANCE
  // --------------------------------------------------------------------------

  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles(): Promise<{ deleted: number; freedMB: number }> {
    await this.ensureInitialized();

    const now = new Date();
    let deleted = 0;
    let freedBytes = 0;

    for (const [fileId, info] of this.metadata) {
      if (info.expiresAt && info.expiresAt < now) {
        freedBytes += info.size;
        await this.deleteFile(fileId);
        deleted++;
      }
    }

    const freedMB = freedBytes / (1024 * 1024);
    if (deleted > 0) {
      console.log(`[FileStorage] Cleanup: deleted ${deleted} expired files, freed ${freedMB.toFixed(2)}MB`);
    }

    return { deleted, freedMB };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    await this.ensureInitialized();

    const files = Array.from(this.metadata.values());
    const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    const filesByType: Record<string, number> = {};
    for (const file of files) {
      const type = file.mimeType.split('/')[0] || 'other';
      filesByType[type] = (filesByType[type] || 0) + 1;
    }

    // Calculate deduplication savings
    const uniqueHashes = new Set(files.map(f => f.hash)).size;
    const duplicatesAvoided = files.length - uniqueHashes;
    const spacesSavedMB = duplicatesAvoided > 0
      ? (files.filter(f => files.filter(f2 => f2.hash === f.hash).length > 1)
          .reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)) / 2
      : 0;

    return {
      totalFiles: files.length,
      totalSizeMB,
      usedPercentage: (totalSizeMB / this.config.maxStorageMB) * 100,
      filesByType,
      duplicatesAvoided,
      spacesSavedMB,
    };
  }

  /**
   * Check if file exists by hash (for deduplication)
   */
  async findByHash(hash: string): Promise<StoredFileInfo | null> {
    await this.ensureInitialized();

    const fileId = this.hashIndex.get(hash);
    if (!fileId) return null;

    return this.metadata.get(fileId) || null;
  }

  // --------------------------------------------------------------------------
  // CLOUD BACKUP (PLACEHOLDER)
  // --------------------------------------------------------------------------

  /**
   * Schedule cloud backup for a file
   * In production, implement actual S3/GCS/Azure upload
   */
  private async scheduleCloudBackup(fileInfo: StoredFileInfo): Promise<void> {
    if (!this.config.cloudBackup.enabled) return;

    console.log(`[FileStorage] Cloud backup scheduled for: ${fileInfo.id}`);

    // TODO: Implement actual cloud upload
    // Example S3 implementation:
    // const s3 = new S3Client({ region: this.config.cloudBackup.region });
    // await s3.send(new PutObjectCommand({
    //   Bucket: this.config.cloudBackup.bucket,
    //   Key: `uploads/${fileInfo.id}${path.extname(fileInfo.originalName)}`,
    //   Body: await fs.readFile(fileInfo.storagePath),
    //   ContentType: fileInfo.mimeType,
    //   Metadata: {
    //     originalName: fileInfo.originalName,
    //     uploadedAt: fileInfo.uploadedAt.toISOString(),
    //   },
    // }));
  }

  // --------------------------------------------------------------------------
  // UTILITIES
  // --------------------------------------------------------------------------

  private getSubdirectory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'documents';
    if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return 'spreadsheets';
    if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
    return 'other';
  }

  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'text/csv': '.csv',
      'text/html': '.html',
      'text/css': '.css',
      'text/javascript': '.js',
      'application/json': '.json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    return mimeToExt[mimeType] || '.bin';
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Create a read stream for file
   */
  async createReadStream(fileId: string): Promise<NodeJS.ReadableStream | null> {
    const info = await this.getFileInfo(fileId);
    if (!info || !existsSync(info.storagePath)) {
      return null;
    }
    return createReadStream(info.storagePath);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let storageInstance: FileStorageService | null = null;

export function getFileStorage(config?: Partial<StorageConfig>): FileStorageService {
  if (!storageInstance) {
    storageInstance = new FileStorageService(config);
  }
  return storageInstance;
}

export function createFileStorage(config?: Partial<StorageConfig>): FileStorageService {
  return new FileStorageService(config);
}

export default FileStorageService;
