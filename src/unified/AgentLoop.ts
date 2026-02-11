/**
 * Alabobai Agent Loop
 * Core agent loop implementing the Manus pattern:
 * Analyze -> Plan -> Execute -> Observe -> Checkpoint -> Repeat
 *
 * This is the heart of the autonomous agent system.
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import {
  Task,
  TaskStatus,
  ComputerAction,
  ApprovalRequest,
  ApprovalAction,
} from '../core/types.js';
import { LLMClient, LLMMessage } from '../core/llm-client.js';
import { MemoryStore } from '../core/memory.js';
import { CheckpointManager, CheckpointState } from '../core/reliability/CheckpointManager.js';
import { VMSandboxService, SandboxEnvironment } from '../services/vm-sandbox.js';
import { BrowserAutomation } from '../core/computer/BrowserAutomation.js';
import { Orchestrator } from '../agents/orchestrator/Orchestrator.js';
import { TaskDecomposer, TaskGraph } from '../agents/orchestrator/TaskDecomposer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentLoopConfig {
  llm: LLMClient;
  memory: MemoryStore;
  sandbox?: VMSandboxService;
  browser?: BrowserAutomation;
  checkpointManager?: CheckpointManager;
  orchestrator?: Orchestrator;
  planner?: TaskDecomposer;
  tools?: Map<string, ToolDefinition>;

  // Execution settings
  maxIterations: number;
  mode: 'autonomous' | 'supervised' | 'interactive';
  requireApprovalFor: string[];

  // Advanced settings
  thinkingBudget?: number; // Max tokens for thinking
  observationLimit?: number; // Max chars for observations
  checkpointInterval?: number; // Iterations between auto-checkpoints
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
  requiresApproval?: boolean;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  screenshot?: string;
}

export interface LoopEvent {
  id: string;
  type: 'thinking' | 'action' | 'observation' | 'error' | 'checkpoint' | 'approval';
  timestamp: Date;
  iteration: number;
  content: string;
  data?: Record<string, unknown>;
  success?: boolean;
}

export interface LoopState {
  iteration: number;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'waiting-approval';
  events: LoopEvent[];
  currentAction: string | null;
  lastObservation: string | null;
  planSteps: string[];
  completedSteps: number;
  pendingApproval: ApprovalRequest | null;
}

export interface LoopResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  events: LoopEvent[];
  iterations: number;
  error?: string;
}

export interface RunOptions {
  signal?: AbortSignal;
  context?: Record<string, unknown>;
  initialPlan?: string[];
}

// ============================================================================
// AGENT LOOP CLASS
// ============================================================================

export class AgentLoop extends EventEmitter {
  private config: Required<AgentLoopConfig>;
  private state: LoopState;
  private sandboxEnv: SandboxEnvironment | null = null;
  private approvalResolvers: Map<string, (approved: boolean, reason?: string) => void> = new Map();
  private pausePromise: { resolve: () => void; promise: Promise<void> } | null = null;
  private stopRequested: boolean = false;

  constructor(config: AgentLoopConfig) {
    super();

    this.config = {
      llm: config.llm,
      memory: config.memory,
      sandbox: config.sandbox!,
      browser: config.browser!,
      checkpointManager: config.checkpointManager!,
      orchestrator: config.orchestrator!,
      planner: config.planner!,
      tools: config.tools || new Map(),
      maxIterations: config.maxIterations,
      mode: config.mode,
      requireApprovalFor: config.requireApprovalFor,
      thinkingBudget: config.thinkingBudget ?? 4096,
      observationLimit: config.observationLimit ?? 10000,
      checkpointInterval: config.checkpointInterval ?? 10,
    };

    this.state = this.createInitialState();
    this.registerDefaultTools();
  }

  // ============================================================================
  // MAIN LOOP EXECUTION
  // ============================================================================

  /**
   * Run the agent loop for a given task
   * Implements: Analyze -> Plan -> Execute -> Observe -> Checkpoint -> Repeat
   */
  async run(task: Task, options?: RunOptions): Promise<LoopResult> {
    this.state = this.createInitialState();
    this.stopRequested = false;

    const startTime = Date.now();

    try {
      // Step 0: Setup sandbox environment
      if (this.config.sandbox) {
        this.sandboxEnv = await this.config.sandbox.createEnvironment();
      }

      // Step 1: Initial Analysis - Understand the task
      this.emit('iteration-start', { iteration: 0, phase: 'analyze' });
      const analysis = await this.analyzeTask(task, options?.context);
      this.addEvent('thinking', `Task Analysis:\n${analysis}`);

      // Step 2: Create Initial Plan
      const plan = options?.initialPlan || (await this.createPlan(task, analysis));
      this.state.planSteps = plan;
      this.addEvent('thinking', `Plan created with ${plan.length} steps:\n${plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);

      // Step 3: Main Execution Loop
      while (this.state.iteration < this.config.maxIterations && !this.stopRequested) {
        // Check for abort signal
        if (options?.signal?.aborted) {
          throw new Error('Execution aborted');
        }

        // Handle pause
        if (this.pausePromise) {
          await this.pausePromise.promise;
        }

        this.state.iteration++;
        this.emit('iteration-start', { iteration: this.state.iteration });

        // 3a. Analyze current state from event stream
        const currentState = await this.analyzeCurrentState();

        // 3b. Check if task is complete
        if (await this.isTaskComplete(task, currentState)) {
          this.state.status = 'completed';
          break;
        }

        // 3c. Select next action using LLM
        const action = await this.selectNextAction(task, currentState);

        if (!action) {
          // No more actions needed
          this.state.status = 'completed';
          break;
        }

        // 3d. Check if approval is required
        if (await this.requiresApproval(action)) {
          const approved = await this.requestApproval(action);
          if (!approved) {
            this.addEvent('observation', `Action "${action.name}" was not approved. Skipping.`);
            continue;
          }
        }

        // 3e. Execute action in sandbox
        this.state.status = 'running';
        this.state.currentAction = action.name;
        const result = await this.executeAction(action);

        // 3f. Observe result and append to event stream
        const observation = this.formatObservation(result);
        this.state.lastObservation = observation;
        this.addEvent('observation', observation, { action: action.name, success: result.success });

        // 3g. Update plan progress
        if (result.success) {
          this.state.completedSteps++;
        }

        // 3h. Checkpoint state periodically
        if (this.state.iteration % this.config.checkpointInterval === 0) {
          await this.createCheckpoint(`Iteration ${this.state.iteration}`);
        }

        // Emit progress
        this.emit('progress', {
          current: this.state.completedSteps,
          total: this.state.planSteps.length,
          description: `Step ${this.state.completedSteps}/${this.state.planSteps.length}`,
        });
      }

      // Step 4: Final result
      const finalResult = await this.generateFinalResult(task);

      // Final checkpoint
      await this.createCheckpoint('Task completed');

      return {
        success: this.state.status === 'completed',
        message: finalResult,
        data: this.extractResultData(),
        events: this.state.events,
        iterations: this.state.iteration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.state.status = 'failed';
      this.addEvent('error', errorMessage);

      return {
        success: false,
        message: `Execution failed: ${errorMessage}`,
        error: errorMessage,
        events: this.state.events,
        iterations: this.state.iteration,
      };
    } finally {
      // Cleanup sandbox
      if (this.sandboxEnv && this.config.sandbox) {
        await this.config.sandbox.destroyEnvironment(this.sandboxEnv.id);
      }

      this.emit('complete', {
        success: this.state.status === 'completed',
        iterations: this.state.iteration,
        duration: Date.now() - startTime,
      });
    }
  }

  // ============================================================================
  // CORE LOOP PHASES
  // ============================================================================

  /**
   * Phase 1: Analyze the task to understand requirements
   */
  private async analyzeTask(task: Task, context?: Record<string, unknown>): Promise<string> {
    const prompt = `Analyze this task and identify:
1. Main objective
2. Required capabilities (browser, file system, API, etc.)
3. Potential challenges
4. Success criteria

Task: ${task.description}
${context ? `Context: ${JSON.stringify(context)}` : ''}

Provide a concise analysis (max 500 words).`;

    const response = await this.config.llm.chat([
      {
        role: 'system',
        content: 'You are a task analysis expert. Analyze tasks to understand requirements and identify the best approach.',
      },
      { role: 'user', content: prompt },
    ]);

    return response;
  }

  /**
   * Phase 2: Create execution plan
   */
  private async createPlan(task: Task, analysis: string): Promise<string[]> {
    const prompt = `Based on this analysis, create a step-by-step execution plan.

Analysis:
${analysis}

Available tools:
${this.formatAvailableTools()}

Create a numbered list of concrete, actionable steps. Each step should be a single action.
Be specific about which tool to use for each step.
Format: Just the steps, one per line, numbered.`;

    const response = await this.config.llm.chat([
      {
        role: 'system',
        content: 'You are an execution planner. Create clear, actionable step-by-step plans.',
      },
      { role: 'user', content: prompt },
    ]);

    // Parse steps from response
    const steps = response
      .split('\n')
      .filter((line) => line.match(/^\d+\./))
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((step) => step.length > 0);

    return steps.length > 0 ? steps : ['Complete the task as requested'];
  }

  /**
   * Phase 3a: Analyze current state from event stream
   */
  private async analyzeCurrentState(): Promise<string> {
    const recentEvents = this.state.events.slice(-10);
    const eventSummary = recentEvents
      .map((e) => `[${e.type}] ${e.content.substring(0, 200)}`)
      .join('\n');

    return `Current iteration: ${this.state.iteration}
Completed steps: ${this.state.completedSteps}/${this.state.planSteps.length}
Last action: ${this.state.currentAction || 'None'}
Last observation: ${this.state.lastObservation?.substring(0, 500) || 'None'}

Recent events:
${eventSummary}`;
  }

  /**
   * Phase 3b: Check if task is complete
   */
  private async isTaskComplete(task: Task, currentState: string): Promise<boolean> {
    // Quick checks
    if (this.state.completedSteps >= this.state.planSteps.length) {
      return true;
    }

    // LLM check for complex completion criteria
    const prompt = `Based on the current state, is the task complete?

Original task: ${task.description}
Current state:
${currentState}

Respond with only "YES" or "NO" followed by a brief reason.`;

    const response = await this.config.llm.chat([
      {
        role: 'system',
        content: 'You are a task completion evaluator. Determine if a task has been successfully completed.',
      },
      { role: 'user', content: prompt },
    ]);

    return response.toLowerCase().startsWith('yes');
  }

  /**
   * Phase 3c: Select next action
   */
  private async selectNextAction(
    task: Task,
    currentState: string
  ): Promise<{ name: string; params: Record<string, unknown> } | null> {
    const remainingSteps = this.state.planSteps.slice(this.state.completedSteps);

    const prompt = `Select the next action to execute.

Task: ${task.description}
Current state:
${currentState}

Remaining steps:
${remainingSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Available tools:
${this.formatAvailableTools()}

Respond in JSON format:
{
  "action": "tool_name",
  "params": { "param1": "value1" },
  "reasoning": "Why this action"
}

Or respond with {"action": null} if task is complete.`;

    const response = await this.config.llm.chat([
      {
        role: 'system',
        content: `You are an action selector for an AI agent. Choose the most appropriate tool to execute next.
Always respond with valid JSON. Available tools: ${Array.from(this.config.tools.keys()).join(', ')}`,
      },
      { role: 'user', content: prompt },
    ]);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.action || parsed.action === 'null') return null;

      this.addEvent('thinking', `Selected action: ${parsed.action}\nReasoning: ${parsed.reasoning || 'N/A'}`);

      return {
        name: parsed.action,
        params: parsed.params || {},
      };
    } catch {
      return null;
    }
  }

  /**
   * Phase 3e: Execute action
   */
  private async executeAction(action: { name: string; params: Record<string, unknown> }): Promise<ToolResult> {
    const tool = this.config.tools.get(action.name);

    if (!tool) {
      return {
        success: false,
        output: null,
        error: `Unknown tool: ${action.name}`,
      };
    }

    this.emit('action-executing', { tool: action.name, params: action.params });

    try {
      const result = await tool.handler(action.params);

      this.emit('action-executed', {
        tool: action.name,
        params: action.params,
        success: result.success,
        output: result.output,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: null,
        error: errorMessage,
      };
    }
  }

  // ============================================================================
  // APPROVAL SYSTEM
  // ============================================================================

  /**
   * Check if action requires approval
   */
  private async requiresApproval(action: { name: string; params: Record<string, unknown> }): Promise<boolean> {
    if (this.config.mode === 'autonomous') return false;

    const tool = this.config.tools.get(action.name);
    if (tool?.requiresApproval) return true;

    return this.config.requireApprovalFor.some(
      (pattern) => action.name.includes(pattern) || JSON.stringify(action.params).includes(pattern)
    );
  }

  /**
   * Request approval for an action
   */
  private async requestApproval(action: { name: string; params: Record<string, unknown> }): Promise<boolean> {
    const approvalId = uuid();

    const approval: ApprovalRequest = {
      id: approvalId,
      taskId: 'current',
      agentId: 'agent-loop',
      action: action.name as ApprovalAction,
      description: `Execute ${action.name} with params: ${JSON.stringify(action.params)}`,
      details: action.params,
      riskLevel: 'medium',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      status: 'pending',
    };

    this.state.pendingApproval = approval;
    this.state.status = 'waiting-approval';

    this.emit('approval-required', approval);
    this.addEvent('approval', `Waiting for approval: ${action.name}`, { approvalId });

    // Wait for approval
    return new Promise((resolve) => {
      this.approvalResolvers.set(approvalId, (approved) => {
        this.state.pendingApproval = null;
        this.approvalResolvers.delete(approvalId);
        resolve(approved);
      });
    });
  }

  /**
   * Resolve a pending approval
   */
  resolveApproval(approvalId: string, approved: boolean, reason?: string): void {
    const resolver = this.approvalResolvers.get(approvalId);
    if (resolver) {
      resolver(approved, reason);
      this.addEvent('observation', `Approval ${approved ? 'granted' : 'denied'}${reason ? `: ${reason}` : ''}`);
    }
  }

  // ============================================================================
  // CONTROL METHODS
  // ============================================================================

  /**
   * Pause execution
   */
  pause(): void {
    if (!this.pausePromise) {
      let resolve: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      this.pausePromise = { resolve: resolve!, promise };
      this.state.status = 'paused';
      this.emit('paused', { iteration: this.state.iteration });
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.pausePromise) {
      this.pausePromise.resolve();
      this.pausePromise = null;
      this.state.status = 'running';
      this.emit('resumed', { iteration: this.state.iteration });
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.stopRequested = true;
    if (this.pausePromise) {
      this.pausePromise.resolve();
      this.pausePromise = null;
    }
  }

  // ============================================================================
  // CHECKPOINTING
  // ============================================================================

  /**
   * Create a checkpoint of current state
   */
  private async createCheckpoint(label: string): Promise<void> {
    if (!this.config.checkpointManager) return;

    const state: CheckpointState = {
      conversation: {
        messages: [],
        context: { iteration: this.state.iteration },
      },
      tasks: [],
      agents: [],
      memory: { shortTerm: {}, longTerm: {} },
      custom: {
        loopState: {
          iteration: this.state.iteration,
          planSteps: this.state.planSteps,
          completedSteps: this.state.completedSteps,
          events: this.state.events.slice(-20),
        },
      },
    };

    await this.config.checkpointManager.createCheckpoint(
      'agent-loop-session',
      state,
      'auto',
      label,
      'milestone'
    );

    this.addEvent('checkpoint', `Checkpoint created: ${label}`);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private createInitialState(): LoopState {
    return {
      iteration: 0,
      status: 'running',
      events: [],
      currentAction: null,
      lastObservation: null,
      planSteps: [],
      completedSteps: 0,
      pendingApproval: null,
    };
  }

  private addEvent(
    type: LoopEvent['type'],
    content: string,
    data?: Record<string, unknown>
  ): void {
    const event: LoopEvent = {
      id: uuid(),
      type,
      timestamp: new Date(),
      iteration: this.state.iteration,
      content,
      data,
      success: data?.success as boolean | undefined,
    };

    this.state.events.push(event);
    this.emit(type, event);
  }

  private formatAvailableTools(): string {
    return Array.from(this.config.tools.entries())
      .map(([name, tool]) => {
        const params = Object.entries(tool.parameters)
          .map(([pName, pDef]) => `  - ${pName}: ${pDef.type}${pDef.required ? ' (required)' : ''}`)
          .join('\n');
        return `${name}: ${tool.description}\n${params}`;
      })
      .join('\n\n');
  }

  private formatObservation(result: ToolResult): string {
    if (!result.success) {
      return `Error: ${result.error}`;
    }

    const output = typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);

    // Truncate if too long
    if (output.length > this.config.observationLimit) {
      return output.substring(0, this.config.observationLimit) + '\n... (truncated)';
    }

    return output;
  }

  private async generateFinalResult(task: Task): Promise<string> {
    const prompt = `Generate a summary of the completed task.

Task: ${task.description}
Iterations: ${this.state.iteration}
Completed steps: ${this.state.completedSteps}/${this.state.planSteps.length}

Recent observations:
${this.state.events
  .filter((e) => e.type === 'observation')
  .slice(-5)
  .map((e) => e.content.substring(0, 200))
  .join('\n')}

Provide a concise summary of what was accomplished.`;

    return await this.config.llm.chat([
      { role: 'system', content: 'You are a task completion reporter. Summarize task results clearly.' },
      { role: 'user', content: prompt },
    ]);
  }

  private extractResultData(): Record<string, unknown> {
    // Extract structured data from observations
    const data: Record<string, unknown> = {
      totalIterations: this.state.iteration,
      completedSteps: this.state.completedSteps,
      totalSteps: this.state.planSteps.length,
      successRate:
        this.state.events.filter((e) => e.type === 'observation' && e.success).length /
        Math.max(1, this.state.events.filter((e) => e.type === 'observation').length),
    };

    return data;
  }

  /**
   * Register default tools available to the agent
   */
  private registerDefaultTools(): void {
    // Browser navigation tool
    this.config.tools.set('navigate', {
      name: 'navigate',
      description: 'Navigate to a URL in the browser',
      parameters: {
        url: { type: 'string', description: 'The URL to navigate to', required: true },
      },
      handler: async (params) => {
        if (!this.config.browser) {
          return { success: false, output: null, error: 'Browser not available' };
        }
        try {
          await this.config.browser.navigate(params.url as string);
          const screenshot = await this.config.browser.screenshot();
          return { success: true, output: `Navigated to ${params.url}`, screenshot };
        } catch (error) {
          return {
            success: false,
            output: null,
            error: error instanceof Error ? error.message : 'Navigation failed',
          };
        }
      },
    });

    // Browser click tool
    this.config.tools.set('click', {
      name: 'click',
      description: 'Click on an element in the browser',
      parameters: {
        selector: { type: 'string', description: 'CSS selector for the element', required: true },
      },
      handler: async (params) => {
        if (!this.config.browser) {
          return { success: false, output: null, error: 'Browser not available' };
        }
        try {
          await this.config.browser.click(params.selector as string);
          const screenshot = await this.config.browser.screenshot();
          return { success: true, output: `Clicked on ${params.selector}`, screenshot };
        } catch (error) {
          return {
            success: false,
            output: null,
            error: error instanceof Error ? error.message : 'Click failed',
          };
        }
      },
    });

    // Browser type tool
    this.config.tools.set('type', {
      name: 'type',
      description: 'Type text into an input field',
      parameters: {
        selector: { type: 'string', description: 'CSS selector for the input', required: true },
        text: { type: 'string', description: 'Text to type', required: true },
      },
      handler: async (params) => {
        if (!this.config.browser) {
          return { success: false, output: null, error: 'Browser not available' };
        }
        try {
          await this.config.browser.type(params.selector as string, params.text as string);
          return { success: true, output: `Typed "${params.text}" into ${params.selector}` };
        } catch (error) {
          return {
            success: false,
            output: null,
            error: error instanceof Error ? error.message : 'Type failed',
          };
        }
      },
    });

    // Screenshot tool
    this.config.tools.set('screenshot', {
      name: 'screenshot',
      description: 'Take a screenshot of the current page',
      parameters: {},
      handler: async () => {
        if (!this.config.browser) {
          return { success: false, output: null, error: 'Browser not available' };
        }
        try {
          const screenshot = await this.config.browser.screenshot();
          return { success: true, output: 'Screenshot captured', screenshot };
        } catch (error) {
          return {
            success: false,
            output: null,
            error: error instanceof Error ? error.message : 'Screenshot failed',
          };
        }
      },
    });

    // Wait tool
    this.config.tools.set('wait', {
      name: 'wait',
      description: 'Wait for a specified duration',
      parameters: {
        ms: { type: 'number', description: 'Milliseconds to wait', required: true },
      },
      handler: async (params) => {
        await new Promise((resolve) => setTimeout(resolve, params.ms as number));
        return { success: true, output: `Waited ${params.ms}ms` };
      },
    });

    // Think tool (for reasoning)
    this.config.tools.set('think', {
      name: 'think',
      description: 'Pause to reason about the current situation',
      parameters: {
        thought: { type: 'string', description: 'The thought or reasoning', required: true },
      },
      handler: async (params) => {
        return { success: true, output: params.thought };
      },
    });

    // Complete tool (to signal completion)
    this.config.tools.set('complete', {
      name: 'complete',
      description: 'Signal that the task is complete',
      parameters: {
        summary: { type: 'string', description: 'Summary of what was accomplished', required: true },
      },
      handler: async (params) => {
        this.state.status = 'completed';
        return { success: true, output: params.summary };
      },
    });

    // Memory store tool
    this.config.tools.set('remember', {
      name: 'remember',
      description: 'Store information in memory for later use',
      parameters: {
        key: { type: 'string', description: 'Key to store the information under', required: true },
        value: { type: 'string', description: 'Information to remember', required: true },
      },
      handler: async (params) => {
        await this.config.memory.remember('agent', params.key as string, { value: params.value });
        return { success: true, output: `Remembered: ${params.key}` };
      },
    });

    // Memory recall tool
    this.config.tools.set('recall', {
      name: 'recall',
      description: 'Recall information from memory',
      parameters: {
        query: { type: 'string', description: 'Query to search memory', required: true },
      },
      handler: async (params) => {
        const results = await this.config.memory.recall('agent', params.query as string);
        return { success: true, output: JSON.stringify(results) };
      },
    });
  }

  /**
   * Register a custom tool
   */
  registerTool(tool: ToolDefinition): void {
    this.config.tools.set(tool.name, tool);
  }

  /**
   * Get current loop state
   */
  getState(): LoopState {
    return { ...this.state };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createAgentLoop(config: AgentLoopConfig): AgentLoop {
  return new AgentLoop(config);
}

export default AgentLoop;
