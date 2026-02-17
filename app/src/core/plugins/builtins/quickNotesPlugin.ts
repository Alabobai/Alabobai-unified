/**
 * Quick Notes Plugin
 * Simple note-taking integrated with the sidebar
 */

import type { PluginDefinition, PluginAPI } from '../types'
import { BRAND } from '../../../config/brand'

interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  pinned: boolean
  color?: string
}

interface NotesData {
  notes: Note[]
  lastViewed: string | null
}

const DEFAULT_DATA: NotesData = {
  notes: [],
  lastViewed: null
}

export const quickNotesPlugin: PluginDefinition = {
  manifest: {
    id: 'com.alabobai.quick-notes',
    name: 'Quick Notes',
    version: '1.0.0',
    author: BRAND.name,
    description: `Take quick notes without leaving ${BRAND.name}`,
    longDescription: `A lightweight note-taking solution built right into ${BRAND.name}. Create, organize, and search notes with ease. Perfect for jotting down ideas, saving snippets, or keeping track of important information.`,
    icon: 'StickyNote',
    category: 'productivity',
    tags: ['notes', 'productivity', 'organization'],
    permissions: ['storage', 'ui.sidebar', 'ui.panels', 'notifications'],
    settingsSchema: {
      sections: [
        {
          id: 'notes-settings',
          title: 'Notes Settings',
          description: 'Customize your notes experience',
          fields: [
            {
              id: 'defaultColor',
              type: 'color',
              label: 'Default Note Color',
              description: 'Default background color for new notes',
              defaultValue: '#fef3c7'
            },
            {
              id: 'sortBy',
              type: 'select',
              label: 'Sort Notes By',
              options: [
                { value: 'updatedAt', label: 'Last Modified' },
                { value: 'createdAt', label: 'Date Created' },
                { value: 'title', label: 'Title' },
                { value: 'pinned', label: 'Pinned First' }
              ],
              defaultValue: 'pinned'
            },
            {
              id: 'showPreview',
              type: 'boolean',
              label: 'Show Content Preview',
              description: 'Show a preview of note content in the list',
              defaultValue: true
            },
            {
              id: 'confirmDelete',
              type: 'boolean',
              label: 'Confirm Before Delete',
              description: 'Ask for confirmation before deleting notes',
              defaultValue: true
            }
          ]
        }
      ]
    }
  },

  hooks: {
    async onInit(api: PluginAPI) {
      console.log('[QuickNotesPlugin] Initializing...')

      // Initialize data if not present
      const data = await api.storage.get<NotesData>('data')
      if (!data) {
        await api.storage.set('data', DEFAULT_DATA)
      }
    },

    async onActivate(api: PluginAPI) {
      console.log('[QuickNotesPlugin] Activating...')

      // Register sidebar item
      api.ui.registerSidebarItem({
        id: 'quick-notes',
        icon: 'StickyNote',
        label: 'Notes',
        order: 80,
        onClick: () => {
          showNotesPanel(api)
        }
      })

      // Register panel
      api.ui.registerPanel({
        id: 'notes-panel',
        title: 'Quick Notes',
        icon: 'StickyNote',
        position: 'right',
        defaultOpen: false,
        order: 10,
        render: () => null // Would return React component
      })

      // Register toolbar button for quick add
      api.ui.registerToolbarButton({
        id: 'add-note',
        icon: 'Plus',
        label: 'Add Note',
        tooltip: 'Create a new note',
        onClick: () => {
          createNote(api)
        },
        order: 50
      })

      const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
      if (data.notes.length > 0) {
        api.notifications.info('Quick Notes', `${data.notes.length} notes loaded`)
      }
    },

    async onDeactivate(api: PluginAPI) {
      console.log('[QuickNotesPlugin] Deactivating...')
    },

    onSettingsChange(settings, api) {
      console.log('[QuickNotesPlugin] Settings changed:', settings)
    }
  }
}

// Note management functions
export async function createNote(api: PluginAPI, title?: string, content?: string): Promise<Note> {
  const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
  const settings = api.settings.getAll()

  const note: Note = {
    id: api.utils.generateId(),
    title: title || 'Untitled Note',
    content: content || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: false,
    color: settings.defaultColor as string
  }

  data.notes.unshift(note)
  await api.storage.set('data', data)

  api.notifications.success('Note Created', `"${note.title}" has been created`)
  return note
}

export async function updateNote(api: PluginAPI, id: string, updates: Partial<Note>): Promise<Note | null> {
  const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
  const index = data.notes.findIndex(n => n.id === id)

  if (index === -1) {
    api.notifications.error('Note Not Found', 'The note you are trying to update does not exist')
    return null
  }

  data.notes[index] = {
    ...data.notes[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }

  await api.storage.set('data', data)
  return data.notes[index]
}

export async function deleteNote(api: PluginAPI, id: string): Promise<boolean> {
  const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
  const index = data.notes.findIndex(n => n.id === id)

  if (index === -1) {
    return false
  }

  const note = data.notes[index]
  data.notes.splice(index, 1)
  await api.storage.set('data', data)

  api.notifications.success('Note Deleted', `"${note.title}" has been deleted`)
  return true
}

export async function togglePin(api: PluginAPI, id: string): Promise<boolean> {
  const note = await updateNote(api, id, { pinned: true })
  if (note) {
    // Toggle the pinned state
    await updateNote(api, id, { pinned: !note.pinned })
    return true
  }
  return false
}

export async function searchNotes(api: PluginAPI, query: string): Promise<Note[]> {
  const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
  const lowerQuery = query.toLowerCase()

  return data.notes.filter(note =>
    note.title.toLowerCase().includes(lowerQuery) ||
    note.content.toLowerCase().includes(lowerQuery)
  )
}

export async function getNotes(api: PluginAPI): Promise<Note[]> {
  const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
  const settings = api.settings.getAll()
  const sortBy = settings.sortBy as string || 'pinned'

  return [...data.notes].sort((a, b) => {
    if (sortBy === 'pinned') {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
    if (sortBy === 'updatedAt') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
    if (sortBy === 'createdAt') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title)
    }
    return 0
  })
}

// Show notes panel
async function showNotesPanel(api: PluginAPI): Promise<void> {
  const data = await api.storage.get<NotesData>('data') || DEFAULT_DATA
  data.lastViewed = new Date().toISOString()
  await api.storage.set('data', data)

  api.ui.showModal({
    id: 'notes-list',
    title: 'Quick Notes',
    size: 'medium',
    closable: true,
    content: null, // Would be a React component
    onClose: () => {
      api.ui.closeModal('notes-list')
    }
  })
}
