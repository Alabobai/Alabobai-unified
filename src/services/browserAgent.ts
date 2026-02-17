/**
 * Alabobai Browser Agent Service
 *
 * AI-powered browser automation agent that can:
 * - Analyze screenshots with vision API
 * - Plan actions from user intent
 * - Identify elements from descriptions
 * - Execute multi-step tasks
 * - Recover from errors with retry logic
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import {
  BrowserAutomationService,
  BrowserSession,
  ActionResult,
  ElementInfo,
  DOMSnapshot,
} from './browserAutomation.js';
import { VisionAnalyzer, VisualElement, PageAnalysis, ActionSuggestion } from '../browser/VisionAnalyzer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserAgentConfig {
  anthropicApiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelay?: number;
  screenshotOnAction?: boolean;
  maxStepsPerTask?: number;
  confirmSensitiveActions?: boolean;
}

export interface TaskPlan {
  id: string;
  goal: string;
  steps: TaskStep[];
  currentStepIndex: number;
  status: TaskStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  results: TaskStepResult[];
}

export interface TaskStep {
  id: string;
  action: PlannedAction;
  description: string;
  dependsOn?: string[];
  optional?: boolean;
  retryCount?: number;
}

export interface PlannedAction {
  type: 'navigate' | 'click' | 'type' | 'fill' | 'scroll' | 'wait' | 'extract' | 'screenshot' | 'verify';
  target?: ActionTarget;
  value?: string;
  options?: Record<string, unknown>;
}

export interface ActionTarget {
  description: string;
  selector?: string;
  coordinates?: { x: number; y: number };
  text?: string;
  nearText?: string;
  elementType?: string;
}

export type TaskStatus = 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface TaskStepResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  screenshot?: string;
  duration: number;
  retryAttempt?: number;
}

export interface UserIntent {
  goal: string;
  constraints?: string[];
  preferences?: {
    speed?: 'fast' | 'normal' | 'careful';
    verbosity?: 'minimal' | 'normal' | 'detailed';
    confirmActions?: boolean;
  };
  context?: string;
}

export interface ElementMatch {
  element: VisualElement | ElementInfo;
  confidence: number;
  matchType: 'exact' | 'partial' | 'inferred';
  selector?: string;
  coordinates?: { x: number; y: number };
}

export interface AgentThought {
  id: string;
  timestamp: Date;
  type: 'observation' | 'reasoning' | 'plan' | 'action' | 'error' | 'success';
  content: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// BROWSER AGENT SERVICE
// ============================================================================

export class BrowserAgentService extends EventEmitter {
  private anthropic: Anthropic;
  private visionAnalyzer: VisionAnalyzer;
  private browserService: BrowserAutomationService;
  private config: Required<BrowserAgentConfig>;
  private activeTasks: Map<string, TaskPlan> = new Map();
  private thoughtLog: Map<string, AgentThought[]> = new Map();

  constructor(
    browserService: BrowserAutomationService,
    config: BrowserAgentConfig = {}
  ) {
    super();
    this.browserService = browserService;
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.visionAnalyzer = new VisionAnalyzer({
      apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.config = {
      anthropicApiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      model: config.model || 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.3,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      screenshotOnAction: config.screenshotOnAction ?? true,
      maxStepsPerTask: config.maxStepsPerTask || 50,
      confirmSensitiveActions: config.confirmSensitiveActions ?? true,
    };
  }

  // ============================================================================
  // MAIN TASK EXECUTION
  // ============================================================================

  /**
   * Execute a task based on user intent
   */
  async executeTask(
    sessionId: string,
    intent: UserIntent
  ): Promise<TaskPlan> {
    const taskId = uuid();

    // Initialize task
    const task: TaskPlan = {
      id: taskId,
      goal: intent.goal,
      steps: [],
      currentStepIndex: 0,
      status: 'planning',
      startedAt: new Date(),
      results: [],
    };

    this.activeTasks.set(taskId, task);
    this.thoughtLog.set(taskId, []);

    this.emit('task:started', { taskId, goal: intent.goal });

    try {
      // Analyze current page state
      this.addThought(taskId, 'observation', 'Analyzing current page state...');
      const pageState = await this.analyzePageState(sessionId);

      // Plan the task
      this.addThought(taskId, 'plan', `Planning steps to achieve: ${intent.goal}`);
      const plan = await this.planTask(sessionId, intent, pageState);
      task.steps = plan.steps;

      this.emit('task:planned', { taskId, steps: task.steps });

      // Execute steps
      task.status = 'running';

      while (task.currentStepIndex < task.steps.length && task.status === 'running') {
        const step = task.steps[task.currentStepIndex];

        // Check step limit
        if (task.currentStepIndex >= this.config.maxStepsPerTask) {
          throw new Error(`Task exceeded maximum steps (${this.config.maxStepsPerTask})`);
        }

        this.emit('step:started', { taskId, step, index: task.currentStepIndex });

        const result = await this.executeStep(sessionId, step, task);
        task.results.push(result);

        if (result.success) {
          this.addThought(taskId, 'success', `Step completed: ${step.description}`);
          this.emit('step:completed', { taskId, step, result });
          task.currentStepIndex++;
        } else if (step.optional) {
          this.addThought(taskId, 'observation', `Optional step failed, continuing: ${step.description}`);
          task.currentStepIndex++;
        } else {
          // Try recovery
          const recovered = await this.attemptRecovery(sessionId, step, result, task);
          if (!recovered) {
            throw new Error(`Step failed: ${step.description} - ${result.error}`);
          }
          task.currentStepIndex++;
        }
      }

      // Verify goal completion
      const verified = await this.verifyGoalCompletion(sessionId, intent.goal, task);

      if (verified) {
        task.status = 'completed';
        task.completedAt = new Date();
        this.addThought(taskId, 'success', `Task completed: ${intent.goal}`);
        this.emit('task:completed', { taskId, task });
      } else {
        // Try additional steps if goal not met
        const additionalSteps = await this.planAdditionalSteps(sessionId, intent, task);
        if (additionalSteps.length > 0) {
          task.steps.push(...additionalSteps);
          // Continue execution would happen in the next iteration
        } else {
          task.status = 'completed';
          task.completedAt = new Date();
          this.addThought(taskId, 'observation', 'Task completed but goal verification uncertain');
          this.emit('task:completed', { taskId, task });
        }
      }

    } catch (error) {
      const err = error as Error;
      task.status = 'failed';
      task.error = err.message;
      this.addThought(taskId, 'error', `Task failed: ${err.message}`);
      this.emit('task:failed', { taskId, error: err.message });
    }

    return task;
  }

  /**
   * Plan a task based on intent
   */
  private async planTask(
    sessionId: string,
    intent: UserIntent,
    pageState: PageState
  ): Promise<{ steps: TaskStep[] }> {
    const prompt = `You are an AI browser automation agent. Plan the steps needed to achieve the following goal.

GOAL: ${intent.goal}

${intent.constraints ? `CONSTRAINTS:\n${intent.constraints.join('\n')}` : ''}

CURRENT PAGE STATE:
- URL: ${pageState.url}
- Title: ${pageState.title}
- Interactive Elements: ${pageState.interactiveElements.length} found
- Forms: ${pageState.forms.length} found
- Links: ${pageState.links.length} found

${pageState.interactiveElements.slice(0, 20).map((el, i) =>
  `${i + 1}. [${el.tagName}] ${el.text || el.ariaLabel || el.placeholder || el.id || 'unnamed'} ${el.selector ? `(${el.selector})` : ''}`
).join('\n')}

Create a step-by-step plan to achieve the goal. Each step should be atomic and executable.

Respond with a JSON array of steps:
[
  {
    "action": "navigate|click|type|fill|scroll|wait|extract|screenshot|verify",
    "description": "Human-readable description of what this step does",
    "target": {
      "description": "What to interact with",
      "selector": "CSS selector if known",
      "text": "Text content to look for",
      "nearText": "Text near the target",
      "elementType": "button|link|input|etc"
    },
    "value": "Value to type/fill if applicable",
    "options": {},
    "optional": false
  }
]

Return ONLY valid JSON, no markdown formatting.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const text = textContent?.type === 'text' ? textContent.text : '';

      // Clean and parse response
      let cleanText = text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }

      const stepsData = JSON.parse(cleanText);

      const steps: TaskStep[] = stepsData.map((stepData: {
        action: string;
        description: string;
        target?: ActionTarget;
        value?: string;
        options?: Record<string, unknown>;
        optional?: boolean;
      }, index: number) => ({
        id: uuid(),
        action: {
          type: stepData.action as PlannedAction['type'],
          target: stepData.target,
          value: stepData.value,
          options: stepData.options,
        },
        description: stepData.description,
        optional: stepData.optional ?? false,
        retryCount: 0,
      }));

      return { steps };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to plan task:', err);

      // Return minimal plan if planning fails
      return {
        steps: [
          {
            id: uuid(),
            action: {
              type: 'screenshot',
              options: { fullPage: false },
            },
            description: 'Capture current state for analysis',
            optional: true,
          },
        ],
      };
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    sessionId: string,
    step: TaskStep,
    task: TaskPlan
  ): Promise<TaskStepResult> {
    const startTime = Date.now();
    let retryAttempt = step.retryCount ?? 0;

    try {
      this.addThought(task.id, 'action', `Executing: ${step.description}`);

      let result: ActionResult;

      switch (step.action.type) {
        case 'navigate':
          const url = step.action.value || step.action.target?.description;
          if (!url) throw new Error('No URL provided for navigation');
          result = await this.browserService.navigate(sessionId, url);
          break;

        case 'click':
          const clickTarget = await this.resolveTarget(sessionId, step.action.target);
          result = await this.browserService.click(sessionId, clickTarget);
          break;

        case 'type':
          const typeTarget = await this.resolveTarget(sessionId, step.action.target);
          result = await this.browserService.type(sessionId, {
            text: step.action.value || '',
            selector: typeTarget.selector,
          });
          break;

        case 'fill':
          const fillTarget = await this.resolveTarget(sessionId, step.action.target);
          if (!fillTarget.selector) throw new Error('Fill requires a selector');
          result = await this.browserService.fill(sessionId, fillTarget.selector, step.action.value || '');
          break;

        case 'scroll':
          const scrollOptions = step.action.options ?? {};
          result = await this.browserService.scroll(sessionId, {
            deltaY: (scrollOptions.deltaY as number) ?? 300,
            ...scrollOptions,
          });
          break;

        case 'wait':
          result = await this.browserService.wait(sessionId, {
            duration: step.action.options?.duration as number,
            selector: step.action.target?.selector,
            state: step.action.options?.state as 'visible' | 'hidden' | 'attached' | 'detached',
          });
          break;

        case 'extract':
          const domResult = await this.browserService.getDOM(sessionId);
          result = {
            success: domResult.success,
            data: domResult.data,
            action: domResult.action,
          };
          break;

        case 'screenshot':
          const ssResult = await this.browserService.screenshot(sessionId, step.action.options);
          result = {
            success: ssResult.success,
            screenshot: ssResult.data?.base64,
            action: ssResult.action,
          };
          break;

        case 'verify':
          result = await this.verifyCondition(sessionId, step.action);
          break;

        default:
          throw new Error(`Unknown action type: ${step.action.type}`);
      }

      // Take screenshot after action if configured
      let screenshot: string | undefined;
      if (this.config.screenshotOnAction && step.action.type !== 'screenshot') {
        const ssResult = await this.browserService.screenshot(sessionId);
        screenshot = ssResult.data?.base64;
      }

      return {
        stepId: step.id,
        success: result.success,
        data: result.data,
        error: result.error,
        screenshot: screenshot || result.screenshot,
        duration: Date.now() - startTime,
        retryAttempt,
      };

    } catch (error) {
      const err = error as Error;

      return {
        stepId: step.id,
        success: false,
        error: err.message,
        duration: Date.now() - startTime,
        retryAttempt,
      };
    }
  }

  /**
   * Resolve a target description to concrete coordinates or selector
   */
  private async resolveTarget(
    sessionId: string,
    target?: ActionTarget
  ): Promise<{ x?: number; y?: number; selector?: string }> {
    if (!target) {
      return {};
    }

    // If we already have coordinates, use them
    if (target.coordinates) {
      return { x: target.coordinates.x, y: target.coordinates.y };
    }

    // If we have a selector, verify it exists
    if (target.selector) {
      const element = await this.browserService.findElement(sessionId, target.selector);
      if (element.success && element.data) {
        return { selector: target.selector };
      }
    }

    // Try to find element by text/description
    const domResult = await this.browserService.getDOM(sessionId);
    if (!domResult.success || !domResult.data) {
      throw new Error('Failed to get DOM for target resolution');
    }

    const matchedElement = await this.findElementByDescription(
      target.description,
      domResult.data.elements,
      target
    );

    if (matchedElement) {
      if (matchedElement.selector) {
        return { selector: matchedElement.selector };
      }
      if (matchedElement.coordinates) {
        return { x: matchedElement.coordinates.x, y: matchedElement.coordinates.y };
      }
    }

    // Fall back to vision-based element finding
    const ssResult = await this.browserService.screenshot(sessionId);
    if (ssResult.success && ssResult.data) {
      const session = this.browserService.getSession(sessionId);
      const viewport = session?.viewport || { width: 1280, height: 720 };

      const clickTarget = await this.visionAnalyzer.getClickTarget(
        ssResult.data.base64,
        target.description,
        viewport
      );

      if (clickTarget && clickTarget.confidence > 0.5) {
        return { x: clickTarget.x, y: clickTarget.y };
      }
    }

    throw new Error(`Could not resolve target: ${target.description}`);
  }

  /**
   * Find an element by description in DOM elements
   */
  private async findElementByDescription(
    description: string,
    elements: ElementInfo[],
    hints: ActionTarget
  ): Promise<ElementMatch | null> {
    const descLower = description.toLowerCase();
    const textToFind = hints.text?.toLowerCase();
    const nearText = hints.nearText?.toLowerCase();
    const elementType = hints.elementType?.toLowerCase();

    // Score each element
    const scored = elements.map(element => {
      let score = 0;

      // Match by text content
      const elementText = (element.text || '').toLowerCase();
      if (textToFind && elementText.includes(textToFind)) {
        score += 50;
      }
      if (elementText.includes(descLower) || descLower.includes(elementText)) {
        score += 30;
      }

      // Match by element type
      if (elementType && element.tagName === elementType) {
        score += 20;
      }

      // Match by aria-label or placeholder
      if (element.ariaLabel?.toLowerCase().includes(descLower)) {
        score += 40;
      }
      if (element.placeholder?.toLowerCase().includes(descLower)) {
        score += 35;
      }

      // Match by ID or class
      if (element.id?.toLowerCase().includes(descLower.replace(/\s+/g, '-'))) {
        score += 25;
      }
      if (element.className?.toLowerCase().includes(descLower.replace(/\s+/g, '-'))) {
        score += 15;
      }

      // Visibility and interactability bonuses
      if (element.isVisible) score += 10;
      if (element.isEnabled) score += 5;

      return { element, score };
    });

    // Sort by score and get best match
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score > 20) {
      // Build selector
      let selector: string | undefined;
      if (best.element.id) {
        selector = `#${best.element.id}`;
      } else if (best.element.className) {
        const classes = best.element.className.split(' ').filter(c => c).slice(0, 2);
        if (classes.length > 0) {
          selector = `${best.element.tagName}.${classes.join('.')}`;
        }
      }

      return {
        element: best.element,
        confidence: Math.min(best.score / 100, 1),
        matchType: best.score > 60 ? 'exact' : best.score > 40 ? 'partial' : 'inferred',
        selector,
        coordinates: best.element.bounds ? {
          x: best.element.bounds.x + best.element.bounds.width / 2,
          y: best.element.bounds.y + best.element.bounds.height / 2,
        } : undefined,
      };
    }

    return null;
  }

  /**
   * Verify a condition
   */
  private async verifyCondition(
    sessionId: string,
    action: PlannedAction
  ): Promise<ActionResult> {
    const condition = action.options?.condition as string;
    const selector = action.target?.selector;

    if (selector) {
      const element = await this.browserService.findElement(sessionId, selector);
      return {
        success: !!element.data,
        data: { exists: !!element.data },
        action: element.action,
      };
    }

    // Vision-based verification
    const ssResult = await this.browserService.screenshot(sessionId);
    if (!ssResult.success || !ssResult.data) {
      return {
        success: false,
        error: 'Failed to capture screenshot for verification',
        action: ssResult.action,
      };
    }

    const session = this.browserService.getSession(sessionId);
    const viewport = session?.viewport || { width: 1280, height: 720 };

    const analysis = await this.visionAnalyzer.analyzeScreenshot(
      ssResult.data.base64,
      viewport
    );

    // Check if the condition/target is visible
    const target = action.target?.description || condition;
    const found = analysis.elements.some(el =>
      el.label.toLowerCase().includes(target?.toLowerCase() || '') ||
      el.description.toLowerCase().includes(target?.toLowerCase() || '')
    );

    return {
      success: found,
      data: { found, analysisId: analysis.id },
      action: ssResult.action,
    };
  }

  // ============================================================================
  // ERROR RECOVERY
  // ============================================================================

  /**
   * Attempt to recover from a failed step
   */
  private async attemptRecovery(
    sessionId: string,
    step: TaskStep,
    failedResult: TaskStepResult,
    task: TaskPlan
  ): Promise<boolean> {
    const maxRetries = this.config.maxRetries;
    step.retryCount = (step.retryCount ?? 0) + 1;

    if (step.retryCount > maxRetries) {
      this.addThought(task.id, 'error', `Max retries exceeded for step: ${step.description}`);
      return false;
    }

    this.addThought(task.id, 'reasoning', `Attempting recovery (attempt ${step.retryCount}/${maxRetries})`);

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));

    // Analyze current state
    const pageState = await this.analyzePageState(sessionId);

    // Try alternative strategies based on error type
    if (failedResult.error?.includes('Element not found')) {
      // Try scrolling to find element
      await this.browserService.scroll(sessionId, { deltaY: 300 });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Re-plan the step with new context
      const newStep = await this.replanStep(step, pageState, failedResult.error);
      if (newStep) {
        step.action = newStep.action;
        return true;
      }
    }

    if (failedResult.error?.includes('timeout')) {
      // Increase wait and retry
      if (step.action.options) {
        step.action.options.timeout = ((step.action.options.timeout as number) || 30000) * 1.5;
      }
      return true;
    }

    // Try vision-based recovery
    const ssResult = await this.browserService.screenshot(sessionId);
    if (ssResult.success && ssResult.data) {
      const session = this.browserService.getSession(sessionId);
      const viewport = session?.viewport || { width: 1280, height: 720 };

      const suggestion = await this.visionAnalyzer.suggestNextAction(
        ssResult.data.base64,
        step.description,
        task.results.map(r => `${r.success ? 'OK' : 'FAIL'}: ${task.steps.find(s => s.id === r.stepId)?.description}`),
        viewport
      );

      if (suggestion && suggestion.confidence > 0.6) {
        this.addThought(task.id, 'reasoning', `Vision suggests: ${suggestion.action} - ${suggestion.reason}`);

        // Update step based on vision suggestion
        step.action = {
          type: suggestion.action as PlannedAction['type'],
          target: {
            description: suggestion.target as string,
          },
        };
        return true;
      }
    }

    return false;
  }

  /**
   * Re-plan a step based on current state
   */
  private async replanStep(
    originalStep: TaskStep,
    pageState: PageState,
    error: string
  ): Promise<TaskStep | null> {
    const prompt = `A browser automation step failed. Help re-plan it.

ORIGINAL STEP:
- Action: ${originalStep.action.type}
- Description: ${originalStep.description}
- Target: ${JSON.stringify(originalStep.action.target)}

ERROR: ${error}

CURRENT PAGE STATE:
- URL: ${pageState.url}
- Title: ${pageState.title}
- Interactive Elements (first 15):
${pageState.interactiveElements.slice(0, 15).map((el, i) =>
  `${i + 1}. [${el.tagName}] ${el.text || el.ariaLabel || el.id || 'unnamed'}`
).join('\n')}

Suggest an alternative approach to accomplish the same goal.

Respond with JSON:
{
  "action": "click|type|fill|scroll|wait",
  "target": {
    "description": "What to interact with",
    "selector": "CSS selector if you can determine one",
    "text": "Text to look for"
  },
  "value": "Value if needed",
  "reasoning": "Why this alternative should work"
}

Return ONLY valid JSON, no markdown formatting.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const text = textContent?.type === 'text' ? textContent.text : '';

      let cleanText = text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }

      const suggestion = JSON.parse(cleanText);

      return {
        id: originalStep.id,
        action: {
          type: suggestion.action,
          target: suggestion.target,
          value: suggestion.value,
        },
        description: originalStep.description + ' (replanned)',
        retryCount: originalStep.retryCount,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // GOAL VERIFICATION
  // ============================================================================

  /**
   * Verify if the goal has been completed
   */
  private async verifyGoalCompletion(
    sessionId: string,
    goal: string,
    task: TaskPlan
  ): Promise<boolean> {
    const ssResult = await this.browserService.screenshot(sessionId);
    if (!ssResult.success || !ssResult.data) {
      return false;
    }

    const session = this.browserService.getSession(sessionId);
    const viewport = session?.viewport || { width: 1280, height: 720 };

    const prompt = `Analyze this screenshot to determine if the following goal has been achieved.

GOAL: ${goal}

ACTIONS TAKEN:
${task.results.map((r, i) => {
  const step = task.steps.find(s => s.id === r.stepId);
  return `${i + 1}. ${r.success ? '[OK]' : '[FAIL]'} ${step?.description}`;
}).join('\n')}

Look at the screenshot and determine:
1. Has the goal been achieved?
2. What evidence supports your conclusion?
3. What might still need to be done?

Respond with JSON:
{
  "completed": boolean,
  "confidence": number (0-1),
  "evidence": "What you see that indicates completion/incompletion",
  "remaining": "What might still need to be done, if anything"
}

Return ONLY valid JSON, no markdown formatting.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: ssResult.data.base64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const text = textContent?.type === 'text' ? textContent.text : '';

      let cleanText = text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }

      const result = JSON.parse(cleanText);

      this.addThought(task.id, 'observation', `Goal verification: ${result.completed ? 'COMPLETED' : 'NOT COMPLETED'} (${(result.confidence * 100).toFixed(0)}% confidence)`);

      return result.completed && result.confidence > 0.7;
    } catch {
      return false;
    }
  }

  /**
   * Plan additional steps if goal not met
   */
  private async planAdditionalSteps(
    sessionId: string,
    intent: UserIntent,
    task: TaskPlan
  ): Promise<TaskStep[]> {
    const pageState = await this.analyzePageState(sessionId);

    const completedSteps = task.steps
      .filter(s => task.results.some(r => r.stepId === s.id && r.success))
      .map(s => s.description)
      .join('\n');

    const prompt = `The original goal has not been fully achieved. Plan additional steps.

GOAL: ${intent.goal}

COMPLETED STEPS:
${completedSteps || 'None'}

CURRENT PAGE STATE:
- URL: ${pageState.url}
- Title: ${pageState.title}

What additional steps are needed? Respond with a JSON array of steps (same format as before).
If no additional steps are needed, return an empty array: []

Return ONLY valid JSON, no markdown formatting.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const text = textContent?.type === 'text' ? textContent.text : '';

      let cleanText = text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }

      const stepsData = JSON.parse(cleanText);

      if (!Array.isArray(stepsData) || stepsData.length === 0) {
        return [];
      }

      return stepsData.map((stepData: {
        action: string;
        description: string;
        target?: ActionTarget;
        value?: string;
        options?: Record<string, unknown>;
        optional?: boolean;
      }) => ({
        id: uuid(),
        action: {
          type: stepData.action as PlannedAction['type'],
          target: stepData.target,
          value: stepData.value,
          options: stepData.options,
        },
        description: stepData.description,
        optional: stepData.optional ?? false,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // PAGE STATE ANALYSIS
  // ============================================================================

  private async analyzePageState(sessionId: string): Promise<PageState> {
    const domResult = await this.browserService.getDOM(sessionId);

    if (!domResult.success || !domResult.data) {
      throw new Error('Failed to get DOM');
    }

    const dom = domResult.data;

    // Filter to interactive elements
    const interactiveElements = dom.elements.filter(el =>
      ['a', 'button', 'input', 'select', 'textarea'].includes(el.tagName) ||
      el.attributes['role'] === 'button' ||
      el.attributes['onclick']
    );

    return {
      url: dom.url,
      title: dom.title,
      interactiveElements,
      forms: dom.forms,
      links: dom.links,
      images: dom.images,
    };
  }

  // ============================================================================
  // THOUGHT LOGGING
  // ============================================================================

  private addThought(taskId: string, type: AgentThought['type'], content: string, data?: Record<string, unknown>) {
    const thought: AgentThought = {
      id: uuid(),
      timestamp: new Date(),
      type,
      content,
      data,
    };

    const thoughts = this.thoughtLog.get(taskId) ?? [];
    thoughts.push(thought);
    this.thoughtLog.set(taskId, thoughts);

    this.emit('thought', { taskId, thought });
  }

  /**
   * Get thought log for a task
   */
  getThoughtLog(taskId: string): AgentThought[] {
    return this.thoughtLog.get(taskId) ?? [];
  }

  // ============================================================================
  // TASK MANAGEMENT
  // ============================================================================

  /**
   * Pause a running task
   */
  pauseTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task && task.status === 'running') {
      task.status = 'paused';
      this.emit('task:paused', { taskId });
      return true;
    }
    return false;
  }

  /**
   * Resume a paused task
   */
  resumeTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task && task.status === 'paused') {
      task.status = 'running';
      this.emit('task:resumed', { taskId });
      return true;
    }
    return false;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task && (task.status === 'running' || task.status === 'paused')) {
      task.status = 'cancelled';
      this.emit('task:cancelled', { taskId });
      return true;
    }
    return false;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): TaskPlan | undefined {
    return this.activeTasks.get(taskId);
  }

  /**
   * Get all active tasks
   */
  getAllTasks(): TaskPlan[] {
    return Array.from(this.activeTasks.values());
  }
}

// ============================================================================
// HELPER TYPES
// ============================================================================

interface PageState {
  url: string;
  title: string;
  interactiveElements: ElementInfo[];
  forms: DOMSnapshot['forms'];
  links: DOMSnapshot['links'];
  images: DOMSnapshot['images'];
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBrowserAgent(
  browserService: BrowserAutomationService,
  config?: BrowserAgentConfig
): BrowserAgentService {
  return new BrowserAgentService(browserService, config);
}

export default BrowserAgentService;
