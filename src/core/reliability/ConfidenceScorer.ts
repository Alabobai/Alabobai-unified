/**
 * Alabobai Reliability Engine - Confidence Scorer
 * Scores confidence 0-100 for every AI response
 *
 * Solves: Perplexity hallucinations, unreliable outputs
 */

import { EventEmitter } from 'events';

// ============================================================================
// SOURCE QUALITY RANKING (Academic > News > Forum)
// ============================================================================

export enum SourceQuality {
  ACADEMIC = 100,        // Peer-reviewed journals, academic papers
  GOVERNMENT = 95,       // Official government sources
  SCIENTIFIC = 90,       // Scientific institutions (NASA, NIH, etc.)
  PRIMARY_NEWS = 80,     // Major news outlets (NYT, BBC, Reuters)
  PROFESSIONAL = 75,     // Professional organizations, official docs
  SECONDARY_NEWS = 65,   // Regional/smaller news outlets
  WIKI_VERIFIED = 60,    // Wikipedia with citations
  CORPORATE = 55,        // Company websites, press releases
  BLOG_EXPERT = 50,      // Expert blogs with credentials
  SOCIAL_VERIFIED = 40,  // Verified social accounts
  FORUM_EXPERT = 35,     // Stack Overflow, expert forums
  WIKI_UNVERIFIED = 30,  // Wikipedia without citations
  BLOG_GENERAL = 25,     // General blogs
  FORUM_GENERAL = 20,    // Reddit, general forums
  SOCIAL_GENERAL = 15,   // Unverified social media
  UNKNOWN = 10,          // Unknown or unverifiable source
  AI_GENERATED = 5,      // Known AI-generated content
}

export interface SourceInfo {
  url?: string;
  domain?: string;
  type: keyof typeof SourceQuality;
  quality: number;
  verified: boolean;
  citations?: string[];
  datePublished?: Date;
  author?: string;
  authorCredentials?: string;
}

// ============================================================================
// CONFIDENCE FACTORS
// ============================================================================

export interface ConfidenceFactors {
  sourceQuality: number;        // 0-100: Quality of underlying sources
  consistency: number;          // 0-100: Consistency with known facts
  specificity: number;          // 0-100: How specific vs vague the response is
  recency: number;              // 0-100: How current the information is
  verifiability: number;        // 0-100: Can claims be verified?
  hedging: number;              // 0-100: Inverse of uncertainty language
  citationDensity: number;      // 0-100: How well-cited is the response
  domainMatch: number;          // 0-100: Does response match user's domain
  crossReference: number;       // 0-100: Do multiple sources agree?
  modelConfidence: number;      // 0-100: LLM's own confidence signals
}

export interface ConfidenceScore {
  overall: number;              // 0-100 final score
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: ConfidenceFactors;
  explanation: string;
  warnings: string[];
  suggestions: string[];
  sources: SourceInfo[];
  timestamp: Date;
}

export interface ScoringConfig {
  weights: Partial<Record<keyof ConfidenceFactors, number>>;
  thresholds: {
    high: number;       // Above this = high confidence
    medium: number;     // Above this = medium confidence
    low: number;        // Below this = low confidence
  };
  penaltyFactors: {
    noSources: number;           // Penalty for no sources
    outdatedInfo: number;        // Penalty per year old
    hedgingWords: number;        // Penalty per hedge word
    contradictions: number;      // Penalty per contradiction
  };
}

// ============================================================================
// SOURCE DOMAIN CLASSIFICATION
// ============================================================================

