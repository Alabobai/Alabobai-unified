/**
 * Alabobai Agentic Loop
 * OpenClaw-style Think → Plan → Act → Observe cycle
 * 
 * This implements the core agentic execution pattern that allows
 * the AI to autonomously complete complex tasks.
 */

import { EventEmitter } from 'events';
import type {
  LoopPhase,
  ThinkResult,
  PlanStep,
  PlanResult,
  ActionResult,
  ObserveResult,
  LoopIteration,
  AgenticLoopConfig,
  LoopState,
} from './types.js';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: AgenticLoopConfig = {
  maxIterations: 20,
  maxTokensPerStep: 4000,
  thinkingTimeout: 30000,
  actionTimeout: 60000,
  parallelActions: false,
  requireConfirmation: false,
  stopOnError: false,
  verbose: true,
};

// ============================================================================
// AGENTIC LOOP CLASS
// ============================================================================

export class AgenticLoop extends EventEmitter {
  private config: AgenticLoopConfig;
  private state: LoopState;
  private tools: Map<string, ToolDefinition>;
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient, config: Partial<AgenticLoopConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llmClient = llmClient;
    this.tools = new Map();
    this.state = this.createInitialState();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.emit('tool-registered', { name: tool.name });
  }

  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.emit('tool-unregistered', { name });
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  // ============================================================================
  // MAIN EXECUTION
  // ============================================================================

  async run(task: string, context?: string): Promise<LoopResult> {
    this.state = this.createInitialState();
    this.state.task = task;
    this.state.context = context || '';
    this.state.startTime = Date.now();
    this.state.isRunning = true;

    this.emit('loop-start', { task, context });

    try {
      while (this.shouldContinue()) {
        const iteration = await this.executeIteration();
        this.state.iterations.push(iteration);
        this.state.currentIteration = (this.state.currentIteration ?? 0) + 1;

        this.emit('iteration-complete', iteration);

        if (iteration.isComplete) {
          this.state.isComplete = true;
          break;
        }

        if (iteration.error && this.config.stopOnError) {
          this.state.error = iteration.error;
          break;
        }
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
      this.emit('loop-error', { error: this.state.error });
    }

    this.state.isRunning = false;
    this.state.endTime = Date.now();

    const result = this.buildResult();
    this.emit('loop-complete', result);

    return result;
  }

  stop(): void {
    this.state.isRunning = false;
    this.emit('loop-stopped', { iteration: this.state.currentIteration });
  }

  // ============================================================================
  // ITERATION EXECUTION
  // ============================================================================

  private async executeIteration(): Promise<LoopIteration> {
    const iteration: LoopIteration = {
      number: this.state.currentIteration ?? 0,
      phases: {
        think: undefined,
        plan: undefined,
        act: undefined,
        observe: undefined,
      },
      startTime: Date.now(),
      isComplete: false,
    };

    try {
      const phases = iteration.phases!;

      // THINK: Analyze the current state and task
      this.state.currentPhase = 'think';
      this.emit('phase-start', { phase: 'think', iteration: iteration.number });
      phases.think = await this.think();
      this.emit('phase-complete', { phase: 'think', result: phases.think });

      // Check if clarification is needed
      if (phases.think?.clarificationNeeded) {
        this.emit('clarification-needed', {
          question: phases.think.clarificationQuestion
        });
        return iteration;
      }

      // PLAN: Create a plan of action
      this.state.currentPhase = 'plan';
      this.emit('phase-start', { phase: 'plan', iteration: iteration.number });
      phases.plan = await this.plan(phases.think!);
      this.emit('phase-complete', { phase: 'plan', result: phases.plan });

      // Check if confirmation is needed
      if (this.config.requireConfirmation && phases.plan && phases.plan.steps.length > 0) {
        const confirmed = await this.requestConfirmation(phases.plan);
        if (!confirmed) {
          iteration.cancelled = true;
          return iteration;
        }
      }

      // ACT: Execute the plan
      this.state.currentPhase = 'act';
      this.emit('phase-start', { phase: 'act', iteration: iteration.number });
      phases.act = await this.act(phases.plan!);
      this.emit('phase-complete', { phase: 'act', result: phases.act });

      // OBSERVE: Analyze the results
      this.state.currentPhase = 'observe';
      this.emit('phase-start', { phase: 'observe', iteration: iteration.number });
      phases.observe = await this.observe(phases.act!);
      this.emit('phase-complete', { phase: 'observe', result: phases.observe });

      // Check if task is complete
      iteration.isComplete = phases.observe?.taskComplete ?? false;
      if (iteration.isComplete) {
        this.state.finalAnswer = phases.observe?.summary;
      }

    } catch (error) {
      iteration.error = error instanceof Error ? error.message : String(error);
      this.emit('iteration-error', { iteration: iteration.number, error: iteration.error });
    }

    iteration.endTime = Date.now();
    iteration.duration = iteration.endTime - (iteration.startTime ?? iteration.endTime);

    return iteration;
  }

  // ============================================================================
  // PHASE: THINK
  // ============================================================================

  private async think(): Promise<ThinkResult> {
    const prompt = this.buildThinkPrompt();

    const response = await this.llmClient.chat([
      { role: 'system', content: this.getThinkSystemPrompt() },
      { role: 'user', content: prompt }
    ]);

    return this.parseThinkResponse(response);
  }

  private buildThinkPrompt(): string {
    const recentActions = this.state.iterations
      .slice(-3)
      .map(i => this.summarizeIteration(i))
      .join('\n\n');

    return `
## Current Task
${this.state.task}

## Context
${this.state.context}

## Available Tools
${this.formatToolsDescription()}

## Recent Actions
${recentActions || 'None yet - this is the first iteration.'}

## Current State
Iteration: ${(this.state.currentIteration ?? 0) + 1}
Progress: Analyzing the task and determining next steps.

Please analyze this task and provide your thinking about how to approach it.
`;
  }

  private getThinkSystemPrompt(): string {
    return `You are an AI agent that thinks step by step about how to complete tasks.
Analyze the task and context to understand what needs to be done.

Respond with a JSON object containing:
{
  "analysis": "Your analysis of the current situation",
  "intent": "What you understand the user wants to accomplish",
  "confidence": 0.0-1.0 confidence score,
  "requiresTools": true/false - whether tools are needed,
  "clarificationNeeded": true/false - if you need more info,
  "clarificationQuestion": "Question to ask if needed"
}`;
  }

  private parseThinkResponse(response: string): ThinkResult {
    try {
      const json = this.extractJSON(response);
      return {
        analysis: json.analysis || response,
        intent: json.intent || 'Unknown',
        confidence: json.confidence || 0.5,
        requiresTools: json.requiresTools ?? true,
        clarificationNeeded: json.clarificationNeeded || false,
        clarificationQuestion: json.clarificationQuestion,
      };
    } catch {
      return {
        analysis: response,
        intent: 'Unable to parse intent',
        confidence: 0.3,
        requiresTools: true,
        clarificationNeeded: false,
      };
    }
  }

  // ============================================================================
  // PHASE: PLAN
  // ============================================================================

  private async plan(thinkResult: ThinkResult): Promise<PlanResult> {
    const prompt = this.buildPlanPrompt(thinkResult);

    const response = await this.llmClient.chat([
      { role: 'system', content: this.getPlanSystemPrompt() },
      { role: 'user', content: prompt }
    ]);

    return this.parsePlanResponse(response);
  }

  private buildPlanPrompt(thinkResult: ThinkResult): string {
    return `
## Task Analysis
${thinkResult.analysis}

## Intent
${thinkResult.intent}

## Available Tools
${this.formatToolsForPlanning()}

## Instructions
Based on the analysis, create a concrete plan with specific steps to accomplish the task.
Each step should use one of the available tools if needed.
`;
  }

  private getPlanSystemPrompt(): string {
    return `You are an AI agent that creates actionable plans.
Break down the task into specific, executable steps.

Respond with a JSON object containing:
{
  "reasoning": "Why you chose this plan",
  "steps": [
    {
      "id": "step1",
      "description": "What this step does",
      "toolName": "name_of_tool" or null if no tool needed,
      "toolArgs": { "arg1": "value1" } or null,
      "expectedOutcome": "What you expect to happen",
      "dependsOn": ["previous_step_id"] or []
    }
  ],
  "estimatedSteps": number,
  "risks": ["potential issues"]
}`;
  }

  private parsePlanResponse(response: string): PlanResult {
    try {
      const json = this.extractJSON(response);
      return {
        reasoning: json.reasoning || '',
        steps: (json.steps || []).map((s: any, i: number) => ({
          id: s.id || `step_${i + 1}`,
          description: s.description || '',
          toolName: s.toolName,
          toolArgs: s.toolArgs,
          expectedOutcome: s.expectedOutcome || '',
          dependsOn: s.dependsOn || [],
          status: 'pending' as const,
        })),
        estimatedSteps: json.estimatedSteps || json.steps?.length || 0,
        risks: json.risks || [],
      };
    } catch {
      return {
        reasoning: response,
        steps: [],
        estimatedSteps: 0,
        risks: ['Could not parse plan'],
      };
    }
  }

  // ============================================================================
  // PHASE: ACT
  // ============================================================================

  private async act(planResult: PlanResult): Promise<ActionResult> {
    const results: StepResult[] = [];
    const errors: string[] = [];

    for (const step of planResult.steps) {
      if (!this.state.isRunning) break;

      this.emit('step-start', { step });

      try {
        const result = await this.executeStep(step);
        results.push(result);
        step.status = result.success ? 'completed' : 'failed';

        this.emit('step-complete', { step, result });

        if (!result.success && this.config.stopOnError) {
          errors.push(result.error || 'Unknown error');
          break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        step.status = 'failed';

        this.emit('step-error', { step, error: errorMsg });

        if (this.config.stopOnError) break;
      }
    }

    return {
      stepsExecuted: results.length,
      stepsSucceeded: results.filter(r => r.success).length,
      stepsFailed: results.filter(r => !r.success).length,
      results,
      errors,
      output: results.map(r => r.output).filter(Boolean).join('\n\n'),
    };
  }

  private async executeStep(step: PlanStep): Promise<StepResult> {
    if (!step.toolName) {
      // No tool needed - this is a thinking/reasoning step
      return {
        stepId: step.id,
        success: true,
        output: step.description,
      };
    }

    const tool = this.tools.get(step.toolName);
    if (!tool) {
      return {
        stepId: step.id,
        success: false,
        error: `Tool not found: ${step.toolName}`,
      };
    }

    try {
      const output = await this.executeTool(tool, step.toolArgs || {});
      return {
        stepId: step.id,
        success: true,
        output: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
        toolUsed: step.toolName,
      };
    } catch (error) {
      return {
        stepId: step.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        toolUsed: step.toolName,
      };
    }
  }

  private async executeTool(tool: ToolDefinition, args: Record<string, any>): Promise<any> {
    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool ${tool.name} has no execute function`);
    }

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tool execution timeout')), this.config.actionTimeout);
    });

    return Promise.race([tool.execute(args), timeout]);
  }

  // ============================================================================
  // PHASE: OBSERVE
  // ============================================================================

  private async observe(actionResult: ActionResult): Promise<ObserveResult> {
    const prompt = this.buildObservePrompt(actionResult);

    const response = await this.llmClient.chat([
      { role: 'system', content: this.getObserveSystemPrompt() },
      { role: 'user', content: prompt }
    ]);

    return this.parseObserveResponse(response);
  }

  private buildObservePrompt(actionResult: ActionResult): string {
    return `
## Original Task
${this.state.task}

## Actions Taken
${actionResult.stepsExecuted} steps executed
${actionResult.stepsSucceeded} succeeded
${actionResult.stepsFailed} failed

## Output
${actionResult.output || 'No output'}

## Errors
${(actionResult.errors?.length ?? 0) > 0 ? actionResult.errors!.join('\n') : 'None'}

## Instructions
Analyze the results and determine:
1. Was the task completed successfully?
2. What was accomplished?
3. Are there any remaining steps needed?
`;
  }

  private getObserveSystemPrompt(): string {
    return `You are an AI agent that observes and evaluates task completion.
Analyze the results of the actions taken.

Respond with a JSON object containing:
{
  "taskComplete": true/false,
  "summary": "Summary of what was accomplished",
  "remainingWork": ["list of remaining tasks if any"],
  "nextSteps": ["suggested next steps"],
  "confidence": 0.0-1.0 confidence in task completion,
  "learnings": ["what we learned from this iteration"]
}`;
  }

  private parseObserveResponse(response: string): ObserveResult {
    try {
      const json = this.extractJSON(response);
      return {
        taskComplete: json.taskComplete || false,
        summary: json.summary || response,
        remainingWork: json.remainingWork || [],
        nextSteps: json.nextSteps || [],
        confidence: json.confidence || 0.5,
        learnings: json.learnings || [],
      };
    } catch {
      return {
        taskComplete: false,
        summary: response,
        remainingWork: [],
        nextSteps: ['Unable to parse observation results'],
        confidence: 0.3,
        learnings: [],
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private shouldContinue(): boolean {
    return Boolean(
      this.state.isRunning &&
      !this.state.isComplete &&
      (this.state.currentIteration ?? 0) < this.config.maxIterations &&
      !this.state.error
    );
  }

  private createInitialState(): LoopState {
    return {
      task: '',
      context: '',
      currentIteration: 0,
      currentPhase: 'think',
      iterations: [],
      isRunning: false,
      isComplete: false,
      startTime: 0,
    };
  }

  private buildResult(): LoopResult {
    return {
      success: Boolean(this.state.isComplete && !this.state.error),
      task: this.state.task ?? '',
      answer: this.state.finalAnswer,
      iterations: this.state.iterations.length,
      totalDuration: (this.state.endTime || Date.now()) - (this.state.startTime ?? 0),
      error: this.state.error,
      history: this.state.iterations,
    };
  }

  private formatToolsDescription(): string {
    return Array.from(this.tools.values())
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');
  }

  private formatToolsForPlanning(): string {
    return Array.from(this.tools.values())
      .map(t => {
        const params = t.parameters
          ? Object.entries(t.parameters.properties || {})
              .map(([name, schema]: [string, any]) => `  - ${name}: ${schema.description || schema.type}`)
              .join('\n')
          : '  (no parameters)';
        return `### ${t.name}\n${t.description}\nParameters:\n${params}`;
      })
      .join('\n\n');
  }

  private summarizeIteration(iteration: LoopIteration): string {
    const phaseSummary = [];
    const phases = iteration.phases;
    if (phases?.think) phaseSummary.push(`Think: ${phases.think.intent}`);
    if (phases?.plan) phaseSummary.push(`Plan: ${phases.plan.steps.length} steps`);
    if (phases?.act) phaseSummary.push(`Act: ${phases.act.stepsSucceeded ?? 0}/${phases.act.stepsExecuted ?? 0} succeeded`);
    if (phases?.observe) phaseSummary.push(`Observe: ${phases.observe.summary.slice(0, 100)}`);
    return `**Iteration ${(iteration.number ?? 0) + 1}**\n${phaseSummary.join('\n')}`;
  }

  private extractJSON(text: string): any {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  }

  private async requestConfirmation(plan: PlanResult): Promise<boolean> {
    return new Promise((resolve) => {
      this.emit('confirmation-required', {
        plan,
        confirm: () => resolve(true),
        cancel: () => resolve(false),
      });
      // Auto-confirm after timeout if not handled
      setTimeout(() => resolve(true), 30000);
    });
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface LLMClient {
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output?: string;
  error?: string;
  toolUsed?: string;
}

export interface LoopResult {
  success: boolean;
  task: string;
  answer?: string;
  iterations: number;
  totalDuration: number;
  error?: string;
  history: LoopIteration[];
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAgenticLoop(
  llmClient: LLMClient,
  config?: Partial<AgenticLoopConfig>
): AgenticLoop {
  return new AgenticLoop(llmClient, config);
}
