/**
 * Human-in-the-Loop System
 *
 * Manages AI decision confidence scoring, escalation logic, user prompts,
 * decision recording, and UI integration for the Alabobai platform.
 * This enables safe and controlled AI automation with human oversight.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Priority levels for human prompts
 */
export type PromptPriority = 'critical' | 'high' | 'medium' | 'low'

/**
 * Categories of high-risk actions that require escalation
 */
export type RiskCategory =
  | 'file_deletion'
  | 'payment_processing'
  | 'external_api'
  | 'data_modification'
  | 'authentication'
  | 'system_configuration'
  | 'network_request'
  | 'sensitive_data_access'

/**
 * Types of escalation triggers
 */
export type EscalationType =
  | 'low_confidence'
  | 'high_risk_action'
  | 'stuck_state'
  | 'ambiguous_instruction'
  | 'repeated_failure'
  | 'circular_action'
  | 'timeout'
  | 'manual_request'

/**
 * Option for multiple choice prompts
 */
export interface PromptOption {
  /** Unique identifier for the option */
  id: string
  /** Display label for the option */
  label: string
  /** Optional description providing more context */
  description?: string
  /** Whether this is the recommended/default option */
  recommended?: boolean
  /** Risk level associated with this option */
  riskLevel?: 'safe' | 'moderate' | 'risky'
}

/**
 * Context information for a prompt
 */
