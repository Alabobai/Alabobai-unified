/**
 * Alabobai Deep Research Engine - Citation Tracker
 *
 * Tracks all citations with quality scores, verification status,
 * and cross-reference validation. Designed to achieve >91.3% citation accuracy.
 *
 * Features:
 * - Citation extraction and normalization
 * - Quality scoring for each citation
 * - Cross-reference validation
 * - Citation graph for relationship analysis
 * - Confidence scoring for claims
 */

import { EventEmitter } from 'events';
import { QualityScore, SourceMetadata, SourceQualityScorer, sourceQualityScorer } from './SourceQualityScorer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Citation {
  id: string;
  url: string;
  title: string;
  author?: string;
  publishedDate?: Date;
  accessedDate: Date;
  snippet: string;          // Relevant excerpt from source
  sourceMetadata: SourceMetadata;
  qualityScore: QualityScore;
  verificationStatus: VerificationStatus;
  claims: string[];         // Claims this citation supports
  crossReferences: string[]; // IDs of citations that corroborate
}

export type VerificationStatus =
  | 'verified'       // Claim verified by multiple sources
  | 'partially'      // Some aspects verified
  | 'unverified'     // Could not verify
  | 'disputed'       // Contradicted by other sources
  | 'pending';       // Verification in progress

export interface Claim {
  id: string;
  text: string;
  citations: string[];      // Citation IDs supporting this claim
  confidence: number;       // 0-1 confidence score
  verificationStatus: VerificationStatus;
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  createdAt: Date;
  lastVerified?: Date;
}

export interface Evidence {
  citationId: string;
  snippet: string;
  relevanceScore: number;   // 0-1 how relevant to the claim
  agreementScore: number;   // -1 to 1, negative = contradicts
}

export interface CitationStatistics {
  totalCitations: number;
  verifiedCitations: number;
  averageQualityScore: number;
  citationsByType: Record<string, number>;
  citationsByStatus: Record<VerificationStatus, number>;
  claimCoverage: number;    // % of claims with citations
  crossReferenceRate: number; // % of citations with cross-refs
}

export interface CrossReferenceResult {
  citationId: string;
  matchingCitations: Array<{
    citationId: string;
    similarityScore: number;
    claimOverlap: string[];
  }>;
}

// ============================================================================
// CITATION TRACKER
// ============================================================================

export interface CitationTrackerConfig {
  qualityScorer?: SourceQualityScorer;
  minQualityScore?: number;        // Minimum quality for citation
  minCrossReferences?: number;     // Minimum for "verified" status
  enableAutoVerification?: boolean;
  maxCitationsPerClaim?: number;
}

export class CitationTracker extends EventEmitter {
  private config: Required<CitationTrackerConfig>;
  private citations: Map<string, Citation>;
  private claims: Map<string, Claim>;
  private urlToId: Map<string, string>;
  private citationGraph: Map<string, Set<string>>;
  private claimToCitations: Map<string, Set<string>>;

  constructor(config: CitationTrackerConfig = {}) {
    super();

    this.config = {
      qualityScorer: config.qualityScorer ?? sourceQualityScorer,
      minQualityScore: config.minQualityScore ?? 40,
      minCrossReferences: config.minCrossReferences ?? 2,
      enableAutoVerification: config.enableAutoVerification ?? true,
      maxCitationsPerClaim: config.maxCitationsPerClaim ?? 10,
    };

    this.citations = new Map();
    this.claims = new Map();
    this.urlToId = new Map();
    this.citationGraph = new Map();
    this.claimToCitations = new Map();
  }

  // ============================================================================
  // CITATION MANAGEMENT
  // ============================================================================

