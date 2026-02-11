/**
 * Alabobai API Server
 * REST + WebSocket API for the unified platform
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getOrchestrator, Orchestrator } from '../core/orchestrator.js';
import { createLLMClient, LLMClient } from '../core/llm-client.js';
import { createMemoryStore, MemoryStore } from '../core/memory.js';
import { Message, ApprovalRequest, Agent, Task } from '../core/types.js';

// Import new modular routes
import { createCommandsRouter } from './routes/commands.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createHealthRouter } from './routes/health.js';
import { createDepartmentsRouter } from './routes/departments.js';
import { createAuthRouter } from './routes/auth.js';
import { createCompaniesRouter, attachCompaniesWebSocket } from './routes/companies.js';

// Import direct Claude chat API
import {
  handleChat,
  handleChatStream,
  getAvailableDepartments,
  isDepartmentValid
} from './chat.js';

// Import middleware
import {
  createRateLimiter,
  createRequestLogger,
  createErrorHandler,
  extractSession
} from './middleware/index.js';

// Import health monitoring
import { initializeHealthMonitor, HealthMonitor } from '../services/health.js';

// ============================================================================
// SERVER SETUP
// ============================================================================

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(createRequestLogger());

// Session extraction
app.use(extractSession());

// Rate limiting for API routes
app.use('/api', createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,    // 100 requests per minute
  message: 'Too many requests. Please try again later.'
}));

// Serve static files from public directory
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));

// Initialize core services
let llm: LLMClient;
let memory: MemoryStore;
let orchestrator: Orchestrator;
let healthMonitor: HealthMonitor;

// WebSocket connections by session
const wsConnections: Map<string, Set<WebSocket>> = new Map();

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize(): Promise<void> {
  console.log('[Server] Initializing Alabobai Unified Platform...');

  // Initialize LLM client
  llm = createLLMClient({
    provider: (process.env.LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai',
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
  });

  // Initialize memory store
  memory = createMemoryStore('sqlite', process.env.DATABASE_PATH || './data/alabobai.db');

  // Initialize orchestrator
  orchestrator = getOrchestrator(llm, memory);

  // Set up event listeners
  setupEventListeners();

  // Initialize health monitoring
  healthMonitor = await initializeHealthMonitor({
    checkIntervalMs: 30000,
    llmHealthCheck: true
  });

  // Register modular API routes
  app.use('/api/commands', createCommandsRouter());
  app.use('/api/conversations', createConversationsRouter());
  app.use('/api/health', createHealthRouter({ healthMonitor }));
  app.use('/api/departments', createDepartmentsRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api/companies', createCompaniesRouter());

  // Attach WebSocket handler for company creation progress
  attachCompaniesWebSocket(server, '/ws/companies');

  console.log('[Server] Initialization complete');
}

function setupEventListeners(): void {
  // Broadcast events to relevant WebSocket connections
  orchestrator.on('agent-started', (data) => {
    broadcast('agent-started', data);
  });

  orchestrator.on('agent-completed', (data) => {
    broadcast('agent-completed', data);
  });

  orchestrator.on('agent-error', (data) => {
    broadcast('agent-error', data);
  });

  orchestrator.on('approval-requested', (data) => {
    broadcast('approval-requested', data);
  });

  orchestrator.on('approval-resolved', (data) => {
    broadcast('approval-resolved', data);
  });

  orchestrator.on('task-started', (data) => {
    broadcast('task-started', data);
  });

  orchestrator.on('task-completed', (data) => {
    broadcast('task-completed', data);
  });
}

function broadcast(event: string, data: unknown, sessionId?: string): void {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

  if (sessionId && wsConnections.has(sessionId)) {
    // Send to specific session
    wsConnections.get(sessionId)?.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  } else {
    // Broadcast to all connections
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// ============================================================================
// REST API ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    platform: 'Alabobai Unified',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Get system state
app.get('/api/state', (req: Request, res: Response) => {
  res.json({
    agents: orchestrator.getAgents(),
    tasks: orchestrator.getTasks().slice(-20),
    pendingApprovals: orchestrator.getPendingApprovals(),
  });
});

// Get all agents
app.get('/api/agents', (req: Request, res: Response) => {
  res.json({ agents: orchestrator.getAgents() });
});

// Get specific agent
app.get('/api/agents/:id', (req: Request, res: Response) => {
  const agent = orchestrator.getAgents().find(a => a.id === req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json({ agent });
});

// ============================================================================
// CHAT API
// ============================================================================

// Send a message (main interaction endpoint)
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { sessionId = uuid(), userId = 'default', content, attachments } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    const response = await orchestrator.processMessage(sessionId, userId, content, attachments);

    res.json({
      sessionId,
      message: response,
    });
  } catch (error) {
    console.error('[API] Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Stream a message response
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  try {
    const { sessionId = uuid(), userId = 'default', content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Process and stream response
    const response = await orchestrator.processMessage(sessionId, userId, content);

    // Send the response as SSE
    res.write(`data: ${JSON.stringify({ type: 'message', content: response.content })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', messageId: response.id })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[API] Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to process message' })}\n\n`);
    res.end();
  }
});

// Get conversation history
app.get('/api/chat/:sessionId/history', (req: Request, res: Response) => {
  const context = orchestrator.getContext(req.params.sessionId);
  if (!context) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ messages: context.messages });
});

// ============================================================================
// DIRECT CLAUDE CHAT API (Department-Specific)
// ============================================================================

// Direct Claude chat endpoint (non-streaming)
app.post('/api/v2/chat', async (req: Request, res: Response) => {
  try {
    const { message, department, conversationHistory, maxTokens, temperature } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Validate department if provided
    if (department && !isDepartmentValid(department)) {
      return res.status(400).json({
        error: `Invalid department: ${department}`,
        availableDepartments: getAvailableDepartments()
      });
    }

    const result = await handleChat({
      message,
      department,
      conversationHistory,
      maxTokens,
      temperature
    });

    res.json(result);
  } catch (error) {
    console.error('[API] Direct chat error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to process chat request', details: errorMessage });
  }
});

// Direct Claude chat endpoint (streaming)
app.post('/api/v2/chat/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  try {
    const { message, department, conversationHistory, maxTokens, temperature } = req.body;

    if (!message || typeof message !== 'string') {
      res.write(`data: ${JSON.stringify({ error: 'message is required' })}\n\n`);
      res.end();
      return;
    }

    // Validate department if provided
    if (department && !isDepartmentValid(department)) {
      res.write(`data: ${JSON.stringify({
        error: `Invalid department: ${department}`,
        availableDepartments: getAvailableDepartments()
      })}\n\n`);
      res.end();
      return;
    }

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'start', department: department || 'executive' })}\n\n`);

    await handleChatStream(
      { message, department, conversationHistory, maxTokens, temperature },
      (text) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
      },
      (tokensUsed) => {
        res.write(`data: ${JSON.stringify({ type: 'done', tokensUsed })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[API] Stream error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
    res.end();
  }
});

// Get available departments for direct chat
app.get('/api/v2/chat/departments', (req: Request, res: Response) => {
  res.json({
    departments: getAvailableDepartments(),
    description: 'Available AI departments for specialized assistance'
  });
});

// ============================================================================
// APPROVAL API
// ============================================================================

// Get pending approvals
app.get('/api/approvals', (req: Request, res: Response) => {
  res.json({ approvals: orchestrator.getPendingApprovals() });
});

// Respond to approval
app.post('/api/approvals/:id', async (req: Request, res: Response) => {
  try {
    const { approved, reason } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved (boolean) is required' });
    }

    await orchestrator.processApproval(req.params.id, approved, reason);

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Approval error:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

// ============================================================================
// TASK API
// ============================================================================

// Get all tasks
app.get('/api/tasks', (req: Request, res: Response) => {
  const { status, limit = 50 } = req.query;
  let tasks = orchestrator.getTasks();

  if (status) {
    tasks = tasks.filter(t => t.status === status);
  }

  res.json({ tasks: tasks.slice(-Number(limit)) });
});

// Create a task directly
app.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const { title, description, priority = 'normal', category } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    // Create task via chat message
    const sessionId = uuid();
    const response = await orchestrator.processMessage(
      sessionId,
      'api',
      `[TASK] ${title}: ${description}`
    );

    res.json({ success: true, message: response });
  } catch (error) {
    console.error('[API] Task creation error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ============================================================================
// COMPUTER CONTROL API (placeholder for integration)
// ============================================================================

app.post('/api/computer/screenshot', async (req: Request, res: Response) => {
  // This will be implemented by the computer control integration
  res.json({
    status: 'pending',
    message: 'Computer control integration pending',
  });
});

app.post('/api/computer/action', async (req: Request, res: Response) => {
  const { action } = req.body;
  // This will be implemented by the computer control integration
  res.json({
    status: 'pending',
    message: 'Computer control integration pending',
    action,
  });
});

// ============================================================================
// BUILDER API (placeholder for integration)
// ============================================================================

app.post('/api/builder/generate', async (req: Request, res: Response) => {
  const { prompt, type = 'webapp' } = req.body;
  // This will be implemented by the Bolt.diy integration
  res.json({
    status: 'pending',
    message: 'Builder integration pending',
    prompt,
    type,
  });
});

// ============================================================================
// WEBSOCKET HANDLING
// ============================================================================

wss.on('connection', (ws: WebSocket, req) => {
  const sessionId = new URL(req.url || '', 'http://localhost').searchParams.get('sessionId') || uuid();

  console.log(`[WebSocket] Client connected: ${sessionId}`);

  // Track connection
  if (!wsConnections.has(sessionId)) {
    wsConnections.set(sessionId, new Set());
  }
  wsConnections.get(sessionId)!.add(ws);

  // Send welcome message
  ws.send(JSON.stringify({
    event: 'connected',
    data: {
      sessionId,
      agents: orchestrator.getAgents().map(a => ({ id: a.id, name: a.name, icon: a.icon, status: a.status })),
    },
  }));

  // Handle messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'chat':
          const response = await orchestrator.processMessage(
            sessionId,
            message.userId || 'default',
            message.content,
            message.attachments
          );
          ws.send(JSON.stringify({ event: 'chat-response', data: response }));
          break;

        case 'approve':
          await orchestrator.processApproval(message.approvalId, message.approved, message.reason);
          break;

        case 'ping':
          ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
          break;

        default:
          console.log(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Message handling error:', error);
      ws.send(JSON.stringify({ event: 'error', error: 'Failed to process message' }));
    }
  });

  // Handle close
  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected: ${sessionId}`);
    wsConnections.get(sessionId)?.delete(ws);
    if (wsConnections.get(sessionId)?.size === 0) {
      wsConnections.delete(sessionId);
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`[WebSocket] Error for ${sessionId}:`, error);
  });
});

// ============================================================================
// SPA FALLBACK - Serve index.html for all non-API routes
// ============================================================================

app.get('*', (req: Request, res: Response, next: NextFunction) => {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Use the error handler middleware
app.use(createErrorHandler());

// ============================================================================
// START SERVER
// ============================================================================

const PORT = parseInt(process.env.PORT || '8888', 10);

export async function startServer(): Promise<void> {
  await initialize();

  server.listen(PORT, () => {
    const agentCount = orchestrator.getAgents().length;
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║          ALABOBAI UNIFIED PLATFORM                            ║
║          Your AI Operating System                             ║
║                                                               ║
║          Web UI:      http://localhost:${PORT}                 ║
║          REST API:    http://localhost:${PORT}/api             ║
║          WebSocket:   ws://localhost:${PORT}                   ║
║                                                               ║
║          Agents Ready: ${agentCount}                                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