export interface PromptContext {
  /** What action the AI is trying to perform */
  action: string
  /** Why the AI is attempting this action */
  reason: string
  /** What data/resources are involved */
  involvedData?: string[]
  /** Previous attempts or actions in this sequence */
  history?: string[]
  /** Current state of the task */
  currentState?: string
  /** Potential consequences of proceeding */
  consequences?: string[]
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Human prompt - question to be presented to the user
 */
export interface HumanPrompt {
  /** Unique identifier for the prompt */
  id: string
  /** Type of escalation that triggered this prompt */
  type: EscalationType
  /** Clear, actionable question for the user */
  question: string
  /** Context about what's happening */
  context: PromptContext
  /** Multiple choice options when applicable */
  options?: PromptOption[]
  /** Whether free-form input is allowed */
  allowFreeform: boolean
  /** Placeholder text for free-form input */
  freeformPlaceholder?: string
  /** Priority level of this prompt */
  priority: PromptPriority
  /** Whether this prompt blocks execution */
  blocking: boolean
  /** Timeout in milliseconds (null = no timeout) */
  timeout: number | null
  /** Default action if timeout occurs */
  timeoutAction?: 'proceed' | 'cancel' | 'retry'
  /** Timestamp when the prompt was created */
  createdAt: Date
  /** Related confidence score */
  confidenceScore?: ConfidenceScore
}

/**
 * User decision - recorded response to a prompt
 */
export interface UserDecision {
  /** Unique identifier for the decision */
  id: string
  /** Reference to the prompt this decision responds to */
  promptId: string
  /** The user's choice (option ID or 'freeform') */
  choice: string
  /** Free-form reasoning or additional input */
  reasoning?: string
  /** Timestamp of the decision */
  timestamp: Date
  /** How long it took the user to decide (ms) */
  responseTime: number
  /** Whether this was a timeout-triggered default */
  wasTimeout: boolean
  /** The user who made the decision (if available) */
  userId?: string
  /** Session identifier */
  sessionId?: string
}

/**
 * Factor contributing to a confidence score
 */
export interface ConfidenceFactor {
  /** Name of the factor */
  name: string
  /** Weight/importance of this factor (0-1) */
  weight: number
  /** Score for this factor (0-100) */
  score: number
  /** Explanation of how this factor was evaluated */
  explanation: string
}

/**
 * Confidence score for an AI decision/action
 */
export interface ConfidenceScore {
  /** Overall confidence value (0-100) */
  value: number
  /** Individual factors contributing to the score */
  factors: ConfidenceFactor[]
  /** Human-readable explanation of the score */
  explanation: string
  /** Category of the action being scored */
  category: string
  /** Timestamp of the scoring */
  timestamp: Date
  /** Recommended action based on threshold */
  recommendation: 'auto_proceed' | 'warn_proceed' | 'ask_user'
}

/**
 * Configuration for confidence thresholds
 */
export interface ConfidenceThresholds {
  /** Score above which actions auto-proceed */
  autoApprove: number
  /** Score below which user must be asked */
  requireApproval: number
  /** Per-category threshold overrides */
  categoryOverrides?: Record<string, { autoApprove: number; requireApproval: number }>
}

/**
 * Learned decision pattern
 */
export interface DecisionPattern {
  /** Unique identifier for the pattern */
  id: string
  /** Pattern matching criteria */
  criteria: PatternCriteria
  /** The typical user decision for this pattern */
  typicalDecision: string
  /** Number of times this pattern has been seen */
  occurrences: number
  /** Success rate of applying this pattern */
  successRate: number
  /** Whether to auto-apply this pattern */
  autoApply: boolean
  /** Confidence threshold for auto-applying */
  autoApplyThreshold: number
  /** Last time the pattern was updated */
  lastUpdated: Date
  /** When the pattern was first created */
  createdAt: Date
}

/**
 * Criteria for matching a decision pattern
 */
export interface PatternCriteria {
  /** Type of escalation */
  escalationType?: EscalationType
  /** Action category */
  actionCategory?: string
  /** Risk categories involved */
  riskCategories?: RiskCategory[]
  /** Minimum confidence score */
  minConfidence?: number
  /** Maximum confidence score */
  maxConfidence?: number
  /** Context keywords */
  contextKeywords?: string[]
}

/**
 * Stuck state detection configuration
 */
export interface StuckStateConfig {
  /** Number of repeated failures before escalation */
  maxFailures: number
  /** Time window for counting failures (ms) */
  failureWindow: number
  /** Number of circular actions before escalation */
  maxCircularActions: number
  /** Actions to check for circularity */
  circularityDepth: number
}

/**
 * Event types emitted by the HumanInLoop system
 */
export type HumanInLoopEvent =
  | 'prompt:created'
  | 'prompt:resolved'
  | 'prompt:timeout'
  | 'prompt:cancelled'
  | 'decision:recorded'
  | 'pattern:learned'
  | 'pattern:applied'
  | 'confidence:calculated'
  | 'escalation:triggered'
  | 'threshold:updated'

/**
 * Event handler type
 */
export type HumanInLoopEventHandler<T = unknown> = (data: T) => void

/**
 * Prompt resolution result
 */
export interface PromptResolution {
  /** The prompt that was resolved */
  prompt: HumanPrompt
  /** The user's decision */
  decision: UserDecision
  /** Whether execution should proceed */
  shouldProceed: boolean
  /** Any modified parameters from the decision */
  modifiedParams?: Record<string, unknown>
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_DECISIONS = 'alabobai-hil-decisions'
const STORAGE_KEY_PATTERNS = 'alabobai-hil-patterns'
const STORAGE_KEY_THRESHOLDS = 'alabobai-hil-thresholds'
const STORAGE_KEY_CONFIDENCE_HISTORY = 'alabobai-hil-confidence-history'

const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  autoApprove: 80,
  requireApproval: 50,
  categoryOverrides: {
    file_deletion: { autoApprove: 95, requireApproval: 70 },
    payment_processing: { autoApprove: 95, requireApproval: 80 },
    authentication: { autoApprove: 90, requireApproval: 60 },
  },
}

const DEFAULT_STUCK_STATE_CONFIG: StuckStateConfig = {
  maxFailures: 3,
  failureWindow: 60000, // 1 minute
  maxCircularActions: 5,
  circularityDepth: 10,
}

const HIGH_RISK_ACTIONS: RiskCategory[] = [
  'file_deletion',
  'payment_processing',
  'external_api',
  'data_modification',
  'authentication',
  'system_configuration',
  'sensitive_data_access',
]

// ============================================================================
// Event Emitter for UI Integration
// ============================================================================

class HumanInLoopEventEmitter {
  private listeners: Map<HumanInLoopEvent, Set<HumanInLoopEventHandler>> = new Map()

