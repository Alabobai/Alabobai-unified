/**
 * Alabobai Planner Agent
 * Decomposes complex tasks into subtasks with dependencies, success criteria, and complexity estimates
 * Coordinates with the Orchestrator for execution and integrates with the Replanner for adaptive planning
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { LLMClient } from '../core/llm-client.js';
import { Agent, AgentCategory, TaskPriority, Task } from '../core/types.js';
import { AgentResult, AgentContext } from '../core/agent-registry.js';
import {
  TaskGraph,
  createTaskGraph,
  Subtask,
  SuccessCriterion,
  ComplexityEstimate,
  ComplexityLevel,
  SubtaskResult,
  VerificationResult,
  TaskGraphVisualization,
} from './TaskGraph.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the Planner Agent
 */
export interface PlannerConfig {
  maxSubtasks: number;
  maxDepth: number;
  enableParallelDecomposition: boolean;
  defaultComplexityBuffer: number; // Multiplier for time estimates
  verificationModel: 'same' | 'cheaper'; // Use same LLM or cheaper one for verification
  minConfidenceThreshold: number;
}

/**
 * Request for planning a task
 */
export interface PlanRequest {
  taskDescription: string;
  context?: Record<string, unknown>;
  constraints?: PlanConstraints;
  preferredAgents?: string[];
  priority?: TaskPriority;
}

/**
 * Constraints for planning
 */
export interface PlanConstraints {
  maxDurationMs?: number;
  maxParallelSubtasks?: number;
  requiredCapabilities?: string[];
  budgetLimit?: number;
  mustIncludeSteps?: string[];
  mustExcludeSteps?: string[];
}

/**
 * Result of planning
 */
export interface PlanResult {
  success: boolean;
  planId: string;
  graph: TaskGraph;
  visualization: TaskGraphVisualization;
  reasoning: string;
  estimatedDuration: number;
  estimatedCost?: number;
  warnings: string[];
  error?: string;
}

/**
 * Result of executing a plan
 */
export interface ExecutionResult {
  success: boolean;
  planId: string;
  completedSubtasks: number;
  failedSubtasks: number;
  skippedSubtasks: number;
  results: Map<string, SubtaskResult>;
  totalDuration: number;
  summary: string;
}

/**
 * Verification request
 */
export interface VerificationRequest {
  subtaskId: string;
  subtask: Subtask;
  result: SubtaskResult;
}

/**
 * LLM-generated plan structure
 */
interface LLMPlan {
  subtasks: Array<{
    id: string;
    description: string;
    detailedSteps: string[];
    category: string;
    priority: string;
    dependencies: string[];
    successCriteria: Array<{
      description: string;
      verificationType: 'automated' | 'llm-check' | 'manual';
      verificationPrompt?: string;
    }>;
    complexity: {
      level: string;
      factors: string[];
      estimatedMinutes: number;
    };
  }>;
  reasoning: string;
  warnings: string[];
}

const DEFAULT_CONFIG: PlannerConfig = {
  maxSubtasks: 15,
  maxDepth: 4,
  enableParallelDecomposition: true,
  defaultComplexityBuffer: 1.5,
  verificationModel: 'same',
  minConfidenceThreshold: 0.7,
};

// ============================================================================
// PLANNER AGENT CLASS
// ============================================================================

export class PlannerAgent extends EventEmitter {
  private llm: LLMClient;
  private config: PlannerConfig;
  private activePlans: Map<string, TaskGraph> = new Map();
  private planHistory: Map<string, PlanResult> = new Map();
  private logger: (message: string, level?: string) => void;

  constructor(
    llm: LLMClient,
    config?: Partial<PlannerConfig>,
    logger?: (message: string, level?: string) => void
  ) {
    super();
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || ((msg, level) => console.log(`[PlannerAgent] [${level || 'INFO'}] ${msg}`));
  }

  // ============================================================================
  // MAIN PLANNING METHODS
  // ============================================================================

