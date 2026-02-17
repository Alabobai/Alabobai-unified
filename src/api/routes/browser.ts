/**
 * Alabobai Browser Automation API Routes
 *
 * REST API endpoints for browser automation:
 * - Session management
 * - Navigation and actions
 * - Screenshot capture
 * - DOM inspection
 * - JavaScript evaluation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BrowserAutomationService, createBrowserAutomation, BrowserSession, SafetyConfig } from '../../services/browserAutomation.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CreateSessionSchema = z.object({
  sessionId: z.string().uuid().optional(),
  browserType: z.enum(['chromium', 'firefox', 'webkit']).optional(),
  headless: z.boolean().optional(),
  viewport: z.object({
    width: z.number().min(320).max(3840),
    height: z.number().min(240).max(2160),
  }).optional(),
  userAgent: z.string().optional(),
  proxy: z.object({
    server: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
    bypass: z.array(z.string()).optional(),
  }).optional(),
  timeout: z.number().min(1000).max(120000).optional(),
  persistSession: z.boolean().optional(),
});

const NavigateSchema = z.object({
  sessionId: z.string().uuid(),
  url: z.string().url().or(z.string().min(1)),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
});

const ClickSchema = z.object({
  sessionId: z.string().uuid(),
  x: z.number().optional(),
  y: z.number().optional(),
  selector: z.string().optional(),
  button: z.enum(['left', 'right', 'middle']).optional(),
  clickCount: z.number().min(1).max(3).optional(),
});

const TypeSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().max(10000),
  selector: z.string().optional(),
  delay: z.number().min(0).max(500).optional(),
});

const FillSchema = z.object({
  sessionId: z.string().uuid(),
  selector: z.string(),
  value: z.string().max(50000),
});

const PressSchema = z.object({
  sessionId: z.string().uuid(),
  key: z.string(),
  modifiers: z.array(z.enum(['Control', 'Shift', 'Alt', 'Meta'])).optional(),
});

const ScrollSchema = z.object({
  sessionId: z.string().uuid(),
  x: z.number().optional(),
  y: z.number().optional(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  selector: z.string().optional(),
});

const HoverSchema = z.object({
  sessionId: z.string().uuid(),
  x: z.number().optional(),
  y: z.number().optional(),
  selector: z.string().optional(),
});

const DragSchema = z.object({
  sessionId: z.string().uuid(),
  fromX: z.number().optional(),
  fromY: z.number().optional(),
  toX: z.number().optional(),
  toY: z.number().optional(),
  fromSelector: z.string().optional(),
  toSelector: z.string().optional(),
});

const SelectSchema = z.object({
  sessionId: z.string().uuid(),
  selector: z.string(),
  values: z.union([z.string(), z.array(z.string())]),
});

const CheckSchema = z.object({
  sessionId: z.string().uuid(),
  selector: z.string(),
});

const ScreenshotSchema = z.object({
  sessionId: z.string().uuid(),
  fullPage: z.boolean().optional(),
  selector: z.string().optional(),
  type: z.enum(['png', 'jpeg']).optional(),
  quality: z.number().min(1).max(100).optional(),
});

const EvaluateSchema = z.object({
  sessionId: z.string().uuid(),
  script: z.string().max(100000),
});

const WaitSchema = z.object({
  sessionId: z.string().uuid(),
  duration: z.number().min(0).max(60000).optional(),
  selector: z.string().optional(),
  state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional(),
});

const FindElementSchema = z.object({
  sessionId: z.string().uuid(),
  selector: z.string(),
});

const ElementAtSchema = z.object({
  sessionId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
});

const SetCookiesSchema = z.object({
  sessionId: z.string().uuid(),
  cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string().optional().default('/'),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional().default(false),
    secure: z.boolean().optional().default(false),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional().default('Lax'),
  })),
});

const SetStorageSchema = z.object({
  sessionId: z.string().uuid(),
  data: z.record(z.string()),
});

const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    sessionId: z.string().uuid(),
    url: z.string(),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  }),
  z.object({
    type: z.literal('click'),
    sessionId: z.string().uuid(),
    x: z.number().optional(),
    y: z.number().optional(),
    selector: z.string().optional(),
    button: z.enum(['left', 'right', 'middle']).optional(),
  }),
  z.object({
    type: z.literal('type'),
    sessionId: z.string().uuid(),
    text: z.string(),
    selector: z.string().optional(),
    delay: z.number().optional(),
  }),
  z.object({
    type: z.literal('fill'),
    sessionId: z.string().uuid(),
    selector: z.string(),
    value: z.string(),
  }),
  z.object({
    type: z.literal('press'),
    sessionId: z.string().uuid(),
    key: z.string(),
    modifiers: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('scroll'),
    sessionId: z.string().uuid(),
    deltaY: z.number(),
    deltaX: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.object({
    type: z.literal('hover'),
    sessionId: z.string().uuid(),
    x: z.number().optional(),
    y: z.number().optional(),
    selector: z.string().optional(),
  }),
  z.object({
    type: z.literal('wait'),
    sessionId: z.string().uuid(),
    duration: z.number().optional(),
    selector: z.string().optional(),
    state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional(),
  }),
  z.object({
    type: z.literal('screenshot'),
    sessionId: z.string().uuid(),
    fullPage: z.boolean().optional(),
    selector: z.string().optional(),
  }),
]);

// ============================================================================
// TYPES
// ============================================================================

interface BrowserRouterOptions {
  browserService?: BrowserAutomationService;
  safetyConfig?: SafetyConfig;
  requireAuth?: boolean;
}

// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================

function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        next(error);
      }
    }
  };
}

function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as T & typeof req.query;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        next(error);
      }
    }
  };
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createBrowserRouter(options: BrowserRouterOptions = {}): Router {
  const router = Router();
  const browserService = options.browserService ?? createBrowserAutomation(options.safetyConfig);

  // Helper to serialize session for API response
  const serializeSession = (session: BrowserSession) => ({
    id: session.id,
    viewport: session.viewport,
    status: session.status,
    cursorPosition: session.cursorPosition,
    historyLength: session.history.length,
    historyIndex: session.historyIndex,
    isRecording: session.isRecording,
    createdAt: session.createdAt.toISOString(),
    lastActivity: session.lastActivity.toISOString(),
    currentUrl: session.page.url(),
  });

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * POST /api/browser/session
   * Create a new browser session
   */
  router.post('/session', validate(CreateSessionSchema), async (req: Request, res: Response) => {
    try {
      const session = await browserService.createSession(req.body);

      res.status(201).json({
        success: true,
        session: serializeSession(session),
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * GET /api/browser/session/:id
   * Get session details
   */
  router.get('/session/:id', (req: Request, res: Response) => {
    try {
      const session = browserService.getSession(req.params.id);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.json({
        success: true,
        session: serializeSession(session),
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * GET /api/browser/sessions
   * Get all active sessions
   */
  router.get('/sessions', (_req: Request, res: Response) => {
    try {
      const sessions = browserService.getAllSessions();

      res.json({
        success: true,
        sessions: sessions.map(serializeSession),
        count: sessions.length,
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * DELETE /api/browser/session/:id
   * Close a browser session
   */
  router.delete('/session/:id', async (req: Request, res: Response) => {
    try {
      await browserService.closeSession(req.params.id);

      res.json({
        success: true,
        message: 'Session closed',
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/session/:id/persist
   * Persist session state
   */
  router.post('/session/:id/persist', async (req: Request, res: Response) => {
    try {
      const state = await browserService.persistSession(req.params.id);

      res.json({
        success: true,
        state: JSON.parse(state),
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * POST /api/browser/navigate
   * Navigate to a URL
   */
  router.post('/navigate', validate(NavigateSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, url, waitUntil } = req.body;
      const result = await browserService.navigate(sessionId, url, { waitUntil });

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/back
   * Go back in history
   */
  router.post('/back', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      const result = await browserService.goBack(sessionId);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/forward
   * Go forward in history
   */
  router.post('/forward', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      const result = await browserService.goForward(sessionId);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/reload
   * Reload the page
   */
  router.post('/reload', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      const result = await browserService.reload(sessionId);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // UNIFIED ACTION ENDPOINT
  // ============================================================================

  /**
   * POST /api/browser/action
   * Execute any browser action
   */
  router.post('/action', validate(ActionSchema), async (req: Request, res: Response) => {
    try {
      const action = req.body;
      let result;

      switch (action.type) {
        case 'navigate':
          result = await browserService.navigate(action.sessionId, action.url, { waitUntil: action.waitUntil });
          break;
        case 'click':
          result = await browserService.click(action.sessionId, action);
          break;
        case 'type':
          result = await browserService.type(action.sessionId, action);
          break;
        case 'fill':
          result = await browserService.fill(action.sessionId, action.selector, action.value);
          break;
        case 'press':
          result = await browserService.press(action.sessionId, action.key, { modifiers: action.modifiers as ('Control' | 'Shift' | 'Alt' | 'Meta')[] });
          break;
        case 'scroll':
          result = await browserService.scroll(action.sessionId, action);
          break;
        case 'hover':
          result = await browserService.hover(action.sessionId, action);
          break;
        case 'wait':
          result = await browserService.wait(action.sessionId, action);
          break;
        case 'screenshot':
          result = await browserService.screenshot(action.sessionId, action);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Unknown action type: ${(action as { type: string }).type}`,
          });
      }

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // MOUSE ACTIONS
  // ============================================================================

  /**
   * POST /api/browser/click
   * Click on an element or coordinates
   */
  router.post('/click', validate(ClickSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.click(sessionId, options);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/hover
   * Hover over an element
   */
  router.post('/hover', validate(HoverSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.hover(sessionId, options);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/drag
   * Drag from one position to another
   */
  router.post('/drag', validate(DragSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.drag(sessionId, options as { fromX: number; fromY: number; toX: number; toY: number });

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/scroll
   * Scroll the page
   */
  router.post('/scroll', validate(ScrollSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.scroll(sessionId, options);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // KEYBOARD ACTIONS
  // ============================================================================

  /**
   * POST /api/browser/type
   * Type text
   */
  router.post('/type', validate(TypeSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.type(sessionId, options);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/fill
   * Fill a form field
   */
  router.post('/fill', validate(FillSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, selector, value } = req.body;
      const result = await browserService.fill(sessionId, selector, value);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/press
   * Press a key
   */
  router.post('/press', validate(PressSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, key, modifiers } = req.body;
      const result = await browserService.press(sessionId, key, { modifiers });

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/select
   * Select option from dropdown
   */
  router.post('/select', validate(SelectSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, selector, values } = req.body;
      const result = await browserService.select(sessionId, selector, values);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/check
   * Check a checkbox
   */
  router.post('/check', validate(CheckSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, selector } = req.body;
      const result = await browserService.check(sessionId, selector);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/uncheck
   * Uncheck a checkbox
   */
  router.post('/uncheck', validate(CheckSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, selector } = req.body;
      const result = await browserService.uncheck(sessionId, selector);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // SCREENSHOT & DOM
  // ============================================================================

  /**
   * GET /api/browser/screenshot/:id
   * Get current screenshot
   */
  router.get('/screenshot/:id', async (req: Request, res: Response) => {
    try {
      const fullPage = req.query.fullPage === 'true';
      const selector = req.query.selector as string | undefined;
      const type = (req.query.type as 'png' | 'jpeg') || 'png';
      const quality = req.query.quality ? parseInt(req.query.quality as string) : undefined;

      const result = await browserService.screenshot(req.params.id, {
        fullPage,
        selector,
        type,
        quality,
      });

      if (!result.success || !result.data) {
        return res.status(500).json(result);
      }

      // Option to return as base64 JSON or actual image
      if (req.query.format === 'base64') {
        return res.json(result);
      }

      // Return as actual image
      const buffer = Buffer.from(result.data.base64, 'base64');
      res.set('Content-Type', `image/${type}`);
      res.send(buffer);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/screenshot
   * Take a screenshot
   */
  router.post('/screenshot', validate(ScreenshotSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.screenshot(sessionId, options);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * GET /api/browser/dom/:id
   * Get page DOM snapshot
   */
  router.get('/dom/:id', async (req: Request, res: Response) => {
    try {
      const result = await browserService.getDOM(req.params.id);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/find-element
   * Find element by selector
   */
  router.post('/find-element', validate(FindElementSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, selector } = req.body;
      const result = await browserService.findElement(sessionId, selector);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/find-elements
   * Find elements by selector
   */
  router.post('/find-elements', validate(FindElementSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, selector } = req.body;
      const result = await browserService.findElements(sessionId, selector);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/element-at
   * Get element at coordinates
   */
  router.post('/element-at', validate(ElementAtSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, x, y } = req.body;
      const result = await browserService.getElementAt(sessionId, x, y);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // JAVASCRIPT EVALUATION
  // ============================================================================

  /**
   * POST /api/browser/evaluate
   * Run JavaScript on page
   */
  router.post('/evaluate', validate(EvaluateSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, script } = req.body;
      const result = await browserService.evaluate(sessionId, script);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // WAIT OPERATIONS
  // ============================================================================

  /**
   * POST /api/browser/wait
   * Wait for a condition
   */
  router.post('/wait', validate(WaitSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ...options } = req.body;
      const result = await browserService.wait(sessionId, options);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // COOKIE & STORAGE
  // ============================================================================

  /**
   * GET /api/browser/cookies/:id
   * Get cookies
   */
  router.get('/cookies/:id', async (req: Request, res: Response) => {
    try {
      const urls = req.query.urls
        ? (Array.isArray(req.query.urls) ? req.query.urls : [req.query.urls]) as string[]
        : undefined;

      const result = await browserService.getCookies(req.params.id, urls);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/cookies
   * Set cookies
   */
  router.post('/cookies', validate(SetCookiesSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, cookies } = req.body;
      const result = await browserService.setCookies(sessionId, cookies);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * DELETE /api/browser/cookies/:id
   * Delete cookies
   */
  router.delete('/cookies/:id', async (req: Request, res: Response) => {
    try {
      const names = req.query.names
        ? (Array.isArray(req.query.names) ? req.query.names : [req.query.names]) as string[]
        : undefined;

      const result = await browserService.deleteCookies(req.params.id, names);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * GET /api/browser/storage/:id
   * Get localStorage
   */
  router.get('/storage/:id', async (req: Request, res: Response) => {
    try {
      const result = await browserService.getLocalStorage(req.params.id);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/storage
   * Set localStorage
   */
  router.post('/storage', validate(SetStorageSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, data } = req.body;
      const result = await browserService.setLocalStorage(sessionId, data);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * DELETE /api/browser/storage/:id
   * Clear localStorage
   */
  router.delete('/storage/:id', async (req: Request, res: Response) => {
    try {
      const result = await browserService.clearLocalStorage(req.params.id);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // ACTION HISTORY
  // ============================================================================

  /**
   * GET /api/browser/history/:id
   * Get action history for a session
   */
  router.get('/history/:id', (req: Request, res: Response) => {
    try {
      const history = browserService.getActionHistory(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      res.json({
        success: true,
        history: limit ? history.slice(-limit) : history,
        count: history.length,
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * DELETE /api/browser/history/:id
   * Clear action history for a session
   */
  router.delete('/history/:id', (req: Request, res: Response) => {
    try {
      browserService.clearActionHistory(req.params.id);

      res.json({
        success: true,
        message: 'History cleared',
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // RECORDING
  // ============================================================================

  /**
   * POST /api/browser/recording/start/:id
   * Start recording actions
   */
  router.post('/recording/start/:id', (req: Request, res: Response) => {
    try {
      browserService.startRecording(req.params.id);

      res.json({
        success: true,
        message: 'Recording started',
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * POST /api/browser/recording/stop/:id
   * Stop recording actions
   */
  router.post('/recording/stop/:id', (req: Request, res: Response) => {
    try {
      browserService.stopRecording(req.params.id);

      res.json({
        success: true,
        message: 'Recording stopped',
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // SAFETY CONFIG
  // ============================================================================

  /**
   * GET /api/browser/safety
   * Get safety configuration
   */
  router.get('/safety', (_req: Request, res: Response) => {
    res.json({
      success: true,
      config: browserService.getSafetyConfig(),
    });
  });

  /**
   * PATCH /api/browser/safety
   * Update safety configuration
   */
  router.patch('/safety', (req: Request, res: Response) => {
    try {
      browserService.updateSafetyConfig(req.body);

      res.json({
        success: true,
        config: browserService.getSafetyConfig(),
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  return router;
}

export default createBrowserRouter;
