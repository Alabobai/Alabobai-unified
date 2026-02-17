/**
 * Cost Tracking System for Alabobai AI Platform
 *
 * Comprehensive cost tracking, budget management, and optimization system
 * for AI API usage across multiple providers.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'local'

/**
 * Budget period types
 */
export type BudgetPeriod = 'task' | 'day' | 'week' | 'month' | 'year'

/**
 * Model pricing configuration
 */
export interface ModelPricing {
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  model: string
  /** Provider name */
  provider: AIProvider
  /** Cost per 1K input tokens in USD */
  inputCostPer1K: number
  /** Cost per 1K output tokens in USD */
  outputCostPer1K: number
  /** Context window size */
  contextWindow?: number
  /** Last update timestamp */
  updatedAt: string
  /** Is this a custom override */
  isCustom?: boolean
}

/**
 * Individual cost entry for tracking
 */
export interface CostEntry {
  /** Unique entry ID */
  id: string
  /** Timestamp of the API call */
  timestamp: string
  /** Model used */
  model: string
  /** Provider */
  provider: AIProvider
  /** Input tokens used */
  inputTokens: number
  /** Output tokens used */
  outputTokens: number
  /** Total tokens */
  totalTokens: number
  /** Calculated cost in USD */
  cost: number
  /** Associated task ID */
  taskId?: string
  /** Associated chat/conversation ID */
  chatId?: string
  /** Feature or agent type */
  feature?: string
  /** Request metadata */
  metadata?: Record<string, unknown>
}

/**
 * Budget configuration
 */
export interface Budget {
  /** Unique budget ID */
  id: string
  /** Budget name */
  name: string
  /** Budget limit in USD */
  limit: number
  /** Budget period */
  period: BudgetPeriod
  /** Current usage in USD */
  currentUsage: number
  /** Warning threshold (0-1, default 0.8 = 80%) */
  warningThreshold: number
  /** Hard stop enabled */
  hardStop: boolean
  /** Emergency override active */
  emergencyOverride: boolean
  /** Period start date */
  periodStart: string
  /** Period end date */
  periodEnd: string
  /** Created timestamp */
  createdAt: string
  /** Last updated timestamp */
  updatedAt: string
}

/**
 * Budget status result
 */
export interface BudgetStatus {
  /** Budget configuration */
  budget: Budget
  /** Current usage percentage (0-1) */
  usagePercentage: number
  /** Remaining amount in USD */
  remaining: number
  /** Is warning threshold reached */
  isWarning: boolean
  /** Is budget exceeded */
  isExceeded: boolean
  /** Days remaining in period */
  daysRemaining: number
  /** Projected usage by period end */
  projectedUsage: number
  /** Will exceed budget at current rate */
  willExceed: boolean
}

/**
 * Cost breakdown by category
 */
export interface CostBreakdown {
  /** Total cost */
  total: number
  /** Cost by model */
  byModel: Record<string, number>
  /** Cost by provider */
  byProvider: Record<AIProvider, number>
  /** Cost by feature/agent */
  byFeature: Record<string, number>
  /** Cost by task */
  byTask: Record<string, number>
  /** Cost by day */
  byDay: Record<string, number>
  /** Total tokens used */
  totalTokens: number
  /** Input tokens */
  inputTokens: number
  /** Output tokens */
  outputTokens: number
  /** Number of API calls */
  apiCalls: number
}

/**
 * Cost trend data point
 */
export interface CostTrendPoint {
  /** Date */
  date: string
  /** Cost for this period */
  cost: number
  /** Tokens used */
  tokens: number
  /** API calls */
  calls: number
}

/**
 * Cost optimization suggestion
 */
export interface OptimizationSuggestion {
  /** Suggestion type */
  type: 'model-switch' | 'caching' | 'prompt-optimization' | 'batching' | 'rate-limit'
  /** Suggestion title */
  title: string
  /** Detailed description */
  description: string
  /** Estimated savings percentage */
  estimatedSavings: number
  /** Priority (1-5, 5 being highest) */
  priority: number
  /** Action to implement */
  action?: string
}

/**
 * Comprehensive cost report
 */
export interface CostReport {
  /** Report generation timestamp */
  generatedAt: string
  /** Report period start */
  periodStart: string
  /** Report period end */
  periodEnd: string
  /** Cost breakdown */
  breakdown: CostBreakdown
  /** Cost trends */
  trends: CostTrendPoint[]
  /** Optimization suggestions */
  suggestions: OptimizationSuggestion[]
  /** Budget statuses */
  budgets: BudgetStatus[]
  /** Average cost per request */
  avgCostPerRequest: number
  /** Average tokens per request */
  avgTokensPerRequest: number
  /** Most expensive model */
  mostExpensiveModel: string
  /** Most used model */
  mostUsedModel: string
  /** Cost efficiency score (0-100) */
  efficiencyScore: number
}

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json'

/**
 * Cost tracker configuration
 */
export interface CostTrackerConfig {
  /** Enable real-time tracking */
  enableRealTimeTracking: boolean
  /** Enable automatic budget warnings */
  enableBudgetWarnings: boolean
  /** Enable auto-optimization suggestions */
  enableAutoOptimization: boolean
  /** Data retention days (0 = unlimited) */
  dataRetentionDays: number
  /** Aggregate older data instead of deleting */
  aggregateOldData: boolean
  /** Currency for display (USD only for calculations) */
  displayCurrency: string
}

/**
 * Usage tracking callback for real-time updates
 */
export type UsageCallback = (entry: CostEntry, budgetStatus: BudgetStatus[]) => void

/**
 * Budget warning callback
 */
export type BudgetWarningCallback = (status: BudgetStatus) => void

