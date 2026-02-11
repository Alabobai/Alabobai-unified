/**
 * Alabobai Reliability Engine
 *
 * A comprehensive reliability layer for AI applications that solves:
 * - ChatGPT "loading for 1 hour" -> TimeoutProtector (60-second guarantee with auto-fallback)
 * - Claude "inconsistent bugs" -> ConsistencyManager (model pinning, reproducible results)
 * - Perplexity "hallucinations" -> FactChecker + ConfidenceScorer (source verification)
 *
 * Source Quality Ranking:
 * - ACADEMIC (100): Peer-reviewed journals, academic papers
 * - GOVERNMENT (95): Official government sources
 * - SCIENTIFIC (90): Scientific institutions (NASA, NIH, etc.)
 * - PRIMARY_NEWS (80): Major news outlets (NYT, BBC, Reuters)
 * - PROFESSIONAL (75): Professional organizations, official docs
 * - SECONDARY_NEWS (65): Regional/smaller news outlets
 * - WIKI_VERIFIED (60): Wikipedia with citations
 * - CORPORATE (55): Company websites, press releases
 * - BLOG_EXPERT (50): Expert blogs with credentials
 * - SOCIAL_VERIFIED (40): Verified social accounts
 * - FORUM_EXPERT (35): Stack Overflow, expert forums
 * - WIKI_UNVERIFIED (30): Wikipedia without citations
 * - BLOG_GENERAL (25): General blogs
 * - FORUM_GENERAL (20): Reddit, general forums
 * - SOCIAL_GENERAL (15): Unverified social media
 * - UNKNOWN (10): Unknown or unverifiable source
 * - AI_GENERATED (5): Known AI-generated content
 *
 * @example
 * ```typescript
 * import { createReliabilityEngine } from './reliability';
 *
 * const engine = await createReliabilityEngine({
 *   globalSettings: {
 *     enabled: true,
 *     strictMode: false,
 *     minConfidenceThreshold: 50,
 *   }
 * });
 *
 * const response = await engine.executeReliable(
 *   'session-123',
 *   'What is the capital of France?',
 *   () => llm.chat('What is the capital of France?'),
 *   { domain: 'geography' }
 * );
 *
 * console.log(response.confidence.overall); // 0-100
 * console.log(response.confidence.grade);   // A, B, C, D, F
 * console.log(response.warnings);           // Any reliability warnings
 * ```
 */

// Main orchestrator
export {
  ReliabilityEngine,
  createReliabilityEngine,
  type ReliabilityEngineConfig,
  type ReliableRequest,
  type ReliableResponse,
  type ReliabilityReport,
} from './ReliabilityEngine.js';

// Confidence Scorer
export {
  ConfidenceScorer,
  createConfidenceScorer,
  SourceQuality,
  type SourceInfo,
  type ConfidenceScore,
  type ConfidenceFactors,
  type ScoringConfig,
} from './ConfidenceScorer.js';

// Checkpoint Manager
export {
  CheckpointManager,
  createCheckpointManager,
  type Checkpoint,
  type CheckpointState,
  type CheckpointConfig,
  type ConversationSnapshot,
  type TaskSnapshot,
  type AgentSnapshot,
  type MemorySnapshot,
  type CheckpointMetadata,
  type RestoreOptions,
} from './CheckpointManager.js';

// Fact Checker
export {
  FactChecker,
  createFactChecker,
  type Claim,
  type ClaimType,
  type VerificationResult,
  type VerificationStatus,
  type VerifiedSource,
  type Contradiction,
  type FactCheckReport,
  type FactCheckerConfig,
} from './FactChecker.js';

// Consistency Manager
export {
  ConsistencyManager,
  createConsistencyManager,
  type ModelVersion,
  type ModelCapabilities,
  type ConsistencyConfig,
  type ConsistencyProfile,
  type ExecutionRecord,
  type ConsistencyCheck,
  type DriftAnalysis,
  type DriftFactor,
  type ConsistencyManagerConfig,
} from './ConsistencyManager.js';

// Timeout Protector
export {
  TimeoutProtector,
  createTimeoutProtector,
  CachedResponseFallback,
  GracefulDegradationFallback,
  type TimeoutConfig,
  type ExecutionContext,
  type ExecutionStatus,
  type FallbackProvider,
  type TimeoutEvent,
  type ExecutionResult,
} from './TimeoutProtector.js';
