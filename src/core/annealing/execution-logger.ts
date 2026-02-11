/**
 * Alabobai Self-Annealing System - Execution Logger
 *
 * Captures comprehensive execution data for every agent action.
 * Designed for minimal performance overhead while capturing rich context.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  ExecutionLog,
  ActionType,
  ExecutionStatus,
  ToolUsage,
  ContextFactor,
} from './types.js';

// ============================================================================
// EXECUTION LOGGER CLASS
// ============================================================================

export interface ExecutionLoggerConfig {
  batchSize: number;           // Number of logs to batch before flush
  flushIntervalMs: number;     // Maximum time between flushes
  enableSampling: boolean;     // Sample low-value logs
  samplingRate: number;        // 0-1, percentage to keep when sampling
  sensitiveFields: string[];   // Fields to redact
  maxInputSize: number;        // Truncate large inputs
  maxOutputSize: number;       // Truncate large outputs
}

const DEFAULT_CONFIG: ExecutionLoggerConfig = {
  batchSize: 100,
  flushIntervalMs: 5000,
  enableSampling: false,
  samplingRate: 1.0,
  sensitiveFields: ['password', 'token', 'secret', 'key', 'credential', 'ssn', 'credit_card'],
  maxInputSize: 50000,
  maxOutputSize: 100000,
};

export class ExecutionLogger extends EventEmitter {
  private config: ExecutionLoggerConfig;
  private logBuffer: ExecutionLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private activeExecutions: Map<string, ExecutionLog> = new Map();
  private persistFn: ((logs: ExecutionLog[]) => Promise<void>) | null = null;

  constructor(config: Partial<ExecutionLoggerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushTimer();
  }

  /**
   * Set the persistence function for storing logs
   */
  setPersistFunction(fn: (logs: ExecutionLog[]) => Promise<void>): void {
    this.persistFn = fn;
  }

  /**
   * Start logging an execution (call at the beginning of an action)
   */
  startExecution(params: {
    companyId: string;
    sessionId: string;
    userId: string;
    agentId: string;
    agentName: string;
    taskId: string;
    actionType: ActionType;
    actionName: string;
    actionInput: Record<string, unknown>;
    llmModel?: string;
    promptVersion?: string;
    parentExecutionId?: string;
    contextFactors?: ContextFactor[];
  }): string {
    const executionId = uuid();

    const log: ExecutionLog = {
      id: executionId,
      timestamp: new Date(),
      companyId: params.companyId,
      sessionId: params.sessionId,
      userId: params.userId,
      agentId: params.agentId,
      agentName: params.agentName,
      taskId: params.taskId,
      actionType: params.actionType,
      actionName: params.actionName,
      actionInput: this.sanitizeAndTruncate(params.actionInput, 'input'),
      actionOutput: null,
      durationMs: 0,
      tokenCount: { input: 0, output: 0, total: 0 },
      llmModel: params.llmModel || 'unknown',
      promptVersion: params.promptVersion || 'v1.0.0',
      status: 'success', // Will be updated on completion
      parentExecutionId: params.parentExecutionId || null,
      childExecutionIds: [],
      toolsUsed: [],
      contextFactors: params.contextFactors || [],
    };

    this.activeExecutions.set(executionId, log);

    // Link to parent if exists
    if (params.parentExecutionId) {
      const parent = this.activeExecutions.get(params.parentExecutionId);
      if (parent) {
        parent.childExecutionIds.push(executionId);
      }
    }

    return executionId;
  }

  /**
   * Record tool usage within an execution
   */
  recordToolUsage(
    executionId: string,
    toolName: string,
    success: boolean,
    durationMs: number,
    parameters?: Record<string, unknown>
  ): void {
    const log = this.activeExecutions.get(executionId);
    if (!log) return;

    // Find or create tool usage entry
    let toolUsage = log.toolsUsed.find(t => t.toolName === toolName);
    if (!toolUsage) {
      toolUsage = {
        toolName,
        invocationCount: 0,
        successCount: 0,
        totalDurationMs: 0,
        parameters: [],
      };
      log.toolsUsed.push(toolUsage);
    }

    toolUsage.invocationCount++;
    if (success) toolUsage.successCount++;
    toolUsage.totalDurationMs += durationMs;
    if (parameters) {
      toolUsage.parameters.push(this.sanitizeAndTruncate(parameters, 'input'));
    }
  }

  /**
   * Add context factor during execution
   */
  addContextFactor(
    executionId: string,
    name: string,
    value: unknown,
    influence: 'high' | 'medium' | 'low' = 'medium'
  ): void {
    const log = this.activeExecutions.get(executionId);
    if (!log) return;

    log.contextFactors.push({ name, value, influence });
  }

  /**
   * Complete an execution with success
   */
  completeExecution(
    executionId: string,
    output: Record<string, unknown>,
    tokenCount?: { input: number; output: number; total: number }
  ): void {
    this.finalizeExecution(executionId, 'success', output, tokenCount);
  }

  /**
   * Complete an execution with partial success
   */
  completePartial(
    executionId: string,
    output: Record<string, unknown>,
    tokenCount?: { input: number; output: number; total: number }
  ): void {
    this.finalizeExecution(executionId, 'partial-success', output, tokenCount);
  }

  /**
   * Fail an execution
   */
  failExecution(
    executionId: string,
    error: Error | string,
    errorType?: string,
    tokenCount?: { input: number; output: number; total: number }
  ): void {
    const log = this.activeExecutions.get(executionId);
    if (!log) return;

    log.errorType = errorType || (error instanceof Error ? error.constructor.name : 'Error');
    log.errorMessage = error instanceof Error ? error.message : error;
    log.errorStack = error instanceof Error ? error.stack : undefined;

    this.finalizeExecution(executionId, 'failure', {}, tokenCount);
  }

  /**
   * Cancel an execution
   */
  cancelExecution(executionId: string): void {
    this.finalizeExecution(executionId, 'cancelled', {});
  }

  /**
   * Timeout an execution
   */
  timeoutExecution(executionId: string): void {
    this.finalizeExecution(executionId, 'timeout', {});
  }

  /**
   * Get metrics for the logger
   */
  getMetrics(): {
    activeExecutions: number;
    bufferedLogs: number;
    totalLogged: number;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      bufferedLogs: this.logBuffer.length,
      totalLogged: this.logBuffer.length, // Would track total in production
    };
  }

  /**
   * Force flush all buffered logs
   */
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    if (this.persistFn) {
      try {
        await this.persistFn(logsToFlush);
      } catch (error) {
        // On failure, add back to buffer (with limit)
        console.error('[ExecutionLogger] Failed to persist logs:', error);
        this.logBuffer.unshift(...logsToFlush.slice(0, this.config.batchSize));
      }
    }

    this.emit('flushed', { count: logsToFlush.length });
  }

  /**
   * Shutdown the logger
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private finalizeExecution(
    executionId: string,
    status: ExecutionStatus,
    output: Record<string, unknown>,
    tokenCount?: { input: number; output: number; total: number }
  ): void {
    const log = this.activeExecutions.get(executionId);
    if (!log) return;

    // Calculate duration
    log.durationMs = Date.now() - log.timestamp.getTime();

    // Set final values
    log.status = status;
    log.actionOutput = this.sanitizeAndTruncate(output, 'output');
    if (tokenCount) {
      log.tokenCount = tokenCount;
    }

    // Move from active to buffer
    this.activeExecutions.delete(executionId);

    // Apply sampling if enabled
    if (this.shouldSample(log)) {
      this.logBuffer.push(log);
      this.emit('logged', { executionId, status });

      // Trigger flush if buffer is full
      if (this.logBuffer.length >= this.config.batchSize) {
        this.flush();
      }
    }
  }

  private shouldSample(log: ExecutionLog): boolean {
    if (!this.config.enableSampling) return true;
    if (this.config.samplingRate >= 1.0) return true;

    // Always keep failures, errors, and slow executions
    if (log.status !== 'success') return true;
    if (log.durationMs > 10000) return true; // > 10s

    // Sample successful fast executions
    return Math.random() < this.config.samplingRate;
  }

  private sanitizeAndTruncate(
    data: Record<string, unknown>,
    type: 'input' | 'output'
  ): Record<string, unknown> {
    const maxSize = type === 'input' ? this.config.maxInputSize : this.config.maxOutputSize;

    // Deep clone and sanitize
    const sanitized = this.deepSanitize(structuredClone(data));

    // Check size and truncate if needed
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > maxSize) {
      return {
        _truncated: true,
        _originalSize: serialized.length,
        _preview: serialized.substring(0, 1000) + '...',
      };
    }

    return sanitized as Record<string, unknown>;
  }

  private deepSanitize(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      // Check for potential PII patterns
      return this.redactSensitivePatterns(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item));
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Redact sensitive field names
        const lowerKey = key.toLowerCase();
        if (this.config.sensitiveFields.some(f => lowerKey.includes(f))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.deepSanitize(value);
        }
      }
      return result;
    }

    return obj;
  }

  private redactSensitivePatterns(str: string): string {
    // Redact common PII patterns
    let result = str;

    // Email addresses
    result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

    // SSN patterns
    result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');

    // Credit card patterns
    result = result.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CC_REDACTED]');

    // Phone numbers (US format)
    result = result.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE_REDACTED]');

    return result;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }
}

// ============================================================================
// EXECUTION CONTEXT HELPER
// ============================================================================

/**
 * Helper class for managing execution context through async operations
 */