// ============================================================================
// Constants
// ============================================================================

const COST_TRACKER_STORAGE_KEY = 'alabobai-cost-tracker'
const COST_ENTRIES_STORAGE_KEY = 'alabobai-cost-entries'
const BUDGETS_STORAGE_KEY = 'alabobai-budgets'
const PRICING_STORAGE_KEY = 'alabobai-model-pricing'
const AGGREGATES_STORAGE_KEY = 'alabobai-cost-aggregates'

const DEFAULT_CONFIG: CostTrackerConfig = {
  enableRealTimeTracking: true,
  enableBudgetWarnings: true,
  enableAutoOptimization: true,
  dataRetentionDays: 90,
  aggregateOldData: true,
  displayCurrency: 'USD',
}

// ============================================================================
// Default Model Pricing Database (Updated Feb 2026)
// ============================================================================

const DEFAULT_MODEL_PRICING: ModelPricing[] = [
  // OpenAI Models
  {
    model: 'gpt-4o',
    provider: 'openai',
    inputCostPer1K: 0.005,
    outputCostPer1K: 0.015,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'gpt-4o-mini',
    provider: 'openai',
    inputCostPer1K: 0.00015,
    outputCostPer1K: 0.0006,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'gpt-4-turbo',
    provider: 'openai',
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'gpt-4',
    provider: 'openai',
    inputCostPer1K: 0.03,
    outputCostPer1K: 0.06,
    contextWindow: 8192,
    updatedAt: '2026-02-15',
  },
  {
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    inputCostPer1K: 0.0005,
    outputCostPer1K: 0.0015,
    contextWindow: 16385,
    updatedAt: '2026-02-15',
  },
  {
    model: 'o1-preview',
    provider: 'openai',
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.06,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'o1-mini',
    provider: 'openai',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.012,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },

  // Anthropic Models
  {
    model: 'claude-opus-4-5-20251101',
    provider: 'anthropic',
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075,
    contextWindow: 200000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'claude-3-opus-20240229',
    provider: 'anthropic',
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075,
    contextWindow: 200000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
    contextWindow: 200000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
    contextWindow: 200000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.00125,
    contextWindow: 200000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    inputCostPer1K: 0.001,
    outputCostPer1K: 0.005,
    contextWindow: 200000,
    updatedAt: '2026-02-15',
  },

  // Groq Models (much cheaper, optimized for speed)
  {
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
    inputCostPer1K: 0.00059,
    outputCostPer1K: 0.00079,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'llama-3.1-70b-versatile',
    provider: 'groq',
    inputCostPer1K: 0.00059,
    outputCostPer1K: 0.00079,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'llama-3.1-8b-instant',
    provider: 'groq',
    inputCostPer1K: 0.00005,
    outputCostPer1K: 0.00008,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'mixtral-8x7b-32768',
    provider: 'groq',
    inputCostPer1K: 0.00024,
    outputCostPer1K: 0.00024,
    contextWindow: 32768,
    updatedAt: '2026-02-15',
  },
  {
    model: 'gemma2-9b-it',
    provider: 'groq',
    inputCostPer1K: 0.0002,
    outputCostPer1K: 0.0002,
    contextWindow: 8192,
    updatedAt: '2026-02-15',
  },

  // OpenRouter Models (aggregator, various sources)
  {
    model: 'openrouter/auto',
    provider: 'openrouter',
    inputCostPer1K: 0.005,
    outputCostPer1K: 0.015,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'mistralai/mistral-large',
    provider: 'openrouter',
    inputCostPer1K: 0.002,
    outputCostPer1K: 0.006,
    contextWindow: 128000,
    updatedAt: '2026-02-15',
  },
  {
    model: 'google/gemini-pro-1.5',
    provider: 'openrouter',
    inputCostPer1K: 0.00125,
    outputCostPer1K: 0.005,
    contextWindow: 1000000,
    updatedAt: '2026-02-15',
  },

  // Local Models (free)
  {
    model: 'local',
    provider: 'local',
    inputCostPer1K: 0,
    outputCostPer1K: 0,
    contextWindow: 0,
    updatedAt: '2026-02-15',
  },
  {
    model: 'ollama/llama3',
    provider: 'local',
    inputCostPer1K: 0,
    outputCostPer1K: 0,
    contextWindow: 8192,
    updatedAt: '2026-02-15',
  },
  {
    model: 'ollama/mistral',
    provider: 'local',
    inputCostPer1K: 0,
    outputCostPer1K: 0,
    contextWindow: 8192,
    updatedAt: '2026-02-15',
  },
]

// ============================================================================
// IndexedDB Storage Manager
// ============================================================================

class CostStorageManager {
  private dbName = 'AlabobaiCostTracker'
  private dbVersion = 1
  private db: IDBDatabase | null = null

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        console.error('[CostStorage] Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[CostStorage] IndexedDB initialized')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Cost entries store
        if (!db.objectStoreNames.contains('costEntries')) {
          const entriesStore = db.createObjectStore('costEntries', { keyPath: 'id' })
          entriesStore.createIndex('timestamp', 'timestamp', { unique: false })
          entriesStore.createIndex('model', 'model', { unique: false })
          entriesStore.createIndex('provider', 'provider', { unique: false })
          entriesStore.createIndex('taskId', 'taskId', { unique: false })
          entriesStore.createIndex('feature', 'feature', { unique: false })
        }

