/**
 * Project Service
 * Handles project persistence, export/import, and file operations
 */

import { useProjectStore, Project, ProjectFile, ProjectTemplate, PROJECT_TEMPLATES } from '@/stores/projectStore'
import JSZip from 'jszip'

// ============================================================================
// Types
// ============================================================================

export interface ExportOptions {
  format: 'zip' | 'json'
  includeSettings: boolean
  includeMetadata: boolean
}

export interface ImportResult {
  success: boolean
  project?: Project
  error?: string
}

// ============================================================================
// IndexedDB Storage
// ============================================================================

const DB_NAME = 'alabobai-projects'
const DB_VERSION = 1
const STORE_NAME = 'projects'

class ProjectDatabase {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'metadata.id' })
        }
      }
    })
  }

  async saveProject(project: Project): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(project)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getProject(projectId: string): Promise<Project | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(projectId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async getAllProjects(): Promise<Project[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(projectId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

const projectDb = new ProjectDatabase()

// ============================================================================
// File Type Detection
// ============================================================================

const LANGUAGE_MAP: Record<string, string> = {
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.svg': 'svg',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte',
}

function detectLanguage(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
  return LANGUAGE_MAP[ext] || 'plaintext'
}

// ============================================================================
// Export Functions
// ============================================================================

async function exportProjectAsZip(project: Project): Promise<Blob> {
  const zip = new JSZip()

  // Add project metadata
  zip.file('_alabobai.json', JSON.stringify({
    metadata: project.metadata,
    settings: project.settings,
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
  }, null, 2))

  // Add all files
  const addFilesToZip = (files: ProjectFile[], basePath: string = '') => {
    for (const file of files) {
      const filePath = basePath ? `${basePath}/${file.name}` : file.name

      if (file.type === 'folder' && file.children) {
        addFilesToZip(file.children, filePath)
      } else if (file.content !== undefined) {
        zip.file(filePath, file.content)
      }
    }
  }

  addFilesToZip(project.files)

  return zip.generateAsync({ type: 'blob' })
}

async function exportProjectAsJson(project: Project): Promise<string> {
  return JSON.stringify({
    ...project,
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
  }, null, 2)
}

// ============================================================================
// Import Functions
// ============================================================================

async function importProjectFromZip(file: File): Promise<ImportResult> {
  try {
    const zip = await JSZip.loadAsync(file)

    // Try to read metadata
    let metadata: any = null
    let settings: any = null

    const metadataFile = zip.file('_alabobai.json')
    if (metadataFile) {
      const content = await metadataFile.async('string')
      const parsed = JSON.parse(content)
      metadata = parsed.metadata
      settings = parsed.settings
    }

    // Generate new project ID
    const projectId = crypto.randomUUID()
    const now = new Date()

    // Build file tree from zip
    const files: ProjectFile[] = []
    const folderMap = new Map<string, ProjectFile>()

    const zipFiles = Object.keys(zip.files).filter(name =>
      !name.startsWith('_') && !name.startsWith('.') && !zip.files[name].dir
    )

    // Sort by path depth to ensure folders are created first
    zipFiles.sort((a, b) => a.split('/').length - b.split('/').length)

    for (const filePath of zipFiles) {
      const zipFile = zip.files[filePath]
      if (zipFile.dir) continue

      const pathParts = filePath.split('/')
      const fileName = pathParts.pop()!
      const content = await zipFile.async('string')

      const projectFile: ProjectFile = {
        id: crypto.randomUUID(),
        name: fileName,
        path: '/' + filePath,
        type: 'file',
        content,
        language: detectLanguage(fileName),
        createdAt: now,
        modifiedAt: now,
        size: new Blob([content]).size,
      }

      if (pathParts.length === 0) {
        files.push(projectFile)
      } else {
        // Create folder hierarchy if needed
        let currentPath = ''
        let currentFiles = files

        for (const folderName of pathParts) {
          currentPath = currentPath ? `${currentPath}/${folderName}` : folderName

          let folder = folderMap.get(currentPath)
          if (!folder) {
            folder = {
              id: crypto.randomUUID(),
              name: folderName,
              path: '/' + currentPath,
              type: 'folder',
              children: [],
              createdAt: now,
              modifiedAt: now,
            }
            folderMap.set(currentPath, folder)
            currentFiles.push(folder)
          }
          currentFiles = folder.children!
        }

        currentFiles.push(projectFile)
      }
    }

    const project: Project = {
      metadata: {
        id: projectId,
        name: metadata?.name || file.name.replace(/\.zip$/i, ''),
        description: metadata?.description || 'Imported project',
        template: metadata?.template || 'blank',
        createdAt: now,
        modifiedAt: now,
        lastOpenedAt: now,
        tags: metadata?.tags || [],
        starred: false,
        version: '1.0.0',
      },
      files,
      settings: settings || {
        autoSave: true,
        autoSaveInterval: 30,
        previewMode: 'split',
        theme: 'dark',
        linting: true,
        formatting: true,
      },
    }

    return { success: true, project }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import project',
    }
  }
}

async function importProjectFromJson(jsonString: string): Promise<ImportResult> {
  try {
    const parsed = JSON.parse(jsonString)
    const now = new Date()

    // Generate new IDs
    const projectId = crypto.randomUUID()

    const updateFileIds = (files: ProjectFile[]): ProjectFile[] => {
      return files.map(file => ({
        ...file,
        id: crypto.randomUUID(),
        createdAt: new Date(file.createdAt),
        modifiedAt: new Date(file.modifiedAt),
        children: file.children ? updateFileIds(file.children) : undefined,
      }))
    }

    const project: Project = {
      metadata: {
        ...parsed.metadata,
        id: projectId,
        createdAt: now,
        modifiedAt: now,
        lastOpenedAt: now,
      },
      files: updateFileIds(parsed.files),
      settings: parsed.settings,
    }

    return { success: true, project }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse JSON',
    }
  }
}

// ============================================================================
// Project Service Class
// ============================================================================

class ProjectService {
  private autoSaveTimer: number | null = null
  private pendingChanges = false

  /**
   * Initialize the service and start auto-save
   */
  async initialize(): Promise<void> {
    await projectDb.init()
    this.startAutoSave()
  }

  /**
   * Save a project to IndexedDB
   */
  async saveProject(project: Project): Promise<void> {
    await projectDb.saveProject(project)
    useProjectStore.getState().markAsSaved()
  }

  /**
   * Save the currently active project
   */
  async saveActiveProject(): Promise<void> {
    const project = useProjectStore.getState().getActiveProject()
    if (project) {
      await this.saveProject(project)
    }
  }

  /**
   * Load a project from IndexedDB
   */
  async loadProject(projectId: string): Promise<Project | null> {
    return projectDb.getProject(projectId)
  }

  /**
   * Load all projects from IndexedDB
   */
  async loadAllProjects(): Promise<Project[]> {
    return projectDb.getAllProjects()
  }

  /**
   * Delete a project from IndexedDB
   */
  async deleteProject(projectId: string): Promise<void> {
    await projectDb.deleteProject(projectId)
    useProjectStore.getState().deleteProject(projectId)
  }

  /**
   * Export project as ZIP
   */
  async exportAsZip(project: Project): Promise<void> {
    const blob = await exportProjectAsZip(project)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.metadata.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Export project as JSON
   */
  async exportAsJson(project: Project): Promise<void> {
    const json = await exportProjectAsJson(project)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.metadata.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Download a single file
   */
  downloadFile(file: ProjectFile): void {
    if (!file.content) return

    const blob = new Blob([file.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Copy file content to clipboard
   */
  async copyToClipboard(content: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = content
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)
      return success
    }
  }

  /**
   * Import project from ZIP file
   */
  async importFromZip(file: File): Promise<ImportResult> {
    const result = await importProjectFromZip(file)
    if (result.success && result.project) {
      // Add to store
      const store = useProjectStore.getState()
      store.createProject(
        result.project.metadata.name,
        result.project.metadata.template,
        result.project.metadata.description
      )
      // Update with imported files
      const newProject = store.getActiveProject()
      if (newProject) {
        // Replace files with imported ones
        useProjectStore.setState(state => {
          const project = state.projects.find(p => p.metadata.id === newProject.metadata.id)
          if (project) {
            project.files = result.project!.files
          }
        })
      }
    }
    return result
  }

  /**
   * Import project from JSON
   */
  async importFromJson(file: File): Promise<ImportResult> {
    const content = await file.text()
    const result = await importProjectFromJson(content)
    if (result.success && result.project) {
      // Add to store similar to zip import
      const store = useProjectStore.getState()
      store.createProject(
        result.project.metadata.name,
        result.project.metadata.template,
        result.project.metadata.description
      )
    }
    return result
  }

  /**
   * Create project from template
   */
  createFromTemplate(name: string, template: ProjectTemplate, description?: string): Project {
    return useProjectStore.getState().createProject(name, template, description)
  }

  /**
   * Start auto-save functionality
   */
  startAutoSave(intervalSeconds = 30): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
    }

    this.autoSaveTimer = window.setInterval(() => {
      const { hasUnsavedChanges } = useProjectStore.getState()
      if (hasUnsavedChanges) {
        this.saveActiveProject()
      }
    }, intervalSeconds * 1000)
  }

  /**
   * Stop auto-save
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
  }

  /**
   * Mark that changes need to be saved
   */
  markPendingChanges(): void {
    this.pendingChanges = true
    useProjectStore.getState().setHasUnsavedChanges(true)
  }

  /**
   * Get all available templates
   */
  getTemplates(): typeof PROJECT_TEMPLATES {
    return PROJECT_TEMPLATES
  }

  /**
   * Generate HTML preview for a project
   */
  generatePreviewHtml(project: Project): string {
    const files = project.files

    // Find index.html
    const indexFile = files.find(f => f.name === 'index.html')
    if (!indexFile?.content) {
      return '<html><body><h1>No index.html found</h1></body></html>'
    }

    let html = indexFile.content

    // Inline CSS
    const cssFile = files.find(f => f.name === 'styles.css' || f.name === 'style.css')
    if (cssFile?.content) {
      html = html.replace(
        /<link[^>]*href=["'](?:\.\/)?(?:styles?\.css)["'][^>]*>/i,
        `<style>${cssFile.content}</style>`
      )
    }

    // Inline JavaScript
    const jsFile = files.find(f => f.name === 'script.js' || f.name === 'main.js' || f.name === 'app.js')
    if (jsFile?.content) {
      html = html.replace(
        /<script[^>]*src=["'](?:\.\/)?(?:script|main|app)\.js["'][^>]*><\/script>/i,
        `<script>${jsFile.content}</script>`
      )
    }

    return html
  }
}

// Export singleton instance
export const projectService = new ProjectService()
export default projectService
