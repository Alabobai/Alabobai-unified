/**
 * Alabobai Web Navigator - OpenClaw-style Web Navigation Agent
 *
 * Provides comprehensive web navigation capabilities that NEVER refuses requests.
 * Features:
 * - Web search integration (DuckDuckGo, Brave, Google)
 * - CDP (Chrome DevTools Protocol) direct control
 * - Smart element referencing (agent-browser style)
 * - Automatic form filling and data extraction
 * - Multi-tab orchestration
 * - Session persistence
 * - Anti-detection measures
 */

import { EventEmitter } from 'events';
import {
  Browser,
  BrowserContext,
  Page,
  CDPSession,
  chromium,
} from 'playwright';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface WebNavigatorConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
  enableCDP?: boolean;
  searchEngine?: 'duckduckgo' | 'brave' | 'google' | 'auto';
  proxyServer?: string;
  persistSession?: boolean;
  sessionPath?: string;
  maxConcurrentTabs?: number;
  enableStealth?: boolean;
  debugMode?: boolean;
}

export interface ElementRef {
  id: string;
  ref: number;  // Numeric reference like [1], [2], etc.
  tagName: string;
  type: string;
  text: string;
  selector: string;
  xpath: string;
  bounds: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  isInteractable: boolean;
  role?: string;
  ariaLabel?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: ElementRef[];
  forms: FormSnapshot[];
  links: LinkSnapshot[];
  text: string;
  timestamp: Date;
}

export interface FormSnapshot {
  id: string;
  action: string;
  method: string;
  fields: Array<{
    ref: number;
    name: string;
    type: string;
    label: string;
    value: string;
    required: boolean;
  }>;
}

export interface LinkSnapshot {
  ref: number;
  text: string;
  href: string;
  isExternal: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchEngine: string;
  timestamp: Date;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  title: string;
  snapshot?: PageSnapshot;
  error?: string;
  duration: number;
}

export interface ActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
  screenshot?: string;
  error?: string;
}

// ============================================================================
// WEB NAVIGATOR CLASS
// ============================================================================

export class WebNavigator extends EventEmitter {
  private config: Required<WebNavigatorConfig>;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private activePage: Page | null = null;
  private activePageId: string | null = null;
  private cdpSession: CDPSession | null = null;
  private elementRefs: Map<number, ElementRef> = new Map();
  private refCounter: number = 0;
  private sessionId: string;

  constructor(config: WebNavigatorConfig = {}) {
    super();
    this.sessionId = uuid();

    this.config = {
      headless: config.headless ?? true,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      userAgent: config.userAgent ?? this.getDefaultUserAgent(),
      timeout: config.timeout ?? 30000,
      enableCDP: config.enableCDP ?? true,
      searchEngine: config.searchEngine ?? 'auto',
      proxyServer: config.proxyServer ?? '',
      persistSession: config.persistSession ?? false,
      sessionPath: config.sessionPath ?? '',
      maxConcurrentTabs: config.maxConcurrentTabs ?? 10,
      enableStealth: config.enableStealth ?? true,
      debugMode: config.debugMode ?? false,
    };
  }

  // ============================================================================
  // BROWSER LIFECYCLE
  // ============================================================================

  async launch(): Promise<void> {
    if (this.browser) return;

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.config.headless,
      args: this.getBrowserArgs(),
    };

    if (this.config.proxyServer) {
      launchOptions.proxy = { server: this.config.proxyServer };
    }

