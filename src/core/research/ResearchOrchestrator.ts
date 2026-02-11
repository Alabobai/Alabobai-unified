/**
 * Alabobai Deep Research Engine - Research Orchestrator
 *
 * Coordinates parallel research across multiple sources with:
 * - Query planning and decomposition
 * - Parallel execution with load balancing
 * - Result aggregation and deduplication
 * - Progress tracking and streaming
 * - Error recovery and fallback strategies
 *
 * Designed to maximize research coverage while minimizing latency.
 */

import { EventEmitter } from 'events';
import { SourceManager, sourceManager, SourceResult, SearchQuery, SourceCategory } from './SourceManager.js';
import { CitationTracker, citationTracker, Citation, Claim } from './CitationTracker.js';
import { SourceQualityScorer, sourceQualityScorer, QualityScore, SourceMetadata } from './SourceQualityScorer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchQuery {
  query: string;
  context?: string;
  intent?: ResearchIntent;
  depth?: 'quick' | 'standard' | 'deep' | 'exhaustive';
  focus?: ResearchFocus[];
  constraints?: ResearchConstraints;
  streaming?: boolean;
}

export type ResearchIntent =
  | 'factual'         // Looking for facts/data
  | 'exploratory'     // Exploring a topic
  | 'comparative'     // Comparing options
  | 'analytical'      // Deep analysis
  | 'current_events'  // Recent news
  | 'technical'       // Technical documentation
  | 'academic';       // Scholarly research

export type ResearchFocus =
  | 'academic'
  | 'news'
  | 'technical'
  | 'financial'
  | 'government'
  | 'social'
  | 'general';

export interface ResearchConstraints {
  dateRange?: { start: Date; end: Date };
  domains?: string[];
  excludeDomains?: string[];
  languages?: string[];
  minQualityScore?: number;
  maxResults?: number;
  timeout?: number;
}

export interface ResearchPlan {
  id: string;
  query: ResearchQuery;
  subQueries: SubQuery[];
  phases: ResearchPhase[];
  estimatedDuration: number;
  estimatedSources: number;
  createdAt: Date;
}

export interface SubQuery {
  id: string;
  query: string;
  purpose: string;
  categories: SourceCategory[];
  priority: number;
  dependencies?: string[];
}

export interface ResearchPhase {
  id: string;
  name: string;
  subQueryIds: string[];
  parallel: boolean;
  timeout: number;
}

export interface ResearchProgress {
  planId: string;
  phase: string;
  completedSubQueries: number;
  totalSubQueries: number;
  sourcesQueried: number;
  resultsFound: number;
  citationsAdded: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  status: 'planning' | 'executing' | 'aggregating' | 'completed' | 'failed';
  errors: Array<{ source: string; error: string }>;
}

export interface ResearchResult {
  planId: string;
  query: ResearchQuery;
  findings: Finding[];
  citations: Citation[];
  claims: Claim[];
  statistics: ResearchStatistics;
  completedAt: Date;
}

export interface Finding {
  id: string;
  content: string;
  type: 'fact' | 'insight' | 'trend' | 'opinion' | 'data';
  confidence: number;
  citations: string[];
  subQuery?: string;
  relevanceScore: number;
}

export interface ResearchStatistics {
  totalSources: number;
  sourcesSuccessful: number;
  sourcesFailed: number;
  totalResults: number;
  uniqueResults: number;
  citationsAdded: number;
  claimsIdentified: number;
  averageQualityScore: number;
  executionTimeMs: number;
  phases: Array<{
    name: string;
    durationMs: number;
    sourcesQueried: number;
    resultsFound: number;
  }>;
}

// ============================================================================
// DEPTH CONFIGURATIONS
// ============================================================================