const DOMAIN_CLASSIFICATIONS: Record<string, keyof typeof SourceQuality> = {
  // Academic
  'arxiv.org': 'ACADEMIC',
  'scholar.google.com': 'ACADEMIC',
  'pubmed.ncbi.nlm.nih.gov': 'ACADEMIC',
  'jstor.org': 'ACADEMIC',
  'nature.com': 'ACADEMIC',
  'science.org': 'ACADEMIC',
  'ieee.org': 'ACADEMIC',
  'acm.org': 'ACADEMIC',
  'springer.com': 'ACADEMIC',
  'wiley.com': 'ACADEMIC',

  // Government
  'gov': 'GOVERNMENT',
  'gov.uk': 'GOVERNMENT',
  'nih.gov': 'GOVERNMENT',
  'cdc.gov': 'GOVERNMENT',
  'fda.gov': 'GOVERNMENT',
  'sec.gov': 'GOVERNMENT',
  'irs.gov': 'GOVERNMENT',

  // Scientific
  'nasa.gov': 'SCIENTIFIC',
  'noaa.gov': 'SCIENTIFIC',
  'who.int': 'SCIENTIFIC',
  'sciencedirect.com': 'SCIENTIFIC',

  // Primary News
  'reuters.com': 'PRIMARY_NEWS',
  'apnews.com': 'PRIMARY_NEWS',
  'nytimes.com': 'PRIMARY_NEWS',
  'bbc.com': 'PRIMARY_NEWS',
  'bbc.co.uk': 'PRIMARY_NEWS',
  'theguardian.com': 'PRIMARY_NEWS',
  'wsj.com': 'PRIMARY_NEWS',
  'washingtonpost.com': 'PRIMARY_NEWS',
  'economist.com': 'PRIMARY_NEWS',

  // Professional
  'github.com': 'PROFESSIONAL',
  'docs.microsoft.com': 'PROFESSIONAL',
  'developer.mozilla.org': 'PROFESSIONAL',
  'cloud.google.com': 'PROFESSIONAL',
  'aws.amazon.com': 'PROFESSIONAL',

  // Forums
  'stackoverflow.com': 'FORUM_EXPERT',
  'stackexchange.com': 'FORUM_EXPERT',
  'reddit.com': 'FORUM_GENERAL',
  'quora.com': 'FORUM_GENERAL',

  // Wiki
  'wikipedia.org': 'WIKI_VERIFIED',

  // Social
  'twitter.com': 'SOCIAL_GENERAL',
  'x.com': 'SOCIAL_GENERAL',
  'facebook.com': 'SOCIAL_GENERAL',
  'linkedin.com': 'SOCIAL_VERIFIED',
};

// Hedging words that reduce confidence
const HEDGING_WORDS = [
  'might', 'maybe', 'possibly', 'perhaps', 'could be', 'seems like',
  'apparently', 'supposedly', 'allegedly', 'reportedly', 'I think',
  'I believe', 'in my opinion', 'it appears', 'it seems', 'likely',
  'probably', 'potentially', 'presumably', 'uncertain', 'unclear',
  'debatable', 'controversial', 'some say', 'some believe',
];

// Strong confidence indicators
const CONFIDENCE_INDICATORS = [
  'according to', 'research shows', 'studies indicate', 'evidence suggests',
  'data confirms', 'verified', 'confirmed', 'established', 'proven',
  'documented', 'officially', 'as stated in', 'per the',
];

// ============================================================================
// CONFIDENCE SCORER CLASS
// ============================================================================

export class ConfidenceScorer extends EventEmitter {
  private config: ScoringConfig;
  private scoreHistory: Map<string, ConfidenceScore[]> = new Map();

  constructor(config?: Partial<ScoringConfig>) {
    super();

    // Default configuration with factor weights
    this.config = {
      weights: {
        sourceQuality: 0.20,
        consistency: 0.15,
        specificity: 0.10,
        recency: 0.10,
        verifiability: 0.15,
        hedging: 0.05,
        citationDensity: 0.10,
        domainMatch: 0.05,
        crossReference: 0.05,
        modelConfidence: 0.05,
        ...config?.weights,
      },
      thresholds: {
        high: 80,
        medium: 60,
        low: 40,
        ...config?.thresholds,
      },
      penaltyFactors: {
        noSources: 30,
        outdatedInfo: 5,
        hedgingWords: 2,
        contradictions: 10,
        ...config?.penaltyFactors,
      },
    };
  }

  // ============================================================================
  // MAIN SCORING METHOD
  // ============================================================================

