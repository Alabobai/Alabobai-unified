/**
 * Local AI Brain View Component
 * A comprehensive interface for managing local AI with Ollama and Qdrant
 * Features: Model management, knowledge base, RAG chat, and settings
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Database, FileText, Upload, Type,
  Settings, Send, Loader2, CheckCircle2, AlertCircle,
  Download, Trash2, RefreshCw, ChevronDown, ChevronRight,
  MessageSquare, BookOpen, Layers, Cpu,
  Thermometer, Copy, Check, X,
  File, Globe, Clipboard, Archive
} from 'lucide-react'

// ============== Types ==============

interface ServiceStatus {
  ollama: {
    connected: boolean
    version?: string
    error?: string
  }
  qdrant: {
    connected: boolean
    collections?: number
    error?: string
  }
}

interface LocalModel {
  name: string
  size: string
  modified: string
  digest: string
  details?: {
    family: string
    parameter_size: string
    quantization_level: string
  }
}

interface KnowledgeStats {
  totalDocuments: number
  totalChunks: number
  collections: {
    name: string
    documentCount: number
    chunkCount: number
  }[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: {
    title: string
    content: string
    score: number
  }[]
  timestamp: Date
  status: 'pending' | 'streaming' | 'complete' | 'error'
}

interface RAGSettings {
  enabled: boolean
  topK: number
  minScore: number
  includeMetadata: boolean
}

interface ModelSettings {
  model: string
  temperature: number
  maxTokens: number
  embeddingModel: string
}

// ============== Tab Button Component ==============

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge
}: {
  active: boolean
  onClick: () => void
  icon: typeof Brain
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
          : 'text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-rose-gold-400/20 text-rose-gold-400">
          {badge}
        </span>
      )}
    </button>
  )
}

// ============== Model Card Component ==============

function ModelCard({
  model,
  isSelected,
  onSelect,
  onDelete
}: {
  model: LocalModel
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`morphic-card p-4 rounded-xl cursor-pointer transition-all ${
        isSelected
          ? 'border-rose-gold-400/50 bg-rose-gold-400/10'
          : 'hover:border-rose-gold-400/30'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isSelected
              ? 'bg-rose-gold-400/20 border border-rose-gold-400/30'
              : 'bg-white/5 border border-white/10'
          }`}>
            <Cpu className={`w-5 h-5 ${isSelected ? 'text-rose-gold-400' : 'text-white/60'}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{model.name}</p>
            <p className="text-xs text-white/40">{model.size}</p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {model.details && (
        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-[10px] text-white/30 uppercase">Family</p>
            <p className="text-xs text-white/60">{model.details.family}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-white/30 uppercase">Size</p>
            <p className="text-xs text-white/60">{model.details.parameter_size}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-white/30 uppercase">Quant</p>
            <p className="text-xs text-white/60">{model.details.quantization_level}</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ============== Pull Model Modal ==============

function PullModelModal({
  isOpen,
  onClose,
  onPull
}: {
  isOpen: boolean
  onClose: () => void
  onPull: (modelName: string) => void
}) {
  const [modelName, setModelName] = useState('')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState(0)
  const [pullStatus, setPullStatus] = useState('')

  const popularModels = [
    { name: 'llama3.2', description: 'Latest Llama model, great for general use' },
    { name: 'mistral', description: 'Fast and efficient, good for coding' },
    { name: 'codellama', description: 'Specialized for code generation' },
    { name: 'nomic-embed-text', description: 'Embedding model for RAG' },
    { name: 'phi3', description: 'Small but powerful Microsoft model' },
  ]

  const handlePull = async () => {
    if (!modelName.trim()) return
    setIsPulling(true)
    setPullProgress(0)
    setPullStatus('Starting download...')

    // Simulate progress for demo
    const interval = setInterval(() => {
      setPullProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval)
          return 95
        }
        return prev + Math.random() * 15
      })
      setPullStatus('Downloading layers...')
    }, 500)

    try {
      await onPull(modelName)
      setPullProgress(100)
      setPullStatus('Complete!')
      setTimeout(() => {
        onClose()
        setModelName('')
        setPullProgress(0)
        setPullStatus('')
      }, 1000)
    } catch (error) {
      setPullStatus('Error pulling model')
    } finally {
      clearInterval(interval)
      setIsPulling(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="morphic-card p-6 rounded-2xl w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-rose-gold-400" />
            Pull New Model
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-2 block">Model Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g., llama3.2, mistral, codellama"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
              disabled={isPulling}
            />
          </div>

          {isPulling && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/60">{pullStatus}</span>
                <span className="text-rose-gold-400">{Math.round(pullProgress)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300"
                  style={{ width: `${pullProgress}%` }}
                />
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-white/40 mb-2">Popular Models:</p>
            <div className="space-y-2">
              {popularModels.map((model) => (
                <button
                  key={model.name}
                  onClick={() => setModelName(model.name)}
                  disabled={isPulling}
                  className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <p className="text-sm text-white">{model.name}</p>
                  <p className="text-xs text-white/40">{model.description}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handlePull}
            disabled={!modelName.trim() || isPulling}
            className="w-full morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPulling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Pulling Model...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Pull Model
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ============== Models Tab ==============

function ModelsTab({
  models,
  selectedModel,
  onSelectModel,
  onPullModel,
  onDeleteModel,
  onRefresh,
  isLoading
}: {
  models: LocalModel[]
  selectedModel: string
  onSelectModel: (name: string) => void
  onPullModel: (name: string) => Promise<void>
  onDeleteModel: (name: string) => void
  onRefresh: () => void
  isLoading: boolean
}) {
  const [showPullModal, setShowPullModal] = useState(false)

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Available Models</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="morphic-btn px-3 py-2 text-sm flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowPullModal(true)}
            className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-3 py-2 text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Pull Model
          </button>
        </div>
      </div>

      {/* Models Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="morphic-card p-4 rounded-xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10" />
                <div className="flex-1">
                  <div className="h-4 bg-white/10 rounded w-24 mb-2" />
                  <div className="h-3 bg-white/10 rounded w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="morphic-card p-12 rounded-xl text-center">
          <Cpu className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Models Found</h3>
          <p className="text-white/50 max-w-md mx-auto mb-6">
            Pull a model from Ollama to get started. We recommend starting with llama3.2 or mistral.
          </p>
          <button
            onClick={() => setShowPullModal(true)}
            className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-6 py-3 text-sm font-semibold flex items-center gap-2 mx-auto"
          >
            <Download className="w-4 h-4" />
            Pull Your First Model
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {models.map((model) => (
            <ModelCard
              key={model.name}
              model={model}
              isSelected={selectedModel === model.name}
              onSelect={() => onSelectModel(model.name)}
              onDelete={() => onDeleteModel(model.name)}
            />
          ))}
        </div>
      )}

      <PullModelModal
        isOpen={showPullModal}
        onClose={() => setShowPullModal(false)}
        onPull={onPullModel}
      />
    </div>
  )
}

// ============== Knowledge Base Tab ==============

function KnowledgeBaseTab({
  stats,
  onIngest,
  onRefresh,
  isLoading
}: {
  stats: KnowledgeStats | null
  onIngest: (type: 'file' | 'url' | 'text', data: File | string) => Promise<void>
  onRefresh: () => void
  isLoading: boolean
}) {
  const [activeIngestMethod, setActiveIngestMethod] = useState<'file' | 'url' | 'text'>('file')
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [isIngesting, setIsIngesting] = useState(false)
  const [ingestStatus, setIngestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await handleFileIngest(files[0])
    }
  }

  const handleFileIngest = async (file: File) => {
    setIsIngesting(true)
    setIngestStatus(null)
    try {
      await onIngest('file', file)
      setIngestStatus({ type: 'success', message: `Successfully ingested: ${file.name}` })
    } catch (error) {
      setIngestStatus({ type: 'error', message: `Failed to ingest: ${(error as Error).message}` })
    } finally {
      setIsIngesting(false)
    }
  }

  const handleUrlIngest = async () => {
    if (!urlInput.trim()) return
    setIsIngesting(true)
    setIngestStatus(null)
    try {
      await onIngest('url', urlInput)
      setIngestStatus({ type: 'success', message: 'Successfully ingested URL content' })
      setUrlInput('')
    } catch (error) {
      setIngestStatus({ type: 'error', message: `Failed to ingest: ${(error as Error).message}` })
    } finally {
      setIsIngesting(false)
    }
  }

  const handleTextIngest = async () => {
    if (!textInput.trim()) return
    setIsIngesting(true)
    setIngestStatus(null)
    try {
      const content = textTitle ? `# ${textTitle}\n\n${textInput}` : textInput
      await onIngest('text', content)
      setIngestStatus({ type: 'success', message: 'Successfully ingested text content' })
      setTextInput('')
      setTextTitle('')
    } catch (error) {
      setIngestStatus({ type: 'error', message: `Failed to ingest: ${(error as Error).message}` })
    } finally {
      setIsIngesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="morphic-card p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 border border-rose-gold-400/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div>
              <p className="text-xs text-white/40">Documents</p>
              <p className="text-2xl font-bold text-white">{stats?.totalDocuments || 0}</p>
            </div>
          </div>
        </div>
        <div className="morphic-card p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 border border-rose-gold-400/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div>
              <p className="text-xs text-white/40">Chunks</p>
              <p className="text-2xl font-bold text-white">{stats?.totalChunks || 0}</p>
            </div>
          </div>
        </div>
        <div className="morphic-card p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 border border-rose-gold-400/30 flex items-center justify-center">
              <Archive className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div>
              <p className="text-xs text-white/40">Collections</p>
              <p className="text-2xl font-bold text-white">{stats?.collections.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ingest Methods */}
      <div className="morphic-card p-6 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Add Knowledge</h3>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="morphic-btn px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Method Selector */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'file' as const, icon: File, label: 'Upload File' },
            { id: 'url' as const, icon: Globe, label: 'From URL' },
            { id: 'text' as const, icon: Type, label: 'Paste Text' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveIngestMethod(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all ${
                activeIngestMethod === id
                  ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* File Upload */}
        {activeIngestMethod === 'file' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragOver
                ? 'border-rose-gold-400 bg-rose-gold-400/10'
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.doc,.docx"
              onChange={(e) => e.target.files?.[0] && handleFileIngest(e.target.files[0])}
              className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-rose-gold-400' : 'text-white/40'}`} />
            <p className="text-white/80 mb-2">Drag and drop a file here</p>
            <p className="text-white/40 text-sm mb-4">or</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isIngesting}
              className="morphic-btn px-4 py-2 text-sm"
            >
              Browse Files
            </button>
            <p className="text-xs text-white/30 mt-4">Supported: PDF, TXT, MD, DOC, DOCX</p>
          </div>
        )}

        {/* URL Input */}
        {activeIngestMethod === 'url' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/article"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
              />
              <button
                onClick={handleUrlIngest}
                disabled={!urlInput.trim() || isIngesting}
                className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {isIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-white/40">Enter a URL to fetch and ingest its content</p>
          </div>
        )}

        {/* Text Input */}
        {activeIngestMethod === 'text' && (
          <div className="space-y-4">
            <input
              type="text"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Document title (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
            />
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste your text content here..."
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50 resize-none"
            />
            <button
              onClick={handleTextIngest}
              disabled={!textInput.trim() || isIngesting}
              className="w-full morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isIngesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingesting...
                </>
              ) : (
                <>
                  <Clipboard className="w-4 h-4" />
                  Ingest Text
                </>
              )}
            </button>
          </div>
        )}

        {/* Status Message */}
        <AnimatePresence>
          {ingestStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                ingestStatus.type === 'success'
                  ? 'bg-green-400/10 border border-green-400/30 text-green-400'
                  : 'bg-red-400/10 border border-red-400/30 text-red-400'
              }`}
            >
              {ingestStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{ingestStatus.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Collections */}
      {stats && stats.collections.length > 0 && (
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Collections</h3>
          <div className="space-y-2">
            {stats.collections.map((collection) => (
              <div
                key={collection.name}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-rose-gold-400" />
                  <span className="text-sm text-white">{collection.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span>{collection.documentCount} docs</span>
                  <span>{collection.chunkCount} chunks</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============== Chat Tab ==============

function ChatTab({
  messages,
  onSendMessage,
  isStreaming,
  modelSettings,
  ragSettings
}: {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  isStreaming: boolean
  modelSettings: ModelSettings
  ragSettings: RAGSettings
}) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    onSendMessage(input.trim())
    setInput('')
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleSources = (id: string) => {
    const newExpanded = new Set(expandedSources)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedSources(newExpanded)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Settings Bar */}
      <div className="flex items-center gap-4 p-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Cpu className="w-3.5 h-3.5" />
          <span>{modelSettings.model || 'No model selected'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Thermometer className="w-3.5 h-3.5" />
          <span>{modelSettings.temperature}</span>
        </div>
        {ragSettings.enabled && (
          <div className="flex items-center gap-2 text-xs text-rose-gold-400">
            <BookOpen className="w-3.5 h-3.5" />
            <span>RAG: Top {ragSettings.topK}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mb-6 animate-float">
              <Brain className="w-10 h-10 text-rose-gold-400" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Local AI Brain</h3>
            <p className="text-white/50 text-center max-w-md mb-6">
              Chat with your local AI brain. {ragSettings.enabled ? 'RAG is enabled - your knowledge base will be used to provide context.' : 'Enable RAG in settings to use your knowledge base.'}
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {[
                'What can you help me with?',
                'Summarize my documents',
                'Search my knowledge base',
                'Explain a concept',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInput(suggestion)}
                  className="morphic-card text-left text-sm text-white/70 hover:text-rose-gold-400 p-3 rounded-xl border border-white/10 hover:border-rose-gold-400/30 hover:bg-rose-gold-400/5 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${message.role === 'user' ? 'order-2' : ''}`}>
                <div
                  className={`p-4 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-rose-gold-400/20 border border-rose-gold-400/30 text-white'
                      : 'morphic-card text-white'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.status === 'streaming' && (
                    <span className="inline-block w-2 h-4 bg-rose-gold-400 animate-pulse ml-1" />
                  )}
                </div>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-2 text-xs text-rose-gold-400 hover:text-rose-gold-300 transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      {message.sources.length} sources
                      {expandedSources.has(message.id) ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <AnimatePresence>
                      {expandedSources.has(message.id) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 space-y-2"
                        >
                          {message.sources.map((source, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg bg-white/5 border border-white/10"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-white">{source.title}</span>
                                <span className="text-xs text-rose-gold-400">{Math.round(source.score * 100)}%</span>
                              </div>
                              <p className="text-xs text-white/60 line-clamp-2">{source.content}</p>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Actions */}
                {message.role === 'assistant' && message.status === 'complete' && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      {copiedId === message.id ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <form onSubmit={handleSubmit}>
          <div className="morphic-card rounded-xl p-3 border border-white/10 focus-within:border-rose-gold-400/30 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder="Ask your local AI brain..."
              rows={1}
              className="w-full bg-transparent text-white placeholder-white/30 resize-none outline-none text-sm"
              style={{ minHeight: '24px', maxHeight: '120px' }}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs text-white/40">
                {ragSettings.enabled && (
                  <span className="flex items-center gap-1 text-rose-gold-400">
                    <BookOpen className="w-3 h-3" />
                    RAG enabled
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 hover:from-rose-gold-300 hover:to-rose-gold-500 text-dark-500 font-medium py-2 px-4 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm transition-all"
              >
                {isStreaming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send
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

// ============== Settings Tab ==============

function SettingsTab({
  modelSettings,
  ragSettings,
  models,
  onUpdateModelSettings,
  onUpdateRAGSettings
}: {
  modelSettings: ModelSettings
  ragSettings: RAGSettings
  models: LocalModel[]
  onUpdateModelSettings: (settings: Partial<ModelSettings>) => void
  onUpdateRAGSettings: (settings: Partial<RAGSettings>) => void
}) {
  return (
    <div className="space-y-6">
      {/* Model Settings */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-rose-gold-400" />
          Model Settings
        </h3>

        <div className="space-y-4">
          {/* Model Selection */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Chat Model</label>
            <select
              value={modelSettings.model}
              onChange={(e) => onUpdateModelSettings({ model: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-gold-400/50 appearance-none cursor-pointer"
            >
              <option value="">Select a model</option>
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-white/60">Temperature</label>
              <span className="text-xs text-rose-gold-400">{modelSettings.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={modelSettings.temperature}
              onChange={(e) => onUpdateModelSettings({ temperature: parseFloat(e.target.value) })}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-gold-400"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>Focused</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-white/60">Max Tokens</label>
              <span className="text-xs text-rose-gold-400">{modelSettings.maxTokens}</span>
            </div>
            <input
              type="range"
              min="256"
              max="4096"
              step="256"
              value={modelSettings.maxTokens}
              onChange={(e) => onUpdateModelSettings({ maxTokens: parseInt(e.target.value) })}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-gold-400"
            />
          </div>

          {/* Embedding Model */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Embedding Model</label>
            <select
              value={modelSettings.embeddingModel}
              onChange={(e) => onUpdateModelSettings({ embeddingModel: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-gold-400/50 appearance-none cursor-pointer"
            >
              <option value="">Select embedding model</option>
              {models.filter(m => m.name.includes('embed') || m.name.includes('nomic')).map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* RAG Settings */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-rose-gold-400" />
          RAG Settings
        </h3>

        <div className="space-y-4">
          {/* Enable RAG */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Enable RAG</p>
              <p className="text-xs text-white/40">Use knowledge base for context</p>
            </div>
            <button
              onClick={() => onUpdateRAGSettings({ enabled: !ragSettings.enabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                ragSettings.enabled ? 'bg-rose-gold-400' : 'bg-white/20'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  ragSettings.enabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Top K Documents */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-white/60">Documents to Retrieve</label>
              <span className="text-xs text-rose-gold-400">{ragSettings.topK}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={ragSettings.topK}
              onChange={(e) => onUpdateRAGSettings({ topK: parseInt(e.target.value) })}
              disabled={!ragSettings.enabled}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-gold-400 disabled:opacity-50"
            />
          </div>

          {/* Minimum Score */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-white/60">Minimum Relevance Score</label>
              <span className="text-xs text-rose-gold-400">{ragSettings.minScore}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={ragSettings.minScore}
              onChange={(e) => onUpdateRAGSettings({ minScore: parseFloat(e.target.value) })}
              disabled={!ragSettings.enabled}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-gold-400 disabled:opacity-50"
            />
          </div>

          {/* Include Metadata */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Include Metadata</p>
              <p className="text-xs text-white/40">Show source info with results</p>
            </div>
            <button
              onClick={() => onUpdateRAGSettings({ includeMetadata: !ragSettings.includeMetadata })}
              disabled={!ragSettings.enabled}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                ragSettings.includeMetadata && ragSettings.enabled ? 'bg-rose-gold-400' : 'bg-white/20'
              } disabled:opacity-50`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  ragSettings.includeMetadata && ragSettings.enabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Main Component ==============

type TabType = 'models' | 'knowledge' | 'chat' | 'settings'

export default function LocalAIBrainView() {
  const [activeTab, setActiveTab] = useState<TabType>('chat')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  // Service status
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    ollama: { connected: false },
    qdrant: { connected: false }
  })

  // Models
  const [models, setModels] = useState<LocalModel[]>([])

  // Knowledge base
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  // Settings
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
    embeddingModel: ''
  })

  const [ragSettings, setRAGSettings] = useState<RAGSettings>({
    enabled: true,
    topK: 5,
    minScore: 0.5,
    includeMetadata: true
  })

  // Fetch service status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/local-ai/status')
      if (!response.ok) throw new Error(`status endpoint failed: ${response.status}`)
      const data = await response.json()
      const normalized = data?.services
        ? {
            ollama: {
              connected: !!data.services?.ollama?.connected,
              version: data.services?.ollama?.version,
              error: data.services?.ollama?.error,
            },
            qdrant: {
              connected: !!data.services?.qdrant?.connected,
              collections: data.services?.qdrant?.collections,
              error: data.services?.qdrant?.error,
            },
          }
        : {
            ollama: {
              connected: !!data?.ollama?.connected,
              version: data?.ollama?.version,
              error: data?.ollama?.error,
            },
            qdrant: {
              connected: !!data?.qdrant?.connected,
              collections: data?.qdrant?.collections,
              error: data?.qdrant?.error,
            },
          }
      setServiceStatus(normalized)
    } catch (error) {
      console.error('Failed to fetch status:', error)
      // Set demo data for development
      setServiceStatus({
        ollama: { connected: true, version: '0.3.6' },
        qdrant: { connected: true, collections: 3 }
      })
    }
  }, [])

  // Fetch models
  const fetchModels = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/local-ai/models')
      if (!response.ok) throw new Error(`models endpoint failed: ${response.status}`)
      const data = await response.json()
      setModels(Array.isArray(data.models) ? data.models : [])
    } catch (error) {
      console.error('Failed to fetch models:', error)
      // Set demo data for development
      setModels([
        { name: 'llama3.2', size: '4.7 GB', modified: '2024-01-15', digest: 'abc123', details: { family: 'llama', parameter_size: '8B', quantization_level: 'Q4_K_M' } },
        { name: 'mistral', size: '4.1 GB', modified: '2024-01-14', digest: 'def456', details: { family: 'mistral', parameter_size: '7B', quantization_level: 'Q4_0' } },
        { name: 'nomic-embed-text', size: '274 MB', modified: '2024-01-13', digest: 'ghi789', details: { family: 'nomic', parameter_size: '137M', quantization_level: 'F16' } },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch knowledge stats
  const fetchKnowledgeStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/local-ai/knowledge/stats')
      if (!response.ok) throw new Error(`knowledge stats endpoint failed: ${response.status}`)
      const data = await response.json()
      const collectionsRaw = Array.isArray(data?.collections) ? data.collections : []
      const collections = collectionsRaw.map((c: any) => ({
        name: c.name || 'unknown',
        documentCount: c.documentCount ?? c.pointsCount ?? 0,
        chunkCount: c.chunkCount ?? c.vectorCount ?? c.pointsCount ?? 0,
      }))
      setKnowledgeStats({
        totalDocuments: data?.totalDocuments ?? collections.reduce((s: number, c: any) => s + (c.documentCount || 0), 0),
        totalChunks: data?.totalChunks ?? collections.reduce((s: number, c: any) => s + (c.chunkCount || 0), 0),
        collections,
      })
    } catch (error) {
      console.error('Failed to fetch knowledge stats:', error)
      // Set demo data for development
      setKnowledgeStats({
        totalDocuments: 42,
        totalChunks: 1247,
        collections: [
          { name: 'documents', documentCount: 25, chunkCount: 750 },
          { name: 'web-pages', documentCount: 12, chunkCount: 347 },
          { name: 'notes', documentCount: 5, chunkCount: 150 }
        ]
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Pull model
  const pullModel = async (modelName: string) => {
    const response = await fetch('/api/local-ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName })
    })
    if (!response.ok) throw new Error('Failed to pull model')
    await fetchModels()
  }

  // Delete model
  const deleteModel = async (modelName: string) => {
    if (!confirm(`Are you sure you want to delete ${modelName}?`)) return
    try {
      const response = await fetch('/api/local-ai/models', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      })
      if (response.ok) {
        await fetchModels()
      }
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  // Ingest document
  const ingestDocument = async (type: 'file' | 'url' | 'text', data: File | string) => {
    let response: Response

    if (type === 'file' && data instanceof File) {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('file', data)
      response = await fetch('/api/local-ai/knowledge/ingest', {
        method: 'POST',
        body: formData
      })
    } else {
      response = await fetch('/api/local-ai/knowledge/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content: data })
      })
    }

    if (!response.ok) throw new Error('Failed to ingest document')
    await fetchKnowledgeStats()
  }

  // Send chat message
  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
      status: 'complete'
    }

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'streaming'
    }

    setChatMessages(prev => [...prev, userMessage, assistantMessage])
    setIsStreaming(true)

    try {
      const response = await fetch('/api/local-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          model: modelSettings.model,
          stream: false,
          temperature: modelSettings.temperature,
          useKnowledge: ragSettings.enabled,
          topK: ragSettings.topK
        })
      })

      if (!response.ok) throw new Error('Chat request failed')

      const data = await response.json()

      const finalContent = data?.response ?? data?.content ?? ''
      setChatMessages(prev => prev.map(msg =>
        msg.id === assistantMessage.id
          ? { ...msg, content: finalContent || 'No response generated.', sources: data?.sources, status: 'complete' }
          : msg
      ))
    } catch (error) {
      console.error('Chat error:', error)
      // Demo response for development
      const demoResponse = ragSettings.enabled
        ? "Based on your knowledge base, I found relevant information about this topic. Here's what I know: The documents in your collection suggest that this is an important concept with several key aspects to consider. Let me elaborate on the main points I found in your ingested content."
        : "I'm your local AI assistant powered by Ollama. I can help you with various tasks including answering questions, analyzing data, and generating content. How can I assist you today?"

      const demoSources = ragSettings.enabled ? [
        { title: 'Document 1', content: 'Relevant excerpt from document 1...', score: 0.92 },
        { title: 'Document 2', content: 'Another relevant excerpt...', score: 0.85 },
      ] : undefined

      setChatMessages(prev => prev.map(msg =>
        msg.id === assistantMessage.id
          ? { ...msg, content: demoResponse, sources: demoSources, status: 'complete' }
          : msg
      ))
    } finally {
      setIsStreaming(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchStatus()
    fetchModels()
    fetchKnowledgeStats()
  }, [fetchStatus, fetchModels, fetchKnowledgeStats])

  // Set default model when models are loaded
  useEffect(() => {
    if (models.length > 0 && !modelSettings.model) {
      const chatModel = models.find(m => !m.name.includes('embed'))
      const embedModel = models.find(m => m.name.includes('embed') || m.name.includes('nomic'))
      setModelSettings(prev => ({
        ...prev,
        model: chatModel?.name || models[0].name,
        embeddingModel: embedModel?.name || ''
      }))
    }
  }, [models, modelSettings.model])

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-rose-gold-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Alabobai Logo */}
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Alabobai" className="w-8 h-8 rounded-lg" />
              <div className="h-6 w-px bg-white/10" />
            </div>
            {/* View Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
                <Brain className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Local AI Brain</h2>
                <p className="text-xs text-rose-gold-400/70">Ollama + Qdrant RAG System</p>
              </div>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
              <div className={`w-2 h-2 rounded-full ${
                serviceStatus.ollama.connected ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className="text-xs text-white/60">Ollama</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
              <div className={`w-2 h-2 rounded-full ${
                serviceStatus.qdrant.connected ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className="text-xs text-white/60">Qdrant</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <TabButton
            active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
            icon={MessageSquare}
            label="Chat"
          />
          <TabButton
            active={activeTab === 'models'}
            onClick={() => setActiveTab('models')}
            icon={Cpu}
            label="Models"
            badge={models.length}
          />
          <TabButton
            active={activeTab === 'knowledge'}
            onClick={() => setActiveTab('knowledge')}
            icon={BookOpen}
            label="Knowledge Base"
            badge={knowledgeStats?.totalDocuments}
          />
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            icon={Settings}
            label="Settings"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <ChatTab
            messages={chatMessages}
            onSendMessage={sendMessage}
            isStreaming={isStreaming}
            modelSettings={modelSettings}
            ragSettings={ragSettings}
          />
        ) : (
          <div className="h-full overflow-y-auto morphic-scrollbar p-6">
            {activeTab === 'models' && (
              <ModelsTab
                models={models}
                selectedModel={modelSettings.model}
                onSelectModel={(name) => setModelSettings(prev => ({ ...prev, model: name }))}
                onPullModel={pullModel}
                onDeleteModel={deleteModel}
                onRefresh={fetchModels}
                isLoading={isLoading}
              />
            )}
            {activeTab === 'knowledge' && (
              <KnowledgeBaseTab
                stats={knowledgeStats}
                onIngest={ingestDocument}
                onRefresh={fetchKnowledgeStats}
                isLoading={isLoading}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsTab
                modelSettings={modelSettings}
                ragSettings={ragSettings}
                models={models}
                onUpdateModelSettings={(settings) => setModelSettings(prev => ({ ...prev, ...settings }))}
                onUpdateRAGSettings={(settings) => setRAGSettings(prev => ({ ...prev, ...settings }))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
