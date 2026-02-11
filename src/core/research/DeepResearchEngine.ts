/**
 * Alabobai Deep Research Engine
 *
 * The main research engine that orchestrates all components to provide
 * comprehensive, citation-backed research results.
 *
 * Features:
 * - Multi-source parallel research (50+ sources)
 * - Quality-based source ranking
 * - Cross-reference validation
 * - Confidence scoring for each claim
 * - Structured report generation
 *
 * Target: Beat Perplexity's 91.3% citation accuracy
 */

import { EventEmitter } from 'events';

// Import all components
import {
  SourceManager,
  sourceManager,
  SourceConfig,
  SourceResult,
  SearchQuery,
  SourceCategory,
  SearchAdapter,
} from './SourceManager.js';

import {
  CitationTracker,
  citationTracker,
  Citation,
  Claim,
  VerificationStatus,
  CitationStatistics,
} from './CitationTracker.js';

import {
  SourceQualityScorer,
  sourceQualityScorer,
  QualityScore,
  SourceMetadata,
  SourceType,
  DomainReputation,
} from './SourceQualityScorer.js';

import {
  ResearchOrchestrator,
  researchOrchestrator,
  ResearchQuery,
  ResearchResult,
  ResearchProgress,
  ResearchPlan,
  Finding,
  ResearchIntent,
  ResearchFocus,
} from './ResearchOrchestrator.js';

import {
  ReportGenerator,
  reportGenerator,
  Report,
  ReportOptions,
  ReportFormat,
  ReportStyle,
} from './ReportGenerator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DeepResearchQuery {
  query: string;
  context?: string;
  intent?: ResearchIntent;
  depth?: 'quick' | 'standard' | 'deep' | 'exhaustive';
  focus?: ResearchFocus[];
  constraints?: {
    dateRange?: { start: Date; end: Date };
    domains?: string[];
    excludeDomains?: string[];
    languages?: string[];
    minQualityScore?: number;
    maxResults?: number;
    timeout?: number;
  };
  reportOptions?: ReportOptions;
}

export interface DeepResearchResult {
  query: DeepResearchQuery;
  findings: Finding[];
  citations: Citation[];
  claims: ClaimWithConfidence[];
  report: Report;
  statistics: DeepResearchStatistics;
  accuracy: AccuracyMetrics;
  completedAt: Date;
}

export interface ClaimWithConfidence {
  claim: string;
  confidence: number;
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  supportingCitations: string[];
  verificationStatus: VerificationStatus;
  crossReferences: number;
}

export interface DeepResearchStatistics {
  totalSources: number;
  sourcesQueried: number;
  sourcesSuccessful: number;
  totalResults: number;
  uniqueFindings: number;
  citationsAdded: number;
  claimsVerified: number;
  averageQualityScore: number;
  averageConfidence: number;
  executionTimeMs: number;
  phases: Array<{
    name: string;
    durationMs: number;
    sourcesQueried: number;
  }>;
}

export interface AccuracyMetrics {
  citationAccuracy: number;        // Target: > 91.3%
  verificationRate: number;
  crossReferenceRate: number;
  qualityDistribution: {
    excellent: number;
    good: number;
    moderate: number;
    low: number;
  };
  confidenceDistribution: {
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
    veryLow: number;
  };
}

export interface ResearchEventData {
  type: 'started' | 'progress' | 'finding' | 'citation' | 'claim' | 'report' | 'completed' | 'error';
  data: unknown;
  timestamp: Date;
}

// ============================================================================
// DEEP RESEARCH ENGINE
// ============================================================================

export interface DeepResearchEngineConfig {
  sourceManager?: SourceManager;
  citationTracker?: CitationTracker;
  qualityScorer?: SourceQualityScorer;
  orchestrator?: ResearchOrchestrator;
  reportGenerator?: ReportGenerator;
  defaultDepth?: DeepResearchQuery['depth'];
  targetAccuracy?: number;
  enableStreaming?: boolean;
  minConfidenceThreshold?: number;
  maxConcurrentResearch?: number;
}

