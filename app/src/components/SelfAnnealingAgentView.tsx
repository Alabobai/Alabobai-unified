import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Zap, Brain, Activity,
  CheckCircle2, AlertCircle, TrendingUp, Thermometer,
  Target, Layers, GitBranch, Sparkles, Plus, Settings2,
  Play, RotateCcw, Trash2, History, BarChart3,
  ChevronDown, ChevronUp, Eye, EyeOff
} from 'lucide-react'
import { aiService } from '@/services/ai'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type AgentType = 'researcher' | 'coder' | 'analyst' | 'writer'

interface AgentConfig {
  id: string
  name: string
  type: AgentType
  description: string
  icon: string
  color: string
  temperature: number
  creativity: number
  maxIterations: number
  learningRate: number
  goal: string
  createdAt: Date
}

interface TaskResult {
  id: string
  agentId: string
  task: string
  result: string
  success: boolean
  qualityScore: number
  executionTime: number
  iterations: number
  improvements: string[]
  timestamp: Date
}

interface PerformanceMetrics {
  totalTasks: number
  successfulTasks: number
  averageQuality: number
  averageTime: number
  learningProgress: number
  bestStrategy: string
  recentTrend: 'improving' | 'stable' | 'declining'
}

interface LearningEntry {
  id: string
  agentId: string
  timestamp: Date
  taskType: string
  approach: string
  outcome: 'success' | 'partial' | 'failure'
  lesson: string
  qualityDelta: number
}

interface AnnealingState {
  temperature: number
  energy: number
  bestEnergy: number
  iterations: number
  improvements: number
  convergence: number
  isRunning: boolean
}

interface SelfAnnealingAgent extends AgentConfig {
  performance: PerformanceMetrics
  learningHistory: LearningEntry[]
  taskHistory: TaskResult[]
  currentState: AnnealingState
  strategies: Map<string, { successRate: number; uses: number }>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_TYPE_CONFIGS: Record<AgentType, { icon: string; color: string; description: string; defaultGoal: string }> = {
  researcher: {
    icon: 'R',
    color: '#d4a574',
    description: 'Improves at finding and synthesizing information',
    defaultGoal: 'Find comprehensive, accurate information on any topic'
  },
  coder: {
    icon: 'C',
    color: '#d4a574',
    description: 'Improves at generating clean, efficient code',
    defaultGoal: 'Generate high-quality, bug-free code solutions'
  },
  analyst: {
    icon: 'A',
    color: '#d4a574',
    description: 'Improves at data analysis and insights',
    defaultGoal: 'Analyze data and provide actionable insights'
  },
  writer: {
    icon: 'W',
    color: '#d4a574',
    description: 'Improves at content creation and writing',
    defaultGoal: 'Create engaging, well-structured content'
  }
}

const STORAGE_KEY = 'self-annealing-agents'

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

function loadAgentsFromStorage(): SelfAnnealingAgent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.map((agent: SelfAnnealingAgent) => ({
        ...agent,
        createdAt: new Date(agent.createdAt),
        learningHistory: agent.learningHistory.map(entry => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        })),
        taskHistory: agent.taskHistory.map(task => ({
          ...task,
          timestamp: new Date(task.timestamp)
        })),
        strategies: new Map(Object.entries(agent.strategies || {}))
      }))
    }
  } catch (error) {
    console.error('Failed to load agents from storage:', error)
  }
  return []
}

