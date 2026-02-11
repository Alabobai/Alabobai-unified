/**
 * Alabobai File Memory
 * Persistent file-based memory for each task with unlimited storage
 * Uses JSONL format for efficient append-only operations
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { v4 as uuid } from 'uuid';
import {
  EventStream,
  WorkingMemoryEvent,
  EventInput,
  EventQuery,
  EventStreamStats,
  createEventStream,
} from './EventStream.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for file memory
 */
export interface FileMemoryConfig {
  /** Base directory for storing memory files */
  baseDir: string;

  /** Whether to auto-flush after each write */
  autoFlush?: boolean;

  /** Flush interval in milliseconds (if autoFlush is false) */
  flushIntervalMs?: number;

  /** Maximum file size before rotation (in bytes) */
  maxFileSizeBytes?: number;

  /** Whether to compress old files */
  compressOldFiles?: boolean;
}

/**
 * Memory file metadata stored in the index
 */
export interface MemoryFileInfo {
  /** Unique file ID */
  id: string;

  /** Task ID this file belongs to */
  taskId: string;

  /** File path relative to base directory */
  filePath: string;

  /** Number of events in this file */
  eventCount: number;

  /** Total token count */
  totalTokens: number;

  /** File size in bytes */
  sizeBytes: number;

  /** Timestamp of first event */
  startTimestamp: string;

  /** Timestamp of last event */
  endTimestamp: string;

  /** Whether file is complete (no more appends) */
  complete: boolean;

  /** Creation timestamp */
  createdAt: string;

  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Result of a load operation
 */
export interface LoadResult {
  success: boolean;
  eventsLoaded: number;
  errors: string[];
}

/**
 * Flush result
 */
export interface FlushResult {
  success: boolean;
  eventsWritten: number;
  bytesWritten: number;
}

// ============================================================================
// FILE MEMORY CLASS
// ============================================================================

/**
 * Persistent file-based memory for agent working memory
 * Stores events in JSONL format for durability and efficient access
 */
export class FileMemory {
  private config: Required<FileMemoryConfig>;
  private stream: EventStream;
  private taskId: string;
  private filePath: string;
  private pendingWrites: WorkingMemoryEvent[] = [];
  private writeStream: fs.WriteStream | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private fileInfo: MemoryFileInfo;

  constructor(taskId: string, config: Partial<FileMemoryConfig> = {}) {
    this.taskId = taskId;
    this.config = {
      baseDir: config.baseDir ?? './data/memory',
      autoFlush: config.autoFlush ?? true,
      flushIntervalMs: config.flushIntervalMs ?? 1000,
      maxFileSizeBytes: config.maxFileSizeBytes ?? 100 * 1024 * 1024, // 100MB
      compressOldFiles: config.compressOldFiles ?? false,
    };

    this.stream = createEventStream();
    this.filePath = this.getFilePath(taskId);

    const now = new Date().toISOString();
    this.fileInfo = {
      id: uuid(),
      taskId,
      filePath: this.filePath,
      eventCount: 0,
      totalTokens: 0,
      sizeBytes: 0,
      startTimestamp: now,
      endTimestamp: now,
      complete: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Initialize the file memory (create directories, open write stream)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure base directory exists
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });

    // Check if file exists and load existing events
    if (fs.existsSync(this.filePath)) {
      await this.loadFromFile();
    }

    // Open write stream in append mode
    this.writeStream = fs.createWriteStream(this.filePath, {
      flags: 'a',
      encoding: 'utf-8',
    });