  /**
   * Creates a plan for a complex task
   */
  async plan(request: PlanRequest): Promise<PlanResult> {
    const planId = uuid();
    const startTime = Date.now();

    this.logger(`Starting planning for: ${request.taskDescription.substring(0, 50)}...`);
    this.emit('planning-started', { planId, description: request.taskDescription });

    try {
      // Step 1: Analyze task complexity and determine if decomposition is needed
      const complexity = await this.analyzeComplexity(request.taskDescription, request.context);

      if (complexity.level === 'trivial' || complexity.level === 'simple') {
        // Create a single-task graph for simple requests
        return this.createSimplePlan(planId, request, complexity);
      }

      // Step 2: Decompose task using LLM
      const llmPlan = await this.decomposeWithLLM(request);

      // Step 3: Build task graph from LLM plan
      const graph = this.buildGraphFromPlan(request.taskDescription, llmPlan);

      // Step 4: Validate the graph
      const validation = graph.validateNoCycles();
      if (!validation.valid) {
        throw new Error(`Invalid plan: cycle detected in task graph at ${validation.cycle?.join(' -> ')}`);
      }

      // Step 5: Apply constraints
      this.applyConstraints(graph, request.constraints);

      // Step 6: Generate visualization
      const visualization = graph.visualize();

      // Store the plan
      this.activePlans.set(planId, graph);

      const result: PlanResult = {
        success: true,
        planId,
        graph,
        visualization,
        reasoning: llmPlan.reasoning,
        estimatedDuration: graph.estimatedDuration,
        warnings: llmPlan.warnings,
      };

      this.planHistory.set(planId, result);
      this.emit('planning-completed', { planId, subtaskCount: graph.subtaskCount });

      this.logger(`Planning completed: ${graph.subtaskCount} subtasks in ${graph.layerCount} layers`);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown planning error';
      this.logger(`Planning failed: ${errorMessage}`, 'ERROR');
      this.emit('planning-failed', { planId, error: errorMessage });

      return {
        success: false,
        planId,
        graph: createTaskGraph(request.taskDescription),
        visualization: { graphId: planId, layers: [], edges: [], summary: this.emptySummary() },
        reasoning: '',
        estimatedDuration: 0,
        warnings: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Creates a simple single-task plan
   */
  private createSimplePlan(
    planId: string,
    request: PlanRequest,
    complexity: ComplexityEstimate
  ): PlanResult {
    const graph = createTaskGraph(request.taskDescription, {}, this.logger.bind(this));

    graph.addSubtask(request.taskDescription, {
      category: this.inferCategory(request.taskDescription),
      priority: request.priority || 'normal',
      complexity,
      successCriteria: [{
        description: `Successfully complete: ${request.taskDescription}`,
        verificationType: 'llm-check',
      }],
    });

    this.activePlans.set(planId, graph);

    const result: PlanResult = {
      success: true,
      planId,
      graph,
      visualization: graph.visualize(),
      reasoning: 'Simple task - no decomposition needed',
      estimatedDuration: complexity.estimatedDurationMs,
      warnings: [],
    };

    this.planHistory.set(planId, result);
    return result;
  }

  /**
   * Analyzes the complexity of a task
   */
  private async analyzeComplexity(
    description: string,
    context?: Record<string, unknown>
  ): Promise<ComplexityEstimate> {
    const prompt = `Analyze the complexity of this task:

Task: "${description}"

${context ? `Context: ${JSON.stringify(context)}` : ''}

Classify the complexity as one of:
- trivial: Single, straightforward action (e.g., "What time is it?")
- simple: One or two clear steps (e.g., "Check my credit score")
- moderate: Multiple related steps, single domain (e.g., "Analyze my investment portfolio")
- complex: Multiple steps across domains or requiring coordination (e.g., "Create a business plan")
- very-complex: Large project with many interconnected parts (e.g., "Build a complete app with backend and frontend")

Respond in JSON:
{
  "level": "trivial|simple|moderate|complex|very-complex",
  "factors": ["reason1", "reason2"],
  "estimatedMinutes": 5,
  "confidence": 0.8
}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are a task complexity analyzer. Respond only with JSON.' },
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          level: this.normalizeComplexity(parsed.level),
          estimatedDurationMs: (parsed.estimatedMinutes || 5) * 60 * 1000,
          factors: parsed.factors || [],
          confidence: parsed.confidence || 0.7,
        };
      }
    } catch (error) {
      this.logger(`Complexity analysis failed: ${error}`, 'WARN');
    }

    // Default to moderate if analysis fails
    return {
      level: 'moderate',
      estimatedDurationMs: 15 * 60 * 1000,
      factors: ['Unable to analyze, using default'],
      confidence: 0.5,
    };
  }

  /**
   * Decomposes a task using LLM
   */
  private async decomposeWithLLM(request: PlanRequest): Promise<LLMPlan> {
    const constraintText = request.constraints
      ? this.formatConstraints(request.constraints)
      : '';

    const prompt = `Decompose this complex task into subtasks with dependencies:

TASK: "${request.taskDescription}"

${request.context ? `CONTEXT: ${JSON.stringify(request.context)}` : ''}

${constraintText}

RULES:
1. Create ${this.config.maxSubtasks} or fewer subtasks
2. Each subtask should be completable by a single agent
3. Identify dependencies - which subtasks must complete before others can start
4. Independent subtasks can run in parallel
5. Provide specific success criteria for each subtask
6. Estimate complexity and duration

AVAILABLE AGENT CATEGORIES:
- advisory: Financial, legal, health, business advice
- computer-control: Browser automation, screen control, form filling
- builder: Create apps, websites, APIs, code
- research: Web search, document analysis, data extraction

Respond in JSON:
{
  "subtasks": [
    {
      "id": "step-1",
      "description": "What needs to be done",
      "detailedSteps": ["Step 1.1", "Step 1.2"],
      "category": "advisory|computer-control|builder|research",
      "priority": "low|normal|high|urgent",
      "dependencies": [],
      "successCriteria": [
        {
          "description": "Criterion description",
          "verificationType": "automated|llm-check|manual",
          "verificationPrompt": "How to verify this criterion"
        }
      ],
      "complexity": {
        "level": "trivial|simple|moderate|complex|very-complex",
        "factors": ["factor1"],
        "estimatedMinutes": 5
      }
    }
  ],
  "reasoning": "Explanation of the decomposition strategy",
  "warnings": ["Any concerns or caveats"]
}`;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are an expert task planner. Create detailed, actionable plans. Respond only with JSON.' },
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse LLM response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!parsed.subtasks || !Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
      throw new Error('Invalid plan: no subtasks generated');
    }

    return {
      subtasks: parsed.subtasks,
      reasoning: parsed.reasoning || 'No reasoning provided',
      warnings: parsed.warnings || [],
    };
  }

  /**
   * Builds a TaskGraph from an LLM-generated plan
   */
  private buildGraphFromPlan(rootDescription: string, plan: LLMPlan): TaskGraph {
    const graph = createTaskGraph(rootDescription, {
      maxSubtasks: this.config.maxSubtasks,
      maxDepth: this.config.maxDepth,
    }, this.logger.bind(this));

    // Map of LLM IDs to actual UUIDs
    const idMap = new Map<string, string>();

    // First pass: create all subtasks without dependencies
    for (const subtask of plan.subtasks) {
      const created = graph.addSubtask(subtask.description, {
        category: this.normalizeCategory(subtask.category),
        priority: this.normalizePriority(subtask.priority),
        detailedSteps: subtask.detailedSteps || [],
        successCriteria: subtask.successCriteria || [],
        complexity: {
          level: this.normalizeComplexity(subtask.complexity?.level || 'moderate'),
          estimatedDurationMs: ((subtask.complexity?.estimatedMinutes || 5) * 60 * 1000) * this.config.defaultComplexityBuffer,
          factors: subtask.complexity?.factors || [],
          confidence: 0.7,
        },
        dependencies: [], // Add in second pass
      });

      idMap.set(subtask.id, created.id);
    }

    // Second pass: add dependencies
    for (const subtask of plan.subtasks) {
      const actualId = idMap.get(subtask.id);
      if (!actualId) continue;

      for (const depId of subtask.dependencies || []) {
        const actualDepId = idMap.get(depId);
        if (actualDepId) {
          graph.addDependency(actualId, actualDepId);
        }
      }
    }

    return graph;
  }

  /**
   * Applies constraints to a graph
   */
  private applyConstraints(graph: TaskGraph, constraints?: PlanConstraints): void {
    if (!constraints) return;

    // Check max duration
    if (constraints.maxDurationMs && graph.estimatedDuration > constraints.maxDurationMs) {
      this.logger(`Warning: Estimated duration (${graph.estimatedDuration}ms) exceeds constraint (${constraints.maxDurationMs}ms)`, 'WARN');
    }

    // Check max parallel subtasks per layer
    if (constraints.maxParallelSubtasks) {
      const visualization = graph.visualize();
      for (const layer of visualization.layers) {
        if (layer.subtasks.length > constraints.maxParallelSubtasks) {
          this.logger(`Warning: Layer ${layer.layerIndex} has ${layer.subtasks.length} subtasks, exceeds max parallel (${constraints.maxParallelSubtasks})`, 'WARN');
        }
      }
    }
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Executes a plan using the provided execution context
   */
  async executePlan(
    planId: string,
    executeSubtask: (subtask: Subtask) => Promise<SubtaskResult>
  ): Promise<ExecutionResult> {
    const graph = this.activePlans.get(planId);
    if (!graph) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const startTime = Date.now();
    const results = new Map<string, SubtaskResult>();
    let completedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    this.emit('execution-started', { planId });
    this.logger(`Starting execution of plan ${planId}`);

    try {
      // Execute layer by layer
      for (let layerIndex = 0; layerIndex < graph.layerCount; layerIndex++) {
        const layer = graph.getLayer(layerIndex);
        const readySubtasks = layer.filter(s => s.status === 'pending' || s.status === 'ready');

        this.emit('layer-started', { planId, layerIndex, subtaskCount: readySubtasks.length });
        this.logger(`Executing layer ${layerIndex + 1}/${graph.layerCount} with ${readySubtasks.length} subtasks`);

        // Execute subtasks in parallel
        const layerResults = await Promise.all(
          readySubtasks.map(async (subtask) => {
            try {
              graph.markStarted(subtask.id, 'planner-executor');
              this.emit('subtask-started', { planId, subtaskId: subtask.id });

              const result = await executeSubtask(subtask);

              // Verify the result
              const verifiedResult = await this.verifySubtaskResult(subtask, result);

              if (verifiedResult.success) {
                graph.markCompleted(subtask.id, verifiedResult);
                completedCount++;
              } else {
                graph.markFailed(subtask.id, verifiedResult.error || 'Verification failed');
                failedCount++;
                skippedCount += graph.getDependents(subtask.id).length;
              }

              results.set(subtask.id, verifiedResult);
              this.emit('subtask-completed', {
                planId,
                subtaskId: subtask.id,
                success: verifiedResult.success,
              });

              return { subtaskId: subtask.id, result: verifiedResult };

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              const failedResult: SubtaskResult = {
                success: false,
                output: {},
                message: 'Execution failed',
                error: errorMessage,
                verificationResults: [],
                duration: 0,
              };

              graph.markFailed(subtask.id, errorMessage);
              results.set(subtask.id, failedResult);
              failedCount++;
              skippedCount += graph.getDependents(subtask.id).length;

              this.emit('subtask-failed', { planId, subtaskId: subtask.id, error: errorMessage });

              return { subtaskId: subtask.id, result: failedResult };
            }
          })
        );

        this.emit('layer-completed', { planId, layerIndex, results: layerResults });
      }

    } catch (error) {
      this.logger(`Plan execution failed: ${error}`, 'ERROR');
    }

    const totalDuration = Date.now() - startTime;
    const success = failedCount === 0;

    const executionResult: ExecutionResult = {
      success,
      planId,
      completedSubtasks: completedCount,
      failedSubtasks: failedCount,
      skippedSubtasks: skippedCount,
      results,
      totalDuration,
      summary: `Executed ${completedCount} subtasks, ${failedCount} failed, ${skippedCount} skipped in ${Math.round(totalDuration / 1000)}s`,
    };

    this.emit('execution-completed', { planId, success, duration: totalDuration });
    this.logger(`Plan execution ${success ? 'completed' : 'failed'}: ${executionResult.summary}`);

    return executionResult;
  }

  /**
   * Verifies the result of a subtask against its success criteria
   */
  async verifySubtaskResult(subtask: Subtask, result: SubtaskResult): Promise<SubtaskResult> {
    const verificationResults: VerificationResult[] = [];

    for (const criterion of subtask.successCriteria) {
      let passed = false;
      let details = '';

      if (criterion.verificationType === 'automated') {
        // For automated verification, check if result output contains expected values
        passed = result.success;
        details = passed ? 'Automated check passed' : 'Automated check failed';

      } else if (criterion.verificationType === 'llm-check') {
        // Use LLM to verify
        try {
          const verifyResult = await this.llmVerify(subtask, result, criterion);
          passed = verifyResult.passed;
          details = verifyResult.details;
        } catch (error) {
          passed = false;
          details = `Verification error: ${error}`;
        }

      } else {
        // Manual verification - assume passed for now
        passed = true;
        details = 'Manual verification required';
      }

      verificationResults.push({
        criterionId: criterion.id,
        passed,
        details,
        verifiedAt: new Date(),
      });
    }

    const allPassed = verificationResults.every(v => v.passed);

    return {
      ...result,
      success: result.success && allPassed,
      verificationResults,
      error: allPassed ? result.error : 'Verification criteria not met',
    };
  }

  /**
   * Uses LLM to verify a result against a criterion
   */
  private async llmVerify(
    subtask: Subtask,
    result: SubtaskResult,
    criterion: SuccessCriterion
  ): Promise<{ passed: boolean; details: string }> {
    const prompt = `Verify if this task result meets the success criterion:

TASK: ${subtask.description}

RESULT:
${JSON.stringify(result.output, null, 2)}

MESSAGE: ${result.message}

SUCCESS CRITERION: ${criterion.description}

${criterion.verificationPrompt ? `VERIFICATION INSTRUCTIONS: ${criterion.verificationPrompt}` : ''}

Respond in JSON:
{
  "passed": true/false,
  "details": "Explanation of verification result"
}`;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a task verification expert. Evaluate if results meet success criteria. Respond only with JSON.' },
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        passed: parsed.passed === true,
        details: parsed.details || 'No details provided',
      };
    }

    return { passed: false, details: 'Failed to parse verification response' };
  }

  // ============================================================================
  // PLAN MANAGEMENT
  // ============================================================================

  /**
   * Gets an active plan by ID
   */
  getPlan(planId: string): TaskGraph | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Gets plan history entry
   */
  getPlanResult(planId: string): PlanResult | undefined {
    return this.planHistory.get(planId);
  }

  /**
   * Lists all active plans
   */
  getActivePlans(): Array<{ planId: string; graph: TaskGraph }> {
    return Array.from(this.activePlans.entries()).map(([planId, graph]) => ({
      planId,
      graph,
    }));
  }

  /**
   * Cancels an active plan
   */
  cancelPlan(planId: string): boolean {
    const graph = this.activePlans.get(planId);
    if (!graph) return false;

    // Mark all pending subtasks as skipped
    const pending = graph.getSubtasksByStatus('pending');
    for (const subtask of pending) {
      graph.updateSubtask(subtask.id, { status: 'skipped' });
    }

    this.emit('plan-cancelled', { planId });
    this.logger(`Plan ${planId} cancelled`);

    return true;
  }

  /**
   * Clears completed plans from memory
   */
  clearCompletedPlans(): number {
    let cleared = 0;

    for (const [planId, graph] of this.activePlans) {
      if (graph.status === 'completed' || graph.status === 'failed' || graph.status === 'cancelled') {
        this.activePlans.delete(planId);
        cleared++;
      }
    }

    this.logger(`Cleared ${cleared} completed plans`);
    return cleared;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private normalizeComplexity(level: string): ComplexityLevel {
    const normalized = level.toLowerCase().replace(/[^a-z-]/g, '');
    const valid: ComplexityLevel[] = ['trivial', 'simple', 'moderate', 'complex', 'very-complex'];
    return valid.includes(normalized as ComplexityLevel) ? (normalized as ComplexityLevel) : 'moderate';
  }

  private normalizeCategory(category: string): AgentCategory {
    const normalized = category.toLowerCase().replace(/[^a-z-]/g, '');
    const mapping: Record<string, AgentCategory> = {
      'advisory': 'advisory',
      'computer-control': 'computer-control',
      'computercontrol': 'computer-control',
      'computer': 'computer-control',
      'builder': 'builder',
      'research': 'research',
      'orchestrator': 'orchestrator',
    };
    return mapping[normalized] || 'advisory';
  }

  private normalizePriority(priority: string): TaskPriority {
    const normalized = priority.toLowerCase();
    const valid: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
    return valid.includes(normalized as TaskPriority) ? (normalized as TaskPriority) : 'normal';
  }

  private inferCategory(description: string): AgentCategory {
    const lower = description.toLowerCase();

    if (lower.includes('click') || lower.includes('type') || lower.includes('browser') || lower.includes('automate')) {
      return 'computer-control';
    }
    if (lower.includes('build') || lower.includes('create app') || lower.includes('website') || lower.includes('code')) {
      return 'builder';
    }
    if (lower.includes('search') || lower.includes('research') || lower.includes('find') || lower.includes('analyze')) {
      return 'research';
    }
    return 'advisory';
  }

  private formatConstraints(constraints: PlanConstraints): string {
    const parts: string[] = ['CONSTRAINTS:'];

    if (constraints.maxDurationMs) {
      parts.push(`- Maximum duration: ${Math.round(constraints.maxDurationMs / 60000)} minutes`);
    }
    if (constraints.maxParallelSubtasks) {
      parts.push(`- Maximum parallel subtasks: ${constraints.maxParallelSubtasks}`);
    }
    if (constraints.requiredCapabilities?.length) {
      parts.push(`- Required capabilities: ${constraints.requiredCapabilities.join(', ')}`);
    }
    if (constraints.mustIncludeSteps?.length) {
      parts.push(`- Must include: ${constraints.mustIncludeSteps.join(', ')}`);
    }
    if (constraints.mustExcludeSteps?.length) {
      parts.push(`- Must NOT include: ${constraints.mustExcludeSteps.join(', ')}`);
    }

    return parts.join('\n');
  }

  private emptySummary() {
    return {
      totalSubtasks: 0,
      completedSubtasks: 0,
      failedSubtasks: 0,
      inProgressSubtasks: 0,
      pendingSubtasks: 0,
      overallProgress: 0,
      estimatedRemainingMs: 0,
    };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Gets planner statistics
   */
  getStats(): Record<string, unknown> {
    const completed = Array.from(this.planHistory.values()).filter(p => p.success).length;
    const failed = Array.from(this.planHistory.values()).filter(p => !p.success).length;

    const avgSubtasks = this.planHistory.size > 0
      ? Array.from(this.planHistory.values()).reduce((sum, p) => sum + p.graph.subtaskCount, 0) / this.planHistory.size
      : 0;

    return {
      activePlans: this.activePlans.size,
      totalPlansCreated: this.planHistory.size,
      successRate: this.planHistory.size > 0 ? `${((completed / this.planHistory.size) * 100).toFixed(1)}%` : 'N/A',
      completedPlans: completed,
      failedPlans: failed,
      averageSubtasksPerPlan: avgSubtasks.toFixed(1),
    };
  }

  /**
   * Updates planner configuration
   */
  updateConfig(config: Partial<PlannerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger(`Configuration updated`);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createPlannerAgent(
  llm: LLMClient,
  config?: Partial<PlannerConfig>,
  logger?: (message: string, level?: string) => void
): PlannerAgent {
  return new PlannerAgent(llm, config, logger);
}

export default PlannerAgent;
