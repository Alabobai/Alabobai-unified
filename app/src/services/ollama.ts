/**
 * Ollama Integration Service
 * Provides local LLM support via Ollama
 *
 * Ollama must be running locally at http://localhost:11434
 * Supported models: llama3, mistral, codellama, and any other installed models
 */

import type { Message, StreamCallbacks, AIProvider } from './ai'

// Ollama API types
export interface OllamaModel {
  name: string
  modified_at: string
  size: number
  digest: string
  details?: {
    format: string
    family: string
    families: string[] | null
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaModelList {
  models: OllamaModel[]
}

export interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface OllamaChatRequest {
  model: string
  messages: OllamaChatMessage[]
  stream?: boolean
  options?: {
    temperature?: number
    top_p?: number
    top_k?: number
    num_predict?: number
    stop?: string[]
  }
}

export interface OllamaChatResponse {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaStreamChunk {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
}

// Configuration
const OLLAMA_BASE_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'llama3'
const CONNECTION_TIMEOUT = 5000
const STREAM_TIMEOUT = 120000

// Preferred models in order of priority
const PREFERRED_MODELS = [
  'llama3.2',
  'llama3.1',
  'llama3',
  'mistral',
  'codellama',
  'deepseek-coder',
  'phi3',
  'gemma2',
  'qwen2'
]

/**
 * Ollama Service - handles all Ollama API interactions
 */
export class OllamaService {
  private baseUrl: string
  private availableModels: OllamaModel[] = []
  private isRunning: boolean = false
  private lastHealthCheck: number = 0
  private healthCheckInterval: number = 30000 // 30 seconds

  constructor(baseUrl: string = OLLAMA_BASE_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkHealth(): Promise<boolean> {
    // Use cached result if recent
    const now = Date.now()
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.isRunning) {
      return this.isRunning
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT)

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      this.isRunning = response.ok
      this.lastHealthCheck = now

      if (this.isRunning) {
        const data: OllamaModelList = await response.json()
        this.availableModels = data.models || []
        console.log(`[Ollama] Connected. Available models: ${this.availableModels.map(m => m.name).join(', ')}`)
      }

      return this.isRunning
    } catch (error) {
      this.isRunning = false
      this.lastHealthCheck = now

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log('[Ollama] Connection timeout - Ollama may not be running')
        } else {
          console.log(`[Ollama] Not available: ${error.message}`)
        }
      }

      return false
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<OllamaModel[]> {
    await this.checkHealth()
    return this.availableModels
  }

  /**
   * Get the best available model from preferred list
   */
  async getBestModel(): Promise<string> {
    await this.checkHealth()

    if (this.availableModels.length === 0) {
      return DEFAULT_MODEL
    }

    // Find the first preferred model that's available
    for (const preferred of PREFERRED_MODELS) {
      const found = this.availableModels.find(m =>
        m.name.toLowerCase().startsWith(preferred.toLowerCase())
      )
      if (found) {
        return found.name
      }
    }

    // Return first available model
    return this.availableModels[0].name
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    await this.checkHealth()
    return this.availableModels.some(m =>
      m.name.toLowerCase() === modelName.toLowerCase() ||
      m.name.toLowerCase().startsWith(modelName.toLowerCase() + ':')
    )
  }

  /**
   * Send a chat completion request (non-streaming)
   */
  async chat(
    messages: OllamaChatMessage[],
    model?: string,
    options?: OllamaChatRequest['options']
  ): Promise<string> {
    const isHealthy = await this.checkHealth()
    if (!isHealthy) {
      throw new Error('Ollama is not available')
    }

    const selectedModel = model || await this.getBestModel()

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2048,
          ...options
        }
      } as OllamaChatRequest)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
    }

    const data: OllamaChatResponse = await response.json()
    return data.message?.content || ''
  }

  /**
   * Send a streaming chat completion request
   */
  async streamChat(
    messages: OllamaChatMessage[],
    onToken: (token: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    model?: string,
    options?: OllamaChatRequest['options']
  ): Promise<void> {
    const isHealthy = await this.checkHealth()
    if (!isHealthy) {
      onError(new Error('Ollama is not available'))
      return
    }

    const selectedModel = model || await this.getBestModel()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT)

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          stream: true,
          options: {
            temperature: 0.7,
            num_predict: 2048,
            ...options
          }
        } as OllamaChatRequest),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body available')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })

          // Process complete JSON objects (Ollama sends one per line)
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              try {
                const chunk: OllamaStreamChunk = JSON.parse(line)

                if (chunk.message?.content) {
                  onToken(chunk.message.content)
                }

                if (chunk.done) {
                  onComplete()
                  return
                }
              } catch (parseError) {
                // Skip malformed JSON lines
                console.warn('[Ollama] Failed to parse stream chunk:', line)
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const chunk: OllamaStreamChunk = JSON.parse(buffer)
            if (chunk.message?.content) {
              onToken(chunk.message.content)
            }
          } catch {
            // Ignore incomplete final chunk
          }
        }

        onComplete()
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          onError(new Error('Request timeout - response took too long'))
        } else {
          onError(error)
        }
      } else {
        onError(new Error('Unknown error occurred'))
      }
    }
  }

  /**
   * Pull a model from Ollama library
   */
  async pullModel(
    modelName: string,
    onProgress?: (status: string, completed?: number, total?: number) => void
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: modelName, stream: true })
      })

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line)
              if (onProgress) {
                onProgress(
                  data.status || 'Downloading...',
                  data.completed,
                  data.total
                )
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      reader.releaseLock()

      // Refresh model list
      await this.checkHealth()

      return true
    } catch (error) {
      console.error('[Ollama] Failed to pull model:', error)
      return false
    }
  }

  /**
   * Generate embeddings for text
   */
  async embed(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    const isHealthy = await this.checkHealth()
    if (!isHealthy) {
      throw new Error('Ollama is not available')
    }

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: text
      })
    })

    if (!response.ok) {
      throw new Error(`Embedding generation failed: ${response.status}`)
    }

    const data = await response.json()
    return data.embedding || []
  }
}

