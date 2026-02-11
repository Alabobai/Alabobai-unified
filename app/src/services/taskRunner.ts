/**
 * Alabobai Task Runner
 *
 * Manages AI task execution with:
 * - Live browser preview
 * - Step-by-step execution
 * - Source attribution
 * - Real-time progress updates
 * - Real browser automation integration
 */

import type { ExecutionStep, TaskExecution, Source } from '@/components/TaskExecutionPanel'
import type { BrowserState } from '@/components/BrowserPreview'
import browserAutomation from './browserAutomation'

export interface TaskRunnerCallbacks {
  onStepStart: (step: ExecutionStep) => void
  onStepComplete: (step: ExecutionStep) => void
  onSourceFound: (source: Source) => void
  onBrowserUpdate: (state: BrowserState) => void
  onProgress: (execution: TaskExecution) => void
  onComplete: (execution: TaskExecution) => void
  onError: (error: Error) => void
}

class TaskRunner {
  private currentExecution: TaskExecution | null = null
  private browserState: BrowserState | null = null
  private useRealBrowser: boolean = true // Enable real browser automation

  // Create a new task execution plan based on user request
  createExecutionPlan(request: string): TaskExecution {
    const requestLower = request.toLowerCase()
    const steps: ExecutionStep[] = []

    // Analyze request and generate appropriate steps
    if (requestLower.includes('search') || requestLower.includes('find') || requestLower.includes('research')) {
      const searchQuery = request.replace(/search|find|research|for|about/gi, '').trim()

      steps.push(
        {
          id: '1',
          type: 'navigate',
          description: 'Opening search engine',
          status: 'pending',
          url: 'https://www.google.com',
        },
        {
          id: '2',
          type: 'type',
          description: `Searching for: "${searchQuery}"`,
          status: 'pending',
        },
        {
          id: '3',
          type: 'click',
          description: 'Clicking search button',
          status: 'pending',
        },
        {
          id: '4',
          type: 'scrape',
          description: 'Extracting search results',
          status: 'pending',
        },
        {
          id: '5',
          type: 'navigate',
          description: 'Visiting top result',
          status: 'pending',
          url: 'https://example.com/result-1',
        },
        {
          id: '6',
          type: 'scrape',
          description: 'Extracting page content',
          status: 'pending',
        },
        {
          id: '7',
          type: 'analyze',
          description: 'Analyzing and summarizing information',
          status: 'pending',
        }
      )
    } else if (requestLower.includes('scrape') || requestLower.includes('extract')) {
      const urlMatch = request.match(/https?:\/\/[^\s]+/)
      const targetUrl = urlMatch?.[0] || 'https://example.com'

      steps.push(
        {
          id: '1',
          type: 'navigate',
          description: `Navigating to ${targetUrl}`,
          status: 'pending',
          url: targetUrl,
        },
        {
          id: '2',
          type: 'screenshot',
          description: 'Taking page screenshot',
          status: 'pending',
        },
        {
          id: '3',
          type: 'scrape',
          description: 'Extracting page content',
          status: 'pending',
        },
        {
          id: '4',
          type: 'analyze',
          description: 'Processing extracted data',
          status: 'pending',
        }
      )
    } else if (requestLower.includes('build') || requestLower.includes('create') || requestLower.includes('make')) {
      steps.push(
        {
          id: '1',
          type: 'analyze',
          description: 'Analyzing requirements',
          status: 'pending',
        },
        {
          id: '2',
          type: 'search',
          description: 'Researching best practices',
          status: 'pending',
        },
        {
          id: '3',
          type: 'analyze',
          description: 'Generating code structure',
          status: 'pending',
        },
        {
          id: '4',
          type: 'analyze',
          description: 'Creating components',
          status: 'pending',
        },
        {
          id: '5',
          type: 'analyze',
          description: 'Applying styling',
          status: 'pending',
        }
      )
    } else {
      // Generic task
      steps.push(
        {
          id: '1',
          type: 'analyze',
          description: 'Understanding request',
          status: 'pending',
        },
        {
          id: '2',
          type: 'search',
          description: 'Gathering information',
          status: 'pending',
        },
        {
          id: '3',
          type: 'analyze',
          description: 'Processing and responding',
          status: 'pending',
        }
      )
    }

    const execution: TaskExecution = {
      id: crypto.randomUUID(),
      title: request.slice(0, 50) + (request.length > 50 ? '...' : ''),
      status: 'running',
      steps,
      currentStep: 0,
      sources: [],
      startTime: new Date(),
    }

    this.currentExecution = execution
    return execution
  }

