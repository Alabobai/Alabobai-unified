import { useState, useEffect, useRef } from 'react'
import {
  Play, Pause, Square, Zap, Brain,
  CheckCircle2, Circle, Loader2, ArrowRight, Sparkles,
  Target, Code2, Palette, Megaphone, Search, BarChart3
} from 'lucide-react'
import {
  AutonomousOrchestrator,
  type AgentExecution,
  type Agent,
  type AgentMessage
} from '@/services/autonomousAgents'

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
  const orchestratorRef = useRef<AutonomousOrchestrator | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    orchestratorRef.current = new AutonomousOrchestrator()
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [execution?.logs])

  const startExecution = async () => {
    if (!goal.trim() || !orchestratorRef.current) return

    setIsStarted(true)
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
              <p className="text-xs text-white/50">AI agents working together until perfect</p>
            </div>
          </div>

          {execution && (
            <div className="flex items-center gap-2">
              {execution.status === 'running' ? (
                <button
                  onClick={pauseExecution}
                  className="glass-btn-secondary p-2"
                >
                  <Pause className="w-4 h-4" />
                </button>
              ) : execution.status === 'paused' ? (
                <button
                  onClick={resumeExecution}
                  className="glass-btn-primary p-2"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : null}
              {execution.status !== 'complete' && (
                <button
                  onClick={stopExecution}
                  className="glass-btn-danger p-2"
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
        <div className="w-80 border-r border-white/10 p-4 overflow-y-auto morphic-scrollbar">
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
        <div className="flex-1 flex flex-col overflow-hidden">
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
                    Our AI agents will work together autonomously until everything is perfect
                  </p>
                </div>

                <div className="glass-card p-1 rounded-2xl mb-4">
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Describe your goal... e.g., Build a beautiful dashboard with real-time analytics, dark mode support, and smooth animations"
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
                    'Build a SaaS landing page',
                    'Create a component library',
                    'Design a mobile app UI',
                    'Build an analytics dashboard'
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
                    {execution.logs.length} actions completed
                  </span>
                </div>
                {execution.status === 'complete' && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">All tasks completed successfully</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Preview */}
        {execution && (
          <div className="w-96 border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Live Output Preview
              </h3>
            </div>
            <div className="flex-1 p-4 overflow-y-auto morphic-scrollbar">
              <LivePreview execution={execution} />
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
              {latestMessage.content.slice(0, 50)}...
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

  const typeStyles: Record<string, { icon: typeof Brain; color: string }> = {
    thought: { icon: Brain, color: 'text-purple-400' },
    action: { icon: Zap, color: 'text-rose-gold-400' },
    result: { icon: CheckCircle2, color: 'text-green-400' },
    delegation: { icon: ArrowRight, color: 'text-blue-400' },
    error: { icon: Circle, color: 'text-red-400' }
  }

  const style = typeStyles[log.type] || typeStyles.action
  const Icon = style.icon

  return (
    <div className="log-entry flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors animate-slide-in">
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
          <span className="text-xs text-white/30">
            {log.timestamp.toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-white/70 mt-0.5">{log.content}</p>
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: AgentExecution['status'] }) {
  const configs: Record<string, { color: string; label: string }> = {
    running: { color: 'bg-rose-gold-400', label: 'Running' },
    paused: { color: 'bg-yellow-400', label: 'Paused' },
    complete: { color: 'bg-green-400', label: 'Complete' },
    failed: { color: 'bg-red-400', label: 'Failed' }
  }

  const config = configs[status]

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${config.color} ${status === 'running' ? 'animate-pulse' : ''}`} />
      <span className="text-sm text-white/70">{config.label}</span>
    </div>
  )
}

function LivePreview({ execution }: { execution: AgentExecution }) {
  const completedTasks = execution.logs.filter(l => l.type === 'result').length

  return (
    <div className="space-y-4">
      {/* Mini Dashboard Preview */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40">Preview</span>
          <span className="text-xs text-green-400">{completedTasks} outputs</span>
        </div>

        {/* Simulated UI Preview */}
        <div className="space-y-2">
          <div className="h-8 bg-gradient-to-r from-rose-gold-400/20 to-transparent rounded-lg animate-pulse" />
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-white/5 rounded-lg"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
          <div className="h-24 bg-white/5 rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-12 bg-white/5 rounded-lg" />
            <div className="h-12 bg-rose-gold-400/10 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Generated Assets */}
      <div className="glass-card p-4 rounded-xl">
        <h4 className="text-xs text-white/40 mb-3">Generated Assets</h4>
        <div className="space-y-2">
          {execution.currentPhase !== 'Planning' && (
            <>
              <AssetItem name="design_system.fig" type="design" />
              <AssetItem name="components.tsx" type="code" />
              <AssetItem name="styles.css" type="style" />
              <AssetItem name="animations.ts" type="code" />
            </>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="glass-card p-4 rounded-xl">
        <h4 className="text-xs text-white/40 mb-3">Execution Metrics</h4>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Tasks" value={execution.tasks.length.toString()} />
          <MetricCard label="Actions" value={execution.logs.length.toString()} />
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

function AssetItem({ name, type }: { name: string; type: string }) {
  const typeColors: Record<string, string> = {
    design: 'text-pink-400',
    code: 'text-blue-400',
    style: 'text-purple-400'
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
      <div className={`w-2 h-2 rounded-full ${typeColors[type]?.replace('text-', 'bg-') || 'bg-white/40'}`} />
      <span className="text-xs text-white/70">{name}</span>
      <CheckCircle2 className="w-3 h-3 text-green-400 ml-auto" />
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
