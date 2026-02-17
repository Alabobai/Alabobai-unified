import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============================================================================
// Simple XOR-based obfuscation for localStorage storage
// Note: This is NOT true encryption - for real security, use a backend service
// This just prevents casual inspection of stored keys
// ============================================================================

const OBFUSCATION_KEY = 'alabobai-key-protection-2024'

function obfuscate(text: string): string {
  if (!text) return ''
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
    result += String.fromCharCode(charCode)
  }
  // Convert to base64 for safe storage
  return btoa(result)
}

function deobfuscate(encoded: string): string {
  if (!encoded) return ''
  try {
    const decoded = atob(encoded)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
      result += String.fromCharCode(charCode)
    }
    return result
  } catch {
    return ''
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyConfig {
  openaiKey: string
  anthropicKey: string
  groqKey: string
  geminiKey: string
  ollamaUrl: string
}

export interface ConnectionTestResult {
  provider: string
  success: boolean
  message: string
  timestamp: Date
}

interface ApiKeyState {
  // Stored keys (obfuscated in localStorage)
  keys: ApiKeyConfig

  // Connection test results
  testResults: Record<string, ConnectionTestResult>

  // Loading states for connection tests
  testingProvider: string | null

  // Actions
  setKey: (provider: keyof ApiKeyConfig, value: string) => void
  setKeys: (keys: Partial<ApiKeyConfig>) => void
  clearKey: (provider: keyof ApiKeyConfig) => void
  clearAllKeys: () => void

  // Connection testing
  setTestResult: (provider: string, result: ConnectionTestResult) => void
  setTestingProvider: (provider: string | null) => void
  clearTestResults: () => void

  // Getters (for decrypted values)
  getKey: (provider: keyof ApiKeyConfig) => string
  getAllKeys: () => ApiKeyConfig
  hasKey: (provider: keyof ApiKeyConfig) => boolean
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_KEYS: ApiKeyConfig = {
  openaiKey: '',
  anthropicKey: '',
  groqKey: '',
  geminiKey: '',
  ollamaUrl: 'http://localhost:11434',
}

// ============================================================================
// Store
// ============================================================================

export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set, get) => ({
      keys: DEFAULT_KEYS,
      testResults: {},
      testingProvider: null,

      setKey: (provider, value) => {
        set(state => ({
          keys: {
            ...state.keys,
            [provider]: provider === 'ollamaUrl' ? value : obfuscate(value),
          },
        }))
      },

      setKeys: (newKeys) => {
        set(state => {
          const updatedKeys = { ...state.keys }
          Object.entries(newKeys).forEach(([key, value]) => {
            if (value !== undefined) {
              const typedKey = key as keyof ApiKeyConfig
              updatedKeys[typedKey] = typedKey === 'ollamaUrl' ? value : obfuscate(value)
            }
          })
          return { keys: updatedKeys }
        })
      },

      clearKey: (provider) => {
        set(state => ({
          keys: {
            ...state.keys,
            [provider]: provider === 'ollamaUrl' ? DEFAULT_KEYS.ollamaUrl : '',
          },
        }))
      },

      clearAllKeys: () => {
        set({ keys: DEFAULT_KEYS, testResults: {} })
      },

      setTestResult: (provider, result) => {
        set(state => ({
          testResults: {
            ...state.testResults,
            [provider]: result,
          },
        }))
      },

      setTestingProvider: (provider) => {
        set({ testingProvider: provider })
      },

      clearTestResults: () => {
        set({ testResults: {} })
      },

      getKey: (provider) => {
        const { keys } = get()
        if (provider === 'ollamaUrl') {
          return keys.ollamaUrl || DEFAULT_KEYS.ollamaUrl
        }
        return deobfuscate(keys[provider])
      },

      getAllKeys: () => {
        const { keys } = get()
        return {
          openaiKey: deobfuscate(keys.openaiKey),
          anthropicKey: deobfuscate(keys.anthropicKey),
          groqKey: deobfuscate(keys.groqKey),
          geminiKey: deobfuscate(keys.geminiKey),
          ollamaUrl: keys.ollamaUrl || DEFAULT_KEYS.ollamaUrl,
        }
      },

      hasKey: (provider) => {
        const { keys } = get()
        if (provider === 'ollamaUrl') {
          return !!keys.ollamaUrl
        }
        return !!keys[provider] && deobfuscate(keys[provider]).length > 0
      },
    }),
    {
      name: 'alabobai-api-keys',
      // Only persist the keys, not the test results or loading states
      partialize: (state) => ({ keys: state.keys }),
    }
  )
)

