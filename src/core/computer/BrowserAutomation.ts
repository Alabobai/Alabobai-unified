/**
 * Alabobai Computer Control - Browser Automation Module
 * Production-ready web browser automation with Puppeteer
 *
 * Features:
 * - Full Puppeteer integration
 * - Page navigation and interaction
 * - Element detection and clicking
 * - Form filling
 * - Screenshot capture
 * - Cookie and session management
 * - Network request interception
 * - Multi-tab support
 * - Stealth mode for anti-detection
 */

import { EventEmitter } from 'events';
import puppeteer, {
  Browser,
  Page,
  ElementHandle,
  HTTPRequest,
  HTTPResponse,
  Viewport,
  WaitForOptions,
  ScreenshotOptions,
  Cookie,
  Target,
  CDPSession,
} from 'puppeteer';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserAction {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'wait' | 'evaluate' | 'select' | 'hover';
  timestamp: Date;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  script?: string;
  result?: unknown;
  duration?: number;
  error?: string;
}

export interface ElementInfo {
  selector: string;
  tagName: string;
  text?: string;
  href?: string;
  src?: string;
  type?: string;
  name?: string;
  id?: string;
  className?: string;
  bounds: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isClickable: boolean;
  attributes: Record<string, string>;
}

export interface PageInfo {
  url: string;
  title: string;
  viewport: Viewport;
  cookies: Cookie[];
  localStorage?: Record<string, string>;
}

export interface BrowserAutomationConfig {
  headless?: boolean;
  defaultViewport?: Viewport;
  userAgent?: string;
  timeout?: number;
  slowMo?: number;
  stealth?: boolean;
  proxy?: string;
  userDataDir?: string;
  executablePath?: string;
  args?: string[];
}

export interface NavigationOptions extends WaitForOptions {
  waitForSelector?: string;
  waitForNetworkIdle?: boolean;
}

export type BrowserEvents = {
  'browser-launched': (browser: Browser) => void;
  'browser-closed': () => void;
  'page-created': (page: Page) => void;
  'page-navigated': (url: string) => void;
  'action': (action: BrowserAction) => void;
  'request': (request: HTTPRequest) => void;
  'response': (response: HTTPResponse) => void;
  'console': (message: string) => void;
  'error': (error: Error) => void;
  'dialog': (type: string, message: string) => void;
};

// ============================================================================
// BROWSER AUTOMATION CLASS
// ============================================================================

export class BrowserAutomation extends EventEmitter {
  private config: Required<BrowserAutomationConfig>;
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private activePage: Page | null = null;
  private actionHistory: BrowserAction[] = [];
  private maxHistorySize: number = 1000;
  private cdpSession: CDPSession | null = null;

  constructor(config: BrowserAutomationConfig = {}) {
    super();
    this.config = {
      headless: config.headless ?? true,
      defaultViewport: config.defaultViewport ?? { width: 1920, height: 1080 },
      userAgent: config.userAgent ?? this.getDefaultUserAgent(),
      timeout: config.timeout ?? 30000,
      slowMo: config.slowMo ?? 0,
      stealth: config.stealth ?? true,
      proxy: config.proxy ?? '',
      userDataDir: config.userDataDir ?? '',
      executablePath: config.executablePath ?? '',
      args: config.args ?? [],
    };
  }

  // ============================================================================
  // BROWSER LIFECYCLE
  // ============================================================================