  emit<T = unknown>(event: HumanInLoopEvent, data: T): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[HumanInLoop] Error in event handler for "${event}":`, error)
        }
      })
    }
  }

  on<T = unknown>(event: HumanInLoopEvent, handler: HumanInLoopEventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as HumanInLoopEventHandler)
    return () => this.off(event, handler)
  }

  off<T = unknown>(event: HumanInLoopEvent, handler: HumanInLoopEventHandler<T>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as HumanInLoopEventHandler)
    }
  }

  removeAllListeners(event?: HumanInLoopEvent): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Calculate confidence score for an AI decision/action
 */
export function calculateConfidenceScore(
  action: string,
  category: string,
  factors: Omit<ConfidenceFactor, 'score'>[],
  factorScores: number[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS
): ConfidenceScore {
  if (factors.length !== factorScores.length) {
    throw new Error('Number of factors must match number of scores')
  }

  // Build scored factors
  const scoredFactors: ConfidenceFactor[] = factors.map((factor, index) => ({
    ...factor,
    score: Math.max(0, Math.min(100, factorScores[index])),
  }))

  // Calculate weighted average
  const totalWeight = scoredFactors.reduce((sum, f) => sum + f.weight, 0)
  const weightedSum = scoredFactors.reduce((sum, f) => sum + f.score * f.weight, 0)
  const value = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0

  // Determine recommendation based on thresholds
  const categoryThresholds = thresholds.categoryOverrides?.[category] ?? {
    autoApprove: thresholds.autoApprove,
    requireApproval: thresholds.requireApproval,
  }

  let recommendation: ConfidenceScore['recommendation']
  if (value >= categoryThresholds.autoApprove) {
    recommendation = 'auto_proceed'
  } else if (value >= categoryThresholds.requireApproval) {
    recommendation = 'warn_proceed'
  } else {
    recommendation = 'ask_user'
  }

  // Generate explanation
  const lowFactors = scoredFactors.filter((f) => f.score < 50)
  const highFactors = scoredFactors.filter((f) => f.score >= 80)

  let explanation = `Confidence score of ${value}/100 for "${action}".`
  if (highFactors.length > 0) {
    explanation += ` Strong factors: ${highFactors.map((f) => f.name).join(', ')}.`
  }
  if (lowFactors.length > 0) {
    explanation += ` Weak factors: ${lowFactors.map((f) => f.name).join(', ')}.`
  }

  return {
    value,
    factors: scoredFactors,
    explanation,
    category,
    timestamp: new Date(),
    recommendation,
  }
}

// ============================================================================
// Human-in-the-Loop Class
// ============================================================================

export class HumanInLoop {
  private static instance: HumanInLoop | null = null

  private eventEmitter: HumanInLoopEventEmitter = new HumanInLoopEventEmitter()
  private pendingPrompts: Map<string, HumanPrompt> = new Map()
  private promptResolvers: Map<string, (decision: UserDecision) => void> = new Map()
  private promptTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private decisions: UserDecision[] = []
  private patterns: DecisionPattern[] = []
  private thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS
  private stuckStateConfig: StuckStateConfig = DEFAULT_STUCK_STATE_CONFIG
  private confidenceHistory: ConfidenceScore[] = []
  private actionHistory: Array<{ action: string; timestamp: Date; success: boolean }> = []
  private initialized = false

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): HumanInLoop {
    if (!HumanInLoop.instance) {
      HumanInLoop.instance = new HumanInLoop()
    }
    return HumanInLoop.instance
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the Human-in-the-Loop system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[HumanInLoop] Already initialized')
      return
    }

    console.log('[HumanInLoop] Initializing...')

    await this.loadFromStorage()

    this.initialized = true
    console.log('[HumanInLoop] Initialized successfully')
  }

  private async loadFromStorage(): Promise<void> {
    try {
      // Load decisions
      const decisionsStr = localStorage.getItem(STORAGE_KEY_DECISIONS)
      if (decisionsStr) {
        const parsed = JSON.parse(decisionsStr)
        this.decisions = parsed.map((d: UserDecision) => ({
          ...d,
          timestamp: new Date(d.timestamp),
        }))
      }

      // Load patterns
      const patternsStr = localStorage.getItem(STORAGE_KEY_PATTERNS)
      if (patternsStr) {
        const parsed = JSON.parse(patternsStr)
        this.patterns = parsed.map((p: DecisionPattern) => ({
          ...p,
          lastUpdated: new Date(p.lastUpdated),
          createdAt: new Date(p.createdAt),
        }))
      }

      // Load thresholds
      const thresholdsStr = localStorage.getItem(STORAGE_KEY_THRESHOLDS)
      if (thresholdsStr) {
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...JSON.parse(thresholdsStr) }
      }

      // Load confidence history
      const historyStr = localStorage.getItem(STORAGE_KEY_CONFIDENCE_HISTORY)
      if (historyStr) {
        const parsed = JSON.parse(historyStr)
        this.confidenceHistory = parsed.map((h: ConfidenceScore) => ({
          ...h,
          timestamp: new Date(h.timestamp),
        }))
      }
    } catch (error) {
      console.error('[HumanInLoop] Failed to load from storage:', error)
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_DECISIONS, JSON.stringify(this.decisions))
      localStorage.setItem(STORAGE_KEY_PATTERNS, JSON.stringify(this.patterns))
      localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(this.thresholds))
      localStorage.setItem(STORAGE_KEY_CONFIDENCE_HISTORY, JSON.stringify(this.confidenceHistory))
    } catch (error) {
      console.error('[HumanInLoop] Failed to save to storage:', error)
    }
  }

  // ============================================================================
  // Confidence Scoring
  // ============================================================================

  /**
   * Score an AI decision/action
   */
  scoreDecision(
    action: string,
    category: string,
    factors: Omit<ConfidenceFactor, 'score'>[],
    factorScores: number[]
  ): ConfidenceScore {
    const score = calculateConfidenceScore(action, category, factors, factorScores, this.thresholds)

    // Track in history
    this.confidenceHistory.push(score)

    // Keep only last 1000 entries
    if (this.confidenceHistory.length > 1000) {
      this.confidenceHistory = this.confidenceHistory.slice(-1000)
    }

    this.saveToStorage()
    this.eventEmitter.emit('confidence:calculated', score)

    return score
  }

  /**
   * Get recommendation for a confidence score
   */
  getRecommendation(score: ConfidenceScore): 'auto_proceed' | 'warn_proceed' | 'ask_user' {
    return score.recommendation
  }

  /**
   * Update confidence thresholds
   */
  updateThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds }
    this.saveToStorage()
    this.eventEmitter.emit('threshold:updated', this.thresholds)
  }

  /**
   * Get current thresholds
   */
  getThresholds(): ConfidenceThresholds {
    return { ...this.thresholds }
  }

  /**
   * Calibrate thresholds based on historical data
   */
  calibrateThresholds(): ConfidenceThresholds {
    if (this.confidenceHistory.length < 10) {
      return this.thresholds
    }

    // Analyze historical confidence scores and user decisions
    const scoresByDecision = new Map<'proceed' | 'cancel', number[]>()
    scoresByDecision.set('proceed', [])
    scoresByDecision.set('cancel', [])

    // Match confidence scores with decisions
    for (const decision of this.decisions) {
      const prompt = this.findHistoricalPrompt(decision.promptId)
      if (prompt?.confidenceScore) {
        const action = decision.choice === 'proceed' || decision.choice === 'approve' ? 'proceed' : 'cancel'
        scoresByDecision.get(action)?.push(prompt.confidenceScore.value)
      }
    }

    const proceedScores = scoresByDecision.get('proceed') ?? []
    const cancelScores = scoresByDecision.get('cancel') ?? []

    if (proceedScores.length >= 5 && cancelScores.length >= 5) {
      // Calculate suggested thresholds
      const avgProceed = proceedScores.reduce((a, b) => a + b, 0) / proceedScores.length
      const avgCancel = cancelScores.reduce((a, b) => a + b, 0) / cancelScores.length

      const suggestedAutoApprove = Math.min(95, Math.max(70, Math.round(avgProceed * 1.1)))
      const suggestedRequireApproval = Math.min(
        suggestedAutoApprove - 10,
        Math.max(30, Math.round((avgProceed + avgCancel) / 2))
      )

      const calibrated: ConfidenceThresholds = {
        ...this.thresholds,
        autoApprove: suggestedAutoApprove,
        requireApproval: suggestedRequireApproval,
      }

      return calibrated
    }

    return this.thresholds
  }

  private findHistoricalPrompt(promptId: string): HumanPrompt | undefined {
    // In a full implementation, this would look up historical prompts
    // For now, return undefined since prompts are not persisted long-term
    return undefined
  }

  // ============================================================================
  // Escalation Logic
  // ============================================================================

  /**
   * Check if an action requires escalation
   */
  checkEscalation(
    action: string,
    category: string,
    riskCategories: RiskCategory[],
    confidenceScore?: ConfidenceScore
  ): { shouldEscalate: boolean; type: EscalationType; reason: string } | null {
    // Check for high-risk actions
    const highRiskMatches = riskCategories.filter((r) => HIGH_RISK_ACTIONS.includes(r))
    if (highRiskMatches.length > 0) {
      this.eventEmitter.emit('escalation:triggered', {
        type: 'high_risk_action',
        action,
        riskCategories: highRiskMatches,
      })
      return {
        shouldEscalate: true,
        type: 'high_risk_action',
        reason: `High-risk action detected: ${highRiskMatches.join(', ')}`,
      }
    }

    // Check for low confidence
    if (confidenceScore && confidenceScore.recommendation === 'ask_user') {
      this.eventEmitter.emit('escalation:triggered', {
        type: 'low_confidence',
        action,
        score: confidenceScore.value,
      })
      return {
        shouldEscalate: true,
        type: 'low_confidence',
        reason: `Low confidence score: ${confidenceScore.value}/100`,
      }
    }

    // Check for stuck state
    const stuckState = this.detectStuckState(action)
    if (stuckState) {
      this.eventEmitter.emit('escalation:triggered', {
        type: stuckState.type,
        action,
        details: stuckState,
      })
      return {
        shouldEscalate: true,
        type: stuckState.type,
        reason: stuckState.reason,
      }
    }

    return null
  }

  /**
   * Detect stuck state (repeated failures or circular actions)
   */
  private detectStuckState(
    currentAction: string
  ): { type: 'repeated_failure' | 'circular_action'; reason: string } | null {
    const now = Date.now()
    const windowStart = now - this.stuckStateConfig.failureWindow

    // Check for repeated failures
    const recentFailures = this.actionHistory.filter(
      (a) => a.timestamp.getTime() >= windowStart && !a.success && a.action === currentAction
    )

    if (recentFailures.length >= this.stuckStateConfig.maxFailures) {
      return {
        type: 'repeated_failure',
        reason: `Action "${currentAction}" has failed ${recentFailures.length} times in the last ${this.stuckStateConfig.failureWindow / 1000}s`,
      }
    }

    // Check for circular actions
    const recentActions = this.actionHistory.slice(-this.stuckStateConfig.circularityDepth)
    const actionCounts = new Map<string, number>()

    for (const a of recentActions) {
      actionCounts.set(a.action, (actionCounts.get(a.action) ?? 0) + 1)
    }

    for (const entry of Array.from(actionCounts.entries())) {
      const [action, count] = entry
      if (count >= this.stuckStateConfig.maxCircularActions) {
        return {
          type: 'circular_action',
          reason: `Detected circular pattern: "${action}" repeated ${count} times in last ${this.stuckStateConfig.circularityDepth} actions`,
        }
      }
    }

    return null
  }

  /**
   * Record an action for stuck state detection
   */
  recordAction(action: string, success: boolean): void {
    this.actionHistory.push({
      action,
      timestamp: new Date(),
      success,
    })

    // Keep only recent actions
    const maxHistory = this.stuckStateConfig.circularityDepth * 2
    if (this.actionHistory.length > maxHistory) {
      this.actionHistory = this.actionHistory.slice(-maxHistory)
    }
  }

  /**
   * Detect ambiguous instructions
   */
  detectAmbiguity(
    instruction: string,
    possibleInterpretations: string[]
  ): { isAmbiguous: boolean; interpretations: string[] } {
    if (possibleInterpretations.length <= 1) {
      return { isAmbiguous: false, interpretations: possibleInterpretations }
    }

    // More than one valid interpretation = ambiguous
    return {
      isAmbiguous: true,
      interpretations: possibleInterpretations,
    }
  }

  // ============================================================================
  // User Prompts
  // ============================================================================

  /**
   * Create a human prompt
   */
  createPrompt(params: {
    type: EscalationType
    question: string
    context: PromptContext
    options?: PromptOption[]
    allowFreeform?: boolean
    freeformPlaceholder?: string
    priority?: PromptPriority
    blocking?: boolean
    timeout?: number | null
    timeoutAction?: 'proceed' | 'cancel' | 'retry'
    confidenceScore?: ConfidenceScore
  }): HumanPrompt {
    const id = crypto.randomUUID()

    const prompt: HumanPrompt = {
      id,
      type: params.type,
      question: params.question,
      context: params.context,
      options: params.options,
      allowFreeform: params.allowFreeform ?? !params.options?.length,
      freeformPlaceholder: params.freeformPlaceholder,
      priority: params.priority ?? 'medium',
      blocking: params.blocking ?? true,
      timeout: params.timeout ?? null,
      timeoutAction: params.timeoutAction ?? 'cancel',
      createdAt: new Date(),
      confidenceScore: params.confidenceScore,
    }

    this.pendingPrompts.set(id, prompt)
    this.eventEmitter.emit('prompt:created', prompt)

    return prompt
  }

  /**
   * Generate a clear, actionable prompt for common scenarios
   */
  generatePrompt(
    type: EscalationType,
    context: PromptContext,
    confidenceScore?: ConfidenceScore
  ): HumanPrompt {
    let question: string
    let options: PromptOption[] | undefined
    let priority: PromptPriority = 'medium'
    let blocking = true

    switch (type) {
      case 'low_confidence':
        question = `I'm not confident about this action. ${context.action}. Should I proceed?`
        options = [
          { id: 'proceed', label: 'Yes, proceed', riskLevel: 'moderate' },
          { id: 'cancel', label: 'No, cancel', riskLevel: 'safe', recommended: true },
          { id: 'modify', label: 'Modify approach', riskLevel: 'safe' },
        ]
        priority = 'high'
        break

