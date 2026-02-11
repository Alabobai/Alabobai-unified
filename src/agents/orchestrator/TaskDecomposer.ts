/**
 * Alabobai Task Decomposer
 * Breaks complex user requests into atomic, executable sub-tasks
 * Uses LLM-powered analysis to understand intent and create task graphs
 */

import { v4 as uuid } from 'uuid';
import { Task, TaskPriority, AgentCategory } from '../../core/types.js';
import { LLMClient } from '../../core/llm-client.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DecomposedTask {
  id: string;
  title: string;
  description: string;
  category: AgentCategory;
  priority: TaskPriority;
  dependencies: string[]; // IDs of tasks that must complete first
  estimatedDuration: number; // in milliseconds
  requiredCapabilities: string[];
  canRunParallel: boolean;
  metadata: Record<string, unknown>;
}

export interface TaskGraph {
  rootTaskId: string;
  tasks: Map<string, DecomposedTask>;
  executionOrder: string[][]; // Array of parallel task groups
  totalEstimatedDuration: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface DecompositionResult {
  success: boolean;
  graph: TaskGraph | null;
  error?: string;
  originalRequest: string;
  summary: string;
}

// Agent capability mappings
const AGENT_CAPABILITIES: Record<string, { category: AgentCategory; skills: string[] }> = {
  wealth: {
    category: 'advisory',
    skills: ['investment', 'portfolio', 'tax', 'retirement', 'budgeting', 'savings', 'trading']
  },
  credit: {
    category: 'advisory',
    skills: ['credit-score', 'debt', 'loans', 'credit-cards', 'disputes', 'collections']
  },
  legal: {
    category: 'advisory',
    skills: ['contracts', 'compliance', 'business-law', 'intellectual-property', 'employment']
  },
  business: {
    category: 'advisory',
    skills: ['strategy', 'marketing', 'sales', 'operations', 'scaling', 'fundraising']
  },
  health: {
    category: 'advisory',
    skills: ['wellness', 'fitness', 'nutrition', 'mental-health', 'prevention', 'sleep']
  },
  guardian: {
    category: 'advisory',
    skills: ['security', 'compliance', 'fraud-detection', 'risk-assessment', 'audit', 'privacy']
  },
  computer: {
    category: 'computer-control',
    skills: ['screen-control', 'automation', 'browser', 'file-system', 'mouse', 'keyboard']
  },
  builder: {
    category: 'builder',
    skills: ['webapp', 'website', 'api', 'mobile-app', 'dashboard', 'landing-page']
  },
  research: {
    category: 'research',
    skills: ['web-search', 'document-analysis', 'data-extraction', 'summarization', 'comparison']
  },
};

// ============================================================================
// TASK DECOMPOSER CLASS
// ============================================================================

export class TaskDecomposer {
  private llm: LLMClient;
  private maxDepth: number;
  private maxSubtasks: number;

  constructor(llm: LLMClient, options?: { maxDepth?: number; maxSubtasks?: number }) {
    this.llm = llm;
    this.maxDepth = options?.maxDepth || 3;
    this.maxSubtasks = options?.maxSubtasks || 10;
  }

  /**
   * Decomposes a complex user request into a task graph
   */
  async decompose(request: string, context?: Record<string, unknown>): Promise<DecompositionResult> {
    try {
      // Step 1: Analyze complexity
      const complexity = await this.analyzeComplexity(request);

      // Step 2: For simple tasks, return single-node graph
      if (complexity === 'simple') {
        return this.createSimpleGraph(request);
      }

      // Step 3: For complex tasks, use LLM to decompose
      const decomposition = await this.llmDecompose(request, context);

      // Step 4: Build the task graph
      const graph = this.buildTaskGraph(decomposition, complexity);

      // Step 5: Optimize execution order
      this.optimizeExecutionOrder(graph);

      return {
        success: true,
        graph,
        originalRequest: request,
        summary: this.generateSummary(graph),
      };
    } catch (error) {
      return {
        success: false,
        graph: null,
        error: error instanceof Error ? error.message : 'Unknown decomposition error',
        originalRequest: request,
        summary: 'Failed to decompose task',
      };
    }
  }

  /**
   * Analyzes the complexity of a request
   */
  private async analyzeComplexity(request: string): Promise<'simple' | 'moderate' | 'complex'> {
    const prompt = `Analyze the complexity of this user request and classify it:

Request: "${request}"

Classification rules:
- SIMPLE: Single action, single agent needed, no dependencies (e.g., "What's my credit score?", "Explain 401k")
- MODERATE: 2-3 related actions, possibly involving 1-2 agents (e.g., "Compare two investment options", "Review this contract")
- COMPLEX: Multiple actions, multiple agents, dependencies between tasks (e.g., "Build me a business plan with financial projections", "Help me refinance and improve my credit")

Respond with ONLY one word: simple, moderate, or complex`;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a task complexity analyzer. Respond with exactly one word.' },
      { role: 'user', content: prompt },
    ]);

