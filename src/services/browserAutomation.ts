/**
 * Alabobai Browser Automation Service
 *
 * Complete browser automation system with:
 * - Puppeteer/Playwright browser control
 * - Session management (create, persist, destroy)
 * - Actions: navigate, click, type, scroll, screenshot
 * - DOM inspection and element finding
 * - Cookie and storage management
 * - Proxy support for privacy
 * - Safety controls (allowlist/blocklist, rate limiting)
 */

import { Browser, Page, BrowserContext, chromium, firefox, webkit } from 'playwright';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserSessionConfig {
  sessionId?: string;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  proxy?: ProxyConfig;
  timeout?: number;
  persistSession?: boolean;
  storageState?: string;
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
  bypass?: string[];
}

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  config: BrowserSessionConfig;
  viewport: { width: number; height: number };
  cursorPosition: { x: number; y: number };
  isRecording: boolean;
  cookies: CookieData[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  history: NavigationEntry[];
  historyIndex: number;
  createdAt: Date;
  lastActivity: Date;
  status: SessionStatus;
}

export type SessionStatus = 'initializing' | 'ready' | 'active' | 'paused' | 'error' | 'closed';

export interface NavigationEntry {
  url: string;
  title: string;
  timestamp: Date;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface BrowserAction {
  id: string;
  sessionId: string;
  type: ActionType;
  timestamp: Date;
  duration?: number;
  data: Record<string, unknown>;
  screenshot?: string;
  success: boolean;
  error?: string;
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'type'
  | 'fill'
  | 'clear'
  | 'press'
  | 'scroll'
  | 'hover'
  | 'drag'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'screenshot'
  | 'wait'
  | 'evaluate'
  | 'extract'
  | 'set-cookie'
  | 'delete-cookie'
  | 'set-storage'
  | 'clear-storage';

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  text?: string;
  href?: string;
  src?: string;
  value?: string;
  placeholder?: string;
  ariaLabel?: string;
  bounds: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isEnabled: boolean;
  isEditable: boolean;
  attributes: Record<string, string>;
}

export interface DOMSnapshot {
  url: string;
  title: string;
  html: string;
  text: string;
  elements: ElementInfo[];
  forms: FormInfo[];
  links: LinkInfo[];
  images: ImageInfo[];
  timestamp: Date;
}

export interface FormInfo {
  id?: string;
  name?: string;
  action?: string;
  method: string;
  fields: FormFieldInfo[];
}

export interface FormFieldInfo {
  name: string;
  type: string;
  value?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface LinkInfo {
  text: string;
  href: string;
  isExternal: boolean;
}

export interface ImageInfo {
  src: string;
  alt?: string;
  width: number;
  height: number;
}

export interface SafetyConfig {
  urlAllowlist?: string[];
  urlBlocklist?: string[];
  domainAllowlist?: string[];
  domainBlocklist?: string[];
  maxActionsPerMinute?: number;
  requireConfirmation?: ActionType[];
  sessionTimeout?: number;
  maxConcurrentSessions?: number;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  action: BrowserAction;
  screenshot?: string;
}

// ============================================================================
// BROWSER AUTOMATION SERVICE
// ============================================================================

export class BrowserAutomationService extends EventEmitter {
  private sessions: Map<string, BrowserSession> = new Map();
  private actionHistory: Map<string, BrowserAction[]> = new Map();
  private safetyConfig: SafetyConfig;
  private actionCounts: Map<string, { count: number; resetAt: number }> = new Map();
  private browsers: Map<string, Browser> = new Map();