      case 'high_risk_action':
        question = `This action involves risk: ${context.action}. Do you want to proceed?`
        options = [
          { id: 'proceed', label: 'Yes, I understand the risks', riskLevel: 'risky' },
          { id: 'cancel', label: 'No, cancel', riskLevel: 'safe', recommended: true },
          { id: 'review', label: 'Show me more details', riskLevel: 'safe' },
        ]
        priority = 'critical'
        break

      case 'stuck_state':
        question = `I seem to be stuck. ${context.reason}. How should I proceed?`
        options = [
          { id: 'retry', label: 'Try again', riskLevel: 'moderate' },
          { id: 'alternative', label: 'Try a different approach', riskLevel: 'moderate', recommended: true },
          { id: 'cancel', label: 'Stop trying', riskLevel: 'safe' },
          { id: 'help', label: 'I need to provide more guidance', riskLevel: 'safe' },
        ]
        priority = 'high'
        break

      case 'ambiguous_instruction':
        question = `I found multiple ways to interpret your request: ${context.action}. Which interpretation is correct?`
        options = context.history?.map((interpretation, i) => ({
          id: `interpretation_${i}`,
          label: interpretation,
          riskLevel: 'safe' as const,
        }))
        priority = 'medium'
        break

      case 'repeated_failure':
        question = `This action has failed multiple times: ${context.action}. What should I do?`
        options = [
          { id: 'retry', label: 'Try once more', riskLevel: 'moderate' },
          { id: 'skip', label: 'Skip this step', riskLevel: 'moderate' },
          { id: 'cancel', label: 'Cancel the entire operation', riskLevel: 'safe', recommended: true },
        ]
        priority = 'high'
        break

