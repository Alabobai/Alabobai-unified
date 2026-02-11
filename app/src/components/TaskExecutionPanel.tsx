import { useState, useEffect } from 'react'
import {
  Play, Pause, CheckCircle2, Circle, Loader2, Globe,
  Search, MousePointer2, Keyboard, Camera, FileText,
  ExternalLink, Clock, Zap
} from 'lucide-react'

export interface ExecutionStep {
  id: string
  type: 'navigate' | 'search' | 'click' | 'type' | 'scrape' | 'screenshot' | 'analyze'
  description: string
  status: 'pending' | 'running' | 'complete' | 'error'
  url?: string
  screenshot?: string
  duration?: number
  result?: string
}

export interface TaskExecution {
  id: string
  title: string
  status: 'running' | 'paused' | 'complete' | 'error'
  steps: ExecutionStep[]
  currentStep: number
  sources: Source[]
  startTime: Date
  browserUrl?: string
}

export interface Source {
  id: string
  title: string
  url: string
  type: 'web' | 'document' | 'api' | 'database'
  snippet?: string
  timestamp: Date
}

const stepIcons: Record<string, typeof Globe> = {
  navigate: Globe,
  search: Search,
  click: MousePointer2,
  type: Keyboard,
  scrape: FileText,
  screenshot: Camera,
  analyze: Zap,
}

interface TaskExecutionPanelProps {
  execution: TaskExecution | null
  onPause?: () => void
  onResume?: () => void
}

export default function TaskExecutionPanel({ execution, onPause, onResume }: TaskExecutionPanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    if (!execution || execution.status !== 'running') return

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - execution.startTime.getTime()) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [execution])

  if (!execution) {
    return (
      <div className="h-full flex items-center justify-center text-white/30">
        <div className="text-center">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No active task</p>
          <p className="text-xs mt-1">Start a task to see execution details</p>
        </div>
      </div>
    )
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const completedSteps = execution.steps.filter(s => s.status === 'complete').length
  const progress = (completedSteps / execution.steps.length) * 100

  return (
    <div className="h-full flex flex-col">
      {/* Task Header */}
      <div className="p-4 border-b border-white/10 bg-dark-300">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              execution.status === 'running'
                ? 'bg-rose-gold-400/20 text-rose-gold-400'
                : execution.status === 'complete'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-white/10 text-white/60'
            }`}>
              {execution.status === 'running' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : execution.status === 'complete' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Pause className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">{execution.title}</h3>
              <div className="flex items-center gap-2 text-xs text-white/50">
                <Clock className="w-3 h-3" />
                <span>{formatTime(elapsedTime)}</span>
                <span>•</span>
                <span>{completedSteps}/{execution.steps.length} steps</span>
              </div>
            </div>
          </div>
          {execution.status === 'running' ? (
            <button
              onClick={onPause}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : execution.status === 'paused' ? (
            <button
              onClick={onResume}
              className="p-2 rounded-lg text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
            >
              <Play className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-auto morphic-scrollbar p-4">
        <div className="space-y-2">
          {execution.steps.map((step, index) => {
            const Icon = stepIcons[step.type] || Circle
            const isActive = index === execution.currentStep && execution.status === 'running'

            return (
              <div
                key={step.id}
                className={`execution-step p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-rose-gold-400/10 border-rose-gold-400/30 shadow-glow-sm'
                    : step.status === 'complete'
                    ? 'bg-green-500/5 border-green-500/20'
                    : step.status === 'error'
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    isActive
                      ? 'bg-rose-gold-400/20 text-rose-gold-400'
                      : step.status === 'complete'
                      ? 'bg-green-500/20 text-green-400'
                      : step.status === 'error'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {isActive ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : step.status === 'complete' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isActive ? 'text-white' : 'text-white/70'}`}>
                      {step.description}
                    </p>
                    {step.url && (
                      <a
                        href={step.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-rose-gold-400 hover:underline mt-1"
                      >
                        <Globe className="w-3 h-3" />
                        <span className="truncate">{step.url}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {step.result && step.status === 'complete' && (
                      <p className="text-xs text-white/50 mt-1">{step.result}</p>
                    )}
                    {step.duration && (
                      <span className="text-xs text-white/30">{step.duration}ms</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sources Panel */}
      {execution.sources.length > 0 && (
        <div className="border-t border-white/10 p-4 bg-dark-300">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
            Sources ({execution.sources.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto morphic-scrollbar">
            {execution.sources.map(source => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-item block p-2 rounded-lg bg-white/5 border border-white/10 hover:border-rose-gold-400/30 hover:bg-rose-gold-400/5 transition-all"
              >
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 text-rose-gold-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{source.title}</p>
                    <p className="text-xs text-white/40 truncate">{source.url}</p>
                    {source.snippet && (
                      <p className="text-xs text-white/50 mt-1 line-clamp-2">{source.snippet}</p>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
