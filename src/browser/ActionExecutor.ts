/**
 * Alabobai Browser Automation - Action Executor
 *
 * Executes browser actions with robust error handling, retries, and fallbacks.
 *
 * Features:
 * - Click, type, scroll, navigate, screenshot actions
 * - Automatic retry with exponential backoff
 * - Vision-based fallback when selectors fail
 * - Action queuing and sequencing
 * - Detailed action logging and history
 * - Element highlighting for debugging
 */

import { Page, ElementHandle, Mouse, Keyboard } from 'playwright';
import { v4 as uuid } from 'uuid';
import { DOMExtractor, ExtractedElement } from './DOMExtractor.js';
import { VisionAnalyzer, VisualElement } from './VisionAnalyzer.js';

// ============================================================================
// TYPES
// ============================================================================

export type ActionType =
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'type'
  | 'fill'
  | 'clear'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'scroll'
  | 'scroll-to'
  | 'navigate'
  | 'go-back'
  | 'go-forward'
  | 'reload'
  | 'screenshot'
  | 'wait'
  | 'wait-for-selector'
  | 'wait-for-navigation'
  | 'press-key'
  | 'drag'
  | 'focus'
  | 'blur';

export interface ActionTarget {
  selector?: string;
  xpath?: string;
  text?: string;
  description?: string;
  coordinates?: { x: number; y: number };
  element?: ExtractedElement;
  visualElement?: VisualElement;
}

export interface ActionOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  useVisionFallback?: boolean;
  highlightElement?: boolean;
  waitAfter?: number;
  force?: boolean;
  modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
}

export interface Action {
  id: string;
  type: ActionType;
  target?: ActionTarget;
  value?: string;
  options?: ActionOptions;
}

export interface ActionResult {
  id: string;
  action: Action;
  success: boolean;
  error?: string;
  duration: number;
  timestamp: Date;
  screenshot?: string;
  element?: ExtractedElement;
  retryCount: number;
  fallbackUsed: boolean;
  coordinates?: { x: number; y: number };
}

export interface ExecutorConfig {
  defaultTimeout?: number;
  defaultRetries?: number;
  defaultRetryDelay?: number;
  useVisionFallback?: boolean;
  highlightOnAction?: boolean;
  captureScreenshotOnError?: boolean;
  waitBetweenActions?: number;
  humanLikeTyping?: boolean;
  humanLikeDelay?: { min: number; max: number };
}

export interface ActionQueueItem {
  action: Action;
  resolve: (result: ActionResult) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// ACTION EXECUTOR CLASS
// ============================================================================

export class ActionExecutor {
  private page: Page;
  private domExtractor: DOMExtractor;
  private visionAnalyzer?: VisionAnalyzer;
  private config: Required<ExecutorConfig>;
  private actionHistory: ActionResult[] = [];
  private maxHistorySize: number = 500;
  private isExecuting: boolean = false;
  private actionQueue: ActionQueueItem[] = [];

  constructor(
    page: Page,
    domExtractor: DOMExtractor,
    visionAnalyzer?: VisionAnalyzer,
    config: ExecutorConfig = {}
  ) {
    this.page = page;
    this.domExtractor = domExtractor;
    this.visionAnalyzer = visionAnalyzer;
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000,
      defaultRetries: config.defaultRetries ?? 3,
      defaultRetryDelay: config.defaultRetryDelay ?? 1000,
      useVisionFallback: config.useVisionFallback ?? true,
      highlightOnAction: config.highlightOnAction ?? false,
      captureScreenshotOnError: config.captureScreenshotOnError ?? true,
      waitBetweenActions: config.waitBetweenActions ?? 100,
      humanLikeTyping: config.humanLikeTyping ?? true,
      humanLikeDelay: config.humanLikeDelay ?? { min: 30, max: 100 },
    };
  }

  // ============================================================================
  // MAIN EXECUTION METHODS
  // ============================================================================

