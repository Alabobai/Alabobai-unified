/**
 * Alabobai Task Graph
 * DAG (Directed Acyclic Graph) structure for representing subtask dependencies
 * Enables parallel execution of independent subtasks while respecting dependencies
 */

import { v4 as uuid } from 'uuid';
import { AgentCategory, TaskPriority } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complexity estimation for a subtask
 */
export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';

/**
 * Status of a subtask in the graph
 */
export type SubtaskStatus =
  | 'pending'
  | 'ready'        // Dependencies satisfied, ready to execute
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked';     // Blocked by failed dependencies

/**
 * A single subtask in the task graph
 */
export interface Subtask {
  id: string;
  parentId: string | null;

  // Description
  description: string;
  detailedSteps: string[];

  // Success criteria for verification
  successCriteria: SuccessCriterion[];

  // Complexity estimation
  complexityEstimate: ComplexityEstimate;

  // Dependencies - IDs of subtasks that must complete first
  dependencies: string[];

  // Execution metadata
  category: AgentCategory;
  priority: TaskPriority;
  assignedAgent: string | null;

  // Status and results
  status: SubtaskStatus;
  result: SubtaskResult | null;

  // Timestamps
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  // Additional metadata
  metadata: Record<string, unknown>;
}

/**
 * Success criterion for verifying subtask completion
 */
export interface SuccessCriterion {
  id: string;
  description: string;
  verificationType: 'automated' | 'llm-check' | 'manual';
  verificationPrompt?: string;
  isMet: boolean;
  verifiedAt: Date | null;
}

/**
 * Complexity estimate with reasoning
 */
export interface ComplexityEstimate {
  level: ComplexityLevel;
  estimatedDurationMs: number;
  factors: string[];
  confidence: number; // 0-1
}

/**
 * Result of a subtask execution
 */
export interface SubtaskResult {
  success: boolean;
  output: Record<string, unknown>;
  message: string;
  error?: string;
  verificationResults: VerificationResult[];
  duration: number;
}

/**
 * Result of verifying a success criterion
 */
export interface VerificationResult {
  criterionId: string;
  passed: boolean;
  details: string;
  verifiedAt: Date;
}

/**
 * The complete task graph structure
 */
export interface TaskGraphData {
  id: string;
  rootTaskDescription: string;
  subtasks: Map<string, Subtask>;
  executionLayers: string[][]; // Layers of subtask IDs that can run in parallel
  totalComplexity: ComplexityLevel;
  estimatedTotalDurationMs: number;
  createdAt: Date;
  completedAt: Date | null;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Options for creating a task graph
 */
export interface TaskGraphOptions {
  maxDepth?: number;
  maxSubtasks?: number;
  enableParallelization?: boolean;
}

/**
 * Visualization of the task graph
 */
export interface TaskGraphVisualization {
  graphId: string;
  layers: VisualizationLayer[];
  edges: VisualizationEdge[];
  summary: GraphSummary;
}

export interface VisualizationLayer {
  layerIndex: number;
  subtasks: VisualizationNode[];
}

export interface VisualizationNode {
  id: string;
  description: string;
  status: SubtaskStatus;
  complexity: ComplexityLevel;
  assignedAgent: string | null;
  progress: number; // 0-100
}

export interface VisualizationEdge {
  from: string;
  to: string;
  type: 'dependency';
}

export interface GraphSummary {
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;
  inProgressSubtasks: number;
  pendingSubtasks: number;
  overallProgress: number;
  estimatedRemainingMs: number;
}

// ============================================================================
// COMPLEXITY MAPPINGS
// ============================================================================

const COMPLEXITY_DURATION_MAP: Record<ComplexityLevel, number> = {
  'trivial': 2000,
  'simple': 5000,
  'moderate': 15000,
  'complex': 30000,
  'very-complex': 60000,
};

const COMPLEXITY_ORDER: ComplexityLevel[] = ['trivial', 'simple', 'moderate', 'complex', 'very-complex'];

// ============================================================================
// TASK GRAPH CLASS
// ============================================================================

export class TaskGraph {
  private data: TaskGraphData;
  private adjacencyList: Map<string, string[]>; // subtaskId -> dependent subtask IDs
  private reverseAdjacencyList: Map<string, string[]>; // subtaskId -> dependency IDs
  private logger: (message: string, level?: string) => void;

