/**
 * Alabobai File Attachment Component
 * Compact file attachment display for chat messages
 */

import { useState, useCallback } from 'react'
import {
  FileText,
  Image,
  FileSpreadsheet,
  Code2,
  Download,
  X,
  Eye,
  Sparkles,
  Loader2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { BRAND_GRADIENT_ACCENT, BRAND_TOKENS } from '@/config/brandTokens'
import fileUploadService, { FileMetadata } from '@/services/fileUpload'

// ============================================================================
// TYPES
// ============================================================================

export interface AttachedFile {
  id: string
  name: string
  mimeType: string
  size: number
  status?: 'uploading' | 'complete' | 'error'
  progress?: number
  error?: string
  thumbnailUrl?: string
  analysisReady?: boolean
}

interface FileAttachmentProps {
  file: AttachedFile
  onRemove?: () => void
  onPreview?: () => void
  onAnalyze?: () => void
  removable?: boolean
  interactive?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

interface FileAttachmentListProps {
  files: AttachedFile[]
  onRemove?: (fileId: string) => void
  onPreview?: (fileId: string) => void
  onAnalyze?: (fileId: string) => void
  removable?: boolean
  interactive?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// ============================================================================
// HELPERS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getFileIcon(mimeType: string, size: number = 16) {
  const iconClass = `w-${Math.round(size / 4)} h-${Math.round(size / 4)}`

  if (mimeType.startsWith('image/')) {
    return <Image className={iconClass} />
  }
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') {
    return <FileSpreadsheet className={iconClass} />
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType === 'text/html' ||
    mimeType === 'text/css' ||
    mimeType === 'application/json'
  ) {
    return <Code2 className={iconClass} />
  }
  return <FileText className={iconClass} />
}

function getFileTypeLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF',
    'text/plain': 'TXT',
    'text/markdown': 'MD',
    'text/csv': 'CSV',
    'image/png': 'PNG',
    'image/jpeg': 'JPG',
    'image/gif': 'GIF',
    'image/webp': 'WEBP',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'text/javascript': 'JS',
    'application/javascript': 'JS',
    'text/typescript': 'TS',
    'text/html': 'HTML',
    'text/css': 'CSS',
    'application/json': 'JSON',
  }
  return labels[mimeType] || mimeType.split('/')[1]?.toUpperCase() || 'FILE'
}

// ============================================================================
// SINGLE ATTACHMENT COMPONENT
// ============================================================================

