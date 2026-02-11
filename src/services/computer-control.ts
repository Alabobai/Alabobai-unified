/**
 * Alabobai Computer Control Service
 * Browser automation using Puppeteer for the Live Workspace feature
 * Powers the Manus AI-style "watch me work" experience
 */

import puppeteer, { Browser, Page, ElementHandle, CDPSession, KeyInput } from 'puppeteer';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserSession {
  id: string;
  browser: Browser;
  page: Page;
  cdpSession: CDPSession;
  viewport: { width: number; height: number };
  cursorPosition: { x: number; y: number };
  isRecording: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export interface BrowserAction {
  id: string;
  sessionId: string;
  type: ActionType;
  timestamp: Date;
  duration?: number;
  data: ActionData;
  screenshot?: string;
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'type'
  | 'press-key'
  | 'scroll'
  | 'hover'
  | 'drag'
  | 'select'
  | 'screenshot'
  | 'wait'
  | 'evaluate';

export type ActionData =
  | NavigateAction
  | ClickAction
  | TypeAction
  | KeyPressAction
  | ScrollAction
  | HoverAction
  | DragAction
  | SelectAction
  | ScreenshotAction
  | WaitAction
  | EvaluateAction;

export interface NavigateAction {
  type: 'navigate';
  url: string;
}

export interface ClickAction {
  type: 'click' | 'double-click' | 'right-click';
  x: number;
  y: number;
  selector?: string;
  elementText?: string;
}

export interface TypeAction {
  type: 'type';
  text: string;
  selector?: string;
  delay?: number;
}

export interface KeyPressAction {
  type: 'press-key';
  key: string;
  modifiers?: string[];
}

export interface ScrollAction {
  type: 'scroll';
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
}

export interface HoverAction {
  type: 'hover';
  x: number;
  y: number;
  selector?: string;
}

export interface DragAction {
  type: 'drag';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface SelectAction {
  type: 'select';
  selector: string;
  value: string;
}

export interface ScreenshotAction {
  type: 'screenshot';
  fullPage?: boolean;
  selector?: string;
}

export interface WaitAction {
  type: 'wait';
  duration: number;
  selector?: string;
  condition?: 'visible' | 'hidden' | 'attached' | 'detached';
}

export interface EvaluateAction {
  type: 'evaluate';
  script: string;
}

export interface ComputerControlConfig {
  headless?: boolean;
  defaultViewport?: { width: number; height: number };
  timeout?: number;
  typingDelay?: { min: number; max: number };
  actionDelay?: number;
  screenshotQuality?: number;
  userAgent?: string;
  sandbox?: boolean;
}

export interface CursorUpdate {
  sessionId: string;
  x: number;
  y: number;
  timestamp: Date;
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  text?: string;
  href?: string;
  src?: string;
  bounds: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isInteractable: boolean;
}

// ============================================================================
// COMPUTER CONTROL SERVICE
// ============================================================================

export class ComputerControlService extends EventEmitter {
  private config: ComputerControlConfig;
  private sessions: Map<string, BrowserSession> = new Map();
  private actionHistory: Map<string, BrowserAction[]> = new Map();

  constructor(config: ComputerControlConfig = {}) {
    super();
    this.config = {
      headless: config.headless ?? false, // Show browser by default for live view
      defaultViewport: config.defaultViewport ?? { width: 1280, height: 720 },
      timeout: config.timeout ?? 30000,
      typingDelay: config.typingDelay ?? { min: 50, max: 150 },
      actionDelay: config.actionDelay ?? 100,
      screenshotQuality: config.screenshotQuality ?? 80,
      userAgent: config.userAgent,
      sandbox: config.sandbox ?? true,
    };
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Launch a new isolated browser session
   */
  async launchSession(options: {
    sessionId?: string;
    viewport?: { width: number; height: number };
    headless?: boolean;
  } = {}): Promise<BrowserSession> {
    const sessionId = options.sessionId ?? uuid();
    const viewport = options.viewport ?? this.config.defaultViewport!;
    const headless = options.headless ?? this.config.headless;

    // Build browser launch args
    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-features=TranslateUI',
      `--window-size=${viewport.width},${viewport.height}`,
    ];

    // Add sandbox args if enabled (for security)
    if (this.config.sandbox) {
      args.push('--disable-setuid-sandbox');
    } else {
      args.push('--no-sandbox');
    }

    try {
      const browser = await puppeteer.launch({
        headless: headless ? 'shell' : false,
        args,
        defaultViewport: viewport,
      });

      const page = await browser.newPage();

      // Set up page
      if (this.config.userAgent) {
        await page.setUserAgent(this.config.userAgent);
      }

      // Enable CDP session for advanced features
      const cdpSession = await page.createCDPSession();

      // Set up event listeners
      this.setupPageListeners(sessionId, page);

      const session: BrowserSession = {
        id: sessionId,
        browser,
        page,
        cdpSession,
        viewport,
        cursorPosition: { x: 0, y: 0 },
        isRecording: false,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      this.sessions.set(sessionId, session);
      this.actionHistory.set(sessionId, []);

      this.emit('session-created', { sessionId, viewport });

      return session;
    } catch (error) {
      const err = error as Error;
      this.emit('session-error', { sessionId, error: err.message });
      throw new Error(`Failed to launch browser session: ${err.message}`);
    }
  }

  /**
   * Close a browser session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      await session.browser.close();
      this.sessions.delete(sessionId);
      this.emit('session-closed', { sessionId });
    } catch (error) {
      const err = error as Error;
      this.emit('session-error', { sessionId, error: err.message });
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): BrowserSession[] {
    return Array.from(this.sessions.values());
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * Navigate to a URL
   */
  async navigate(sessionId: string, url: string): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      // Ensure URL has protocol
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;

      await session.page.goto(fullUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout,
      });

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'navigate', {
        type: 'navigate',
        url: fullUrl,
      }, Date.now() - startTime);

      this.emit('navigation', { sessionId, url: fullUrl });

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Navigation failed: ${err.message}`);
    }
  }

  /**
   * Go back in history
   */
  async goBack(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.goBack({ waitUntil: 'networkidle2' });
    session.lastActivity = new Date();
  }

  /**
   * Go forward in history
   */
  async goForward(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.goForward({ waitUntil: 'networkidle2' });
    session.lastActivity = new Date();
  }

  /**
   * Reload the page
   */
  async reload(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.reload({ waitUntil: 'networkidle2' });
    session.lastActivity = new Date();
  }

  // ============================================================================
  // MOUSE INTERACTIONS
  // ============================================================================

  /**
   * Click at coordinates or on a selector
   */
  async click(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string; button?: 'left' | 'right' | 'middle' }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    let x = options.x ?? 0;
    let y = options.y ?? 0;
    let elementText: string | undefined;

    try {
      if (options.selector) {
        // Click on selector
        const element = await session.page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }

        const box = await element.boundingBox();
        if (box) {
          x = box.x + box.width / 2;
          y = box.y + box.height / 2;
        }

        elementText = await element.evaluate((el: Element) => el.textContent?.trim().substring(0, 50));

        await element.click({ button: options.button });
      } else {
        // Click at coordinates with realistic mouse movement
        await this.animateMouseTo(session, x, y);
        await session.page.mouse.click(x, y, { button: options.button });
      }

      session.cursorPosition = { x, y };
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'click', {
        type: 'click',
        x,
        y,
        selector: options.selector,
        elementText,
      }, Date.now() - startTime);

      this.emit('cursor-update', { sessionId, x, y, timestamp: new Date() });

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Click failed: ${err.message}`);
    }
  }

  /**
   * Double click at coordinates or on a selector
   */
  async doubleClick(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    let x = options.x ?? 0;
    let y = options.y ?? 0;

    try {
      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }

        const box = await element.boundingBox();
        if (box) {
          x = box.x + box.width / 2;
          y = box.y + box.height / 2;
        }

        await element.click({ clickCount: 2 });
      } else {
        await this.animateMouseTo(session, x, y);
        await session.page.mouse.click(x, y, { clickCount: 2 });
      }

      session.cursorPosition = { x, y };
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'double-click', {
        type: 'double-click',
        x,
        y,
        selector: options.selector,
      }, Date.now() - startTime);

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Double click failed: ${err.message}`);
    }
  }

  /**
   * Right click at coordinates or on a selector
   */
  async rightClick(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string }
  ): Promise<BrowserAction> {
    return this.click(sessionId, { ...options, button: 'right' });
  }

  /**
   * Hover over an element
   */
  async hover(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    let x = options.x ?? 0;
    let y = options.y ?? 0;

    try {
      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }

        await element.hover();

        const box = await element.boundingBox();
        if (box) {
          x = box.x + box.width / 2;
          y = box.y + box.height / 2;
        }
      } else {
        await this.animateMouseTo(session, x, y);
      }

      session.cursorPosition = { x, y };
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'hover', {
        type: 'hover',
        x,
        y,
        selector: options.selector,
      }, Date.now() - startTime);

      this.emit('cursor-update', { sessionId, x, y, timestamp: new Date() });

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Hover failed: ${err.message}`);
    }
  }

  /**
   * Drag from one position to another
   */
  async drag(
    sessionId: string,
    options: { fromX: number; fromY: number; toX: number; toY: number }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      await this.animateMouseTo(session, options.fromX, options.fromY);
      await session.page.mouse.down();
      await this.animateMouseTo(session, options.toX, options.toY);
      await session.page.mouse.up();

      session.cursorPosition = { x: options.toX, y: options.toY };
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'drag', {
        type: 'drag',
        fromX: options.fromX,
        fromY: options.fromY,
        toX: options.toX,
        toY: options.toY,
      }, Date.now() - startTime);

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Drag failed: ${err.message}`);
    }
  }

  /**
   * Scroll the page
   */
  async scroll(
    sessionId: string,
    options: { x?: number; y?: number; deltaX?: number; deltaY: number }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    const x = options.x ?? session.cursorPosition.x;
    const y = options.y ?? session.cursorPosition.y;
    const deltaX = options.deltaX ?? 0;
    const deltaY = options.deltaY;

    try {
      await session.page.mouse.move(x, y);
      await session.page.mouse.wheel({ deltaX, deltaY });

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'scroll', {
        type: 'scroll',
        x,
        y,
        deltaX,
        deltaY,
      }, Date.now() - startTime);

      this.emit('scroll', { sessionId, x, y, deltaX, deltaY });

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Scroll failed: ${err.message}`);
    }
  }

  // ============================================================================
  // KEYBOARD INTERACTIONS
  // ============================================================================

  /**
   * Type text with realistic delays
   */
  async type(
    sessionId: string,
    options: { text: string; selector?: string; delay?: number }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }
        await element.click();
      }

      // Type with realistic varying delays
      const { min, max } = this.config.typingDelay!;
      for (const char of options.text) {
        const delay = options.delay ?? Math.floor(Math.random() * (max - min + 1)) + min;
        await session.page.keyboard.type(char, { delay });

        // Emit typing event for live feedback
        this.emit('typing', { sessionId, char, timestamp: new Date() });
      }

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'type', {
        type: 'type',
        text: options.text,
        selector: options.selector,
        delay: options.delay,
      }, Date.now() - startTime);

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Type failed: ${err.message}`);
    }
  }

  /**
   * Press a key or key combination
   */
  async pressKey(
    sessionId: string,
    options: { key: string; modifiers?: string[] }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      // Hold modifier keys
      const modifiers = options.modifiers ?? [];
      for (let i = 0; i < modifiers.length; i++) {
        await session.page.keyboard.down(modifiers[i] as KeyInput);
      }

      // Press the key
      await session.page.keyboard.press(options.key as KeyInput);

      // Release modifier keys (in reverse order)
      for (let i = modifiers.length - 1; i >= 0; i--) {
        await session.page.keyboard.up(modifiers[i] as KeyInput);
      }

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'press-key', {
        type: 'press-key',
        key: options.key,
        modifiers: options.modifiers,
      }, Date.now() - startTime);

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Key press failed: ${err.message}`);
    }
  }

  /**
   * Fill a form field (clears existing content first)
   */
  async fill(sessionId: string, selector: string, value: string): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      // Clear existing content
      await session.page.click(selector, { clickCount: 3 });
      await session.page.keyboard.press('Backspace');

      // Type the new value
      return this.type(sessionId, { text: value, selector });
    } catch (error) {
      const err = error as Error;
      throw new Error(`Fill failed: ${err.message}`);
    }
  }

  /**
   * Select an option from a dropdown
   */
  async select(
    sessionId: string,
    options: { selector: string; value: string }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      await session.page.select(options.selector, options.value);

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'select', {
        type: 'select',
        selector: options.selector,
        value: options.value,
      }, Date.now() - startTime);

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Select failed: ${err.message}`);
    }
  }

  // ============================================================================
  // SCREENSHOT & CAPTURE
  // ============================================================================

  /**
   * Take a screenshot
   */
  async screenshot(
    sessionId: string,
    options: { fullPage?: boolean; selector?: string; quality?: number } = {}
  ): Promise<{ data: string; action: BrowserAction }> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      let screenshotBuffer: Buffer;

      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }
        screenshotBuffer = await element.screenshot({
          type: 'jpeg',
          quality: options.quality ?? this.config.screenshotQuality,
        }) as Buffer;
      } else {
        screenshotBuffer = await session.page.screenshot({
          type: 'jpeg',
          quality: options.quality ?? this.config.screenshotQuality,
          fullPage: options.fullPage ?? false,
        }) as Buffer;
      }

      const data = screenshotBuffer.toString('base64');

      const action = this.recordAction(sessionId, 'screenshot', {
        type: 'screenshot',
        fullPage: options.fullPage,
        selector: options.selector,
      }, Date.now() - startTime);

      // Attach screenshot to action
      action.screenshot = data;

      this.emit('screenshot', { sessionId, data, timestamp: new Date() });

      return { data, action };
    } catch (error) {
      const err = error as Error;
      throw new Error(`Screenshot failed: ${err.message}`);
    }
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(sessionId: string): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);
    return session.page.url();
  }

  /**
   * Get page title
   */
  async getPageTitle(sessionId: string): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);
    return session.page.title();
  }

  // ============================================================================
  // ELEMENT INSPECTION
  // ============================================================================

  /**
   * Get element info at coordinates
   */
  async getElementAt(sessionId: string, x: number, y: number): Promise<ElementInfo | null> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const elementInfo = await session.page.evaluate(
        (x: number, y: number) => {
          const element = document.elementFromPoint(x, y);
          if (!element) return null;

          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);

          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: element.className || undefined,
            text: element.textContent?.trim().substring(0, 100) || undefined,
            href: (element as HTMLAnchorElement).href || undefined,
            src: (element as HTMLImageElement).src || undefined,
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
            isInteractable: ['a', 'button', 'input', 'select', 'textarea'].includes(element.tagName.toLowerCase()) ||
              element.getAttribute('onclick') !== null ||
              computedStyle.cursor === 'pointer',
          };
        },
        x,
        y
      );

      return elementInfo;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find elements matching a selector
   */
  async findElements(sessionId: string, selector: string): Promise<ElementInfo[]> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const elements = await session.page.$$eval(selector, (els: Element[]) => {
        return els.map((element) => {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);

          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: element.className || undefined,
            text: element.textContent?.trim().substring(0, 100) || undefined,
            href: (element as HTMLAnchorElement).href || undefined,
            src: (element as HTMLImageElement).src || undefined,
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
            isInteractable: ['a', 'button', 'input', 'select', 'textarea'].includes(element.tagName.toLowerCase()) ||
              element.getAttribute('onclick') !== null ||
              computedStyle.cursor === 'pointer',
          };
        });
      });

      return elements;
    } catch (error) {
      return [];
    }
  }

  // ============================================================================
  // SCRIPT EVALUATION
  // ============================================================================

  /**
   * Evaluate JavaScript in the browser context
   */
  async evaluate<T>(sessionId: string, script: string): Promise<T> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const result = await session.page.evaluate(script);
      session.lastActivity = new Date();

      this.recordAction(sessionId, 'evaluate', {
        type: 'evaluate',
        script,
      });

      return result as T;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Evaluate failed: ${err.message}`);
    }
  }

  // ============================================================================
  // WAIT OPERATIONS
  // ============================================================================

  /**
   * Wait for a specified duration or condition
   */
  async wait(
    sessionId: string,
    options: { duration?: number; selector?: string; condition?: 'visible' | 'hidden' | 'attached' | 'detached' }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      if (options.selector) {
        switch (options.condition) {
          case 'visible':
            await session.page.waitForSelector(options.selector, { visible: true, timeout: this.config.timeout });
            break;
          case 'hidden':
            await session.page.waitForSelector(options.selector, { hidden: true, timeout: this.config.timeout });
            break;
          case 'detached':
            await session.page.waitForSelector(options.selector, { hidden: true, timeout: this.config.timeout });
            break;
          default:
            await session.page.waitForSelector(options.selector, { timeout: this.config.timeout });
        }
      } else if (options.duration) {
        await new Promise(resolve => setTimeout(resolve, options.duration));
      }

      const action = this.recordAction(sessionId, 'wait', {
        type: 'wait',
        duration: options.duration ?? Date.now() - startTime,
        selector: options.selector,
        condition: options.condition,
      }, Date.now() - startTime);

      return action;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Wait failed: ${err.message}`);
    }
  }

  // ============================================================================
  // ACTION HISTORY
  // ============================================================================

  /**
   * Get action history for a session
   */
  getActionHistory(sessionId: string): BrowserAction[] {
    return this.actionHistory.get(sessionId) ?? [];
  }

  /**
   * Clear action history for a session
   */
  clearActionHistory(sessionId: string): void {
    this.actionHistory.set(sessionId, []);
  }

  /**
   * Start recording actions (enables activity feed)
   */
  startRecording(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    session.isRecording = true;
    this.emit('recording-started', { sessionId });
  }

  /**
   * Stop recording actions
   */
  stopRecording(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    session.isRecording = false;
    this.emit('recording-stopped', { sessionId });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getSessionOrThrow(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Animate mouse movement for realistic cursor tracking
   */
  private async animateMouseTo(session: BrowserSession, targetX: number, targetY: number): Promise<void> {
    const steps = 10;
    const { x: startX, y: startY } = session.cursorPosition;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Ease-in-out curve for natural movement
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentX = startX + (targetX - startX) * eased;
      const currentY = startY + (targetY - startY) * eased;

      await session.page.mouse.move(currentX, currentY);

      // Emit cursor position update
      this.emit('cursor-update', {
        sessionId: session.id,
        x: currentX,
        y: currentY,
        timestamp: new Date(),
      });

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    session.cursorPosition = { x: targetX, y: targetY };
  }

  /**
   * Record an action to history
   */
  private recordAction(
    sessionId: string,
    type: ActionType,
    data: ActionData,
    duration?: number
  ): BrowserAction {
    const action: BrowserAction = {
      id: uuid(),
      sessionId,
      type,
      timestamp: new Date(),
      duration,
      data,
    };

    const history = this.actionHistory.get(sessionId) ?? [];
    history.push(action);
    this.actionHistory.set(sessionId, history);

    // Emit action event for live activity feed
    this.emit('action', action);

    return action;
  }

  /**
   * Set up page event listeners
   */
  private setupPageListeners(sessionId: string, page: Page): void {
    page.on('load', () => {
      this.emit('page-loaded', { sessionId, url: page.url() });
    });

    page.on('domcontentloaded', () => {
      this.emit('dom-ready', { sessionId, url: page.url() });
    });

    page.on('error', (error) => {
      this.emit('page-error', { sessionId, error: error.message });
    });

    page.on('console', (msg) => {
      this.emit('console', { sessionId, type: msg.type(), text: msg.text() });
    });

    page.on('dialog', async (dialog) => {
      this.emit('dialog', { sessionId, type: dialog.type(), message: dialog.message() });
      // Auto-dismiss dialogs by default
      await dialog.dismiss();
    });

    page.on('popup', async (popup) => {
      if (popup) {
        this.emit('popup', { sessionId, url: popup.url() });
      }
    });
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.closeSession(sessionId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

// Factory function
export function createComputerControl(config?: ComputerControlConfig): ComputerControlService {
  return new ComputerControlService(config);
}
