/**
 * Memory API Routes
 *
 * REST endpoints for the persistent memory system:
 * - POST /api/memory - Store a memory
 * - GET /api/memory/search - Semantic search
 * - GET /api/memory/user/:userId - Get user's memories
 * - DELETE /api/memory/:id - Delete memory
 * - POST /api/memory/consolidate - Trigger consolidation
 * - GET /api/memory/stats - Memory statistics
 */

import { Router, Request, Response } from 'express';
import {
  getMemoryService,
  MemoryService,
  MemoryType,
  MemorySearchOptions,
  PrivacySetting,
} from '../../services/memoryService.js';
import {
  getMemoryExtractor,
  MemoryExtractor,
  ConversationMessage,
} from '../../services/memoryExtractor.js';

// ============================================================================
// Types
// ============================================================================

interface StoreMemoryBody {
  userId: string;
  type: MemoryType;
  content: string;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  privacy?: PrivacySetting;
  expiresAt?: number;
}

interface SearchMemoryQuery {
  query: string;
  userId?: string;
  types?: string;
  minImportance?: string;
  minRelevance?: string;
  limit?: string;
  includeTags?: string;
  excludeTags?: string;
  privacy?: string;
}

interface ExtractMemoryBody {
  userId: string;
  messages: ConversationMessage[];
  options?: {
    extractFacts?: boolean;
    extractPreferences?: boolean;
    extractSummary?: boolean;
    extractPatterns?: boolean;
    store?: boolean;
  };
}

interface UpdateMemoryBody {
  content?: string;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  privacy?: PrivacySetting;
  expiresAt?: number;
}

interface UpdateSettingsBody {
  memoryEnabled?: boolean;
  autoExtract?: boolean;
  retentionDays?: number;
  maxMemories?: number;
}

// ============================================================================
// Router Factory
// ============================================================================

