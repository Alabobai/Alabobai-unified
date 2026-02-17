/**
 * Alabobai AI Service
 * Multi-provider AI with user-configured API keys and smart fallback chain
 *
 * Priority order:
 * 1. User's Gemini key (if configured - fast, 1M+ context)
 * 2. User's OpenAI key (if configured)
 * 3. User's Anthropic key (if configured)
 * 4. User's Groq key (if configured)
 * 5. Local Ollama (if available)
 * 6. Free APIs (Pollinations, DeepInfra)
 * 7. Offline templates
 */

import { OllamaProvider } from './ollama'
import { useApiKeyStore } from '../stores/apiKeyStore'
import { autonomousAI, type StreamCallbacks as AutonomousCallbacks } from './autonomousAI'
import { BRAND } from '@/config/brand'

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
  streamChat: (messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController) => Promise<void>
  chat: (messages: Message[], callbacks?: StreamCallbacks) => Promise<string>
}

// Helper to get API keys from store (works outside React components)
function getApiKeys() {
  return useApiKeyStore.getState().getAllKeys()
}

// ============================================================================
// OpenAI Provider - Uses user's OpenAI API key
// ============================================================================
export class OpenAIProvider implements AIProvider {
  name = 'OpenAI'
  model = 'gpt-4o-mini'
  private apiKey: string = ''

  isReady(): boolean {
    const keys = getApiKeys()
    return !!keys.openaiKey && keys.openaiKey.length > 0
  }

  async initialize(): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.openaiKey
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.openaiKey

    if (!this.apiKey) {
      callbacks.onError(new Error('OpenAI API key not configured. Please add your API key in Settings.'))
      return
    }

    try {
      callbacks.onStatus?.('Connecting to OpenAI...')

      const controller = abortController || new AbortController()
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `OpenAI API error: ${response.status}`
        throw new Error(this.formatUserFriendlyError('OpenAI', response.status, errorMessage))
      }

      callbacks.onStatus?.('Streaming response...')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body available')

      const decoder = new TextDecoder()
      let buffer = ''
      let tokensUsed = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              callbacks.onComplete(tokensUsed)
              return
            }
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                callbacks.onToken(content)
                tokensUsed++
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      callbacks.onComplete(tokensUsed)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete()
        return
      }
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error'))
    }
  }

  async chat(messages: Message[]): Promise<string> {
    const keys = getApiKeys()
    this.apiKey = keys.openaiKey

    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  private formatUserFriendlyError(provider: string, status: number, message: string): string {
    if (status === 401) {
      return `Invalid ${provider} API key. Please check your API key in Settings.`
    }
    if (status === 429) {
      return `${provider} rate limit exceeded. Please wait a moment and try again.`
    }
    if (status === 500 || status === 502 || status === 503) {
      return `${provider} is temporarily unavailable. Please try again later.`
    }
    return message
  }
}

// ============================================================================
// Anthropic Provider - Uses user's Anthropic API key
// ============================================================================
export class AnthropicProvider implements AIProvider {
  name = 'Anthropic'
  model = 'claude-3-5-sonnet-20241022'
  private apiKey: string = ''

  isReady(): boolean {
    const keys = getApiKeys()
    return !!keys.anthropicKey && keys.anthropicKey.length > 0
  }

  async initialize(): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.anthropicKey
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.anthropicKey

    if (!this.apiKey) {
      callbacks.onError(new Error('Anthropic API key not configured. Please add your API key in Settings.'))
      return
    }

    try {
      callbacks.onStatus?.('Connecting to Claude...')

      const controller = abortController || new AbortController()

      // Format messages for Anthropic (system message handled separately)
      const systemMessage = messages.find(m => m.role === 'system')?.content
      const chatMessages = messages.filter(m => m.role !== 'system')

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: systemMessage,
          messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `Anthropic API error: ${response.status}`
        throw new Error(this.formatUserFriendlyError('Anthropic', response.status, errorMessage))
      }

      callbacks.onStatus?.('Streaming response...')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body available')