    // Set up periodic flush if not auto-flushing
    if (!this.config.autoFlush && this.config.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => {
          console.error('FileMemory flush error:', err);
        });
      }, this.config.flushIntervalMs);
    }

    this.isInitialized = true;
  }

  /**
   * Get the file path for a task
   */
  private getFilePath(taskId: string): string {
    // Sanitize taskId for file system
    const sanitizedId = taskId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const datePrefix = new Date().toISOString().slice(0, 10);
    return path.join(this.config.baseDir, datePrefix, `${sanitizedId}.jsonl`);
  }

  /**
   * Load events from the file into the stream
   */
  private async loadFromFile(): Promise<LoadResult> {
    const result: LoadResult = {
      success: true,
      eventsLoaded: 0,
      errors: [],
    };

    if (!fs.existsSync(this.filePath)) {
      return result;
    }

    return new Promise((resolve) => {
      const fileStream = fs.createReadStream(this.filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let lineNumber = 0;

      rl.on('line', (line) => {
        lineNumber++;
        if (!line.trim()) return;

        try {
          const event = JSON.parse(line) as WorkingMemoryEvent;
          this.stream.fromArray([event]);
          result.eventsLoaded++;
        } catch (err) {
          result.errors.push(`Line ${lineNumber}: ${err instanceof Error ? err.message : 'Parse error'}`);
        }
      });

      rl.on('close', () => {
        if (result.errors.length > 0) {
          result.success = false;
        }
        this.updateFileInfo();
        resolve(result);
      });

      rl.on('error', (err) => {
        result.success = false;
        result.errors.push(`Read error: ${err.message}`);
        resolve(result);
      });
    });
  }

  /**
   * Append a new event to memory
   */
  async append(input: EventInput): Promise<WorkingMemoryEvent> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Ensure taskId is set in metadata
    const eventInput: EventInput = {
      ...input,
      metadata: {
        ...input.metadata,
        taskId: this.taskId,
      },
    };

    const event = this.stream.append(eventInput);
    this.pendingWrites.push(event);

    if (this.config.autoFlush) {
      await this.flush();
    }

    return event;
  }

  /**
   * Flush pending writes to disk
   */
  async flush(): Promise<FlushResult> {
    const result: FlushResult = {
      success: true,
      eventsWritten: 0,
      bytesWritten: 0,
    };

    if (this.pendingWrites.length === 0) {
      return result;
    }

    if (!this.writeStream) {
      await this.initialize();
    }

    return new Promise((resolve) => {
      const lines = this.pendingWrites.map(e => JSON.stringify(e) + '\n');
      const data = lines.join('');
      result.bytesWritten = Buffer.byteLength(data, 'utf-8');
      result.eventsWritten = this.pendingWrites.length;

      this.writeStream!.write(data, (err) => {
        if (err) {
          result.success = false;
          console.error('FileMemory write error:', err);
        } else {
          this.pendingWrites = [];
          this.updateFileInfo();
        }
        resolve(result);
      });
    });
  }

  /**
   * Update file info after writes
   */
  private updateFileInfo(): void {
    const stats = this.stream.getStats();
    const now = new Date().toISOString();

    this.fileInfo.eventCount = stats.totalEvents;
    this.fileInfo.totalTokens = stats.totalTokens;
    this.fileInfo.startTimestamp = stats.oldestTimestamp ?? now;
    this.fileInfo.endTimestamp = stats.newestTimestamp ?? now;
    this.fileInfo.updatedAt = now;

    // Get actual file size
    try {
      if (fs.existsSync(this.filePath)) {
        const fileStat = fs.statSync(this.filePath);
        this.fileInfo.sizeBytes = fileStat.size;
      }
    } catch {
      // Ignore stat errors
    }
  }

  /**
   * Get recent events from memory
   */
  getRecent(n: number): WorkingMemoryEvent[] {
    return this.stream.getRecent(n);
  }

  /**
   * Query events from memory
   */
  query(options: EventQuery = {}): WorkingMemoryEvent[] {
    return this.stream.query({
      ...options,
      taskId: this.taskId,
    });
  }

  /**
   * Search events by content
   */
  search(query: string, options: Partial<EventQuery> = {}): WorkingMemoryEvent[] {
    return this.stream.search(query, {
      ...options,
      taskId: this.taskId,
    });
  }

  /**
   * Get the underlying event stream
   */
  getStream(): EventStream {
    return this.stream;
  }

  /**
   * Get memory statistics
   */
  getStats(): EventStreamStats {
    return this.stream.getStats();
  }

  /**
   * Get file info
   */
  getFileInfo(): MemoryFileInfo {
    return { ...this.fileInfo };
  }

  /**
   * Get the task ID
   */
  getTaskId(): string {
    return this.taskId;
  }

  /**
   * Get total token count
   */
  getTotalTokens(): number {
    return this.stream.getTotalTokens();
  }

  /**
   * Get number of events
   */
  size(): number {
    return this.stream.size();
  }

  /**
   * Check if memory is empty
   */
  isEmpty(): boolean {
    return this.stream.isEmpty();
  }

  /**
   * Get all events as an array
   */
  toArray(): WorkingMemoryEvent[] {
    return this.stream.toArray();
  }

  /**
   * Mark the memory file as complete (no more appends expected)
   */
  async complete(): Promise<void> {
    await this.flush();
    this.fileInfo.complete = true;
    this.fileInfo.updatedAt = new Date().toISOString();

    // Write metadata file
    const metadataPath = this.filePath.replace('.jsonl', '.meta.json');
    await fs.promises.writeFile(
      metadataPath,
      JSON.stringify(this.fileInfo, null, 2),
      'utf-8'
    );
  }

  /**
   * Close the file memory (flush and clean up resources)
   */
  async close(): Promise<void> {
    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any pending writes
    await this.flush();

    // Close write stream
    if (this.writeStream) {
      return new Promise((resolve, reject) => {
        this.writeStream!.end((err: Error | null) => {
          if (err) reject(err);
          else {
            this.writeStream = null;
            this.isInitialized = false;
            resolve();
          }
        });
      });
    }
  }

  /**
   * Delete the memory file and all associated data
   */
  async delete(): Promise<void> {
    await this.close();

    // Delete files
    const filesToDelete = [
      this.filePath,
      this.filePath.replace('.jsonl', '.meta.json'),
    ];

    for (const file of filesToDelete) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file);
        }
      } catch {
        // Ignore deletion errors
      }
    }

    // Clear in-memory data
    this.stream.clear();
  }

  /**
   * Export memory to a different file format
   */
  async exportTo(outputPath: string, format: 'jsonl' | 'json' = 'jsonl'): Promise<void> {
    await this.flush();

    const events = this.stream.toArray();

    if (format === 'json') {
      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(events, null, 2),
        'utf-8'
      );
    } else {
      const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.promises.writeFile(outputPath, lines, 'utf-8');
    }
  }
}

