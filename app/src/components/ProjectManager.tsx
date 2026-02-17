/**
 * ProjectManager Component
 * Full-featured project management interface with list view, templates, and actions
 */

import { useState, useRef, useCallback } from 'react'
import {
  FolderOpen,
  Plus,
  Search,
  Star,
  StarOff,
  MoreVertical,
  Download,
  Upload,
  Copy,
  Trash2,
  Edit2,
  Clock,
  Calendar,
  FileText,
  Globe,
  LayoutDashboard,
  User,
  BookOpen,
  ShoppingBag,
  FileCode,
  SortAsc,
  SortDesc,
  Grid,
  List,
  X,
  Check,
  ChevronDown,
} from 'lucide-react'
import { useProjectStore, ProjectTemplate, PROJECT_TEMPLATES, Project } from '@/stores/projectStore'
import { projectService } from '@/services/projectService'
import { toast } from '@/stores/toastStore'

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'grid' | 'list'

interface ProjectCardProps {
  project: Project
  viewMode: ViewMode
  onSelect: (project: Project) => void
  onStar: (projectId: string) => void
  onDelete: (projectId: string) => void
  onDuplicate: (projectId: string) => void
  onRename: (projectId: string, newName: string) => void
  onExport: (project: Project) => void
}

// ============================================================================
// Template Icons
// ============================================================================

const TEMPLATE_ICONS: Record<ProjectTemplate, typeof FileText> = {
  blank: FileText,
  'landing-page': Globe,
  dashboard: LayoutDashboard,
  portfolio: User,
  blog: BookOpen,
  'e-commerce': ShoppingBag,
  documentation: FileCode,
}

// ============================================================================
// Project Card Component
// ============================================================================

