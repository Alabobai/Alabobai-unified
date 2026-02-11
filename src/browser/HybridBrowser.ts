/**
 * Alabobai Browser Automation - Hybrid Browser
 *
 * Main orchestrator combining DOM and Vision-based browser automation.
 * Provides a unified interface for reliable web automation with automatic
 * fallback between DOM selectors and visual detection.
 *
 * Features:
 * - Playwright-based browser control
 * - DOM extraction for element identification
 * - Vision-based fallback when DOM fails
 * - Action execution with retries
 * - Session management and persistence
 * - Multi-tab support
 * - Event-driven architecture
 * - Comprehensive logging
 */

import { EventEmitter } from 'events';
import {
  chromium,
  firefox,
  webkit,
  Browser,
  BrowserContext,
  Page,
  BrowserType,
  Cookie,
  Download,
  Dialog,
  ConsoleMessage,
} from 'playwright';
import { v4 as uuid } from 'uuid';

import { DOMExtractor, ExtractionResult, ExtractedElement, FormData } from './DOMExtractor.js';
import { VisionAnalyzer, PageAnalysis, VisualElement, VisionConfig } from './VisionAnalyzer.js';
import { ActionExecutor, ActionResult, Action, ActionTarget, ActionOptions, ExecutorConfig } from './ActionExecutor.js';

// ============================================================================
// TYPES
// ============================================================================

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

export interface HybridBrowserConfig {
  engine?: BrowserEngine;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
  slowMo?: number;
  proxy?: { server: string; username?: string; password?: string };
  userDataDir?: string;
  downloadsPath?: string;
  recordVideo?: { dir: string; size?: { width: number; height: number } };
  recordHar?: { path: string };
  stealth?: boolean;
  visionConfig?: VisionConfig;
  executorConfig?: ExecutorConfig;
  autoWaitForNetworkIdle?: boolean;
  screenshotOnError?: boolean;
  persistSession?: boolean;
  sessionStoragePath?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export interface BrowserState {
  isRunning: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
  tabCount: number;
  activeTabIndex: number;
  viewport: { width: number; height: number };
  cookies: Cookie[];
  sessionId: string;
}

export interface NavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  timeout?: number;
  referer?: string;
}

