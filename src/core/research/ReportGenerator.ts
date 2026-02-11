/**
 * Alabobai Deep Research Engine - Report Generator
 *
 * Generates comprehensive, structured research reports with:
 * - Executive summaries
 * - Detailed findings with inline citations
 * - Confidence scores for each claim
 * - Source quality analysis
 * - Multiple output formats (Markdown, HTML, JSON, PDF-ready)
 *
 * Designed to produce professional-grade research reports.
 */

import { EventEmitter } from 'events';
import { Citation, Claim, CitationTracker, citationTracker } from './CitationTracker.js';
import { ResearchResult, Finding, ResearchStatistics } from './ResearchOrchestrator.js';
import { QualityScore, SourceType } from './SourceQualityScorer.js';

// ============================================================================
// TYPES
// ============================================================================

export type ReportFormat = 'markdown' | 'html' | 'json' | 'text';

export type ReportStyle =
  | 'executive'      // Brief, high-level summary
  | 'detailed'       // Comprehensive with all findings
  | 'academic'       // Academic style with full citations
  | 'technical';     // Technical documentation style

export interface ReportOptions {
  format?: ReportFormat;
  style?: ReportStyle;
  includeExecutiveSummary?: boolean;
  includeConfidenceScores?: boolean;
  includeCitationAnalysis?: boolean;
  includeSourceBreakdown?: boolean;
  includeMethodology?: boolean;
  includeAppendix?: boolean;
  maxFindings?: number;
  minConfidence?: number;
  citationStyle?: 'inline' | 'footnote' | 'endnote';
  title?: string;
  author?: string;
  date?: Date;
}

export interface Report {
  id: string;
  title: string;
  query: string;
  format: ReportFormat;
  style: ReportStyle;
  content: string;
  sections: ReportSection[];
  metadata: ReportMetadata;
  generatedAt: Date;
}

export interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  content: string;
  order: number;
  citations?: string[];
  confidence?: number;
  subsections?: ReportSection[];
}

export type SectionType =
  | 'executive_summary'
  | 'introduction'
  | 'methodology'
  | 'findings'
  | 'analysis'
  | 'conclusion'
  | 'citations'
  | 'appendix'
  | 'source_analysis';

export interface ReportMetadata {
  totalFindings: number;
  totalCitations: number;
  averageConfidence: number;
  averageQualityScore: number;
  researchDuration: number;
  sourcesAnalyzed: number;
  generationTime: number;
  wordCount: number;
}

export interface FormattedCitation {
  id: string;
  number: number;
  formatted: string;
  url: string;
  qualityScore: number;
}

// ============================================================================
// REPORT GENERATOR
// ============================================================================

export interface ReportGeneratorConfig {
  citationTracker?: CitationTracker;
  defaultFormat?: ReportFormat;
  defaultStyle?: ReportStyle;
  enableSmartSummarization?: boolean;
  maxSummaryLength?: number;
}

export class ReportGenerator extends EventEmitter {
  private config: Required<ReportGeneratorConfig>;
  private citationNumberMap: Map<string, number>;

  constructor(config: ReportGeneratorConfig = {}) {
    super();

    this.config = {
      citationTracker: config.citationTracker ?? citationTracker,
      defaultFormat: config.defaultFormat ?? 'markdown',
      defaultStyle: config.defaultStyle ?? 'detailed',
      enableSmartSummarization: config.enableSmartSummarization ?? true,
      maxSummaryLength: config.maxSummaryLength ?? 500,
    };

    this.citationNumberMap = new Map();
  }

  // ============================================================================
  // MAIN GENERATION
  // ============================================================================

  /**
   * Generate a research report from results
   */
  async generateReport(
    result: ResearchResult,
    options: ReportOptions = {}
  ): Promise<Report> {
    const startTime = Date.now();

    const format = options.format ?? this.config.defaultFormat;
    const style = options.style ?? this.config.defaultStyle;

    // Reset citation numbering
    this.citationNumberMap.clear();
    result.citations.forEach((c, i) => {
      this.citationNumberMap.set(c.id, i + 1);
    });

    // Build sections based on style
    const sections = await this.buildSections(result, options, style);

    // Generate formatted content
    const content = this.formatReport(sections, format, options);

    // Calculate metadata
    const metadata = this.calculateMetadata(result, sections, startTime);

    const report: Report = {
      id: this.generateId('report'),
      title: options.title ?? this.generateTitle(result),
      query: result.query.query,
      format,
      style,
      content,
      sections,
      metadata,
      generatedAt: new Date(),
    };

    this.emit('report-generated', report);

    return report;
  }

