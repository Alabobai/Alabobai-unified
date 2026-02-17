/**
 * FileTree Component
 * Interactive file tree with drag-and-drop, create/rename/delete functionality
 */

import { useState, useRef, useCallback, DragEvent } from 'react'
import {
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Edit2,
  FilePlus,
  FolderPlus,
  MoreVertical,
  X,
  Check,
  Download,
  Copy,
  FileCode,
  FileText,
  FileJson,
  Image,
  Code2,
} from 'lucide-react'
import { ProjectFile } from '@/stores/projectStore'
import { projectService } from '@/services/projectService'
import { toast } from '@/stores/toastStore'

// ============================================================================
// Types
// ============================================================================

interface FileTreeProps {
  files: ProjectFile[]
  activeFilePath: string | null
  onFileSelect: (file: ProjectFile) => void
  onFileCreate: (parentPath: string, name: string, type: 'file' | 'folder') => void
  onFileRename: (fileId: string, newName: string) => void
  onFileDelete: (fileId: string) => void
  onFileMove: (fileId: string, newParentPath: string) => void
  onFileCopy?: (file: ProjectFile) => void
}

interface FileNodeProps {
  file: ProjectFile
  depth: number
  isActive: boolean
  expandedFolders: Set<string>
  dragOverPath: string | null
  onToggleExpand: (fileId: string) => void
  onSelect: (file: ProjectFile) => void
  onCreate: (parentPath: string, type: 'file' | 'folder') => void
  onRename: (fileId: string, newName: string) => void
  onDelete: (fileId: string) => void
  onDragStart: (e: DragEvent, file: ProjectFile) => void
  onDragOver: (e: DragEvent, path: string) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent, targetPath: string) => void
  onDownload: (file: ProjectFile) => void
  onCopy: (file: ProjectFile) => void
}

// ============================================================================
// File Icons
// ============================================================================

function getFileIcon(filename: string) {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()

  const iconMap: Record<string, typeof File> = {
    '.html': FileCode,
    '.htm': FileCode,
    '.css': Code2,
    '.scss': Code2,
    '.js': FileCode,
    '.jsx': FileCode,
    '.ts': FileCode,
    '.tsx': FileCode,
    '.json': FileJson,
    '.md': FileText,
    '.txt': FileText,
    '.png': Image,
    '.jpg': Image,
    '.jpeg': Image,
    '.gif': Image,
    '.svg': Image,
  }

  return iconMap[ext] || File
}

// ============================================================================
// File Node Component
// ============================================================================

