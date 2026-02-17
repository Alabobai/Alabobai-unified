/**
 * Alabobai Browser Automation Module
 *
 * A production-ready hybrid DOM + Vision browser automation system with
 * OpenClaw-style web navigation capabilities.
 *
 * Features:
 * - HybridBrowser: Main orchestrator combining DOM + Vision approaches
 * - WebNavigator: OpenClaw-style web navigation with CDP support
 * - WebSearchService: Multi-engine web search (DuckDuckGo, Brave, Google)
 * - DOMExtractor: Extract interactive elements, forms, links, buttons with semantic labels
 * - VisionAnalyzer: Use Claude's vision to understand screenshots when DOM fails
 * - ActionExecutor: Execute click, type, scroll, navigate, screenshot actions
 *
 * Built on Playwright for fast, reliable cross-browser automation.
 * NEVER refuses web navigation or search requests.
 */

// Main orchestrator
export {
  HybridBrowser,
  createHybridBrowser,
  type HybridBrowserConfig,
  type BrowserState,
  type NavigationOptions,
  type AutomationTask,
  type AutomationResult,
  type BrowserEngine,
} from './HybridBrowser.js';

// DOM extraction
export {
  DOMExtractor,
  createDOMExtractor,
  type ExtractedElement,
  type ElementType,
  type ElementBounds,
  type FormData,
  type FormField,
  type AccessibilityNode,
  type ExtractionOptions,
  type ExtractionResult,
  type ExtractionStats,
} from './DOMExtractor.js';

// Vision analysis
export {
  VisionAnalyzer,
  createVisionAnalyzer,
  type VisionConfig,
  type VisualElement,
  type VisualElementType,
  type VisualBounds,
  type PageAnalysis,
  type PageLayout,
  type PageContent,
  type ActionSuggestion,
  type FindElementRequest,
  type VisualDiff,
} from './VisionAnalyzer.js';

// Action execution
export {
  ActionExecutor,
  createActionExecutor,
  type ActionType,
  type ActionTarget,
  type ActionOptions,
  type Action,
  type ActionResult,
  type ExecutorConfig,
} from './ActionExecutor.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { HybridBrowser, HybridBrowserConfig } from './HybridBrowser.js';

/**
 * Create and launch a hybrid browser with default settings
 */
export async function launchBrowser(config?: HybridBrowserConfig): Promise<HybridBrowser> {
  const browser = new HybridBrowser(config);
  await browser.launch();
  return browser;
}

/**
 * Create a headless browser for automation tasks
 */
export async function launchHeadless(config?: Omit<HybridBrowserConfig, 'headless'>): Promise<HybridBrowser> {
  return launchBrowser({ ...config, headless: true });
}

/**
 * Create a visible browser for debugging
 */
export async function launchVisible(config?: Omit<HybridBrowserConfig, 'headless'>): Promise<HybridBrowser> {
  return launchBrowser({ ...config, headless: false });
}

/**
 * Quick automation: navigate to URL and execute actions
 */
export async function automate(
  url: string,
  actions: Array<{
    type: 'click' | 'type' | 'fill' | 'select' | 'scroll' | 'wait';
    target?: string;
    value?: string;
  }>,
  config?: HybridBrowserConfig
): Promise<{ success: boolean; results: import('./ActionExecutor.js').ActionResult[] }> {
  const browser = await launchBrowser(config);

  try {
    await browser.newPage();
    await browser.navigate(url);

    const results: import('./ActionExecutor.js').ActionResult[] = [];

    for (const action of actions) {
      let result: import('./ActionExecutor.js').ActionResult;

      switch (action.type) {
        case 'click':
          result = await browser.click(action.target || '');
          break;
        case 'type':
          result = await browser.type(action.target || '', action.value || '');
          break;
        case 'fill':
          result = await browser.fill(action.target || '', action.value || '');
          break;
        case 'select':
          result = await browser.select(action.target || '', action.value || '');
          break;
        case 'scroll':
          const [x, y] = (action.value || '0,500').split(',').map(Number);
          result = await browser.scroll(x, y);
          break;
        case 'wait':
          result = await browser.wait(parseInt(action.value || '1000', 10));
          break;
        default:
          continue;
      }

      results.push(result);

      if (!result.success) {
        return { success: false, results };
      }
    }

    return { success: true, results };
  } finally {
    await browser.close();
  }
}