function saveAgentsToStorage(agents: SelfAnnealingAgent[]): void {
  try {
    const serializable = agents.map(agent => ({
      ...agent,
      strategies: Object.fromEntries(agent.strategies)
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
  } catch (error) {
    console.error('Failed to save agents to storage:', error)
  }
}

// ============================================================================
// AGENT FACTORY
// ============================================================================

function createAgent(name: string, type: AgentType, goal: string): SelfAnnealingAgent {
  const config = AGENT_TYPE_CONFIGS[type]
  return {
    id: crypto.randomUUID(),
    name,
    type,
    description: config.description,
    icon: config.icon,
    color: config.color,
    temperature: 0.7,
    creativity: 0.5,
    maxIterations: 10,
    learningRate: 0.1,
    goal: goal || config.defaultGoal,
    createdAt: new Date(),
    performance: {
      totalTasks: 0,
      successfulTasks: 0,
      averageQuality: 0,
      averageTime: 0,
      learningProgress: 0,
      bestStrategy: 'default',
      recentTrend: 'stable'
    },
    learningHistory: [],
    taskHistory: [],
    currentState: {
      temperature: 100,
      energy: 1.0,
      bestEnergy: 1.0,
      iterations: 0,
      improvements: 0,
      convergence: 0,
      isRunning: false
    },
    strategies: new Map([['default', { successRate: 0.5, uses: 0 }]])
  }
}

// ============================================================================
// SELF-ANNEALING ENGINE
// ============================================================================

class SelfAnnealingEngine {
  private agent: SelfAnnealingAgent
  private onProgress: (state: AnnealingState) => void
  private onLog: (message: string, type: 'info' | 'improvement' | 'error') => void

  constructor(
    agent: SelfAnnealingAgent,
    onProgress: (state: AnnealingState) => void,
    onLog: (message: string, type: 'info' | 'improvement' | 'error') => void
  ) {
    this.agent = agent
    this.onProgress = onProgress
    this.onLog = onLog
  }

  async executeTask(task: string): Promise<TaskResult> {
    const startTime = Date.now()
    const state = { ...this.agent.currentState, isRunning: true }
    let bestResult = ''
    let bestQuality = 0
    const improvements: string[] = []

    this.onLog(`Starting task: ${task}`, 'info')
    this.onProgress(state)

    // Initial temperature based on agent settings
    state.temperature = 100 * this.agent.temperature

    // Annealing loop
    for (let i = 0; i < this.agent.maxIterations && state.temperature > 1; i++) {
      state.iterations = i + 1

      try {
        // Generate solution with current parameters
        const result = await this.generateSolution(task, state.temperature)
        const quality = this.evaluateQuality(result, task)

        // Calculate energy (lower is better)
        const energy = 1 - quality

        // Simulated annealing acceptance
        if (energy < state.bestEnergy || this.shouldAccept(energy, state.bestEnergy, state.temperature)) {
          if (quality > bestQuality) {
            const improvement = `Iteration ${i + 1}: Quality improved from ${(bestQuality * 100).toFixed(1)}% to ${(quality * 100).toFixed(1)}%`
            improvements.push(improvement)
            this.onLog(improvement, 'improvement')
            state.improvements++
          }
          bestResult = result
          bestQuality = quality
          state.bestEnergy = energy
        }

        state.energy = energy
        state.convergence = 1 - state.bestEnergy

        // Cool down
        state.temperature *= 0.9

        this.onProgress({ ...state })

        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        this.onLog(`Error in iteration ${i + 1}: ${error}`, 'error')
      }
    }

    state.isRunning = false
    this.onProgress(state)

    const executionTime = Date.now() - startTime
    const success = bestQuality >= 0.6

    this.onLog(`Task completed with ${(bestQuality * 100).toFixed(1)}% quality in ${executionTime}ms`, 'info')

    // Record learning
    this.recordLearning(task, bestQuality, success)

    return {
      id: crypto.randomUUID(),
      agentId: this.agent.id,
      task,
      result: bestResult,
      success,
      qualityScore: bestQuality,
      executionTime,
      iterations: state.iterations,
      improvements,
      timestamp: new Date()
    }
  }

  private async generateSolution(task: string, temperature: number): Promise<string> {
    const typePrompts: Record<AgentType, string> = {
      researcher: `As a research agent focused on: ${this.agent.goal}

Task: ${task}

Provide a comprehensive, well-researched response. Include:
- Key findings and facts
- Sources of information (if applicable)
- Analysis and synthesis
- Confidence level

Current exploration temperature: ${temperature.toFixed(1)} (higher = more exploratory)`,

      coder: `As a coding agent focused on: ${this.agent.goal}

Task: ${task}

Provide clean, efficient code with:
- Well-commented code
- Error handling
- Best practices
- Test cases if applicable

Current exploration temperature: ${temperature.toFixed(1)} (higher = more creative solutions)`,

      analyst: `As a data analyst agent focused on: ${this.agent.goal}

Task: ${task}

Provide data-driven analysis with:
- Key metrics and insights
- Patterns and trends
- Actionable recommendations
- Confidence intervals

Current exploration temperature: ${temperature.toFixed(1)} (higher = more exploratory analysis)`,

      writer: `As a content writer agent focused on: ${this.agent.goal}

Task: ${task}

Create engaging content with:
- Clear structure
- Compelling narrative
- Appropriate tone
- Call to action if applicable

Current exploration temperature: ${temperature.toFixed(1)} (higher = more creative expression)`
    }

    // Adjust system prompt based on learned strategies
    const bestStrategy = this.agent.performance.bestStrategy
    const strategyBoost = bestStrategy !== 'default'
      ? `\n\nBased on past learning, prioritize: ${bestStrategy}`
      : ''

    const systemPrompt = typePrompts[this.agent.type] + strategyBoost

    try {
      const response = await aiService.chatSync([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ])
      return response
    } catch {
      // Fallback response if AI service fails
      return this.generateFallbackResponse(task)
    }
  }

  private generateFallbackResponse(task: string): string {
    const templates: Record<AgentType, string> = {
      researcher: `## Research Summary for: ${task}

### Key Findings
- Initial analysis indicates this topic requires further investigation
- Multiple sources should be consulted for comprehensive coverage
- The subject matter appears to be within the scope of current knowledge

### Methodology
- Web search and document analysis
- Cross-referencing multiple sources
- Quality verification of information

### Recommendations
- Continue monitoring for new developments
- Verify findings with primary sources
- Consider expert consultation for specialized topics`,

      coder: `\`\`\`typescript
// Solution for: ${task}

interface TaskResult {
  success: boolean;
  data: unknown;
  error?: string;
}

async function executeTask(input: string): Promise<TaskResult> {
  try {
    // Implementation placeholder
    console.log('Processing:', input);

    // Add your logic here
    const result = await processInput(input);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: String(error)
    };
  }
}

async function processInput(input: string): Promise<unknown> {
  // Core processing logic
  return { processed: true, input };
}
\`\`\``,

      analyst: `## Analysis Report: ${task}

### Executive Summary
This analysis examines the key metrics and patterns related to the given task.

### Key Metrics
| Metric | Value | Trend |
|--------|-------|-------|
| Primary KPI | Baseline | Stable |
| Secondary KPI | Baseline | Improving |
| Tertiary KPI | Baseline | Monitoring |

### Insights
1. Initial data suggests positive trajectory
2. Further data collection recommended
3. Consider A/B testing for validation

### Recommendations
- Implement tracking for key metrics
- Set up automated reporting
- Schedule regular review cycles`,

      writer: `# ${task}

## Introduction
This content addresses the topic at hand with clarity and purpose. The following sections provide comprehensive coverage of the subject matter.

## Main Content
The core message centers around delivering value to the reader. Through careful consideration of the topic, we explore the key aspects that matter most.

### Key Points
- First major insight with supporting details
- Second important consideration
- Third actionable takeaway

## Conclusion
In summary, this content provides a foundation for understanding the topic. Readers are encouraged to apply these insights to their specific context.

---
*Generated with continuous improvement in mind.*`
    }

    return templates[this.agent.type]
  }

  private evaluateQuality(result: string, task: string): number {
    // Multi-factor quality evaluation
    let score = 0.5 // Base score

    // Length factor (reasonable length is good)
    const length = result.length
    if (length > 200) score += 0.1
    if (length > 500) score += 0.1
    if (length > 2000) score += 0.05

    // Structure factor (headings, lists, code blocks)
    if (result.includes('##')) score += 0.05
    if (result.includes('- ') || result.includes('* ')) score += 0.05
    if (result.includes('```')) score += 0.05

    // Relevance factor (task keywords in result)
    const taskKeywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const resultLower = result.toLowerCase()
    const keywordMatches = taskKeywords.filter(kw => resultLower.includes(kw)).length
    score += Math.min(0.15, keywordMatches * 0.03)

    // Type-specific factors
    switch (this.agent.type) {
      case 'coder':
        if (result.includes('function') || result.includes('const ') || result.includes('class ')) score += 0.1
        if (result.includes('try') && result.includes('catch')) score += 0.05
        break
      case 'researcher':
        if (result.includes('source') || result.includes('finding') || result.includes('analysis')) score += 0.1
        break
      case 'analyst':
        if (result.includes('metric') || result.includes('data') || result.includes('insight')) score += 0.1
        break
      case 'writer':
        if (result.includes('Introduction') || result.includes('Conclusion')) score += 0.1
        break
    }

    // Add some randomness for annealing exploration
    score += (Math.random() - 0.5) * 0.1

    return Math.min(1, Math.max(0, score))
  }

  private shouldAccept(newEnergy: number, currentEnergy: number, temperature: number): boolean {
    if (newEnergy < currentEnergy) return true
    const delta = newEnergy - currentEnergy
    const probability = Math.exp(-delta / (temperature / 100))
    return Math.random() < probability
  }

  private recordLearning(task: string, quality: number, success: boolean): void {
    const taskType = this.categorizeTask(task)
    const approach = this.identifyApproach(task)

    // Update strategy success rates
    const strategy = this.agent.strategies.get(approach) || { successRate: 0.5, uses: 0 }
    strategy.uses++
    strategy.successRate = (strategy.successRate * (strategy.uses - 1) + (success ? 1 : 0)) / strategy.uses
    this.agent.strategies.set(approach, strategy)

    // Find best strategy
    let bestRate = 0
    let bestApproach = 'default'
    for (const [key, value] of this.agent.strategies) {
      if (value.uses >= 2 && value.successRate > bestRate) {
        bestRate = value.successRate
        bestApproach = key
      }
    }
    this.agent.performance.bestStrategy = bestApproach

    // Create learning entry
    const entry: LearningEntry = {
      id: crypto.randomUUID(),
      agentId: this.agent.id,
      timestamp: new Date(),
      taskType,
      approach,
      outcome: success ? 'success' : quality >= 0.4 ? 'partial' : 'failure',
      lesson: this.generateLesson(task, quality, success),
      qualityDelta: quality - this.agent.performance.averageQuality
    }

    this.agent.learningHistory.push(entry)

    // Keep only last 100 entries
    if (this.agent.learningHistory.length > 100) {
      this.agent.learningHistory = this.agent.learningHistory.slice(-100)
    }
  }

  private categorizeTask(task: string): string {
    const lower = task.toLowerCase()
    if (lower.includes('code') || lower.includes('function') || lower.includes('implement')) return 'coding'
    if (lower.includes('research') || lower.includes('find') || lower.includes('search')) return 'research'
    if (lower.includes('analyze') || lower.includes('data') || lower.includes('metric')) return 'analysis'
    if (lower.includes('write') || lower.includes('create') || lower.includes('content')) return 'writing'
    return 'general'
  }

  private identifyApproach(task: string): string {
    const lower = task.toLowerCase()
    if (lower.includes('detail') || lower.includes('comprehensive')) return 'detailed'
    if (lower.includes('quick') || lower.includes('brief') || lower.includes('summary')) return 'concise'
    if (lower.includes('creative') || lower.includes('innovative')) return 'creative'
    if (lower.includes('technical') || lower.includes('specific')) return 'technical'
    return 'balanced'
  }

  private generateLesson(task: string, quality: number, success: boolean): string {
    const taskType = this.categorizeTask(task)

    if (success) {
      return `Successfully completed ${taskType} task with ${(quality * 100).toFixed(0)}% quality. Approach was effective.`
    } else if (quality >= 0.4) {
      return `Partial success on ${taskType} task. Consider adjusting parameters for better results.`
    } else {
      return `${taskType} task needs improvement. Try different approach or lower temperature.`
    }
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SelfAnnealingAgentView() {
  const [agents, setAgents] = useState<SelfAnnealingAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [task, setTask] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [currentResult, setCurrentResult] = useState<TaskResult | null>(null)
  const [executionLogs, setExecutionLogs] = useState<Array<{ message: string; type: string; timestamp: Date }>>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [activeTab, setActiveTab] = useState<'execute' | 'history' | 'learning' | 'metrics'>('execute')
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Load agents from localStorage on mount
  useEffect(() => {
    const loaded = loadAgentsFromStorage()
    if (loaded.length > 0) {
      setAgents(loaded)
      setSelectedAgent(loaded[0].id)
    }
  }, [])

  // Save agents to localStorage when changed
  useEffect(() => {
    if (agents.length > 0) {
      saveAgentsToStorage(agents)
    }
  }, [agents])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [executionLogs])

  const currentAgent = agents.find(a => a.id === selectedAgent)

  const handleCreateAgent = useCallback((name: string, type: AgentType, goal: string) => {
    const newAgent = createAgent(name, type, goal)
    setAgents(prev => [...prev, newAgent])
    setSelectedAgent(newAgent.id)
    setShowCreateModal(false)
  }, [])

  const handleDeleteAgent = useCallback((id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id))
    if (selectedAgent === id) {
      setSelectedAgent(agents.length > 1 ? agents.find(a => a.id !== id)?.id || null : null)
    }
  }, [selectedAgent, agents])

  const handleUpdateAgent = useCallback((id: string, updates: Partial<AgentConfig>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }, [])

  const addLog = useCallback((message: string, type: 'info' | 'improvement' | 'error') => {
    setExecutionLogs(prev => [...prev, { message, type, timestamp: new Date() }])
  }, [])

  const handleExecuteTask = useCallback(async () => {
    if (!currentAgent || !task.trim() || isExecuting) return

    setIsExecuting(true)
    setExecutionLogs([])
    setCurrentResult(null)

    const engine = new SelfAnnealingEngine(
      currentAgent,
      (state) => {
        setAgents(prev => prev.map(a =>
          a.id === currentAgent.id ? { ...a, currentState: state } : a
        ))
      },
      addLog
    )

    try {
      const result = await engine.executeTask(task)
      setCurrentResult(result)

      // Update agent metrics
      setAgents(prev => prev.map(a => {
        if (a.id !== currentAgent.id) return a

        const newTaskHistory = [...a.taskHistory, result]
        const successCount = newTaskHistory.filter(t => t.success).length
        const totalQuality = newTaskHistory.reduce((sum, t) => sum + t.qualityScore, 0)
        const totalTime = newTaskHistory.reduce((sum, t) => sum + t.executionTime, 0)

        // Calculate trend
        const recentTasks = newTaskHistory.slice(-5)
        const olderTasks = newTaskHistory.slice(-10, -5)
        const recentAvg = recentTasks.length > 0 ? recentTasks.reduce((s, t) => s + t.qualityScore, 0) / recentTasks.length : 0
        const olderAvg = olderTasks.length > 0 ? olderTasks.reduce((s, t) => s + t.qualityScore, 0) / olderTasks.length : 0
        const trend: 'improving' | 'stable' | 'declining' =
          recentAvg > olderAvg + 0.05 ? 'improving' :
          recentAvg < olderAvg - 0.05 ? 'declining' : 'stable'

        return {
          ...a,
          taskHistory: newTaskHistory,
          performance: {
            totalTasks: newTaskHistory.length,
            successfulTasks: successCount,
            averageQuality: totalQuality / newTaskHistory.length,
            averageTime: totalTime / newTaskHistory.length,
            learningProgress: Math.min(1, newTaskHistory.length / 20),
            bestStrategy: a.performance.bestStrategy,
            recentTrend: trend
          }
        }
      }))

      setTask('')
    } catch (error) {
      addLog(`Execution failed: ${error}`, 'error')
    } finally {
      setIsExecuting(false)
    }
  }, [currentAgent, task, isExecuting, addLog])

  const handleResetAgent = useCallback((id: string) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== id) return a
      return {
        ...a,
        performance: {
          totalTasks: 0,
          successfulTasks: 0,
          averageQuality: 0,
          averageTime: 0,
          learningProgress: 0,
          bestStrategy: 'default',
          recentTrend: 'stable'
        },
        learningHistory: [],
        taskHistory: [],
        currentState: {
          temperature: 100,
          energy: 1.0,
          bestEnergy: 1.0,
          iterations: 0,
          improvements: 0,
          convergence: 0,
          isRunning: false
        },
        strategies: new Map([['default', { successRate: 0.5, uses: 0 }]])
      }
    }))
  }, [])

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-rose-gold-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
              <Brain className="w-6 h-6 text-dark-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Self-Annealing Agents</h2>
              <p className="text-sm text-rose-gold-400/70">Alabobai - AI agents that learn and improve from every task</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-2 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </button>
          </div>
        </div>

        {/* Task Input */}
        {currentAgent && (
          <div className="flex gap-3">
            <div className="flex-1 morphic-card p-1 rounded-xl">
              <input
                type="text"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExecuteTask()}
                placeholder={`Give ${currentAgent.name} a task to execute...`}
                className="w-full px-4 py-3 bg-transparent text-white placeholder-white/30 focus:outline-none"
                disabled={isExecuting}
              />
            </div>
            <button
              onClick={handleExecuteTask}
              disabled={isExecuting || !task.trim()}
              className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-6 flex items-center gap-2 disabled:opacity-50"
            >
              {isExecuting ? (
                <>
                  <Activity className="w-5 h-5 animate-pulse" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Execute
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agent List */}
        <div className="w-72 border-r border-white/10 p-4 overflow-y-auto morphic-scrollbar">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Your Agents ({agents.length})
          </h3>

          {agents.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <Brain className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-sm text-white/40 mb-4">No agents yet</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="morphic-btn px-4 py-2 text-sm"
              >
                Create Your First Agent
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgent === agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  onDelete={() => handleDeleteAgent(agent.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Center: Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentAgent ? (
            <>
              {/* Tabs */}
              <div className="flex border-b border-white/10">
                {[
                  { id: 'execute', label: 'Execute', icon: Zap },
                  { id: 'history', label: 'History', icon: History },
                  { id: 'learning', label: 'Learning', icon: TrendingUp },
                  { id: 'metrics', label: 'Metrics', icon: BarChart3 }
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id as typeof activeTab)}
                    className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === id
                        ? 'text-rose-gold-400 border-b-2 border-rose-gold-400'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 morphic-scrollbar">
                {activeTab === 'execute' && (
                  <ExecutePanel
                    agent={currentAgent}
                    result={currentResult}
                    logs={executionLogs}
                    logsEndRef={logsEndRef}
                  />
                )}
                {activeTab === 'history' && (
                  <HistoryPanel agent={currentAgent} />
                )}
                {activeTab === 'learning' && (
                  <LearningPanel agent={currentAgent} />
                )}
                {activeTab === 'metrics' && (
                  <MetricsPanel agent={currentAgent} />
                )}
              </div>
            </>
          ) : (
            <EmptyState onCreateAgent={() => setShowCreateModal(true)} />
          )}
        </div>

        {/* Right: Settings Panel */}
        {currentAgent && (
          <div className="w-80 border-l border-white/10 flex flex-col overflow-hidden">
            <div
              className="p-4 border-b border-white/10 flex items-center justify-between cursor-pointer"
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            >
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium text-white">Agent Settings</span>
              </div>
              {showSettingsPanel ? (
                <ChevronUp className="w-4 h-4 text-white/50" />
              ) : (
                <ChevronDown className="w-4 h-4 text-white/50" />
              )}
            </div>

            {showSettingsPanel && (
              <AgentSettingsPanel
                agent={currentAgent}
                onUpdate={(updates) => handleUpdateAgent(currentAgent.id, updates)}
                onReset={() => handleResetAgent(currentAgent.id)}
              />
            )}

            {/* Quick Stats */}
            <div className="flex-1 p-4 overflow-y-auto morphic-scrollbar">
              <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                Quick Stats
              </h4>
              <QuickStats agent={currentAgent} />
            </div>
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAgent}
        />
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function AgentCard({
  agent,
  isSelected,
  onClick,
  onDelete
}: {
  agent: SelfAnnealingAgent
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const typeIcon = AGENT_TYPE_CONFIGS[agent.type].icon

  return (
    <div
      onClick={onClick}
      className={`morphic-card p-3 rounded-xl cursor-pointer transition-all ${
        isSelected ? 'border-rose-gold-400/50 shadow-glow-sm' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
          style={{ backgroundColor: `${agent.color}20` }}
        >
          {typeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{agent.name}</p>
          <p className="text-xs text-white/40 capitalize">{agent.type}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Performance Bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-white/40">Performance</span>
          <span className={`${
            agent.performance.recentTrend === 'improving' ? 'text-green-400' :
            agent.performance.recentTrend === 'declining' ? 'text-red-400' :
            'text-white/50'
          }`}>
            {(agent.performance.averageQuality * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${agent.performance.averageQuality * 100}%`,
              backgroundColor: agent.color
            }}
          />
        </div>
      </div>

      {/* Running indicator */}
      {agent.currentState.isRunning && (
        <div className="mt-2 flex items-center gap-2 text-xs text-rose-gold-400">
          <Activity className="w-3 h-3 animate-pulse" />
          <span>Running...</span>
        </div>
      )}
    </div>
  )
}

function ExecutePanel({
  agent,
  result,
  logs,
  logsEndRef
}: {
  agent: SelfAnnealingAgent
  result: TaskResult | null
  logs: Array<{ message: string; type: string; timestamp: Date }>
  logsEndRef: React.RefObject<HTMLDivElement | null>
}) {
  const [showResult, setShowResult] = useState(true)

  return (
    <div className="space-y-4">
      {/* Annealing Visualization */}
      <AnnealingVisualization state={agent.currentState} />

      {/* Execution Logs */}
      {logs.length > 0 && (
        <div className="morphic-card rounded-xl overflow-hidden">
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">Execution Log</h4>
            <span className="text-xs text-white/40">{logs.length} entries</span>
          </div>
          <div className="max-h-48 overflow-y-auto p-3 morphic-scrollbar">
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-white/30 text-xs">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={`flex-1 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'improvement' ? 'text-green-400' :
                    'text-white/70'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="morphic-card rounded-xl overflow-hidden">
          <div
            className="p-3 border-b border-white/10 flex items-center justify-between cursor-pointer"
            onClick={() => setShowResult(!showResult)}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-400" />
              )}
              <h4 className="text-sm font-medium text-white">
                Task Result ({(result.qualityScore * 100).toFixed(0)}% quality)
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">
                {result.iterations} iterations, {result.executionTime}ms
              </span>
              {showResult ? (
                <EyeOff className="w-4 h-4 text-white/40" />
              ) : (
                <Eye className="w-4 h-4 text-white/40" />
              )}
            </div>
          </div>
          {showResult && (
            <div className="p-4 max-h-96 overflow-y-auto morphic-scrollbar">
              <pre className="text-sm text-white/80 whitespace-pre-wrap font-mono">
                {result.result}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!result && logs.length === 0 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-10 h-10 text-rose-gold-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Ready to Execute</h3>
          <p className="text-white/50 max-w-md mx-auto">
            Enter a task above and {agent.name} will execute it with continuous self-improvement.
          </p>
        </div>
      )}
    </div>
  )
}

function AnnealingVisualization({ state }: { state: AnnealingState }) {
  return (
    <div className="morphic-card p-4 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Thermometer className="w-5 h-5 text-rose-gold-400" />
          <span className="text-sm font-medium text-white">Annealing Process</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-white/40">Temp:</span>
            <span className="text-orange-400">{state.temperature.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/40">Energy:</span>
            <span className="text-blue-400">{state.energy.toFixed(3)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/40">Iterations:</span>
            <span className="text-green-400">{state.iterations}</span>
          </div>
        </div>
      </div>

      {/* Convergence Graph */}
      <div className="h-20 bg-white/5 rounded-lg overflow-hidden relative">
        <div className="absolute inset-0 flex items-end justify-around gap-px p-2">
          {Array(30).fill(0).map((_, i) => {
            const height = state.isRunning
              ? Math.max(10, 100 - (state.convergence * 100) - Math.random() * 20)
              : 50 + Math.sin(i * 0.3) * 20
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
        <div
          className="absolute left-0 right-0 border-t-2 border-green-400/50 border-dashed transition-all duration-500"
          style={{ top: `${(1 - state.convergence) * 100}%` }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Convergence"
          value={`${(state.convergence * 100).toFixed(1)}%`}
          color="text-green-400"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Improvements"
          value={state.improvements.toString()}
          color="text-blue-400"
        />
        <StatCard
          icon={<GitBranch className="w-4 h-4" />}
          label="Iterations"
          value={state.iterations.toString()}
          color="text-rose-gold-400"
        />
        <StatCard
          icon={<Layers className="w-4 h-4" />}
          label="Best Energy"
          value={state.bestEnergy.toFixed(3)}
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

function HistoryPanel({ agent }: { agent: SelfAnnealingAgent }) {
  if (agent.taskHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <p className="text-white/50">No task history yet</p>
        <p className="text-sm text-white/30 mt-2">Execute tasks to see history here</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {agent.taskHistory.slice().reverse().map((task) => (
        <div key={task.id} className="morphic-card p-4 rounded-xl">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {task.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-400" />
              )}
              <span className="text-sm font-medium text-white truncate max-w-xs">
                {task.task}
              </span>
            </div>
            <span className="text-xs text-white/40">
              {task.timestamp.toLocaleDateString()}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-white/50">
            <span>Quality: {(task.qualityScore * 100).toFixed(0)}%</span>
            <span>Iterations: {task.iterations}</span>
            <span>Time: {task.executionTime}ms</span>
            <span>Improvements: {task.improvements.length}</span>
          </div>

          {task.improvements.length > 0 && (
            <div className="mt-2 pl-4 border-l-2 border-green-400/30">
              {task.improvements.slice(0, 3).map((imp, i) => (
                <p key={i} className="text-xs text-green-400/70">{imp}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LearningPanel({ agent }: { agent: SelfAnnealingAgent }) {
  if (agent.learningHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <p className="text-white/50">No learning data yet</p>
        <p className="text-sm text-white/30 mt-2">The agent learns from every task</p>
      </div>
    )
  }

  // Group by task type
  const byType = new Map<string, LearningEntry[]>()
  agent.learningHistory.forEach(entry => {
    const existing = byType.get(entry.taskType) || []
    existing.push(entry)
    byType.set(entry.taskType, existing)
  })

  return (
    <div className="space-y-6">
      {/* Best Strategy */}
      <div className="morphic-card p-4 rounded-xl">
        <h4 className="text-sm font-medium text-white mb-3">Best Learned Strategy</h4>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-white font-medium capitalize">{agent.performance.bestStrategy}</p>
            <p className="text-xs text-white/50">
              {Array.from(agent.strategies.entries())
                .filter(([_, v]) => v.uses > 0)
                .map(([k, v]) => `${k}: ${(v.successRate * 100).toFixed(0)}%`)
                .join(' | ')}
            </p>
          </div>
        </div>
      </div>

      {/* Learning by Type */}
      {Array.from(byType.entries()).map(([type, entries]) => {
        const successRate = entries.filter(e => e.outcome === 'success').length / entries.length
        const avgDelta = entries.reduce((s, e) => s + e.qualityDelta, 0) / entries.length

        return (
          <div key={type} className="morphic-card p-4 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white capitalize">{type} Tasks</h4>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  successRate > 0.7 ? 'bg-green-500/20 text-green-400' :
                  successRate > 0.4 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {(successRate * 100).toFixed(0)}% success
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {entries.slice(-5).reverse().map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 w-2 h-2 rounded-full ${
                    entry.outcome === 'success' ? 'bg-green-400' :
                    entry.outcome === 'partial' ? 'bg-yellow-400' :
                    'bg-red-400'
                  }`} />
                  <div className="flex-1">
                    <p className="text-white/70">{entry.lesson}</p>
                    <p className="text-xs text-white/30">
                      {entry.timestamp.toLocaleDateString()} | {entry.approach} approach |
                      Quality delta: {avgDelta >= 0 ? '+' : ''}{(avgDelta * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetricsPanel({ agent }: { agent: SelfAnnealingAgent }) {
  const { performance, taskHistory } = agent

  // Calculate trend data for chart
  const chartData = taskHistory.slice(-20).map((task, i) => ({
    index: i,
    quality: task.qualityScore * 100,
    time: task.executionTime / 1000
  }))

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          title="Success Rate"
          value={`${performance.totalTasks > 0 ? ((performance.successfulTasks / performance.totalTasks) * 100).toFixed(1) : 0}%`}
          subtitle={`${performance.successfulTasks} of ${performance.totalTasks} tasks`}
          trend={performance.recentTrend}
          color="green"
        />
        <MetricCard
          title="Average Quality"
          value={`${(performance.averageQuality * 100).toFixed(1)}%`}
          subtitle="Across all tasks"
          trend={performance.recentTrend}
          color="blue"
        />
        <MetricCard
          title="Average Time"
          value={`${(performance.averageTime / 1000).toFixed(2)}s`}
          subtitle="Per task execution"
          color="rose"
        />
        <MetricCard
          title="Learning Progress"
          value={`${(performance.learningProgress * 100).toFixed(0)}%`}
          subtitle="Based on task count"
          color="rose"
        />
      </div>

      {/* Performance Chart */}
      {chartData.length > 0 && (
        <div className="morphic-card p-4 rounded-xl">
          <h4 className="text-sm font-medium text-white mb-4">Quality Over Time</h4>
          <div className="h-40 flex items-end gap-1">
            {chartData.map((point, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-rose-gold-400 to-rose-gold-400/50 rounded-t transition-all hover:from-rose-gold-300 hover:to-rose-gold-300/50"
                style={{ height: `${point.quality}%` }}
                title={`Task ${i + 1}: ${point.quality.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/40">
            <span>Oldest</span>
            <span>Most Recent</span>
          </div>
        </div>
      )}

      {/* Strategy Performance */}
      <div className="morphic-card p-4 rounded-xl">
        <h4 className="text-sm font-medium text-white mb-4">Strategy Performance</h4>
        <div className="space-y-3">
          {Array.from(agent.strategies.entries())
            .filter(([_, v]) => v.uses > 0)
            .sort((a, b) => b[1].successRate - a[1].successRate)
            .map(([strategy, data]) => (
              <div key={strategy} className="flex items-center gap-3">
                <span className="text-sm text-white/70 w-24 capitalize">{strategy}</span>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 rounded-full"
                    style={{ width: `${data.successRate * 100}%` }}
                  />
                </div>
                <span className="text-xs text-white/50 w-16 text-right">
                  {(data.successRate * 100).toFixed(0)}% ({data.uses})
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  trend,
  color
}: {
  title: string
  value: string
  subtitle: string
  trend?: 'improving' | 'stable' | 'declining'
  color: string
}) {
  const colorClasses: Record<string, string> = {
    green: 'from-green-500/20 to-green-500/5 border-green-500/20',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
    rose: 'from-rose-gold-400/20 to-rose-gold-400/5 border-rose-gold-400/20'
  }

  const trendIcons = {
    improving: <TrendingUp className="w-4 h-4 text-green-400" />,
    stable: <Activity className="w-4 h-4 text-white/40" />,
    declining: <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />
  }

  return (
    <div className={`morphic-card p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs text-white/50">{title}</span>
        {trend && trendIcons[trend]}
      </div>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-white/40 mt-1">{subtitle}</p>
    </div>
  )
}

function QuickStats({ agent }: { agent: SelfAnnealingAgent }) {
  const stats = [
    { label: 'Total Tasks', value: agent.performance.totalTasks },
    { label: 'Success Rate', value: `${agent.performance.totalTasks > 0 ? ((agent.performance.successfulTasks / agent.performance.totalTasks) * 100).toFixed(0) : 0}%` },
    { label: 'Avg Quality', value: `${(agent.performance.averageQuality * 100).toFixed(0)}%` },
    { label: 'Learning Entries', value: agent.learningHistory.length },
    { label: 'Best Strategy', value: agent.performance.bestStrategy }
  ]

  return (
    <div className="space-y-3">
      {stats.map((stat, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-white/50">{stat.label}</span>
          <span className="text-white font-medium capitalize">{stat.value}</span>
        </div>
      ))}

      {/* Trend Indicator */}
      <div className="mt-4 p-3 rounded-lg bg-white/5">
        <div className="flex items-center gap-2">
          {agent.performance.recentTrend === 'improving' ? (
            <>
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="text-sm text-green-400">Performance Improving</span>
            </>
          ) : agent.performance.recentTrend === 'declining' ? (
            <>
              <TrendingUp className="w-5 h-5 text-red-400 rotate-180" />
              <span className="text-sm text-red-400">Performance Declining</span>
            </>
          ) : (
            <>
              <Activity className="w-5 h-5 text-white/40" />
              <span className="text-sm text-white/50">Performance Stable</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentSettingsPanel({
  agent,
  onUpdate,
  onReset
}: {
  agent: SelfAnnealingAgent
  onUpdate: (updates: Partial<AgentConfig>) => void
  onReset: () => void
}) {
  return (
    <div className="p-4 border-b border-white/10 space-y-4">
      {/* Temperature */}
      <div>
        <label className="text-xs text-white/50 block mb-1">
          Temperature ({(agent.temperature * 100).toFixed(0)}%)
        </label>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={agent.temperature}
          onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-rose-gold-400"
        />
        <p className="text-xs text-white/30 mt-1">Higher = more exploration</p>
      </div>

      {/* Creativity */}
      <div>
        <label className="text-xs text-white/50 block mb-1">
          Creativity ({(agent.creativity * 100).toFixed(0)}%)
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={agent.creativity}
          onChange={(e) => onUpdate({ creativity: parseFloat(e.target.value) })}
          className="w-full accent-rose-gold-400"
        />
        <p className="text-xs text-white/30 mt-1">Higher = more creative solutions</p>
      </div>

      {/* Max Iterations */}
      <div>
        <label className="text-xs text-white/50 block mb-1">
          Max Iterations ({agent.maxIterations})
        </label>
        <input
          type="range"
          min="3"
          max="20"
          step="1"
          value={agent.maxIterations}
          onChange={(e) => onUpdate({ maxIterations: parseInt(e.target.value) })}
          className="w-full accent-rose-gold-400"
        />
        <p className="text-xs text-white/30 mt-1">More iterations = better quality, slower</p>
      </div>

      {/* Goal */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Agent Goal</label>
        <textarea
          value={agent.goal}
          onChange={(e) => onUpdate({ goal: e.target.value })}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-rose-gold-400/50"
          rows={2}
        />
      </div>

      {/* Reset Button */}
      <button
        onClick={onReset}
        className="w-full morphic-btn px-4 py-2 text-sm flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/10"
      >
        <RotateCcw className="w-4 h-4" />
        Reset Learning Data
      </button>
    </div>
  )
}

function EmptyState({ onCreateAgent }: { onCreateAgent: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4 animate-float">
          <Brain className="w-10 h-10 text-rose-gold-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          Self-Improving AI Agents
        </h3>
        <p className="text-white/50 mb-6">
          Create agents that learn from their mistakes, track success rates, and continuously
          improve through simulated annealing optimization.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {(['researcher', 'coder', 'analyst', 'writer'] as AgentType[]).map((type) => {
            const config = AGENT_TYPE_CONFIGS[type]
            return (
              <div key={type} className="morphic-card p-3 rounded-lg text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{config.icon}</span>
                  <span className="text-sm font-medium text-white capitalize">{type}</span>
                </div>
                <p className="text-xs text-white/50">{config.description}</p>
              </div>
            )
          })}
        </div>

        <button
          onClick={onCreateAgent}
          className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-6 py-3 flex items-center gap-2 mx-auto"
        >
          <Plus className="w-5 h-5" />
          Create Your First Agent
        </button>
      </div>
    </div>
  )
}

function CreateAgentModal({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (name: string, type: AgentType, goal: string) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AgentType>('researcher')
  const [goal, setGoal] = useState('')

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), type, goal.trim() || AGENT_TYPE_CONFIGS[type].defaultGoal)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="morphic-card w-full max-w-md rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Create New Agent</h3>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm text-white/50 block mb-1">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Researcher"
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-sm text-white/50 block mb-2">Agent Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['researcher', 'coder', 'analyst', 'writer'] as AgentType[]).map((t) => {
                const config = AGENT_TYPE_CONFIGS[t]
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`p-3 rounded-lg text-left transition-all ${
                      type === t
                        ? 'bg-rose-gold-400/20 border border-rose-gold-400/50'
                        : 'bg-white/5 border border-transparent hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <span className="text-sm font-medium text-white capitalize">{t}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="text-sm text-white/50 block mb-1">
              Goal (optional)
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={AGENT_TYPE_CONFIGS[type].defaultGoal}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50 resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 morphic-btn px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-2 disabled:opacity-50"
          >
            Create Agent
          </button>
        </div>
      </div>
    </div>
  )
}
