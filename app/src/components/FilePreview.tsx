/**
 * Alabobai File Preview Component
 * Preview uploaded files with type-specific rendering
 */

import { useState, useEffect, useMemo } from 'react'
import {
  FileText,
  Image,
  FileSpreadsheet,
  Code2,
  Download,
  Trash2,
  Sparkles,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Copy,
  Check,
  ExternalLink,
  Table,
} from 'lucide-react'
import { BRAND_GRADIENT_ACCENT, BRAND_TOKENS } from '@/config/brandTokens'
import fileUploadService, { FileMetadata, FileContent } from '@/services/fileUpload'

// ============================================================================
// TYPES
// ============================================================================

interface FilePreviewProps {
  fileId: string
  fileName?: string
  mimeType?: string
  onClose?: () => void
  onDelete?: () => void
  onAnalyze?: () => void
  showActions?: boolean
  className?: string
}

interface ImagePreviewProps {
  fileId: string
  alt: string
}

interface TextPreviewProps {
  content: string
  language?: string
}

interface SpreadsheetPreviewProps {
  content: FileContent
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

function getLanguageFromMimeType(mimeType: string): string {
  const mapping: Record<string, string> = {
    'text/javascript': 'javascript',
    'application/javascript': 'javascript',
    'text/typescript': 'typescript',
    'text/html': 'html',
    'text/css': 'css',
    'application/json': 'json',
    'text/x-python': 'python',
    'text/plain': 'text',
    'text/markdown': 'markdown',
    'text/csv': 'csv',
  }
  return mapping[mimeType] || 'text'
}

function getFileTypeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return <Image className="w-5 h-5" />
  }
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') {
    return <FileSpreadsheet className="w-5 h-5" />
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType === 'text/html' ||
    mimeType === 'text/css' ||
    mimeType === 'application/json'
  ) {
    return <Code2 className="w-5 h-5" />
  }
  return <FileText className="w-5 h-5" />
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ImagePreview({ fileId, alt }: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const thumbnailUrl = fileUploadService.getThumbnailUrl(fileId)

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-dark-400/50 rounded-xl overflow-hidden">
      {/* Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          className="p-2 rounded-lg morphic-glass border border-rose-gold-400/20 text-rose-gold-400/60 hover:text-rose-gold-400"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-rose-gold-400/60 min-w-[3rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          className="p-2 rounded-lg morphic-glass border border-rose-gold-400/20 text-rose-gold-400/60 hover:text-rose-gold-400"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center">
          <Image className="w-12 h-12 text-rose-gold-400/30 mx-auto mb-2" />
          <p className="text-rose-gold-400/50 text-sm">Failed to load image</p>
        </div>
      )}

      {/* Image */}
      <img
        src={thumbnailUrl}
        alt={alt}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false)
          setError(true)
        }}
        className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
          loading || error ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ transform: `scale(${zoom})` }}
      />
    </div>
  )
}

function TextPreview({ content, language = 'text' }: TextPreviewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Limit preview length
  const displayContent = useMemo(() => {
    if (content.length > 50000) {
      return content.slice(0, 50000) + '\n\n... (truncated)'
    }
    return content
  }, [content])

  return (
    <div className="relative h-full">
      {/* Copy Button */}
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg morphic-glass border border-rose-gold-400/20 text-xs text-rose-gold-400/60 hover:text-rose-gold-400"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-rose-gold-400" />
            Copied
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            Copy
          </>
        )}
      </button>

      {/* Content */}
      <div className="h-full overflow-auto morphic-scrollbar rounded-xl bg-dark-400/50 p-4">
        <pre className="text-sm text-white/80 font-mono whitespace-pre-wrap break-words">
          <code className={`language-${language}`}>{displayContent}</code>
        </pre>
      </div>
    </div>
  )
}