      const decoder = new TextDecoder()
      let buffer = ''
      let tokensUsed = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                callbacks.onToken(parsed.delta.text)
                tokensUsed++
              }
              if (parsed.type === 'message_stop') {
                callbacks.onComplete(tokensUsed)
                return
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      callbacks.onComplete(tokensUsed)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete()
        return
      }
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error'))
    }
  }

  async chat(messages: Message[]): Promise<string> {
    const keys = getApiKeys()
    this.apiKey = keys.anthropicKey

    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured')
    }

    const systemMessage = messages.find(m => m.role === 'system')?.content
    const chatMessages = messages.filter(m => m.role !== 'system')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemMessage,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content?.[0]?.text || ''
  }

  private formatUserFriendlyError(provider: string, status: number, message: string): string {
    if (status === 401) {
      return `Invalid ${provider} API key. Please check your API key in Settings.`
    }
    if (status === 429) {
      return `${provider} rate limit exceeded. Please wait a moment and try again.`
    }
    if (status === 500 || status === 502 || status === 503) {
      return `${provider} is temporarily unavailable. Please try again later.`
    }
    return message
  }
}

// ============================================================================
// Groq Provider - Uses user's Groq API key for fast inference
// ============================================================================
export class GroqProvider implements AIProvider {
  name = 'Groq'
  model = 'llama-3.3-70b-versatile'
  private apiKey: string = ''

  isReady(): boolean {
    const keys = getApiKeys()
    return !!keys.groqKey && keys.groqKey.length > 0
  }

  async initialize(): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.groqKey
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.groqKey

    if (!this.apiKey) {
      callbacks.onError(new Error('Groq API key not configured. Please add your API key in Settings.'))
      return
    }

    try {
      callbacks.onStatus?.('Connecting to Groq...')

      const controller = abortController || new AbortController()
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `Groq API error: ${response.status}`
        throw new Error(this.formatUserFriendlyError('Groq', response.status, errorMessage))
      }

      callbacks.onStatus?.('Streaming response...')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body available')

      const decoder = new TextDecoder()
      let buffer = ''
      let tokensUsed = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              callbacks.onComplete(tokensUsed)
              return
            }
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                callbacks.onToken(content)
                tokensUsed++
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      callbacks.onComplete(tokensUsed)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete()
        return
      }
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error'))
    }
  }

  async chat(messages: Message[]): Promise<string> {
    const keys = getApiKeys()
    this.apiKey = keys.groqKey

    if (!this.apiKey) {
      throw new Error('Groq API key not configured')
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  private formatUserFriendlyError(provider: string, status: number, message: string): string {
    if (status === 401) {
      return `Invalid ${provider} API key. Please check your API key in Settings.`
    }
    if (status === 429) {
      return `${provider} rate limit exceeded. Please wait a moment and try again.`
    }
    if (status === 500 || status === 502 || status === 503) {
      return `${provider} is temporarily unavailable. Please try again later.`
    }
    return message
  }
}

// ============================================================================
// Gemini Provider - Uses user's Google Gemini API key
// ============================================================================
export class GeminiProvider implements AIProvider {
  name = 'Gemini'
  model = 'gemini-2.0-flash'
  private apiKey: string = ''

  isReady(): boolean {
    const keys = getApiKeys()
    return !!keys.geminiKey && keys.geminiKey.length > 0
  }

  async initialize(): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.geminiKey
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
    const keys = getApiKeys()
    this.apiKey = keys.geminiKey

    if (!this.apiKey) {
      callbacks.onError(new Error('Gemini API key not configured. Please add your API key in Settings.'))
      return
    }

    try {
      callbacks.onStatus?.('Connecting to Gemini...')

      const controller = abortController || new AbortController()

      // Format messages for Gemini API
      const systemMessage = messages.find(m => m.role === 'system')?.content || ''
      const chatMessages = messages.filter(m => m.role !== 'system')

      // Convert to Gemini format
      const contents = chatMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: 0.7,
            },
          }),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `Gemini API error: ${response.status}`
        throw new Error(this.formatUserFriendlyError('Gemini', response.status, errorMessage))
      }

      callbacks.onStatus?.('Streaming response...')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body available')

      const decoder = new TextDecoder()
      let buffer = ''
      let tokensUsed = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) {
                callbacks.onToken(text)
                tokensUsed++
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      callbacks.onComplete(tokensUsed)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete()
        return
      }
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error'))
    }
  }

  async chat(messages: Message[]): Promise<string> {
    const keys = getApiKeys()
    this.apiKey = keys.geminiKey

    if (!this.apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const systemMessage = messages.find(m => m.role === 'system')?.content || ''
    const chatMessages = messages.filter(m => m.role !== 'system')

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
          },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  private formatUserFriendlyError(provider: string, status: number, message: string): string {
    if (status === 401 || status === 403) {
      return `Invalid ${provider} API key. Please check your API key in Settings.`
    }
    if (status === 429) {
      return `${provider} rate limit exceeded. Please wait a moment and try again.`
    }
    if (status === 500 || status === 502 || status === 503) {
      return `${provider} is temporarily unavailable. Please try again later.`
    }
    return message
  }
}

