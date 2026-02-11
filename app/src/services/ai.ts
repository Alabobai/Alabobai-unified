/**
 * Alabobai AI Service
 * Connects to real Claude API through backend
 */

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (tokensUsed?: number) => void
  onError: (error: Error) => void
}

export interface AIProvider {
  name: string
  model: string
  streamChat: (messages: Message[], callbacks: StreamCallbacks, department?: string) => Promise<void>
  chat: (messages: Message[], department?: string) => Promise<string>
}

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8888'

// Real Claude API Provider (via backend)
export class ClaudeAPIProvider implements AIProvider {
  name = 'Claude'
  model = 'claude-sonnet-4-20250514'

  async streamChat(
    messages: Message[],
    callbacks: StreamCallbacks,
    department: string = 'development'
  ): Promise<void> {
    try {
      const lastMessage = messages[messages.length - 1]?.content || ''

      const response = await fetch(`${API_BASE_URL}/api/v2/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: lastMessage,
          department,
          maxTokens: 16384,
          temperature: 0.7
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `API error: ${response.status}`)
      }

      const data = await response.json()

      // Get the response message from v2 API format
      const content = data.message || data.content || 'No response received'

      // Simulate streaming by outputting the response in chunks
      const chunkSize = 10
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize)
        callbacks.onToken(chunk)
        await new Promise(resolve => setTimeout(resolve, 20))
      }

      callbacks.onComplete(data.tokensUsed)
    } catch (error) {
      callbacks.onError(error as Error)
    }
  }

  async chat(messages: Message[], department: string = 'development'): Promise<string> {
    const lastMessage = messages[messages.length - 1]?.content || ''

    const response = await fetch(`${API_BASE_URL}/api/v2/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: lastMessage,
        department,
        maxTokens: 16384,
        temperature: 0.7
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return data.message || data.content || ''
  }
}

// Mock Provider for testing/fallback
export class MockProvider implements AIProvider {
  name = 'Mock'
  model = 'mock-v1'

  async streamChat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    const lastMessage = messages[messages.length - 1]?.content || ''

    let response = ''

    if (lastMessage.toLowerCase().includes('landing page')) {
      response = `I'll help you build a landing page! Here's what I'll create:

**Structure:**
- Hero section with gradient background
- Features grid with icons
- Testimonials carousel
- Pricing section
- Footer with links

Let me start generating the code...

\`\`\`tsx
// components/LandingPage.tsx
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-500 to-dark-400">
      {/* Hero Section */}
      <section className="py-20 px-6 text-center">
        <h1 className="text-5xl font-bold text-white mb-6">
          Welcome to Your Product
        </h1>
        <p className="text-xl text-white/70 max-w-2xl mx-auto">
          Build amazing things with our platform
        </p>
      </section>
    </div>
  )
}
\`\`\`

Would you like me to continue with the full implementation?`
    } else if (lastMessage.toLowerCase().includes('dashboard')) {
      response = `I'll create a React dashboard for you! Here's the plan:

**Components:**
- Sidebar navigation
- Stats cards with metrics
- Charts and graphs
- Data tables
- User profile section

I'll use React 19, TailwindCSS, and Recharts for visualization.

Ready to start building?`
    } else {
      response = `I'm Alabobai, your AI agent assistant. I can help you:

- **Build applications** - Full-stack web apps, landing pages, dashboards
- **Write code** - React, TypeScript, Node.js, Python, and more
- **Manage tasks** - Track progress, organize workflows
- **Execute workflows** - Automated pipelines, CI/CD, deployments

What would you like me to help you with today?`
    }

    // Stream the response
    for (const char of response) {
      await new Promise(resolve => setTimeout(resolve, 10))
      callbacks.onToken(char)
    }

    callbacks.onComplete()
  }

  async chat(messages: Message[]): Promise<string> {
    return new Promise((resolve) => {
      let response = ''
      this.streamChat(messages, {
        onToken: (token) => { response += token },
        onComplete: () => resolve(response),
        onError: () => resolve('Error processing request')
      })
    })
  }
}

// AI Service Manager
class AIService {
  private provider: AIProvider
  private isBackendAvailable: boolean = false

  constructor() {
    // Start with mock, try to connect to real backend
    this.provider = new MockProvider()
    this.checkBackendAvailability()
  }

  private async checkBackendAvailability(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })

      if (response.ok) {
        console.log('[AI Service] Backend available, switching to Claude API')
        this.provider = new ClaudeAPIProvider()
        this.isBackendAvailable = true
      }
    } catch {
      console.log('[AI Service] Backend not available, using mock provider')
      this.isBackendAvailable = false
    }
  }

  setProvider(provider: AIProvider): void {
    this.provider = provider
  }

  getProvider(): AIProvider {
    return this.provider
  }

  isConnected(): boolean {
    return this.isBackendAvailable
  }

  async reconnect(): Promise<boolean> {
    await this.checkBackendAvailability()
    return this.isBackendAvailable
  }

  async chat(messages: Message[], callbacks: StreamCallbacks, department?: string): Promise<void> {
    return this.provider.streamChat(messages, callbacks, department)
  }

  async chatSync(messages: Message[], department?: string): Promise<string> {
    if ('chat' in this.provider) {
      return this.provider.chat(messages, department)
    }

    return new Promise((resolve, reject) => {
      let response = ''
      this.provider.streamChat(messages, {
        onToken: (token) => { response += token },
        onComplete: () => resolve(response),
        onError: reject
      }, department)
    })
  }
}

export const aiService = new AIService()
export default aiService