function SpreadsheetPreview({ content }: SpreadsheetPreviewProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const rowsPerPage = 20

  // Parse CSV/spreadsheet content
  const rows = useMemo(() => {
    const lines = content.content.split('\n').filter((l) => l.trim())
    return lines.map((line) => {
      // Simple CSV parsing
      const cells: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      cells.push(current.trim())
      return cells
    })
  }, [content.content])

  const headers = rows[0] || []
  const dataRows = rows.slice(1)
  const totalPages = Math.ceil(dataRows.length / rowsPerPage)
  const paginatedRows = dataRows.slice(
    currentPage * rowsPerPage,
    (currentPage + 1) * rowsPerPage
  )

  return (
    <div className="h-full flex flex-col">
      {/* Table */}
      <div className="flex-1 overflow-auto morphic-scrollbar rounded-xl bg-dark-400/50">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-dark-300 border-b border-rose-gold-400/20">
            <tr>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left text-rose-gold-400 font-medium whitespace-nowrap"
                >
                  {header || `Column ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-rose-gold-400/5 hover:bg-rose-gold-400/5"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-3 py-2 text-white/70 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-rose-gold-400/10 mt-3">
          <span className="text-xs text-rose-gold-400/50">
            Showing {currentPage * rowsPerPage + 1}-
            {Math.min((currentPage + 1) * rowsPerPage, dataRows.length)} of{' '}
            {dataRows.length} rows
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-rose-gold-400/60">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FilePreview({
  fileId,
  fileName,
  mimeType = 'application/octet-stream',
  onClose,
  onDelete,
  onAnalyze,
  showActions = true,
  className = '',
}: FilePreviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<FileMetadata | null>(null)
  const [content, setContent] = useState<FileContent | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  useEffect(() => {
    async function loadFile() {
      setLoading(true)
      setError(null)

      try {
        const fileMetadata = await fileUploadService.getFileMetadata(fileId)
        setMetadata(fileMetadata)

        // Load content for text-based files
        if (
          fileMetadata.hasContent &&
          !fileMetadata.mimeType.startsWith('image/')
        ) {
          const fileContent = await fileUploadService.getFileContent(fileId)
          setContent(fileContent)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file')
      } finally {
        setLoading(false)
      }
    }

    loadFile()
  }, [fileId])

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleDownload = async () => {
    if (metadata) {
      await fileUploadService.downloadFile(fileId, metadata.originalName)
    }
  }

  const handleAnalyze = async () => {
    if (!onAnalyze && metadata?.analysisReady) {
      setIsAnalyzing(true)
      try {
        const result = await fileUploadService.analyzeFile(fileId)
        setAnalysis(result.analysis)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed')
      } finally {
        setIsAnalyzing(false)
      }
    } else {
      onAnalyze?.()
    }
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  const displayMimeType = metadata?.mimeType || mimeType
  const displayName = metadata?.originalName || fileName || 'Unknown file'

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-rose-gold-400/10">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(217, 160, 122, 0.15)' }}
          >
            {getFileTypeIcon(displayMimeType)}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-medium truncate">{displayName}</h3>
            <p className="text-xs text-rose-gold-400/50">
              {displayMimeType}
              {metadata && ` • ${formatFileSize(metadata.size)}`}
            </p>
          </div>
        </div>

        {showActions && (
          <div className="flex items-center gap-2">
            {metadata?.analysisReady && (
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-dark-500 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                style={{ background: BRAND_GRADIENT_ACCENT }}
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Analyze
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-rose-gold-400/60 hover:text-red-400 hover:bg-red-400/10"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <FileText className="w-12 h-12 text-rose-gold-400/30 mb-3" />
            <p className="text-rose-gold-400/70 text-sm">{error}</p>
          </div>
        ) : displayMimeType.startsWith('image/') ? (
          <ImagePreview fileId={fileId} alt={displayName} />
        ) : (displayMimeType.includes('spreadsheet') || displayMimeType === 'text/csv') && content ? (
          <SpreadsheetPreview content={content} />
        ) : content ? (
          <TextPreview
            content={content.content}
            language={getLanguageFromMimeType(displayMimeType)}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            {getFileTypeIcon(displayMimeType)}
            <p className="text-rose-gold-400/50 text-sm mt-3">
              Preview not available for this file type
            </p>
            <button
              onClick={handleDownload}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg morphic-glass border border-rose-gold-400/20 text-rose-gold-400 text-sm hover:border-rose-gold-400/40"
            >
              <Download className="w-4 h-4" />
              Download to view
            </button>
          </div>
        )}
      </div>

      {/* Analysis Result */}
      {analysis && (
        <div className="border-t border-rose-gold-400/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-rose-gold-400" />
            <h4 className="text-sm font-medium text-white">AI Analysis</h4>
          </div>
          <div className="max-h-40 overflow-y-auto morphic-scrollbar">
            <p className="text-sm text-white/70 whitespace-pre-wrap">{analysis}</p>
          </div>
        </div>
      )}
    </div>
  )
}