function FileNode({
  file,
  depth,
  isActive,
  expandedFolders,
  dragOverPath,
  onToggleExpand,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDownload,
  onCopy,
}: FileNodeProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(file.name)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isExpanded = expandedFolders.has(file.id)
  const isFolder = file.type === 'folder'
  const isDragOver = dragOverPath === file.path

  const FileIcon = isFolder
    ? isExpanded
      ? FolderOpen
      : Folder
    : getFileIcon(file.name)

  const handleRenameSubmit = () => {
    if (newName.trim() && newName !== file.name) {
      onRename(file.id, newName.trim())
    }
    setIsRenaming(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setNewName(file.name)
      setIsRenaming(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowMenu(true)
  }

  const handleNodeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return

    e.preventDefault()
    if (isFolder) {
      onToggleExpand(file.id)
    } else {
      onSelect(file)
    }
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
          isActive
            ? 'bg-rose-gold-400/15 text-rose-gold-400'
            : isDragOver
            ? 'bg-rose-gold-500/20 ring-1 ring-rose-gold-400/50'
            : 'hover:bg-white/5 text-white/70 hover:text-white'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => (isFolder ? onToggleExpand(file.id) : onSelect(file))}
        onKeyDown={handleNodeKeyDown}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={isActive}
        tabIndex={0}
        draggable
        onDragStart={e => onDragStart(e, file)}
        onDragOver={e => isFolder && onDragOver(e, file.path)}
        onDragLeave={onDragLeave}
        onDrop={e => isFolder && onDrop(e, file.path)}
      >
        {/* Expand/collapse icon for folders */}
        {isFolder && (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}

        {/* File/folder icon */}
        <FileIcon
          className={`w-4 h-4 flex-shrink-0 ${
            isFolder ? 'text-rose-gold-400/70' : ''
          }`}
        />

        {/* Name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRenameSubmit}
            onClick={e => e.stopPropagation()}
            autoFocus
            className="flex-1 bg-dark-400 border border-rose-gold-400/30 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-rose-gold-400"
          />
        ) : (
          <span className="flex-1 text-sm truncate">{file.name}</span>
        )}

        {/* Quick actions (visible on hover) */}
        {!isRenaming && (
          <div className="hidden group-hover:flex items-center gap-1">
            {isFolder && (
              <>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onCreate(file.path, 'file')
                  }}
                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70"
                  title="New File"
                  aria-label="Create new file"
                >
                  <FilePlus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onCreate(file.path, 'folder')
                  }}
                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70"
                  title="New Folder"
                >
                  <FolderPlus className="w-3 h-3" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70"
            >
              <MoreVertical className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Context menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 w-40 bg-dark-400 border border-rose-gold-400/20 rounded-lg shadow-xl z-50 py-1"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setIsRenaming(true)
                setShowMenu(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5"
            >
              <Edit2 className="w-3 h-3" />
              Rename
            </button>
            {!isFolder && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCopy(file)
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5"
                >
                  <Copy className="w-3 h-3" />
                  Copy to Clipboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDownload(file)
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5"
                >
                  <Download className="w-3 h-3" />
                  Download
                </button>
              </>
            )}
            <div className="my-1 border-t border-white/10" />
            <button
              type="button"
              onClick={() => {
                onDelete(file.id)
                setShowMenu(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-gold-400 hover:text-rose-gold-400 hover:bg-rose-gold-500/10"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {isFolder && isExpanded && file.children && (
        <div>
          {file.children.map(child => (
            <FileNode
              key={child.id}
              file={child}
              depth={depth + 1}
              isActive={false}
              expandedFolders={expandedFolders}
              dragOverPath={dragOverPath}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDownload={onDownload}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// New File/Folder Dialog
// ============================================================================

interface NewItemDialogProps {
  isOpen: boolean
  type: 'file' | 'folder'
  parentPath: string
  onSubmit: (name: string) => void
  onClose: () => void
}

function NewItemDialog({ isOpen, type, parentPath, onSubmit, onClose }: NewItemDialogProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (name.trim()) {
      onSubmit(name.trim())
      setName('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="flex items-center gap-2 p-2 bg-dark-400/80 border-y border-rose-gold-400/10">
      {type === 'folder' ? (
        <Folder className="w-4 h-4 text-rose-gold-400/70" />
      ) : (
        <File className="w-4 h-4 text-white/50" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`New ${type}...`}
        autoFocus
        className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim()}
        className="p-1 rounded text-rose-gold-400 hover:bg-rose-gold-500/10 disabled:opacity-50"
      >
        <Check className="w-4 h-4" />
      </button>
      <button type="button" onClick={onClose} className="p-1 rounded text-rose-gold-400 hover:bg-rose-gold-500/10">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================================================
// Main FileTree Component
// ============================================================================

export default function FileTree({
  files,
  activeFilePath,
  onFileSelect,
  onFileCreate,
  onFileRename,
  onFileDelete,
  onFileMove,
  onFileCopy,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [draggedFile, setDraggedFile] = useState<ProjectFile | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [newItemDialog, setNewItemDialog] = useState<{
    isOpen: boolean
    type: 'file' | 'folder'
    parentPath: string
  }>({ isOpen: false, type: 'file', parentPath: '/' })

  const handleToggleExpand = useCallback((fileId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return next
    })
  }, [])

  const handleDragStart = useCallback((e: DragEvent, file: ProjectFile) => {
    setDraggedFile(file)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', file.id)
  }, [])

  const handleDragOver = useCallback((e: DragEvent, path: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverPath(path)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverPath(null)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent, targetPath: string) => {
      e.preventDefault()
      setDragOverPath(null)

      if (draggedFile && targetPath !== draggedFile.path) {
        // Prevent dropping a folder into itself
        if (!targetPath.startsWith(draggedFile.path)) {
          onFileMove(draggedFile.id, targetPath)
          toast.success('File Moved', `Moved "${draggedFile.name}" to ${targetPath}`)
        }
      }

      setDraggedFile(null)
    },
    [draggedFile, onFileMove]
  )

  const handleOpenNewItemDialog = useCallback((parentPath: string, type: 'file' | 'folder') => {
    setNewItemDialog({ isOpen: true, type, parentPath })
  }, [])

  const handleCreateNewItem = useCallback(
    (name: string) => {
      onFileCreate(newItemDialog.parentPath, name, newItemDialog.type)
      setNewItemDialog({ isOpen: false, type: 'file', parentPath: '/' })
      toast.success(
        `${newItemDialog.type === 'folder' ? 'Folder' : 'File'} Created`,
        `Created "${name}"`
      )
    },
    [newItemDialog, onFileCreate]
  )

  const handleDownload = useCallback((file: ProjectFile) => {
    projectService.downloadFile(file)
    toast.success('Download Started', `Downloading "${file.name}"`)
  }, [])

  const handleCopy = useCallback(
    async (file: ProjectFile) => {
      if (file.content) {
        const success = await projectService.copyToClipboard(file.content)
        if (success) {
          toast.success('Copied', `"${file.name}" content copied to clipboard`)
        } else {
          toast.error('Copy Failed', 'Could not copy to clipboard')
        }
      }
      if (onFileCopy) {
        onFileCopy(file)
      }
    },
    [onFileCopy]
  )

  const handleDelete = useCallback(
    (fileId: string) => {
      if (confirm('Are you sure you want to delete this item?')) {
        onFileDelete(fileId)
        toast.success('Deleted', 'Item has been deleted')
      }
    },
    [onFileDelete]
  )

  const handleDropOnRoot = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOverPath(null)

      if (draggedFile) {
        onFileMove(draggedFile.id, '/')
        toast.success('File Moved', `Moved "${draggedFile.name}" to root`)
      }

      setDraggedFile(null)
    },
    [draggedFile, onFileMove]
  )

  return (
    <div
      className="h-full flex flex-col"
      onDragOver={e => {
        e.preventDefault()
        if (!dragOverPath) setDragOverPath('/')
      }}
      onDrop={handleDropOnRoot}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-rose-gold-400/10">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleOpenNewItemDialog('/', 'file')}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            title="New File"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleOpenNewItemDialog('/', 'folder')}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New item dialog */}
      <NewItemDialog
        isOpen={newItemDialog.isOpen}
        type={newItemDialog.type}
        parentPath={newItemDialog.parentPath}
        onSubmit={handleCreateNewItem}
        onClose={() => setNewItemDialog({ isOpen: false, type: 'file', parentPath: '/' })}
      />

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="text-center py-8">
            <Folder className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-xs text-white/30">No files yet</p>
            <button
              type="button"
              onClick={() => handleOpenNewItemDialog('/', 'file')}
              className="mt-2 text-xs text-rose-gold-400 hover:text-rose-gold-300"
            >
              Create your first file
            </button>
          </div>
        ) : (
          files.map(file => (
            <FileNode
              key={file.id}
              file={file}
              depth={0}
              isActive={file.path === activeFilePath}
              expandedFolders={expandedFolders}
              dragOverPath={dragOverPath}
              onToggleExpand={handleToggleExpand}
              onSelect={onFileSelect}
              onCreate={handleOpenNewItemDialog}
              onRename={onFileRename}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDownload={handleDownload}
              onCopy={handleCopy}
            />
          ))
        )}
      </div>
    </div>
  )
}
