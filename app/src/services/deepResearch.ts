/**
 * Deep Research Service
 * Performs real web research by:
 * 1. Searching using DuckDuckGo (via /api/search)
 * 2. Fetching and extracting content from web pages
 * 3. Using AI to analyze and synthesize information
 * 4. Generating comprehensive research reports with citations
 */

export type ResearchPhase =
  | 'idle'
  | 'searching'
  | 'fetching'
  | 'extracting'
  | 'analyzing'
  | 'synthesizing'
  | 'complete'
  | 'error'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface ResearchSource {
  id: string
  url: string
  title: string
  content: string
  summary?: string
  relevanceScore?: number
  fetchedAt: Date
  error?: string
}

export interface ResearchProgress {
  phase: ResearchPhase
  message: string
  progress: number // 0-100
  sourcesFound: number
  sourcesProcessed: number
  currentSource?: string
}

export interface ResearchReport {
  id: string
  topic: string
  summary: string
  keyFindings: string[]
  detailedAnalysis: string
  sources: ResearchSource[]
  citations: Citation[]
  generatedAt: Date
  researchDuration: number // in milliseconds
}

export interface Citation {
  number: number
  title: string
  url: string
  accessedAt: Date
}

// Callbacks for progress updates
export interface ResearchCallbacks {
  onProgress?: (progress: ResearchProgress) => void
  onSourceFound?: (source: SearchResult) => void
  onSourceProcessed?: (source: ResearchSource) => void
  onComplete?: (report: ResearchReport) => void
  onError?: (error: Error) => void
}

/**
 * Deep Research Engine
 * Orchestrates the entire research process
 */
export class DeepResearchEngine {
  private abortController: AbortController | null = null
  private isRunning = false

  /**
   * Perform comprehensive research on a topic
   */
  async research(
    topic: string,
    callbacks?: ResearchCallbacks,
    options?: {
      maxSources?: number
      searchQueries?: string[]
    }
  ): Promise<ResearchReport | null> {
    if (this.isRunning) {
      throw new Error('Research already in progress')
    }

    this.isRunning = true
    this.abortController = new AbortController()
    const startTime = Date.now()

    const maxSources = options?.maxSources || 5
    const sources: ResearchSource[] = []

    try {
      // Phase 1: Generate search queries
      callbacks?.onProgress?.({
        phase: 'searching',
        message: 'Generating search queries...',
        progress: 5,
        sourcesFound: 0,
        sourcesProcessed: 0
      })

      const searchQueries = options?.searchQueries || await this.generateSearchQueries(topic)

      // Phase 2: Search for sources
      callbacks?.onProgress?.({
        phase: 'searching',
        message: `Searching for: "${searchQueries[0]}"`,
        progress: 10,
        sourcesFound: 0,
        sourcesProcessed: 0
      })

      const allSearchResults: SearchResult[] = []

      for (const query of searchQueries) {
        if (this.abortController?.signal.aborted) break

        try {
          const results = await this.search(query)
          results.forEach(r => callbacks?.onSourceFound?.(r))
          allSearchResults.push(...results)
        } catch (e) {
          console.warn(`Search failed for query "${query}":`, e)
        }
      }

      // Deduplicate by URL
      const uniqueResults = this.deduplicateResults(allSearchResults)
      const limitedResults = uniqueResults.slice(0, maxSources)

      callbacks?.onProgress?.({
        phase: 'fetching',
        message: `Found ${limitedResults.length} sources. Fetching content...`,
        progress: 25,
        sourcesFound: limitedResults.length,
        sourcesProcessed: 0
      })

      // Phase 3: Fetch and extract content from each source
      for (let i = 0; i < limitedResults.length; i++) {
        if (this.abortController?.signal.aborted) break

        const result = limitedResults[i]

        callbacks?.onProgress?.({
          phase: 'extracting',
          message: `Reading: ${result.title}`,
          progress: 25 + (i / limitedResults.length) * 35,
          sourcesFound: limitedResults.length,
          sourcesProcessed: i,
          currentSource: result.url
        })

        const source = await this.fetchAndExtract(result)
        sources.push(source)
        callbacks?.onSourceProcessed?.(source)
      }

      // Phase 4: Analyze each source
      callbacks?.onProgress?.({
        phase: 'analyzing',
        message: 'Analyzing sources...',
        progress: 65,
        sourcesFound: limitedResults.length,
        sourcesProcessed: sources.length
      })

      const successfulSources = sources.filter(s => !s.error && s.content.length > 100)

      for (let i = 0; i < successfulSources.length; i++) {
        if (this.abortController?.signal.aborted) break

        const source = successfulSources[i]

        callbacks?.onProgress?.({
          phase: 'analyzing',
          message: `Analyzing: ${source.title.slice(0, 50)}...`,
          progress: 65 + (i / successfulSources.length) * 15,
          sourcesFound: limitedResults.length,
          sourcesProcessed: i + 1,
          currentSource: source.url
        })

        try {
          source.summary = await this.summarizeSource(source.content, topic)
        } catch (e) {
          console.warn(`Failed to summarize source: ${source.url}`, e)
        }
      }

      // Phase 5: Synthesize final report
      callbacks?.onProgress?.({
        phase: 'synthesizing',
        message: 'Synthesizing research report...',
        progress: 85,
        sourcesFound: limitedResults.length,
        sourcesProcessed: sources.length
      })

      const report = await this.synthesizeReport(topic, successfulSources, startTime)

      callbacks?.onProgress?.({
        phase: 'complete',
        message: 'Research complete!',
        progress: 100,
        sourcesFound: limitedResults.length,
        sourcesProcessed: sources.length
      })

      callbacks?.onComplete?.(report)

      return report

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(err)
      callbacks?.onProgress?.({
        phase: 'error',
        message: err.message,
        progress: 0,
        sourcesFound: sources.length,
        sourcesProcessed: sources.length
      })
      return null
    } finally {
      this.isRunning = false
      this.abortController = null
    }
  }