  async scoreResponse(
    response: string,
    context: {
      query: string;
      sources?: SourceInfo[];
      domain?: string;
      previousResponses?: string[];
      facts?: string[];
      modelMetadata?: Record<string, unknown>;
    }
  ): Promise<ConfidenceScore> {
    const startTime = Date.now();

    // Calculate all confidence factors
    const factors = await this.calculateFactors(response, context);

    // Calculate weighted overall score
    const overall = this.calculateOverallScore(factors);

    // Generate warnings and suggestions
    const warnings = this.generateWarnings(factors, response);
    const suggestions = this.generateSuggestions(factors, response);

    // Determine grade
    const grade = this.calculateGrade(overall);

    // Generate explanation
    const explanation = this.generateExplanation(factors, overall, grade);

    const score: ConfidenceScore = {
      overall: Math.round(overall),
      grade,
      factors,
      explanation,
      warnings,
      suggestions,
      sources: context.sources || [],
      timestamp: new Date(),
    };

    // Track history
    const queryKey = this.hashQuery(context.query);
    const history = this.scoreHistory.get(queryKey) || [];
    history.push(score);
    this.scoreHistory.set(queryKey, history.slice(-10)); // Keep last 10

    // Emit events
    this.emit('score-calculated', {
      score,
      duration: Date.now() - startTime,
    });

    if (overall < this.config.thresholds.low) {
      this.emit('low-confidence', { score, query: context.query });
    }

    return score;
  }

  // ============================================================================
  // FACTOR CALCULATIONS
  // ============================================================================

  private async calculateFactors(
    response: string,
    context: {
      query: string;
      sources?: SourceInfo[];
      domain?: string;
      previousResponses?: string[];
      facts?: string[];
      modelMetadata?: Record<string, unknown>;
    }
  ): Promise<ConfidenceFactors> {
    return {
      sourceQuality: this.calculateSourceQuality(context.sources),
      consistency: this.calculateConsistency(response, context.facts, context.previousResponses),
      specificity: this.calculateSpecificity(response),
      recency: this.calculateRecency(context.sources),
      verifiability: this.calculateVerifiability(response, context.sources),
      hedging: this.calculateHedging(response),
      citationDensity: this.calculateCitationDensity(response, context.sources),
      domainMatch: this.calculateDomainMatch(response, context.query, context.domain),
      crossReference: this.calculateCrossReference(context.sources),
      modelConfidence: this.extractModelConfidence(context.modelMetadata),
    };
  }

  private calculateSourceQuality(sources?: SourceInfo[]): number {
    if (!sources || sources.length === 0) {
      return 10; // Minimum score for no sources
    }

    const qualityScores = sources.map(s => s.quality);
    const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;

    // Bonus for multiple high-quality sources
    const highQualitySources = sources.filter(s => s.quality >= 70).length;
    const bonus = Math.min(highQualitySources * 5, 20);

    return Math.min(avgQuality + bonus, 100);
  }

  private calculateConsistency(
    response: string,
    facts?: string[],
    previousResponses?: string[]
  ): number {
    let score = 70; // Base score

    // Check consistency with known facts
    if (facts && facts.length > 0) {
      const contradictions = this.findContradictions(response, facts);
      score -= contradictions * this.config.penaltyFactors.contradictions;
    }

    // Check consistency with previous responses
    if (previousResponses && previousResponses.length > 0) {
      const consistencyWithPrevious = this.checkPreviousConsistency(response, previousResponses);
      score = (score + consistencyWithPrevious) / 2;
    }

    return Math.max(0, Math.min(score, 100));
  }

  private calculateSpecificity(response: string): number {
    // Analyze response for specificity
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);

    let specificityScore = 50; // Base score

