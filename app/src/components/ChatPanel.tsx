import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Paperclip, Mic, MicOff, StopCircle, PanelRight, Sparkles, Code2, Eye } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import ChatMessage from './ChatMessage'
import aiService from '@/services/ai'
import codeBuilder from '@/services/codeBuilder'
import { KASA_LOGO_BASE64 } from '@/constants/kasaLogo'
import { voiceService } from '@/services/voiceService'

// Function to inject logo into generated code
function injectLogoIntoCode(code: string): string {
  // Replace any /kasa-logo.png or similar references with the base64 data URI
  return code
    .replace(/src=["']\/kasa-logo\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
    .replace(/src=["']\.\/kasa-logo\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
    .replace(/src=["']kasa-logo\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
    .replace(/src=["']\/kasa-logo-small\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
}

// Extract code blocks from markdown content and convert to previewable HTML
function extractAndProcessCode(content: string): { code: string | null; hasCode: boolean } {
  const blocks = codeBuilder.extractCodeBlocks(content)

  if (blocks.length === 0) {
    // Try to find raw HTML in response
    const htmlDocMatch = content.match(/<!DOCTYPE html[\s\S]*<\/html>/i)
    if (htmlDocMatch) {
      return { code: injectLogoIntoCode(htmlDocMatch[0]), hasCode: true }
    }
    return { code: null, hasCode: false }
  }

  // Generate previewable HTML
  const previewHtml = codeBuilder.makePreviewable(blocks)
  if (previewHtml) {
    return { code: injectLogoIntoCode(previewHtml), hasCode: true }
  }

  // If we have code blocks but can't make them previewable, still mark as having code
  return { code: null, hasCode: blocks.length > 0 }
}

export default function ChatPanel() {
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cancelStreamRef = useRef(false)

  const {
    chats,
    activeChat,
    isStreaming,
    addMessage,
    setStreaming,
    createChat,
    toggleWorkspace,
    workspaceOpen,
    setGeneratedCode,
    setActiveTab
  } = useAppStore()

  const currentChat = chats.find(c => c.id === activeChat)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentChat?.messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return

    cancelStreamRef.current = false

    // Create chat if none exists
    if (!activeChat) {
      createChat()
    }

    const chatId = activeChat || useAppStore.getState().activeChat!

    // Add user message
    addMessage(chatId, {
      role: 'user',
      content: input.trim(),
      status: 'complete',
    })

    setInput('')
    setStreaming(true)

    // Add assistant message (will be streamed)
    addMessage(chatId, {
      role: 'assistant',
      content: '',
      status: 'streaming',
    })

    // Get chat history for context
    const chatMessages = useAppStore.getState().chats.find(c => c.id === chatId)?.messages || []
    const aiMessages = chatMessages
      .filter(m => m.status === 'complete')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    // Add the new user message
    aiMessages.push({ role: 'user', content: input.trim() })

    // Stream AI response
    let streamedContent = ''

    await aiService.chat(aiMessages, {
      onToken: (token) => {
        if (cancelStreamRef.current) return
        streamedContent += token
        const currentChat = useAppStore.getState().chats.find(c => c.id === chatId)
        const lastMessage = currentChat?.messages.slice(-1)[0]
        if (lastMessage) {
          useAppStore.getState().updateMessage(chatId, lastMessage.id, {
            content: streamedContent,
          })
        }
      },
      onComplete: () => {
        const currentChat = useAppStore.getState().chats.find(c => c.id === chatId)
        const lastMessage = currentChat?.messages.slice(-1)[0]
        if (lastMessage) {
          useAppStore.getState().updateMessage(chatId, lastMessage.id, {
            status: 'complete',
          })

          // Extract code from the response and set it for preview
          const { code, hasCode } = extractAndProcessCode(lastMessage.content)
          if (code) {
            setGeneratedCode(code)
            // Open workspace and switch to preview tab
            if (!workspaceOpen) {
              toggleWorkspace()
            }
            setActiveTab('preview')
          } else if (hasCode) {
            // Has code blocks but not previewable - show in code tab
            setActiveTab('code')
          }
        }
        setStreaming(false)
      },
      onError: (error) => {
        console.error('AI Error:', error)
        const currentChat = useAppStore.getState().chats.find(c => c.id === chatId)
        const lastMessage = currentChat?.messages.slice(-1)[0]
        if (lastMessage) {
          useAppStore.getState().updateMessage(chatId, lastMessage.id, {
            content: `Error: ${error.message}`,
            status: 'complete',
          })
        }
        setStreaming(false)
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    // Auto-submit after setting input
    setTimeout(() => {
      const form = document.querySelector('form')
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    }, 100)
  }

  // Voice input handlers
  const startVoiceInput = useCallback(() => {
    if (!voiceService.isSpeechRecognitionSupported()) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.')
      return
    }

    setInterimTranscript('')

    const success = voiceService.startListening(
      (transcript, isFinal) => {
        if (isFinal) {
          setInput(prev => prev + (prev ? ' ' : '') + transcript)
          setInterimTranscript('')
        } else {
          setInterimTranscript(transcript)
        }
      },
      (error) => {
        console.error('Voice input error:', error)
        setIsListening(false)
        setInterimTranscript('')
      }
    )

    if (success) {
      setIsListening(true)
    }
  }, [])

  const stopVoiceInput = useCallback(() => {
    voiceService.stopListening()
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopVoiceInput()
    } else {
      startVoiceInput()
    }
  }, [isListening, startVoiceInput, stopVoiceInput])

  return (
    <div className="h-full flex flex-col bg-dark-500">
      {/* Header */}
      <div className="morphic-glass flex items-center justify-between px-6 py-4 border-b border-rose-gold-400/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-sm animate-pulse-glow">
            <Sparkles className="w-5 h-5 text-dark-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white tracking-wide">Code Builder</h2>
            <p className="text-xs text-rose-gold-400/60">
              {isStreaming ? 'Generating...' : 'Ready to build'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!workspaceOpen) toggleWorkspace()
              setActiveTab('code')
            }}
            className="p-2 rounded-xl text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
            title="View Code"
          >
            <Code2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              if (!workspaceOpen) toggleWorkspace()
              setActiveTab('preview')
            }}
            className="p-2 rounded-xl text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
            title="View Preview"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={toggleWorkspace}
            className={`p-2 rounded-xl transition-colors ${
              workspaceOpen
                ? 'text-rose-gold-400 bg-rose-gold-400/15 border border-rose-gold-400/30'
                : 'text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10'
            }`}
          >
            <PanelRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar px-6 py-4 bg-dark-500">
        {!currentChat || currentChat.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center mb-6 shadow-glow-lg animate-pulse-glow">
              <Code2 className="w-10 h-10 text-dark-500" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2 tracking-wide">Code Builder</h3>
            <p className="text-rose-gold-400/50 text-center max-w-md mb-8">
              Describe what you want to build and watch it come to life.
              I'll generate complete, working code with live preview.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {[
                'Build me a landing page for a SaaS product',
                'Create a React dashboard with charts',
                'Make a contact form with validation',
                'Design a pricing page with 3 tiers',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="morphic-glass text-left text-sm text-white/70 hover:text-rose-gold-400 p-4 rounded-xl border border-rose-gold-400/10 hover:border-rose-gold-400/30 hover:bg-rose-gold-400/5 transition-all duration-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {currentChat.messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-rose-gold-400/10 bg-dark-500">
        <form onSubmit={handleSubmit} className="relative">
          <div className="morphic-glass rounded-xl p-3 border border-rose-gold-400/10 focus-within:border-rose-gold-400/30 transition-colors">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Listening... Speak now' : 'Describe what you want to build...'}
                rows={1}
                className="w-full bg-transparent text-white placeholder-rose-gold-400/40 resize-none outline-none text-sm focus:placeholder-rose-gold-400/60"
                style={{ minHeight: '24px', maxHeight: '200px' }}
              />
              {interimTranscript && (
                <span className="text-rose-gold-400/50 italic text-sm">{interimTranscript}</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-rose-gold-400/10">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-2 rounded-xl text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`p-2 rounded-xl transition-colors ${
                    isListening
                      ? 'text-rose-gold-400 bg-rose-gold-400/20 animate-pulse shadow-glow-sm'
                      : 'text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10'
                  }`}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                disabled={!input.trim() && !isStreaming}
                onClick={(e) => {
                  if (isStreaming) {
                    e.preventDefault()
                    cancelStreamRef.current = true
                    setStreaming(false)
                    return
                  }
                  handleSubmit(e as unknown as React.FormEvent)
                }}
                className="bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 hover:from-rose-gold-300 hover:to-rose-gold-500 text-dark-500 font-medium py-2 px-4 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm transition-all duration-200"
              >
                {isStreaming ? (
                  <>
                    <StopCircle className="w-4 h-4" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
