/**
 * Browser Automation Service
 *
 * Provides real browser automation capabilities:
 * - Navigate to URLs
 * - Take screenshots (via proxy service)
 * - Extract page content
 * - Simulate clicks/interactions
 */

import type { BrowserState } from '@/components/BrowserPreview'

export interface NavigationResult {
  success: boolean
  url: string
  title: string
  content?: string
  screenshot?: string
  error?: string
}

export interface InteractionResult {
  success: boolean
  action: string
  target?: string
  result?: string
  error?: string
}

export interface PageContent {
  url: string
  title: string
  description?: string
  headings: string[]
  text: string
  links: { text: string; href: string }[]
  images: { alt: string; src: string }[]
}

export interface BrowserAutomationCallbacks {
  onStateChange: (state: BrowserState) => void
  onError: (error: Error) => void
}

class BrowserAutomationService {
  private currentState: BrowserState | null = null
  private callbacks: Partial<BrowserAutomationCallbacks> = {}
  private history: string[] = []
  private historyIndex: number = -1

  // API base URL for proxy requests
  private proxyBaseUrl = '/api/proxy'

  // Check if proxy is available
  private proxyAvailable: boolean | null = null

  setCallbacks(callbacks: Partial<BrowserAutomationCallbacks>) {
    this.callbacks = callbacks
  }

  getCurrentState(): BrowserState | null {
    return this.currentState
  }

  private updateState(updates: Partial<BrowserState>) {
    this.currentState = {
      ...this.currentState!,
      ...updates,
    }
    this.callbacks.onStateChange?.(this.currentState)
  }

  /**
   * Check if proxy API is available
   */
  private async checkProxyAvailable(): Promise<boolean> {
    if (this.proxyAvailable !== null) {
      return this.proxyAvailable
    }

    try {
      const response = await fetch(this.proxyBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', url: 'https://example.com' }),
      })
      this.proxyAvailable = response.ok
    } catch {
      this.proxyAvailable = false
    }

    return this.proxyAvailable
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<NavigationResult> {
    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    // Update state to loading
    this.currentState = {
      url,
      title: 'Loading...',
      isLoading: true,
    }
    this.callbacks.onStateChange?.(this.currentState)

    // Check if proxy is available
    const proxyAvailable = await this.checkProxyAvailable()

    if (proxyAvailable) {
      try {
        // Fetch page content through proxy
        const response = await fetch(this.proxyBaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'navigate', url }),
        })

        if (!response.ok) {
          throw new Error(`Failed to navigate: ${response.statusText}`)
        }

        const data = await response.json()

