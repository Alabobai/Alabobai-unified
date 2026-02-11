import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Globe, RefreshCw, ArrowLeft, ArrowRight, ExternalLink,
  Loader2, MousePointer2, Maximize2, Minimize2, Search, AlertCircle
} from 'lucide-react'
import browserAutomation from '@/services/browserAutomation'

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
  state: BrowserState | null
  isLive?: boolean
  onRefresh?: () => void
  onNavigate?: (url: string) => void
}

export default function BrowserPreview({
  state,
  isLive = false,
  onRefresh,
  onNavigate
}: BrowserPreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [internalState, setInternalState] = useState<BrowserState | null>(null)
  const [iframeContent, setIframeContent] = useState<string | null>(null)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoadingInternal, setIsLoadingInternal] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Use external state if provided, otherwise use internal
  const displayState = state || internalState

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

  // Set up browser automation callbacks
  useEffect(() => {
    browserAutomation.setCallbacks({
      onStateChange: (newState) => {
        setInternalState(newState)
      },
      onError: (error) => {
        setLoadError(error.message)
      }
    })
  }, [])

  const navigateToUrl = useCallback(async (url: string) => {
    if (!url.trim()) return

    setLoadError(null)
    setIsLoadingInternal(true)
    setIframeContent(null)
    setIframeSrc(null)

    // Normalize URL
    let targetUrl = url.trim()
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl
    }

    setUrlInput(targetUrl)

    // Call external handler if provided
    if (onNavigate) {
      onNavigate(targetUrl)
    }

    // Update internal state to show loading
    setInternalState({
      url: targetUrl,
      title: 'Loading...',
      isLoading: true,
    })

    try {
      // Try to load via proxy first to get content
      const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', url: targetUrl }),
      })

      if (response.ok) {
        const data = await response.json()

        setInternalState({
          url: targetUrl,
          title: data.title || getTitleFromUrl(targetUrl),
          isLoading: false,
          htmlContent: data.content,
        })

        // Use proxy content for display
        if (data.content) {
          setIframeContent(data.content)
          setIframeSrc(null)
        }
      } else {
        // Try direct iframe loading as fallback
        setIframeSrc(targetUrl)
        setInternalState({
          url: targetUrl,
          title: getTitleFromUrl(targetUrl),
          isLoading: false,
        })
      }
    } catch {
      // Fallback to direct iframe
      setIframeSrc(targetUrl)
      setInternalState({
        url: targetUrl,
        title: getTitleFromUrl(targetUrl),
        isLoading: false,
      })
    } finally {
      setIsLoadingInternal(false)
    }
  }, [onNavigate])

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigateToUrl(urlInput)
  }

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else if (displayState?.url) {
      navigateToUrl(displayState.url)
    }
  }

  const handleBack = async () => {
    await browserAutomation.goBack()
  }

  const handleForward = async () => {
    await browserAutomation.goForward()
  }

  const handleIframeError = () => {
    // If direct iframe fails, try proxy
    if (iframeSrc && displayState?.url) {
      setLoadError('Site blocked iframe loading. Using proxy mode.')
      navigateToUrl(displayState.url)
    }
  }

  // Demo sites that are iframe-friendly
  const demoSites = [
    { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { name: 'Example', url: 'https://example.com' },
    { name: 'HTTPBin', url: 'https://httpbin.org' },
  ]

  if (!displayState) {
    return (
      <div className="h-full flex flex-col bg-dark-400 rounded-xl overflow-hidden border border-white/10">
        {/* Empty Browser Chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-dark-300 border-b border-white/10">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
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
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-sm text-white/40 mb-2">Live Browser Preview</p>
            <p className="text-xs text-white/30 mb-6">Enter a URL above or try a demo site</p>

            <div className="flex flex-wrap gap-2 justify-center">
              {demoSites.map((site) => (
                <button
                  key={site.name}
                  onClick={() => navigateToUrl(site.url)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:border-rose-gold-400/30 transition-colors"
                >
                  {site.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isLoading = displayState.isLoading || isLoadingInternal

  return (
    <div className={`h-full flex flex-col bg-dark-400 rounded-xl overflow-hidden border border-white/10 ${
      isFullscreen ? 'fixed inset-4 z-50' : ''
    }`}>
      {/* Browser Chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-dark-300 border-b border-white/10">
        <div className="flex gap-1.5">
          <span
            className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors"
            onClick={() => {
              setInternalState(null)
              setIframeContent(null)
              setIframeSrc(null)
              setUrlInput('')
            }}
          />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer transition-colors" />
          <span className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer transition-colors" />
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handleBack}
            disabled={!browserAutomation.canGoBack()}
            className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleForward}
            disabled={!browserAutomation.canGoForward()}
            className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 text-white/40 hover:text-white transition-colors"
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
              <Globe className="w-4 h-4 text-green-400 flex-shrink-0" />
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
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.open(displayState.url, '_blank')}
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

      {/* Browser Content */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {/* Error Banner */}
        {loadError && (
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-2 bg-amber-500/90 text-dark-500 text-xs flex items-center gap-2">
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
              <p className="text-sm text-slate-500">Loading {displayState.title || displayState.url}...</p>
            </div>
          </div>
        )}

        {/* Iframe Content (from proxy) */}
        {iframeContent && !isLoading && (
          <iframe
            ref={iframeRef}
            srcDoc={iframeContent}
            className="w-full h-full border-0"
            title={displayState.title || 'Browser Preview'}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}

        {/* Direct Iframe */}
        {iframeSrc && !iframeContent && !isLoading && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full border-0"
            title={displayState.title || 'Browser Preview'}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            onError={handleIframeError}
          />
        )}

        {/* Fallback Simulated Page */}
        {!iframeContent && !iframeSrc && !isLoading && (
          <SimulatedWebPage url={displayState.url} title={displayState.title} />
        )}

        {/* AI Cursor Overlay */}
        {displayState.cursorPosition && cursorVisible && (
          <div
            className="absolute pointer-events-none transition-all duration-300 z-20"
            style={{
              left: `${displayState.cursorPosition.x}%`,
              top: `${displayState.cursorPosition.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative">
              <MousePointer2
                className="w-6 h-6 text-rose-gold-500 drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 0 8px rgba(217, 160, 122, 0.8))' }}
              />
              {displayState.action && (
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

        {/* Highlighted Element Overlay */}
        {displayState.highlightedElement && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div
              className="absolute border-2 border-rose-gold-400 bg-rose-gold-400/10 rounded animate-pulse"
              style={{
                left: '20%',
                top: '30%',
                width: '60%',
                height: '40px',
              }}
            />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-300 border-t border-white/10 text-xs">
        <div className="flex items-center gap-2 text-white/40">
          {isLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span>Page loaded</span>
            </>
          )}
        </div>
        {displayState.action && (
          <div className="flex items-center gap-2 text-rose-gold-400">
            <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
            <span>AI is {displayState.action.type}ing{displayState.action.target ? ` on ${displayState.action.target}` : ''}</span>
          </div>
        )}
        <div className="text-white/30 truncate max-w-[200px]">
          {new URL(displayState.url).hostname}
        </div>
      </div>
    </div>
  )
}

function getTitleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    const parts = hostname.split('.')
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  } catch {
    return 'Page'
  }
}

// Simulated web page content for fallback
function SimulatedWebPage({ url, title }: { url: string; title: string }) {
  const hostname = url ? new URL(url.startsWith('http') ? url : `https://${url}`).hostname : 'example.com'

  // Simulate different page types based on URL
  if (hostname.includes('google')) {
    return (
      <div className="w-full h-full p-8 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center mb-8">
            <span className="text-4xl font-bold">
              <span className="text-blue-500">G</span>
              <span className="text-red-500">o</span>
              <span className="text-yellow-500">o</span>
              <span className="text-blue-500">g</span>
              <span className="text-green-500">l</span>
              <span className="text-red-500">e</span>
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
          <div className="flex gap-4 text-sm text-blue-600">
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