/**
 * OllamaProvider - implements AIProvider interface for use in AI service chain
 */
export class OllamaProvider implements AIProvider {
  name = 'Ollama'
  model = DEFAULT_MODEL

  private service: OllamaService
  private isAvailable: boolean = false
  private initPromise: Promise<void> | null = null

  constructor(baseUrl?: string) {
    this.service = new OllamaService(baseUrl)
  }

  isReady(): boolean {
    return this.isAvailable
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      this.isAvailable = await this.service.checkHealth()

      if (this.isAvailable) {
        this.model = await this.service.getBestModel()
        console.log(`[OllamaProvider] Initialized with model: ${this.model}`)
      } else {
        console.log('[OllamaProvider] Ollama not available')
      }
    } catch (error) {
      console.error('[OllamaProvider] Initialization failed:', error)
      this.isAvailable = false
    }
  }

  async streamChat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    if (!this.isAvailable) {
      // Try to initialize again
      await this.initialize()
      if (!this.isAvailable) {
        callbacks.onError(new Error('Ollama is not available. Please ensure Ollama is running on localhost:11434'))
        return
      }
    }

    callbacks.onStatus?.(`Connecting to Ollama (${this.model})...`)

    const ollamaMessages: OllamaChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    await this.service.streamChat(
      ollamaMessages,
      (token) => callbacks.onToken(token),
      () => callbacks.onComplete(),
      (error) => callbacks.onError(error),
      this.model
    )
  }

  async chat(messages: Message[]): Promise<string> {
    if (!this.isAvailable) {
      await this.initialize()
      if (!this.isAvailable) {
        throw new Error('Ollama is not available')
      }
    }

    const ollamaMessages: OllamaChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    return this.service.chat(ollamaMessages, this.model)
  }

  /**
   * Get the underlying Ollama service for advanced operations
   */
  getService(): OllamaService {
    return this.service
  }

  /**
   * Switch to a different model
   */
  async setModel(modelName: string): Promise<boolean> {
    const hasModel = await this.service.hasModel(modelName)
    if (hasModel) {
      this.model = modelName
      console.log(`[OllamaProvider] Switched to model: ${modelName}`)
      return true
    }
    console.warn(`[OllamaProvider] Model not available: ${modelName}`)
    return false
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    return this.service.listModels()
  }
}

// Export singleton instance
export const ollamaService = new OllamaService()
export const ollamaProvider = new OllamaProvider()

export default OllamaProvider
