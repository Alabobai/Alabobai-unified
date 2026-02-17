/**
 * Alabobai API Server
 * REST + WebSocket API for the unified platform
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getOrchestrator, Orchestrator } from '../core/orchestrator.js';
import { createLLMClient, LLMClient } from '../core/llm-client.js';
import { createMemoryStore, MemoryStore } from '../core/memory.js';
import { Message, ApprovalRequest, Agent, Task } from '../core/types.js';
import { validateEnv } from '../config/env.js';

// Import new modular routes
import { createCommandsRouter } from './routes/commands.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createHealthRouter } from './routes/health.js';
import { createDepartmentsRouter } from './routes/departments.js';
import { createAuthRouter } from './routes/auth.js';
import { createCompaniesRouter, attachCompaniesWebSocket } from './routes/companies.js';
import { createLocalAIRouter } from './routes/local-ai.js';
import { createProxyRouter } from './routes/proxy.js';
import { createFilesRouter } from './routes/files.js';
import { createSandboxRouter } from './routes/sandbox.js';
import { createMemoryRouter } from './routes/memory.js';

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
  createAuthMiddleware,
  createRoleAuthMiddleware,
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
const env = validateEnv();
const LOCAL_IMAGE_URL = process.env.IMAGE_INFERENCE_URL || 'http://127.0.0.1:7860';
const LOCAL_VIDEO_URL = process.env.VIDEO_INFERENCE_URL || 'http://127.0.0.1:8000';

// Middleware
const corsOptions = env.corsOrigins.length
  ? {
      origin: env.corsOrigins,
      credentials: true,
    }
  : {
      origin: true,
      credentials: true,
    };

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self';");
  next();
});

app.use(cors(corsOptions));
app.use(compression());
app.use((req: Request, res: Response, next: NextFunction) => {
  // Fail slow requests fast to protect capacity under load.
  res.setTimeout(30_000, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway timeout', message: 'Request timed out' });
    }
  });
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Request logging
app.use(createRequestLogger());

// Metrics collection for SLO dashboards
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const latency = Date.now() - start;
    const isError = res.statusCode >= 500;
    healthMonitor?.recordRequest(latency, req.path, isError);
  });
  next();
});

// Session extraction
app.use(extractSession());

// Role-based API key auth (viewer < operator < admin)
const roleKeys = {
  admin: env.ADMIN_API_KEY,
  operator: env.OPERATOR_API_KEY,
  viewer: env.VIEWER_API_KEY,
};
const viewerAuth = createRoleAuthMiddleware('viewer', roleKeys);
const operatorAuth = createRoleAuthMiddleware('operator', roleKeys);
const adminAuth = createRoleAuthMiddleware('admin', roleKeys);

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

  // Initialize LLM client (supports Groq, Anthropic, OpenAI)
  const provider = (process.env.LLM_PROVIDER || 'groq') as 'anthropic' | 'openai' | 'groq';
  let apiKey = '';
  let model = '';

  switch (provider) {
    case 'groq':
      apiKey = process.env.GROQ_API_KEY || '';
      model = process.env.GROQ_MODEL || process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
      break;
    case 'anthropic':
      apiKey = process.env.ANTHROPIC_API_KEY || '';
      model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
      break;
    case 'openai':
      apiKey = process.env.OPENAI_API_KEY || '';
      model = process.env.LLM_MODEL || 'gpt-4o';
      break;
  }

  llm = createLLMClient({ provider, apiKey, model });

  // Initialize memory store
  memory = createMemoryStore('sqlite', process.env.DATABASE_PATH || './data/alabobai.db');

  // Initialize orchestrator
  orchestrator = getOrchestrator(llm, memory);

  // Set up event listeners
  setupEventListeners();

  // Initialize health monitoring
  // If no provider key is configured, skip active LLM health probing so readiness
  // reflects actual serving capability of the local platform instead of external key state.
  healthMonitor = await initializeHealthMonitor({
    checkIntervalMs: 30000,
    llmHealthCheck: !!apiKey
  });

  // Register modular API routes
  app.use('/api/commands', operatorAuth, createCommandsRouter());
  app.use('/api/conversations', viewerAuth, createConversationsRouter());
  app.use('/api/health', createHealthRouter({ healthMonitor }));
  app.use('/api/departments', createDepartmentsRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api/companies', operatorAuth, createCompaniesRouter());
  app.use('/api/local-ai', createLocalAIRouter());
  app.use('/api/proxy', createProxyRouter());
  app.use('/api/files', createFilesRouter());
  app.use('/api/sandbox', createSandboxRouter());
  app.use('/api/memory', createMemoryRouter());

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

function enhanceImagePrompt(prompt: string, style?: string): string {
  switch (style) {
    case 'logo':
      return `professional minimalist logo, vector style, clean lines, branding, ${prompt}`;
    case 'hero':
      return `cinematic hero image, high detail, modern commercial style, ${prompt}`;
    case 'icon':
      return `flat icon design, simple composition, transparent background, ${prompt}`;
    default:
      return prompt;
  }
}

app.post('/api/generate-image', async (req: Request, res: Response) => {
  try {
    const { prompt, width = 512, height = 512, style = 'logo' } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const enhancedPrompt = enhanceImagePrompt(prompt, style);
    const inferenceRes = await fetch(`${LOCAL_IMAGE_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: enhancedPrompt,
        width,
        height,
        steps: 24,
        cfg_scale: 7,
      }),
    });

    if (!inferenceRes.ok) {
      return res.status(502).json({
        error: 'Local image inference backend failed',
        details: `HTTP ${inferenceRes.status}`,
      });
    }

    const data = await inferenceRes.json() as { images?: string[] };
    const image = data.images?.[0];

    if (!image) {
      return res.status(502).json({ error: 'Local image inference backend returned no image' });
    }

    res.json({
      url: `data:image/png;base64,${image}`,
      prompt: enhancedPrompt,
      width,
      height,
      backend: 'local-media-inference',
      fallback: false,
    });
  } catch (error) {
    console.error('[API] generate-image error:', error);
    res.status(500).json({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/generate-video', async (req: Request, res: Response) => {
  try {
    const { prompt, durationSeconds = 4, fps = 12, width = 512, height = 512 } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const inferenceRes = await fetch(`${LOCAL_VIDEO_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        durationSeconds,
        fps,
        width,
        height,
      }),
    });

    if (!inferenceRes.ok) {
      return res.status(502).json({
        error: 'Local video inference backend failed',
        details: `HTTP ${inferenceRes.status}`,
      });
    }

    const data = await inferenceRes.json() as { url?: string };
    if (!data.url) {
      return res.status(502).json({ error: 'Local video inference backend returned no URL' });
    }

    res.json({
      url: data.url,
      prompt,
      durationSeconds,
      fps,
      width,
      height,
      backend: 'local-media-inference',
      fallback: false,
    });
  } catch (error) {
    console.error('[API] generate-video error:', error);
    res.status(500).json({
      error: 'Failed to generate video',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// COMPANY WIZARD API (Simple endpoint for CompanyWizard component)
// ============================================================================

app.post('/api/company', async (req: Request, res: Response) => {
  try {
    const { action, companyType, description, companyName, industry, founderEmail, logo } = req.body;

    if (action === 'generate-name') {
      // Generate company name suggestions using LLM
      const prompt = `Generate 5 creative, modern, and memorable company names for a ${companyType || 'technology'} business with this description: "${description}".

      Requirements:
      - Names should be short (1-2 words), catchy, and easy to remember
      - Mix of real words, made-up words, and compound words
      - Professional and brandable
      - Domain-friendly (easy to spell)

      Return ONLY a JSON array of 5 names, nothing else. Example: ["TechFlow", "Nexarise", "BluePeak", "Innovio", "CloudNine"]`;

      try {
        const response = await llm.chat([{ role: 'user', content: prompt }]);
        const content = response.content || '';

        // Try to parse JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const names = JSON.parse(jsonMatch[0]);
          return res.json({ success: true, names });
        }

        // Fallback: extract words that look like company names
        const words = content.split(/[,\n"'\[\]]+/).filter((w: string) => w.trim().length > 2 && w.trim().length < 20);
        if (words.length >= 3) {
          return res.json({ success: true, names: words.slice(0, 5) });
        }

        throw new Error('Could not parse names from response');
      } catch (llmError) {
        console.error('[Company API] LLM error:', llmError);
        // Fallback names
        const words = (description || '').split(' ').filter((w: string) => w.length > 3);
        const base = words[0] || 'Nova';
        return res.json({
          success: true,
          names: [`${base}Hub`, `${base}io`, `${base}Labs`, 'VenturePeak', 'NexaFlow']
        });
      }
    }

    if (action === 'create') {
      // Create company - simulate company creation process
      if (!companyName) {
        return res.status(400).json({ success: false, error: 'Company name is required' });
      }

      // Generate company ID
      const companyId = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);

      // Simulate company creation with step-by-step progress
      const result = {
        success: true,
        companyId,
        company: {
          id: companyId,
          name: companyName,
          type: companyType || 'saas',
          description: description || '',
          logo: logo || null,
          domain: `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
          createdAt: new Date().toISOString()
        },
        setup: {
          legal: { status: 'complete', message: 'Company structure created' },
          finance: { status: 'complete', message: 'Financial accounts set up' },
          engineering: { status: 'complete', message: 'Product foundation built' },
          design: { status: 'complete', message: 'Brand identity created' },
          marketing: { status: 'complete', message: 'Launch content ready' },
          support: { status: 'complete', message: 'Help center configured' },
          security: { status: 'complete', message: 'Security audit passed' },
          launch: { status: 'complete', message: 'Company is live!' }
        },
        urls: {
          dashboard: `/company/${companyId}/dashboard`,
          website: `https://${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.alabobai.com`,
          admin: `/company/${companyId}/admin`
        }
      };

      return res.json(result);
    }

    return res.status(400).json({ success: false, error: 'Invalid action. Use "generate-name" or "create"' });

  } catch (error) {
    console.error('[Company API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process company request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get system state
app.get('/api/state', viewerAuth, (req: Request, res: Response) => {
  res.json({
    agents: orchestrator.getAgents(),
    tasks: orchestrator.getTasks().slice(-20),
    pendingApprovals: orchestrator.getPendingApprovals(),
  });
});

// Get all agents
app.get('/api/agents', viewerAuth, (req: Request, res: Response) => {
  res.json({ agents: orchestrator.getAgents() });
});

// Get specific agent
app.get('/api/agents/:id', viewerAuth, (req: Request, res: Response) => {
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
app.get('/api/chat/:sessionId/history', viewerAuth, (req: Request, res: Response) => {
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
app.get('/api/approvals', adminAuth, (req: Request, res: Response) => {
  res.json({ approvals: orchestrator.getPendingApprovals() });
});

// Respond to approval
app.post('/api/approvals/:id', adminAuth, async (req: Request, res: Response) => {
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
app.get('/api/tasks', operatorAuth, (req: Request, res: Response) => {
  const { status, limit = 50 } = req.query;
  let tasks = orchestrator.getTasks();

  if (status) {
    tasks = tasks.filter(t => t.status === status);
  }

  res.json({ tasks: tasks.slice(-Number(limit)) });
});

// Create a task directly
app.post('/api/tasks', adminAuth, async (req: Request, res: Response) => {
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