  constructor(
    rootDescription: string,
    options?: TaskGraphOptions,
    logger?: (message: string, level?: string) => void
  ) {
    this.logger = logger || ((msg, level) => console.log(`[TaskGraph] [${level || 'INFO'}] ${msg}`));

    this.data = {
      id: uuid(),
      rootTaskDescription: rootDescription,
      subtasks: new Map(),
      executionLayers: [],
      totalComplexity: 'simple',
      estimatedTotalDurationMs: 0,
      createdAt: new Date(),
      completedAt: null,
      status: 'pending',
    };

    this.adjacencyList = new Map();
    this.reverseAdjacencyList = new Map();

    this.logger(`Created task graph ${this.data.id} for: ${rootDescription.substring(0, 50)}...`);
  }

  // ============================================================================
  // SUBTASK MANAGEMENT
  // ============================================================================

  /**
   * Adds a subtask to the graph
   */
  addSubtask(
    description: string,
    options: {
      parentId?: string | null;
      dependencies?: string[];
      successCriteria?: Omit<SuccessCriterion, 'id' | 'isMet' | 'verifiedAt'>[];
      complexity?: Partial<ComplexityEstimate>;
      category?: AgentCategory;
      priority?: TaskPriority;
      detailedSteps?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Subtask {
    const subtaskId = uuid();

    // Validate dependencies exist
    for (const depId of options.dependencies || []) {
      if (!this.data.subtasks.has(depId)) {
        throw new Error(`Dependency subtask not found: ${depId}`);
      }
    }

    // Create success criteria
    const successCriteria: SuccessCriterion[] = (options.successCriteria || []).map(sc => ({
      id: uuid(),
      description: sc.description,
      verificationType: sc.verificationType,
      verificationPrompt: sc.verificationPrompt,
      isMet: false,
      verifiedAt: null,
    }));

    // If no criteria provided, add a default one
    if (successCriteria.length === 0) {
      successCriteria.push({
        id: uuid(),
        description: `Successfully complete: ${description}`,
        verificationType: 'llm-check',
        isMet: false,
        verifiedAt: null,
      });
    }

    // Create complexity estimate
    const complexityLevel = options.complexity?.level || this.estimateComplexity(description);
    const complexityEstimate: ComplexityEstimate = {
      level: complexityLevel,
      estimatedDurationMs: options.complexity?.estimatedDurationMs || COMPLEXITY_DURATION_MAP[complexityLevel],
      factors: options.complexity?.factors || [],
      confidence: options.complexity?.confidence || 0.7,
    };

    const subtask: Subtask = {
      id: subtaskId,
      parentId: options.parentId || null,
      description,
      detailedSteps: options.detailedSteps || [],
      successCriteria,
      complexityEstimate,
      dependencies: options.dependencies || [],
      category: options.category || 'advisory',
      priority: options.priority || 'normal',
      assignedAgent: null,
      status: 'pending',
      result: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      metadata: options.metadata || {},
    };

    // Add to graph
    this.data.subtasks.set(subtaskId, subtask);

    // Update adjacency lists
    this.adjacencyList.set(subtaskId, []);
    this.reverseAdjacencyList.set(subtaskId, [...(options.dependencies || [])]);

    // Update reverse adjacency for dependencies
    for (const depId of options.dependencies || []) {
      const dependents = this.adjacencyList.get(depId) || [];
      dependents.push(subtaskId);
      this.adjacencyList.set(depId, dependents);
    }

    this.logger(`Added subtask ${subtaskId}: ${description.substring(0, 30)}...`);

    // Recalculate execution layers
    this.recalculateExecutionLayers();

    return subtask;
  }

  /**
   * Removes a subtask from the graph
   */
  removeSubtask(subtaskId: string): boolean {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) {
      return false;
    }

    // Check if any subtasks depend on this one
    const dependents = this.adjacencyList.get(subtaskId) || [];
    if (dependents.length > 0) {
      throw new Error(`Cannot remove subtask ${subtaskId}: ${dependents.length} subtasks depend on it`);
    }

    // Remove from dependencies of other subtasks
    for (const depId of subtask.dependencies) {
      const deps = this.adjacencyList.get(depId) || [];
      const idx = deps.indexOf(subtaskId);
      if (idx > -1) {
        deps.splice(idx, 1);
        this.adjacencyList.set(depId, deps);
      }
    }

    // Remove from data structures
    this.data.subtasks.delete(subtaskId);
    this.adjacencyList.delete(subtaskId);
    this.reverseAdjacencyList.delete(subtaskId);

    this.recalculateExecutionLayers();
    this.logger(`Removed subtask ${subtaskId}`);

    return true;
  }

  /**
   * Updates a subtask
   */
  updateSubtask(subtaskId: string, updates: Partial<Omit<Subtask, 'id' | 'createdAt'>>): Subtask {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) {
      throw new Error(`Subtask not found: ${subtaskId}`);
    }

    // Apply updates
    Object.assign(subtask, updates);

    // If dependencies changed, update adjacency lists
    if (updates.dependencies) {
      this.updateDependencies(subtaskId, updates.dependencies);
      this.recalculateExecutionLayers();
    }

    return subtask;
  }

