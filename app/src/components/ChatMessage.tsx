import React from 'react'
import { User, Bot, Copy, Check, Eye, Code2 } from 'lucide-react'
import { useState, useMemo } from 'react'
import type { Message } from '@/stores/appStore'
import { useAppStore } from '@/stores/appStore'
import codeBuilder from '@/services/codeBuilder'

interface ChatMessageProps {
  message: Message
}

// Parse message content and extract code blocks
function parseContent(content: string): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = []
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before this code block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim()
      if (text) {
        parts.push({ type: 'text', content: text })
      }
    }

    // Add the code block
    parts.push({
      type: 'code',
      content: match[2].trim(),
      language: match[1]?.toLowerCase() || 'text'
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim()
    if (text) {
      parts.push({ type: 'text', content: text })
    }
  }

  // If no code blocks found, return the whole content as text
  if (parts.length === 0) {
    parts.push({ type: 'text', content })
  }

  return parts
}

// Simple syntax highlighting for code blocks
function highlightCode(code: string, language: string): React.ReactElement {
  // Basic syntax highlighting patterns
  const patterns: { pattern: RegExp; className: string }[] = []

  if (language === 'html' || language === 'xml') {
    patterns.push(
      { pattern: /(&lt;[\/]?[\w-]+)/g, className: 'text-rose-gold-400' }, // Tags
      { pattern: /([\w-]+)=/g, className: 'text-yellow-400' }, // Attributes
      { pattern: /"([^"]*)"/g, className: 'text-green-400' }, // Strings
      { pattern: /(&lt;!--[\s\S]*?--&gt;)/g, className: 'text-white/40 italic' }, // Comments
    )
  } else if (language === 'javascript' || language === 'typescript' || language === 'jsx' || language === 'tsx') {
    patterns.push(
      { pattern: /\b(const|let|var|function|return|if|else|for|while|import|export|from|default|async|await|class|extends|new|this|try|catch|throw)\b/g, className: 'text-purple-400' }, // Keywords
      { pattern: /\b(true|false|null|undefined)\b/g, className: 'text-orange-400' }, // Literals
      { pattern: /"([^"]*)"|'([^']*)'/g, className: 'text-green-400' }, // Strings
      { pattern: /\b(\d+\.?\d*)\b/g, className: 'text-orange-400' }, // Numbers
      { pattern: /(\/\/.*$)/gm, className: 'text-white/40 italic' }, // Comments
    )
  } else if (language === 'python') {
    patterns.push(
      { pattern: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|lambda|and|or|not|in|is|True|False|None)\b/g, className: 'text-purple-400' }, // Keywords
      { pattern: /"([^"]*)"|'([^']*)'/g, className: 'text-green-400' }, // Strings
      { pattern: /\b(\d+\.?\d*)\b/g, className: 'text-orange-400' }, // Numbers
      { pattern: /(#.*$)/gm, className: 'text-white/40 italic' }, // Comments
    )
  } else if (language === 'css') {
    patterns.push(
      { pattern: /([\w-]+):/g, className: 'text-cyan-400' }, // Properties
      { pattern: /\.([\w-]+)/g, className: 'text-green-400' }, // Classes
      { pattern: /#([\w-]+)/g, className: 'text-yellow-400' }, // IDs
    )
  }

  // For now, just escape HTML and wrap in a pre
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return (
    <code dangerouslySetInnerHTML={{ __html: escaped }} />
  )
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const { setGeneratedCode, setActiveTab, workspaceOpen, toggleWorkspace } = useAppStore()
  const isUser = message.role === 'user'

  // Parse content into text and code parts
  const contentParts = useMemo(() => {
    if (message.status === 'streaming') {
      // Don't parse while streaming - just show raw content
      return [{ type: 'text' as const, content: message.content }]
    }
    return parseContent(message.content)
  }, [message.content, message.status])

  // Check if message contains previewable code
  const hasPreviewableCode = useMemo(() => {
    if (message.status === 'streaming') return false
    const blocks = codeBuilder.extractCodeBlocks(message.content)
    return blocks.some(b =>
      b.language === 'html' ||
      b.language === 'javascript' ||
      b.language === 'typescript' ||
      b.language === 'jsx' ||
      b.language === 'tsx'
    )
  }, [message.content, message.status])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handlePreview = () => {
    const blocks = codeBuilder.extractCodeBlocks(message.content)
    const previewHtml = codeBuilder.makePreviewable(blocks)
    if (previewHtml) {
      setGeneratedCode(previewHtml)
      if (!workspaceOpen) {
        toggleWorkspace()
      }
      setActiveTab('preview')
    }
  }

  const handleViewCode = () => {
    const blocks = codeBuilder.extractCodeBlocks(message.content)
    if (blocks.length > 0) {
      const previewHtml = codeBuilder.makePreviewable(blocks) || blocks[0].code
      setGeneratedCode(previewHtml)
      if (!workspaceOpen) {
        toggleWorkspace()
      }
      setActiveTab('code')
    }
  }

  return (
    <div className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`morphic-glass rounded-2xl p-4 max-w-[85%] ${
        isUser
          ? 'bg-rose-gold-400/10 border border-rose-gold-400/20'
          : 'bg-dark-300/50 border border-rose-gold-400/10'
      }`}>
        <div className="flex gap-3">
          {/* Avatar */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
            isUser
              ? 'bg-rose-gold-400/20 text-rose-gold-400'
              : 'bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 text-dark-500 shadow-glow-sm'
          }`}>
            {isUser ? (
              <User className="w-4 h-4" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium ${isUser ? 'text-rose-gold-400' : 'text-white'}`}>
                {isUser ? 'You' : 'Alabobai'}
              </span>
              <span className="text-xs text-rose-gold-400/40">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

          {/* Message Content with Code Blocks */}
          <div className="text-sm text-white/80 leading-relaxed">
            {contentParts.map((part, index) => {
              if (part.type === 'code') {
                return (
                  <div key={index} className="my-3 rounded-xl overflow-hidden border border-rose-gold-400/10 morphic-glass">
                    {/* Code Header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-dark-300/50 border-b border-rose-gold-400/10">
                      <span className="text-xs text-rose-gold-400/60 font-mono">
                        {part.language?.toUpperCase() || 'CODE'}
                      </span>
                      <button
                        onClick={() => handleCopyCode(part.content)}
                        className="flex items-center gap-1 text-xs text-rose-gold-400/50 hover:text-rose-gold-400 transition-colors"
                      >
                        {copiedCode === part.content ? (
                          <>
                            <Check className="w-3 h-3 text-rose-gold-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    {/* Code Content */}
                    <div className="p-4 bg-dark-400/50 overflow-x-auto morphic-scrollbar">
                      <pre className="text-xs font-mono leading-relaxed">
                        {highlightCode(part.content, part.language || 'text')}
                      </pre>
                    </div>
                  </div>
                )
              }

              // Text content
              return (
                <div key={index} className="whitespace-pre-wrap">
                  {part.content}
                </div>
              )
            })}

            {message.status === 'streaming' && (
              <span className="inline-block w-2 h-4 bg-rose-gold-400 ml-1 animate-pulse rounded-sm" />
            )}
          </div>

          {/* Tool Calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.toolCalls.map(tool => (
                <div
                  key={tool.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl morphic-glass border border-rose-gold-400/10 text-xs"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    tool.status === 'complete' ? 'bg-rose-gold-400' :
                    tool.status === 'running' ? 'bg-rose-gold-400 animate-pulse shadow-glow-sm' :
                    tool.status === 'error' ? 'bg-red-400' :
                    'bg-rose-gold-400/30'
                  }`} />
                  <span className="font-mono text-rose-gold-400">{tool.name}</span>
                  <span className="text-rose-gold-400/50">
                    {tool.status === 'complete' ? 'completed' :
                     tool.status === 'running' ? 'running...' :
                     tool.status === 'error' ? 'failed' : 'pending'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {!isUser && message.status === 'complete' && (
            <div className="flex items-center gap-2 mt-3">
              {hasPreviewableCode && (
                <>
                  <button
                    onClick={handlePreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-medium hover:from-rose-gold-300 hover:to-rose-gold-500 transition-all shadow-glow-sm"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Preview</span>
                  </button>
                  <button
                    onClick={handleViewCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs morphic-glass border border-rose-gold-400/20 text-rose-gold-400/80 hover:text-rose-gold-400 hover:border-rose-gold-400/40 transition-colors"
                  >
                    <Code2 className="w-3 h-3" />
                    <span>View in Editor</span>
                  </button>
                </>
              )}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-rose-gold-400/50 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-rose-gold-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy All</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
