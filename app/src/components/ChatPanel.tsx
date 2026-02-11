import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Mic, StopCircle, PanelRight, Sparkles } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import ChatMessage from './ChatMessage'
import aiService from '@/services/ai'
import { KASA_LOGO_BASE64 } from '@/constants/kasaLogo'

// Function to inject logo into generated code
function injectLogoIntoCode(code: string): string {
  // Replace any /kasa-logo.png or similar references with the base64 data URI
  return code
    .replace(/src=["']\/kasa-logo\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
    .replace(/src=["']\.\/kasa-logo\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
    .replace(/src=["']kasa-logo\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
    .replace(/src=["']\/kasa-logo-small\.png["']/gi, `src="${KASA_LOGO_BASE64}"`)
}

// Extract code blocks from markdown content
function extractCodeFromResponse(content: string): string | null {
  // First, try to find code blocks with triple backticks
  const codeBlockRegex = /```(?:html|tsx|jsx|react)?\s*\n([\s\S]*?)```/g
  const matches: string[] = []
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    matches.push(match[1].trim())
  }

  // If no code blocks found, try to extract raw HTML from response
  if (matches.length === 0) {
    // Look for complete HTML document
    const htmlDocMatch = content.match(/<!DOCTYPE html[\s\S]*<\/html>/i)
    if (htmlDocMatch) {
      return injectLogoIntoCode(htmlDocMatch[0])
    }

    // Look for substantial HTML content (body content without full document)
    const htmlContentMatch = content.match(/<(?:div|section|nav|header|main|body)[^>]*>[\s\S]{500,}<\/(?:div|section|nav|header|main|body)>/i)
    if (htmlContentMatch) {
      matches.push(htmlContentMatch[0])
    }
  }

  if (matches.length === 0) return null

  // Find the largest code block (likely the main content)
  const code = matches.reduce((a, b) => a.length > b.length ? a : b)

  // If it's already a complete HTML document, inject logo and return
  if (code.includes('<!DOCTYPE') || code.includes('<html')) {
    return injectLogoIntoCode(code)
  }

  // If it contains substantial HTML elements, wrap in premium template
  if (code.includes('<') && code.includes('>') && code.length > 100) {
    return injectLogoIntoCode(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alabobai Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'sans-serif'] },
          colors: {
            primary: { 50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75' },
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', sans-serif; margin: 0; min-height: 100vh; }
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .glass { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); }
    .glow { box-shadow: 0 0 40px rgba(102, 126, 234, 0.3); }
    .text-gradient { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    .animate-float { animation: float 3s ease-in-out infinite; }
  </style>
</head>
<body class="antialiased">
  ${code}
</body>
</html>`)
  }

  // If it's React/JSX code, wrap with React runtime
  if (code.includes('export default') || code.includes('function ') && code.includes('return (')) {
    return injectLogoIntoCode(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alabobai Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'] } } }
    }
  </script>
  <style>
    body { font-family: 'Inter', sans-serif; margin: 0; min-height: 100vh; }
  </style>
</head>
<body class="antialiased">
  <div id="root"></div>
  <script type="text/babel">
    ${code.replace(/export default /g, 'window.App = ')}

    const App = window.App || (() => <div className="p-8 text-center">Preview Ready</div>);
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>`)
  }

  return null
}

export default function ChatPanel() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const {
    chats,
    activeChat,
    isStreaming,
    addMessage,
    setStreaming,
    createChat,
    toggleWorkspace,
    workspaceOpen,
    setGeneratedCode
  } = useAppStore()

  const currentChat = chats.find(c => c.id === activeChat)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentChat?.messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return

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
          const generatedCode = extractCodeFromResponse(lastMessage.content)
          if (generatedCode) {
            setGeneratedCode(generatedCode)
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

  return (
    <div className="h-full flex flex-col bg-dark-400">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center animate-pulse-glow">
            <Sparkles className="w-5 h-5 text-dark-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Alabobai</h2>
            <p className="text-xs text-white/40">
              {isStreaming ? 'Thinking...' : 'Ready to execute'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleWorkspace}
          className={`p-2 rounded-lg transition-colors ${
            workspaceOpen
              ? 'text-rose-gold-400 bg-rose-gold-400/10'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <PanelRight className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar px-6 py-4">
        {!currentChat || currentChat.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center mb-6 shadow-glow-lg">
              <Sparkles className="w-10 h-10 text-dark-500" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Welcome to Alabobai</h3>
            <p className="text-white/50 text-center max-w-md mb-8">
              Your AI agent platform. I can build apps, write code, browse the web,
              and execute complex workflows autonomously.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {[
                'Build me a landing page',
                'Create a React dashboard',
                'Help me with an API',
                'Research a topic',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(suggestion)
                    // Auto-submit after setting input
                    setTimeout(() => {
                      const form = document.querySelector('form')
                      if (form) {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
                      }
                    }, 100)
                  }}
                  className="morphic-card text-left text-sm text-white/70 hover:text-white p-4"
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
      <div className="p-4 border-t border-white/10">
        <form onSubmit={handleSubmit} className="relative">
          <div className="morphic-panel p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Alabobai anything..."
              rows={1}
              className="w-full bg-transparent text-white placeholder-white/40 resize-none outline-none text-sm"
              style={{ minHeight: '24px', maxHeight: '200px' }}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="morphic-btn py-2 px-4 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStreaming ? (
                  <>
                    <StopCircle className="w-4 h-4" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send</span>
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
