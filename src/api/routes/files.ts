/**
 * Alabobai File Upload API Routes
 * Handles file upload, retrieval, deletion, and AI analysis
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getFileProcessor, ProcessedFile } from '../../services/fileProcessor.js';
import { getFileStorage, StoredFileInfo } from '../../services/fileStorage.js';
import { createLLMClient } from '../../core/llm-client.js';

// ============================================================================
// TYPES
// ============================================================================

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface AnalysisRequest {
  prompt?: string;
  includeText?: boolean;
  maxTokens?: number;
}

interface AnalysisResponse {
  fileId: string;
  analysis: string;
  tokensUsed?: number;
  processingTimeMs: number;
}

// ============================================================================
// MULTER CONFIGURATION
// ============================================================================

const storage = multer.memoryStorage();

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const allowedMimes = [
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    // Images
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    // Spreadsheets
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    // Code files
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'application/typescript',
    'text/html',
    'text/css',
    'application/json',
    'text/x-python',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 10, // Max 10 files per request
  },
});

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /api/files/upload
 * Upload one or more files
 */
async function handleUpload(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const files = req.files as UploadedFile[] | undefined;
    const file = req.file as UploadedFile | undefined;

    const uploadedFiles = files || (file ? [file] : []);

    if (uploadedFiles.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const processor = getFileProcessor();
    const storage = getFileStorage();

    const results: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      size: number;
      status: 'success' | 'error';
      error?: string;
      analysisReady?: boolean;
    }> = [];

    // Process each file
    for (const uploadedFile of uploadedFiles) {
      try {
        // Detect actual file type from content
        const detectedType = await processor.detectFileType(uploadedFile.buffer);
        const mimeType = detectedType || uploadedFile.mimetype;

        // Generate storage path
        const fileId = uuid();
        const extension = path.extname(uploadedFile.originalname) || '.bin';
        const storagePath = path.join(
          process.env.FILE_STORAGE_PATH || './data/uploads',
          `${fileId}${extension}`
        );

        // Process the file
        const processedFile = await processor.processFile(
          uploadedFile.buffer,
          uploadedFile.originalname,
          mimeType,
          storagePath,
          {
            userId: (req as Request & { userId?: string }).userId,
            sessionId: req.body.sessionId,
            generateThumbnail: mimeType.startsWith('image/'),
            extractText: true,
            prepareForAnalysis: true,
          }
        );

        // Store the file
        const storedFile = await storage.storeFile(
          uploadedFile.buffer,
          uploadedFile.originalname,
          mimeType,
          {
            userId: (req as Request & { userId?: string }).userId,
            sessionId: req.body.sessionId,
            processedData: processedFile,
          }
        );

        results.push({
          id: storedFile.id,
          originalName: uploadedFile.originalname,
          mimeType: storedFile.mimeType,
          size: storedFile.size,
          status: 'success',
          analysisReady: storedFile.analysisReady,
        });
      } catch (error) {
        console.error(`[Files API] Error processing file ${uploadedFile.originalname}:`, error);
        results.push({
          id: '',
          originalName: uploadedFile.originalname,
          mimeType: uploadedFile.mimetype,
          size: uploadedFile.size,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    res.status(200).json({
      success: true,
      files: results,
      totalFiles: results.length,
      successCount: results.filter(r => r.status === 'success').length,
      errorCount: results.filter(r => r.status === 'error').length,
      processingTimeMs,
    });
  } catch (error) {
    console.error('[Files API] Upload error:', error);
    res.status(500).json({
      error: 'Failed to process upload',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/files/:id
 * Get file metadata
 */
async function handleGetMetadata(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const storage = getFileStorage();

    const fileInfo = await storage.getFileInfo(id);

    if (!fileInfo) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Remove sensitive paths from response
    const { storagePath, thumbnailPath, ...safeInfo } = fileInfo;

    res.json({
      file: {
        ...safeInfo,
        hasContent: !!fileInfo.extractedText,
        chunkCount: fileInfo.chunks?.length || 0,
      },
    });
  } catch (error) {
    console.error('[Files API] Get metadata error:', error);
    res.status(500).json({
      error: 'Failed to get file metadata',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/files/:id/content
 * Get processed file content (text, chunks)
 */
async function handleGetContent(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { format = 'full', chunkIndex } = req.query;
    const storage = getFileStorage();

    const fileInfo = await storage.getFileInfo(id);

    if (!fileInfo) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!fileInfo.analysisReady) {
      res.status(400).json({
        error: 'File content not available',
        reason: 'File has not been processed or processing failed',
        processingStatus: fileInfo.processingStatus,
      });
      return;
    }

    if (format === 'chunks') {
      // Return specific chunk or all chunks
      if (chunkIndex !== undefined) {
        const idx = parseInt(chunkIndex as string, 10);
        const chunk = fileInfo.chunks?.[idx];

        if (!chunk) {
          res.status(404).json({ error: `Chunk ${idx} not found` });
          return;
        }

        res.json({ chunk });
      } else {
        res.json({
          chunks: fileInfo.chunks || [],
          totalChunks: fileInfo.chunks?.length || 0,
        });
      }
    } else {
      // Return full content
      res.json({
        content: fileInfo.extractedText || '',
        metadata: fileInfo.metadata || {},
        chunks: fileInfo.chunks || [],
      });
    }
  } catch (error) {
    console.error('[Files API] Get content error:', error);
    res.status(500).json({
      error: 'Failed to get file content',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/files/:id/download
 * Download the original file
 */
async function handleDownload(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const storage = getFileStorage();

    const result = await storage.getFile(id);

    if (!result) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const { info, buffer } = result;

    res.setHeader('Content-Type', info.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(info.originalName)}"`
    );
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('[Files API] Download error:', error);
    res.status(500).json({
      error: 'Failed to download file',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/files/:id/thumbnail
 * Get image thumbnail
 */
async function handleGetThumbnail(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const storage = getFileStorage();

    const fileInfo = await storage.getFileInfo(id);

    if (!fileInfo) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!fileInfo.thumbnailPath || !existsSync(fileInfo.thumbnailPath)) {
      res.status(404).json({ error: 'Thumbnail not available' });
      return;
    }

    const thumbnail = await fs.readFile(fileInfo.thumbnailPath);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(thumbnail);
  } catch (error) {
    console.error('[Files API] Get thumbnail error:', error);
    res.status(500).json({
      error: 'Failed to get thumbnail',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * DELETE /api/files/:id
 * Delete a file
 */
async function handleDelete(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const storage = getFileStorage();

    const deleted = await storage.deleteFile(id);

    if (!deleted) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('[Files API] Delete error:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/files/:id/analyze
 * Analyze file with AI
 */
async function handleAnalyze(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const { id } = req.params;
    const { prompt, includeText = true, maxTokens = 2000 } = req.body as AnalysisRequest;
    const storage = getFileStorage();

    const result = await storage.getFile(id);

    if (!result) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const { info, buffer } = result;

    if (!info.analysisReady) {
      res.status(400).json({
        error: 'File not ready for analysis',
        processingStatus: info.processingStatus,
      });
      return;
    }

    // Build analysis context
    let analysisContext = '';

    if (info.mimeType.startsWith('image/')) {
      // For images, prepare base64 for vision API
      const processor = getFileProcessor();
      const imagePrep = await processor.prepareImageForAnalysis(
        buffer,
        info.storagePath.replace(path.extname(info.storagePath), '_analysis.jpg')
      );

      // Use vision-capable model
      const llm = createLLMClient({
        provider: (process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'groq') || 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
        model: process.env.VISION_MODEL || 'claude-sonnet-4-20250514',
      });

      const response = await llm.chat([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: info.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data: imagePrep.base64?.replace(/^data:image\/\w+;base64,/, '') || '',
              },
            },
            {
              type: 'text',
              text: prompt || 'Analyze this image in detail. Describe what you see, including any text, objects, people, colors, and overall composition.',
            },
          ],
        },
      ]);

      res.json({
        fileId: id,
        analysis: response.content,
        processingTimeMs: Date.now() - startTime,
      });
      return;
    }

    // For text-based files
    if (includeText && info.extractedText) {
      analysisContext = info.extractedText;

      // Truncate if too long
      if (analysisContext.length > 50000) {
        analysisContext = analysisContext.slice(0, 50000) + '\n\n[Content truncated due to length...]';
      }
    }

    const defaultPrompt = `Analyze the following ${info.mimeType.includes('spreadsheet') ? 'data' : 'document'} and provide insights:`;

    const llm = createLLMClient({
      provider: (process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'groq') || 'groq',
      apiKey: process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
      model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    });

    const response = await llm.chat([
      {
        role: 'user',
        content: `${prompt || defaultPrompt}\n\n---\n\nFile: ${info.originalName}\nType: ${info.mimeType}\n\nContent:\n${analysisContext}`,
      },
    ], { maxTokens });

    res.json({
      fileId: id,
      analysis: response.content,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[Files API] Analyze error:', error);
    res.status(500).json({
      error: 'Failed to analyze file',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/files
 * List files with filtering
 */
async function handleList(req: Request, res: Response): Promise<void> {
  try {
    const { userId, sessionId, type, limit = '20', offset = '0' } = req.query;
    const storage = getFileStorage();

    const result = await storage.listFiles({
      userId: userId as string | undefined,
      sessionId: sessionId as string | undefined,
      mimeType: type as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    // Remove sensitive paths from response
    const safeFiles = result.files.map(f => {
      const { storagePath, thumbnailPath, ...safe } = f;
      return {
        ...safe,
        hasContent: !!f.extractedText,
        chunkCount: f.chunks?.length || 0,
      };
    });

    res.json({
      files: safeFiles,
      total: result.total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error('[Files API] List error:', error);
    res.status(500).json({
      error: 'Failed to list files',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/files/stats
 * Get storage statistics
 */
async function handleStats(req: Request, res: Response): Promise<void> {
  try {
    const storage = getFileStorage();
    const stats = await storage.getStats();

    res.json({ stats });
  } catch (error) {
    console.error('[Files API] Stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createFilesRouter(): Router {
  const router = Router();

  // Error handling middleware for multer
  const handleMulterError = (err: Error, req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        res.status(400).json({ error: 'Too many files. Maximum is 10 files per upload.' });
        return;
      }
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    if (err.message.includes('not allowed')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  };

  // Routes
  router.post('/upload', upload.array('files', 10), handleMulterError, handleUpload);
  router.post('/upload/single', upload.single('file'), handleMulterError, handleUpload);

  router.get('/stats', handleStats);
  router.get('/', handleList);

  router.get('/:id', handleGetMetadata);
  router.get('/:id/content', handleGetContent);
  router.get('/:id/download', handleDownload);
  router.get('/:id/thumbnail', handleGetThumbnail);
  router.delete('/:id', handleDelete);
  router.post('/:id/analyze', handleAnalyze);

  return router;
}

export default createFilesRouter;
