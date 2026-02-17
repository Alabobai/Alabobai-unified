import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play, Pause, Square, Zap, Brain,
  CheckCircle2, Circle, Loader2, ArrowRight, Sparkles,
  Target, Code2, Search, BarChart3,
  FileCode, Globe, FileText, Copy, ExternalLink,
  ChevronDown, ChevronRight, AlertCircle, RefreshCw, Thermometer,
  Activity, MemoryStick, Clock, Shield, Wrench, Eye, XCircle,
  ListChecks, CircleDot, CircleSlash, RotateCcw
} from 'lucide-react'
import {
  autonomousAgent,
  type AutonomousAgentStatus,
  type ExecutionPlan,
  type ExecutionStep,
  type AgentMemoryEntry,
  type AgentOutput,
  type StepStatus
} from '@/services/autonomousAgent'
import { selfAnnealingEngine, type AnnealingState } from '@/services/selfAnnealingEngine'
import { BRAND } from '@/config/brand'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface AutonomousAgentViewProps {
  onClose?: () => void
}

interface LogEntry {
  id: string
  timestamp: Date
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  type: 'status' | 'step' | 'output' | 'memory' | 'self_heal' | 'rollback'
}

interface SelfHealingEvent {
  id: string
  timestamp: Date
  issue: string
  resolution: string
}

// ============================================================================
// ICON MAPPINGS
// ============================================================================

const toolIcons: Record<string, typeof Brain> = {
  web_search: Search,
  code_generation: Code2,
  file_operation: FileText,
  browser_automation: Globe,
  data_analysis: BarChart3,
  ai_reasoning: Brain
}

const statusColors: Record<AutonomousAgentStatus, { bg: string; text: string; border: string }> = {
  idle: { bg: 'bg-white/10', text: 'text-white/60', border: 'border-white/20' },
  planning: { bg: 'bg-rose-gold-400/15', text: 'text-rose-gold-300', border: 'border-rose-gold-400/20' },
  executing: { bg: 'bg-rose-gold-400/20', text: 'text-rose-gold-400', border: 'border-rose-gold-400/30' },
  validating: { bg: 'bg-rose-gold-400/25', text: 'text-rose-gold-300', border: 'border-rose-gold-400/30' },
  self_healing: { bg: 'bg-rose-gold-400/20', text: 'text-rose-gold-400', border: 'border-rose-gold-400/25' },
  rolling_back: { bg: 'bg-rose-gold-500/20', text: 'text-rose-gold-300', border: 'border-rose-gold-500/25' },
  complete: { bg: 'bg-rose-gold-400/25', text: 'text-rose-gold-300', border: 'border-rose-gold-400/35' },
  failed: { bg: 'bg-rose-gold-500/25', text: 'text-rose-gold-300', border: 'border-rose-gold-500/30' },
  paused: { bg: 'bg-white/15', text: 'text-white/70', border: 'border-white/25' }
}

