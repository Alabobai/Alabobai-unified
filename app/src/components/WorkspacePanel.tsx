import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Eye, Code2, Terminal, FolderTree, Undo2, Redo2,
  Play, RefreshCw, ExternalLink, X, ChevronRight, ChevronDown,
  File, Folder, FileCode, FileJson, FileText,
  Globe, Zap, Loader2, StopCircle, Copy, Check,
  Download, Maximize2, Minimize2
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import TaskExecutionPanel, { type TaskExecution, type Source } from './TaskExecutionPanel'
import BrowserPreview, { type BrowserState } from './BrowserPreview'
import taskRunner from '@/services/taskRunner'
import browserAutomation from '@/services/browserAutomation'
import { Spinner, ProgressBar } from './ui/LoadingSpinner'
import { SkeletonCodeBlock, SkeletonWorkspace } from './ui/Skeleton'
import { useMobile } from '@/hooks/useMobile'
import { useSwipeGesture } from '@/hooks/useTouchGestures'

const fileIcons: Record<string, typeof File> = {
  tsx: FileCode,
  ts: FileCode,
  jsx: FileCode,
  js: FileCode,
  json: FileJson,
  md: FileText,
  css: FileCode,
  html: FileCode,
}

export default function WorkspacePanel() {
  const {
    activeTab,
    setActiveTab,
    canUndo,
    canRedo,
    undo,
    redo,
    closeWorkspace
  } = useAppStore()

  const { isMobile, isTablet, isMobileOrTablet } = useMobile()
  const [currentExecution, setCurrentExecution] = useState<TaskExecution | null>(null)
  const [browserState, setBrowserState] = useState<BrowserState | null>(null)
  const [isDemoRunning, setIsDemoRunning] = useState(false)
  const [demoStep, setDemoStep] = useState('')

  // Swipe down to close on mobile
  const swipeRef = useSwipeGesture<HTMLDivElement>(
    (direction) => {
      if (direction === 'down' && isMobileOrTablet) {
        closeWorkspace()
      }
    },
    { enabled: isMobileOrTablet }
  )

  // Extended tabs - Preview and Code first for Code Builder focus
  const tabs = [
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'browser', label: 'Browser', icon: Globe },
    { id: 'tasks', label: 'Tasks', icon: Zap },
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'files', label: 'Files', icon: FolderTree },
  ] as const

  // Mobile tab navigation - cycle through tabs with swipe
  const currentTabIndex = tabs.findIndex(t => t.id === activeTab)
  const handleSwipeTab = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left' && currentTabIndex < tabs.length - 1) {
      setActiveTab(tabs[currentTabIndex + 1].id as any)
    } else if (direction === 'right' && currentTabIndex > 0) {
      setActiveTab(tabs[currentTabIndex - 1].id as any)
    }
  }, [currentTabIndex, setActiveTab, tabs])

  // Set up browser automation callbacks
  useEffect(() => {
    browserAutomation.setCallbacks({
      onStateChange: (state) => {
        setBrowserState(state)
      },
      onError: (error) => {
        console.error('Browser automation error:', error)
      }
    })
  }, [])

  // Real demo task that actually navigates to websites
  const startRealDemoTask = useCallback(async () => {
    setIsDemoRunning(true)
    setActiveTab('browser' as unknown as 'browser')

    // Create execution plan for tracking
    const execution: TaskExecution = {
      id: crypto.randomUUID(),
      title: 'Browse Wikipedia and extract AI information',
      status: 'running',
      steps: [
        { id: '1', type: 'navigate', description: 'Navigate to Wikipedia', status: 'pending' },
        { id: '2', type: 'type', description: 'Search for Artificial Intelligence', status: 'pending' },
        { id: '3', type: 'click', description: 'Click search button', status: 'pending' },
        { id: '4', type: 'navigate', description: 'Load article page', status: 'pending' },
        { id: '5', type: 'scrape', description: 'Extract page content', status: 'pending' },
      ],
      currentStep: 0,
      sources: [],
      startTime: new Date(),
    }
    setCurrentExecution(execution)

    try {
      // Step 1: Navigate to Wikipedia
      execution.steps[0].status = 'running'
      setCurrentExecution({ ...execution })
      setDemoStep('Navigating to Wikipedia...')

      await browserAutomation.navigate('https://en.wikipedia.org')
      await delay(1000)

      execution.steps[0].status = 'complete'
      execution.steps[0].duration = 1000
      execution.currentStep = 1
      setCurrentExecution({ ...execution })

      // Step 2: Type search query
      execution.steps[1].status = 'running'
      setCurrentExecution({ ...execution })
      setDemoStep('Typing search query...')

      await browserAutomation.simulateType('Artificial Intelligence', 'Search box')
      await delay(800)

      execution.steps[1].status = 'complete'
      execution.steps[1].duration = 800
      execution.currentStep = 2
      setCurrentExecution({ ...execution })

      // Step 3: Click search
      execution.steps[2].status = 'running'
      setCurrentExecution({ ...execution })
      setDemoStep('Clicking search button...')

      await browserAutomation.simulateClick('Search button')
      await delay(500)

      execution.steps[2].status = 'complete'
      execution.steps[2].duration = 500
      execution.currentStep = 3
      setCurrentExecution({ ...execution })

      // Step 4: Navigate to article
      execution.steps[3].status = 'running'
      setCurrentExecution({ ...execution })
      setDemoStep('Loading article page...')

      await browserAutomation.navigate('https://en.wikipedia.org/wiki/Artificial_intelligence')
      await delay(1200)

      execution.steps[3].status = 'complete'
      execution.steps[3].duration = 1200
      execution.currentStep = 4
      setCurrentExecution({ ...execution })

      // Step 5: Extract content
      execution.steps[4].status = 'running'
      setCurrentExecution({ ...execution })
      setDemoStep('Extracting page content...')

      const content = await browserAutomation.extractContent()
      await delay(500)

      execution.steps[4].status = 'complete'
      execution.steps[4].duration = 500
      execution.steps[4].result = content ? `Extracted: ${content.title}` : 'Content extracted'

      // Add sources
      const sources: Source[] = [
        {
          id: crypto.randomUUID(),
          title: 'Artificial intelligence - Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
          type: 'web',
          snippet: content?.description || 'Article about artificial intelligence from Wikipedia',
          timestamp: new Date(),
        }
      ]
      execution.sources = sources

      // Complete execution
      execution.status = 'complete'
      setCurrentExecution({ ...execution })
      setDemoStep('Demo completed!')

    } catch (error) {
      console.error('Demo task error:', error)
      execution.status = 'error' as TaskExecution['status']
      setCurrentExecution({ ...execution })
      setDemoStep('Demo failed')
    } finally {
      setIsDemoRunning(false)
    }
  }, [setActiveTab])

  const stopDemo = () => {
    setIsDemoRunning(false)
    if (currentExecution) {
      currentExecution.status = 'paused'
      setCurrentExecution({ ...currentExecution })
    }
  }

  const navigateBrowserToUrl = useCallback(async (url: string) => {
    const target = url.trim()
    if (!target) return

    setIsDemoRunning(false)
    setDemoStep('Opening page...')
    setActiveTab('browser' as unknown as 'browser')

    try {
      await browserAutomation.navigate(target)
      setDemoStep('')
    } catch (error) {
      setDemoStep(error instanceof Error ? error.message : 'Navigation failed')
    }
  }, [setActiveTab])

  return (
    <div
      ref={swipeRef}
      className={`
        workspace-panel h-full bg-dark-400 flex flex-col
        ${isMobileOrTablet ? 'workspace-panel-mobile open' : ''}
      `}
    >
      {/* Mobile swipe indicator */}
      {isMobileOrTablet && (
        <div className="flex justify-center pt-2">
          <div className="swipe-indicator" />
        </div>
      )}

      {/* Header with Tabs */}
      <div className={`flex items-center justify-between px-2 sm:px-4 py-2 border-b border-rose-gold-400/20 bg-dark-300/85 backdrop-blur-md ${
        isMobileOrTablet ? 'flex-wrap' : ''
      }`}>
        {/* Mobile: Tab bar at bottom, Desktop: inline tabs */}
        {isMobileOrTablet ? (
          <>
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-xs text-white/50 font-medium uppercase tracking-wider">
                {tabs.find(t => t.id === activeTab)?.label || 'Workspace'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={undo}
                  disabled={!canUndo()}
                  className="p-2 rounded text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200 framer-btn disabled:opacity-30 disabled:cursor-not-allowed touch-target"
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo()}
                  className="p-2 rounded text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200 framer-btn disabled:opacity-30 disabled:cursor-not-allowed touch-target"
                  title="Redo"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={closeWorkspace}
                  className="p-2 rounded text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200 framer-btn touch-target"
                  title="Close"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="workspace-tabs flex gap-1 overflow-x-auto w-full pb-1 -mx-2 px-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    workspace-tab-animated flex items-center gap-1.5 whitespace-nowrap btn-press touch-target
                    px-3 py-2 text-xs
                    ${activeTab === tab.id ? 'active' : ''}
                  `}
                >
                  <tab.icon className={`w-4 h-4 transition-transform duration-200 ${activeTab === tab.id ? 'scale-110' : ''}`} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.id === 'tasks' && currentExecution?.status === 'running' && (
                    <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="workspace-tabs flex gap-1 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    workspace-tab-animated flex items-center gap-1.5 whitespace-nowrap btn-press
                    ${activeTab === tab.id ? 'active' : ''}
                  `}
                >
                  <tab.icon className={`w-3.5 h-3.5 transition-transform duration-200 ${activeTab === tab.id ? 'scale-110' : ''}`} />
                  <span>{tab.label}</span>
                  {tab.id === 'tasks' && currentExecution?.status === 'running' && (
                    <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={undo}
                disabled={!canUndo()}
                className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200 framer-btn disabled:opacity-30 disabled:cursor-not-allowed btn-press icon-hover-glow"
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo()}
                className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200 framer-btn disabled:opacity-30 disabled:cursor-not-allowed btn-press icon-hover-glow"
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content with tab transition */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full tab-content-enter framer-panel" key={activeTab}>
          {activeTab === 'browser' && (
            <BrowserTab
              browserState={browserState}
              execution={currentExecution}
              onStartDemo={startRealDemoTask}
              onStopDemo={stopDemo}
              onNavigateUrl={navigateBrowserToUrl}
              isDemoRunning={isDemoRunning}
              demoStep={demoStep}
            />
          )}
          {activeTab === 'tasks' && (
            <TaskExecutionPanel
              execution={currentExecution}
              onPause={() => taskRunner.pauseExecution()}
              onResume={() => taskRunner.resumeExecution()}
            />
          )}
          {activeTab === 'preview' && <PreviewTab />}
          {activeTab === 'code' && <CodeTab />}
          {activeTab === 'terminal' && <TerminalTab />}
          {activeTab === 'files' && <FilesTab />}
        </div>
      </div>

      {/* Sources Summary (shown when there are sources) */}
      {currentExecution && currentExecution.sources.length > 0 && activeTab !== 'tasks' && (
        <div className="border-t border-rose-gold-400/20 p-3 bg-dark-300">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Sources Found ({currentExecution.sources.length})
            </div>
            <button
              onClick={() => setActiveTab('tasks' as any)}
              className="text-xs text-rose-gold-400 hover:underline"
            >
              View All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {currentExecution.sources.slice(0, 4).map(source => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-rose-gold-400/30 transition-colors"
              >
                <p className="text-xs text-white truncate max-w-[150px]">{source.title}</p>
                <p className="text-[10px] text-white/40 truncate max-w-[150px]">{new URL(source.url).hostname}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface BrowserTabProps {
  browserState: BrowserState | null
  execution: TaskExecution | null
  onStartDemo: () => void
  onStopDemo: () => void
  onNavigateUrl: (url: string) => void
  isDemoRunning: boolean
  demoStep: string
}

function BrowserTab({ browserState, execution, onStartDemo, onStopDemo, onNavigateUrl, isDemoRunning, demoStep }: BrowserTabProps) {
  const [urlInput, setUrlInput] = useState('')

  return (
    <div className="h-full flex flex-col">
      {/* Browser Preview */}
      <div className="flex-1">
        <BrowserPreview
          state={browserState}
          isLive={execution?.status === 'running' || isDemoRunning}
        />
      </div>

      <div className="p-3 border-t border-rose-gold-400/20 bg-dark-300/70">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onNavigateUrl(urlInput)
          }}
        >
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter any URL (e.g. https://news.ycombinator.com)"
            className="flex-1 px-3 py-2 rounded-lg bg-dark-200 border border-rose-gold-400/20 text-sm text-white placeholder-white/40 outline-none focus:border-rose-gold-400/50"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-rose-gold-400/20 border border-rose-gold-400/30 text-rose-gold-300 text-sm hover:bg-rose-gold-400/30 transition-colors"
          >
            Browse
          </button>
        </form>
      </div>

      {/* Quick Actions - Show when no browser state and not running */}
      {!browserState && !execution && !isDemoRunning && (
        <div className="p-4 border-t border-white/10 bg-dark-300">
          <p className="text-xs text-white/40 mb-3">
            Start an AI task to see live browser actions, or enter a URL above
          </p>
          <button
            onClick={onStartDemo}
            className="w-full py-2 px-4 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 text-sm font-medium hover:bg-rose-gold-400/30 transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Demo Task (Real Navigation)
          </button>
        </div>
      )}

      {/* Demo Running Status */}
      {isDemoRunning && (
        <div className="p-3 border-t border-white/10 bg-dark-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin" />
              <span className="text-xs text-white/70">{demoStep || 'Running demo...'}</span>
            </div>
            <button
              onClick={onStopDemo}
              className="flex items-center gap-1 px-2 py-1 rounded bg-rose-gold-500/20 text-rose-gold-400 text-xs hover:bg-rose-gold-500/30 transition-colors"
            >
              <StopCircle className="w-3 h-3" />
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Execution Mini Status */}
      {execution && !isDemoRunning && (
        <div className="p-3 border-t border-white/10 bg-dark-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {execution.status === 'running' ? (
                <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
              ) : execution.status === 'complete' ? (
                <span className="w-2 h-2 rounded-full bg-rose-gold-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-white/30" />
              )}
              <span className="text-xs text-white/70">
                {execution.status === 'running'
                  ? `Step ${execution.currentStep + 1}/${execution.steps.length}: ${execution.steps[execution.currentStep]?.description}`
                  : execution.status === 'complete'
                  ? 'Task completed'
                  : 'Task paused'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">
                {execution.sources.length} sources
              </span>
              {execution.status === 'complete' && (
                <button
                  onClick={onStartDemo}
                  className="text-xs text-rose-gold-400 hover:underline"
                >
                  Run Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper function for delays
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function PreviewTab() {
  const { previewUrl, generatedCode, setGeneratedCode, setActiveTab } = useAppStore()
  const [key, setKey] = useState(0) // For forcing iframe refresh
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleRefresh = () => {
    setKey(k => k + 1)
  }

  const handleOpenExternal = () => {
    if (generatedCode) {
      // Create a blob URL and open in new tab
      const blob = new Blob([generatedCode], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } else if (previewUrl) {
      window.open(previewUrl, '_blank')
    }
  }

  const handleClear = () => {
    setGeneratedCode(null)
  }

  const handleCopy = async () => {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (generatedCode) {
      const blob = new Blob([generatedCode], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'generated-page.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const hasContent = generatedCode || previewUrl

  return (
    <div className={`h-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-dark-400' : ''}`}>
      {/* Browser Chrome */}
      <div className="flex items-center gap-2 px-4 py-2 bg-dark-300 border-b border-rose-gold-400/20">
        <div className="flex gap-1.5">
          <span
            className="w-3 h-3 rounded-full bg-rose-gold-500/80 cursor-pointer hover:bg-rose-gold-500 transition-colors"
            onClick={handleClear}
            title="Clear preview"
          />
          <span className="w-3 h-3 rounded-full bg-rose-gold-500/80" />
          <span className="w-3 h-3 rounded-full bg-rose-gold-500/80" />
        </div>
        <div className="flex-1 mx-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-200 border border-white/10 text-xs">
            <span className="text-white/40 truncate">
              {generatedCode ? 'Generated Preview' : previewUrl || 'localhost:3000'}
            </span>
            {generatedCode && (
              <span className="px-1.5 py-0.5 rounded bg-rose-gold-400/20 text-rose-gold-400 text-[10px]">
                LIVE
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCopy}
            disabled={!generatedCode}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Copy HTML"
          >
            {copied ? <Check className="w-4 h-4 text-rose-gold-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            disabled={!generatedCode}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Download HTML"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenExternal}
            disabled={!hasContent}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 bg-white overflow-hidden">
        {generatedCode ? (
          <iframe
            ref={iframeRef}
            key={key}
            srcDoc={generatedCode}
            className="w-full h-full border-0"
            title="Generated Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : previewUrl ? (
          <iframe
            key={key}
            src={previewUrl}
            className="w-full h-full border-0"
            title="Preview"
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-dark-400 text-white/30">
            <div className="text-center">
              <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No preview available</p>
              <p className="text-xs mt-1">Ask AI to build something to see it here</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions Bar */}
      {generatedCode && (
        <div className="flex items-center justify-between px-4 py-2 bg-dark-300 border-t border-rose-gold-400/20">
          <button
            onClick={() => setActiveTab('code')}
            className="text-xs text-rose-gold-400 hover:underline flex items-center gap-1"
          >
            <Code2 className="w-3 h-3" />
            Edit Code
          </button>
          <span className="text-xs text-white/40">
            {generatedCode.length.toLocaleString()} characters
          </span>
        </div>
      )}
    </div>
  )
}

function CodeTab() {
  const { files, activeFile, generatedCode, setGeneratedCode, setActiveTab } = useAppStore()
  const [MonacoEditor, setMonacoEditor] = useState<any>(null)
  const [editableCode, setEditableCode] = useState<string>('')
  const [hasChanges, setHasChanges] = useState(false)
  const lastSyncedSourceRef = useRef<string | null>(null)

  const currentFile = activeFile ? findFile(files, activeFile) : null
  const sourceContent = currentFile?.content ?? generatedCode ?? ''

  // Lazy load Monaco
  useEffect(() => {
    import('./MonacoEditor').then(mod => setMonacoEditor(() => mod.default))
  }, [])

  // Sync editable code when source changes, but avoid clobbering in-progress edits
  useEffect(() => {
    if (sourceContent === lastSyncedSourceRef.current) return

    if (!hasChanges) {
      setEditableCode(sourceContent)
      setHasChanges(false)
      lastSyncedSourceRef.current = sourceContent
    }
  }, [sourceContent, hasChanges])

  const handleCodeChange = useCallback((value: string) => {
    setEditableCode(value)
    setHasChanges(value !== sourceContent)
  }, [sourceContent])

  const handleApplyChanges = () => {
    if (editableCode) {
      setGeneratedCode(editableCode)
      setHasChanges(false)
      setActiveTab('preview')
    }
  }

  const content = editableCode

  // Detect language
  const detectLanguage = (code: string): string => {
    if (code.includes('<!DOCTYPE') || code.includes('<html')) return 'html'
    if (code.includes('import React') || code.includes('useState')) return 'typescript'
    if (code.includes('def ') && code.includes(':')) return 'python'
    return 'typescript'
  }

  return (
    <div className="h-full flex flex-col">
      {/* File tabs */}
      {(activeFile || generatedCode || editableCode) && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-dark-300 border-b border-rose-gold-400/20">
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-dark-200 border border-white/10 text-xs">
            <FileCode className="w-3.5 h-3.5 text-rose-gold-400" />
            <span className="text-white/80">
              {activeFile ? activeFile.split('/').pop() : 'Generated Code'}
            </span>
            {generatedCode && !activeFile && (
              <span className="px-1.5 py-0.5 rounded bg-rose-gold-400/20 text-rose-gold-400 text-[10px]">
                AI
              </span>
            )}
            {hasChanges && (
              <span className="px-1.5 py-0.5 rounded bg-rose-gold-500/20 text-rose-gold-400 text-[10px]">
                MODIFIED
              </span>
            )}
            <button className="text-white/40 hover:text-white ml-1">
              <X className="w-3 h-3" />
            </button>
          </div>
          {hasChanges && (
            <button
              onClick={handleApplyChanges}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-gold-400/20 text-rose-gold-400 text-xs hover:bg-rose-gold-400/30 transition-colors"
            >
              <Play className="w-3 h-3" />
              Apply & Preview
            </button>
          )}
        </div>
      )}

      {/* Code editor */}
      <div className="flex-1 overflow-hidden">
        {content && MonacoEditor ? (
          <MonacoEditor
            value={editableCode}
            language={detectLanguage(content)}
            onChange={handleCodeChange}
            readOnly={false}
          />
        ) : content && !MonacoEditor ? (
          /* Loading Monaco - show skeleton */
          <div className="h-full bg-dark-400 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Spinner size="sm" />
              <span className="text-xs text-white/50">Loading editor...</span>
            </div>
            <SkeletonCodeBlock lines={15} />
          </div>
        ) : content ? (
          <div className="h-full overflow-auto morphic-scrollbar p-4 font-mono text-sm bg-dark-400">
            <pre className="text-white/80 whitespace-pre-wrap">{content}</pre>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-white/30 bg-dark-400">
            <div className="text-center animate-fade-in-up">
              <Code2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No code to display</p>
              <p className="text-xs mt-1">Ask AI to build something or select a file</p>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {content && (
        <div className="flex items-center justify-between px-4 py-2 bg-dark-300 border-t border-rose-gold-400/20 text-xs text-white/40">
          <span>{detectLanguage(content).toUpperCase()}</span>
          <span>{content.split('\n').length} lines</span>
        </div>
      )}
    </div>
  )
}

function TerminalTab() {
  const [TerminalComponent, setTerminalComponent] = useState<any>(null)

  // Lazy load Terminal
  useEffect(() => {
    import('./TerminalComponent').then(mod => setTerminalComponent(() => mod.default))
  }, [])

  if (!TerminalComponent) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-dark-400 animate-fade-in-up">
        <div className="mb-4">
          <Spinner size="lg" />
        </div>
        <p className="text-white/50 text-sm">Loading terminal...</p>
        <ProgressBar size="sm" className="w-48 mt-4" />
      </div>
    )
  }

  return <TerminalComponent />
}

function FilesTab() {
  const { files } = useAppStore()

  // Sample file structure
  const sampleFiles = files.length > 0 ? files : [
    {
      id: '1',
      name: 'src',
      path: '/src',
      type: 'folder' as const,
      children: [
        { id: '2', name: 'App.tsx', path: '/src/App.tsx', type: 'file' as const },
        { id: '3', name: 'main.tsx', path: '/src/main.tsx', type: 'file' as const },
        { id: '4', name: 'styles.css', path: '/src/styles.css', type: 'file' as const },
      ]
    },
    { id: '5', name: 'package.json', path: '/package.json', type: 'file' as const },
    { id: '6', name: 'README.md', path: '/README.md', type: 'file' as const },
  ]

  return (
    <div className="h-full overflow-auto morphic-scrollbar p-2">
      <FileTreeNode nodes={sampleFiles} level={0} />
    </div>
  )
}

function FileTreeNode({ nodes, level }: { nodes: any[], level: number }) {
  const { activeFile, setActiveFile } = useAppStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  return (
    <div className="space-y-0.5">
      {nodes.map(node => {
        const isFolder = node.type === 'folder'
        const isExpanded = expanded[node.id]
        const isActive = activeFile === node.path
        const ext = node.name.split('.').pop() || ''
        const Icon = isFolder ? Folder : (fileIcons[ext] || File)

        return (
          <div key={node.id}>
            <button
              onClick={() => {
                if (isFolder) {
                  setExpanded(prev => ({ ...prev, [node.id]: !prev[node.id] }))
                } else {
                  setActiveFile(node.path)
                }
              }}
              className={`file-tree-item w-full ${isActive ? 'active' : ''}`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              {isFolder && (
                <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              )}
              <Icon className={`w-4 h-4 ${isFolder ? 'text-rose-gold-400' : 'text-white/50'}`} />
              <span className="truncate">{node.name}</span>
            </button>
            {isFolder && isExpanded && node.children && (
              <FileTreeNode nodes={node.children} level={level + 1} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function findFile(files: any[], path: string): any | null {
  for (const file of files) {
    if (file.path === path) return file
    if (file.children) {
      const found = findFile(file.children, path)
      if (found) return found
    }
  }
  return null
}
