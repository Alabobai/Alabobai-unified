/**
 * Alabobai Brain Memory System
 * Flat-file memory storage inspired by OpenClaw architecture
 *
 * Stores memory in ~/.alabobai/brain/ directory with:
 * - AGENTS.md - Operational guidelines
 * - MEMORY.md - Long-term persistent memory
 * - USER.md - User preferences and profile
 * - WORKSPACE.md - Current workspace/project context
 * - memory/ - Daily conversation logs
 * - knowledge/ - Indexed knowledge chunks
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';
import type {
  BrainMemoryConfig,
  MemoryFile,
  MemoryFileType,
  MemoryDirectory,
  ConversationEntry,
  DailyConversation,
  KnowledgeChunk,
  BrainEvent,
} from './types.js';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: BrainMemoryConfig = {
  rootDir: path.join(os.homedir(), '.alabobai', 'brain'),
  maxTokensPerFile: 8000,
  autoSave: true,
  autoSaveInterval: 30000,
  createDefaults: true,
};

// ============================================================================
// DEFAULT FILE CONTENTS
// ============================================================================

const DEFAULT_AGENTS_CONTENT = `# Alabobai Agent Guidelines

## Core Principles
- Always be helpful, accurate, and concise
- Respect user privacy and data ownership
- Ask for clarification when instructions are ambiguous
- Explain reasoning when making complex decisions

## Communication Style
- Use clear, professional language
- Adapt tone to match user preferences
- Provide structured responses when appropriate
- Include relevant context and sources

## Task Execution
- Break complex tasks into manageable steps
- Verify understanding before proceeding
- Report progress on long-running tasks
- Handle errors gracefully with clear explanations

## Safety Guidelines
- Never execute destructive operations without confirmation
- Protect sensitive information
- Flag potential security concerns
- Respect rate limits and system resources
`;

const DEFAULT_MEMORY_CONTENT = `# Alabobai Long-Term Memory

## Important Facts
<!-- Key facts and information learned over time -->

## Learned Patterns
<!-- Patterns and preferences discovered through interactions -->

## Notable Interactions
<!-- Significant conversations or events worth remembering -->

## Custom Instructions
<!-- User-provided instructions to remember -->
`;

const DEFAULT_USER_CONTENT = `# User Profile

## Preferences
- Communication Style: balanced
- Detail Level: moderate
- Confirmation Required: for destructive actions

## Technical Context
- Primary Languages:
- Frameworks:
- Tools:

## Project History
<!-- Previous projects and contexts -->

## Notes
<!-- Additional user-specific notes -->
`;

const DEFAULT_WORKSPACE_CONTENT = `# Current Workspace Context

## Active Project
- Name:
- Path:
- Type:

## Current Focus
<!-- What the user is currently working on -->

## Open Tasks
<!-- Active tasks and their status -->

## Recent Changes
<!-- Recent modifications and their context -->

## Notes
<!-- Workspace-specific notes -->
`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseMarkdownSection(content: string, sectionName: string): string {
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

function updateMarkdownSection(
  content: string,
  sectionName: string,
  newContent: string
): string {
  const regex = new RegExp(`(## ${sectionName}\\n)[\\s\\S]*?(?=\\n## |$)`, 'i');
  if (content.match(regex)) {
    return content.replace(regex, `$1${newContent}\n\n`);
  }
  return content + `\n## ${sectionName}\n${newContent}\n`;
}

// ============================================================================
// BRAIN MEMORY CLASS
// ============================================================================

export class BrainMemory extends EventEmitter {
  private config: BrainMemoryConfig;
  private memoryDir: MemoryDirectory;
  private fileCache: Map<MemoryFileType, MemoryFile> = new Map();
  private conversationCache: Map<string, DailyConversation> = new Map();
  private knowledgeIndex: Map<string, KnowledgeChunk> = new Map();
  private autoSaveTimer?: ReturnType<typeof setInterval>;
  private initialized: boolean = false;
  private dirty: Set<MemoryFileType> = new Set();

  constructor(config: Partial<BrainMemoryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryDir = this.buildMemoryDirectory();
  }

  private buildMemoryDirectory(): MemoryDirectory {
    const root = this.config.rootDir;
    return {
      root,
      files: {
        agents: path.join(root, 'AGENTS.md'),
        memory: path.join(root, 'MEMORY.md'),
        user: path.join(root, 'USER.md'),
        workspace: path.join(root, 'WORKSPACE.md'),
      },
      subdirs: {
        conversations: path.join(root, 'memory'),
        knowledge: path.join(root, 'knowledge'),
      },
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directory structure
    await this.ensureDirectoryStructure();

    // Create default files if needed
    if (this.config.createDefaults) {
      await this.createDefaultFiles();
    }

    // Load all memory files into cache
    await this.loadAllMemoryFiles();

    // Load today's conversation
    await this.loadTodayConversation();

    // Load knowledge index
    await this.loadKnowledgeIndex();

    // Start auto-save timer
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    this.initialized = true;
  }

  private async ensureDirectoryStructure(): Promise<void> {
    const dirs = [
      this.memoryDir.root,
      this.memoryDir.subdirs.conversations,
      this.memoryDir.subdirs.knowledge,
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async createDefaultFiles(): Promise<void> {
    const defaults: Record<MemoryFileType, { path: string; content: string }> = {
      AGENTS: { path: this.memoryDir.files.agents, content: DEFAULT_AGENTS_CONTENT },
      MEMORY: { path: this.memoryDir.files.memory, content: DEFAULT_MEMORY_CONTENT },
      USER: { path: this.memoryDir.files.user, content: DEFAULT_USER_CONTENT },
      WORKSPACE: { path: this.memoryDir.files.workspace, content: DEFAULT_WORKSPACE_CONTENT },
    };

    for (const [type, { path: filePath, content }] of Object.entries(defaults)) {
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }
  }

  private async loadAllMemoryFiles(): Promise<void> {
    const fileTypes: Array<{ type: MemoryFileType; path: string }> = [
      { type: 'AGENTS', path: this.memoryDir.files.agents },
      { type: 'MEMORY', path: this.memoryDir.files.memory },
      { type: 'USER', path: this.memoryDir.files.user },
      { type: 'WORKSPACE', path: this.memoryDir.files.workspace },
    ];

    for (const { type, path: filePath } of fileTypes) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const stat = await fs.stat(filePath);
        this.fileCache.set(type, {
          type,
          path: filePath,
          content,
          lastModified: stat.mtime,
          tokens: estimateTokens(content),
        });
        this.emit('event', { type: 'memory:loaded', file: type } as BrainEvent);
      } catch (error) {
        // File doesn't exist, create with default
        if (this.config.createDefaults) {
          await this.createDefaultFiles();
          await this.loadAllMemoryFiles();
          return;
        }
      }
    }
  }

  private async loadTodayConversation(): Promise<void> {
    const today = formatDate(new Date());
    const filePath = path.join(this.memoryDir.subdirs.conversations, `${today}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const conversation = JSON.parse(content) as DailyConversation;
      this.conversationCache.set(today, conversation);
    } catch {
      // No conversation for today yet
      this.conversationCache.set(today, {
        date: today,
        entries: [],
      });
    }
  }

  private async loadKnowledgeIndex(): Promise<void> {
    const indexPath = path.join(this.memoryDir.subdirs.knowledge, 'index.json');

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const chunks = JSON.parse(content) as KnowledgeChunk[];
      for (const chunk of chunks) {
        this.knowledgeIndex.set(chunk.id, chunk);
      }
    } catch {
      // No index yet
    }
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      await this.saveDirtyFiles();
    }, this.config.autoSaveInterval);
  }

  // ============================================================================
  // READ OPERATIONS
  // ============================================================================

  /**
   * Read a memory file by type
   */
  async readFile(type: MemoryFileType): Promise<string> {
    await this.ensureInitialized();

    const cached = this.fileCache.get(type);
    if (cached) {
      return cached.content;
    }

    // Reload from disk
    await this.loadAllMemoryFiles();
    return this.fileCache.get(type)?.content || '';
  }

  /**
   * Read a specific section from a memory file
   */
  async readSection(type: MemoryFileType, sectionName: string): Promise<string> {
    const content = await this.readFile(type);
    return parseMarkdownSection(content, sectionName);
  }

  /**
   * Get agent guidelines
   */
  async getAgentGuidelines(): Promise<string> {
    return this.readFile('AGENTS');
  }

  /**
   * Get long-term memory
   */
  async getLongTermMemory(): Promise<string> {
    return this.readFile('MEMORY');
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(): Promise<string> {
    return this.readFile('USER');
  }

  /**
   * Get workspace context
   */
  async getWorkspaceContext(): Promise<string> {
    return this.readFile('WORKSPACE');
  }

  /**
   * Get conversation history for a specific date
   */
  async getConversation(date?: string): Promise<DailyConversation | undefined> {
    await this.ensureInitialized();

    const targetDate = date || formatDate(new Date());

    // Check cache first
    if (this.conversationCache.has(targetDate)) {
      return this.conversationCache.get(targetDate);
    }

    // Load from disk
    const filePath = path.join(this.memoryDir.subdirs.conversations, `${targetDate}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const conversation = JSON.parse(content) as DailyConversation;
      this.conversationCache.set(targetDate, conversation);
      return conversation;
    } catch {
      return undefined;
    }
  }

  /**
   * Get recent conversation entries
   */
  async getRecentConversation(count: number = 20): Promise<ConversationEntry[]> {
    const today = await this.getConversation();
    if (!today) return [];
    return today.entries.slice(-count);
  }

  /**
   * Get knowledge chunk by ID
   */
  getKnowledgeChunk(id: string): KnowledgeChunk | undefined {
    return this.knowledgeIndex.get(id);
  }

  /**
   * Get all knowledge chunks
   */
  getAllKnowledge(): KnowledgeChunk[] {
    return Array.from(this.knowledgeIndex.values());
  }

  // ============================================================================
  // WRITE OPERATIONS
  // ============================================================================

  /**
   * Write content to a memory file
   */
  async writeFile(type: MemoryFileType, content: string): Promise<void> {
    await this.ensureInitialized();

    const tokens = estimateTokens(content);
    if (tokens > this.config.maxTokensPerFile) {
      throw new Error(
        `Content exceeds max tokens (${tokens} > ${this.config.maxTokensPerFile})`
      );
    }

    const filePath = this.getFilePath(type);
    await fs.writeFile(filePath, content, 'utf-8');

    this.fileCache.set(type, {
      type,
      path: filePath,
      content,
      lastModified: new Date(),
      tokens,
    });

    this.emit('event', { type: 'memory:saved', file: type } as BrainEvent);
  }

  /**
   * Update a specific section in a memory file
   */
  async updateSection(
    type: MemoryFileType,
    sectionName: string,
    content: string
  ): Promise<void> {
    const currentContent = await this.readFile(type);
    const newContent = updateMarkdownSection(currentContent, sectionName, content);
    await this.writeFile(type, newContent);
    this.emit('event', { type: 'memory:updated', file: type, section: sectionName } as BrainEvent);
  }

  /**
   * Append content to a section
   */
  async appendToSection(
    type: MemoryFileType,
    sectionName: string,
    content: string
  ): Promise<void> {
    const currentSection = await this.readSection(type, sectionName);
    const newSection = currentSection ? `${currentSection}\n${content}` : content;
    await this.updateSection(type, sectionName, newSection);
  }

  /**
   * Add a conversation entry
   */
  async addConversationEntry(entry: Omit<ConversationEntry, 'id'>): Promise<ConversationEntry> {
    await this.ensureInitialized();

    const today = formatDate(new Date());
    let conversation = this.conversationCache.get(today);

    if (!conversation) {
      conversation = { date: today, entries: [] };
      this.conversationCache.set(today, conversation);
    }

    const fullEntry: ConversationEntry = {
      ...entry,
      id: uuid(),
      tokens: entry.tokens || estimateTokens(entry.content),
    };

    conversation.entries.push(fullEntry);
    this.dirty.add('MEMORY'); // Mark for save

    // Save conversation file
    const filePath = path.join(this.memoryDir.subdirs.conversations, `${today}.json`);
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8');

    this.emit('event', { type: 'conversation:added', entry: fullEntry } as BrainEvent);
    return fullEntry;
  }

  /**
   * Index a knowledge chunk
   */
  async indexKnowledge(chunk: Omit<KnowledgeChunk, 'id'>): Promise<KnowledgeChunk> {
    await this.ensureInitialized();

    const fullChunk: KnowledgeChunk = {
      ...chunk,
      id: uuid(),
      metadata: {
        ...chunk.metadata,
        createdAt: new Date(),
        accessCount: 0,
      },
    };

    this.knowledgeIndex.set(fullChunk.id, fullChunk);

    // Save chunk to file
    const chunkPath = path.join(this.memoryDir.subdirs.knowledge, `${fullChunk.id}.json`);
    await fs.writeFile(chunkPath, JSON.stringify(fullChunk, null, 2), 'utf-8');

    // Update index
    await this.saveKnowledgeIndex();

    this.emit('event', { type: 'knowledge:indexed', chunk: fullChunk } as BrainEvent);
    return fullChunk;
  }

  /**
   * Update a knowledge chunk
   */
  async updateKnowledge(id: string, updates: Partial<KnowledgeChunk>): Promise<void> {
    const chunk = this.knowledgeIndex.get(id);
    if (!chunk) {
      throw new Error(`Knowledge chunk not found: ${id}`);
    }

    const updated = { ...chunk, ...updates };
    this.knowledgeIndex.set(id, updated);

    const chunkPath = path.join(this.memoryDir.subdirs.knowledge, `${id}.json`);
    await fs.writeFile(chunkPath, JSON.stringify(updated, null, 2), 'utf-8');
    await this.saveKnowledgeIndex();
  }

  /**
   * Delete a knowledge chunk
   */
  async deleteKnowledge(id: string): Promise<void> {
    this.knowledgeIndex.delete(id);

    const chunkPath = path.join(this.memoryDir.subdirs.knowledge, `${id}.json`);
    try {
      await fs.unlink(chunkPath);
    } catch {
      // File may not exist
    }

    await this.saveKnowledgeIndex();
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  /**
   * Search across all memory files
   */
  async searchMemory(query: string): Promise<Array<{
    type: MemoryFileType;
    matches: string[];
    score: number;
  }>> {
    await this.ensureInitialized();

    const results: Array<{
      type: MemoryFileType;
      matches: string[];
      score: number;
    }> = [];

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    for (const [type, file] of this.fileCache) {
      const contentLower = file.content.toLowerCase();
      const matches: string[] = [];
      let score = 0;

      // Find matching lines
      const lines = file.content.split('\n');
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        let lineMatches = false;

        for (const term of queryTerms) {
          if (lineLower.includes(term)) {
            lineMatches = true;
            score += 1;
          }
        }

        if (lineMatches) {
          matches.push(line.trim());
        }
      }

      if (matches.length > 0) {
        results.push({ type, matches: matches.slice(0, 5), score });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Search conversations
   */
  async searchConversations(
    query: string,
    options: { startDate?: Date; endDate?: Date; limit?: number } = {}
  ): Promise<ConversationEntry[]> {
    await this.ensureInitialized();

    const results: ConversationEntry[] = [];
    const queryLower = query.toLowerCase();
    const limit = options.limit || 20;

    // Get list of conversation files
    const files = await fs.readdir(this.memoryDir.subdirs.conversations);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

    for (const file of jsonFiles) {
      const dateStr = file.replace('.json', '');
      const fileDate = new Date(dateStr);

      // Apply date filters
      if (options.startDate && fileDate < options.startDate) continue;
      if (options.endDate && fileDate > options.endDate) continue;

      // Check cache first
      let conversation = this.conversationCache.get(dateStr);
      if (!conversation) {
        const filePath = path.join(this.memoryDir.subdirs.conversations, file);
        const content = await fs.readFile(filePath, 'utf-8');
        conversation = JSON.parse(content) as DailyConversation;
        this.conversationCache.set(dateStr, conversation);
      }

      for (const entry of conversation.entries) {
        if (entry.content.toLowerCase().includes(queryLower)) {
          results.push(entry);
          if (results.length >= limit) return results;
        }
      }
    }

    return results;
  }

  /**
   * Search knowledge chunks
   */
  searchKnowledge(
    query: string,
    options: { tags?: string[]; types?: string[]; limit?: number } = {}
  ): KnowledgeChunk[] {
    const results: Array<{ chunk: KnowledgeChunk; score: number }> = [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);
    const limit = options.limit || 10;

    for (const chunk of this.knowledgeIndex.values()) {
      // Apply filters
      if (options.tags?.length && !options.tags.some(t => chunk.metadata.tags.includes(t))) {
        continue;
      }
      if (options.types?.length && !options.types.includes(chunk.metadata.type)) {
        continue;
      }

      // Calculate score
      let score = 0;
      const contentLower = chunk.content.toLowerCase();

      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          score += 1;
        }
        if (chunk.metadata.tags.some(t => t.toLowerCase().includes(term))) {
          score += 0.5;
        }
      }

      if (score > 0) {
        results.push({ chunk, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.chunk);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private getFilePath(type: MemoryFileType): string {
    const paths: Record<MemoryFileType, string> = {
      AGENTS: this.memoryDir.files.agents,
      MEMORY: this.memoryDir.files.memory,
      USER: this.memoryDir.files.user,
      WORKSPACE: this.memoryDir.files.workspace,
    };
    return paths[type];
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async saveDirtyFiles(): Promise<void> {
    for (const type of this.dirty) {
      const file = this.fileCache.get(type);
      if (file) {
        await fs.writeFile(file.path, file.content, 'utf-8');
      }
    }
    this.dirty.clear();
  }

  private async saveKnowledgeIndex(): Promise<void> {
    const indexPath = path.join(this.memoryDir.subdirs.knowledge, 'index.json');
    const chunks = Array.from(this.knowledgeIndex.values());
    await fs.writeFile(indexPath, JSON.stringify(chunks, null, 2), 'utf-8');
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    memoryFiles: number;
    totalTokens: number;
    conversationDays: number;
    knowledgeChunks: number;
  } {
    let totalTokens = 0;
    for (const file of this.fileCache.values()) {
      totalTokens += file.tokens;
    }

    return {
      memoryFiles: this.fileCache.size,
      totalTokens,
      conversationDays: this.conversationCache.size,
      knowledgeChunks: this.knowledgeIndex.size,
    };
  }

  /**
   * Get memory directory info
   */
  getDirectory(): MemoryDirectory {
    return this.memoryDir;
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    await this.saveDirtyFiles();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let defaultBrainMemory: BrainMemory | null = null;

export function createBrainMemory(config?: Partial<BrainMemoryConfig>): BrainMemory {
  return new BrainMemory(config);
}

export async function getDefaultBrainMemory(): Promise<BrainMemory> {
  if (!defaultBrainMemory) {
    defaultBrainMemory = new BrainMemory();
    await defaultBrainMemory.initialize();
  }
  return defaultBrainMemory;
}

export default BrainMemory;
