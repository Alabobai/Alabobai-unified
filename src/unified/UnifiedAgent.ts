/**
 * Alabobai Unified Agent
 * Single entry point that orchestrates all capabilities of the Alabobai platform
 *
 * This is the main interface for interacting with the entire AI Operating System.
 * It provides a unified API that leverages:
 * - Multi-agent orchestration
 * - Sandbox execution
 * - Browser automation
 * - LLM routing
 * - Checkpointing and recovery
 * - Event streaming
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import {
  Task,
  TaskStatus,
  TaskPriority,
  Message,
  ConversationContext,
  ApprovalRequest,
  SystemEvent,
} from '../core/types.js';
import { LLMClient, LLMMessage, createLLMClient, getDefaultLLMClient } from '../core/llm-client.js';
import { MemoryStore, createMemoryStore } from '../core/memory.js';
import { CheckpointManager, CheckpointState, createCheckpointManager } from '../core/reliability/CheckpointManager.js';
import { AgentLoop, AgentLoopConfig, LoopEvent } from './AgentLoop.js';
import { SystemIntegrator, IntegrationConfig, SystemComponents } from './SystemIntegrator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedAgentConfig {
  // LLM Configuration
  llm?: {
    provider: 'anthropic' | 'openai';
    model?: string;
    apiKey?: string;
  };

  // Execution mode
  mode: 'autonomous' | 'supervised' | 'interactive';

  // Session management
  sessionId?: string;
  userId: string;

  // Capabilities
  enableBrowserAutomation?: boolean;
  enableSandbox?: boolean;
  enableVoice?: boolean;
  enableCheckpointing?: boolean;

  // Safety
  maxIterations?: number;
  maxExecutionTime?: number;
  requireApprovalFor?: string[];

  // Logging
  verbose?: boolean;
}

export interface UnifiedAgentState {
  sessionId: string;
  userId: string;
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'paused' | 'error';
  currentTask: Task | null;
  eventHistory: LoopEvent[];
  checkpointId: string | null;
  startTime: Date;
  lastActivity: Date;
  metrics: AgentMetrics;
}

export interface AgentMetrics {
  totalIterations: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  totalTokensUsed: number;
  totalExecutionTime: number;
  checkpointsCreated: number;
}

export interface UnifiedAgentResult {
  success: boolean;
  sessionId: string;
  message: string;
  data?: Record<string, unknown>;
  events: LoopEvent[];
  metrics: AgentMetrics;
  checkpointId?: string;
  error?: string;
}

export interface StreamCallback {
  onThinking?: (thought: string) => void;
  onAction?: (action: LoopEvent) => void;
  onResult?: (result: string) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: { current: number; total: number; description: string }) => void;
}

// ============================================================================
// UNIFIED AGENT CLASS
// ============================================================================

export class UnifiedAgent extends EventEmitter {
  private config: Required<UnifiedAgentConfig>;
  private state: UnifiedAgentState;
  private integrator: SystemIntegrator;
  private components!: SystemComponents;
  private agentLoop!: AgentLoop;
  private initialized: boolean = false;
  private abortController: AbortController | null = null;

  constructor(config: UnifiedAgentConfig) {
    super();

    this.config = {
      llm: config.llm || { provider: 'anthropic' },
      mode: config.mode,
      sessionId: config.sessionId || uuid(),
      userId: config.userId,
      enableBrowserAutomation: config.enableBrowserAutomation ?? true,
      enableSandbox: config.enableSandbox ?? true,
      enableVoice: config.enableVoice ?? false,
      enableCheckpointing: config.enableCheckpointing ?? true,
      maxIterations: config.maxIterations ?? 100,
      maxExecutionTime: config.maxExecutionTime ?? 600000, // 10 minutes
      requireApprovalFor: config.requireApprovalFor ?? ['send-payment', 'delete-file', 'deploy-app'],
      verbose: config.verbose ?? false,
    };

    this.state = {
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      status: 'idle',
      currentTask: null,
      eventHistory: [],
      checkpointId: null,
      startTime: new Date(),
      lastActivity: new Date(),
      metrics: {
        totalIterations: 0,
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
        totalTokensUsed: 0,
        totalExecutionTime: 0,
        checkpointsCreated: 0,
      },
    };

    // Create system integrator
    this.integrator = new SystemIntegrator({
      enableSandbox: this.config.enableSandbox,
      enableBrowser: this.config.enableBrowserAutomation,
      enableVoice: this.config.enableVoice,
      enableCheckpointing: this.config.enableCheckpointing,
      llmConfig: {
        provider: this.config.llm.provider,
        model: this.config.llm.model || (this.config.llm.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
        apiKey: this.config.llm.apiKey || '',
      },
      sandboxConfig: {
        maxMemoryMB: 1024,
        allowNetwork: true,
        sessionTimeoutMs: this.config.maxExecutionTime,
      },
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the unified agent and all subsystems
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.log('Initializing Unified Agent...');

    try {
      // Initialize all system components
      this.components = await this.integrator.initialize();

      // Create agent loop
      this.agentLoop = new AgentLoop({
        llm: this.components.llm,
        memory: this.components.memory,
        sandbox: this.components.sandbox ?? undefined,
        browser: this.components.browser ?? undefined,
        checkpointManager: this.components.checkpointManager ?? undefined,
        orchestrator: this.components.orchestrator ?? undefined,
        planner: this.components.planner ?? undefined,
        tools: this.components.tools,
        maxIterations: this.config.maxIterations,
        mode: this.config.mode,
        requireApprovalFor: this.config.requireApprovalFor,
      });

      // Set up event forwarding
      this.setupEventHandlers();

      // Start checkpointing if enabled
      if (this.config.enableCheckpointing && this.components.checkpointManager) {
        this.components.checkpointManager.startAutoSave(
          this.state.sessionId,
          () => this.getCurrentCheckpointState()
        );
      }

      this.initialized = true;
      this.log('Unified Agent initialized successfully');
      this.emit('initialized', { sessionId: this.state.sessionId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      this.log(`Initialization failed: ${errorMessage}`, 'error');
      throw new Error(`Failed to initialize Unified Agent: ${errorMessage}`);
    }
  }

  /**
   * Sets up event handlers for all subsystems
   */
  private setupEventHandlers(): void {
    // Agent loop events
    this.agentLoop.on('iteration-start', (data) => {
      this.state.metrics.totalIterations++;
      this.emit('thinking', data);
    });

    this.agentLoop.on('action-executed', (data) => {
      this.state.metrics.totalActions++;
      if (data.success) {
        this.state.metrics.successfulActions++;
      } else {
        this.state.metrics.failedActions++;
      }
      this.state.eventHistory.push(data);
      this.emit('action', data);
    });

    this.agentLoop.on('observation', (data) => {
      this.emit('observation', data);
    });

    this.agentLoop.on('approval-required', (data) => {
      this.state.status = 'waiting';
      this.emit('approval-required', data);
    });

    this.agentLoop.on('error', (data) => {
      this.emit('error', data);
    });

    this.agentLoop.on('complete', (data) => {
      this.state.status = 'idle';
      this.emit('complete', data);
    });

    // Orchestrator events
    if (this.components.orchestrator) {
      this.components.orchestrator.on('progress', (data) => {
        this.emit('progress', data);
      });

      this.components.orchestrator.on('handoff-started', (data) => {
        this.emit('handoff', data);
      });
    }

    // Browser events
    if (this.components.browser) {
      this.components.browser.on('action', (data) => {
        this.emit('browser-action', data);
      });

      this.components.browser.on('error', (data) => {
        this.emit('browser-error', data);
      });
    }

    // Sandbox events
    if (this.components.sandbox) {
      this.components.sandbox.on('security-violation', (data) => {
        this.emit('security-violation', data);
      });
    }
  }

  // ============================================================================
  // MAIN EXECUTION INTERFACE
  // ============================================================================

  /**
   * Execute a task with the unified agent
   * This is the main entry point for all agent operations
   */
  async execute(
    instruction: string,
    options?: {
      context?: Record<string, unknown>;
      priority?: TaskPriority;
      stream?: StreamCallback;
    }
  ): Promise<UnifiedAgentResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    this.abortController = new AbortController();

    this.state.status = 'thinking';
    this.state.lastActivity = new Date();

    // Create task
    const task: Task = {
      id: uuid(),
      title: this.extractTitle(instruction),
      description: instruction,
      category: 'orchestrator',
      priority: options?.priority || 'normal',
      status: 'pending',
      assignedAgent: null,
      collaborators: [],
      parentTask: null,
      subtasks: [],
      input: { instruction, context: options?.context || {} },
      output: null,
      requiresApproval: false,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
    };

    this.state.currentTask = task;
    this.emit('task-started', { taskId: task.id, instruction });

    // Set up streaming callbacks
    if (options?.stream) {
      this.setupStreamCallbacks(options.stream);
    }

    try {
      // Execute through the agent loop
      this.state.status = 'executing';
      const result = await this.agentLoop.run(task, {
        signal: this.abortController.signal,
        context: options?.context,
      });

      // Create checkpoint after successful execution
      if (this.config.enableCheckpointing && this.components.checkpointManager) {
        const checkpoint = await this.components.checkpointManager.markMilestone(
          this.state.sessionId,
          this.getCurrentCheckpointState(),
          `Completed: ${task.title}`
        );
        this.state.checkpointId = checkpoint.id;
        this.state.metrics.checkpointsCreated++;
      }

      const executionTime = Date.now() - startTime;
      this.state.metrics.totalExecutionTime += executionTime;

      this.state.status = 'idle';
      this.state.currentTask = null;

      this.emit('task-completed', { taskId: task.id, success: result.success });

      return {
        success: result.success,
        sessionId: this.state.sessionId,
        message: result.message,
        data: result.data,
        events: this.state.eventHistory.slice(-50), // Last 50 events
        metrics: { ...this.state.metrics },
        checkpointId: this.state.checkpointId || undefined,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
      this.state.status = 'error';
      this.state.currentTask = null;

      this.emit('task-failed', { taskId: task.id, error: errorMessage });

      return {
        success: false,
        sessionId: this.state.sessionId,
        message: `Execution failed: ${errorMessage}`,
        events: this.state.eventHistory.slice(-50),
        metrics: { ...this.state.metrics },
        error: errorMessage,
      };
    }
  }

  /**
   * Execute with streaming responses
   */
  async *stream(
    instruction: string,
    options?: { context?: Record<string, unknown>; priority?: TaskPriority }
  ): AsyncGenerator<LoopEvent, UnifiedAgentResult, unknown> {
    if (!this.initialized) {
      await this.initialize();
    }

    const eventQueue: LoopEvent[] = [];
    let resolveNext: ((value: LoopEvent | null) => void) | null = null;
    let completed = false;
    let finalResult: UnifiedAgentResult | null = null;

    // Set up event collector
    const collector = (event: LoopEvent) => {
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      } else {
        eventQueue.push(event);
      }
    };

    this.on('action', collector);
    this.on('observation', collector);
    this.on('thinking', collector);

    // Start execution
    const executePromise = this.execute(instruction, options).then((result) => {
      completed = true;
      finalResult = result;
      if (resolveNext) resolveNext(null);
    });

    // Yield events as they come
    while (!completed) {
      let event: LoopEvent | null = null;

      if (eventQueue.length > 0) {
        event = eventQueue.shift()!;
      } else {
        event = await new Promise<LoopEvent | null>((resolve) => {
          resolveNext = resolve;
        });
      }

      if (event) {
        yield event;
      }
    }

    // Clean up listeners
    this.off('action', collector);
    this.off('observation', collector);
    this.off('thinking', collector);

    await executePromise;
    return finalResult!;
  }

  /**
   * Chat interface for conversational interaction
   */
  async chat(message: string, conversationHistory?: LLMMessage[]): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const history = conversationHistory || [];
    history.push({ role: 'user', content: message });

    const response = await this.components.llm.chat([
      {
        role: 'system',
        content: `You are Alabobai, a unified AI assistant with access to multiple specialized agents.
You can help with:
- Wealth management and financial advice
- Credit optimization
- Legal guidance
- Business strategy
- Health and wellness
- Computer automation
- App building
- Research and analysis

If the user's request requires action (not just conversation), let them know you'll need to execute a task.
For conversational queries, respond directly and helpfully.`,
      },
      ...history,
    ]);

    return response;
  }

  // ============================================================================
  // CONTROL METHODS
  // ============================================================================

  /**
   * Pause the current execution
   */
  async pause(): Promise<void> {
    if (this.state.status !== 'executing') {
      throw new Error('No execution in progress to pause');
    }

    this.state.status = 'paused';
    this.agentLoop.pause();

    // Create checkpoint on pause
    if (this.config.enableCheckpointing && this.components.checkpointManager) {
      await this.components.checkpointManager.createCheckpoint(
        this.state.sessionId,
        this.getCurrentCheckpointState(),
        'manual',
        'Paused execution',
        'user-request'
      );
    }

    this.emit('paused', { sessionId: this.state.sessionId });
  }

  /**
   * Resume a paused execution
   */
  async resume(): Promise<void> {
    if (this.state.status !== 'paused') {
      throw new Error('Execution is not paused');
    }

    this.state.status = 'executing';
    this.agentLoop.resume();

    this.emit('resumed', { sessionId: this.state.sessionId });
  }

  /**
   * Stop the current execution
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.agentLoop.stop();
    this.state.status = 'idle';
    this.state.currentTask = null;

    this.emit('stopped', { sessionId: this.state.sessionId });
  }

  /**
   * Provide approval for a pending action
   */
  async approve(approvalId: string, approved: boolean, reason?: string): Promise<void> {
    await this.agentLoop.resolveApproval(approvalId, approved, reason);
    this.state.status = 'executing';
  }

  // ============================================================================
  // RECOVERY METHODS
  // ============================================================================

  /**
   * Restore from a checkpoint
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<void> {
    if (!this.components.checkpointManager) {
      throw new Error('Checkpointing is not enabled');
    }

    const state = await this.components.checkpointManager.restoreCheckpoint(checkpointId);

    // Restore agent state
    if (state.custom?.agentState) {
      const restored = state.custom.agentState as Partial<UnifiedAgentState>;
      this.state.eventHistory = restored.eventHistory || [];
      this.state.metrics = restored.metrics || this.state.metrics;
    }

    this.state.checkpointId = checkpointId;
    this.emit('restored', { checkpointId, sessionId: this.state.sessionId });
  }

  /**
   * Get available checkpoints for recovery
   */
  getCheckpoints(): Array<{ id: string; label?: string; timestamp: Date }> {
    if (!this.components.checkpointManager) {
      return [];
    }

    return this.components.checkpointManager.getCheckpoints(this.state.sessionId).map((cp) => ({
      id: cp.id,
      label: cp.label,
      timestamp: cp.timestamp,
    }));
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Get current agent state
   */
  getState(): UnifiedAgentState {
    return { ...this.state };
  }

  /**
   * Get current metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.state.metrics };
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.state.sessionId;
  }

  /**
   * Get event history
   */
  getEventHistory(limit?: number): LoopEvent[] {
    if (limit) {
      return this.state.eventHistory.slice(-limit);
    }
    return [...this.state.eventHistory];
  }

  // ============================================================================
  // SHUTDOWN
  // ============================================================================

  /**
   * Gracefully shutdown the unified agent
   */
  async shutdown(): Promise<void> {
    this.log('Shutting down Unified Agent...');

    // Stop any running execution
    if (this.state.status === 'executing') {
      await this.stop();
    }

    // Shutdown all components
    await this.integrator.shutdown();

    this.initialized = false;
    this.emit('shutdown', { sessionId: this.state.sessionId });
    this.log('Unified Agent shutdown complete');
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getCurrentCheckpointState(): CheckpointState {
    return {
      conversation: {
        messages: [],
        context: { sessionId: this.state.sessionId },
      },
      tasks: this.state.currentTask
        ? [
            {
              id: this.state.currentTask.id,
              status: this.state.currentTask.status,
              progress: 0,
              input: this.state.currentTask.input,
              startedAt: this.state.currentTask.startedAt || new Date(),
              checkpointAt: new Date(),
            },
          ]
        : [],
      agents: [],
      memory: {
        shortTerm: {},
        longTerm: {},
      },
      custom: {
        agentState: {
          eventHistory: this.state.eventHistory,
          metrics: this.state.metrics,
        },
      },
    };
  }

  private setupStreamCallbacks(stream: StreamCallback): void {
    if (stream.onThinking) {
      this.on('thinking', stream.onThinking);
    }
    if (stream.onAction) {
      this.on('action', stream.onAction);
    }
    if (stream.onResult) {
      this.on('complete', (data) => stream.onResult!(data.message));
    }
    if (stream.onError) {
      this.on('error', (data) => stream.onError!(data.error));
    }
    if (stream.onProgress) {
      this.on('progress', stream.onProgress);
    }
  }

  private extractTitle(instruction: string): string {
    const firstSentence = instruction.split(/[.!?]/)[0];
    if (firstSentence.length <= 60) return firstSentence;
    return firstSentence.substring(0, 57) + '...';
  }

  private log(message: string, level: 'info' | 'error' = 'info'): void {
    if (this.config.verbose) {
      const prefix = `[UnifiedAgent:${this.state.sessionId.substring(0, 8)}]`;
      if (level === 'error') {
        console.error(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a unified agent with default configuration
 */
export function createUnifiedAgent(config: UnifiedAgentConfig): UnifiedAgent {
  return new UnifiedAgent(config);
}

/**
 * Create and initialize a unified agent
 */
export async function initializeUnifiedAgent(config: UnifiedAgentConfig): Promise<UnifiedAgent> {
  const agent = new UnifiedAgent(config);
  await agent.initialize();
  return agent;
}

export default UnifiedAgent;