        // Budgets store
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' })
        }

        // Model pricing store
        if (!db.objectStoreNames.contains('modelPricing')) {
          const pricingStore = db.createObjectStore('modelPricing', { keyPath: 'model' })
          pricingStore.createIndex('provider', 'provider', { unique: false })
        }

        // Aggregates store (for historical data)
        if (!db.objectStoreNames.contains('aggregates')) {
          const aggregatesStore = db.createObjectStore('aggregates', { keyPath: 'id' })
          aggregatesStore.createIndex('period', 'period', { unique: false })
        }

        // Config store
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' })
        }
      }
    })
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) {
      throw new Error('[CostStorage] Database not initialized')
    }
    const transaction = this.db.transaction(storeName, mode)
    return transaction.objectStore(storeName)
  }

  // Generic CRUD operations
  async add<T>(storeName: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.add(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.put(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getByIndex<T>(
    storeName: string,
    indexName: string,
    value: IDBValidKey
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(value)
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error)
    })
  }

  async getByDateRange<T>(
    storeName: string,
    indexName: string,
    startDate: string,
    endDate: string
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const index = store.index(indexName)
      const range = IDBKeyRange.bound(startDate, endDate)
      const request = index.getAll(range)
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error)
    })
  }

  async count(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async deleteOlderThan(storeName: string, indexName: string, date: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const index = store.index(indexName)
      const range = IDBKeyRange.upperBound(date)
      const request = index.openCursor(range)
      let deletedCount = 0

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          resolve(deletedCount)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }
}

// ============================================================================
// Cost Tracker Class
// ============================================================================

export class CostTracker {
  private static instance: CostTracker | null = null

  private storage: CostStorageManager = new CostStorageManager()
  private config: CostTrackerConfig = DEFAULT_CONFIG
  private initialized = false
  private pricingCache: Map<string, ModelPricing> = new Map()

  // Callbacks
  private usageCallbacks: Set<UsageCallback> = new Set()
  private budgetWarningCallbacks: Set<BudgetWarningCallback> = new Set()

  private constructor() {}

