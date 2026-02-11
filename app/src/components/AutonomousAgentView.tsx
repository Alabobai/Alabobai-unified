import { useState, useEffect, useRef } from 'react'
import {
  Play, Pause, Square, Zap, Brain,
  CheckCircle2, Circle, Loader2, ArrowRight, Sparkles,
  Target, Code2, Palette, Megaphone, Search, BarChart3,
  FileCode, Globe, FileText, Database, Copy, ExternalLink,
  ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react'
import {
  AutonomousOrchestrator,
  type AgentExecution,
  type Agent,
  type AgentMessage
} from '@/services/autonomousAgents'
import type { AgentOutput } from '@/services/agentEngine'

const agentIcons: Record<string, typeof Brain> = {
  orchestrator: Target,
  engineer: Code2,
  designer: Palette,
  marketer: Megaphone,
  researcher: Search,
  analyst: BarChart3
}

interface AutonomousAgentViewProps {
  onClose?: () => void
}

export default function AutonomousAgentView({ onClose: _onClose }: AutonomousAgentViewProps) {
  const [execution, setExecution] = useState<AgentExecution | null>(null)
  const [goal, setGoal] = useState('')
  const [isStarted, setIsStarted] = useState(false)
  const [selectedOutput, setSelectedOutput] = useState<AgentOutput | null>(null)
  const orchestratorRef = useRef<AutonomousOrchestrator | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    orchestratorRef.current = new AutonomousOrchestrator()
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [execution?.logs])

  // Auto-select first output when available
  useEffect(() => {
    if (execution?.outputs && execution.outputs.length > 0 && !selectedOutput) {
      setSelectedOutput(execution.outputs[0])
    }
  }, [execution?.outputs, selectedOutput])

  const startExecution = async () => {
    if (!goal.trim() || !orchestratorRef.current) return

    setIsStarted(true)
    setSelectedOutput(null)
    await orchestratorRef.current.startExecution(goal, setExecution)
  }

  const pauseExecution = () => {
    orchestratorRef.current?.pause()
  }

  const resumeExecution = () => {
    orchestratorRef.current?.resume()
  }

  const stopExecution = () => {
    orchestratorRef.current?.stop()
  }

  const copyOutput = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
              <Brain className="w-5 h-5 text-dark-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Autonomous Agents</h2>
              <p className="text-xs text-white/50">Real AI agents executing real tasks</p>
            </div>
          </div>

          {execution && (
            <div className="flex items-center gap-2">
              {execution.status === 'running' ? (
                <button
                  onClick={pauseExecution}
                  className="glass-btn-secondary p-2"
                  title="Pause"
                >
                  <Pause className="w-4 h-4" />
                </button>
              ) : execution.status === 'paused' ? (
                <button
                  onClick={resumeExecution}
                  className="glass-btn-primary p-2"
                  title="Resume"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : null}
              {execution.status !== 'complete' && execution.status !== 'failed' && (
                <button
                  onClick={stopExecution}
                  className="glass-btn-danger p-2"
                  title="Stop"
                >
                  <Square className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {execution && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/70">{execution.currentPhase}</span>
              <span className="text-sm text-rose-gold-400">{execution.progress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 rounded-full transition-all duration-500 relative"
                style={{ width: `${execution.progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-shimmer" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agent Grid */}
        <div className="w-72 border-r border-white/10 p-4 overflow-y-auto morphic-scrollbar">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Agent Crew
          </h3>

          {!isStarted ? (
            <div className="space-y-3">
              {['Atlas', 'Nova', 'Pixel', 'Echo', 'Scout', 'Logic'].map((name, i) => (
                <div
                  key={name}
                  className="agent-card-idle glass-card p-3 rounded-xl"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                      <Circle className="w-5 h-5 text-white/30" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/50">{name}</p>
                      <p className="text-xs text-white/30">Ready to work</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {execution?.agents.map((agent, i) => (
                <AgentCard key={agent.id} agent={agent} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* Center: Activity Feed */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!isStarted ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-lg w-full">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4 animate-float">
                    <Sparkles className="w-10 h-10 text-rose-gold-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    What do you want to build?
                  </h2>
                  <p className="text-white/50">
                    Our AI agents will work together autonomously using real tools
                  </p>
                </div>

                <div className="glass-card p-1 rounded-2xl mb-4">
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Describe your goal... e.g., Research the latest trends in AI agents and create a landing page"
                    className="w-full h-32 p-4 bg-transparent text-white placeholder-white/30 resize-none focus:outline-none"
                  />
                </div>

                <button
                  onClick={startExecution}
                  disabled={!goal.trim()}
                  className="w-full glass-btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="w-5 h-5 group-hover:animate-bounce" />
                    Start Autonomous Execution
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    'Research AI agents and build a landing page',
                    'Search for SaaS trends and create a dashboard',
                    'Analyze competitors and generate a report',
                    'Build an analytics dashboard component'
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setGoal(suggestion)}
                      className="glass-card p-3 rounded-xl text-left text-sm text-white/60 hover:text-white hover:border-rose-gold-400/30 transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 morphic-scrollbar">
              <div className="space-y-2">
                {execution?.logs.map((log) => (
                  <LogEntry key={log.id} log={log} agents={execution.agents} />
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* Status Footer */}
          {execution && (
            <div className="glass-morphic-footer p-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusIndicator status={execution.status} />
                  <span className="text-sm text-white/70">
                    {execution.tasks.filter(t => t.status === 'complete').length}/{execution.tasks.length} tasks
                  </span>
                  <span className="text-sm text-white/50">
                    {execution.outputs?.length || 0} outputs
                  </span>
                </div>
                {execution.status === 'complete' && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Execution complete!</span>
                  </div>
                )}
                {execution.status === 'failed' && (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Execution stopped</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Output Preview */}
        {execution && (
          <div className="w-[400px] border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Real Outputs
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto morphic-scrollbar">
              <LiveOutputPanel
                execution={execution}
                selectedOutput={selectedOutput}
                onSelectOutput={setSelectedOutput}
                onCopy={copyOutput}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const Icon = agentIcons[agent.id] || Brain

  const statusColors: Record<string, string> = {
    idle: 'bg-white/10 text-white/40',
    thinking: 'bg-purple-500/20 text-purple-400 animate-pulse',
    working: 'bg-rose-gold-400/20 text-rose-gold-400',
    delegating: 'bg-blue-500/20 text-blue-400',
    reviewing: 'bg-yellow-500/20 text-yellow-400',
    complete: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400'
  }

  const latestMessage = agent.messages[agent.messages.length - 1]

  return (
    <div
      className={`agent-card glass-card p-3 rounded-xl transition-all duration-300 ${
        agent.status === 'working' ? 'border-rose-gold-400/50 shadow-glow-sm' :
        agent.status === 'thinking' ? 'border-purple-400/50' : ''
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
          style={{ backgroundColor: `${agent.color}20` }}
        >
          {agent.status === 'working' ? (
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: agent.color }} />
          ) : agent.status === 'thinking' ? (
            <Brain className="w-5 h-5 animate-pulse" style={{ color: agent.color }} />
          ) : (
            <Icon className="w-5 h-5" style={{ color: agent.color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">{agent.name}</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${statusColors[agent.status]}`}>
              {agent.status}
            </span>
          </div>
          <p className="text-xs text-white/40">{agent.role}</p>
          {latestMessage && (
            <p className="text-xs text-white/60 mt-1 truncate">
              {latestMessage.content.slice(0, 40)}...
            </p>
          )}
        </div>
      </div>

      {/* Activity indicator */}
      {(agent.status === 'working' || agent.status === 'thinking') && (
        <div className="mt-2 flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden"
            >
              <div
                className="h-full rounded-full animate-progress"
                style={{
                  backgroundColor: agent.color,
                  animationDelay: `${i * 200}ms`
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LogEntry({ log, agents }: { log: AgentMessage; agents: Agent[] }) {
  const agent = agents.find(a => a.id === log.agentId)
  const [isExpanded, setIsExpanded] = useState(false)
  const isLong = log.content.length > 150

  const typeStyles: Record<string, { icon: typeof Brain; color: string }> = {
    thought: { icon: Brain, color: 'text-purple-400' },
    action: { icon: Zap, color: 'text-rose-gold-400' },
    result: { icon: CheckCircle2, color: 'text-green-400' },
    delegation: { icon: ArrowRight, color: 'text-blue-400' },
    error: { icon: AlertCircle, color: 'text-red-400' }
  }

  const style = typeStyles[log.type] || typeStyles.action
  const Icon = style.icon

  const displayContent = isExpanded || !isLong
    ? log.content
    : log.content.slice(0, 150) + '...'

  return (
    <div
      className={`log-entry flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors animate-slide-in ${
        log.type === 'error' ? 'bg-red-500/5' : ''
      }`}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${agent?.color || '#fff'}15` }}
      >
        <Icon className={`w-4 h-4 ${style.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: agent?.color }}>
            {agent?.name || 'System'}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            log.type === 'error' ? 'bg-red-500/20 text-red-400' :
            log.type === 'result' ? 'bg-green-500/20 text-green-400' :
            'bg-white/10 text-white/40'
          }`}>
            {log.type}
          </span>
          <span className="text-xs text-white/30">
            {log.timestamp.toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-white/70 mt-0.5 whitespace-pre-wrap break-words">
          {displayContent}
        </p>
        {isLong && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-rose-gold-400 hover:text-rose-gold-300 mt-1 flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="w-3 h-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3" />
                Show more
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: AgentExecution['status'] }) {
  const configs: Record<string, { color: string; label: string }> = {
    running: { color: 'bg-rose-gold-400', label: 'Running' },
    paused: { color: 'bg-yellow-400', label: 'Paused' },
    complete: { color: 'bg-green-400', label: 'Complete' },
    failed: { color: 'bg-red-400', label: 'Stopped' }
  }

  const config = configs[status]

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${config.color} ${status === 'running' ? 'animate-pulse' : ''}`} />
      <span className="text-sm text-white/70">{config.label}</span>
    </div>
  )
}

function LiveOutputPanel({
  execution,
  selectedOutput,
  onSelectOutput,
  onCopy
}: {
  execution: AgentExecution
  selectedOutput: AgentOutput | null
  onSelectOutput: (output: AgentOutput) => void
  onCopy: (content: string) => void
}) {
  const outputs = execution.outputs || []

  const getOutputIcon = (type: string) => {
    switch (type) {
      case 'code': return FileCode
      case 'search_results': return Search
      case 'web_content': return Globe
      case 'data': return Database
      default: return FileText
    }
  }

  const getOutputColor = (type: string) => {
    switch (type) {
      case 'code': return 'text-blue-400'
      case 'search_results': return 'text-purple-400'
      case 'web_content': return 'text-green-400'
      case 'data': return 'text-yellow-400'
      default: return 'text-white/60'
    }
  }

  if (outputs.length === 0) {
    return (
      <div className="p-4">
        <div className="glass-card p-6 rounded-xl text-center">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
          </div>
          <p className="text-sm text-white/50">
            {execution.status === 'running'
              ? 'Agents are working... outputs will appear here'
              : 'No outputs generated yet'}
          </p>
        </div>

        {/* Execution Metrics */}
        <div className="mt-4 glass-card p-4 rounded-xl">
          <h4 className="text-xs text-white/40 mb-3">Execution Metrics</h4>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Tasks" value={execution.tasks.length.toString()} />
            <MetricCard label="Logs" value={execution.logs.length.toString()} />
            <MetricCard label="Progress" value={`${execution.progress}%`} />
            <MetricCard
              label="Duration"
              value={`${Math.floor((Date.now() - execution.startTime.getTime()) / 1000)}s`}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Output List */}
      <div className="p-4 border-b border-white/10">
        <div className="space-y-2">
          {outputs.map((output) => {
            const OutputIcon = getOutputIcon(output.type)
            const isSelected = selectedOutput?.id === output.id
            return (
              <button
                key={output.id}
                onClick={() => onSelectOutput(output)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                  isSelected
                    ? 'bg-rose-gold-400/20 border border-rose-gold-400/30'
                    : 'glass-card hover:bg-white/5'
                }`}
              >
                <OutputIcon className={`w-4 h-4 flex-shrink-0 ${getOutputColor(output.type)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{output.title}</p>
                  <p className="text-xs text-white/40">{output.type}</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Output Preview */}
      {selectedOutput && (
        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white">{selectedOutput.title}</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCopy(selectedOutput.content)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4 text-white/60" />
              </button>
              {typeof selectedOutput.metadata?.url === 'string' && (
                <a
                  href={selectedOutput.metadata.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  title="Open source"
                >
                  <ExternalLink className="w-4 h-4 text-white/60" />
                </a>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto rounded-lg bg-black/30 border border-white/10">
            {selectedOutput.type === 'code' ? (
              <pre className="p-4 text-sm text-white/80 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                {selectedOutput.content}
              </pre>
            ) : (
              <div className="p-4 text-sm text-white/70 whitespace-pre-wrap break-words">
                {selectedOutput.content}
              </div>
            )}
          </div>

          {selectedOutput.metadata && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(selectedOutput.metadata).map(([key, value]) => (
                <span
                  key={key}
                  className="text-xs px-2 py-1 rounded bg-white/5 text-white/50"
                >
                  {key}: {typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 30) : JSON.stringify(value).slice(0, 30)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="p-4 border-t border-white/10">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-white/5 text-center">
            <p className="text-lg font-bold text-white">{outputs.length}</p>
            <p className="text-xs text-white/40">Outputs</p>
          </div>
          <div className="p-2 rounded-lg bg-white/5 text-center">
            <p className="text-lg font-bold text-white">
              {Math.floor((Date.now() - execution.startTime.getTime()) / 1000)}s
            </p>
            <p className="text-xs text-white/40">Duration</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-lg bg-white/5">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-white/40">{label}</p>
    </div>
  )
}