  /**
   * Stop ongoing research
   */
  stop() {
    this.abortController?.abort()
    this.isRunning = false
  }

  /**
   * Generate multiple search queries from a topic
   */
  private async generateSearchQueries(topic: string): Promise<string[]> {
    // Base query
    const queries = [topic]

    // Add variations to get diverse results
    const variations = [
      `${topic} overview`,
      `${topic} latest news 2024`,
      `${topic} explained`,
    ]

    queries.push(...variations.slice(0, 2))
    return queries
  }

  /**
   * Search using the /api/search endpoint
   */
  private async search(query: string, limit = 5): Promise<SearchResult[]> {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit }),
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`)
      }

      const data = await response.json()
      return data.results || []
    } catch (error) {
      console.error('Search error:', error)
      return []
    }
  }

  /**
   * Deduplicate search results by URL
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>()
    return results.filter(r => {
      const normalized = r.url.toLowerCase().replace(/\/$/, '')
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
  }

  /**
   * Fetch a web page and extract its main content
   */
  private async fetchAndExtract(result: SearchResult): Promise<ResearchSource> {
    const source: ResearchSource = {
      id: crypto.randomUUID(),
      url: result.url,
      title: result.title,
      content: '',
      fetchedAt: new Date()
    }

    try {
      // Use the proxy API to fetch pages (handles CORS)
      const proxyUrl = `/api/fetch-page?url=${encodeURIComponent(result.url)}`

      const response = await fetch(proxyUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        // If proxy fails, use the snippet as content
        throw new Error(`Fetch failed: ${response.status}`)
      }

      const html = await response.text()
      source.content = this.extractMainContent(html)

      // If content extraction failed, use snippet
      if (!source.content || source.content.length < 50) {
        source.content = result.snippet || ''
      }

      // Score relevance based on content length and structure
      source.relevanceScore = this.calculateRelevanceScore(source.content)

    } catch (error) {
      // On any error, use snippet as fallback content
      source.error = error instanceof Error ? error.message : 'Unknown error'
      source.content = result.snippet || ''
      source.relevanceScore = source.content.length > 0 ? 0.3 : 0.1
    }

    return source
  }

  /**
   * Extract main content from HTML
   */
  private extractMainContent(html: string): string {
    // Remove scripts, styles, and other non-content elements
    let content = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')

    // Try to find main content areas
    const mainContentPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      /<main[^>]*>([\s\S]*?)<\/main>/gi,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ]

    let mainContent = ''
    for (const pattern of mainContentPatterns) {
      const matches = content.match(pattern)
      if (matches && matches.length > 0) {
        mainContent = matches.join(' ')
        break
      }
    }

    // If no main content found, use body
    if (!mainContent) {
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      mainContent = bodyMatch ? bodyMatch[1] : content
    }

    // Convert HTML to plain text
    const text = mainContent
      // Remove all HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, ' ')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim()

    // Limit content length
    return text.slice(0, 10000)
  }

  /**
   * Calculate relevance score for content
   */
  private calculateRelevanceScore(content: string): number {
    // Simple heuristic: longer content with good structure scores higher
    const wordCount = content.split(/\s+/).length

    if (wordCount < 50) return 0.2
    if (wordCount < 200) return 0.5
    if (wordCount < 500) return 0.7
    if (wordCount < 1000) return 0.85
    return 1.0
  }

  /**
   * Use AI to summarize a single source
   */
  private async summarizeSource(content: string, topic: string): Promise<string> {
    // Truncate content if too long
    const truncatedContent = content.slice(0, 4000)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Summarize the following content in relation to the topic "${topic}". Focus on key facts, findings, and relevant information. Be concise (2-3 paragraphs max).

Content:
${truncatedContent}`
          }],
          stream: false
        }),
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status}`)
      }

      const data = await response.json()
      return data.content || 'Summary unavailable'
    } catch (error) {
      console.error('Summarization error:', error)
      // Return first part of content as fallback
      return content.slice(0, 500) + '...'
    }
  }

  /**
   * Synthesize all sources into a comprehensive report
   */
  private async synthesizeReport(
    topic: string,
    sources: ResearchSource[],
    startTime: number
  ): Promise<ResearchReport> {
    // Build citations
    const citations: Citation[] = sources.map((source, index) => ({
      number: index + 1,
      title: source.title,
      url: source.url,
      accessedAt: source.fetchedAt
    }))

    // Prepare source summaries for synthesis
    const sourceSummaries = sources
      .map((s, i) => `[${i + 1}] ${s.title}\n${s.summary || s.content.slice(0, 500)}`)
      .join('\n\n')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `You are a research analyst. Based on the following sources, create a comprehensive research report on "${topic}".