const DEPTH_CONFIGS = {
  quick: {
    maxSources: 10,
    maxSubQueries: 2,
    timeout: 15000,
    minQuality: 50,
    categories: ['search_engine', 'knowledge_base'] as SourceCategory[],
  },
  standard: {
    maxSources: 25,
    maxSubQueries: 4,
    timeout: 30000,
    minQuality: 40,
    categories: ['search_engine', 'news', 'academic', 'knowledge_base'] as SourceCategory[],
  },
  deep: {
    maxSources: 50,
    maxSubQueries: 8,
    timeout: 60000,
    minQuality: 30,
    categories: ['search_engine', 'news', 'academic', 'knowledge_base', 'technical', 'government'] as SourceCategory[],
  },
  exhaustive: {
    maxSources: 100,
    maxSubQueries: 15,
    timeout: 120000,
    minQuality: 20,
    categories: ['search_engine', 'news', 'academic', 'knowledge_base', 'technical', 'government', 'social', 'financial'] as SourceCategory[],
  },
};

// ============================================================================
// RESEARCH ORCHESTRATOR
// ============================================================================

export interface ResearchOrchestratorConfig {
  sourceManager?: SourceManager;
  citationTracker?: CitationTracker;
  qualityScorer?: SourceQualityScorer;
  maxConcurrentPhases?: number;
  maxConcurrentSubQueries?: number;
  enableQueryDecomposition?: boolean;
  enableCrossReferencing?: boolean;
  defaultDepth?: ResearchQuery['depth'];
}

export class ResearchOrchestrator extends EventEmitter {
  private config: Required<ResearchOrchestratorConfig>;
  private activePlans: Map<string, ResearchPlan>;
  private planProgress: Map<string, ResearchProgress>;
  private planResults: Map<string, Partial<ResearchResult>>;

  constructor(config: ResearchOrchestratorConfig = {}) {
    super();

    this.config = {
      sourceManager: config.sourceManager ?? sourceManager,
      citationTracker: config.citationTracker ?? citationTracker,
      qualityScorer: config.qualityScorer ?? sourceQualityScorer,
      maxConcurrentPhases: config.maxConcurrentPhases ?? 3,
      maxConcurrentSubQueries: config.maxConcurrentSubQueries ?? 10,
      enableQueryDecomposition: config.enableQueryDecomposition ?? true,
      enableCrossReferencing: config.enableCrossReferencing ?? true,
      defaultDepth: config.defaultDepth ?? 'standard',
    };

    this.activePlans = new Map();
    this.planProgress = new Map();
    this.planResults = new Map();
  }

  // ============================================================================
  // MAIN RESEARCH FLOW
  // ============================================================================

  /**
   * Execute a research query
   */
  async research(query: ResearchQuery): Promise<ResearchResult> {
    const depth = query.depth ?? this.config.defaultDepth;
    const depthConfig = DEPTH_CONFIGS[depth];

    // Phase 1: Create research plan
    const plan = await this.createPlan(query, depthConfig);
    this.activePlans.set(plan.id, plan);

    // Initialize progress
    const progress: ResearchProgress = {
      planId: plan.id,
      phase: 'planning',
      completedSubQueries: 0,
      totalSubQueries: plan.subQueries.length,
      sourcesQueried: 0,
      resultsFound: 0,
      citationsAdded: 0,
      elapsedMs: 0,
      estimatedRemainingMs: plan.estimatedDuration,
      status: 'planning',
      errors: [],
    };
    this.planProgress.set(plan.id, progress);

    // Initialize result container
    const partialResult: Partial<ResearchResult> = {
      planId: plan.id,
      query,
      findings: [],
      citations: [],
      claims: [],
    };
    this.planResults.set(plan.id, partialResult);

    this.emit('research-started', { planId: plan.id, plan });

    const startTime = Date.now();

    try {
      // Phase 2: Execute research plan
      progress.status = 'executing';
      this.emitProgress(plan.id);

      await this.executePlan(plan, progress, partialResult, depthConfig);

      // Phase 3: Aggregate and finalize results
      progress.status = 'aggregating';
      this.emitProgress(plan.id);

      const result = await this.finalizeResults(plan, partialResult, startTime);

      progress.status = 'completed';
      progress.elapsedMs = Date.now() - startTime;
      progress.estimatedRemainingMs = 0;
      this.emitProgress(plan.id);

      this.emit('research-completed', { planId: plan.id, result });

      return result;
    } catch (error) {
      progress.status = 'failed';
      progress.errors.push({
        source: 'orchestrator',
        error: error instanceof Error ? error.message : String(error),
      });
      this.emitProgress(plan.id);

      this.emit('research-failed', { planId: plan.id, error });
      throw error;
    } finally {
      // Cleanup
      this.activePlans.delete(plan.id);
    }
  }