export class DeepResearchEngine extends EventEmitter {
  private config: Required<DeepResearchEngineConfig>;
  private activeResearch: Map<string, DeepResearchQuery>;
  private researchHistory: Map<string, DeepResearchResult>;

  // Component instances
  private sources: SourceManager;
  private citations: CitationTracker;
  private scorer: SourceQualityScorer;
  private orchestrator: ResearchOrchestrator;
  private reporter: ReportGenerator;

  constructor(config: DeepResearchEngineConfig = {}) {
    super();

    this.config = {
      sourceManager: config.sourceManager ?? sourceManager,
      citationTracker: config.citationTracker ?? citationTracker,
      qualityScorer: config.qualityScorer ?? sourceQualityScorer,
      orchestrator: config.orchestrator ?? researchOrchestrator,
      reportGenerator: config.reportGenerator ?? reportGenerator,
      defaultDepth: config.defaultDepth ?? 'standard',
      targetAccuracy: config.targetAccuracy ?? 0.92, // Target > 91.3%
      enableStreaming: config.enableStreaming ?? true,
      minConfidenceThreshold: config.minConfidenceThreshold ?? 0.3,
      maxConcurrentResearch: config.maxConcurrentResearch ?? 5,
    };

    // Set component references
    this.sources = this.config.sourceManager;
    this.citations = this.config.citationTracker;
    this.scorer = this.config.qualityScorer;
    this.orchestrator = this.config.orchestrator;
    this.reporter = this.config.reportGenerator;

    this.activeResearch = new Map();
    this.researchHistory = new Map();

    // Setup event forwarding
    this.setupEventForwarding();
  }

  // ============================================================================
  // MAIN RESEARCH API
  // ============================================================================

  /**
   * Execute deep research on a query
   */
  async research(query: DeepResearchQuery): Promise<DeepResearchResult> {
    const researchId = this.generateId('research');

    if (this.activeResearch.size >= this.config.maxConcurrentResearch) {
      throw new Error(`Maximum concurrent research limit (${this.config.maxConcurrentResearch}) reached`);
    }

    this.activeResearch.set(researchId, query);

    this.emitEvent('started', { researchId, query });

    try {
      // Clear previous citation data for fresh research
      this.citations.clear();

      // Step 1: Execute research orchestration
      const researchQuery: ResearchQuery = {
        query: query.query,
        context: query.context,
        intent: query.intent,
        depth: query.depth ?? this.config.defaultDepth,
        focus: query.focus,
        constraints: query.constraints,
      };

      const orchestrationResult = await this.orchestrator.research(researchQuery);

      // Step 2: Extract and verify claims
      const claimsWithConfidence = await this.extractAndVerifyClaims(orchestrationResult);

      // Step 3: Calculate accuracy metrics
      const accuracy = this.calculateAccuracyMetrics(orchestrationResult, claimsWithConfidence);

      // Step 4: Generate comprehensive report
      const reportOptions: ReportOptions = {
        format: query.reportOptions?.format ?? 'markdown',
        style: query.reportOptions?.style ?? 'detailed',
        includeExecutiveSummary: true,
        includeConfidenceScores: true,
        includeCitationAnalysis: true,
        includeSourceBreakdown: true,
        includeMethodology: query.depth === 'deep' || query.depth === 'exhaustive',
        ...query.reportOptions,
      };

      const report = await this.reporter.generateReport(orchestrationResult, reportOptions);

      // Step 5: Compile final result
      const statistics = this.compileStatistics(orchestrationResult, accuracy);

      const result: DeepResearchResult = {
        query,
        findings: orchestrationResult.findings,
        citations: orchestrationResult.citations,
        claims: claimsWithConfidence,
        report,
        statistics,
        accuracy,
        completedAt: new Date(),
      };

      // Store in history
      this.researchHistory.set(researchId, result);

      this.emitEvent('completed', { researchId, result });

      return result;
    } catch (error) {
      this.emitEvent('error', { researchId, error });
      throw error;
    } finally {
      this.activeResearch.delete(researchId);
    }
  }

