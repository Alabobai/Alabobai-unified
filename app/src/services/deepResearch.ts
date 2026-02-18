/**
 * Deep Research Service
 * Performs REAL web research using multiple search engines and sources:
 *
 * Primary Strategy (when backend available):
 * 1. Multi-engine search (Brave, Google, Bing, DuckDuckGo, SearXNG)
 * 2. News search (Google News RSS)
 * 3. Wikipedia as supplemental source
 * 4. Fetch and extract content from web pages
 * 5. Use AI to analyze and synthesize information
 *
 * Fallback Strategy (client-side, CORS-friendly APIs):
 * 1. DuckDuckGo Instant Answer API
 * 2. Wikipedia API
 * 3. Wikidata API
 * 4. arXiv API (academic papers)
 * 5. Semantic Scholar API (academic papers)
 * 6. Open Library API (books)
 * 7. Reddit search (via pushshift or public RSS)
 * 8. Hacker News API
 * 9. GitHub code search (if relevant)
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
  source?: string
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
  sourceType?: 'wikipedia' | 'web' | 'news' | 'instant' | 'academic' | 'social' | 'code'
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

// Check if backend API is available
async function isBackendAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', limit: 1 }),
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Deep Research Engine
 * Orchestrates the entire research process with backend fallback
 */
export class DeepResearchEngine {
  private abortController: AbortController | null = null
  private isRunning = false
  private useBackend = true // Will be determined at runtime

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

    const maxSources = options?.maxSources || 10 // Increased for more comprehensive research
    const sources: ResearchSource[] = []

