import { useState, useRef, useEffect, useCallback, DragEvent, ChangeEvent } from 'react'
import { Send, Paperclip, Mic, MicOff, StopCircle, PanelRight, Sparkles, Code2, Eye, ChevronUp, Zap, Loader2, CheckCircle2, AlertCircle, X, FileText, Image } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
// presence features removed for focused single-user UX
import ChatMessage from './ChatMessage'
import aiService from '@/services/ai'
import codeBuilder from '@/services/codeBuilder'
import { BRAND_LOGO_BASE64 } from '@/constants/brandLogo'
import { voiceService } from '@/services/voiceService'
import { toast } from '@/stores/toastStore'
import { ThinkingIndicator, ProgressBar } from './ui/LoadingSpinner'
import { SkeletonChatMessage } from './ui/Skeleton'
import { useFileStore, AttachedFile } from '@/stores/fileStore'
import { FileAttachmentList } from './FileAttachment'
import fileUploadService from '@/services/fileUpload'
// presence indicators removed for luxury-focused single-user UX
import { useMobile, useViewportHeight } from '@/hooks/useMobile'
import { BRAND_GRADIENT_ACCENT } from '@/config/brandTokens'

// Function to inject logo into generated code
function injectLogoIntoCode(code: string): string {
  // Replace legacy and current logo asset refs with the inlined brand payload.
  return code
    .replace(/src=["']\/kasa-logo\.png["']/gi, `src="${BRAND_LOGO_BASE64}"`)
    .replace(/src=["']\.\/kasa-logo\.png["']/gi, `src="${BRAND_LOGO_BASE64}"`)
    .replace(/src=["']kasa-logo\.png["']/gi, `src="${BRAND_LOGO_BASE64}"`)
    .replace(/src=["']\/kasa-logo-small\.png["']/gi, `src="${BRAND_LOGO_BASE64}"`)
    .replace(/src=["']\/logo\.png["']/gi, `src="${BRAND_LOGO_BASE64}"`)
    .replace(/src=["']\/logo-mark(?:-tight)?\.png["']/gi, `src="${BRAND_LOGO_BASE64}"`)
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

function shouldUseCapabilityEngine(task: string): boolean {
  const value = task.toLowerCase()
  return [
    'create company plan',
    'business plan',
    'research topic',
    'research',
    'generate image',
    'create image',
    'generate video',
    'create video',
  ].some((keyword) => value.includes(keyword))
}

interface ExecuteTaskResponse {
  status?: string
  intent?: { label?: string; confidence?: number }
  matchedCapabilities?: Array<{ capability?: { id?: string; name?: string } }>
  plan?: unknown[]
  execution?: {
    dryRun?: boolean
    steps?: Array<{ id?: string; name?: string; capabilityId?: string; status?: string; result?: unknown; error?: string }>
  }
  diagnostics?: {
    degraded?: boolean
    notes?: string[]
    failures?: string[]
  }
  fallback?: {
    reason?: 'no-match' | 'blocked'
    message?: string
    nextAction?: string
  }
}

async function runCapabilityTask(task: string, dryRun = false): Promise<ExecuteTaskResponse> {
  const response = await fetch('/api/execute-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, dryRun }),
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  return response.json()
}

function formatCapabilityTaskResult(payload: ExecuteTaskResponse): string {
  const capabilityIds = (payload.matchedCapabilities || [])
    .slice(0, 3)
    .map((match) => match.capability?.id)
    .filter(Boolean)
    .join(', ')

  return [
    `Capability Engine Result (${payload.status || 'unknown'})`,
    `Intent: ${payload.intent?.label || 'unknown'} (${payload.intent?.confidence || 0})`,
    `Matched: ${capabilityIds || 'none'}`,
    `Plan steps: ${(payload.plan || []).length}`,
    `Execution steps: ${(payload.execution?.steps || []).length}`,
    payload.diagnostics?.degraded ? `Diagnostics: ${(payload.diagnostics?.failures || []).join('; ') || 'degraded'}` : '',
    payload.fallback?.message ? `Fallback: ${payload.fallback.message}` : '',
    payload.fallback?.nextAction ? `Next: ${payload.fallback.nextAction}` : '',
    '',
    'Raw execution snapshot:',
    '```json',
    JSON.stringify(payload.execution?.steps?.[0] || payload, null, 2),
    '```',
  ]
    .filter(Boolean)
    .join('\n')
}

function isCapabilityResultUsable(payload: ExecuteTaskResponse): boolean {
  const status = payload.status || ''
  const executionSteps = payload.execution?.steps || []
  const hasFailedSteps = executionSteps.some((step) => step.status === 'failed' || step.status === 'error')

  if (status === 'failed' || status === 'degraded' || status === 'no-match' || status === 'blocked') {
    return false
  }

  if (hasFailedSteps && executionSteps.length <= 1) {
    return false
  }

  return true
}

export default function ChatPanel() {
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [showExecuteTaskPanel, setShowExecuteTaskPanel] = useState(false)
  const [executeTaskInput, setExecuteTaskInput] = useState('')
  const [executeTaskDryRun, setExecuteTaskDryRun] = useState(false)
  const [executeTaskStatus, setExecuteTaskStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [executeTaskResult, setExecuteTaskResult] = useState<ExecuteTaskResponse | null>(null)
  const [executeTaskError, setExecuteTaskError] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composerFormRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelStreamRef = useRef(false)
  const dragCounterRef = useRef(0)
  const userHasScrolledRef = useRef(false)
  const lastMessageCountRef = useRef(0)

  // File store
  const {
    attachments,
    isUploading: isUploadingFiles,
    uploadFiles,
    removeAttachment,
    clearAttachments,
  } = useFileStore()

  const { isMobile, isMobileOrTablet, isKeyboardOpen } = useMobile()
  const viewportHeight = useViewportHeight()

  const {
    chats,
    activeChat,
    isStreaming,
    addMessage,
    setStreaming,
    createChat,
    toggleWorkspace,
    openWorkspace,
    workspaceOpen,
    setGeneratedCode,
    setActiveTab
  } = useAppStore()

  // Single-user focused mode (no collaborator presence widgets)

  const currentChat = chats.find(c => c.id === activeChat)

  // Smart auto-scroll: only scroll to bottom if user hasn't scrolled up
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      // Check if user is near the bottom (within 100px)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      userHasScrolledRef.current = !isNearBottom
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Scroll to bottom only when new messages arrive and user is at bottom
  useEffect(() => {
    const messageCount = currentChat?.messages.length || 0
    const isNewMessage = messageCount > lastMessageCountRef.current
    lastMessageCountRef.current = messageCount

    // Always scroll on new user message or if user is already at bottom
    if (isNewMessage && !userHasScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Reset scroll tracking when a new message is added (not during streaming updates)
    if (isNewMessage && messageCount > 0) {
      const lastMsg = currentChat?.messages[messageCount - 1]
      if (lastMsg?.role === 'user') {
        userHasScrolledRef.current = false
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [currentChat?.messages.length])

  // Hide suggestions when there are messages
  useEffect(() => {
    if (currentChat?.messages.length) {
      setShowSuggestions(false)
    } else {
      setShowSuggestions(true)
    }
  }, [currentChat?.messages.length])

  // File drag and drop handlers
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (fileUploadService.isDragEventWithFiles(e.nativeEvent)) {
      setIsDraggingFile(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFile(false)
    dragCounterRef.current = 0

    const files = fileUploadService.getFilesFromDragEvent(e.nativeEvent)
    if (files.length > 0) {
      handleFilesSelected(files)
    }
  }, [])

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      handleFilesSelected(files)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    // Validate and upload files
    const validFiles: File[] = []
    for (const file of files) {
      const validation = fileUploadService.validateFile(file)
      if (validation.valid) {
        validFiles.push(file)
      } else {
        toast.warning('Invalid File', validation.error || 'File type not supported')
      }
    }

    if (validFiles.length > 0) {
      try {
        await uploadFiles(validFiles, activeChat || undefined)
      } catch (error) {
        toast.error('Upload Failed', error instanceof Error ? error.message : 'Failed to upload files')
      }
    }
  }, [uploadFiles, activeChat])

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const taskInput = input.trim()
    const hasAttachments = attachments.filter(a => a.status === 'complete').length > 0

    // Allow submit if there's text or completed attachments
    if ((!taskInput && !hasAttachments) || isStreaming) return

    cancelStreamRef.current = false

    // Create chat if none exists
    if (!activeChat) {
      createChat()
    }

    // Build attachment context for the message
    const completedAttachments = attachments.filter(a => a.status === 'complete')
    const attachmentContext = completedAttachments.length > 0
      ? `\n\n[Attached files: ${completedAttachments.map(a => a.name).join(', ')}]`
      : ''

    const chatId = activeChat || useAppStore.getState().activeChat!

    // Build message content with attachment info
    const messageContent = taskInput + attachmentContext

    // Add user message
    addMessage(chatId, {
      role: 'user',
      content: messageContent,
      status: 'complete',
    })

    setInput('')
    clearAttachments()
    setStreaming(true)

    // streaming state handles user feedback

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
    aiMessages.push({ role: 'user', content: taskInput })

    if (shouldUseCapabilityEngine(taskInput)) {
      try {
        const resultPayload = await runCapabilityTask(taskInput)

        if (isCapabilityResultUsable(resultPayload)) {
          const result = formatCapabilityTaskResult(resultPayload)
          const currentChat = useAppStore.getState().chats.find(c => c.id === chatId)
          const lastMessage = currentChat?.messages.slice(-1)[0]
          if (lastMessage) {
            useAppStore.getState().updateMessage(chatId, lastMessage.id, {
              content: result,
              status: 'complete',
            })
          }
          setStreaming(false)
          return
        }

        const reason = resultPayload.fallback?.message || `Task engine returned status: ${resultPayload.status || 'unknown'}.`
        toast.info('Fallback to AI Chat', `${reason} Using AI assistant mode.`)
      } catch {
        toast.warning('Task Engine Unavailable', 'Falling back to AI assistant mode.')
      }
    }

    // Stream AI response
    let streamedContent = ''

    await aiService.chat(aiMessages, {
      onToken: (token) => {
        if (cancelStreamRef.current) return
        streamedContent += token
        // stream content progressively
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
              openWorkspace()
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
            content: 'I encountered an error while processing your request. Please try again.',
            status: 'error',
          })
        }
        setStreaming(false)

        // Show user-friendly error toast
        const errorMessage = error.message.toLowerCase()
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          toast.error(
            'Connection Error',
            'Unable to reach the AI service. Please check your internet connection.'
          )
        } else if (errorMessage.includes('timeout')) {
          toast.error(
            'Request Timeout',
            'The AI service took too long to respond. Please try again.'
          )
        } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          toast.warning(
            'Rate Limited',
            'Too many requests. Please wait a moment before trying again.'
          )
        } else {
          toast.error(
            'AI Error',
            'Something went wrong. Please try again or refresh the page.'
          )
        }
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
      const form = composerFormRef.current
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    }, 100)
  }

  // Voice input handlers
  const startVoiceInput = useCallback(() => {
    if (!voiceService.isSpeechRecognitionSupported()) {
      toast.warning(
        'Browser Not Supported',
        'Speech recognition is not available. Please use Chrome, Edge, or Safari.'
      )
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
      (errorMessage) => {
        console.error('Voice input error:', errorMessage)
        setIsListening(false)
        setInterimTranscript('')

        // Show user-friendly error message
        if (errorMessage.includes('microphone') || errorMessage.includes('Microphone')) {
          toast.error(
            'Microphone Access Required',
            'Please allow microphone access to use voice input.'
          )
        } else if (errorMessage.includes('No speech')) {
          toast.info(
            'No Speech Detected',
            'Please speak clearly and try again.'
          )
        } else if (errorMessage.includes('network') || errorMessage.includes('Network')) {
          toast.error(
            'Network Error',
            'Voice recognition requires an internet connection.'
          )
        } else {
          toast.error(
            'Voice Input Error',
            errorMessage || 'Unable to process voice input. Please try again.'
          )
        }
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

  const handleExecuteTask = async () => {
    const task = executeTaskInput.trim() || input.trim()
    if (!task || executeTaskStatus === 'running') return

    setExecuteTaskStatus('running')
    setExecuteTaskError(null)

    try {
      const payload = await runCapabilityTask(task, executeTaskDryRun)
      setExecuteTaskResult(payload)
      setExecuteTaskStatus('success')
    } catch (error) {
      setExecuteTaskStatus('error')
      setExecuteTaskError(error instanceof Error ? error.message : 'Failed to execute task')
    }
  }

  // Mobile-specific styles
  const containerStyle = isMobileOrTablet
    ? { height: isKeyboardOpen ? `${viewportHeight}px` : '100%' }
    : {}

  return (
    <div
      className={`h-full flex flex-col bg-gradient-to-br from-dark-500/95 via-dark-400/90 to-dark-500/95 relative ${
        isKeyboardOpen ? 'keyboard-open' : ''
      } ${isDraggingFile ? 'ring-2 ring-rose-gold-400 ring-inset' : ''}`}
      style={containerStyle}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.js,.ts,.jsx,.tsx,.html,.css,.json,.py"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Drag overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-dark-500/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-rose-gold-400 bg-rose-gold-400/10">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: BRAND_GRADIENT_ACCENT }}>
              <Paperclip className="w-8 h-8 text-dark-500" />
            </div>
            <p className="text-white font-medium">Drop files here to attach</p>
            <p className="text-rose-gold-400/50 text-sm">PDF, Images, Spreadsheets, Code files</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className={`glass-morphic-header flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 ${
        isMobileOrTablet ? 'pl-16' : '' // Leave space for hamburger menu
      }`}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-glow-sm animate-pulse-glow"
            style={{ background: BRAND_GRADIENT_ACCENT }}
          >
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-dark-500" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white tracking-wide">Code Builder</h2>
            <p className="text-[10px] sm:text-xs text-rose-gold-400/60">
              {isStreaming ? 'Generating...' : 'Ready to build'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {/* intentionally no collaborator/viewer badges in chat header */}
          <button
            type="button"
            onClick={() => {
              setShowExecuteTaskPanel((prev) => !prev)
              if (!showExecuteTaskPanel) {
                setExecuteTaskInput((prev) => prev || input)
              }
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors framer-btn ${
              showExecuteTaskPanel
                ? 'text-rose-gold-400 border-rose-gold-400/40 bg-rose-gold-400/10'
                : 'text-white/60 border-white/10 hover:text-rose-gold-400 hover:border-rose-gold-400/30'
            }`}
            title="Open Execute Task command mode"
          >
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Execute Task</span>
              <span className="sm:hidden">Task</span>
            </span>
          </button>
          <button
            onClick={() => {
              if (!workspaceOpen) openWorkspace()
              setActiveTab('code')
            }}
            className="p-2 sm:p-2.5 rounded-xl text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors framer-btn touch-target"
            title="View Code"
          >
            <Code2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={() => {
              if (!workspaceOpen) openWorkspace()
              setActiveTab('preview')
            }}
            className="p-2 sm:p-2.5 rounded-xl text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors framer-btn touch-target"
            title="View Preview"
          >
            <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          {/* Hide workspace toggle on mobile - use FAB instead */}
          <button
            onClick={toggleWorkspace}
            className={`p-2 sm:p-2.5 rounded-xl transition-colors touch-target hidden sm:flex ${
              workspaceOpen
                ? 'text-rose-gold-400 bg-rose-gold-400/15 border border-rose-gold-400/30'
                : 'text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10'
            }`}
          >
            <PanelRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>


      {showExecuteTaskPanel && (
        <div className="mx-3 sm:mx-6 mt-3 p-3 sm:p-4 rounded-2xl border border-rose-gold-400/20 bg-dark-300/70 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Execute Task</h3>
              <p className="text-xs text-white/50">Run /api/execute-task directly with visible status and results.</p>
            </div>
            {executeTaskStatus === 'running' ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-rose-gold-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Running</span>
            ) : executeTaskStatus === 'success' ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-rose-gold-400"><CheckCircle2 className="w-3.5 h-3.5" />Complete</span>
            ) : executeTaskStatus === 'error' ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-rose-gold-400"><AlertCircle className="w-3.5 h-3.5" />Failed</span>
            ) : null}
          </div>

          <div className="space-y-3">
            <textarea
              value={executeTaskInput}
              onChange={(e) => setExecuteTaskInput(e.target.value)}
              placeholder="Describe the task to execute..."
              rows={2}
              className="w-full bg-dark-400/70 border border-white/10 focus:border-rose-gold-400/40 rounded-xl px-3 py-2 text-sm text-white placeholder-rose-gold-400/40 outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={executeTaskDryRun}
                  onChange={(e) => setExecuteTaskDryRun(e.target.checked)}
                  className="rounded border-white/20 bg-dark-400"
                />
                Dry run
              </label>
              <button
                type="button"
                onClick={handleExecuteTask}
                disabled={executeTaskStatus === 'running' || !(executeTaskInput.trim() || input.trim())}
                className="px-3 py-2 rounded-xl text-dark-500 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ background: BRAND_GRADIENT_ACCENT }}
              >
                {executeTaskStatus === 'running' ? 'Executing…' : 'Run Execute Task'}
              </button>
            </div>

            {executeTaskError && (
              <div className="text-xs text-rose-gold-400 bg-rose-gold-500/10 border border-rose-gold-400/20 rounded-lg px-3 py-2">{executeTaskError}</div>
            )}

            {executeTaskResult && (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-white/10 bg-dark-400/50 px-2 py-1.5 text-white/70">Status: <span className="text-white">{executeTaskResult.status || 'unknown'}</span></div>
                  <div className="rounded-lg border border-white/10 bg-dark-400/50 px-2 py-1.5 text-white/70">Intent: <span className="text-white">{executeTaskResult.intent?.label || 'unknown'}</span></div>
                  <div className="rounded-lg border border-white/10 bg-dark-400/50 px-2 py-1.5 text-white/70">Plan: <span className="text-white">{executeTaskResult.plan?.length || 0}</span></div>
                  <div className="rounded-lg border border-white/10 bg-dark-400/50 px-2 py-1.5 text-white/70">Steps: <span className="text-white">{executeTaskResult.execution?.steps?.length || 0}</span></div>
                </div>
                {executeTaskResult.execution?.steps?.length ? (
                  <div className="rounded-lg border border-white/10 bg-dark-400/50 p-2 space-y-1.5 max-h-44 overflow-y-auto morphic-scrollbar">
                    {executeTaskResult.execution.steps.map((step, idx) => (
                      <div key={step.id || idx} className="text-white/70">{idx + 1}. {step.name || step.capabilityId || 'step'} {step.status ? `(${step.status})` : ''}</div>
                    ))}
                  </div>
                ) : null}
                {executeTaskResult.diagnostics?.degraded && (
                  <div className="rounded-lg border border-rose-gold-400/20 bg-rose-gold-500/10 px-2 py-1.5 text-rose-gold-400">
                    Diagnostics: {(executeTaskResult.diagnostics.failures || []).join('; ') || 'degraded mode'}
                  </div>
                )}
                {executeTaskResult.fallback?.message && (
                  <div className="rounded-lg border border-amber-300/30 bg-amber-200/10 px-2 py-1.5 text-amber-200">
                    {executeTaskResult.fallback.message}
                    {executeTaskResult.fallback.nextAction ? ` ${executeTaskResult.fallback.nextAction}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto morphic-scrollbar px-3 sm:px-6 py-4">
        {!currentChat || currentChat.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-4">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 shadow-glow-lg animate-pulse-glow"
              style={{ background: BRAND_GRADIENT_ACCENT }}
            >
              <Code2 className="w-8 h-8 sm:w-10 sm:h-10 text-dark-500" />
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2 tracking-wide text-center">Code Builder</h3>
            <p className="text-white/50 text-center text-sm sm:text-base max-w-md mb-6 sm:mb-8 px-4">
              Describe what you want to build and watch it come to life.
              I'll generate complete, working code with live preview.
            </p>
            {showSuggestions && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 w-full max-w-lg px-2">
                {[
                  'Build me a landing page for a SaaS product',
                  'Create a React dashboard with charts',
                  'Make a contact form with validation',
                  'Design a pricing page with 3 tiers',
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="morphic-glass framer-card text-left text-xs sm:text-sm text-white/70 hover:text-rose-gold-400 p-3 sm:p-4 rounded-xl border border-rose-gold-400/20 hover:border-rose-gold-400/40 hover:bg-rose-gold-400/10 transition-all duration-200 touch-target group"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-gold-400/40 group-hover:bg-rose-gold-400 transition-colors" />
                      {suggestion}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {currentChat.messages.map((message, index) => (
              <div
                key={message.id}
                className="chat-message-enter"
                style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
              >
                <ChatMessage message={message} />
              </div>
            ))}
            {/* Show skeleton loader while streaming starts (empty content) */}
            {isStreaming && currentChat.messages.length > 0 &&
             currentChat.messages[currentChat.messages.length - 1].content === '' && (
              <div className="animate-fade-in-up">
                <div className="flex gap-3 mr-0 sm:mr-12">
                  <div className="w-8 h-8 rounded-lg bg-white/10 border border-rose-gold-400/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-rose-gold-400 animate-pulse" />
                  </div>
                  <div className="flex-1 morphic-card p-3 sm:p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <ThinkingIndicator size="sm" />
                      <span className="text-xs text-white/50">Generating response...</span>
                    </div>
                    <ProgressBar size="sm" className="mb-2" />
                    <div className="space-y-2 mt-3">
                      <SkeletonChatMessage />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* typing/collaborator indicators intentionally removed for cleaner brand UX */}

      {/* Input - Sticky on mobile with proper keyboard handling */}
      <div className={`p-3 sm:p-4 border-t border-rose-gold-400/10 backdrop-blur-sm ${
        isMobileOrTablet ? 'chat-input-container' : ''
      }`}>
        <form ref={composerFormRef} onSubmit={handleSubmit} className="relative">
          <div className="morphic-glass framer-input rounded-xl p-2 sm:p-3 border border-rose-gold-400/10 focus-within:border-rose-gold-400/30 transition-colors">
            {/* Attachments Preview */}
            {attachments.length > 0 && (
              <div className="mb-2 pb-2 border-b border-rose-gold-400/10">
                <FileAttachmentList
                  files={attachments}
                  onRemove={removeAttachment}
                  removable={true}
                  interactive={false}
                  size="sm"
                />
              </div>
            )}

            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Listening... Speak now' : attachments.length > 0 ? 'Add a message about your files...' : 'Describe what you want to build...'}
                rows={1}
                className="w-full bg-transparent text-white placeholder-rose-gold-400/40 resize-none outline-none text-sm sm:text-base focus:placeholder-rose-gold-400/60 py-1"
                style={{ minHeight: '28px', maxHeight: isMobile ? '120px' : '200px' }}
              />
              {interimTranscript && (
                <span className="text-rose-gold-400/50 italic text-xs sm:text-sm">{interimTranscript}</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-rose-gold-400/10">
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={triggerFileInput}
                  disabled={isUploadingFiles}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all framer-btn touch-target ${
                    isUploadingFiles
                      ? 'text-rose-gold-400 bg-rose-gold-400/10'
                      : 'text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 border border-transparent hover:border-rose-gold-400/20'
                  }`}
                  title="Attach file"
                >
                  {isUploadingFiles ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : (
                    <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all framer-btn touch-target ${
                    isListening
                      ? 'text-dark-500 shadow-glow-sm'
                      : 'text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 border border-transparent hover:border-rose-gold-400/20'
                  }`}
                  style={isListening ? { background: BRAND_GRADIENT_ACCENT } : undefined}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
              <button
                type="button"
                disabled={(!input.trim() && attachments.filter(a => a.status === 'complete').length === 0) && !isStreaming}
                onClick={(e) => {
                  if (isStreaming) {
                    e.preventDefault()
                    cancelStreamRef.current = true
                    aiService.cancelRequest() // Properly abort the AI request
                    setStreaming(false)
                    toast.info('Generation stopped')
                    return
                  }
                  handleSubmit(e as unknown as React.FormEvent)
                }}
                className="text-dark-500 font-medium py-2 px-3 sm:px-4 rounded-xl text-sm flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm transition-all duration-200 framer-btn touch-target hover:opacity-90"
                style={{ background: BRAND_GRADIENT_ACCENT }}
              >
                {isStreaming ? (
                  <>
                    <StopCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Stop</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Mobile FAB for workspace (only on mobile when workspace is closed) */}
      {isMobile && !workspaceOpen && currentChat && currentChat.messages.length > 0 && (
        <button
          onClick={() => {
            openWorkspace()
            setActiveTab('preview')
          }}
          className="fab"
          aria-label="Open workspace"
        >
          <ChevronUp className="w-6 h-6 text-dark-500" />
        </button>
      )}
    </div>
  )
}
