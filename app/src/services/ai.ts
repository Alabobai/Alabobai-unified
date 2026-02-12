/**
 * Alabobai AI Service
 * Multi-provider AI with Groq API, Ollama, and WebLLM fallback
 */

import { OllamaProvider } from './ollama'

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (tokensUsed?: number) => void
  onError: (error: Error) => void
  onStatus?: (status: string) => void
}

export interface AIProvider {
  name: string
  model: string
  isReady: () => boolean
  initialize?: () => Promise<void>
  streamChat: (messages: Message[], callbacks: StreamCallbacks) => Promise<void>
  chat: (messages: Message[], callbacks?: StreamCallbacks) => Promise<string>
}

// Cloud API Provider (via Vercel Edge Function - Gemini/Groq/Pollinations)
export class CloudAPIProvider implements AIProvider {
  name = 'Cloud AI'
  model = 'gemini/groq/pollinations'
  private apiAvailable = true // Always try the API first

  isReady(): boolean {
    return this.apiAvailable
  }

  async initialize(): Promise<void> {
    // API is always available - it has fallbacks built in
    this.apiAvailable = true
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    try {
      callbacks.onStatus?.('Connecting to AI...')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, stream: true }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `API error: ${response.status}`)
      }

      callbacks.onStatus?.('Streaming response...')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              callbacks.onComplete()
              return
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.token) {
                callbacks.onToken(parsed.token)
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      callbacks.onComplete()
    } catch (error) {
      callbacks.onError(error as Error)
    }
  }

  async chat(messages: Message[]): Promise<string> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: false }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content || ''
  }
}

// WebLLM Provider (runs in browser, no API key needed)
export class WebLLMProvider implements AIProvider {
  name = 'WebLLM'
  model = 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
  private engine: any = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  isReady(): boolean {
    return this.isInitialized
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Dynamic import to avoid loading WebLLM until needed
      // @ts-ignore - WebLLM may not be installed in all environments
      const webllm = await import('@mlc-ai/web-llm')

      this.engine = await webllm.CreateMLCEngine(this.model, {
        initProgressCallback: (progress: any) => {
          console.log(`[WebLLM] Loading: ${Math.round(progress.progress * 100)}%`)
        }
      })

      this.isInitialized = true
      console.log('[WebLLM] Model loaded successfully')
    } catch (error) {
      console.error('[WebLLM] Failed to initialize:', error)
      throw error
    }
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    try {
      if (!this.isInitialized) {
        callbacks.onStatus?.('Loading AI model (first time may take a minute)...')
        await this.initialize()
      }

      callbacks.onStatus?.('Generating response...')

      const formattedMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }))

      const asyncGenerator = await this.engine.chat.completions.create({
        messages: formattedMessages,
        stream: true,
        max_tokens: 2048,
      })

      for await (const chunk of asyncGenerator) {
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          callbacks.onToken(content)
        }
      }

      callbacks.onComplete()
    } catch (error) {
      callbacks.onError(error as Error)
    }
  }

  async chat(messages: Message[]): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    const response = await this.engine.chat.completions.create({
      messages: formattedMessages,
      max_tokens: 2048,
    })

    return response.choices[0]?.message?.content || ''
  }
}

// Smart fallback provider
export class MockProvider implements AIProvider {
  name = 'Offline'
  model = 'mock-v1'

  isReady(): boolean {
    return true
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    const lastMessage = messages[messages.length - 1]?.content || ''
    callbacks.onStatus?.('Using offline mode...')

    let response = this.generateResponse(lastMessage)

    // Stream the response character by character
    for (const char of response) {
      await new Promise(resolve => setTimeout(resolve, 15))
      callbacks.onToken(char)
    }

    callbacks.onComplete()
  }

  async chat(messages: Message[]): Promise<string> {
    const lastMessage = messages[messages.length - 1]?.content || ''
    return this.generateResponse(lastMessage)
  }

