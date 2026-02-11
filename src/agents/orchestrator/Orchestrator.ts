/**
 * Alabobai Orchestrator - The Central Brain
 * Coordinates all 9 agents: Wealth, Credit, Legal, Business, Health, Guardian, Computer, Builder, Research
 *
 * This is the central nervous system of the Alabobai platform.
 * It receives user requests, decomposes them into tasks, routes to appropriate agents,
 * manages parallel execution, handles handoffs, tracks progress, and reports results.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import {
  Agent,
  AgentCategory,
  AgentStatus,
  Task,
  TaskStatus,
  TaskPriority,
  Message,
  Intent,
  ConversationContext,
  ApprovalRequest,
  ApprovalAction,
  TaskResult,
} from '../../core/types.js';
import { agentRegistry, AgentResult, AgentContext } from '../../core/agent-registry.js';
import { LLMClient } from '../../core/llm-client.js';
import { MemoryStore } from '../../core/memory.js';

// Import orchestrator components
import { TaskDecomposer, TaskGraph, DecomposedTask, createTaskDecomposer } from './TaskDecomposer.js';
import { AgentRouter, RoutingDecision, createAgentRouter } from './AgentRouter.js';
import { AgentHandoff, HandoffContext, HandoffReason, createAgentHandoff } from './AgentHandoff.js';
import { ParallelExecutor, ExecutionResult, ExecutorConfig, createParallelExecutor } from './ParallelExecutor.js';
import { ConflictResolver, ConflictReport, Resolution, createConflictResolver } from './ConflictResolver.js';
import { ProgressTracker, ProgressSummary, OverallProgress, createProgressTracker } from './ProgressTracker.js';

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  taskTimeout: number;
  enableParallelExecution: boolean;
  enableConflictResolution: boolean;
  autoApproveActions: ApprovalAction[];
  requireApprovalFor: ApprovalAction[];
  progressUpdateInterval: number;
}

export interface OrchestratorResult {
  success: boolean;
  sessionId: string;
  taskId: string;
  message: string;
  agentResponses: AgentResponse[];
  progress: OverallProgress;
  handoffs: HandoffContext[];
  conflicts: ConflictReport[];
  executionTime: number;
  metadata: Record<string, unknown>;
}

export interface AgentResponse {
  agentId: string;
  agentName: string;
  taskId: string;
  result: AgentResult;
  startedAt: Date;
  completedAt: Date;
  duration: number;
}

export interface UserRequest {
  content: string;
  sessionId?: string;
  userId: string;
  priority?: TaskPriority;
  preferredAgents?: string[];
  excludeAgents?: string[];
  requireApproval?: boolean;
  attachments?: Array<{ type: string; data: string }>;
  context?: Record<string, unknown>;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentAgents: 5,
  taskTimeout: 60000,
  enableParallelExecution: true,
  enableConflictResolution: true,
  autoApproveActions: [],
  requireApprovalFor: ['send-payment', 'delete-file', 'deploy-app', 'sign-document'],
  progressUpdateInterval: 1000,
};

// Agent name mapping for the 9 core agents
const AGENT_NAMES = [
  'WealthLabobai',   // Wealth management
  'CreditLabobai',   // Credit optimization
  'LegalLabobai',    // Legal guidance
  'BusinessLabobai', // Business strategy
  'HealthLabobai',   // Health & wellness
  'GuardianLabobai', // Security & compliance
  'ComputerLabobai', // Computer control
  'BuilderLabobai',  // App builder
  'ResearchLabobai', // Research & analysis
] as const;

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

export class Orchestrator extends EventEmitter {
  // Core dependencies
  private llm: LLMClient;
  private memory: MemoryStore;
  private config: OrchestratorConfig;

  // Orchestrator components
  private taskDecomposer: TaskDecomposer;
  private agentRouter: AgentRouter;
  private agentHandoff: AgentHandoff;
  private parallelExecutor: ParallelExecutor;
  private conflictResolver: ConflictResolver;
  private progressTracker: ProgressTracker;

  // State management
  private agents: Map<string, Agent> = new Map();
  private contexts: Map<string, ConversationContext> = new Map();
  private tasks: Map<string, Task> = new Map();
  private taskGraphs: Map<string, TaskGraph> = new Map();
  private approvals: Map<string, ApprovalRequest> = new Map();
  private activeRequests: Map<string, { startTime: number; userId: string }> = new Map();

  // Metrics
  private totalRequestsProcessed: number = 0;
  private totalTasksCompleted: number = 0;
  private averageResponseTime: number = 0;

  constructor(
    llm: LLMClient,
    memory: MemoryStore,
    config?: Partial<OrchestratorConfig>
  ) {
    super();
    this.llm = llm;
    this.memory = memory;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize orchestrator components
    this.taskDecomposer = createTaskDecomposer(llm, { maxSubtasks: 10 });
    this.agentRouter = createAgentRouter(llm);
    this.agentHandoff = createAgentHandoff(llm, memory);
    this.parallelExecutor = createParallelExecutor({
      maxConcurrent: this.config.maxConcurrentAgents,
      taskTimeout: this.config.taskTimeout,
    });
    this.conflictResolver = createConflictResolver(llm);
    this.progressTracker = createProgressTracker();

    // Initialize agents
    this.initializeAgents();

    // Set up event listeners
    this.setupEventListeners();

    console.log('[Orchestrator] Initialized with', this.agents.size, 'agents');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Spawns all 9 core agents
   */
  private initializeAgents(): void {
    for (const agentName of AGENT_NAMES) {
      try {
        const agent = agentRegistry.spawn(agentName);
        this.agents.set(agent.id, agent);
        console.log(`[Orchestrator] Spawned agent: ${agent.name} (${agent.id})`);
      } catch (error) {
        console.error(`[Orchestrator] Failed to spawn agent ${agentName}:`, error);
      }
    }
  }

  /**
   * Sets up internal event listeners for coordination
   */
  private setupEventListeners(): void {
    // Progress tracker events
    this.progressTracker.on('progress-update', (update) => {
      this.emit('progress', update);
    });

    this.progressTracker.on('milestone-reached', (milestone) => {
      this.emit('milestone', milestone);
    });

    // Handoff events
    this.agentHandoff.on('handoff-initiated', (data) => {
      this.emit('handoff-started', data);
    });

    this.agentHandoff.on('handoff-completed', (data) => {
      this.emit('handoff-completed', data);
    });

    // Conflict events
    this.conflictResolver.on('conflict-detected', (conflict) => {
      this.emit('conflict', conflict);
    });

    this.conflictResolver.on('conflict-resolved', (resolution) => {
      this.emit('conflict-resolved', resolution);
    });

    // Parallel executor events
    this.parallelExecutor.on('task-started', (data) => {
      this.progressTracker.taskStarted(data.taskId, data.agentName);
    });

    this.parallelExecutor.on('task-completed', (data) => {
      this.progressTracker.taskCompleted(data.taskId);
    });

    this.parallelExecutor.on('task-failed', (data) => {
      this.progressTracker.taskFailed(data.taskId, data.error);
    });
  }

  // ============================================================================
  // MAIN ENTRY POINT - Process User Request
  // ============================================================================

  /**
   * Main entry point for processing user requests
   * This is the "brain" that orchestrates everything
   */
  async processRequest(request: UserRequest): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const sessionId = request.sessionId || uuid();
    const rootTaskId = uuid();

    this.activeRequests.set(rootTaskId, { startTime, userId: request.userId });
    this.totalRequestsProcessed++;

    const agentResponses: AgentResponse[] = [];
    const handoffs: HandoffContext[] = [];
    const conflicts: ConflictReport[] = [];

    try {
      // Step 1: Get or create conversation context
      const context = this.getOrCreateContext(sessionId, request.userId);

      // Step 2: Record user message
      const userMessage = this.createUserMessage(request.content, request.attachments);
      context.messages.push(userMessage);

      // Step 3: Analyze intent
      const intent = await this.analyzeIntent(request.content, context);
      this.emit('intent-analyzed', { sessionId, intent });

      console.log(`[Orchestrator] Intent: ${intent.category}/${intent.action} (${(intent.confidence * 100).toFixed(0)}% confidence)`);

      // Step 4: Decompose into tasks
      const decomposition = await this.taskDecomposer.decompose(request.content, {
        intent,
        userId: request.userId,
        ...request.context,
      });

      if (!decomposition.success || !decomposition.graph) {
        throw new Error(decomposition.error || 'Failed to decompose task');
      }

      const taskGraph = decomposition.graph;
      this.taskGraphs.set(rootTaskId, taskGraph);

      console.log(`[Orchestrator] Decomposed into ${taskGraph.tasks.size} tasks (${taskGraph.complexity})`);

      // Step 5: Initialize progress tracking
      this.progressTracker.initializeFromTaskGraph(taskGraph);
      this.emit('decomposition-complete', {
        sessionId,
        taskCount: taskGraph.tasks.size,
        complexity: taskGraph.complexity,
      });

      // Step 6: Route tasks to agents
      const availableAgents = Array.from(this.agents.values()).filter(
        a => !request.excludeAgents?.includes(a.id)
      );

      const routingDecisions = await this.agentRouter.routeBatch(
        Array.from(taskGraph.tasks.values()),
        availableAgents,
        {
          userId: request.userId,
          sessionId,
          urgency: this.mapPriorityToUrgency(request.priority),
          preferredAgent: request.preferredAgents?.[0],
          excludeAgents: request.excludeAgents,
        }
      );

      console.log(`[Orchestrator] Routed tasks to ${new Set(Array.from(routingDecisions.values()).map(r => r.agentName)).size} agents`);

      // Step 7: Check for approval requirements
      if (this.requiresApproval(intent, request)) {
        const approval = await this.requestApproval(rootTaskId, intent, request);
        if (approval.status === 'pending') {
          return this.createPendingApprovalResult(sessionId, rootTaskId, approval, startTime);
        }
        if (approval.status === 'rejected') {
          return this.createRejectedResult(sessionId, rootTaskId, approval, startTime);
        }
      }

      // Step 8: Execute tasks
      let executionResult: ExecutionResult;

      if (this.config.enableParallelExecution && taskGraph.tasks.size > 1) {
        // Parallel execution for complex tasks
        executionResult = await this.parallelExecutor.execute(
          taskGraph,
          routingDecisions,
          this.createAgentContext(context),
          this.agents
        );
      } else {
        // Sequential execution for simple tasks
        executionResult = await this.executeSequentially(
          taskGraph,
          routingDecisions,
          context
        );
      }

      // Step 9: Check for conflicts between agent results
      if (this.config.enableConflictResolution && executionResult.results.size > 1) {
        const resultsWithAgents = new Map<string, { agent: Agent; result: AgentResult }>();

        for (const [taskId, result] of executionResult.results) {
          const routing = routingDecisions.get(taskId);
          if (routing) {
            const agent = this.agents.get(routing.agentId);
            if (agent) {
              resultsWithAgents.set(taskId, { agent, result });
            }
          }
        }

        const conflict = this.conflictResolver.detectConflicts(rootTaskId, resultsWithAgents);
        if (conflict) {
          conflicts.push(conflict);
          const resolution = await this.conflictResolver.resolve(conflict.id);
          conflict.resolution = resolution;
        }
      }

      // Step 10: Aggregate results
      const aggregatedResult = this.aggregateResults(
        executionResult,
        routingDecisions,
        conflicts
      );

      // Step 11: Create response message
      const responseMessage = this.createAssistantMessage(
        aggregatedResult.message,
        Array.from(routingDecisions.values())[0]
      );
      context.messages.push(responseMessage);

      // Step 12: Store in memory
      this.memory.remember(request.userId, `Task: ${request.content}`, {
        sessionId,
        taskId: rootTaskId,
        success: executionResult.success,
        timestamp: new Date().toISOString(),
      });

      // Step 13: Update metrics
      this.updateMetrics(startTime);

      const executionTime = Date.now() - startTime;

      return {
        success: executionResult.success,
        sessionId,
        taskId: rootTaskId,
        message: aggregatedResult.message,
        agentResponses: this.collectAgentResponses(executionResult, routingDecisions),
        progress: this.progressTracker.getOverallProgress(),
        handoffs: this.agentHandoff.getActiveHandoffs(),
        conflicts,
        executionTime,
        metadata: {
          tasksExecuted: executionResult.results.size,
          failedTasks: executionResult.failedTasks.length,
          skippedTasks: executionResult.skippedTasks.length,
          complexity: taskGraph.complexity,
          intent,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Orchestrator] Request failed:', errorMessage);

      this.emit('request-failed', { sessionId, error: errorMessage });

      return {
        success: false,
        sessionId,
        taskId: rootTaskId,
        message: `I apologize, but I encountered an error: ${errorMessage}. Please try again.`,
        agentResponses: [],
        progress: this.progressTracker.getOverallProgress(),
        handoffs: [],
        conflicts: [],
        executionTime: Date.now() - startTime,
        metadata: { error: errorMessage },
      };
    } finally {
      this.activeRequests.delete(rootTaskId);
    }
  }

  // ============================================================================
  // INTENT ANALYSIS
  // ============================================================================

  /**
   * Analyzes user intent using LLM
   */
  private async analyzeIntent(content: string, context: ConversationContext): Promise<Intent> {
    const systemPrompt = `You are an intent classifier for Alabobai, an AI platform with 9 specialized agents:

1. WealthLabobai - Investment, portfolio, retirement, tax
2. CreditLabobai - Credit score, debt, loans, credit cards
3. LegalLabobai - Contracts, compliance, business law
4. BusinessLabobai - Strategy, marketing, sales, scaling
5. HealthLabobai - Wellness, fitness, nutrition, mental health
6. GuardianLabobai - Security, compliance, fraud detection
7. ComputerLabobai - Screen control, automation, browser tasks
8. BuilderLabobai - Create apps, websites, dashboards
9. ResearchLabobai - Web search, document analysis, research

Analyze the user's message and classify:

Categories:
- advisory: Questions, advice (wealth, credit, legal, business, health, security)
- computer-control: Computer automation, browser tasks, form filling
- builder: Creating apps, websites, code
- research: Searching, analyzing, comparing information
- orchestrator: Coordinating multiple agents

Respond in JSON:
{
  "category": "advisory|computer-control|builder|research|orchestrator",
  "action": "brief action description",
  "confidence": 0.0-1.0,
  "entities": { extracted entities },
  "requiresApproval": true/false,
  "suggestedAgents": ["agent names"],
  "multiAgent": true/false
}`;

    const recentContext = this.getRecentContext(context, 5);

    try {
      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Recent context:\n${recentContext}\n\nCurrent message: ${content}` },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category: parsed.category || 'advisory',
          action: parsed.action || 'general-query',
          confidence: parsed.confidence || 0.8,
          entities: parsed.entities || {},
          requiresApproval: parsed.requiresApproval || false,
        };
      }
    } catch (error) {
      console.error('[Orchestrator] Intent analysis failed:', error);
    }

    // Fallback intent
    return {
      category: 'advisory',
      action: 'general-query',
      confidence: 0.5,
      entities: {},
      requiresApproval: false,
    };
  }

  // ============================================================================
  // TASK EXECUTION
  // ============================================================================

  /**
   * Executes tasks sequentially (for simple requests)
   */
  private async executeSequentially(
    taskGraph: TaskGraph,
    routingDecisions: Map<string, RoutingDecision>,
    context: ConversationContext
  ): Promise<ExecutionResult> {
    const results = new Map<string, AgentResult>();
    const failedTasks: string[] = [];
    const startTime = Date.now();

    for (const [taskId, task] of taskGraph.tasks) {
      const routing = routingDecisions.get(taskId);
      if (!routing) {
        failedTasks.push(taskId);
        continue;
      }

      const agent = this.agents.get(routing.agentId);
      if (!agent) {
        failedTasks.push(taskId);
        continue;
      }

      this.progressTracker.taskStarted(taskId, agent.name);

      try {
        // Create task object
        const execTask: Task = {
          id: taskId,
          title: task.title,
          description: task.description,
          category: task.category,
          priority: task.priority,
          status: 'in-progress',
          assignedAgent: agent.id,
          collaborators: [],
          parentTask: null,
          subtasks: [],
          input: { content: task.description, decomposed: task },
          output: null,
          requiresApproval: false,
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
        };

        // Execute via agent registry
        const result = await agentRegistry.assignTask(
          agent.id,
          execTask,
          this.createAgentContext(context)
        );

        results.set(taskId, result);

        if (result.success) {
          this.progressTracker.taskCompleted(taskId, result.message);
          this.agentRouter.updateAgentMetrics(agent.name, true, Date.now() - startTime);
        } else {
          failedTasks.push(taskId);
          this.progressTracker.taskFailed(taskId, result.error || 'Unknown error');
          this.agentRouter.updateAgentMetrics(agent.name, false, Date.now() - startTime);
        }

      } catch (error) {
        failedTasks.push(taskId);
        results.set(taskId, {
          success: false,
          output: {},
          error: error instanceof Error ? error.message : 'Execution error',
        });
        this.progressTracker.taskFailed(taskId, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return {
      planId: uuid(),
      success: failedTasks.length === 0,
      results,
      failedTasks,
      skippedTasks: [],
      totalDuration: Date.now() - startTime,
      summary: `Executed ${results.size} tasks, ${failedTasks.length} failed`,
    };
  }

  /**
   * Creates agent execution context
   */
  private createAgentContext(context: ConversationContext): Omit<AgentContext, 'agent'> {
    return {
      llm: this.llm,
      memory: this.memory,
      emit: (event, data) => this.emit(event, data),
      requestApproval: async (action, details) => {
        const approval = await this.requestApproval(
          uuid(),
          { category: 'advisory', action, confidence: 1, entities: details, requiresApproval: true },
          { content: action, userId: context.userId }
        );
        return approval.status === 'approved';
      },
      collaborate: async (agentName, subtask) => {
        return this.handleCollaboration(agentName, subtask, context);
      },
    };
  }

  // ============================================================================
  // COLLABORATION & HANDOFFS
  // ============================================================================

  /**
   * Handles collaboration between agents
   */
  private async handleCollaboration(
    agentName: string,
    subtask: Partial<Task>,
    context: ConversationContext
  ): Promise<unknown> {
    const targetAgent = Array.from(this.agents.values()).find(a => a.name === agentName);
    if (!targetAgent) {
      console.warn(`[Orchestrator] Collaborator ${agentName} not found`);
      return null;
    }

    const task: Task = {
      id: uuid(),
      title: subtask.title || 'Collaboration task',
      description: subtask.description || '',
      category: targetAgent.category,
      priority: subtask.priority || 'normal',
      status: 'pending',
      assignedAgent: targetAgent.id,
      collaborators: [],
      parentTask: null,
      subtasks: [],
      input: subtask.input || {},
      output: null,
      requiresApproval: false,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    const result = await agentRegistry.assignTask(
      targetAgent.id,
      task,
      this.createAgentContext(context)
    );

    return result.output;
  }

  /**
   * Requests a handoff between agents
   */
  async requestHandoff(
    sourceAgentId: string,
    targetAgentName: string,
    taskId: string,
    reason: HandoffReason,
    sessionId: string
  ): Promise<boolean> {
    const sourceAgent = this.agents.get(sourceAgentId);
    const targetAgent = Array.from(this.agents.values()).find(a => a.name === targetAgentName);
    const task = this.tasks.get(taskId);
    const context = this.contexts.get(sessionId);

    if (!sourceAgent || !targetAgent || !task || !context) {
      return false;
    }

    const result = await this.agentHandoff.initiateHandoff(
      { sourceAgent, targetAgentName, task, reason },
      context,
      targetAgent
    );

    return result.success;
  }

  // ============================================================================
  // APPROVAL SYSTEM
  // ============================================================================

  /**
   * Checks if request requires approval
   */
  private requiresApproval(intent: Intent, request: UserRequest): boolean {
    if (request.requireApproval) return true;
    if (intent.requiresApproval) return true;

    const actionLower = intent.action.toLowerCase();
    for (const action of this.config.requireApprovalFor) {
      if (actionLower.includes(action.replace('-', ' '))) return true;
    }

    return false;
  }

  /**
   * Requests approval from user
   */
  private async requestApproval(
    taskId: string,
    intent: Intent,
    request: UserRequest
  ): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      id: uuid(),
      taskId,
      agentId: 'orchestrator',
      action: intent.action as ApprovalAction,
      description: `Alabobai wants to: ${intent.action}`,
      details: { intent, request: request.content },
      riskLevel: this.assessRisk(intent),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      status: 'pending',
    };

    this.approvals.set(approval.id, approval);
    this.emit('approval-requested', approval);

    return approval;
  }

  /**
   * Processes approval response
   */
  async processApproval(approvalId: string, approved: boolean, reason?: string): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) throw new Error(`Approval not found: ${approvalId}`);

    approval.status = approved ? 'approved' : 'rejected';
    approval.approvedAt = new Date();
    if (!approved && reason) {
      approval.rejectionReason = reason;
    }

    this.emit('approval-resolved', { approvalId, approved, reason });
  }

  /**
   * Assesses risk level for an intent
   */
  private assessRisk(intent: Intent): 'low' | 'medium' | 'high' | 'critical' {
    const action = intent.action.toLowerCase();

    if (action.includes('delete') || action.includes('payment') || action.includes('transfer')) {
      return 'critical';
    }
    if (action.includes('send') || action.includes('post') || action.includes('deploy')) {
      return 'high';
    }
    if (intent.category === 'computer-control') {
      return 'medium';
    }
    return 'low';
  }

  // ============================================================================
  // RESULT AGGREGATION
  // ============================================================================

  /**
   * Aggregates results from multiple agents
   */
  private aggregateResults(
    executionResult: ExecutionResult,
    routingDecisions: Map<string, RoutingDecision>,
    conflicts: ConflictReport[]
  ): { message: string; data: Record<string, unknown> } {
    const messages: string[] = [];
    const data: Record<string, unknown> = {};

    // Collect successful results
    for (const [taskId, result] of executionResult.results) {
      if (result.success && result.message) {
        const routing = routingDecisions.get(taskId);
        if (routing && result.message) {
          messages.push(result.message);
        }
        if (result.output) {
          Object.assign(data, result.output);
        }
      }
    }

    // Handle conflicts
    if (conflicts.length > 0) {
      const resolvedConflict = conflicts.find(c => c.resolution);
      if (resolvedConflict?.resolution) {
        messages.push(`\n\n${resolvedConflict.resolution.explanation}`);
      }
    }

    // Handle failures
    if (executionResult.failedTasks.length > 0) {
      messages.push(`\n\nNote: ${executionResult.failedTasks.length} task(s) encountered issues.`);
    }

    return {
      message: messages.join('\n\n') || 'Task completed.',
      data,
    };
  }

  /**
   * Collects agent responses for reporting
   */
  private collectAgentResponses(
    executionResult: ExecutionResult,
    routingDecisions: Map<string, RoutingDecision>
  ): AgentResponse[] {
    const responses: AgentResponse[] = [];

    for (const [taskId, result] of executionResult.results) {
      const routing = routingDecisions.get(taskId);
      if (routing) {
        responses.push({
          agentId: routing.agentId,
          agentName: routing.agentName,
          taskId,
          result,
          startedAt: new Date(), // Would be tracked more precisely in production
          completedAt: new Date(),
          duration: 0,
        });
      }
    }

    return responses;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Gets or creates conversation context
   */
  private getOrCreateContext(sessionId: string, userId: string): ConversationContext {
    let context = this.contexts.get(sessionId);
    if (!context) {
      context = {
        sessionId,
        userId,
        messages: [],
        activeAgents: Array.from(this.agents.keys()),
        pendingApprovals: [],
        memory: new Map(),
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };
      this.contexts.set(sessionId, context);
    }
    context.lastActivityAt = new Date();
    return context;
  }

  /**
   * Creates a user message object
   */
  private createUserMessage(
    content: string,
    attachments?: Array<{ type: string; data: string }>
  ): Message {
    return {
      id: uuid(),
      role: 'user',
      content,
      attachments: attachments as any,
      timestamp: new Date(),
    };
  }

  /**
   * Creates an assistant message object
   */
  private createAssistantMessage(content: string, routing?: RoutingDecision): Message {
    return {
      id: uuid(),
      role: 'assistant',
      content,
      agentId: routing?.agentId,
      agentName: routing?.agentName,
      timestamp: new Date(),
    };
  }

  /**
   * Gets recent conversation context
   */
  private getRecentContext(context: ConversationContext, limit: number): string {
    return context.messages
      .slice(-limit)
      .map(m => `${m.agentName || m.role}: ${m.content.substring(0, 200)}`)
      .join('\n');
  }

  /**
   * Maps task priority to urgency
   */
  private mapPriorityToUrgency(priority?: TaskPriority): 'low' | 'normal' | 'high' | 'critical' {
    switch (priority) {
      case 'urgent': return 'critical';
      case 'high': return 'high';
      case 'low': return 'low';
      default: return 'normal';
    }
  }

  /**
   * Creates result for pending approval
   */
  private createPendingApprovalResult(
    sessionId: string,
    taskId: string,
    approval: ApprovalRequest,
    startTime: number
  ): OrchestratorResult {
    return {
      success: false,
      sessionId,
      taskId,
      message: `I need your approval before proceeding. ${approval.description}\n\nPlease confirm by saying "approve" or "yes", or "deny" to cancel.`,
      agentResponses: [],
      progress: this.progressTracker.getOverallProgress(),
      handoffs: [],
      conflicts: [],
      executionTime: Date.now() - startTime,
      metadata: { approvalId: approval.id, status: 'pending-approval' },
    };
  }

  /**
   * Creates result for rejected request
   */
  private createRejectedResult(
    sessionId: string,
    taskId: string,
    approval: ApprovalRequest,
    startTime: number
  ): OrchestratorResult {
    return {
      success: false,
      sessionId,
      taskId,
      message: `Request was not approved. ${approval.rejectionReason || 'No reason provided.'}`,
      agentResponses: [],
      progress: this.progressTracker.getOverallProgress(),
      handoffs: [],
      conflicts: [],
      executionTime: Date.now() - startTime,
      metadata: { approvalId: approval.id, status: 'rejected' },
    };
  }

  /**
   * Updates orchestrator metrics
   */
  private updateMetrics(startTime: number): void {
    const duration = Date.now() - startTime;
    this.totalTasksCompleted++;

    // Rolling average
    this.averageResponseTime = (
      (this.averageResponseTime * (this.totalTasksCompleted - 1) + duration) /
      this.totalTasksCompleted
    );
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Gets all active agents
   */
  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Gets agent by ID or name
   */
  getAgent(idOrName: string): Agent | undefined {
    return this.agents.get(idOrName) ||
           Array.from(this.agents.values()).find(a => a.name === idOrName);
  }

  /**
   * Gets current progress summary
   */
  getProgress(): ProgressSummary {
    return this.progressTracker.getProgressSummary();
  }

  /**
   * Gets pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter(a => a.status === 'pending');
  }

  /**
   * Gets conversation context
   */
  getContext(sessionId: string): ConversationContext | undefined {
    return this.contexts.get(sessionId);
  }

  /**
   * Gets orchestrator statistics
   */
  getStats(): Record<string, unknown> {
    return {
      totalRequestsProcessed: this.totalRequestsProcessed,
      totalTasksCompleted: this.totalTasksCompleted,
      averageResponseTime: Math.round(this.averageResponseTime) + 'ms',
      activeAgents: this.agents.size,
      activeSessions: this.contexts.size,
      pendingApprovals: this.getPendingApprovals().length,
      routing: this.agentRouter.getRoutingStats(),
      execution: this.parallelExecutor.getExecutionStats(),
      conflicts: this.conflictResolver.getResolutionStats(),
      handoffs: this.agentHandoff.getHandoffStats(),
    };
  }

  /**
   * Updates orchestrator configuration
   */
  updateConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.maxConcurrentAgents) {
      this.parallelExecutor.updateConfig({ maxConcurrent: config.maxConcurrentAgents });
    }

    this.emit('config-updated', this.config);
  }

  /**
   * Shuts down the orchestrator gracefully
   */
  async shutdown(): Promise<void> {
    console.log('[Orchestrator] Shutting down...');

    // Cancel active requests
    for (const [taskId] of this.activeRequests) {
      this.parallelExecutor.cancelExecution(taskId);
    }

    // Clear state
    this.agents.clear();
    this.contexts.clear();
    this.tasks.clear();
    this.approvals.clear();
    this.progressTracker.reset();

    this.emit('shutdown');
    console.log('[Orchestrator] Shutdown complete');
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates and returns an Orchestrator instance
 */
export function createOrchestrator(
  llm: LLMClient,
  memory: MemoryStore,
  config?: Partial<OrchestratorConfig>
): Orchestrator {
  return new Orchestrator(llm, memory, config);
}

/**
 * Singleton orchestrator instance
 */
let orchestratorInstance: Orchestrator | null = null;

/**
 * Gets or creates the singleton orchestrator instance
 */
export function getOrchestrator(
  llm: LLMClient,
  memory: MemoryStore,
  config?: Partial<OrchestratorConfig>
): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = createOrchestrator(llm, memory, config);
  }
  return orchestratorInstance;
}

export default Orchestrator;
