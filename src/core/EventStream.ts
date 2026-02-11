/**
 * Alabobai Event Stream
 * Chronological log of all agent events for working memory
 * Provides an immutable, append-only event log with efficient querying
 */

import { v4 as uuid } from 'uuid';

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * All supported event types in the agent working memory
 */
export type EventType =
  | 'action'        // Agent performs an action
  | 'observation'   // Agent observes something from the environment
  | 'thought'       // Agent's internal reasoning
  | 'plan'          // Agent creates or updates a plan
  | 'error'         // Error occurred during execution
  | 'tool_call'     // Agent invokes a tool
  | 'tool_result';  // Result returned from a tool

/**
 * Priority levels for events (affects context selection)
 */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Core event structure for all working memory events
 */
export interface WorkingMemoryEvent {
  /** Unique identifier for this event */
  id: string;

  /** Type of event */
  type: EventType;

  /** ISO timestamp when the event occurred */
  timestamp: string;

  /** The main content/data of the event */
  content: string;

  /** Structured metadata for the event */
  metadata: EventMetadata;

  /** Priority level for context selection */
  priority: EventPriority;

  /** Estimated token count for this event (cached for performance) */
  tokenCount: number;

  /** Parent event ID for hierarchical relationships */
  parentId?: string;

  /** Tags for categorization and search */
  tags: string[];
}

/**
 * Event metadata with type-specific fields
 */
export interface EventMetadata {
  /** ID of the task this event belongs to */
  taskId?: string;

  /** ID of the agent that generated this event */
  agentId?: string;

  /** Session/conversation ID */
  sessionId?: string;

  /** Tool name for tool_call/tool_result events */
  toolName?: string;

  /** Tool input parameters */
  toolInput?: Record<string, unknown>;

  /** Confidence score (0-1) for thoughts/observations */
  confidence?: number;

  /** Error code for error events */
  errorCode?: string;

  /** Stack trace for error events */
  stackTrace?: string;

  /** Duration in milliseconds for action events */
  durationMs?: number;

  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Input for creating a new event (simplified interface)
 */
export interface EventInput {
  type: EventType;
  content: string;
  metadata?: Partial<EventMetadata>;
  priority?: EventPriority;
  parentId?: string;
  tags?: string[];
}

/**
 * Query options for filtering events
 */
export interface EventQuery {
  /** Filter by event types */
  types?: EventType[];

  /** Filter by task ID */
  taskId?: string;

  /** Filter by agent ID */
  agentId?: string;

  /** Filter by session ID */
  sessionId?: string;

  /** Filter events after this timestamp */
  after?: string;

  /** Filter events before this timestamp */
  before?: string;

  /** Filter by priority levels */
  priorities?: EventPriority[];

  /** Filter by tags (any match) */
  tags?: string[];

  /** Maximum number of events to return */
  limit?: number;

  /** Skip this many events (for pagination) */
  offset?: number;
}

/**
 * Statistics about the event stream
 */
export interface EventStreamStats {
  /** Total number of events */
  totalEvents: number;

  /** Total token count across all events */
  totalTokens: number;

  /** Breakdown by event type */
  byType: Record<EventType, number>;

  /** Timestamp of oldest event */
  oldestTimestamp?: string;

  /** Timestamp of newest event */
  newestTimestamp?: string;
}

// ============================================================================
// TOKEN COUNTING
// ============================================================================

/**
 * Simple token counter using character-based estimation
 * In production, use tiktoken or a proper tokenizer
 * Rule of thumb: ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // More accurate estimation based on typical tokenization patterns
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  // Average of character-based and word-based estimation
  return Math.ceil((charCount / 4 + wordCount * 1.3) / 2);
}

/**
 * Calculate tokens for a full event (content + metadata overhead)
 */
export function calculateEventTokens(event: EventInput | WorkingMemoryEvent): number {
  let tokens = estimateTokens(event.content);

  // Add overhead for event structure (~20 tokens for type, timestamp, etc.)
  tokens += 20;

  // Add metadata tokens
  if (event.metadata) {
    tokens += estimateTokens(JSON.stringify(event.metadata));
  }

  // Add tags tokens
  if (event.tags && event.tags.length > 0) {
    tokens += event.tags.length * 2;
  }

  return tokens;
}

// ============================================================================
// EVENT STREAM CLASS
// ============================================================================

/**
 * In-memory event stream for agent working memory
 * Provides fast append, query, and context retrieval operations
 */
export class EventStream {
  private events: WorkingMemoryEvent[] = [];
  private eventIndex: Map<string, number> = new Map();
  private taskIndex: Map<string, Set<number>> = new Map();
  private typeIndex: Map<EventType, Set<number>> = new Map();
  private totalTokens: number = 0;

  constructor() {
    // Initialize type index for all event types
    const eventTypes: EventType[] = [
      'action', 'observation', 'thought', 'plan',
      'error', 'tool_call', 'tool_result'
    ];
    for (const type of eventTypes) {
      this.typeIndex.set(type, new Set());
    }
  }