  private generateResponse(input: string): string {
    const lower = input.toLowerCase()

    if (lower.includes('landing page') || lower.includes('website')) {
      return `I'll create a landing page for you!

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Modern Landing Page</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 min-h-screen">
  <nav class="p-6 flex justify-between items-center">
    <div class="text-2xl font-bold text-white">YourBrand</div>
    <div class="space-x-6">
      <a href="#" class="text-gray-300 hover:text-white">Features</a>
      <a href="#" class="text-gray-300 hover:text-white">Pricing</a>
      <a href="#" class="bg-purple-600 px-4 py-2 rounded-lg text-white hover:bg-purple-700">Get Started</a>
    </div>
  </nav>

  <main class="container mx-auto px-6 py-20 text-center">
    <h1 class="text-5xl md:text-7xl font-bold text-white mb-6">
      Build Something <span class="text-purple-400">Amazing</span>
    </h1>
    <p class="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
      The all-in-one platform for modern teams to collaborate, create, and ship faster than ever before.
    </p>
    <div class="flex justify-center gap-4">
      <button class="bg-purple-600 px-8 py-4 rounded-lg text-white text-lg font-semibold hover:bg-purple-700 transition">
        Start Free Trial
      </button>
      <button class="border border-gray-600 px-8 py-4 rounded-lg text-white text-lg hover:bg-gray-800 transition">
        Watch Demo
      </button>
    </div>
  </main>

  <section class="container mx-auto px-6 py-20">
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">⚡</div>
        <h3 class="text-xl font-bold text-white mb-2">Lightning Fast</h3>
        <p class="text-gray-400">Built for speed with cutting-edge technology.</p>
      </div>
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">🔒</div>
        <h3 class="text-xl font-bold text-white mb-2">Secure</h3>
        <p class="text-gray-400">Enterprise-grade security you can trust.</p>
      </div>
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">🚀</div>
        <h3 class="text-xl font-bold text-white mb-2">Scalable</h3>
        <p class="text-gray-400">Grows with your business seamlessly.</p>
      </div>
    </div>
  </section>
</body>
</html>
\`\`\`

This landing page includes:
- Modern gradient background
- Responsive navigation
- Hero section with CTA buttons
- Feature cards with glass morphism effect
- Mobile-friendly design`
    }

    if (lower.includes('dashboard') || lower.includes('admin')) {
      return `Here's a dashboard component for you!

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen">
  <div class="flex">
    <!-- Sidebar -->
    <aside class="w-64 bg-gray-800 min-h-screen p-4">
      <div class="text-xl font-bold text-white mb-8">Dashboard</div>
      <nav class="space-y-2">
        <a href="#" class="flex items-center gap-3 px-4 py-2 bg-purple-600 rounded-lg text-white">
          📊 Overview
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
          👥 Users
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
          📈 Analytics
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
          ⚙️ Settings
        </a>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 p-8">
      <h1 class="text-3xl font-bold text-white mb-8">Overview</h1>

      <!-- Stats Grid -->
      <div class="grid grid-cols-4 gap-6 mb-8">
        <div class="bg-gray-800 p-6 rounded-xl">
          <div class="text-gray-400 text-sm">Total Users</div>
          <div class="text-3xl font-bold text-white">12,847</div>
          <div class="text-green-400 text-sm">+12.5%</div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl">
          <div class="text-gray-400 text-sm">Revenue</div>
          <div class="text-3xl font-bold text-white">$84,234</div>
          <div class="text-green-400 text-sm">+8.2%</div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl">
          <div class="text-gray-400 text-sm">Active Sessions</div>
          <div class="text-3xl font-bold text-white">1,429</div>
          <div class="text-green-400 text-sm">+3.1%</div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl">
          <div class="text-gray-400 text-sm">Conversion</div>
          <div class="text-3xl font-bold text-white">4.28%</div>
          <div class="text-red-400 text-sm">-0.4%</div>
        </div>
      </div>

      <!-- Chart Placeholder -->
      <div class="bg-gray-800 p-6 rounded-xl">
        <h2 class="text-xl font-bold text-white mb-4">Analytics Overview</h2>
        <div class="h-64 flex items-center justify-center text-gray-500">
          Chart visualization would go here
        </div>
      </div>
    </main>
  </div>
</body>
</html>
\`\`\`

This dashboard includes:
- Collapsible sidebar navigation
- Stats cards with metrics
- Responsive grid layout
- Dark theme design`
    }

    return `I'm **Alabobai**, your AI agent assistant! I can help you:

- **Build applications** - Full-stack web apps, landing pages, dashboards
- **Write code** - React, TypeScript, Node.js, Python, and more
- **Navigate & research** - Browse the web, extract information
- **Execute workflows** - Automated tasks and pipelines

Try asking me to:
- "Build me a landing page"
- "Create a React dashboard"
- "Help me with an API"
- "Research a topic"

What would you like me to help you with?`
  }
}

