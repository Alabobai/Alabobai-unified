/**
 * Alabobai Deep Research Engine - Source Quality Scorer
 *
 * Assigns quality scores to sources based on:
 * - Source type (academic, news, government, forum, etc.)
 * - Domain reputation
 * - Content freshness
 * - Author credibility
 * - Citation count/backlinks
 *
 * Goal: Beat Perplexity's 91.3% citation accuracy
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export type SourceType =
  | 'academic'        // Peer-reviewed journals, university publications
  | 'government'      // Government websites, official statistics
  | 'institutional'   // Think tanks, research institutions
  | 'news_tier1'      // Major reputable news outlets (NYT, BBC, Reuters)
  | 'news_tier2'      // Regional/specialized news
  | 'news_tier3'      // Tabloids, opinion blogs
  | 'encyclopedia'    // Wikipedia, Britannica
  | 'technical_docs'  // Official documentation, RFCs
  | 'corporate'       // Company blogs, press releases
  | 'social_media'    // Twitter, LinkedIn posts
  | 'forum'           // Reddit, Stack Overflow, Quora
  | 'blog'            // Personal blogs
  | 'unknown';

export interface SourceMetadata {
  url: string;
  domain: string;
  title?: string;
  author?: string;
  publishedDate?: Date;
  lastUpdated?: Date;
  citationCount?: number;
  backlinks?: number;
  pageRank?: number;
  isPaywalled?: boolean;
  hasAuthorBio?: boolean;
  hasReferences?: boolean;
  wordCount?: number;
  language?: string;
}

export interface QualityScore {
  overall: number;           // 0-100 composite score
  typeScore: number;         // Based on source type
  domainScore: number;       // Based on domain reputation
  freshnessScore: number;    // Based on publication date
  authorityScore: number;    // Based on citations/backlinks
  contentScore: number;      // Based on content quality signals
  confidence: number;        // 0-1 confidence in the score
  factors: QualityFactor[];  // Detailed breakdown
}

export interface QualityFactor {
  name: string;
  score: number;
  weight: number;
  reason: string;
}

export interface DomainReputation {
  domain: string;
  type: SourceType;
  baseScore: number;
  tier: 1 | 2 | 3;
  trustLevel: 'high' | 'medium' | 'low';
  specialization?: string[];
}

// ============================================================================
// DOMAIN REPUTATION DATABASE
// ============================================================================

const DOMAIN_REPUTATIONS: Map<string, DomainReputation> = new Map([
  // Academic Sources (Base Score: 90-100)
  ['scholar.google.com', { domain: 'scholar.google.com', type: 'academic', baseScore: 95, tier: 1, trustLevel: 'high' }],
  ['pubmed.ncbi.nlm.nih.gov', { domain: 'pubmed.ncbi.nlm.nih.gov', type: 'academic', baseScore: 98, tier: 1, trustLevel: 'high', specialization: ['medicine', 'biology'] }],
  ['arxiv.org', { domain: 'arxiv.org', type: 'academic', baseScore: 92, tier: 1, trustLevel: 'high', specialization: ['physics', 'cs', 'math'] }],
  ['nature.com', { domain: 'nature.com', type: 'academic', baseScore: 98, tier: 1, trustLevel: 'high' }],
  ['science.org', { domain: 'science.org', type: 'academic', baseScore: 98, tier: 1, trustLevel: 'high' }],
  ['ieee.org', { domain: 'ieee.org', type: 'academic', baseScore: 95, tier: 1, trustLevel: 'high', specialization: ['engineering', 'cs'] }],
  ['acm.org', { domain: 'acm.org', type: 'academic', baseScore: 95, tier: 1, trustLevel: 'high', specialization: ['cs'] }],
  ['jstor.org', { domain: 'jstor.org', type: 'academic', baseScore: 94, tier: 1, trustLevel: 'high' }],
  ['ssrn.com', { domain: 'ssrn.com', type: 'academic', baseScore: 88, tier: 1, trustLevel: 'high', specialization: ['economics', 'law', 'social'] }],
  ['researchgate.net', { domain: 'researchgate.net', type: 'academic', baseScore: 85, tier: 2, trustLevel: 'medium' }],

  // Government Sources (Base Score: 85-95)
  ['gov', { domain: 'gov', type: 'government', baseScore: 92, tier: 1, trustLevel: 'high' }],
  ['gov.uk', { domain: 'gov.uk', type: 'government', baseScore: 92, tier: 1, trustLevel: 'high' }],
  ['europa.eu', { domain: 'europa.eu', type: 'government', baseScore: 92, tier: 1, trustLevel: 'high' }],
  ['who.int', { domain: 'who.int', type: 'government', baseScore: 94, tier: 1, trustLevel: 'high', specialization: ['health'] }],
  ['cdc.gov', { domain: 'cdc.gov', type: 'government', baseScore: 95, tier: 1, trustLevel: 'high', specialization: ['health'] }],
  ['fda.gov', { domain: 'fda.gov', type: 'government', baseScore: 94, tier: 1, trustLevel: 'high', specialization: ['health', 'drugs'] }],
  ['nih.gov', { domain: 'nih.gov', type: 'government', baseScore: 96, tier: 1, trustLevel: 'high', specialization: ['health', 'medicine'] }],
  ['census.gov', { domain: 'census.gov', type: 'government', baseScore: 95, tier: 1, trustLevel: 'high', specialization: ['demographics', 'statistics'] }],
  ['bls.gov', { domain: 'bls.gov', type: 'government', baseScore: 95, tier: 1, trustLevel: 'high', specialization: ['economics', 'labor'] }],
  ['worldbank.org', { domain: 'worldbank.org', type: 'institutional', baseScore: 93, tier: 1, trustLevel: 'high', specialization: ['economics', 'development'] }],
  ['imf.org', { domain: 'imf.org', type: 'institutional', baseScore: 93, tier: 1, trustLevel: 'high', specialization: ['economics', 'finance'] }],

  // Institutional Sources (Base Score: 80-92)
  ['brookings.edu', { domain: 'brookings.edu', type: 'institutional', baseScore: 88, tier: 1, trustLevel: 'high' }],
  ['rand.org', { domain: 'rand.org', type: 'institutional', baseScore: 88, tier: 1, trustLevel: 'high' }],
  ['pewresearch.org', { domain: 'pewresearch.org', type: 'institutional', baseScore: 90, tier: 1, trustLevel: 'high', specialization: ['social', 'demographics'] }],
  ['stanford.edu', { domain: 'stanford.edu', type: 'academic', baseScore: 94, tier: 1, trustLevel: 'high' }],
  ['mit.edu', { domain: 'mit.edu', type: 'academic', baseScore: 94, tier: 1, trustLevel: 'high' }],
  ['harvard.edu', { domain: 'harvard.edu', type: 'academic', baseScore: 94, tier: 1, trustLevel: 'high' }],
  ['cambridge.org', { domain: 'cambridge.org', type: 'academic', baseScore: 93, tier: 1, trustLevel: 'high' }],
  ['oxford.ac.uk', { domain: 'oxford.ac.uk', type: 'academic', baseScore: 93, tier: 1, trustLevel: 'high' }],

  // News - Tier 1 (Base Score: 75-85)
  ['reuters.com', { domain: 'reuters.com', type: 'news_tier1', baseScore: 85, tier: 1, trustLevel: 'high' }],
  ['apnews.com', { domain: 'apnews.com', type: 'news_tier1', baseScore: 85, tier: 1, trustLevel: 'high' }],
  ['bbc.com', { domain: 'bbc.com', type: 'news_tier1', baseScore: 82, tier: 1, trustLevel: 'high' }],
  ['nytimes.com', { domain: 'nytimes.com', type: 'news_tier1', baseScore: 80, tier: 1, trustLevel: 'high' }],
  ['wsj.com', { domain: 'wsj.com', type: 'news_tier1', baseScore: 82, tier: 1, trustLevel: 'high', specialization: ['business', 'finance'] }],
  ['economist.com', { domain: 'economist.com', type: 'news_tier1', baseScore: 83, tier: 1, trustLevel: 'high', specialization: ['economics', 'politics'] }],
  ['ft.com', { domain: 'ft.com', type: 'news_tier1', baseScore: 83, tier: 1, trustLevel: 'high', specialization: ['business', 'finance'] }],
  ['theguardian.com', { domain: 'theguardian.com', type: 'news_tier1', baseScore: 78, tier: 1, trustLevel: 'medium' }],
  ['washingtonpost.com', { domain: 'washingtonpost.com', type: 'news_tier1', baseScore: 79, tier: 1, trustLevel: 'medium' }],
  ['bloomberg.com', { domain: 'bloomberg.com', type: 'news_tier1', baseScore: 82, tier: 1, trustLevel: 'high', specialization: ['business', 'finance'] }],

  // News - Tier 2 (Base Score: 60-75)
  ['cnn.com', { domain: 'cnn.com', type: 'news_tier2', baseScore: 70, tier: 2, trustLevel: 'medium' }],
  ['nbcnews.com', { domain: 'nbcnews.com', type: 'news_tier2', baseScore: 70, tier: 2, trustLevel: 'medium' }],
  ['cbsnews.com', { domain: 'cbsnews.com', type: 'news_tier2', baseScore: 70, tier: 2, trustLevel: 'medium' }],
  ['abcnews.go.com', { domain: 'abcnews.go.com', type: 'news_tier2', baseScore: 70, tier: 2, trustLevel: 'medium' }],
  ['politico.com', { domain: 'politico.com', type: 'news_tier2', baseScore: 72, tier: 2, trustLevel: 'medium', specialization: ['politics'] }],
  ['axios.com', { domain: 'axios.com', type: 'news_tier2', baseScore: 73, tier: 2, trustLevel: 'medium' }],
  ['vox.com', { domain: 'vox.com', type: 'news_tier2', baseScore: 68, tier: 2, trustLevel: 'medium' }],

  // Encyclopedia (Base Score: 70-85)
  ['wikipedia.org', { domain: 'wikipedia.org', type: 'encyclopedia', baseScore: 72, tier: 2, trustLevel: 'medium' }],
  ['britannica.com', { domain: 'britannica.com', type: 'encyclopedia', baseScore: 85, tier: 1, trustLevel: 'high' }],
  ['plato.stanford.edu', { domain: 'plato.stanford.edu', type: 'encyclopedia', baseScore: 90, tier: 1, trustLevel: 'high', specialization: ['philosophy'] }],

  // Technical Documentation (Base Score: 75-90)
  ['docs.python.org', { domain: 'docs.python.org', type: 'technical_docs', baseScore: 90, tier: 1, trustLevel: 'high', specialization: ['programming'] }],
  ['developer.mozilla.org', { domain: 'developer.mozilla.org', type: 'technical_docs', baseScore: 92, tier: 1, trustLevel: 'high', specialization: ['web'] }],
  ['docs.microsoft.com', { domain: 'docs.microsoft.com', type: 'technical_docs', baseScore: 88, tier: 1, trustLevel: 'high', specialization: ['programming'] }],
  ['cloud.google.com', { domain: 'cloud.google.com', type: 'technical_docs', baseScore: 88, tier: 1, trustLevel: 'high', specialization: ['cloud'] }],
  ['aws.amazon.com', { domain: 'aws.amazon.com', type: 'technical_docs', baseScore: 88, tier: 1, trustLevel: 'high', specialization: ['cloud'] }],
  ['rfc-editor.org', { domain: 'rfc-editor.org', type: 'technical_docs', baseScore: 95, tier: 1, trustLevel: 'high', specialization: ['networking', 'protocols'] }],

  // Corporate Sources (Base Score: 50-70)
  ['techcrunch.com', { domain: 'techcrunch.com', type: 'corporate', baseScore: 65, tier: 2, trustLevel: 'medium', specialization: ['tech'] }],
  ['wired.com', { domain: 'wired.com', type: 'corporate', baseScore: 68, tier: 2, trustLevel: 'medium', specialization: ['tech'] }],
  ['arstechnica.com', { domain: 'arstechnica.com', type: 'corporate', baseScore: 70, tier: 2, trustLevel: 'medium', specialization: ['tech'] }],
  ['theverge.com', { domain: 'theverge.com', type: 'corporate', baseScore: 65, tier: 2, trustLevel: 'medium', specialization: ['tech'] }],

  // Forums (Base Score: 30-50)
  ['stackoverflow.com', { domain: 'stackoverflow.com', type: 'forum', baseScore: 55, tier: 2, trustLevel: 'medium', specialization: ['programming'] }],
  ['reddit.com', { domain: 'reddit.com', type: 'forum', baseScore: 35, tier: 3, trustLevel: 'low' }],
  ['quora.com', { domain: 'quora.com', type: 'forum', baseScore: 40, tier: 3, trustLevel: 'low' }],
  ['hackernews.com', { domain: 'hackernews.com', type: 'forum', baseScore: 45, tier: 3, trustLevel: 'low', specialization: ['tech'] }],

  // Social Media (Base Score: 20-40)
  ['twitter.com', { domain: 'twitter.com', type: 'social_media', baseScore: 30, tier: 3, trustLevel: 'low' }],
  ['x.com', { domain: 'x.com', type: 'social_media', baseScore: 30, tier: 3, trustLevel: 'low' }],
  ['linkedin.com', { domain: 'linkedin.com', type: 'social_media', baseScore: 40, tier: 3, trustLevel: 'low' }],
  ['facebook.com', { domain: 'facebook.com', type: 'social_media', baseScore: 25, tier: 3, trustLevel: 'low' }],
  ['medium.com', { domain: 'medium.com', type: 'blog', baseScore: 45, tier: 3, trustLevel: 'low' }],
]);

// Source type base scores
const SOURCE_TYPE_SCORES: Record<SourceType, number> = {
  academic: 100,
  government: 95,
  institutional: 90,
  technical_docs: 85,
  news_tier1: 80,
  encyclopedia: 75,
  news_tier2: 70,
  corporate: 60,
  news_tier3: 50,
  forum: 40,
  blog: 35,
  social_media: 30,
  unknown: 25,
};

// ============================================================================
// SOURCE QUALITY SCORER
// ============================================================================

export interface SourceQualityScorerConfig {
  weights?: {
    typeWeight?: number;
    domainWeight?: number;
    freshnessWeight?: number;
    authorityWeight?: number;
    contentWeight?: number;
  };
  freshnessDecay?: {
    halfLifeDays?: number;
    maxPenalty?: number;
  };
  customDomains?: Map<string, DomainReputation>;
}

export class SourceQualityScorer extends EventEmitter {
  private config: Required<SourceQualityScorerConfig>;
  private domainCache: Map<string, DomainReputation>;
  private scoreCache: Map<string, QualityScore>;

  constructor(config: SourceQualityScorerConfig = {}) {
    super();

    this.config = {
      weights: {
        typeWeight: config.weights?.typeWeight ?? 0.30,
        domainWeight: config.weights?.domainWeight ?? 0.25,
        freshnessWeight: config.weights?.freshnessWeight ?? 0.15,
        authorityWeight: config.weights?.authorityWeight ?? 0.15,
        contentWeight: config.weights?.contentWeight ?? 0.15,
      },
      freshnessDecay: {
        halfLifeDays: config.freshnessDecay?.halfLifeDays ?? 365,
        maxPenalty: config.freshnessDecay?.maxPenalty ?? 30,
      },
      customDomains: config.customDomains ?? new Map(),
    };

    // Initialize domain cache with built-in + custom domains
    this.domainCache = new Map([...DOMAIN_REPUTATIONS, ...this.config.customDomains]);
    this.scoreCache = new Map();
  }

  /**
   * Score a source based on its metadata
   */
  async scoreSource(metadata: SourceMetadata): Promise<QualityScore> {
    // Check cache first
    const cacheKey = this.getCacheKey(metadata);
    if (this.scoreCache.has(cacheKey)) {
      return this.scoreCache.get(cacheKey)!;
    }

    const factors: QualityFactor[] = [];
    const weights = this.config.weights;

    // 1. Type Score
    const typeResult = this.calculateTypeScore(metadata);
    factors.push(typeResult.factor);

    // 2. Domain Score
    const domainResult = this.calculateDomainScore(metadata);
    factors.push(domainResult.factor);

    // 3. Freshness Score
    const freshnessResult = this.calculateFreshnessScore(metadata);
    factors.push(freshnessResult.factor);

    // 4. Authority Score
    const authorityResult = this.calculateAuthorityScore(metadata);
    factors.push(authorityResult.factor);

    // 5. Content Quality Score
    const contentResult = this.calculateContentScore(metadata);
    factors.push(contentResult.factor);

    // Calculate weighted overall score
    const overall = Math.round(
      typeResult.score * (weights.typeWeight ?? 0.30) +
      domainResult.score * (weights.domainWeight ?? 0.25) +
      freshnessResult.score * (weights.freshnessWeight ?? 0.15) +
      authorityResult.score * (weights.authorityWeight ?? 0.15) +
      contentResult.score * (weights.contentWeight ?? 0.15)
    );

    // Calculate confidence based on available metadata
    const confidence = this.calculateConfidence(metadata);

    const qualityScore: QualityScore = {
      overall: Math.min(100, Math.max(0, overall)),
      typeScore: typeResult.score,
      domainScore: domainResult.score,
      freshnessScore: freshnessResult.score,
      authorityScore: authorityResult.score,
      contentScore: contentResult.score,
      confidence,
      factors,
    };

    // Cache the result
    this.scoreCache.set(cacheKey, qualityScore);

    this.emit('source-scored', { metadata, score: qualityScore });

    return qualityScore;
  }

  /**
   * Batch score multiple sources
   */
  async scoreSources(sources: SourceMetadata[]): Promise<Map<string, QualityScore>> {
    const results = new Map<string, QualityScore>();

    await Promise.all(
      sources.map(async (source) => {
        const score = await this.scoreSource(source);
        results.set(source.url, score);
      })
    );

    return results;
  }

  /**
   * Get domain reputation for a URL
   */
  getDomainReputation(url: string): DomainReputation | null {
    const domain = this.extractDomain(url);
    return this.lookupDomain(domain);
  }

  /**
   * Classify source type from URL
   */
  classifySourceType(url: string): SourceType {
    const domain = this.extractDomain(url);
    const reputation = this.lookupDomain(domain);

    if (reputation) {
      return reputation.type;
    }

    // Heuristic classification for unknown domains
    return this.heuristicClassification(url, domain);
  }

  /**
   * Add or update custom domain reputation
   */
  addDomainReputation(reputation: DomainReputation): void {
    this.domainCache.set(reputation.domain, reputation);
    this.clearCacheForDomain(reputation.domain);
  }

  /**
   * Clear the score cache
   */
  clearCache(): void {
    this.scoreCache.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private calculateTypeScore(metadata: SourceMetadata): { score: number; factor: QualityFactor } {
    const sourceType = this.classifySourceType(metadata.url);
    const score = SOURCE_TYPE_SCORES[sourceType];

    return {
      score,
      factor: {
        name: 'Source Type',
        score,
        weight: this.config.weights.typeWeight ?? 0.30,
        reason: `Classified as ${sourceType} (base score: ${score})`,
      },
    };
  }

  private calculateDomainScore(metadata: SourceMetadata): { score: number; factor: QualityFactor } {
    const reputation = this.lookupDomain(metadata.domain);
    const domainWeight = this.config.weights.domainWeight ?? 0.25;

    if (reputation) {
      return {
        score: reputation.baseScore,
        factor: {
          name: 'Domain Reputation',
          score: reputation.baseScore,
          weight: domainWeight,
          reason: `Known domain: ${reputation.domain} (Tier ${reputation.tier}, ${reputation.trustLevel} trust)`,
        },
      };
    }

    // Unknown domain - apply penalties/bonuses based on TLD and structure
    let score = 50; // Base score for unknown domains
    let reason = 'Unknown domain';

    const domain = metadata.domain.toLowerCase();

    // TLD bonuses
    if (domain.endsWith('.edu')) {
      score += 25;
      reason = 'Educational TLD (.edu)';
    } else if (domain.endsWith('.gov')) {
      score += 30;
      reason = 'Government TLD (.gov)';
    } else if (domain.endsWith('.org')) {
      score += 10;
      reason = 'Organization TLD (.org)';
    } else if (domain.endsWith('.ac.uk') || domain.includes('.edu.')) {
      score += 20;
      reason = 'Academic institution';
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      factor: {
        name: 'Domain Reputation',
        score,
        weight: domainWeight,
        reason,
      },
    };
  }

  private calculateFreshnessScore(metadata: SourceMetadata): { score: number; factor: QualityFactor } {
    const freshnessWeight = this.config.weights.freshnessWeight ?? 0.15;

    if (!metadata.publishedDate && !metadata.lastUpdated) {
      return {
        score: 70, // Default score when date unknown
        factor: {
          name: 'Freshness',
          score: 70,
          weight: freshnessWeight,
          reason: 'Publication date unknown',
        },
      };
    }

    const referenceDate = metadata.lastUpdated ?? metadata.publishedDate!;
    const ageInDays = (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay based on half-life
    const halfLifeDays = this.config.freshnessDecay.halfLifeDays ?? 365;
    const maxPenalty = this.config.freshnessDecay.maxPenalty ?? 30;
    const decayFactor = Math.pow(0.5, ageInDays / halfLifeDays);
    const penalty = maxPenalty * (1 - decayFactor);
    const score = Math.max(0, 100 - penalty);

    let reason: string;
    if (ageInDays < 7) {
      reason = 'Published within the last week';
    } else if (ageInDays < 30) {
      reason = 'Published within the last month';
    } else if (ageInDays < 365) {
      reason = `Published ${Math.round(ageInDays / 30)} months ago`;
    } else {
      reason = `Published ${Math.round(ageInDays / 365)} years ago`;
    }

    return {
      score: Math.round(score),
      factor: {
        name: 'Freshness',
        score: Math.round(score),
        weight: freshnessWeight,
        reason,
      },
    };
  }

  private calculateAuthorityScore(metadata: SourceMetadata): { score: number; factor: QualityFactor } {
    const authorityWeight = this.config.weights.authorityWeight ?? 0.15;
    let score = 50; // Base score
    const reasons: string[] = [];

    // Citation count bonus
    if (metadata.citationCount !== undefined) {
      if (metadata.citationCount > 100) {
        score += 30;
        reasons.push(`Highly cited (${metadata.citationCount} citations)`);
      } else if (metadata.citationCount > 10) {
        score += 20;
        reasons.push(`Well cited (${metadata.citationCount} citations)`);
      } else if (metadata.citationCount > 0) {
        score += 10;
        reasons.push(`Some citations (${metadata.citationCount})`);
      }
    }

    // Backlinks bonus
    if (metadata.backlinks !== undefined) {
      if (metadata.backlinks > 1000) {
        score += 15;
        reasons.push('Many backlinks');
      } else if (metadata.backlinks > 100) {
        score += 10;
        reasons.push('Moderate backlinks');
      }
    }

    // PageRank bonus (if available)
    if (metadata.pageRank !== undefined) {
      score += Math.min(20, metadata.pageRank * 2);
      reasons.push(`PageRank: ${metadata.pageRank}`);
    }

    // Has author information
    if (metadata.author && metadata.hasAuthorBio) {
      score += 10;
      reasons.push('Identified author with bio');
    } else if (metadata.author) {
      score += 5;
      reasons.push('Identified author');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      factor: {
        name: 'Authority',
        score: Math.min(100, Math.max(0, score)),
        weight: authorityWeight,
        reason: reasons.length > 0 ? reasons.join('; ') : 'No authority signals found',
      },
    };
  }

  private calculateContentScore(metadata: SourceMetadata): { score: number; factor: QualityFactor } {
    const contentWeight = this.config.weights.contentWeight ?? 0.15;
    let score = 50; // Base score
    const reasons: string[] = [];

    // Has references
    if (metadata.hasReferences) {
      score += 25;
      reasons.push('Contains references/citations');
    }

    // Word count (substantial content)
    if (metadata.wordCount !== undefined) {
      if (metadata.wordCount > 2000) {
        score += 15;
        reasons.push('In-depth content');
      } else if (metadata.wordCount > 500) {
        score += 10;
        reasons.push('Substantial content');
      } else if (metadata.wordCount < 200) {
        score -= 10;
        reasons.push('Brief content');
      }
    }

    // Not paywalled (accessible)
    if (metadata.isPaywalled === false) {
      score += 5;
      reasons.push('Freely accessible');
    }

    // English content (for now, focusing on English sources)
    if (metadata.language === 'en') {
      score += 5;
      reasons.push('English language');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      factor: {
        name: 'Content Quality',
        score: Math.min(100, Math.max(0, score)),
        weight: contentWeight,
        reason: reasons.length > 0 ? reasons.join('; ') : 'Limited content signals',
      },
    };
  }

  private calculateConfidence(metadata: SourceMetadata): number {
    let confidence = 0.5; // Base confidence

    // More metadata = higher confidence
    if (metadata.publishedDate || metadata.lastUpdated) confidence += 0.1;
    if (metadata.author) confidence += 0.1;
    if (metadata.citationCount !== undefined) confidence += 0.1;
    if (metadata.wordCount !== undefined) confidence += 0.05;
    if (metadata.hasReferences !== undefined) confidence += 0.05;
    if (this.lookupDomain(metadata.domain)) confidence += 0.1;

    return Math.min(1, confidence);
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      // If URL parsing fails, try to extract domain manually
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      return match ? match[1] : url;
    }
  }

  private lookupDomain(domain: string): DomainReputation | null {
    // Direct lookup
    if (this.domainCache.has(domain)) {
      return this.domainCache.get(domain)!;
    }

    // Try parent domains (e.g., news.bbc.com -> bbc.com)
    const parts = domain.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (this.domainCache.has(parentDomain)) {
        return this.domainCache.get(parentDomain)!;
      }
    }

    // Try TLD-based lookup (e.g., anything.gov)
    const tld = parts.slice(-1)[0];
    if (this.domainCache.has(tld)) {
      return this.domainCache.get(tld)!;
    }

    return null;
  }

  private heuristicClassification(url: string, domain: string): SourceType {
    const urlLower = url.toLowerCase();
    const domainLower = domain.toLowerCase();

    // Academic indicators
    if (domainLower.includes('.edu') || domainLower.includes('.ac.') ||
        urlLower.includes('/journal') || urlLower.includes('/paper') ||
        urlLower.includes('/publication') || urlLower.includes('/research')) {
      return 'academic';
    }

    // Government indicators
    if (domainLower.includes('.gov') || domainLower.includes('.mil')) {
      return 'government';
    }

    // Documentation indicators
    if (urlLower.includes('/docs') || urlLower.includes('/documentation') ||
        urlLower.includes('/api/') || urlLower.includes('/reference')) {
      return 'technical_docs';
    }

    // News indicators
    if (urlLower.includes('/news') || urlLower.includes('/article') ||
        domainLower.includes('news') || domainLower.includes('times') ||
        domainLower.includes('post') || domainLower.includes('herald')) {
      return 'news_tier2'; // Default to tier 2 for unknown news
    }

    // Blog indicators
    if (urlLower.includes('/blog') || domainLower.includes('blog') ||
        domainLower.includes('medium.com') || domainLower.includes('substack')) {
      return 'blog';
    }

    // Forum indicators
    if (urlLower.includes('/forum') || urlLower.includes('/thread') ||
        urlLower.includes('/discussion') || urlLower.includes('/question')) {
      return 'forum';
    }

    return 'unknown';
  }

  private getCacheKey(metadata: SourceMetadata): string {
    return `${metadata.url}:${metadata.publishedDate?.getTime() ?? ''}:${metadata.lastUpdated?.getTime() ?? ''}`;
  }

  private clearCacheForDomain(domain: string): void {
    for (const key of this.scoreCache.keys()) {
      if (key.includes(domain)) {
        this.scoreCache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const sourceQualityScorer = new SourceQualityScorer();