  /**
   * Generate a quick summary from research results
   */
  generateQuickSummary(result: ResearchResult): string {
    const topFindings = result.findings
      .filter(f => f.confidence >= 0.5)
      .slice(0, 5);

    let summary = `## Research Summary: ${result.query.query}\n\n`;
    summary += `Found ${result.findings.length} findings from ${result.citations.length} sources.\n\n`;

    summary += '### Key Findings\n\n';
    for (const finding of topFindings) {
      const confidenceEmoji = finding.confidence >= 0.8 ? '[HIGH]' : finding.confidence >= 0.5 ? '[MEDIUM]' : '[LOW]';
      summary += `- ${finding.content} ${confidenceEmoji}\n`;
    }

    return summary;
  }

  // ============================================================================
  // SECTION BUILDING
  // ============================================================================

  private async buildSections(
    result: ResearchResult,
    options: ReportOptions,
    style: ReportStyle
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];
    let order = 0;

    // Executive Summary
    if (options.includeExecutiveSummary !== false && style !== 'technical') {
      sections.push({
        id: this.generateId('section'),
        type: 'executive_summary',
        title: 'Executive Summary',
        content: this.generateExecutiveSummary(result, options),
        order: order++,
        confidence: this.calculateAverageConfidence(result.findings),
      });
    }

    // Introduction
    sections.push({
      id: this.generateId('section'),
      type: 'introduction',
      title: 'Introduction',
      content: this.generateIntroduction(result, style),
      order: order++,
    });

    // Methodology (if requested)
    if (options.includeMethodology) {
      sections.push({
        id: this.generateId('section'),
        type: 'methodology',
        title: 'Research Methodology',
        content: this.generateMethodology(result),
        order: order++,
      });
    }

    // Main Findings
    const findingsSection = this.generateFindingsSection(result, options);
    findingsSection.order = order++;
    sections.push(findingsSection);

    // Analysis
    if (style === 'detailed' || style === 'academic') {
      sections.push({
        id: this.generateId('section'),
        type: 'analysis',
        title: 'Analysis',
        content: this.generateAnalysis(result, options),
        order: order++,
      });
    }

    // Source Quality Analysis (if requested)
    if (options.includeSourceBreakdown || options.includeCitationAnalysis) {
      sections.push({
        id: this.generateId('section'),
        type: 'source_analysis',
        title: 'Source Quality Analysis',
        content: this.generateSourceAnalysis(result),
        order: order++,
      });
    }

    // Conclusion
    sections.push({
      id: this.generateId('section'),
      type: 'conclusion',
      title: 'Conclusion',
      content: this.generateConclusion(result),
      order: order++,
    });

    // Citations/References
    sections.push({
      id: this.generateId('section'),
      type: 'citations',
      title: style === 'academic' ? 'References' : 'Sources',
      content: this.generateCitationsSection(result.citations, options),
      order: order++,
    });

    // Appendix (if requested)
    if (options.includeAppendix) {
      sections.push({
        id: this.generateId('section'),
        type: 'appendix',
        title: 'Appendix',
        content: this.generateAppendix(result),
        order: order++,
      });
    }