// AI Service Manager with smart fallback
class AIService {
  private providers: AIProvider[] = []
  private currentProvider: AIProvider
  private initPromise: Promise<void> | null = null

  constructor() {
    // Initialize with CloudAPI provider (has built-in fallbacks)
    this.currentProvider = new CloudAPIProvider()
    this.providers = [
      new CloudAPIProvider(),
      new OllamaProvider(),
      new WebLLMProvider(),
      new MockProvider()
    ]
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    // Always use CloudAPI first - it has built-in fallbacks (Gemini → Groq → Pollinations)
    const cloudProvider = this.providers.find(p => p.name === 'Cloud AI')
    if (cloudProvider) {
      await cloudProvider.initialize?.()
      console.log('[AI Service] Using Cloud AI (Gemini/Groq/Pollinations)')
      this.currentProvider = cloudProvider
      return
    }

    // Try Ollama as local backup
    const ollamaProvider = this.providers.find(p => p.name === 'Ollama')
    if (ollamaProvider) {
      await ollamaProvider.initialize?.()
      if (ollamaProvider.isReady()) {
        console.log(`[AI Service] Using Ollama (${ollamaProvider.model})`)
        this.currentProvider = ollamaProvider
        return
      }
    }

    // Fall back to mock only if everything else fails
    console.log('[AI Service] Using offline mode')
    this.currentProvider = new MockProvider()
  }

  getProvider(): AIProvider {
    return this.currentProvider
  }

  getProviderName(): string {
    return this.currentProvider.name
  }

  async switchToWebLLM(callbacks?: StreamCallbacks): Promise<boolean> {
    const webllmProvider = this.providers.find(p => p.name === 'WebLLM')
    if (webllmProvider) {
      try {
        callbacks?.onStatus?.('Loading WebLLM model...')
        await webllmProvider.initialize?.()
        this.currentProvider = webllmProvider
        return true
      } catch (error) {
        console.error('[AI Service] Failed to load WebLLM:', error)
        return false
      }
    }
    return false
  }

  async switchToOllama(callbacks?: StreamCallbacks): Promise<boolean> {
    const ollamaProvider = this.providers.find(p => p.name === 'Ollama')
    if (ollamaProvider) {
      try {
        callbacks?.onStatus?.('Connecting to Ollama...')
        await ollamaProvider.initialize?.()
        if (ollamaProvider.isReady()) {
          this.currentProvider = ollamaProvider
          console.log(`[AI Service] Switched to Ollama (${ollamaProvider.model})`)
          return true
        }
        callbacks?.onStatus?.('Ollama not available')
        return false
      } catch (error) {
        console.error('[AI Service] Failed to connect to Ollama:', error)
        return false
      }
    }
    return false
  }

  /**
   * Get the Ollama provider for advanced operations
   */
  getOllamaProvider(): OllamaProvider | null {
    const provider = this.providers.find(p => p.name === 'Ollama')
    return provider as OllamaProvider | null
  }

  /**
   * List all available providers and their status
   */
  async getProviderStatus(): Promise<Array<{ name: string; model: string; ready: boolean }>> {
    const status = []
    for (const provider of this.providers) {
      await provider.initialize?.()
      status.push({
        name: provider.name,
        model: provider.model,
        ready: provider.isReady()
      })
    }
    return status
  }

  async chat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    // Initialize if not done
    if (!this.initPromise) {
      await this.initialize()
    }

    return this.currentProvider.streamChat(messages, callbacks)
  }

  async chatSync(messages: Message[]): Promise<string> {
    if (!this.initPromise) {
      await this.initialize()
    }
    return this.currentProvider.chat(messages)
  }
}

export const aiService = new AIService()
export default aiService
