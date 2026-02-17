/**
 * Alabobai Browser Preview Component
 *
 * Full-featured browser preview with:
 * - Real screenshot display
 * - Click-to-interact overlay
 * - URL bar with navigation
 * - Action history panel
 * - Loading states
 * - AI cursor tracking
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Globe, RefreshCw, ArrowLeft, ArrowRight, ExternalLink,
  Loader2, MousePointer2, Maximize2, Minimize2, Search, AlertCircle,
  Camera, Eye, EyeOff, History, Target, Play, Square, Settings,
  ZoomIn, ZoomOut, RotateCcw, Code, Crosshair
} from 'lucide-react'
import browserControl, {
  BrowserSession,
  BrowserAction,
  ElementInfo,
  CursorUpdate,
  ScreenshotUpdate
} from '@/services/browserControl'
import { BRAND_GRADIENT_ACCENT, BRAND_TOKENS } from '@/config/brandTokens'

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserState {
  url: string
  title: string
  isLoading: boolean
  screenshot?: string
  htmlContent?: string
  cursorPosition?: { x: number; y: number }
  highlightedElement?: string
  action?: {
    type: 'click' | 'type' | 'scroll' | 'hover'
    target?: string
    value?: string
  }
}

interface BrowserPreviewProps {
  state?: BrowserState | null
  sessionId?: string
  isLive?: boolean
  showControls?: boolean
  showHistory?: boolean
  allowInteraction?: boolean
  onRefresh?: () => void
  onNavigate?: (url: string) => void
  onAction?: (action: BrowserAction) => void
  onSessionCreated?: (session: BrowserSession) => void
}

interface ClickOverlayProps {
  enabled: boolean
  onCoordinateClick: (x: number, y: number) => void
  highlightedElement?: { x: number; y: number; width: number; height: number }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function BrowserPreview({
  state,
  sessionId: externalSessionId,
  isLive = false,
  showControls = true,
  showHistory = false,
  allowInteraction = true,
  onRefresh,
  onNavigate,
  onAction,
  onSessionCreated,
}: BrowserPreviewProps) {
  // State
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [internalState, setInternalState] = useState<BrowserState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoadingInternal, setIsLoadingInternal] = useState(false)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [screenshotDimensions, setScreenshotDimensions] = useState<{ width: number; height: number } | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(externalSessionId || null)
  const [session, setSession] = useState<BrowserSession | null>(null)
  const [actionHistory, setActionHistory] = useState<BrowserAction[]>([])
  const [showHistoryPanel, setShowHistoryPanel] = useState(showHistory)
  const [interactionMode, setInteractionMode] = useState<'view' | 'click' | 'inspect'>('view')
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null)
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null)
  const [zoom, setZoom] = useState(100)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const screenshotRef = useRef<HTMLImageElement>(null)

  // Use external state if provided, otherwise use internal
  const displayState = state || internalState

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Update URL input when state changes
  useEffect(() => {
    if (displayState?.url) {
      setUrlInput(displayState.url)
    }
  }, [displayState?.url])

  // Blink cursor when performing actions
  useEffect(() => {
    if (displayState?.action) {
      const interval = setInterval(() => setCursorVisible(v => !v), 300)
      return () => clearInterval(interval)
    }
    setCursorVisible(true)
  }, [displayState?.action])

  // Set up browser control event listeners
  useEffect(() => {
    const handleScreenshot = (data: { sessionId: string } & ScreenshotUpdate) => {
      if (data.sessionId === sessionId) {
        setScreenshot(`data:image/png;base64,${data.base64}`)
        setScreenshotDimensions({ width: data.width, height: data.height })
      }
    }

    const handleCursorUpdate = (data: CursorUpdate) => {
      if (data.sessionId === sessionId) {
        setCursorPosition({ x: data.x, y: data.y })
      }
    }

    const handleAction = (action: BrowserAction) => {
      if (action.sessionId === sessionId) {
        setActionHistory(prev => [...prev.slice(-49), action])
        onAction?.(action)
      }
    }

    const handleSessionUpdate = (updatedSession: BrowserSession) => {
      if (updatedSession.id === sessionId) {
        setSession(updatedSession)
        setInternalState({
          url: updatedSession.currentUrl,
          title: '', // Will be updated separately
          isLoading: updatedSession.status === 'active',
        })
      }
    }

    browserControl.on('screenshot', handleScreenshot)
    browserControl.on('cursor:update', handleCursorUpdate)
    browserControl.on('action', handleAction)
    browserControl.on('session:updated', handleSessionUpdate)

    return () => {
      browserControl.off('screenshot', handleScreenshot)
      browserControl.off('cursor:update', handleCursorUpdate)
      browserControl.off('action', handleAction)
      browserControl.off('session:updated', handleSessionUpdate)
    }
  }, [sessionId, onAction])

  // Create session on mount if not provided
  useEffect(() => {
    if (!externalSessionId && !sessionId) {
      // Don't auto-create session, let user do it manually
      return
    }

    if (externalSessionId && externalSessionId !== sessionId) {
      setSessionId(externalSessionId)
    }
  }, [externalSessionId, sessionId])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const createSession = useCallback(async () => {
    setIsLoadingInternal(true)
    setLoadError(null)

    try {
      const newSession = await browserControl.createSession({
        viewport: { width: 1280, height: 720 },
        headless: true,
      })

      setSessionId(newSession.id)
      setSession(newSession)
      onSessionCreated?.(newSession)
    } catch (error) {
      setLoadError((error as Error).message)
    } finally {
      setIsLoadingInternal(false)
    }
  }, [onSessionCreated])

  const navigateToUrl = useCallback(async (url: string) => {
    if (!url.trim()) return

    // Create session if needed
    if (!sessionId) {
      await createSession()
    }

    setLoadError(null)
    setIsLoadingInternal(true)

    // Normalize URL
    let targetUrl = url.trim()
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl
    }

    setUrlInput(targetUrl)

    // Call external handler if provided
    onNavigate?.(targetUrl)

    // Update internal state to show loading
    setInternalState({
      url: targetUrl,
      title: 'Loading...',
      isLoading: true,
    })

    try {
      if (sessionId) {
        const result = await browserControl.navigate(sessionId, targetUrl)

        if (result.success) {
          setInternalState({
            url: targetUrl,
            title: (result.data as { title?: string })?.title || getTitleFromUrl(targetUrl),
            isLoading: false,
          })

          // Take screenshot
          const ssResult = await browserControl.screenshot(sessionId)
          setScreenshot(`data:image/png;base64,${ssResult.base64}`)
          setScreenshotDimensions({ width: ssResult.width, height: ssResult.height })
        } else {
          setLoadError(result.error || 'Navigation failed')
          setInternalState({
            url: targetUrl,
            title: 'Error',
            isLoading: false,
          })
        }
      } else {
        // Fallback to iframe mode
        setInternalState({
          url: targetUrl,
          title: getTitleFromUrl(targetUrl),
          isLoading: false,
        })
      }
    } catch (error) {
      setLoadError((error as Error).message)
      setInternalState({
        url: targetUrl,
        title: getTitleFromUrl(targetUrl),
        isLoading: false,
      })
    } finally {
      setIsLoadingInternal(false)
    }
  }, [sessionId, onNavigate, createSession])

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigateToUrl(urlInput)
  }

  const handleRefresh = async () => {
    if (onRefresh) {
      onRefresh()
    } else if (sessionId) {
      await browserControl.reload(sessionId)
      const ssResult = await browserControl.screenshot(sessionId)
      setScreenshot(`data:image/png;base64,${ssResult.base64}`)
    } else if (displayState?.url) {
      navigateToUrl(displayState.url)
    }
  }

  const handleBack = async () => {
    if (sessionId) {
      await browserControl.goBack(sessionId)
      const ssResult = await browserControl.screenshot(sessionId)
      setScreenshot(`data:image/png;base64,${ssResult.base64}`)
    }
  }

  const handleForward = async () => {
    if (sessionId) {
      await browserControl.goForward(sessionId)
      const ssResult = await browserControl.screenshot(sessionId)
      setScreenshot(`data:image/png;base64,${ssResult.base64}`)
    }
  }

  const handleScreenshotClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sessionId || interactionMode === 'view' || !screenshotRef.current) return

    const rect = screenshotRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * (screenshotDimensions?.width || 1280)
    const y = ((e.clientY - rect.top) / rect.height) * (screenshotDimensions?.height || 720)

    if (interactionMode === 'click') {
      await browserControl.click(sessionId, { x, y })
      const ssResult = await browserControl.screenshot(sessionId)
      setScreenshot(`data:image/png;base64,${ssResult.base64}`)
    } else if (interactionMode === 'inspect') {
      const element = await browserControl.getElementAt(sessionId, x, y)
      setHoveredElement(element)
    }
  }, [sessionId, interactionMode, screenshotDimensions])

  const handleScreenshotMove = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sessionId || interactionMode !== 'inspect' || !screenshotRef.current) return

    const rect = screenshotRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * (screenshotDimensions?.width || 1280)
    const y = ((e.clientY - rect.top) / rect.height) * (screenshotDimensions?.height || 720)

    // Debounce element inspection
    const element = await browserControl.getElementAt(sessionId, x, y)
    setHoveredElement(element)
  }, [sessionId, interactionMode, screenshotDimensions])

  const handleTakeScreenshot = async () => {
    if (!sessionId) return

    const ssResult = await browserControl.screenshot(sessionId, { fullPage: false })
    setScreenshot(`data:image/png;base64,${ssResult.base64}`)
    setScreenshotDimensions({ width: ssResult.width, height: ssResult.height })
  }

  const handleCloseSession = async () => {
    if (sessionId) {
      await browserControl.closeSession(sessionId)
      setSessionId(null)
      setSession(null)
      setScreenshot(null)
      setInternalState(null)
      setActionHistory([])
    }
  }

  // Demo sites that are iframe-friendly
  const demoSites = [
    { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { name: 'Example', url: 'https://example.com' },
    { name: 'HTTPBin', url: 'https://httpbin.org' },
  ]

  const isLoading = displayState?.isLoading || isLoadingInternal

  // ============================================================================
  // RENDER EMPTY STATE
  // ============================================================================

  if (!displayState && !sessionId) {
    return (
      <div className="h-full flex flex-col bg-dark-400 rounded-xl overflow-hidden border border-white/10">
        {/* Empty Browser Chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-dark-300 border-b border-white/10">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-gold-500/60" />
            <span className="w-3 h-3 rounded-full bg-rose-gold-500/60" />
            <span className="w-3 h-3 rounded-full bg-rose-gold-500/60" />
          </div>
          <form onSubmit={handleUrlSubmit} className="flex-1 mx-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-200 border border-white/10 focus-within:border-rose-gold-400/50 transition-colors">
              <Globe className="w-4 h-4 text-white/30" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter URL or search..."
                className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/30 outline-none"
              />
              <button type="submit" className="text-white/30 hover:text-white transition-colors">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Empty State with Quick Actions */}
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-dark-400 to-dark-500">
          <div className="text-center max-w-md px-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow-sm"
              style={{ background: BRAND_GRADIENT_ACCENT }}
            >
              <Globe className="w-8 h-8 text-dark-500" />
            </div>
            <p className="text-sm text-white/60 mb-2">Browser Automation</p>
            <p className="text-xs text-white/40 mb-6">Start a session to control a real browser</p>

            <div className="space-y-4">
              <button
                onClick={createSession}
                disabled={isLoadingInternal}
                className="w-full py-3 px-4 rounded-xl bg-rose-gold-400/20 border border-rose-gold-400/30 text-rose-gold-400 text-sm font-medium hover:bg-rose-gold-400/30 transition-all disabled:opacity-50"
              >
                {isLoadingInternal ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Play className="w-4 h-4" />
                    Start Browser Session
                  </span>
                )}
              </button>

              <div className="text-xs text-white/40 mb-4">Or try a demo site:</div>

              <div className="flex flex-wrap gap-2 justify-center">
                {demoSites.map((site) => (
                  <button
                    key={site.name}
                    onClick={() => navigateToUrl(site.url)}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    {site.name}
                  </button>
                ))}
              </div>
            </div>

            {loadError && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {loadError}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER MAIN VIEW
  // ============================================================================

  return (
    <div
      ref={containerRef}
      className={`h-full flex flex-col bg-dark-400 rounded-xl overflow-hidden border border-white/10 ${
        isFullscreen ? 'fixed inset-4 z-50' : ''
      }`}
    >
      {/* Browser Chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-dark-300 border-b border-white/10">
        <div className="flex gap-1.5">
          <span
            className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors"
            onClick={handleCloseSession}
            title="Close session"
          />
          <span
            className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer transition-colors"
            title="Minimize"
          />
          <span
            className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer transition-colors"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Fullscreen"
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handleBack}
            disabled={!session || session.historyIndex <= 0}
            className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleForward}
            disabled={!session || session.historyIndex >= session.historyLength - 1}
            className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 text-white/40 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* URL Bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 mx-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-200 border border-white/10 focus-within:border-rose-gold-400/50 transition-colors">
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin flex-shrink-0" />
            ) : (
              <Globe className="w-4 h-4 text-rose-gold-400 flex-shrink-0" />
            )}
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white/70 outline-none min-w-0"
              placeholder="Enter URL..."
            />
            {isLive && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-gold-400/20 text-rose-gold-400 text-xs flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-gold-400 animate-pulse" />
                LIVE
              </span>
            )}
            {sessionId && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                REAL
              </span>
            )}
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {showControls && allowInteraction && (
            <>
              <button
                onClick={() => setInteractionMode(interactionMode === 'click' ? 'view' : 'click')}
                className={`p-1.5 rounded transition-colors ${
                  interactionMode === 'click'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'text-white/40 hover:text-white'
                }`}
                title="Click mode"
              >
                <Crosshair className="w-4 h-4" />
              </button>
              <button
                onClick={() => setInteractionMode(interactionMode === 'inspect' ? 'view' : 'inspect')}
                className={`p-1.5 rounded transition-colors ${
                  interactionMode === 'inspect'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'text-white/40 hover:text-white'
                }`}
                title="Inspect mode"
              >
                <Target className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={handleTakeScreenshot}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title="Take screenshot"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className={`p-1.5 rounded transition-colors ${
              showHistoryPanel
                ? 'bg-rose-gold-400/20 text-rose-gold-400'
                : 'text-white/40 hover:text-white'
            }`}
            title="Action history"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => displayState?.url && window.open(displayState.url, '_blank')}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Browser Content */}
        <div className="flex-1 relative bg-white overflow-hidden">
          {/* Error Banner */}
          {loadError && (
            <div className="absolute top-0 left-0 right-0 z-10 px-4 py-2 bg-rose-gold-500/90 text-dark-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{loadError}</span>
              <button
                onClick={() => setLoadError(null)}
                className="ml-auto text-dark-500/60 hover:text-dark-500"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 z-5">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-2" />
                <p className="text-sm text-slate-500">Loading {displayState?.title || displayState?.url}...</p>
              </div>
            </div>
          )}

          {/* Screenshot Display */}
          {screenshot && !isLoading && (
            <div
              className={`w-full h-full overflow-auto flex items-center justify-center bg-slate-100 ${
                interactionMode !== 'view' ? 'cursor-crosshair' : ''
              }`}
              onClick={handleScreenshotClick}
              onMouseMove={interactionMode === 'inspect' ? handleScreenshotMove : undefined}
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
            >
              <img
                ref={screenshotRef}
                src={screenshot}
                alt="Browser screenshot"
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />

              {/* Element Highlight Overlay */}
              {hoveredElement && hoveredElement.bounds && (
                <div
                  className="absolute border-2 border-rose-gold-400 bg-rose-gold-400/10 pointer-events-none z-10"
                  style={{
                    left: hoveredElement.bounds.x,
                    top: hoveredElement.bounds.y,
                    width: hoveredElement.bounds.width,
                    height: hoveredElement.bounds.height,
                  }}
                >
                  <div className="absolute -top-6 left-0 px-2 py-1 bg-rose-gold-400 text-dark-500 text-xs rounded whitespace-nowrap">
                    {hoveredElement.tagName}
                    {hoveredElement.id && `#${hoveredElement.id}`}
                    {hoveredElement.className && `.${hoveredElement.className.split(' ')[0]}`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fallback: Simulated Page */}
          {!screenshot && !isLoading && displayState && (
            <SimulatedWebPage url={displayState.url} title={displayState.title} />
          )}

          {/* AI Cursor Overlay */}
          {(displayState?.cursorPosition || cursorPosition) && cursorVisible && (
            <div
              className="absolute pointer-events-none transition-all duration-300 z-20"
              style={{
                left: `${(displayState?.cursorPosition || cursorPosition)?.x || 0}px`,
                top: `${(displayState?.cursorPosition || cursorPosition)?.y || 0}px`,
              }}
            >
              <div className="relative">
                <MousePointer2
                  className="w-6 h-6 text-rose-gold-500 drop-shadow-lg"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(217, 160, 122, 0.8))' }}
                />
                {displayState?.action && (
                  <div className="absolute left-6 top-0 px-2 py-1 rounded bg-rose-gold-400 text-dark-500 text-xs font-medium whitespace-nowrap animate-pulse">
                    {displayState.action.type === 'click' && 'Clicking...'}
                    {displayState.action.type === 'type' && `Typing: ${displayState.action.value}`}
                    {displayState.action.type === 'scroll' && 'Scrolling...'}
                    {displayState.action.type === 'hover' && 'Hovering...'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action History Panel */}
        {showHistoryPanel && (
          <div className="w-64 border-l border-white/10 bg-dark-300 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">Action History</span>
              <span className="text-xs text-white/40">{actionHistory.length}</span>
            </div>
            <div className="flex-1 overflow-auto">
              {actionHistory.length === 0 ? (
                <div className="p-4 text-center text-xs text-white/40">
                  No actions yet
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {actionHistory.slice().reverse().map((action, index) => (
                    <div
                      key={action.id}
                      className="px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${action.success ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-xs font-medium text-white/80 capitalize">{action.type}</span>
                        <span className="text-xs text-white/30 ml-auto">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {action.data && (
                        <p className="text-xs text-white/40 truncate">
                          {JSON.stringify(action.data).substring(0, 50)}
                        </p>
                      )}
                      {action.error && (
                        <p className="text-xs text-red-400 truncate">{action.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-300 border-t border-white/10 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white/40">
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading...</span>
              </>
            ) : sessionId ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-gold-400" />
                <span>Simulated</span>
              </>
            )}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(Math.max(25, zoom - 25))}
              className="p-1 text-white/40 hover:text-white transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-white/40 w-8 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 25))}
              className="p-1 text-white/40 hover:text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="p-1 text-white/40 hover:text-white transition-colors"
              title="Reset zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {displayState?.action && (
          <div className="flex items-center gap-2 text-rose-gold-400">
            <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
            <span>AI is {displayState.action.type}ing{displayState.action.target ? ` on ${displayState.action.target}` : ''}</span>
          </div>
        )}

        <div className="text-white/30 truncate max-w-[200px]">
          {displayState?.url && new URL(displayState.url).hostname}
        </div>
      </div>

      {/* Inspect Panel */}
      {interactionMode === 'inspect' && hoveredElement && (
        <div className="absolute bottom-12 left-4 right-4 p-4 bg-dark-300/95 backdrop-blur-sm rounded-xl border border-white/10 z-30">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-white mb-2">
                &lt;{hoveredElement.tagName}&gt;
                {hoveredElement.id && <span className="text-rose-gold-400">#{hoveredElement.id}</span>}
                {hoveredElement.className && (
                  <span className="text-green-400">.{hoveredElement.className.split(' ').join('.')}</span>
                )}
              </div>
              {hoveredElement.text && (
                <p className="text-xs text-white/60 truncate">Text: {hoveredElement.text}</p>
              )}
              {hoveredElement.href && (
                <p className="text-xs text-white/60 truncate">Link: {hoveredElement.href}</p>
              )}
              <div className="text-xs text-white/40 mt-2">
                Position: ({hoveredElement.bounds.x}, {hoveredElement.bounds.y}) |
                Size: {hoveredElement.bounds.width}x{hoveredElement.bounds.height}
              </div>
            </div>
            <button
              onClick={() => {
                // Copy selector to clipboard
                let selector = hoveredElement.tagName
                if (hoveredElement.id) selector = `#${hoveredElement.id}`
                else if (hoveredElement.className) selector = `.${hoveredElement.className.split(' ')[0]}`
                navigator.clipboard.writeText(selector)
              }}
              className="px-3 py-1 rounded bg-white/10 text-white/60 text-xs hover:bg-white/20 transition-colors"
            >
              Copy Selector
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTitleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    const parts = hostname.split('.')
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  } catch {
    return 'Page'
  }
}

// ============================================================================
// SIMULATED WEB PAGE
// ============================================================================

function SimulatedWebPage({ url, title }: { url: string; title: string }) {
  const hostname = url ? new URL(url.startsWith('http') ? url : `https://${url}`).hostname : 'example.com'

  // Simulate different page types based on URL
  if (hostname.includes('google')) {
    return (
      <div className="w-full h-full p-8 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center mb-8">
            <span className="text-4xl font-bold">
              <span style={{ color: BRAND_TOKENS.accent.base }}>G</span>
              <span style={{ color: BRAND_TOKENS.accent.strong }}>o</span>
              <span style={{ color: BRAND_TOKENS.accent.base }}>o</span>
              <span style={{ color: BRAND_TOKENS.accent.strong }}>g</span>
              <span style={{ color: BRAND_TOKENS.accent.base }}>l</span>
              <span style={{ color: BRAND_TOKENS.accent.strong }}>e</span>
            </span>
          </div>
          <div className="flex items-center border border-slate-300 rounded-full px-4 py-3 shadow-sm">
            <Search className="w-5 h-5 text-slate-400 mr-3" />
            <div className="flex-1 h-5 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <button className="px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded hover:border hover:border-slate-300">
              Google Search
            </button>
            <button className="px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded hover:border hover:border-slate-300">
              I'm Feeling Lucky
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (hostname.includes('wikipedia')) {
    return (
      <div className="w-full h-full bg-white overflow-auto">
        <div className="border-b border-slate-200 px-6 py-3 flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-200 rounded-full" />
          <div className="text-xl font-serif text-slate-800">Wikipedia</div>
          <div className="flex-1" />
          <div className="flex gap-4 text-sm" style={{ color: BRAND_TOKENS.accent.base }}>
            <span>Create account</span>
            <span>Log in</span>
          </div>
        </div>
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-serif text-slate-800 mb-4 border-b border-slate-200 pb-2">
            {title || 'Article'}
          </h1>
          <p className="text-sm text-slate-600 mb-4">
            From Wikipedia, the free encyclopedia
          </p>
          <div className="space-y-4 text-slate-700">
            <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
            <div className="h-4 bg-slate-100 rounded animate-pulse w-11/12" />
            <div className="h-4 bg-slate-100 rounded animate-pulse w-10/12" />
            <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
          </div>
        </div>
      </div>
    )
  }

  // Generic page simulation
  return (
    <div className="w-full h-full bg-white overflow-auto">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="flex gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-100 to-slate-200 p-12 text-center">
        <div className="h-10 w-2/3 bg-slate-300 rounded mx-auto mb-4 animate-pulse" />
        <div className="h-6 w-1/2 bg-slate-200 rounded mx-auto animate-pulse" />
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="h-32 bg-slate-100 rounded mb-4 animate-pulse" />
              <div className="h-4 bg-slate-200 rounded mb-2 animate-pulse" />
              <div className="h-3 bg-slate-100 rounded animate-pulse w-2/3" />
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-800 text-white/60 px-6 py-8 mt-8">
        <div className="flex justify-between">
          <div className="h-4 w-32 bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-48 bg-slate-700 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}