    return sections;
  }

  // ============================================================================
  // SECTION CONTENT GENERATORS
  // ============================================================================

  private generateExecutiveSummary(result: ResearchResult, options: ReportOptions): string {
    const topFindings = result.findings
      .filter(f => f.confidence >= (options.minConfidence ?? 0.5))
      .slice(0, 5);

    let summary = '';

    // Opening statement
    summary += `This report presents findings from comprehensive research on "${result.query.query}". `;
    summary += `Analysis of ${result.citations.length} sources yielded ${result.findings.length} key findings `;
    summary += `with an average confidence score of ${Math.round(this.calculateAverageConfidence(result.findings) * 100)}%.\n\n`;

    // Key takeaways
    summary += '**Key Takeaways:**\n\n';
    for (let i = 0; i < Math.min(topFindings.length, 3); i++) {
      const finding = topFindings[i];
      summary += `${i + 1}. ${finding.content}`;
      if (options.includeConfidenceScores) {
        summary += ` (Confidence: ${Math.round(finding.confidence * 100)}%)`;
      }
      summary += '\n';
    }

    // Statistics summary
    summary += '\n**Research Statistics:**\n';
    summary += `- Sources analyzed: ${result.statistics.sourcesSuccessful}\n`;
    summary += `- Unique findings: ${result.statistics.uniqueResults}\n`;
    summary += `- Average source quality: ${result.statistics.averageQualityScore}/100\n`;
    summary += `- Research duration: ${(result.statistics.executionTimeMs / 1000).toFixed(1)}s\n`;

    return summary;
  }

  private generateIntroduction(result: ResearchResult, style: ReportStyle): string {
    let intro = '';

    intro += `This ${style === 'academic' ? 'study' : 'report'} investigates the topic: "${result.query.query}". `;

    if (result.query.context) {
      intro += `Context: ${result.query.context} `;
    }

    intro += `\n\nThe research was conducted using a multi-source approach, querying ${result.statistics.totalSources} `;
    intro += `information sources across academic databases, news outlets, knowledge bases, and specialized repositories. `;

    if (result.query.depth) {
      const depthDescriptions = {
        quick: 'a rapid assessment',
        standard: 'a standard analysis',
        deep: 'an in-depth investigation',
        exhaustive: 'a comprehensive exhaustive analysis',
      };
      intro += `The research depth was configured for ${depthDescriptions[result.query.depth]}. `;
    }

    intro += `\n\nThe findings presented below are organized by relevance and confidence, `;
    intro += `with each claim supported by citations to original sources.`;

    return intro;
  }

  private generateMethodology(result: ResearchResult): string {
    let methodology = '';

    methodology += '### Research Approach\n\n';
    methodology += 'This research employed a systematic multi-source search methodology:\n\n';
    methodology += '1. **Query Decomposition**: The original query was analyzed and decomposed into ';
    methodology += 'targeted sub-queries to maximize coverage.\n\n';
    methodology += '2. **Parallel Source Search**: Multiple information sources were queried simultaneously, including:\n';
    methodology += '   - Academic databases (Google Scholar, PubMed, Semantic Scholar)\n';
    methodology += '   - News aggregators (NewsAPI, Google News)\n';
    methodology += '   - Knowledge bases (Wikipedia, Wikidata)\n';
    methodology += '   - Technical repositories (Stack Overflow, GitHub)\n\n';
    methodology += '3. **Quality Scoring**: Each source was evaluated using a multi-factor quality scoring system:\n';
    methodology += '   - Source type (academic=100, government=95, news tier 1=80, etc.)\n';
    methodology += '   - Domain reputation\n';
    methodology += '   - Content freshness\n';
    methodology += '   - Authority indicators (citations, backlinks)\n\n';
    methodology += '4. **Cross-Referencing**: Claims were cross-referenced across multiple sources ';
    methodology += 'to verify accuracy and establish confidence scores.\n\n';
    methodology += '5. **Result Aggregation**: Findings were deduplicated, ranked, and organized ';
    methodology += 'by confidence and relevance.\n\n';

    methodology += '### Limitations\n\n';
    methodology += '- Results are limited to publicly accessible sources\n';
    methodology += '- Some paywalled content may not have been fully analyzed\n';
    methodology += '- Real-time data may have changed since the research was conducted\n';

    return methodology;
  }

  private generateFindingsSection(result: ResearchResult, options: ReportOptions): ReportSection {
    const minConfidence = options.minConfidence ?? 0.3;
    const maxFindings = options.maxFindings ?? 50;

    const qualifiedFindings = result.findings
      .filter(f => f.confidence >= minConfidence)
      .slice(0, maxFindings);

    // Group findings by type
    const groupedFindings = this.groupFindingsByType(qualifiedFindings);

    let content = '';

    // High confidence findings
    const highConfidence = qualifiedFindings.filter(f => f.confidence >= 0.7);
    if (highConfidence.length > 0) {
      content += '### High Confidence Findings\n\n';
      content += this.formatFindingsList(highConfidence, result.citations, options);
    }

    // Medium confidence findings
    const mediumConfidence = qualifiedFindings.filter(f => f.confidence >= 0.4 && f.confidence < 0.7);
    if (mediumConfidence.length > 0) {
      content += '### Supporting Findings\n\n';
      content += this.formatFindingsList(mediumConfidence, result.citations, options);
    }

    // Lower confidence findings (if style is detailed)
    const lowerConfidence = qualifiedFindings.filter(f => f.confidence < 0.4);
    if (lowerConfidence.length > 0 && options.style === 'detailed') {
      content += '### Additional Findings (Lower Confidence)\n\n';
      content += this.formatFindingsList(lowerConfidence, result.citations, options);
    }

    // Subsections by finding type
    const subsections: ReportSection[] = [];
    for (const [type, findings] of Object.entries(groupedFindings)) {
      if (findings.length > 0) {
        subsections.push({
          id: this.generateId('subsection'),
          type: 'findings',
          title: this.findingTypeToTitle(type as Finding['type']),
          content: this.formatFindingsList(findings, result.citations, options),
          order: 0,
          confidence: this.calculateAverageConfidence(findings),
        });
      }
    }

    return {
      id: this.generateId('section'),
      type: 'findings',
      title: 'Research Findings',
      content,
      order: 0,
      subsections,
    };
  }

  private generateAnalysis(result: ResearchResult, options: ReportOptions): string {
    let analysis = '';

    // Confidence distribution
    const highConfCount = result.findings.filter(f => f.confidence >= 0.7).length;
    const medConfCount = result.findings.filter(f => f.confidence >= 0.4 && f.confidence < 0.7).length;
    const lowConfCount = result.findings.filter(f => f.confidence < 0.4).length;

    analysis += '### Confidence Distribution\n\n';
    analysis += `- High confidence (>70%): ${highConfCount} findings (${Math.round(highConfCount / result.findings.length * 100)}%)\n`;
    analysis += `- Medium confidence (40-70%): ${medConfCount} findings (${Math.round(medConfCount / result.findings.length * 100)}%)\n`;
    analysis += `- Lower confidence (<40%): ${lowConfCount} findings (${Math.round(lowConfCount / result.findings.length * 100)}%)\n\n`;

    // Source type distribution
    analysis += '### Source Distribution\n\n';
    const sourceTypes = this.countSourceTypes(result.citations);
    for (const [type, count] of Object.entries(sourceTypes)) {
      analysis += `- ${this.formatSourceType(type as SourceType)}: ${count} sources\n`;
    }

    // Cross-reference analysis
    analysis += '\n### Cross-Reference Analysis\n\n';
    const crossRefCitations = result.citations.filter(c => c.crossReferences.length > 0);
    analysis += `${crossRefCitations.length} of ${result.citations.length} citations `;
    analysis += `(${Math.round(crossRefCitations.length / result.citations.length * 100)}%) `;
    analysis += `were corroborated by other sources.\n`;

    // Verification status
    const verifiedCount = result.citations.filter(c => c.verificationStatus === 'verified').length;
    const partialCount = result.citations.filter(c => c.verificationStatus === 'partially').length;
    analysis += `\n- Fully verified: ${verifiedCount}\n`;
    analysis += `- Partially verified: ${partialCount}\n`;

    return analysis;
  }

  private generateSourceAnalysis(result: ResearchResult): string {
    let analysis = '';

    analysis += '### Quality Score Distribution\n\n';
    analysis += '| Quality Range | Count | Percentage |\n';
    analysis += '|---------------|-------|------------|\n';

    const ranges = [
      { min: 80, max: 100, label: 'Excellent (80-100)' },
      { min: 60, max: 79, label: 'Good (60-79)' },
      { min: 40, max: 59, label: 'Moderate (40-59)' },
      { min: 0, max: 39, label: 'Low (<40)' },
    ];

    for (const range of ranges) {
      const count = result.citations.filter(
        c => c.qualityScore.overall >= range.min && c.qualityScore.overall <= range.max
      ).length;
      const pct = Math.round(count / result.citations.length * 100);
      analysis += `| ${range.label} | ${count} | ${pct}% |\n`;
    }

    analysis += '\n### Top Quality Sources\n\n';
    const topSources = [...result.citations]
      .sort((a, b) => b.qualityScore.overall - a.qualityScore.overall)
      .slice(0, 5);

    for (const citation of topSources) {
      analysis += `1. **${citation.title}** (Score: ${citation.qualityScore.overall}/100)\n`;
      analysis += `   - ${citation.url}\n`;
      analysis += `   - Factors: ${citation.qualityScore.factors.map(f => f.name + ': ' + f.score).join(', ')}\n\n`;
    }

    return analysis;
  }

  private generateConclusion(result: ResearchResult): string {
    let conclusion = '';

    const avgConfidence = this.calculateAverageConfidence(result.findings);
    const avgQuality = result.statistics.averageQualityScore;

    conclusion += `This research on "${result.query.query}" yielded ${result.findings.length} findings `;
    conclusion += `from ${result.citations.length} sources. `;

    if (avgConfidence >= 0.7) {
      conclusion += 'The overall confidence in the findings is HIGH, ';
      conclusion += 'with strong cross-reference support across multiple quality sources. ';
    } else if (avgConfidence >= 0.4) {
      conclusion += 'The overall confidence in the findings is MODERATE, ';
      conclusion += 'with reasonable support from various sources. ';
    } else {
      conclusion += 'The overall confidence in the findings is LOWER, ';
      conclusion += 'suggesting this topic may benefit from additional research. ';
    }

    conclusion += `\n\nThe average source quality score of ${avgQuality}/100 indicates `;
    if (avgQuality >= 70) {
      conclusion += 'predominantly high-quality, authoritative sources were consulted.';
    } else if (avgQuality >= 50) {
      conclusion += 'a mix of quality sources were consulted.';
    } else {
      conclusion += 'further verification from higher-quality sources may be warranted.';
    }

    // Recommendations
    conclusion += '\n\n### Recommendations for Further Research\n\n';
    conclusion += '- Consult primary sources for high-stakes decisions\n';
    conclusion += '- Verify time-sensitive information with current data\n';
    if (avgConfidence < 0.6) {
      conclusion += '- Consider deeper research with academic databases\n';
    }

    return conclusion;
  }

  private generateCitationsSection(citations: Citation[], options: ReportOptions): string {
    const sortedCitations = [...citations].sort((a, b) =>
      (this.citationNumberMap.get(a.id) ?? 0) - (this.citationNumberMap.get(b.id) ?? 0)
    );

    let content = '';

    for (const citation of sortedCitations) {
      const num = this.citationNumberMap.get(citation.id) ?? 0;

      if (options.style === 'academic') {
        content += `[${num}] ${this.formatCitationAcademic(citation)}\n\n`;
      } else {
        content += `${num}. **${citation.title}**\n`;
        content += `   ${citation.url}\n`;
        if (citation.author) {
          content += `   Author: ${citation.author}\n`;
        }
        if (citation.publishedDate) {
          content += `   Published: ${citation.publishedDate.toLocaleDateString()}\n`;
        }
        content += `   Quality Score: ${citation.qualityScore.overall}/100\n\n`;
      }
    }

    return content;
  }

  private generateAppendix(result: ResearchResult): string {
    let appendix = '';

    appendix += '### Full Research Statistics\n\n';
    appendix += '```json\n';
    appendix += JSON.stringify(result.statistics, null, 2);
    appendix += '\n```\n\n';

    appendix += '### Research Query Details\n\n';
    appendix += '```json\n';
    appendix += JSON.stringify(result.query, null, 2);
    appendix += '\n```\n\n';

    return appendix;
  }

  // ============================================================================
  // FORMATTING
  // ============================================================================

  private formatReport(sections: ReportSection[], format: ReportFormat, options: ReportOptions): string {
    switch (format) {
      case 'markdown':
        return this.formatMarkdown(sections, options);
      case 'html':
        return this.formatHTML(sections, options);
      case 'json':
        return this.formatJSON(sections);
      case 'text':
        return this.formatPlainText(sections);
      default:
        return this.formatMarkdown(sections, options);
    }
  }

  private formatMarkdown(sections: ReportSection[], options: ReportOptions): string {
    let md = '';

    // Title
    if (options.title) {
      md += `# ${options.title}\n\n`;
    }

    // Metadata
    if (options.author) {
      md += `*Author: ${options.author}*\n\n`;
    }
    if (options.date) {
      md += `*Date: ${options.date.toLocaleDateString()}*\n\n`;
    }

    md += '---\n\n';

    // Table of Contents
    md += '## Table of Contents\n\n';
    for (const section of sections) {
      md += `- [${section.title}](#${this.slugify(section.title)})\n`;
    }
    md += '\n---\n\n';

    // Sections
    for (const section of sections) {
      md += `## ${section.title}\n\n`;
      md += section.content + '\n\n';

      if (section.subsections) {
        for (const subsection of section.subsections) {
          md += `### ${subsection.title}\n\n`;
          md += subsection.content + '\n\n';
        }
      }
    }

    return md;
  }

  private formatHTML(sections: ReportSection[], options: ReportOptions): string {
    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
    html += '<meta charset="UTF-8">\n';
    html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += `<title>${options.title ?? 'Research Report'}</title>\n`;
    html += '<style>\n';
    html += `
      body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
      h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
      h2 { color: #2a2a2a; margin-top: 2rem; }
      h3 { color: #3a3a3a; }
      .confidence { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
      .confidence.high { background: #d4edda; color: #155724; }
      .confidence.medium { background: #fff3cd; color: #856404; }
      .confidence.low { background: #f8d7da; color: #721c24; }
      .citation { color: #0066cc; text-decoration: none; }
      .citation:hover { text-decoration: underline; }
      blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 1rem; color: #666; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f5f5f5; }
      .toc { background: #f9f9f9; padding: 1rem; border-radius: 8px; }
      .toc ul { list-style: none; padding-left: 0; }
      .toc li { margin: 0.5rem 0; }
      .toc a { color: #0066cc; text-decoration: none; }
    `;
    html += '</style>\n</head>\n<body>\n';

    if (options.title) {
      html += `<h1>${this.escapeHtml(options.title)}</h1>\n`;
    }

    // Table of Contents
    html += '<nav class="toc">\n<h2>Table of Contents</h2>\n<ul>\n';
    for (const section of sections) {
      html += `<li><a href="#${this.slugify(section.title)}">${this.escapeHtml(section.title)}</a></li>\n`;
    }
    html += '</ul>\n</nav>\n';

    // Sections
    for (const section of sections) {
      html += `<section id="${this.slugify(section.title)}">\n`;
      html += `<h2>${this.escapeHtml(section.title)}</h2>\n`;
      html += this.markdownToHtml(section.content) + '\n';

      if (section.subsections) {
        for (const subsection of section.subsections) {
          html += `<h3>${this.escapeHtml(subsection.title)}</h3>\n`;
          html += this.markdownToHtml(subsection.content) + '\n';
        }
      }

      html += '</section>\n';
    }

    html += '</body>\n</html>';
    return html;
  }

  private formatJSON(sections: ReportSection[]): string {
    return JSON.stringify(sections, null, 2);
  }

  private formatPlainText(sections: ReportSection[]): string {
    let text = '';

    for (const section of sections) {
      text += `\n${'='.repeat(section.title.length)}\n`;
      text += `${section.title.toUpperCase()}\n`;
      text += `${'='.repeat(section.title.length)}\n\n`;
      text += this.stripMarkdown(section.content) + '\n';

      if (section.subsections) {
        for (const subsection of section.subsections) {
          text += `\n${subsection.title}\n`;
          text += `${'-'.repeat(subsection.title.length)}\n\n`;
          text += this.stripMarkdown(subsection.content) + '\n';
        }
      }
    }

    return text;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private formatFindingsList(findings: Finding[], citations: Citation[], options: ReportOptions): string {
    let content = '';

    for (const finding of findings) {
      content += `- ${finding.content}`;

      // Add confidence score if requested
      if (options.includeConfidenceScores) {
        const confLevel = finding.confidence >= 0.7 ? 'HIGH' : finding.confidence >= 0.4 ? 'MEDIUM' : 'LOW';
        content += ` [${confLevel}: ${Math.round(finding.confidence * 100)}%]`;
      }

      // Add inline citations
      if (finding.citations.length > 0 && options.citationStyle !== 'endnote') {
        const citNums = finding.citations
          .map(citId => this.citationNumberMap.get(citId))
          .filter(Boolean)
          .join(', ');
        content += ` [${citNums}]`;
      }

      content += '\n';
    }

    return content;
  }

  private formatCitationAcademic(citation: Citation): string {
    const author = citation.author ?? 'Unknown Author';
    const year = citation.publishedDate?.getFullYear() ?? 'n.d.';
    const title = citation.title;
    const url = citation.url;

    return `${author} (${year}). "${title}." Retrieved from ${url}`;
  }

  private groupFindingsByType(findings: Finding[]): Record<Finding['type'], Finding[]> {
    const grouped: Record<Finding['type'], Finding[]> = {
      fact: [],
      insight: [],
      trend: [],
      opinion: [],
      data: [],
    };

    for (const finding of findings) {
      grouped[finding.type].push(finding);
    }

    return grouped;
  }

  private findingTypeToTitle(type: Finding['type']): string {
    const titles: Record<Finding['type'], string> = {
      fact: 'Factual Information',
      insight: 'Key Insights',
      trend: 'Trends & Patterns',
      opinion: 'Expert Opinions',
      data: 'Data & Statistics',
    };
    return titles[type];
  }

  private countSourceTypes(citations: Citation[]): Partial<Record<SourceType, number>> {
    const counts: Partial<Record<SourceType, number>> = {};

    for (const citation of citations) {
      const domain = citation.sourceMetadata.domain;
      // Simple type inference - in production would use the quality scorer
      let type: SourceType = 'unknown';
      if (domain.includes('.edu') || domain.includes('scholar') || domain.includes('pubmed')) {
        type = 'academic';
      } else if (domain.includes('.gov')) {
        type = 'government';
      } else if (domain.includes('news') || domain.includes('bbc') || domain.includes('reuters')) {
        type = 'news_tier1';
      } else if (domain.includes('wikipedia')) {
        type = 'encyclopedia';
      }

      counts[type] = (counts[type] ?? 0) + 1;
    }

    return counts;
  }

  private formatSourceType(type: SourceType): string {
    const labels: Record<SourceType, string> = {
      academic: 'Academic/Scholarly',
      government: 'Government',
      institutional: 'Institutional',
      news_tier1: 'Tier 1 News',
      news_tier2: 'Tier 2 News',
      news_tier3: 'Tier 3 News',
      encyclopedia: 'Encyclopedia',
      technical_docs: 'Technical Docs',
      corporate: 'Corporate',
      social_media: 'Social Media',
      forum: 'Forum',
      blog: 'Blog',
      unknown: 'Other',
    };
    return labels[type] ?? type;
  }

  private calculateAverageConfidence(findings: Finding[]): number {
    if (findings.length === 0) return 0;
    return findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;
  }

  private calculateMetadata(result: ResearchResult, sections: ReportSection[], startTime: number): ReportMetadata {
    const content = sections.map(s => s.content).join(' ');
    const wordCount = content.split(/\s+/).length;

    return {
      totalFindings: result.findings.length,
      totalCitations: result.citations.length,
      averageConfidence: this.calculateAverageConfidence(result.findings),
      averageQualityScore: result.statistics.averageQualityScore,
      researchDuration: result.statistics.executionTimeMs,
      sourcesAnalyzed: result.statistics.totalSources,
      generationTime: Date.now() - startTime,
      wordCount,
    };
  }

  private generateTitle(result: ResearchResult): string {
    const query = result.query.query;
    if (query.length <= 60) {
      return `Research Report: ${query}`;
    }
    return `Research Report: ${query.substring(0, 57)}...`;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private markdownToHtml(md: string): string {
    // Simple markdown to HTML conversion
    let html = md
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\[(\d+)\]/g, '<sup class="citation">[$1]</sup>');

    // Wrap list items
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    return `<p>${html}</p>`;
  }

  private stripMarkdown(md: string): string {
    return md
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^\- /gm, '  - ');
  }
}

// Export singleton instance
export const reportGenerator = new ReportGenerator();