  static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker()
    }
    return CostTracker.instance
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[CostTracker] Already initialized')
      return
    }

    console.log('[CostTracker] Initializing...')

    try {
      await this.storage.initialize()
      await this.loadConfig()
      await this.loadPricing()
      await this.pruneOldData()

      this.initialized = true
      console.log('[CostTracker] Initialized successfully')
    } catch (error) {
      console.error('[CostTracker] Initialization failed:', error)
      // Fall back to localStorage if IndexedDB fails
      this.initializeFallback()
    }
  }

  private async loadConfig(): Promise<void> {
    const stored = await this.storage.get<{ key: string; value: CostTrackerConfig }>(
      'config',
      'main'
    )
    if (stored?.value) {
      this.config = { ...DEFAULT_CONFIG, ...stored.value }
    }
  }

  private async loadPricing(): Promise<void> {
    const stored = await this.storage.getAll<ModelPricing>('modelPricing')

    if (stored.length === 0) {
      // Initialize with default pricing
      for (const pricing of DEFAULT_MODEL_PRICING) {
        await this.storage.put('modelPricing', pricing)
        this.pricingCache.set(pricing.model, pricing)
      }
    } else {
      // Load into cache
      for (const pricing of stored) {
        this.pricingCache.set(pricing.model, pricing)
      }
    }
  }

  private initializeFallback(): void {
    console.warn('[CostTracker] Using localStorage fallback')
    // Load default pricing into cache
    for (const pricing of DEFAULT_MODEL_PRICING) {
      this.pricingCache.set(pricing.model, pricing)
    }
    this.initialized = true
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  async setConfig(config: Partial<CostTrackerConfig>): Promise<void> {
    this.config = { ...this.config, ...config }
    await this.storage.put('config', { key: 'main', value: this.config })
  }

  getConfig(): CostTrackerConfig {
    return { ...this.config }
  }

  // ============================================================================
  // Pricing Management
  // ============================================================================

  /**
   * Get pricing for a specific model
   */
  getPricing(model: string): ModelPricing | undefined {
    // Try exact match first
    if (this.pricingCache.has(model)) {
      return this.pricingCache.get(model)
    }

    // Try to find a partial match (for model variants)
    for (const [key, pricing] of this.pricingCache) {
      if (model.includes(key) || key.includes(model)) {
        return pricing
      }
    }

    return undefined
  }

  /**
   * Get all pricing
   */
  getAllPricing(): ModelPricing[] {
    return Array.from(this.pricingCache.values())
  }

  /**
   * Set custom pricing for a model
   */
  async setPricing(pricing: ModelPricing): Promise<void> {
    const customPricing = { ...pricing, isCustom: true, updatedAt: new Date().toISOString() }
    this.pricingCache.set(pricing.model, customPricing)
    await this.storage.put('modelPricing', customPricing)
  }

  /**
   * Reset pricing to defaults
   */
  async resetPricing(model?: string): Promise<void> {
    if (model) {
      const defaultPricing = DEFAULT_MODEL_PRICING.find((p) => p.model === model)
      if (defaultPricing) {
        this.pricingCache.set(model, defaultPricing)
        await this.storage.put('modelPricing', defaultPricing)
      }
    } else {
      await this.storage.clear('modelPricing')
      this.pricingCache.clear()
      for (const pricing of DEFAULT_MODEL_PRICING) {
        this.pricingCache.set(pricing.model, pricing)
        await this.storage.put('modelPricing', pricing)
      }
    }
  }

  /**
   * Calculate cost for a given usage
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.getPricing(model)

    if (!pricing) {
      console.warn(`[CostTracker] No pricing found for model: ${model}`)
      return 0
    }

    const inputCost = (inputTokens / 1000) * pricing.inputCostPer1K
    const outputCost = (outputTokens / 1000) * pricing.outputCostPer1K

    return Math.round((inputCost + outputCost) * 1000000) / 1000000 // Round to 6 decimal places
  }

  // ============================================================================
  // Usage Tracking
  // ============================================================================

  /**
   * Track an API usage event
   */
  async trackUsage(params: {
    model: string
    provider: AIProvider
    inputTokens: number
    outputTokens: number
    taskId?: string
    chatId?: string
    feature?: string
    metadata?: Record<string, unknown>
  }): Promise<CostEntry> {
    const cost = this.calculateCost(params.model, params.inputTokens, params.outputTokens)

    const entry: CostEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      model: params.model,
      provider: params.provider,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      cost,
      taskId: params.taskId,
      chatId: params.chatId,
      feature: params.feature,
      metadata: params.metadata,
    }

    try {
      await this.storage.add('costEntries', entry)
    } catch (error) {
      console.error('[CostTracker] Failed to store cost entry:', error)
      // Fallback to localStorage
      this.storeEntryFallback(entry)
    }

    // Update budgets and check thresholds
    const budgetStatuses = await this.updateBudgets(cost)

    // Notify callbacks
    if (this.config.enableRealTimeTracking) {
      this.notifyUsageCallbacks(entry, budgetStatuses)
    }

    // Check for budget warnings
    if (this.config.enableBudgetWarnings) {
      for (const status of budgetStatuses) {
        if (status.isWarning || status.isExceeded) {
          this.notifyBudgetWarningCallbacks(status)
        }
      }
    }

    return entry
  }

  private storeEntryFallback(entry: CostEntry): void {
    try {
      const stored = localStorage.getItem(COST_ENTRIES_STORAGE_KEY)
      const entries: CostEntry[] = stored ? JSON.parse(stored) : []
      entries.push(entry)
      // Keep only last 1000 entries in fallback mode
      if (entries.length > 1000) {
        entries.splice(0, entries.length - 1000)
      }
      localStorage.setItem(COST_ENTRIES_STORAGE_KEY, JSON.stringify(entries))
    } catch (error) {
      console.error('[CostTracker] Fallback storage failed:', error)
    }
  }

  /**
   * Get all cost entries
   */
  async getEntries(options?: {
    startDate?: string
    endDate?: string
    model?: string
    provider?: AIProvider
    taskId?: string
    feature?: string
    limit?: number
  }): Promise<CostEntry[]> {
    let entries: CostEntry[]

    if (options?.startDate && options?.endDate) {
      entries = await this.storage.getByDateRange<CostEntry>(
        'costEntries',
        'timestamp',
        options.startDate,
        options.endDate
      )
    } else {
      entries = await this.storage.getAll<CostEntry>('costEntries')
    }

    // Apply filters
    if (options?.model) {
      entries = entries.filter((e) => e.model === options.model)
    }
    if (options?.provider) {
      entries = entries.filter((e) => e.provider === options.provider)
    }
    if (options?.taskId) {
      entries = entries.filter((e) => e.taskId === options.taskId)
    }
    if (options?.feature) {
      entries = entries.filter((e) => e.feature === options.feature)
    }

    // Sort by timestamp descending
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply limit
    if (options?.limit && entries.length > options.limit) {
      entries = entries.slice(0, options.limit)
    }

    return entries
  }

  // ============================================================================
  // Budget Management
  // ============================================================================

  /**
   * Create a new budget
   */
  async createBudget(params: {
    name: string
    limit: number
    period: BudgetPeriod
    warningThreshold?: number
    hardStop?: boolean
  }): Promise<Budget> {
    const now = new Date()
    const { periodStart, periodEnd } = this.calculateBudgetPeriod(params.period, now)

    const budget: Budget = {
      id: crypto.randomUUID(),
      name: params.name,
      limit: params.limit,
      period: params.period,
      currentUsage: 0,
      warningThreshold: params.warningThreshold ?? 0.8,
      hardStop: params.hardStop ?? true,
      emergencyOverride: false,
      periodStart,
      periodEnd,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    await this.storage.put('budgets', budget)
    return budget
  }

  /**
   * Get all budgets
   */
  async getBudgets(): Promise<Budget[]> {
    return this.storage.getAll<Budget>('budgets')
  }

  /**
   * Get a specific budget
   */
  async getBudget(budgetId: string): Promise<Budget | undefined> {
    return this.storage.get<Budget>('budgets', budgetId)
  }

  /**
   * Update a budget
   */
  async updateBudget(budgetId: string, updates: Partial<Budget>): Promise<Budget | undefined> {
    const budget = await this.getBudget(budgetId)
    if (!budget) {
      return undefined
    }

    const updated = { ...budget, ...updates, updatedAt: new Date().toISOString() }
    await this.storage.put('budgets', updated)
    return updated
  }

  /**
   * Delete a budget
   */
  async deleteBudget(budgetId: string): Promise<void> {
    await this.storage.delete('budgets', budgetId)
  }

  /**
   * Enable emergency override for a budget
   */
  async enableEmergencyOverride(budgetId: string): Promise<void> {
    await this.updateBudget(budgetId, { emergencyOverride: true })
  }

  /**
   * Disable emergency override for a budget
   */
  async disableEmergencyOverride(budgetId: string): Promise<void> {
    await this.updateBudget(budgetId, { emergencyOverride: false })
  }

  /**
   * Get budget status
   */
  async getBudgetStatus(budgetId?: string): Promise<BudgetStatus[]> {
    let budgets: Budget[]

    if (budgetId) {
      const budget = await this.getBudget(budgetId)
      budgets = budget ? [budget] : []
    } else {
      budgets = await this.getBudgets()
    }

    const now = new Date()
    const statuses: BudgetStatus[] = []

    for (const budget of budgets) {
      // Check if budget period has expired and reset if needed
      const refreshedBudget = await this.refreshBudgetPeriod(budget)

      // Calculate current usage for the period
      const entries = await this.storage.getByDateRange<CostEntry>(
        'costEntries',
        'timestamp',
        refreshedBudget.periodStart,
        refreshedBudget.periodEnd
      )
      const currentUsage = entries.reduce((sum, entry) => sum + entry.cost, 0)

      // Update budget with current usage
      if (currentUsage !== refreshedBudget.currentUsage) {
        refreshedBudget.currentUsage = currentUsage
        await this.storage.put('budgets', refreshedBudget)
      }

      const usagePercentage = currentUsage / refreshedBudget.limit
      const remaining = Math.max(0, refreshedBudget.limit - currentUsage)
      const periodEndDate = new Date(refreshedBudget.periodEnd)
      const daysRemaining = Math.max(
        0,
        Math.ceil((periodEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      )

      // Calculate projected usage
      const periodStartDate = new Date(refreshedBudget.periodStart)
      const daysElapsed = Math.max(
        1,
        (now.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const dailyRate = currentUsage / daysElapsed
      const totalDays =
        (periodEndDate.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
      const projectedUsage = dailyRate * totalDays

      statuses.push({
        budget: refreshedBudget,
        usagePercentage,
        remaining,
        isWarning: usagePercentage >= refreshedBudget.warningThreshold && usagePercentage < 1,
        isExceeded: usagePercentage >= 1,
        daysRemaining,
        projectedUsage,
        willExceed: projectedUsage > refreshedBudget.limit,
      })
    }

    return statuses
  }

  /**
   * Check if request should be blocked due to budget
   */
  async shouldBlockRequest(estimatedCost: number): Promise<{
    blocked: boolean
    reason?: string
    budgetId?: string
  }> {
    const statuses = await this.getBudgetStatus()

    for (const status of statuses) {
      if (status.budget.hardStop && !status.budget.emergencyOverride) {
        const newUsage = status.budget.currentUsage + estimatedCost

        if (newUsage > status.budget.limit) {
          return {
            blocked: true,
            reason: `Budget "${status.budget.name}" exceeded. Current: $${status.budget.currentUsage.toFixed(4)}, Limit: $${status.budget.limit.toFixed(2)}`,
            budgetId: status.budget.id,
          }
        }
      }
    }

    return { blocked: false }
  }

  private async updateBudgets(cost: number): Promise<BudgetStatus[]> {
    const budgets = await this.getBudgets()

    for (const budget of budgets) {
      budget.currentUsage += cost
      budget.updatedAt = new Date().toISOString()
      await this.storage.put('budgets', budget)
    }

    return this.getBudgetStatus()
  }

  private async refreshBudgetPeriod(budget: Budget): Promise<Budget> {
    const now = new Date()
    const periodEnd = new Date(budget.periodEnd)

    if (now > periodEnd) {
      // Period has expired, create new period
      const { periodStart, periodEnd: newPeriodEnd } = this.calculateBudgetPeriod(
        budget.period,
        now
      )
      budget.periodStart = periodStart
      budget.periodEnd = newPeriodEnd
      budget.currentUsage = 0
      budget.updatedAt = now.toISOString()
      await this.storage.put('budgets', budget)
    }

    return budget
  }

  private calculateBudgetPeriod(
    period: BudgetPeriod,
    date: Date
  ): { periodStart: string; periodEnd: string } {
    const start = new Date(date)
    const end = new Date(date)

    switch (period) {
      case 'task':
        // Task budgets don't auto-reset
        start.setFullYear(2000)
        end.setFullYear(2100)
        break
      case 'day':
        start.setHours(0, 0, 0, 0)
        end.setHours(23, 59, 59, 999)
        break
      case 'week':
        const dayOfWeek = start.getDay()
        start.setDate(start.getDate() - dayOfWeek)
        start.setHours(0, 0, 0, 0)
        end.setDate(start.getDate() + 6)
        end.setHours(23, 59, 59, 999)
        break
      case 'month':
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        end.setMonth(end.getMonth() + 1, 0)
        end.setHours(23, 59, 59, 999)
        break
      case 'year':
        start.setMonth(0, 1)
        start.setHours(0, 0, 0, 0)
        end.setMonth(11, 31)
        end.setHours(23, 59, 59, 999)
        break
    }

    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    }
  }

  // ============================================================================
  // Cost Optimization
  // ============================================================================

  /**
   * Get cost optimization suggestions
   */
  async getOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = []
    const entries = await this.getEntries({ limit: 1000 })

    if (entries.length === 0) {
      return suggestions
    }

    // Analyze usage patterns
    const modelUsage: Record<string, { cost: number; tokens: number; count: number }> = {}
    const featureUsage: Record<string, { cost: number; count: number }> = {}

    for (const entry of entries) {
      if (!modelUsage[entry.model]) {
        modelUsage[entry.model] = { cost: 0, tokens: 0, count: 0 }
      }
      modelUsage[entry.model].cost += entry.cost
      modelUsage[entry.model].tokens += entry.totalTokens
      modelUsage[entry.model].count++

      if (entry.feature) {
        if (!featureUsage[entry.feature]) {
          featureUsage[entry.feature] = { cost: 0, count: 0 }
        }
        featureUsage[entry.feature].cost += entry.cost
        featureUsage[entry.feature].count++
      }
    }

    // Suggestion 1: Switch to cheaper models for high-volume usage
    for (const [model, usage] of Object.entries(modelUsage)) {
      const pricing = this.getPricing(model)
      if (!pricing) continue

      // Find cheaper alternatives
      const cheaperModels = Array.from(this.pricingCache.values()).filter(
        (p) =>
          p.provider !== 'local' &&
          p.model !== model &&
          p.inputCostPer1K < pricing.inputCostPer1K * 0.5 &&
          (p.contextWindow ?? 0) >= (pricing.contextWindow ?? 0) * 0.5
      )

      if (cheaperModels.length > 0 && usage.cost > 1) {
        const cheapestAlt = cheaperModels.sort(
          (a, b) => a.inputCostPer1K - b.inputCostPer1K
        )[0]
        const potentialSavings =
          ((pricing.inputCostPer1K - cheapestAlt.inputCostPer1K) / pricing.inputCostPer1K) * 100

        suggestions.push({
          type: 'model-switch',
          title: `Consider switching from ${model} to ${cheapestAlt.model}`,
          description: `You've spent $${usage.cost.toFixed(2)} on ${model}. ${cheapestAlt.model} is significantly cheaper and may work for many use cases.`,
          estimatedSavings: potentialSavings,
          priority: usage.cost > 10 ? 5 : usage.cost > 5 ? 4 : 3,
          action: `Switch to ${cheapestAlt.model} for non-critical tasks`,
        })
      }
    }

    // Suggestion 2: Use local models when possible
    const totalExternalCost = entries
      .filter((e) => e.provider !== 'local')
      .reduce((sum, e) => sum + e.cost, 0)

    if (totalExternalCost > 5) {
      suggestions.push({
        type: 'model-switch',
        title: 'Consider using local models for simple tasks',
        description: `You've spent $${totalExternalCost.toFixed(2)} on external APIs. Local models (Ollama/LMStudio) are free and can handle many tasks.`,
        estimatedSavings: 30,
        priority: 4,
        action: 'Configure Ollama with llama3 for simple completions',
      })
    }

    // Suggestion 3: Prompt optimization
    const avgTokensPerRequest =
      entries.reduce((sum, e) => sum + e.totalTokens, 0) / entries.length
    if (avgTokensPerRequest > 2000) {
      suggestions.push({
        type: 'prompt-optimization',
        title: 'Optimize prompt length',
        description: `Average request uses ${Math.round(avgTokensPerRequest)} tokens. Consider shorter system prompts and more concise user inputs.`,
        estimatedSavings: 20,
        priority: 3,
        action: 'Review and shorten system prompts, use bullet points instead of paragraphs',
      })
    }

    // Suggestion 4: Caching for repeated queries
    const uniqueInputs = new Set(entries.map((e) => e.chatId)).size
    const potentialDuplicates = entries.length - uniqueInputs

    if (potentialDuplicates > entries.length * 0.1) {
      suggestions.push({
        type: 'caching',
        title: 'Enable response caching',
        description: `Detected potentially repeated queries. Implementing a cache could save up to ${Math.round((potentialDuplicates / entries.length) * 100)}% of API calls.`,
        estimatedSavings: 15,
        priority: 3,
        action: 'Enable semantic caching in settings',
      })
    }

    // Suggestion 5: Batch processing
    const avgTimeBetweenCalls = this.calculateAvgTimeBetweenCalls(entries)
    if (avgTimeBetweenCalls < 5000 && entries.length > 50) {
      // Less than 5 seconds
      suggestions.push({
        type: 'batching',
        title: 'Consider request batching',
        description:
          'High-frequency API calls detected. Batching multiple requests could reduce overhead and potentially qualify for bulk pricing.',
        estimatedSavings: 10,
        priority: 2,
        action: 'Enable request batching for bulk operations',
      })
    }

    // Sort by priority
    suggestions.sort((a, b) => b.priority - a.priority)

    return suggestions
  }

  /**
   * Get recommended model for a task based on cost/performance
   */
  recommendModel(params: {
    taskType: 'simple' | 'complex' | 'creative' | 'code' | 'analysis'
    maxCostPer1KTokens?: number
    requiresLargeContext?: boolean
    preferredProvider?: AIProvider
  }): ModelPricing | undefined {
    let candidates = Array.from(this.pricingCache.values())

    // Filter by provider
    if (params.preferredProvider) {
      candidates = candidates.filter((p) => p.provider === params.preferredProvider)
    }

    // Filter by cost
    if (params.maxCostPer1KTokens) {
      candidates = candidates.filter(
        (p) => p.inputCostPer1K <= params.maxCostPer1KTokens! * 0.3 && // Input usually 30% of weight
          p.outputCostPer1K <= params.maxCostPer1KTokens! * 0.7
      )
    }

    // Filter by context window
    if (params.requiresLargeContext) {
      candidates = candidates.filter((p) => (p.contextWindow ?? 0) >= 100000)
    }

    // Score based on task type
    const scored = candidates.map((model) => {
      let score = 100
      const avgCost = (model.inputCostPer1K + model.outputCostPer1K) / 2

      // Cost efficiency (lower is better)
      score -= avgCost * 10

      // Task-specific scoring
      switch (params.taskType) {
        case 'simple':
          // Prefer cheaper models
          score -= avgCost * 20
          break
        case 'complex':
          // Prefer capable models
          if (model.model.includes('gpt-4') || model.model.includes('claude-3-opus')) {
            score += 20
          }
          break
        case 'creative':
          // Prefer models known for creativity
          if (model.model.includes('gpt-4') || model.model.includes('claude')) {
            score += 15
          }
          break
        case 'code':
          // Prefer code-specialized or capable models
          if (
            model.model.includes('gpt-4') ||
            model.model.includes('claude') ||
            model.model.includes('codellama')
          ) {
            score += 20
          }
          break
        case 'analysis':
          // Prefer models with large context
          score += (model.contextWindow ?? 0) / 10000
          break
      }

      return { model, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0]?.model
  }

  private calculateAvgTimeBetweenCalls(entries: CostEntry[]): number {
    if (entries.length < 2) return Infinity

    const sorted = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    let totalDiff = 0

    for (let i = 1; i < sorted.length; i++) {
      totalDiff +=
        new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()
    }

    return totalDiff / (sorted.length - 1)
  }

  // ============================================================================
  // Reporting
  // ============================================================================

  /**
   * Generate a comprehensive cost report
   */
  async generateReport(options?: { startDate?: string; endDate?: string }): Promise<CostReport> {
    const now = new Date()
    const endDate = options?.endDate ?? now.toISOString()
    const startDate =
      options?.startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const entries = await this.getEntries({ startDate, endDate })
    const breakdown = this.calculateBreakdown(entries)
    const trends = this.calculateTrends(entries)
    const suggestions = await this.getOptimizationSuggestions()
    const budgets = await this.getBudgetStatus()

    // Calculate averages
    const avgCostPerRequest = entries.length > 0 ? breakdown.total / entries.length : 0
    const avgTokensPerRequest = entries.length > 0 ? breakdown.totalTokens / entries.length : 0

    // Find most expensive and most used models
    const modelCosts = Object.entries(breakdown.byModel).sort((a, b) => b[1] - a[1])
    const mostExpensiveModel = modelCosts[0]?.[0] ?? 'N/A'

    const modelCounts: Record<string, number> = {}
    for (const entry of entries) {
      modelCounts[entry.model] = (modelCounts[entry.model] || 0) + 1
    }
    const mostUsedModel =
      Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'

    // Calculate efficiency score
    const efficiencyScore = this.calculateEfficiencyScore(entries, breakdown)

    return {
      generatedAt: now.toISOString(),
      periodStart: startDate,
      periodEnd: endDate,
      breakdown,
      trends,
      suggestions,
      budgets,
      avgCostPerRequest,
      avgTokensPerRequest,
      mostExpensiveModel,
      mostUsedModel,
      efficiencyScore,
    }
  }

  /**
   * Calculate cost breakdown
   */
  private calculateBreakdown(entries: CostEntry[]): CostBreakdown {
    const breakdown: CostBreakdown = {
      total: 0,
      byModel: {},
      byProvider: {} as Record<AIProvider, number>,
      byFeature: {},
      byTask: {},
      byDay: {},
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      apiCalls: entries.length,
    }

    for (const entry of entries) {
      breakdown.total += entry.cost
      breakdown.totalTokens += entry.totalTokens
      breakdown.inputTokens += entry.inputTokens
      breakdown.outputTokens += entry.outputTokens

      // By model
      breakdown.byModel[entry.model] = (breakdown.byModel[entry.model] || 0) + entry.cost

      // By provider
      breakdown.byProvider[entry.provider] =
        (breakdown.byProvider[entry.provider] || 0) + entry.cost

      // By feature
      if (entry.feature) {
        breakdown.byFeature[entry.feature] =
          (breakdown.byFeature[entry.feature] || 0) + entry.cost
      }

      // By task
      if (entry.taskId) {
        breakdown.byTask[entry.taskId] = (breakdown.byTask[entry.taskId] || 0) + entry.cost
      }

      // By day
      const day = entry.timestamp.split('T')[0]
      breakdown.byDay[day] = (breakdown.byDay[day] || 0) + entry.cost
    }

    return breakdown
  }

  /**
   * Calculate cost trends
   */
  private calculateTrends(entries: CostEntry[]): CostTrendPoint[] {
    const dailyData: Record<string, { cost: number; tokens: number; calls: number }> = {}

    for (const entry of entries) {
      const day = entry.timestamp.split('T')[0]
      if (!dailyData[day]) {
        dailyData[day] = { cost: 0, tokens: 0, calls: 0 }
      }
      dailyData[day].cost += entry.cost
      dailyData[day].tokens += entry.totalTokens
      dailyData[day].calls++
    }

    return Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        cost: Math.round(data.cost * 1000000) / 1000000,
        tokens: data.tokens,
        calls: data.calls,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Calculate efficiency score (0-100)
   */
  private calculateEfficiencyScore(entries: CostEntry[], breakdown: CostBreakdown): number {
    if (entries.length === 0) return 100

    let score = 100

    // Penalize for using expensive models when cheaper ones would work
    const expensiveModelRatio = entries.filter((e) => {
      const pricing = this.getPricing(e.model)
      return pricing && pricing.inputCostPer1K > 0.01
    }).length / entries.length
    score -= expensiveModelRatio * 20

    // Reward for using local models
    const localRatio = entries.filter((e) => e.provider === 'local').length / entries.length
    score += localRatio * 10

    // Penalize for high average token usage
    const avgTokens = breakdown.totalTokens / entries.length
    if (avgTokens > 4000) {
      score -= Math.min(20, (avgTokens - 4000) / 200)
    }

    // Penalize for exceeded budgets
    // This would be checked asynchronously in real usage

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  // ============================================================================
  // Export Functions
  // ============================================================================

  /**
   * Export cost data to CSV
   */
  async exportToCSV(options?: { startDate?: string; endDate?: string }): Promise<string> {
    const entries = await this.getEntries(options)

    const headers = [
      'ID',
      'Timestamp',
      'Model',
      'Provider',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'Cost (USD)',
      'Task ID',
      'Chat ID',
      'Feature',
    ]

    const rows = entries.map((e) => [
      e.id,
      e.timestamp,
      e.model,
      e.provider,
      e.inputTokens.toString(),
      e.outputTokens.toString(),
      e.totalTokens.toString(),
      e.cost.toFixed(6),
      e.taskId ?? '',
      e.chatId ?? '',
      e.feature ?? '',
    ])

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

    return csvContent
  }

  /**
   * Export cost data to JSON
   */
  async exportToJSON(options?: { startDate?: string; endDate?: string }): Promise<string> {
    const report = await this.generateReport(options)
    return JSON.stringify(report, null, 2)
  }

  /**
   * Export data in specified format
   */
  async export(
    format: ExportFormat,
    options?: { startDate?: string; endDate?: string }
  ): Promise<string> {
    switch (format) {
      case 'csv':
        return this.exportToCSV(options)
      case 'json':
        return this.exportToJSON(options)
      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }

  // ============================================================================
  // Data Management
  // ============================================================================

  /**
   * Prune old data based on retention policy
   */
  async pruneOldData(): Promise<number> {
    if (this.config.dataRetentionDays === 0) {
      return 0 // Unlimited retention
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.dataRetentionDays)
    const cutoffString = cutoffDate.toISOString()

    if (this.config.aggregateOldData) {
      // Aggregate data before deleting
      const oldEntries = await this.storage.getByDateRange<CostEntry>(
        'costEntries',
        'timestamp',
        '1970-01-01T00:00:00.000Z',
        cutoffString
      )

      if (oldEntries.length > 0) {
        await this.aggregateEntries(oldEntries)
      }
    }

    const deletedCount = await this.storage.deleteOlderThan(
      'costEntries',
      'timestamp',
      cutoffString
    )

    if (deletedCount > 0) {
      console.log(`[CostTracker] Pruned ${deletedCount} old entries`)
    }

    return deletedCount
  }

  private async aggregateEntries(entries: CostEntry[]): Promise<void> {
    // Group by month
    const monthlyAggregates: Record<
      string,
      {
        cost: number
        tokens: number
        calls: number
        byModel: Record<string, number>
        byProvider: Record<string, number>
      }
    > = {}

    for (const entry of entries) {
      const month = entry.timestamp.substring(0, 7) // YYYY-MM

      if (!monthlyAggregates[month]) {
        monthlyAggregates[month] = {
          cost: 0,
          tokens: 0,
          calls: 0,
          byModel: {},
          byProvider: {},
        }
      }

      const agg = monthlyAggregates[month]
      agg.cost += entry.cost
      agg.tokens += entry.totalTokens
      agg.calls++
      agg.byModel[entry.model] = (agg.byModel[entry.model] || 0) + entry.cost
      agg.byProvider[entry.provider] = (agg.byProvider[entry.provider] || 0) + entry.cost
    }

    // Store aggregates
    for (const [month, data] of Object.entries(monthlyAggregates)) {
      await this.storage.put('aggregates', {
        id: `monthly-${month}`,
        period: 'month',
        month,
        ...data,
        createdAt: new Date().toISOString(),
      })
    }
  }

  /**
   * Clear all cost data
   */
  async clearAllData(): Promise<void> {
    await this.storage.clear('costEntries')
    await this.storage.clear('budgets')
    await this.storage.clear('aggregates')
    console.log('[CostTracker] All data cleared')
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    entriesCount: number
    budgetsCount: number
    aggregatesCount: number
    estimatedSizeKB: number
  }> {
    const entriesCount = await this.storage.count('costEntries')
    const budgetsCount = await this.storage.count('budgets')
    const aggregatesCount = await this.storage.count('aggregates')

    // Rough estimate: ~500 bytes per entry on average
    const estimatedSizeKB = Math.round((entriesCount * 500 + aggregatesCount * 1000) / 1024)

    return {
      entriesCount,
      budgetsCount,
      aggregatesCount,
      estimatedSizeKB,
    }
  }

  // ============================================================================
  // Callbacks & Subscriptions
  // ============================================================================

  /**
   * Subscribe to usage updates
   */
  onUsage(callback: UsageCallback): () => void {
    this.usageCallbacks.add(callback)
    return () => this.usageCallbacks.delete(callback)
  }

  /**
   * Subscribe to budget warnings
   */
  onBudgetWarning(callback: BudgetWarningCallback): () => void {
    this.budgetWarningCallbacks.add(callback)
    return () => this.budgetWarningCallbacks.delete(callback)
  }

  private notifyUsageCallbacks(entry: CostEntry, budgetStatuses: BudgetStatus[]): void {
    this.usageCallbacks.forEach((callback) => {
      try {
        callback(entry, budgetStatuses)
      } catch (error) {
        console.error('[CostTracker] Error in usage callback:', error)
      }
    })
  }

  private notifyBudgetWarningCallbacks(status: BudgetStatus): void {
    this.budgetWarningCallbacks.forEach((callback) => {
      try {
        callback(status)
      } catch (error) {
        console.error('[CostTracker] Error in budget warning callback:', error)
      }
    })
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format cost for display
   */
  formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${cost.toFixed(6)}`
    } else if (cost < 1) {
      return `$${cost.toFixed(4)}`
    } else {
      return `$${cost.toFixed(2)}`
    }
  }

  /**
   * Format tokens for display
   */
  formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(2)}M`
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  /**
   * Get provider display name
   */
  getProviderDisplayName(provider: AIProvider): string {
    const names: Record<AIProvider, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      groq: 'Groq',
      openrouter: 'OpenRouter',
      local: 'Local',
    }
    return names[provider] || provider
  }

  /**
   * Estimate cost for a request before making it
   */
  estimateCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    return this.calculateCost(model, estimatedInputTokens, estimatedOutputTokens)
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async shutdown(): Promise<void> {
    console.log('[CostTracker] Shutting down...')
    this.usageCallbacks.clear()
    this.budgetWarningCallbacks.clear()
    console.log('[CostTracker] Shutdown complete')
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const costTracker = CostTracker.getInstance()

export default costTracker
