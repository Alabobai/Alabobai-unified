/**
 * Alabobai Deep Research Engine
 *
 * A comprehensive research system designed to beat Perplexity's 91.3% citation accuracy.
 *
 * Features:
 * - 50+ source management with quality scoring
 * - Parallel research orchestration
 * - Citation tracking with cross-reference validation
 * - Confidence scoring for each claim
 * - Professional report generation
 *
 * @example
 * ```typescript
 * import { deepResearchEngine } from '@alabobai/core/research';
 *
 * // Simple research
 * const result = await deepResearchEngine.research({
 *   query: 'What are the latest developments in quantum computing?',
 *   depth: 'deep',
 * });
 *
 * // Access findings with confidence scores
 * for (const claim of result.claims) {
 *   console.log(`${claim.claim} (Confidence: ${claim.confidence})`);
 * }
 *
 * // Get the full report
 * console.log(result.report.content);
 * ```
 */

// Main Engine
export {
  DeepResearchEngine,
  createDeepResearchEngine,
  deepResearchEngine,
  type DeepResearchQuery,
  type DeepResearchResult,
  type ClaimWithConfidence,
  type DeepResearchStatistics,
  type AccuracyMetrics,
  type ResearchEventData,
  type DeepResearchEngineConfig,
} from './DeepResearchEngine.js';

// Source Manager
export {
  SourceManager,
  sourceManager,
  type SourceConfig,
  type SourceResult,
  type SearchQuery,
  type SourceCategory,
  type SearchAdapter,
  type SourceHealth,
  type SourceStats,
  type SourceCapability,
  type SourceManagerConfig,
} from './SourceManager.js';

// Citation Tracker
export {
  CitationTracker,
  citationTracker,
  type Citation,
  type Claim as ResearchClaim,
  type VerificationStatus as CitationVerificationStatus,
  type CitationStatistics,
  type Evidence,
  type CrossReferenceResult,
  type CitationTrackerConfig,
} from './CitationTracker.js';

// Source Quality Scorer
export {
  SourceQualityScorer,
  sourceQualityScorer,
  type QualityScore,
  type SourceMetadata,
  type SourceType,
  type DomainReputation,
  type QualityFactor,
  type SourceQualityScorerConfig,
} from './SourceQualityScorer.js';

// Research Orchestrator
export {
  ResearchOrchestrator,
  researchOrchestrator,
  type ResearchQuery,
  type ResearchResult,
  type ResearchProgress,
  type ResearchPlan,
  type Finding,
  type ResearchIntent,
  type ResearchFocus,
  type ResearchConstraints,
  type SubQuery,
  type ResearchPhase,
  type ResearchStatistics,
  type ResearchOrchestratorConfig,
} from './ResearchOrchestrator.js';

// Report Generator
export {
  ReportGenerator,
  reportGenerator,
  type Report,
  type ReportOptions,
  type ReportFormat,
  type ReportStyle,
  type ReportSection,
  type SectionType,
  type ReportMetadata,
  type FormattedCitation,
  type ReportGeneratorConfig,
} from './ReportGenerator.js';