Structure your response EXACTLY as follows (use these exact headers):

## SUMMARY
A 2-3 paragraph executive summary of the key findings.

## KEY FINDINGS
- Finding 1
- Finding 2
- Finding 3
(List 4-6 key findings as bullet points)

## DETAILED ANALYSIS
A thorough analysis of the topic based on the sources. Include specific information and cite sources using [1], [2], etc.

Sources:
${sourceSummaries}

Remember to cite sources using bracket notation [1], [2], etc. throughout your analysis.`
          }],
          stream: false
        }),
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status}`)
      }

      const data = await response.json()
      const reportContent = data.content || ''

      // Parse the structured report
      const parsed = this.parseReportContent(reportContent)

      return {
        id: crypto.randomUUID(),
        topic,
        summary: parsed.summary,
        keyFindings: parsed.keyFindings,
        detailedAnalysis: parsed.detailedAnalysis,
        sources,
        citations,
        generatedAt: new Date(),
        researchDuration: Date.now() - startTime
      }
    } catch (error) {
      console.error('Report synthesis error:', error)

      // Return a basic report from source summaries
      return {
        id: crypto.randomUUID(),
        topic,
        summary: `Research on "${topic}" gathered information from ${sources.length} sources.`,
        keyFindings: sources.slice(0, 5).map(s => s.title),
        detailedAnalysis: sources.map(s => s.summary || s.content.slice(0, 500)).join('\n\n'),
        sources,
        citations,
        generatedAt: new Date(),
        researchDuration: Date.now() - startTime
      }
    }
  }

  /**
   * Parse structured report content
   */
  private parseReportContent(content: string): {
    summary: string
    keyFindings: string[]
    detailedAnalysis: string
  } {
    // Default values
    let summary = ''
    let keyFindings: string[] = []
    let detailedAnalysis = ''

    // Extract summary
    const summaryMatch = content.match(/## SUMMARY\s*([\s\S]*?)(?=## KEY FINDINGS|$)/i)
    if (summaryMatch) {
      summary = summaryMatch[1].trim()
    }

    // Extract key findings
    const findingsMatch = content.match(/## KEY FINDINGS\s*([\s\S]*?)(?=## DETAILED ANALYSIS|$)/i)
    if (findingsMatch) {
      keyFindings = findingsMatch[1]
        .split(/\n/)
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0)
    }

    // Extract detailed analysis
    const analysisMatch = content.match(/## DETAILED ANALYSIS\s*([\s\S]*?)$/i)
    if (analysisMatch) {
      detailedAnalysis = analysisMatch[1].trim()
    }

    // Fallback: if parsing failed, use the whole content
    if (!summary && !detailedAnalysis) {
      summary = content.slice(0, 500)
      detailedAnalysis = content
    }

    return { summary, keyFindings, detailedAnalysis }
  }
}

// Singleton instance
export const deepResearchEngine = new DeepResearchEngine()

/**
 * Helper function to format duration
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}