  /**
   * Updates dependencies for a subtask
   */
  private updateDependencies(subtaskId: string, newDependencies: string[]): void {
    const oldDependencies = this.reverseAdjacencyList.get(subtaskId) || [];

    // Remove from old dependencies' adjacency lists
    for (const oldDepId of oldDependencies) {
      const deps = this.adjacencyList.get(oldDepId) || [];
      const idx = deps.indexOf(subtaskId);
      if (idx > -1) {
        deps.splice(idx, 1);
        this.adjacencyList.set(oldDepId, deps);
      }
    }

    // Add to new dependencies' adjacency lists
    for (const newDepId of newDependencies) {
      if (!this.data.subtasks.has(newDepId)) {
        throw new Error(`Dependency subtask not found: ${newDepId}`);
      }
      const deps = this.adjacencyList.get(newDepId) || [];
      deps.push(subtaskId);
      this.adjacencyList.set(newDepId, deps);
    }

    this.reverseAdjacencyList.set(subtaskId, newDependencies);
  }

  // ============================================================================
  // DEPENDENCY MANAGEMENT
  // ============================================================================

  /**
   * Adds a dependency between subtasks
   */
  addDependency(subtaskId: string, dependsOnId: string): void {
    const subtask = this.data.subtasks.get(subtaskId);
    const dependency = this.data.subtasks.get(dependsOnId);

    if (!subtask || !dependency) {
      throw new Error('Invalid subtask IDs');
    }

    // Check for circular dependency
    if (this.wouldCreateCycle(subtaskId, dependsOnId)) {
      throw new Error(`Adding dependency would create a cycle: ${dependsOnId} -> ${subtaskId}`);
    }

    // Add dependency
    if (!subtask.dependencies.includes(dependsOnId)) {
      subtask.dependencies.push(dependsOnId);

      const deps = this.adjacencyList.get(dependsOnId) || [];
      deps.push(subtaskId);
      this.adjacencyList.set(dependsOnId, deps);

      const reverseDeps = this.reverseAdjacencyList.get(subtaskId) || [];
      reverseDeps.push(dependsOnId);
      this.reverseAdjacencyList.set(subtaskId, reverseDeps);

      this.recalculateExecutionLayers();
    }
  }

  /**
   * Removes a dependency between subtasks
   */
  removeDependency(subtaskId: string, dependsOnId: string): void {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) return;

    const idx = subtask.dependencies.indexOf(dependsOnId);
    if (idx > -1) {
      subtask.dependencies.splice(idx, 1);

      const deps = this.adjacencyList.get(dependsOnId) || [];
      const depIdx = deps.indexOf(subtaskId);
      if (depIdx > -1) {
        deps.splice(depIdx, 1);
        this.adjacencyList.set(dependsOnId, deps);
      }

      const reverseDeps = this.reverseAdjacencyList.get(subtaskId) || [];
      const reverseIdx = reverseDeps.indexOf(dependsOnId);
      if (reverseIdx > -1) {
        reverseDeps.splice(reverseIdx, 1);
        this.reverseAdjacencyList.set(subtaskId, reverseDeps);
      }

      this.recalculateExecutionLayers();
    }
  }

  /**
   * Checks if adding a dependency would create a cycle
   */
  private wouldCreateCycle(fromId: string, toId: string): boolean {
    // Check if there's already a path from fromId to toId
    const visited = new Set<string>();
    const stack = [fromId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === toId) {
        return true;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.adjacencyList.get(current) || [];
      stack.push(...deps);
    }

    return false;
  }

