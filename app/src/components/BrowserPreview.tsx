import { useState, useEffect } from 'react'
import {
  Globe, RefreshCw, ArrowLeft, ArrowRight, ExternalLink,
  Loader2, MousePointer2, Eye, Maximize2, Minimize2
} from 'lucide-react'

export interface BrowserState {
  url: string
  title: string
  isLoading: boolean
  screenshot?: string
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

export default function BrowserPreview({ state, isLive = false, onRefresh, onNavigate: _onNavigate }: BrowserPreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)

  // Blink cursor when performing actions
  useEffect(() => {
    if (state?.action) {
      const interval = setInterval(() => setCursorVisible(v => !v), 300)
      return () => clearInterval(interval)
    }
    setCursorVisible(true)
  }, [state?.action])

  if (!state) {
    return (
      <div className="h-full flex flex-col bg-dark-400 rounded-xl overflow-hidden border border-white/10">
        {/* Empty Browser Chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-dark-300 border-b border-white/10">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 mx-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-200 border border-white/10">
              <Globe className="w-4 h-4 text-white/30" />
              <span className="text-sm text-white/30">Enter URL or start a task</span>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-dark-400 to-dark-500">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-sm text-white/40">Live Browser Preview</p>
            <p className="text-xs text-white/30 mt-1">AI actions will appear here</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-full flex flex-col bg-dark-400 rounded-xl overflow-hidden border border-white/10 ${
      isFullscreen ? 'fixed inset-4 z-50' : ''
    }`}>
      {/* Browser Chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-dark-300 border-b border-white/10">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer transition-colors" />
          <span className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer transition-colors" />
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1 ml-2">
          <button className="p-1 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button className="p-1 text-white/40 hover:text-white transition-colors">
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            className="p-1 text-white/40 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${state.isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* URL Bar */}
        <div className="flex-1 mx-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-200 border border-white/10">
            {state.isLoading ? (
              <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin" />
            ) : (
              <Globe className="w-4 h-4 text-green-400" />
            )}
            <span className="text-sm text-white/70 truncate flex-1">{state.url}</span>
            {isLive && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-gold-400/20 text-rose-gold-400 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-gold-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.open(state.url, '_blank')}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
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
        {/* Screenshot/Content Display */}
        {state.screenshot ? (
          <img
            src={state.screenshot}
            alt="Browser screenshot"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            {state.isLoading ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-2" />
                <p className="text-sm text-slate-500">Loading {state.title || state.url}...</p>
              </div>
            ) : (
              <SimulatedWebPage url={state.url} title={state.title} />
            )}
          </div>
        )}

        {/* AI Cursor Overlay */}
        {state.cursorPosition && cursorVisible && (
          <div
            className="absolute pointer-events-none transition-all duration-300"
            style={{
              left: `${state.cursorPosition.x}%`,
              top: `${state.cursorPosition.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative">
              <MousePointer2 className="w-6 h-6 text-rose-gold-500 drop-shadow-lg" style={{ filter: 'drop-shadow(0 0 8px rgba(217, 160, 122, 0.8))' }} />
              {state.action && (
                <div className="absolute left-6 top-0 px-2 py-1 rounded bg-rose-gold-400 text-dark-500 text-xs font-medium whitespace-nowrap animate-pulse">
                  {state.action.type === 'click' && 'Clicking...'}
                  {state.action.type === 'type' && `Typing: ${state.action.value}`}
                  {state.action.type === 'scroll' && 'Scrolling...'}
                  {state.action.type === 'hover' && 'Hovering...'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Highlighted Element Overlay */}
        {state.highlightedElement && (
          <div className="absolute inset-0 pointer-events-none">
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
          {state.isLoading ? (
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
        {state.action && (
          <div className="flex items-center gap-2 text-rose-gold-400">
            <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
            <span>AI is {state.action.type}ing{state.action.target ? ` on ${state.action.target}` : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Simulated web page content
function SimulatedWebPage({ url, title: _title }: { url: string; title: string }) {
  const domain = url ? new URL(url.startsWith('http') ? url : `https://${url}`).hostname : 'example.com'

  // Simulate different page types based on URL
  if (domain.includes('google')) {
    return (
      <div className="w-full h-full p-8">
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

  // Generic page simulation
  return (
    <div className="w-full h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="flex gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="h-8 w-2/3 bg-slate-200 rounded mb-4 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${100 - i * 15}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

// Missing import
function Search(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