    // Check for specific data points
    const hasNumbers = /\d+(\.\d+)?(%|years?|months?|days?|hours?|\$|USD|EUR)?/gi.test(response);
    const hasNames = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(response);
    const hasDates = /\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|January|February|March|April|May|June|July|August|September|October|November|December/i.test(response);
    const hasQuotes = /"[^"]+"|'[^']+'/.test(response);

    if (hasNumbers) specificityScore += 15;
    if (hasNames) specificityScore += 10;
    if (hasDates) specificityScore += 10;
    if (hasQuotes) specificityScore += 10;

    // Penalize vague language
    const vagueTerms = ['some', 'many', 'several', 'various', 'often', 'sometimes', 'generally'];
    const vagueCount = vagueTerms.reduce((count, term) => {
      return count + (response.toLowerCase().match(new RegExp(`\\b${term}\\b`, 'g'))?.length || 0);
    }, 0);
    specificityScore -= vagueCount * 2;

    return Math.max(0, Math.min(specificityScore, 100));
  }

  private calculateRecency(sources?: SourceInfo[]): number {
    if (!sources || sources.length === 0) {
      return 50; // Neutral score for no sources
    }

    const now = new Date();
    const sourcesWithDates = sources.filter(s => s.datePublished);

    if (sourcesWithDates.length === 0) {
      return 50;
    }

    const ageScores = sourcesWithDates.map(s => {
      const ageInYears = (now.getTime() - s.datePublished!.getTime()) / (1000 * 60 * 60 * 24 * 365);
      // Recent = high score, old = low score
      return Math.max(0, 100 - ageInYears * this.config.penaltyFactors.outdatedInfo);
    });

    return ageScores.reduce((a, b) => a + b, 0) / ageScores.length;
  }

  private calculateVerifiability(response: string, sources?: SourceInfo[]): number {
    let score = 30; // Base score

    // Boost for having verifiable sources
    if (sources && sources.length > 0) {
      const verifiedSources = sources.filter(s => s.verified).length;
      score += verifiedSources * 10;
    }

    // Check for verifiable claims (specific, checkable statements)
    const verifiableClaims = this.countVerifiableClaims(response);
    score += Math.min(verifiableClaims * 5, 30);

    // Check for confidence indicators
    const indicators = CONFIDENCE_INDICATORS.filter(ind =>
      response.toLowerCase().includes(ind.toLowerCase())
    );
    score += indicators.length * 5;

    return Math.max(0, Math.min(score, 100));
  }

  private calculateHedging(response: string): number {
    // Start with high score, reduce for hedging
    let score = 100;

    const responseWords = response.toLowerCase();
    const hedgeCount = HEDGING_WORDS.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      return count + (responseWords.match(regex)?.length || 0);
    }, 0);

    score -= hedgeCount * this.config.penaltyFactors.hedgingWords;

    return Math.max(0, Math.min(score, 100));
  }

  private calculateCitationDensity(response: string, sources?: SourceInfo[]): number {
    if (!sources || sources.length === 0) {
      return 0;
    }

    // Count inline citations
    const citationPatterns = [
      /\[[\d,\s]+\]/g,           // [1], [1, 2]
      /\(\d{4}\)/g,              // (2023)
      /\([A-Z][a-z]+,?\s*\d{4}\)/g, // (Smith, 2023)
      /according to \w+/gi,     // according to X
      /per \w+/gi,              // per X
      /\(source:?\s*[^)]+\)/gi, // (source: X)
    ];

    let citationCount = 0;
    for (const pattern of citationPatterns) {
      citationCount += (response.match(pattern)?.length || 0);
    }

    // Score based on citation density
    const sentenceCount = response.split(/[.!?]+/).filter(s => s.trim()).length;
    const density = citationCount / Math.max(sentenceCount, 1);

    // Ideal density is around 0.3-0.5 citations per sentence
    if (density >= 0.3) return 100;
    if (density >= 0.2) return 80;
    if (density >= 0.1) return 60;
    if (density > 0) return 40;
    return sources.length > 0 ? 20 : 0;
  }

  private calculateDomainMatch(response: string, query: string, domain?: string): number {
    if (!domain) {
      return 70; // Neutral score
    }

    // Check if response addresses the domain appropriately
    const domainKeywords: Record<string, string[]> = {
      medical: ['health', 'medical', 'doctor', 'treatment', 'diagnosis', 'symptom', 'medicine'],
      legal: ['law', 'legal', 'court', 'attorney', 'regulation', 'statute', 'rights'],
      financial: ['money', 'investment', 'stock', 'bond', 'tax', 'finance', 'budget'],
      technical: ['code', 'software', 'system', 'algorithm', 'data', 'technology'],
      scientific: ['research', 'study', 'experiment', 'hypothesis', 'data', 'analysis'],
    };

    const keywords = domainKeywords[domain.toLowerCase()] || [];
    if (keywords.length === 0) {
      return 70;
    }

    const matchCount = keywords.filter(kw =>
      response.toLowerCase().includes(kw)
    ).length;

    return Math.min((matchCount / keywords.length) * 100, 100);
  }

  private calculateCrossReference(sources?: SourceInfo[]): number {
    if (!sources || sources.length < 2) {
      return 50; // Need multiple sources to cross-reference
    }

    // Score based on number and diversity of sources
    const uniqueDomains = new Set(sources.map(s => s.domain)).size;
    const sourceCount = sources.length;

    // Multiple diverse sources = higher confidence
    let score = 50;
    score += Math.min(sourceCount * 5, 25);      // Up to +25 for count
    score += Math.min(uniqueDomains * 10, 25);   // Up to +25 for diversity

    return Math.min(score, 100);
  }

  private extractModelConfidence(metadata?: Record<string, unknown>): number {
    if (!metadata) {
      return 70; // Default neutral
    }

    // Extract confidence signals from model metadata
    const logprobs = metadata.logprobs as number | undefined;
    const finishReason = metadata.finish_reason as string | undefined;

    let score = 70;

    // Adjust based on log probabilities if available
    if (logprobs !== undefined) {
      // Higher logprobs = more confident
      score = Math.max(0, Math.min(100, 50 + logprobs * 10));
    }

    // Penalize if response was cut off
    if (finishReason === 'length') {
      score -= 20;
    }

    return Math.max(0, Math.min(score, 100));
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private findContradictions(response: string, facts: string[]): number {
    let contradictions = 0;

    // Simple contradiction detection
    // In production, use NLI (Natural Language Inference) model
    for (const fact of facts) {
      const factLower = fact.toLowerCase();
      const responseLower = response.toLowerCase();

      // Check for negation patterns
      if (factLower.includes('is') && responseLower.includes('is not') ||
          factLower.includes('can') && responseLower.includes('cannot') ||
          factLower.includes('will') && responseLower.includes('will not')) {
        contradictions++;
      }
    }

    return contradictions;
  }

  private checkPreviousConsistency(response: string, previous: string[]): number {
    // Simple consistency check based on key terms
    const responseTerms = this.extractKeyTerms(response);
    let consistencyScore = 70;

    for (const prev of previous) {
      const prevTerms = this.extractKeyTerms(prev);
      const overlap = responseTerms.filter(t => prevTerms.includes(t)).length;
      const similarity = overlap / Math.max(responseTerms.length, prevTerms.length);

      if (similarity > 0.5) {
        consistencyScore += 10;
      } else if (similarity < 0.2) {
        consistencyScore -= 10;
      }
    }

    return Math.max(0, Math.min(consistencyScore, 100));
  }

  private extractKeyTerms(text: string): string[] {
    // Extract significant words (simple approach)
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'or', 'and', 'but', 'if', 'then', 'that', 'this', 'it', 'its']);

    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
  }

  private countVerifiableClaims(response: string): number {
    // Count statements that could be independently verified
    const verifiablePatterns = [
      /\d+%/g,                           // Percentages
      /\$[\d,]+(\.\d{2})?/g,            // Dollar amounts
      /in \d{4}/g,                       // Specific years
      /on [A-Z][a-z]+ \d{1,2}/g,        // Specific dates
      /according to [A-Z][a-z]+/g,      // Attributed statements
      /research (shows|indicates|found)/gi,
      /study (shows|indicates|found)/gi,
    ];

    let count = 0;
    for (const pattern of verifiablePatterns) {
      count += (response.match(pattern)?.length || 0);
    }

    return count;
  }

  // ============================================================================
  // SCORING AND GRADING
  // ============================================================================

  private calculateOverallScore(factors: ConfidenceFactors): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, value] of Object.entries(factors)) {
      const weight = this.config.weights[key as keyof ConfidenceFactors] || 0.1;
      weightedSum += value * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private generateExplanation(
    factors: ConfidenceFactors,
    overall: number,
    grade: string
  ): string {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (factors.sourceQuality >= 70) {
      strengths.push('high-quality sources');
    } else if (factors.sourceQuality < 40) {
      weaknesses.push('low-quality or missing sources');
    }

    if (factors.specificity >= 70) {
      strengths.push('specific and detailed');
    } else if (factors.specificity < 40) {
      weaknesses.push('vague or general');
    }

    if (factors.hedging < 60) {
      weaknesses.push('uncertain language');
    }

    if (factors.crossReference >= 70) {
      strengths.push('cross-referenced across sources');
    }

    if (factors.verifiability >= 70) {
      strengths.push('verifiable claims');
    } else if (factors.verifiability < 40) {
      weaknesses.push('difficult to verify');
    }

    let explanation = `Confidence Grade: ${grade} (${Math.round(overall)}/100). `;

    if (strengths.length > 0) {
      explanation += `Strengths: ${strengths.join(', ')}. `;
    }

    if (weaknesses.length > 0) {
      explanation += `Areas of concern: ${weaknesses.join(', ')}.`;
    }

    return explanation;
  }

  private generateWarnings(factors: ConfidenceFactors, response: string): string[] {
    const warnings: string[] = [];

    if (factors.sourceQuality < 30) {
      warnings.push('No reliable sources backing this response');
    }

    if (factors.hedging < 50) {
      warnings.push('Response contains significant uncertainty');
    }

    if (factors.consistency < 50) {
      warnings.push('May contain inconsistencies with known facts');
    }

    if (factors.recency < 40) {
      warnings.push('Information may be outdated');
    }

    if (factors.verifiability < 30) {
      warnings.push('Claims are difficult to independently verify');
    }

    return warnings;
  }

  private generateSuggestions(factors: ConfidenceFactors, response: string): string[] {
    const suggestions: string[] = [];

    if (factors.sourceQuality < 50) {
      suggestions.push('Consider requesting academic or official sources');
    }

    if (factors.specificity < 50) {
      suggestions.push('Ask for more specific details or examples');
    }

    if (factors.crossReference < 50) {
      suggestions.push('Verify with additional independent sources');
    }

    if (factors.recency < 50) {
      suggestions.push('Check for more recent information');
    }

    return suggestions;
  }

  private hashQuery(query: string): string {
    // Simple hash for query tracking
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // ============================================================================
  // SOURCE CLASSIFICATION
  // ============================================================================

  classifySource(url: string): SourceInfo {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      // Check exact domain match
      let type: keyof typeof SourceQuality = 'UNKNOWN';
      let matched = false;

      for (const [domainPattern, classification] of Object.entries(DOMAIN_CLASSIFICATIONS)) {
        if (domain === domainPattern || domain.endsWith(`.${domainPattern}`)) {
          type = classification;
          matched = true;
          break;
        }
      }

      // Check TLD patterns (e.g., .gov, .edu)
      if (!matched) {
        if (domain.endsWith('.edu')) type = 'ACADEMIC';
        else if (domain.endsWith('.gov')) type = 'GOVERNMENT';
        else if (domain.endsWith('.org')) type = 'PROFESSIONAL';
      }

      return {
        url,
        domain,
        type,
        quality: SourceQuality[type],
        verified: type !== 'UNKNOWN',
      };
    } catch {
      return {
        url,
        type: 'UNKNOWN',
        quality: SourceQuality.UNKNOWN,
        verified: false,
      };
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getScoreHistory(query: string): ConfidenceScore[] {
    return this.scoreHistory.get(this.hashQuery(query)) || [];
  }

  getAverageConfidence(): number {
    let total = 0;
    let count = 0;

    for (const scores of this.scoreHistory.values()) {
      for (const score of scores) {
        total += score.overall;
        count++;
      }
    }

    return count > 0 ? total / count : 0;
  }

  clearHistory(): void {
    this.scoreHistory.clear();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createConfidenceScorer(config?: Partial<ScoringConfig>): ConfidenceScorer {
  return new ConfidenceScorer(config);
}
