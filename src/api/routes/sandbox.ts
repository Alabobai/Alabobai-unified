/**
 * Alabobai Code Sandbox API Routes
 * REST endpoints for secure code execution
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer, { Multer } from 'multer';
import { v4 as uuid } from 'uuid';

// Multer file type for TypeScript
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
import {
  CodeSandboxService,
  getCodeSandbox,
  ExecutionRequest,
  ExecutionOutput,
  SupportedLanguage
} from '../../services/codeSandbox.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const ExecuteRequestSchema = z.object({
  language: z.enum(['python', 'javascript', 'typescript']),
  code: z.string().min(1, 'Code is required').max(100000, 'Code too long'),
  files: z.record(z.string()).optional(),
  packages: z.array(z.string().max(100)).max(20).optional(),
  timeout: z.number().min(1000).max(300000).optional(), // 1s to 5min
  memoryLimit: z.number().min(128).max(2048).optional(), // 128MB to 2GB
  cpuLimit: z.number().min(128).max(1024).optional(),
  networkEnabled: z.boolean().optional().default(false),
  env: z.record(z.string()).optional(),
  stream: z.boolean().optional().default(false)
});

const UploadFilesSchema = z.object({
  executionId: z.string().uuid()
});

// ============================================================================
// TYPES
// ============================================================================

export interface SandboxRouterConfig {
  sandbox?: CodeSandboxService;
  maxFileSize?: number; // bytes, default 10MB
  enableUploads?: boolean;
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createSandboxRouter(config: SandboxRouterConfig = {}): Router {
  const router = Router();
  const sandbox = config.sandbox || getCodeSandbox();
  const maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
  const enableUploads = config.enableUploads ?? true;

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileSize,
      files: 10
    }
  });

  // ============================================================================
  // POST /api/sandbox/execute - Execute code
  // ============================================================================

  router.post('/execute', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = ExecuteRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }

      // Check if Docker is available
      const dockerAvailable = await sandbox.isDockerAvailable();
      if (!dockerAvailable) {
        return res.status(503).json({
          error: 'Code execution service unavailable',
          message: 'Docker is not running or not accessible'
        });
      }

      const {
        language,
        code,
        files,
        packages,
        timeout,
        memoryLimit,
        cpuLimit,
        networkEnabled,
        env,
        stream
      } = validation.data;

      const executionId = uuid();

      const request: ExecutionRequest = {
        id: executionId,
        language,
        code,
        files,
        packages,
        timeout,
        memoryLimit,
        cpuLimit,
        networkEnabled,
        env
      };

      // Handle streaming response
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Send execution ID immediately
        res.write(`data: ${JSON.stringify({ type: 'start', executionId })}\n\n`);

        try {
          const result = await sandbox.executeWithStream(request, (output: ExecutionOutput) => {
            res.write(`data: ${JSON.stringify({
              type: 'output',
              outputType: output.type,
              content: output.content,
              timestamp: output.timestamp.toISOString(),
              filename: output.filename
            })}\n\n`);
          });

          res.write(`data: ${JSON.stringify({
            type: 'complete',
            result: {
              success: result.success,
              exitCode: result.exitCode,
              duration: result.duration,
              timedOut: result.timedOut,
              filesCreated: result.filesCreated,
              error: result.error
            }
          })}\n\n`);

          res.end();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: errorMessage
          })}\n\n`);
          res.end();
        }

        return;
      }

      // Non-streaming response
      const result = await sandbox.execute(request);

      res.json({
        executionId: result.id,
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        timedOut: result.timedOut,
        filesCreated: result.filesCreated,
        error: result.error,
        status: result.status
      });

    } catch (error) {
      console.error('[Sandbox API] Execute error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Execution failed',
        message: errorMessage
      });
    }
  });

  // ============================================================================
  // GET /api/sandbox/status/:id - Check execution status
  // ============================================================================

  router.get('/status/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = sandbox.getStatus(id);

      if (!session) {
        return res.status(404).json({
          error: 'Execution not found',
          message: `No execution found with ID: ${id}`
        });
      }

      res.json({
        executionId: session.id,
        language: session.language,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        filesCreated: session.filesCreated,
        hasResult: !!session.result
      });

    } catch (error) {
      console.error('[Sandbox API] Status error:', error);
      res.status(500).json({
        error: 'Failed to get status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/sandbox/output/:id - Get execution output
  // ============================================================================

  router.get('/output/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = sandbox.getStatus(id);

      if (!session) {
        return res.status(404).json({
          error: 'Execution not found',
          message: `No execution found with ID: ${id}`
        });
      }

      const outputs = sandbox.getOutput(id);
      const result = sandbox.getResult(id);

      res.json({
        executionId: id,
        status: session.status,
        outputs: outputs.map(o => ({
          type: o.type,
          content: o.content,
          timestamp: o.timestamp.toISOString(),
          filename: o.filename
        })),
        result: result ? {
          success: result.success,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
          timedOut: result.timedOut,
          filesCreated: result.filesCreated,
          error: result.error
        } : null
      });

    } catch (error) {
      console.error('[Sandbox API] Output error:', error);
      res.status(500).json({
        error: 'Failed to get output',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/sandbox/upload - Upload files to sandbox
  // ============================================================================

  if (enableUploads) {
    router.post('/upload', upload.array('files', 10), async (req: Request, res: Response) => {
      try {
        const { executionId } = req.body;

        if (!executionId) {
          return res.status(400).json({
            error: 'Missing executionId',
            message: 'executionId is required'
          });
        }

        const session = sandbox.getStatus(executionId);
        if (!session) {
          return res.status(404).json({
            error: 'Execution not found',
            message: `No execution found with ID: ${executionId}`
          });
        }

        const files = req.files as MulterFile[];
        if (!files || files.length === 0) {
          return res.status(400).json({
            error: 'No files uploaded',
            message: 'At least one file is required'
          });
        }

        const fileMap: Record<string, Buffer> = {};
        for (const file of files) {
          fileMap[file.originalname] = file.buffer;
        }

        const uploadedFiles = await sandbox.uploadFiles(executionId, fileMap);

        res.json({
          success: true,
          uploadedFiles,
          message: `Uploaded ${uploadedFiles.length} file(s)`
        });

      } catch (error) {
        console.error('[Sandbox API] Upload error:', error);
        res.status(500).json({
          error: 'Upload failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  // ============================================================================
  // GET /api/sandbox/download/:id/:file - Download generated files
  // ============================================================================

  router.get('/download/:id/:file(*)', async (req: Request, res: Response) => {
    try {
      const { id, file } = req.params;

      const session = sandbox.getStatus(id);
      if (!session) {
        return res.status(404).json({
          error: 'Execution not found',
          message: `No execution found with ID: ${id}`
        });
      }

      const fileBuffer = await sandbox.downloadFile(id, file);

      // Determine content type based on extension
      const ext = file.split('.').pop()?.toLowerCase() || '';
      const contentTypes: Record<string, string> = {
        'txt': 'text/plain',
        'json': 'application/json',
        'csv': 'text/csv',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'py': 'text/x-python',
        'md': 'text/markdown',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'pdf': 'application/pdf',
        'zip': 'application/zip'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file)}"`);
      res.send(fileBuffer);

    } catch (error) {
      console.error('[Sandbox API] Download error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        return res.status(404).json({
          error: 'File not found',
          message: `File "${req.params.file}" not found in execution workspace`
        });
      }

      if (errorMessage.includes('path traversal')) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Invalid file path'
        });
      }

      res.status(500).json({
        error: 'Download failed',
        message: errorMessage
      });
    }
  });

  // ============================================================================
  // GET /api/sandbox/files/:id - List files in execution workspace
  // ============================================================================

  router.get('/files/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { subdir = '' } = req.query;

      const session = sandbox.getStatus(id);
      if (!session) {
        return res.status(404).json({
          error: 'Execution not found',
          message: `No execution found with ID: ${id}`
        });
      }

      const files = await sandbox.listFiles(id, subdir as string);

      res.json({
        executionId: id,
        directory: subdir || '/',
        files
      });

    } catch (error) {
      console.error('[Sandbox API] List files error:', error);
      res.status(500).json({
        error: 'Failed to list files',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/sandbox/cancel/:id - Cancel ongoing execution
  // ============================================================================

  router.post('/cancel/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const cancelled = await sandbox.cancelExecution(id);

      if (!cancelled) {
        return res.status(404).json({
          error: 'Execution not found or already completed',
          message: `No active execution found with ID: ${id}`
        });
      }

      res.json({
        success: true,
        message: 'Execution cancelled'
      });

    } catch (error) {
      console.error('[Sandbox API] Cancel error:', error);
      res.status(500).json({
        error: 'Failed to cancel execution',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // DELETE /api/sandbox/:id - Clean up execution
  // ============================================================================

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await sandbox.cleanup(id);

      res.json({
        success: true,
        message: 'Execution cleaned up'
      });

    } catch (error) {
      console.error('[Sandbox API] Cleanup error:', error);
      res.status(500).json({
        error: 'Cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/sandbox/health - Service health check
  // ============================================================================

  router.get('/health', async (req: Request, res: Response) => {
    try {
      const dockerAvailable = await sandbox.isDockerAvailable();
      const stats = sandbox.getStats();

      res.json({
        status: dockerAvailable ? 'healthy' : 'degraded',
        dockerAvailable,
        activeSessions: stats.activeSessions,
        activeExecutions: stats.activeExecutions,
        maxConcurrentExecutions: stats.maxConcurrent,
        supportedLanguages: ['python', 'javascript', 'typescript']
      });

    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/sandbox/languages - Get supported languages
  // ============================================================================

  router.get('/languages', (req: Request, res: Response) => {
    res.json({
      languages: [
        {
          id: 'python',
          name: 'Python',
          version: '3.11',
          extension: '.py',
          icon: 'python',
          packageManager: 'pip',
          example: 'print("Hello, World!")'
        },
        {
          id: 'javascript',
          name: 'JavaScript',
          version: 'Node.js 20',
          extension: '.js',
          icon: 'javascript',
          packageManager: 'npm',
          example: 'console.log("Hello, World!");'
        },
        {
          id: 'typescript',
          name: 'TypeScript',
          version: 'Node.js 20',
          extension: '.ts',
          icon: 'typescript',
          packageManager: 'npm',
          example: 'const greeting: string = "Hello, World!";\nconsole.log(greeting);'
        }
      ]
    });
  });

  return router;
}

export default createSandboxRouter;