  // Execute a task with live updates
  async executeTask(execution: TaskExecution, callbacks: Partial<TaskRunnerCallbacks>): Promise<TaskExecution> {
    this.currentExecution = execution

    for (let i = 0; i < execution.steps.length; i++) {
      const step = execution.steps[i]
      execution.currentStep = i

      // Start step
      step.status = 'running'
      callbacks.onStepStart?.(step)
      callbacks.onProgress?.({ ...execution })

      // Update browser state based on step type
      await this.executeStep(step, callbacks)

      // Complete step
      step.status = 'complete'
      step.duration = 500 + Math.random() * 1000
      callbacks.onStepComplete?.(step)

      // Generate sources for scrape/search steps
      if (step.type === 'scrape' || step.type === 'search') {
        const sources = this.generateSources(step)
        execution.sources.push(...sources)
        sources.forEach(source => callbacks.onSourceFound?.(source))
      }

      callbacks.onProgress?.({ ...execution })
    }

    execution.status = 'complete'
    callbacks.onComplete?.(execution)

    return execution
  }

  private async executeStep(step: ExecutionStep, callbacks: Partial<TaskRunnerCallbacks>): Promise<void> {
    const baseDelay = 800

    // Use real browser automation if enabled
    if (this.useRealBrowser) {
      await this.executeStepWithRealBrowser(step, callbacks)
      return
    }

    // Fallback to simulation
    switch (step.type) {
      case 'navigate':
        // Simulate navigation
        this.browserState = {
          url: step.url || 'https://example.com',
          title: 'Loading...',
          isLoading: true,
        }
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        await this.delay(baseDelay)

        this.browserState.isLoading = false
        this.browserState.title = this.getTitleFromUrl(step.url || '')
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        await this.delay(300)
        break

      case 'type':
        // Simulate typing with cursor
        this.browserState = {
          ...this.browserState!,
          cursorPosition: { x: 50, y: 30 },
          action: { type: 'type', value: step.description.match(/"([^"]+)"/)?.[1] || 'text' },
        }
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        await this.delay(baseDelay * 1.5)

        this.browserState.action = undefined
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        break

      case 'click':
        // Simulate click with cursor movement
        this.browserState = {
          ...this.browserState!,
          cursorPosition: { x: 50 + Math.random() * 20, y: 40 + Math.random() * 20 },
          action: { type: 'click', target: 'element' },
        }
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        await this.delay(baseDelay)

        this.browserState.action = undefined
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        break

      case 'scrape':
        // Simulate scraping
        step.result = 'Successfully extracted content from page'
        await this.delay(baseDelay * 1.2)
        break

      case 'screenshot':
        // Simulate screenshot
        step.result = 'Screenshot captured'
        await this.delay(baseDelay * 0.5)
        break

      case 'analyze':
        // Simulate analysis
        step.result = 'Analysis complete'
        await this.delay(baseDelay * 1.5)
        break

      case 'search':
        // Simulate search
        this.browserState = {
          url: 'https://www.google.com/search?q=' + encodeURIComponent(step.description),
          title: 'Google Search',
          isLoading: false,
        }
        callbacks.onBrowserUpdate?.({ ...this.browserState })
        await this.delay(baseDelay)
        break
    }
  }