        // Update history
        if (this.historyIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyIndex + 1)
        }
        this.history.push(url)
        this.historyIndex = this.history.length - 1

        // Update state
        this.updateState({
          url,
          title: data.title || this.getTitleFromUrl(url),
          isLoading: false,
          screenshot: data.screenshot,
        })

        return {
          success: true,
          url,
          title: data.title || this.getTitleFromUrl(url),
          content: data.content,
          screenshot: data.screenshot,
        }
      } catch (error) {
        // Fall through to direct navigation
        console.warn('Proxy navigation failed, falling back to direct navigation:', error)
      }
    }

    // Fallback: Direct navigation (works for CORS-friendly sites)
    try {
      // Update history
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1)
      }
      this.history.push(url)
      this.historyIndex = this.history.length - 1

      // Update state - the BrowserPreview will try to load via iframe
      this.updateState({
        url,
        title: this.getTitleFromUrl(url),
        isLoading: false,
      })

      return {
        success: true,
        url,
        title: this.getTitleFromUrl(url),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Navigation failed'

      // Still update state but show error
      this.updateState({
        url,
        title: 'Error loading page',
        isLoading: false,
      })

      this.callbacks.onError?.(new Error(errorMessage))

      return {
        success: false,
        url,
        title: 'Error',
        error: errorMessage,
      }
    }
  }

  /**
   * Navigate to a URL with iframe support
   * Returns whether iframe can be used or if proxy is needed
   */
  async navigateWithIframe(url: string): Promise<{ canUseIframe: boolean; proxyContent?: string }> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    // Update state
    this.currentState = {
      url,
      title: 'Loading...',
      isLoading: true,
    }
    this.callbacks.onStateChange?.(this.currentState)

    // Try to check if the site allows iframes
    // Common sites that block iframes
    const blockedSites = [
      'google.com',
      'facebook.com',
      'twitter.com',
      'linkedin.com',
      'instagram.com',
      'github.com',
      'youtube.com',
    ]

    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname.replace('www.', '')

      const isBlocked = blockedSites.some(site => hostname.includes(site))
      const proxyAvailable = await this.checkProxyAvailable()

      if (isBlocked && proxyAvailable) {
        // Use proxy for blocked sites
        const response = await fetch(this.proxyBaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch', url }),
        })

        if (response.ok) {
          const data = await response.json()

          // Update history
          if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1)
          }
          this.history.push(url)
          this.historyIndex = this.history.length - 1

          this.updateState({
            url,
            title: data.title || this.getTitleFromUrl(url),
            isLoading: false,
          })

          return { canUseIframe: false, proxyContent: data.content }
        }
      }

      // Update history
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1)
      }
      this.history.push(url)
      this.historyIndex = this.history.length - 1

      this.updateState({
        url,
        title: this.getTitleFromUrl(url),
        isLoading: false,
      })

      return { canUseIframe: true }
    } catch {
      this.updateState({
        url,
        title: this.getTitleFromUrl(url),
        isLoading: false,
      })
      return { canUseIframe: true }
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(): Promise<string | null> {
    if (!this.currentState?.url) {
      return null
    }

    const proxyAvailable = await this.checkProxyAvailable()

    if (proxyAvailable) {
      try {
        const response = await fetch(this.proxyBaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'screenshot',
            url: this.currentState.url
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to take screenshot')
        }

        const data = await response.json()

        if (data.screenshot) {
          this.updateState({ screenshot: data.screenshot })
          return data.screenshot
        }
      } catch (error) {
        console.warn('Proxy screenshot failed:', error)
      }
    }

    // Fallback: Generate a placeholder screenshot
    const placeholder = this.generatePlaceholderScreenshot(this.currentState.url)
    this.updateState({ screenshot: placeholder })
    return placeholder
  }

  /**
   * Generate a placeholder screenshot SVG
   */
  private generatePlaceholderScreenshot(url: string): string {
    const hostname = new URL(url).hostname
    const svg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f8fafc"/>
        <rect x="0" y="0" width="100%" height="50" fill="#1e293b"/>
        <circle cx="25" cy="25" r="6" fill="#ef4444"/>
        <circle cx="45" cy="25" r="6" fill="#eab308"/>
        <circle cx="65" cy="25" r="6" fill="#22c55e"/>
        <rect x="90" y="15" width="600" height="20" rx="10" fill="#334155"/>
        <text x="100" y="30" fill="#94a3b8" font-family="system-ui" font-size="12">${hostname}</text>
        <rect x="30" y="80" width="300" height="24" rx="4" fill="#e2e8f0"/>
        <rect x="30" y="130" width="740" height="16" rx="4" fill="#f1f5f9"/>
        <rect x="30" y="160" width="680" height="16" rx="4" fill="#f1f5f9"/>
        <rect x="30" y="190" width="720" height="16" rx="4" fill="#f1f5f9"/>
        <rect x="30" y="240" width="220" height="150" rx="8" fill="#e2e8f0"/>
        <rect x="270" y="240" width="220" height="150" rx="8" fill="#e2e8f0"/>
        <rect x="510" y="240" width="220" height="150" rx="8" fill="#e2e8f0"/>
        <text x="400" y="500" fill="#94a3b8" font-family="system-ui" font-size="14" text-anchor="middle">
          Preview of ${hostname}
        </text>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  /**
   * Extract page content
   */
  async extractContent(url?: string): Promise<PageContent | null> {
    const targetUrl = url || this.currentState?.url
    if (!targetUrl) {
      return null
    }

    const proxyAvailable = await this.checkProxyAvailable()

    if (proxyAvailable) {
      try {
        const response = await fetch(this.proxyBaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'extract', url: targetUrl }),
        })

        if (!response.ok) {
          throw new Error('Failed to extract content')
        }

        return await response.json()
      } catch (error) {
        console.warn('Proxy extraction failed:', error)
      }
    }

    // Fallback: Return simulated content based on URL
    return {
      url: targetUrl,
      title: this.getTitleFromUrl(targetUrl),
      description: `Content from ${new URL(targetUrl).hostname}`,
      headings: ['Main Content'],
      text: `Page content from ${targetUrl}`,
      links: [],
      images: [],
    }
  }

  /**
   * Simulate a click interaction
   */
  async simulateClick(description: string): Promise<InteractionResult> {
    if (!this.currentState) {
      return { success: false, action: 'click', error: 'No page loaded' }
    }

    // Show click animation
    this.updateState({
      cursorPosition: { x: 50 + Math.random() * 30, y: 30 + Math.random() * 40 },
      action: { type: 'click', target: description },
    })

    await this.delay(500)

    // Clear action
    this.updateState({
      action: undefined,
      cursorPosition: undefined,
    })

    return { success: true, action: 'click', target: description }
  }

  /**
   * Simulate typing
   */
  async simulateType(text: string, target?: string): Promise<InteractionResult> {
    if (!this.currentState) {
      return { success: false, action: 'type', error: 'No page loaded' }
    }

    // Show typing animation
    this.updateState({
      cursorPosition: { x: 50, y: 30 },
      action: { type: 'type', value: text, target },
    })

    // Simulate typing delay
    await this.delay(text.length * 50 + 300)

    // Clear action
    this.updateState({
      action: undefined,
    })

    return { success: true, action: 'type', target, result: text }
  }

  /**
   * Simulate scroll
   */
  async simulateScroll(direction: 'up' | 'down' = 'down'): Promise<InteractionResult> {
    if (!this.currentState) {
      return { success: false, action: 'scroll', error: 'No page loaded' }
    }

    this.updateState({
      action: { type: 'scroll' },
    })

    await this.delay(300)

    this.updateState({
      action: undefined,
    })

    return { success: true, action: 'scroll', result: direction }
  }

  /**
   * Navigate back in history
   */
  async goBack(): Promise<boolean> {
    if (this.historyIndex > 0) {
      this.historyIndex--
      await this.navigate(this.history[this.historyIndex])
      return true
    }
    return false
  }

  /**
   * Navigate forward in history
   */
  async goForward(): Promise<boolean> {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      await this.navigate(this.history[this.historyIndex])
      return true
    }
    return false
  }

  /**
   * Refresh current page
   */
  async refresh(): Promise<void> {
    if (this.currentState?.url) {
      await this.navigate(this.currentState.url)
    }
  }

  /**
   * Execute a demo task showing browser capabilities
   */
  async executeDemoTask(onProgress?: (step: string) => void): Promise<void> {
    // Step 1: Navigate to a demo site
    onProgress?.('Navigating to Wikipedia...')
    await this.navigate('https://en.wikipedia.org')
    await this.delay(1000)

    // Step 2: Simulate search interaction
    onProgress?.('Typing search query...')
    await this.simulateType('Artificial Intelligence', 'Search box')
    await this.delay(500)

    // Step 3: Click search button
    onProgress?.('Clicking search button...')
    await this.simulateClick('Search button')
    await this.delay(800)

    // Step 4: Navigate to search results
    onProgress?.('Loading search results...')
    await this.navigate('https://en.wikipedia.org/wiki/Artificial_intelligence')
    await this.delay(1000)

    // Step 5: Scroll through content
    onProgress?.('Scrolling through content...')
    await this.simulateScroll('down')
    await this.delay(500)

    // Step 6: Extract content
    onProgress?.('Extracting page content...')
    await this.extractContent()
    await this.delay(500)

    onProgress?.('Demo task completed!')
  }

  canGoBack(): boolean {
    return this.historyIndex > 0
  }

  canGoForward(): boolean {
    return this.historyIndex < this.history.length - 1
  }

  private getTitleFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname.replace('www.', '')
      const parts = hostname.split('.')
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    } catch {
      return 'Page'
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const browserAutomation = new BrowserAutomationService()
export default browserAutomation
