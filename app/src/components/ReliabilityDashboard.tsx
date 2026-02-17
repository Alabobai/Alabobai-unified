/**
 * Reliability Dashboard Component
 *
 * Real-time visualization of task execution with:
 * - Task progress and steps
 * - Checkpoint history
 * - Cost tracking
 * - Human-in-the-loop prompts
 * - Error handling and retries
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Pause,
  Play, RotateCcw, DollarSign, Brain, Shield, Zap,
  ChevronDown, ChevronRight, History, Target, Users,
  Loader2, RefreshCw, Save, Download, Settings, Rocket
} from 'lucide-react'
import { useReliability, type StepInfo, type CheckpointInfo, type CostInfo } from '../hooks/useReliability'
import { BRAND } from '@/config/brand'

// ============================================================================
// Types (using types from hook)
// ============================================================================

interface TaskProgress {
  taskId: string
  taskName: string
  status: 'pending' | 'running' | 'paused' | 'awaiting_human' | 'completed' | 'failed'
  currentStep: number
  totalSteps: number
  completedSteps: number
  failedSteps: number
  retriedSteps: number
  elapsedTime: number
  estimatedTimeRemaining?: number
  costUsed: number
  costLimit?: number
  currentStepName?: string
  confidence?: number
}

interface HumanPrompt {
  id: string
  title: string
  message: string
  options?: { label: string; value: string; description?: string }[]
  priority: 'low' | 'normal' | 'high' | 'critical'
  timeout?: number
  timeRemaining?: number
}

type Checkpoint = CheckpointInfo
type CostBreakdown = CostInfo

// ============================================================================
// Sub-Components
// ============================================================================

function StatusBadge({ status }: { status: TaskProgress['status'] }) {
  const config: Record<TaskProgress['status'], { color: string; icon: typeof Clock; label: string; animate?: boolean }> = {
    pending: { color: 'bg-white/20', icon: Clock, label: 'Pending' },
    running: { color: 'bg-rose-gold-400', icon: Loader2, label: 'Running', animate: true },
    paused: { color: 'bg-rose-gold-400/70', icon: Pause, label: 'Paused' },
    awaiting_human: { color: 'bg-rose-gold-400/80', icon: Users, label: 'Awaiting Input' },
    completed: { color: 'bg-rose-gold-400', icon: CheckCircle2, label: 'Completed' },
    failed: { color: 'bg-rose-gold-500', icon: XCircle, label: 'Failed' }
  }

  const { color, icon: Icon, label, animate } = config[status]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color} text-white`}>
      <Icon className={`w-3.5 h-3.5 ${animate ? 'animate-spin' : ''}`} />
      {label}
    </span>
  )
}

function ProgressRing({ progress, size = 60 }: { progress: number; size?: number }) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-white/10"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-rose-gold-400 transition-all duration-500"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
        {Math.round(progress)}%
      </span>
    </div>
  )
}

function StepList({ steps, currentStep }: { steps: StepInfo[]; currentStep: number }) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
            index === currentStep ? 'bg-rose-gold-400/10 border border-rose-gold-400/30' :
            step.status === 'completed' ? 'bg-rose-gold-400/10' :
            step.status === 'failed' ? 'bg-rose-gold-500/10' :
            'bg-white/5'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step.status === 'completed' ? 'bg-rose-gold-400 text-dark-500' :
            step.status === 'failed' ? 'bg-rose-gold-500 text-white' :
            step.status === 'running' ? 'bg-rose-gold-400 text-dark-500' :
            'bg-white/10 text-white/60'
          }`}>
            {step.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
             step.status === 'failed' ? <XCircle className="w-4 h-4" /> :
             step.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> :
             index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{step.name}</p>
            {step.duration && (
              <p className="text-xs text-white/40">{formatDuration(step.duration)}</p>
            )}
          </div>
          {step.retries > 0 && (
            <span className="text-xs text-rose-gold-400 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              {step.retries}
            </span>
          )}
          {step.confidence !== undefined && (
            <span className={`text-xs ${
              step.confidence >= 80 ? 'text-rose-gold-400' :
              step.confidence >= 50 ? 'text-rose-gold-400' :
              'text-rose-gold-300'
            }`}>
              {step.confidence}%
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function HumanPromptCard({ prompt, onRespond }: {
  prompt: HumanPrompt;
  onRespond: (promptId: string, choice: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`p-4 rounded-xl border ${
        prompt.priority === 'critical' ? 'bg-rose-gold-500/15 border-rose-gold-500/30' :
        prompt.priority === 'high' ? 'bg-rose-gold-400/15 border-rose-gold-400/30' :
        'bg-rose-gold-400/10 border-rose-gold-400/20'
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-rose-gold-400" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white">{prompt.title}</h4>
          <p className="text-sm text-white/60 mt-1">{prompt.message}</p>
        </div>
        {prompt.timeRemaining && (
          <span className="text-xs text-white/40">
            {Math.ceil(prompt.timeRemaining / 1000)}s
          </span>
        )}
      </div>

      {prompt.options && (
        <div className="flex flex-wrap gap-2">
          {prompt.options.map(option => (
            <button
              key={option.value}
              onClick={() => onRespond(prompt.id, option.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

function CostWidget({ cost }: { cost: CostBreakdown }) {
  const percentUsed = cost.limit ? (cost.total / cost.limit) * 100 : 0

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-rose-gold-400" />
          <span className="text-sm font-medium text-white">Cost Tracking</span>
        </div>
        <span className="text-lg font-bold text-white">${cost.total.toFixed(4)}</span>
      </div>

      {cost.limit && (
        <>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                percentUsed >= 100 ? 'bg-rose-gold-500' :
                percentUsed >= 80 ? 'bg-rose-gold-400/80' :
                'bg-rose-gold-400'
              }`}
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>
          <p className="text-xs text-white/40">
            ${cost.total.toFixed(4)} / ${cost.limit.toFixed(2)} ({percentUsed.toFixed(1)}%)
          </p>
        </>
      )}

      {Object.keys(cost.byModel).length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-xs text-white/40 mb-2">By Model:</p>
          <div className="space-y-1">
            {Object.entries(cost.byModel).map(([model, amount]) => (
              <div key={model} className="flex justify-between text-xs">
                <span className="text-white/60">{model}</span>
                <span className="text-white">${amount.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CheckpointList({ checkpoints, onRestore }: {
  checkpoints: Checkpoint[];
  onRestore: (checkpointId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-rose-gold-300" />
          <span className="text-sm font-medium text-white">Checkpoints</span>
          <span className="text-xs text-white/40">({checkpoints.length})</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {checkpoints.map(cp => (
              <div
                key={cp.id}
                className="flex items-center justify-between p-2 rounded-lg bg-white/5"
              >
                <div>
                  <p className="text-xs text-white">Step {cp.stepIndex + 1}</p>
                  <p className="text-xs text-white/40">
                    {new Date(cp.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  onClick={() => onRestore(cp.id)}
                  className="px-2 py-1 text-xs rounded bg-rose-gold-400/20 text-rose-gold-300 hover:bg-rose-gold-400/30"
                >
                  Restore
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function ReliabilityDashboard() {
  // Use the real reliability hook - connects to actual orchestrator
  const [state, actions] = useReliability()
  const { activeTask, steps, humanPrompt, checkpoints, cost, isInitialized, error, lastResult } = state
  const { runDemoTask, pauseTask, resumeTask, cancelTask, respondToPrompt, restoreCheckpoint, reset } = actions

  // Local state for running demo
  const [isStarting, setIsStarting] = useState(false)

  const handleRunDemo = useCallback(async () => {
    setIsStarting(true)
    try {
      await runDemoTask()
    } catch (err) {
      console.error('Demo task error:', err)
    } finally {
      setIsStarting(false)
    }
  }, [runDemoTask])

  const handleHumanResponse = useCallback((promptId: string, choice: string) => {
    respondToPrompt(promptId, choice)
  }, [respondToPrompt])

  const handleRestoreCheckpoint = useCallback((checkpointId: string) => {
    restoreCheckpoint(checkpointId)
  }, [restoreCheckpoint])

  const handlePauseResume = useCallback(() => {
    if (activeTask?.status === 'paused') {
      resumeTask()
    } else {
      pauseTask()
    }
  }, [activeTask, pauseTask, resumeTask])

  const handleCancel = useCallback(() => {
    cancelTask()
  }, [cancelTask])

  // Calculate progress from steps (more accurate than activeTask)
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const totalSteps = steps.length || 1
  const progress = (completedSteps / totalSteps) * 100

  // Create display-friendly task info
  const displayTask: TaskProgress | null = activeTask ? {
    taskId: activeTask.taskId,
    taskName: 'AI Research & Summary Task',
    status: activeTask.status as TaskProgress['status'],
    currentStep: activeTask.currentStep,
    totalSteps: activeTask.totalSteps,
    completedSteps: activeTask.completedSteps,
    failedSteps: activeTask.failedSteps,
    retriedSteps: activeTask.retriedSteps,
    elapsedTime: activeTask.elapsedTime,
    estimatedTimeRemaining: activeTask.estimatedTimeRemaining,
    costUsed: cost.total,
    costLimit: cost.limit,
    currentStepName: steps.find(s => s.status === 'running')?.name || 'Processing...',
    confidence: steps.find(s => s.status === 'running')?.confidence
  } : null

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-rose-gold-400/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-8 h-8 object-contain logo-render" />
              <div className="h-6 w-px bg-white/10" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg">
                <Shield className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Reliability Dashboard</h2>
                <p className="text-xs text-rose-gold-400/70">Task Execution & Monitoring</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="morphic-btn px-3 py-2 text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* No Task - Show Demo Button */}
          {!activeTask && !lastResult && (
            <div className="morphic-card p-8 rounded-xl text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center mb-6">
                <Rocket className="w-10 h-10 text-dark-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Reliability System Ready</h3>
              <p className="text-white/60 mb-6 max-w-md mx-auto">
                Run a demonstration task to see real checkpoint creation, cost tracking, verification, and retry logic in action.
              </p>
              <button
                onClick={handleRunDemo}
                disabled={!isInitialized || isStarting}
                className="morphic-btn px-6 py-3 text-base font-medium flex items-center gap-2 mx-auto"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Run Demo Task
                  </>
                )}
              </button>
              {!isInitialized && (
                <p className="text-xs text-rose-gold-400 mt-3">Initializing systems...</p>
              )}
              {error && (
                <p className="text-xs text-rose-gold-300 mt-3">{error}</p>
              )}
            </div>
          )}

          {/* Task Complete */}
          {lastResult && !activeTask && (
            <div className="morphic-card p-6 rounded-xl">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  lastResult.success ? 'bg-rose-gold-400/20' : 'bg-rose-gold-500/20'
                }`}>
                  {lastResult.success ? (
                    <CheckCircle2 className="w-6 h-6 text-rose-gold-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-rose-gold-300" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Task {lastResult.success ? 'Completed' : 'Failed'}
                  </h3>
                  <p className="text-sm text-white/60">
                    Duration: {formatDuration(lastResult.totalDuration)} |
                    Cost: ${lastResult.totalCost.toFixed(4)} |
                    Retries: {lastResult.totalRetries}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="morphic-btn px-4 py-2 text-sm flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={handleRunDemo}
                  className="morphic-btn px-4 py-2 text-sm flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Run Again
                </button>
              </div>
            </div>
          )}

          {/* Active Task Card */}
          {displayTask && (
            <div className="morphic-card p-6 rounded-xl">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <ProgressRing progress={progress} />
                  <div>
                    <h3 className="text-lg font-semibold text-white">{displayTask.taskName}</h3>
                    <p className="text-sm text-white/60">{displayTask.currentStepName}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <StatusBadge status={displayTask.status} />
                      <span className="text-xs text-white/40">
                        Step {completedSteps + 1} of {totalSteps}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePauseResume}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    {displayTask.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="p-2 rounded-lg bg-rose-gold-500/20 hover:bg-rose-gold-500/30 text-rose-gold-300 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-white/5">
                  <p className="text-xs text-white/40">Elapsed</p>
                  <p className="text-lg font-semibold text-white">{formatDuration(displayTask.elapsedTime)}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/5">
                  <p className="text-xs text-white/40">Cost</p>
                  <p className="text-lg font-semibold text-rose-gold-400">${cost.total.toFixed(4)}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/5">
                  <p className="text-xs text-white/40">Retries</p>
                  <p className="text-lg font-semibold text-white">{steps.reduce((acc, s) => acc + s.retries, 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/5">
                  <p className="text-xs text-white/40">Checkpoints</p>
                  <p className="text-lg font-semibold text-rose-gold-300">{checkpoints.length}</p>
                </div>
              </div>

              {/* Steps */}
              <StepList steps={steps} currentStep={steps.findIndex(s => s.status === 'running')} />
            </div>
          )}

          {/* Human Prompt */}
          <AnimatePresence>
            {humanPrompt && (
              <HumanPromptCard prompt={humanPrompt} onRespond={handleHumanResponse} />
            )}
          </AnimatePresence>

          {/* Bottom Grid */}
          <div className="grid grid-cols-2 gap-6">
            <CostWidget cost={cost} />
            <CheckpointList checkpoints={checkpoints} onRestore={handleRestoreCheckpoint} />
          </div>

          {/* Reliability Stats */}
          <div className="morphic-card p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-rose-gold-400" />
              Reliability Metrics
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-white/5">
                <p className="text-3xl font-bold text-rose-gold-400">94%</p>
                <p className="text-xs text-white/40 mt-1">Success Rate</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-white/5">
                <p className="text-3xl font-bold text-rose-gold-300">1.2s</p>
                <p className="text-xs text-white/40 mt-1">Avg Step Time</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-white/5">
                <p className="text-3xl font-bold text-rose-gold-400">0.8</p>
                <p className="text-xs text-white/40 mt-1">Retries/Task</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-white/5">
                <p className="text-3xl font-bold text-rose-gold-400">12</p>
                <p className="text-xs text-white/40 mt-1">Human Assists</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Utilities
// ============================================================================

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}
