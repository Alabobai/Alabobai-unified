/**
 * Alabobai File Preview Modal
 * Modal wrapper for FilePreview component
 */

import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import FilePreview from './FilePreview'
import { useFileStore } from '@/stores/fileStore'
import { BRAND_GRADIENT_ACCENT } from '@/config/brandTokens'

export default function FilePreviewModal() {
  const { selectedFileId, isPreviewOpen, closePreview, deleteFile } = useFileStore()

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPreviewOpen) {
        closePreview()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPreviewOpen, closePreview])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isPreviewOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isPreviewOpen])

  const handleDelete = useCallback(async () => {
    if (selectedFileId) {
      try {
        await deleteFile(selectedFileId)
        closePreview()
      } catch (error) {
        console.error('Failed to delete file:', error)
      }
    }
  }, [selectedFileId, deleteFile, closePreview])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closePreview()
      }
    },
    [closePreview]
  )

  if (!isPreviewOpen || !selectedFileId) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-500/90 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full max-w-4xl h-[90vh] max-h-[800px] mx-4 rounded-2xl overflow-hidden morphic-glass border border-rose-gold-400/20 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <FilePreview
          fileId={selectedFileId}
          onClose={closePreview}
          onDelete={handleDelete}
          showActions={true}
        />
      </div>
    </div>
  )
}