export function FileAttachment({
  file,
  onRemove,
  onPreview,
  onAnalyze,
  removable = false,
  interactive = true,
  size = 'md',
  className = '',
}: FileAttachmentProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const isImage = file.mimeType.startsWith('image/')
  const isUploading = file.status === 'uploading'
  const hasError = file.status === 'error'

  // Size-based styling
  const sizeClasses = {
    sm: {
      container: 'p-2',
      icon: 'w-6 h-6',
      iconSize: 12,
      text: 'text-xs',
      thumbnail: 'w-8 h-8',
    },
    md: {
      container: 'p-2.5',
      icon: 'w-8 h-8',
      iconSize: 16,
      text: 'text-sm',
      thumbnail: 'w-12 h-12',
    },
    lg: {
      container: 'p-3',
      icon: 'w-10 h-10',
      iconSize: 20,
      text: 'text-base',
      thumbnail: 'w-16 h-16',
    },
  }

  const styles = sizeClasses[size]

  const handleClick = useCallback(() => {
    if (interactive && !isUploading && !hasError) {
      onPreview?.()
    }
  }, [interactive, isUploading, hasError, onPreview])

  return (
    <div
      className={`
        group relative flex items-center gap-2.5 rounded-xl
        morphic-glass border border-rose-gold-400/15
        ${interactive && !isUploading && !hasError ? 'cursor-pointer hover:border-rose-gold-400/30' : ''}
        ${hasError ? 'border-red-500/30 bg-red-500/5' : ''}
        ${styles.container}
        ${className}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Thumbnail / Icon */}
      <div
        className={`
          relative flex-shrink-0 rounded-lg overflow-hidden
          flex items-center justify-center
          ${styles.thumbnail}
          ${hasError ? 'bg-red-500/10' : isImage && file.thumbnailUrl ? '' : 'bg-rose-gold-400/10'}
        `}
      >
        {isUploading ? (
          <Loader2
            className={`${styles.iconSize === 12 ? 'w-3 h-3' : styles.iconSize === 16 ? 'w-4 h-4' : 'w-5 h-5'} text-rose-gold-400 animate-spin`}
          />
        ) : hasError ? (
          <AlertCircle
            className={`${styles.iconSize === 12 ? 'w-3 h-3' : styles.iconSize === 16 ? 'w-4 h-4' : 'w-5 h-5'} text-red-400`}
          />
        ) : isImage && file.thumbnailUrl ? (
          <>
            <img
              src={file.thumbnailUrl}
              alt={file.name}
              onLoad={() => setImageLoaded(true)}
              className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 bg-rose-gold-400/10 animate-pulse" />
            )}
          </>
        ) : (
          <div className="text-rose-gold-400">
            {getFileIcon(file.mimeType, styles.iconSize)}
          </div>
        )}

        {/* Upload Progress Overlay */}
        {isUploading && file.progress !== undefined && (
          <div className="absolute inset-0 bg-dark-400/80 flex items-center justify-center">
            <span className="text-[10px] text-rose-gold-400 font-medium">
              {file.progress}%
            </span>
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-white truncate ${styles.text}`}>{file.name}</p>
        <p className="text-rose-gold-400/50 text-xs">
          {hasError ? (
            <span className="text-red-400">{file.error || 'Upload failed'}</span>
          ) : isUploading ? (
            'Uploading...'
          ) : (
            <>
              {getFileTypeLabel(file.mimeType)} • {formatFileSize(file.size)}
            </>
          )}
        </p>
      </div>

      {/* Actions */}
      {interactive && isHovered && !isUploading && !hasError && (
        <div className="flex items-center gap-1">
          {file.analysisReady && onAnalyze && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAnalyze()
              }}
              className="p-1.5 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10"
              title="Analyze with AI"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          {onPreview && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPreview()
              }}
              className="p-1.5 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10"
              title="Preview"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Remove Button */}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="p-1.5 rounded-lg text-rose-gold-400/40 hover:text-red-400 hover:bg-red-400/10"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// ATTACHMENT LIST COMPONENT
// ============================================================================

export function FileAttachmentList({
  files,
  onRemove,
  onPreview,
  onAnalyze,
  removable = false,
  interactive = true,
  size = 'md',
  className = '',
}: FileAttachmentListProps) {
  if (files.length === 0) return null

  // Display as grid for images, list for others
  const hasImages = files.some((f) => f.mimeType.startsWith('image/'))
  const allImages = files.every((f) => f.mimeType.startsWith('image/'))

  if (allImages && files.length > 1) {
    // Image grid layout
    return (
      <div className={`grid gap-2 ${className}`} style={{
        gridTemplateColumns: `repeat(${Math.min(files.length, 3)}, minmax(0, 1fr))`,
      }}>
        {files.map((file) => (
          <FileAttachment
            key={file.id}
            file={file}
            onRemove={onRemove ? () => onRemove(file.id) : undefined}
            onPreview={onPreview ? () => onPreview(file.id) : undefined}
            onAnalyze={onAnalyze ? () => onAnalyze(file.id) : undefined}
            removable={removable}
            interactive={interactive}
            size={size}
          />
        ))}
      </div>
    )
  }

  // Standard list layout
  return (
    <div className={`space-y-2 ${className}`}>
      {files.map((file) => (
        <FileAttachment
          key={file.id}
          file={file}
          onRemove={onRemove ? () => onRemove(file.id) : undefined}
          onPreview={onPreview ? () => onPreview(file.id) : undefined}
          onAnalyze={onAnalyze ? () => onAnalyze(file.id) : undefined}
          removable={removable}
          interactive={interactive}
          size={size}
        />
      ))}
    </div>
  )
}

// ============================================================================
// COMPACT INLINE ATTACHMENT
// ============================================================================

interface InlineAttachmentProps {
  file: AttachedFile
  onClick?: () => void
  className?: string
}

export function InlineAttachment({ file, onClick, className = '' }: InlineAttachmentProps) {
  const isImage = file.mimeType.startsWith('image/')

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-lg
        morphic-glass border border-rose-gold-400/15 hover:border-rose-gold-400/30
        text-xs text-rose-gold-400/80 hover:text-rose-gold-400
        transition-colors
        ${className}
      `}
    >
      {isImage && file.thumbnailUrl ? (
        <img
          src={file.thumbnailUrl}
          alt={file.name}
          className="w-4 h-4 rounded object-cover"
        />
      ) : (
        getFileIcon(file.mimeType, 12)
      )}
      <span className="truncate max-w-[100px]">{file.name}</span>
    </button>
  )
}

export default FileAttachment
