/**
 * Alabobai File Upload Service
 * Frontend service for file uploads with progress tracking and chunked upload support
 */

// ============================================================================
// TYPES
// ============================================================================

export interface UploadedFileInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: 'success' | 'error';
  error?: string;
  analysisReady?: boolean;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  loaded: number;
  total: number;
  percentage: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export interface UploadOptions {
  sessionId?: string;
  onProgress?: (progress: UploadProgress) => void;
  onFileComplete?: (file: UploadedFileInfo) => void;
  signal?: AbortSignal;
}

export interface FileAnalysis {
  fileId: string;
  analysis: string;
  processingTimeMs: number;
}

export interface FileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  analysisReady: boolean;
  processingStatus: string;
  hasContent: boolean;
  chunkCount: number;
  metadata?: Record<string, unknown>;
}

export interface FileContent {
  content: string;
  metadata: Record<string, unknown>;
  chunks: Array<{
    id: string;
    content: string;
    index: number;
  }>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = '/api/files';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for large files
const MAX_CONCURRENT_UPLOADS = 3;

// Allowed file types
export const ALLOWED_FILE_TYPES = {
  documents: ['.pdf', '.txt', '.md'],
  images: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  spreadsheets: ['.csv', '.xlsx', '.xls'],
  code: ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.py', '.java', '.c', '.cpp', '.go', '.rs'],
} as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'application/json',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// FILE UPLOAD SERVICE
// ============================================================================

class FileUploadService {
  private uploadQueue: Array<{
    file: File;
    options?: UploadOptions;
    resolve: (value: UploadedFileInfo) => void;
    reject: (error: Error) => void;
  }> = [];
  private activeUploads = 0;

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Validate file before upload
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File "${file.name}" is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      };
    }

    // Check MIME type
    const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type);

    // Also check by extension for files with incorrect MIME
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isAllowedExt = Object.values(ALLOWED_FILE_TYPES)
      .flat()
      .includes(ext as typeof ALLOWED_FILE_TYPES['documents'][number]);

    if (!isAllowedMime && !isAllowedExt) {
      return {
        valid: false,
        error: `File type "${file.type || ext}" is not supported.`,
      };
    }

    return { valid: true };
  }

  /**
   * Get file type category
   */
  getFileCategory(file: File): 'document' | 'image' | 'spreadsheet' | 'code' | 'other' {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (ALLOWED_FILE_TYPES.documents.includes(ext as typeof ALLOWED_FILE_TYPES.documents[number])) {
      return 'document';
    }
    if (ALLOWED_FILE_TYPES.images.includes(ext as typeof ALLOWED_FILE_TYPES.images[number])) {
      return 'image';
    }
    if (ALLOWED_FILE_TYPES.spreadsheets.includes(ext as typeof ALLOWED_FILE_TYPES.spreadsheets[number])) {
      return 'spreadsheet';
    }
    if (ALLOWED_FILE_TYPES.code.includes(ext as typeof ALLOWED_FILE_TYPES.code[number])) {
      return 'code';
    }
    return 'other';
  }

  // --------------------------------------------------------------------------
  // UPLOAD METHODS
  // --------------------------------------------------------------------------

  /**
   * Upload single file with progress tracking
   */
  async uploadFile(file: File, options?: UploadOptions): Promise<UploadedFileInfo> {
    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check if file is large enough to require chunked upload
    if (file.size > CHUNK_SIZE) {
      return this.uploadLargeFile(file, options);
    }

    return this.uploadSmallFile(file, options);
  }

  /**
   * Upload small file (regular multipart upload)
   */
  private async uploadSmallFile(file: File, options?: UploadOptions): Promise<UploadedFileInfo> {
    const formData = new FormData();
    formData.append('file', file);

    if (options?.sessionId) {
      formData.append('sessionId', options.sessionId);
    }

    const fileId = crypto.randomUUID();

    // Report initial progress
    options?.onProgress?.({
      fileId,
      fileName: file.name,
      loaded: 0,
      total: file.size,
      percentage: 0,
      status: 'uploading',
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentage = Math.round((event.loaded / event.total) * 100);
          options?.onProgress?.({
            fileId,
            fileName: file.name,
            loaded: event.loaded,
            total: event.total,
            percentage,
            status: percentage < 100 ? 'uploading' : 'processing',
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            const uploadedFile = response.files?.[0] || response;

            options?.onProgress?.({
              fileId: uploadedFile.id,
              fileName: file.name,
              loaded: file.size,
              total: file.size,
              percentage: 100,
              status: 'complete',
            });

            options?.onFileComplete?.(uploadedFile);
            resolve(uploadedFile);
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          const error = xhr.responseText ? JSON.parse(xhr.responseText).error : 'Upload failed';
          options?.onProgress?.({
            fileId,
            fileName: file.name,
            loaded: 0,
            total: file.size,
            percentage: 0,
            status: 'error',
            error,
          });
          reject(new Error(error));
        }
      });

      xhr.addEventListener('error', () => {
        options?.onProgress?.({
          fileId,
          fileName: file.name,
          loaded: 0,
          total: file.size,
          percentage: 0,
          status: 'error',
          error: 'Network error',
        });
        reject(new Error('Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      xhr.open('POST', `${API_BASE}/upload/single`);
      xhr.send(formData);
    });
  }

  /**
   * Upload large file in chunks
   */
  private async uploadLargeFile(file: File, options?: UploadOptions): Promise<UploadedFileInfo> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = crypto.randomUUID();
    let uploadedSize = 0;

    options?.onProgress?.({
      fileId,
      fileName: file.name,
      loaded: 0,
      total: file.size,
      percentage: 0,
      status: 'uploading',
    });

    // For now, fall back to regular upload for large files
    // In production, implement proper chunked upload endpoint
    console.log(`[FileUpload] Large file detected (${totalChunks} chunks), using regular upload`);
    return this.uploadSmallFile(file, options);
  }

  /**
   * Upload multiple files with concurrency control
   */
  async uploadFiles(files: File[], options?: UploadOptions): Promise<UploadedFileInfo[]> {
    const results: UploadedFileInfo[] = [];
    const errors: Error[] = [];

    // Process files in batches
    const batches: File[][] = [];
    for (let i = 0; i < files.length; i += MAX_CONCURRENT_UPLOADS) {
      batches.push(files.slice(i, i + MAX_CONCURRENT_UPLOADS));
    }

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map((file) => this.uploadFile(file, options))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push(result.reason);
        }
      }
    }

    if (errors.length > 0 && results.length === 0) {
      throw new Error(`All uploads failed: ${errors[0].message}`);
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // FILE OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    const response = await fetch(`${API_BASE}/${fileId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get file metadata');
    }

    const data = await response.json();
    return data.file;
  }

  /**
   * Get file content (text, chunks)
   */
  async getFileContent(fileId: string): Promise<FileContent> {
    const response = await fetch(`${API_BASE}/${fileId}/content`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get file content');
    }

    return response.json();
  }

  /**
   * Download file
   */
  async downloadFile(fileId: string, fileName?: string): Promise<void> {
    const response = await fetch(`${API_BASE}/${fileId}/download`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to download file');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete file');
    }
  }

  /**
   * Analyze file with AI
   */
  async analyzeFile(fileId: string, prompt?: string): Promise<FileAnalysis> {
    const response = await fetch(`${API_BASE}/${fileId}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        includeText: true,
        maxTokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to analyze file');
    }

    return response.json();
  }

  /**
   * List user's files
   */
  async listFiles(options?: {
    sessionId?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: FileMetadata[]; total: number }> {
    const params = new URLSearchParams();

    if (options?.sessionId) params.set('sessionId', options.sessionId);
    if (options?.type) params.set('type', options.type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const response = await fetch(`${API_BASE}?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list files');
    }

    return response.json();
  }

  /**
   * Get thumbnail URL for image
   */
  getThumbnailUrl(fileId: string): string {
    return `${API_BASE}/${fileId}/thumbnail`;
  }

  // --------------------------------------------------------------------------
  // PREVIEW GENERATION
  // --------------------------------------------------------------------------

  /**
   * Generate local preview for file (before upload)
   */
  async generatePreview(file: File): Promise<string | null> {
    // For images, create object URL
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }

    // For text/code files, read first few KB
    if (file.type.startsWith('text/') || file.type === 'application/json') {
      const slice = file.slice(0, 10000);
      const text = await slice.text();
      return text;
    }

    // For PDFs, could use PDF.js but return null for now
    if (file.type === 'application/pdf') {
      return null;
    }

    return null;
  }

  /**
   * Revoke preview URL when done
   */
  revokePreview(previewUrl: string): void {
    if (previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  // --------------------------------------------------------------------------
  // DRAG & DROP HELPERS
  // --------------------------------------------------------------------------

  /**
   * Extract files from drag event
   */
  getFilesFromDragEvent(event: DragEvent): File[] {
    const files: File[] = [];

    if (event.dataTransfer?.items) {
      for (let i = 0; i < event.dataTransfer.items.length; i++) {
        const item = event.dataTransfer.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    } else if (event.dataTransfer?.files) {
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        files.push(event.dataTransfer.files[i]);
      }
    }

    return files;
  }

  /**
   * Check if drag event contains files
   */
  isDragEventWithFiles(event: DragEvent): boolean {
    if (event.dataTransfer?.types) {
      for (const type of event.dataTransfer.types) {
        if (type === 'Files') return true;
      }
    }
    return false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const fileUploadService = new FileUploadService();
export default fileUploadService;