    const cleaned = response.toLowerCase().trim();
    if (cleaned.includes('complex')) return 'complex';
    if (cleaned.includes('moderate')) return 'moderate';
    return 'simple';
  }

  /**
   * Creates a simple single-task graph
   */
  private createSimpleGraph(request: string): DecompositionResult {
    const category = this.inferCategory(request);
    const taskId = uuid();

    const task: DecomposedTask = {
      id: taskId,
      title: this.extractTitle(request),
      description: request,
      category,
      priority: 'normal',
      dependencies: [],
      estimatedDuration: 5000,
      requiredCapabilities: this.inferCapabilities(request),
      canRunParallel: true,
      metadata: {},
    };

    const graph: TaskGraph = {
      rootTaskId: taskId,
      tasks: new Map([[taskId, task]]),
      executionOrder: [[taskId]],
      totalEstimatedDuration: task.estimatedDuration,
      complexity: 'simple',
    };

    return {
      success: true,
      graph,
      originalRequest: request,
      summary: `Single task: ${task.title}`,
    };
  }

  /**
   * Uses LLM to decompose complex requests
   */
  private async llmDecompose(
    request: string,
    context?: Record<string, unknown>
  ): Promise<DecomposedTask[]> {
    const agentList = Object.entries(AGENT_CAPABILITIES)
      .map(([name, info]) => `- ${name}: ${info.skills.join(', ')}`)
      .join('\n');

    const prompt = `Decompose this user request into specific, actionable subtasks.

User Request: "${request}"

${context ? `Context: ${JSON.stringify(context)}` : ''}

Available Agents and their capabilities:
${agentList}

Rules:
1. Break down into 2-${this.maxSubtasks} subtasks
2. Each subtask should be completable by a single agent
3. Identify dependencies between tasks
4. Estimate duration in milliseconds (typical: 5000-30000ms)
5. Identify which tasks can run in parallel

Respond in JSON format:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Brief title",
      "description": "What needs to be done",
      "agentType": "wealth|credit|legal|business|health|guardian|computer|builder|research",
      "requiredCapabilities": ["skill1", "skill2"],
      "dependencies": [], // IDs of tasks that must complete first
      "estimatedDuration": 10000,
      "priority": "low|normal|high|urgent",
      "canRunParallel": true
    }
  ]
}`;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a task decomposition expert. Always respond with valid JSON.' },
      { role: 'user', content: prompt },
    ]);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed.tasks.map((t: any, index: number) => ({
        id: t.id || `task-${index + 1}`,
        title: t.title || `Subtask ${index + 1}`,
        description: t.description || '',
        category: AGENT_CAPABILITIES[t.agentType]?.category || 'advisory',
        priority: t.priority || 'normal',
        dependencies: t.dependencies || [],
        estimatedDuration: t.estimatedDuration || 10000,
        requiredCapabilities: t.requiredCapabilities || [],
        canRunParallel: t.canRunParallel !== false,
        metadata: { agentType: t.agentType },
      }));
    } catch (error) {
      // Fallback to single task
      console.error('[TaskDecomposer] Failed to parse LLM response, using fallback');
      return [{
        id: 'task-1',
        title: this.extractTitle(request),
        description: request,
        category: this.inferCategory(request),
        priority: 'normal',
        dependencies: [],
        estimatedDuration: 15000,
        requiredCapabilities: this.inferCapabilities(request),
        canRunParallel: true,
        metadata: {},
      }];
    }
  }

  /**
   * Builds the task graph from decomposed tasks
   */
  private buildTaskGraph(tasks: DecomposedTask[], complexity: 'simple' | 'moderate' | 'complex'): TaskGraph {
    const taskMap = new Map<string, DecomposedTask>();
    tasks.forEach(task => taskMap.set(task.id, task));

    // Find root task (no dependencies)
    const rootTask = tasks.find(t => t.dependencies.length === 0) || tasks[0];

    // Calculate total duration (considering parallelism)
    const executionOrder = this.calculateExecutionOrder(tasks);
    const totalDuration = this.calculateTotalDuration(executionOrder, taskMap);

    return {
      rootTaskId: rootTask.id,
      tasks: taskMap,
      executionOrder,
      totalEstimatedDuration: totalDuration,
      complexity,
    };
  }

  /**
   * Calculates optimal execution order considering dependencies
   */
  private calculateExecutionOrder(tasks: DecomposedTask[]): string[][] {
    const completed = new Set<string>();
    const order: string[][] = [];
    const remaining = [...tasks];

    while (remaining.length > 0) {
      // Find all tasks whose dependencies are satisfied
      const ready = remaining.filter(task =>
        task.dependencies.every(dep => completed.has(dep))
      );

      if (ready.length === 0) {
        // Circular dependency or missing dependency - force progress
        console.warn('[TaskDecomposer] Potential circular dependency detected');
        const forced = remaining.shift();
        if (forced) {
          order.push([forced.id]);
          completed.add(forced.id);
        }
        continue;
      }

      // Group parallel-capable tasks
      const parallelGroup = ready.filter(t => t.canRunParallel);
      const sequentialTasks = ready.filter(t => !t.canRunParallel);

      if (parallelGroup.length > 0) {
        order.push(parallelGroup.map(t => t.id));
        parallelGroup.forEach(t => {
          completed.add(t.id);
          const idx = remaining.indexOf(t);
          if (idx > -1) remaining.splice(idx, 1);
        });
      }

      // Add sequential tasks one at a time
      sequentialTasks.forEach(t => {
        order.push([t.id]);
        completed.add(t.id);
        const idx = remaining.indexOf(t);
        if (idx > -1) remaining.splice(idx, 1);
      });
    }

    return order;
  }

  /**
   * Calculates total duration considering parallel execution
   */
  private calculateTotalDuration(
    executionOrder: string[][],
    tasks: Map<string, DecomposedTask>
  ): number {
    return executionOrder.reduce((total, group) => {
      // For parallel groups, take the max duration
      const groupDuration = Math.max(
        ...group.map(id => tasks.get(id)?.estimatedDuration || 0)
      );
      return total + groupDuration;
    }, 0);
  }

  /**
   * Optimizes the execution order for better performance
   */
  private optimizeExecutionOrder(graph: TaskGraph): void {
    // Merge small adjacent parallel groups
    const optimized: string[][] = [];

    for (const group of graph.executionOrder) {
      if (optimized.length === 0) {
        optimized.push([...group]);
        continue;
      }

      const lastGroup = optimized[optimized.length - 1];
      const canMerge = group.every(taskId => {
        const task = graph.tasks.get(taskId);
        return task?.canRunParallel &&
               task.dependencies.every(dep => !lastGroup.includes(dep));
      });

      if (canMerge && lastGroup.length + group.length <= 4) {
        // Merge groups if combined size is reasonable
        lastGroup.push(...group);
      } else {
        optimized.push([...group]);
      }
    }

    graph.executionOrder = optimized;
  }

  /**
   * Generates a human-readable summary of the task graph
   */
  private generateSummary(graph: TaskGraph): string {
    const taskCount = graph.tasks.size;
    const parallelGroups = graph.executionOrder.filter(g => g.length > 1).length;
    const estimatedSeconds = Math.ceil(graph.totalEstimatedDuration / 1000);

    return `${taskCount} tasks, ${parallelGroups} parallel groups, ~${estimatedSeconds}s estimated`;
  }

  /**
   * Infers the agent category from request text
   */
  private inferCategory(request: string): AgentCategory {
    const lower = request.toLowerCase();

    // Check for computer control indicators
    if (lower.includes('click') || lower.includes('type') || lower.includes('open') ||
        lower.includes('navigate') || lower.includes('automate') || lower.includes('browser')) {
      return 'computer-control';
    }

    // Check for builder indicators
    if (lower.includes('build') || lower.includes('create app') || lower.includes('website') ||
        lower.includes('dashboard') || lower.includes('generate') || lower.includes('code')) {
      return 'builder';
    }

    // Check for research indicators
    if (lower.includes('search') || lower.includes('research') || lower.includes('find') ||
        lower.includes('analyze') || lower.includes('compare') || lower.includes('look up')) {
      return 'research';
    }

    // Default to advisory
    return 'advisory';
  }

  /**
   * Infers required capabilities from request text
   */
  private inferCapabilities(request: string): string[] {
    const lower = request.toLowerCase();
    const capabilities: string[] = [];

    for (const [agent, info] of Object.entries(AGENT_CAPABILITIES)) {
      for (const skill of info.skills) {
        if (lower.includes(skill) || lower.includes(skill.replace('-', ' '))) {
          capabilities.push(skill);
        }
      }
    }

    return capabilities.length > 0 ? capabilities : ['general'];
  }

  /**
   * Extracts a brief title from a request
   */
  private extractTitle(request: string): string {
    // Take first sentence or first 50 chars
    const firstSentence = request.split(/[.!?]/)[0];
    if (firstSentence.length <= 60) return firstSentence;
    return firstSentence.substring(0, 57) + '...';
  }

  /**
   * Validates a task graph for consistency
   */
  validateGraph(graph: TaskGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check all dependencies exist
    for (const [id, task] of graph.tasks) {
      for (const dep of task.dependencies) {
        if (!graph.tasks.has(dep)) {
          errors.push(`Task ${id} has missing dependency: ${dep}`);
        }
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const stack = new Set<string>();

    const hasCycle = (taskId: string): boolean => {
      if (stack.has(taskId)) return true;
      if (visited.has(taskId)) return false;

      visited.add(taskId);
      stack.add(taskId);

      const task = graph.tasks.get(taskId);
      if (task) {
        for (const dep of task.dependencies) {
          if (hasCycle(dep)) return true;
        }
      }

      stack.delete(taskId);
      return false;
    };

    for (const id of graph.tasks.keys()) {
      if (hasCycle(id)) {
        errors.push(`Circular dependency detected involving task: ${id}`);
        break;
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * Factory function to create a TaskDecomposer
 */
export function createTaskDecomposer(llm: LLMClient, options?: { maxDepth?: number; maxSubtasks?: number }): TaskDecomposer {
  return new TaskDecomposer(llm, options);
}

export default TaskDecomposer;