export class ExecutionContext {
  private logger: ExecutionLogger;
  private executionId: string;

  constructor(logger: ExecutionLogger, executionId: string) {
    this.logger = logger;
    this.executionId = executionId;
  }

  get id(): string {
    return this.executionId;
  }

  recordToolUsage(
    toolName: string,
    success: boolean,
    durationMs: number,
    parameters?: Record<string, unknown>
  ): void {
    this.logger.recordToolUsage(this.executionId, toolName, success, durationMs, parameters);
  }

  addContextFactor(name: string, value: unknown, influence: 'high' | 'medium' | 'low' = 'medium'): void {
    this.logger.addContextFactor(this.executionId, name, value, influence);
  }

  complete(output: Record<string, unknown>, tokenCount?: { input: number; output: number; total: number }): void {
    this.logger.completeExecution(this.executionId, output, tokenCount);
  }

  completePartial(output: Record<string, unknown>, tokenCount?: { input: number; output: number; total: number }): void {
    this.logger.completePartial(this.executionId, output, tokenCount);
  }

  fail(error: Error | string, errorType?: string, tokenCount?: { input: number; output: number; total: number }): void {
    this.logger.failExecution(this.executionId, error, errorType, tokenCount);
  }

  cancel(): void {
    this.logger.cancelExecution(this.executionId);
  }

  timeout(): void {
    this.logger.timeoutExecution(this.executionId);
  }

  /**
   * Create a child execution context
   */
  child(params: {
    actionType: ActionType;
    actionName: string;
    actionInput: Record<string, unknown>;
    agentId?: string;
    agentName?: string;
  }): ExecutionContext {
    // Get parent log to inherit context
    const childId = this.logger.startExecution({
      companyId: '', // Will be inherited
      sessionId: '',
      userId: '',
      agentId: params.agentId || '',
      agentName: params.agentName || '',
      taskId: '',
      actionType: params.actionType,
      actionName: params.actionName,
      actionInput: params.actionInput,
      parentExecutionId: this.executionId,
    });

    return new ExecutionContext(this.logger, childId);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let loggerInstance: ExecutionLogger | null = null;

export function getExecutionLogger(config?: Partial<ExecutionLoggerConfig>): ExecutionLogger {
  if (!loggerInstance) {
    loggerInstance = new ExecutionLogger(config);
  }
  return loggerInstance;
}

export function createExecutionLogger(config?: Partial<ExecutionLoggerConfig>): ExecutionLogger {
  return new ExecutionLogger(config);
}
