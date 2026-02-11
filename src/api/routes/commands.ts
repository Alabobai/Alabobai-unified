/**
 * Alabobai Commands API Routes
 * API endpoint to process user commands through the orchestrator
 * Supports both standard and streaming responses for real-time Neural Stream visualization
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import {
  OrchestratorService,
  getOrchestratorService,
  createOrchestratorService
} from '../../services/orchestrator.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CommandRequestSchema = z.object({
  content: z.string().min(1, 'Command content is required').max(10000, 'Command too long'),
  sessionId: z.string().uuid().optional(),
  userId: z.string().optional(),
  departmentHint: z.string().optional(),
  stream: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional()
});

const BatchCommandSchema = z.object({
  commands: z.array(z.object({
    content: z.string().min(1).max(10000),
    departmentHint: z.string().optional()
  })).min(1).max(10),
  sessionId: z.string().uuid().optional(),
  userId: z.string().optional(),
  parallel: z.boolean().optional().default(false)
});

// ============================================================================
// TYPES
// ============================================================================

export interface CommandsRouterConfig {
  orchestrator?: OrchestratorService;
  enableBatchProcessing?: boolean;
  maxConcurrentStreams?: number;
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createCommandsRouter(config: CommandsRouterConfig = {}): Router {
  const router = Router();
  const orchestrator = config.orchestrator || getOrchestratorService();
  const enableBatchProcessing = config.enableBatchProcessing ?? true;
  const maxConcurrentStreams = config.maxConcurrentStreams || 10;

  // Track active streams for cleanup
  const activeStreams: Map<string, Response> = new Map();

  // ============================================================================
  // POST /api/commands - Process a single command
  // ============================================================================

  router.post('/', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = CommandRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }

      const {
        content,
        sessionId = uuid(),
        userId = 'anonymous',
        departmentHint,
        stream,
        metadata
      } = validation.data;

      // Check if streaming is requested
      if (stream) {
        return handleStreamingCommand(req, res, orchestrator, {
          content,
          sessionId,
          userId,
          departmentHint,
          metadata
        }, activeStreams, maxConcurrentStreams);
      }

      // Standard (non-streaming) response
      const result = await orchestrator.processCommand(
        content,
        sessionId,
        userId,
        { departmentHint }
      );

      res.json({
        success: result.success,
        data: {
          taskId: result.taskId,
          response: result.response,
          department: {
            id: result.departmentId,
            name: result.departmentName
          },
          executionTimeMs: result.executionTimeMs,
          sessionId
        },
        error: result.error
      });
    } catch (error) {
      console.error('[Commands API] Error processing command:', error);
      res.status(500).json({
        error: 'Failed to process command',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/commands/stream - Streaming command endpoint (SSE)
  // ============================================================================

  router.post('/stream', async (req: Request, res: Response) => {
    try {
      const validation = CommandRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors
        });
      }

      const {
        content,
        sessionId = uuid(),
        userId = 'anonymous',
        departmentHint,
        metadata
      } = validation.data;

      return handleStreamingCommand(req, res, orchestrator, {
        content,
        sessionId,
        userId,
        departmentHint,
        metadata
      }, activeStreams, maxConcurrentStreams);
    } catch (error) {
      console.error('[Commands API] Stream error:', error);
      res.status(500).json({
        error: 'Failed to start stream',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/commands/batch - Process multiple commands
  // ============================================================================

  if (enableBatchProcessing) {
    router.post('/batch', async (req: Request, res: Response) => {
      try {
        const validation = BatchCommandSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Invalid request',
            details: validation.error.errors
          });
        }

        const {
          commands,
          sessionId = uuid(),
          userId = 'anonymous',
          parallel
        } = validation.data;

        const results = [];

        if (parallel) {
          // Process commands in parallel
          const promises = commands.map(cmd =>
            orchestrator.processCommand(cmd.content, sessionId, userId, {
              departmentHint: cmd.departmentHint
            }).catch(error => ({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              response: '',
              departmentId: 'unknown',
              departmentName: 'Unknown',
              taskId: uuid(),
              executionTimeMs: 0
            }))
          );
          const batchResults = await Promise.all(promises);
          results.push(...batchResults);
        } else {
          // Process commands sequentially
          for (const cmd of commands) {
            try {
              const result = await orchestrator.processCommand(
                cmd.content,
                sessionId,
                userId,
                { departmentHint: cmd.departmentHint }
              );
              results.push(result);
            } catch (error) {
              results.push({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                response: '',
                departmentId: 'unknown',
                departmentName: 'Unknown',
                taskId: uuid(),
                executionTimeMs: 0
              });
            }
          }
        }

        res.json({
          success: true,
          sessionId,
          results: results.map(r => ({
            success: r.success,
            taskId: r.taskId,
            response: r.response,
            department: {
              id: r.departmentId,
              name: r.departmentName
            },
            executionTimeMs: r.executionTimeMs,
            error: r.error
          }))
        });
      } catch (error) {
        console.error('[Commands API] Batch error:', error);
        res.status(500).json({
          error: 'Failed to process batch',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  // ============================================================================
  // DELETE /api/commands/:taskId - Cancel a running command
  // ============================================================================

  router.delete('/:taskId', (req: Request, res: Response) => {
    const { taskId } = req.params;

    const cancelled = orchestrator.cancelCommand(taskId);

    if (cancelled) {
      // Also close any active stream
      const stream = activeStreams.get(taskId);
      if (stream && !stream.writableEnded) {
        stream.write(`data: ${JSON.stringify({ type: 'cancelled' })}\n\n`);
        stream.end();
        activeStreams.delete(taskId);
      }

      res.json({ success: true, message: 'Command cancelled' });
    } else {
      res.status(404).json({
        error: 'Command not found or already completed'
      });
    }
  });

  // ============================================================================
  // GET /api/commands/:taskId - Get command/task status
  // ============================================================================

  router.get('/:taskId', (req: Request, res: Response) => {
    const { taskId } = req.params;
    const task = orchestrator.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      taskId: task.id,
      title: task.title,
      status: task.status,
      department: task.assignedAgent,
      priority: task.priority,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      output: task.output,
      error: task.error
    });
  });

  // ============================================================================
  // GET /api/commands - List recent commands
  // ============================================================================

  router.get('/', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const tasks = orchestrator.getRecentTasks(limit);

    res.json({
      tasks: tasks.map(t => ({
        taskId: t.id,
        title: t.title,
        status: t.status,
        department: t.assignedAgent,
        priority: t.priority,
        createdAt: t.createdAt,
        completedAt: t.completedAt
      }))
    });
  });

  // ============================================================================
  // GET /api/commands/departments - List available departments
  // ============================================================================

  router.get('/departments', (req: Request, res: Response) => {
    const departments = orchestrator.getDepartments();

    res.json({
      departments: departments.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        category: d.category,
        icon: d.icon,
        skills: d.skills
      }))
    });
  });

  // ============================================================================
  // GET /api/commands/departments/:id - Get specific department
  // ============================================================================

  router.get('/departments/:id', (req: Request, res: Response) => {
    const department = orchestrator.getDepartment(req.params.id);

    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({
      id: department.id,
      name: department.name,
      description: department.description,
      category: department.category,
      icon: department.icon,
      skills: department.skills
    });
  });

  return router;
}

// ============================================================================
// STREAMING HANDLER
// ============================================================================

async function handleStreamingCommand(
  req: Request,
  res: Response,
  orchestrator: OrchestratorService,
  params: {
    content: string;
    sessionId: string;
    userId: string;
    departmentHint?: string;
    metadata?: Record<string, unknown>;
  },
  activeStreams: Map<string, Response>,
  maxConcurrentStreams: number
): Promise<void> {
  // Check stream limit
  if (activeStreams.size >= maxConcurrentStreams) {
    res.status(429).json({
      error: 'Too many concurrent streams',
      message: `Maximum ${maxConcurrentStreams} concurrent streams allowed`
    });
    return;
  }

  const streamId = uuid();

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Track the stream
  activeStreams.set(streamId, res);

  // Handle client disconnect
  req.on('close', () => {
    activeStreams.delete(streamId);
  });

  // Send initial event
  res.write(`data: ${JSON.stringify({
    type: 'start',
    streamId,
    sessionId: params.sessionId,
    timestamp: new Date().toISOString()
  })}\n\n`);

  try {
    await orchestrator.processCommandStream(
      params.content,
      params.sessionId,
      params.userId,
      {
        onStart: (info) => {
          res.write(`data: ${JSON.stringify({
            type: 'department',
            taskId: info.taskId,
            department: {
              id: info.departmentId,
              name: info.departmentName
            }
          })}\n\n`);
        },
        onChunk: (chunk) => {
          res.write(`data: ${JSON.stringify({
            type: 'chunk',
            content: chunk
          })}\n\n`);
        },
        onComplete: (result) => {
          res.write(`data: ${JSON.stringify({
            type: 'complete',
            taskId: result.taskId,
            success: result.success,
            executionTimeMs: result.executionTimeMs,
            department: {
              id: result.departmentId,
              name: result.departmentName
            }
          })}\n\n`);

          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
        },
        onError: (error) => {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
          })}\n\n`);
          res.end();
        }
      },
      { departmentHint: params.departmentHint }
    );
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })}\n\n`);
    res.end();
  } finally {
    activeStreams.delete(streamId);
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default createCommandsRouter;
