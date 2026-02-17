/**
 * Persistent Memory System for Alabobai AI Platform
 *
 * A comprehensive memory system that enables:
 * - Project context memory with auto-loading and compression
 * - User preference learning and automatic application
 * - Solution memory with similarity matching
 * - Knowledge graph for concept relationships
 * - Full CRUD operations on memories
 *
 * Uses IndexedDB for persistence with efficient similarity search
 * without external dependencies.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type MemoryType =
  | 'project_context'
  | 'user_preference'
  | 'solution'
  | 'decision'
  | 'file_reference'
  | 'code_pattern'
  | 'conversation'
  | 'knowledge'
  | 'error_resolution'

export type PreferenceCategory =
  | 'coding_style'
  | 'communication'
  | 'ui_preferences'
  | 'workflow'
  | 'naming_conventions'
  | 'framework_choices'
  | 'tool_preferences'

export type KnowledgeNodeType =
  | 'concept'
  | 'file'
  | 'function'
  | 'decision'
  | 'pattern'
  | 'solution'
  | 'error'
  | 'dependency'

export type EdgeType =
  | 'relates_to'
  | 'depends_on'
  | 'implements'
  | 'caused_by'
  | 'solved_by'
  | 'similar_to'
  | 'references'
  | 'defines'

export interface Memory {
  id: string
  content: string
  type: MemoryType
  importance: number // 0-100
  created: number
  accessed: number
  accessCount: number
  relations: MemoryRelation[]
  embedding?: number[] // Simplified vector for similarity
  metadata: MemoryMetadata
  compressed: boolean
  projectId?: string
  tags: string[]
}

export interface MemoryRelation {
  targetId: string
  type: EdgeType
  strength: number // 0-1
  created: number
}

export interface MemoryMetadata {
  source?: string
  context?: string
  confidence?: number
  successRate?: number
  problemSignature?: string
  solutionOutcome?: 'success' | 'partial' | 'failure'
  [key: string]: unknown
}

export interface MemoryQuery {
  query: string
  filters?: MemoryFilters
  limit?: number
  minRelevance?: number
  includeRelations?: boolean
}

export interface MemoryFilters {
  types?: MemoryType[]
  projectId?: string
  minImportance?: number
  minCreated?: number
  maxCreated?: number
  tags?: string[]
  hasEmbedding?: boolean
}

export interface UserPreference {
  key: string
  value: unknown
  category: PreferenceCategory
  confidence: number // 0-1
  learnedFrom: PreferenceLearningSource[]
  lastUpdated: number
  applicationCount: number
}

export interface PreferenceLearningSource {
  type: 'explicit' | 'implicit' | 'pattern' | 'feedback'
  context: string
  timestamp: number
  weight: number
}

export interface KnowledgeNode {
  id: string
  type: KnowledgeNodeType
  content: string
  edges: KnowledgeEdge[]
  metadata: Record<string, unknown>
  created: number
  updated: number
  importance: number
}

export interface KnowledgeEdge {
  targetId: string
  type: EdgeType
  weight: number
  metadata?: Record<string, unknown>
}

export interface ProjectContext {
  projectId: string
  name: string
  files: ProjectFile[]
  decisions: ProjectDecision[]
  history: ProjectHistoryEntry[]
  patterns: CodePattern[]
  lastAccessed: number
  compressed: boolean
  compressionLevel: number
  priorityScore: number
}

export interface ProjectFile {
  path: string
  type: string
  summary: string
  lastModified: number
  importance: number
  relatedFiles: string[]
}

export interface ProjectDecision {
  id: string
  decision: string
  rationale: string
  timestamp: number
  context: string
  outcome?: string
  relatedFiles: string[]
}

export interface ProjectHistoryEntry {
  id: string
  action: string
  details: string
  timestamp: number
  importance: number
}

export interface CodePattern {
  id: string
  pattern: string
  description: string
  frequency: number
  lastUsed: number
  files: string[]
}

export interface SolutionMatch {
  memory: Memory
  relevanceScore: number
  problemSimilarity: number
  successRate: number
  appliedCount: number
}

export interface MemoryStats {
  totalMemories: number
  memoriesByType: Record<MemoryType, number>
  totalPreferences: number
  knowledgeNodes: number
  projectContexts: number
  storageUsed: number
  lastConsolidation: number
  avgImportance: number
}

export interface ConsolidationResult {
  memoriesMerged: number
  memoriesRemoved: number
  spaceReclaimed: number
  newConnections: number
}

// ============================================================================
// IndexedDB Configuration
// ============================================================================

const DB_NAME = 'alabobai_persistent_memory'
const DB_VERSION = 1

interface DBSchema {
  memories: Memory
  preferences: UserPreference
  knowledgeNodes: KnowledgeNode
  projectContexts: ProjectContext
  metadata: { key: string; value: unknown }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Simple text embedding without external dependencies
 * Uses TF-IDF-like approach with character n-grams
 */