  /**
   * Launch the browser
   */
  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      ...this.config.args,
    ];

    if (this.config.proxy) {
      args.push(`--proxy-server=${this.config.proxy}`);
    }

    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: this.config.headless,
      defaultViewport: this.config.defaultViewport,
      slowMo: this.config.slowMo,
      args,
    };

    if (this.config.executablePath) {
      launchOptions.executablePath = this.config.executablePath;
    }

    if (this.config.userDataDir) {
      launchOptions.userDataDir = this.config.userDataDir;
    }

    this.browser = await puppeteer.launch(launchOptions);

    // Apply stealth modifications if enabled
    if (this.config.stealth) {
      await this.applyStealthMode();
    }

    // Set up browser event listeners
    this.browser.on('targetcreated', async (target: Target) => {
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) {
          await this.setupPage(page);
        }
      }
    });

    this.browser.on('disconnected', () => {
      this.emit('browser-closed');
      this.browser = null;
      this.pages.clear();
      this.activePage = null;
    });

    this.emit('browser-launched', this.browser);
    return this.browser;
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
      this.activePage = null;
    }
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null && this.browser.connected;
  }

  // ============================================================================
  // PAGE MANAGEMENT
  // ============================================================================

  /**
   * Create a new page
   */
  async newPage(): Promise<Page> {
    await this.ensureBrowser();

    const page = await this.browser!.newPage();
    await this.setupPage(page);

    const pageId = uuid();
    this.pages.set(pageId, page);
    this.activePage = page;

    this.emit('page-created', page);
    return page;
  }

  /**
   * Get the active page or create one
   */
  async getPage(): Promise<Page> {
    if (this.activePage && !this.activePage.isClosed()) {
      return this.activePage;
    }

    return this.newPage();
  }

  /**
   * Get all open pages
   */
  async getAllPages(): Promise<Page[]> {
    await this.ensureBrowser();
    return this.browser!.pages();
  }

  /**
   * Switch to a specific page
   */
  async switchToPage(pageOrIndex: Page | number): Promise<Page> {
    await this.ensureBrowser();

    if (typeof pageOrIndex === 'number') {
      const pages = await this.browser!.pages();
      if (pageOrIndex < 0 || pageOrIndex >= pages.length) {
        throw new Error(`Page index ${pageOrIndex} out of bounds`);
      }
      this.activePage = pages[pageOrIndex];
    } else {
      this.activePage = pageOrIndex;
    }

    await this.activePage.bringToFront();
    return this.activePage;
  }

  /**
   * Close a page
   */
  async closePage(page?: Page): Promise<void> {
    const targetPage = page || this.activePage;
    if (targetPage && !targetPage.isClosed()) {
      await targetPage.close();

      // Remove from pages map
      for (const [id, p] of this.pages.entries()) {
        if (p === targetPage) {
          this.pages.delete(id);
          break;
        }
      }

      // Update active page
      if (this.activePage === targetPage) {
        const pages = await this.browser!.pages();
        this.activePage = pages.length > 0 ? pages[pages.length - 1] : null;
      }
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options: NavigationOptions = {}): Promise<HTTPResponse | null> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'navigate',
      timestamp: new Date(),
      url,
    };

    try {
      const response = await page.goto(url, {
        waitUntil: options.waitUntil ?? 'networkidle2',
        timeout: options.timeout ?? this.config.timeout,
      });

      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: this.config.timeout });
      }

      if (options.waitForNetworkIdle) {
        await page.waitForNetworkIdle({ timeout: this.config.timeout });
      }

      action.duration = Date.now() - startTime;
      this.recordAction(action);
      this.emit('page-navigated', url);

      return response;
    } catch (error) {
      action.error = (error as Error).message;
      action.duration = Date.now() - startTime;
      this.recordAction(action);
      throw error;
    }
  }

  /**
   * Go back in history
   */
  async goBack(): Promise<HTTPResponse | null> {
    const page = await this.getPage();
    return page.goBack({ waitUntil: 'networkidle2' });
  }

  /**
   * Go forward in history
   */
  async goForward(): Promise<HTTPResponse | null> {
    const page = await this.getPage();
    return page.goForward({ waitUntil: 'networkidle2' });
  }

  /**
   * Reload the page
   */
  async reload(): Promise<HTTPResponse | null> {
    const page = await this.getPage();
    return page.reload({ waitUntil: 'networkidle2' });
  }

  /**
   * Get current URL
   */
  async getCurrentUrl(): Promise<string> {
    const page = await this.getPage();
    return page.url();
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    const page = await this.getPage();
    return page.title();
  }

  // ============================================================================
  // ELEMENT INTERACTION
  // ============================================================================

  /**
   * Click on an element
   */
  async click(selector: string, options: { delay?: number; button?: 'left' | 'right' | 'middle' } = {}): Promise<void> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'click',
      timestamp: new Date(),
      selector,
    };

    try {
      await page.waitForSelector(selector, { visible: true, timeout: this.config.timeout });
      await page.click(selector, {
        delay: options.delay ?? 50,
        button: options.button ?? 'left',
      });

      action.duration = Date.now() - startTime;
      this.recordAction(action);
      this.emit('action', action);
    } catch (error) {
      action.error = (error as Error).message;
      action.duration = Date.now() - startTime;
      this.recordAction(action);
      throw error;
    }
  }

  /**
   * Double-click on an element
   */
  async doubleClick(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { visible: true, timeout: this.config.timeout });
    await page.click(selector, { clickCount: 2 });
  }

  /**
   * Right-click on an element
   */
  async rightClick(selector: string): Promise<void> {
    await this.click(selector, { button: 'right' });
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<void> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'hover',
      timestamp: new Date(),
      selector,
    };

    try {
      await page.waitForSelector(selector, { visible: true, timeout: this.config.timeout });
      await page.hover(selector);

      action.duration = Date.now() - startTime;
      this.recordAction(action);
      this.emit('action', action);
    } catch (error) {
      action.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, options: { delay?: number; clear?: boolean } = {}): Promise<void> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'type',
      timestamp: new Date(),
      selector,
      text,
    };

    try {
      await page.waitForSelector(selector, { visible: true, timeout: this.config.timeout });

      if (options.clear) {
        await page.click(selector, { clickCount: 3 }); // Select all
        await page.keyboard.press('Backspace');
      }

      await page.type(selector, text, { delay: options.delay ?? 20 });

      action.duration = Date.now() - startTime;
      this.recordAction(action);
      this.emit('action', action);
    } catch (error) {
      action.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Fill an input field (faster than type, but doesn't trigger key events)
   */
  async fill(selector: string, value: string): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { visible: true, timeout: this.config.timeout });

    await page.$eval(selector, (el: Element, val: string) => {
      (el as HTMLInputElement).value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  /**
   * Select an option from a dropdown
   */
  async select(selector: string, value: string): Promise<void> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'select',
      timestamp: new Date(),
      selector,
      value,
    };

    try {
      await page.waitForSelector(selector, { visible: true, timeout: this.config.timeout });
      await page.select(selector, value);

      action.duration = Date.now() - startTime;
      this.recordAction(action);
      this.emit('action', action);
    } catch (error) {
      action.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Check a checkbox or radio button
   */
  async check(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: this.config.timeout });

    const isChecked = await page.$eval(selector, (el: Element) => (el as HTMLInputElement).checked);
    if (!isChecked) {
      await page.click(selector);
    }
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: this.config.timeout });

    const isChecked = await page.$eval(selector, (el: Element) => (el as HTMLInputElement).checked);
    if (isChecked) {
      await page.click(selector);
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(selector: string, filePath: string): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: this.config.timeout });

    const input = await page.$(selector);
    if (input) {
      await (input as ElementHandle<HTMLInputElement>).uploadFile(filePath);
    }
  }

  // ============================================================================
  // SCROLLING
  // ============================================================================

  /**
   * Scroll the page
   */
  async scroll(deltaX: number, deltaY: number): Promise<void> {
    const page = await this.getPage();
    await page.evaluate((dx: number, dy: number) => {
      window.scrollBy(dx, dy);
    }, deltaX, deltaY);

    const action: BrowserAction = {
      id: uuid(),
      type: 'scroll',
      timestamp: new Date(),
      value: `${deltaX},${deltaY}`,
    };
    this.recordAction(action);
  }

  /**
   * Scroll to element
   */
  async scrollToElement(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: this.config.timeout });
    await page.$eval(selector, (el: Element) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /**
   * Scroll to top of page
   */
  async scrollToTop(): Promise<void> {
    const page = await this.getPage();
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  /**
   * Scroll to bottom of page
   */
  async scrollToBottom(): Promise<void> {
    const page = await this.getPage();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }

  // ============================================================================
  // WAITING
  // ============================================================================

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(selector: string, options: { visible?: boolean; timeout?: number } = {}): Promise<ElementHandle | null> {
    const page = await this.getPage();
    return page.waitForSelector(selector, {
      visible: options.visible ?? true,
      timeout: options.timeout ?? this.config.timeout,
    });
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(options: WaitForOptions = {}): Promise<HTTPResponse | null> {
    const page = await this.getPage();
    return page.waitForNavigation({
      waitUntil: options.waitUntil ?? 'networkidle2',
      timeout: options.timeout ?? this.config.timeout,
    });
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(timeout?: number): Promise<void> {
    const page = await this.getPage();
    await page.waitForNetworkIdle({ timeout: timeout ?? this.config.timeout });
  }

  /**
   * Wait for a specific amount of time
   */
  async wait(ms: number): Promise<void> {
    const action: BrowserAction = {
      id: uuid(),
      type: 'wait',
      timestamp: new Date(),
      value: ms.toString(),
    };

    await new Promise(resolve => setTimeout(resolve, ms));

    action.duration = ms;
    this.recordAction(action);
  }

  /**
   * Wait for a function to return true
   */
  async waitForFunction(fn: () => boolean | Promise<boolean>, timeout?: number): Promise<void> {
    const page = await this.getPage();
    await page.waitForFunction(fn, { timeout: timeout ?? this.config.timeout });
  }

  // ============================================================================
  // SCREENSHOTS & CONTENT
  // ============================================================================

  /**
   * Take a screenshot
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'screenshot',
      timestamp: new Date(),
    };

    try {
      const buffer = await page.screenshot({
        type: 'png',
        fullPage: options.fullPage ?? false,
        ...options,
      });

      const base64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : buffer;

      action.duration = Date.now() - startTime;
      this.recordAction(action);

      return base64;
    } catch (error) {
      action.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Get page HTML content
   */
  async getContent(): Promise<string> {
    const page = await this.getPage();
    return page.content();
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: this.config.timeout });
    return page.$eval(selector, (el: Element) => el.textContent?.trim() || '');
  }

  /**
   * Get attribute of an element
   */
  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: this.config.timeout });
    return page.$eval(selector, (el: Element, attr: string) => el.getAttribute(attr), attribute);
  }

  /**
   * Get element info
   */
  async getElementInfo(selector: string): Promise<ElementInfo | null> {
    const page = await this.getPage();

    try {
      await page.waitForSelector(selector, { timeout: 5000 });

      return page.$eval(selector, (el: Element) => {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        const attributes: Record<string, string> = {};
        for (const attr of el.attributes) {
          attributes[attr.name] = attr.value;
        }

        return {
          selector: '',
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim(),
          href: (el as HTMLAnchorElement).href,
          src: (el as HTMLImageElement).src,
          type: (el as HTMLInputElement).type,
          name: (el as HTMLInputElement).name,
          id: el.id,
          className: el.className,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          isVisible: computed.visibility !== 'hidden' && computed.display !== 'none',
          isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || (el as HTMLElement).onclick !== null,
          attributes,
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Find all elements matching selector
   */
  async findElements(selector: string): Promise<ElementInfo[]> {
    const page = await this.getPage();

    return page.$$eval(selector, (elements: Element[]) => {
      return elements.map((el: Element) => {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        const attributes: Record<string, string> = {};
        for (const attr of el.attributes) {
          attributes[attr.name] = attr.value;
        }

        return {
          selector: '',
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim(),
          href: (el as HTMLAnchorElement).href,
          src: (el as HTMLImageElement).src,
          type: (el as HTMLInputElement).type,
          name: (el as HTMLInputElement).name,
          id: el.id,
          className: el.className,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          isVisible: computed.visibility !== 'hidden' && computed.display !== 'none',
          isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || (el as HTMLElement).onclick !== null,
          attributes,
        };
      });
    });
  }

  // ============================================================================
  // JAVASCRIPT EVALUATION
  // ============================================================================

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<T>(fn: () => T): Promise<T>;
  async evaluate<T, Arg>(fn: (arg: Arg) => T, arg: Arg): Promise<T>;
  async evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
    const startTime = Date.now();
    const page = await this.getPage();

    const action: BrowserAction = {
      id: uuid(),
      type: 'evaluate',
      timestamp: new Date(),
      script: fn.toString().substring(0, 200),
    };

    try {
      const result = await page.evaluate(fn, ...args);

      action.result = result;
      action.duration = Date.now() - startTime;
      this.recordAction(action);
      this.emit('action', action);

      return result;
    } catch (error) {
      action.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Inject a script into the page
   */
  async injectScript(script: string): Promise<void> {
    const page = await this.getPage();
    await page.addScriptTag({ content: script });
  }

  /**
   * Inject CSS into the page
   */
  async injectCSS(css: string): Promise<void> {
    const page = await this.getPage();
    await page.addStyleTag({ content: css });
  }

  // ============================================================================
  // COOKIES & STORAGE
  // ============================================================================

  /**
   * Get all cookies
   */
  async getCookies(): Promise<Cookie[]> {
    const page = await this.getPage();
    return page.cookies();
  }

  /**
   * Set cookies
   */
  async setCookies(cookies: Cookie[]): Promise<void> {
    const page = await this.getPage();
    await page.setCookie(...cookies);
  }

  /**
   * Clear cookies
   */
  async clearCookies(): Promise<void> {
    const page = await this.getPage();
    const client = await page.createCDPSession();
    await client.send('Network.clearBrowserCookies');
  }

  /**
   * Get localStorage
   */
  async getLocalStorage(): Promise<Record<string, string>> {
    const page = await this.getPage();
    return page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          items[key] = localStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  /**
   * Set localStorage item
   */
  async setLocalStorage(key: string, value: string): Promise<void> {
    const page = await this.getPage();
    await page.evaluate((k: string, v: string) => {
      localStorage.setItem(k, v);
    }, key, value);
  }

  /**
   * Clear localStorage
   */
  async clearLocalStorage(): Promise<void> {
    const page = await this.getPage();
    await page.evaluate(() => localStorage.clear());
  }

  // ============================================================================
  // KEYBOARD & MOUSE (Low-level)
  // ============================================================================

  /**
   * Press a key
   */
  async pressKey(key: string): Promise<void> {
    const page = await this.getPage();
    await page.keyboard.press(key as Parameters<typeof page.keyboard.press>[0]);
  }

  /**
   * Type with keyboard
   */
  async keyboardType(text: string, delay?: number): Promise<void> {
    const page = await this.getPage();
    await page.keyboard.type(text, { delay });
  }

  /**
   * Move mouse to position
   */
  async mouseMove(x: number, y: number): Promise<void> {
    const page = await this.getPage();
    await page.mouse.move(x, y);
  }

  /**
   * Click at position
   */
  async mouseClick(x: number, y: number, button?: 'left' | 'right' | 'middle'): Promise<void> {
    const page = await this.getPage();
    await page.mouse.click(x, y, { button });
  }

  // ============================================================================
  // DIALOGS
  // ============================================================================

  /**
   * Set up dialog handler
   */
  async handleDialogs(action: 'accept' | 'dismiss' | ((message: string) => Promise<boolean>)): Promise<void> {
    const page = await this.getPage();

    page.on('dialog', async (dialog) => {
      this.emit('dialog', dialog.type(), dialog.message());

      if (typeof action === 'function') {
        const shouldAccept = await action(dialog.message());
        if (shouldAccept) {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
      } else if (action === 'accept') {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

  // ============================================================================
  // PAGE INFO
  // ============================================================================

  /**
   * Get current page info
   */
  async getPageInfo(): Promise<PageInfo> {
    const page = await this.getPage();
    const [url, title, cookies, viewport] = await Promise.all([
      page.url(),
      page.title(),
      page.cookies(),
      Promise.resolve(page.viewport()),
    ]);

    const localStorage = await this.getLocalStorage();

    return {
      url,
      title,
      viewport: viewport || { width: 1920, height: 1080 },
      cookies,
      localStorage,
    };
  }

  /**
   * Get action history
   */
  getHistory(): BrowserAction[] {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory = [];
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.connected) {
      await this.launch();
    }
  }

  private async setupPage(page: Page): Promise<void> {
    // Set user agent
    await page.setUserAgent(this.config.userAgent);

    // Set viewport
    if (this.config.defaultViewport) {
      await page.setViewport(this.config.defaultViewport);
    }

    // Set up event listeners
    page.on('console', (msg) => {
      this.emit('console', msg.text());
    });

    page.on('pageerror', (error) => {
      this.emit('error', error);
    });

    page.on('request', (request) => {
      this.emit('request', request);
    });

    page.on('response', (response) => {
      this.emit('response', response);
    });
  }

  private async applyStealthMode(): Promise<void> {
    if (!this.browser) return;

    const pages = await this.browser.pages();
    for (const page of pages) {
      await this.applyStealthToPage(page);
    }
  }

  private async applyStealthToPage(page: Page): Promise<void> {
    // Override navigator.webdriver
    await page.evaluateOnNewDocument(() => {
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

      // Override chrome runtime
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {},
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);
    });
  }

  private getDefaultUserAgent(): string {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  private recordAction(action: BrowserAction): void {
    this.actionHistory.push(action);
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.shift();
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.close();
    this.removeAllListeners();
    this.actionHistory = [];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBrowserAutomation(config?: BrowserAutomationConfig): BrowserAutomation {
  return new BrowserAutomation(config);
}

export default BrowserAutomation;
