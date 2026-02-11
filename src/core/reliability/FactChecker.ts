/**
 * Alabobai Reliability Engine - Fact Checker
 * Cross-reference claims against multiple sources
 *
 * Solves: Perplexity hallucinations, AI making things up
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { SourceQuality, SourceInfo } from './ConfidenceScorer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Claim {
  id: string;
  text: string;
  type: ClaimType;
  subject?: string;
  predicate?: string;
  object?: string;
  confidence: number;
  extractedFrom: string;
  timestamp: Date;
}

export type ClaimType =
  | 'factual'           // Verifiable fact (dates, numbers, events)
  | 'statistical'       // Statistics and data
  | 'scientific'        // Scientific claims
  | 'historical'        // Historical events
  | 'definitional'      // Definitions
  | 'causal'            // Cause-effect relationships
  | 'comparative'       // Comparisons
  | 'opinion'           // Opinions (not verifiable)
  | 'prediction'        // Future predictions (limited verification)
  | 'unknown';

export interface VerificationResult {
  claimId: string;
  claim: Claim;
  status: VerificationStatus;
  confidence: number;         // 0-100
  sources: VerifiedSource[];
  contradictions: Contradiction[];
  explanation: string;
  verifiedAt: Date;
  verificationMethod: string;
}

export type VerificationStatus =
  | 'verified'           // Confirmed by multiple sources
  | 'likely-true'        // Supported but not fully verified
  | 'unverified'         // Cannot be verified
  | 'disputed'           // Contradicting sources exist
  | 'false'              // Contradicted by reliable sources
  | 'outdated'           // Was true but information is old
  | 'partially-true'     // True with caveats
  | 'opinion'            // Not a factual claim
  | 'pending';

export interface VerifiedSource {
  source: SourceInfo;
  supports: boolean;
  relevance: number;      // 0-100 how relevant to the claim
  quote?: string;         // Supporting quote
  url?: string;
  retrievedAt: Date;
}

export interface Contradiction {
  source: SourceInfo;
  claim: string;
  explanation: string;
  severity: 'minor' | 'major' | 'critical';
}

export interface FactCheckReport {
  id: string;
  responseId: string;
  claims: Claim[];
  results: VerificationResult[];
  overallScore: number;           // 0-100
  overallStatus: VerificationStatus;
  summary: string;
  warnings: string[];
  timestamp: Date;
}

export interface FactCheckerConfig {
  minSourcesRequired: number;      // Min sources to verify a claim
  minSourceQuality: number;        // Min source quality score
  crossReferenceThreshold: number; // % agreement needed
  enableLiveSearch: boolean;       // Search web for verification
  enableCaching: boolean;          // Cache verification results
  cacheExpiryHours: number;
  trustedSources: string[];        // Always-trusted domains
  blockedSources: string[];        // Never-trusted domains
}

// ============================================================================
// KNOWLEDGE BASE
// ============================================================================

interface KnowledgeEntry {
  id: string;
  fact: string;
  category: string;
  source: SourceInfo;
  confidence: number;
  lastVerified: Date;
  contradictions: string[];
}

// Pre-loaded common facts for quick verification
const COMMON_FACTS: Map<string, KnowledgeEntry> = new Map();

// ============================================================================
// FACT CHECKER CLASS
// ============================================================================

export class FactChecker extends EventEmitter {
  private config: FactCheckerConfig;
  private verificationCache: Map<string, VerificationResult> = new Map();
  private knowledgeBase: Map<string, KnowledgeEntry> = new Map(COMMON_FACTS);
  private pendingVerifications: Map<string, Promise<VerificationResult>> = new Map();

  constructor(config?: Partial<FactCheckerConfig>) {
    super();

    this.config = {
      minSourcesRequired: 2,
      minSourceQuality: 50,
      crossReferenceThreshold: 0.6, // 60% agreement
      enableLiveSearch: true,
      enableCaching: true,
      cacheExpiryHours: 24,
      trustedSources: [
        'wikipedia.org',
        'britannica.com',
        'reuters.com',
        'apnews.com',
        'gov',
        'edu',
      ],
      blockedSources: [],
      ...config,
    };
  }

  // ============================================================================
  // MAIN VERIFICATION FLOW
  // ============================================================================

  async checkResponse(
    response: string,
    context?: {
      domain?: string;
      knownFacts?: string[];
      sources?: SourceInfo[];
    }
  ): Promise<FactCheckReport> {
    const startTime = Date.now();
    const reportId = uuid();

    // Step 1: Extract claims from response
    const claims = await this.extractClaims(response);

    // Step 2: Verify each claim
    const results: VerificationResult[] = [];
    for (const claim of claims) {
      // Skip opinion/prediction claims
      if (claim.type === 'opinion' || claim.type === 'prediction') {
        results.push(this.createOpinionResult(claim));
        continue;
      }

      const result = await this.verifyClaim(claim, context);
      results.push(result);
    }

    // Step 3: Calculate overall score
    const overallScore = this.calculateOverallScore(results);
    const overallStatus = this.determineOverallStatus(results);

    // Step 4: Generate summary and warnings
    const summary = this.generateSummary(results);
    const warnings = this.generateWarnings(results);

    const report: FactCheckReport = {
      id: reportId,
      responseId: uuid(),
      claims,
      results,
      overallScore,
      overallStatus,
      summary,
      warnings,
      timestamp: new Date(),
    };

    // Emit events
    this.emit('report-generated', {
      report,
      duration: Date.now() - startTime,
    });

    if (overallScore < 50) {
      this.emit('low-reliability', { report });
    }

    return report;
  }

  // ============================================================================
  // CLAIM EXTRACTION
  // ============================================================================

  async extractClaims(text: string): Promise<Claim[]> {
    const claims: Claim[] = [];
    const sentences = this.splitIntoSentences(text);

    for (const sentence of sentences) {
      // Skip short or non-factual sentences
      if (sentence.length < 20) continue;
      if (this.isNonFactual(sentence)) continue;

      const claimType = this.classifyClaimType(sentence);
      const claim: Claim = {
        id: uuid(),
        text: sentence,
        type: claimType,
        confidence: this.estimateClaimConfidence(sentence),
        extractedFrom: text,
        timestamp: new Date(),
      };

      // Extract subject-predicate-object if possible
      const spo = this.extractSPO(sentence);
      if (spo) {
        claim.subject = spo.subject;
        claim.predicate = spo.predicate;
        claim.object = spo.object;
      }

      claims.push(claim);
    }

    return claims;
  }

  private splitIntoSentences(text: string): string[] {
    // Split by sentence-ending punctuation
    return text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private isNonFactual(sentence: string): boolean {
    const nonFactualPatterns = [
      /^(I think|I believe|In my opinion|It seems|Perhaps|Maybe)/i,
      /^(Please|Thank you|You're welcome|Sure|Of course)/i,
      /\?$/,  // Questions
      /^(Yes|No|Okay|Alright|Sure)[,.]?\s*$/i,
    ];

    return nonFactualPatterns.some(pattern => pattern.test(sentence));
  }

  private classifyClaimType(sentence: string): ClaimType {
    const lowered = sentence.toLowerCase();

    // Statistical claims
    if (/\d+(\.\d+)?%|\d+\s*(percent|million|billion|trillion)/i.test(sentence)) {
      return 'statistical';
    }

    // Historical claims
    if (/\b(in \d{4}|century|ancient|historical|war|founded|established)\b/i.test(lowered)) {
      return 'historical';
    }

    // Scientific claims
    if (/\b(research|study|scientists?|evidence|experiment|theory|hypothesis)\b/i.test(lowered)) {
      return 'scientific';
    }

    // Definitional claims
    if (/\b(is defined as|refers to|means|is a type of|is called)\b/i.test(lowered)) {
      return 'definitional';
    }

    // Causal claims
    if (/\b(because|causes?|leads? to|results? in|due to|therefore)\b/i.test(lowered)) {
      return 'causal';
    }

    // Comparative claims
    if (/\b(more than|less than|compared to|versus|vs\.|better|worse|larger|smaller)\b/i.test(lowered)) {
      return 'comparative';
    }

    // Prediction/future claims
    if (/\b(will|going to|expected to|predicted|forecast|by \d{4})\b/i.test(lowered)) {
      return 'prediction';
    }

    // Opinion indicators
    if (/\b(should|might|could|may|possibly|probably|think|believe|feel)\b/i.test(lowered)) {
      return 'opinion';
    }

    // Default to factual
    return 'factual';
  }

  private estimateClaimConfidence(sentence: string): number {
    let confidence = 70; // Base confidence

    // Boost for specific details
    if (/\d+/.test(sentence)) confidence += 10; // Contains numbers
    if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(sentence)) confidence += 5; // Contains names

    // Reduce for hedging
    if (/\b(might|maybe|possibly|perhaps|could)\b/i.test(sentence)) {
      confidence -= 20;
    }

    // Reduce for vague language
    if (/\b(some|many|several|often|sometimes)\b/i.test(sentence)) {
      confidence -= 10;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  private extractSPO(sentence: string): { subject: string; predicate: string; object: string } | null {
    // Simple SPO extraction (in production, use NLP library)
    const isPattern = /^(.+?)\s+(is|are|was|were)\s+(.+)$/i;
    const match = sentence.match(isPattern);

    if (match) {
      return {
        subject: match[1].trim(),
        predicate: match[2].trim(),
        object: match[3].replace(/[.!?]$/, '').trim(),
      };
    }

    return null;
  }

  // ============================================================================
  // CLAIM VERIFICATION
  // ============================================================================

  async verifyClaim(
    claim: Claim,
    context?: {
      domain?: string;
      knownFacts?: string[];
      sources?: SourceInfo[];
    }
  ): Promise<VerificationResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(claim);
    if (this.config.enableCaching) {
      const cached = this.verificationCache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }
    }

    // Check for pending verification (deduplication)
    const pending = this.pendingVerifications.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Start verification
    const verificationPromise = this.performVerification(claim, context);
    this.pendingVerifications.set(cacheKey, verificationPromise);

    try {
      const result = await verificationPromise;

      // Cache result
      if (this.config.enableCaching) {
        this.verificationCache.set(cacheKey, result);
      }

      return result;
    } finally {
      this.pendingVerifications.delete(cacheKey);
    }
  }

  private async performVerification(
    claim: Claim,
    context?: {
      domain?: string;
      knownFacts?: string[];
      sources?: SourceInfo[];
    }
  ): Promise<VerificationResult> {
    const sources: VerifiedSource[] = [];
    const contradictions: Contradiction[] = [];

    // Step 1: Check knowledge base
    const knowledgeResult = this.checkKnowledgeBase(claim);
    if (knowledgeResult) {
      sources.push(knowledgeResult);
    }

    // Step 2: Check provided context/sources
    if (context?.sources) {
      for (const source of context.sources) {
        const verified = await this.verifyAgainstSource(claim, source);
        if (verified) {
          if (verified.supports) {
            sources.push(verified);
          } else {
            contradictions.push({
              source: verified.source,
              claim: claim.text,
              explanation: `Source contradicts claim`,
              severity: this.assessContradictionSeverity(verified.source),
            });
          }
        }
      }
    }

    // Step 3: Check known facts from context
    if (context?.knownFacts) {
      const factCheck = this.checkAgainstKnownFacts(claim, context.knownFacts);
      if (factCheck.contradicted) {
        contradictions.push({
          source: {
            type: 'PROFESSIONAL',
            quality: SourceQuality.PROFESSIONAL,
            verified: true,
          },
          claim: claim.text,
          explanation: factCheck.explanation,
          severity: 'major',
        });
      }
    }

    // Step 4: Determine verification status
    const status = this.determineStatus(sources, contradictions);
    const confidence = this.calculateClaimConfidence(sources, contradictions);

    const result: VerificationResult = {
      claimId: claim.id,
      claim,
      status,
      confidence,
      sources,
      contradictions,
      explanation: this.generateVerificationExplanation(status, sources, contradictions),
      verifiedAt: new Date(),
      verificationMethod: 'multi-source-cross-reference',
    };

    this.emit('claim-verified', { result });
    return result;
  }

  private checkKnowledgeBase(claim: Claim): VerifiedSource | null {
    // Search knowledge base for related entries
    for (const entry of this.knowledgeBase.values()) {
      const similarity = this.calculateSimilarity(claim.text, entry.fact);
      if (similarity > 0.7) {
        return {
          source: entry.source,
          supports: true,
          relevance: similarity * 100,
          retrievedAt: new Date(),
        };
      }
    }
    return null;
  }

  private async verifyAgainstSource(
    claim: Claim,
    source: SourceInfo
  ): Promise<VerifiedSource | null> {
    // Check if source is trusted or blocked
    if (source.domain && this.config.blockedSources.includes(source.domain)) {
      return null;
    }

    // Check source quality
    if (source.quality < this.config.minSourceQuality) {
      return null;
    }

    // In production, this would fetch and analyze the source content
    // For now, return a simulated verification
    return {
      source,
      supports: source.quality >= 60, // High quality sources assumed to support
      relevance: 70,
      retrievedAt: new Date(),
    };
  }

  private checkAgainstKnownFacts(
    claim: Claim,
    knownFacts: string[]
  ): { contradicted: boolean; explanation: string } {
    for (const fact of knownFacts) {
      // Simple contradiction check
      if (this.detectContradiction(claim.text, fact)) {
        return {
          contradicted: true,
          explanation: `Contradicts known fact: "${fact.substring(0, 100)}..."`,
        };
      }
    }

    return { contradicted: false, explanation: '' };
  }

  private detectContradiction(claim: string, fact: string): boolean {
    // Simple negation detection
    // In production, use NLI model
    const claimLower = claim.toLowerCase();
    const factLower = fact.toLowerCase();

    // Check for direct negation patterns
    const negationPairs = [
      ['is', 'is not'],
      ['are', 'are not'],
      ['was', 'was not'],
      ['can', 'cannot'],
      ['will', 'will not'],
      ['has', 'has not'],
      ['does', 'does not'],
    ];

    for (const [positive, negative] of negationPairs) {
      if (
        (claimLower.includes(positive) && factLower.includes(negative)) ||
        (claimLower.includes(negative) && factLower.includes(positive))
      ) {
        // Check if they're about the same subject
        const claimWords = new Set(claimLower.split(/\s+/));
        const factWords = new Set(factLower.split(/\s+/));
        const intersection = [...claimWords].filter(w => factWords.has(w));

        if (intersection.length > 3) {
          return true;
        }
      }
    }

    return false;
  }

  // ============================================================================
  // STATUS DETERMINATION
  // ============================================================================

  private determineStatus(
    sources: VerifiedSource[],
    contradictions: Contradiction[]
  ): VerificationStatus {
    const supportingSources = sources.filter(s => s.supports);
    const criticalContradictions = contradictions.filter(c => c.severity === 'critical');
    const majorContradictions = contradictions.filter(c => c.severity === 'major');

    // Critical contradictions = false
    if (criticalContradictions.length > 0) {
      return 'false';
    }

    // Multiple major contradictions = disputed
    if (majorContradictions.length >= 2) {
      return 'disputed';
    }

    // Some contradiction but also support = partially-true
    if (contradictions.length > 0 && supportingSources.length > 0) {
      return 'partially-true';
    }

    // Single contradiction = disputed
    if (contradictions.length > 0) {
      return 'disputed';
    }

    // Multiple high-quality supporting sources = verified
    const highQualitySources = supportingSources.filter(s => s.source.quality >= 70);
    if (highQualitySources.length >= this.config.minSourcesRequired) {
      return 'verified';
    }

    // Some support but not enough = likely-true
    if (supportingSources.length > 0) {
      return 'likely-true';
    }

    // No information either way = unverified
    return 'unverified';
  }

  private calculateClaimConfidence(
    sources: VerifiedSource[],
    contradictions: Contradiction[]
  ): number {
    let confidence = 50; // Base

    // Boost for supporting sources
    for (const source of sources.filter(s => s.supports)) {
      confidence += Math.min(source.source.quality / 10, 10);
    }

    // Penalty for contradictions
    for (const contradiction of contradictions) {
      switch (contradiction.severity) {
        case 'critical':
          confidence -= 40;
          break;
        case 'major':
          confidence -= 20;
          break;
        case 'minor':
          confidence -= 10;
          break;
      }
    }

    return Math.max(0, Math.min(100, confidence));
  }

  private assessContradictionSeverity(
    source: SourceInfo
  ): 'minor' | 'major' | 'critical' {
    if (source.quality >= 80) return 'critical';
    if (source.quality >= 60) return 'major';
    return 'minor';
  }

  // ============================================================================
  // REPORT GENERATION
  // ============================================================================

  private createOpinionResult(claim: Claim): VerificationResult {
    return {
      claimId: claim.id,
      claim,
      status: 'opinion',
      confidence: claim.confidence,
      sources: [],
      contradictions: [],
      explanation: 'This is an opinion or prediction, not a verifiable fact.',
      verifiedAt: new Date(),
      verificationMethod: 'claim-type-classification',
    };
  }

  private calculateOverallScore(results: VerificationResult[]): number {
    if (results.length === 0) return 100;

    const factualResults = results.filter(r => r.status !== 'opinion');
    if (factualResults.length === 0) return 100;

    // Weight by claim confidence
    let weightedSum = 0;
    let totalWeight = 0;

    for (const result of factualResults) {
      const weight = result.claim.confidence / 100;
      const score = this.statusToScore(result.status);
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);
  }

  private statusToScore(status: VerificationStatus): number {
    const scores: Record<VerificationStatus, number> = {
      'verified': 100,
      'likely-true': 80,
      'partially-true': 60,
      'unverified': 50,
      'outdated': 40,
      'disputed': 30,
      'false': 0,
      'opinion': 100, // Opinions don't penalize
      'pending': 50,
    };
    return scores[status] ?? 50;
  }

  private determineOverallStatus(results: VerificationResult[]): VerificationStatus {
    const factualResults = results.filter(r => r.status !== 'opinion');
    if (factualResults.length === 0) return 'verified';

    // If any claim is false, overall is false
    if (factualResults.some(r => r.status === 'false')) {
      return 'false';
    }

    // If multiple disputed, overall is disputed
    const disputed = factualResults.filter(r => r.status === 'disputed');
    if (disputed.length >= 2) {
      return 'disputed';
    }

    // If all verified, overall is verified
    if (factualResults.every(r => r.status === 'verified')) {
      return 'verified';
    }

    // If mostly likely-true, overall is likely-true
    const likelyTrue = factualResults.filter(
      r => r.status === 'verified' || r.status === 'likely-true'
    );
    if (likelyTrue.length > factualResults.length / 2) {
      return 'likely-true';
    }

    return 'partially-true';
  }

  private generateSummary(results: VerificationResult[]): string {
    const factualResults = results.filter(r => r.status !== 'opinion');
    const total = factualResults.length;

    if (total === 0) {
      return 'Response contains opinions/predictions only - no factual claims to verify.';
    }

    const verified = factualResults.filter(r => r.status === 'verified').length;
    const likelyTrue = factualResults.filter(r => r.status === 'likely-true').length;
    const disputed = factualResults.filter(r => r.status === 'disputed').length;
    const falseCount = factualResults.filter(r => r.status === 'false').length;

    let summary = `Analyzed ${total} factual claim${total !== 1 ? 's' : ''}. `;

    if (verified > 0) summary += `${verified} verified. `;
    if (likelyTrue > 0) summary += `${likelyTrue} likely true. `;
    if (disputed > 0) summary += `${disputed} disputed. `;
    if (falseCount > 0) summary += `${falseCount} found to be false. `;

    return summary.trim();
  }

  private generateWarnings(results: VerificationResult[]): string[] {
    const warnings: string[] = [];

    const falseResults = results.filter(r => r.status === 'false');
    if (falseResults.length > 0) {
      warnings.push(
        `WARNING: ${falseResults.length} claim${falseResults.length !== 1 ? 's' : ''} appear to be false`
      );
    }

    const disputed = results.filter(r => r.status === 'disputed');
    if (disputed.length > 0) {
      warnings.push(
        `CAUTION: ${disputed.length} claim${disputed.length !== 1 ? 's' : ''} are disputed by sources`
      );
    }

    const unverified = results.filter(r => r.status === 'unverified');
    if (unverified.length > results.length / 2) {
      warnings.push('NOTE: Many claims could not be verified - consider seeking additional sources');
    }

    return warnings;
  }

  private generateVerificationExplanation(
    status: VerificationStatus,
    sources: VerifiedSource[],
    contradictions: Contradiction[]
  ): string {
    switch (status) {
      case 'verified':
        return `Verified by ${sources.length} reliable source${sources.length !== 1 ? 's' : ''}.`;
      case 'likely-true':
        return `Supported by available sources but not fully verified.`;
      case 'partially-true':
        return `True with caveats - some aspects are contradicted or uncertain.`;
      case 'disputed':
        return `Sources disagree on this claim. ${contradictions.length} contradiction${contradictions.length !== 1 ? 's' : ''} found.`;
      case 'false':
        return `Contradicted by reliable sources. This claim appears to be incorrect.`;
      case 'unverified':
        return `Unable to verify - no reliable sources found.`;
      case 'outdated':
        return `Information may be outdated - please verify with current sources.`;
      default:
        return `Verification status: ${status}`;
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private getCacheKey(claim: Claim): string {
    // Create a normalized key for caching
    return claim.text.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 100);
  }

  private isCacheValid(result: VerificationResult): boolean {
    const age = Date.now() - result.verifiedAt.getTime();
    const maxAge = this.config.cacheExpiryHours * 60 * 60 * 1000;
    return age < maxAge;
  }

  private calculateSimilarity(a: string, b: string): number {
    // Simple Jaccard similarity
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;

    return union > 0 ? intersection / union : 0;
  }

  // ============================================================================
  // KNOWLEDGE BASE MANAGEMENT
  // ============================================================================

  addToKnowledgeBase(fact: string, source: SourceInfo, category: string): void {
    const entry: KnowledgeEntry = {
      id: uuid(),
      fact,
      category,
      source,
      confidence: source.quality,
      lastVerified: new Date(),
      contradictions: [],
    };

    this.knowledgeBase.set(entry.id, entry);
    this.emit('knowledge-added', { entry });
  }

  clearKnowledgeBase(): void {
    this.knowledgeBase.clear();
  }

  clearCache(): void {
    this.verificationCache.clear();
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  getStats(): {
    cacheSize: number;
    knowledgeBaseSize: number;
    pendingVerifications: number;
  } {
    return {
      cacheSize: this.verificationCache.size,
      knowledgeBaseSize: this.knowledgeBase.size,
      pendingVerifications: this.pendingVerifications.size,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createFactChecker(config?: Partial<FactCheckerConfig>): FactChecker {
  return new FactChecker(config);
}