const stepStatusIcons: Record<StepStatus, typeof Circle> = {
  pending: Circle,
  running: Loader2,
  success: CheckCircle2,
  failed: XCircle,
  skipped: CircleSlash,
  rolled_back: RotateCcw
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AutonomousAgentView({ onClose: _onClose }: AutonomousAgentViewProps) {
  // Core state
  const [goal, setGoal] = useState('')
  const [isStarted, setIsStarted] = useState(false)
  const [status, setStatus] = useState<AutonomousAgentStatus>('idle')
  const [plan, setPlan] = useState<ExecutionPlan | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentPhase, setCurrentPhase] = useState('')

  // Memory and context
  const [memory, setMemory] = useState<AgentMemoryEntry[]>([])
  const [selectedOutput, setSelectedOutput] = useState<AgentOutput | null>(null)

  // Activity logs
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selfHealingEvents, setSelfHealingEvents] = useState<SelfHealingEvent[]>([])

  // Annealing state
  const [annealingState, setAnnealingState] = useState<AnnealingState | null>(null)

  // UI state
  const [activeTab, setActiveTab] = useState<'plan' | 'memory' | 'outputs' | 'healing'>('plan')
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  // Refs
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Update annealing state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setAnnealingState(selfAnnealingEngine.getState())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Add log entry
  const addLog = useCallback((message: string, level: LogEntry['level'], type: LogEntry['type'] = 'status') => {
    setLogs(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message,
      level,
      type
    }])
  }, [])

  // Start execution
  const startExecution = useCallback(async () => {
    if (!goal.trim()) return

    setIsStarted(true)
    setLogs([])
    setSelfHealingEvents([])
    setMemory([])
    setSelectedOutput(null)
    setExpandedSteps(new Set())
    setActiveTab('plan')

    addLog(`Starting autonomous execution: "${goal}"`, 'info', 'status')

    // Set up callbacks
    autonomousAgent.setCallbacks({
      onStatusChange: (newStatus) => {
        setStatus(newStatus)
        addLog(`Status changed to: ${newStatus}`, 'info', 'status')
      },
      onStepStart: (step) => {
        addLog(`Starting step: ${step.description}`, 'info', 'step')
        setExpandedSteps(prev => new Set([...prev, step.id]))
      },
      onStepComplete: (step) => {
        addLog(`Completed: ${step.description}`, 'success', 'step')
      },
      onStepError: (step, error) => {
        addLog(`Error in "${step.description}": ${error}`, 'error', 'step')
      },
      onOutput: (output) => {
        addLog(`Generated output: ${output.title}`, 'success', 'output')
        setSelectedOutput(output)
      },
      onProgress: (percent, phase) => {
        setProgress(percent)
        setCurrentPhase(phase)
      },
      onMemoryUpdate: (entry) => {
        setMemory(prev => [...prev, entry])
        if (entry.type === 'error' || entry.type === 'learning') {
          addLog(`Memory: [${entry.type}] ${entry.content.slice(0, 100)}...`,
            entry.type === 'error' ? 'warning' : 'info', 'memory')
        }
      },
      onSelfHeal: (issue, resolution) => {
        addLog(`Self-healing: ${issue}`, 'warning', 'self_heal')
        addLog(`Resolution: ${resolution}`, 'info', 'self_heal')
        setSelfHealingEvents(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          issue,
          resolution
        }])
        setActiveTab('healing')
      },
      onRollback: (step, reason) => {
        addLog(`Rolling back: ${step.description} - ${reason}`, 'warning', 'rollback')
      },
      onLog: (message, level) => {
        addLog(message, level, 'status')
      }
    })

    // Execute
    const result = await autonomousAgent.execute(goal)
    setPlan(result)

    if (result.status === 'complete') {
      addLog('Execution completed successfully!', 'success', 'status')
    } else if (result.status === 'failed') {
      addLog('Execution failed or was stopped', 'error', 'status')
    }
  }, [goal, addLog])

  // Control functions
  const pauseExecution = () => {
    autonomousAgent.pause()
    addLog('Execution paused', 'warning', 'status')
  }

  const resumeExecution = () => {
    autonomousAgent.resume()
    addLog('Execution resumed', 'info', 'status')
  }

  const stopExecution = () => {
    autonomousAgent.stop()
    addLog('Execution stopped', 'error', 'status')
  }

  const resetExecution = () => {
    setIsStarted(false)
    setStatus('idle')
    setPlan(null)
    setProgress(0)
    setCurrentPhase('')
    setLogs([])
    setMemory([])
    setSelfHealingEvents([])
    setSelectedOutput(null)
    autonomousAgent.clearMemory()
  }

  const copyOutput = (content: string) => {
    navigator.clipboard.writeText(content)
    addLog('Copied to clipboard', 'success', 'status')
  }

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-dark-500 overflow-auto">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-8 h-8 object-contain logo-render" />
              <div className="h-6 w-px bg-white/10" />
            </div>

            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
                <Brain className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Autonomous Agent</h2>
                <p className="text-xs text-rose-gold-400/70">{BRAND.name} intelligent task execution</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Status Badge */}
            <StatusBadge status={status} />

            {/* Control Buttons */}
            {isStarted && (
              <>
                {status === 'executing' || status === 'planning' || status === 'validating' ? (
                  <button
                    onClick={pauseExecution}
                    className="morphic-btn p-2"
                    title="Pause"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                ) : status === 'paused' ? (
                  <button
                    onClick={resumeExecution}
                    className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 p-2"
                    title="Resume"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                ) : null}

                {status !== 'complete' && status !== 'failed' && status !== 'idle' && (
                  <button
                    onClick={stopExecution}
                    className="morphic-btn-ghost bg-rose-gold-500/20 text-rose-gold-300 border-rose-gold-500/30 hover:bg-rose-gold-500/30 p-2"
                    title="Stop"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                )}

                {(status === 'complete' || status === 'failed') && (
                  <button
                    onClick={resetExecution}
                    className="morphic-btn p-2"
                    title="Reset"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {isStarted && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/70">{currentPhase || 'Initializing...'}</span>
              <span className="text-sm text-rose-gold-400">{progress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 rounded-full transition-all duration-500 relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-shimmer" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {!isStarted ? (
          /* Goal Input Screen */
          <GoalInputScreen
            goal={goal}
            setGoal={setGoal}
            onStart={startExecution}
          />
        ) : (
          /* Execution View - Three Panel Layout */
          <>
            {/* Left Panel - Plan & Steps */}
            <div className="w-80 min-w-[320px] border-r border-white/10 flex flex-col min-h-0 overflow-hidden">
              {/* Tab Navigation */}
              <div className="flex border-b border-white/10">
                {(['plan', 'memory', 'outputs', 'healing'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? 'text-rose-gold-400 border-b-2 border-rose-gold-400 bg-rose-gold-400/10'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    {tab === 'plan' && <ListChecks className="w-3 h-3 inline mr-1" />}
                    {tab === 'memory' && <MemoryStick className="w-3 h-3 inline mr-1" />}
                    {tab === 'outputs' && <FileText className="w-3 h-3 inline mr-1" />}
                    {tab === 'healing' && <Wrench className="w-3 h-3 inline mr-1" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'healing' && selfHealingEvents.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-gold-400/20 text-rose-gold-300 text-[10px]">
                        {selfHealingEvents.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto morphic-scrollbar p-3">
                {activeTab === 'plan' && (
                  <PlanPanel
                    plan={plan}
                    expandedSteps={expandedSteps}
                    onToggleStep={toggleStepExpanded}
                  />
                )}
                {activeTab === 'memory' && (
                  <MemoryPanel memory={memory} />
                )}
                {activeTab === 'outputs' && (
                  <OutputsPanel
                    outputs={plan?.outputs || []}
                    selectedOutput={selectedOutput}
                    onSelectOutput={setSelectedOutput}
                  />
                )}
                {activeTab === 'healing' && (
                  <SelfHealingPanel events={selfHealingEvents} />
                )}
              </div>

              {/* Annealing State */}
              <AnnealingStatePanel state={annealingState} />
            </div>

            {/* Center Panel - Activity Log */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex-shrink-0">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  Activity Log
                </h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto morphic-scrollbar p-3">
                <div className="space-y-1">
                  {logs.map(log => (
                    <ActivityLogEntry key={log.id} log={log} />
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* Right Panel - Output Preview */}
            <div className="w-96 min-w-[384px] border-l border-white/10 flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex-shrink-0">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-3 h-3" />
                  Output Preview
                </h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <OutputPreviewPanel
                  output={selectedOutput}
                  onCopy={copyOutput}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatusBadge({ status }: { status: AutonomousAgentStatus }) {
  const colors = statusColors[status]
  const isAnimated = ['executing', 'planning', 'validating', 'self_healing'].includes(status)

  return (
    <div className={`px-3 py-1.5 rounded-lg ${colors.bg} ${colors.border} border flex items-center gap-2`}>
      {isAnimated ? (
        <Loader2 className={`w-3 h-3 ${colors.text} animate-spin`} />
      ) : status === 'complete' ? (
        <CheckCircle2 className={`w-3 h-3 ${colors.text}`} />
      ) : status === 'failed' ? (
        <XCircle className={`w-3 h-3 ${colors.text}`} />
      ) : (
        <CircleDot className={`w-3 h-3 ${colors.text}`} />
      )}
      <span className={`text-xs font-medium ${colors.text} capitalize`}>
        {status.replace('_', ' ')}
      </span>
    </div>
  )
}

function GoalInputScreen({
  goal,
  setGoal,
  onStart
}: {
  goal: string
  setGoal: (goal: string) => void
  onStart: () => void
}) {
  const suggestions = [
    'Research AI agents and build a landing page',
    'Search for SaaS trends and create a dashboard',
    'Analyze competitors and generate a report',
    'Build an analytics dashboard component'
  ]

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4 animate-float">
            <Sparkles className="w-10 h-10 text-rose-gold-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            What do you want to accomplish?
          </h2>
          <p className="text-white/50">
            The agent will autonomously plan, execute, validate, and self-heal
          </p>
        </div>

        <div className="morphic-card p-1 rounded-2xl mb-4">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe your goal... e.g., Research the latest trends in AI agents and create a landing page"
            className="w-full h-32 p-4 bg-transparent text-white placeholder-white/30 resize-none focus:outline-none"
          />
        </div>

        <button
          onClick={onStart}
          disabled={!goal.trim()}
          className="w-full morphic-btn py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <span className="flex items-center justify-center gap-2">
            <Zap className="w-5 h-5 group-hover:animate-bounce" />
            Start Autonomous Execution
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </span>
        </button>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setGoal(suggestion)}
              className="morphic-card p-3 rounded-xl text-left text-sm text-white/60 hover:text-white hover:border-rose-gold-400/30 transition-all"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlanPanel({
  plan,
  expandedSteps,
  onToggleStep
}: {
  plan: ExecutionPlan | null
  expandedSteps: Set<string>
  onToggleStep: (stepId: string) => void
}) {
  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-white/30 animate-spin mx-auto mb-2" />
          <p className="text-sm text-white/40">Creating plan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Goal */}
      <div className="p-3 rounded-lg bg-rose-gold-400/10 border border-rose-gold-400/20">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-4 h-4 text-rose-gold-400" />
          <span className="text-xs font-medium text-rose-gold-400">Goal</span>
        </div>
        <p className="text-sm text-white/80">{plan.goal}</p>
      </div>

      {/* Steps */}
      <div className="space-y-1">
        {plan.steps.map((step, index) => (
          <StepCard
            key={step.id}
            step={step}
            index={index}
            isExpanded={expandedSteps.has(step.id)}
            onToggle={() => onToggleStep(step.id)}
          />
        ))}
      </div>
    </div>
  )
}

function StepCard({
  step,
  index,
  isExpanded,
  onToggle
}: {
  step: ExecutionStep
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const ToolIcon = toolIcons[step.tool] || Brain
  const StatusIcon = stepStatusIcons[step.status]

  const statusStyles: Record<StepStatus, string> = {
    pending: 'text-white/40',
    running: 'text-rose-gold-400 animate-spin',
    success: 'text-rose-gold-400',
    failed: 'text-rose-gold-300',
    skipped: 'text-white/30',
    rolled_back: 'text-rose-gold-300'
  }

  return (
    <div
      className={`morphic-card rounded-lg overflow-hidden transition-all ${
        step.status === 'running' ? 'border-rose-gold-400/50 shadow-glow-sm' : ''
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/50">
          {index + 1}
        </div>
        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
          <ToolIcon className="w-3 h-3 text-white/60" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{step.description}</p>
          <p className="text-xs text-white/40">{step.tool.replace('_', ' ')}</p>
        </div>
        <StatusIcon className={`w-4 h-4 ${statusStyles[step.status]}`} />
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-white/30" />
        ) : (
          <ChevronRight className="w-4 h-4 text-white/30" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5">
          {/* Duration */}
          {step.duration && (
            <div className="flex items-center gap-2 pt-2">
              <Clock className="w-3 h-3 text-white/30" />
              <span className="text-xs text-white/40">
                {(step.duration / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {/* Retry count */}
          {step.retryCount > 0 && (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3 h-3 text-rose-gold-400" />
              <span className="text-xs text-rose-gold-400">
                Retry {step.retryCount}/{step.maxRetries}
              </span>
            </div>
          )}

          {/* Error */}
          {step.error && (
            <div className="p-2 rounded bg-rose-gold-500/10 border border-rose-gold-500/20">
              <p className="text-xs text-rose-gold-300">{step.error}</p>
            </div>
          )}

          {/* Output preview */}
          {step.output && (
            <div className="p-2 rounded bg-white/5 border border-white/10">
              <p className="text-xs text-white/60 line-clamp-3">
                {step.output.slice(0, 200)}...
              </p>
            </div>
          )}

          {/* Validation result */}
          {step.validationResult && (
            <div className={`p-2 rounded ${
              step.validationResult.isValid ? 'bg-rose-gold-400/10' : 'bg-rose-gold-500/10'
            }`}>
              <div className="flex items-center gap-2">
                <Shield className={`w-3 h-3 ${
                  step.validationResult.isValid ? 'text-rose-gold-400' : 'text-rose-gold-300'
                }`} />
                <span className="text-xs text-white/70">
                  Quality: {(step.validationResult.score * 100).toFixed(0)}%
                </span>
              </div>
              {step.validationResult.issues.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {step.validationResult.issues.map((issue, i) => (
                    <li key={i} className="text-xs text-rose-gold-300">- {issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryPanel({ memory }: { memory: AgentMemoryEntry[] }) {
  if (memory.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-white/40">No memory entries yet</p>
      </div>
    )
  }

  const typeColors: Record<AgentMemoryEntry['type'], string> = {
    action: 'bg-rose-gold-400/20 text-rose-gold-300',
    observation: 'bg-rose-gold-400/25 text-rose-gold-300',
    thought: 'bg-rose-gold-400/15 text-rose-gold-400',
    error: 'bg-rose-gold-500/20 text-rose-gold-300',
    learning: 'bg-rose-gold-400/20 text-rose-gold-400'
  }

  return (
    <div className="space-y-2">
      {memory.slice(-20).reverse().map(entry => (
        <div key={entry.id} className="morphic-card p-2 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${typeColors[entry.type]}`}>
              {entry.type}
            </span>
            <span className="text-[10px] text-white/30">
              {entry.timestamp.toLocaleTimeString()}
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-white/30">
              {(entry.importance * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-white/70 line-clamp-2">{entry.content}</p>
        </div>
      ))}
    </div>
  )
}

function OutputsPanel({
  outputs,
  selectedOutput,
  onSelectOutput
}: {
  outputs: AgentOutput[]
  selectedOutput: AgentOutput | null
  onSelectOutput: (output: AgentOutput) => void
}) {
  const getOutputIcon = (type: string) => {
    switch (type) {
      case 'code': return FileCode
      case 'search_results': return Search
      case 'web_content': return Globe
      case 'data': case 'analysis': return BarChart3
      default: return FileText
    }
  }

  if (outputs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <Loader2 className="w-6 h-6 text-white/30 animate-spin mx-auto mb-2" />
          <p className="text-sm text-white/40">Outputs will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {outputs.map(output => {
        const OutputIcon = getOutputIcon(output.type)
        const isSelected = selectedOutput?.id === output.id

        return (
          <button
            key={output.id}
            onClick={() => onSelectOutput(output)}
            className={`w-full p-3 rounded-lg text-left transition-all ${
              isSelected
                ? 'bg-rose-gold-400/20 border border-rose-gold-400/30'
                : 'morphic-card hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <OutputIcon className={`w-4 h-4 ${isSelected ? 'text-rose-gold-400' : 'text-white/60'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{output.title}</p>
                <p className="text-xs text-white/40">{output.type}</p>
              </div>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-rose-gold-400" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SelfHealingPanel({ events }: { events: SelfHealingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <Shield className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-sm text-white/40">No self-healing activity</p>
          <p className="text-xs text-white/30 mt-1">Issues will be auto-resolved here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {events.map(event => (
        <div key={event.id} className="morphic-card p-3 rounded-lg border-l-2 border-amber-400">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-4 h-4 text-rose-gold-400" />
            <span className="text-xs text-white/40">
              {event.timestamp.toLocaleTimeString()}
            </span>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-white/40 mb-0.5">Issue Detected</p>
              <p className="text-sm text-rose-gold-300">{event.issue}</p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-0.5">Resolution</p>
              <p className="text-sm text-rose-gold-400">{event.resolution}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AnnealingStatePanel({ state }: { state: AnnealingState | null }) {
  if (!state) return null

  return (
    <div className="p-3 border-t border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <Thermometer className="w-3 h-3 text-rose-gold-400" />
        <span className="text-xs font-medium text-white/50">Annealing State</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded bg-white/5 text-center">
          <p className="text-xs text-white/40">Temp</p>
          <p className="text-sm font-medium text-white">{state.temperature.toFixed(1)}</p>
        </div>
        <div className="p-2 rounded bg-white/5 text-center">
          <p className="text-xs text-white/40">Energy</p>
          <p className="text-sm font-medium text-white">{state.energy.toFixed(2)}</p>
        </div>
        <div className="p-2 rounded bg-white/5 text-center">
          <p className="text-xs text-white/40">Conv.</p>
          <p className="text-sm font-medium text-rose-gold-400">{(state.convergence * 100).toFixed(0)}%</p>
        </div>
      </div>
    </div>
  )
}

function ActivityLogEntry({ log }: { log: LogEntry }) {
  const levelStyles: Record<LogEntry['level'], { icon: typeof Circle; color: string }> = {
    info: { icon: Circle, color: 'text-rose-gold-300' },
    success: { icon: CheckCircle2, color: 'text-rose-gold-400' },
    warning: { icon: AlertCircle, color: 'text-rose-gold-400' },
    error: { icon: XCircle, color: 'text-rose-gold-300' }
  }

  const { icon: Icon, color } = levelStyles[log.level]

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-white/5 transition-colors animate-slide-in">
      <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70">{log.message}</p>
        <p className="text-[10px] text-white/30">{log.timestamp.toLocaleTimeString()}</p>
      </div>
    </div>
  )
}

function OutputPreviewPanel({
  output,
  onCopy
}: {
  output: AgentOutput | null
  onCopy: (content: string) => void
}) {
  if (!output) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Eye className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">Select an output to preview</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-white">{output.title}</h4>
            <p className="text-xs text-white/40">{output.type}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCopy(output.content)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4 text-white/60" />
            </button>
            {typeof output.metadata?.url === 'string' ? (
              <a
                href={output.metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Open source"
              >
                <ExternalLink className="w-4 h-4 text-white/60" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto morphic-scrollbar p-3">
        <div className="rounded-lg bg-dark-400/50 border border-white/10 p-4">
          {output.type === 'code' ? (
            <pre className="text-sm text-white/80 font-mono whitespace-pre-wrap break-words">
              {output.content}
            </pre>
          ) : (
            <div className="text-sm text-white/70 whitespace-pre-wrap break-words">
              {output.content}
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      {output.metadata && Object.keys(output.metadata).length > 0 && (
        <div className="p-3 border-t border-white/10">
          <div className="flex flex-wrap gap-2">
            {Object.entries(output.metadata).map(([key, value]) => (
              <span
                key={key}
                className="text-xs px-2 py-1 rounded bg-white/5 text-white/50"
              >
                {key}: {typeof value === 'string' || typeof value === 'number'
                  ? String(value).slice(0, 30)
                  : JSON.stringify(value).slice(0, 30)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quality Metrics */}
      {output.quality && (
        <div className="p-3 border-t border-white/10">
          <p className="text-xs text-white/40 mb-2">Quality Metrics</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded bg-white/5 text-center">
              <p className="text-[10px] text-white/40">Accuracy</p>
              <p className="text-sm font-medium text-white">
                {(output.quality.accuracy * 100).toFixed(0)}%
              </p>
            </div>
            <div className="p-2 rounded bg-white/5 text-center">
              <p className="text-[10px] text-white/40">Complete</p>
              <p className="text-sm font-medium text-white">
                {(output.quality.completeness * 100).toFixed(0)}%
              </p>
            </div>
            <div className="p-2 rounded bg-white/5 text-center">
              <p className="text-[10px] text-white/40">Reliable</p>
              <p className="text-sm font-medium text-white">
                {(output.quality.reliability * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
