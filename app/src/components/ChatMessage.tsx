import { User, Bot, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import type { Message } from '@/stores/appStore'

interface ChatMessageProps {
  message: Message
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'} animate-fade-in`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <div className={`avatar flex-shrink-0 ${isUser ? '' : 'icon-glow'}`}>
          {isUser ? (
            <User className="w-4 h-4" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">
              {isUser ? 'You' : 'Alabobai'}
            </span>
            <span className="text-xs text-white/30">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Message Content */}
          <div className="text-sm text-white/80 whitespace-pre-wrap">
            {message.content}
            {message.status === 'streaming' && (
              <span className="inline-block w-2 h-4 bg-rose-gold-400 ml-1 animate-pulse" />
            )}
          </div>

          {/* Tool Calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.toolCalls.map(tool => (
                <div
                  key={tool.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-xs"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    tool.status === 'complete' ? 'bg-green-400' :
                    tool.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                    tool.status === 'error' ? 'bg-red-400' :
                    'bg-white/30'
                  }`} />
                  <span className="font-mono text-rose-gold-400">{tool.name}</span>
                  <span className="text-white/40">
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
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
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
          )}
        </div>
      </div>
    </div>
  )
}
