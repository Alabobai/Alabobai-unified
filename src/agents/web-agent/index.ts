/**
 * Alabobai Web Agent
 *
 * An AI-powered web navigation agent that NEVER refuses requests.
 * Integrates WebNavigator and WebSearchService with LLM capabilities
 * to handle natural language web tasks.
 *
 * Capabilities:
 * - Web search (any query, any topic)
 * - Page navigation and browsing
 * - Form filling and submission
 * - Data extraction and scraping
 * - Screenshot capture
 * - Multi-tab operations
 * - Session persistence
 *
 * This agent is designed to be helpful and responsive to ALL web-related
 * requests from users. It does NOT refuse to browse, search, or navigate.
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

import {
  WebNavigator,
  WebNavigatorConfig,
  PageSnapshot,
  NavigationResult,
  ActionResponse,
} from '../../browser/WebNavigator.js';

import {
  WebSearchService,
  SearchConfig,
  SearchResponse,
  ImageResult,
  NewsResult,
} from '../../browser/WebSearchService.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WebAgentConfig {
  navigatorConfig?: WebNavigatorConfig;
  searchConfig?: SearchConfig;
  maxMemoryItems?: number;
  autoScreenshot?: boolean;
  verboseMode?: boolean;
}

export interface WebTask {
  id: string;
  type: 'search' | 'navigate' | 'click' | 'type' | 'fill' | 'extract' | 'screenshot';
  input: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentMemory {
  visitedUrls: string[];
  searchQueries: string[];
  extractedData: Array<{ url: string; data: string; timestamp: Date }>;
  screenshots: Array<{ url: string; base64: string; timestamp: Date }>;
}

export interface WebAgentResponse {
  success: boolean;
  message: string;
  data?: unknown;
  screenshot?: string;
  suggestions?: string[];
}

// ============================================================================
// WEB AGENT CLASS
// ============================================================================

export class WebAgent extends EventEmitter {
  private config: Required<WebAgentConfig>;
  private navigator: WebNavigator | null = null;
  private searchService: WebSearchService;
  private memory: AgentMemory;
  private tasks: Map<string, WebTask> = new Map();
  private isInitialized: boolean = false;

  constructor(config: WebAgentConfig = {}) {
    super();

    this.config = {
      navigatorConfig: config.navigatorConfig ?? {},
      searchConfig: config.searchConfig ?? {},
      maxMemoryItems: config.maxMemoryItems ?? 100,
      autoScreenshot: config.autoScreenshot ?? false,
      verboseMode: config.verboseMode ?? false,
    };

    this.searchService = new WebSearchService(this.config.searchConfig);
    this.memory = {
      visitedUrls: [],
      searchQueries: [],
      extractedData: [],
      screenshots: [],
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.navigator = new WebNavigator(this.config.navigatorConfig);
    await this.navigator.launch();

    this.isInitialized = true;
    this.emit('initialized');
    this.log('info', 'Web Agent initialized and ready');
  }

  async shutdown(): Promise<void> {
    if (this.navigator) {
      await this.navigator.close();
      this.navigator = null;
    }

    this.isInitialized = false;
    this.emit('shutdown');
    this.log('info', 'Web Agent shut down');
  }

  // ============================================================================
  // MAIN COMMAND INTERFACE
  // ============================================================================

  /**
   * Execute a natural language web command - NEVER refuses
   */
  async execute(command: string): Promise<WebAgentResponse> {
    await this.ensureInitialized();

    this.log('info', `Executing command: ${command}`);

    // Parse the command and determine action
    const action = this.parseCommand(command);

    try {
      switch (action.type) {
        case 'search':
          return this.handleSearch(action.query || command);

        case 'navigate':
          return this.handleNavigate(action.url || command);

        case 'click':
          return this.handleClick(action.target || command);

        case 'type':
          return this.handleType(action.target || '', action.text || '');

        case 'fill':
          return this.handleFillForm(action.formData);

        case 'extract':
          return this.handleExtract(action.selector);

        case 'screenshot':
          return this.handleScreenshot(action.fullPage);

        case 'back':
          return this.handleBack();

        case 'forward':
          return this.handleForward();

        case 'scroll':
          return this.handleScroll(action.direction, action.amount);

        default:
          // Try to handle as a search query
          return this.handleSearch(command);
      }
    } catch (error) {
      return {
        success: false,
        message: `Command failed: ${(error as Error).message}`,
        suggestions: [
          'Try rephrasing your request',
          'Make sure the URL or search query is valid',
          'Check if the element exists on the page',
        ],
      };
    }
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  async search(query: string, options?: {
    engine?: 'duckduckgo' | 'brave' | 'google';
    maxResults?: number;
  }): Promise<SearchResponse> {
    this.addToMemory('search', query);
    return this.searchService.search(query, options);
  }

  async searchImages(query: string, maxResults?: number): Promise<SearchResponse<ImageResult>> {
    this.addToMemory('search', `images: ${query}`);
    return this.searchService.searchImages(query, { maxResults });
  }

  async searchNews(query: string, maxResults?: number): Promise<SearchResponse<NewsResult>> {
    this.addToMemory('search', `news: ${query}`);
    return this.searchService.searchNews(query, { maxResults });
  }

  // ============================================================================
  // NAVIGATION OPERATIONS
  // ============================================================================

  async navigate(url: string): Promise<NavigationResult> {
    await this.ensureInitialized();

    const result = await this.navigator!.navigate(url);
    this.addToMemory('url', url);

    if (this.config.autoScreenshot && result.success) {
      const screenshot = await this.navigator!.screenshot();
      this.addToMemory('screenshot', { url, base64: screenshot });
    }

    return result;
  }

  async goBack(): Promise<NavigationResult> {
    await this.ensureInitialized();
    return this.navigator!.goBack();
  }

  async goForward(): Promise<NavigationResult> {
    await this.ensureInitialized();
    return this.navigator!.goForward();
  }

  async reload(): Promise<NavigationResult> {
    await this.ensureInitialized();
    return this.navigator!.reload();
  }

  // ============================================================================
  // PAGE INTERACTION
  // ============================================================================

  async click(target: number | string): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.click(target);
  }

  async type(target: number | string, text: string): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.type(target, text);
  }

  async fill(target: number | string, value: string): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.fill(target, value);
  }

  async select(target: number | string, value: string): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.select(target, value);
  }

  async hover(target: number | string): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.hover(target);
  }

  async scroll(deltaX: number = 0, deltaY: number = 500): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.scroll(deltaX, deltaY);
  }

  async pressKey(key: string): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.pressKey(key);
  }

  // ============================================================================
  // FORM HANDLING
  // ============================================================================

  async fillForm(formData: Record<string, string>, submit?: boolean): Promise<ActionResponse> {
    await this.ensureInitialized();
    return this.navigator!.fillForm(formData, submit);
  }

  // ============================================================================
  // DATA EXTRACTION
  // ============================================================================

  async takeSnapshot(): Promise<PageSnapshot> {
    await this.ensureInitialized();
    return this.navigator!.takeSnapshot();
  }

  async extractText(selector?: string): Promise<string> {
    await this.ensureInitialized();
    const text = await this.navigator!.extractText(selector);

    const url = this.navigator!.getCurrentUrl() || 'unknown';
    this.addToMemory('extract', { url, data: text.slice(0, 1000) });

    return text;
  }

  async extractHTML(selector?: string): Promise<string> {
    await this.ensureInitialized();
    return this.navigator!.extractHTML(selector);
  }

  async extractLinks(): Promise<Array<{ text: string; href: string }>> {
    await this.ensureInitialized();
    return this.navigator!.extractLinks();
  }

  async screenshot(options?: {
    fullPage?: boolean;
    selector?: string;
  }): Promise<string> {
    await this.ensureInitialized();

    const base64 = await this.navigator!.screenshot(options);
    const url = this.navigator!.getCurrentUrl() || 'unknown';

    this.addToMemory('screenshot', { url, base64 });

    return base64;
  }

  // ============================================================================
  // TAB MANAGEMENT
  // ============================================================================

  async newTab(): Promise<string> {
    await this.ensureInitialized();
    return this.navigator!.newTab();
  }

  async switchTab(tabId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.navigator!.switchTab(tabId);
  }

  async closeTab(tabId?: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.navigator!.closeTab(tabId);
  }

  getTabIds(): string[] {
    return this.navigator?.getTabIds() || [];
  }

  // ============================================================================
  // MEMORY & STATE
  // ============================================================================

  getMemory(): AgentMemory {
    return { ...this.memory };
  }

  clearMemory(): void {
    this.memory = {
      visitedUrls: [],
      searchQueries: [],
      extractedData: [],
      screenshots: [],
    };
  }

  getCurrentUrl(): string | null {
    return this.navigator?.getCurrentUrl() || null;
  }

  async getTitle(): Promise<string | null> {
    return this.navigator ? await this.navigator.getTitle() : null;
  }

  isReady(): boolean {
    return this.isInitialized && this.navigator !== null;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private parseCommand(command: string): {
    type: string;
    query?: string;
    url?: string;
    target?: string;
    text?: string;
    formData?: Record<string, string>;
    selector?: string;
    fullPage?: boolean;
    direction?: 'up' | 'down';
    amount?: number;
  } {
    const lower = command.toLowerCase();

    // Search patterns
    if (lower.startsWith('search ') || lower.startsWith('find ') || lower.startsWith('look up ')) {
      return { type: 'search', query: command.replace(/^(search|find|look up)\s+/i, '') };
    }

    // Navigation patterns
    if (lower.startsWith('go to ') || lower.startsWith('navigate to ') || lower.startsWith('open ')) {
      const url = command.replace(/^(go to|navigate to|open)\s+/i, '');
      return { type: 'navigate', url };
    }

    // URL detection
    if (lower.match(/^https?:\/\//i) || lower.match(/^www\./i) || lower.match(/\.(com|org|net|io|ai|app)/i)) {
      return { type: 'navigate', url: command };
    }

    // Click patterns
    if (lower.startsWith('click ') || lower.startsWith('tap ') || lower.startsWith('press ')) {
      const target = command.replace(/^(click|tap|press)\s+(on\s+)?/i, '');
      return { type: 'click', target };
    }

    // Type patterns
    if (lower.startsWith('type ') || lower.startsWith('enter ') || lower.startsWith('input ')) {
      const match = command.match(/(?:type|enter|input)\s+["']?([^"']+)["']?\s+(?:in|into)\s+(.+)/i);
      if (match) {
        return { type: 'type', text: match[1], target: match[2] };
      }
    }

    // Screenshot patterns
    if (lower.includes('screenshot') || lower.includes('capture')) {
      const fullPage = lower.includes('full') || lower.includes('entire');
      return { type: 'screenshot', fullPage };
    }

    // Back/Forward
    if (lower === 'back' || lower === 'go back') {
      return { type: 'back' };
    }
    if (lower === 'forward' || lower === 'go forward') {
      return { type: 'forward' };
    }

    // Scroll patterns
    if (lower.includes('scroll')) {
      const direction = lower.includes('up') ? 'up' : 'down';
      const amount = parseInt(command.match(/\d+/)?.[0] || '500', 10);
      return { type: 'scroll', direction, amount };
    }

    // Extract patterns
    if (lower.startsWith('extract ') || lower.startsWith('get ')) {
      const selector = command.replace(/^(extract|get)\s+(text|html|content)?\s*(from\s+)?/i, '');
      return { type: 'extract', selector: selector || undefined };
    }

    // Default to search
    return { type: 'search', query: command };
  }

  private async handleSearch(query: string): Promise<WebAgentResponse> {
    const results = await this.search(query);

    return {
      success: true,
      message: `Found ${results.totalResults} results for "${query}"`,
      data: results.results,
      suggestions: results.results.slice(0, 3).map(r => `Navigate to: ${r.url}`),
    };
  }

  private async handleNavigate(url: string): Promise<WebAgentResponse> {
    const result = await this.navigate(url);

    if (result.success) {
      const screenshot = this.config.autoScreenshot ? await this.screenshot() : undefined;

      return {
        success: true,
        message: `Navigated to ${result.title || result.url}`,
        data: result.snapshot,
        screenshot,
        suggestions: [
          'Take a screenshot',
          'Extract page content',
          'Click on an element',
        ],
      };
    }

    return {
      success: false,
      message: `Failed to navigate: ${result.error}`,
      suggestions: [
        'Check if the URL is valid',
        'Try searching for the page instead',
      ],
    };
  }

  private async handleClick(target: string): Promise<WebAgentResponse> {
    // Try to parse as number (element ref)
    const ref = parseInt(target, 10);
    const result = await this.click(isNaN(ref) ? target : ref);

    return {
      success: result.success,
      message: result.message,
      screenshot: this.config.autoScreenshot ? await this.screenshot() : undefined,
    };
  }

  private async handleType(target: string, text: string): Promise<WebAgentResponse> {
    const ref = parseInt(target, 10);
    const result = await this.type(isNaN(ref) ? target : ref, text);

    return {
      success: result.success,
      message: result.message,
    };
  }

  private async handleFillForm(formData?: Record<string, string>): Promise<WebAgentResponse> {
    if (!formData || Object.keys(formData).length === 0) {
      return {
        success: false,
        message: 'No form data provided',
        suggestions: ['Provide field names and values to fill'],
      };
    }

    const result = await this.fillForm(formData);

    return {
      success: result.success,
      message: result.message,
      screenshot: this.config.autoScreenshot ? await this.screenshot() : undefined,
    };
  }

  private async handleExtract(selector?: string): Promise<WebAgentResponse> {
    const text = await this.extractText(selector);

    return {
      success: true,
      message: `Extracted ${text.length} characters`,
      data: text,
    };
  }

  private async handleScreenshot(fullPage?: boolean): Promise<WebAgentResponse> {
    const screenshot = await this.screenshot({ fullPage });

    return {
      success: true,
      message: 'Screenshot captured',
      screenshot,
    };
  }

  private async handleBack(): Promise<WebAgentResponse> {
    const result = await this.goBack();

    return {
      success: result.success,
      message: result.success ? `Went back to ${result.title}` : 'Could not go back',
    };
  }

  private async handleForward(): Promise<WebAgentResponse> {
    const result = await this.goForward();

    return {
      success: result.success,
      message: result.success ? `Went forward to ${result.title}` : 'Could not go forward',
    };
  }

  private async handleScroll(direction?: 'up' | 'down', amount?: number): Promise<WebAgentResponse> {
    const delta = direction === 'up' ? -(amount || 500) : (amount || 500);
    const result = await this.scroll(0, delta);

    return {
      success: result.success,
      message: result.message,
    };
  }

  private addToMemory(type: 'url' | 'search' | 'extract' | 'screenshot', data: unknown): void {
    switch (type) {
      case 'url':
        this.memory.visitedUrls.push(data as string);
        if (this.memory.visitedUrls.length > this.config.maxMemoryItems) {
          this.memory.visitedUrls.shift();
        }
        break;

      case 'search':
        this.memory.searchQueries.push(data as string);
        if (this.memory.searchQueries.length > this.config.maxMemoryItems) {
          this.memory.searchQueries.shift();
        }
        break;

      case 'extract':
        this.memory.extractedData.push({
          ...(data as { url: string; data: string }),
          timestamp: new Date(),
        });
        if (this.memory.extractedData.length > this.config.maxMemoryItems) {
          this.memory.extractedData.shift();
        }
        break;

      case 'screenshot':
        this.memory.screenshots.push({
          ...(data as { url: string; base64: string }),
          timestamp: new Date(),
        });
        if (this.memory.screenshots.length > 10) {
          this.memory.screenshots.shift();
        }
        break;
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (!this.config.verboseMode && level === 'debug') return;

    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [WebAgent] ${message}`, data || '');
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createWebAgent(config?: WebAgentConfig): WebAgent {
  return new WebAgent(config);
}

export async function launchWebAgent(config?: WebAgentConfig): Promise<WebAgent> {
  const agent = new WebAgent(config);
  await agent.initialize();
  return agent;
}

/**
 * Quick command execution - NEVER refuses
 */
export async function webCommand(
  command: string,
  config?: WebAgentConfig
): Promise<WebAgentResponse> {
  const agent = await launchWebAgent(config);

  try {
    return await agent.execute(command);
  } finally {
    await agent.shutdown();
  }
}

export default WebAgent;
