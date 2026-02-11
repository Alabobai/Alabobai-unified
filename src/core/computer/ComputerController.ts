/**
 * Alabobai Computer Control - Main Controller
 * Production-ready unified computer control system
 *
 * This is the main orchestrator that:
 * - Takes screenshots and sends to AI for analysis
 * - Executes mouse/keyboard actions based on AI decisions
 * - Records everything for playback and audit
 * - Allows user intervention at ANY point
 * - Streams all actions to UI for live viewing
 *
 * BETTER THAN MANUS: Full visibility and control at all times
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

import { ScreenCapture, ScreenCaptureResult, createScreenCapture } from './ScreenCapture.js';
import { MouseController, MouseAction, createMouseController } from './MouseController.js';
import { KeyboardController, KeyboardAction, createKeyboardController } from './KeyboardController.js';
import { BrowserAutomation, BrowserAction, createBrowserAutomation } from './BrowserAutomation.js';
import { ActionRecorder, RecordedAction, createActionRecorder } from './ActionRecorder.js';
import { InterventionHandler, Intervention, ApprovalRequest, createInterventionHandler } from './InterventionHandler.js';
import { LLMClient } from '../llm-client.js';
import { ComputerAction, UIElement } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ComputerControllerConfig {
  llm: LLMClient;
  screenshotInterval?: number; // ms between screenshots during execution
  maxActionsPerTask?: number;
  enableMouse?: boolean;
  enableKeyboard?: boolean;
  enableBrowser?: boolean;
  headlessBrowser?: boolean;
  recordActions?: boolean;
  streamToUI?: boolean;
  requireApprovalForRiskyActions?: boolean;
  riskThreshold?: 'low' | 'medium' | 'high' | 'critical';
  storageDir?: string;
  debug?: boolean;
}

export interface TaskExecution {
  id: string;
  task: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  steps: ExecutionStep[];
  currentStep: number;
  totalSteps?: number;
  result?: TaskResult;
  error?: string;
}

export interface ExecutionStep {
  id: string;
  stepNumber: number;
  timestamp: Date;
  screenshot?: string; // base64
  analysis: AIAnalysis;
  action?: ComputerAction;
  executed: boolean;
  success?: boolean;
  error?: string;
  duration?: number;
}

export interface AIAnalysis {
  understanding: string;
  elements: UIElement[];
  reasoning: string;
  suggestedAction: ComputerAction | null;
  confidence: number;
  isTaskComplete: boolean;
  nextStepHint?: string;
  warnings?: string[];
}

export interface TaskResult {
  success: boolean;
  message: string;
  stepsExecuted: number;
  totalDuration: number;
  screenshotsTaken: number;
  actionsPerformed: number;
  interventions: number;
  finalScreenshot?: string;
  data?: Record<string, unknown>;
}

export interface LiveUpdate {
  type: 'screenshot' | 'analysis' | 'action' | 'status' | 'error' | 'complete';
  timestamp: Date;
  taskId: string;
  step?: number;
  data: {
    screenshot?: string;
    thumbnailUrl?: string;
    analysis?: AIAnalysis;
    action?: ComputerAction;
    status?: string;
    error?: string;
    result?: TaskResult;
  };
}

export type ComputerControllerEvents = {
  'task-started': (execution: TaskExecution) => void;
  'task-completed': (execution: TaskExecution) => void;
  'task-failed': (execution: TaskExecution) => void;
  'step-started': (step: ExecutionStep) => void;
  'step-completed': (step: ExecutionStep) => void;
  'screenshot': (screenshot: ScreenCaptureResult) => void;
  'analysis': (analysis: AIAnalysis) => void;
  'action': (action: ComputerAction) => void;
  'live-update': (update: LiveUpdate) => void;
  'intervention': (intervention: Intervention) => void;
  'approval-required': (request: ApprovalRequest) => void;
  'error': (error: Error) => void;
};

// ============================================================================
// COMPUTER CONTROLLER CLASS
// ============================================================================

export class ComputerController extends EventEmitter {
  private config: Required<ComputerControllerConfig>;
  private llm: LLMClient;

  // Sub-controllers
  private screenCapture: ScreenCapture;
  private mouseController: MouseController;
  private keyboardController: KeyboardController;
  private browserAutomation: BrowserAutomation;
  private actionRecorder: ActionRecorder;
  private interventionHandler: InterventionHandler;

  // State
  private isInitialized: boolean = false;
  private currentExecution: TaskExecution | null = null;
  private executionHistory: TaskExecution[] = [];
  private liveUpdateSubscribers: Set<(update: LiveUpdate) => void> = new Set();

  constructor(config: ComputerControllerConfig) {
    super();
    this.llm = config.llm;
    this.config = {
      llm: config.llm,
      screenshotInterval: config.screenshotInterval ?? 500,
      maxActionsPerTask: config.maxActionsPerTask ?? 100,
      enableMouse: config.enableMouse ?? true,
      enableKeyboard: config.enableKeyboard ?? true,
      enableBrowser: config.enableBrowser ?? true,
      headlessBrowser: config.headlessBrowser ?? false,
      recordActions: config.recordActions ?? true,
      streamToUI: config.streamToUI ?? true,
      requireApprovalForRiskyActions: config.requireApprovalForRiskyActions ?? true,
      riskThreshold: config.riskThreshold ?? 'medium',
      storageDir: config.storageDir ?? './recordings',
      debug: config.debug ?? false,
    };

    // Initialize sub-controllers
    this.screenCapture = createScreenCapture({
      format: 'png',
      maxWidth: 1920,
      maxHeight: 1080,
    });

    this.mouseController = createMouseController({
      enabled: this.config.enableMouse,
      smoothMovement: true,
    });

    this.keyboardController = createKeyboardController({
      enabled: this.config.enableKeyboard,
    });

    this.browserAutomation = createBrowserAutomation({
      headless: this.config.headlessBrowser,
    });

    this.actionRecorder = createActionRecorder({
      captureScreenshots: true,
      storageDir: this.config.storageDir,
      streamToObservers: true,
    });

    this.interventionHandler = createInterventionHandler({
      enableKeyboardShortcuts: true,
      streamStatusUpdates: true,
    });

    this.setupEventListeners();
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the computer controller
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.log('Initializing computer controller...');

    // Initialize intervention handler
    await this.interventionHandler.initialize();

    // Add default safety checks
    this.interventionHandler.addSafetyCheck({
      name: 'action-limit',
      check: () => {
        if (!this.currentExecution) return true;
        return this.currentExecution.steps.length < this.config.maxActionsPerTask;
      },
      onFail: async (handler) => {
        await handler.pause('resource-limit', 'Maximum action limit reached');
      },
    });

    // Set up action recorder observer for live streaming
    if (this.config.streamToUI) {
      this.actionRecorder.addObserver((action) => {
        this.broadcastLiveUpdate({
          type: 'action',
          timestamp: new Date(),
          taskId: this.currentExecution?.id || '',
          step: action.metadata.stepNumber,
          data: {
            action: action.action as any,
            screenshot: action.screenshot,
          },
        });
      });
    }

    // Subscribe to intervention status updates
    this.interventionHandler.subscribeToStatus((status) => {
      this.broadcastLiveUpdate({
        type: 'status',
        timestamp: status.timestamp,
        taskId: this.currentExecution?.id || '',
        data: { status: status.message },
      });
    });

    this.isInitialized = true;
    this.log('Computer controller initialized');
  }

  /**
   * Shutdown the computer controller
   */
  async shutdown(): Promise<void> {
    this.log('Shutting down computer controller...');

    // Stop any running execution
    if (this.currentExecution?.status === 'running') {
      await this.cancelCurrentTask();
    }

    // Cleanup sub-controllers
    await this.screenCapture.dispose();
    this.mouseController.dispose();
    await this.keyboardController.dispose();
    await this.browserAutomation.dispose();
    this.actionRecorder.dispose();
    await this.interventionHandler.dispose();

    this.isInitialized = false;
    this.log('Computer controller shut down');
  }

  // ============================================================================
  // TASK EXECUTION
  // ============================================================================

  /**
   * Execute a task using AI-driven computer control
   */
  async executeTask(task: string, options: {
    useBrowser?: boolean;
    startUrl?: string;
    maxSteps?: number;
    onStep?: (step: ExecutionStep) => void;
  } = {}): Promise<TaskResult> {
    await this.ensureInitialized();

    const execution: TaskExecution = {
      id: uuid(),
      task,
      status: 'pending',
      startTime: new Date(),
      steps: [],
      currentStep: 0,
    };

    this.currentExecution = execution;
    this.executionHistory.push(execution);

    // Start recording
    if (this.config.recordActions) {
      this.actionRecorder.startRecording({
        name: `Task: ${task.substring(0, 50)}`,
        taskDescription: task,
      });
    }

    execution.status = 'running';
    this.emit('task-started', execution);
    this.broadcastLiveUpdate({
      type: 'status',
      timestamp: new Date(),
      taskId: execution.id,
      data: { status: `Starting task: ${task}` },
    });

    try {
      // Initialize browser if needed
      if (options.useBrowser) {
        await this.browserAutomation.launch();
        if (options.startUrl) {
          await this.browserAutomation.navigate(options.startUrl);
        }
      }

      const maxSteps = options.maxSteps || this.config.maxActionsPerTask;
      let stepCount = 0;
      let isComplete = false;

      while (!isComplete && stepCount < maxSteps) {
        // Check if we can proceed
        const canProceed = await this.interventionHandler.waitUntilCanProceed(1000);
        if (!canProceed) {
          // Check if stopped
          const state = this.interventionHandler.getState();
          if (!state.isRunning) {
            execution.status = 'cancelled';
            break;
          }
          continue; // Keep waiting
        }

        stepCount++;
        const step = await this.executeStep(execution, stepCount, task, options.useBrowser);

        if (options.onStep) {
          options.onStep(step);
        }

        isComplete = step.analysis.isTaskComplete;

        // Small delay between steps
        await this.sleep(this.config.screenshotInterval);
      }

      // Finalize
      execution.endTime = new Date();
      execution.status = isComplete ? 'completed' : (stepCount >= maxSteps ? 'failed' : execution.status);

      const result: TaskResult = {
        success: execution.status === 'completed',
        message: isComplete
          ? 'Task completed successfully'
          : (stepCount >= maxSteps ? 'Maximum steps reached' : 'Task cancelled'),
        stepsExecuted: execution.steps.length,
        totalDuration: execution.endTime.getTime() - execution.startTime.getTime(),
        screenshotsTaken: execution.steps.filter((s) => s.screenshot).length,
        actionsPerformed: execution.steps.filter((s) => s.executed).length,
        interventions: this.interventionHandler.getHistory().length,
      };

      // Capture final screenshot
      try {
        const finalScreenshot = await this.captureScreenshot(execution.id);
        result.finalScreenshot = finalScreenshot.imageData;
      } catch {
        // Ignore screenshot errors at the end
      }

      execution.result = result;

      if (execution.status === 'completed') {
        this.emit('task-completed', execution);
      } else {
        this.emit('task-failed', execution);
      }

      this.broadcastLiveUpdate({
        type: 'complete',
        timestamp: new Date(),
        taskId: execution.id,
        data: { result },
      });

      return result;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.error = (error as Error).message;

      const result: TaskResult = {
        success: false,
        message: `Task failed: ${(error as Error).message}`,
        stepsExecuted: execution.steps.length,
        totalDuration: execution.endTime.getTime() - execution.startTime.getTime(),
        screenshotsTaken: execution.steps.filter((s) => s.screenshot).length,
        actionsPerformed: execution.steps.filter((s) => s.executed).length,
        interventions: this.interventionHandler.getHistory().length,
      };

      execution.result = result;
      this.emit('task-failed', execution);
      this.emit('error', error as Error);

      this.broadcastLiveUpdate({
        type: 'error',
        timestamp: new Date(),
        taskId: execution.id,
        data: { error: (error as Error).message },
      });

      throw error;
    } finally {
      // Stop recording
      if (this.config.recordActions) {
        this.actionRecorder.stopRecording();
      }

      this.currentExecution = null;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    execution: TaskExecution,
    stepNumber: number,
    task: string,
    useBrowser?: boolean
  ): Promise<ExecutionStep> {
    const startTime = Date.now();

    const step: ExecutionStep = {
      id: uuid(),
      stepNumber,
      timestamp: new Date(),
      analysis: null as any,
      executed: false,
    };

    execution.steps.push(step);
    execution.currentStep = stepNumber;
    this.emit('step-started', step);

    try {
      // 1. Capture screenshot
      const screenshot = useBrowser
        ? await this.captureBrowserScreenshot(execution.id)
        : await this.captureScreenshot(execution.id);

      step.screenshot = screenshot.imageData;

      this.broadcastLiveUpdate({
        type: 'screenshot',
        timestamp: new Date(),
        taskId: execution.id,
        step: stepNumber,
        data: { screenshot: screenshot.imageData },
      });

      // 2. Analyze with AI
      const analysis = await this.analyzeScreen(screenshot, task, execution.steps);
      step.analysis = analysis;

      this.emit('analysis', analysis);
      this.broadcastLiveUpdate({
        type: 'analysis',
        timestamp: new Date(),
        taskId: execution.id,
        step: stepNumber,
        data: { analysis },
      });

      // 3. Check if task is complete
      if (analysis.isTaskComplete) {
        step.executed = true;
        step.success = true;
        step.duration = Date.now() - startTime;
        this.emit('step-completed', step);
        return step;
      }

      // 4. Execute suggested action
      if (analysis.suggestedAction) {
        step.action = analysis.suggestedAction;

        // Check if approval is needed for risky actions
        const riskLevel = this.assessActionRisk(analysis.suggestedAction);
        if (this.shouldRequireApproval(riskLevel)) {
          const approval = await this.interventionHandler.requestApproval(
            `Execute ${analysis.suggestedAction.type} action`,
            riskLevel,
            { action: analysis.suggestedAction, reasoning: analysis.reasoning }
          );

          const response = await this.interventionHandler.waitForApproval(approval);
          if (!response.approved) {
            step.executed = false;
            step.error = `Action rejected: ${response.reason}`;
            step.duration = Date.now() - startTime;
            this.emit('step-completed', step);
            return step;
          }
        }

        // Execute the action
        await this.executeAction(analysis.suggestedAction, useBrowser);
        step.executed = true;
        step.success = true;

        this.emit('action', analysis.suggestedAction);
        this.interventionHandler.incrementActionCount();

        // Record the action
        if (this.config.recordActions) {
          this.actionRecorder.recordAIDecision({
            type: 'execute',
            input: task,
            reasoning: analysis.reasoning,
            decision: JSON.stringify(analysis.suggestedAction),
            confidence: analysis.confidence,
          }, screenshot);
        }
      }

      step.duration = Date.now() - startTime;
      this.emit('step-completed', step);
      return step;
    } catch (error) {
      step.error = (error as Error).message;
      step.success = false;
      step.duration = Date.now() - startTime;
      this.emit('step-completed', step);
      throw error;
    }
  }

  /**
   * Cancel the current task
   */
  async cancelCurrentTask(): Promise<void> {
    if (!this.currentExecution) {
      return;
    }

    await this.interventionHandler.emergencyStop('Task cancelled by user');
    this.currentExecution.status = 'cancelled';
    this.currentExecution.endTime = new Date();
  }

  /**
   * Pause the current task
   */
  async pauseCurrentTask(): Promise<void> {
    if (!this.currentExecution || this.currentExecution.status !== 'running') {
      return;
    }

    await this.interventionHandler.pause('user-initiated', 'Task paused by user');
    this.currentExecution.status = 'paused';
  }

  /**
   * Resume the current task
   */
  async resumeCurrentTask(): Promise<void> {
    if (!this.currentExecution || this.currentExecution.status !== 'paused') {
      return;
    }

    await this.interventionHandler.resume('Task resumed by user');
    this.currentExecution.status = 'running';
  }

  // ============================================================================
  // SCREEN CAPTURE
  // ============================================================================

  /**
   * Capture a screenshot
   */
  async captureScreenshot(taskId?: string): Promise<ScreenCaptureResult> {
    const screenshot = await this.screenCapture.capture();

    this.emit('screenshot', screenshot);

    if (taskId) {
      this.broadcastLiveUpdate({
        type: 'screenshot',
        timestamp: new Date(),
        taskId,
        data: { screenshot: screenshot.imageData },
      });
    }

    return screenshot;
  }

  /**
   * Capture browser screenshot
   */
  private async captureBrowserScreenshot(taskId: string): Promise<ScreenCaptureResult> {
    const base64 = await this.browserAutomation.screenshot();

    const result: ScreenCaptureResult = {
      id: uuid(),
      timestamp: new Date(),
      width: 1920,
      height: 1080,
      imageData: base64,
      format: 'png',
      metadata: {
        platform: process.platform,
        displayCount: 1,
        primaryDisplay: { id: 0, name: 'Browser', width: 1920, height: 1080, scaleFactor: 1, isPrimary: true },
        allDisplays: [],
        captureMethod: 'puppeteer',
        processingTimeMs: 0,
      },
    };

    this.emit('screenshot', result);
    this.broadcastLiveUpdate({
      type: 'screenshot',
      timestamp: new Date(),
      taskId,
      data: { screenshot: base64 },
    });

    return result;
  }

  // ============================================================================
  // AI ANALYSIS
  // ============================================================================

  /**
   * Analyze a screenshot with AI
   */
  private async analyzeScreen(
    screenshot: ScreenCaptureResult,
    task: string,
    previousSteps: ExecutionStep[]
  ): Promise<AIAnalysis> {
    const previousActionsContext = previousSteps
      .slice(-5)
      .map((s, i) => `Step ${s.stepNumber}: ${s.action ? `${s.action.type}` : 'Analysis only'} - ${s.analysis?.understanding || 'N/A'}`)
      .join('\n');

    const systemPrompt = `You are Alabobai, an advanced AI computer control system. You analyze screenshots and determine the next action to accomplish a user's task.

Your capabilities:
- Click at specific coordinates
- Type text
- Press keys (Enter, Tab, Escape, etc.)
- Scroll the page
- Take screenshots
- Wait for elements to load

IMPORTANT RULES:
1. Always analyze what's visible on screen before acting
2. Consider the context of previous actions
3. If the task appears complete, set isTaskComplete to true
4. Be precise with coordinates - click in the CENTER of elements
5. For forms, fill fields in order
6. If something seems wrong or risky, include it in warnings

Respond ONLY with valid JSON in this exact format:
{
  "understanding": "Brief description of what you see on screen",
  "elements": [
    {
      "type": "button|input|link|text|image|form|unknown",
      "text": "visible text",
      "bounds": { "x": 100, "y": 200, "width": 100, "height": 30 },
      "interactable": true
    }
  ],
  "reasoning": "Explain your thought process for the next action",
  "suggestedAction": {
    "type": "click|type|key|scroll|wait|screenshot",
    "x": 150,
    "y": 215,
    "text": "text to type (for type action)",
    "key": "Enter (for key action)",
    "ms": 1000 (for wait action),
    "deltaY": 300 (for scroll action)
  },
  "confidence": 0.85,
  "isTaskComplete": false,
  "nextStepHint": "What should happen after this action",
  "warnings": ["Any concerns about this action"]
}

If no action is needed or the task is complete, set suggestedAction to null and isTaskComplete to true.`;

    const userPrompt = `TASK: ${task}

PREVIOUS ACTIONS:
${previousActionsContext || 'None - this is the first step'}

Analyze this screenshot and determine the next action to accomplish the task.`;

    try {
      const response = await this.llm.chatWithVision(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        screenshot.imageData
      );

      // Parse the JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and normalize the action
        if (parsed.suggestedAction) {
          parsed.suggestedAction = this.normalizeAction(parsed.suggestedAction);
        }

        return {
          understanding: parsed.understanding || 'Unable to analyze',
          elements: parsed.elements || [],
          reasoning: parsed.reasoning || '',
          suggestedAction: parsed.suggestedAction || null,
          confidence: parsed.confidence || 0,
          isTaskComplete: parsed.isTaskComplete || false,
          nextStepHint: parsed.nextStepHint,
          warnings: parsed.warnings,
        };
      }

      throw new Error('Failed to parse AI response');
    } catch (error) {
      this.log(`AI analysis error: ${(error as Error).message}`);

      return {
        understanding: 'Analysis failed',
        elements: [],
        reasoning: `Error: ${(error as Error).message}`,
        suggestedAction: null,
        confidence: 0,
        isTaskComplete: false,
        warnings: ['AI analysis failed - manual intervention may be required'],
      };
    }
  }

  /**
   * Normalize an action from AI response
   */
  private normalizeAction(action: any): ComputerAction {
    switch (action.type) {
      case 'click':
        return {
          type: 'click',
          x: Math.round(action.x || 0),
          y: Math.round(action.y || 0),
          button: action.button || 'left',
        };

      case 'double-click':
        return {
          type: 'double-click',
          x: Math.round(action.x || 0),
          y: Math.round(action.y || 0),
        };

      case 'type':
        return {
          type: 'type',
          text: action.text || '',
        };

      case 'key':
        return {
          type: 'key',
          key: action.key || 'Enter',
          modifiers: action.modifiers,
        };

      case 'scroll':
        return {
          type: 'scroll',
          x: Math.round(action.x || 0),
          y: Math.round(action.y || 0),
          deltaX: action.deltaX || 0,
          deltaY: action.deltaY || 0,
        };

      case 'wait':
        return {
          type: 'wait',
          ms: action.ms || 1000,
        };

      case 'screenshot':
        return { type: 'screenshot' };

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  /**
   * Execute a computer action
   */
  private async executeAction(action: ComputerAction, useBrowser?: boolean): Promise<void> {
    this.log(`Executing action: ${action.type}`);

    if (useBrowser) {
      await this.executeBrowserAction(action);
    } else {
      await this.executeSystemAction(action);
    }
  }

  /**
   * Execute action using system controls
   */
  private async executeSystemAction(action: ComputerAction): Promise<void> {
    switch (action.type) {
      case 'click':
        await this.mouseController.click(action.x, action.y, action.button);
        break;

      case 'double-click':
        await this.mouseController.doubleClick(action.x, action.y);
        break;

      case 'type':
        await this.keyboardController.type(action.text);
        break;

      case 'key':
        await this.keyboardController.pressKey(action.key, action.modifiers as any);
        break;

      case 'scroll':
        await this.mouseController.scroll(action.deltaX || 0, action.deltaY, action.x, action.y);
        break;

      case 'drag':
        await this.mouseController.drag(action.fromX, action.fromY, action.toX, action.toY);
        break;

      case 'wait':
        await this.sleep(action.ms);
        break;

      case 'screenshot':
        await this.captureScreenshot();
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  /**
   * Execute action using browser automation
   */
  private async executeBrowserAction(action: ComputerAction): Promise<void> {
    switch (action.type) {
      case 'click':
        await this.browserAutomation.mouseClick(action.x, action.y, action.button);
        break;

      case 'double-click':
        await this.browserAutomation.mouseClick(action.x, action.y);
        await this.sleep(50);
        await this.browserAutomation.mouseClick(action.x, action.y);
        break;

      case 'type':
        await this.browserAutomation.keyboardType(action.text);
        break;

      case 'key':
        await this.browserAutomation.pressKey(action.key);
        break;

      case 'scroll':
        await this.browserAutomation.scroll(action.deltaX || 0, action.deltaY);
        break;

      case 'wait':
        await this.browserAutomation.wait(action.ms);
        break;

      case 'screenshot':
        await this.browserAutomation.screenshot();
        break;

      default:
        throw new Error(`Unknown action type for browser: ${(action as any).type}`);
    }
  }

  // ============================================================================
  // RISK ASSESSMENT
  // ============================================================================

  /**
   * Assess the risk level of an action
   */
  private assessActionRisk(action: ComputerAction): 'low' | 'medium' | 'high' | 'critical' {
    // Type actions with certain keywords are higher risk
    if (action.type === 'type') {
      const text = action.text.toLowerCase();

      // Critical risk - passwords, financial data
      if (text.includes('password') || text.includes('credit') || text.includes('ssn')) {
        return 'critical';
      }

      // High risk - personal information
      if (text.includes('@') || text.match(/\d{3}-\d{2}-\d{4}/)) {
        return 'high';
      }

      // Medium risk - forms
      if (text.length > 50) {
        return 'medium';
      }
    }

    // Key combinations can be risky
    if (action.type === 'key') {
      const key = action.key.toLowerCase();
      const modifiers = action.modifiers?.map((m) => m.toLowerCase()) || [];

      // Critical - system commands
      if (modifiers.includes('cmd') || modifiers.includes('ctrl')) {
        if (['q', 'w', 'delete', 'backspace'].includes(key)) {
          return 'high';
        }
      }
    }

    // Clicks are generally low risk
    if (action.type === 'click' || action.type === 'double-click') {
      return 'low';
    }

    return 'low';
  }

  /**
   * Check if approval should be required
   */
  private shouldRequireApproval(riskLevel: 'low' | 'medium' | 'high' | 'critical'): boolean {
    if (!this.config.requireApprovalForRiskyActions) {
      return false;
    }

    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const thresholdIndex = riskLevels.indexOf(this.config.riskThreshold);
    const actionIndex = riskLevels.indexOf(riskLevel);

    return actionIndex >= thresholdIndex;
  }

  // ============================================================================
  // LIVE UPDATES
  // ============================================================================

  /**
   * Subscribe to live updates
   */
  subscribeLiveUpdates(callback: (update: LiveUpdate) => void): void {
    this.liveUpdateSubscribers.add(callback);
  }

  /**
   * Unsubscribe from live updates
   */
  unsubscribeLiveUpdates(callback: (update: LiveUpdate) => void): void {
    this.liveUpdateSubscribers.delete(callback);
  }

  /**
   * Broadcast a live update to all subscribers
   */
  private broadcastLiveUpdate(update: LiveUpdate): void {
    if (!this.config.streamToUI) {
      return;
    }

    this.emit('live-update', update);

    for (const subscriber of this.liveUpdateSubscribers) {
      try {
        subscriber(update);
      } catch (error) {
        this.emit('error', error as Error);
      }
    }
  }

  // ============================================================================
  // DIRECT CONTROL METHODS
  // ============================================================================

  /**
   * Get the mouse controller for direct control
   */
  getMouse(): MouseController {
    return this.mouseController;
  }

  /**
   * Get the keyboard controller for direct control
   */
  getKeyboard(): KeyboardController {
    return this.keyboardController;
  }

  /**
   * Get the browser automation for direct control
   */
  getBrowser(): BrowserAutomation {
    return this.browserAutomation;
  }

  /**
   * Get the action recorder
   */
  getRecorder(): ActionRecorder {
    return this.actionRecorder;
  }

  /**
   * Get the intervention handler
   */
  getInterventionHandler(): InterventionHandler {
    return this.interventionHandler;
  }

  /**
   * Get the current execution state
   */
  getCurrentExecution(): TaskExecution | null {
    return this.currentExecution;
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): TaskExecution[] {
    return [...this.executionHistory];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private setupEventListeners(): void {
    // Forward sub-controller events
    this.screenCapture.on('capture', (capture) => this.emit('screenshot', capture));
    this.screenCapture.on('error', (error) => this.emit('error', error));

    this.mouseController.on('error', (error) => this.emit('error', error));
    this.keyboardController.on('error', (error) => this.emit('error', error));
    this.browserAutomation.on('error', (error) => this.emit('error', error));
    this.actionRecorder.on('error', (error) => this.emit('error', error));
    this.interventionHandler.on('error', (error) => this.emit('error', error));

    // Forward intervention events
    this.interventionHandler.on('paused', (intervention) => this.emit('intervention', intervention));
    this.interventionHandler.on('resumed', (intervention) => this.emit('intervention', intervention));
    this.interventionHandler.on('stopped', (intervention) => this.emit('intervention', intervention));
    this.interventionHandler.on('approval-requested', (request) => this.emit('approval-required', request));
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[ComputerController] ${message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createComputerController(config: ComputerControllerConfig): ComputerController {
  return new ComputerController(config);
}

export default ComputerController;