  /**
   * Append a new event to the stream
   * @returns The created event with all fields populated
   */
  append(input: EventInput): WorkingMemoryEvent {
    const tokenCount = calculateEventTokens(input);

    const event: WorkingMemoryEvent = {
      id: uuid(),
      type: input.type,
      timestamp: new Date().toISOString(),
      content: input.content,
      metadata: {
        ...input.metadata,
      },
      priority: input.priority ?? 'normal',
      tokenCount,
      parentId: input.parentId,
      tags: input.tags ?? [],
    };

    const index = this.events.length;
    this.events.push(event);

    // Update indexes
    this.eventIndex.set(event.id, index);
    this.typeIndex.get(event.type)!.add(index);

    if (event.metadata.taskId) {
      if (!this.taskIndex.has(event.metadata.taskId)) {
        this.taskIndex.set(event.metadata.taskId, new Set());
      }
      this.taskIndex.get(event.metadata.taskId)!.add(index);
    }

    this.totalTokens += tokenCount;

    return event;
  }

  /**
   * Get an event by its ID
   */
  getById(id: string): WorkingMemoryEvent | undefined {
    const index = this.eventIndex.get(id);
    if (index === undefined) return undefined;
    return this.events[index];
  }

  /**
   * Get the N most recent events
   */
  getRecent(n: number): WorkingMemoryEvent[] {
    if (n <= 0) return [];
    const start = Math.max(0, this.events.length - n);
    return this.events.slice(start);
  }

