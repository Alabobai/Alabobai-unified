/**
 * Alabobai Context Builder
 * Smart context window management for fitting events into token budgets
 * Implements intelligent selection, prioritization, and summarization strategies
 */

import {
  EventStream,
  WorkingMemoryEvent,
  EventType,
  EventPriority,
  EventQuery,
  estimateTokens,
} from './EventStream.js';
import { FileMemory } from './FileMemory.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for context building
 */
export interface ContextBuilderConfig {
  /** Maximum tokens for the context window */
  maxTokens: number;

  /** Strategy for selecting events */
  strategy: ContextStrategy;

  /** Whether to include event metadata in output */
  includeMetadata: boolean;

  /** Whether to summarize older events */
  summarizeOld: boolean;

  /** Token budget for summarized content */
  summaryTokenBudget: number;

  /** Priority weights for event types */
  typeWeights: Partial<Record<EventType, number>>;

  /** Priority weights by priority level */
  priorityWeights: Record<EventPriority, number>;

  /** Events to always include (by ID) */
  alwaysInclude: string[];

  /** Events to always exclude (by ID) */
  alwaysExclude: string[];

  /** Minimum events to include regardless of token limit */
  minEvents: number;
}

/**
 * Strategy for context selection
 */
export type ContextStrategy =
  | 'recent'           // Most recent events first
  | 'priority'         // Highest priority events first
  | 'balanced'         // Mix of recent and priority
  | 'semantic'         // Based on relevance to query (requires embedding)
  | 'hierarchical';    // Preserve parent-child relationships

/**
 * Result of context building
 */
export interface ContextResult {
  /** Selected events in chronological order */
  events: WorkingMemoryEvent[];

  /** Formatted context string */
  context: string;

  /** Total tokens in the context */
  tokenCount: number;

  /** Number of events included */
  eventCount: number;

  /** Number of events excluded due to token limit */
  eventsExcluded: number;

  /** Summary of excluded events (if summarization enabled) */
  summary?: string;

  /** Token count breakdown by event type */
  tokensByType: Record<EventType, number>;
}

/**
 * Context section for structured output
 */
export interface ContextSection {
  type: 'events' | 'summary' | 'system';
  title: string;
  content: string;
  tokenCount: number;
}

/**
 * Event with computed score for prioritization
 */
interface ScoredEvent {
  event: WorkingMemoryEvent;
  score: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ContextBuilderConfig = {
  maxTokens: 8000,
  strategy: 'balanced',
  includeMetadata: false,
  summarizeOld: true,
  summaryTokenBudget: 500,
  typeWeights: {
    error: 1.5,
    plan: 1.4,
    action: 1.2,
    tool_result: 1.1,
    observation: 1.0,
    tool_call: 0.9,
    thought: 0.8,
  },
  priorityWeights: {
    critical: 2.0,
    high: 1.5,
    normal: 1.0,
    low: 0.5,
  },
  alwaysInclude: [],
  alwaysExclude: [],
  minEvents: 5,
};

// ============================================================================
// CONTEXT BUILDER CLASS
// ============================================================================

/**
 * Builds optimized context from event streams for LLM consumption
 */
export class ContextBuilder {
  private config: ContextBuilderConfig;

