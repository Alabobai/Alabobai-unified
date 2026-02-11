/**
 * Self-Annealing Engine
 * Enables agents to continuously self-improve, learn from failures,
 * and optimize until perfect - like Manus AI / Moltbot
 */

export interface AnnealingState {
  temperature: number      // Current "temperature" - higher = more exploration
  energy: number          // Current solution quality (lower = better)
  bestEnergy: number      // Best solution found so far
  iterations: number      // Number of iterations performed
  improvements: number    // Number of improvements made
  stagnation: number      // Iterations without improvement
  convergence: number     // Convergence score (0-1)
}

export interface AnnealingConfig {
  initialTemperature: number
  coolingRate: number
  minTemperature: number
  maxIterations: number
  targetEnergy: number
  reheatingThreshold: number
  acceptanceFunction: 'boltzmann' | 'threshold' | 'adaptive'
}

export interface QualityMetrics {
  accuracy: number
  completeness: number
  performance: number
  reliability: number
  userSatisfaction: number
  errorRate: number
}

export interface LearningRecord {
  id: string
  timestamp: Date
  taskType: string
  input: string
  output: string
  quality: QualityMetrics
  feedback?: string
  improvements: string[]
  toolsUsed: string[]
  duration: number
}

// Self-Annealing capabilities for continuous improvement
export class SelfAnnealingEngine {
  private state: AnnealingState
  private config: AnnealingConfig
  private learningHistory: LearningRecord[] = []
  private patternMemory: Map<string, { pattern: string; successRate: number }> = new Map()

  constructor(config?: Partial<AnnealingConfig>) {
    this.config = {
      initialTemperature: 100,
      coolingRate: 0.95,
      minTemperature: 0.1,
      maxIterations: 1000,
      targetEnergy: 0.05,
      reheatingThreshold: 50,
      acceptanceFunction: 'adaptive',
      ...config
    }

    this.state = {
      temperature: this.config.initialTemperature,
      energy: 1.0,
      bestEnergy: 1.0,
      iterations: 0,
      improvements: 0,
      stagnation: 0,
      convergence: 0
    }
  }

  // Main annealing loop - keeps improving until perfect
  async anneal<T>(
    initialSolution: T,
    evaluator: (solution: T) => Promise<number>,
    mutator: (solution: T, temperature: number) => Promise<T>,
    onProgress?: (state: AnnealingState, solution: T) => void
  ): Promise<{ solution: T; state: AnnealingState }> {
    let currentSolution = initialSolution
    let bestSolution = initialSolution

    this.state.energy = await evaluator(currentSolution)
    this.state.bestEnergy = this.state.energy

    while (
      this.state.temperature > this.config.minTemperature &&
      this.state.iterations < this.config.maxIterations &&
      this.state.bestEnergy > this.config.targetEnergy
    ) {
      // Generate neighbor solution
      const neighbor = await mutator(currentSolution, this.state.temperature)
      const neighborEnergy = await evaluator(neighbor)

      // Decide whether to accept
      if (this.shouldAccept(this.state.energy, neighborEnergy)) {
        currentSolution = neighbor
        this.state.energy = neighborEnergy

        if (neighborEnergy < this.state.bestEnergy) {
          bestSolution = neighbor
          this.state.bestEnergy = neighborEnergy
          this.state.improvements++
          this.state.stagnation = 0
        } else {
          this.state.stagnation++
        }
      } else {
        this.state.stagnation++
      }

      // Reheat if stagnating
      if (this.state.stagnation >= this.config.reheatingThreshold) {
        this.reheat()
      }

      // Cool down
      this.state.temperature *= this.config.coolingRate
      this.state.iterations++
      this.state.convergence = 1 - this.state.bestEnergy

      onProgress?.(this.state, bestSolution)
    }

    return { solution: bestSolution, state: this.state }
  }

  private shouldAccept(currentEnergy: number, newEnergy: number): boolean {
    if (newEnergy < currentEnergy) return true

    const delta = newEnergy - currentEnergy

    switch (this.config.acceptanceFunction) {
      case 'boltzmann':
        return Math.random() < Math.exp(-delta / this.state.temperature)
      case 'threshold':
        return delta < this.state.temperature * 0.1
      case 'adaptive':
        const adaptiveProb = Math.exp(-delta / this.state.temperature) *
                           (1 - this.state.convergence)
        return Math.random() < adaptiveProb
      default:
        return false
    }
  }

  private reheat() {
    this.state.temperature = Math.min(
      this.state.temperature * 2,
      this.config.initialTemperature * 0.5
    )
    this.state.stagnation = 0
  }

  // Learn from execution results
  recordLearning(record: LearningRecord) {
    this.learningHistory.push(record)

    // Extract and store patterns
    const pattern = this.extractPattern(record)
    const existing = this.patternMemory.get(pattern)

    if (existing) {
      existing.successRate = (existing.successRate + record.quality.accuracy) / 2
    } else {
      this.patternMemory.set(pattern, {
        pattern,
        successRate: record.quality.accuracy
      })
    }
  }

  private extractPattern(record: LearningRecord): string {
    return `${record.taskType}:${record.toolsUsed.join(',')}`
  }

  // Get best approach for a task type based on learning
  getBestApproach(taskType: string): { tools: string[]; confidence: number } | null {
    let bestPattern: { pattern: string; successRate: number } | null = null

    for (const [key, value] of this.patternMemory) {
      if (key.startsWith(taskType) && (!bestPattern || value.successRate > bestPattern.successRate)) {
        bestPattern = value
      }
    }

    if (bestPattern) {
      const tools = bestPattern.pattern.split(':')[1]?.split(',') || []
      return { tools, confidence: bestPattern.successRate }
    }

    return null
  }

  getState(): AnnealingState {
    return { ...this.state }
  }

  reset() {
    this.state = {
      temperature: this.config.initialTemperature,
      energy: 1.0,
      bestEnergy: 1.0,
      iterations: 0,
      improvements: 0,
      stagnation: 0,
      convergence: 0
    }
  }
}

export const selfAnnealingEngine = new SelfAnnealingEngine()