  /**
   * Stream research results as they come in
   */
  async *streamResearch(query: DeepResearchQuery): AsyncGenerator<ResearchEventData> {
    const researchId = this.generateId('research');

    this.activeResearch.set(researchId, query);

    yield {
      type: 'started',
      data: { researchId, query },
      timestamp: new Date(),
    };

    try {
      // Clear previous citation data
      this.citations.clear();

      const researchQuery: ResearchQuery = {
        query: query.query,
        context: query.context,
        intent: query.intent,
        depth: query.depth ?? this.config.defaultDepth,
        focus: query.focus,
        constraints: query.constraints,
        streaming: true,
      };

      // Stream from orchestrator
      for await (const event of this.orchestrator.streamResearch(researchQuery)) {
        if (event.type === 'progress') {
          yield {
            type: 'progress',
            data: event.data,
            timestamp: new Date(),
          };
        } else if (event.type === 'finding') {
          yield {
            type: 'finding',
            data: event.data,
            timestamp: new Date(),
          };
        } else if (event.type === 'citation') {
          yield {
            type: 'citation',
            data: event.data,
            timestamp: new Date(),
          };
        } else if (event.type === 'complete') {
          // Generate final report
          const orchestrationResult = event.data as ResearchResult;
          const claimsWithConfidence = await this.extractAndVerifyClaims(orchestrationResult);

          for (const claim of claimsWithConfidence) {
            yield {
              type: 'claim',
              data: claim,
              timestamp: new Date(),
            };
          }

          const report = await this.reporter.generateReport(orchestrationResult, {
            format: query.reportOptions?.format ?? 'markdown',
            style: query.reportOptions?.style ?? 'detailed',
            includeConfidenceScores: true,
            ...query.reportOptions,
          });

          yield {
            type: 'report',
            data: report,
            timestamp: new Date(),
          };

          const accuracy = this.calculateAccuracyMetrics(orchestrationResult, claimsWithConfidence);
          const statistics = this.compileStatistics(orchestrationResult, accuracy);

          const result: DeepResearchResult = {
            query,
            findings: orchestrationResult.findings,
            citations: orchestrationResult.citations,
            claims: claimsWithConfidence,
            report,
            statistics,
            accuracy,
            completedAt: new Date(),
          };

          yield {
            type: 'completed',
            data: result,
            timestamp: new Date(),
          };
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      };
      throw error;
    } finally {
      this.activeResearch.delete(researchId);
    }
  }

  /**
   * Quick research - fast results with basic verification
   */
  async quickResearch(query: string): Promise<{
    summary: string;
    findings: Finding[];
    topCitations: Citation[];
  }> {
    const result = await this.research({
      query,
      depth: 'quick',
      reportOptions: {
        style: 'executive',
        format: 'markdown',
      },
    });

    return {
      summary: this.reporter.generateQuickSummary({
        query: { query },
        findings: result.findings,
        citations: result.citations,
        claims: [],
        statistics: result.statistics as any,
        completedAt: result.completedAt,
        planId: '',
      }),
      findings: result.findings.slice(0, 10),
      topCitations: this.citations.getTopCitations(5),
    };
  }

  // ============================================================================
  // CLAIM EXTRACTION AND VERIFICATION
  // ============================================================================

  /**
   * Extract claims from findings and verify them
   */
  private async extractAndVerifyClaims(result: ResearchResult): Promise<ClaimWithConfidence[]> {
    const claimsWithConfidence: ClaimWithConfidence[] = [];

    // Group findings by content similarity to identify distinct claims
    const distinctClaims = this.groupSimilarFindings(result.findings);

    for (const [claimText, findings] of distinctClaims) {
      // Gather all citations supporting this claim
      const allCitationIds = new Set<string>();
      for (const finding of findings) {
        for (const citId of finding.citations) {
          allCitationIds.add(citId);
        }
      }

      const citationIds = Array.from(allCitationIds);

      // Register the claim with the citation tracker
      const claim = await this.citations.registerClaim(claimText, citationIds);

      // Verify the claim
      const verifiedClaim = await this.citations.verifyClaim(claimText);

      // Calculate aggregate confidence
      const avgFindingConfidence = findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;
      const citationConfidence = this.calculateCitationConfidence(citationIds);
      const crossRefBonus = verifiedClaim.supportingEvidence.length > 1 ? 0.1 : 0;

      const finalConfidence = Math.min(1,
        avgFindingConfidence * 0.4 +
        citationConfidence * 0.4 +
        (verifiedClaim.confidence * 0.2) +
        crossRefBonus
      );

      claimsWithConfidence.push({
        claim: claimText,
        confidence: finalConfidence,
        confidenceLevel: this.getConfidenceLevel(finalConfidence),
        supportingCitations: citationIds,
        verificationStatus: verifiedClaim.verificationStatus,
        crossReferences: verifiedClaim.supportingEvidence.length,
      });
    }

    // Sort by confidence
    claimsWithConfidence.sort((a, b) => b.confidence - a.confidence);

    return claimsWithConfidence;
  }

  /**
   * Group similar findings to identify distinct claims
   */
  private groupSimilarFindings(findings: Finding[]): Map<string, Finding[]> {
    const groups = new Map<string, Finding[]>();

    for (const finding of findings) {
      // Normalize the finding content for comparison
      const normalized = finding.content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

      // Check if similar claim exists
      let foundGroup = false;
      for (const [key, group] of groups) {
        if (this.calculateTextSimilarity(normalized, key) > 0.7) {
          group.push(finding);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.set(normalized, [finding]);
      }
    }

    // Convert keys back to original content (use first finding's content)
    const result = new Map<string, Finding[]>();
    for (const [, findings] of groups) {
      const bestFinding = findings.reduce((best, f) =>
        f.confidence > best.confidence ? f : best
      );
      result.set(bestFinding.content, findings);
    }

    return result;
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  private calculateTextSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }

  /**
   * Calculate confidence based on citation quality
   */
  private calculateCitationConfidence(citationIds: string[]): number {
    if (citationIds.length === 0) return 0;

    let totalWeight = 0;
    let weightedScore = 0;

    for (const citId of citationIds) {
      const citation = this.citations.getCitation(citId);
      if (citation) {
        const weight = citation.qualityScore.overall / 100;
        totalWeight += weight;

        // Verified citations get full score, partial get 70%, unverified get 50%
        let verificationMultiplier = 0.5;
        if (citation.verificationStatus === 'verified') {
          verificationMultiplier = 1.0;
        } else if (citation.verificationStatus === 'partially') {
          verificationMultiplier = 0.7;
        }

        weightedScore += weight * verificationMultiplier;
      }
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * Get confidence level label
   */
  private getConfidenceLevel(confidence: number): ClaimWithConfidence['confidenceLevel'] {
    if (confidence >= 0.85) return 'very_high';
    if (confidence >= 0.70) return 'high';
    if (confidence >= 0.50) return 'medium';
    if (confidence >= 0.30) return 'low';
    return 'very_low';
  }

  // ============================================================================
  // METRICS CALCULATION
  // ============================================================================

  /**
   * Calculate accuracy metrics
   */
  private calculateAccuracyMetrics(
    result: ResearchResult,
    claims: ClaimWithConfidence[]
  ): AccuracyMetrics {
    const citationStats = this.citations.getStatistics();

    // Citation accuracy: weighted by quality and verification
    const citationAccuracy = this.citations.getCitationAccuracy();

    // Verification rate
    const verifiedClaims = claims.filter(c =>
      c.verificationStatus === 'verified' || c.verificationStatus === 'partially'
    ).length;
    const verificationRate = claims.length > 0 ? verifiedClaims / claims.length : 0;

    // Cross-reference rate
    const crossRefClaims = claims.filter(c => c.crossReferences > 0).length;
    const crossReferenceRate = claims.length > 0 ? crossRefClaims / claims.length : 0;

    // Quality distribution
    const qualityDistribution = {
      excellent: 0,
      good: 0,
      moderate: 0,
      low: 0,
    };

    for (const citation of result.citations) {
      const score = citation.qualityScore.overall;
      if (score >= 80) qualityDistribution.excellent++;
      else if (score >= 60) qualityDistribution.good++;
      else if (score >= 40) qualityDistribution.moderate++;
      else qualityDistribution.low++;
    }

    // Confidence distribution
    const confidenceDistribution = {
      veryHigh: 0,
      high: 0,
      medium: 0,
      low: 0,
      veryLow: 0,
    };

    for (const claim of claims) {
      switch (claim.confidenceLevel) {
        case 'very_high': confidenceDistribution.veryHigh++; break;
        case 'high': confidenceDistribution.high++; break;
        case 'medium': confidenceDistribution.medium++; break;
        case 'low': confidenceDistribution.low++; break;
        case 'very_low': confidenceDistribution.veryLow++; break;
      }
    }

    return {
      citationAccuracy: Math.round(citationAccuracy * 10) / 10,
      verificationRate: Math.round(verificationRate * 100) / 100,
      crossReferenceRate: Math.round(crossReferenceRate * 100) / 100,
      qualityDistribution,
      confidenceDistribution,
    };
  }

  /**
   * Compile comprehensive statistics
   */
  private compileStatistics(
    result: ResearchResult,
    accuracy: AccuracyMetrics
  ): DeepResearchStatistics {
    const avgConfidence = result.findings.length > 0
      ? result.findings.reduce((sum, f) => sum + f.confidence, 0) / result.findings.length
      : 0;

    return {
      totalSources: result.statistics.totalSources,
      sourcesQueried: result.statistics.totalSources,
      sourcesSuccessful: result.statistics.sourcesSuccessful,
      totalResults: result.statistics.totalResults,
      uniqueFindings: result.statistics.uniqueResults,
      citationsAdded: result.statistics.citationsAdded,
      claimsVerified: result.statistics.claimsIdentified,
      averageQualityScore: result.statistics.averageQualityScore,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      executionTimeMs: result.statistics.executionTimeMs,
      phases: result.statistics.phases,
    };
  }

  // ============================================================================
  // SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Register a custom search adapter for a source
   */
  registerSearchAdapter(sourceId: string, adapter: SearchAdapter): void {
    this.sources.registerAdapter(sourceId, adapter);
  }

  /**
   * Add a custom source configuration
   */
  addSource(config: SourceConfig): void {
    this.sources.registerSource(config);
  }

  /**
   * Add a custom domain reputation
   */
  addDomainReputation(reputation: DomainReputation): void {
    this.scorer.addDomainReputation(reputation);
  }

  /**
   * Get all available sources
   */
  getSources(): SourceConfig[] {
    return this.sources.getAllSources();
  }

  /**
   * Get source health status
   */
  getSourceHealth(): Array<{ sourceId: string; isHealthy: boolean; latencyMs: number }> {
    return this.sources.getAllHealthStatus().map(h => ({
      sourceId: h.sourceId,
      isHealthy: h.isHealthy,
      latencyMs: h.latencyMs,
    }));
  }

  // ============================================================================
  // RESEARCH MANAGEMENT
  // ============================================================================

  /**
   * Get active research queries
   */
  getActiveResearch(): Map<string, DeepResearchQuery> {
    return new Map(this.activeResearch);
  }

  /**
   * Get research history
   */
  getResearchHistory(limit: number = 10): DeepResearchResult[] {
    return Array.from(this.researchHistory.values())
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get a specific research result by ID
   */
  getResearchResult(researchId: string): DeepResearchResult | undefined {
    return this.researchHistory.get(researchId);
  }

  /**
   * Clear research history
   */
  clearHistory(): void {
    this.researchHistory.clear();
  }

  // ============================================================================
  // STATISTICS & METRICS
  // ============================================================================

  /**
   * Get overall engine statistics
   */
  getEngineStats(): {
    totalResearchCompleted: number;
    averageAccuracy: number;
    averageExecutionTime: number;
    sourcesAvailable: number;
    healthySources: number;
  } {
    const history = Array.from(this.researchHistory.values());

    const avgAccuracy = history.length > 0
      ? history.reduce((sum, r) => sum + r.accuracy.citationAccuracy, 0) / history.length
      : 0;

    const avgTime = history.length > 0
      ? history.reduce((sum, r) => sum + r.statistics.executionTimeMs, 0) / history.length
      : 0;

    const sourceStats = this.sources.getAggregateStats();

    return {
      totalResearchCompleted: history.length,
      averageAccuracy: Math.round(avgAccuracy * 10) / 10,
      averageExecutionTime: Math.round(avgTime),
      sourcesAvailable: sourceStats.totalSources,
      healthySources: sourceStats.healthySources,
    };
  }

  /**
   * Check if accuracy target is being met
   */
  isAccuracyTargetMet(): boolean {
    const history = Array.from(this.researchHistory.values());
    if (history.length === 0) return true;

    const avgAccuracy = history.reduce((sum, r) => sum + r.accuracy.citationAccuracy, 0) / history.length;
    return avgAccuracy >= this.config.targetAccuracy * 100;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Shutdown the engine and cleanup resources
   */
  shutdown(): void {
    this.sources.shutdown();
    this.citations.clear();
    this.activeResearch.clear();
    this.emit('shutdown');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private emitEvent(type: ResearchEventData['type'], data: unknown): void {
    const event: ResearchEventData = {
      type,
      data,
      timestamp: new Date(),
    };
    this.emit('event', event);
    this.emit(type, data);
  }

  private setupEventForwarding(): void {
    // Forward events from orchestrator
    this.orchestrator.on('progress', (progress) => {
      this.emit('progress', progress);
    });

    this.orchestrator.on('research-started', (data) => {
      this.emit('orchestrator:started', data);
    });

    this.orchestrator.on('research-completed', (data) => {
      this.emit('orchestrator:completed', data);
    });

    // Forward events from citation tracker
    this.citations.on('citation-added', (citation) => {
      this.emit('citation:added', citation);
    });

    this.citations.on('claim-verified', (claim) => {
      this.emit('claim:verified', claim);
    });

    // Forward events from source manager
    this.sources.on('source-error', (data) => {
      this.emit('source:error', data);
    });

    this.sources.on('rate-limited', (data) => {
      this.emit('source:rate-limited', data);
    });
  }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

/**
 * Create a new Deep Research Engine instance
 */
export function createDeepResearchEngine(config?: DeepResearchEngineConfig): DeepResearchEngine {
  return new DeepResearchEngine(config);
}

/**
 * Default singleton instance
 */
export const deepResearchEngine = new DeepResearchEngine();

// ============================================================================
// RE-EXPORTS
// ============================================================================

export {
  // Source Manager
  SourceManager,
  sourceManager,
  SourceConfig,
  SourceResult,
  SearchQuery,
  SourceCategory,
  SearchAdapter,

  // Citation Tracker
  CitationTracker,
  citationTracker,
  Citation,
  Claim,
  VerificationStatus,
  CitationStatistics,

  // Source Quality Scorer
  SourceQualityScorer,
  sourceQualityScorer,
  QualityScore,
  SourceMetadata,
  SourceType,
  DomainReputation,

  // Research Orchestrator
  ResearchOrchestrator,
  researchOrchestrator,
  ResearchQuery,
  ResearchResult,
  ResearchProgress,
  ResearchPlan,
  Finding,
  ResearchIntent,
  ResearchFocus,

  // Report Generator
  ReportGenerator,
  reportGenerator,
  Report,
  ReportOptions,
  ReportFormat,
  ReportStyle,
};