      case 'circular_action':
        question = `I've been repeating the same action: ${context.action}. This might indicate a problem.`
        options = [
          { id: 'break', label: 'Break the cycle', riskLevel: 'safe', recommended: true },
          { id: 'continue', label: 'Continue anyway', riskLevel: 'risky' },
          { id: 'help', label: 'I\'ll provide new instructions', riskLevel: 'safe' },
        ]
        priority = 'high'
        break

      case 'timeout':
        question = `The previous operation timed out: ${context.action}. How should I proceed?`
        options = [
          { id: 'retry', label: 'Retry', riskLevel: 'moderate' },
          { id: 'cancel', label: 'Cancel', riskLevel: 'safe', recommended: true },
        ]
        priority = 'medium'
        blocking = false
        break

      case 'manual_request':
      default:
        question = context.action
        priority = 'medium'
        break
    }

    return this.createPrompt({
      type,
      question,
      context,
      options,
      allowFreeform: type === 'manual_request' || type === 'ambiguous_instruction',
      priority,
      blocking,
      confidenceScore,
    })
  }

  /**
   * Wait for user response to a prompt
   */
  async waitForResponse(promptId: string): Promise<UserDecision> {
    const prompt = this.pendingPrompts.get(promptId)
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`)
    }

    return new Promise((resolve, reject) => {
      // Set up resolver
      this.promptResolvers.set(promptId, resolve)

      // Set up timeout if configured
      if (prompt.timeout !== null) {
        const timeoutId = setTimeout(() => {
          const defaultDecision = this.handleTimeout(prompt)
          resolve(defaultDecision)
        }, prompt.timeout)

        this.promptTimeouts.set(promptId, timeoutId)
      }
    })
  }

  /**
   * Resolve a prompt with a user decision
   */
  resolvePrompt(promptId: string, choice: string, reasoning?: string): PromptResolution {
    const prompt = this.pendingPrompts.get(promptId)
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`)
    }

    // Clear timeout if exists
    const timeoutId = this.promptTimeouts.get(promptId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.promptTimeouts.delete(promptId)
    }

    // Create decision
    const decision: UserDecision = {
      id: crypto.randomUUID(),
      promptId,
      choice,
      reasoning,
      timestamp: new Date(),
      responseTime: Date.now() - prompt.createdAt.getTime(),
      wasTimeout: false,
    }

    // Record decision
    this.recordDecision(decision)

    // Clean up
    this.pendingPrompts.delete(promptId)
    const resolver = this.promptResolvers.get(promptId)
    if (resolver) {
      resolver(decision)
      this.promptResolvers.delete(promptId)
    }

    this.eventEmitter.emit('prompt:resolved', { prompt, decision })

    // Determine if should proceed
    const shouldProceed = ['proceed', 'approve', 'yes', 'continue', 'retry'].includes(choice.toLowerCase())

    return {
      prompt,
      decision,
      shouldProceed,
    }
  }

  /**
   * Cancel a pending prompt
   */
  cancelPrompt(promptId: string): void {
    const prompt = this.pendingPrompts.get(promptId)
    if (!prompt) return

    // Clear timeout
    const timeoutId = this.promptTimeouts.get(promptId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.promptTimeouts.delete(promptId)
    }

    // Clean up
    this.pendingPrompts.delete(promptId)
    this.promptResolvers.delete(promptId)

    this.eventEmitter.emit('prompt:cancelled', prompt)
  }

  private handleTimeout(prompt: HumanPrompt): UserDecision {
    const decision: UserDecision = {
      id: crypto.randomUUID(),
      promptId: prompt.id,
      choice: prompt.timeoutAction ?? 'cancel',
      reasoning: 'Automatic decision due to timeout',
      timestamp: new Date(),
      responseTime: prompt.timeout ?? 0,
      wasTimeout: true,
    }

    // Record decision
    this.recordDecision(decision)

    // Clean up
    this.pendingPrompts.delete(prompt.id)
    this.promptResolvers.delete(prompt.id)
    this.promptTimeouts.delete(prompt.id)

    this.eventEmitter.emit('prompt:timeout', { prompt, decision })

    return decision
  }

  /**
   * Get all pending prompts
   */
  getPendingPrompts(): HumanPrompt[] {
    return Array.from(this.pendingPrompts.values())
  }

  /**
   * Get pending prompts by priority
   */
  getPendingPromptsByPriority(priority: PromptPriority): HumanPrompt[] {
    return this.getPendingPrompts().filter((p) => p.priority === priority)
  }

  // ============================================================================
  // Decision Recording & Learning
  // ============================================================================

  /**
   * Record a user decision
   */
  private recordDecision(decision: UserDecision): void {
    this.decisions.push(decision)

    // Keep only last 1000 decisions
    if (this.decisions.length > 1000) {
      this.decisions = this.decisions.slice(-1000)
    }

    this.saveToStorage()
    this.eventEmitter.emit('decision:recorded', decision)

    // Check if we can learn a pattern
    this.learnPattern(decision)
  }

  /**
   * Get decision history
   */
  getDecisionHistory(limit?: number): UserDecision[] {
    const decisions = [...this.decisions].reverse()
    return limit ? decisions.slice(0, limit) : decisions
  }

  /**
   * Learn patterns from decisions
   */
  private learnPattern(decision: UserDecision): void {
    const prompt = this.findHistoricalPrompt(decision.promptId)
    if (!prompt) return

    // Find or create pattern
    const criteria: PatternCriteria = {
      escalationType: prompt.type,
      actionCategory: prompt.context.action,
    }

    let pattern = this.findMatchingPattern(criteria)

    if (pattern) {
      // Update existing pattern
      pattern.occurrences++
      if (pattern.typicalDecision === decision.choice) {
        pattern.successRate = (pattern.successRate * (pattern.occurrences - 1) + 1) / pattern.occurrences
      } else {
        pattern.successRate = (pattern.successRate * (pattern.occurrences - 1)) / pattern.occurrences
      }
      pattern.lastUpdated = new Date()

      // Enable auto-apply if success rate is high enough
      if (pattern.occurrences >= 5 && pattern.successRate >= 0.9) {
        pattern.autoApply = true
      }
    } else {
      // Create new pattern
      pattern = {
        id: crypto.randomUUID(),
        criteria,
        typicalDecision: decision.choice,
        occurrences: 1,
        successRate: 1,
        autoApply: false,
        autoApplyThreshold: 0.9,
        lastUpdated: new Date(),
        createdAt: new Date(),
      }
      this.patterns.push(pattern)
    }

    this.saveToStorage()
    this.eventEmitter.emit('pattern:learned', pattern)
  }

  /**
   * Find a matching pattern for given criteria
   */
  private findMatchingPattern(criteria: PatternCriteria): DecisionPattern | undefined {
    return this.patterns.find((p) => {
      if (criteria.escalationType && p.criteria.escalationType !== criteria.escalationType) {
        return false
      }
      if (criteria.actionCategory && p.criteria.actionCategory !== criteria.actionCategory) {
        return false
      }
      return true
    })
  }

  /**
   * Check if a pattern can be auto-applied
   */
  checkAutoApply(
    type: EscalationType,
    context: PromptContext
  ): { canAutoApply: boolean; decision?: string; pattern?: DecisionPattern } {
    const criteria: PatternCriteria = {
      escalationType: type,
      actionCategory: context.action,
    }

    const pattern = this.findMatchingPattern(criteria)

    if (pattern && pattern.autoApply && pattern.successRate >= pattern.autoApplyThreshold) {
      this.eventEmitter.emit('pattern:applied', pattern)
      return {
        canAutoApply: true,
        decision: pattern.typicalDecision,
        pattern,
      }
    }

    return { canAutoApply: false }
  }

  /**
   * Get all learned patterns
   */
  getPatterns(): DecisionPattern[] {
    return [...this.patterns]
  }

  /**
   * Clear a learned pattern
   */
  clearPattern(patternId: string): void {
    this.patterns = this.patterns.filter((p) => p.id !== patternId)
    this.saveToStorage()
  }

  /**
   * Clear all learned patterns
   */
  clearAllPatterns(): void {
    this.patterns = []
    this.saveToStorage()
  }

  // ============================================================================
  // Event Handling (UI Integration)
  // ============================================================================

  /**
   * Subscribe to events
   */
  on<T = unknown>(event: HumanInLoopEvent, handler: HumanInLoopEventHandler<T>): () => void {
    return this.eventEmitter.on(event, handler)
  }

  /**
   * Remove event listener
   */
  off<T = unknown>(event: HumanInLoopEvent, handler: HumanInLoopEventHandler<T>): void {
    this.eventEmitter.off(event, handler)
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update stuck state configuration
   */
  updateStuckStateConfig(config: Partial<StuckStateConfig>): void {
    this.stuckStateConfig = { ...this.stuckStateConfig, ...config }
  }

  /**
   * Get stuck state configuration
   */
  getStuckStateConfig(): StuckStateConfig {
    return { ...this.stuckStateConfig }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Clear all pending prompts
   */
  clearPendingPrompts(): void {
    const promptIds = Array.from(this.pendingPrompts.keys())
    for (const promptId of promptIds) {
      this.cancelPrompt(promptId)
    }
  }

  /**
   * Reset the system (clear all data)
   */
  reset(): void {
    this.clearPendingPrompts()
    this.decisions = []
    this.patterns = []
    this.thresholds = DEFAULT_THRESHOLDS
    this.confidenceHistory = []
    this.actionHistory = []
    this.saveToStorage()
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalDecisions: number
    totalPatterns: number
    autoAppliedPatterns: number
    averageResponseTime: number
    timeoutRate: number
  } {
    const timeoutDecisions = this.decisions.filter((d) => d.wasTimeout)
    const responseTimes = this.decisions.map((d) => d.responseTime)
    const avgResponseTime =
      responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0

    return {
      totalDecisions: this.decisions.length,
      totalPatterns: this.patterns.length,
      autoAppliedPatterns: this.patterns.filter((p) => p.autoApply).length,
      averageResponseTime: Math.round(avgResponseTime),
      timeoutRate: this.decisions.length > 0 ? timeoutDecisions.length / this.decisions.length : 0,
    }
  }

  // ============================================================================
  // Shutdown
  // ============================================================================

  /**
   * Shutdown the system
   */
  async shutdown(): Promise<void> {
    console.log('[HumanInLoop] Shutting down...')

    this.clearPendingPrompts()
    this.saveToStorage()
    this.eventEmitter.removeAllListeners()

    console.log('[HumanInLoop] Shutdown complete')
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const humanInLoop = HumanInLoop.getInstance()

export default humanInLoop

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple confidence score for common cases
 */
export function createSimpleConfidenceScore(
  action: string,
  category: string,
  overallConfidence: number,
  explanation: string,
  thresholds?: ConfidenceThresholds
): ConfidenceScore {
  return calculateConfidenceScore(
    action,
    category,
    [{ name: 'overall', weight: 1, explanation }],
    [overallConfidence],
    thresholds
  )
}

/**
 * Determine if an action is high-risk
 */
export function isHighRiskAction(riskCategories: RiskCategory[]): boolean {
  return riskCategories.some((r) => HIGH_RISK_ACTIONS.includes(r))
}

/**
 * Create a blocking prompt and wait for response
 */
export async function askUser(
  question: string,
  context: PromptContext,
  options?: PromptOption[]
): Promise<PromptResolution> {
  const hil = HumanInLoop.getInstance()

  const prompt = hil.createPrompt({
    type: 'manual_request',
    question,
    context,
    options,
    allowFreeform: !options?.length,
    blocking: true,
  })

  const decision = await hil.waitForResponse(prompt.id)

  const shouldProceed = ['proceed', 'approve', 'yes', 'continue'].includes(decision.choice.toLowerCase())

  return {
    prompt,
    decision,
    shouldProceed,
  }
}

/**
 * Check if action should proceed automatically or needs user input
 */
export function shouldAskUser(
  confidenceScore: ConfidenceScore,
  riskCategories: RiskCategory[] = []
): boolean {
  // Always ask for high-risk actions
  if (isHighRiskAction(riskCategories)) {
    return true
  }

  // Check confidence score recommendation
  return confidenceScore.recommendation === 'ask_user'
}