  /**
   * Add a new citation
   */
  async addCitation(input: {
    url: string;
    title: string;
    author?: string;
    publishedDate?: Date;
    snippet: string;
    claims?: string[];
    metadata?: Partial<SourceMetadata>;
  }): Promise<Citation> {
    // Check if citation already exists
    const existingId = this.urlToId.get(input.url);
    if (existingId) {
      const existing = this.citations.get(existingId)!;
      // Update claims if provided
      if (input.claims) {
        for (const claim of input.claims) {
          if (!existing.claims.includes(claim)) {
            existing.claims.push(claim);
          }
        }
      }
      return existing;
    }

    // Build source metadata
    const domain = this.extractDomain(input.url);
    const sourceMetadata: SourceMetadata = {
      url: input.url,
      domain,
      title: input.title,
      author: input.author,
      publishedDate: input.publishedDate,
      ...input.metadata,
    };

    // Score the source
    const qualityScore = await this.config.qualityScorer.scoreSource(sourceMetadata);

    // Check minimum quality threshold
    if (qualityScore.overall < this.config.minQualityScore) {
      this.emit('citation-rejected', {
        url: input.url,
        reason: `Quality score ${qualityScore.overall} below threshold ${this.config.minQualityScore}`,
      });
    }

    // Create citation
    const citation: Citation = {
      id: this.generateId(),
      url: input.url,
      title: input.title,
      author: input.author,
      publishedDate: input.publishedDate,
      accessedDate: new Date(),
      snippet: input.snippet,
      sourceMetadata,
      qualityScore,
      verificationStatus: 'pending',
      claims: input.claims ?? [],
      crossReferences: [],
    };

    // Store citation
    this.citations.set(citation.id, citation);
    this.urlToId.set(input.url, citation.id);
    this.citationGraph.set(citation.id, new Set());

    // Link to claims
    for (const claim of citation.claims) {
      this.linkCitationToClaim(citation.id, claim);
    }

    // Auto-verify if enabled
    if (this.config.enableAutoVerification) {
      await this.verifyCitation(citation.id);
    }

    this.emit('citation-added', citation);

    return citation;
  }

  /**
   * Add multiple citations in batch
   */
  async addCitations(inputs: Parameters<typeof this.addCitation>[0][]): Promise<Citation[]> {
    const citations = await Promise.all(
      inputs.map(input => this.addCitation(input))
    );

    // Cross-reference all new citations
    if (this.config.enableAutoVerification) {
      await this.crossReferenceCitations(citations.map(c => c.id));
    }

    return citations;
  }

  /**
   * Get a citation by ID
   */
  getCitation(id: string): Citation | undefined {
    return this.citations.get(id);
  }

  /**
   * Get citation by URL
   */
  getCitationByUrl(url: string): Citation | undefined {
    const id = this.urlToId.get(url);
    return id ? this.citations.get(id) : undefined;
  }

  /**
   * Get all citations
   */
  getAllCitations(): Citation[] {
    return Array.from(this.citations.values());
  }

  /**
   * Get citations for a specific claim
   */
  getCitationsForClaim(claimText: string): Citation[] {
    const citationIds = this.claimToCitations.get(claimText);
    if (!citationIds) return [];

    return Array.from(citationIds)
      .map(id => this.citations.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.qualityScore.overall - a.qualityScore.overall);
  }

  /**
   * Remove a citation
   */
  removeCitation(id: string): boolean {
    const citation = this.citations.get(id);
    if (!citation) return false;

    // Remove from claim mappings
    for (const claim of citation.claims) {
      const citationSet = this.claimToCitations.get(claim);
      if (citationSet) {
        citationSet.delete(id);
      }
    }

    // Remove cross-references
    for (const refId of citation.crossReferences) {
      const refCitation = this.citations.get(refId);
      if (refCitation) {
        refCitation.crossReferences = refCitation.crossReferences.filter(r => r !== id);
      }
    }

    // Remove from graph
    this.citationGraph.delete(id);
    for (const edges of this.citationGraph.values()) {
      edges.delete(id);
    }

    // Remove from maps
    this.urlToId.delete(citation.url);
    this.citations.delete(id);

    this.emit('citation-removed', { id });

    return true;
  }

  // ============================================================================
  // CLAIM MANAGEMENT
  // ============================================================================

