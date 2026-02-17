/**
 * Alabobai Conversations API Routes
 * Store and retrieve conversation history for AI agent interactions
 * Supports session management, message history, and conversation analytics
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { OrchestratorService, getOrchestratorService } from '../../services/orchestrator.js';
import type { Message } from '../../core/types.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CreateSessionSchema = z.object({
  userId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  initialMessage: z.string().optional()
});

const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(50000),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const SearchMessagesSchema = z.object({
  query: z.string().min(1).max(500),
  sessionIds: z.array(z.string().uuid()).optional(),
  role: z.enum(['user', 'assistant', 'system']).optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0)
});

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationsRouterConfig {
  orchestrator?: OrchestratorService;
  maxMessagesPerSession?: number;
  sessionTTLMs?: number;
  enableSearch?: boolean;
  enableAnalytics?: boolean;
}

interface StoredSession {
  id: string;
  userId: string;
  messages: Message[];
  metadata: Record<string, unknown>;
  activeDepartment: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  messageCount: number;
}

interface ConversationAnalytics {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  departmentsUsed: string[];
  averageResponseTime: number;
  sessionDurationMs: number;
}

// ============================================================================
// IN-MEMORY STORE (Would be replaced with database in production)
// ============================================================================

class ConversationStore {
  private sessions: Map<string, StoredSession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private maxMessagesPerSession: number;
  private sessionTTLMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxMessagesPerSession: number = 1000, sessionTTLMs: number = 24 * 60 * 60 * 1000) {
    this.maxMessagesPerSession = maxMessagesPerSession;
    this.sessionTTLMs = sessionTTLMs;
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    // Clean up expired sessions every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    this.sessions.forEach((session, id) => {
      if (now - session.lastActivityAt.getTime() > this.sessionTTLMs) {
        expiredSessions.push(id);
      }
    });

    for (const id of expiredSessions) {
      this.deleteSession(id);
    }

    if (expiredSessions.length > 0) {
      console.log(`[ConversationStore] Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  createSession(userId: string, metadata: Record<string, unknown> = {}): StoredSession {
    const session: StoredSession = {
      id: uuid(),
      userId,
      messages: [],
      metadata,
      activeDepartment: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      messageCount: 0
    };

    this.sessions.set(session.id, session);

    // Track user's sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(session.id);

    return session;
  }

  getSession(sessionId: string): StoredSession | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): StoredSession[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is StoredSession => s !== undefined)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  addMessage(sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): Message | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const fullMessage: Message = {
      ...message,
      id: uuid(),
      timestamp: new Date()
    };

    session.messages.push(fullMessage);
    session.lastActivityAt = new Date();
    session.messageCount++;

    // Trim old messages if over limit
    if (session.messages.length > this.maxMessagesPerSession) {
      session.messages = session.messages.slice(-this.maxMessagesPerSession);
    }

    // Update active department if this is an assistant message
    if (message.role === 'assistant' && message.agentId) {
      session.activeDepartment = message.agentId;
    }

    return fullMessage;
  }

  getMessages(
    sessionId: string,
    options: { limit?: number; offset?: number; role?: string } = {}
  ): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    let messages = session.messages;

    if (options.role) {
      messages = messages.filter(m => m.role === options.role);
    }

    const offset = options.offset || 0;
    const limit = options.limit || messages.length;

    return messages.slice(offset, offset + limit);
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove from user's sessions
    this.userSessions.get(session.userId)?.delete(sessionId);

    // Remove session
    this.sessions.delete(sessionId);
    return true;
  }

  updateMetadata(sessionId: string, metadata: Record<string, unknown>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.metadata = { ...session.metadata, ...metadata };
    session.lastActivityAt = new Date();
    return true;
  }

  searchMessages(
    query: string,
    options: { sessionIds?: string[]; role?: string; limit?: number; offset?: number } = {}
  ): Array<{ sessionId: string; message: Message; relevance: number }> {
    const results: Array<{ sessionId: string; message: Message; relevance: number }> = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const sessionsToSearch = options.sessionIds
      ? options.sessionIds.map(id => this.sessions.get(id)).filter((s): s is StoredSession => s !== undefined)
      : Array.from(this.sessions.values());

    for (const session of sessionsToSearch) {
      for (const message of session.messages) {
        if (options.role && message.role !== options.role) continue;

        const contentLower = message.content.toLowerCase();

        // Simple relevance scoring
        let relevance = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            relevance += 1;
          }
        }

        if (relevance > 0) {
          results.push({
            sessionId: session.id,
            message,
            relevance: relevance / queryWords.length
          });
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    const offset = options.offset || 0;
    const limit = options.limit || 20;

    return results.slice(offset, offset + limit);
  }

  getAnalytics(sessionId: string): ConversationAnalytics | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const userMessages = session.messages.filter(m => m.role === 'user');
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');

    // Calculate average response time
    let totalResponseTime = 0;
    let responseCount = 0;

    for (let i = 1; i < session.messages.length; i++) {
      const prev = session.messages[i - 1];
      const curr = session.messages[i];

      if (prev.role === 'user' && curr.role === 'assistant') {
        totalResponseTime += curr.timestamp.getTime() - prev.timestamp.getTime();
        responseCount++;
      }
    }

    // Get unique departments used
    const departmentsUsed = Array.from(new Set(
      assistantMessages
        .map(m => m.agentId)
        .filter((id): id is string => id !== undefined)
    ));

    return {
      totalMessages: session.messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      departmentsUsed,
      averageResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0,
      sessionDurationMs: session.lastActivityAt.getTime() - session.createdAt.getTime()
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    this.userSessions.clear();
  }
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createConversationsRouter(config: ConversationsRouterConfig = {}): Router {
  const router = Router();

  const resolveRequesterUserId = (req: Request): string => {
    const userId = (req.headers['x-user-id'] as string | undefined) || 'anonymous';
    return userId.trim() || 'anonymous';
  };

  const isAdminRequest = (req: Request): boolean => {
    const key = req.headers['x-api-key'] as string | undefined;
    const configured = process.env.ADMIN_API_KEY;
    return !!configured && key === configured;
  };

  const sessionTokenSecret = process.env.SESSION_TOKEN_SECRET || process.env.ADMIN_API_KEY || 'dev-session-secret';

  const signSessionToken = (sessionId: string, userId: string): string => {
    return jwt.sign({ sessionId, userId, type: 'session' }, sessionTokenSecret, {
      expiresIn: '7d',
      issuer: 'alabobai',
      audience: 'conversations',
    });
  };

  const verifySessionToken = (token: string): { sessionId: string; userId: string } | null => {
    try {
      const payload = jwt.verify(token, sessionTokenSecret, {
        issuer: 'alabobai',
        audience: 'conversations',
      }) as { sessionId: string; userId: string; type?: string };
      if (payload.type !== 'session') return null;
      return { sessionId: payload.sessionId, userId: payload.userId };
    } catch {
      return null;
    }
  };

  const assertSessionAccess = (req: Request, session: StoredSession): { ok: boolean; status?: number; message?: string } => {
    if (isAdminRequest(req)) return { ok: true };

    const requesterUserId = resolveRequesterUserId(req);
    if (session.userId !== requesterUserId) {
      return { ok: false, status: 403, message: 'Forbidden' };
    }

    const token = (req.headers['x-session-token'] as string | undefined) || '';
    const verified = verifySessionToken(token);
    if (!verified || verified.sessionId !== session.id || verified.userId !== session.userId) {
      return { ok: false, status: 401, message: 'Invalid or missing session token' };
    }

    return { ok: true };
  };
  const orchestrator = config.orchestrator || getOrchestratorService();
  const store = new ConversationStore(
    config.maxMessagesPerSession || 1000,
    config.sessionTTLMs || 24 * 60 * 60 * 1000
  );
  const enableSearch = config.enableSearch ?? true;
  const enableAnalytics = config.enableAnalytics ?? true;

  // ============================================================================
  // POST /api/conversations - Create a new conversation session
  // ============================================================================

  router.post('/', (req: Request, res: Response) => {
    try {
      const validation = CreateSessionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors
        });
      }

      const { metadata = {}, initialMessage } = validation.data;
      const userId = resolveRequesterUserId(req);

      const session = store.createSession(userId, metadata);

      // Add initial system message
      store.addMessage(session.id, {
        role: 'system',
        content: 'Conversation started with Alabobai AI platform.'
      });

      // Add initial user message if provided
      if (initialMessage) {
        store.addMessage(session.id, {
          role: 'user',
          content: initialMessage
        });
      }

      const sessionToken = signSessionToken(session.id, session.userId);

      res.status(201).json({
        success: true,
        session: {
          id: session.id,
          userId: session.userId,
          createdAt: session.createdAt,
          metadata: session.metadata
        },
        sessionToken
      });
    } catch (error) {
      console.error('[Conversations API] Error creating session:', error);
      res.status(500).json({
        error: 'Failed to create conversation session',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/conversations - List user's conversations
  // ============================================================================

  router.get('/', (req: Request, res: Response) => {
    try {
      const userId = resolveRequesterUserId(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const sessions = store.getUserSessions(userId)
        .slice(offset, offset + limit);

      res.json({
        sessions: sessions.map(s => ({
          id: s.id,
          userId: s.userId,
          messageCount: s.messageCount,
          activeDepartment: s.activeDepartment,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
          metadata: s.metadata
        })),
        total: store.getUserSessions(userId).length,
        limit,
        offset
      });
    } catch (error) {
      console.error('[Conversations API] Error listing sessions:', error);
      res.status(500).json({
        error: 'Failed to list conversations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/conversations/:sessionId - Get a specific conversation
  // ============================================================================

  router.get('/:sessionId', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = store.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const access = assertSessionAccess(req, session);
      if (!access.ok) {
        return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
      }

      res.json({
        id: session.id,
        userId: session.userId,
        messageCount: session.messageCount,
        activeDepartment: session.activeDepartment,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        metadata: session.metadata
      });
    } catch (error) {
      console.error('[Conversations API] Error getting session:', error);
      res.status(500).json({
        error: 'Failed to get conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/conversations/:sessionId/messages - Get conversation messages
  // ============================================================================

  router.get('/:sessionId/messages', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const role = req.query.role as string | undefined;

      const session = store.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const access = assertSessionAccess(req, session);
      if (!access.ok) {
        return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
      }

      const messages = store.getMessages(sessionId, { limit, offset, role });

      res.json({
        sessionId,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          agentId: m.agentId,
          agentName: m.agentName,
          timestamp: m.timestamp
        })),
        total: session.messageCount,
        limit,
        offset
      });
    } catch (error) {
      console.error('[Conversations API] Error getting messages:', error);
      res.status(500).json({
        error: 'Failed to get messages',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/conversations/:sessionId/messages - Add a message to conversation
  // ============================================================================

  router.post('/:sessionId/messages', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const validation = AddMessageSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors
        });
      }

      const session = store.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const access = assertSessionAccess(req, session);
      if (!access.ok) {
        return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
      }

      const { role, content, agentId, agentName } = validation.data;
      const message = store.addMessage(sessionId, { role, content, agentId, agentName });

      if (!message) {
        return res.status(500).json({ error: 'Failed to add message' });
      }

      res.status(201).json({
        success: true,
        message: {
          id: message.id,
          role: message.role,
          content: message.content,
          agentId: message.agentId,
          agentName: message.agentName,
          timestamp: message.timestamp
        }
      });
    } catch (error) {
      console.error('[Conversations API] Error adding message:', error);
      res.status(500).json({
        error: 'Failed to add message',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // DELETE /api/conversations/:sessionId - Delete a conversation
  // ============================================================================

  router.delete('/:sessionId', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = store.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const access = assertSessionAccess(req, session);
      if (!access.ok) {
        return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
      }

      const deleted = store.deleteSession(sessionId);

      res.json({ success: true, message: 'Conversation deleted' });
    } catch (error) {
      console.error('[Conversations API] Error deleting session:', error);
      res.status(500).json({
        error: 'Failed to delete conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // PATCH /api/conversations/:sessionId - Update conversation metadata
  // ============================================================================

  router.patch('/:sessionId', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { metadata } = req.body;

      if (!metadata || typeof metadata !== 'object') {
        return res.status(400).json({ error: 'Invalid metadata' });
      }

      const session = store.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const access = assertSessionAccess(req, session);
      if (!access.ok) {
        return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
      }

      const updated = store.updateMetadata(sessionId, metadata);
      if (!updated) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const updatedSession = store.getSession(sessionId);
      res.json({
        success: true,
        metadata: updatedSession?.metadata
      });
    } catch (error) {
      console.error('[Conversations API] Error updating metadata:', error);
      res.status(500).json({
        error: 'Failed to update conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/conversations/search - Search across conversations
  // ============================================================================

  if (enableSearch) {
    router.post('/search', (req: Request, res: Response) => {
      try {
        const validation = SearchMessagesSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            error: 'Invalid request',
            details: validation.error.errors
          });
        }

        const { query, sessionIds, role, limit, offset } = validation.data;

        const requesterUserId = resolveRequesterUserId(req);
        const allowedSessionIds = isAdminRequest(req)
          ? sessionIds
          : (sessionIds || store.getUserSessions(requesterUserId).map(s => s.id));

        const results = store.searchMessages(query, { sessionIds: allowedSessionIds, role, limit, offset });

        res.json({
          query,
          results: results.map(r => ({
            sessionId: r.sessionId,
            message: {
              id: r.message.id,
              role: r.message.role,
              content: r.message.content.substring(0, 500),
              timestamp: r.message.timestamp
            },
            relevance: r.relevance
          })),
          count: results.length
        });
      } catch (error) {
        console.error('[Conversations API] Search error:', error);
        res.status(500).json({
          error: 'Search failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  // ============================================================================
  // GET /api/conversations/:sessionId/analytics - Get conversation analytics
  // ============================================================================

  if (enableAnalytics) {
    router.get('/:sessionId/analytics', (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const session = store.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
        const access = assertSessionAccess(req, session);
        if (!access.ok) {
          return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
        }

        const analytics = store.getAnalytics(sessionId);

        if (!analytics) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        res.json({
          sessionId,
          analytics
        });
      } catch (error) {
        console.error('[Conversations API] Analytics error:', error);
        res.status(500).json({
          error: 'Failed to get analytics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  // ============================================================================
  // SYNC WITH ORCHESTRATOR
  // ============================================================================

  // Sync a session from the orchestrator
  router.post('/:sessionId/sync', (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      // Get messages from orchestrator
      const orchestratorHistory = orchestrator.getSessionHistory(sessionId);

      if (!orchestratorHistory || orchestratorHistory.length === 0) {
        return res.status(404).json({ error: 'No orchestrator session found' });
      }

      // Get or create local session
      let session = store.getSession(sessionId);
      if (session) {
        const access = assertSessionAccess(req, session);
        if (!access.ok) {
          return res.status(access.status || 403).json({ error: access.message || 'Forbidden' });
        }
      }
      if (!session) {
        session = store.createSession(resolveRequesterUserId(req), { synced: true });
        // Note: We created a new session with a different ID, need to handle this
      }

      // Add messages from orchestrator that aren't already in our store
      const existingIds = new Set(store.getMessages(session.id).map(m => m.id));

      let addedCount = 0;
      for (const msg of orchestratorHistory) {
        if (!existingIds.has(msg.id)) {
          store.addMessage(session.id, {
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
            agentId: msg.agentId,
            agentName: msg.agentName
          });
          addedCount++;
        }
      }

      res.json({
        success: true,
        sessionId: session.id,
        messagesAdded: addedCount,
        totalMessages: store.getMessages(session.id).length
      });
    } catch (error) {
      console.error('[Conversations API] Sync error:', error);
      res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default createConversationsRouter;