// ============================================================================
// Connection Test Utilities
// ============================================================================

export async function testOpenAIConnection(apiKey: string): Promise<ConnectionTestResult> {
  const provider = 'OpenAI'
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      return {
        provider,
        success: true,
        message: 'Connected to OpenAI API successfully!',
        timestamp: new Date(),
      }
    } else if (response.status === 401) {
      return {
        provider,
        success: false,
        message: 'Invalid API key. Please check your OpenAI API key.',
        timestamp: new Date(),
      }
    } else {
      return {
        provider,
        success: false,
        message: `API error: ${response.status} ${response.statusText}`,
        timestamp: new Date(),
      }
    }
  } catch (error) {
    return {
      provider,
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
      timestamp: new Date(),
    }
  }
}

export async function testAnthropicConnection(apiKey: string): Promise<ConnectionTestResult> {
  const provider = 'Anthropic'
  try {
    // Anthropic doesn't have a simple ping endpoint, so we make a minimal request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (response.ok || response.status === 200) {
      return {
        provider,
        success: true,
        message: 'Connected to Anthropic API successfully!',
        timestamp: new Date(),
      }
    } else if (response.status === 401) {
      return {
        provider,
        success: false,
        message: 'Invalid API key. Please check your Anthropic API key.',
        timestamp: new Date(),
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      return {
        provider,
        success: false,
        message: errorData.error?.message || `API error: ${response.status}`,
        timestamp: new Date(),
      }
    }
  } catch (error) {
    return {
      provider,
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
      timestamp: new Date(),
    }
  }
}

export async function testGroqConnection(apiKey: string): Promise<ConnectionTestResult> {
  const provider = 'Groq'
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      return {
        provider,
        success: true,
        message: 'Connected to Groq API successfully!',
        timestamp: new Date(),
      }
    } else if (response.status === 401) {
      return {
        provider,
        success: false,
        message: 'Invalid API key. Please check your Groq API key.',
        timestamp: new Date(),
      }
    } else {
      return {
        provider,
        success: false,
        message: `API error: ${response.status} ${response.statusText}`,
        timestamp: new Date(),
      }
    }
  } catch (error) {
    return {
      provider,
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
      timestamp: new Date(),
    }
  }
}

export async function testOllamaConnection(ollamaUrl: string): Promise<ConnectionTestResult> {
  const provider = 'Ollama'
  try {
    const url = ollamaUrl.endsWith('/') ? ollamaUrl.slice(0, -1) : ollamaUrl
    const response = await fetch(`${url}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      const modelCount = data.models?.length || 0
      return {
        provider,
        success: true,
        message: `Connected to Ollama! ${modelCount} model${modelCount !== 1 ? 's' : ''} available.`,
        timestamp: new Date(),
      }
    } else {
      return {
        provider,
        success: false,
        message: `Ollama responded with error: ${response.status}`,
        timestamp: new Date(),
      }
    }
  } catch (error) {
    return {
      provider,
      success: false,
      message: 'Cannot connect to Ollama. Make sure it is running.',
      timestamp: new Date(),
    }
  }
}

export async function testGeminiConnection(apiKey: string): Promise<ConnectionTestResult> {
  const provider = 'Gemini'
  try {
    // Use the models list endpoint as a lightweight test
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      }
    )

    if (response.ok) {
      const data = await response.json()
      const modelCount = data.models?.length || 0
      return {
        provider,
        success: true,
        message: `Connected to Gemini API! ${modelCount} models available.`,
        timestamp: new Date(),
      }
    } else if (response.status === 400 || response.status === 403) {
      return {
        provider,
        success: false,
        message: 'Invalid API key. Please check your Gemini API key.',
        timestamp: new Date(),
      }
    } else {
      return {
        provider,
        success: false,
        message: `API error: ${response.status} ${response.statusText}`,
        timestamp: new Date(),
      }
    }
  } catch (error) {
    return {
      provider,
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
      timestamp: new Date(),
    }
  }
}
