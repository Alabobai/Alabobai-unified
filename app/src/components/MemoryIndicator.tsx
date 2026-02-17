/**
 * Memory Indicator Component
 *
 * Shows when AI is using memory in a conversation:
 * - "I remember..." indicator when memories are being used
 * - Small memory count badge
 * - Expandable view of relevant memories
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react'
import type { Memory } from '../services/memory'

// ============================================================================
// Types
// ============================================================================

interface MemoryIndicatorProps {
  memories: Memory[]
  isVisible: boolean
  onDismiss?: () => void
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

export function MemoryIndicator({
  memories,
  isVisible,
  onDismiss,
  compact = false
}: MemoryIndicatorProps) {
  const [expanded, setExpanded] = useState(false)

  if (!isVisible || memories.length === 0) {
    return null
  }

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-gold-400/10 border border-rose-gold-400/20"
      >
        <Brain className="w-3 h-3 text-rose-gold-400" />
        <span className="text-xs text-rose-gold-300">
          Using {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
        </span>
      </motion.div>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-3 rounded-xl bg-gradient-to-r from-rose-gold-400/10 to-rose-gold-500/5 border border-rose-gold-400/20 overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <Brain className="w-4 h-4 text-rose-gold-400" />
              <Sparkles className="w-2.5 h-2.5 text-rose-gold-300 absolute -top-1 -right-1" />
            </div>
            <span className="text-sm font-medium text-rose-gold-300">
              I remember...
            </span>
            <span className="text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
              {memories.length} relevant {memories.length === 1 ? 'memory' : 'memories'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="p-1 rounded-lg hover:bg-white/5 text-white/40"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {onDismiss && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDismiss()
                }}
                className="p-1 rounded-lg hover:bg-white/5 text-white/40"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-rose-gold-400/10"
            >
              <div className="p-3 space-y-2 max-h-48 overflow-y-auto morphic-scrollbar">
                {memories.map((memory, idx) => (
                  <div
                    key={memory.id}
                    className="p-2 rounded-lg bg-white/5 border border-white/5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-xs bg-rose-gold-400/10 text-rose-gold-300">
                        {memory.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-white/30">
                        {new Date(memory.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-white/70 line-clamp-2">
                      {memory.content}
                    </p>
                    {memory.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {memory.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="px-1 py-0.5 rounded text-xs bg-white/5 text-white/40"
                          >
                            {tag}
                          </span>
                        ))}
                        {memory.tags.length > 3 && (
                          <span className="text-xs text-white/30">
                            +{memory.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

// ============================================================================
// Memory Badge for Message Bubbles
// ============================================================================

interface MemoryBadgeProps {
  count: number
  onClick?: () => void
}

export function MemoryBadge({ count, onClick }: MemoryBadgeProps) {
  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-gold-400/10 text-rose-gold-300 hover:bg-rose-gold-400/20 transition-colors"
      title={`Using ${count} ${count === 1 ? 'memory' : 'memories'}`}
    >
      <Brain className="w-3 h-3" />
      <span className="text-xs">{count}</span>
    </button>
  )
}

// ============================================================================
// Remember/Forget Command Result
// ============================================================================

interface MemoryCommandResultProps {
  type: 'remember' | 'forget'
  success: boolean
  message: string
  count?: number
}

export function MemoryCommandResult({
  type,
  success,
  message,
  count
}: MemoryCommandResultProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
        success
          ? 'bg-rose-gold-400/10 border border-rose-gold-400/20'
          : 'bg-rose-gold-500/10 border border-rose-gold-500/20'
      }`}
    >
      <Brain className={`w-4 h-4 ${success ? 'text-rose-gold-400' : 'text-rose-gold-500'}`} />
      <span className="text-sm text-white/80">{message}</span>
      {count !== undefined && (
        <span className="text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
          {count}
        </span>
      )}
    </motion.div>
  )
}

export default MemoryIndicator
