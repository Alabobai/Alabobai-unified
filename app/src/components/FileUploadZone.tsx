/**
 * Alabobai File Upload Zone Component
 * Drag-and-drop file upload with progress tracking
 */

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import {
  Upload,
  X,
  FileText,
  Image,
  FileSpreadsheet,
  Code2,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { BRAND_GRADIENT_ACCENT, BRAND_TOKENS } from '@/config/brandTokens'
import fileUploadService, {
  UploadProgress,
  UploadedFileInfo,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
} from '@/services/fileUpload'

// ============================================================================
// TYPES
// ============================================================================

interface FileUploadZoneProps {
  onFilesUploaded?: (files: UploadedFileInfo[]) => void
  onError?: (error: string) => void
  multiple?: boolean
  maxFiles?: number
  sessionId?: string
  compact?: boolean
  className?: string
}

interface FileQueueItem {
  id: string
  file: File
  progress: UploadProgress | null
  result: UploadedFileInfo | null
  error: string | null
}

// ============================================================================
// HELPERS
// ============================================================================

function getFileIcon(file: File) {
  const category = fileUploadService.getFileCategory(file)
  switch (category) {
    case 'document':
      return <FileText className="w-5 h-5" />
    case 'image':
      return <Image className="w-5 h-5" />
    case 'spreadsheet':
      return <FileSpreadsheet className="w-5 h-5" />
    case 'code':
      return <Code2 className="w-5 h-5" />
    default:
      return <FileText className="w-5 h-5" />
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FileUploadZone({
  onFilesUploaded,
  onError,
  multiple = true,
  maxFiles = 10,
  sessionId,
  compact = false,
  className = '',
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  // --------------------------------------------------------------------------
  // DRAG & DROP HANDLERS
  // --------------------------------------------------------------------------

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++

    if (fileUploadService.isDragEventWithFiles(e.nativeEvent)) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--

    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      dragCounterRef.current = 0

      const files = fileUploadService.getFilesFromDragEvent(e.nativeEvent)
      if (files.length > 0) {
        handleFilesSelected(files)
      }
    },
    [multiple, maxFiles]
  )

  // --------------------------------------------------------------------------
  // FILE SELECTION
  // --------------------------------------------------------------------------

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        handleFilesSelected(files)
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [multiple, maxFiles]
  )

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      // Limit number of files
      let selectedFiles = multiple ? files : [files[0]]
      if (selectedFiles.length > maxFiles) {
        selectedFiles = selectedFiles.slice(0, maxFiles)
        onError?.(`Maximum ${maxFiles} files allowed`)
      }

      // Validate files
      const validFiles: File[] = []
      for (const file of selectedFiles) {
        const validation = fileUploadService.validateFile(file)
        if (validation.valid) {
          validFiles.push(file)
        } else {
          onError?.(validation.error || 'Invalid file')
        }
      }

      if (validFiles.length === 0) return

      // Add to queue
      const newItems: FileQueueItem[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: null,
        result: null,
        error: null,
      }))

      setFileQueue((prev) => [...prev, ...newItems])

      // Start upload
      uploadFiles(newItems)
    },
    [multiple, maxFiles, onError]
  )

  // --------------------------------------------------------------------------
  // UPLOAD
  // --------------------------------------------------------------------------

  const uploadFiles = useCallback(
    async (items: FileQueueItem[]) => {
      setIsUploading(true)

      const results: UploadedFileInfo[] = []

      for (const item of items) {
        try {
          const result = await fileUploadService.uploadFile(item.file, {
            sessionId,
            onProgress: (progress) => {
              setFileQueue((prev) =>
                prev.map((f) => (f.id === item.id ? { ...f, progress } : f))
              )
            },
          })

          setFileQueue((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, result } : f))
          )

          results.push(result)
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Upload failed'
          setFileQueue((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, error: errorMsg } : f))
          )
          onError?.(errorMsg)
        }
      }

      setIsUploading(false)

      if (results.length > 0) {
        onFilesUploaded?.(results)
      }
    },
    [sessionId, onFilesUploaded, onError]
  )

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const removeFromQueue = useCallback((itemId: string) => {
    setFileQueue((prev) => prev.filter((f) => f.id !== itemId))
  }, [])

  const clearCompleted = useCallback(() => {
    setFileQueue((prev) => prev.filter((f) => !f.result && !f.error))
  }, [])

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  const acceptedExtensions = [
    ...ALLOWED_FILE_TYPES.documents,
    ...ALLOWED_FILE_TYPES.images,
    ...ALLOWED_FILE_TYPES.spreadsheets,
    ...ALLOWED_FILE_TYPES.code,
  ].join(',')

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Drop Zone */}
      <div
        onClick={triggerFileInput}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200
          ${
            compact
              ? 'p-4'
              : 'p-8'
          }
          ${
            isDragging
              ? 'border-rose-gold-400 bg-rose-gold-400/10'
              : 'border-rose-gold-400/30 hover:border-rose-gold-400/50 bg-dark-300/30 hover:bg-dark-300/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={acceptedExtensions}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center text-center">
          <div
            className={`
              rounded-xl flex items-center justify-center mb-3
              ${compact ? 'w-10 h-10' : 'w-14 h-14'}
              ${isDragging ? 'animate-bounce' : ''}
            `}
            style={{ background: isDragging ? BRAND_GRADIENT_ACCENT : 'rgba(217, 160, 122, 0.15)' }}
          >
            <Upload
              className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} ${
                isDragging ? 'text-dark-500' : 'text-rose-gold-400'
              }`}
            />
          </div>

          <p className={`text-white font-medium ${compact ? 'text-sm' : 'text-base'}`}>
            {isDragging ? 'Drop files here' : 'Drag & drop files or click to browse'}
          </p>

          {!compact && (
            <p className="text-rose-gold-400/50 text-xs mt-2">
              PDF, Images, Spreadsheets, Code files up to {MAX_FILE_SIZE / 1024 / 1024}MB
            </p>
          )}
        </div>
      </div>

      {/* File Queue */}
      {fileQueue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-gold-400/60">
              {fileQueue.filter((f) => f.result).length} / {fileQueue.length} uploaded
            </span>
            {fileQueue.some((f) => f.result || f.error) && (
              <button
                onClick={clearCompleted}
                className="text-xs text-rose-gold-400/60 hover:text-rose-gold-400"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto morphic-scrollbar">
            {fileQueue.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl morphic-glass border border-rose-gold-400/10"
              >
                {/* File Icon */}
                <div
                  className={`
                    w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                    ${
                      item.error
                        ? 'bg-red-500/20 text-red-400'
                        : item.result
                        ? 'text-dark-500'
                        : 'bg-rose-gold-400/10 text-rose-gold-400'
                    }
                  `}
                  style={item.result ? { background: BRAND_GRADIENT_ACCENT } : undefined}
                >
                  {item.error ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : item.result ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : item.progress?.status === 'uploading' ||
                    item.progress?.status === 'processing' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    getFileIcon(item.file)
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.file.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-gold-400/50">
                      {formatFileSize(item.file.size)}
                    </span>
                    {item.progress && item.progress.status === 'uploading' && (
                      <span className="text-xs text-rose-gold-400">
                        {item.progress.percentage}%
                      </span>
                    )}
                    {item.progress?.status === 'processing' && (
                      <span className="text-xs text-rose-gold-400">Processing...</span>
                    )}
                    {item.error && (
                      <span className="text-xs text-red-400 truncate">{item.error}</span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {item.progress &&
                    (item.progress.status === 'uploading' ||
                      item.progress.status === 'processing') && (
                      <div className="mt-1.5 h-1 bg-dark-400 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${item.progress.percentage}%`,
                            background: BRAND_GRADIENT_ACCENT,
                          }}
                        />
                      </div>
                    )}
                </div>

                {/* Remove Button */}
                {(item.result || item.error) && (
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    className="p-1.5 rounded-lg text-rose-gold-400/50 hover:text-rose-gold-400 hover:bg-rose-gold-400/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