  constructor(config: Partial<ContextBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build context from an EventStream
   */
  buildFromStream(
    stream: EventStream,
    options: Partial<ContextBuilderConfig> = {}
  ): ContextResult {
    const config = { ...this.config, ...options };
    return this.buildContext(stream.toArray(), config);
  }

  /**
   * Build context from a FileMemory
   */
  buildFromMemory(
    memory: FileMemory,
    options: Partial<ContextBuilderConfig> = {}
  ): ContextResult {
    const config = { ...this.config, ...options };
    return this.buildContext(memory.toArray(), config);
  }

  /**
   * Build context from an array of events
   */
  buildFromEvents(
    events: WorkingMemoryEvent[],
    options: Partial<ContextBuilderConfig> = {}
  ): ContextResult {
    const config = { ...this.config, ...options };
    return this.buildContext(events, config);
  }

  /**
   * Get context optimized for a specific query
   */
  getContextForQuery(
    stream: EventStream,
    query: string,
    maxTokens?: number
  ): ContextResult {
    // Search for relevant events
    const relevantEvents = stream.search(query);
    const allEvents = stream.toArray();

    // Boost relevance scores for matching events
    const relevantIds = new Set(relevantEvents.map(e => e.id));

    const scoredEvents = allEvents.map(event => ({
      event,
      score: this.calculateScore(event, this.config) *
        (relevantIds.has(event.id) ? 2.0 : 1.0),
    }));

    return this.selectAndBuild(scoredEvents, {
      ...this.config,
      maxTokens: maxTokens ?? this.config.maxTokens,
    });
  }

  /**
   * Main context building logic
   */
  private buildContext(
    events: WorkingMemoryEvent[],
    config: ContextBuilderConfig
  ): ContextResult {
    // Filter out excluded events
    const excludeSet = new Set(config.alwaysExclude);
    let filteredEvents = events.filter(e => !excludeSet.has(e.id));

    // Score all events
    const scoredEvents = filteredEvents.map(event => ({
      event,
      score: this.calculateScore(event, config),
    }));

    return this.selectAndBuild(scoredEvents, config);
  }

  /**
   * Select events and build the context result
   */
  private selectAndBuild(
    scoredEvents: ScoredEvent[],
    config: ContextBuilderConfig
  ): ContextResult {
    const includeSet = new Set(config.alwaysInclude);
    const selected: WorkingMemoryEvent[] = [];
    const excluded: WorkingMemoryEvent[] = [];
    let currentTokens = 0;

    // Reserve tokens for summary if enabled
    const availableTokens = config.summarizeOld
      ? config.maxTokens - config.summaryTokenBudget
      : config.maxTokens;

    // First, add always-include events
    for (const { event } of scoredEvents) {
      if (includeSet.has(event.id)) {
        selected.push(event);
        currentTokens += event.tokenCount;
      }
    }

    // Sort remaining events based on strategy
    const sortedEvents = this.sortByStrategy(
      scoredEvents.filter(se => !includeSet.has(se.event.id)),
      config.strategy
    );

    // Select events up to token limit
    for (const { event } of sortedEvents) {
      if (currentTokens + event.tokenCount <= availableTokens) {
        selected.push(event);
        currentTokens += event.tokenCount;
      } else if (selected.length >= config.minEvents) {
        excluded.push(event);
      } else {
        // Force include minimum events
        selected.push(event);
        currentTokens += event.tokenCount;
      }
    }

    // Sort selected events chronologically
    selected.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Generate summary of excluded events if enabled
    let summary: string | undefined;
    if (config.summarizeOld && excluded.length > 0) {
      summary = this.generateSummary(excluded, config.summaryTokenBudget);
      currentTokens += estimateTokens(summary);
    }

    // Format the context
    const context = this.formatContext(selected, summary, config);

    // Calculate token breakdown by type
    const tokensByType: Record<EventType, number> = {
      action: 0,
      observation: 0,
      thought: 0,
      plan: 0,
      error: 0,
      tool_call: 0,
      tool_result: 0,
    };

    for (const event of selected) {
      tokensByType[event.type] += event.tokenCount;
    }

    return {
      events: selected,
      context,
      tokenCount: currentTokens,
      eventCount: selected.length,
      eventsExcluded: excluded.length,
      summary,
      tokensByType,
    };
  }

  /**
   * Calculate priority score for an event
   */
  private calculateScore(
    event: WorkingMemoryEvent,
    config: ContextBuilderConfig
  ): number {
    // Base score from type weight
    const typeWeight = config.typeWeights[event.type] ?? 1.0;

    // Priority weight
    const priorityWeight = config.priorityWeights[event.priority];

    // Recency boost (events from last hour get a boost)
    const age = Date.now() - new Date(event.timestamp).getTime();
    const recencyBoost = age < 3600000 ? 1.2 : age < 86400000 ? 1.1 : 1.0;

    // Error events get extra weight if recent
    const errorBoost = event.type === 'error' && age < 300000 ? 1.5 : 1.0;

    return typeWeight * priorityWeight * recencyBoost * errorBoost;
  }

  /**
   * Sort events based on the selected strategy
   */
  private sortByStrategy(
    events: ScoredEvent[],
    strategy: ContextStrategy
  ): ScoredEvent[] {
    switch (strategy) {
      case 'recent':
        // Most recent first
        return events.sort((a, b) =>
          b.event.timestamp.localeCompare(a.event.timestamp)
        );

      case 'priority':
        // Highest score first
        return events.sort((a, b) => b.score - a.score);

      case 'balanced':
        // Combine recency and priority
        return events.sort((a, b) => {
          const recencyA = new Date(a.event.timestamp).getTime();
          const recencyB = new Date(b.event.timestamp).getTime();
          const normalizedRecency = (recencyA - recencyB) / 86400000; // Normalize to days
          return b.score - a.score + normalizedRecency * 0.1;
        });

      case 'hierarchical':
        // Sort to preserve parent-child relationships
        // Parents should come before children
        const eventMap = new Map(events.map(e => [e.event.id, e]));
        const sorted: ScoredEvent[] = [];
        const added = new Set<string>();

        const addWithParents = (se: ScoredEvent) => {
          if (added.has(se.event.id)) return;
          if (se.event.parentId && eventMap.has(se.event.parentId)) {
            addWithParents(eventMap.get(se.event.parentId)!);
          }
          sorted.push(se);
          added.add(se.event.id);
        };

        // Sort by score first, then add with parents
        const byScore = [...events].sort((a, b) => b.score - a.score);
        for (const se of byScore) {
          addWithParents(se);
        }
        return sorted;

      case 'semantic':
        // For semantic strategy, rely on pre-computed scores
        // (scores should already reflect semantic relevance)
        return events.sort((a, b) => b.score - a.score);

      default:
        return events;
    }
  }

  /**
   * Generate a summary of excluded events
   */
  private generateSummary(
    events: WorkingMemoryEvent[],
    tokenBudget: number
  ): string {
    // Group events by type
    const byType = new Map<EventType, WorkingMemoryEvent[]>();
    for (const event of events) {
      if (!byType.has(event.type)) {
        byType.set(event.type, []);
      }
      byType.get(event.type)!.push(event);
    }

    // Build summary
    const lines: string[] = ['[Earlier context summary]'];

    for (const [type, typeEvents] of byType) {
      const count = typeEvents.length;
      const firstTime = typeEvents[0].timestamp;
      const lastTime = typeEvents[typeEvents.length - 1].timestamp;

      if (count === 1) {
        lines.push(`- 1 ${type}: ${this.truncate(typeEvents[0].content, 50)}`);
      } else {
        lines.push(`- ${count} ${type}s (${firstTime.slice(11, 19)} - ${lastTime.slice(11, 19)})`);

        // Add key content hints for important types
        if (type === 'error' || type === 'plan') {
          const sample = typeEvents.slice(0, 2);
          for (const e of sample) {
            lines.push(`  > ${this.truncate(e.content, 40)}`);
          }
        }
      }
    }

    const summary = lines.join('\n');

    // Truncate if over budget
    if (estimateTokens(summary) > tokenBudget) {
      return this.truncateToTokens(summary, tokenBudget);
    }

    return summary;
  }

  /**
   * Format the final context string
   */
  private formatContext(
    events: WorkingMemoryEvent[],
    summary: string | undefined,
    config: ContextBuilderConfig
  ): string {
    const sections: string[] = [];

    // Add summary section if present
    if (summary) {
      sections.push(summary);
      sections.push('');
    }

    // Add events section
    sections.push('[Working Memory]');

    for (const event of events) {
      const line = this.formatEvent(event, config.includeMetadata);
      sections.push(line);
    }

    return sections.join('\n');
  }

  /**
   * Format a single event for output
   */
  private formatEvent(
    event: WorkingMemoryEvent,
    includeMetadata: boolean
  ): string {
    const timestamp = event.timestamp.slice(11, 23); // HH:MM:SS.mmm
    const typeLabel = this.getTypeLabel(event.type);

    let line = `[${timestamp}] ${typeLabel}: ${event.content}`;

    if (includeMetadata) {
      const meta: string[] = [];

      if (event.metadata.toolName) {
        meta.push(`tool=${event.metadata.toolName}`);
      }
      if (event.metadata.confidence !== undefined) {
        meta.push(`conf=${(event.metadata.confidence * 100).toFixed(0)}%`);
      }
      if (event.metadata.durationMs !== undefined) {
        meta.push(`dur=${event.metadata.durationMs}ms`);
      }

      if (meta.length > 0) {
        line += ` (${meta.join(', ')})`;
      }
    }

    return line;
  }

  /**
   * Get a short label for an event type
   */
  private getTypeLabel(type: EventType): string {
    const labels: Record<EventType, string> = {
      action: 'ACTION',
      observation: 'OBSERVE',
      thought: 'THINK',
      plan: 'PLAN',
      error: 'ERROR',
      tool_call: 'TOOL>',
      tool_result: 'TOOL<',
    };
    return labels[type];
  }

  /**
   * Truncate text to a maximum length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  /**
   * Truncate text to fit within a token budget
   */
  private truncateToTokens(text: string, maxTokens: number): string {
    let result = text;
    while (estimateTokens(result) > maxTokens && result.length > 10) {
      result = result.slice(0, Math.floor(result.length * 0.9));
    }
    return result + (result.length < text.length ? '...' : '');
  }

  /**
   * Update configuration
   */
  configure(options: Partial<ContextBuilderConfig>): void {
    this.config = { ...this.config, ...options };
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextBuilderConfig {
    return { ...this.config };
  }
}

// ============================================================================
// SPECIALIZED CONTEXT BUILDERS
// ============================================================================

/**
 * Context builder optimized for debugging/error analysis
 */
export class DebugContextBuilder extends ContextBuilder {
  constructor(maxTokens: number = 8000) {
    super({
      maxTokens,
      strategy: 'recent',
      includeMetadata: true,
      summarizeOld: false,
      typeWeights: {
        error: 2.0,
        tool_result: 1.5,
        action: 1.3,
        observation: 1.2,
        tool_call: 1.1,
        thought: 1.0,
        plan: 0.9,
      },
      priorityWeights: {
        critical: 3.0,
        high: 2.0,
        normal: 1.0,
        low: 0.3,
      },
      minEvents: 10,
      summaryTokenBudget: 0,
      alwaysInclude: [],
      alwaysExclude: [],
    });
  }
}

/**
 * Context builder optimized for planning/reasoning
 */
export class PlanningContextBuilder extends ContextBuilder {
  constructor(maxTokens: number = 8000) {
    super({
      maxTokens,
      strategy: 'balanced',
      includeMetadata: false,
      summarizeOld: true,
      typeWeights: {
        plan: 2.0,
        thought: 1.5,
        observation: 1.3,
        action: 1.2,
        tool_result: 1.0,
        tool_call: 0.8,
        error: 1.4,
      },
      priorityWeights: {
        critical: 1.5,
        high: 1.3,
        normal: 1.0,
        low: 0.7,
      },
      minEvents: 5,
      summaryTokenBudget: 800,
      alwaysInclude: [],
      alwaysExclude: [],
    });
  }
}

/**
 * Context builder optimized for tool execution
 */
export class ToolContextBuilder extends ContextBuilder {
  constructor(maxTokens: number = 4000) {
    super({
      maxTokens,
      strategy: 'hierarchical',
      includeMetadata: true,
      summarizeOld: false,
      typeWeights: {
        tool_call: 1.5,
        tool_result: 2.0,
        action: 1.3,
        error: 1.8,
        observation: 1.0,
        thought: 0.7,
        plan: 0.6,
      },
      priorityWeights: {
        critical: 2.0,
        high: 1.5,
        normal: 1.0,
        low: 0.5,
      },
      minEvents: 3,
      summaryTokenBudget: 0,
      alwaysInclude: [],
      alwaysExclude: [],
    });
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new context builder with default configuration
 */
export function createContextBuilder(
  config?: Partial<ContextBuilderConfig>
): ContextBuilder {
  return new ContextBuilder(config);
}

/**
 * Create a debug-optimized context builder
 */
export function createDebugContextBuilder(maxTokens?: number): DebugContextBuilder {
  return new DebugContextBuilder(maxTokens);
}

/**
 * Create a planning-optimized context builder
 */
export function createPlanningContextBuilder(maxTokens?: number): PlanningContextBuilder {
  return new PlanningContextBuilder(maxTokens);
}

/**
 * Create a tool-execution-optimized context builder
 */
export function createToolContextBuilder(maxTokens?: number): ToolContextBuilder {
  return new ToolContextBuilder(maxTokens);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick helper to get context from a stream with a token budget
 */
export function getContext(
  stream: EventStream,
  maxTokens: number,
  strategy: ContextStrategy = 'balanced'
): ContextResult {
  const builder = new ContextBuilder({ maxTokens, strategy });
  return builder.buildFromStream(stream);
}

/**
 * Get the most recent N events as context
 */
export function getRecentContext(
  stream: EventStream,
  count: number
): ContextResult {
  const events = stream.getRecent(count);
  const builder = new ContextBuilder();
  return builder.buildFromEvents(events);
}

/**
 * Get context filtered by event types
 */
export function getContextByTypes(
  stream: EventStream,
  types: EventType[],
  maxTokens: number
): ContextResult {
  const events = stream.query({ types });
  const builder = new ContextBuilder({ maxTokens });
  return builder.buildFromEvents(events);
}

/**
 * Merge contexts from multiple streams
 */
export function mergeContexts(
  results: ContextResult[],
  maxTokens: number
): ContextResult {
  // Collect all events
  const allEvents: WorkingMemoryEvent[] = [];
  for (const result of results) {
    allEvents.push(...result.events);
  }

  // Sort chronologically and deduplicate
  allEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const seen = new Set<string>();
  const uniqueEvents = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Build new context
  const builder = new ContextBuilder({ maxTokens });
  return builder.buildFromEvents(uniqueEvents);
}

/**
 * Estimate how many events can fit in a token budget
 */
export function estimateEventCapacity(
  events: WorkingMemoryEvent[],
  tokenBudget: number
): number {
  if (events.length === 0) return 0;

  const avgTokens = events.reduce((sum, e) => sum + e.tokenCount, 0) / events.length;
  return Math.floor(tokenBudget / avgTokens);
}
