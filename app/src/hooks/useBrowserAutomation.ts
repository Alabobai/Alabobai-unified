/**
 * Alabobai Browser Automation Hook
 *
 * React hook for browser automation control:
 * - Session management
 * - Action execution
 * - Real-time updates via WebSocket
 * - Screenshot streaming
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import browserControl, {
  BrowserSession,
  BrowserAction,
  ActionResult,
  ElementInfo,
  DOMSnapshot,
  ScreenshotUpdate,
  CursorUpdate,
} from '@/services/browserControl';

// ============================================================================
// TYPES
// ============================================================================

export interface UseBrowserAutomationOptions {
  autoConnect?: boolean;
  screenshotInterval?: number;
  onAction?: (action: BrowserAction) => void;
  onError?: (error: string) => void;
}

export interface BrowserAutomationState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Session
  session: BrowserSession | null;
  sessionId: string | null;
  isSessionLoading: boolean;

  // Current state
  currentUrl: string | null;
  currentTitle: string | null;
  screenshot: string | null;
  cursorPosition: { x: number; y: number } | null;

  // Actions
  isExecuting: boolean;
  lastAction: BrowserAction | null;
  actionHistory: BrowserAction[];

  // DOM
  domSnapshot: DOMSnapshot | null;
  hoveredElement: ElementInfo | null;
}

export interface BrowserAutomationActions {
  // Connection
  connect: (sessionId?: string) => void;
  disconnect: () => void;

  // Session
  createSession: (options?: {
    viewport?: { width: number; height: number };
    headless?: boolean;
    proxy?: { server: string };
  }) => Promise<BrowserSession>;
  closeSession: () => Promise<void>;

  // Navigation
  navigate: (url: string) => Promise<ActionResult>;
  goBack: () => Promise<ActionResult>;
  goForward: () => Promise<ActionResult>;
  reload: () => Promise<ActionResult>;

  // Mouse
  click: (options: { x?: number; y?: number; selector?: string }) => Promise<ActionResult>;
  rightClick: (options: { x?: number; y?: number; selector?: string }) => Promise<ActionResult>;
  hover: (options: { x?: number; y?: number; selector?: string }) => Promise<ActionResult>;
  scroll: (options: { deltaY?: number; deltaX?: number }) => Promise<ActionResult>;

  // Keyboard
  type: (text: string, selector?: string) => Promise<ActionResult>;
  fill: (selector: string, value: string) => Promise<ActionResult>;
  press: (key: string, modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[]) => Promise<ActionResult>;

  // Capture
  takeScreenshot: (options?: { fullPage?: boolean }) => Promise<{ base64: string; width: number; height: number }>;
  getDOM: () => Promise<DOMSnapshot>;
  getElementAt: (x: number, y: number) => Promise<ElementInfo | null>;

  // Evaluation
  evaluate: <T = unknown>(script: string) => Promise<T>;

  // History
  clearHistory: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useBrowserAutomation(
  options: UseBrowserAutomationOptions = {}
): [BrowserAutomationState, BrowserAutomationActions] {
  const {
    autoConnect = false,
    screenshotInterval,
    onAction,
    onError,
  } = options;

  // State
  const [state, setState] = useState<BrowserAutomationState>({
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    session: null,
    sessionId: null,
    isSessionLoading: false,
    currentUrl: null,
    currentTitle: null,
    screenshot: null,
    cursorPosition: null,
    isExecuting: false,
    lastAction: null,
    actionHistory: [],
    domSnapshot: null,
    hoveredElement: null,
  });

  // Refs
  const sessionIdRef = useRef<string | null>(null);
  const screenshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Set up event listeners
  useEffect(() => {
    const handleConnected = () => {
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false, connectionError: null }));
    };

    const handleDisconnected = () => {
      setState(prev => ({ ...prev, isConnected: false }));
    };

    const handleError = (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setState(prev => ({ ...prev, connectionError: errorMessage }));
      onError?.(errorMessage);
    };

    const handleScreenshot = (data: { sessionId: string } & ScreenshotUpdate) => {
      if (data.sessionId === sessionIdRef.current) {
        setState(prev => ({
          ...prev,
          screenshot: `data:image/png;base64,${data.base64}`,
        }));
      }
    };

    const handleCursorUpdate = (data: CursorUpdate) => {
      if (data.sessionId === sessionIdRef.current) {
        setState(prev => ({
          ...prev,
          cursorPosition: { x: data.x, y: data.y },
        }));
      }
    };

    const handleAction = (action: BrowserAction) => {
      if (action.sessionId === sessionIdRef.current) {
        setState(prev => ({
          ...prev,
          lastAction: action,
          actionHistory: [...prev.actionHistory.slice(-49), action],
        }));
        onAction?.(action);
      }
    };

    const handleSessionUpdate = (session: BrowserSession) => {
      if (session.id === sessionIdRef.current) {
        setState(prev => ({
          ...prev,
          session,
          currentUrl: session.currentUrl,
        }));
      }
    };

    browserControl.on('connected', handleConnected as (...args: unknown[]) => void);
    browserControl.on('disconnected', handleDisconnected as (...args: unknown[]) => void);
    browserControl.on('error', handleError as (...args: unknown[]) => void);
    browserControl.on('screenshot', handleScreenshot as (...args: unknown[]) => void);
    browserControl.on('cursor:update', handleCursorUpdate as (...args: unknown[]) => void);
    browserControl.on('action', handleAction as (...args: unknown[]) => void);
    browserControl.on('session:updated', handleSessionUpdate as (...args: unknown[]) => void);

    return () => {
      browserControl.off('connected', handleConnected as (...args: unknown[]) => void);
      browserControl.off('disconnected', handleDisconnected as (...args: unknown[]) => void);
      browserControl.off('error', handleError as (...args: unknown[]) => void);
      browserControl.off('screenshot', handleScreenshot as (...args: unknown[]) => void);
      browserControl.off('cursor:update', handleCursorUpdate as (...args: unknown[]) => void);
      browserControl.off('action', handleAction as (...args: unknown[]) => void);
      browserControl.off('session:updated', handleSessionUpdate as (...args: unknown[]) => void);
    };
  }, [onAction, onError]);

  // Auto connect
  useEffect(() => {
    if (autoConnect) {
      browserControl.connect();
    }

    return () => {
      if (screenshotTimerRef.current) {
        clearInterval(screenshotTimerRef.current);
      }
    };
  }, [autoConnect]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const connect = useCallback((sessionId?: string) => {
    setState(prev => ({ ...prev, isConnecting: true }));
    browserControl.connect(sessionId);
  }, []);

  const disconnect = useCallback(() => {
    browserControl.disconnect();
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const createSession = useCallback(async (sessionOptions?: {
    viewport?: { width: number; height: number };
    headless?: boolean;
    proxy?: { server: string };
  }): Promise<BrowserSession> => {
    setState(prev => ({ ...prev, isSessionLoading: true }));

    try {
      const session = await browserControl.createSession({
        viewport: sessionOptions?.viewport ?? { width: 1280, height: 720 },
        headless: sessionOptions?.headless ?? true,
        proxy: sessionOptions?.proxy,
      });

      sessionIdRef.current = session.id;

      setState(prev => ({
        ...prev,
        session,
        sessionId: session.id,
        isSessionLoading: false,
        currentUrl: session.currentUrl,
      }));

      // Start screenshot streaming if interval is set
      if (screenshotInterval) {
        screenshotTimerRef.current = setInterval(async () => {
          if (sessionIdRef.current) {
            try {
              const ss = await browserControl.screenshot(sessionIdRef.current);
              setState(prev => ({
                ...prev,
                screenshot: `data:image/png;base64,${ss.base64}`,
              }));
            } catch {
              // Ignore screenshot errors
            }
          }
        }, screenshotInterval);
      }

      return session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setState(prev => ({ ...prev, isSessionLoading: false, connectionError: errorMessage }));
      onError?.(errorMessage);
      throw error;
    }
  }, [screenshotInterval, onError]);

  const closeSession = useCallback(async () => {
    if (screenshotTimerRef.current) {
      clearInterval(screenshotTimerRef.current);
      screenshotTimerRef.current = null;
    }

    if (sessionIdRef.current) {
      await browserControl.closeSession(sessionIdRef.current);
      sessionIdRef.current = null;
    }

    setState(prev => ({
      ...prev,
      session: null,
      sessionId: null,
      screenshot: null,
      currentUrl: null,
      currentTitle: null,
      cursorPosition: null,
      actionHistory: [],
      domSnapshot: null,
    }));
  }, []);

  const executeAction = useCallback(async <T>(
    actionFn: () => Promise<T>,
    actionType?: string
  ): Promise<T> => {
    setState(prev => ({ ...prev, isExecuting: true }));

    try {
      const result = await actionFn();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onError?.(errorMessage);
      throw error;
    } finally {
      setState(prev => ({ ...prev, isExecuting: false }));
    }
  }, [onError]);

  const navigate = useCallback(async (url: string): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');

    return executeAction(async () => {
      const result = await browserControl.navigate(sessionIdRef.current!, url);

      if (result.success) {
        setState(prev => ({
          ...prev,
          currentUrl: url,
          currentTitle: (result.data as { title?: string })?.title ?? null,
        }));

        // Take screenshot after navigation
        try {
          const ss = await browserControl.screenshot(sessionIdRef.current!);
          setState(prev => ({
            ...prev,
            screenshot: `data:image/png;base64,${ss.base64}`,
          }));
        } catch {
          // Ignore screenshot errors
        }
      }

      return result;
    });
  }, [executeAction]);

  const goBack = useCallback(async (): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.goBack(sessionIdRef.current!));
  }, [executeAction]);

  const goForward = useCallback(async (): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.goForward(sessionIdRef.current!));
  }, [executeAction]);

  const reload = useCallback(async (): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.reload(sessionIdRef.current!));
  }, [executeAction]);

  const click = useCallback(async (
    clickOptions: { x?: number; y?: number; selector?: string }
  ): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.click(sessionIdRef.current!, clickOptions));
  }, [executeAction]);

  const rightClick = useCallback(async (
    clickOptions: { x?: number; y?: number; selector?: string }
  ): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.rightClick(sessionIdRef.current!, clickOptions));
  }, [executeAction]);

  const hover = useCallback(async (
    hoverOptions: { x?: number; y?: number; selector?: string }
  ): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.hover(sessionIdRef.current!, hoverOptions));
  }, [executeAction]);

  const scroll = useCallback(async (
    scrollOptions: { deltaY?: number; deltaX?: number }
  ): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.scroll(sessionIdRef.current!, scrollOptions));
  }, [executeAction]);

  const type = useCallback(async (text: string, selector?: string): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.type(sessionIdRef.current!, text, { selector }));
  }, [executeAction]);

  const fill = useCallback(async (selector: string, value: string): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.fill(sessionIdRef.current!, selector, value));
  }, [executeAction]);

  const press = useCallback(async (
    key: string,
    modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[]
  ): Promise<ActionResult> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return executeAction(() => browserControl.press(sessionIdRef.current!, key, modifiers));
  }, [executeAction]);

  const takeScreenshot = useCallback(async (
    ssOptions?: { fullPage?: boolean }
  ): Promise<{ base64: string; width: number; height: number }> => {
    if (!sessionIdRef.current) throw new Error('No active session');

    const result = await browserControl.screenshot(sessionIdRef.current, ssOptions);

    setState(prev => ({
      ...prev,
      screenshot: `data:image/png;base64,${result.base64}`,
    }));

    return result;
  }, []);

  const getDOM = useCallback(async (): Promise<DOMSnapshot> => {
    if (!sessionIdRef.current) throw new Error('No active session');

    const snapshot = await browserControl.getDOM(sessionIdRef.current);

    setState(prev => ({
      ...prev,
      domSnapshot: snapshot,
      currentTitle: snapshot.title,
    }));

    return snapshot;
  }, []);

  const getElementAt = useCallback(async (x: number, y: number): Promise<ElementInfo | null> => {
    if (!sessionIdRef.current) throw new Error('No active session');

    const element = await browserControl.getElementAt(sessionIdRef.current, x, y);

    setState(prev => ({
      ...prev,
      hoveredElement: element,
    }));

    return element;
  }, []);

  const evaluate = useCallback(async <T = unknown>(script: string): Promise<T> => {
    if (!sessionIdRef.current) throw new Error('No active session');
    return browserControl.evaluate<T>(sessionIdRef.current, script);
  }, []);

  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, actionHistory: [] }));
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  const actions: BrowserAutomationActions = {
    connect,
    disconnect,
    createSession,
    closeSession,
    navigate,
    goBack,
    goForward,
    reload,
    click,
    rightClick,
    hover,
    scroll,
    type,
    fill,
    press,
    takeScreenshot,
    getDOM,
    getElementAt,
    evaluate,
    clearHistory,
  };

  return [state, actions];
}

export default useBrowserAutomation;
