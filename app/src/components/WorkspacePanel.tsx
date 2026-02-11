import { useState, useEffect } from 'react'
import {
  Eye, Code2, Terminal, FolderTree, Undo2, Redo2,
  Play, RefreshCw, ExternalLink, X, ChevronRight,
  File, Folder, FileCode, FileJson, FileText,
  Globe, Zap
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import TaskExecutionPanel, { type TaskExecution } from './TaskExecutionPanel'
import BrowserPreview, { type BrowserState } from './BrowserPreview'
import taskRunner from '@/services/taskRunner'

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
    redo
  } = useAppStore()

  const [currentExecution, setCurrentExecution] = useState<TaskExecution | null>(null)
  const [browserState, setBrowserState] = useState<BrowserState | null>(null)

  // Extended tabs with Browser and Tasks
  const tabs = [
    { id: 'browser', label: 'Browser', icon: Globe },
    { id: 'tasks', label: 'Tasks', icon: Zap },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'files', label: 'Files', icon: FolderTree },
  ] as const

  // Demo: Start a sample task execution when tasks tab is active
  const startDemoExecution = async () => {
    const execution = taskRunner.createExecutionPlan('Search for latest AI developments and summarize findings')
    setCurrentExecution(execution)

    // Switch to browser tab to show the action
    setActiveTab('browser' as any)

    await taskRunner.executeTask(execution, {
      onStepStart: (_step) => {
        setCurrentExecution(prev => prev ? { ...prev } : null)
      },
      onStepComplete: (_step) => {
        setCurrentExecution(prev => prev ? { ...prev } : null)
      },
      onSourceFound: (source) => {
        setCurrentExecution(prev => {
          if (!prev) return null
          return { ...prev, sources: [...prev.sources, source] }
        })
      },
      onBrowserUpdate: (state) => {
        setBrowserState(state)
      },
      onProgress: (exec) => {
        setCurrentExecution({ ...exec })
      },
      onComplete: (exec) => {
        setCurrentExecution({ ...exec })
      },
    })
  }

  return (
    <div className="workspace-panel h-full bg-dark-400 flex flex-col">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-dark-300">
        <div className="workspace-tabs flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`workspace-tab flex items-center gap-1.5 whitespace-nowrap ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
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
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'browser' && (
          <BrowserTab
            browserState={browserState}
            execution={currentExecution}
            onStartDemo={startDemoExecution}
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

      {/* Sources Summary (shown when there are sources) */}
      {currentExecution && currentExecution.sources.length > 0 && activeTab !== 'tasks' && (
        <div className="border-t border-white/10 p-3 bg-dark-300">
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
}

function BrowserTab({ browserState, execution, onStartDemo }: BrowserTabProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Browser Preview */}
      <div className="flex-1">
        <BrowserPreview
          state={browserState}
          isLive={execution?.status === 'running'}
        />
      </div>

      {/* Quick Actions */}
      {!browserState && !execution && (
        <div className="p-4 border-t border-white/10 bg-dark-300">
          <p className="text-xs text-white/40 mb-3">Start an AI task to see live browser actions</p>
          <button
            onClick={onStartDemo}
            className="w-full py-2 px-4 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 text-sm font-medium hover:bg-rose-gold-400/30 transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Demo Task
          </button>
        </div>
      )}

      {/* Execution Mini Status */}
      {execution && (
        <div className="p-3 border-t border-white/10 bg-dark-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {execution.status === 'running' ? (
                <span className="w-2 h-2 rounded-full bg-rose-gold-400 animate-pulse" />
              ) : execution.status === 'complete' ? (
                <span className="w-2 h-2 rounded-full bg-green-400" />
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
            <span className="text-xs text-white/40">
              {execution.sources.length} sources
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewTab() {
  const { previewUrl, generatedCode, setGeneratedCode } = useAppStore()
  const [key, setKey] = useState(0) // For forcing iframe refresh

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

  const hasContent = generatedCode || previewUrl

  return (
    <div className="h-full flex flex-col">
      {/* Browser Chrome */}
      <div className="flex items-center gap-2 px-4 py-2 bg-dark-300 border-b border-white/10">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80 cursor-pointer" onClick={handleClear} title="Clear preview" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
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
            onClick={handleOpenExternal}
            disabled={!hasContent}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 bg-white overflow-hidden">
        {generatedCode ? (
          <iframe
            key={key}
            srcDoc={generatedCode}
            className="w-full h-full border-0"
            title="Generated Preview"
            sandbox="allow-scripts allow-same-origin"
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
    </div>
  )
}

function CodeTab() {
  const { files, activeFile, generatedCode } = useAppStore()
  const [MonacoEditor, setMonacoEditor] = useState<any>(null)

  const currentFile = activeFile ? findFile(files, activeFile) : null

  // Lazy load Monaco
  useEffect(() => {
    import('./MonacoEditor').then(mod => setMonacoEditor(() => mod.default))
  }, [])

  const content = currentFile?.content || generatedCode || ''

  return (
    <div className="h-full flex flex-col">
      {/* File tabs */}
      {(activeFile || generatedCode) && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-dark-300 border-b border-white/10 overflow-x-auto">
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
            <button className="text-white/40 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Code editor */}
      <div className="flex-1 overflow-hidden">
        {content && MonacoEditor ? (
          <MonacoEditor value={content} readOnly />
        ) : content ? (
          <div className="h-full overflow-auto morphic-scrollbar p-4 font-mono text-sm bg-dark-400">
            <pre className="text-white/80 whitespace-pre-wrap">{content}</pre>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-white/30 bg-dark-400">
            <div className="text-center">
              <Code2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No file selected</p>
              <p className="text-xs mt-1">Ask AI to build something or select a file</p>
            </div>
          </div>
        )}
      </div>
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
      <div className="h-full flex items-center justify-center bg-black text-white/50">
        Loading terminal...
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