function ProjectCard({
  project,
  viewMode,
  onSelect,
  onStar,
  onDelete,
  onDuplicate,
  onRename,
  onExport,
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(project.metadata.name)
  const menuRef = useRef<HTMLDivElement>(null)

  const TemplateIcon = TEMPLATE_ICONS[project.metadata.template] || FileText

  const handleRename = () => {
    if (newName.trim() && newName !== project.metadata.name) {
      onRename(project.metadata.id, newName.trim())
    }
    setIsRenaming(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setNewName(project.metadata.name)
      setIsRenaming(false)
    }
  }

  const formatDate = (date: Date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return d.toLocaleDateString()
  }

  if (viewMode === 'list') {
    return (
      <div
        className="group flex items-center gap-4 p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-rose-gold-400/10 hover:border-rose-gold-400/30 rounded-lg cursor-pointer transition-all"
        onClick={() => !isRenaming && onSelect(project)}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-400/5 flex items-center justify-center">
          <TemplateIcon className="w-5 h-5 text-rose-gold-400" />
        </div>

        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleRename}
                autoFocus
                className="flex-1 bg-dark-400 border border-rose-gold-400/30 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-rose-gold-400"
              />
              <button onClick={handleRename} className="p-1 text-rose-gold-400 hover:bg-rose-gold-500/10 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setNewName(project.metadata.name); setIsRenaming(false) }} className="p-1 text-rose-gold-400 hover:bg-rose-gold-500/10 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <h3 className="font-medium text-white truncate">{project.metadata.name}</h3>
              <p className="text-xs text-white/50 truncate">{project.metadata.description}</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/40">
          <Clock className="w-3 h-3" />
          <span>{formatDate(project.metadata.modifiedAt)}</span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onStar(project.metadata.id) }}
          className={`p-2 rounded-lg transition-colors ${
            project.metadata.starred
              ? 'text-rose-gold-400 hover:bg-rose-gold-500/10'
              : 'text-white/30 hover:text-white/60 hover:bg-white/5'
          }`}
        >
          {project.metadata.starred ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-dark-400 border border-rose-gold-400/20 rounded-lg shadow-xl z-50 py-1">
              <button
                onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setShowMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
              >
                <Edit2 className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(project.metadata.id); setShowMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onExport(project); setShowMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
              >
                <Download className="w-4 h-4" />
                Export as ZIP
              </button>
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(project.metadata.id); setShowMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rose-gold-400 hover:text-rose-gold-400 hover:bg-rose-gold-500/10"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Grid view
  return (
    <div
      className="group relative bg-white/[0.02] hover:bg-white/[0.05] border border-rose-gold-400/10 hover:border-rose-gold-400/30 rounded-xl overflow-hidden cursor-pointer transition-all"
      onClick={() => !isRenaming && onSelect(project)}
    >
      {/* Preview area */}
      <div className="h-32 bg-gradient-to-br from-rose-gold-400/10 to-transparent flex items-center justify-center relative">
        <TemplateIcon className="w-12 h-12 text-rose-gold-400/40" />

        {/* Starred indicator */}
        {project.metadata.starred && (
          <div className="absolute top-2 right-2">
            <Star className="w-4 h-4 text-rose-gold-400 fill-current" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {isRenaming ? (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleRename}
              autoFocus
              className="flex-1 bg-dark-400 border border-rose-gold-400/30 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-rose-gold-400"
            />
          </div>
        ) : (
          <h3 className="font-medium text-white truncate mb-1">{project.metadata.name}</h3>
        )}
        <p className="text-xs text-white/40 truncate mb-3">{project.metadata.description}</p>

        <div className="flex items-center justify-between text-xs text-white/40">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(project.metadata.modifiedAt)}</span>
          </div>
          <span className="px-2 py-0.5 bg-rose-gold-400/10 text-rose-gold-400 rounded-full text-[10px] uppercase">
            {project.metadata.template.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute inset-0 bg-dark-500/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(project) }}
          className="p-3 bg-rose-gold-400 text-dark-500 rounded-lg hover:bg-rose-gold-300 transition-colors"
        >
          <FolderOpen className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onStar(project.metadata.id) }}
          className={`p-3 rounded-lg transition-colors ${
            project.metadata.starred
              ? 'bg-rose-gold-500/20 text-rose-gold-400'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <Star className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          className="p-3 bg-white/10 text-white/70 rounded-lg hover:bg-white/20 transition-colors"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Menu dropdown */}
      {showMenu && (
        <div
          className="absolute right-2 top-36 w-48 bg-dark-400 border border-rose-gold-400/20 rounded-lg shadow-xl z-50 py-1"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { setIsRenaming(true); setShowMenu(false) }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
          >
            <Edit2 className="w-4 h-4" />
            Rename
          </button>
          <button
            onClick={() => { onDuplicate(project.metadata.id); setShowMenu(false) }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
          <button
            onClick={() => { onExport(project); setShowMenu(false) }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
          >
            <Download className="w-4 h-4" />
            Export as ZIP
          </button>
          <div className="my-1 border-t border-white/10" />
          <button
            onClick={() => { onDelete(project.metadata.id); setShowMenu(false) }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rose-gold-400 hover:text-rose-gold-400 hover:bg-rose-gold-500/10"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// New Project Modal
// ============================================================================

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, template: ProjectTemplate, description: string) => void
}

function NewProjectModal({ isOpen, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>('blank')

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate(name.trim(), selectedTemplate, description.trim())
    setName('')
    setDescription('')
    setSelectedTemplate('blank')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-dark-400 border border-rose-gold-400/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-rose-gold-400/10">
          <h2 className="text-xl font-semibold text-white">Create New Project</h2>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Project name */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Awesome Project"
              className="w-full bg-dark-500 border border-rose-gold-400/20 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="A brief description of your project..."
              rows={2}
              className="w-full bg-dark-500 border border-rose-gold-400/20 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50 resize-none"
            />
          </div>

          {/* Templates */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">Choose a Template</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(Object.entries(PROJECT_TEMPLATES) as [ProjectTemplate, typeof PROJECT_TEMPLATES['blank']][]).map(
                ([key, template]) => {
                  const Icon = TEMPLATE_ICONS[key]
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedTemplate(key)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        selectedTemplate === key
                          ? 'bg-rose-gold-400/15 border-rose-gold-400/50 ring-1 ring-rose-gold-400/30'
                          : 'bg-white/[0.02] border-white/10 hover:border-rose-gold-400/30'
                      }`}
                    >
                      <Icon
                        className={`w-6 h-6 mb-2 ${
                          selectedTemplate === key ? 'text-rose-gold-400' : 'text-white/40'
                        }`}
                      />
                      <h4 className="font-medium text-white text-sm">{template.name}</h4>
                      <p className="text-xs text-white/40 mt-1 line-clamp-2">{template.description}</p>
                    </button>
                  )
                }
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-rose-gold-400/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-6 py-2 bg-gradient-to-r from-rose-gold-400 to-rose-gold-500 text-dark-500 font-medium rounded-lg hover:from-rose-gold-300 hover:to-rose-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main ProjectManager Component
// ============================================================================

