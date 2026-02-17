/**
 * Alabobai File Store
 * Zustand store for managing file uploads and attachments
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import fileUploadService, {
  UploadedFileInfo,
  UploadProgress,
  FileMetadata,
} from '@/services/fileUpload'

// ============================================================================
// TYPES
// ============================================================================

export interface UploadingFile {
  id: string
  file: File
  progress: UploadProgress | null
  result: UploadedFileInfo | null
  error: string | null
}

export interface AttachedFile {
  id: string
  name: string
  mimeType: string
  size: number
  status: 'uploading' | 'complete' | 'error'
  progress?: number
  error?: string
  thumbnailUrl?: string
  analysisReady?: boolean
}

interface FileState {
  // Upload state
  uploadingFiles: Map<string, UploadingFile>
  isUploading: boolean

  // Attachments for current message
  attachments: AttachedFile[]

  // Uploaded files list
  uploadedFiles: FileMetadata[]
  isLoadingFiles: boolean

  // Selected file for preview
  selectedFileId: string | null
  isPreviewOpen: boolean

  // Actions
  uploadFiles: (files: File[], sessionId?: string) => Promise<UploadedFileInfo[]>
  cancelUpload: (fileId: string) => void
  clearUploads: () => void

  addAttachment: (file: AttachedFile) => void
  removeAttachment: (fileId: string) => void
  clearAttachments: () => void

  loadUploadedFiles: (sessionId?: string) => Promise<void>
  deleteFile: (fileId: string) => Promise<void>

  openPreview: (fileId: string) => void
  closePreview: () => void
}

// ============================================================================
// STORE
// ============================================================================

export const useFileStore = create<FileState>()(
  immer((set, get) => ({
    // Initial state
    uploadingFiles: new Map(),
    isUploading: false,
    attachments: [],
    uploadedFiles: [],
    isLoadingFiles: false,
    selectedFileId: null,
    isPreviewOpen: false,

    // --------------------------------------------------------------------------
    // UPLOAD ACTIONS
    // --------------------------------------------------------------------------

    uploadFiles: async (files: File[], sessionId?: string) => {
      set((state) => {
        state.isUploading = true
      })

      const results: UploadedFileInfo[] = []

      for (const file of files) {
        const tempId = crypto.randomUUID()

        // Add to uploading map
        set((state) => {
          state.uploadingFiles.set(tempId, {
            id: tempId,
            file,
            progress: null,
            result: null,
            error: null,
          })

          // Also add to attachments
          state.attachments.push({
            id: tempId,
            name: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'uploading',
            progress: 0,
          })
        })

        try {
          const result = await fileUploadService.uploadFile(file, {
            sessionId,
            onProgress: (progress) => {
              set((state) => {
                const uploading = state.uploadingFiles.get(tempId)
                if (uploading) {
                  uploading.progress = progress
                }

                // Update attachment
                const attachment = state.attachments.find((a) => a.id === tempId)
                if (attachment) {
                  attachment.progress = progress.percentage
                  attachment.status = progress.status === 'error' ? 'error' : 'uploading'
                }
              })
            },
          })

          // Update with result
          set((state) => {
            const uploading = state.uploadingFiles.get(tempId)
            if (uploading) {
              uploading.result = result
            }

            // Update attachment with real ID
            const attachmentIndex = state.attachments.findIndex((a) => a.id === tempId)
            if (attachmentIndex !== -1) {
              state.attachments[attachmentIndex] = {
                id: result.id,
                name: result.originalName,
                mimeType: result.mimeType,
                size: result.size,
                status: 'complete',
                analysisReady: result.analysisReady,
                thumbnailUrl: result.mimeType.startsWith('image/')
                  ? fileUploadService.getThumbnailUrl(result.id)
                  : undefined,
              }
            }
          })

          results.push(result)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Upload failed'

          set((state) => {
            const uploading = state.uploadingFiles.get(tempId)
            if (uploading) {
              uploading.error = errorMsg
            }

            // Update attachment
            const attachment = state.attachments.find((a) => a.id === tempId)
            if (attachment) {
              attachment.status = 'error'
              attachment.error = errorMsg
            }
          })
        }
      }

      set((state) => {
        state.isUploading = false
      })

      return results
    },

    cancelUpload: (fileId: string) => {
      set((state) => {
        state.uploadingFiles.delete(fileId)
        state.attachments = state.attachments.filter((a) => a.id !== fileId)
      })
    },

    clearUploads: () => {
      set((state) => {
        state.uploadingFiles.clear()
      })
    },

    // --------------------------------------------------------------------------
    // ATTACHMENT ACTIONS
    // --------------------------------------------------------------------------

    addAttachment: (file: AttachedFile) => {
      set((state) => {
        // Avoid duplicates
        if (!state.attachments.some((a) => a.id === file.id)) {
          state.attachments.push(file)
        }
      })
    },

    removeAttachment: (fileId: string) => {
      set((state) => {
        state.attachments = state.attachments.filter((a) => a.id !== fileId)
      })
    },

    clearAttachments: () => {
      set((state) => {
        state.attachments = []
      })
    },

    // --------------------------------------------------------------------------
    // FILE LIST ACTIONS
    // --------------------------------------------------------------------------

    loadUploadedFiles: async (sessionId?: string) => {
      set((state) => {
        state.isLoadingFiles = true
      })

      try {
        const result = await fileUploadService.listFiles({
          sessionId,
          limit: 50,
        })

        set((state) => {
          state.uploadedFiles = result.files
          state.isLoadingFiles = false
        })
      } catch (error) {
        console.error('[FileStore] Failed to load files:', error)
        set((state) => {
          state.isLoadingFiles = false
        })
      }
    },

    deleteFile: async (fileId: string) => {
      try {
        await fileUploadService.deleteFile(fileId)

        set((state) => {
          state.uploadedFiles = state.uploadedFiles.filter((f) => f.id !== fileId)
          state.attachments = state.attachments.filter((a) => a.id !== fileId)

          if (state.selectedFileId === fileId) {
            state.selectedFileId = null
            state.isPreviewOpen = false
          }
        })
      } catch (error) {
        console.error('[FileStore] Failed to delete file:', error)
        throw error
      }
    },

    // --------------------------------------------------------------------------
    // PREVIEW ACTIONS
    // --------------------------------------------------------------------------

    openPreview: (fileId: string) => {
      set((state) => {
        state.selectedFileId = fileId
        state.isPreviewOpen = true
      })
    },

    closePreview: () => {
      set((state) => {
        state.selectedFileId = null
        state.isPreviewOpen = false
      })
    },
  }))
)

// ============================================================================
// SELECTORS
// ============================================================================

export const selectAttachments = (state: FileState) => state.attachments
export const selectIsUploading = (state: FileState) => state.isUploading
export const selectUploadedFiles = (state: FileState) => state.uploadedFiles
export const selectSelectedFileId = (state: FileState) => state.selectedFileId
export const selectIsPreviewOpen = (state: FileState) => state.isPreviewOpen

export default useFileStore