  /**
   * Query events with filtering options
   */
  query(options: EventQuery = {}): WorkingMemoryEvent[] {
    let results: WorkingMemoryEvent[];

    // Start with full set or task-filtered set for efficiency
    if (options.taskId && this.taskIndex.has(options.taskId)) {
      const indices = Array.from(this.taskIndex.get(options.taskId)!);
      results = indices.map(i => this.events[i]);
    } else if (options.types && options.types.length === 1) {
      // Single type query - use index
      const typeIndices = this.typeIndex.get(options.types[0]);
      if (!typeIndices) return [];
      results = Array.from(typeIndices).map(i => this.events[i]);
    } else {
      results = [...this.events];
    }

    // Apply filters
    if (options.types && options.types.length > 1) {
      const typeSet = new Set(options.types);
      results = results.filter(e => typeSet.has(e.type));
    }

    if (options.agentId) {
      results = results.filter(e => e.metadata.agentId === options.agentId);
    }

    if (options.sessionId) {
      results = results.filter(e => e.metadata.sessionId === options.sessionId);
    }

    if (options.after) {
      results = results.filter(e => e.timestamp > options.after!);
    }

    if (options.before) {
      results = results.filter(e => e.timestamp < options.before!);
    }

    if (options.priorities && options.priorities.length > 0) {
      const prioritySet = new Set(options.priorities);
      results = results.filter(e => prioritySet.has(e.priority));
    }

    if (options.tags && options.tags.length > 0) {
      const tagSet = new Set(options.tags);
      results = results.filter(e =>
        e.tags.some(tag => tagSet.has(tag))
      );
    }

    // Sort by timestamp (chronological)
    results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Apply pagination
    if (options.offset && options.offset > 0) {
      results = results.slice(options.offset);
    }

    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Search events by content (simple substring matching)
   * For production, consider using a full-text search library
   */
  search(query: string, options: Partial<EventQuery> = {}): WorkingMemoryEvent[] {
    const lowerQuery = query.toLowerCase();

    // First apply standard filters
    let results = this.query(options);

    // Then filter by content match
    results = results.filter(e =>
      e.content.toLowerCase().includes(lowerQuery) ||
      e.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      (e.metadata.toolName && e.metadata.toolName.toLowerCase().includes(lowerQuery))
    );

    return results;
  }

  /**
   * Get all events for a specific task
   */
  getTaskEvents(taskId: string): WorkingMemoryEvent[] {
    return this.query({ taskId });
  }

  /**
   * Get the event chain (parent-child relationships) for an event
   */
  getEventChain(eventId: string): WorkingMemoryEvent[] {
    const chain: WorkingMemoryEvent[] = [];
    let current = this.getById(eventId);

    while (current) {
      chain.unshift(current);
      if (current.parentId) {
        current = this.getById(current.parentId);
      } else {
        break;
      }
    }

    return chain;
  }

  /**
   * Get child events of a parent event
   */
  getChildren(parentId: string): WorkingMemoryEvent[] {
    return this.events.filter(e => e.parentId === parentId);
  }

  /**
   * Get stream statistics
   */
  getStats(): EventStreamStats {
    const byType: Record<EventType, number> = {
      action: 0,
      observation: 0,
      thought: 0,
      plan: 0,
      error: 0,
      tool_call: 0,
      tool_result: 0,
    };

    for (const [type, indices] of this.typeIndex) {
      byType[type] = indices.size;
    }

    return {
      totalEvents: this.events.length,
      totalTokens: this.totalTokens,
      byType,
      oldestTimestamp: this.events[0]?.timestamp,
      newestTimestamp: this.events[this.events.length - 1]?.timestamp,
    };
  }

  /**
   * Get total token count
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * Get the number of events in the stream
   */
  size(): number {
    return this.events.length;
  }

  /**
   * Check if the stream is empty
   */
  isEmpty(): boolean {
    return this.events.length === 0;
  }

  /**
   * Clear all events from the stream
   */
  clear(): void {
    this.events = [];
    this.eventIndex.clear();
    this.taskIndex.clear();
    for (const indices of this.typeIndex.values()) {
      indices.clear();
    }
    this.totalTokens = 0;
  }

  /**
   * Export all events as an array
   */
  toArray(): WorkingMemoryEvent[] {
    return [...this.events];
  }

  /**
   * Import events from an array (appends to existing)
   */
  fromArray(events: WorkingMemoryEvent[]): void {
    for (const event of events) {
      const index = this.events.length;
      this.events.push(event);

      this.eventIndex.set(event.id, index);
      this.typeIndex.get(event.type)?.add(index);

      if (event.metadata.taskId) {
        if (!this.taskIndex.has(event.metadata.taskId)) {
          this.taskIndex.set(event.metadata.taskId, new Set());
        }
        this.taskIndex.get(event.metadata.taskId)!.add(index);
      }

      this.totalTokens += event.tokenCount;
    }
  }

  /**
   * Create a snapshot of the stream for serialization
   */
  snapshot(): WorkingMemoryEvent[] {
    return this.toArray();
  }

  /**
   * Restore from a snapshot
   */
  restore(snapshot: WorkingMemoryEvent[]): void {
    this.clear();
    this.fromArray(snapshot);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new empty event stream
 */
export function createEventStream(): EventStream {
  return new EventStream();
}

/**
 * Create an event stream from an array of events
 */
export function createEventStreamFromArray(events: WorkingMemoryEvent[]): EventStream {
  const stream = new EventStream();
  stream.fromArray(events);
  return stream;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a tool call event with proper metadata
 */
export function createToolCallEvent(
  toolName: string,
  input: Record<string, unknown>,
  taskId?: string,
  agentId?: string
): EventInput {
  return {
    type: 'tool_call',
    content: `Calling ${toolName}`,
    metadata: {
      toolName,
      toolInput: input,
      taskId,
      agentId,
    },
    priority: 'normal',
    tags: ['tool', toolName],
  };
}

/**
 * Create a tool result event
 */
export function createToolResultEvent(
  toolName: string,
  result: string,
  parentId: string,
  durationMs: number,
  taskId?: string,
  agentId?: string
): EventInput {
  return {
    type: 'tool_result',
    content: result,
    metadata: {
      toolName,
      durationMs,
      taskId,
      agentId,
    },
    priority: 'normal',
    parentId,
    tags: ['tool', toolName, 'result'],
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(
  error: Error | string,
  taskId?: string,
  agentId?: string
): EventInput {
  const errorObj = typeof error === 'string' ? new Error(error) : error;

  return {
    type: 'error',
    content: errorObj.message,
    metadata: {
      errorCode: errorObj.name,
      stackTrace: errorObj.stack,
      taskId,
      agentId,
    },
    priority: 'critical',
    tags: ['error', errorObj.name],
  };
}

/**
 * Create a thought event
 */
export function createThoughtEvent(
  thought: string,
  confidence?: number,
  taskId?: string,
  agentId?: string
): EventInput {
  return {
    type: 'thought',
    content: thought,
    metadata: {
      confidence,
      taskId,
      agentId,
    },
    priority: 'normal',
    tags: ['reasoning'],
  };
}

/**
 * Create a plan event
 */
export function createPlanEvent(
  plan: string,
  taskId?: string,
  agentId?: string
): EventInput {
  return {
    type: 'plan',
    content: plan,
    metadata: {
      taskId,
      agentId,
    },
    priority: 'high',
    tags: ['planning'],
  };
}

/**
 * Create an action event
 */
export function createActionEvent(
  action: string,
  durationMs?: number,
  taskId?: string,
  agentId?: string
): EventInput {
  return {
    type: 'action',
    content: action,
    metadata: {
      durationMs,
      taskId,
      agentId,
    },
    priority: 'normal',
    tags: ['action'],
  };
}

/**
 * Create an observation event
 */
export function createObservationEvent(
  observation: string,
  confidence?: number,
  taskId?: string,
  agentId?: string
): EventInput {
  return {
    type: 'observation',
    content: observation,
    metadata: {
      confidence,
      taskId,
      agentId,
    },
    priority: 'normal',
    tags: ['observation'],
  };
}
