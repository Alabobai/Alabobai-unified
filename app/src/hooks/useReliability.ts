/**
 * useReliability Hook
 *
 * Connects React components to the Reliability Orchestrator system.
 * Provides real-time task progress, checkpoint management, and human-in-the-loop interaction.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  reliabilityOrchestrator,
  type TaskProgress,
  type TaskResult,
  type HumanPrompt,
  type HumanResponse,
  type StepResult,
  type TaskDefinition,
  type StepDefinition
} from '../core/reliabilityOrchestrator'
import { getCheckpointSystem } from '../core/checkpointSystem'
import { persistentMemory } from '../core/persistentMemory'
import { costTracker } from '../core/costTracker'

// ============================================================================
// Types
// ============================================================================

export interface StepInfo {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  duration?: number
  retries: number
  confidence?: number
  error?: string
}

export interface CheckpointInfo {
  id: string
  stepIndex: number
  timestamp: Date
  size: number
}

export interface CostInfo {
  total: number
  limit?: number
  byModel: Record<string, number>
  byTask: Record<string, number>
  trend: number[]
}

export interface UseReliabilityState {
  // Task state
  activeTask: TaskProgress | null
  steps: StepInfo[]
  isRunning: boolean
  isPaused: boolean

  // Human interaction
  humanPrompt: HumanPrompt | null

  // Checkpoints
  checkpoints: CheckpointInfo[]

  // Cost tracking
  cost: CostInfo

  // System status
  isInitialized: boolean
  error: string | null

  // Results
  lastResult: TaskResult | null
}

export interface UseReliabilityActions {
  // Task control
  runTask: (task: TaskDefinition) => Promise<TaskResult>
  runDemoTask: () => Promise<TaskResult>
  pauseTask: () => void
  resumeTask: () => void
  cancelTask: () => void

  // Human interaction
  respondToPrompt: (promptId: string, choice: string) => void

  // Checkpoint management
  restoreCheckpoint: (checkpointId: string) => Promise<void>

  // Utilities
  reset: () => void
}

// ============================================================================
// Demo Task Definition
// ============================================================================

function createDemoTask(): TaskDefinition {
  return {
    id: `demo-${Date.now()}`,
    name: 'AI Research & Summary Task',
    description: 'Demonstrates the reliability system with real execution',
    config: {
      maxRetries: 3,
      retryStrategy: 'exponential',
      timeout: 60000,
      checkpointFrequency: 'every_step',
      confidenceThreshold: 70,
      budgetLimit: 0.50
    },
    steps: [
      {
        id: 'step-1',
        name: 'Initialize Research Context',
        description: 'Set up the research parameters',
        execute: async (context) => {
          await simulateWork(500)
          return {
            success: true,
            data: { topic: 'AI Developments', sources: [] },
            duration: 500,
            confidence: 95
          }
        }
      },
      {
        id: 'step-2',
        name: 'Search Knowledge Base',
        description: 'Query local memory for relevant information',
        execute: async (context) => {
          await simulateWork(800)

          // Actually use the persistent memory system
          const memories = await persistentMemory.recall({
            query: 'AI developments',
            limit: 5
          })

          return {
            success: true,
            data: { memoriesFound: memories.length },
            duration: 800,
            confidence: 88,
            tokensUsed: 150
          }
        }
      },
      {
        id: 'step-3',
        name: 'Analyze Information',
        description: 'Process and analyze gathered information',
        execute: async (context) => {
          // Simulate occasional failure for retry demonstration
          const shouldFail = Math.random() < 0.3

          await simulateWork(1200)

          if (shouldFail) {
            throw new Error('Analysis timeout - retrying...')
          }

          return {
            success: true,
            data: { analysisComplete: true, keyPoints: 5 },
            duration: 1200,
            confidence: 82,
            tokensUsed: 500
          }
        }
      },
      {
        id: 'step-4',
        name: 'Generate Summary',
        description: 'Create a coherent summary of findings',
        execute: async (context) => {
          await simulateWork(1500)

          // Track cost
          await costTracker.trackUsage({
            model: 'local',
            provider: 'local',
            inputTokens: 300,
            outputTokens: 200,
            feature: 'demo-task'
          })

          return {
            success: true,
            data: {
              summary: 'AI developments in 2026 show significant progress in agent reliability, local-first architectures, and cost optimization.',
              wordCount: 150
            },
            duration: 1500,
            confidence: 90,
            tokensUsed: 500
          }
        }
      },
      {
        id: 'step-5',
        name: 'Store Results',
        description: 'Save results to persistent memory',
        execute: async (context) => {
          await simulateWork(300)

          // Actually store in persistent memory
          await persistentMemory.remember(
            'Completed research task on AI developments',
            'solution',
            {
              importance: 60,
              tags: ['research', 'ai', 'summary']
            }
          )

          return {
            success: true,
            data: { stored: true },
            duration: 300,
            confidence: 100
          }
        }
      }
    ]
  }
}

async function simulateWork(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useReliability(): [UseReliabilityState, UseReliabilityActions] {
  // State
  const [activeTask, setActiveTask] = useState<TaskProgress | null>(null)
  const [steps, setSteps] = useState<StepInfo[]>([])
  const [humanPrompt, setHumanPrompt] = useState<HumanPrompt | null>(null)
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([])
  const [cost, setCost] = useState<CostInfo>({
    total: 0,
    limit: 1.00,
    byModel: {},
    byTask: {},
    trend: []
  })
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<TaskResult | null>(null)

  // Refs for cleanup
  const unsubscribesRef = useRef<(() => void)[]>([])
  const currentTaskIdRef = useRef<string | null>(null)

  // Initialize systems
  useEffect(() => {
    async function init() {
      try {
        // Initialize all systems
        await persistentMemory.initialize()
        await costTracker.initialize()
        await getCheckpointSystem()

        setIsInitialized(true)
        console.log('[useReliability] All systems initialized')
      } catch (err) {
        console.error('[useReliability] Initialization error:', err)
        setError(err instanceof Error ? err.message : 'Failed to initialize')
      }
    }

    init()
  }, [])

  // Subscribe to orchestrator events
  useEffect(() => {
    if (!isInitialized) return

    // Task progress
    const unsubProgress = reliabilityOrchestrator.on('task:progress', (progress) => {
      setActiveTask(progress)
    })
    unsubscribesRef.current.push(unsubProgress)

    // Task complete
    const unsubComplete = reliabilityOrchestrator.on('task:complete', (result) => {
      setLastResult(result)
      setActiveTask(null)
    })
    unsubscribesRef.current.push(unsubComplete)

    // Task failed
    const unsubFailed = reliabilityOrchestrator.on('task:failed', ({ taskId, error }) => {
      setError(error.message)
    })
    unsubscribesRef.current.push(unsubFailed)

    // Step events
    const unsubStepStart = reliabilityOrchestrator.on('step:start', ({ taskId, stepId, stepName }) => {
      setSteps(prev => prev.map(s =>
        s.id === stepId ? { ...s, status: 'running' } : s
      ))
    })
    unsubscribesRef.current.push(unsubStepStart)

    const unsubStepComplete = reliabilityOrchestrator.on('step:complete', ({ taskId, stepId, result }) => {
      setSteps(prev => prev.map(s =>
        s.id === stepId ? {
          ...s,
          status: result.success ? 'completed' : 'failed',
          duration: result.duration,
          confidence: result.confidence
        } : s
      ))

      // Update cost
      if (result.tokensUsed) {
        setCost(prev => ({
          ...prev,
          total: prev.total + (result.tokensUsed! * 0.00001) // Rough estimate
        }))
      }
    })
    unsubscribesRef.current.push(unsubStepComplete)

    const unsubStepRetry = reliabilityOrchestrator.on('step:retry', ({ taskId, stepId, attempt }) => {
      setSteps(prev => prev.map(s =>
        s.id === stepId ? { ...s, retries: attempt } : s
      ))
    })
    unsubscribesRef.current.push(unsubStepRetry)

    // Human prompts
    const unsubHuman = reliabilityOrchestrator.on('human:prompt', (prompt) => {
      setHumanPrompt(prompt)
    })
    unsubscribesRef.current.push(unsubHuman)

    // Checkpoints
    const unsubCheckpoint = reliabilityOrchestrator.on('checkpoint:created', ({ taskId, checkpointId }) => {
      setCheckpoints(prev => [...prev, {
        id: checkpointId,
        stepIndex: prev.length,
        timestamp: new Date(),
        size: 1024 // Approximate
      }])
    })
    unsubscribesRef.current.push(unsubCheckpoint)

    // Cost tracking
    const unsubCost = costTracker.onUsage((entry, budgetStatuses) => {
      setCost(prev => ({
        ...prev,
        total: prev.total + entry.cost,
        byModel: {
          ...prev.byModel,
          [entry.model]: (prev.byModel[entry.model] || 0) + entry.cost
        }
      }))
    })
    unsubscribesRef.current.push(unsubCost)

    // Cleanup
    return () => {
      unsubscribesRef.current.forEach(unsub => unsub())
      unsubscribesRef.current = []
    }
  }, [isInitialized])

  // Actions
  const runTask = useCallback(async (task: TaskDefinition): Promise<TaskResult> => {
    currentTaskIdRef.current = task.id

    // Initialize steps
    setSteps(task.steps.map(s => ({
      id: s.id,
      name: s.name,
      status: 'pending' as const,
      retries: 0
    })))

    // Reset state
    setCheckpoints([])
    setError(null)
    setLastResult(null)
    setCost(prev => ({ ...prev, total: 0, byModel: {} }))

    // Execute
    return reliabilityOrchestrator.executeTask(task)
  }, [])

  const runDemoTask = useCallback(async (): Promise<TaskResult> => {
    const task = createDemoTask()
    return runTask(task)
  }, [runTask])

  const pauseTask = useCallback(() => {
    if (currentTaskIdRef.current) {
      reliabilityOrchestrator.pauseTask(currentTaskIdRef.current)
    }
  }, [])

  const resumeTask = useCallback(() => {
    if (currentTaskIdRef.current) {
      reliabilityOrchestrator.resumeTask(currentTaskIdRef.current)
    }
  }, [])

  const cancelTask = useCallback(() => {
    if (currentTaskIdRef.current) {
      reliabilityOrchestrator.cancelTask(currentTaskIdRef.current)
      currentTaskIdRef.current = null
    }
  }, [])

  const respondToPrompt = useCallback((promptId: string, choice: string) => {
    reliabilityOrchestrator.provideHumanResponse({
      promptId,
      choice,
      timestamp: new Date()
    })
    setHumanPrompt(null)
  }, [])

  const restoreCheckpoint = useCallback(async (checkpointId: string) => {
    if (!currentTaskIdRef.current) return

    try {
      await reliabilityOrchestrator.resumeFromCheckpoint(
        currentTaskIdRef.current,
        checkpointId
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore checkpoint')
    }
  }, [])

  const reset = useCallback(() => {
    setActiveTask(null)
    setSteps([])
    setHumanPrompt(null)
    setCheckpoints([])
    setCost({ total: 0, limit: 1.00, byModel: {}, byTask: {}, trend: [] })
    setError(null)
    setLastResult(null)
    currentTaskIdRef.current = null
  }, [])

  // Computed values
  const isRunning = activeTask?.status === 'running'
  const isPaused = activeTask?.status === 'paused'

  const state: UseReliabilityState = {
    activeTask,
    steps,
    isRunning,
    isPaused,
    humanPrompt,
    checkpoints,
    cost,
    isInitialized,
    error,
    lastResult
  }

  const actions: UseReliabilityActions = {
    runTask,
    runDemoTask,
    pauseTask,
    resumeTask,
    cancelTask,
    respondToPrompt,
    restoreCheckpoint,
    reset
  }

  return [state, actions]
}

export default useReliability