  constructor(safetyConfig: SafetyConfig = {}) {
    super();
    this.safetyConfig = {
      urlAllowlist: safetyConfig.urlAllowlist,
      urlBlocklist: safetyConfig.urlBlocklist ?? [
        '*://localhost:*/*',
        '*://127.0.0.1:*/*',
        'file://*',
      ],
      domainAllowlist: safetyConfig.domainAllowlist,
      domainBlocklist: safetyConfig.domainBlocklist ?? [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
      ],
      maxActionsPerMinute: safetyConfig.maxActionsPerMinute ?? 60,
      requireConfirmation: safetyConfig.requireConfirmation ?? ['evaluate', 'set-cookie', 'clear-storage'],
      sessionTimeout: safetyConfig.sessionTimeout ?? 30 * 60 * 1000, // 30 minutes
      maxConcurrentSessions: safetyConfig.maxConcurrentSessions ?? 5,
    };

    // Set up session cleanup interval
    setInterval(() => this.cleanupStaleSessions(), 60000);
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Create a new browser session
   */
  async createSession(config: BrowserSessionConfig = {}): Promise<BrowserSession> {
    // Check concurrent session limit
    if (this.sessions.size >= (this.safetyConfig.maxConcurrentSessions ?? 5)) {
      throw new Error(`Maximum concurrent sessions (${this.safetyConfig.maxConcurrentSessions}) reached`);
    }

    const sessionId = config.sessionId ?? uuid();
    const browserType = config.browserType ?? 'chromium';
    const headless = config.headless ?? true;
    const viewport = config.viewport ?? { width: 1280, height: 720 };

    try {
      // Get or launch browser
      let browser = this.browsers.get(browserType);
      if (!browser || !browser.isConnected()) {
        const browserLauncher = browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium;

        const launchOptions: Record<string, unknown> = {
          headless,
          args: browserType === 'chromium' ? [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-infobars',
            '--disable-features=TranslateUI',
            '--disable-blink-features=AutomationControlled',
          ] : [],
        };

        if (config.proxy) {
          launchOptions.proxy = {
            server: config.proxy.server,
            username: config.proxy.username,
            password: config.proxy.password,
            bypass: config.proxy.bypass?.join(','),
          };
        }

        browser = await browserLauncher.launch(launchOptions as Parameters<typeof browserLauncher.launch>[0]);
        this.browsers.set(browserType, browser);
      }

      // Create context with options
      const contextOptions: Record<string, unknown> = {
        viewport,
        userAgent: config.userAgent,
        ignoreHTTPSErrors: true,
      };

      // Load storage state if persisting session
      if (config.persistSession && config.storageState) {
        try {
          contextOptions.storageState = config.storageState;
        } catch {
          // Ignore if storage state doesn't exist
        }
      }

      const context = await browser.newContext(contextOptions as Parameters<typeof browser.newContext>[0]);
      const page = await context.newPage();

      // Set up page event listeners
      this.setupPageListeners(sessionId, page);

      const session: BrowserSession = {
        id: sessionId,
        browser,
        context,
        page,
        config,
        viewport,
        cursorPosition: { x: 0, y: 0 },
        isRecording: false,
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        history: [],
        historyIndex: -1,
        createdAt: new Date(),
        lastActivity: new Date(),
        status: 'ready',
      };

      this.sessions.set(sessionId, session);
      this.actionHistory.set(sessionId, []);

      this.emit('session:created', { sessionId, config });

      return session;
    } catch (error) {
      const err = error as Error;
      this.emit('session:error', { sessionId, error: err.message });
      throw new Error(`Failed to create browser session: ${err.message}`);
    }
  }

  /**
   * Get a session by ID
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

  /**
   * Persist session state (cookies, storage)
   */
  async persistSession(sessionId: string, filePath?: string): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const storageState = await session.context.storageState();
      const stateJson = JSON.stringify(storageState, null, 2);

      if (filePath) {
        const fs = await import('fs/promises');
        await fs.writeFile(filePath, stateJson);
      }

      return stateJson;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to persist session: ${err.message}`);
    }
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.status = 'closed';
      await session.context.close();
      this.sessions.delete(sessionId);
      this.actionHistory.delete(sessionId);
      this.emit('session:closed', { sessionId });
    } catch (error) {
      const err = error as Error;
      this.emit('session:error', { sessionId, error: err.message });
    }
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.closeSession(id)));
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * Navigate to a URL
   */
  async navigate(sessionId: string, url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    // Validate URL
    const validation = this.validateUrl(url);
    if (!validation.allowed) {
      return this.failAction(sessionId, 'navigate', { url }, validation.reason!);
    }

    // Check rate limit
    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'navigate', { url }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      // Normalize URL
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;

      await session.page.goto(fullUrl, {
        waitUntil: options?.waitUntil ?? 'networkidle',
        timeout: session.config.timeout ?? 30000,
      });

      const title = await session.page.title();

      // Update session
      session.lastActivity = new Date();
      session.status = 'active';

      // Add to history
      session.history = session.history.slice(0, session.historyIndex + 1);
      session.history.push({ url: fullUrl, title, timestamp: new Date() });
      session.historyIndex = session.history.length - 1;

      const action = this.recordAction(sessionId, 'navigate', {
        url: fullUrl,
        title,
      }, Date.now() - startTime);

      this.emit('navigation', { sessionId, url: fullUrl, title });

      return {
        success: true,
        data: { url: fullUrl, title },
        action,
      };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'navigate', { url }, err.message);
    }
  }

  /**
   * Go back in history
   */
  async goBack(sessionId: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (session.historyIndex <= 0) {
      return this.failAction(sessionId, 'navigate', { direction: 'back' }, 'No history to go back');
    }

    try {
      await session.page.goBack({ waitUntil: 'networkidle' });
      session.historyIndex--;
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'navigate', { direction: 'back' });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'navigate', { direction: 'back' }, err.message);
    }
  }

  /**
   * Go forward in history
   */
  async goForward(sessionId: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (session.historyIndex >= session.history.length - 1) {
      return this.failAction(sessionId, 'navigate', { direction: 'forward' }, 'No history to go forward');
    }

    try {
      await session.page.goForward({ waitUntil: 'networkidle' });
      session.historyIndex++;
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'navigate', { direction: 'forward' });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'navigate', { direction: 'forward' }, err.message);
    }
  }

  /**
   * Reload the page
   */
  async reload(sessionId: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      await session.page.reload({ waitUntil: 'networkidle' });
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'navigate', { reload: true });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'navigate', { reload: true }, err.message);
    }
  }

  // ============================================================================
  // MOUSE INTERACTIONS
  // ============================================================================

  /**
   * Click on an element or coordinates
   */
  async click(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string; button?: 'left' | 'right' | 'middle'; clickCount?: number }
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'click', options, 'Rate limit exceeded');
    }

    const startTime = Date.now();
    let x = options.x ?? 0;
    let y = options.y ?? 0;
    let elementText: string | undefined;

    try {
      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          return this.failAction(sessionId, 'click', options, `Element not found: ${options.selector}`);
        }

        const box = await element.boundingBox();
        if (box) {
          x = box.x + box.width / 2;
          y = box.y + box.height / 2;
        }

        elementText = await element.textContent() ?? undefined;

        await element.click({
          button: options.button,
          clickCount: options.clickCount,
        });
      } else {
        await this.animateMouseTo(session, x, y);
        await session.page.mouse.click(x, y, {
          button: options.button,
          clickCount: options.clickCount,
        });
      }

      session.cursorPosition = { x, y };
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, options.clickCount === 2 ? 'double-click' : options.button === 'right' ? 'right-click' : 'click', {
        x,
        y,
        selector: options.selector,
        elementText,
      }, Date.now() - startTime);

      this.emit('cursor:update', { sessionId, x, y });

      return { success: true, data: { x, y, elementText }, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'click', options, err.message);
    }
  }

  /**
   * Double click
   */
  async doubleClick(sessionId: string, options: { x?: number; y?: number; selector?: string }): Promise<ActionResult> {
    return this.click(sessionId, { ...options, clickCount: 2 });
  }

  /**
   * Right click
   */
  async rightClick(sessionId: string, options: { x?: number; y?: number; selector?: string }): Promise<ActionResult> {
    return this.click(sessionId, { ...options, button: 'right' });
  }

  /**
   * Hover over an element
   */
  async hover(sessionId: string, options: { x?: number; y?: number; selector?: string }): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'hover', options, 'Rate limit exceeded');
    }

    const startTime = Date.now();
    let x = options.x ?? 0;
    let y = options.y ?? 0;

    try {
      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          return this.failAction(sessionId, 'hover', options, `Element not found: ${options.selector}`);
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
        x,
        y,
        selector: options.selector,
      }, Date.now() - startTime);

      this.emit('cursor:update', { sessionId, x, y });

      return { success: true, data: { x, y }, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'hover', options, err.message);
    }
  }

  /**
   * Drag from one position to another
   */
  async drag(
    sessionId: string,
    options: { fromX: number; fromY: number; toX: number; toY: number } | { fromSelector: string; toSelector: string }
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'drag', options, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      if ('fromSelector' in options) {
        const fromElement = await session.page.$(options.fromSelector);
        const toElement = await session.page.$(options.toSelector);

        if (!fromElement || !toElement) {
          return this.failAction(sessionId, 'drag', options, 'Source or target element not found');
        }

        await fromElement.dragTo(toElement);
      } else {
        await this.animateMouseTo(session, options.fromX, options.fromY);
        await session.page.mouse.down();
        await this.animateMouseTo(session, options.toX, options.toY);
        await session.page.mouse.up();

        session.cursorPosition = { x: options.toX, y: options.toY };
      }

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'drag', options, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'drag', options, err.message);
    }
  }

  /**
   * Scroll the page
   */
  async scroll(
    sessionId: string,
    options: { x?: number; y?: number; deltaX?: number; deltaY?: number; selector?: string }
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'scroll', options, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      if (options.selector) {
        const element = await session.page.$(options.selector);
        if (element) {
          await element.scrollIntoViewIfNeeded();
        }
      } else {
        const x = options.x ?? session.cursorPosition.x;
        const y = options.y ?? session.cursorPosition.y;
        const deltaX = options.deltaX ?? 0;
        const deltaY = options.deltaY ?? 100;

        await session.page.mouse.wheel(deltaX, deltaY);
      }

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'scroll', options, Date.now() - startTime);

      this.emit('scroll', { sessionId, ...options });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'scroll', options, err.message);
    }
  }

  // ============================================================================
  // KEYBOARD INTERACTIONS
  // ============================================================================

  /**
   * Type text (character by character with delays)
   */
  async type(
    sessionId: string,
    options: { text: string; selector?: string; delay?: number }
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'type', options, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      if (options.selector) {
        await session.page.click(options.selector);
      }

      // Type with realistic delays
      const delay = options.delay ?? 50;
      for (const char of options.text) {
        await session.page.keyboard.type(char, { delay: delay + Math.random() * 50 });
        this.emit('typing', { sessionId, char });
      }

      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'type', {
        text: options.text,
        selector: options.selector,
        length: options.text.length,
      }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'type', options, err.message);
    }
  }

  /**
   * Fill a form field (clears first, then types instantly)
   */
  async fill(
    sessionId: string,
    selector: string,
    value: string
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'fill', { selector, value }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      await session.page.fill(selector, value);
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'fill', {
        selector,
        value,
      }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'fill', { selector, value }, err.message);
    }
  }

  /**
   * Clear a form field
   */
  async clear(sessionId: string, selector: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'clear', { selector }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      await session.page.fill(selector, '');
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'clear', { selector }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'clear', { selector }, err.message);
    }
  }

  /**
   * Press a key or key combination
   */
  async press(
    sessionId: string,
    key: string,
    options?: { modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[] }
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'press', { key, ...options }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      let keyCombo = key;
      if (options?.modifiers?.length) {
        keyCombo = [...options.modifiers, key].join('+');
      }

      await session.page.keyboard.press(keyCombo);
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'press', { key, modifiers: options?.modifiers }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'press', { key, ...options }, err.message);
    }
  }

  /**
   * Select option from dropdown
   */
  async select(sessionId: string, selector: string, values: string | string[]): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'select', { selector, values }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      const selected = await session.page.selectOption(selector, values);
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'select', { selector, values, selected }, Date.now() - startTime);

      return { success: true, data: { selected }, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'select', { selector, values }, err.message);
    }
  }

  /**
   * Check a checkbox
   */
  async check(sessionId: string, selector: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'check', { selector }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      await session.page.check(selector);
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'check', { selector }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'check', { selector }, err.message);
    }
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(sessionId: string, selector: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (!this.checkRateLimit(sessionId)) {
      return this.failAction(sessionId, 'uncheck', { selector }, 'Rate limit exceeded');
    }

    const startTime = Date.now();

    try {
      await session.page.uncheck(selector);
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'uncheck', { selector }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'uncheck', { selector }, err.message);
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
    options?: { fullPage?: boolean; selector?: string; type?: 'png' | 'jpeg'; quality?: number }
  ): Promise<ActionResult<{ base64: string; width: number; height: number }>> {
    const session = this.getSessionOrThrow(sessionId);

    const startTime = Date.now();

    try {
      let buffer: Buffer;
      let width: number;
      let height: number;

      if (options?.selector) {
        const element = await session.page.$(options.selector);
        if (!element) {
          return this.failAction(sessionId, 'screenshot', options ?? {}, `Element not found: ${options.selector}`) as ActionResult<{ base64: string; width: number; height: number }>;
        }

        buffer = await element.screenshot({
          type: options?.type ?? 'png',
          quality: options?.type === 'jpeg' ? (options?.quality ?? 80) : undefined,
        });

        const box = await element.boundingBox();
        width = box?.width ?? 0;
        height = box?.height ?? 0;
      } else {
        buffer = await session.page.screenshot({
          fullPage: options?.fullPage ?? false,
          type: options?.type ?? 'png',
          quality: options?.type === 'jpeg' ? (options?.quality ?? 80) : undefined,
        });

        const viewport = session.page.viewportSize();
        width = viewport?.width ?? 0;
        height = viewport?.height ?? 0;
      }

      const base64 = buffer.toString('base64');

      const action = this.recordAction(sessionId, 'screenshot', options ?? {}, Date.now() - startTime);
      action.screenshot = base64;

      this.emit('screenshot', { sessionId, base64, width, height });

      return {
        success: true,
        data: { base64, width, height },
        action,
        screenshot: base64,
      };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'screenshot', options ?? {}, err.message) as ActionResult<{ base64: string; width: number; height: number }>;
    }
  }

  // ============================================================================
  // DOM INSPECTION
  // ============================================================================

  /**
   * Get page DOM snapshot
   */
  async getDOM(sessionId: string): Promise<ActionResult<DOMSnapshot>> {
    const session = this.getSessionOrThrow(sessionId);

    const startTime = Date.now();

    try {
      const url = session.page.url();
      const title = await session.page.title();
      const html = await session.page.content();
      const text = await session.page.innerText('body').catch(() => '');

      // Extract elements
      const elements = await this.extractElements(session.page);
      const forms = await this.extractForms(session.page);
      const links = await this.extractLinks(session.page);
      const images = await this.extractImages(session.page);

      const snapshot: DOMSnapshot = {
        url,
        title,
        html,
        text,
        elements,
        forms,
        links,
        images,
        timestamp: new Date(),
      };

      const action = this.recordAction(sessionId, 'extract', { type: 'dom' }, Date.now() - startTime);

      return { success: true, data: snapshot, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'extract', { type: 'dom' }, err.message) as ActionResult<DOMSnapshot>;
    }
  }

  /**
   * Find element by selector
   */
  async findElement(sessionId: string, selector: string): Promise<ActionResult<ElementInfo | null>> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const element = await session.page.$(selector);
      if (!element) {
        return { success: true, data: null, action: this.recordAction(sessionId, 'extract', { selector }) };
      }

      const info = await this.getElementInfo(element);
      const action = this.recordAction(sessionId, 'extract', { selector });

      return { success: true, data: info, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'extract', { selector }, err.message) as ActionResult<ElementInfo | null>;
    }
  }

  /**
   * Find elements by selector
   */
  async findElements(sessionId: string, selector: string): Promise<ActionResult<ElementInfo[]>> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const elements = await session.page.$$(selector);
      const infos: ElementInfo[] = [];

      for (const element of elements) {
        const info = await this.getElementInfo(element);
        if (info) infos.push(info);
      }

      const action = this.recordAction(sessionId, 'extract', { selector, count: infos.length });

      return { success: true, data: infos, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'extract', { selector }, err.message) as ActionResult<ElementInfo[]>;
    }
  }

  /**
   * Get element at coordinates
   */
  async getElementAt(sessionId: string, x: number, y: number): Promise<ActionResult<ElementInfo | null>> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const info = await session.page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          if (!element) return null;

          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);

          const attrs: Record<string, string> = {};
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
          }

          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: element.className || undefined,
            text: element.textContent?.trim().substring(0, 200) || undefined,
            href: (element as HTMLAnchorElement).href || undefined,
            src: (element as HTMLImageElement).src || undefined,
            value: (element as HTMLInputElement).value || undefined,
            placeholder: (element as HTMLInputElement).placeholder || undefined,
            ariaLabel: element.getAttribute('aria-label') || undefined,
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
            isEnabled: !(element as HTMLInputElement).disabled,
            isEditable: element.matches('input, textarea, [contenteditable="true"]'),
            attributes: attrs,
          };
        },
        { x, y }
      );

      const action = this.recordAction(sessionId, 'extract', { x, y });

      return { success: true, data: info, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'extract', { x, y }, err.message) as ActionResult<ElementInfo | null>;
    }
  }

  // ============================================================================
  // COOKIE & STORAGE MANAGEMENT
  // ============================================================================

  /**
   * Get all cookies
   */
  async getCookies(sessionId: string, urls?: string[]): Promise<ActionResult<CookieData[]>> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const cookies = await session.context.cookies(urls);

      const cookieData: CookieData[] = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
      }));

      session.cookies = cookieData;

      const action = this.recordAction(sessionId, 'extract', { type: 'cookies', count: cookieData.length });

      return { success: true, data: cookieData, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'extract', { type: 'cookies' }, err.message) as ActionResult<CookieData[]>;
    }
  }

  /**
   * Set cookies
   */
  async setCookies(sessionId: string, cookies: CookieData[]): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (this.safetyConfig.requireConfirmation?.includes('set-cookie')) {
      this.emit('confirmation:required', { sessionId, action: 'set-cookie', data: { count: cookies.length } });
    }

    try {
      await session.context.addCookies(cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })));

      const action = this.recordAction(sessionId, 'set-cookie', { count: cookies.length });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'set-cookie', { count: cookies.length }, err.message);
    }
  }

  /**
   * Delete cookies
   */
  async deleteCookies(sessionId: string, names?: string[]): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const cookies = await session.context.cookies();
      const toDelete = names
        ? cookies.filter(c => names.includes(c.name))
        : cookies;

      await session.context.clearCookies();

      // Re-add the ones we don't want to delete
      if (names) {
        const toKeep = cookies.filter(c => !names.includes(c.name));
        if (toKeep.length > 0) {
          await session.context.addCookies(toKeep);
        }
      }

      const action = this.recordAction(sessionId, 'delete-cookie', { count: toDelete.length });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'delete-cookie', { names }, err.message);
    }
  }

  /**
   * Get localStorage
   */
  async getLocalStorage(sessionId: string): Promise<ActionResult<Record<string, string>>> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      const storage = await session.page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key) ?? '';
          }
        }
        return data;
      });

      session.localStorage = storage;

      const action = this.recordAction(sessionId, 'extract', { type: 'localStorage', count: Object.keys(storage).length });

      return { success: true, data: storage, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'extract', { type: 'localStorage' }, err.message) as ActionResult<Record<string, string>>;
    }
  }

  /**
   * Set localStorage
   */
  async setLocalStorage(sessionId: string, data: Record<string, string>): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    try {
      await session.page.evaluate((data) => {
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(key, value);
        }
      }, data);

      Object.assign(session.localStorage, data);

      const action = this.recordAction(sessionId, 'set-storage', { type: 'localStorage', count: Object.keys(data).length });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'set-storage', { type: 'localStorage' }, err.message);
    }
  }

  /**
   * Clear localStorage
   */
  async clearLocalStorage(sessionId: string): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (this.safetyConfig.requireConfirmation?.includes('clear-storage')) {
      this.emit('confirmation:required', { sessionId, action: 'clear-storage', data: { type: 'localStorage' } });
    }

    try {
      await session.page.evaluate(() => localStorage.clear());
      session.localStorage = {};

      const action = this.recordAction(sessionId, 'clear-storage', { type: 'localStorage' });

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'clear-storage', { type: 'localStorage' }, err.message);
    }
  }

  // ============================================================================
  // SCRIPT EVALUATION
  // ============================================================================

  /**
   * Evaluate JavaScript in the browser context
   */
  async evaluate<T = unknown>(sessionId: string, script: string): Promise<ActionResult<T>> {
    const session = this.getSessionOrThrow(sessionId);

    if (this.safetyConfig.requireConfirmation?.includes('evaluate')) {
      this.emit('confirmation:required', { sessionId, action: 'evaluate', data: { scriptLength: script.length } });
    }

    const startTime = Date.now();

    try {
      const result = await session.page.evaluate(script);
      session.lastActivity = new Date();

      const action = this.recordAction(sessionId, 'evaluate', {
        scriptLength: script.length,
      }, Date.now() - startTime);

      return { success: true, data: result as T, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'evaluate', { scriptLength: script.length }, err.message) as ActionResult<T>;
    }
  }

  // ============================================================================
  // WAIT OPERATIONS
  // ============================================================================

  /**
   * Wait for a condition
   */
  async wait(
    sessionId: string,
    options: { duration?: number; selector?: string; state?: 'visible' | 'hidden' | 'attached' | 'detached' }
  ): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    const startTime = Date.now();

    try {
      if (options.selector) {
        await session.page.waitForSelector(options.selector, {
          state: options.state ?? 'visible',
          timeout: session.config.timeout ?? 30000,
        });
      } else if (options.duration) {
        await session.page.waitForTimeout(options.duration);
      }

      const action = this.recordAction(sessionId, 'wait', options, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'wait', options, err.message);
    }
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(sessionId: string, options?: { url?: string | RegExp; timeout?: number }): Promise<ActionResult> {
    const session = this.getSessionOrThrow(sessionId);

    const startTime = Date.now();

    try {
      await session.page.waitForURL(options?.url ?? '**/*', {
        timeout: options?.timeout ?? session.config.timeout ?? 30000,
      });

      const action = this.recordAction(sessionId, 'wait', { type: 'navigation', ...options }, Date.now() - startTime);

      return { success: true, action };
    } catch (error) {
      const err = error as Error;
      return this.failAction(sessionId, 'wait', { type: 'navigation', ...options }, err.message);
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get current URL
   */
  getCurrentUrl(sessionId: string): string {
    const session = this.getSessionOrThrow(sessionId);
    return session.page.url();
  }

  /**
   * Get page title
   */
  async getTitle(sessionId: string): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);
    return session.page.title();
  }

  /**
   * Get action history
   */
  getActionHistory(sessionId: string): BrowserAction[] {
    return this.actionHistory.get(sessionId) ?? [];
  }

  /**
   * Clear action history
   */
  clearActionHistory(sessionId: string): void {
    this.actionHistory.set(sessionId, []);
  }

  /**
   * Start recording actions
   */
  startRecording(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    session.isRecording = true;
    this.emit('recording:started', { sessionId });
  }

  /**
   * Stop recording actions
   */
  stopRecording(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    session.isRecording = false;
    this.emit('recording:stopped', { sessionId });
  }

  /**
   * Get safety configuration
   */
  getSafetyConfig(): SafetyConfig {
    return { ...this.safetyConfig };
  }

  /**
   * Update safety configuration
   */
  updateSafetyConfig(config: Partial<SafetyConfig>): void {
    this.safetyConfig = { ...this.safetyConfig, ...config };
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

  private validateUrl(url: string): { allowed: boolean; reason?: string } {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const domain = urlObj.hostname;

      // Check domain blocklist
      if (this.safetyConfig.domainBlocklist?.some(d => domain === d || domain.endsWith(`.${d}`))) {
        return { allowed: false, reason: `Domain blocked: ${domain}` };
      }

      // Check domain allowlist (if configured)
      if (this.safetyConfig.domainAllowlist?.length) {
        if (!this.safetyConfig.domainAllowlist.some(d => domain === d || domain.endsWith(`.${d}`))) {
          return { allowed: false, reason: `Domain not in allowlist: ${domain}` };
        }
      }

      // Check URL blocklist patterns
      if (this.safetyConfig.urlBlocklist?.some(pattern => this.matchUrlPattern(url, pattern))) {
        return { allowed: false, reason: `URL blocked by pattern` };
      }

      // Check URL allowlist (if configured)
      if (this.safetyConfig.urlAllowlist?.length) {
        if (!this.safetyConfig.urlAllowlist.some(pattern => this.matchUrlPattern(url, pattern))) {
          return { allowed: false, reason: `URL not in allowlist` };
        }
      }

      return { allowed: true };
    } catch {
      return { allowed: false, reason: `Invalid URL: ${url}` };
    }
  }

  private matchUrlPattern(url: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
      + '$'
    );
    return regex.test(url);
  }

  private checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const limit = this.safetyConfig.maxActionsPerMinute ?? 60;

    let entry = this.actionCounts.get(sessionId);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 60000 };
    }

    if (entry.count >= limit) {
      return false;
    }

    entry.count++;
    this.actionCounts.set(sessionId, entry);
    return true;
  }

  private async animateMouseTo(session: BrowserSession, targetX: number, targetY: number): Promise<void> {
    const steps = 10;
    const { x: startX, y: startY } = session.cursorPosition;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Ease-in-out curve
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentX = startX + (targetX - startX) * eased;
      const currentY = startY + (targetY - startY) * eased;

      await session.page.mouse.move(currentX, currentY);

      this.emit('cursor:update', {
        sessionId: session.id,
        x: currentX,
        y: currentY,
      });

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    session.cursorPosition = { x: targetX, y: targetY };
  }

  private recordAction(
    sessionId: string,
    type: ActionType,
    data: Record<string, unknown>,
    duration?: number
  ): BrowserAction {
    const action: BrowserAction = {
      id: uuid(),
      sessionId,
      type,
      timestamp: new Date(),
      duration,
      data,
      success: true,
    };

    const history = this.actionHistory.get(sessionId) ?? [];
    history.push(action);
    this.actionHistory.set(sessionId, history);

    this.emit('action', action);

    return action;
  }

  private failAction(
    sessionId: string,
    type: ActionType,
    data: Record<string, unknown>,
    error: string
  ): ActionResult {
    const action: BrowserAction = {
      id: uuid(),
      sessionId,
      type,
      timestamp: new Date(),
      data,
      success: false,
      error,
    };

    const history = this.actionHistory.get(sessionId) ?? [];
    history.push(action);
    this.actionHistory.set(sessionId, history);

    this.emit('action:error', { action, error });

    return { success: false, error, action };
  }

  private setupPageListeners(sessionId: string, page: Page): void {
    page.on('load', () => {
      this.emit('page:loaded', { sessionId, url: page.url() });
    });

    page.on('domcontentloaded', () => {
      this.emit('page:dom-ready', { sessionId, url: page.url() });
    });

    page.on('console', (msg) => {
      this.emit('page:console', { sessionId, type: msg.type(), text: msg.text() });
    });

    page.on('pageerror', (error) => {
      this.emit('page:error', { sessionId, error: error.message });
    });

    page.on('dialog', async (dialog) => {
      this.emit('page:dialog', { sessionId, type: dialog.type(), message: dialog.message() });
      // Auto-dismiss by default
      await dialog.dismiss();
    });

    page.on('popup', async (popup) => {
      if (popup) {
        this.emit('page:popup', { sessionId, url: popup.url() });
      }
    });

    page.on('download', (download) => {
      this.emit('page:download', { sessionId, url: download.url(), suggestedFilename: download.suggestedFilename() });
    });
  }

  private async getElementInfo(element: import('playwright').ElementHandle): Promise<ElementInfo | null> {
    try {
      return await element.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);

        const attrs: Record<string, string> = {};
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          attrs[attr.name] = attr.value;
        }

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          className: el.className || undefined,
          text: el.textContent?.trim().substring(0, 200) || undefined,
          href: (el as HTMLAnchorElement).href || undefined,
          src: (el as HTMLImageElement).src || undefined,
          value: (el as HTMLInputElement).value || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
          isEnabled: !(el as HTMLInputElement).disabled,
          isEditable: el.matches('input, textarea, [contenteditable="true"]'),
          attributes: attrs,
        };
      });
    } catch {
      return null;
    }
  }

  private async extractElements(page: Page): Promise<ElementInfo[]> {
    return page.evaluate(() => {
      const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [onclick]';
      const elements = document.querySelectorAll(selectors);
      const results: ElementInfo[] = [];

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);

        if (rect.width === 0 || rect.height === 0) return;
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return;

        const attrs: Record<string, string> = {};
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          attrs[attr.name] = attr.value;
        }

        results.push({
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          className: el.className || undefined,
          text: el.textContent?.trim().substring(0, 100) || undefined,
          href: (el as HTMLAnchorElement).href || undefined,
          src: (el as HTMLImageElement).src || undefined,
          value: (el as HTMLInputElement).value || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          isVisible: true,
          isEnabled: !(el as HTMLInputElement).disabled,
          isEditable: el.matches('input, textarea, [contenteditable="true"]'),
          attributes: attrs,
        });
      });

      return results;
    });
  }

  private async extractForms(page: Page): Promise<FormInfo[]> {
    return page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const results: FormInfo[] = [];

      forms.forEach((form) => {
        const fields: FormFieldInfo[] = [];

        form.querySelectorAll('input, select, textarea').forEach((field) => {
          const input = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

          let options: string[] | undefined;
          if (field.tagName === 'SELECT') {
            options = Array.from((field as HTMLSelectElement).options).map(o => o.value);
          }

          fields.push({
            name: input.name,
            type: input.type || field.tagName.toLowerCase(),
            value: input.value || undefined,
            placeholder: (input as HTMLInputElement).placeholder || undefined,
            required: input.required,
            options,
          });
        });

        results.push({
          id: form.id || undefined,
          name: form.name || undefined,
          action: form.action || undefined,
          method: form.method || 'GET',
          fields,
        });
      });

      return results;
    });
  }

  private async extractLinks(page: Page): Promise<LinkInfo[]> {
    const currentUrl = page.url();

    return page.evaluate((currentUrl) => {
      const links = document.querySelectorAll('a[href]');
      const results: LinkInfo[] = [];

      links.forEach((link) => {
        const anchor = link as HTMLAnchorElement;
        const href = anchor.href;

        if (!href || href.startsWith('javascript:')) return;

        let isExternal = false;
        try {
          const currentHost = new URL(currentUrl).hostname;
          const linkHost = new URL(href).hostname;
          isExternal = currentHost !== linkHost;
        } catch {
          // Invalid URL
        }

        results.push({
          text: anchor.textContent?.trim() || '',
          href,
          isExternal,
        });
      });

      return results;
    }, currentUrl);
  }

  private async extractImages(page: Page): Promise<ImageInfo[]> {
    return page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const results: ImageInfo[] = [];

      images.forEach((img) => {
        if (!img.src) return;

        results.push({
          src: img.src,
          alt: img.alt || undefined,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      });

      return results;
    });
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    const timeout = this.safetyConfig.sessionTimeout ?? 30 * 60 * 1000;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > timeout) {
        this.closeSession(sessionId).catch(() => {});
      }
    }
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    await this.closeAllSessions();

    for (const browser of this.browsers.values()) {
      await browser.close().catch(() => {});
    }

    this.browsers.clear();
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createBrowserAutomation(safetyConfig?: SafetyConfig): BrowserAutomationService {
  return new BrowserAutomationService(safetyConfig);
}

export default BrowserAutomationService;
