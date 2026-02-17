/**
 * Chat Memory Integration Component
 *
 * Wrapper component that integrates persistent memory into chat:
 * - Injects relevant memories into AI context
 * - Extracts and stores new memories after conversations
 * - Shows "I remember..." indicator when using memory
 * - Handles "remember this" and "forget this" commands
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Brain, X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatMemory } from '../hooks/useMemory'
import { MemoryIndicator, MemoryCommandResult } from './MemoryIndicator'
import type { Memory, ConversationMessage } from '../services/memory'

// ============================================================================
// Types
// ============================================================================

interface ChatMemoryIntegrationProps {
  userId?: string
  onContextReady?: (context: string, memories: Memory[]) => void
  onMemoryCommand?: (type: 'remember' | 'forget', result: {
    success: boolean
    message: string
    count?: number
  }) => void
}

interface MemoryCommandState {
  type: 'remember' | 'forget'
  success: boolean
  message: string
  count?: number
  visible: boolean
}

// ============================================================================
// Component
// ============================================================================

export function ChatMemoryIntegration({
  userId,
  onContextReady,
  onMemoryCommand
}: ChatMemoryIntegrationProps) {
  const {
    isMemoryEnabled,
    usingMemory,
    relevantMemories,
    getMemoryContext,
    trackMessage,
    extractAndStore,
    handleRememberCommand,
    handleForgetCommand,
    clearConversation,
    parseMemoryCommand,
  } = useChatMemory(userId)

  const [showMemoryIndicator, setShowMemoryIndicator] = useState(false)
  const [commandResult, setCommandResult] = useState<MemoryCommandState | null>(null)
  const extractionTimeoutRef = useRef<NodeJS.Timeout>()

  // Clear command result after display
  useEffect(() => {
    if (commandResult?.visible) {
      const timeout = setTimeout(() => {
        setCommandResult(prev => prev ? { ...prev, visible: false } : null)
      }, 5000)
      return () => clearTimeout(timeout)
    }
  }, [commandResult])

  /**
   * Process user message for memory context
   */
  const processUserMessage = useCallback(async (message: string): Promise<{
    contextPrompt: string
    memories: Memory[]
    isMemoryCommand: boolean
    memoryCommandType?: 'remember' | 'forget'
    memoryCommandContent?: string
  }> => {
    if (!isMemoryEnabled) {
      return { contextPrompt: '', memories: [], isMemoryCommand: false }
    }

    // Check for memory commands
    const command = parseMemoryCommand(message)
    if (command.type && command.content) {
      return {
        contextPrompt: '',
        memories: [],
        isMemoryCommand: true,
        memoryCommandType: command.type,
        memoryCommandContent: command.content,
      }
    }

    // Get relevant context for the message
    const context = await getMemoryContext(message)
    setShowMemoryIndicator(context.memories.length > 0)

    if (onContextReady) {
      onContextReady(context.contextPrompt, context.memories)
    }

    return {
      contextPrompt: context.contextPrompt,
      memories: context.memories,
      isMemoryCommand: false,
    }
  }, [isMemoryEnabled, parseMemoryCommand, getMemoryContext, onContextReady])

  /**
   * Handle memory command
   */
  const executeMemoryCommand = useCallback(async (
    type: 'remember' | 'forget',
    content: string
  ): Promise<{ success: boolean; message: string; count?: number }> => {
    try {
      if (type === 'remember') {
        const result = await handleRememberCommand(content)
        const response = {
          success: result.success,
          message: result.message,
        }
        setCommandResult({ ...response, type, visible: true })
        onMemoryCommand?.(type, response)
        return response
      } else {
        const result = await handleForgetCommand(content)
        const response = {
          success: result.success,
          message: result.message,
          count: result.deletedCount,
        }
        setCommandResult({ ...response, type, visible: true })
        onMemoryCommand?.(type, response)
        return response
      }
    } catch (err) {
      const response = {
        success: false,
        message: 'Failed to process memory command',
      }
      setCommandResult({ ...response, type, visible: true })
      onMemoryCommand?.(type, response)
      return response
    }
  }, [handleRememberCommand, handleForgetCommand, onMemoryCommand])

  /**
   * Track conversation message
   */
  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    trackMessage({ role, content, timestamp: Date.now() })

    // Schedule extraction after assistant messages
    if (role === 'assistant') {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current)
      }
      // Extract memories 2 seconds after last message
      extractionTimeoutRef.current = setTimeout(() => {
        extractAndStore()
      }, 2000)
    }
  }, [trackMessage, extractAndStore])

  /**
   * Clear conversation and memory state
   */
  const clear = useCallback(() => {
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current)
    }
    clearConversation()
    setShowMemoryIndicator(false)
    setCommandResult(null)
  }, [clearConversation])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current)
      }
    }
  }, [])

  return {
    // State
    isMemoryEnabled,
    usingMemory,
    relevantMemories,
    showMemoryIndicator,
    commandResult,

    // Actions
    processUserMessage,
    executeMemoryCommand,
    addMessage,
    clear,
    dismissIndicator: () => setShowMemoryIndicator(false),
    dismissCommandResult: () => setCommandResult(null),
  }
}

// ============================================================================
// Memory Status Bar Component
// ============================================================================

interface MemoryStatusBarProps {
  memories: Memory[]
  isVisible: boolean
  commandResult: MemoryCommandState | null
  onDismiss?: () => void
  onDismissCommand?: () => void
}

export function MemoryStatusBar({
  memories,
  isVisible,
  commandResult,
  onDismiss,
  onDismissCommand
}: MemoryStatusBarProps) {
  return (
    <>
      <AnimatePresence>
        {isVisible && memories.length > 0 && (
          <MemoryIndicator
            memories={memories}
            isVisible={isVisible}
            onDismiss={onDismiss}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {commandResult?.visible && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3"
          >
            <MemoryCommandResult
              type={commandResult.type}
              success={commandResult.success}
              message={commandResult.message}
              count={commandResult.count}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ============================================================================
// Memory Toggle Button
// ============================================================================

interface MemoryToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  className?: string
}

export function MemoryToggle({ enabled, onChange, className = '' }: MemoryToggleProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
        enabled
          ? 'bg-rose-gold-400/10 text-rose-gold-300 border border-rose-gold-400/20'
          : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
      } ${className}`}
      title={enabled ? 'Memory enabled' : 'Memory disabled'}
    >
      <Brain className="w-4 h-4" />
      <span className="text-xs font-medium">Memory</span>
      <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-rose-gold-400' : 'bg-white/30'}`} />
    </button>
  )
}

// ============================================================================
// Export Hook for Easy Integration
// ============================================================================

export function useChatMemoryIntegration(userId?: string) {
  const [state, setState] = useState<ReturnType<typeof ChatMemoryIntegration> | null>(null)

  // This creates a stable reference to the integration
  const integrationRef = useRef<ReturnType<typeof ChatMemoryIntegration> | null>(null)

  useEffect(() => {
    // Create the integration instance
    const integration = ChatMemoryIntegration({ userId })
    integrationRef.current = integration
    setState(integration)
  }, [userId])

  return state
}

export default ChatMemoryIntegration
