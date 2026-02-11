import { useState, useEffect, useRef } from 'react'
import {
  Zap, Brain, Cpu, Activity,
  CheckCircle2, AlertCircle, TrendingUp, Thermometer,
  Target, Layers, GitBranch, Sparkles
} from 'lucide-react'
import {
  departmentAgentManager,
  type DepartmentAgent,
  type TaskExecution,
  type DepartmentId
} from '@/services/departmentAgents'
import { toolRegistry } from '@/services/tools/toolRegistry'

export default function SelfAnnealingAgentView() {
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentId | null>(null)
  const [task, setTask] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [executions, setExecutions] = useState<Map<DepartmentId, TaskExecution>>(new Map())
  const [activeExecution, setActiveExecution] = useState<TaskExecution | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const agents = departmentAgentManager.getAllAgents()

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeExecution?.logs])

  const startExecution = async () => {
    if (!task.trim()) return

    setIsExecuting(true)
    const departmentsToRun = selectedDepartment
      ? [selectedDepartment]
      : agents.slice(0, 3).map(a => a.id) // Run top 3 if none selected

    const results = await departmentAgentManager.executeAcrossDepartments(
      task,
      departmentsToRun,
      (deptId, execution) => {
        setExecutions(prev => new Map(prev).set(deptId, execution))
        setActiveExecution(execution)
      }
    )

    setExecutions(results)
    setIsExecuting(false)
  }

  const allTools = toolRegistry.getAllTools()

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
              <Cpu className="w-6 h-6 text-dark-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Self-Annealing Agents</h2>
              <p className="text-sm text-white/50">Continuous improvement until perfect</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <span className="text-xs text-white/50">{allTools.length} Tools Available</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="text-xs text-green-400">{agents.length} Departments Active</span>
            </div>
          </div>
        </div>

        {/* Task Input */}
        <div className="flex gap-3">
          <div className="flex-1 glass-card p-1 rounded-xl">
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you want to build or accomplish..."
              className="w-full px-4 py-3 bg-transparent text-white placeholder-white/30 focus:outline-none"
              disabled={isExecuting}
            />
          </div>
          <button
            onClick={startExecution}
            disabled={isExecuting || !task.trim()}
            className="glass-btn-primary px-6 flex items-center gap-2 disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <Activity className="w-5 h-5 animate-pulse" />
                Running...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Execute
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Department Selection */}
        <div className="w-72 border-r border-white/10 p-4 overflow-y-auto morphic-scrollbar">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Departments
          </h3>

          <div className="space-y-2">
            {agents.map((agent) => (
              <DepartmentCard
                key={agent.id}
                agent={agent}
                execution={executions.get(agent.id)}
                isSelected={selectedDepartment === agent.id}
                onClick={() => setSelectedDepartment(
                  selectedDepartment === agent.id ? null : agent.id
                )}
              />
            ))}
          </div>
        </div>

        {/* Center: Execution View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeExecution ? (
            <>
              {/* Annealing Visualization */}
              <div className="p-4 border-b border-white/10">
                <AnnealingVisualization execution={activeExecution} />
              </div>

              {/* Execution Logs */}
              <div className="flex-1 overflow-y-auto p-4 morphic-scrollbar">
                <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Execution Log
                </h4>
                <div className="space-y-2">
                  {activeExecution.logs.map((log, i) => (
                    <LogEntry key={i} log={log} />
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4 animate-float">
                  <Brain className="w-10 h-10 text-rose-gold-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Self-Annealing AI Agents
                </h3>
                <p className="text-white/50 mb-6">
                  Enter a task above and watch our AI agents continuously improve
                  their output until it reaches perfection.
                </p>

                {/* Quick Tasks */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Build a landing page',
                    'Research competitors',
                    'Create marketing copy',
                    'Analyze user data'
                  ].map((quickTask) => (
                    <button
                      key={quickTask}
                      onClick={() => setTask(quickTask)}
                      className="glass-card p-3 rounded-lg text-sm text-white/60 hover:text-white hover:border-rose-gold-400/30 transition-all text-left"
                    >
                      {quickTask}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Tools & Quality */}
        <div className="w-80 border-l border-white/10 flex flex-col overflow-hidden">
          {activeExecution && (
            <>
              {/* Quality Metrics */}
              <div className="p-4 border-b border-white/10">
                <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Quality Metrics
                </h4>
                <QualityMetrics quality={activeExecution.quality} />
              </div>

              {/* Tools Used */}
              <div className="flex-1 p-4 overflow-y-auto morphic-scrollbar">
                <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Tools Used ({activeExecution.toolsUsed.length})
                </h4>
                <div className="space-y-2">
                  {activeExecution.toolsUsed.map((toolId, i) => {
                    const tool = toolRegistry.getTool(toolId)
                    return tool ? (
                      <ToolCard key={i} tool={tool} />
                    ) : null
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DepartmentCard({
  agent,
  execution,
  isSelected,
  onClick
}: {
  agent: DepartmentAgent
  execution?: TaskExecution
  isSelected: boolean
  onClick: () => void
}) {
  const getStatusColor = () => {
    if (!execution) return 'bg-white/10'
    switch (execution.status) {
      case 'running': return 'bg-blue-500/20 border-blue-500/50'
      case 'annealing': return 'bg-rose-gold-400/20 border-rose-gold-400/50 animate-pulse'
      case 'complete': return 'bg-green-500/20 border-green-500/50'
      case 'failed': return 'bg-red-500/20 border-red-500/50'
      default: return 'bg-white/10'
    }
  }

  return (
    <button
      onClick={onClick}
      className={`w-full glass-card p-3 rounded-xl text-left transition-all ${
        isSelected ? 'border-rose-gold-400/50 shadow-glow-sm' : ''
      } ${getStatusColor()}`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
          style={{ backgroundColor: `${agent.color}20` }}
        >
          {agent.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{agent.name}</p>
          <p className="text-xs text-white/40 truncate">{agent.description}</p>
        </div>
      </div>

      {execution && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-white/40">{execution.status}</span>
            <span className="text-rose-gold-400">{execution.progress}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 rounded-full transition-all"
              style={{ width: `${execution.progress}%` }}
            />
          </div>
        </div>
      )}
    </button>
  )
}

function AnnealingVisualization({ execution }: { execution: TaskExecution }) {
  const { annealingState } = execution

  return (
    <div className="glass-card p-4 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Thermometer className="w-5 h-5 text-rose-gold-400" />
          <span className="text-sm font-medium text-white">Annealing Process</span>
        </div>
        {annealingState && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-white/40">Temp:</span>
              <span className="text-orange-400">{annealingState.temperature.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/40">Energy:</span>
              <span className="text-blue-400">{annealingState.energy.toFixed(3)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/40">Iterations:</span>
              <span className="text-green-400">{annealingState.iterations}</span>
            </div>
          </div>
        )}
      </div>

      {/* Convergence Graph Simulation */}
      <div className="h-20 bg-white/5 rounded-lg overflow-hidden relative">
        <div className="absolute inset-0 flex items-end justify-around gap-px p-2">
          {Array(30).fill(0).map((_, i) => {
            const height = annealingState
              ? Math.max(10, 100 - (annealingState.convergence * 100) - Math.random() * 20)
              : 50 + Math.random() * 30
            return (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-rose-gold-400/60 to-rose-gold-400/20 rounded-t transition-all duration-300"
                style={{ height: `${height}%` }}
              />
            )
          })}
        </div>

        {/* Convergence line */}
        {annealingState && (
          <div
            className="absolute left-0 right-0 border-t-2 border-green-400/50 border-dashed transition-all duration-500"
            style={{ top: `${(1 - annealingState.convergence) * 100}%` }}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Convergence"
          value={`${((annealingState?.convergence || 0) * 100).toFixed(1)}%`}
          color="text-green-400"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Improvements"
          value={annealingState?.improvements.toString() || '0'}
          color="text-blue-400"
        />
        <StatCard
          icon={<GitBranch className="w-4 h-4" />}
          label="Iterations"
          value={execution.iterations.toString()}
          color="text-purple-400"
        />
        <StatCard
          icon={<Layers className="w-4 h-4" />}
          label="Tools"
          value={execution.toolsUsed.length.toString()}
          color="text-rose-gold-400"
        />
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white/5 rounded-lg p-2 text-center">
      <div className={`${color} flex justify-center mb-1`}>{icon}</div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/40">{label}</p>
    </div>
  )
}

function QualityMetrics({ quality }: { quality: TaskExecution['quality'] }) {
  const metrics = [
    { key: 'accuracy', label: 'Accuracy', color: 'from-green-500 to-green-400' },
    { key: 'completeness', label: 'Completeness', color: 'from-blue-500 to-blue-400' },
    { key: 'performance', label: 'Performance', color: 'from-purple-500 to-purple-400' },
    { key: 'reliability', label: 'Reliability', color: 'from-yellow-500 to-yellow-400' },
    { key: 'userSatisfaction', label: 'Satisfaction', color: 'from-rose-500 to-rose-400' }
  ] as const

  return (
    <div className="space-y-3">
      {metrics.map(({ key, label, color }) => (
        <div key={key}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-white/60">{label}</span>
            <span className="text-white font-medium">
              {(quality[key] * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
              style={{ width: `${quality[key] * 100}%` }}
            />
          </div>
        </div>
      ))}

      {/* Overall Score */}
      <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-rose-gold-400/10 to-rose-gold-300/10 border border-rose-gold-400/20">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/70">Overall Quality</span>
          <span className="text-xl font-bold text-rose-gold-400">
            {((
              quality.accuracy * 0.25 +
              quality.completeness * 0.2 +
              quality.performance * 0.15 +
              quality.reliability * 0.2 +
              quality.userSatisfaction * 0.15 +
              (1 - quality.errorRate) * 0.05
            ) * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: ReturnType<typeof toolRegistry.getTool> }) {
  if (!tool) return null

  return (
    <div className="glass-card p-3 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-rose-gold-400/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-rose-gold-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{tool.name}</p>
          <p className="text-xs text-white/40">{tool.category}</p>
        </div>
        {tool.openSource && (
          <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400">
            OSS
          </span>
        )}
      </div>
      <p className="text-xs text-white/50 line-clamp-2">{tool.description}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {tool.capabilities.slice(0, 3).map((cap) => (
          <span
            key={cap}
            className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-white/40"
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  )
}

function LogEntry({ log }: { log: TaskExecution['logs'][0] }) {
  const getIcon = () => {
    switch (log.type) {
      case 'info': return <Activity className="w-4 h-4 text-blue-400" />
      case 'action': return <Zap className="w-4 h-4 text-yellow-400" />
      case 'tool': return <Cpu className="w-4 h-4 text-purple-400" />
      case 'improvement': return <TrendingUp className="w-4 h-4 text-green-400" />
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />
      default: return <CheckCircle2 className="w-4 h-4 text-white/40" />
    }
  }

  return (
    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors animate-slide-in">
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80">{log.message}</p>
        <p className="text-xs text-white/30">
          {log.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