  /**
   * Stream research results as they come in
   */
  async *streamResearch(query: ResearchQuery): AsyncGenerator<{
    type: 'progress' | 'finding' | 'citation' | 'complete';
    data: ResearchProgress | Finding | Citation | ResearchResult;
  }> {
    const depth = query.depth ?? this.config.defaultDepth;
    const depthConfig = DEPTH_CONFIGS[depth];

    // Create plan
    const plan = await this.createPlan(query, depthConfig);
    this.activePlans.set(plan.id, plan);

    const progress: ResearchProgress = {
      planId: plan.id,
      phase: 'planning',
      completedSubQueries: 0,
      totalSubQueries: plan.subQueries.length,
      sourcesQueried: 0,
      resultsFound: 0,
      citationsAdded: 0,
      elapsedMs: 0,
      estimatedRemainingMs: plan.estimatedDuration,
      status: 'planning',
      errors: [],
    };
    this.planProgress.set(plan.id, progress);

    const partialResult: Partial<ResearchResult> = {
      planId: plan.id,
      query,
      findings: [],
      citations: [],
      claims: [],
    };
    this.planResults.set(plan.id, partialResult);

    yield { type: 'progress', data: progress };

    const startTime = Date.now();

    try {
      progress.status = 'executing';

      // Execute each phase and yield results
      for (const phase of plan.phases) {
        progress.phase = phase.name;
        yield { type: 'progress', data: { ...progress } };

        const phaseResults = await this.executePhase(plan, phase, depthConfig);

        for (const result of phaseResults.findings) {
          partialResult.findings!.push(result);
          yield { type: 'finding', data: result };
        }

        for (const citation of phaseResults.citations) {
          partialResult.citations!.push(citation);
          yield { type: 'citation', data: citation };
        }

        progress.completedSubQueries += phase.subQueryIds.length;
        progress.sourcesQueried += phaseResults.sourcesQueried;
        progress.resultsFound += phaseResults.resultsFound;
        progress.citationsAdded += phaseResults.citations.length;
        progress.elapsedMs = Date.now() - startTime;

        yield { type: 'progress', data: { ...progress } };
      }

      // Finalize
      progress.status = 'aggregating';
      yield { type: 'progress', data: { ...progress } };

      const result = await this.finalizeResults(plan, partialResult, startTime);

      progress.status = 'completed';
      yield { type: 'progress', data: { ...progress } };
      yield { type: 'complete', data: result };

    } finally {
      this.activePlans.delete(plan.id);
    }
  }

  /**
   * Get current progress for a research plan
   */
  getProgress(planId: string): ResearchProgress | undefined {
    return this.planProgress.get(planId);
  }

  /**
   * Cancel an active research plan
   */
  cancelResearch(planId: string): boolean {
    if (this.activePlans.has(planId)) {
      this.activePlans.delete(planId);
      const progress = this.planProgress.get(planId);
      if (progress) {
        progress.status = 'failed';
        progress.errors.push({ source: 'orchestrator', error: 'Cancelled by user' });
      }
      this.emit('research-cancelled', { planId });
      return true;
    }
    return false;
  }

  // ============================================================================
  // PLANNING
  // ============================================================================

