import React from 'react'
import { User, Bot, Copy, Check, Eye, Code2, Play, Loader2, Terminal, X } from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'
import type { Message } from '@/stores/appStore'
import { useAppStore } from '@/stores/appStore'
import codeBuilder from '@/services/codeBuilder'
import { BRAND_GRADIENT_ACCENT, BRAND_TOKENS } from '@/config/brandTokens'
import { BRAND } from '@/config/brand'
import codeSandbox, {
  isExecutableLanguage,
  normalizeLanguage,
  formatDuration,
  type ExecutionOutput
} from '@/services/codeSandbox'

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
      { pattern: /([\w-]+)=/g, className: 'text-rose-gold-400' }, // Attributes
      { pattern: /"([^"]*)"/g, className: 'text-rose-gold-400' }, // Strings
      { pattern: /(&lt;!--[\s\S]*?--&gt;)/g, className: 'text-white/40 italic' }, // Comments
    )
  } else if (language === 'javascript' || language === 'typescript' || language === 'jsx' || language === 'tsx') {
    patterns.push(
      { pattern: /\b(const|let|var|function|return|if|else|for|while|import|export|from|default|async|await|class|extends|new|this|try|catch|throw)\b/g, className: 'text-rose-gold-400' }, // Keywords
      { pattern: /\b(true|false|null|undefined)\b/g, className: 'text-rose-gold-400' }, // Literals
      { pattern: /"([^"]*)"|'([^']*)'/g, className: 'text-rose-gold-400' }, // Strings
      { pattern: /\b(\d+\.?\d*)\b/g, className: 'text-rose-gold-400' }, // Numbers
      { pattern: /(\/\/.*$)/gm, className: 'text-white/40 italic' }, // Comments
    )
  } else if (language === 'python') {
    patterns.push(
      { pattern: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|lambda|and|or|not|in|is|True|False|None)\b/g, className: 'text-rose-gold-400' }, // Keywords
      { pattern: /"([^"]*)"|'([^']*)'/g, className: 'text-rose-gold-400' }, // Strings
      { pattern: /\b(\d+\.?\d*)\b/g, className: 'text-rose-gold-400' }, // Numbers
      { pattern: /(#.*$)/gm, className: 'text-white/40 italic' }, // Comments
    )
  } else if (language === 'css') {
    patterns.push(
      { pattern: /([\w-]+):/g, className: 'text-rose-gold-400' }, // Properties
      { pattern: /\.([\w-]+)/g, className: 'text-rose-gold-400' }, // Classes
      { pattern: /#([\w-]+)/g, className: 'text-rose-gold-400' }, // IDs
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

// Code Execution State for individual code blocks
interface CodeBlockExecutionState {
  isRunning: boolean;
  showOutput: boolean;
  outputs: ExecutionOutput[];
  error: string | null;
  result: { success: boolean; duration: number } | null;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [codeExecutions, setCodeExecutions] = useState<Map<number, CodeBlockExecutionState>>(new Map())
  const { setGeneratedCode, setActiveTab, workspaceOpen, toggleWorkspace } = useAppStore()
  const isUser = message.role === 'user'

  // Handle running code from a code block
  const handleRunCode = useCallback(async (code: string, language: string, blockIndex: number) => {
    if (!isExecutableLanguage(language)) return;

    const normalizedLang = normalizeLanguage(language);

    // Initialize execution state
    setCodeExecutions(prev => {
      const newMap = new Map(prev);
      newMap.set(blockIndex, {
        isRunning: true,
        showOutput: true,
        outputs: [],
        error: null,
        result: null
      });
      return newMap;
    });

    try {
      await codeSandbox.executeWithStream(
        { language: normalizedLang, code },
        {
          onStart: () => {},
          onOutput: (output) => {
            setCodeExecutions(prev => {
              const newMap = new Map(prev);
              const state = newMap.get(blockIndex);
              if (state) {
                newMap.set(blockIndex, {
                  ...state,
                  outputs: [...state.outputs, output]
                });
              }
              return newMap;
            });
          },
          onComplete: (res) => {
            setCodeExecutions(prev => {
              const newMap = new Map(prev);
              const state = newMap.get(blockIndex);
              if (state) {
                newMap.set(blockIndex, {
                  ...state,
                  isRunning: false,
                  result: { success: res.success, duration: res.duration }
                });
              }
              return newMap;
            });
          },
          onError: (err) => {
            setCodeExecutions(prev => {
              const newMap = new Map(prev);
              const state = newMap.get(blockIndex);
              if (state) {
                newMap.set(blockIndex, {
                  ...state,
                  isRunning: false,
                  error: err
                });
              }
              return newMap;
            });
          }
        }
      );
    } catch (err) {
      setCodeExecutions(prev => {
        const newMap = new Map(prev);
        const state = newMap.get(blockIndex);
        if (state) {
          newMap.set(blockIndex, {
            ...state,
            isRunning: false,
            error: err instanceof Error ? err.message : 'Execution failed'
          });
        }
        return newMap;
      });
    }
  }, []);

  // Close code output panel
  const handleCloseOutput = useCallback((blockIndex: number) => {
    setCodeExecutions(prev => {
      const newMap = new Map(prev);
      newMap.delete(blockIndex);
      return newMap;
    });
  }, []);

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
          {isUser ? (
            <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-rose-gold-400/20 text-rose-gold-400">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-glow-sm"
              style={{ background: BRAND_GRADIENT_ACCENT }}
            >
              <Bot className="w-4 h-4 text-dark-500" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium ${isUser ? 'text-rose-gold-400' : 'text-white'}`}>
                {isUser ? 'You' : BRAND.name}
              </span>
              <span className="text-xs text-rose-gold-400/40">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

          {/* Message Content with Code Blocks */}
          <div className="text-sm text-white/80 leading-relaxed">
            {contentParts.map((part, index) => {
              if (part.type === 'code') {
                const execState = codeExecutions.get(index);
                const canExecute = isExecutableLanguage(part.language || '');

                return (
                  <div key={index} className="my-3 rounded-xl overflow-hidden border border-rose-gold-400/10 morphic-glass">
                    {/* Code Header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-dark-300/50 border-b border-rose-gold-400/10">
                      <span className="text-xs text-rose-gold-400/60 font-mono">
                        {part.language?.toUpperCase() || 'CODE'}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Run Code Button */}
                        {canExecute && (
                          <button
                            onClick={() => handleRunCode(part.content, part.language || '', index)}
                            disabled={execState?.isRunning}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-50 hover:opacity-90"
                            style={{
                              background: BRAND_GRADIENT_ACCENT,
                              color: BRAND_TOKENS.text.onAccent
                            }}
                          >
                            {execState?.isRunning ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Running</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3" />
                                <span>Run</span>
                              </>
                            )}
                          </button>
                        )}
                        {/* Copy Button */}
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
                    </div>
                    {/* Code Content */}
                    <div className="p-4 bg-dark-400/50 overflow-x-auto morphic-scrollbar">
                      <pre className="text-xs font-mono leading-relaxed">
                        {highlightCode(part.content, part.language || 'text')}
                      </pre>
                    </div>
                    {/* Execution Output */}
                    {execState?.showOutput && (
                      <div className="border-t border-rose-gold-400/10">
                        <div className="flex items-center justify-between px-3 py-2 bg-dark-400/30">
                          <div className="flex items-center gap-2">
                            <Terminal className="w-3 h-3" style={{ color: BRAND_TOKENS.accent.base }} />
                            <span className="text-xs text-white/60">Output</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {execState.result && (
                              <span className={`text-xs ${execState.result.success ? 'text-rose-gold-400' : 'text-rose-400'}`}>
                                {execState.result.success ? 'Success' : 'Failed'} ({formatDuration(execState.result.duration)})
                              </span>
                            )}
                            <button
                              onClick={() => handleCloseOutput(index)}
                              className="p-1 rounded hover:bg-rose-gold-400/10 transition-colors"
                            >
                              <X className="w-3 h-3 text-white/50" />
                            </button>
                          </div>
                        </div>
                        <div className="px-3 py-2 max-h-40 overflow-auto font-mono text-xs morphic-scrollbar bg-dark-500/50">
                          {execState.outputs.map((output, i) => (
                            <div
                              key={i}
                              className={`whitespace-pre-wrap ${
                                output.type === 'stderr' ? 'text-rose-400' :
                                output.type === 'system' ? 'text-white/50 italic' : 'text-white/80'
                              }`}
                            >
                              {output.content}
                            </div>
                          ))}
                          {execState.error && (
                            <div className="text-rose-400">{execState.error}</div>
                          )}
                        </div>
                      </div>
                    )}
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
                    tool.status === 'error' ? 'bg-rose-gold-500' :
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-dark-500 font-medium hover:opacity-90 transition-all shadow-glow-sm"
                    style={{ background: BRAND_GRADIENT_ACCENT }}
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