/**
 * Quick scrape: extract elements from a URL
 */
export async function scrape(
  url: string,
  options?: {
    interactableOnly?: boolean;
    includeText?: boolean;
    screenshot?: boolean;
    config?: HybridBrowserConfig;
  }
): Promise<{
  elements: import('./DOMExtractor.js').ExtractedElement[];
  forms: import('./DOMExtractor.js').FormData[];
  screenshot?: string;
}> {
  const browser = await launchBrowser(options?.config);

  try {
    await browser.newPage();
    await browser.navigate(url);

    const extraction = await browser.extractDOM();
    let elements = extraction.elements;

    if (options?.interactableOnly) {
      elements = elements.filter(e => e.isInteractable);
    }

    let screenshot: string | undefined;
    if (options?.screenshot) {
      screenshot = await browser.screenshot();
    }

    return {
      elements,
      forms: extraction.forms,
      screenshot,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Quick screenshot: take a screenshot of a URL
 */
export async function captureScreenshot(
  url: string,
  options?: {
    fullPage?: boolean;
    viewport?: { width: number; height: number };
    config?: HybridBrowserConfig;
  }
): Promise<string> {
  const browser = await launchBrowser({
    ...options?.config,
    viewport: options?.viewport,
  });

  try {
    await browser.newPage();
    await browser.navigate(url);
    return await browser.screenshot(options?.fullPage);
  } finally {
    await browser.close();
  }
}

// ============================================================================
// WEB NAVIGATOR (OpenClaw-style)
// ============================================================================

export {
  WebNavigator,
  createWebNavigator,
  launchWebNavigator,
  type WebNavigatorConfig,
  type ElementRef,
  type PageSnapshot,
  type FormSnapshot,
  type LinkSnapshot,
  type SearchResult,
  type WebSearchResponse,
  type NavigationResult,
  type ActionResponse,
} from './WebNavigator.js';

// ============================================================================
// WEB SEARCH SERVICE
// ============================================================================

export {
  WebSearchService,
  createWebSearchService,
  type SearchConfig,
  type SearchEngine,
  type SearchResult as WebSearchResult,
  type ImageResult,
  type NewsResult,
  type SearchResponse,
} from './WebSearchService.js';

// ============================================================================
// CONVENIENCE FUNCTIONS FOR WEB NAVIGATION
// ============================================================================

import { WebNavigator, WebNavigatorConfig } from './WebNavigator.js';
import { WebSearchService, SearchConfig } from './WebSearchService.js';

/**
 * Quick web search - NEVER refuses search requests
 */
export async function webSearch(
  query: string,
  options?: {
    engine?: 'duckduckgo' | 'brave' | 'google' | 'bing' | 'searxng';
    maxResults?: number;
    config?: SearchConfig;
  }
): Promise<import('./WebSearchService.js').SearchResponse> {
  const service = new WebSearchService(options?.config);
  return service.search(query, {
    engine: options?.engine,
    maxResults: options?.maxResults,
  });
}

/**
 * Quick web navigate - NEVER refuses navigation requests
 */
export async function webNavigate(
  url: string,
  options?: {
    takeSnapshot?: boolean;
    config?: WebNavigatorConfig;
  }
): Promise<{
  success: boolean;
  url: string;
  title: string;
  snapshot?: import('./WebNavigator.js').PageSnapshot;
  screenshot?: string;
}> {
  const navigator = new WebNavigator(options?.config);
  await navigator.launch();

  try {
    const result = await navigator.navigate(url);

    let screenshot: string | undefined;
    if (options?.takeSnapshot) {
      screenshot = await navigator.screenshot();
    }

    return {
      success: result.success,
      url: result.url,
      title: result.title,
      snapshot: result.snapshot,
      screenshot,
    };
  } finally {
    await navigator.close();
  }
}

/**
 * Quick form fill and submit
 */
export async function webFillForm(
  url: string,
  formData: Record<string, string>,
  options?: {
    submit?: boolean;
    config?: WebNavigatorConfig;
  }
): Promise<{ success: boolean; finalUrl: string; screenshot?: string }> {
  const navigator = new WebNavigator(options?.config);
  await navigator.launch();

  try {
    await navigator.navigate(url);
    await navigator.fillForm(formData, options?.submit);

    const screenshot = await navigator.screenshot();

    return {
      success: true,
      finalUrl: navigator.getCurrentUrl() || url,
      screenshot,
    };
  } catch (error) {
    return {
      success: false,
      finalUrl: navigator.getCurrentUrl() || url,
    };
  } finally {
    await navigator.close();
  }
}

// ============================================================================
// BROWSER AUTOMATION SERVICE (Session-based)
// ============================================================================

export {
  BrowserAutomationService,
  createBrowserAutomation,
  type BrowserSessionConfig,
  type BrowserSession,
  type BrowserAction,
  type ActionType as SessionActionType,
  type ActionResult as SessionActionResult,
  type ElementInfo,
  type DOMSnapshot,
  type FormInfo as SessionFormInfo,
  type FormFieldInfo as SessionFormFieldInfo,
  type LinkInfo as SessionLinkInfo,
  type ImageInfo as SessionImageInfo,
  type CookieData,
  type SafetyConfig,
  type ProxyConfig,
  type SessionStatus,
  type NavigationEntry,
} from '../services/browserAutomation.js';

// ============================================================================
// BROWSER AGENT SERVICE (AI-powered)
// ============================================================================

export {
  BrowserAgentService,
  createBrowserAgent,
  type BrowserAgentConfig,
  type TaskPlan,
  type TaskStep,
  type TaskStatus,
  type TaskStepResult,
  type PlannedAction,
  type ActionTarget as AgentActionTarget,
  type UserIntent,
  type ElementMatch,
  type AgentThought,
} from '../services/browserAgent.js';

// ============================================================================
// API ROUTES & WEBSOCKET
// ============================================================================

export { createBrowserRouter } from '../api/routes/browser.js';
export {
  BrowserWebSocketHandler,
  createBrowserWebSocketHandler,
} from '../api/routes/browserWebSocket.js';

// ============================================================================
// BROWSER SYSTEM FACTORY
// ============================================================================

import { BrowserAutomationService, createBrowserAutomation, SafetyConfig } from '../services/browserAutomation.js';
import { BrowserAgentService, createBrowserAgent, BrowserAgentConfig } from '../services/browserAgent.js';
import { createBrowserRouter } from '../api/routes/browser.js';
import { createBrowserWebSocketHandler, BrowserWebSocketHandler } from '../api/routes/browserWebSocket.js';
import { Router } from 'express';

/**
 * Configuration for creating a complete browser system
 */
export interface BrowserSystemConfig {
  safety?: SafetyConfig;
  agent?: BrowserAgentConfig;
  webSocketPort?: number;
}

/**
 * Complete browser automation system
 */
export interface BrowserSystem {
  browserService: BrowserAutomationService;
  agentService: BrowserAgentService;
  router: Router;
  wsHandler: BrowserWebSocketHandler;
  cleanup: () => Promise<void>;
}

/**
 * Create a complete browser automation system with all components
 */
export function createBrowserSystem(config: BrowserSystemConfig = {}): BrowserSystem {
  // Create core service
  const browserService = createBrowserAutomation(config.safety);

  // Create AI agent
  const agentService = createBrowserAgent(browserService, config.agent);

  // Create API router
  const router = createBrowserRouter({ browserService });

  // Create WebSocket handler
  const wsHandler = createBrowserWebSocketHandler(browserService, config.webSocketPort);

  // Cleanup function
  const cleanup = async () => {
    await browserService.cleanup();
    wsHandler.close();
  };

  return {
    browserService,
    agentService,
    router,
    wsHandler,
    cleanup,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default HybridBrowser;