  /**
   * Execute a single action with retries and fallbacks
   */
  async execute(action: Action): Promise<ActionResult> {
    const startTime = Date.now();
    const options = { ...this.getDefaultOptions(), ...action.options };
    let lastError: Error | null = null;
    let retryCount = 0;
    let fallbackUsed = false;

    for (let attempt = 0; attempt <= options.retries; attempt++) {
      try {
        // Execute the action
        const result = await this.executeAction(action, options);

        // Wait after action if configured
        if (options.waitAfter) {
          await this.sleep(options.waitAfter);
        }

        const actionResult: ActionResult = {
          id: uuid(),
          action,
          success: true,
          duration: Date.now() - startTime,
          timestamp: new Date(),
          retryCount,
          fallbackUsed,
          ...result,
        };

        this.recordResult(actionResult);
        return actionResult;
      } catch (error) {
        lastError = error as Error;
        retryCount = attempt;

        console.warn(
          `Action ${action.type} failed (attempt ${attempt + 1}/${options.retries + 1}):`,
          lastError.message
        );

        // Try vision fallback on last retry if enabled
        if (
          attempt === options.retries &&
          options.useVisionFallback &&
          this.visionAnalyzer &&
          this.canUseVisionFallback(action)
        ) {
          try {
            console.log('Attempting vision fallback...');
            const visionResult = await this.executeWithVision(action, options);
            fallbackUsed = true;

            const actionResult: ActionResult = {
              id: uuid(),
              action,
              success: true,
              duration: Date.now() - startTime,
              timestamp: new Date(),
              retryCount: retryCount + 1,
              fallbackUsed: true,
              ...visionResult,
            };

            this.recordResult(actionResult);
            return actionResult;
          } catch (visionError) {
            console.warn('Vision fallback failed:', (visionError as Error).message);
            lastError = visionError as Error;
          }
        }

        // Wait before retry
        if (attempt < options.retries) {
          await this.sleep(options.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    // All attempts failed
    let screenshot: string | undefined;
    if (this.config.captureScreenshotOnError) {
      try {
        const buffer = await this.page.screenshot({ type: 'png' });
        screenshot = buffer.toString('base64');
      } catch {
        // Ignore screenshot errors
      }
    }

    const failedResult: ActionResult = {
      id: uuid(),
      action,
      success: false,
      error: lastError?.message || 'Unknown error',
      duration: Date.now() - startTime,
      timestamp: new Date(),
      retryCount,
      fallbackUsed,
      screenshot,
    };

    this.recordResult(failedResult);
    throw new Error(`Action ${action.type} failed: ${lastError?.message}`);
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeSequence(actions: Action[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      const result = await this.execute(action);
      results.push(result);

      if (!result.success) {
        break; // Stop on first failure
      }

      // Wait between actions
      if (this.config.waitBetweenActions > 0) {
        await this.sleep(this.config.waitBetweenActions);
      }
    }

    return results;
  }

  /**
   * Queue an action for execution
   */
  queueAction(action: Action): Promise<ActionResult> {
    return new Promise((resolve, reject) => {
      this.actionQueue.push({ action, resolve, reject });
      this.processQueue();
    });
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Click on an element
   */
  async click(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'click',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Double-click on an element
   */
  async doubleClick(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'double-click',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Right-click on an element
   */
  async rightClick(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'right-click',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Type text into an element
   */
  async type(
    target: string | ActionTarget,
    text: string,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'type',
      target: typeof target === 'string' ? { selector: target } : target,
      value: text,
      options,
    });
  }

  /**
   * Fill an input field (faster than type)
   */
  async fill(
    target: string | ActionTarget,
    value: string,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'fill',
      target: typeof target === 'string' ? { selector: target } : target,
      value,
      options,
    });
  }

  /**
   * Clear an input field
   */
  async clear(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'clear',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Select an option from a dropdown
   */
  async select(
    target: string | ActionTarget,
    value: string,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'select',
      target: typeof target === 'string' ? { selector: target } : target,
      value,
      options,
    });
  }

  /**
   * Check a checkbox
   */
  async check(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'check',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'uncheck',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Hover over an element
   */
  async hover(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'hover',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Scroll the page
   */
  async scroll(
    deltaX: number,
    deltaY: number,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'scroll',
      value: JSON.stringify({ deltaX, deltaY }),
      options,
    });
  }

  /**
   * Scroll to an element
   */
  async scrollTo(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'scroll-to',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options?: ActionOptions): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'navigate',
      value: url,
      options,
    });
  }

  /**
   * Go back in browser history
   */
  async goBack(options?: ActionOptions): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'go-back',
      options,
    });
  }

  /**
   * Go forward in browser history
   */
  async goForward(options?: ActionOptions): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'go-forward',
      options,
    });
  }

  /**
   * Reload the page
   */
  async reload(options?: ActionOptions): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'reload',
      options,
    });
  }

  /**
   * Take a screenshot
   */
  async screenshot(fullPage: boolean = false): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'screenshot',
      value: fullPage ? 'full' : 'viewport',
    });
  }

  /**
   * Wait for a duration
   */
  async wait(ms: number): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'wait',
      value: ms.toString(),
    });
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(
    selector: string,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'wait-for-selector',
      target: { selector },
      options,
    });
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(options?: ActionOptions): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'wait-for-navigation',
      options,
    });
  }

  /**
   * Press a keyboard key
   */
  async pressKey(
    key: string,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'press-key',
      value: key,
      options,
    });
  }

  /**
   * Drag from one element to another
   */
  async drag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'drag',
      value: JSON.stringify({ from, to }),
      options,
    });
  }

  /**
   * Focus an element
   */
  async focus(
    target: string | ActionTarget,
    options?: ActionOptions
  ): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'focus',
      target: typeof target === 'string' ? { selector: target } : target,
      options,
    });
  }

  /**
   * Blur the focused element
   */
  async blur(options?: ActionOptions): Promise<ActionResult> {
    return this.execute({
      id: uuid(),
      type: 'blur',
      options,
    });
  }

  // ============================================================================
  // INTERNAL EXECUTION METHODS
  // ============================================================================

  /**
   * Execute an action (internal implementation)
   */
  private async executeAction(
    action: Action,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    // Highlight element if enabled
    if (options.highlightElement && action.target) {
      await this.highlightTarget(action.target);
    }

    switch (action.type) {
      case 'click':
        return this.doClick(action.target!, options);
      case 'double-click':
        return this.doDoubleClick(action.target!, options);
      case 'right-click':
        return this.doRightClick(action.target!, options);
      case 'type':
        return this.doType(action.target!, action.value!, options);
      case 'fill':
        return this.doFill(action.target!, action.value!, options);
      case 'clear':
        return this.doClear(action.target!, options);
      case 'select':
        return this.doSelect(action.target!, action.value!, options);
      case 'check':
        return this.doCheck(action.target!, options);
      case 'uncheck':
        return this.doUncheck(action.target!, options);
      case 'hover':
        return this.doHover(action.target!, options);
      case 'scroll':
        return this.doScroll(action.value!, options);
      case 'scroll-to':
        return this.doScrollTo(action.target!, options);
      case 'navigate':
        return this.doNavigate(action.value!, options);
      case 'go-back':
        return this.doGoBack(options);
      case 'go-forward':
        return this.doGoForward(options);
      case 'reload':
        return this.doReload(options);
      case 'screenshot':
        return this.doScreenshot(action.value === 'full');
      case 'wait':
        return this.doWait(parseInt(action.value!, 10));
      case 'wait-for-selector':
        return this.doWaitForSelector(action.target!.selector!, options);
      case 'wait-for-navigation':
        return this.doWaitForNavigation(options);
      case 'press-key':
        return this.doPressKey(action.value!, options);
      case 'drag':
        return this.doDrag(action.value!, options);
      case 'focus':
        return this.doFocus(action.target!, options);
      case 'blur':
        return this.doBlur();
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Execute action using vision when DOM fails
   */
  private async executeWithVision(
    action: Action,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    if (!this.visionAnalyzer) {
      throw new Error('Vision analyzer not available');
    }

    const description = this.getTargetDescription(action.target);
    if (!description) {
      throw new Error('Cannot use vision fallback without target description');
    }

    const target = await this.visionAnalyzer.getClickTargetOnPage(description);
    if (!target) {
      throw new Error(`Vision could not find element: ${description}`);
    }

    // Use coordinates for click-like actions
    switch (action.type) {
      case 'click':
        await this.page.mouse.click(target.x, target.y);
        break;
      case 'double-click':
        await this.page.mouse.dblclick(target.x, target.y);
        break;
      case 'right-click':
        await this.page.mouse.click(target.x, target.y, { button: 'right' });
        break;
      case 'type':
        await this.page.mouse.click(target.x, target.y);
        await this.sleep(100);
        await this.page.keyboard.type(action.value!, {
          delay: this.config.humanLikeTyping ? this.getRandomDelay() : 0,
        });
        break;
      case 'hover':
        await this.page.mouse.move(target.x, target.y);
        break;
      default:
        throw new Error(`Vision fallback not supported for action type: ${action.type}`);
    }

    return {
      coordinates: { x: target.x, y: target.y },
    };
  }

  // ============================================================================
  // ACTION IMPLEMENTATIONS
  // ============================================================================

  private async doClick(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);

    if (target.coordinates) {
      await this.page.mouse.click(target.coordinates.x, target.coordinates.y);
      return { coordinates: target.coordinates };
    }

    await locator.click({
      timeout: options.timeout,
      force: options.force,
      modifiers: options.modifiers,
    });
    return {};
  }

  private async doDoubleClick(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);

    if (target.coordinates) {
      await this.page.mouse.dblclick(target.coordinates.x, target.coordinates.y);
      return { coordinates: target.coordinates };
    }

    await locator.dblclick({
      timeout: options.timeout,
      force: options.force,
      modifiers: options.modifiers,
    });
    return {};
  }

  private async doRightClick(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);

    if (target.coordinates) {
      await this.page.mouse.click(target.coordinates.x, target.coordinates.y, { button: 'right' });
      return { coordinates: target.coordinates };
    }

    await locator.click({
      button: 'right',
      timeout: options.timeout,
      force: options.force,
      modifiers: options.modifiers,
    });
    return {};
  }

  private async doType(
    target: ActionTarget,
    text: string,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.click({ timeout: options.timeout });

    if (this.config.humanLikeTyping) {
      // Type character by character with random delays
      for (const char of text) {
        await this.page.keyboard.type(char);
        await this.sleep(this.getRandomDelay());
      }
    } else {
      await locator.type(text, { timeout: options.timeout });
    }
    return {};
  }

  private async doFill(
    target: ActionTarget,
    value: string,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.fill(value, { timeout: options.timeout, force: options.force });
    return {};
  }

  private async doClear(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.clear({ timeout: options.timeout, force: options.force });
    return {};
  }

  private async doSelect(
    target: ActionTarget,
    value: string,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.selectOption(value, { timeout: options.timeout, force: options.force });
    return {};
  }

  private async doCheck(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.check({ timeout: options.timeout, force: options.force });
    return {};
  }

  private async doUncheck(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.uncheck({ timeout: options.timeout, force: options.force });
    return {};
  }

  private async doHover(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);

    if (target.coordinates) {
      await this.page.mouse.move(target.coordinates.x, target.coordinates.y);
      return { coordinates: target.coordinates };
    }

    await locator.hover({ timeout: options.timeout, force: options.force });
    return {};
  }

  private async doScroll(
    value: string,
    _options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const { deltaX, deltaY } = JSON.parse(value);
    await this.page.mouse.wheel(deltaX, deltaY);
    return {};
  }

  private async doScrollTo(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.scrollIntoViewIfNeeded({ timeout: options.timeout });
    return {};
  }

  private async doNavigate(
    url: string,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    await this.page.goto(url, {
      timeout: options.timeout,
      waitUntil: 'networkidle',
    });
    return {};
  }

  private async doGoBack(
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    await this.page.goBack({ timeout: options.timeout, waitUntil: 'networkidle' });
    return {};
  }

  private async doGoForward(
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    await this.page.goForward({ timeout: options.timeout, waitUntil: 'networkidle' });
    return {};
  }

  private async doReload(
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    await this.page.reload({ timeout: options.timeout, waitUntil: 'networkidle' });
    return {};
  }

  private async doScreenshot(fullPage: boolean): Promise<Partial<ActionResult>> {
    const buffer = await this.page.screenshot({ type: 'png', fullPage });
    return { screenshot: buffer.toString('base64') };
  }

  private async doWait(ms: number): Promise<Partial<ActionResult>> {
    await this.sleep(ms);
    return {};
  }

  private async doWaitForSelector(
    selector: string,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    await this.page.waitForSelector(selector, { timeout: options.timeout, state: 'visible' });
    return {};
  }

  private async doWaitForNavigation(
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    await this.page.waitForNavigation({ timeout: options.timeout, waitUntil: 'networkidle' });
    return {};
  }

  private async doPressKey(
    key: string,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    if (options.modifiers && options.modifiers.length > 0) {
      const combo = [...options.modifiers, key].join('+');
      await this.page.keyboard.press(combo);
    } else {
      await this.page.keyboard.press(key);
    }
    return {};
  }

  private async doDrag(
    value: string,
    _options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const { from, to } = JSON.parse(value);
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(to.x, to.y, { steps: 10 });
    await this.page.mouse.up();
    return {};
  }

  private async doFocus(
    target: ActionTarget,
    options: Required<ActionOptions>
  ): Promise<Partial<ActionResult>> {
    const locator = await this.resolveTarget(target, options);
    await locator.focus({ timeout: options.timeout });
    return {};
  }

  private async doBlur(): Promise<Partial<ActionResult>> {
    await this.page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      if (active && active.blur) {
        active.blur();
      }
    });
    return {};
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Resolve an ActionTarget to a Playwright Locator
   */
  private async resolveTarget(target: ActionTarget, options: Required<ActionOptions>) {
    if (target.selector) {
      return this.page.locator(target.selector);
    }
    if (target.xpath) {
      return this.page.locator(`xpath=${target.xpath}`);
    }
    if (target.text) {
      return this.page.getByText(target.text);
    }
    if (target.description) {
      // Try to find by accessible name or label
      const locator = this.page.getByRole('button', { name: target.description })
        .or(this.page.getByRole('link', { name: target.description }))
        .or(this.page.getByLabel(target.description))
        .or(this.page.getByPlaceholder(target.description))
        .or(this.page.getByText(target.description));
      return locator;
    }
    if (target.element) {
      return this.page.locator(target.element.selector);
    }
    if (target.visualElement) {
      // Use coordinates from visual element
      return this.page.locator(`xpath=//*`).first(); // Placeholder, will use coordinates
    }

    throw new Error('No valid target specified');
  }

  /**
   * Get description from target for vision fallback
   */
  private getTargetDescription(target?: ActionTarget): string | null {
    if (!target) return null;
    return target.description || target.text || null;
  }

  /**
   * Check if vision fallback is applicable for action type
   */
  private canUseVisionFallback(action: Action): boolean {
    const supportedTypes: ActionType[] = [
      'click',
      'double-click',
      'right-click',
      'type',
      'hover',
    ];
    return supportedTypes.includes(action.type) && !!action.target;
  }

  /**
   * Highlight an element on the page
   */
  private async highlightTarget(target: ActionTarget): Promise<void> {
    try {
      const selector = target.selector || target.element?.selector;
      if (!selector) return;

      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return;

        const originalOutline = el.style.outline;
        const originalBackground = el.style.backgroundColor;

        el.style.outline = '3px solid red';
        el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

        setTimeout(() => {
          el.style.outline = originalOutline;
          el.style.backgroundColor = originalBackground;
        }, 1000);
      }, selector);
    } catch {
      // Ignore highlighting errors
    }
  }

  /**
   * Get default action options
   */
  private getDefaultOptions(): Required<ActionOptions> {
    return {
      timeout: this.config.defaultTimeout,
      retries: this.config.defaultRetries,
      retryDelay: this.config.defaultRetryDelay,
      useVisionFallback: this.config.useVisionFallback,
      highlightElement: this.config.highlightOnAction,
      waitAfter: 0,
      force: false,
      modifiers: [],
    };
  }

  /**
   * Process the action queue
   */
  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.actionQueue.length === 0) {
      return;
    }

    this.isExecuting = true;

    while (this.actionQueue.length > 0) {
      const item = this.actionQueue.shift()!;

      try {
        const result = await this.execute(item.action);
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }

      // Wait between queued actions
      if (this.actionQueue.length > 0 && this.config.waitBetweenActions > 0) {
        await this.sleep(this.config.waitBetweenActions);
      }
    }

    this.isExecuting = false;
  }

  /**
   * Record an action result in history
   */
  private recordResult(result: ActionResult): void {
    this.actionHistory.push(result);
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.shift();
    }
  }

  /**
   * Get random delay for human-like typing
   */
  private getRandomDelay(): number {
    const { min, max } = this.config.humanLikeDelay;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // PUBLIC UTILITY METHODS
  // ============================================================================

  /**
   * Get action history
   */
  getHistory(): ActionResult[] {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory = [];
  }

  /**
   * Get last action result
   */
  getLastResult(): ActionResult | undefined {
    return this.actionHistory[this.actionHistory.length - 1];
  }

  /**
   * Get success rate
   */
  getSuccessRate(): number {
    if (this.actionHistory.length === 0) return 1;
    const successful = this.actionHistory.filter(r => r.success).length;
    return successful / this.actionHistory.length;
  }

  /**
   * Get average action duration
   */
  getAverageDuration(): number {
    if (this.actionHistory.length === 0) return 0;
    const total = this.actionHistory.reduce((sum, r) => sum + r.duration, 0);
    return total / this.actionHistory.length;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createActionExecutor(
  page: Page,
  domExtractor: DOMExtractor,
  visionAnalyzer?: VisionAnalyzer,
  config?: ExecutorConfig
): ActionExecutor {
  return new ActionExecutor(page, domExtractor, visionAnalyzer, config);
}

export default ActionExecutor;
