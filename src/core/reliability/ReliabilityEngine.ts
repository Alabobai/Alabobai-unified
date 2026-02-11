/**
 * Alabobai Reliability Engine - Main Orchestrator
 * Unified reliability layer that combines all reliability components
 *
 * Solves:
 * - ChatGPT "loading for 1 hour" -> TimeoutProtector (60-second guarantee)
 * - Claude "inconsistent bugs" -> ConsistencyManager (model pinning, reproducibility)
 * - Perplexity "hallucinations" -> FactChecker + ConfidenceScorer (source verification)
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// Import all reliability components
import {
  ConfidenceScorer,
  ConfidenceScore,
  ScoringConfig,
  SourceInfo,
  SourceQuality,
  createConfidenceScorer,
} from './ConfidenceScorer.js';

import {
  CheckpointManager,
  Checkpoint,
  CheckpointState,
  CheckpointConfig,
  createCheckpointManager,
} from './CheckpointManager.js';

import {
  FactChecker,
  FactCheckReport,
  FactCheckerConfig,
  Claim,
  VerificationResult,
  createFactChecker,
} from './FactChecker.js';

import {
  ConsistencyManager,
  ConsistencyProfile,
  ConsistencyConfig,
  ConsistencyCheck,
  ExecutionRecord,
  ConsistencyManagerConfig,
  createConsistencyManager,
} from './ConsistencyManager.js';

import {
  TimeoutProtector,
  TimeoutConfig,
  ExecutionResult,
  FallbackProvider,
  createTimeoutProtector,
  CachedResponseFallback,
  GracefulDegradationFallback,
} from './TimeoutProtector.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ReliabilityEngineConfig {
  confidence: Partial<ScoringConfig>;
  checkpoint: Partial<CheckpointConfig>;
  factCheck: Partial<FactCheckerConfig>;
  consistency: Partial<ConsistencyManagerConfig>;
  timeout: Partial<TimeoutConfig>;
  globalSettings: {
    enabled: boolean;
    strictMode: boolean;                    // Fail on reliability issues
    minConfidenceThreshold: number;         // Min confidence to proceed
    enableAutoCheckpoint: boolean;
    autoCheckpointInterval: number;         // ms
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface ReliableRequest {
  id: string;
  sessionId: string;
  input: string;
  operation: string;
  profileId?: string;                       // Consistency profile
  sources?: SourceInfo[];
  knownFacts?: string[];
  domain?: string;
  requireFactCheck: boolean;
  requireConsistency: boolean;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface ReliableResponse {
  id: string;
  requestId: string;
  success: boolean;
  output: string;
  confidence: ConfidenceScore;
  factCheckReport?: FactCheckReport;
  consistencyCheck?: ConsistencyCheck;
  executionResult: ExecutionResult<string>;
  checkpoint?: Checkpoint;
  warnings: string[];
  suggestions: string[];
  metadata: {
    elapsed: number;
    attempts: number;
    fallbackUsed: boolean;
    checkpointCreated: boolean;
  };
  timestamp: Date;
}

export interface ReliabilityReport {
  sessionId: string;
  totalRequests: number;
  averageConfidence: number;
  averageResponseTime: number;
  timeoutRate: number;
  consistencyRate: number;
  factCheckPassRate: number;
  checkpointsCreated: number;
  fallbacksUsed: number;
  warnings: string[];
  generatedAt: Date;
}

// ============================================================================
// RELIABILITY ENGINE CLASS
// ============================================================================

export class ReliabilityEngine extends EventEmitter {
  private config: ReliabilityEngineConfig;

  // Components
  private confidenceScorer: ConfidenceScorer;
  private checkpointManager: CheckpointManager;
  private factChecker: FactChecker;
  private consistencyManager: ConsistencyManager;
  private timeoutProtector: TimeoutProtector;

  // State
  private initialized: boolean = false;
  private requestHistory: Map<string, ReliableResponse[]> = new Map();
  private currentState: Map<string, CheckpointState> = new Map();

  constructor(config?: Partial<ReliabilityEngineConfig>) {
    super();

    // Default configuration
    this.config = {
      confidence: {},
      checkpoint: {},
      factCheck: {},
      consistency: {},
      timeout: {},
      globalSettings: {
        enabled: true,
        strictMode: false,
        minConfidenceThreshold: 40,
        enableAutoCheckpoint: true,
        autoCheckpointInterval: 30000,
        logLevel: 'info',
        ...config?.globalSettings,
      },
      ...config,
    };

    // Initialize components
    this.confidenceScorer = createConfidenceScorer(this.config.confidence);
    this.checkpointManager = new CheckpointManager(this.config.checkpoint);
    this.factChecker = createFactChecker(this.config.factCheck);
    this.consistencyManager = createConsistencyManager(this.config.consistency);
    this.timeoutProtector = createTimeoutProtector(this.config.timeout);

    // Register default fallback providers
    this.timeoutProtector.registerFallback(CachedResponseFallback);
    this.timeoutProtector.registerFallback(GracefulDegradationFallback);

    // Set up event forwarding
    this.setupEventForwarding();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize checkpoint manager (requires async init)
      await this.checkpointManager.initialize();

      this.initialized = true;
      this.emit('initialized');
      this.log('info', 'Reliability Engine initialized');
    } catch (error) {
      this.emit('error', { type: 'initialization', error });
      throw error;
    }
  }

  // ============================================================================
  // MAIN EXECUTION METHOD
  // ============================================================================

  async execute(
    request: ReliableRequest,
    executor: () => Promise<string>
  ): Promise<ReliableResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const responseId = uuid();
    const warnings: string[] = [];
    const suggestions: string[] = [];

    this.emit('request-started', { requestId: request.id, operation: request.operation });

    try {
      // Step 1: Execute with timeout protection
      const executionResult = await this.timeoutProtector.executeWithTimeout(
        request.operation,
        executor,
        {
          timeout: request.timeout || 60000,
          retries: 2,
          metadata: request.metadata,
        }
      );

      if (!executionResult.success) {
        return this.createFailureResponse(
          responseId,
          request,
          executionResult,
          warnings,
          suggestions,
          startTime
        );
      }

      const output = executionResult.data!;
      warnings.push(...executionResult.warnings);

      // Step 2: Score confidence
      const confidence = await this.confidenceScorer.scoreResponse(output, {
        query: request.input,
        sources: request.sources,
        domain: request.domain,
        facts: request.knownFacts,
      });

      if (confidence.overall < this.config.globalSettings.minConfidenceThreshold) {
        warnings.push(`Low confidence score: ${confidence.overall}/100`);
      }
      suggestions.push(...confidence.suggestions);

      // Step 3: Fact check (if required)
      let factCheckReport: FactCheckReport | undefined;
      if (request.requireFactCheck) {
        factCheckReport = await this.factChecker.checkResponse(output, {
          domain: request.domain,
          knownFacts: request.knownFacts,
          sources: request.sources,
        });

        if (factCheckReport.overallScore < 50) {
          warnings.push(`Fact check concerns: ${factCheckReport.summary}`);
        }
        warnings.push(...factCheckReport.warnings);
      }

      // Step 4: Consistency check (if profile provided)
      let consistencyCheck: ConsistencyCheck | undefined;
      if (request.requireConsistency && request.profileId) {
        // Record execution for consistency tracking
        await this.consistencyManager.recordExecution(
          request.profileId,
          request.input,
          output,
          Date.now() - startTime,
          { input: 0, output: 0, total: 0 }, // Token usage would come from LLM
          request.metadata
        );

        consistencyCheck = await this.consistencyManager.checkConsistency(
          request.profileId,
          request.input,
          output
        );

        if (!consistencyCheck.isConsistent) {
          warnings.push(`Consistency drift detected: ${consistencyCheck.drift.recommendation}`);
        }
      }

      // Step 5: Create checkpoint (if enabled)
      let checkpoint: Checkpoint | undefined;
      if (this.config.globalSettings.enableAutoCheckpoint) {
        const state = this.getCurrentState(request.sessionId);
        if (state) {
          checkpoint = await this.checkpointManager.createCheckpoint(
            request.sessionId,
            state,
            'auto',
            `After request: ${request.id}`,
            'task-complete'
          );
        }
      }

      // Step 6: Check strict mode
      if (this.config.globalSettings.strictMode) {
        if (confidence.overall < this.config.globalSettings.minConfidenceThreshold) {
          throw new Error(`Confidence ${confidence.overall} below threshold ${this.config.globalSettings.minConfidenceThreshold}`);
        }

        if (factCheckReport && factCheckReport.overallStatus === 'false') {
          throw new Error('Fact check failed - response contains false information');
        }
      }

      // Build response
      const response: ReliableResponse = {
        id: responseId,
        requestId: request.id,
        success: true,
        output,
        confidence,
        factCheckReport,
        consistencyCheck,
        executionResult,
        checkpoint,
        warnings,
        suggestions,
        metadata: {
          elapsed: Date.now() - startTime,
          attempts: executionResult.attempts,
          fallbackUsed: executionResult.fallbackUsed,
          checkpointCreated: !!checkpoint,
        },
        timestamp: new Date(),
      };

      // Store in history
      this.storeResponse(request.sessionId, response);

      this.emit('request-completed', {
        requestId: request.id,
        responseId,
        confidence: confidence.overall,
        elapsed: response.metadata.elapsed,
      });

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Request failed: ${errorMessage}`);

      // Create failure response with low confidence
      const failureResponse: ReliableResponse = {
        id: responseId,
        requestId: request.id,
        success: false,
        output: '',
        confidence: {
          overall: 0,
          grade: 'F',
          factors: {
            sourceQuality: 0,
            consistency: 0,
            specificity: 0,
            recency: 0,
            verifiability: 0,
            hedging: 0,
            citationDensity: 0,
            domainMatch: 0,
            crossReference: 0,
            modelConfidence: 0,
          },
          explanation: `Request failed: ${errorMessage}`,
          warnings: [errorMessage],
          suggestions: ['Retry the request', 'Check input validity'],
          sources: [],
          timestamp: new Date(),
        },
        executionResult: {
          success: false,
          error: errorMessage,
          elapsed: Date.now() - startTime,
          attempts: 0,
          fallbackUsed: false,
          warnings: [],
        },
        warnings: [errorMessage, ...warnings],
        suggestions,
        metadata: {
          elapsed: Date.now() - startTime,
          attempts: 0,
          fallbackUsed: false,
          checkpointCreated: false,
        },
        timestamp: new Date(),
      };

      this.storeResponse(request.sessionId, failureResponse);
      this.emit('request-failed', { requestId: request.id, error: errorMessage });

      return failureResponse;
    }
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Execute with full reliability checks
   */
  async executeReliable(
    sessionId: string,
    input: string,
    executor: () => Promise<string>,
    options?: {
      sources?: SourceInfo[];
      domain?: string;
      profileId?: string;
    }
  ): Promise<ReliableResponse> {
    return this.execute(
      {
        id: uuid(),
        sessionId,
        input,
        operation: 'reliable-execution',
        profileId: options?.profileId,
        sources: options?.sources,
        domain: options?.domain,
        requireFactCheck: true,
        requireConsistency: !!options?.profileId,
      },
      executor
    );
  }

  /**
   * Execute with quick confidence check only
   */
  async executeQuick(
    sessionId: string,
    input: string,
    executor: () => Promise<string>
  ): Promise<ReliableResponse> {
    return this.execute(
      {
        id: uuid(),
        sessionId,
        input,
        operation: 'quick-execution',
        requireFactCheck: false,
        requireConsistency: false,
        timeout: 30000,
      },
      executor
    );
  }

  /**
   * Execute with strict fact checking
   */
  async executeVerified(
    sessionId: string,
    input: string,
    executor: () => Promise<string>,
    sources: SourceInfo[],
    knownFacts?: string[]
  ): Promise<ReliableResponse> {
    return this.execute(
      {
        id: uuid(),
        sessionId,
        input,
        operation: 'verified-execution',
        sources,
        knownFacts,
        requireFactCheck: true,
        requireConsistency: false,
      },
      executor
    );
  }

  // ============================================================================
  // PROFILE MANAGEMENT
  // ============================================================================

  createConsistencyProfile(
    name: string,
    modelId: string,
    systemPrompt: string,
    config?: Partial<ConsistencyConfig>
  ): ConsistencyProfile {
    return this.consistencyManager.createProfile(name, modelId, systemPrompt, config);
  }

  getConsistencyProfile(profileId: string): ConsistencyProfile | undefined {
    return this.consistencyManager.getProfile(profileId);
  }

  // ============================================================================
  // CHECKPOINT MANAGEMENT
  // ============================================================================

  async createCheckpoint(
    sessionId: string,
    label?: string
  ): Promise<Checkpoint | null> {
    const state = this.getCurrentState(sessionId);
    if (!state) return null;

    return this.checkpointManager.createCheckpoint(
      sessionId,
      state,
      'manual',
      label,
      'user-request'
    );
  }

  async restoreCheckpoint(checkpointId: string): Promise<CheckpointState> {
    return this.checkpointManager.restoreCheckpoint(checkpointId);
  }

  getCheckpoints(sessionId: string): Checkpoint[] {
    return this.checkpointManager.getCheckpoints(sessionId);
  }

  startAutoCheckpoint(sessionId: string): void {
    this.checkpointManager.startAutoSave(sessionId, () => {
      return this.getCurrentState(sessionId) || this.createEmptyState(sessionId);
    });
  }

  stopAutoCheckpoint(sessionId: string): void {
    this.checkpointManager.stopAutoSave(sessionId);
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  updateState(sessionId: string, state: Partial<CheckpointState>): void {
    const current = this.currentState.get(sessionId) || this.createEmptyState(sessionId);
    this.currentState.set(sessionId, {
      ...current,
      ...state,
    });
  }

  getCurrentState(sessionId: string): CheckpointState | undefined {
    return this.currentState.get(sessionId);
  }

  private createEmptyState(sessionId: string): CheckpointState {
    const state: CheckpointState = {
      conversation: {
        messages: [],
        context: {},
      },
      tasks: [],
      agents: [],
      memory: {
        shortTerm: {},
        longTerm: {},
      },
    };
    this.currentState.set(sessionId, state);
    return state;
  }

  // ============================================================================
  // FALLBACK MANAGEMENT
  // ============================================================================

  registerFallback<T>(provider: FallbackProvider<T>): void {
    this.timeoutProtector.registerFallback(provider as FallbackProvider<unknown>);
  }

  // ============================================================================
  // SOURCE CLASSIFICATION
  // ============================================================================

  classifySource(url: string): SourceInfo {
    return this.confidenceScorer.classifySource(url);
  }

  getSourceQualityRanking(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(SourceQuality)) {
      if (isNaN(Number(key))) {
        result[key] = value as number;
      }
    }
    return result;
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  generateReport(sessionId: string): ReliabilityReport {
    const history = this.requestHistory.get(sessionId) || [];

    if (history.length === 0) {
      return {
        sessionId,
        totalRequests: 0,
        averageConfidence: 0,
        averageResponseTime: 0,
        timeoutRate: 0,
        consistencyRate: 100,
        factCheckPassRate: 100,
        checkpointsCreated: 0,
        fallbacksUsed: 0,
        warnings: ['No requests recorded for this session'],
        generatedAt: new Date(),
      };
    }

    const successful = history.filter(r => r.success);
    const totalConfidence = successful.reduce((sum, r) => sum + r.confidence.overall, 0);
    const totalTime = history.reduce((sum, r) => sum + r.metadata.elapsed, 0);
    const timeouts = history.filter(r => !r.success && r.warnings.some(w => w.includes('timeout')));
    const consistent = history.filter(r => !r.consistencyCheck || r.consistencyCheck.isConsistent);
    const factCheckPassed = history.filter(r =>
      !r.factCheckReport || r.factCheckReport.overallScore >= 50
    );
    const checkpoints = history.filter(r => r.metadata.checkpointCreated);
    const fallbacks = history.filter(r => r.metadata.fallbackUsed);

    const allWarnings = new Set<string>();
    history.forEach(r => r.warnings.forEach(w => allWarnings.add(w)));

    return {
      sessionId,
      totalRequests: history.length,
      averageConfidence: successful.length > 0 ? totalConfidence / successful.length : 0,
      averageResponseTime: totalTime / history.length,
      timeoutRate: (timeouts.length / history.length) * 100,
      consistencyRate: (consistent.length / history.length) * 100,
      factCheckPassRate: (factCheckPassed.length / history.length) * 100,
      checkpointsCreated: checkpoints.length,
      fallbacksUsed: fallbacks.length,
      warnings: Array.from(allWarnings).slice(0, 10),
      generatedAt: new Date(),
    };
  }

  getGlobalStats(): {
    confidence: { averageConfidence: number };
    checkpoint: ReturnType<CheckpointManager['getStats']>;
    factCheck: ReturnType<FactChecker['getStats']>;
    consistency: ReturnType<ConsistencyManager['getStats']>;
    timeout: ReturnType<TimeoutProtector['getStats']>;
  } {
    return {
      confidence: {
        averageConfidence: this.confidenceScorer.getAverageConfidence(),
      },
      checkpoint: this.checkpointManager.getStats(),
      factCheck: this.factChecker.getStats(),
      consistency: this.consistencyManager.getStats(),
      timeout: this.timeoutProtector.getStats(),
    };
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<{
    healthy: boolean;
    components: Record<string, { healthy: boolean; details?: string }>;
  }> {
    const components: Record<string, { healthy: boolean; details?: string }> = {
      confidenceScorer: { healthy: true },
      checkpointManager: { healthy: true },
      factChecker: { healthy: true },
      consistencyManager: { healthy: true },
      timeoutProtector: { healthy: true },
    };

    // Check timeout protector
    const timeoutStats = this.timeoutProtector.getStats();
    const openCircuits = Object.values(timeoutStats.circuitBreakers).filter(
      c => c.state === 'open'
    );
    if (openCircuits.length > 0) {
      components.timeoutProtector = {
        healthy: false,
        details: `${openCircuits.length} circuit breaker(s) open`,
      };
    }

    // Check consistency manager
    const consistencyStats = this.consistencyManager.getStats();
    if (consistencyStats.averageSuccessRate < 80) {
      components.consistencyManager = {
        healthy: false,
        details: `Low consistency rate: ${consistencyStats.averageSuccessRate.toFixed(1)}%`,
      };
    }

    // Check confidence scorer
    const avgConfidence = this.confidenceScorer.getAverageConfidence();
    if (avgConfidence > 0 && avgConfidence < 50) {
      components.confidenceScorer = {
        healthy: false,
        details: `Low average confidence: ${avgConfidence.toFixed(1)}`,
      };
    }

    const allHealthy = Object.values(components).every(c => c.healthy);

    return {
      healthy: allHealthy,
      components,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createFailureResponse(
    responseId: string,
    request: ReliableRequest,
    executionResult: ExecutionResult<string>,
    warnings: string[],
    suggestions: string[],
    startTime: number
  ): ReliableResponse {
    return {
      id: responseId,
      requestId: request.id,
      success: false,
      output: executionResult.data || '',
      confidence: {
        overall: executionResult.fallbackUsed ? 30 : 0,
        grade: executionResult.fallbackUsed ? 'D' : 'F',
        factors: {
          sourceQuality: 0,
          consistency: 0,
          specificity: 0,
          recency: 0,
          verifiability: 0,
          hedging: 0,
          citationDensity: 0,
          domainMatch: 0,
          crossReference: 0,
          modelConfidence: 0,
        },
        explanation: executionResult.error || 'Execution failed',
        warnings: executionResult.warnings,
        suggestions: ['Retry the request', 'Check service availability'],
        sources: [],
        timestamp: new Date(),
      },
      executionResult,
      warnings: [...warnings, ...executionResult.warnings],
      suggestions,
      metadata: {
        elapsed: Date.now() - startTime,
        attempts: executionResult.attempts,
        fallbackUsed: executionResult.fallbackUsed,
        checkpointCreated: false,
      },
      timestamp: new Date(),
    };
  }

  private storeResponse(sessionId: string, response: ReliableResponse): void {
    const history = this.requestHistory.get(sessionId) || [];
    history.push(response);

    // Keep last 100 responses per session
    while (history.length > 100) {
      history.shift();
    }

    this.requestHistory.set(sessionId, history);
  }

  private setupEventForwarding(): void {
    // Forward events from components
    this.confidenceScorer.on('score-calculated', (data) =>
      this.emit('confidence:score-calculated', data)
    );
    this.confidenceScorer.on('low-confidence', (data) =>
      this.emit('confidence:low-confidence', data)
    );

    this.checkpointManager.on('checkpoint-created', (data) =>
      this.emit('checkpoint:created', data)
    );
    this.checkpointManager.on('checkpoint-restored', (data) =>
      this.emit('checkpoint:restored', data)
    );

    this.factChecker.on('report-generated', (data) =>
      this.emit('factcheck:report-generated', data)
    );
    this.factChecker.on('low-reliability', (data) =>
      this.emit('factcheck:low-reliability', data)
    );

    this.consistencyManager.on('drift-detected', (data) =>
      this.emit('consistency:drift-detected', data)
    );
    this.consistencyManager.on('profile-created', (data) =>
      this.emit('consistency:profile-created', data)
    );

    this.timeoutProtector.on('timeout', (data) =>
      this.emit('timeout:timeout', data)
    );
    this.timeoutProtector.on('circuit-open', (data) =>
      this.emit('timeout:circuit-open', data)
    );
    this.timeoutProtector.on('warning', (data) =>
      this.emit('timeout:warning', data)
    );
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.globalSettings.logLevel);
    const messageLevel = levels.indexOf(level);

    if (messageLevel >= configLevel) {
      const prefix = `[ReliabilityEngine][${level.toUpperCase()}]`;
      console[level](`${prefix} ${message}`);
    }
  }

  // ============================================================================
  // SHUTDOWN
  // ============================================================================

  async shutdown(): Promise<void> {
    this.log('info', 'Shutting down Reliability Engine...');

    // Stop all auto-checkpoints
    this.checkpointManager.stopAllAutoSave();

    // Final checkpoint
    await this.checkpointManager.shutdown();

    // Cancel active executions
    this.timeoutProtector.cancelAll();

    this.emit('shutdown');
    this.log('info', 'Reliability Engine shutdown complete');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export async function createReliabilityEngine(
  config?: Partial<ReliabilityEngineConfig>
): Promise<ReliabilityEngine> {
  const engine = new ReliabilityEngine(config);
  await engine.initialize();
  return engine;
}

// ============================================================================
// RE-EXPORT ALL TYPES
// ============================================================================

export {
  // Confidence Scorer
  ConfidenceScorer,
  ConfidenceScore,
  ScoringConfig,
  SourceInfo,
  SourceQuality,
  createConfidenceScorer,

  // Checkpoint Manager
  CheckpointManager,
  Checkpoint,
  CheckpointState,
  CheckpointConfig,
  createCheckpointManager,

  // Fact Checker
  FactChecker,
  FactCheckReport,
  FactCheckerConfig,
  Claim,
  VerificationResult,
  createFactChecker,

  // Consistency Manager
  ConsistencyManager,
  ConsistencyProfile,
  ConsistencyConfig,
  ConsistencyCheck,
  ExecutionRecord,
  ConsistencyManagerConfig,
  createConsistencyManager,

  // Timeout Protector
  TimeoutProtector,
  TimeoutConfig,
  ExecutionResult,
  FallbackProvider,
  createTimeoutProtector,
  CachedResponseFallback,
  GracefulDegradationFallback,
};