// ============================================================================
// Autonomous AI Provider (Self-healing, multiple free APIs)
// ============================================================================
export class AutonomousAIProvider implements AIProvider {
  name = 'Autonomous AI'
  model = 'self-annealing-multi-provider'
  private initialized = false

  isReady(): boolean {
    return true // Always ready - has built-in fallbacks
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      await autonomousAI.initialize()
      this.initialized = true
    }
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, _abortController?: AbortController): Promise<void> {
    const autonomousCallbacks: AutonomousCallbacks = {
      onToken: callbacks.onToken,
      onComplete: callbacks.onComplete,
      onError: callbacks.onError,
      onStatus: callbacks.onStatus
    }
    // Note: autonomousAI handles its own abort controller internally
    await autonomousAI.chat(messages, autonomousCallbacks)
  }

  async chat(messages: Message[]): Promise<string> {
    return autonomousAI.chatSync(messages)
  }
}

// ============================================================================
// Cloud API Provider (Free fallback - Pollinations/DeepInfra)
// ============================================================================
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

  // Direct cloud fallback when proxy is unavailable - tries multiple free APIs
  private async directCloudChat(messages: Message[]): Promise<string> {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''

    // Try Pollinations first (short timeout)
    try {
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n')
      const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (response.ok) {
        const text = await response.text()
        // Make sure we got actual text, not an error page
        if (text && !text.includes('<!DOCTYPE') && text.length > 10) {
          return text
        }
      }
    } catch (e) {
      console.log('[CloudAPI] Pollinations failed, trying alternative...')
    }

    // Try DeepInfra's free tier (short timeout)
    try {
      const response = await fetch('https://api.deepinfra.com/v1/inference/mistralai/Mixtral-8x7B-Instruct-v0.1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: `<s>[INST] ${lastUserMessage} [/INST]`,
          max_new_tokens: 1024
        }),
        signal: AbortSignal.timeout(8000)
      })
      if (response.ok) {
        const data = await response.json()
        const text = data.results?.[0]?.generated_text || data.generated_text || ''
        if (text && text.length > 10) {
          return text
        }
      }
    } catch (e) {
      console.log('[CloudAPI] DeepInfra failed, using offline mode...')
    }

    // Fallback to intelligent offline response
    return this.generateOfflineResponse(lastUserMessage)
  }

  // Generate intelligent offline responses for common requests
  private generateOfflineResponse(input: string): string {
    const lower = input.toLowerCase()

    if (lower.includes('landing page') || lower.includes('website') || lower.includes('homepage')) {
      return `I'll create a landing page for you!

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome</title>
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
      The all-in-one platform for modern teams to collaborate, create, and ship faster.
    </p>
    <button class="bg-purple-600 px-8 py-4 rounded-lg text-white text-lg font-semibold hover:bg-purple-700">
      Start Free Trial
    </button>
  </main>
</body>
</html>
\`\`\`

This landing page includes a modern gradient background, navigation, and a hero section with CTA.`
    }

    if (lower.includes('hello') || lower.includes('hi ') || lower.includes('hey')) {
      return `Hello! I'm **${BRAND.name}**, your AI assistant. I can help you:

- **Build web applications** - Landing pages, dashboards, forms
- **Write code** - React, TypeScript, HTML/CSS, and more
- **Research topics** - Using Deep Research feature
- **Analyze data** - With the Data Analyst view

What would you like to create today?`
    }

    return `I understand you're asking about: "${input.slice(0, 100)}..."

I'm currently in offline mode, but I can still help with:
- Building landing pages and websites
- Creating dashboards and forms
- Generating React components

Try asking me to "build a landing page" or "create a dashboard" to see code generation in action!`
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
    try {
      callbacks.onStatus?.('Connecting to AI...')

      let content = ''
      let usingDirectFallback = false

      try {
        const controller = abortController || new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, stream: true }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        callbacks.onStatus?.('Streaming response...')

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let tokensUsed = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                callbacks.onComplete(tokensUsed)
                return
              }
              try {
                const parsed = JSON.parse(data)
                if (parsed.token) {
                  callbacks.onToken(parsed.token)
                  tokensUsed++
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        callbacks.onComplete(tokensUsed)
        return
      } catch (proxyError) {
        // Check if it was an abort
        if (proxyError instanceof Error && proxyError.name === 'AbortError') {
          callbacks.onComplete()
          return
        }
        // Proxy failed, try direct cloud API
        console.log('[CloudAPIProvider] Proxy failed, using direct cloud API')
        callbacks.onStatus?.('Using direct cloud connection...')
        usingDirectFallback = true
        content = await this.directCloudChat(messages)
      }

      // Stream the direct fallback content token-by-token for realistic UI updates
      if (usingDirectFallback && content) {
        // Split by characters for more granular streaming
        const chars = content.split('')
        let tokensUsed = 0
        for (let i = 0; i < chars.length; i++) {
          // Check for abort
          if (abortController?.signal.aborted) {
            callbacks.onComplete(tokensUsed)
            return
          }
          // Small delay for natural feel, batch every 2-3 chars
          if (i % 3 === 0) {
            await new Promise(r => setTimeout(r, 8))
          }
          callbacks.onToken(chars[i])
          tokensUsed++
        }
        callbacks.onComplete(tokensUsed)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete()
        return
      }
      callbacks.onError(error as Error)
    }
  }

  async chat(messages: Message[]): Promise<string> {
    try {
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
    } catch (proxyError) {
      // Fallback to direct cloud API
      console.log('[CloudAPIProvider] Proxy failed, using direct cloud API')
      return this.directCloudChat(messages)
    }
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
      // Use a variable to prevent Vite from analyzing the import
      const moduleName = '@mlc-ai/web-llm'
      // @ts-ignore - WebLLM may not be installed in all environments
      const webllm = await import(/* @vite-ignore */ moduleName)

      this.engine = await webllm.CreateMLCEngine(this.model, {
        initProgressCallback: (progress: any) => {
          console.log(`[WebLLM] Loading: ${Math.round(progress.progress * 100)}%`)
        }
      })

      this.isInitialized = true
      console.log('[WebLLM] Model loaded successfully')
    } catch (error) {
      console.warn('[WebLLM] Failed to initialize:', error)
      throw error
    }
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
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

      let tokensUsed = 0
      for await (const chunk of asyncGenerator) {
        // Check for abort
        if (abortController?.signal.aborted) {
          callbacks.onComplete(tokensUsed)
          return
        }
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          callbacks.onToken(content)
          tokensUsed++
        }
      }

      callbacks.onComplete(tokensUsed)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete()
        return
      }
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

  async streamChat(messages: Message[], callbacks: StreamCallbacks, abortController?: AbortController): Promise<void> {
    const lastMessage = messages[messages.length - 1]?.content || ''
    callbacks.onStatus?.('Using offline mode...')

    let response = this.generateResponse(lastMessage)

    // Stream the response character by character for realistic feel
    let tokensUsed = 0
    for (let i = 0; i < response.length; i++) {
      // Check for abort
      if (abortController?.signal.aborted) {
        callbacks.onComplete(tokensUsed)
        return
      }
      // Batch every 2-3 chars for smoother streaming
      if (i % 3 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      callbacks.onToken(response[i])
      tokensUsed++
    }

    callbacks.onComplete(tokensUsed)
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
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">OP</div>
        <h3 class="text-xl font-bold text-white mb-2">Lightning Fast</h3>
        <p class="text-gray-400">Built for speed with cutting-edge technology.</p>
      </div>
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">SC</div>
        <h3 class="text-xl font-bold text-white mb-2">Secure</h3>
        <p class="text-gray-400">Enterprise-grade security you can trust.</p>
      </div>
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">GO</div>
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
          DA Overview
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
          HR Users
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
          AN Analytics
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
          IT Settings
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

    return `I'm **${BRAND.name}**, your AI agent assistant! I can help you:

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

// AI Service Manager with smart fallback chain
class AIService {
  private providers: AIProvider[] = []
  private currentProvider: AIProvider
  private initPromise: Promise<void> | null = null
  private currentAbortController: AbortController | null = null

  constructor() {
    // Initialize all providers
    this.providers = [
      new GeminiProvider(),        // User's Gemini key (high priority - fast & 1M+ context)
      new OpenAIProvider(),        // User's OpenAI key
      new AnthropicProvider(),     // User's Anthropic key
      new GroqProvider(),          // User's Groq key
      new OllamaProvider(),        // Local Ollama
      new AutonomousAIProvider(),  // Self-healing autonomous AI (primary free)
      new CloudAPIProvider(),      // Free cloud APIs (backup)
      new WebLLMProvider(),        // Browser-based
      new MockProvider()           // Offline fallback
    ]
    // Default to mock until initialized
    this.currentProvider = new MockProvider()
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  /**
   * Initialize and find the best available provider using the fallback chain:
   * 1. User's Gemini key (fast, 1M+ context)
   * 2. User's OpenAI key
   * 3. User's Anthropic key
   * 4. User's Groq key
   * 5. Local Ollama
   * 6. Free Cloud APIs
   * 7. WebLLM (browser)
   * 8. Offline templates
   */
  private async _doInitialize(): Promise<void> {
    // Priority 1: Check for user's Gemini key (fast & huge context)
    const geminiProvider = this.providers.find(p => p.name === 'Gemini')
    if (geminiProvider) {
      await geminiProvider.initialize?.()
      if (geminiProvider.isReady()) {
        console.log('[AI Service] Using Gemini 2.0 (user API key)')
        this.currentProvider = geminiProvider
        return
      }
    }

    // Priority 2: Check for user's OpenAI key
    const openaiProvider = this.providers.find(p => p.name === 'OpenAI')
    if (openaiProvider) {
      await openaiProvider.initialize?.()
      if (openaiProvider.isReady()) {
        console.log('[AI Service] Using OpenAI (user API key)')
        this.currentProvider = openaiProvider
        return
      }
    }

    // Priority 2: Check for user's Anthropic key
    const anthropicProvider = this.providers.find(p => p.name === 'Anthropic')
    if (anthropicProvider) {
      await anthropicProvider.initialize?.()
      if (anthropicProvider.isReady()) {
        console.log('[AI Service] Using Anthropic Claude (user API key)')
        this.currentProvider = anthropicProvider
        return
      }
    }

    // Priority 3: Check for user's Groq key
    const groqProvider = this.providers.find(p => p.name === 'Groq')
    if (groqProvider) {
      await groqProvider.initialize?.()
      if (groqProvider.isReady()) {
        console.log('[AI Service] Using Groq (user API key)')
        this.currentProvider = groqProvider
        return
      }
    }

    // Priority 4: Check for local Ollama
    const ollamaProvider = this.providers.find(p => p.name === 'Ollama')
    if (ollamaProvider) {
      await ollamaProvider.initialize?.()
      if (ollamaProvider.isReady()) {
        console.log(`[AI Service] Using Ollama (${ollamaProvider.model})`)
        this.currentProvider = ollamaProvider
        return
      }
    }

    // Priority 5: Use Autonomous AI (self-healing, multiple free providers)
    const autonomousProvider = this.providers.find(p => p.name === 'Autonomous AI')
    if (autonomousProvider) {
      await autonomousProvider.initialize?.()
      console.log('[AI Service] Using Autonomous AI (self-healing, free tier)')
      this.currentProvider = autonomousProvider
      return
    }

    // Priority 6: Use Cloud APIs (backup free tier)
    const cloudProvider = this.providers.find(p => p.name === 'Cloud AI')
    if (cloudProvider) {
      await cloudProvider.initialize?.()
      console.log('[AI Service] Using Cloud AI (free tier)')
      this.currentProvider = cloudProvider
      return
    }

    // Fall back to mock/offline mode
    console.log('[AI Service] Using offline mode')
    this.currentProvider = new MockProvider()
  }

  /**
   * Re-initialize to pick up new API keys
   */
  async reinitialize(): Promise<void> {
    this.initPromise = null
    await this.initialize()
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

  /**
   * Cancel any ongoing chat request
   */
  cancelRequest(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  /**
   * Stream chat with the current provider
   * Automatically handles cancellation and fallback
   */
  async chat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    // Initialize if not done
    if (!this.initPromise) {
      await this.initialize()
    }

    // Cancel any previous request
    this.cancelRequest()

    // Create new abort controller
    this.currentAbortController = new AbortController()

    try {
      await this.currentProvider.streamChat(messages, callbacks, this.currentAbortController)
    } catch (error) {
      // If current provider fails, try fallback
      if (error instanceof Error && error.name !== 'AbortError') {
        console.log(`[AI Service] ${this.currentProvider.name} failed, trying fallback...`)
        callbacks.onStatus?.('Trying alternative AI provider...')

        // Find next available provider
        const currentIndex = this.providers.findIndex(p => p.name === this.currentProvider.name)
        for (let i = currentIndex + 1; i < this.providers.length; i++) {
          const fallbackProvider = this.providers[i]
          await fallbackProvider.initialize?.()
          if (fallbackProvider.isReady()) {
            console.log(`[AI Service] Falling back to ${fallbackProvider.name}`)
            try {
              await fallbackProvider.streamChat(messages, callbacks, this.currentAbortController)
              return
            } catch {
              // Continue to next fallback
            }
          }
        }

        // All providers failed, use mock
        console.log('[AI Service] All providers failed, using offline mode')
        const mockProvider = new MockProvider()
        await mockProvider.streamChat(messages, callbacks, this.currentAbortController)
      }
    } finally {
      this.currentAbortController = null
    }
  }

  /**
   * Non-streaming chat (returns full response)
   */
  async chatSync(messages: Message[]): Promise<string> {
    if (!this.initPromise) {
      await this.initialize()
    }
    try {
      return await this.currentProvider.chat(messages)
    } catch (error) {
      console.log(`[AI Service] ${this.currentProvider.name} failed for sync chat, using fallback...`)
      // Try CloudAPI as fallback
      const cloudProvider = this.providers.find(p => p.name === 'Cloud AI')
      if (cloudProvider) {
        return await cloudProvider.chat(messages)
      }
      // Last resort: mock
      return new MockProvider().chat(messages)
    }
  }

  /**
   * Chat with a specific provider by name
   */
  async chatWithProvider(
    providerName: string,
    messages: Message[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    const provider = this.providers.find(p => p.name === providerName)
    if (!provider) {
      callbacks.onError(new Error(`Provider "${providerName}" not found`))
      return
    }

    await provider.initialize?.()
    if (!provider.isReady()) {
      callbacks.onError(new Error(`Provider "${providerName}" is not available. Please check your API key in Settings.`))
      return
    }

    this.cancelRequest()
    this.currentAbortController = new AbortController()

    try {
      await provider.streamChat(messages, callbacks, this.currentAbortController)
    } finally {
      this.currentAbortController = null
    }
  }
}

export const aiService = new AIService()

// Subscribe to API key changes to reinitialize when keys are updated
// This allows the service to pick up new API keys without page reload
useApiKeyStore.subscribe((state, prevState) => {
  const keys = state.getAllKeys()
  const prevKeys = prevState?.getAllKeys?.() || {}

  // Check if any keys changed
  const keysChanged =
    keys.geminiKey !== prevKeys.geminiKey ||
    keys.openaiKey !== prevKeys.openaiKey ||
    keys.anthropicKey !== prevKeys.anthropicKey ||
    keys.groqKey !== prevKeys.groqKey ||
    keys.ollamaUrl !== prevKeys.ollamaUrl

  if (keysChanged) {
    console.log('[AI Service] API keys changed, reinitializing...')
    aiService.reinitialize()
  }
})

export default aiService
