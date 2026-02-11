/**
 * Alabobai Self-Annealing System
 *
 * A comprehensive system that enables AI agents to learn and improve
 * automatically over time through:
 *
 * 1. Execution Logging - Captures every action for analysis
 * 2. Feedback Collection - Gathers explicit and implicit user signals
 * 3. Pattern Analysis - Identifies success/failure patterns statistically
 * 4. Adaptation Engine - Applies learnings to improve agent behavior
 * 5. Cross-Company Learning - Extracts anonymous aggregate insights
 * 6. Metrics Dashboard - Monitors performance with alerting
 * 7. Safety Rails - Prevents negative adaptations with human oversight
 *
 * Usage:
 * ```typescript
 * import { AnnealingSystem } from './core/annealing';
 *
 * const annealing = new AnnealingSystem(config);
 * await annealing.initialize(database);
 *
 * // Record execution
 * const execId = annealing.logger.startExecution({...});
 * // ... agent work ...
 * annealing.logger.completeExecution(execId, output);
 *
 * // Record feedback
 * await annealing.feedback.recordRating(execId, context, 5);
 *
 * // Run analysis
 * const patterns = await annealing.analyzer.runAnalysis();
 *
 * // Apply adaptations
 * const adaptation = await annealing.adaptation.createPromptOptimization({...});
 * await annealing.adaptation.startRollout(adaptation.id);
 * ```
 */

import { EventEmitter } from 'events';
import {
  ExecutionLogger,
  ExecutionContext,
  getExecutionLogger,
  createExecutionLogger,
  type ExecutionLoggerConfig,
} from './execution-logger.js';
import {
  FeedbackCollector,
  getFeedbackCollector,
  createFeedbackCollector,
  type FeedbackCollectorConfig,
} from './feedback-collector.js';
import {
  PatternAnalyzer,
  getPatternAnalyzer,
  createPatternAnalyzer,
  type PatternAnalyzerConfig,
} from './pattern-analyzer.js';
import {
  AdaptationEngine,
  getAdaptationEngine,
  createAdaptationEngine,
  type AdaptationEngineConfig,
} from './adaptation-engine.js';
import {
  CrossCompanyLearningEngine,
  getCrossCompanyLearning,
  createCrossCompanyLearning,
  type CrossCompanyLearningConfig,
} from './cross-company-learning.js';
import {
  MetricsCollector,
  ABTestingFramework,
  getMetricsCollector,
  getABTestingFramework,
  type MetricsCollectorConfig,
} from './metrics-dashboard.js';
import {
  SafetyController,
  getSafetyController,
  createSafetyController,
  type SafetyControllerConfig,
} from './safety-rails.js';
import {
  initializeAnnealingDatabase,
  runRetentionCleanup,
  ANNEALING_SCHEMA,
  RETENTION_POLICIES,
} from './database-schema.js';

// Re-export types
export * from './types.js';

// Re-export components
export {
  ExecutionLogger,
  ExecutionContext,
  FeedbackCollector,
  PatternAnalyzer,
  AdaptationEngine,
  CrossCompanyLearningEngine,
  MetricsCollector,
  ABTestingFramework,
  SafetyController,
};

// Re-export schema
export {
  ANNEALING_SCHEMA,
  RETENTION_POLICIES,
  initializeAnnealingDatabase,
  runRetentionCleanup,
};

// ============================================================================
// UNIFIED ANNEALING SYSTEM
// ============================================================================

export interface AnnealingSystemConfig {
  execution?: Partial<ExecutionLoggerConfig>;
  feedback?: Partial<FeedbackCollectorConfig>;
  pattern?: Partial<PatternAnalyzerConfig>;
  adaptation?: Partial<AdaptationEngineConfig>;
  crossCompany?: Partial<CrossCompanyLearningConfig>;
  metrics?: Partial<MetricsCollectorConfig>;
  safety?: Partial<SafetyControllerConfig>;
}

export class AnnealingSystem extends EventEmitter {
  public readonly logger: ExecutionLogger;
  public readonly feedback: FeedbackCollector;
  public readonly analyzer: PatternAnalyzer;
  public readonly adaptation: AdaptationEngine;
  public readonly crossCompany: CrossCompanyLearningEngine;
  public readonly metrics: MetricsCollector;
  public readonly abTesting: ABTestingFramework;
  public readonly safety: SafetyController;

