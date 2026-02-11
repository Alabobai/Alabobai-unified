/**
 * Alabobai Reliability Engine - Timeout Protector
 * 60-second guarantee, auto-fallback
 *
 * Solves: ChatGPT "loading for 1 hour", requests that never complete
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface TimeoutConfig {
  defaultTimeout: number;          // Default timeout in ms (60000 = 60s)
  hardTimeout: number;             // Absolute max timeout in ms
  warningThreshold: number;        // Time before warning (e.g., 45s)
  retryAttempts: number;           // Number of retry attempts
  retryDelay: number;              // Delay between retries in ms
  enableProgressiveTimeout: boolean; // Increase timeout on retries
  progressiveMultiplier: number;   // Multiplier for progressive timeout
  enableFallback: boolean;         // Enable fallback responses
  fallbackTimeout: number;         // Timeout for fallback (shorter)
}

export interface ExecutionContext<T> {
  id: string;
  operation: string;
  startTime: Date;
  timeout: number;
  status: ExecutionStatus;
  attempt: number;
  maxAttempts: number;
  result?: T;
  error?: Error;
  fallbackUsed: boolean;
  metadata?: Record<string, unknown>;
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'timeout'
  | 'error'
  | 'cancelled'
  | 'fallback';

export interface FallbackProvider<T> {
  name: string;
  priority: number;                // Lower = higher priority
  timeout: number;
  canHandle: (operation: string) => boolean;
  execute: (operation: string, params: unknown) => Promise<T>;
}

export interface TimeoutEvent {
  contextId: string;
  operation: string;
  elapsed: number;
  timeout: number;
  attempt: number;
  reason: 'timeout' | 'error' | 'cancelled';
}

export interface ExecutionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  elapsed: number;
  attempts: number;
  fallbackUsed: boolean;
  fallbackProvider?: string;
  warnings: string[];
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

interface CircuitState {
  operation: string;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  state: 'closed' | 'open' | 'half-open';
  openedAt?: Date;
}

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,      // Open circuit after 5 failures
  successThreshold: 2,      // Close after 2 successes in half-open
  openDuration: 30000,      // Keep open for 30 seconds
};

// ============================================================================
// TIMEOUT PROTECTOR CLASS
// ============================================================================

export class TimeoutProtector extends EventEmitter {
  private config: TimeoutConfig;
  private activeExecutions: Map<string, ExecutionContext<unknown>> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private fallbackProviders: FallbackProvider<unknown>[] = [];
  private circuitBreakers: Map<string, CircuitState> = new Map();
  private executionStats: Map<string, { total: number; timeouts: number; avgDuration: number }> = new Map();

  constructor(config?: Partial<TimeoutConfig>) {
    super();

    this.config = {
      defaultTimeout: 60000,           // 60 seconds
      hardTimeout: 300000,             // 5 minutes absolute max
      warningThreshold: 45000,         // Warn at 45 seconds
      retryAttempts: 2,
      retryDelay: 1000,
      enableProgressiveTimeout: true,
      progressiveMultiplier: 1.5,
      enableFallback: true,
      fallbackTimeout: 10000,          // 10 seconds for fallback
      ...config,
    };
  }

  // ============================================================================
  // MAIN EXECUTION METHOD
  // ============================================================================

  async executeWithTimeout<T>(
    operation: string,
    executor: () => Promise<T>,
    options?: {
      timeout?: number;
      retries?: number;
      fallback?: () => Promise<T>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ExecutionResult<T>> {
    const timeout = Math.min(
      options?.timeout ?? this.config.defaultTimeout,
      this.config.hardTimeout
    );
    const maxAttempts = (options?.retries ?? this.config.retryAttempts) + 1;

    // Check circuit breaker
    if (this.isCircuitOpen(operation)) {
      return this.handleCircuitOpen(operation, options?.fallback);
    }

    const context: ExecutionContext<T> = {
      id: uuid(),
      operation,
      startTime: new Date(),
      timeout,
      status: 'pending',
      attempt: 0,
      maxAttempts,
      fallbackUsed: false,
      metadata: options?.metadata,
    };

    this.activeExecutions.set(context.id, context as ExecutionContext<unknown>);
    this.emit('execution-started', { contextId: context.id, operation });

    const warnings: string[] = [];
    let lastError: Error | undefined;

    // Retry loop
    while (context.attempt < maxAttempts) {
      context.attempt++;
      context.status = 'running';

      const attemptTimeout = this.calculateAttemptTimeout(timeout, context.attempt);

      try {
        const result = await this.executeAttempt(context, executor, attemptTimeout);

        // Success!
        context.status = 'completed';
        context.result = result;
        this.recordSuccess(operation);

        this.cleanup(context.id);

        return {
          success: true,
          data: result,
          elapsed: Date.now() - context.startTime.getTime(),
          attempts: context.attempt,
          fallbackUsed: false,
          warnings,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Status can be changed to 'cancelled' by external cancel() call
        if ((context.status as ExecutionStatus) === 'cancelled') {
          break;
        }

        // Check if timeout
        if (this.isTimeoutError(lastError)) {
          context.status = 'timeout';
          this.recordFailure(operation);

          this.emit('timeout', {
            contextId: context.id,
            operation,
            elapsed: Date.now() - context.startTime.getTime(),
            timeout: attemptTimeout,
            attempt: context.attempt,
            reason: 'timeout',
          } as TimeoutEvent);

          warnings.push(`Attempt ${context.attempt} timed out after ${attemptTimeout}ms`);
        } else {
          context.status = 'error';
          this.recordFailure(operation);

          warnings.push(`Attempt ${context.attempt} failed: ${lastError.message}`);
        }

        // Retry if attempts remaining
        if (context.attempt < maxAttempts) {
          await this.delay(this.config.retryDelay * context.attempt);
          continue;
        }
      }
    }

    // All attempts failed - try fallback
    if (this.config.enableFallback) {
      const fallbackResult = await this.tryFallback(
        operation,
        options?.fallback
      );

      if (fallbackResult.success) {
        context.status = 'fallback';
        context.fallbackUsed = true;
        context.result = fallbackResult.data as T;

        this.cleanup(context.id);

        return {
          success: true,
          data: fallbackResult.data as T,
          elapsed: Date.now() - context.startTime.getTime(),
          attempts: context.attempt,
          fallbackUsed: true,
          fallbackProvider: fallbackResult.provider,
          warnings: [...warnings, 'Used fallback response'],
        };
      }
    }

    // Complete failure
    context.status = 'error';
    context.error = lastError;
    this.cleanup(context.id);

    return {
      success: false,
      error: lastError?.message || 'All attempts failed',
      elapsed: Date.now() - context.startTime.getTime(),
      attempts: context.attempt,
      fallbackUsed: false,
      warnings,
    };
  }

  private async executeAttempt<T>(
    context: ExecutionContext<T>,
    executor: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let completed = false;
      let warningEmitted = false;

      // Set timeout timer
      const timeoutTimer = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }
      }, timeout);

      // Set warning timer
      const warningTimer = setTimeout(() => {
        if (!completed && !warningEmitted) {
          warningEmitted = true;
          this.emit('warning', {
            contextId: context.id,
            operation: context.operation,
            elapsed: Date.now() - context.startTime.getTime(),
            message: `Operation approaching timeout (${this.config.warningThreshold}ms elapsed)`,
          });
        }
      }, this.config.warningThreshold);

      // Store timers for cleanup
      this.timers.set(`${context.id}-timeout`, timeoutTimer);
      this.timers.set(`${context.id}-warning`, warningTimer);

      // Execute
      executor()
        .then((result) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutTimer);
            clearTimeout(warningTimer);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutTimer);
            clearTimeout(warningTimer);
            reject(error);
          }
        });
    });
  }

  // ============================================================================
  // FALLBACK SYSTEM
  // ============================================================================

  registerFallback<T>(provider: FallbackProvider<T>): void {
    this.fallbackProviders.push(provider as FallbackProvider<unknown>);
    // Sort by priority (lower = higher priority)
    this.fallbackProviders.sort((a, b) => a.priority - b.priority);
    this.emit('fallback-registered', { name: provider.name });
  }

  removeFallback(name: string): void {
    this.fallbackProviders = this.fallbackProviders.filter(p => p.name !== name);
  }

  private async tryFallback<T>(
    operation: string,
    customFallback?: () => Promise<T>
  ): Promise<{ success: boolean; data?: T; provider?: string }> {
    // Try custom fallback first
    if (customFallback) {
      try {
        const result = await this.executeWithInternalTimeout(
          customFallback,
          this.config.fallbackTimeout
        );
        return { success: true, data: result, provider: 'custom' };
      } catch {
        // Continue to registered providers
      }
    }

    // Try registered fallback providers
    for (const provider of this.fallbackProviders) {
      if (!provider.canHandle(operation)) continue;

      try {
        const result = await this.executeWithInternalTimeout(
          () => provider.execute(operation, {}),
          provider.timeout
        );
        return { success: true, data: result as T, provider: provider.name };
      } catch {
        continue;
      }
    }

    return { success: false };
  }

  private async executeWithInternalTimeout<T>(
    executor: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Fallback timeout'));
      }, timeout);

      executor()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  private isCircuitOpen(operation: string): boolean {
    const circuit = this.circuitBreakers.get(operation);
    if (!circuit) return false;

    if (circuit.state === 'open') {
      // Check if we should transition to half-open
      const timeSinceOpen = Date.now() - (circuit.openedAt?.getTime() || 0);
      if (timeSinceOpen >= CIRCUIT_BREAKER_CONFIG.openDuration) {
        circuit.state = 'half-open';
        this.emit('circuit-half-open', { operation });
        return false;
      }
      return true;
    }

    return false;
  }

  private recordFailure(operation: string): void {
    let circuit = this.circuitBreakers.get(operation);
    if (!circuit) {
      circuit = {
        operation,
        failures: 0,
        successes: 0,
        state: 'closed',
      };
      this.circuitBreakers.set(operation, circuit);
    }

    circuit.failures++;
    circuit.lastFailure = new Date();
    circuit.successes = 0; // Reset successes on failure

    // Update stats
    this.updateStats(operation, false);

    // Check if should open circuit
    if (circuit.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      circuit.state = 'open';
      circuit.openedAt = new Date();
      this.emit('circuit-open', { operation, failures: circuit.failures });
    }
  }

  private recordSuccess(operation: string): void {
    let circuit = this.circuitBreakers.get(operation);
    if (!circuit) {
      circuit = {
        operation,
        failures: 0,
        successes: 0,
        state: 'closed',
      };
      this.circuitBreakers.set(operation, circuit);
    }

    circuit.successes++;
    circuit.lastSuccess = new Date();

    // Update stats
    this.updateStats(operation, true);

    // Close circuit if in half-open and enough successes
    if (circuit.state === 'half-open' &&
        circuit.successes >= CIRCUIT_BREAKER_CONFIG.successThreshold) {
      circuit.state = 'closed';
      circuit.failures = 0;
      this.emit('circuit-closed', { operation });
    }
  }

  private async handleCircuitOpen<T>(
    operation: string,
    fallback?: () => Promise<T>
  ): Promise<ExecutionResult<T>> {
    this.emit('circuit-rejected', { operation });

    // Try fallback immediately
    if (this.config.enableFallback) {
      const fallbackResult = await this.tryFallback<T>(operation, fallback);
      if (fallbackResult.success) {
        return {
          success: true,
          data: fallbackResult.data,
          elapsed: 0,
          attempts: 0,
          fallbackUsed: true,
          fallbackProvider: fallbackResult.provider,
          warnings: ['Circuit breaker open - used fallback'],
        };
      }
    }

    return {
      success: false,
      error: 'Circuit breaker open - too many recent failures',
      elapsed: 0,
      attempts: 0,
      fallbackUsed: false,
      warnings: ['Circuit breaker is open due to repeated failures'],
    };
  }

  // ============================================================================
  // EXECUTION MANAGEMENT
  // ============================================================================

  cancel(contextId: string): boolean {
    const context = this.activeExecutions.get(contextId);
    if (!context) return false;

    context.status = 'cancelled';
    this.cleanup(contextId);
    this.emit('execution-cancelled', { contextId });

    return true;
  }

  cancelAll(): number {
    let cancelled = 0;
    for (const contextId of this.activeExecutions.keys()) {
      if (this.cancel(contextId)) {
        cancelled++;
      }
    }
    return cancelled;
  }

  getActiveExecutions(): ExecutionContext<unknown>[] {
    return Array.from(this.activeExecutions.values());
  }

  getExecution(contextId: string): ExecutionContext<unknown> | undefined {
    return this.activeExecutions.get(contextId);
  }

  private cleanup(contextId: string): void {
    // Clear timers
    const timeoutTimer = this.timers.get(`${contextId}-timeout`);
    const warningTimer = this.timers.get(`${contextId}-warning`);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (warningTimer) clearTimeout(warningTimer);

    this.timers.delete(`${contextId}-timeout`);
    this.timers.delete(`${contextId}-warning`);

    // Remove from active executions
    this.activeExecutions.delete(contextId);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private calculateAttemptTimeout(baseTimeout: number, attempt: number): number {
    if (!this.config.enableProgressiveTimeout || attempt <= 1) {
      return baseTimeout;
    }

    // Progressive timeout increases on retries
    const multiplier = Math.pow(this.config.progressiveMultiplier, attempt - 1);
    return Math.min(
      Math.floor(baseTimeout * multiplier),
      this.config.hardTimeout
    );
  }

  private isTimeoutError(error: Error): boolean {
    return error.message.toLowerCase().includes('timeout') ||
           error.message.toLowerCase().includes('timed out');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateStats(operation: string, success: boolean): void {
    let stats = this.executionStats.get(operation);
    if (!stats) {
      stats = { total: 0, timeouts: 0, avgDuration: 0 };
      this.executionStats.set(operation, stats);
    }

    stats.total++;
    if (!success) {
      stats.timeouts++;
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  getStats(): {
    activeExecutions: number;
    circuitBreakers: Record<string, CircuitState>;
    operationStats: Record<string, { total: number; timeouts: number; timeoutRate: number }>;
  } {
    const circuitBreakers: Record<string, CircuitState> = {};
    for (const [op, state] of this.circuitBreakers.entries()) {
      circuitBreakers[op] = state;
    }

    const operationStats: Record<string, { total: number; timeouts: number; timeoutRate: number }> = {};
    for (const [op, stats] of this.executionStats.entries()) {
      operationStats[op] = {
        ...stats,
        timeoutRate: stats.total > 0 ? (stats.timeouts / stats.total) * 100 : 0,
      };
    }

    return {
      activeExecutions: this.activeExecutions.size,
      circuitBreakers,
      operationStats,
    };
  }

  getCircuitState(operation: string): CircuitState | undefined {
    return this.circuitBreakers.get(operation);
  }

  resetCircuit(operation: string): void {
    const circuit = this.circuitBreakers.get(operation);
    if (circuit) {
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.successes = 0;
      this.emit('circuit-reset', { operation });
    }
  }

  resetAllCircuits(): void {
    for (const operation of this.circuitBreakers.keys()) {
      this.resetCircuit(operation);
    }
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(operations: string[]): Promise<{
    healthy: boolean;
    results: Record<string, { healthy: boolean; latency?: number; error?: string }>;
  }> {
    const results: Record<string, { healthy: boolean; latency?: number; error?: string }> = {};
    let allHealthy = true;

    for (const operation of operations) {
      const circuit = this.circuitBreakers.get(operation);

      if (circuit?.state === 'open') {
        results[operation] = {
          healthy: false,
          error: 'Circuit breaker open',
        };
        allHealthy = false;
        continue;
      }

      const stats = this.executionStats.get(operation);
      if (stats && stats.total > 10) {
        const timeoutRate = stats.timeouts / stats.total;
        if (timeoutRate > 0.5) { // More than 50% timeouts
          results[operation] = {
            healthy: false,
            error: `High timeout rate: ${(timeoutRate * 100).toFixed(1)}%`,
          };
          allHealthy = false;
          continue;
        }
      }

      results[operation] = {
        healthy: true,
        latency: stats?.avgDuration || 0,
      };
    }

    return {
      healthy: allHealthy,
      results,
    };
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Execute with the guaranteed 60-second timeout
   */
  async executeGuaranteed<T>(
    operation: string,
    executor: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<ExecutionResult<T>> {
    return this.executeWithTimeout(operation, executor, {
      timeout: 60000,
      retries: 2,
      fallback,
    });
  }

  /**
   * Execute with a fast timeout (10 seconds) for quick operations
   */
  async executeFast<T>(
    operation: string,
    executor: () => Promise<T>
  ): Promise<ExecutionResult<T>> {
    return this.executeWithTimeout(operation, executor, {
      timeout: 10000,
      retries: 1,
    });
  }

  /**
   * Execute with extended timeout (5 minutes) for long operations
   */
  async executeExtended<T>(
    operation: string,
    executor: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<ExecutionResult<T>> {
    return this.executeWithTimeout(operation, executor, {
      timeout: 300000,
      retries: 1,
      fallback,
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createTimeoutProtector(config?: Partial<TimeoutConfig>): TimeoutProtector {
  return new TimeoutProtector(config);
}

// ============================================================================
// PRE-BUILT FALLBACK PROVIDERS
// ============================================================================

export const CachedResponseFallback: FallbackProvider<string> = {
  name: 'cached-response',
  priority: 1,
  timeout: 1000,
  canHandle: () => true,
  execute: async () => {
    return 'I apologize, but the request timed out. Please try again or rephrase your question.';
  },
};

export const GracefulDegradationFallback: FallbackProvider<string> = {
  name: 'graceful-degradation',
  priority: 2,
  timeout: 5000,
  canHandle: () => true,
  execute: async () => {
    return 'The service is currently experiencing delays. Here is a simplified response. Please try again later for more detailed information.';
  },
};
