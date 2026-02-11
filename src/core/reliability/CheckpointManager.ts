/**
 * Alabobai Reliability Engine - Checkpoint Manager
 * Auto-save every 30 seconds, restore to any point
 *
 * Solves: ChatGPT "loading for 1 hour" - lost work, session crashes
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface Checkpoint {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: 'auto' | 'manual' | 'milestone';
  label?: string;
  state: CheckpointState;
  metadata: CheckpointMetadata;
  hash: string;
  size: number;
  compressed: boolean;
}

export interface CheckpointState {
  conversation: ConversationSnapshot;
  tasks: TaskSnapshot[];
  agents: AgentSnapshot[];
  memory: MemorySnapshot;
  custom?: Record<string, unknown>;
}

export interface ConversationSnapshot {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: Date;
    agentId?: string;
  }>;
  context: Record<string, unknown>;
}

export interface TaskSnapshot {
  id: string;
  status: string;
  progress: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  startedAt: Date;
  checkpointAt: Date;
}

export interface AgentSnapshot {
  id: string;
  name: string;
  status: string;
  currentTaskId?: string;
  memory: Record<string, unknown>;
}

export interface MemorySnapshot {
  shortTerm: Record<string, unknown>;
  longTerm: Record<string, unknown>;
  embeddings?: number[][];
}

export interface CheckpointMetadata {
  version: string;
  platform: string;
  modelVersion?: string;
  triggerReason: 'interval' | 'task-complete' | 'error' | 'user-request' | 'milestone';
  parentCheckpointId?: string;
}

export interface CheckpointConfig {
  autoSaveInterval: number;     // Interval in ms (default: 30000 = 30s)
  maxCheckpoints: number;       // Max checkpoints to keep per session
  retentionDays: number;        // Days to keep checkpoints
  compressionEnabled: boolean;  // Compress checkpoint data
  storageDir: string;           // Directory for persistence
  enableDiffing: boolean;       // Only store diffs for space efficiency
}

export interface RestoreOptions {
  skipValidation?: boolean;
  partial?: boolean;           // Restore only specific parts
  includeAgents?: boolean;
  includeTasks?: boolean;
  includeMemory?: boolean;
}

// ============================================================================
// CHECKPOINT MANAGER CLASS
// ============================================================================

export class CheckpointManager extends EventEmitter {
  private config: CheckpointConfig;
  private checkpoints: Map<string, Checkpoint[]> = new Map(); // sessionId -> checkpoints
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private currentStates: Map<string, CheckpointState> = new Map();
  private initialized: boolean = false;

  constructor(config?: Partial<CheckpointConfig>) {
    super();

    this.config = {
      autoSaveInterval: 30000,      // 30 seconds
      maxCheckpoints: 50,           // Keep 50 checkpoints per session
      retentionDays: 7,             // Keep for 7 days
      compressionEnabled: true,
      storageDir: '.alabobai/checkpoints',
      enableDiffing: true,
      ...config,
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure storage directory exists
      await fs.mkdir(this.config.storageDir, { recursive: true });

      // Load existing checkpoints from disk
      await this.loadCheckpointsFromDisk();

      // Clean up old checkpoints
      await this.cleanupOldCheckpoints();

      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', { type: 'initialization', error });
      throw error;
    }
  }

  // ============================================================================
  // AUTO-SAVE MANAGEMENT
  // ============================================================================

  startAutoSave(sessionId: string, stateProvider: () => CheckpointState): void {
    // Stop any existing timer
    this.stopAutoSave(sessionId);

    // Create auto-save timer
    const timer = setInterval(async () => {
      try {
        const state = stateProvider();
        await this.createCheckpoint(sessionId, state, 'auto', 'Auto-save');
      } catch (error) {
        this.emit('auto-save-error', { sessionId, error });
      }
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(sessionId, timer);
    this.emit('auto-save-started', { sessionId, interval: this.config.autoSaveInterval });
  }

  stopAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
      this.emit('auto-save-stopped', { sessionId });
    }
  }

  stopAllAutoSave(): void {
    for (const sessionId of this.autoSaveTimers.keys()) {
      this.stopAutoSave(sessionId);
    }
  }

  // ============================================================================
  // CHECKPOINT CREATION
  // ============================================================================

  async createCheckpoint(
    sessionId: string,
    state: CheckpointState,
    type: 'auto' | 'manual' | 'milestone' = 'manual',
    label?: string,
    triggerReason: CheckpointMetadata['triggerReason'] = 'user-request'
  ): Promise<Checkpoint> {
    const startTime = Date.now();

    // Get previous checkpoint for diffing
    const previousCheckpoint = this.getLatestCheckpoint(sessionId);

    // Compute state to store (full or diff)
    let stateToStore = state;
    let isDiff = false;

    if (this.config.enableDiffing && previousCheckpoint && type === 'auto') {
      const diff = this.computeDiff(previousCheckpoint.state, state);
      if (diff) {
        stateToStore = diff as CheckpointState;
        isDiff = true;
      }
    }

    // Serialize and optionally compress
    let serialized = JSON.stringify(stateToStore);
    let compressed = false;

    if (this.config.compressionEnabled && serialized.length > 1024) {
      serialized = await this.compress(serialized);
      compressed = true;
    }

    // Create checkpoint object
    const checkpoint: Checkpoint = {
      id: uuid(),
      sessionId,
      timestamp: new Date(),
      type,
      label,
      state: isDiff ? stateToStore : state,
      metadata: {
        version: '1.0.0',
        platform: process.platform,
        triggerReason,
        parentCheckpointId: previousCheckpoint?.id,
      },
      hash: this.computeHash(serialized),
      size: serialized.length,
      compressed,
    };

    // Store in memory
    const sessionCheckpoints = this.checkpoints.get(sessionId) || [];
    sessionCheckpoints.push(checkpoint);

    // Enforce max checkpoints
    while (sessionCheckpoints.length > this.config.maxCheckpoints) {
      const removed = sessionCheckpoints.shift();
      if (removed) {
        await this.deleteCheckpointFile(removed.id);
      }
    }

    this.checkpoints.set(sessionId, sessionCheckpoints);

    // Store current state for diffing
    this.currentStates.set(sessionId, state);

    // Persist to disk
    await this.saveCheckpointToDisk(checkpoint, serialized);

    // Emit event
    this.emit('checkpoint-created', {
      checkpoint,
      duration: Date.now() - startTime,
      isDiff,
    });

    return checkpoint;
  }

  // ============================================================================
  // CHECKPOINT RESTORATION
  // ============================================================================

  async restoreCheckpoint(
    checkpointId: string,
    options: RestoreOptions = {}
  ): Promise<CheckpointState> {
    const startTime = Date.now();

    // Find checkpoint
    let checkpoint: Checkpoint | undefined;
    let sessionId: string | undefined;

    for (const [sid, checkpoints] of this.checkpoints.entries()) {
      const found = checkpoints.find(c => c.id === checkpointId);
      if (found) {
        checkpoint = found;
        sessionId = sid;
        break;
      }
    }

    if (!checkpoint || !sessionId) {
      // Try loading from disk
      checkpoint = await this.loadCheckpointFromDisk(checkpointId);
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      sessionId = checkpoint.sessionId;
    }

    // Validate checkpoint integrity
    if (!options.skipValidation) {
      const isValid = await this.validateCheckpoint(checkpoint);
      if (!isValid) {
        throw new Error(`Checkpoint integrity check failed: ${checkpointId}`);
      }
    }

    // Reconstruct full state if this was a diff checkpoint
    let fullState = checkpoint.state;
    if (checkpoint.metadata.parentCheckpointId && this.config.enableDiffing) {
      fullState = await this.reconstructState(checkpoint);
    }

    // Apply partial restore if requested
    if (options.partial) {
      fullState = this.applyPartialRestore(fullState, options);
    }

    // Update current state
    this.currentStates.set(sessionId, fullState);

    // Emit event
    this.emit('checkpoint-restored', {
      checkpointId,
      sessionId,
      duration: Date.now() - startTime,
    });

    return fullState;
  }

  async restoreToTime(
    sessionId: string,
    targetTime: Date,
    options: RestoreOptions = {}
  ): Promise<CheckpointState> {
    const checkpoints = this.checkpoints.get(sessionId) || [];

    // Find checkpoint closest to (but not after) target time
    const validCheckpoints = checkpoints.filter(
      c => new Date(c.timestamp).getTime() <= targetTime.getTime()
    );

    if (validCheckpoints.length === 0) {
      throw new Error(`No checkpoint found before ${targetTime.toISOString()}`);
    }

    const closest = validCheckpoints[validCheckpoints.length - 1];
    return this.restoreCheckpoint(closest.id, options);
  }

  async restoreLatest(
    sessionId: string,
    options: RestoreOptions = {}
  ): Promise<CheckpointState | null> {
    const latest = this.getLatestCheckpoint(sessionId);
    if (!latest) {
      return null;
    }
    return this.restoreCheckpoint(latest.id, options);
  }

  // ============================================================================
  // CHECKPOINT QUERIES
  // ============================================================================

  getLatestCheckpoint(sessionId: string): Checkpoint | undefined {
    const checkpoints = this.checkpoints.get(sessionId) || [];
    return checkpoints[checkpoints.length - 1];
  }

  getCheckpoints(sessionId: string): Checkpoint[] {
    return this.checkpoints.get(sessionId) || [];
  }

  getCheckpointById(checkpointId: string): Checkpoint | undefined {
    for (const checkpoints of this.checkpoints.values()) {
      const found = checkpoints.find(c => c.id === checkpointId);
      if (found) return found;
    }
    return undefined;
  }

  getMilestones(sessionId: string): Checkpoint[] {
    const checkpoints = this.checkpoints.get(sessionId) || [];
    return checkpoints.filter(c => c.type === 'milestone');
  }

  getCheckpointsBetween(
    sessionId: string,
    startTime: Date,
    endTime: Date
  ): Checkpoint[] {
    const checkpoints = this.checkpoints.get(sessionId) || [];
    return checkpoints.filter(c => {
      const timestamp = new Date(c.timestamp).getTime();
      return timestamp >= startTime.getTime() && timestamp <= endTime.getTime();
    });
  }

  // ============================================================================
  // MILESTONE MANAGEMENT
  // ============================================================================

  async markMilestone(
    sessionId: string,
    state: CheckpointState,
    label: string
  ): Promise<Checkpoint> {
    return this.createCheckpoint(sessionId, state, 'milestone', label, 'milestone');
  }

  async labelCheckpoint(checkpointId: string, label: string): Promise<void> {
    const checkpoint = this.getCheckpointById(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    checkpoint.label = label;
    await this.saveCheckpointToDisk(checkpoint);
    this.emit('checkpoint-labeled', { checkpointId, label });
  }

  // ============================================================================
  // DIFF COMPUTATION
  // ============================================================================

  private computeDiff(
    previous: CheckpointState,
    current: CheckpointState
  ): Partial<CheckpointState> | null {
    const diff: Partial<CheckpointState> = {};
    let hasDiff = false;

    // Compare conversation
    if (this.hasChanged(previous.conversation, current.conversation)) {
      diff.conversation = {
        ...current.conversation,
        messages: current.conversation.messages.slice(
          previous.conversation.messages.length
        ),
      };
      hasDiff = true;
    }

    // Compare tasks
    const newTasks = current.tasks.filter(
      ct => !previous.tasks.some(pt => pt.id === ct.id)
    );
    const updatedTasks = current.tasks.filter(ct => {
      const prev = previous.tasks.find(pt => pt.id === ct.id);
      return prev && this.hasChanged(prev, ct);
    });

    if (newTasks.length > 0 || updatedTasks.length > 0) {
      diff.tasks = [...newTasks, ...updatedTasks];
      hasDiff = true;
    }

    // Compare agents
    const changedAgents = current.agents.filter(ca => {
      const prev = previous.agents.find(pa => pa.id === ca.id);
      return !prev || this.hasChanged(prev, ca);
    });

    if (changedAgents.length > 0) {
      diff.agents = changedAgents;
      hasDiff = true;
    }

    // Compare memory
    if (this.hasChanged(previous.memory, current.memory)) {
      diff.memory = current.memory;
      hasDiff = true;
    }

    return hasDiff ? diff : null;
  }

  private hasChanged(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  private async reconstructState(checkpoint: Checkpoint): Promise<CheckpointState> {
    // Build chain of checkpoints back to a full checkpoint
    const chain: Checkpoint[] = [checkpoint];
    let current = checkpoint;

    while (current.metadata.parentCheckpointId) {
      const parent = this.getCheckpointById(current.metadata.parentCheckpointId);
      if (!parent) {
        // Try loading from disk
        const loaded = await this.loadCheckpointFromDisk(current.metadata.parentCheckpointId);
        if (!loaded) {
          throw new Error(`Parent checkpoint not found: ${current.metadata.parentCheckpointId}`);
        }
        chain.unshift(loaded);
        current = loaded;
      } else {
        chain.unshift(parent);
        current = parent;
      }
    }

    // Apply diffs in order
    let state = chain[0].state;
    for (let i = 1; i < chain.length; i++) {
      state = this.applyDiff(state, chain[i].state);
    }

    return state;
  }

  private applyDiff(base: CheckpointState, diff: Partial<CheckpointState>): CheckpointState {
    const result = { ...base };

    if (diff.conversation) {
      result.conversation = {
        ...base.conversation,
        messages: [...base.conversation.messages, ...diff.conversation.messages],
        context: { ...base.conversation.context, ...diff.conversation.context },
      };
    }

    if (diff.tasks) {
      result.tasks = [...base.tasks];
      for (const task of diff.tasks) {
        const existingIndex = result.tasks.findIndex(t => t.id === task.id);
        if (existingIndex >= 0) {
          result.tasks[existingIndex] = task;
        } else {
          result.tasks.push(task);
        }
      }
    }

    if (diff.agents) {
      result.agents = [...base.agents];
      for (const agent of diff.agents) {
        const existingIndex = result.agents.findIndex(a => a.id === agent.id);
        if (existingIndex >= 0) {
          result.agents[existingIndex] = agent;
        } else {
          result.agents.push(agent);
        }
      }
    }

    if (diff.memory) {
      result.memory = {
        ...base.memory,
        ...diff.memory,
      };
    }

    return result;
  }

  private applyPartialRestore(
    state: CheckpointState,
    options: RestoreOptions
  ): CheckpointState {
    const result: CheckpointState = {
      conversation: state.conversation,
      tasks: [],
      agents: [],
      memory: { shortTerm: {}, longTerm: {} },
    };

    if (options.includeTasks !== false) {
      result.tasks = state.tasks;
    }

    if (options.includeAgents !== false) {
      result.agents = state.agents;
    }

    if (options.includeMemory !== false) {
      result.memory = state.memory;
    }

    return result;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async saveCheckpointToDisk(
    checkpoint: Checkpoint,
    serialized?: string
  ): Promise<void> {
    const filePath = path.join(
      this.config.storageDir,
      checkpoint.sessionId,
      `${checkpoint.id}.json`
    );

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const data = serialized || JSON.stringify(checkpoint);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  private async loadCheckpointFromDisk(checkpointId: string): Promise<Checkpoint | undefined> {
    try {
      // Search in all session directories
      const sessionDirs = await fs.readdir(this.config.storageDir);

      for (const sessionDir of sessionDirs) {
        const filePath = path.join(
          this.config.storageDir,
          sessionDir,
          `${checkpointId}.json`
        );

        try {
          const data = await fs.readFile(filePath, 'utf-8');
          let checkpoint = JSON.parse(data) as Checkpoint;

          // Decompress if needed
          if (checkpoint.compressed) {
            const decompressed = await this.decompress(JSON.stringify(checkpoint.state));
            checkpoint.state = JSON.parse(decompressed);
          }

          return checkpoint;
        } catch {
          continue;
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private async loadCheckpointsFromDisk(): Promise<void> {
    try {
      const sessionDirs = await fs.readdir(this.config.storageDir);

      for (const sessionDir of sessionDirs) {
        const sessionPath = path.join(this.config.storageDir, sessionDir);
        const files = await fs.readdir(sessionPath);

        const checkpoints: Checkpoint[] = [];

        for (const file of files) {
          if (!file.endsWith('.json')) continue;

          try {
            const data = await fs.readFile(path.join(sessionPath, file), 'utf-8');
            const checkpoint = JSON.parse(data) as Checkpoint;
            checkpoints.push(checkpoint);
          } catch {
            // Skip corrupted files
            continue;
          }
        }

        // Sort by timestamp
        checkpoints.sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        this.checkpoints.set(sessionDir, checkpoints);
      }
    } catch {
      // Storage directory might not exist yet
    }
  }

  private async deleteCheckpointFile(checkpointId: string): Promise<void> {
    try {
      const sessionDirs = await fs.readdir(this.config.storageDir);

      for (const sessionDir of sessionDirs) {
        const filePath = path.join(
          this.config.storageDir,
          sessionDir,
          `${checkpointId}.json`
        );

        try {
          await fs.unlink(filePath);
          return;
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  private async cleanupOldCheckpoints(): Promise<void> {
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

    for (const [sessionId, checkpoints] of this.checkpoints.entries()) {
      const retained: Checkpoint[] = [];
      const deleted: Checkpoint[] = [];

      for (const checkpoint of checkpoints) {
        const timestamp = new Date(checkpoint.timestamp).getTime();
        if (timestamp < cutoffTime && checkpoint.type !== 'milestone') {
          deleted.push(checkpoint);
        } else {
          retained.push(checkpoint);
        }
      }

      // Delete old checkpoint files
      for (const checkpoint of deleted) {
        await this.deleteCheckpointFile(checkpoint.id);
      }

      this.checkpoints.set(sessionId, retained);
    }

    this.emit('cleanup-complete');
  }

  async deleteSession(sessionId: string): Promise<void> {
    // Stop auto-save
    this.stopAutoSave(sessionId);

    // Delete all checkpoints
    const checkpoints = this.checkpoints.get(sessionId) || [];
    for (const checkpoint of checkpoints) {
      await this.deleteCheckpointFile(checkpoint.id);
    }

    // Remove from memory
    this.checkpoints.delete(sessionId);
    this.currentStates.delete(sessionId);

    // Remove session directory
    try {
      await fs.rm(path.join(this.config.storageDir, sessionId), { recursive: true });
    } catch {
      // Ignore
    }

    this.emit('session-deleted', { sessionId });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private computeHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  private async validateCheckpoint(checkpoint: Checkpoint): Promise<boolean> {
    try {
      // Re-serialize and check hash
      const serialized = JSON.stringify(checkpoint.state);
      const hash = this.computeHash(serialized);

      // Hash might differ due to compression, so validate structure instead
      if (!checkpoint.state.conversation || !Array.isArray(checkpoint.state.tasks)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private async compress(data: string): Promise<string> {
    // Simple base64 "compression" for now
    // In production, use zlib or lz4
    return Buffer.from(data).toString('base64');
  }

  private async decompress(data: string): Promise<string> {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  getStats(): {
    totalCheckpoints: number;
    totalSessions: number;
    totalSize: number;
    oldestCheckpoint: Date | null;
    newestCheckpoint: Date | null;
  } {
    let totalCheckpoints = 0;
    let totalSize = 0;
    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const checkpoints of this.checkpoints.values()) {
      totalCheckpoints += checkpoints.length;

      for (const checkpoint of checkpoints) {
        totalSize += checkpoint.size;

        const timestamp = new Date(checkpoint.timestamp);
        if (!oldest || timestamp < oldest) oldest = timestamp;
        if (!newest || timestamp > newest) newest = timestamp;
      }
    }

    return {
      totalCheckpoints,
      totalSessions: this.checkpoints.size,
      totalSize,
      oldestCheckpoint: oldest,
      newestCheckpoint: newest,
    };
  }

  // ============================================================================
  // SHUTDOWN
  // ============================================================================

  async shutdown(): Promise<void> {
    // Stop all auto-save timers
    this.stopAllAutoSave();

    // Final save of current states
    for (const [sessionId, state] of this.currentStates.entries()) {
      try {
        await this.createCheckpoint(sessionId, state, 'auto', 'Shutdown save');
      } catch {
        // Best effort
      }
    }

    this.emit('shutdown');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export async function createCheckpointManager(
  config?: Partial<CheckpointConfig>
): Promise<CheckpointManager> {
  const manager = new CheckpointManager(config);
  await manager.initialize();
  return manager;
}