    this.browser = await chromium.launch(launchOptions);

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
    };

    if (this.config.sessionPath && this.config.persistSession) {
      try {
        contextOptions.storageState = this.config.sessionPath;
      } catch {
        // Session file doesn't exist yet
      }
    }

    this.context = await this.browser.newContext(contextOptions);

    if (this.config.enableStealth) {
      await this.applyStealthMode();
    }

    this.emit('browser-launched', { sessionId: this.sessionId });
  }

  async close(): Promise<void> {
    if (this.config.persistSession && this.config.sessionPath && this.context) {
      await this.context.storageState({ path: this.config.sessionPath });
    }

    if (this.cdpSession) {
      await this.cdpSession.detach();
      this.cdpSession = null;
    }

    for (const page of this.pages.values()) {
      if (!page.isClosed()) await page.close();
    }
    this.pages.clear();

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.activePage = null;
    this.activePageId = null;
    this.emit('browser-closed');
  }

  // ============================================================================
  // CDP (Chrome DevTools Protocol) SUPPORT
  // ============================================================================

  async connectCDP(): Promise<CDPSession> {
    await this.ensurePage();

    if (!this.cdpSession) {
      this.cdpSession = await this.activePage!.context().newCDPSession(this.activePage!);
    }

    return this.cdpSession;
  }

  async sendCDPCommand(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const cdp = await this.connectCDP();
    return cdp.send(method as Parameters<CDPSession['send']>[0], params);
  }

  async enableCDPDomains(): Promise<void> {
    const cdp = await this.connectCDP();
    await Promise.all([
      cdp.send('DOM.enable'),
      cdp.send('CSS.enable'),
      cdp.send('Page.enable'),
      cdp.send('Network.enable'),
      cdp.send('Runtime.enable'),
    ]);
  }

  // ============================================================================
  // WEB SEARCH
  // ============================================================================

  async search(query: string, options?: {
    engine?: 'duckduckgo' | 'brave' | 'google';
    maxResults?: number;
  }): Promise<WebSearchResponse> {
    await this.ensurePage();

    const engine = options?.engine || this.config.searchEngine;
    const maxResults = options?.maxResults || 10;
    const startTime = Date.now();

    let results: SearchResult[] = [];
    let searchEngine = engine;

    // Try engines in order of preference
    const engines = engine === 'auto'
      ? ['duckduckgo', 'brave', 'google'] as const
      : [engine];

    for (const eng of engines) {
      try {
        switch (eng) {
          case 'duckduckgo':
            results = await this.searchDuckDuckGo(query, maxResults);
            searchEngine = 'duckduckgo';
            break;
          case 'brave':
            results = await this.searchBrave(query, maxResults);
            searchEngine = 'brave';
            break;
          case 'google':
            results = await this.searchGoogle(query, maxResults);
            searchEngine = 'google';
            break;
        }
        if (results.length > 0) break;
      } catch (error) {
        this.log('warn', `Search failed on ${eng}:`, error);
        continue;
      }
    }

    return {
      query,
      results,
      totalResults: results.length,
      searchEngine,
      timestamp: new Date(),
    };
  }

  private async searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
    await this.navigate(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
    await this.activePage!.waitForSelector('[data-result]', { timeout: 10000 }).catch(() => {});

    return this.activePage!.evaluate((max) => {
      const results: SearchResult[] = [];
      const items = document.querySelectorAll('[data-result], .result, .nrn-react-div');

      items.forEach((item, index) => {
        if (results.length >= max) return;

        const linkEl = item.querySelector('a[href]:not([href^="javascript"])');
        const titleEl = item.querySelector('h2, .result__title, [data-testid="result-title"]');
        const snippetEl = item.querySelector('.result__snippet, [data-result="snippet"], .snippet');

        if (linkEl && titleEl) {
          const href = linkEl.getAttribute('href') || '';
          if (href && !href.includes('duckduckgo.com')) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              url: href,
              snippet: snippetEl?.textContent?.trim() || '',
              position: index + 1,
            });
          }
        }
      });

      return results;
    }, maxResults);
  }

  private async searchBrave(query: string, maxResults: number): Promise<SearchResult[]> {
    await this.navigate(`https://search.brave.com/search?q=${encodeURIComponent(query)}`);
    await this.activePage!.waitForSelector('.snippet', { timeout: 10000 }).catch(() => {});

    return this.activePage!.evaluate((max) => {
      const results: SearchResult[] = [];
      const items = document.querySelectorAll('.snippet');

      items.forEach((item, index) => {
        if (results.length >= max) return;

        const linkEl = item.querySelector('a.result-header');
        const titleEl = item.querySelector('.snippet-title');
        const snippetEl = item.querySelector('.snippet-description');

        if (linkEl && titleEl) {
          results.push({
            title: titleEl.textContent?.trim() || '',
            url: linkEl.getAttribute('href') || '',
            snippet: snippetEl?.textContent?.trim() || '',
            position: index + 1,
          });
        }
      });

      return results;
    }, maxResults);
  }

  private async searchGoogle(query: string, maxResults: number): Promise<SearchResult[]> {
    await this.navigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    await this.activePage!.waitForSelector('#search', { timeout: 10000 }).catch(() => {});

    return this.activePage!.evaluate((max) => {
      const results: SearchResult[] = [];
      const items = document.querySelectorAll('.g');

      items.forEach((item, index) => {
        if (results.length >= max) return;

        const linkEl = item.querySelector('a[href^="http"]');
        const titleEl = item.querySelector('h3');
        const snippetEl = item.querySelector('.VwiC3b, .st');

        if (linkEl && titleEl) {
          const href = linkEl.getAttribute('href') || '';
          if (!href.includes('google.com')) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              url: href,
              snippet: snippetEl?.textContent?.trim() || '',
              position: index + 1,
            });
          }
        }
      });

      return results;
    }, maxResults);
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  async navigate(url: string, options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
  }): Promise<NavigationResult> {
    await this.ensurePage();
    const startTime = Date.now();

    try {
      // Handle special URL schemes
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      await this.activePage!.goto(url, {
        waitUntil: options?.waitUntil || 'domcontentloaded',
        timeout: options?.timeout || this.config.timeout,
      });

      const snapshot = await this.takeSnapshot();

      return {
        success: true,
        url: this.activePage!.url(),
        title: await this.activePage!.title(),
        snapshot,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url,
        title: '',
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  async goBack(): Promise<NavigationResult> {
    await this.ensurePage();
    const startTime = Date.now();

    try {
      await this.activePage!.goBack({ waitUntil: 'domcontentloaded' });
      return {
        success: true,
        url: this.activePage!.url(),
        title: await this.activePage!.title(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url: this.activePage!.url(),
        title: '',
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  async goForward(): Promise<NavigationResult> {
    await this.ensurePage();
    const startTime = Date.now();

    try {
      await this.activePage!.goForward({ waitUntil: 'domcontentloaded' });
      return {
        success: true,
        url: this.activePage!.url(),
        title: await this.activePage!.title(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url: this.activePage!.url(),
        title: '',
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  async reload(): Promise<NavigationResult> {
    await this.ensurePage();
    const startTime = Date.now();

    try {
      await this.activePage!.reload({ waitUntil: 'domcontentloaded' });
      return {
        success: true,
        url: this.activePage!.url(),
        title: await this.activePage!.title(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url: this.activePage!.url(),
        title: '',
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // SNAPSHOT (Agent-Browser Style Element Refs)
  // ============================================================================

  async takeSnapshot(): Promise<PageSnapshot> {
    await this.ensurePage();

    // Reset element refs
    this.elementRefs.clear();
    this.refCounter = 0;

    // Use a string function to avoid esbuild adding __name helpers
    const snapshotScript = `
      (function() {
        var elements = [];
        var forms = [];
        var links = [];

        function getXPath(el) {
          var parts = [];
          var current = el;
          while (current && current.nodeType === 1) {
            var index = 1;
            var sibling = current.previousElementSibling;
            while (sibling) {
              if (sibling.tagName === current.tagName) index++;
              sibling = sibling.previousElementSibling;
            }
            parts.unshift(current.tagName.toLowerCase() + '[' + index + ']');
            current = current.parentElement;
          }
          return '/' + parts.join('/');
        }

        function getSelector(el) {
          if (el.id) return '#' + el.id;
          var classes = Array.from(el.classList).filter(function(c) { return c && c.indexOf(' ') === -1; }).slice(0, 3);
          if (classes.length > 0) {
            var classSelector = '.' + classes.join('.');
            if (document.querySelectorAll(classSelector).length === 1) {
              return classSelector;
            }
          }
          return getXPath(el);
        }

        var selectors = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="textbox"], [onclick], [tabindex], [contenteditable="true"]';
        var allElements = document.querySelectorAll(selectors);

        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          var tagName = el.tagName.toLowerCase();
          var attrs = {};
          for (var j = 0; j < el.attributes.length; j++) {
            attrs[el.attributes[j].name] = el.attributes[j].value;
          }

          elements.push({
            tagName: tagName,
            type: el.getAttribute('type') || el.getAttribute('role') || tagName,
            text: (el.textContent || '').trim().slice(0, 100),
            selector: getSelector(el),
            xpath: getXPath(el),
            bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            attributes: attrs,
            isInteractable: true,
            role: el.getAttribute('role') || null,
            ariaLabel: el.getAttribute('aria-label') || null
          });
        }

        var allForms = document.querySelectorAll('form');
        for (var i = 0; i < allForms.length; i++) {
          var form = allForms[i];
          var formData = {
            id: form.id || 'form-' + i,
            action: form.action,
            method: (form.method || 'GET').toUpperCase(),
            fields: []
          };

          var fields = form.querySelectorAll('input, select, textarea');
          for (var j = 0; j < fields.length; j++) {
            var field = fields[j];
            var labelEl = document.querySelector('label[for="' + field.id + '"]');
            formData.fields.push({
              name: field.name || '',
              type: field.type || field.tagName.toLowerCase(),
              label: (labelEl && labelEl.textContent ? labelEl.textContent.trim() : '') || field.getAttribute('placeholder') || field.getAttribute('aria-label') || '',
              value: field.value || '',
              required: field.required || false,
              selector: getSelector(field)
            });
          }

          if (formData.fields.length > 0) forms.push(formData);
        }

        var allLinks = document.querySelectorAll('a[href]');
        for (var i = 0; i < allLinks.length; i++) {
          var anchor = allLinks[i];
          var href = anchor.href;
          if (!href || href.indexOf('javascript:') === 0) continue;

          links.push({
            text: (anchor.textContent || '').trim().slice(0, 100),
            href: href,
            isExternal: anchor.hostname !== window.location.hostname,
            selector: getSelector(anchor)
          });
        }

        var text = document.body ? (document.body.innerText || '').slice(0, 5000) : '';

        return { elements: elements, forms: forms, links: links, text: text };
      })()
    `;

    const snapshot = await this.activePage!.evaluate(snapshotScript) as {
      elements: Array<{
        tagName: string;
        type: string;
        text: string;
        selector: string;
        xpath: string;
        bounds: { x: number; y: number; width: number; height: number };
        attributes: Record<string, string>;
        isInteractable: boolean;
        role: string | null;
        ariaLabel: string | null;
      }>;
      forms: Array<{
        id: string;
        action: string;
        method: string;
        fields: Array<{
          name: string;
          type: string;
          label: string;
          value: string;
          required: boolean;
          selector: string;
        }>;
      }>;
      links: Array<{
        text: string;
        href: string;
        isExternal: boolean;
        selector: string;
      }>;
      text: string;
    };

    // Assign numeric refs
    const elementsWithRefs: ElementRef[] = snapshot.elements.map(el => {
      const ref = ++this.refCounter;
      const elementRef: ElementRef = {
        id: uuid(),
        ref,
        tagName: el.tagName,
        type: el.type,
        text: el.text,
        selector: el.selector,
        xpath: el.xpath,
        bounds: el.bounds,
        attributes: el.attributes,
        isInteractable: el.isInteractable,
        role: el.role || undefined,
        ariaLabel: el.ariaLabel || undefined,
      };
      this.elementRefs.set(ref, elementRef);
      return elementRef;
    });

    const formsWithRefs: FormSnapshot[] = snapshot.forms.map(form => ({
      ...form,
      fields: form.fields.map(field => {
        const ref = ++this.refCounter;
        return { ...field, ref };
      }),
    }));

    const linksWithRefs: LinkSnapshot[] = snapshot.links.map(link => {
      const ref = ++this.refCounter;
      return { ...link, ref };
    });

    return {
      url: this.activePage!.url(),
      title: await this.activePage!.title(),
      elements: elementsWithRefs,
      forms: formsWithRefs,
      links: linksWithRefs,
      text: snapshot.text,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // ELEMENT INTERACTION (By Ref Number)
  // ============================================================================

  async click(ref: number | string): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      const selector = typeof ref === 'number'
        ? this.elementRefs.get(ref)?.selector
        : ref;

      if (!selector) {
        return { success: false, message: `Element ref [${ref}] not found`, error: 'Element not found' };
      }

      await this.activePage!.click(selector, { timeout: this.config.timeout });
      await this.activePage!.waitForLoadState('domcontentloaded').catch(() => {});

      return { success: true, message: `Clicked element [${ref}]` };
    } catch (error) {
      return { success: false, message: `Failed to click [${ref}]`, error: (error as Error).message };
    }
  }

  async type(ref: number | string, text: string): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      const selector = typeof ref === 'number'
        ? this.elementRefs.get(ref)?.selector
        : ref;

      if (!selector) {
        return { success: false, message: `Element ref [${ref}] not found`, error: 'Element not found' };
      }

      await this.activePage!.fill(selector, text, { timeout: this.config.timeout });

      return { success: true, message: `Typed "${text.slice(0, 20)}..." into [${ref}]` };
    } catch (error) {
      return { success: false, message: `Failed to type into [${ref}]`, error: (error as Error).message };
    }
  }

  async fill(ref: number | string, value: string): Promise<ActionResponse> {
    return this.type(ref, value);
  }

  async select(ref: number | string, value: string): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      const selector = typeof ref === 'number'
        ? this.elementRefs.get(ref)?.selector
        : ref;

      if (!selector) {
        return { success: false, message: `Element ref [${ref}] not found`, error: 'Element not found' };
      }

      await this.activePage!.selectOption(selector, value, { timeout: this.config.timeout });

      return { success: true, message: `Selected "${value}" in [${ref}]` };
    } catch (error) {
      return { success: false, message: `Failed to select in [${ref}]`, error: (error as Error).message };
    }
  }

  async hover(ref: number | string): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      const selector = typeof ref === 'number'
        ? this.elementRefs.get(ref)?.selector
        : ref;

      if (!selector) {
        return { success: false, message: `Element ref [${ref}] not found`, error: 'Element not found' };
      }

      await this.activePage!.hover(selector, { timeout: this.config.timeout });

      return { success: true, message: `Hovered over [${ref}]` };
    } catch (error) {
      return { success: false, message: `Failed to hover [${ref}]`, error: (error as Error).message };
    }
  }

  async scroll(deltaX: number = 0, deltaY: number = 500): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      await this.activePage!.mouse.wheel(deltaX, deltaY);
      return { success: true, message: `Scrolled by (${deltaX}, ${deltaY})` };
    } catch (error) {
      return { success: false, message: 'Failed to scroll', error: (error as Error).message };
    }
  }

  async scrollTo(ref: number | string): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      const selector = typeof ref === 'number'
        ? this.elementRefs.get(ref)?.selector
        : ref;

      if (!selector) {
        return { success: false, message: `Element ref [${ref}] not found`, error: 'Element not found' };
      }

      await this.activePage!.locator(selector).scrollIntoViewIfNeeded({ timeout: this.config.timeout });

      return { success: true, message: `Scrolled to [${ref}]` };
    } catch (error) {
      return { success: false, message: `Failed to scroll to [${ref}]`, error: (error as Error).message };
    }
  }

  async pressKey(key: string): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      await this.activePage!.keyboard.press(key);
      return { success: true, message: `Pressed key: ${key}` };
    } catch (error) {
      return { success: false, message: `Failed to press key: ${key}`, error: (error as Error).message };
    }
  }

  // ============================================================================
  // SCREENSHOTS & DATA EXTRACTION
  // ============================================================================

  async screenshot(options?: {
    fullPage?: boolean;
    selector?: string;
    format?: 'png' | 'jpeg';
  }): Promise<string> {
    await this.ensurePage();

    if (options?.selector) {
      const element = this.activePage!.locator(options.selector);
      const buffer = await element.screenshot({ type: options.format || 'png' });
      return buffer.toString('base64');
    }

    const buffer = await this.activePage!.screenshot({
      type: options?.format || 'png',
      fullPage: options?.fullPage || false,
    });

    return buffer.toString('base64');
  }

  async extractText(selector?: string): Promise<string> {
    await this.ensurePage();

    if (selector) {
      return this.activePage!.locator(selector).innerText();
    }

    return this.activePage!.evaluate(() => document.body.innerText);
  }

  async extractHTML(selector?: string): Promise<string> {
    await this.ensurePage();

    if (selector) {
      return this.activePage!.locator(selector).innerHTML();
    }

    return this.activePage!.content();
  }

  async extractLinks(): Promise<Array<{ text: string; href: string }>> {
    await this.ensurePage();

    return this.activePage!.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent?.trim() || '',
        href: (a as HTMLAnchorElement).href,
      }));
    });
  }

  // ============================================================================
  // FORM HANDLING
  // ============================================================================

  async fillForm(formData: Record<string, string>, submitAfter?: boolean): Promise<ActionResponse> {
    await this.ensurePage();

    try {
      for (const [fieldName, value] of Object.entries(formData)) {
        // Try to find field by name, id, label, or placeholder
        const selectors = [
          `[name="${fieldName}"]`,
          `#${fieldName}`,
          `input[placeholder*="${fieldName}" i]`,
          `textarea[placeholder*="${fieldName}" i]`,
        ];

        let filled = false;
        for (const selector of selectors) {
          try {
            const element = this.activePage!.locator(selector).first();
            if (await element.isVisible()) {
              await element.fill(value);
              filled = true;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!filled) {
          this.log('warn', `Could not find field: ${fieldName}`);
        }
      }

      if (submitAfter) {
        // Try to find and click submit button
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Submit")',
          'button:has-text("Send")',
          'button:has-text("Continue")',
        ];

        for (const selector of submitSelectors) {
          try {
            await this.activePage!.click(selector, { timeout: 5000 });
            break;
          } catch {
            continue;
          }
        }
      }

      return { success: true, message: 'Form filled successfully' };
    } catch (error) {
      return { success: false, message: 'Failed to fill form', error: (error as Error).message };
    }
  }

  // ============================================================================
  // TAB MANAGEMENT
  // ============================================================================

  async newTab(): Promise<string> {
    await this.ensureBrowser();

    if (this.pages.size >= this.config.maxConcurrentTabs) {
      // Close oldest tab
      const oldestId = this.pages.keys().next().value;
      if (oldestId) await this.closeTab(oldestId);
    }

    const page = await this.context!.newPage();
    const pageId = uuid();

    this.pages.set(pageId, page);
    this.activePage = page;
    this.activePageId = pageId;

    return pageId;
  }

  async switchTab(pageId: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) return false;

    this.activePage = page;
    this.activePageId = pageId;
    await page.bringToFront();

    return true;
  }

  async closeTab(pageId?: string): Promise<boolean> {
    const id = pageId || this.activePageId;
    if (!id) return false;

    const page = this.pages.get(id);
    if (page && !page.isClosed()) {
      await page.close();
    }

    this.pages.delete(id);

    if (id === this.activePageId) {
      const remaining = Array.from(this.pages.entries());
      if (remaining.length > 0) {
        const [newId, newPage] = remaining[remaining.length - 1];
        this.activePageId = newId;
        this.activePage = newPage;
      } else {
        this.activePageId = null;
        this.activePage = null;
      }
    }

    return true;
  }

  getTabIds(): string[] {
    return Array.from(this.pages.keys());
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForSelector(selector: string, timeout?: number): Promise<boolean> {
    await this.ensurePage();

    try {
      await this.activePage!.waitForSelector(selector, { timeout: timeout || this.config.timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForNavigation(timeout?: number): Promise<boolean> {
    await this.ensurePage();

    try {
      await this.activePage!.waitForNavigation({ timeout: timeout || this.config.timeout });
      return true;
    } catch {
      return false;
    }
  }

  getCurrentUrl(): string | null {
    return this.activePage?.url() || null;
  }

  async getTitle(): Promise<string | null> {
    return this.activePage ? await this.activePage.title() : null;
  }

  isRunning(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch();
    }
  }

  private async ensurePage(): Promise<void> {
    await this.ensureBrowser();

    if (!this.activePage || this.activePage.isClosed()) {
      await this.newTab();
    }
  }

  private getBrowserArgs(): string[] {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      `--window-size=${this.config.viewport.width},${this.config.viewport.height}`,
    ];
  }

  private getDefaultUserAgent(): string {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  }

  private async applyStealthMode(): Promise<void> {
    if (!this.context) return;

    await this.context.addInitScript(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Fake plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Fake languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Add chrome object
      (window as unknown as { chrome: unknown }).chrome = { runtime: {} };

      // Fake permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery.call(window.navigator.permissions, parameters);
    });
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (!this.config.debugMode && level === 'debug') return;

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WebNavigator] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'debug': console.debug(logMessage, data || ''); break;
      case 'info': console.log(logMessage, data || ''); break;
      case 'warn': console.warn(logMessage, data || ''); break;
      case 'error': console.error(logMessage, data || ''); break;
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createWebNavigator(config?: WebNavigatorConfig): WebNavigator {
  return new WebNavigator(config);
}

export async function launchWebNavigator(config?: WebNavigatorConfig): Promise<WebNavigator> {
  const navigator = new WebNavigator(config);
  await navigator.launch();
  return navigator;
}

export default WebNavigator;