  /**
   * Create a research plan from a query
   */
  private async createPlan(
    query: ResearchQuery,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): Promise<ResearchPlan> {
    const planId = this.generateId('plan');

    // Decompose query into sub-queries
    const subQueries = this.config.enableQueryDecomposition
      ? this.decomposeQuery(query, depthConfig)
      : [this.createMainSubQuery(query, depthConfig)];

    // Organize sub-queries into phases
    const phases = this.organizePhasess(subQueries);

    const plan: ResearchPlan = {
      id: planId,
      query,
      subQueries,
      phases,
      estimatedDuration: this.estimateDuration(phases, depthConfig),
      estimatedSources: depthConfig.maxSources,
      createdAt: new Date(),
    };

    this.emit('plan-created', plan);

    return plan;
  }

  /**
   * Decompose a complex query into focused sub-queries
   */
  private decomposeQuery(
    query: ResearchQuery,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): SubQuery[] {
    const subQueries: SubQuery[] = [];
    const maxSubQueries = depthConfig.maxSubQueries;

    // Main query always included
    subQueries.push({
      id: this.generateId('sq'),
      query: query.query,
      purpose: 'Main query',
      categories: this.selectCategories(query, depthConfig),
      priority: 10,
    });

    // Add context-aware sub-queries based on intent
    const intent = query.intent ?? this.inferIntent(query.query);

    switch (intent) {
      case 'factual':
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} facts statistics data`,
            purpose: 'Gather factual data',
            categories: ['academic', 'government'],
            priority: 8,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} studies research`,
            purpose: 'Find research studies',
            categories: ['academic'],
            priority: 7,
          });
        }
        break;

      case 'current_events':
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} latest news`,
            purpose: 'Find latest news',
            categories: ['news'],
            priority: 9,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} analysis opinion`,
            purpose: 'Find analysis and opinions',
            categories: ['news', 'social'],
            priority: 6,
          });
        }
        break;

      case 'technical':
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} documentation tutorial`,
            purpose: 'Find documentation',
            categories: ['technical'],
            priority: 9,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} examples implementation`,
            purpose: 'Find examples',
            categories: ['technical', 'social'],
            priority: 7,
          });
        }
        break;

      case 'academic':
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} peer reviewed journal`,
            purpose: 'Find peer-reviewed research',
            categories: ['academic'],
            priority: 10,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} review meta-analysis`,
            purpose: 'Find review articles',
            categories: ['academic'],
            priority: 8,
          });
        }
        break;

      case 'comparative':
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} comparison vs`,
            purpose: 'Find comparisons',
            categories: ['search_engine', 'technical'],
            priority: 8,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} pros cons advantages disadvantages`,
            purpose: 'Find pros and cons',
            categories: ['search_engine', 'social'],
            priority: 7,
          });
        }
        break;

      case 'analytical':
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} analysis deep dive`,
            purpose: 'Find in-depth analysis',
            categories: ['academic', 'news'],
            priority: 8,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} expert opinion perspective`,
            purpose: 'Find expert opinions',
            categories: ['news', 'academic'],
            priority: 7,
          });
        }
        break;

      default: // exploratory
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} overview introduction`,
            purpose: 'Get overview',
            categories: ['knowledge_base', 'search_engine'],
            priority: 8,
          });
        }
        if (subQueries.length < maxSubQueries) {
          subQueries.push({
            id: this.generateId('sq'),
            query: `${query.query} explained`,
            purpose: 'Find explanations',
            categories: ['search_engine', 'knowledge_base'],
            priority: 7,
          });
        }
    }

    // Add focus-specific sub-queries
    if (query.focus) {
      for (const focus of query.focus) {
        if (subQueries.length >= maxSubQueries) break;

        const focusCategories = this.focusToCategories(focus);
        subQueries.push({
          id: this.generateId('sq'),
          query: `${query.query} ${focus}`,
          purpose: `Focus: ${focus}`,
          categories: focusCategories,
          priority: 6,
        });
      }
    }

    return subQueries.slice(0, maxSubQueries);
  }

  private createMainSubQuery(
    query: ResearchQuery,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): SubQuery {
    return {
      id: this.generateId('sq'),
      query: query.query,
      purpose: 'Main query',
      categories: this.selectCategories(query, depthConfig),
      priority: 10,
    };
  }

  private organizePhasess(subQueries: SubQuery[]): ResearchPhase[] {
    // Group sub-queries by priority tiers for phased execution
    const highPriority = subQueries.filter(sq => sq.priority >= 8);
    const mediumPriority = subQueries.filter(sq => sq.priority >= 5 && sq.priority < 8);
    const lowPriority = subQueries.filter(sq => sq.priority < 5);

    const phases: ResearchPhase[] = [];

    if (highPriority.length > 0) {
      phases.push({
        id: this.generateId('phase'),
        name: 'Primary Research',
        subQueryIds: highPriority.map(sq => sq.id),
        parallel: true,
        timeout: 30000,
      });
    }

    if (mediumPriority.length > 0) {
      phases.push({
        id: this.generateId('phase'),
        name: 'Extended Research',
        subQueryIds: mediumPriority.map(sq => sq.id),
        parallel: true,
        timeout: 20000,
      });
    }

    if (lowPriority.length > 0) {
      phases.push({
        id: this.generateId('phase'),
        name: 'Supplementary Research',
        subQueryIds: lowPriority.map(sq => sq.id),
        parallel: true,
        timeout: 15000,
      });
    }

    return phases;
  }

  // ============================================================================
  // EXECUTION
  // ============================================================================

  /**
   * Execute the research plan
   */
  private async executePlan(
    plan: ResearchPlan,
    progress: ResearchProgress,
    partialResult: Partial<ResearchResult>,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): Promise<void> {
    const phaseStats: ResearchStatistics['phases'] = [];

    for (const phase of plan.phases) {
      progress.phase = phase.name;
      this.emitProgress(plan.id);

      const phaseStartTime = Date.now();
      const phaseResult = await this.executePhase(plan, phase, depthConfig);

      // Merge phase results
      partialResult.findings!.push(...phaseResult.findings);
      partialResult.citations!.push(...phaseResult.citations);
      partialResult.claims!.push(...phaseResult.claims);

      // Update progress
      progress.completedSubQueries += phase.subQueryIds.length;
      progress.sourcesQueried += phaseResult.sourcesQueried;
      progress.resultsFound += phaseResult.resultsFound;
      progress.citationsAdded += phaseResult.citations.length;
      progress.errors.push(...phaseResult.errors);

      phaseStats.push({
        name: phase.name,
        durationMs: Date.now() - phaseStartTime,
        sourcesQueried: phaseResult.sourcesQueried,
        resultsFound: phaseResult.resultsFound,
      });

      this.emitProgress(plan.id);
    }
  }

  /**
   * Execute a single research phase
   */
  private async executePhase(
    plan: ResearchPlan,
    phase: ResearchPhase,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): Promise<{
    findings: Finding[];
    citations: Citation[];
    claims: Claim[];
    sourcesQueried: number;
    resultsFound: number;
    errors: Array<{ source: string; error: string }>;
  }> {
    const subQueries = plan.subQueries.filter(sq => phase.subQueryIds.includes(sq.id));

    const findings: Finding[] = [];
    const citations: Citation[] = [];
    const claims: Claim[] = [];
    const errors: Array<{ source: string; error: string }> = [];
    let sourcesQueried = 0;
    let resultsFound = 0;

    // Execute sub-queries in parallel
    const subQueryResults = await Promise.allSettled(
      subQueries.map(sq => this.executeSubQuery(sq, plan.query, depthConfig))
    );

    for (let i = 0; i < subQueryResults.length; i++) {
      const result = subQueryResults[i];
      if (result.status === 'fulfilled') {
        findings.push(...result.value.findings);
        citations.push(...result.value.citations);
        claims.push(...result.value.claims);
        sourcesQueried += result.value.sourcesQueried;
        resultsFound += result.value.resultsFound;
      } else {
        errors.push({
          source: subQueries[i].id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    return { findings, citations, claims, sourcesQueried, resultsFound, errors };
  }

  /**
   * Execute a single sub-query
   */
  private async executeSubQuery(
    subQuery: SubQuery,
    researchQuery: ResearchQuery,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): Promise<{
    findings: Finding[];
    citations: Citation[];
    claims: Claim[];
    sourcesQueried: number;
    resultsFound: number;
  }> {
    const searchQuery: SearchQuery = {
      query: subQuery.query,
      filters: {
        dateRange: researchQuery.constraints?.dateRange,
        domains: researchQuery.constraints?.domains,
        excludeDomains: researchQuery.constraints?.excludeDomains,
        language: researchQuery.constraints?.languages?.[0],
      },
      limit: Math.ceil(depthConfig.maxSources / (depthConfig.maxSubQueries || 1)),
    };

    // Search sources
    const results = await this.config.sourceManager.getAggregatedResults(searchQuery, {
      categories: subQuery.categories,
      minPriority: 5,
    });

    // Filter by minimum quality
    const qualityResults = results.filter(r => r.qualityScore.overall >= depthConfig.minQuality);

    // Convert to findings and citations
    const findings: Finding[] = [];
    const citations: Citation[] = [];

    for (const result of qualityResults) {
      // Create citation
      const citation = await this.config.citationTracker.addCitation({
        url: result.url,
        title: result.title,
        author: result.author,
        publishedDate: result.publishedDate,
        snippet: result.snippet,
        claims: [],
      });
      citations.push(citation);

      // Create finding
      findings.push({
        id: this.generateId('finding'),
        content: result.snippet,
        type: this.classifyFindingType(result),
        confidence: result.qualityScore.confidence * (result.qualityScore.overall / 100),
        citations: [citation.id],
        subQuery: subQuery.id,
        relevanceScore: result.relevanceScore ?? 0.5,
      });
    }

    return {
      findings,
      citations,
      claims: [],
      sourcesQueried: results.length,
      resultsFound: qualityResults.length,
    };
  }

  // ============================================================================
  // FINALIZATION
  // ============================================================================

  /**
   * Finalize and aggregate research results
   */
  private async finalizeResults(
    plan: ResearchPlan,
    partialResult: Partial<ResearchResult>,
    startTime: number
  ): Promise<ResearchResult> {
    // Deduplicate findings
    const uniqueFindings = this.deduplicateFindings(partialResult.findings!);

    // Cross-reference citations if enabled
    if (this.config.enableCrossReferencing) {
      await this.config.citationTracker.crossReferenceCitations(
        partialResult.citations!.map(c => c.id)
      );
    }

    // Sort findings by confidence and relevance
    uniqueFindings.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + a.relevanceScore * 0.4;
      const scoreB = b.confidence * 0.6 + b.relevanceScore * 0.4;
      return scoreB - scoreA;
    });

    // Calculate statistics
    const stats = this.config.citationTracker.getStatistics();
    const avgQuality = partialResult.citations!.length > 0
      ? partialResult.citations!.reduce((sum, c) => sum + c.qualityScore.overall, 0) / partialResult.citations!.length
      : 0;

    const statistics: ResearchStatistics = {
      totalSources: plan.estimatedSources,
      sourcesSuccessful: partialResult.citations!.length,
      sourcesFailed: 0, // Would need to track this
      totalResults: partialResult.findings!.length,
      uniqueResults: uniqueFindings.length,
      citationsAdded: partialResult.citations!.length,
      claimsIdentified: partialResult.claims!.length,
      averageQualityScore: Math.round(avgQuality * 10) / 10,
      executionTimeMs: Date.now() - startTime,
      phases: [],
    };

    const result: ResearchResult = {
      planId: plan.id,
      query: plan.query,
      findings: uniqueFindings,
      citations: partialResult.citations!,
      claims: partialResult.claims!,
      statistics,
      completedAt: new Date(),
    };

    return result;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private inferIntent(query: string): ResearchIntent {
    const queryLower = query.toLowerCase();

    if (queryLower.includes('latest') || queryLower.includes('news') || queryLower.includes('recent')) {
      return 'current_events';
    }
    if (queryLower.includes('how to') || queryLower.includes('tutorial') || queryLower.includes('guide')) {
      return 'technical';
    }
    if (queryLower.includes('vs') || queryLower.includes('compare') || queryLower.includes('difference')) {
      return 'comparative';
    }
    if (queryLower.includes('study') || queryLower.includes('research') || queryLower.includes('paper')) {
      return 'academic';
    }
    if (queryLower.includes('why') || queryLower.includes('analysis') || queryLower.includes('impact')) {
      return 'analytical';
    }
    if (queryLower.includes('what is') || queryLower.includes('define') || queryLower.includes('fact')) {
      return 'factual';
    }

    return 'exploratory';
  }

  private selectCategories(
    query: ResearchQuery,
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): SourceCategory[] {
    if (query.focus) {
      return query.focus.flatMap(f => this.focusToCategories(f));
    }
    return depthConfig.categories;
  }

  private focusToCategories(focus: ResearchFocus): SourceCategory[] {
    const mapping: Record<ResearchFocus, SourceCategory[]> = {
      academic: ['academic'],
      news: ['news'],
      technical: ['technical'],
      financial: ['financial'],
      government: ['government'],
      social: ['social'],
      general: ['search_engine', 'knowledge_base'],
    };
    return mapping[focus] ?? ['search_engine'];
  }

  private classifyFindingType(result: SourceResult & { qualityScore: QualityScore }): Finding['type'] {
    // Simple heuristic classification
    const snippet = result.snippet.toLowerCase();

    if (snippet.match(/\d+%|\d+\.\d+|statistics|data|survey|study found/)) {
      return 'data';
    }
    if (snippet.includes('trend') || snippet.includes('growing') || snippet.includes('increasing')) {
      return 'trend';
    }
    if (snippet.includes('believe') || snippet.includes('opinion') || snippet.includes('think')) {
      return 'opinion';
    }
    if (snippet.includes('analysis') || snippet.includes('insight') || snippet.includes('understanding')) {
      return 'insight';
    }

    return 'fact';
  }

  private deduplicateFindings(findings: Finding[]): Finding[] {
    const seen = new Set<string>();
    const unique: Finding[] = [];

    for (const finding of findings) {
      // Create a normalized key based on content
      const key = finding.content
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 100);

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(finding);
      } else {
        // Merge citations from duplicate findings
        const existing = unique.find(f =>
          f.content.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 100) === key
        );
        if (existing) {
          for (const citId of finding.citations) {
            if (!existing.citations.includes(citId)) {
              existing.citations.push(citId);
            }
          }
          // Update confidence if the duplicate has higher confidence
          existing.confidence = Math.max(existing.confidence, finding.confidence);
        }
      }
    }

    return unique;
  }

  private estimateDuration(
    phases: ResearchPhase[],
    depthConfig: typeof DEPTH_CONFIGS[keyof typeof DEPTH_CONFIGS]
  ): number {
    // Estimate based on phase timeouts and parallel execution
    return phases.reduce((total, phase) => total + phase.timeout, 0);
  }

  private emitProgress(planId: string): void {
    const progress = this.planProgress.get(planId);
    if (progress) {
      this.emit('progress', progress);
    }
  }
}

// Export singleton instance
export const researchOrchestrator = new ResearchOrchestrator();