  /**
   * Validates the graph has no cycles
   */
  validateNoCycles(): { valid: boolean; cycle?: string[] } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const hasCycle = (subtaskId: string): boolean => {
      visited.add(subtaskId);
      recursionStack.add(subtaskId);
      path.push(subtaskId);

      const dependents = this.adjacencyList.get(subtaskId) || [];
      for (const depId of dependents) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) return true;
        } else if (recursionStack.has(depId)) {
          path.push(depId);
          return true;
        }
      }

      path.pop();
      recursionStack.delete(subtaskId);
      return false;
    };

    for (const subtaskId of this.data.subtasks.keys()) {
      if (!visited.has(subtaskId)) {
        if (hasCycle(subtaskId)) {
          return { valid: false, cycle: [...path] };
        }
      }
    }

    return { valid: true };
  }

  // ============================================================================
  // EXECUTION LAYER CALCULATION
  // ============================================================================

  /**
   * Recalculates execution layers using topological sort
   */
  private recalculateExecutionLayers(): void {
    const layers: string[][] = [];
    const inDegree = new Map<string, number>();
    const remaining = new Set<string>();

    // Calculate in-degrees
    for (const [id, subtask] of this.data.subtasks) {
      inDegree.set(id, subtask.dependencies.length);
      remaining.add(id);
    }

    while (remaining.size > 0) {
      const currentLayer: string[] = [];

      // Find all subtasks with no remaining dependencies
      for (const id of remaining) {
        if ((inDegree.get(id) || 0) === 0) {
          currentLayer.push(id);
        }
      }

      if (currentLayer.length === 0) {
        // Cycle detected - this shouldn't happen if we validate properly
        this.logger('Cycle detected in task graph!', 'ERROR');
        break;
      }

      // Remove current layer from remaining and update in-degrees
      for (const id of currentLayer) {
        remaining.delete(id);
        const dependents = this.adjacencyList.get(id) || [];
        for (const depId of dependents) {
          inDegree.set(depId, (inDegree.get(depId) || 0) - 1);
        }
      }

      layers.push(currentLayer);
    }

    this.data.executionLayers = layers;
    this.recalculateTotalComplexity();

    this.logger(`Recalculated ${layers.length} execution layers`);
  }

  /**
   * Recalculates total complexity and duration estimates
   */
  private recalculateTotalComplexity(): void {
    let maxComplexityIndex = 0;
    let totalDuration = 0;

    for (const layer of this.data.executionLayers) {
      let maxLayerDuration = 0;

      for (const subtaskId of layer) {
        const subtask = this.data.subtasks.get(subtaskId);
        if (subtask) {
          const complexityIndex = COMPLEXITY_ORDER.indexOf(subtask.complexityEstimate.level);
          maxComplexityIndex = Math.max(maxComplexityIndex, complexityIndex);
          maxLayerDuration = Math.max(maxLayerDuration, subtask.complexityEstimate.estimatedDurationMs);
        }
      }

      totalDuration += maxLayerDuration;
    }

    this.data.totalComplexity = COMPLEXITY_ORDER[maxComplexityIndex] || 'simple';
    this.data.estimatedTotalDurationMs = totalDuration;
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Gets subtasks that are ready to execute (dependencies satisfied)
   */
  getReadySubtasks(): Subtask[] {
    const ready: Subtask[] = [];

    for (const subtask of this.data.subtasks.values()) {
      if (subtask.status !== 'pending' && subtask.status !== 'ready') continue;

      const depsComplete = subtask.dependencies.every(depId => {
        const dep = this.data.subtasks.get(depId);
        return dep?.status === 'completed';
      });

      if (depsComplete) {
        subtask.status = 'ready';
        ready.push(subtask);
      }
    }

    return ready;
  }

  /**
   * Gets all subtasks in a specific layer
   */
  getLayer(layerIndex: number): Subtask[] {
    if (layerIndex < 0 || layerIndex >= this.data.executionLayers.length) {
      return [];
    }

    return this.data.executionLayers[layerIndex]
      .map(id => this.data.subtasks.get(id))
      .filter((s): s is Subtask => s !== undefined);
  }

  /**
   * Gets subtasks that depend on a given subtask
   */
  getDependents(subtaskId: string): Subtask[] {
    const dependentIds = this.adjacencyList.get(subtaskId) || [];
    return dependentIds
      .map(id => this.data.subtasks.get(id))
      .filter((s): s is Subtask => s !== undefined);
  }

  /**
   * Gets subtasks that a given subtask depends on
   */
  getDependencies(subtaskId: string): Subtask[] {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) return [];

    return subtask.dependencies
      .map(id => this.data.subtasks.get(id))
      .filter((s): s is Subtask => s !== undefined);
  }

  /**
   * Gets a subtask by ID
   */
  getSubtask(subtaskId: string): Subtask | undefined {
    return this.data.subtasks.get(subtaskId);
  }

  /**
   * Gets all subtasks
   */
  getAllSubtasks(): Subtask[] {
    return Array.from(this.data.subtasks.values());
  }

  /**
   * Gets subtasks by status
   */
  getSubtasksByStatus(status: SubtaskStatus): Subtask[] {
    return Array.from(this.data.subtasks.values()).filter(s => s.status === status);
  }

  // ============================================================================
  // STATUS MANAGEMENT
  // ============================================================================

  /**
   * Marks a subtask as started
   */
  markStarted(subtaskId: string, agentId: string): void {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) {
      throw new Error(`Subtask not found: ${subtaskId}`);
    }

    subtask.status = 'in-progress';
    subtask.startedAt = new Date();
    subtask.assignedAgent = agentId;

    if (this.data.status === 'pending') {
      this.data.status = 'executing';
    }

    this.logger(`Subtask ${subtaskId} started by agent ${agentId}`);
  }

  /**
   * Marks a subtask as completed
   */
  markCompleted(subtaskId: string, result: SubtaskResult): void {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) {
      throw new Error(`Subtask not found: ${subtaskId}`);
    }

    subtask.status = 'completed';
    subtask.completedAt = new Date();
    subtask.result = result;

    // Update success criteria
    for (const criterion of subtask.successCriteria) {
      const verification = result.verificationResults.find(v => v.criterionId === criterion.id);
      if (verification) {
        criterion.isMet = verification.passed;
        criterion.verifiedAt = verification.verifiedAt;
      }
    }

    // Check if all subtasks are complete
    this.checkGraphCompletion();

    this.logger(`Subtask ${subtaskId} completed: ${result.success ? 'success' : 'failure'}`);
  }

  /**
   * Marks a subtask as failed
   */
  markFailed(subtaskId: string, error: string): void {
    const subtask = this.data.subtasks.get(subtaskId);
    if (!subtask) {
      throw new Error(`Subtask not found: ${subtaskId}`);
    }

    subtask.status = 'failed';
    subtask.completedAt = new Date();
    subtask.result = {
      success: false,
      output: {},
      message: 'Subtask failed',
      error,
      verificationResults: [],
      duration: subtask.startedAt ? Date.now() - subtask.startedAt.getTime() : 0,
    };

    // Mark dependents as blocked
    this.markDependentsBlocked(subtaskId);

    this.logger(`Subtask ${subtaskId} failed: ${error}`, 'ERROR');
  }

  /**
   * Marks all dependents of a failed subtask as blocked
   */
  private markDependentsBlocked(failedSubtaskId: string): void {
    const dependents = this.adjacencyList.get(failedSubtaskId) || [];

    for (const depId of dependents) {
      const subtask = this.data.subtasks.get(depId);
      if (subtask && subtask.status === 'pending') {
        subtask.status = 'blocked';
        this.markDependentsBlocked(depId);
      }
    }
  }

  /**
   * Checks if the graph is complete
   */
  private checkGraphCompletion(): void {
    const allSubtasks = Array.from(this.data.subtasks.values());
    const allComplete = allSubtasks.every(s =>
      s.status === 'completed' || s.status === 'failed' || s.status === 'skipped' || s.status === 'blocked'
    );

    if (allComplete) {
      const anyFailed = allSubtasks.some(s => s.status === 'failed');
      this.data.status = anyFailed ? 'failed' : 'completed';
      this.data.completedAt = new Date();
      this.logger(`Task graph ${this.data.status}`);
    }
  }

  // ============================================================================
  // VISUALIZATION
  // ============================================================================

  /**
   * Generates a visualization of the task graph
   */
  visualize(): TaskGraphVisualization {
    const layers: VisualizationLayer[] = this.data.executionLayers.map((layerIds, index) => ({
      layerIndex: index,
      subtasks: layerIds.map(id => {
        const subtask = this.data.subtasks.get(id)!;
        return {
          id: subtask.id,
          description: subtask.description,
          status: subtask.status,
          complexity: subtask.complexityEstimate.level,
          assignedAgent: subtask.assignedAgent,
          progress: this.calculateSubtaskProgress(subtask),
        };
      }),
    }));

    const edges: VisualizationEdge[] = [];
    for (const [id, subtask] of this.data.subtasks) {
      for (const depId of subtask.dependencies) {
        edges.push({
          from: depId,
          to: id,
          type: 'dependency',
        });
      }
    }

    return {
      graphId: this.data.id,
      layers,
      edges,
      summary: this.getSummary(),
    };
  }

  /**
   * Calculates progress for a single subtask
   */
  private calculateSubtaskProgress(subtask: Subtask): number {
    switch (subtask.status) {
      case 'completed':
        return 100;
      case 'in-progress':
        // Estimate based on elapsed time
        if (subtask.startedAt) {
          const elapsed = Date.now() - subtask.startedAt.getTime();
          const estimated = subtask.complexityEstimate.estimatedDurationMs;
          return Math.min(90, Math.round((elapsed / estimated) * 100));
        }
        return 50;
      case 'failed':
      case 'blocked':
      case 'skipped':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Gets a summary of the graph status
   */
  getSummary(): GraphSummary {
    const subtasks = Array.from(this.data.subtasks.values());
    const completed = subtasks.filter(s => s.status === 'completed').length;
    const failed = subtasks.filter(s => s.status === 'failed').length;
    const inProgress = subtasks.filter(s => s.status === 'in-progress').length;
    const pending = subtasks.filter(s => s.status === 'pending' || s.status === 'ready').length;

    const completedDuration = subtasks
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + (s.result?.duration || 0), 0);

    const remainingSubtasks = subtasks.filter(s =>
      s.status === 'pending' || s.status === 'ready' || s.status === 'in-progress'
    );
    const estimatedRemaining = remainingSubtasks.reduce(
      (sum, s) => sum + s.complexityEstimate.estimatedDurationMs,
      0
    );

    return {
      totalSubtasks: subtasks.length,
      completedSubtasks: completed,
      failedSubtasks: failed,
      inProgressSubtasks: inProgress,
      pendingSubtasks: pending,
      overallProgress: subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : 0,
      estimatedRemainingMs: estimatedRemaining,
    };
  }

  /**
   * Exports the graph as JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.data.id,
      rootTaskDescription: this.data.rootTaskDescription,
      subtasks: Array.from(this.data.subtasks.values()),
      executionLayers: this.data.executionLayers,
      totalComplexity: this.data.totalComplexity,
      estimatedTotalDurationMs: this.data.estimatedTotalDurationMs,
      status: this.data.status,
      createdAt: this.data.createdAt.toISOString(),
      completedAt: this.data.completedAt?.toISOString() || null,
      summary: this.getSummary(),
      visualization: this.visualize(),
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Estimates complexity from description
   */
  private estimateComplexity(description: string): ComplexityLevel {
    const lower = description.toLowerCase();

    // Very complex indicators
    if (lower.includes('integrate') || lower.includes('system') || lower.includes('architecture')) {
      return 'very-complex';
    }

    // Complex indicators
    if (lower.includes('build') || lower.includes('create') || lower.includes('develop')) {
      return 'complex';
    }

    // Moderate indicators
    if (lower.includes('analyze') || lower.includes('compare') || lower.includes('research')) {
      return 'moderate';
    }

    // Simple indicators
    if (lower.includes('fetch') || lower.includes('get') || lower.includes('check')) {
      return 'simple';
    }

    return 'moderate';
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  get id(): string {
    return this.data.id;
  }

  get status(): TaskGraphData['status'] {
    return this.data.status;
  }

  get layerCount(): number {
    return this.data.executionLayers.length;
  }

  get subtaskCount(): number {
    return this.data.subtasks.size;
  }

  get totalComplexity(): ComplexityLevel {
    return this.data.totalComplexity;
  }

  get estimatedDuration(): number {
    return this.data.estimatedTotalDurationMs;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createTaskGraph(
  rootDescription: string,
  options?: TaskGraphOptions,
  logger?: (message: string, level?: string) => void
): TaskGraph {
  return new TaskGraph(rootDescription, options, logger);
}

export default TaskGraph;
