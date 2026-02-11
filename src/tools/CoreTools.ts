/**
 * Core Tools - Working implementations for Alabobai platform
 * Provides base tool infrastructure and common utilities
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TOOL RESULT TYPES
// ============================================================================

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  executionTime: number;
  metadata?: Record<string, unknown>;
}

export type ToolStatus = 'idle' | 'running' | 'completed' | 'failed' | 'timeout';

// ============================================================================
// TOOL EXECUTION CONTEXT
// ============================================================================

export interface ToolExecutionContext {
  executionId: string;
  toolId: string;
  startTime: number;
  timeout: number;
  sandboxId?: string;
  userId?: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if a request is allowed for a given key
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing requests for this key
    const existingRequests = this.requests.get(key) || [];

    // Filter out requests outside the window
    const validRequests = existingRequests.filter(time => time > windowStart);

    // Check if we're under the limit
    if (validRequests.length >= this.config.maxRequests) {
      return false;
    }

    // Add the current request
    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemainingRequests(key: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const existingRequests = this.requests.get(key) || [];
    const validRequests = existingRequests.filter(time => time > windowStart);
    return Math.max(0, this.config.maxRequests - validRequests.length);
  }

  /**
   * Get time until next request is allowed
   */
  getTimeUntilReset(key: string): number {
    const existingRequests = this.requests.get(key) || [];
    if (existingRequests.length === 0) return 0;

    const oldestRequest = Math.min(...existingRequests);
    const resetTime = oldestRequest + this.config.windowMs;
    return Math.max(0, resetTime - Date.now());
  }

  /**
   * Clear rate limit data for a key
   */
  clear(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limit data
   */
  clearAll(): void {
    this.requests.clear();
  }
}