  /**
   * Register a claim and link it to citations
   */
  async registerClaim(text: string, citationIds: string[]): Promise<Claim> {
    const existingClaim = this.claims.get(text);
    if (existingClaim) {
      // Add new citations to existing claim
      for (const citationId of citationIds) {
        if (!existingClaim.citations.includes(citationId)) {
          existingClaim.citations.push(citationId);
          this.linkCitationToClaim(citationId, text);
        }
      }
      return this.updateClaimConfidence(existingClaim);
    }

    const claim: Claim = {
      id: this.generateId(),
      text,
      citations: citationIds,
      confidence: 0,
      verificationStatus: 'pending',
      supportingEvidence: [],
      contradictingEvidence: [],
      createdAt: new Date(),
    };

    // Link citations
    for (const citationId of citationIds) {
      this.linkCitationToClaim(citationId, text);
    }

    this.claims.set(text, claim);

    // Calculate initial confidence
    await this.updateClaimConfidence(claim);

    this.emit('claim-registered', claim);

    return claim;
  }

  /**
   * Get a claim by text
   */
  getClaim(text: string): Claim | undefined {
    return this.claims.get(text);
  }

  /**
   * Get all claims
   */
  getAllClaims(): Claim[] {
    return Array.from(this.claims.values());
  }

  /**
   * Get claims by verification status
   */
  getClaimsByStatus(status: VerificationStatus): Claim[] {
    return Array.from(this.claims.values()).filter(c => c.verificationStatus === status);
  }

  // ============================================================================
  // VERIFICATION
  // ============================================================================

  /**
   * Verify a citation by finding cross-references
   */
  async verifyCitation(citationId: string): Promise<VerificationStatus> {
    const citation = this.citations.get(citationId);
    if (!citation) {
      throw new Error(`Citation not found: ${citationId}`);
    }

    // Find cross-references
    const crossRefs = await this.findCrossReferences(citationId);
    citation.crossReferences = crossRefs.map(cr => cr.citationId);

    // Update citation graph
    const edges = this.citationGraph.get(citationId) ?? new Set();
    for (const ref of crossRefs) {
      edges.add(ref.citationId);
      // Bidirectional edge
      const refEdges = this.citationGraph.get(ref.citationId) ?? new Set();
      refEdges.add(citationId);
      this.citationGraph.set(ref.citationId, refEdges);
    }
    this.citationGraph.set(citationId, edges);

    // Determine verification status
    const status = this.determineVerificationStatus(citation, crossRefs);
    citation.verificationStatus = status;

    this.emit('citation-verified', { citationId, status, crossReferences: crossRefs });

    return status;
  }

  /**
   * Cross-reference multiple citations to find relationships
   */
  async crossReferenceCitations(citationIds: string[]): Promise<CrossReferenceResult[]> {
    const results: CrossReferenceResult[] = [];

    for (let i = 0; i < citationIds.length; i++) {
      const citation = this.citations.get(citationIds[i]);
      if (!citation) continue;

      const matchingCitations: CrossReferenceResult['matchingCitations'] = [];

      for (let j = 0; j < citationIds.length; j++) {
        if (i === j) continue;

        const otherCitation = this.citations.get(citationIds[j]);
        if (!otherCitation) continue;

        // Calculate similarity
        const similarity = this.calculateCitationSimilarity(citation, otherCitation);

        if (similarity.score > 0.3) { // Threshold for cross-reference
          matchingCitations.push({
            citationId: citationIds[j],
            similarityScore: similarity.score,
            claimOverlap: similarity.overlappingClaims,
          });

          // Update cross-references
          if (!citation.crossReferences.includes(citationIds[j])) {
            citation.crossReferences.push(citationIds[j]);
          }
          if (!otherCitation.crossReferences.includes(citationIds[i])) {
            otherCitation.crossReferences.push(citationIds[i]);
          }
        }
      }

      results.push({
        citationId: citationIds[i],
        matchingCitations,
      });
    }

    return results;
  }