export function createMemoryRouter(options?: {
  memoryService?: MemoryService;
  memoryExtractor?: MemoryExtractor;
}): Router {
  const router = Router();
  const memoryService = options?.memoryService || getMemoryService();
  const memoryExtractor = options?.memoryExtractor || getMemoryExtractor(memoryService);

  // ==========================================================================
  // Store Memory
  // ==========================================================================

  /**
   * POST /api/memory
   * Store a new memory
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as StoreMemoryBody;

      // Validate required fields
      if (!body.userId || typeof body.userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
      }

      if (!body.type || typeof body.type !== 'string') {
        return res.status(400).json({ error: 'type is required' });
      }

      if (!body.content || typeof body.content !== 'string') {
        return res.status(400).json({ error: 'content is required' });
      }

      const validTypes: MemoryType[] = [
        'user_preference', 'conversation_summary', 'fact', 'project_context',
        'decision', 'code_pattern', 'error_resolution', 'knowledge'
      ];

      if (!validTypes.includes(body.type)) {
        return res.status(400).json({
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      // Check if memory is enabled for user
      const settings = memoryService.getSettings(body.userId);
      if (!settings.memoryEnabled) {
        return res.status(403).json({ error: 'Memory is disabled for this user' });
      }

      const memory = await memoryService.store({
        userId: body.userId,
        type: body.type,
        content: body.content,
        importance: body.importance,
        tags: body.tags,
        metadata: body.metadata,
        privacy: body.privacy,
        expiresAt: body.expiresAt,
      });

      res.status(201).json({ memory });
    } catch (error) {
      console.error('[Memory API] Store error:', error);
      res.status(500).json({
        error: 'Failed to store memory',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Search Memories
  // ==========================================================================

  /**
   * GET /api/memory/search
   * Semantic search over memories
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = req.query as SearchMemoryQuery;

      if (!query.query || typeof query.query !== 'string') {
        return res.status(400).json({ error: 'query parameter is required' });
      }

      const searchOptions: MemorySearchOptions = {
        query: query.query,
        userId: query.userId,
        minImportance: query.minImportance ? parseInt(query.minImportance, 10) : undefined,
        minRelevance: query.minRelevance ? parseFloat(query.minRelevance) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      };

      if (query.types) {
        searchOptions.types = query.types.split(',') as MemoryType[];
      }

      if (query.includeTags) {
        searchOptions.includeTags = query.includeTags.split(',');
      }

      if (query.excludeTags) {
        searchOptions.excludeTags = query.excludeTags.split(',');
      }

      if (query.privacy) {
        searchOptions.privacy = query.privacy.split(',') as PrivacySetting[];
      }

      const results = await memoryService.search(searchOptions);

      res.json({
        results,
        count: results.length,
        query: query.query,
      });
    } catch (error) {
      console.error('[Memory API] Search error:', error);
      res.status(500).json({
        error: 'Search failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Get User Memories
  // ==========================================================================

  /**
   * GET /api/memory/user/:userId
   * Get all memories for a user
   */
  router.get('/user/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { limit, offset, types, sortBy, sortOrder } = req.query;

      const memories = await memoryService.getUserMemories(userId, {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        types: types ? (types as string).split(',') as MemoryType[] : undefined,
        sortBy: sortBy as 'created' | 'accessed' | 'importance' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      res.json({
        memories,
        count: memories.length,
        userId,
      });
    } catch (error) {
      console.error('[Memory API] Get user memories error:', error);
      res.status(500).json({
        error: 'Failed to get memories',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Get Single Memory
  // ==========================================================================

  /**
   * GET /api/memory/:id
   * Get a single memory by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const memory = await memoryService.get(id);

      if (!memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      res.json({ memory });
    } catch (error) {
      console.error('[Memory API] Get memory error:', error);
      res.status(500).json({
        error: 'Failed to get memory',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Update Memory
  // ==========================================================================

  /**
   * PATCH /api/memory/:id
   * Update a memory
   */
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateMemoryBody;

      const memory = await memoryService.update(id, body);

      if (!memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      res.json({ memory });
    } catch (error) {
      console.error('[Memory API] Update error:', error);
      res.status(500).json({
        error: 'Failed to update memory',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Delete Memory
  // ==========================================================================

  /**
   * DELETE /api/memory/:id
   * Delete a memory
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await memoryService.delete(id);

      if (!deleted) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      res.json({ success: true, deletedId: id });
    } catch (error) {
      console.error('[Memory API] Delete error:', error);
      res.status(500).json({
        error: 'Failed to delete memory',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Bulk Delete
  // ==========================================================================

  /**
   * POST /api/memory/bulk-delete
   * Delete multiple memories
   */
  router.post('/bulk-delete', async (req: Request, res: Response) => {
    try {
      const { userId, memoryIds } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const deleted = await memoryService.bulkDelete(userId, memoryIds);

      res.json({ success: true, deletedCount: deleted });
    } catch (error) {
      console.error('[Memory API] Bulk delete error:', error);
      res.status(500).json({
        error: 'Failed to delete memories',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Consolidate Memories
  // ==========================================================================

  /**
   * POST /api/memory/consolidate
   * Trigger memory consolidation
   */
  router.post('/consolidate', async (req: Request, res: Response) => {
    try {
      const result = await memoryService.consolidate();

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error('[Memory API] Consolidate error:', error);
      res.status(500).json({
        error: 'Consolidation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Memory Statistics
  // ==========================================================================

  /**
   * GET /api/memory/stats
   * Get memory statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const { userId } = req.query;
      const stats = await memoryService.getStats(userId as string | undefined);

      res.json({ stats });
    } catch (error) {
      console.error('[Memory API] Stats error:', error);
      res.status(500).json({
        error: 'Failed to get statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Extract Memories
  // ==========================================================================

  /**
   * POST /api/memory/extract
   * Extract memories from conversation
   */
  router.post('/extract', async (req: Request, res: Response) => {
    try {
      const body = req.body as ExtractMemoryBody;

      if (!body.userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      if (!body.messages || !Array.isArray(body.messages)) {
        return res.status(400).json({ error: 'messages array is required' });
      }

      // Check if memory is enabled
      const settings = memoryService.getSettings(body.userId);
      if (!settings.memoryEnabled || !settings.autoExtract) {
        return res.json({
          extraction: { facts: [], preferences: [], shouldRemember: false },
          stored: [],
          message: 'Memory extraction is disabled for this user',
        });
      }

      const extraction = await memoryExtractor.extractFromConversation(
        body.userId,
        body.messages,
        body.options
      );

      let stored: any[] = [];
      if (body.options?.store !== false && extraction.shouldRemember) {
        stored = await memoryExtractor.storeExtraction(body.userId, extraction);
      }

      res.json({
        extraction,
        stored: stored.map(m => ({ id: m.id, type: m.type })),
      });
    } catch (error) {
      console.error('[Memory API] Extract error:', error);
      res.status(500).json({
        error: 'Extraction failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Get Context
  // ==========================================================================

  /**
   * POST /api/memory/context
   * Get relevant context for a query
   */
  router.post('/context', async (req: Request, res: Response) => {
    try {
      const { userId, query, limit } = req.body;

      if (!userId || !query) {
        return res.status(400).json({ error: 'userId and query are required' });
      }

      const context = await memoryExtractor.getRelevantContext(
        userId,
        query,
        limit
      );

      res.json({
        memories: context.memories,
        contextPrompt: context.contextPrompt,
        count: context.memories.length,
      });
    } catch (error) {
      console.error('[Memory API] Context error:', error);
      res.status(500).json({
        error: 'Failed to get context',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // User Settings
  // ==========================================================================

  /**
   * GET /api/memory/settings/:userId
   * Get user memory settings
   */
  router.get('/settings/:userId', (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const settings = memoryService.getSettings(userId);

      res.json({ settings });
    } catch (error) {
      console.error('[Memory API] Get settings error:', error);
      res.status(500).json({
        error: 'Failed to get settings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * PUT /api/memory/settings/:userId
   * Update user memory settings
   */
  router.put('/settings/:userId', (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const body = req.body as UpdateSettingsBody;

      memoryService.updateSettings(userId, body);

      const settings = memoryService.getSettings(userId);
      res.json({ success: true, settings });
    } catch (error) {
      console.error('[Memory API] Update settings error:', error);
      res.status(500).json({
        error: 'Failed to update settings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Export/Import
  // ==========================================================================

  /**
   * GET /api/memory/export/:userId
   * Export user memories
   */
  router.get('/export/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const data = await memoryService.exportMemories(userId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="memories-${userId}-${Date.now()}.json"`);
      res.json(data);
    } catch (error) {
      console.error('[Memory API] Export error:', error);
      res.status(500).json({
        error: 'Export failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/memory/import/:userId
   * Import memories from export
   */
  router.post('/import/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const data = req.body;

      if (!data.memories || !Array.isArray(data.memories)) {
        return res.status(400).json({ error: 'Invalid import data format' });
      }

      const result = await memoryService.importMemories(userId, data);

      res.json({
        success: true,
        imported: result.imported,
        errors: result.errors,
      });
    } catch (error) {
      console.error('[Memory API] Import error:', error);
      res.status(500).json({
        error: 'Import failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==========================================================================
  // Remember/Forget Commands
  // ==========================================================================

  /**
   * POST /api/memory/remember
   * Store a memory from explicit "remember" command
   */
  router.post('/remember', async (req: Request, res: Response) => {
    try {
      const { userId, content, type = 'fact' } = req.body;

      if (!userId || !content) {
        return res.status(400).json({ error: 'userId and content are required' });
      }

      const memory = await memoryService.store({
        userId,
        type: type as MemoryType,
        content,
        importance: 90, // High importance for explicit memories
        tags: ['explicit', 'user-requested'],
        metadata: { source: 'remember_command' },
      });

      res.status(201).json({
        success: true,
        memory,
        message: `I'll remember that.`,
      });
    } catch (error) {
      console.error('[Memory API] Remember error:', error);
      res.status(500).json({
        error: 'Failed to remember',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/memory/forget
   * Search and delete memories matching content
   */
  router.post('/forget', async (req: Request, res: Response) => {
    try {
      const { userId, query } = req.body;

      if (!userId || !query) {
        return res.status(400).json({ error: 'userId and query are required' });
      }

      // Search for matching memories
      const results = await memoryService.search({
        query,
        userId,
        limit: 10,
        minRelevance: 0.5,
      });

      // Delete matching memories
      let deletedCount = 0;
      for (const result of results) {
        const deleted = await memoryService.delete(result.memory.id);
        if (deleted) deletedCount++;
      }

      res.json({
        success: true,
        deletedCount,
        message: deletedCount > 0
          ? `I've forgotten ${deletedCount} related ${deletedCount === 1 ? 'memory' : 'memories'}.`
          : `I couldn't find any memories matching that.`,
      });
    } catch (error) {
      console.error('[Memory API] Forget error:', error);
      res.status(500).json({
        error: 'Failed to forget',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

export default createMemoryRouter;