    try {
      // Check if backend is available
      callbacks?.onProgress?.({
        phase: 'searching',
        message: 'Initializing research...',
        progress: 2,
        sourcesFound: 0,
        sourcesProcessed: 0
      })

      this.useBackend = await isBackendAvailable()
      console.log(`[DeepResearch] Using ${this.useBackend ? 'backend API' : 'client-side'} search`)

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
          const results = this.useBackend
            ? await this.searchBackend(query)
            : await this.searchClientSide(query)
          results.forEach(r => callbacks?.onSourceFound?.(r))
          allSearchResults.push(...results)
        } catch (e) {
          console.warn(`Search failed for query "${query}":`, e)
        }
      }

      // Deduplicate by URL
      const uniqueResults = this.deduplicateResults(allSearchResults)
      const limitedResults = uniqueResults.slice(0, maxSources)

      // If no results found, try harder with different strategies
      if (limitedResults.length === 0) {
        callbacks?.onProgress?.({
          phase: 'searching',
          message: 'Expanding search...',
          progress: 15,
          sourcesFound: 0,
          sourcesProcessed: 0
        })

        // Try direct Wikipedia search as last resort
        const wikiResults = await this.searchWikipediaDirect(topic)
        wikiResults.forEach(r => callbacks?.onSourceFound?.(r))
        limitedResults.push(...wikiResults.slice(0, maxSources))
      }

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

      const successfulSources = sources.filter(s => !s.error && s.content.length > 50)

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
          // Use extractive summary as fallback
          source.summary = this.extractiveSummary(source.content, topic)
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
   * Generate multiple search queries from a topic for comprehensive web coverage
   */
  private async generateSearchQueries(topic: string): Promise<string[]> {
    // Base query
    const queries = [topic]

    // Add variations to get diverse web results
    const currentYear = new Date().getFullYear()

    // Detect query intent
    const isQuestion = /^(what|how|why|when|where|who|which|can|does|is|are)\b/i.test(topic)
    const isDefinition = /^(define|definition|meaning|what is)\b/i.test(topic)
    const isPerson = /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(topic) // Likely a name

    if (isQuestion) {
      // For questions, search the question itself and related terms
      queries.push(
        topic.replace(/\?/g, ''),
        `${topic} answer`,
        `${topic} explained`
      )
    } else if (isPerson) {
      // For people, search for their work and biography
      queries.push(
        `${topic} biography`,
        `${topic} works`,
        `${topic} achievements`
      )
    } else if (isDefinition) {
      // For definitions, keep it simple
      queries.push(
        topic.replace(/^(define|definition|meaning|what is)\s*/i, ''),
        `${topic} explanation`
      )
    } else {
      // General topics - diverse search strategies
      const variations = [
        `${topic} overview`,
        `${topic} ${currentYear}`,
        `${topic} research`,
        `${topic} analysis`,
        `what is ${topic}`,
        `${topic} news`,
      ]

      // Add 3-4 variations for comprehensive coverage
      queries.push(...variations.slice(0, 4))
    }

    // Remove duplicates
    return [...new Set(queries)]
  }

  /**
   * Search using the /api/search endpoint (backend with multi-engine support)
   * Falls back to client-side if backend returns no results
   */
  private async searchBackend(query: string, limit = 10): Promise<SearchResult[]> {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit,
          sources: ['all'] // Use all available search engines
        }),
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`)
      }

      const data = await response.json()

      // Log search info for debugging
      console.log(`[DeepResearch] Backend search returned ${data.count || 0} results from ${data.sources_searched || 1} sources`)
      if (data.errors?.length) {
        console.warn('[DeepResearch] Some search sources had errors:', data.errors)
      }

      const backendResults = (data.results || []).map((r: SearchResult) => ({
        ...r,
        source: r.source || 'backend'
      }))

      // If backend returned no results, fall back to client-side search
      if (backendResults.length === 0) {
        console.log('[DeepResearch] Backend returned no results, falling back to client-side search')
        return this.searchClientSide(query, limit)
      }

      return backendResults
    } catch (error) {
      console.error('Backend search error:', error)
      // Fallback to comprehensive client-side search
      return this.searchClientSide(query, limit)
    }
  }

  /**
   * Search using client-side CORS-friendly APIs
   * Uses MANY sources for comprehensive web coverage
   */
  private async searchClientSide(query: string, limit = 10): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    const failedSources: string[] = []

    console.log('[DeepResearch] Starting client-side search for:', query)

    // Search ALL sources in parallel for maximum coverage
    const searchPromises: { name: string; promise: Promise<SearchResult[]> }[] = [
      // Core web sources (always search)
      { name: 'DuckDuckGo', promise: this.searchDuckDuckGoInstant(query) },
      { name: 'Wikipedia', promise: this.searchWikipedia(query, 5) },
      { name: 'Wikidata', promise: this.searchWikidata(query, 3) },

      // News & social sources
      { name: 'HackerNews', promise: this.searchHackerNews(query, 5) },

      // Academic sources
      { name: 'arXiv', promise: this.searchArxiv(query, 3) },
      { name: 'SemanticScholar', promise: this.searchSemanticScholar(query, 3) },
      { name: 'OpenLibrary', promise: this.searchOpenLibrary(query, 2) },

      // Tech sources
      { name: 'GitHub', promise: this.searchGitHub(query, 3) },
      { name: 'StackOverflow', promise: this.searchStackOverflow(query, 2) },
    ]

    // Execute all searches with timeout
    const timeoutPromise = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), ms)
        ),
      ])

    const searchResults = await Promise.allSettled(
      searchPromises.map(({ name, promise }) =>
        timeoutPromise(promise, 8000).catch(err => {
          failedSources.push(`${name}: ${err.message}`)
          return [] as SearchResult[]
        })
      )
    )

    // Collect results
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i]
      const sourceName = searchPromises[i].name

      if (result.status === 'fulfilled' && result.value.length > 0) {
        console.log(`[DeepResearch] ${sourceName}: ${result.value.length} results`)
        results.push(...result.value)
      } else if (result.status === 'rejected') {
        failedSources.push(`${sourceName}: ${result.reason}`)
      }
    }

    if (failedSources.length > 0) {
      console.warn('[DeepResearch] Some sources failed:', failedSources)
    }

    console.log(`[DeepResearch] Total results before dedup: ${results.length}`)

    // Deduplicate and return
    const uniqueResults = this.deduplicateResults(results)
    console.log(`[DeepResearch] Unique results: ${uniqueResults.length}`)

    return uniqueResults.slice(0, limit)
  }

  /**
   * Search Wikipedia API (CORS-friendly) - Using query API for better results
   */
  private async searchWikipedia(query: string, limit = 5): Promise<SearchResult[]> {
    try {
      // Use Wikipedia's query API for better search results with snippets
      const searchUrl = `https://en.wikipedia.org/w/api.php?` +
        `action=query&list=search&srsearch=${encodeURIComponent(query)}` +
        `&srlimit=${limit}&format=json&origin=*&srprop=snippet|titlesnippet`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Wikipedia search failed: ${response.status}`)
      }

      const data = await response.json()
      const searchResults = data.query?.search || []

      return searchResults.map((result: { title: string; snippet: string }) => ({
        title: result.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
        snippet: result.snippet.replace(/<[^>]+>/g, ''), // Remove HTML tags
        source: 'wikipedia'
      }))
    } catch (error) {
      console.error('Wikipedia search error:', error)
      return []
    }
  }

  /**
   * Direct Wikipedia article search with content
   */
  private async searchWikipediaDirect(query: string): Promise<SearchResult[]> {
    try {
      // Search for Wikipedia articles
      const searchUrl = `https://en.wikipedia.org/w/api.php?` +
        `action=query&list=search&srsearch=${encodeURIComponent(query)}` +
        `&format=json&origin=*&srlimit=5`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Wikipedia direct search failed: ${response.status}`)
      }

      const data = await response.json()
      const searchResults = data.query?.search || []

      return searchResults.map((result: { title: string; snippet: string; pageid: number }) => ({
        title: result.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
        snippet: result.snippet.replace(/<[^>]+>/g, ''),
        source: 'wikipedia'
      }))
    } catch (error) {
      console.error('Wikipedia direct search error:', error)
      return []
    }
  }

  /**
   * Search DuckDuckGo Instant Answer API (CORS-friendly JSON API)
   */
  private async searchDuckDuckGoInstant(query: string): Promise<SearchResult[]> {
    try {
      // DuckDuckGo Instant Answer API
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed: ${response.status}`)
      }

      const data = await response.json()
      const results: SearchResult[] = []

      // Add Abstract if available
      if (data.Abstract && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.Abstract,
          source: 'duckduckgo'
        })
      }

      // Add Related Topics
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.FirstURL && topic.Text) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
              url: topic.FirstURL,
              snippet: topic.Text,
              source: 'duckduckgo'
            })
          }
          // Handle nested topics (categories)
          if (topic.Topics) {
            for (const subtopic of topic.Topics.slice(0, 2)) {
              if (subtopic.FirstURL && subtopic.Text) {
                results.push({
                  title: subtopic.Text.split(' - ')[0] || subtopic.Text.slice(0, 50),
                  url: subtopic.FirstURL,
                  snippet: subtopic.Text,
                  source: 'duckduckgo'
                })
              }
            }
          }
        }
      }

      // Add Infobox data if available
      if (data.Infobox?.content) {
        const infoContent = data.Infobox.content.slice(0, 3)
        for (const info of infoContent) {
          if (info.wiki_order !== undefined && data.AbstractURL) {
            // This is additional context, not a separate result
            continue
          }
        }
      }

      return results
    } catch (error) {
      console.error('DuckDuckGo search error:', error)
      return []
    }
  }

  /**
   * Search Wikidata (structured knowledge base, CORS-friendly)
   */
  private async searchWikidata(query: string, limit = 3): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&origin=*&limit=${limit}`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Wikidata search failed: ${response.status}`)
      }

      const data = await response.json()
      return (data.search || []).map((item: { id: string; label: string; description?: string; concepturi?: string }) => ({
        title: item.label,
        url: item.concepturi || `https://www.wikidata.org/wiki/${item.id}`,
        snippet: item.description || '',
        source: 'wikidata'
      }))
    } catch (error) {
      console.error('Wikidata search error:', error)
      return []
    }
  }

  /**
   * Search arXiv (academic papers, CORS-friendly)
   */
  private async searchArxiv(query: string, limit = 3): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`arXiv search failed: ${response.status}`)
      }

      const xml = await response.text()
      const results: SearchResult[] = []

      // Parse XML entries
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
      let match

      while ((match = entryRegex.exec(xml)) !== null && results.length < limit) {
        const entry = match[1]

        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i)
        const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i)
        const linkMatch = entry.match(/<id>([\s\S]*?)<\/id>/i)

        if (titleMatch && linkMatch) {
          results.push({
            title: titleMatch[1].replace(/\s+/g, ' ').trim(),
            url: linkMatch[1].trim().replace('http://', 'https://'),
            snippet: summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim().slice(0, 300) : '',
            source: 'arxiv'
          })
        }
      }

      return results
    } catch (error) {
      console.error('arXiv search error:', error)
      return []
    }
  }

  /**
   * Search Semantic Scholar (academic papers, CORS-friendly)
   */
  private async searchSemanticScholar(query: string, limit = 3): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,url,year,authors`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal,
        headers: {
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Semantic Scholar search failed: ${response.status}`)
      }

      const data = await response.json()
      return (data.data || []).map((paper: { title: string; abstract?: string; url?: string; paperId: string; year?: number; authors?: { name: string }[] }) => ({
        title: `${paper.title}${paper.year ? ` (${paper.year})` : ''}`,
        url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        snippet: paper.abstract ? paper.abstract.slice(0, 300) : (paper.authors ? `By ${paper.authors.slice(0, 3).map(a => a.name).join(', ')}` : ''),
        source: 'semantic-scholar'
      }))
    } catch (error) {
      console.error('Semantic Scholar search error:', error)
      return []
    }
  }

  /**
   * Search Open Library (books, CORS-friendly)
   */
  private async searchOpenLibrary(query: string, limit = 2): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Open Library search failed: ${response.status}`)
      }

      const data = await response.json()
      return (data.docs || []).slice(0, limit).map((book: { title: string; author_name?: string[]; key: string; first_publish_year?: number; subject?: string[] }) => ({
        title: `${book.title}${book.first_publish_year ? ` (${book.first_publish_year})` : ''}`,
        url: `https://openlibrary.org${book.key}`,
        snippet: book.author_name ? `By ${book.author_name.slice(0, 2).join(', ')}${book.subject ? `. Topics: ${book.subject.slice(0, 3).join(', ')}` : ''}` : '',
        source: 'openlibrary'
      }))
    } catch (error) {
      console.error('Open Library search error:', error)
      return []
    }
  }

  /**
   * Search GitHub (code repositories, CORS-friendly via API)
   */
  private async searchGitHub(query: string, limit = 3): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal,
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error(`GitHub search failed: ${response.status}`)
      }

      const data = await response.json()
      return (data.items || []).map((repo: { full_name: string; html_url: string; description?: string; stargazers_count: number; language?: string }) => ({
        title: repo.full_name,
        url: repo.html_url,
        snippet: `${repo.description || 'No description'}${repo.language ? ` [${repo.language}]` : ''} ⭐ ${repo.stargazers_count.toLocaleString()}`,
        source: 'github'
      }))
    } catch (error) {
      console.error('GitHub search error:', error)
      return []
    }
  }

  /**
   * Search Stack Overflow via StackExchange API (CORS-friendly)
   */
  private async searchStackOverflow(query: string, limit = 2): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&filter=!nNPvSNPI7A&pagesize=${limit}`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Stack Overflow search failed: ${response.status}`)
      }

      const data = await response.json()
      return (data.items || []).map((item: { title: string; link: string; score: number; answer_count: number; is_answered: boolean }) => ({
        title: this.decodeHTMLEntities(item.title),
        url: item.link,
        snippet: `Score: ${item.score} | ${item.answer_count} answers${item.is_answered ? ' ✓' : ''}`,
        source: 'stackoverflow'
      }))
    } catch (error) {
      console.error('Stack Overflow search error:', error)
      return []
    }
  }

  /**
   * Search Hacker News via Algolia API (CORS-friendly)
   */
  private async searchHackerNews(query: string, limit = 3): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`

      const response = await fetch(searchUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Hacker News search failed: ${response.status}`)
      }

      const data = await response.json()
      return (data.hits || []).map((hit: { title: string; url?: string; objectID: string; points: number; num_comments: number }) => ({
        title: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        snippet: `${hit.points} points | ${hit.num_comments} comments`,
        source: 'hackernews'
      }))
    } catch (error) {
      console.error('Hacker News search error:', error)
      return []
    }
  }

  /**
   * Decode HTML entities helper
   */
  private decodeHTMLEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&[a-z]+;/gi, ' ')
      .trim()
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
    // Determine source type from the source or URL
    const sourceType = this.determineSourceType(result)

    const source: ResearchSource = {
      id: crypto.randomUUID(),
      url: result.url,
      title: result.title,
      content: '',
      fetchedAt: new Date(),
      sourceType
    }

    // Handle different source types with specialized fetching
    if (result.url.includes('wikipedia.org')) {
      return this.fetchWikipediaContent(result, source)
    }

    if (result.url.includes('arxiv.org')) {
      return this.fetchArxivContent(result, source)
    }

    if (result.url.includes('semanticscholar.org')) {
      // Semantic Scholar snippets are usually good enough
      source.content = result.snippet || ''
      source.relevanceScore = source.content.length > 100 ? 0.8 : 0.5
      return source
    }

    if (result.url.includes('github.com')) {
      return this.fetchGitHubContent(result, source)
    }

    // For general web sources, try backend proxy first
    if (this.useBackend) {
      try {
        const proxyUrl = `/api/fetch-page?url=${encodeURIComponent(result.url)}`

        const response = await fetch(proxyUrl, {
          signal: this.abortController?.signal
        })

        if (response.ok) {
          const html = await response.text()
          source.content = this.extractMainContent(html)

          if (source.content && source.content.length >= 50) {
            source.relevanceScore = this.calculateRelevanceScore(source.content)
            return source
          }
        }
      } catch (error) {
        console.warn(`Backend fetch failed for ${result.url}:`, error)
      }
    }

    // Fallback: use snippet as content (many APIs provide good snippets)
    source.content = result.snippet || ''

    // Score based on snippet quality and source
    if (source.content.length > 200) {
      source.relevanceScore = 0.75
    } else if (source.content.length > 100) {
      source.relevanceScore = 0.6
    } else if (source.content.length > 50) {
      source.relevanceScore = 0.4
    } else {
      source.relevanceScore = 0.2
    }

    // Boost relevance for high-quality sources
    if (['arxiv', 'semantic-scholar', 'hackernews', 'github'].includes(result.source || '')) {
      source.relevanceScore = Math.min(1.0, source.relevanceScore + 0.15)
    }

    return source
  }

  /**
   * Determine the source type from the result
   */
  private determineSourceType(result: SearchResult): ResearchSource['sourceType'] {
    const url = result.url.toLowerCase()
    const src = result.source?.toLowerCase() || ''

    if (url.includes('wikipedia.org') || src === 'wikipedia') return 'wikipedia'
    if (url.includes('arxiv.org') || src === 'arxiv' || url.includes('semanticscholar') || src === 'semantic-scholar') return 'academic'
    if (url.includes('news.') || src === 'news' || src === 'hackernews') return 'news'
    if (url.includes('github.com') || url.includes('stackoverflow.com') || src === 'github' || src === 'stackoverflow') return 'code'
    if (url.includes('reddit.com') || src === 'reddit') return 'social'
    if (src === 'duckduckgo' && result.snippet && result.snippet.length > 200) return 'instant'

    return 'web'
  }

  /**
   * Fetch arXiv paper content via API
   */
  private async fetchArxivContent(result: SearchResult, source: ResearchSource): Promise<ResearchSource> {
    try {
      // Extract arXiv ID from URL
      const idMatch = result.url.match(/arxiv\.org\/abs\/(\d+\.\d+)/i)
      if (!idMatch) {
        source.content = result.snippet || ''
        source.relevanceScore = 0.5
        return source
      }

      const arxivId = idMatch[1]
      const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`

      const response = await fetch(apiUrl, {
        signal: this.abortController?.signal
      })

      if (response.ok) {
        const xml = await response.text()
        const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/i)

        if (summaryMatch) {
          source.content = summaryMatch[1].replace(/\s+/g, ' ').trim()
          source.relevanceScore = 0.9 // Academic papers are high quality
          source.sourceType = 'academic'
        }
      }
    } catch (error) {
      console.warn(`arXiv fetch failed for ${result.url}:`, error)
    }

    if (!source.content) {
      source.content = result.snippet || ''
      source.relevanceScore = 0.5
    }

    return source
  }

  /**
   * Fetch GitHub repository README content
   */
  private async fetchGitHubContent(result: SearchResult, source: ResearchSource): Promise<ResearchSource> {
    try {
      // Extract owner/repo from URL
      const repoMatch = result.url.match(/github\.com\/([^\/]+)\/([^\/]+)/i)
      if (!repoMatch) {
        source.content = result.snippet || ''
        source.relevanceScore = 0.5
        return source
      }

      const [, owner, repo] = repoMatch
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`

      const response = await fetch(apiUrl, {
        signal: this.abortController?.signal,
        headers: {
          'Accept': 'application/vnd.github.v3.raw'
        }
      })

      if (response.ok) {
        const readme = await response.text()
        // Take first 5000 chars of README
        source.content = readme.slice(0, 5000)
        source.relevanceScore = 0.8
        source.sourceType = 'code'
      }
    } catch (error) {
      console.warn(`GitHub fetch failed for ${result.url}:`, error)
    }

    if (!source.content) {
      source.content = result.snippet || ''
      source.relevanceScore = 0.5
    }

    return source
  }

  /**
   * Fetch Wikipedia article content directly via API
   */
  private async fetchWikipediaContent(result: SearchResult, source: ResearchSource): Promise<ResearchSource> {
    try {
      // Extract article title from URL
      const urlMatch = result.url.match(/\/wiki\/(.+)$/)
      if (!urlMatch) {
        throw new Error('Invalid Wikipedia URL')
      }

      const articleTitle = decodeURIComponent(urlMatch[1].replace(/_/g, ' '))

      // Fetch article extract via Wikipedia API
      const apiUrl = `https://en.wikipedia.org/w/api.php?` +
        `action=query&titles=${encodeURIComponent(articleTitle)}` +
        `&prop=extracts&exintro=false&explaintext=true` +
        `&format=json&origin=*&exlimit=1`

      const response = await fetch(apiUrl, {
        signal: this.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`Wikipedia API failed: ${response.status}`)
      }

      const data = await response.json()
      const pages = data.query?.pages || {}
      const page = Object.values(pages)[0] as { extract?: string; title?: string } | undefined

      if (page?.extract) {
        source.content = page.extract.slice(0, 10000)
        source.title = page.title || source.title
        source.relevanceScore = this.calculateRelevanceScore(source.content)
        source.sourceType = 'wikipedia'
      } else {
        source.content = result.snippet || ''
        source.relevanceScore = 0.3
        source.error = 'No content available'
      }

    } catch (error) {
      console.warn(`Wikipedia fetch failed for ${result.url}:`, error)
      source.content = result.snippet || ''
      source.error = error instanceof Error ? error.message : 'Unknown error'
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
   * Use AI to summarize a single source (with fallback)
   */
  private async summarizeSource(content: string, topic: string): Promise<string> {
    // Truncate content if too long
    const truncatedContent = content.slice(0, 4000)

    // Try backend AI first if available
    if (this.useBackend) {
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

        if (response.ok) {
          const data = await response.json()
          if (data.content) {
            return data.content
          }
        }
      } catch (error) {
        console.warn('Backend summarization failed:', error)
      }
    }

    // Fallback: use extractive summarization
    return this.extractiveSummary(content, topic)
  }

  /**
   * Extractive summarization (no AI needed)
   * Extracts the most relevant sentences from the content
   */
  private extractiveSummary(content: string, topic: string): string {
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const sentences = content
      .replace(/([.!?])\s+/g, '$1|SPLIT|')
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 30 && s.length < 500)

    if (sentences.length === 0) {
      return content.slice(0, 500)
    }

    // Score sentences by relevance to topic
    const scoredSentences = sentences.map(sentence => {
      const lowerSentence = sentence.toLowerCase()
      let score = 0

      // Score based on topic word matches
      for (const word of topicWords) {
        if (lowerSentence.includes(word)) {
          score += 2
        }
      }

      // Prefer sentences with numbers (often contain facts)
      if (/\d+/.test(sentence)) {
        score += 1
      }

      // Prefer sentences that start with capital letters after periods
      if (/^[A-Z]/.test(sentence)) {
        score += 0.5
      }

      // Slight preference for longer sentences (more information)
      score += Math.min(sentence.length / 200, 1)

      return { sentence, score }
    })

    // Sort by score and take top sentences
    scoredSentences.sort((a, b) => b.score - a.score)

    const selectedSentences = scoredSentences
      .slice(0, 5)
      .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
      .map(s => s.sentence)

    return selectedSentences.join(' ')
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

    // Try AI synthesis first if backend is available
    if (this.useBackend) {
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

        if (response.ok) {
          const data = await response.json()
          const reportContent = data.content || ''

          if (reportContent.length > 100) {
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
          }
        }
      } catch (error) {
        console.warn('AI synthesis failed:', error)
      }
    }

    // Fallback: Generate report from source summaries
    return this.generateClientSideReport(topic, sources, citations, startTime)
  }

  /**
   * Generate a report entirely client-side without AI
   */
  private generateClientSideReport(
    topic: string,
    sources: ResearchSource[],
    citations: Citation[],
    startTime: number
  ): ResearchReport {
    // Build summary from source summaries
    const summaryParts: string[] = []
    summaryParts.push(`This research report explores "${topic}" by analyzing ${sources.length} authoritative sources.`)

    // Get the first substantial content as overview
    const primarySource = sources.find(s => s.content.length > 200 && !s.error)
    if (primarySource) {
      const firstParagraph = primarySource.content.split(/[.!?]/).slice(0, 3).join('. ')
      if (firstParagraph.length > 100) {
        summaryParts.push(firstParagraph + '.')
      }
    }

    summaryParts.push(`The information has been compiled from ${sources.filter(s => s.sourceType === 'wikipedia').length || 0} Wikipedia articles and ${sources.filter(s => s.sourceType !== 'wikipedia').length || sources.length} other web sources.`)

    const summary = summaryParts.join('\n\n')

    // Extract key findings from summaries
    const keyFindings: string[] = []
    for (let i = 0; i < sources.length && keyFindings.length < 6; i++) {
      const source = sources[i]
      const content = source.summary || source.content

      // Extract key sentences as findings
      const sentences = content.split(/[.!?]/).filter(s => s.trim().length > 30 && s.trim().length < 200)

      for (const sentence of sentences.slice(0, 2)) {
        const finding = sentence.trim()
        if (finding && !keyFindings.some(f => f.toLowerCase() === finding.toLowerCase())) {
          keyFindings.push(`${finding} [${i + 1}]`)
          if (keyFindings.length >= 6) break
        }
      }
    }

    // Build detailed analysis
    const analysisSection: string[] = []
    analysisSection.push(`## Overview\n\n${topic} is a subject covered by multiple sources in this research compilation.`)

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      const content = source.summary || this.extractiveSummary(source.content, topic)

      if (content.length > 50) {
        analysisSection.push(`\n### From ${source.title} [${i + 1}]\n\n${content}`)
      }
    }

    const detailedAnalysis = analysisSection.join('\n')

    return {
      id: crypto.randomUUID(),
      topic,
      summary,
      keyFindings: keyFindings.length > 0 ? keyFindings : sources.slice(0, 5).map((s, i) => `${s.title} [${i + 1}]`),
      detailedAnalysis,
      sources,
      citations,
      generatedAt: new Date(),
      researchDuration: Date.now() - startTime
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