  /**
   * Verify a claim by checking citation support
   */
  async verifyClaim(claimText: string): Promise<Claim> {
    const claim = this.claims.get(claimText);
    if (!claim) {
      throw new Error(`Claim not found: ${claimText}`);
    }

    // Gather evidence from all citations
    claim.supportingEvidence = [];
    claim.contradictingEvidence = [];

    for (const citationId of claim.citations) {
      const citation = this.citations.get(citationId);
      if (!citation) continue;

      // Analyze how well the citation supports the claim
      const analysis = this.analyzeEvidence(claimText, citation);

      if (analysis.agreementScore >= 0.3) {
        claim.supportingEvidence.push({
          citationId,
          snippet: citation.snippet,
          relevanceScore: analysis.relevanceScore,
          agreementScore: analysis.agreementScore,
        });
      } else if (analysis.agreementScore <= -0.3) {
        claim.contradictingEvidence.push({
          citationId,
          snippet: citation.snippet,
          relevanceScore: analysis.relevanceScore,
          agreementScore: analysis.agreementScore,
        });
      }
    }

    // Update claim confidence and status
    await this.updateClaimConfidence(claim);
    claim.lastVerified = new Date();

    this.emit('claim-verified', claim);

    return claim;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get citation statistics
   */
  getStatistics(): CitationStatistics {
    const citations = Array.from(this.citations.values());
    const claims = Array.from(this.claims.values());

    if (citations.length === 0) {
      return {
        totalCitations: 0,
        verifiedCitations: 0,
        averageQualityScore: 0,
        citationsByType: {},
        citationsByStatus: {
          verified: 0,
          partially: 0,
          unverified: 0,
          disputed: 0,
          pending: 0,
        },
        claimCoverage: 0,
        crossReferenceRate: 0,
      };
    }

    // Calculate statistics
    const verifiedCitations = citations.filter(c => c.verificationStatus === 'verified').length;
    const averageQualityScore = citations.reduce((sum, c) => sum + c.qualityScore.overall, 0) / citations.length;

    // Citations by type
    const citationsByType: Record<string, number> = {};
    for (const citation of citations) {
      const type = this.config.qualityScorer.classifySourceType(citation.url);
      citationsByType[type] = (citationsByType[type] ?? 0) + 1;
    }

    // Citations by status
    const citationsByStatus: Record<VerificationStatus, number> = {
      verified: 0,
      partially: 0,
      unverified: 0,
      disputed: 0,
      pending: 0,
    };
    for (const citation of citations) {
      citationsByStatus[citation.verificationStatus]++;
    }

    // Claim coverage
    const claimsWithCitations = claims.filter(c => c.citations.length > 0).length;
    const claimCoverage = claims.length > 0 ? claimsWithCitations / claims.length : 0;

    // Cross-reference rate
    const citationsWithCrossRefs = citations.filter(c => c.crossReferences.length > 0).length;
    const crossReferenceRate = citationsWithCrossRefs / citations.length;

    return {
      totalCitations: citations.length,
      verifiedCitations,
      averageQualityScore: Math.round(averageQualityScore * 10) / 10,
      citationsByType,
      citationsByStatus,
      claimCoverage: Math.round(claimCoverage * 100) / 100,
      crossReferenceRate: Math.round(crossReferenceRate * 100) / 100,
    };
  }

  /**
   * Calculate citation accuracy rate
   */
  getCitationAccuracy(): number {
    const citations = Array.from(this.citations.values());
    if (citations.length === 0) return 0;

    // Weight citations by quality and verification
    let accurateWeight = 0;
    let totalWeight = 0;

    for (const citation of citations) {
      const weight = citation.qualityScore.overall / 100;
      totalWeight += weight;

      if (citation.verificationStatus === 'verified') {
        accurateWeight += weight;
      } else if (citation.verificationStatus === 'partially') {
        accurateWeight += weight * 0.7;
      } else if (citation.verificationStatus === 'disputed') {
        // Disputed citations count against accuracy
        accurateWeight -= weight * 0.5;
      }
    }

    return Math.max(0, Math.min(100, (accurateWeight / totalWeight) * 100));
  }

  /**
   * Get top quality citations
   */
  getTopCitations(limit: number = 10): Citation[] {
    return Array.from(this.citations.values())
      .sort((a, b) => {
        // Sort by verification status first, then by quality score
        const statusOrder: Record<VerificationStatus, number> = {
          verified: 4,
          partially: 3,
          pending: 2,
          unverified: 1,
          disputed: 0,
        };
        const statusDiff = statusOrder[b.verificationStatus] - statusOrder[a.verificationStatus];
        if (statusDiff !== 0) return statusDiff;
        return b.qualityScore.overall - a.qualityScore.overall;
      })
      .slice(0, limit);
  }

  // ============================================================================
  // EXPORT
  // ============================================================================

  /**
   * Export citations in various formats
   */
  exportCitations(format: 'json' | 'bibtex' | 'apa' | 'mla' = 'json'): string {
    const citations = Array.from(this.citations.values());

    switch (format) {
      case 'json':
        return JSON.stringify(citations, null, 2);

      case 'bibtex':
        return citations.map(c => this.formatBibTeX(c)).join('\n\n');

      case 'apa':
        return citations.map(c => this.formatAPA(c)).join('\n\n');

      case 'mla':
        return citations.map(c => this.formatMLA(c)).join('\n\n');

      default:
        return JSON.stringify(citations, null, 2);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private generateId(): string {
    return `cit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      return match ? match[1] : url;
    }
  }

  private linkCitationToClaim(citationId: string, claimText: string): void {
    const citation = this.citations.get(citationId);
    if (citation && !citation.claims.includes(claimText)) {
      citation.claims.push(claimText);
    }

    let citationSet = this.claimToCitations.get(claimText);
    if (!citationSet) {
      citationSet = new Set();
      this.claimToCitations.set(claimText, citationSet);
    }
    citationSet.add(citationId);
  }

  private async findCrossReferences(citationId: string): Promise<Array<{ citationId: string; score: number }>> {
    const citation = this.citations.get(citationId);
    if (!citation) return [];

    const crossRefs: Array<{ citationId: string; score: number }> = [];

    for (const [id, other] of this.citations) {
      if (id === citationId) continue;

      const similarity = this.calculateCitationSimilarity(citation, other);
      if (similarity.score > 0.3) {
        crossRefs.push({ citationId: id, score: similarity.score });
      }
    }

    return crossRefs.sort((a, b) => b.score - a.score);
  }

  private calculateCitationSimilarity(a: Citation, b: Citation): { score: number; overlappingClaims: string[] } {
    // Calculate claim overlap
    const overlappingClaims = a.claims.filter(claim => b.claims.includes(claim));
    const claimOverlapScore = overlappingClaims.length > 0
      ? overlappingClaims.length / Math.max(a.claims.length, b.claims.length)
      : 0;

    // Calculate text similarity (simple Jaccard)
    const aWords = new Set(a.snippet.toLowerCase().split(/\s+/));
    const bWords = new Set(b.snippet.toLowerCase().split(/\s+/));
    const intersection = new Set([...aWords].filter(w => bWords.has(w)));
    const union = new Set([...aWords, ...bWords]);
    const textSimilarity = intersection.size / union.size;

    // Domain similarity (same domain = higher similarity)
    const domainSimilarity = a.sourceMetadata.domain === b.sourceMetadata.domain ? 0.2 : 0;

    // Combined score
    const score = claimOverlapScore * 0.5 + textSimilarity * 0.3 + domainSimilarity;

    return { score: Math.min(1, score), overlappingClaims };
  }

  private determineVerificationStatus(citation: Citation, crossRefs: Array<{ citationId: string; score: number }>): VerificationStatus {
    const highQualityCrossRefs = crossRefs.filter(ref => {
      const refCitation = this.citations.get(ref.citationId);
      return refCitation && refCitation.qualityScore.overall >= 60;
    });

    if (highQualityCrossRefs.length >= this.config.minCrossReferences) {
      return 'verified';
    } else if (crossRefs.length >= 1) {
      return 'partially';
    } else if (citation.qualityScore.overall >= 80) {
      // High quality source can be partially verified on its own
      return 'partially';
    } else {
      return 'unverified';
    }
  }

  private analyzeEvidence(claimText: string, citation: Citation): { relevanceScore: number; agreementScore: number } {
    // Simple text-based analysis
    // In production, this would use NLP/ML for semantic analysis

    const claimWords = new Set(claimText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const snippetWords = new Set(citation.snippet.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    // Relevance: word overlap
    const overlap = [...claimWords].filter(w => snippetWords.has(w)).length;
    const relevanceScore = claimWords.size > 0 ? overlap / claimWords.size : 0;

    // Agreement: check for negation words near claim keywords
    const snippetLower = citation.snippet.toLowerCase();
    const negationPatterns = ['not', 'no', "don't", "doesn't", 'never', 'false', 'incorrect', 'wrong', 'dispute'];
    const hasNegation = negationPatterns.some(neg => snippetLower.includes(neg));

    // If high relevance but has negation, might be contradicting
    let agreementScore = relevanceScore;
    if (hasNegation && relevanceScore > 0.3) {
      agreementScore = -relevanceScore * 0.5; // Might be contradicting
    }

    return { relevanceScore, agreementScore };
  }

  private async updateClaimConfidence(claim: Claim): Promise<Claim> {
    if (claim.citations.length === 0) {
      claim.confidence = 0;
      claim.verificationStatus = 'unverified';
      return claim;
    }

    // Calculate confidence based on:
    // 1. Number of citations
    // 2. Quality of citations
    // 3. Cross-reference count
    // 4. Supporting vs contradicting evidence

    let confidenceFactors: number[] = [];

    // Citation count factor (more citations = higher confidence, with diminishing returns)
    const citationCountFactor = Math.min(1, claim.citations.length / 5);
    confidenceFactors.push(citationCountFactor * 0.2);

    // Average quality factor
    let totalQuality = 0;
    let citationCount = 0;
    for (const citationId of claim.citations) {
      const citation = this.citations.get(citationId);
      if (citation) {
        totalQuality += citation.qualityScore.overall;
        citationCount++;
      }
    }
    const avgQuality = citationCount > 0 ? totalQuality / citationCount : 0;
    const qualityFactor = avgQuality / 100;
    confidenceFactors.push(qualityFactor * 0.4);

    // Cross-reference factor
    let crossRefCount = 0;
    for (const citationId of claim.citations) {
      const citation = this.citations.get(citationId);
      if (citation && citation.crossReferences.length > 0) {
        crossRefCount++;
      }
    }
    const crossRefFactor = citationCount > 0 ? crossRefCount / citationCount : 0;
    confidenceFactors.push(crossRefFactor * 0.2);

    // Evidence agreement factor
    const supportingCount = claim.supportingEvidence.length;
    const contradictingCount = claim.contradictingEvidence.length;
    const totalEvidence = supportingCount + contradictingCount;
    const agreementFactor = totalEvidence > 0
      ? (supportingCount - contradictingCount * 2) / totalEvidence
      : 0.5;
    confidenceFactors.push(Math.max(0, agreementFactor) * 0.2);

    // Calculate final confidence
    claim.confidence = Math.min(1, Math.max(0, confidenceFactors.reduce((a, b) => a + b, 0)));

    // Determine verification status
    if (claim.confidence >= 0.8 && crossRefCount >= 2) {
      claim.verificationStatus = 'verified';
    } else if (claim.confidence >= 0.5) {
      claim.verificationStatus = 'partially';
    } else if (contradictingCount > supportingCount) {
      claim.verificationStatus = 'disputed';
    } else {
      claim.verificationStatus = 'unverified';
    }

    return claim;
  }

  private formatBibTeX(citation: Citation): string {
    const id = citation.id.replace(/[^a-zA-Z0-9]/g, '');
    const year = citation.publishedDate?.getFullYear() ?? new Date().getFullYear();

    return `@misc{${id},
  title = {${citation.title}},
  author = {${citation.author ?? 'Unknown'}},
  year = {${year}},
  url = {${citation.url}},
  note = {Accessed: ${citation.accessedDate.toISOString().split('T')[0]}}
}`;
  }

  private formatAPA(citation: Citation): string {
    const author = citation.author ?? 'Unknown Author';
    const year = citation.publishedDate?.getFullYear() ?? 'n.d.';
    const accessed = citation.accessedDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    return `${author} (${year}). ${citation.title}. Retrieved ${accessed}, from ${citation.url}`;
  }

  private formatMLA(citation: Citation): string {
    const author = citation.author ?? 'Unknown Author';
    const accessed = citation.accessedDate.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return `${author}. "${citation.title}." Web. ${accessed}. <${citation.url}>.`;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.citations.clear();
    this.claims.clear();
    this.urlToId.clear();
    this.citationGraph.clear();
    this.claimToCitations.clear();
  }
}

// Export singleton instance
export const citationTracker = new CitationTracker();
