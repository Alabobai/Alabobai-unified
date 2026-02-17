/**
 * useMemoryChat Hook
 *
 * Integrates the persistent memory system with chat functionality.
 * - Remembers conversations automatically
 * - Recalls relevant context before responses
 * - Learns user preferences from interactions
 * - Finds similar solutions to problems
 */

import { useCallback, useRef } from 'react'
import {
  persistentMemory,
  type Memory,
  type SolutionMatch
} from '../core/persistentMemory'

export interface MemoryChatContext {
  relevantMemories: Memory[]
  suggestedSolutions: SolutionMatch[]
  conversationId: string
}

export interface UseMemoryChatOptions {
  projectId?: string
  maxContextMemories?: number
  minRelevanceScore?: number
}

export function useMemoryChat(options: UseMemoryChatOptions = {}) {
  const {
    projectId,
    maxContextMemories = 5,
    minRelevanceScore = 0.3
  } = options

  const conversationIdRef = useRef(`conv-${Date.now()}`)
  const messageCountRef = useRef(0)

  /**
   * Initialize memory system and set project context
   */
  const initializeMemory = useCallback(async () => {
    await persistentMemory.initialize()

    if (projectId) {
      await persistentMemory.setCurrentProject(projectId)
    }
  }, [projectId])

  /**
   * Get relevant context memories before generating a response
   */
  const getContextForQuery = useCallback(async (
    userMessage: string
  ): Promise<MemoryChatContext> => {
    await initializeMemory()

    // Recall relevant memories
    const relevantMemories = await persistentMemory.recall({
      query: userMessage,
      filters: {
        types: ['conversation', 'knowledge', 'solution', 'decision', 'code_pattern'],
        minImportance: 30
      },
      limit: maxContextMemories,
      minRelevance: minRelevanceScore,
      includeRelations: true
    })

    // Find similar solutions if the message looks like a question/problem
    let suggestedSolutions: SolutionMatch[] = []
    const isProblem = /\?|how|why|what|error|fix|solve|issue|problem|bug/i.test(userMessage)
    if (isProblem) {
      suggestedSolutions = await persistentMemory.findSimilarSolutions(userMessage, 3)
    }

    return {
      relevantMemories,
      suggestedSolutions,
      conversationId: conversationIdRef.current
    }
  }, [initializeMemory, maxContextMemories, minRelevanceScore])

  /**
   * Build context string for the AI from memories
   */
  const buildContextPrompt = useCallback((context: MemoryChatContext): string => {
    const parts: string[] = []

    if (context.relevantMemories.length > 0) {
      parts.push('Relevant context from previous conversations:')
      for (const memory of context.relevantMemories) {
        const truncated = memory.content.length > 300
          ? memory.content.substring(0, 300) + '...'
          : memory.content
        parts.push(`- ${truncated}`)
      }
    }

    if (context.suggestedSolutions.length > 0) {
      parts.push('\nSimilar problems and solutions found:')
      for (const solution of context.suggestedSolutions) {
        const truncated = solution.memory.content.length > 400
          ? solution.memory.content.substring(0, 400) + '...'
          : solution.memory.content
        parts.push(`[${Math.round(solution.successRate * 100)}% success] ${truncated}`)
      }
    }

    if (parts.length === 0) {
      return ''
    }

    return parts.join('\n') + '\n\nNow respond to the user\'s message:'
  }, [])

  /**
   * Remember a user message
   */
  const rememberUserMessage = useCallback(async (content: string) => {
    await initializeMemory()
    messageCountRef.current++

    await persistentMemory.remember(
      content,
      'conversation',
      {
        importance: 40,
        metadata: {
          conversationId: conversationIdRef.current,
          messageNumber: messageCountRef.current,
          role: 'user'
        },
        tags: ['user-message', 'conversation']
      }
    )
  }, [initializeMemory])

  /**
   * Remember an assistant response
   */
  const rememberAssistantResponse = useCallback(async (
    userMessage: string,
    assistantResponse: string
  ) => {
    await initializeMemory()

    // Only remember substantial responses
    if (assistantResponse.length < 50) return

    const importance = assistantResponse.length > 500 ? 60 : 50

    await persistentMemory.remember(
      `Q: ${userMessage}\nA: ${assistantResponse}`,
      'conversation',
      {
        importance,
        metadata: {
          conversationId: conversationIdRef.current,
          messageNumber: messageCountRef.current,
          role: 'assistant',
          userQuery: userMessage
        },
        tags: ['assistant-response', 'conversation']
      }
    )

    // If this looks like a solution, store it as such
    const isSolution = /here's how|solution|to fix|you can|try this/i.test(assistantResponse)
    if (isSolution) {
      await persistentMemory.rememberSolution(
        userMessage,
        assistantResponse,
        {
          outcome: 'success',
          context: 'chat',
          tags: ['chat-solution']
        }
      )
    }
  }, [initializeMemory])

  /**
   * Learn a preference from user feedback
   */
  const learnFromFeedback = useCallback(async (
    category: 'positive' | 'negative',
    context: string,
    details?: Record<string, unknown>
  ) => {
    await initializeMemory()

    if (category === 'positive') {
      // Learn what the user likes
      await persistentMemory.learnPreference(
        `response_style_${context}`,
        true,
        'communication',
        {
          type: 'implicit',
          context: `User gave positive feedback: ${context}`,
          timestamp: Date.now(),
          weight: 0.8
        }
      )
    } else {
      // Learn what the user doesn't like
      await persistentMemory.learnPreference(
        `avoid_${context}`,
        true,
        'communication',
        {
          type: 'feedback',
          context: `User gave negative feedback: ${context}`,
          timestamp: Date.now(),
          weight: 0.9
        }
      )
    }
  }, [initializeMemory])

  /**
   * Mark a solution as successful or failed
   */
  const markSolutionOutcome = useCallback(async (
    memoryId: string,
    outcome: 'success' | 'partial' | 'failure'
  ) => {
    await persistentMemory.updateSolutionOutcome(memoryId, outcome)
  }, [])

  /**
   * Start a new conversation
   */
  const startNewConversation = useCallback(() => {
    conversationIdRef.current = `conv-${Date.now()}`
    messageCountRef.current = 0
  }, [])

  /**
   * Get memory statistics
   */
  const getMemoryStats = useCallback(async () => {
    await initializeMemory()
    return persistentMemory.getStats()
  }, [initializeMemory])

  return {
    // Context building
    getContextForQuery,
    buildContextPrompt,

    // Memory operations
    rememberUserMessage,
    rememberAssistantResponse,

    // Learning
    learnFromFeedback,
    markSolutionOutcome,

    // Session management
    startNewConversation,
    conversationId: conversationIdRef.current,

    // Stats
    getMemoryStats
  }
}

export default useMemoryChat