export default function ProjectManager() {
  const {
    projects,
    activeProjectId,
    searchQuery,
    sortBy,
    sortDirection,
    filterByStarred,
    setSearchQuery,
    setSortBy,
    setSortDirection,
    setFilterByStarred,
    setActiveProject,
    createProject,
    deleteProject,
    duplicateProject,
    toggleStarred,
    updateProject,
    getFilteredProjects,
    getRecentProjects,
  } = useProjectStore()

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredProjects = getFilteredProjects()
  const recentProjects = getRecentProjects(4)

  const handleCreateProject = useCallback(
    (name: string, template: ProjectTemplate, description: string) => {
      const project = createProject(name, template, description)
      toast.success('Project Created', `"${name}" has been created successfully`)
    },
    [createProject]
  )

  const handleSelectProject = useCallback(
    (project: Project) => {
      setActiveProject(project.metadata.id)
      toast.info('Project Opened', `Now editing "${project.metadata.name}"`)
    },
    [setActiveProject]
  )

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const project = projects.find(p => p.metadata.id === projectId)
      if (project && confirm(`Delete "${project.metadata.name}"? This cannot be undone.`)) {
        deleteProject(projectId)
        toast.success('Project Deleted', `"${project.metadata.name}" has been deleted`)
      }
    },
    [projects, deleteProject]
  )

  const handleDuplicateProject = useCallback(
    (projectId: string) => {
      const newProject = duplicateProject(projectId)
      if (newProject) {
        toast.success('Project Duplicated', `Created "${newProject.metadata.name}"`)
      }
    },
    [duplicateProject]
  )

  const handleRenameProject = useCallback(
    (projectId: string, newName: string) => {
      updateProject(projectId, { name: newName })
      toast.success('Project Renamed', `Project renamed to "${newName}"`)
    },
    [updateProject]
  )

  const handleExportProject = useCallback(async (project: Project) => {
    try {
      await projectService.exportAsZip(project)
      toast.success('Export Complete', `"${project.metadata.name}" has been exported`)
    } catch (error) {
      toast.error('Export Failed', 'Could not export the project')
    }
  }, [])

  const handleImportProject = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await projectService.importFromZip(file)
      if (result.success) {
        toast.success('Import Complete', 'Project has been imported successfully')
      } else {
        toast.error('Import Failed', result.error || 'Could not import the project')
      }
    } catch (error) {
      toast.error('Import Failed', 'Could not import the project')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-dark-500">
      {/* Header */}
      <div className="p-6 border-b border-rose-gold-400/10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-sm text-white/50 mt-1">Manage your projects and templates</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleImportProject}
              className="hidden"
            />
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-gold-400 to-rose-gold-500 text-dark-500 font-medium rounded-lg hover:from-rose-gold-300 hover:to-rose-gold-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-dark-400 border border-rose-gold-400/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/30"
            />
          </div>

          <button
            onClick={() => setFilterByStarred(!filterByStarred)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              filterByStarred
                ? 'bg-rose-gold-500/15 border-rose-gold-400/30 text-rose-gold-400'
                : 'bg-dark-400 border-white/10 text-white/50 hover:text-white/70'
            }`}
          >
            <Star className="w-4 h-4" />
            Starred
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-dark-400 border border-white/10 rounded-lg text-white/50 hover:text-white/70 transition-colors"
            >
              {sortDirection === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
              Sort
              <ChevronDown className="w-4 h-4" />
            </button>

            {showSortMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-dark-400 border border-rose-gold-400/20 rounded-lg shadow-xl z-50 py-1">
                {[
                  { value: 'name', label: 'Name' },
                  { value: 'date-created', label: 'Date Created' },
                  { value: 'date-modified', label: 'Date Modified' },
                  { value: 'date-opened', label: 'Last Opened' },
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (sortBy === option.value) {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                      } else {
                        setSortBy(option.value as any)
                      }
                      setShowSortMenu(false)
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-white/5 ${
                      sortBy === option.value ? 'text-rose-gold-400' : 'text-white/70'
                    }`}
                  >
                    {option.label}
                    {sortBy === option.value && (
                      sortDirection === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center bg-dark-400 border border-white/10 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${
                viewMode === 'grid' ? 'bg-rose-gold-400/20 text-rose-gold-400' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${
                viewMode === 'list' ? 'bg-rose-gold-400/20 text-rose-gold-400' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Recent Projects */}
        {recentProjects.length > 0 && !searchQuery && !filterByStarred && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4">Recently Opened</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {recentProjects.map(project => {
                const Icon = TEMPLATE_ICONS[project.metadata.template]
                return (
                  <button
                    key={project.metadata.id}
                    onClick={() => handleSelectProject(project)}
                    className="flex items-center gap-3 p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-rose-gold-400/10 hover:border-rose-gold-400/30 rounded-lg text-left transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-400/5 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-rose-gold-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-white truncate text-sm">{project.metadata.name}</h3>
                      <p className="text-xs text-white/40 truncate">{project.metadata.template}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* All Projects */}
        <div>
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4">
            {searchQuery ? 'Search Results' : filterByStarred ? 'Starred Projects' : 'All Projects'}
            <span className="ml-2 text-white/30">({filteredProjects.length})</span>
          </h2>

          {filteredProjects.length === 0 ? (
            <div className="text-center py-16">
              <FolderOpen className="w-16 h-16 text-white/10 mx-auto mb-4" />
              <h3 className="text-lg text-white/50 mb-2">No projects found</h3>
              <p className="text-sm text-white/30 mb-6">
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'Create your first project to get started'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-gold-400/15 text-rose-gold-400 rounded-lg hover:bg-rose-gold-400/25 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Project
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProjects.map(project => (
                <ProjectCard
                  key={project.metadata.id}
                  project={project}
                  viewMode="grid"
                  onSelect={handleSelectProject}
                  onStar={toggleStarred}
                  onDelete={handleDeleteProject}
                  onDuplicate={handleDuplicateProject}
                  onRename={handleRenameProject}
                  onExport={handleExportProject}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map(project => (
                <ProjectCard
                  key={project.metadata.id}
                  project={project}
                  viewMode="list"
                  onSelect={handleSelectProject}
                  onStar={toggleStarred}
                  onDelete={handleDeleteProject}
                  onDuplicate={handleDuplicateProject}
                  onRename={handleRenameProject}
                  onExport={handleExportProject}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreate={handleCreateProject}
      />
    </div>
  )
}