function computeEmbedding(text: string, dimensions: number = 128): number[] {
  const embedding = new Array(dimensions).fill(0)
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0)

  // Character trigram approach for robustness
  const trigrams: string[] = []
  for (let i = 0; i < normalizedText.length - 2; i++) {
    trigrams.push(normalizedText.substring(i, i + 3))
  }

  // Hash trigrams into embedding dimensions
  for (const trigram of trigrams) {
    const hash = hashString(trigram)
    const index = Math.abs(hash) % dimensions
    embedding[index] += 1
  }

  // Add word-level features
  for (const word of words) {
    const hash = hashString(word)
    const index = Math.abs(hash) % dimensions
    embedding[index] += 2 // Words weighted more than trigrams
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude
    }
  }

  return embedding
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

/**
 * Cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB)
  return magnitude > 0 ? dotProduct / magnitude : 0
}

/**
 * Extract keywords from text for indexing
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
    'because', 'until', 'while', 'although', 'though', 'this', 'that',
    'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
    'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom'
  ])

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))

  // Return unique keywords
  return Array.from(new Set(words))
}

/**
 * Compress text content for storage efficiency
 */
function compressContent(content: string): string {
  // Remove excessive whitespace
  let compressed = content.replace(/\s+/g, ' ').trim()

  // Truncate very long content
  if (compressed.length > 5000) {
    compressed = compressed.substring(0, 4900) + '... [truncated]'
  }

  return compressed
}

/**
 * Calculate importance decay based on time and access patterns
 */
function calculateImportanceDecay(
  memory: Memory,
  currentTime: number = Date.now()
): number {
  const daysSinceAccess = (currentTime - memory.accessed) / (1000 * 60 * 60 * 24)
  const accessBoost = Math.min(memory.accessCount * 2, 20)

  // Decay formula: importance reduces by ~10% per week of non-access
  const decayFactor = Math.pow(0.9, daysSinceAccess / 7)

  return Math.max(0, Math.min(100, memory.importance * decayFactor + accessBoost))
}

/**
 * Generate a problem signature for solution matching
 */
function generateProblemSignature(problemDescription: string): string {
  const keywords = extractKeywords(problemDescription)
  keywords.sort()
  return keywords.slice(0, 20).join('|')
}

// ============================================================================
// IndexedDB Database Manager
// ============================================================================

class MemoryDatabase {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('[PersistentMemory] IndexedDB not available, using in-memory fallback')
        resolve()
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[PersistentMemory] Failed to open database:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[PersistentMemory] Database initialized successfully')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Memories store
        if (!db.objectStoreNames.contains('memories')) {
          const memoriesStore = db.createObjectStore('memories', { keyPath: 'id' })
          memoriesStore.createIndex('type', 'type', { unique: false })
          memoriesStore.createIndex('projectId', 'projectId', { unique: false })
          memoriesStore.createIndex('importance', 'importance', { unique: false })
          memoriesStore.createIndex('created', 'created', { unique: false })
          memoriesStore.createIndex('accessed', 'accessed', { unique: false })
        }

        // Preferences store
        if (!db.objectStoreNames.contains('preferences')) {
          const prefsStore = db.createObjectStore('preferences', { keyPath: 'key' })
          prefsStore.createIndex('category', 'category', { unique: false })
          prefsStore.createIndex('confidence', 'confidence', { unique: false })
        }

        // Knowledge nodes store
        if (!db.objectStoreNames.contains('knowledgeNodes')) {
          const nodesStore = db.createObjectStore('knowledgeNodes', { keyPath: 'id' })
          nodesStore.createIndex('type', 'type', { unique: false })
          nodesStore.createIndex('importance', 'importance', { unique: false })
        }

        // Project contexts store
        if (!db.objectStoreNames.contains('projectContexts')) {
          const projectsStore = db.createObjectStore('projectContexts', { keyPath: 'projectId' })
          projectsStore.createIndex('lastAccessed', 'lastAccessed', { unique: false })
          projectsStore.createIndex('priorityScore', 'priorityScore', { unique: false })
        }

        // Metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }

        console.log('[PersistentMemory] Database schema created/upgraded')
      }
    })

    return this.initPromise
  }

  private getStore<T extends keyof DBSchema>(
    storeName: T,
    mode: IDBTransactionMode = 'readonly'
  ): IDBObjectStore {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    const transaction = this.db.transaction(storeName, mode)
    return transaction.objectStore(storeName)
  }

  async put<T extends keyof DBSchema>(storeName: T, data: DBSchema[T]): Promise<void> {
    await this.init()
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.put(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T extends keyof DBSchema>(storeName: T, key: string): Promise<DBSchema[T] | undefined> {
    await this.init()
    if (!this.db) return undefined

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T extends keyof DBSchema>(storeName: T): Promise<DBSchema[T][]> {
    await this.init()
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: keyof DBSchema, key: string): Promise<void> {
    await this.init()
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getByIndex<T extends keyof DBSchema>(
    storeName: T,
    indexName: string,
    value: IDBValidKey
  ): Promise<DBSchema[T][]> {
    await this.init()
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(value)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async count(storeName: keyof DBSchema): Promise<number> {
    await this.init()
    if (!this.db) return 0

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: keyof DBSchema): Promise<void> {
    await this.init()
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

// ============================================================================
// Persistent Memory System
// ============================================================================

export class PersistentMemory {
  private db: MemoryDatabase
  private memoryCache: Map<string, Memory> = new Map()
  private preferenceCache: Map<string, UserPreference> = new Map()
  private knowledgeCache: Map<string, KnowledgeNode> = new Map()
  private projectCache: Map<string, ProjectContext> = new Map()
  private currentProjectId: string | null = null
  private consolidationTimer: NodeJS.Timeout | number | null = null
  private initialized = false

  constructor() {
    this.db = new MemoryDatabase()
  }

  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await this.db.init()
      await this.loadCaches()
      this.startConsolidationTimer()
      this.initialized = true
      console.log('[PersistentMemory] System initialized')
    } catch (error) {
      console.error('[PersistentMemory] Initialization failed:', error)
      throw error
    }
  }

  private async loadCaches(): Promise<void> {
    // Load recent/important memories into cache
    const memories = await this.db.getAll('memories')
    const sortedMemories = memories
      .sort((a, b) => b.accessed - a.accessed)
      .slice(0, 1000)

    for (const memory of sortedMemories) {
      this.memoryCache.set(memory.id, memory)
    }

    // Load all preferences
    const preferences = await this.db.getAll('preferences')
    for (const pref of preferences) {
      this.preferenceCache.set(pref.key, pref)
    }

    // Load important knowledge nodes
    const nodes = await this.db.getAll('knowledgeNodes')
    const sortedNodes = nodes
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 500)

    for (const node of sortedNodes) {
      this.knowledgeCache.set(node.id, node)
    }

    // Load recent project contexts
    const projects = await this.db.getAll('projectContexts')
    const sortedProjects = projects
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, 50)

    for (const project of sortedProjects) {
      this.projectCache.set(project.projectId, project)
    }
  }

  private startConsolidationTimer(): void {
    // Run consolidation every hour
    this.consolidationTimer = setInterval(() => {
      this.consolidate().catch(console.error)
    }, 60 * 60 * 1000)
  }

  // ==========================================================================
  // Core Memory Operations
  // ==========================================================================

  /**
   * Store a new memory with metadata
   */
  async remember(
    content: string,
    type: MemoryType,
    options: {
      importance?: number
      projectId?: string
      metadata?: MemoryMetadata
      tags?: string[]
      relations?: MemoryRelation[]
    } = {}
  ): Promise<Memory> {
    await this.initialize()

    const now = Date.now()
    const keywords = extractKeywords(content)

    const memory: Memory = {
      id: generateId(),
      content: content,
      type,
      importance: options.importance ?? 50,
      created: now,
      accessed: now,
      accessCount: 0,
      relations: options.relations || [],
      embedding: computeEmbedding(content),
      metadata: options.metadata || {},
      compressed: false,
      projectId: options.projectId || this.currentProjectId || undefined,
      tags: [...(options.tags || []), ...keywords.slice(0, 10)]
    }

    // Store in database and cache
    await this.db.put('memories', memory)
    this.memoryCache.set(memory.id, memory)

    // Update knowledge graph
    await this.updateKnowledgeGraph(memory)

    console.log(`[PersistentMemory] Remembered: ${type} (${memory.id})`)
    return memory
  }

  /**
   * Retrieve relevant memories based on query
   */
  async recall(query: MemoryQuery): Promise<Memory[]> {
    await this.initialize()

    const queryEmbedding = computeEmbedding(query.query)
    const limit = query.limit || 10
    const minRelevance = query.minRelevance || 0.3

    // Get all candidate memories
    let candidates: Memory[] = []

    // Check cache first
    candidates = Array.from(this.memoryCache.values())

    // Also check database for non-cached memories
    const dbMemories = await this.db.getAll('memories')
    for (const mem of dbMemories) {
      if (!this.memoryCache.has(mem.id)) {
        candidates.push(mem)
      }
    }

    // Apply filters
    if (query.filters) {
      candidates = this.applyFilters(candidates, query.filters)
    }

    // Calculate relevance scores
    const scored = candidates.map(memory => {
      let relevance = 0

      // Embedding similarity
      if (memory.embedding && queryEmbedding) {
        relevance += cosineSimilarity(memory.embedding, queryEmbedding) * 0.6
      }

      // Keyword overlap
      const queryKeywords = new Set(extractKeywords(query.query))
      const memoryKeywords = new Set(memory.tags)
      const overlap = Array.from(queryKeywords).filter(k => memoryKeywords.has(k)).length
      const keywordScore = queryKeywords.size > 0 ? overlap / queryKeywords.size : 0
      relevance += keywordScore * 0.25

      // Importance factor
      const decayedImportance = calculateImportanceDecay(memory)
      relevance += (decayedImportance / 100) * 0.15

      return { memory, relevance }
    })

    // Filter by minimum relevance and sort
    const results = scored
      .filter(s => s.relevance >= minRelevance)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(s => s.memory)

    // Update access statistics
    const now = Date.now()
    for (const memory of results) {
      memory.accessed = now
      memory.accessCount++
      await this.db.put('memories', memory)
      this.memoryCache.set(memory.id, memory)
    }

    // Include relations if requested
    if (query.includeRelations) {
      const relatedIds = new Set<string>()
      for (const memory of results) {
        for (const relation of memory.relations) {
          relatedIds.add(relation.targetId)
        }
      }

      for (const relatedId of Array.from(relatedIds)) {
        if (!results.find(m => m.id === relatedId)) {
          const related = this.memoryCache.get(relatedId) ||
                         await this.db.get('memories', relatedId)
          if (related) {
            results.push(related)
          }
        }
      }
    }

    return results
  }

  /**
   * Remove a memory by ID
   */
  async forget(memoryId: string): Promise<boolean> {
    await this.initialize()

    const memory = this.memoryCache.get(memoryId) ||
                   await this.db.get('memories', memoryId)

    if (!memory) {
      return false
    }

    // Remove from database
    await this.db.delete('memories', memoryId)

    // Remove from cache
    this.memoryCache.delete(memoryId)

    // Update relations in other memories
    for (const [, mem] of Array.from(this.memoryCache)) {
      const relationIndex = mem.relations.findIndex(r => r.targetId === memoryId)
      if (relationIndex >= 0) {
        mem.relations.splice(relationIndex, 1)
        await this.db.put('memories', mem)
      }
    }

    console.log(`[PersistentMemory] Forgot: ${memoryId}`)
    return true
  }

  /**
   * Consolidate similar memories and prune low-importance ones
   */
  async consolidate(): Promise<ConsolidationResult> {
    await this.initialize()

    const result: ConsolidationResult = {
      memoriesMerged: 0,
      memoriesRemoved: 0,
      spaceReclaimed: 0,
      newConnections: 0
    }

    const allMemories = await this.db.getAll('memories')
    const now = Date.now()

    // Group memories by type for consolidation
    const byType = new Map<MemoryType, Memory[]>()
    for (const memory of allMemories) {
      const memories = byType.get(memory.type) || []
      memories.push(memory)
      byType.set(memory.type, memories)
    }

    // Find and merge similar memories
    for (const [, memories] of Array.from(byType)) {
      if (memories.length < 2) continue

      const toMerge: [Memory, Memory][] = []

      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const a = memories[i]
          const b = memories[j]

          if (a.embedding && b.embedding) {
            const similarity = cosineSimilarity(a.embedding, b.embedding)
            if (similarity > 0.9) {
              toMerge.push([a, b])
            }
          }
        }
      }

      // Merge similar memories
      for (const [a, b] of toMerge) {
        if (!this.memoryCache.has(a.id) && !this.memoryCache.has(b.id)) continue

        // Keep the more important/accessed one
        const keep = a.importance * a.accessCount > b.importance * b.accessCount ? a : b
        const remove = keep === a ? b : a

        // Merge relations
        for (const relation of remove.relations) {
          if (!keep.relations.find(r => r.targetId === relation.targetId)) {
            keep.relations.push(relation)
            result.newConnections++
          }
        }

        // Update importance
        keep.importance = Math.min(100, keep.importance + 10)

        // Remove the duplicate
        await this.forget(remove.id)
        await this.db.put('memories', keep)
        this.memoryCache.set(keep.id, keep)

        result.memoriesMerged++
      }
    }

    // Compress old memories
    for (const memory of allMemories) {
      if (memory.compressed) continue

      const daysSinceAccess = (now - memory.accessed) / (1000 * 60 * 60 * 24)

      if (daysSinceAccess > 30 && memory.importance < 50) {
        const originalLength = memory.content.length
        memory.content = compressContent(memory.content)
        memory.compressed = true
        result.spaceReclaimed += originalLength - memory.content.length

        await this.db.put('memories', memory)
        this.memoryCache.set(memory.id, memory)
      }
    }

    // Remove very old, low-importance memories
    for (const memory of allMemories) {
      const decayedImportance = calculateImportanceDecay(memory, now)

      if (decayedImportance < 5 && memory.accessCount < 2) {
        await this.forget(memory.id)
        result.memoriesRemoved++
      }
    }

    // Update consolidation timestamp
    await this.db.put('metadata', { key: 'lastConsolidation', value: now })

    console.log(`[PersistentMemory] Consolidation complete:`, result)
    return result
  }

  private applyFilters(memories: Memory[], filters: MemoryFilters): Memory[] {
    return memories.filter(memory => {
      if (filters.types && !filters.types.includes(memory.type)) {
        return false
      }
      if (filters.projectId && memory.projectId !== filters.projectId) {
        return false
      }
      if (filters.minImportance && memory.importance < filters.minImportance) {
        return false
      }
      if (filters.minCreated && memory.created < filters.minCreated) {
        return false
      }
      if (filters.maxCreated && memory.created > filters.maxCreated) {
        return false
      }
      if (filters.tags && !filters.tags.some(t => memory.tags.includes(t))) {
        return false
      }
      if (filters.hasEmbedding && !memory.embedding) {
        return false
      }
      return true
    })
  }

  // ==========================================================================
  // Project Context Memory
  // ==========================================================================

  /**
   * Set the current project context
   */
  async setCurrentProject(projectId: string): Promise<ProjectContext> {
    await this.initialize()

    this.currentProjectId = projectId

    let context = this.projectCache.get(projectId) ||
                  await this.db.get('projectContexts', projectId)

    if (!context) {
      context = {
        projectId,
        name: projectId,
        files: [],
        decisions: [],
        history: [],
        patterns: [],
        lastAccessed: Date.now(),
        compressed: false,
        compressionLevel: 0,
        priorityScore: 50
      }
      await this.db.put('projectContexts', context)
    } else {
      // Decompress if needed
      if (context.compressed) {
        context.compressed = false
        context.compressionLevel = 0
      }
      context.lastAccessed = Date.now()
      await this.db.put('projectContexts', context)
    }

    this.projectCache.set(projectId, context)

    // Auto-load related memories
    await this.recall({
      query: projectId,
      filters: { projectId },
      limit: 100
    })

    console.log(`[PersistentMemory] Switched to project: ${projectId}`)
    return context
  }

  /**
   * Add a file reference to the current project
   */
  async addProjectFile(file: ProjectFile): Promise<void> {
    if (!this.currentProjectId) return
    await this.initialize()

    const context = this.projectCache.get(this.currentProjectId)
    if (!context) return

    const existingIndex = context.files.findIndex(f => f.path === file.path)
    if (existingIndex >= 0) {
      context.files[existingIndex] = file
    } else {
      context.files.push(file)
    }

    context.lastAccessed = Date.now()
    await this.db.put('projectContexts', context)
  }

  /**
   * Record a project decision
   */
  async addProjectDecision(decision: Omit<ProjectDecision, 'id' | 'timestamp'>): Promise<ProjectDecision> {
    if (!this.currentProjectId) {
      throw new Error('No current project set')
    }
    await this.initialize()

    const context = this.projectCache.get(this.currentProjectId)
    if (!context) {
      throw new Error('Project context not found')
    }

    const fullDecision: ProjectDecision = {
      id: generateId(),
      timestamp: Date.now(),
      ...decision
    }

    context.decisions.push(fullDecision)
    context.lastAccessed = Date.now()

    await this.db.put('projectContexts', context)

    // Also store as a memory
    await this.remember(
      `Decision: ${decision.decision}\nRationale: ${decision.rationale}`,
      'decision',
      {
        importance: 70,
        metadata: { decisionId: fullDecision.id, context: decision.context },
        tags: ['decision', ...decision.relatedFiles.map(f => f.split('/').pop() || f)]
      }
    )

    return fullDecision
  }

  /**
   * Get the current project context
   */
  getCurrentProjectContext(): ProjectContext | null {
    if (!this.currentProjectId) return null
    return this.projectCache.get(this.currentProjectId) || null
  }

  /**
   * Compress old project contexts to save space
   */
  async compressOldContexts(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.initialize()

    const now = Date.now()
    const contexts = await this.db.getAll('projectContexts')

    for (const context of contexts) {
      if (context.projectId === this.currentProjectId) continue
      if (now - context.lastAccessed < maxAge) continue
      if (context.compressed) continue

      // Compress history entries
      context.history = context.history
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 50)

      // Compress file summaries
      for (const file of context.files) {
        file.summary = compressContent(file.summary)
      }

      context.compressed = true
      context.compressionLevel++

      await this.db.put('projectContexts', context)
      this.projectCache.set(context.projectId, context)
    }
  }

  // ==========================================================================
  // User Preference Learning
  // ==========================================================================

  /**
   * Learn a user preference from an action
   */
  async learnPreference(
    key: string,
    value: unknown,
    category: PreferenceCategory,
    source: PreferenceLearningSource
  ): Promise<UserPreference> {
    await this.initialize()

    let preference = this.preferenceCache.get(key) ||
                     await this.db.get('preferences', key)

    const now = Date.now()

    if (preference) {
      // Update existing preference
      preference.learnedFrom.push(source)

      // Recalculate confidence based on sources
      const weights = preference.learnedFrom.map(s => s.weight)
      const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length
      preference.confidence = Math.min(1, avgWeight * (1 + preference.learnedFrom.length * 0.1))

      // Update value if confidence is high enough
      if (source.weight > 0.7 || preference.confidence > 0.8) {
        preference.value = value
      }

      preference.lastUpdated = now
      preference.applicationCount++
    } else {
      // Create new preference
      preference = {
        key,
        value,
        category,
        confidence: source.weight,
        learnedFrom: [source],
        lastUpdated: now,
        applicationCount: 0
      }
    }

    await this.db.put('preferences', preference)
    this.preferenceCache.set(key, preference)

    console.log(`[PersistentMemory] Learned preference: ${key} (confidence: ${preference.confidence.toFixed(2)})`)
    return preference
  }

  /**
   * Get all user preferences, optionally filtered by category
   */
  async getPreferences(category?: PreferenceCategory): Promise<UserPreference[]> {
    await this.initialize()

    const allPrefs = Array.from(this.preferenceCache.values())

    if (category) {
      return allPrefs.filter(p => p.category === category)
    }

    return allPrefs
  }

  /**
   * Get a specific preference value
   */
  async getPreference<T = unknown>(key: string): Promise<T | null> {
    await this.initialize()

    const pref = this.preferenceCache.get(key) ||
                 await this.db.get('preferences', key)

    return pref ? pref.value as T : null
  }

  /**
   * Apply learned preferences to a context
   */
  async applyPreferences(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.initialize()

    const applied = { ...context }

    for (const [key, pref] of Array.from(this.preferenceCache)) {
      // Only apply high-confidence preferences
      if (pref.confidence >= 0.6 && !(key in applied)) {
        applied[key] = pref.value
      }
    }

    return applied
  }

  /**
   * Explicitly set a user preference
   */
  async setPreference(
    key: string,
    value: unknown,
    category: PreferenceCategory
  ): Promise<void> {
    await this.learnPreference(key, value, category, {
      type: 'explicit',
      context: 'User explicitly set this preference',
      timestamp: Date.now(),
      weight: 1.0
    })
  }

  // ==========================================================================
  // Solution Memory
  // ==========================================================================

  /**
   * Store a solution to a problem
   */
  async rememberSolution(
    problem: string,
    solution: string,
    options: {
      outcome?: 'success' | 'partial' | 'failure'
      context?: string
      tags?: string[]
    } = {}
  ): Promise<Memory> {
    const problemSignature = generateProblemSignature(problem)

    return this.remember(
      `Problem: ${problem}\n\nSolution: ${solution}`,
      'solution',
      {
        importance: options.outcome === 'success' ? 80 : options.outcome === 'partial' ? 60 : 40,
        metadata: {
          problemSignature,
          solutionOutcome: options.outcome || 'success',
          context: options.context,
          successRate: options.outcome === 'success' ? 1 : options.outcome === 'partial' ? 0.5 : 0
        },
        tags: ['solution', ...(options.tags || [])],
        relations: []
      }
    )
  }

  /**
   * Find similar solutions to a current problem
   */
  async findSimilarSolutions(problem: string, limit: number = 5): Promise<SolutionMatch[]> {
    await this.initialize()

    const problemEmbedding = computeEmbedding(problem)
    const problemSignature = generateProblemSignature(problem)

    // Get all solution memories
    const solutions = await this.recall({
      query: problem,
      filters: { types: ['solution', 'error_resolution'] },
      limit: limit * 3,
      minRelevance: 0.2
    })

    // Score solutions
    const matches: SolutionMatch[] = solutions.map(memory => {
      let relevanceScore = 0
      let problemSimilarity = 0

      // Embedding similarity
      if (memory.embedding) {
        relevanceScore = cosineSimilarity(memory.embedding, problemEmbedding)
      }

      // Problem signature similarity
      const storedSignature = memory.metadata.problemSignature as string
      if (storedSignature) {
        const storedParts = new Set(storedSignature.split('|'))
        const currentParts = new Set(problemSignature.split('|'))
        const intersection = Array.from(storedParts).filter(p => currentParts.has(p))
        problemSimilarity = intersection.length / Math.max(storedParts.size, currentParts.size)
      }

      // Combined score
      relevanceScore = (relevanceScore * 0.6) + (problemSimilarity * 0.4)

      return {
        memory,
        relevanceScore,
        problemSimilarity,
        successRate: (memory.metadata.successRate as number) || 0,
        appliedCount: memory.accessCount
      }
    })

    // Sort by relevance and success rate
    return matches
      .sort((a, b) => {
        const aScore = a.relevanceScore * 0.6 + a.successRate * 0.4
        const bScore = b.relevanceScore * 0.6 + b.successRate * 0.4
        return bScore - aScore
      })
      .slice(0, limit)
  }

  /**
   * Update the success rate of a solution
   */
  async updateSolutionOutcome(
    memoryId: string,
    outcome: 'success' | 'partial' | 'failure'
  ): Promise<void> {
    await this.initialize()

    const memory = this.memoryCache.get(memoryId) ||
                   await this.db.get('memories', memoryId)

    if (!memory) return

    const currentRate = (memory.metadata.successRate as number) || 0.5
    const outcomeValue = outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0

    // Exponential moving average
    memory.metadata.successRate = currentRate * 0.7 + outcomeValue * 0.3
    memory.metadata.solutionOutcome = outcome

    // Update importance based on outcome
    if (outcome === 'success') {
      memory.importance = Math.min(100, memory.importance + 5)
    } else if (outcome === 'failure') {
      memory.importance = Math.max(0, memory.importance - 10)
    }

    await this.db.put('memories', memory)
    this.memoryCache.set(memoryId, memory)
  }

  // ==========================================================================
  // Knowledge Graph
  // ==========================================================================

  /**
   * Add or update a knowledge node
   */
  async addKnowledgeNode(
    type: KnowledgeNodeType,
    content: string,
    edges: KnowledgeEdge[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<KnowledgeNode> {
    await this.initialize()

    const now = Date.now()
    const id = generateId()

    const node: KnowledgeNode = {
      id,
      type,
      content,
      edges,
      metadata,
      created: now,
      updated: now,
      importance: 50
    }

    await this.db.put('knowledgeNodes', node)
    this.knowledgeCache.set(id, node)

    return node
  }

  /**
   * Connect two knowledge nodes
   */
  async connectNodes(
    sourceId: string,
    targetId: string,
    edgeType: EdgeType,
    weight: number = 0.5
  ): Promise<void> {
    await this.initialize()

    const source = this.knowledgeCache.get(sourceId) ||
                   await this.db.get('knowledgeNodes', sourceId)

    if (!source) {
      throw new Error(`Source node ${sourceId} not found`)
    }

    // Check if edge already exists
    const existingEdge = source.edges.find(e =>
      e.targetId === targetId && e.type === edgeType
    )

    if (existingEdge) {
      existingEdge.weight = Math.min(1, existingEdge.weight + weight * 0.1)
    } else {
      source.edges.push({
        targetId,
        type: edgeType,
        weight
      })
    }

    source.updated = Date.now()
    await this.db.put('knowledgeNodes', source)
    this.knowledgeCache.set(sourceId, source)
  }

  /**
   * Query the knowledge graph for related concepts
   */
  async queryKnowledgeGraph(
    query: string,
    options: {
      maxDepth?: number
      limit?: number
      types?: KnowledgeNodeType[]
    } = {}
  ): Promise<KnowledgeNode[]> {
    await this.initialize()

    const maxDepth = options.maxDepth || 2
    const limit = options.limit || 20
    const queryEmbedding = computeEmbedding(query)

    // Find starting nodes
    const allNodes = Array.from(this.knowledgeCache.values())
    const scored = allNodes.map(node => ({
      node,
      score: node.content ?
        cosineSimilarity(computeEmbedding(node.content), queryEmbedding) : 0
    }))

    const startNodes = scored
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.node)

    // BFS to find related nodes
    const visited = new Set<string>()
    const results: KnowledgeNode[] = []
    const queue: { node: KnowledgeNode; depth: number }[] =
      startNodes.map(n => ({ node: n, depth: 0 }))

    while (queue.length > 0 && results.length < limit) {
      const { node, depth } = queue.shift()!

      if (visited.has(node.id)) continue
      visited.add(node.id)

      // Apply type filter
      if (options.types && !options.types.includes(node.type)) continue

      results.push(node)

      // Explore edges if not at max depth
      if (depth < maxDepth) {
        for (const edge of node.edges) {
          if (!visited.has(edge.targetId)) {
            const targetNode = this.knowledgeCache.get(edge.targetId) ||
                              await this.db.get('knowledgeNodes', edge.targetId)

            if (targetNode) {
              queue.push({ node: targetNode, depth: depth + 1 })
            }
          }
        }
      }
    }

    return results
  }

  /**
   * Get visualization data for the knowledge graph
   */
  async getGraphVisualization(
    centerNodeId?: string,
    maxNodes: number = 50
  ): Promise<{ nodes: KnowledgeNode[]; edges: Array<{ source: string; target: string; type: EdgeType; weight: number }> }> {
    await this.initialize()

    let nodes: KnowledgeNode[] = []
    const edges: Array<{ source: string; target: string; type: EdgeType; weight: number }> = []

    if (centerNodeId) {
      // Get nodes around center
      const centerNode = this.knowledgeCache.get(centerNodeId) ||
                        await this.db.get('knowledgeNodes', centerNodeId)

      if (centerNode) {
        nodes = await this.queryKnowledgeGraph(centerNode.content, { limit: maxNodes })
      }
    } else {
      // Get most important nodes
      nodes = Array.from(this.knowledgeCache.values())
        .sort((a, b) => b.importance - a.importance)
        .slice(0, maxNodes)
    }

    // Collect edges
    const nodeIds = new Set(nodes.map(n => n.id))
    for (const node of nodes) {
      for (const edge of node.edges) {
        if (nodeIds.has(edge.targetId)) {
          edges.push({
            source: node.id,
            target: edge.targetId,
            type: edge.type,
            weight: edge.weight
          })
        }
      }
    }

    return { nodes, edges }
  }

  private async updateKnowledgeGraph(memory: Memory): Promise<void> {
    // Create a knowledge node for significant memories
    if (memory.importance >= 60) {
      const node = await this.addKnowledgeNode(
        this.memoryTypeToNodeType(memory.type),
        memory.content,
        [],
        { memoryId: memory.id }
      )

      // Connect to related memories
      for (const relation of memory.relations) {
        await this.connectNodes(node.id, relation.targetId, relation.type, relation.strength)
      }
    }
  }

  private memoryTypeToNodeType(type: MemoryType): KnowledgeNodeType {
    const mapping: Record<MemoryType, KnowledgeNodeType> = {
      'project_context': 'concept',
      'user_preference': 'concept',
      'solution': 'solution',
      'decision': 'decision',
      'file_reference': 'file',
      'code_pattern': 'pattern',
      'conversation': 'concept',
      'knowledge': 'concept',
      'error_resolution': 'error'
    }
    return mapping[type] || 'concept'
  }

  // ==========================================================================
  // Import/Export
  // ==========================================================================

  /**
   * Export all memories for backup
   */
  async export(): Promise<{
    memories: Memory[]
    preferences: UserPreference[]
    knowledgeNodes: KnowledgeNode[]
    projectContexts: ProjectContext[]
    exportedAt: number
    version: string
  }> {
    await this.initialize()

    return {
      memories: await this.db.getAll('memories'),
      preferences: await this.db.getAll('preferences'),
      knowledgeNodes: await this.db.getAll('knowledgeNodes'),
      projectContexts: await this.db.getAll('projectContexts'),
      exportedAt: Date.now(),
      version: '1.0.0'
    }
  }

  /**
   * Import memories from a backup
   */
  async import(data: {
    memories?: Memory[]
    preferences?: UserPreference[]
    knowledgeNodes?: KnowledgeNode[]
    projectContexts?: ProjectContext[]
  }): Promise<{ imported: number; errors: number }> {
    await this.initialize()

    let imported = 0
    let errors = 0

    // Import memories
    if (data.memories) {
      for (const memory of data.memories) {
        try {
          await this.db.put('memories', memory)
          this.memoryCache.set(memory.id, memory)
          imported++
        } catch {
          errors++
        }
      }
    }

    // Import preferences
    if (data.preferences) {
      for (const pref of data.preferences) {
        try {
          await this.db.put('preferences', pref)
          this.preferenceCache.set(pref.key, pref)
          imported++
        } catch {
          errors++
        }
      }
    }

    // Import knowledge nodes
    if (data.knowledgeNodes) {
      for (const node of data.knowledgeNodes) {
        try {
          await this.db.put('knowledgeNodes', node)
          this.knowledgeCache.set(node.id, node)
          imported++
        } catch {
          errors++
        }
      }
    }

    // Import project contexts
    if (data.projectContexts) {
      for (const context of data.projectContexts) {
        try {
          await this.db.put('projectContexts', context)
          this.projectCache.set(context.projectId, context)
          imported++
        } catch {
          errors++
        }
      }
    }

    console.log(`[PersistentMemory] Import complete: ${imported} items, ${errors} errors`)
    return { imported, errors }
  }

  // ==========================================================================
  // Statistics and Maintenance
  // ==========================================================================

  /**
   * Get memory system statistics
   */
  async getStats(): Promise<MemoryStats> {
    await this.initialize()

    const memories = await this.db.getAll('memories')
    const memoriesByType: Record<MemoryType, number> = {
      'project_context': 0,
      'user_preference': 0,
      'solution': 0,
      'decision': 0,
      'file_reference': 0,
      'code_pattern': 0,
      'conversation': 0,
      'knowledge': 0,
      'error_resolution': 0
    }

    let totalImportance = 0
    let storageUsed = 0

    for (const memory of memories) {
      memoriesByType[memory.type]++
      totalImportance += memory.importance
      storageUsed += JSON.stringify(memory).length
    }

    const lastConsolidation = await this.db.get('metadata', 'lastConsolidation')

    return {
      totalMemories: memories.length,
      memoriesByType,
      totalPreferences: this.preferenceCache.size,
      knowledgeNodes: this.knowledgeCache.size,
      projectContexts: this.projectCache.size,
      storageUsed,
      lastConsolidation: (lastConsolidation?.value as number) || 0,
      avgImportance: memories.length > 0 ? totalImportance / memories.length : 0
    }
  }

  /**
   * Clear all memories (use with caution)
   */
  async clearAll(): Promise<void> {
    await this.initialize()

    await this.db.clear('memories')
    await this.db.clear('preferences')
    await this.db.clear('knowledgeNodes')
    await this.db.clear('projectContexts')
    await this.db.clear('metadata')

    this.memoryCache.clear()
    this.preferenceCache.clear()
    this.knowledgeCache.clear()
    this.projectCache.clear()
    this.currentProjectId = null

    console.log('[PersistentMemory] All memories cleared')
  }

  /**
   * Shutdown the memory system
   */
  shutdown(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer)
      this.consolidationTimer = null
    }
    this.initialized = false
    console.log('[PersistentMemory] System shutdown')
  }
}

// ============================================================================
// Singleton Instance and Export
// ============================================================================

export const persistentMemory = new PersistentMemory()

// Auto-initialize in browser environment
if (typeof window !== 'undefined') {
  // Initialize after a short delay to allow other services to load
  setTimeout(() => {
    persistentMemory.initialize().catch(console.error)
  }, 500)

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    persistentMemory.shutdown()
  })
}

export default persistentMemory