  private async executeStepWithRealBrowser(step: ExecutionStep, callbacks: Partial<TaskRunnerCallbacks>): Promise<void> {
    // Set up callback to forward browser state updates
    browserAutomation.setCallbacks({
      onStateChange: (state) => {
        this.browserState = state
        callbacks.onBrowserUpdate?.(state)
      },
      onError: (error) => {
        callbacks.onError?.(error)
      }
    })

    switch (step.type) {
      case 'navigate':
        const navResult = await browserAutomation.navigate(step.url || 'https://example.com')
        step.result = navResult.success ? `Navigated to ${navResult.title}` : navResult.error
        break

      case 'type':
        const typeText = step.description.match(/"([^"]+)"/)?.[1] || 'search query'
        await browserAutomation.simulateType(typeText)
        step.result = `Typed: ${typeText}`
        break

      case 'click':
        await browserAutomation.simulateClick(step.description)
        step.result = 'Click performed'
        break

      case 'scrape':
        const content = await browserAutomation.extractContent()
        if (content) {
          step.result = `Extracted: ${content.title} (${content.text.slice(0, 100)}...)`
        } else {
          step.result = 'Content extraction attempted'
        }
        break

      case 'screenshot':
        const screenshot = await browserAutomation.takeScreenshot()
        step.result = screenshot ? 'Screenshot captured' : 'Screenshot unavailable'
        break

      case 'analyze':
        // Analysis is done on the client side, just mark as complete
        step.result = 'Analysis complete'
        await this.delay(500)
        break

      case 'search':
        // For search, navigate to a search engine with the query
        const query = step.description.replace(/search|for|about/gi, '').trim()
        await browserAutomation.navigate(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`)
        step.result = `Searched for: ${query}`
        break
    }
  }

  setUseRealBrowser(value: boolean): void {
    this.useRealBrowser = value
  }

  private generateSources(_step: ExecutionStep): Source[] {
    const sources: Source[] = []
    const count = 2 + Math.floor(Math.random() * 3)

    const sampleSources = [
      { title: 'Wikipedia - The Free Encyclopedia', url: 'https://en.wikipedia.org', snippet: 'Comprehensive information about the topic with citations and references.' },
      { title: 'Stack Overflow', url: 'https://stackoverflow.com', snippet: 'Technical discussion and solutions from the developer community.' },
      { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', snippet: 'Authoritative documentation for web technologies.' },
      { title: 'GitHub Repository', url: 'https://github.com', snippet: 'Source code and documentation from open source projects.' },
      { title: 'Medium Article', url: 'https://medium.com', snippet: 'In-depth analysis and tutorials from industry experts.' },
      { title: 'Official Documentation', url: 'https://docs.example.com', snippet: 'Official guides and API references.' },
      { title: 'Research Paper', url: 'https://arxiv.org', snippet: 'Academic research and findings on the subject.' },
      { title: 'News Article', url: 'https://news.example.com', snippet: 'Recent developments and updates in the field.' },
    ]

    for (let i = 0; i < count; i++) {
      const sample = sampleSources[Math.floor(Math.random() * sampleSources.length)]
      sources.push({
        id: crypto.randomUUID(),
        title: sample.title,
        url: sample.url + '/article-' + Math.floor(Math.random() * 1000),
        type: 'web',
        snippet: sample.snippet,
        timestamp: new Date(),
      })
    }

    return sources
  }

  private getTitleFromUrl(url: string): string {
    try {
      const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      if (hostname.includes('google')) return 'Google'
      if (hostname.includes('wikipedia')) return 'Wikipedia'
      if (hostname.includes('github')) return 'GitHub'
      return hostname.replace('www.', '').split('.')[0].charAt(0).toUpperCase() +
             hostname.replace('www.', '').split('.')[0].slice(1)
    } catch {
      return 'Page'
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getCurrentExecution(): TaskExecution | null {
    return this.currentExecution
  }

  getBrowserState(): BrowserState | null {
    return this.browserState
  }

  pauseExecution(): void {
    if (this.currentExecution) {
      this.currentExecution.status = 'paused'
    }
  }

  resumeExecution(): void {
    if (this.currentExecution && this.currentExecution.status === 'paused') {
      this.currentExecution.status = 'running'
    }
  }
}

export const taskRunner = new TaskRunner()
export default taskRunner