// ============================================================================
// LOGGER
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  toolId?: string;
  executionId?: string;
}

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 10000;
  private minLevel: LogLevel = 'info';
  private emitter: EventEmitter = new EventEmitter();

  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const prefix = entry.toolId ? `[${entry.toolId}]` : '[Core]';
    let message = `${timestamp} ${level} ${prefix} ${entry.message}`;

    if (entry.context) {
      message += ` ${JSON.stringify(entry.context)}`;
    }

    return message;
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>, toolId?: string, executionId?: string): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      toolId,
      executionId,
    };

    this.logs.push(entry);

    // Trim logs if we exceed max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Emit for real-time logging
    this.emitter.emit('log', entry);

    // Console output
    const formatted = this.formatMessage(entry);
    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>, toolId?: string): void {
    this.log('debug', message, context, toolId);
  }

  info(message: string, context?: Record<string, unknown>, toolId?: string): void {
    this.log('info', message, context, toolId);
  }

  warn(message: string, context?: Record<string, unknown>, toolId?: string): void {
    this.log('warn', message, context, toolId);
  }

  error(message: string, context?: Record<string, unknown>, toolId?: string): void {
    this.log('error', message, context, toolId);
  }

  onLog(callback: (entry: LogEntry) => void): void {
    this.emitter.on('log', callback);
  }

  getLogs(filter?: { level?: LogLevel; toolId?: string; limit?: number }): LogEntry[] {
    let filtered = this.logs;

    if (filter?.level) {
      filtered = filtered.filter(l => l.level === filter.level);
    }

    if (filter?.toolId) {
      filtered = filtered.filter(l => l.toolId === filter.toolId);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  clearLogs(): void {
    this.logs = [];
  }
}

// ============================================================================
// BASE TOOL CLASS
// ============================================================================

export interface ToolDefinition<TInput, TOutput> {
  id: string;
  name: string;
  description: string;
  version: string;
  inputSchema: z.ZodType<TInput>;
  category: string;
  timeout?: number;
  rateLimit?: RateLimitConfig;
}

export abstract class BaseTool<TInput, TOutput> extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly category: string;
  readonly timeout: number;
  readonly rateLimiter?: RateLimiter;

  protected logger: Logger;
  protected status: ToolStatus = 'idle';
  protected currentExecution?: ToolExecutionContext;

  constructor(definition: ToolDefinition<TInput, TOutput>) {
    super();
    this.id = definition.id;
    this.name = definition.name;
    this.description = definition.description;
    this.version = definition.version;
    this.inputSchema = definition.inputSchema;
    this.category = definition.category;
    this.timeout = definition.timeout ?? 30000;
    this.logger = Logger.getInstance();

    if (definition.rateLimit) {
      this.rateLimiter = new RateLimiter(definition.rateLimit);
    }
  }

  /**
   * Execute the tool with input validation and error handling
   */
  async execute(input: TInput, context?: Partial<ToolExecutionContext>): Promise<ToolResult<TOutput>> {
    const executionId = uuid();
    const startTime = Date.now();

    this.currentExecution = {
      executionId,
      toolId: this.id,
      startTime,
      timeout: this.timeout,
      metadata: {},
      ...context,
    };

    this.status = 'running';
    this.emit('execution-start', { executionId, toolId: this.id, input });

    try {
      // Validate input
      const validationResult = this.inputSchema.safeParse(input);
      if (!validationResult.success) {
        const error = validationResult.error.errors.map(e => e.message).join(', ');
        this.logger.error(`Input validation failed: ${error}`, { input }, this.id);
        return this.createErrorResult(error, 'VALIDATION_ERROR', startTime);
      }

      // Check rate limit
      if (this.rateLimiter) {
        const rateLimitKey = context?.userId || 'global';
        if (!this.rateLimiter.isAllowed(rateLimitKey)) {
          const waitTime = this.rateLimiter.getTimeUntilReset(rateLimitKey);
          this.logger.warn(`Rate limit exceeded, wait ${waitTime}ms`, { key: rateLimitKey }, this.id);
          return this.createErrorResult(
            `Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
            'RATE_LIMIT_EXCEEDED',
            startTime
          );
        }
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        validationResult.data,
        this.timeout
      );

      this.status = 'completed';
      this.emit('execution-complete', { executionId, toolId: this.id, result });
      this.logger.info(`Tool execution completed`, { executionTime: Date.now() - startTime }, this.id);

      return result;

    } catch (error) {
      this.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tool execution failed: ${errorMessage}`, { error }, this.id);
      this.emit('execution-error', { executionId, toolId: this.id, error: errorMessage });

      return this.createErrorResult(errorMessage, 'EXECUTION_ERROR', startTime);
    } finally {
      this.currentExecution = undefined;
    }
  }

  /**
   * Execute with timeout protection
   */
  private async executeWithTimeout(input: TInput, timeout: number): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();

    return new Promise<ToolResult<TOutput>>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.status = 'timeout';
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      this.run(input)
        .then(result => {
          clearTimeout(timeoutId);
          resolve({
            success: true,
            data: result,
            executionTime: Date.now() - startTime,
          });
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Create an error result
   */
  protected createErrorResult(error: string, errorCode: string, startTime: number): ToolResult<TOutput> {
    return {
      success: false,
      error,
      errorCode,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Abstract method to be implemented by specific tools
   */
  protected abstract run(input: TInput): Promise<TOutput>;

  /**
   * Get current status
   */
  getStatus(): ToolStatus {
    return this.status;
  }

  /**
   * Get current execution context
   */
  getExecutionContext(): ToolExecutionContext | undefined {
    return this.currentExecution;
  }

  /**
   * Abort current execution (if supported by the tool)
   */
  abort(): void {
    if (this.currentExecution) {
      this.emit('execution-abort', { executionId: this.currentExecution.executionId, toolId: this.id });
      this.status = 'idle';
      this.currentExecution = undefined;
    }
  }
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

export class CoreToolRegistry {
  private tools: Map<string, BaseTool<unknown, unknown>> = new Map();
  private logger: Logger = Logger.getInstance();

  /**
   * Register a tool
   */
  register<TInput, TOutput>(tool: BaseTool<TInput, TOutput>): void {
    if (this.tools.has(tool.id)) {
      this.logger.warn(`Tool ${tool.id} is already registered, overwriting`);
    }
    this.tools.set(tool.id, tool as BaseTool<unknown, unknown>);
    this.logger.info(`Registered tool: ${tool.id}`, { name: tool.name, category: tool.category });
  }

  /**
   * Get a tool by ID
   */
  get<TInput, TOutput>(id: string): BaseTool<TInput, TOutput> | undefined {
    return this.tools.get(id) as BaseTool<TInput, TOutput> | undefined;
  }

  /**
   * Get all tools
   */
  getAll(): BaseTool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): BaseTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  /**
   * Execute a tool by ID
   */
  async execute<TInput, TOutput>(
    id: string,
    input: TInput,
    context?: Partial<ToolExecutionContext>
  ): Promise<ToolResult<TOutput>> {
    const tool = this.get<TInput, TOutput>(id);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${id}`,
        errorCode: 'TOOL_NOT_FOUND',
        executionTime: 0,
      };
    }
    return tool.execute(input, context);
  }

  /**
   * Unregister a tool
   */
  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  /**
   * Get tool count
   */
  get count(): number {
    return this.tools.size;
  }

  /**
   * List all tool IDs
   */
  listIds(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool info
   */
  getToolInfo(): Array<{ id: string; name: string; description: string; category: string; version: string }> {
    return Array.from(this.tools.values()).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      version: t.version,
    }));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const coreToolRegistry = new CoreToolRegistry();
export const logger = Logger.getInstance();