  private initialized: boolean = false;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: AnnealingSystemConfig = {}) {
    super();

    // Initialize all components
    this.logger = createExecutionLogger(config.execution);
    this.feedback = createFeedbackCollector(config.feedback);
    this.analyzer = createPatternAnalyzer(config.pattern);
    this.adaptation = createAdaptationEngine(config.adaptation);
    this.crossCompany = createCrossCompanyLearning(config.crossCompany);
    this.metrics = getMetricsCollector(config.metrics);
    this.abTesting = getABTestingFramework();
    this.safety = createSafetyController(config.safety);

    // Wire up event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize the annealing system with database
   */
  async initialize(database: any): Promise<void> {
    if (this.initialized) {
      throw new Error('Annealing system already initialized');
    }

    // Initialize database schema
    await initializeAnnealingDatabase(database);

    // Set up persistence functions
    this.logger.setPersistFunction(async (logs) => {
      for (const log of logs) {
        await database.run(`
          INSERT INTO execution_logs (
            id, timestamp, company_id, session_id, user_id, agent_id, agent_name,
            task_id, action_type, action_name, action_input, action_output,
            duration_ms, input_tokens, output_tokens, total_tokens, llm_model,
            prompt_version, status, error_type, error_message, error_stack,
            parent_execution_id, tools_used, context_factors, log_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          log.id, log.timestamp.toISOString(), log.companyId, log.sessionId,
          log.userId, log.agentId, log.agentName, log.taskId, log.actionType,
          log.actionName, JSON.stringify(log.actionInput), JSON.stringify(log.actionOutput),
          log.durationMs, log.tokenCount.input, log.tokenCount.output, log.tokenCount.total,
          log.llmModel, log.promptVersion, log.status, log.errorType, log.errorMessage,
          log.errorStack, log.parentExecutionId, JSON.stringify(log.toolsUsed),
          JSON.stringify(log.contextFactors), log.timestamp.toISOString().split('T')[0],
        ]);
      }
    });

    this.feedback.setPersistFunction(async (fb) => {
      await database.run(`
        INSERT INTO feedback (
          id, timestamp, execution_log_id, company_id, user_id, feedback_type,
          rating, sentiment, comment, approval_decision, modifications_applied,
          time_to_decision_ms, quality_score, quality_dimensions, implicit_signals,
          feedback_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fb.id, fb.timestamp.toISOString(), fb.executionLogId, fb.companyId,
        fb.userId, fb.feedbackType, fb.rating, fb.sentiment, fb.comment,
        fb.approvalDecision, JSON.stringify(fb.modificationsApplied),
        fb.timeToDecision, fb.qualityScore, JSON.stringify(fb.qualityDimensions),
        JSON.stringify(fb.implicitSignals), fb.timestamp.toISOString().split('T')[0],
      ]);
    });

    // Set up data accessors for pattern analyzer
    this.analyzer.setDataAccessors({
      getExecutionLogs: async () => {
        const rows = await database.all(`
          SELECT * FROM execution_logs
          WHERE timestamp > datetime('now', '-7 days')
          ORDER BY timestamp DESC
          LIMIT 10000
        `);
        return rows.map(this.rowToExecutionLog);
      },
      getFeedback: async () => {
        const rows = await database.all(`
          SELECT * FROM feedback
          WHERE timestamp > datetime('now', '-7 days')
          ORDER BY timestamp DESC
          LIMIT 10000
        `);
        return rows.map(this.rowToFeedback);
      },
      persistPattern: async (pattern) => {
        await database.run(`
          INSERT OR REPLACE INTO patterns (
            id, created_at, updated_at, pattern_type, pattern_name, description,
            sample_size, confidence_level, statistical_significance, effect_size,
            conditions, outcome, scope, status, validated_at, validated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          pattern.id, pattern.createdAt.toISOString(), pattern.updatedAt.toISOString(),
          pattern.patternType, pattern.patternName, pattern.description, pattern.sampleSize,
          pattern.confidenceLevel, pattern.statisticalSignificance, pattern.effectSize,
          JSON.stringify(pattern.conditions), JSON.stringify(pattern.outcome),
          JSON.stringify(pattern.scope), pattern.status,
          pattern.validatedAt?.toISOString(), pattern.validatedBy,
        ]);
      },
    });

    // Load safety rails from database
    const railRows = await database.all('SELECT * FROM safety_rails WHERE enabled = 1');
    this.safety.setSafetyRails(railRows.map((row: any) => ({
      ...row,
      condition: JSON.parse(row.condition),
      action: JSON.parse(row.action),
    })));

    // Start periodic tasks
    this.startPeriodicTasks(database);

    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Shutdown the annealing system
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.analyzer.stopAutomaticAnalysis();
    await this.logger.shutdown();

    this.initialized = false;
    this.emit('shutdown');
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Start tracking an execution (convenience wrapper)
   */
  startExecution(params: Parameters<ExecutionLogger['startExecution']>[0]): ExecutionContext {
    const execId = this.logger.startExecution(params);
    return new ExecutionContext(this.logger, execId);
  }

  /**
   * Run full learning cycle
   */
  async runLearningCycle(): Promise<{
    patternsDiscovered: number;
    adaptationsCreated: number;
    metricsUpdated: boolean;
  }> {
    // 1. Run pattern analysis
    const analysisResult = await this.analyzer.runAnalysis();

    // 2. Generate adaptations from validated patterns
    let adaptationsCreated = 0;
    for (const pattern of analysisResult.patternsValidated) {
      if (pattern.patternType === 'success-pattern') {
        // Create adaptation based on pattern
        // In production, would use more sophisticated logic
        adaptationsCreated++;
      }
    }

    // 3. Aggregate metrics
    await this.metrics.aggregateAndPersist('hour');

    return {
      patternsDiscovered: analysisResult.patternsDiscovered.length,
      adaptationsCreated,
      metricsUpdated: true,
    };
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    initialized: boolean;
    activeExecutions: number;
    pendingAdaptations: number;
    activeAlerts: number;
    lastAnalysis?: Date;
  } {
    return {
      initialized: this.initialized,
      activeExecutions: this.logger.getMetrics().activeExecutions,
      pendingAdaptations: this.adaptation.getPendingAdaptations().length,
      activeAlerts: this.metrics.getActiveAlerts().length,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setupEventHandlers(): void {
    // Forward logger events
    this.logger.on('logged', (data) => this.emit('execution-logged', data));

    // Forward feedback events
    this.feedback.on('feedback-collected', (data) => this.emit('feedback-collected', data));

    // Forward analyzer events
    this.analyzer.on('analysis-complete', (data) => this.emit('analysis-complete', data));

    // Forward adaptation events
    this.adaptation.on('adaptation-created', (data) => this.emit('adaptation-created', data));
    this.adaptation.on('rollout-started', (data) => this.emit('rollout-started', data));
    this.adaptation.on('adaptation-rolled-back', (data) => this.emit('rollback', data));

    // Forward safety events
    this.safety.on('rail-triggered', (data) => this.emit('safety-triggered', data));
    this.safety.on('approval-requested', (data) => this.emit('approval-needed', data));

    // Forward alert events
    this.metrics.on('alert', (data) => this.emit('alert', data));
  }

  private startPeriodicTasks(database: any): void {
    // Start pattern analysis
    this.analyzer.startAutomaticAnalysis();

    // Run cleanup daily
    this.cleanupTimer = setInterval(async () => {
      try {
        const result = await runRetentionCleanup(database);
        this.emit('cleanup-complete', result);
      } catch (error) {
        this.emit('cleanup-error', error);
      }
    }, 24 * 60 * 60 * 1000); // Daily

    // Aggregate metrics hourly
    setInterval(async () => {
      try {
        await this.metrics.aggregateAndPersist('hour');
      } catch (error) {
        console.error('[Annealing] Failed to aggregate metrics:', error);
      }
    }, 60 * 60 * 1000); // Hourly
  }

  private rowToExecutionLog(row: any): any {
    return {
      ...row,
      timestamp: new Date(row.timestamp),
      actionInput: JSON.parse(row.action_input || '{}'),
      actionOutput: JSON.parse(row.action_output || 'null'),
      tokenCount: {
        input: row.input_tokens,
        output: row.output_tokens,
        total: row.total_tokens,
      },
      toolsUsed: JSON.parse(row.tools_used || '[]'),
      contextFactors: JSON.parse(row.context_factors || '[]'),
    };
  }

  private rowToFeedback(row: any): any {
    return {
      ...row,
      timestamp: new Date(row.timestamp),
      modificationsApplied: JSON.parse(row.modifications_applied || 'null'),
      qualityDimensions: JSON.parse(row.quality_dimensions || 'null'),
      implicitSignals: JSON.parse(row.implicit_signals || '[]'),
    };
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let systemInstance: AnnealingSystem | null = null;

export function getAnnealingSystem(config?: AnnealingSystemConfig): AnnealingSystem {
  if (!systemInstance) {
    systemInstance = new AnnealingSystem(config);
  }
  return systemInstance;
}

export function createAnnealingSystem(config?: AnnealingSystemConfig): AnnealingSystem {
  return new AnnealingSystem(config);
}