export interface AutomationTask {
  id: string;
  name: string;
  description?: string;
  actions: Action[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  results: ActionResult[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AutomationResult {
  task: AutomationTask;
  success: boolean;
  totalDuration: number;
  actionsExecuted: number;
  actionsSucceeded: number;
  actionsFailed: number;
  screenshot?: string;
}

export type HybridBrowserEvents = {
  'browser-launched': () => void;
  'browser-closed': () => void;
  'page-created': (url: string) => void;
  'page-closed': () => void;
  'navigation': (url: string) => void;
  'action-executed': (result: ActionResult) => void;
  'action-failed': (action: Action, error: Error) => void;
  'dom-extracted': (result: ExtractionResult) => void;
  'vision-analyzed': (result: PageAnalysis) => void;
  'task-started': (task: AutomationTask) => void;
  'task-completed': (result: AutomationResult) => void;
  'error': (error: Error) => void;
  'console': (message: string, type: string) => void;
  'dialog': (type: string, message: string) => void;
  'download': (url: string, path: string) => void;
};

// ============================================================================
// LOGGING
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private prefix: string;

  constructor(prefix: string = 'HybridBrowser') {
    this.prefix = prefix;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'debug':
        console.debug(logMessage, data || '');
        break;
      case 'info':
        console.log(logMessage, data || '');
        break;
      case 'warn':
        console.warn(logMessage, data || '');
        break;
      case 'error':
        console.error(logMessage, data || '');
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

// ============================================================================
// HYBRID BROWSER CLASS
// ============================================================================

export class HybridBrowser extends EventEmitter {
  private config: Required<HybridBrowserConfig>;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private activePage: Page | null = null;
  private activePageId: string | null = null;

  private domExtractor: DOMExtractor | null = null;
  private visionAnalyzer: VisionAnalyzer | null = null;
  private actionExecutor: ActionExecutor | null = null;

  private sessionId: string;
  private tasks: Map<string, AutomationTask> = new Map();
  private logger: Logger;

  constructor(config: HybridBrowserConfig = {}) {
    super();
    this.sessionId = uuid();
    this.logger = new Logger(`HybridBrowser:${this.sessionId.slice(0, 8)}`);

    this.config = {
      engine: config.engine ?? 'chromium',
      headless: config.headless ?? true,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      userAgent: config.userAgent ?? this.getDefaultUserAgent(),
      timeout: config.timeout ?? 30000,
      slowMo: config.slowMo ?? 0,
      proxy: config.proxy ?? { server: '' },
      userDataDir: config.userDataDir ?? '',
      downloadsPath: config.downloadsPath ?? '',
      recordVideo: config.recordVideo ?? { dir: '' },
      recordHar: config.recordHar ?? { path: '' },
      stealth: config.stealth ?? true,
      visionConfig: config.visionConfig ?? {},
      executorConfig: config.executorConfig ?? {},
      autoWaitForNetworkIdle: config.autoWaitForNetworkIdle ?? true,
      screenshotOnError: config.screenshotOnError ?? true,
      persistSession: config.persistSession ?? false,
      sessionStoragePath: config.sessionStoragePath ?? '',
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };

    this.logger.info('HybridBrowser initialized', { sessionId: this.sessionId, engine: this.config.engine });
  }

  // ============================================================================
  // BROWSER LIFECYCLE
  // ============================================================================

  /**
   * Launch the browser
   */
  async launch(): Promise<void> {
    if (this.browser) {
      this.logger.warn('Browser already running');
      return;
    }

    this.logger.info('Launching browser...', { engine: this.config.engine, headless: this.config.headless });

    const browserType = this.getBrowserType();

    const launchOptions: Parameters<BrowserType['launch']>[0] = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      args: this.getBrowserArgs(),
    };

    if (this.config.proxy?.server) {
      launchOptions.proxy = {
        server: this.config.proxy.server,
        username: this.config.proxy.username,
        password: this.config.proxy.password,
      };
    }

    this.browser = await browserType.launch(launchOptions);

    // Create browser context
    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
    };

    if (this.config.recordVideo?.dir) {
      contextOptions.recordVideo = this.config.recordVideo;
    }

    if (this.config.recordHar?.path) {
      contextOptions.recordHar = this.config.recordHar;
    }

    if (this.config.userDataDir) {
      contextOptions.storageState = this.config.userDataDir;
    }

    this.context = await this.browser.newContext(contextOptions);

    // Set up context event handlers
    this.setupContextHandlers();

    // Apply stealth if enabled
    if (this.config.stealth) {
      await this.applyStealthMode();
    }

    // Initialize vision analyzer
    this.visionAnalyzer = new VisionAnalyzer(this.config.visionConfig);

    this.logger.info('Browser launched successfully');
    this.emit('browser-launched');
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    this.logger.info('Closing browser...');

    // Save session if configured
    if (this.config.persistSession && this.config.sessionStoragePath && this.context) {
      await this.saveSession();
    }

    // Close all pages
    for (const [pageId, page] of this.pages) {
      if (!page.isClosed()) {
        await page.close();
      }
      this.pages.delete(pageId);
    }

    // Close context
    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.activePage = null;
    this.activePageId = null;
    this.domExtractor = null;
    this.actionExecutor = null;

    this.logger.info('Browser closed');
    this.emit('browser-closed');
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Get current browser state
   */
  async getState(): Promise<BrowserState> {
    return {
      isRunning: this.isRunning(),
      currentUrl: this.activePage ? this.activePage.url() : null,
      pageTitle: this.activePage ? await this.activePage.title() : null,
      tabCount: this.pages.size,
      activeTabIndex: this.activePageId ? Array.from(this.pages.keys()).indexOf(this.activePageId) : -1,
      viewport: this.config.viewport,
      cookies: this.context ? await this.context.cookies() : [],
      sessionId: this.sessionId,
    };
  }

  // ============================================================================
  // PAGE MANAGEMENT
  // ============================================================================

  /**
   * Create a new page/tab
   */
  async newPage(): Promise<string> {
    await this.ensureBrowser();

    const page = await this.context!.newPage();
    const pageId = uuid();

    this.pages.set(pageId, page);
    await this.setActivePage(pageId);

    this.setupPageHandlers(page, pageId);

    this.logger.info('New page created', { pageId });
    return pageId;
  }

  /**
   * Get the active page
   */
  getActivePage(): Page | null {
    return this.activePage;
  }

  /**
   * Set the active page
   */
  async setActivePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    this.activePage = page;
    this.activePageId = pageId;

    // Reinitialize DOM extractor and action executor for new page
    this.domExtractor = new DOMExtractor(page);
    this.actionExecutor = new ActionExecutor(
      page,
      this.domExtractor,
      this.visionAnalyzer || undefined,
      this.config.executorConfig
    );

    if (this.visionAnalyzer) {
      this.visionAnalyzer.setPage(page);
    }

    await page.bringToFront();
    this.logger.debug('Switched to page', { pageId });
  }

  /**
   * Close a page/tab
   */
  async closePage(pageId?: string): Promise<void> {
    const id = pageId || this.activePageId;
    if (!id) return;

    const page = this.pages.get(id);
    if (page && !page.isClosed()) {
      await page.close();
    }

    this.pages.delete(id);

    // Switch to another page if available
    if (id === this.activePageId) {
      const pageIds = Array.from(this.pages.keys());
      if (pageIds.length > 0) {
        await this.setActivePage(pageIds[pageIds.length - 1]);
      } else {
        this.activePage = null;
        this.activePageId = null;
        this.domExtractor = null;
        this.actionExecutor = null;
      }
    }

    this.logger.info('Page closed', { pageId: id });
    this.emit('page-closed');
  }

  /**
   * Get all page IDs
   */
  getPageIds(): string[] {
    return Array.from(this.pages.keys());
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options: NavigationOptions = {}): Promise<void> {
    await this.ensurePage();

    this.logger.info('Navigating to URL', { url });

    try {
      await this.activePage!.goto(url, {
        waitUntil: options.waitUntil || (this.config.autoWaitForNetworkIdle ? 'networkidle' : 'load'),
        timeout: options.timeout || this.config.timeout,
        referer: options.referer,
      });

      this.logger.info('Navigation completed', { url: this.activePage!.url() });
      this.emit('navigation', this.activePage!.url());
    } catch (error) {
      this.logger.error('Navigation failed', { url, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Go back in history
   */
  async goBack(): Promise<void> {
    await this.ensurePage();
    await this.activePage!.goBack({ waitUntil: 'networkidle' });
    this.emit('navigation', this.activePage!.url());
  }

  /**
   * Go forward in history
   */
  async goForward(): Promise<void> {
    await this.ensurePage();
    await this.activePage!.goForward({ waitUntil: 'networkidle' });
    this.emit('navigation', this.activePage!.url());
  }

  /**
   * Reload the page
   */
  async reload(): Promise<void> {
    await this.ensurePage();
    await this.activePage!.reload({ waitUntil: 'networkidle' });
    this.emit('navigation', this.activePage!.url());
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string | null {
    return this.activePage?.url() || null;
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string | null> {
    if (!this.activePage) return null;
    return this.activePage.title();
  }

  // ============================================================================
  // DOM EXTRACTION
  // ============================================================================

  /**
   * Extract all interactive elements from the page
   */
  async extractDOM(): Promise<ExtractionResult> {
    await this.ensurePage();

    this.logger.debug('Extracting DOM...');
    const result = await this.domExtractor!.extractAll();
    this.logger.debug('DOM extraction complete', { elements: result.elements.length });

    this.emit('dom-extracted', result);
    return result;
  }

  /**
   * Extract all forms from the page
   */
  async extractForms(): Promise<FormData[]> {
    await this.ensurePage();
    return this.domExtractor!.extractForms();
  }

  /**
   * Find element by description
   */
  async findElement(description: string): Promise<ExtractedElement | null> {
    await this.ensurePage();
    const elements = await this.domExtractor!.findByDescription(description);
    return elements.length > 0 ? elements[0] : null;
  }

  /**
   * Find elements by role
   */
  async findByRole(role: string, name?: string): Promise<ExtractedElement[]> {
    await this.ensurePage();
    return this.domExtractor!.findByRole(role, name);
  }

  // ============================================================================
  // VISION ANALYSIS
  // ============================================================================

  /**
   * Analyze the current page using vision
   */
  async analyzeWithVision(): Promise<PageAnalysis> {
    await this.ensurePage();

    if (!this.visionAnalyzer) {
      throw new Error('Vision analyzer not initialized');
    }

    this.logger.debug('Analyzing page with vision...');
    const result = await this.visionAnalyzer.analyzePage();
    this.logger.debug('Vision analysis complete', { elements: result.elements.length });

    this.emit('vision-analyzed', result);
    return result;
  }

  /**
   * Find element using vision
   */
  async findWithVision(description: string): Promise<VisualElement | null> {
    await this.ensurePage();

    if (!this.visionAnalyzer) {
      throw new Error('Vision analyzer not initialized');
    }

    return this.visionAnalyzer.findElementOnPage({ description });
  }

  /**
   * Get click coordinates using vision
   */
  async getClickCoordinates(description: string): Promise<{ x: number; y: number } | null> {
    await this.ensurePage();

    if (!this.visionAnalyzer) {
      throw new Error('Vision analyzer not initialized');
    }

    const result = await this.visionAnalyzer.getClickTargetOnPage(description);
    return result ? { x: result.x, y: result.y } : null;
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  /**
   * Execute a single action
   */
  async executeAction(action: Action): Promise<ActionResult> {
    await this.ensurePage();

    this.logger.debug('Executing action', { type: action.type, target: action.target });

    try {
      const result = await this.actionExecutor!.execute(action);
      this.emit('action-executed', result);
      return result;
    } catch (error) {
      this.emit('action-failed', action, error as Error);
      throw error;
    }
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeActions(actions: Action[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action);
        results.push(result);

        if (!result.success) {
          break;
        }
      } catch (error) {
        this.logger.error('Action execution failed', { action: action.type, error: (error as Error).message });
        throw error;
      }
    }

    return results;
  }

  // ============================================================================
  // CONVENIENCE ACTION METHODS
  // ============================================================================

  /**
   * Click on an element
   */
  async click(target: string | ActionTarget, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.click(target, options);
  }

  /**
   * Type text into an element
   */
  async type(target: string | ActionTarget, text: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.type(target, text, options);
  }

  /**
   * Fill an input field
   */
  async fill(target: string | ActionTarget, value: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.fill(target, value, options);
  }

  /**
   * Select option from dropdown
   */
  async select(target: string | ActionTarget, value: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.select(target, value, options);
  }

  /**
   * Hover over an element
   */
  async hover(target: string | ActionTarget, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.hover(target, options);
  }

  /**
   * Scroll the page
   */
  async scroll(deltaX: number, deltaY: number): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.scroll(deltaX, deltaY);
  }

  /**
   * Scroll to an element
   */
  async scrollTo(target: string | ActionTarget): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.scrollTo(target);
  }

  /**
   * Press a keyboard key
   */
  async pressKey(key: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.pressKey(key, options);
  }

  /**
   * Wait for a duration
   */
  async wait(ms: number): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.wait(ms);
  }

  /**
   * Wait for a selector
   */
  async waitForSelector(selector: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();
    return this.actionExecutor!.waitForSelector(selector, options);
  }

  // ============================================================================
  // SCREENSHOTS
  // ============================================================================

  /**
   * Take a screenshot
   */
  async screenshot(fullPage: boolean = false): Promise<string> {
    await this.ensurePage();

    const buffer = await this.activePage!.screenshot({ type: 'png', fullPage });
    return buffer.toString('base64');
  }

  /**
   * Take a screenshot of a specific element
   */
  async screenshotElement(selector: string): Promise<string> {
    await this.ensurePage();

    const element = await this.activePage!.locator(selector);
    const buffer = await element.screenshot({ type: 'png' });
    return buffer.toString('base64');
  }

  // ============================================================================
  // TASK AUTOMATION
  // ============================================================================

  /**
   * Create and run an automation task
   */
  async runTask(name: string, actions: Action[], description?: string): Promise<AutomationResult> {
    await this.ensurePage();

    const task: AutomationTask = {
      id: uuid(),
      name,
      description,
      actions,
      status: 'pending',
      results: [],
    };

    this.tasks.set(task.id, task);
    this.logger.info('Starting task', { taskId: task.id, name, actionsCount: actions.length });

    task.status = 'running';
    task.startedAt = new Date();
    this.emit('task-started', task);

    const startTime = Date.now();
    let actionsSucceeded = 0;
    let actionsFailed = 0;

    try {
      for (const action of actions) {
        // Check if task was cancelled externally (via cancelTask method)
        if ((task.status as AutomationTask['status']) === 'cancelled') {
          break;
        }

        try {
          const result = await this.executeAction(action);
          task.results.push(result);

          if (result.success) {
            actionsSucceeded++;
          } else {
            actionsFailed++;
            break;
          }
        } catch (error) {
          actionsFailed++;
          task.error = (error as Error).message;
          break;
        }
      }

      task.status = actionsFailed > 0 ? 'failed' : 'completed';
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
    }

    task.completedAt = new Date();

    let screenshot: string | undefined;
    if (this.config.screenshotOnError && task.status === 'failed') {
      screenshot = await this.screenshot();
    }

    const result: AutomationResult = {
      task,
      success: task.status === 'completed',
      totalDuration: Date.now() - startTime,
      actionsExecuted: actionsSucceeded + actionsFailed,
      actionsSucceeded,
      actionsFailed,
      screenshot,
    };

    this.logger.info('Task completed', {
      taskId: task.id,
      success: result.success,
      duration: result.totalDuration,
    });

    this.emit('task-completed', result);
    return result;
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.status = 'cancelled';
      this.logger.info('Task cancelled', { taskId });
    }
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AutomationTask | undefined {
    return this.tasks.get(taskId);
  }

  // ============================================================================
  // SMART ACTIONS (with DOM + Vision fallback)
  // ============================================================================

  /**
   * Smart click - tries DOM first, falls back to vision
   */
  async smartClick(description: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();

    this.logger.debug('Smart click', { description });

    // Try to find element by description in DOM
    const elements = await this.domExtractor!.findByDescription(description);

    if (elements.length > 0) {
      this.logger.debug('Found element in DOM', { selector: elements[0].selector });
      return this.click({ element: elements[0] }, options);
    }

    // Fall back to vision
    if (this.visionAnalyzer) {
      this.logger.debug('Falling back to vision');
      const coords = await this.visionAnalyzer.getClickTargetOnPage(description);

      if (coords) {
        this.logger.debug('Found element with vision', { coords });
        return this.click({ coordinates: { x: coords.x, y: coords.y } }, options);
      }
    }

    throw new Error(`Could not find element: ${description}`);
  }

  /**
   * Smart type - finds input and types text
   */
  async smartType(fieldDescription: string, text: string, options?: ActionOptions): Promise<ActionResult> {
    await this.ensurePage();

    this.logger.debug('Smart type', { fieldDescription, textLength: text.length });

    // Try to find input by description in DOM
    const elements = await this.domExtractor!.findByDescription(fieldDescription);
    const inputElement = elements.find(e => ['input', 'textarea'].includes(e.type));

    if (inputElement) {
      return this.type({ element: inputElement }, text, options);
    }

    // Fall back to vision
    if (this.visionAnalyzer) {
      const coords = await this.visionAnalyzer.getClickTargetOnPage(fieldDescription);

      if (coords) {
        // Click first, then type
        await this.activePage!.mouse.click(coords.x, coords.y);
        await this.activePage!.keyboard.type(text);
        return {
          id: uuid(),
          action: { id: uuid(), type: 'type', value: text },
          success: true,
          duration: 0,
          timestamp: new Date(),
          retryCount: 0,
          fallbackUsed: true,
          coordinates: coords,
        };
      }
    }

    throw new Error(`Could not find input: ${fieldDescription}`);
  }

  /**
   * Smart fill form
   */
  async smartFillForm(
    formData: Record<string, string>,
    submitAfter: boolean = false
  ): Promise<ActionResult[]> {
    await this.ensurePage();

    const results: ActionResult[] = [];

    for (const [fieldName, value] of Object.entries(formData)) {
      const result = await this.smartType(fieldName, value);
      results.push(result);
    }

    if (submitAfter) {
      const submitResult = await this.smartClick('Submit');
      results.push(submitResult);
    }

    return results;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Save session (cookies, localStorage)
   */
  async saveSession(): Promise<void> {
    if (!this.context || !this.config.sessionStoragePath) return;

    await this.context.storageState({ path: this.config.sessionStoragePath });
    this.logger.info('Session saved', { path: this.config.sessionStoragePath });
  }

  /**
   * Load session
   */
  async loadSession(path: string): Promise<void> {
    if (!this.context) {
      throw new Error('Browser not launched');
    }

    // Need to recreate context with storage state
    await this.context.close();
    this.context = await this.browser!.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      storageState: path,
    });

    this.setupContextHandlers();
    this.logger.info('Session loaded', { path });
  }

  /**
   * Get cookies
   */
  async getCookies(): Promise<Cookie[]> {
    if (!this.context) return [];
    return this.context.cookies();
  }

  /**
   * Set cookies
   */
  async setCookies(cookies: Cookie[]): Promise<void> {
    if (!this.context) {
      throw new Error('Browser not launched');
    }
    await this.context.addCookies(cookies);
  }

  /**
   * Clear cookies
   */
  async clearCookies(): Promise<void> {
    if (!this.context) return;
    await this.context.clearCookies();
  }

  // ============================================================================
  // HIGHLIGHTING
  // ============================================================================

  /**
   * Highlight an element
   */
  async highlightElement(
    target: string | ExtractedElement,
    color: string = 'red',
    duration: number = 2000
  ): Promise<void> {
    await this.ensurePage();

    const selector = typeof target === 'string' ? target : target.selector;
    await this.domExtractor!.highlightElement(
      typeof target === 'string'
        ? { id: '', selector, tagName: '', type: 'unknown', label: '', bounds: { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 }, xpath: '', isVisible: true, isInteractable: true, isDisabled: false, isFocusable: true, attributes: {}, confidence: 1 }
        : target,
      color,
      duration
    );
  }

  /**
   * Add labels to all interactive elements
   */
  async addElementLabels(): Promise<() => Promise<void>> {
    await this.ensurePage();
    return this.domExtractor!.addElementLabels();
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private getBrowserType(): BrowserType {
    switch (this.config.engine) {
      case 'firefox':
        return firefox;
      case 'webkit':
        return webkit;
      default:
        return chromium;
    }
  }

  private getBrowserArgs(): string[] {
    const args: string[] = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--window-size=${this.config.viewport.width},${this.config.viewport.height}`,
    ];

    if (this.config.headless) {
      args.push('--disable-gpu');
    }

    return args;
  }

  private getDefaultUserAgent(): string {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  }

  private async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch();
    }
  }

  private async ensurePage(): Promise<void> {
    await this.ensureBrowser();

    if (!this.activePage || this.activePage.isClosed()) {
      await this.newPage();
    }
  }

  private setupContextHandlers(): void {
    if (!this.context) return;

    this.context.on('page', async (page: Page) => {
      const pageId = uuid();
      this.pages.set(pageId, page);
      this.setupPageHandlers(page, pageId);
      this.emit('page-created', page.url());
    });
  }

  private setupPageHandlers(page: Page, pageId: string): void {
    page.on('console', (msg: ConsoleMessage) => {
      this.emit('console', msg.text(), msg.type());
    });

    page.on('dialog', async (dialog: Dialog) => {
      this.emit('dialog', dialog.type(), dialog.message());
      await dialog.dismiss();
    });

    page.on('download', async (download: Download) => {
      const path = await download.path();
      this.emit('download', download.url(), path || '');
    });

    page.on('close', () => {
      this.pages.delete(pageId);
      if (this.activePageId === pageId) {
        this.activePage = null;
        this.activePageId = null;
      }
    });

    page.on('pageerror', (error: Error) => {
      this.logger.error('Page error', { pageId, error: error.message });
      this.emit('error', error);
    });
  }

  private async applyStealthMode(): Promise<void> {
    if (!this.context) return;

    await this.context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Override navigator.plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Add chrome object
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {},
      };
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createHybridBrowser(config?: HybridBrowserConfig): HybridBrowser {
  return new HybridBrowser(config);
}

export default HybridBrowser;