// ============================================================================
// FILE MEMORY MANAGER
// ============================================================================

/**
 * Manager for multiple file memories across tasks
 */
export class FileMemoryManager {
  private config: Required<FileMemoryConfig>;
  private memories: Map<string, FileMemory> = new Map();

  constructor(config: Partial<FileMemoryConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? './data/memory',
      autoFlush: config.autoFlush ?? true,
      flushIntervalMs: config.flushIntervalMs ?? 1000,
      maxFileSizeBytes: config.maxFileSizeBytes ?? 100 * 1024 * 1024,
      compressOldFiles: config.compressOldFiles ?? false,
    };
  }

  /**
   * Get or create a file memory for a task
   */
  async getMemory(taskId: string): Promise<FileMemory> {
    if (this.memories.has(taskId)) {
      return this.memories.get(taskId)!;
    }

    const memory = new FileMemory(taskId, this.config);
    await memory.initialize();
    this.memories.set(taskId, memory);

    return memory;
  }

  /**
   * Check if a memory exists for a task
   */
  hasMemory(taskId: string): boolean {
    return this.memories.has(taskId);
  }

  /**
   * List all task IDs with active memories
   */
  listTasks(): string[] {
    return Array.from(this.memories.keys());
  }

  /**
   * Get stats for all memories
   */
  getAllStats(): Map<string, EventStreamStats> {
    const stats = new Map<string, EventStreamStats>();
    for (const [taskId, memory] of this.memories) {
      stats.set(taskId, memory.getStats());
    }
    return stats;
  }

  /**
   * Close a specific memory
   */
  async closeMemory(taskId: string): Promise<void> {
    const memory = this.memories.get(taskId);
    if (memory) {
      await memory.close();
      this.memories.delete(taskId);
    }
  }

  /**
   * Close all memories
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.memories.values()).map(m => m.close());
    await Promise.all(closePromises);
    this.memories.clear();
  }

  /**
   * Flush all memories
   */
  async flushAll(): Promise<void> {
    const flushPromises = Array.from(this.memories.values()).map(m => m.flush());
    await Promise.all(flushPromises);
  }

  /**
   * Delete a memory and its files
   */
  async deleteMemory(taskId: string): Promise<void> {
    const memory = this.memories.get(taskId);
    if (memory) {
      await memory.delete();
      this.memories.delete(taskId);
    }
  }

  /**
   * List all memory files in the base directory
   */
  async listMemoryFiles(): Promise<MemoryFileInfo[]> {
    const files: MemoryFileInfo[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      if (!fs.existsSync(dir)) return;

      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith('.meta.json')) {
          try {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            files.push(JSON.parse(content));
          } catch {
            // Ignore parse errors
          }
        }
      }
    };

    await walkDir(this.config.baseDir);
    return files;
  }

  /**
   * Load a memory from a specific file
   */
  async loadFromFile(filePath: string): Promise<FileMemory | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    // Extract task ID from file name
    const fileName = path.basename(filePath, '.jsonl');
    const memory = new FileMemory(fileName, {
      ...this.config,
      baseDir: path.dirname(filePath),
    });

    await memory.initialize();
    this.memories.set(fileName, memory);

    return memory;
  }

  /**
   * Clean up old memory files (based on age)
   */
  async cleanup(maxAgeDays: number = 30): Promise<number> {
    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const files = await this.listMemoryFiles();

    for (const file of files) {
      const fileDate = new Date(file.updatedAt);
      if (fileDate < cutoffDate && file.complete) {
        try {
          await fs.promises.unlink(path.join(this.config.baseDir, file.filePath));
          await fs.promises.unlink(
            path.join(this.config.baseDir, file.filePath.replace('.jsonl', '.meta.json'))
          );
          deletedCount++;
        } catch {
          // Ignore deletion errors
        }
      }
    }

    return deletedCount;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new file memory for a task
 */
export async function createFileMemory(
  taskId: string,
  config?: Partial<FileMemoryConfig>
): Promise<FileMemory> {
  const memory = new FileMemory(taskId, config);
  await memory.initialize();
  return memory;
}

/**
 * Create a file memory manager
 */
export function createFileMemoryManager(
  config?: Partial<FileMemoryConfig>
): FileMemoryManager {
  return new FileMemoryManager(config);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse a JSONL file and return events
 */
export async function parseJSONLFile(filePath: string): Promise<WorkingMemoryEvent[]> {
  const events: WorkingMemoryEvent[] = [];

  if (!fs.existsSync(filePath)) {
    return events;
  }

  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip invalid lines
    }
  }

  return events;
}

/**
 * Merge multiple memory files into one
 */
export async function mergeMemoryFiles(
  inputPaths: string[],
  outputPath: string
): Promise<number> {
  const allEvents: WorkingMemoryEvent[] = [];

  for (const inputPath of inputPaths) {
    const events = await parseJSONLFile(inputPath);
    allEvents.push(...events);
  }

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Deduplicate by ID
  const seenIds = new Set<string>();
  const uniqueEvents = allEvents.filter(e => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  // Write to output
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const lines = uniqueEvents.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.promises.writeFile(outputPath, lines, 'utf-8');

  return uniqueEvents.length;
}
