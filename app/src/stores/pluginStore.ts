/**
 * Plugin Store
 * Zustand store for plugin state management and React integration
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEffect, useState } from 'react'
import { pluginManager } from '@/core/plugins/PluginManager'
import type {
  PluginInstance,
  PluginManifest,
  SidebarItem,
  ToolbarButton,
  PanelDefinition,
  SettingsSection,
  ModalDefinition
} from '@/core/plugins/types'
import { BRAND } from '@/config/brand'

// ============================================================================
// Store Interface
// ============================================================================

interface PluginStoreState {
  // Plugin states
  initialized: boolean
  loading: boolean
  error: string | null

  // Marketplace
  availablePlugins: PluginManifest[]
  marketplaceLoading: boolean

  // Filters
  searchQuery: string
  categoryFilter: string | null

  // Actions
  initialize: () => Promise<void>
  refreshPlugins: () => void
  searchPlugins: (query: string) => void
  filterByCategory: (category: string | null) => void
  installPlugin: (pluginId: string) => Promise<boolean>
  uninstallPlugin: (pluginId: string) => Promise<boolean>
  activatePlugin: (pluginId: string) => Promise<boolean>
  deactivatePlugin: (pluginId: string) => Promise<boolean>
  fetchMarketplace: () => Promise<void>
}

// ============================================================================
// Store Implementation
// ============================================================================

export const usePluginStore = create<PluginStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      initialized: false,
      loading: false,
      error: null,
      availablePlugins: [],
      marketplaceLoading: false,
      searchQuery: '',
      categoryFilter: null,

      // Initialize plugin system
      initialize: async () => {
        if (get().initialized) return

        set({ loading: true, error: null })

        try {
          await pluginManager.initialize()
          set({ initialized: true, loading: false })
        } catch (error) {
          console.error('[PluginStore] Initialization failed:', error)
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize plugins'
          })
        }
      },

      // Refresh plugins (triggers re-render)
      refreshPlugins: () => {
        set({}) // Force update
      },

      // Search plugins
      searchPlugins: (query: string) => {
        set({ searchQuery: query })
      },

      // Filter by category
      filterByCategory: (category: string | null) => {
        set({ categoryFilter: category })
      },

      // Install plugin
      installPlugin: async (pluginId: string) => {
        set({ loading: true, error: null })

        try {
          // For marketplace plugins, we'd download and register them
          // For now, plugins must be bundled with the app
          console.log(`[PluginStore] Installing plugin: ${pluginId}`)
          set({ loading: false })
          return true
        } catch (error) {
          console.error('[PluginStore] Installation failed:', error)
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to install plugin'
          })
          return false
        }
      },

      // Uninstall plugin
      uninstallPlugin: async (pluginId: string) => {
        set({ loading: true, error: null })

        try {
          const success = await pluginManager.uninstall(pluginId)
          set({ loading: false })
          return success
        } catch (error) {
          console.error('[PluginStore] Uninstall failed:', error)
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to uninstall plugin'
          })
          return false
        }
      },

      // Activate plugin
      activatePlugin: async (pluginId: string) => {
        set({ loading: true, error: null })

        try {
          const success = await pluginManager.activate(pluginId)
          set({ loading: false })
          return success
        } catch (error) {
          console.error('[PluginStore] Activation failed:', error)
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to activate plugin'
          })
          return false
        }
      },

      // Deactivate plugin
      deactivatePlugin: async (pluginId: string) => {
        set({ loading: true, error: null })

        try {
          const success = await pluginManager.deactivate(pluginId)
          set({ loading: false })
          return success
        } catch (error) {
          console.error('[PluginStore] Deactivation failed:', error)
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to deactivate plugin'
          })
          return false
        }
      },

      // Fetch marketplace plugins
      fetchMarketplace: async () => {
        set({ marketplaceLoading: true })

        try {
          // Mock marketplace data - in production this would fetch from an API
          const mockPlugins: PluginManifest[] = [
            {
              id: 'code-snippets',
              name: 'Code Snippets',
              version: '1.0.0',
              description: 'Save and organize reusable code snippets',
              author: BRAND.name,
              category: 'productivity',
              tags: ['code', 'snippets', 'productivity'],
              icon: 'Code',
              permissions: ['storage'],
            },
            {
              id: 'theme-switcher',
              name: 'Theme Switcher',
              version: '1.0.0',
              description: 'Quickly switch between custom themes',
              author: BRAND.name,
              category: 'appearance',
              tags: ['theme', 'customization'],
              icon: 'Palette',
              permissions: ['storage'],
            },
            {
              id: 'export-pdf',
              name: 'PDF Export',
              version: '1.0.0',
              description: 'Export conversations and documents to PDF',
              author: BRAND.name,
              category: 'productivity',
              tags: ['export', 'pdf', 'documents'],
              icon: 'FileText',
              permissions: ['storage'],
            },
            {
              id: 'markdown-preview',
              name: 'Enhanced Markdown',
              version: '1.0.0',
              description: 'Enhanced markdown preview with syntax highlighting',
              author: BRAND.name,
              category: 'developer',
              tags: ['markdown', 'preview', 'syntax'],
              icon: 'FileType',
              permissions: ['storage'],
            },
            {
              id: 'voice-commands',
              name: 'Voice Commands',
              version: '1.0.0',
              description: 'Control the app with voice commands',
              author: BRAND.name,
              category: 'ai',
              tags: ['voice', 'accessibility', 'commands'],
              icon: 'Mic',
              permissions: ['api.ai'],
            },
          ]

          set({ availablePlugins: mockPlugins, marketplaceLoading: false })
        } catch (error) {
          console.error('[PluginStore] Marketplace fetch failed:', error)
          set({ marketplaceLoading: false })
        }
      },
    }),
    {
      name: 'alabobai-plugin-store',
      partialize: (state) => ({
        searchQuery: state.searchQuery,
        categoryFilter: state.categoryFilter
      })
    }
  )
)

// ============================================================================
// Hooks for Plugin Data
// ============================================================================

/**
 * Hook to get all installed plugins
 */
export function usePlugins(): PluginInstance[] {
  const [plugins, setPlugins] = useState<PluginInstance[]>([])

  useEffect(() => {
    // Initial load
    setPlugins(pluginManager.getAllPlugins())

    // Subscribe to changes
    const unsubscribe = pluginManager.subscribe(() => {
      setPlugins(pluginManager.getAllPlugins())
    })

    return unsubscribe
  }, [])

  return plugins
}

/**
 * Hook to get active plugins only
 */
export function useActivePlugins(): PluginInstance[] {
  const [plugins, setPlugins] = useState<PluginInstance[]>([])

  useEffect(() => {
    setPlugins(pluginManager.getActivePlugins())

    const unsubscribe = pluginManager.subscribe(() => {
      setPlugins(pluginManager.getActivePlugins())
    })

    return unsubscribe
  }, [])

  return plugins
}

/**
 * Hook to get a single plugin by ID
 */
export function usePlugin(pluginId: string): PluginInstance | undefined {
  const [plugin, setPlugin] = useState<PluginInstance | undefined>()

  useEffect(() => {
    setPlugin(pluginManager.getPlugin(pluginId))

    const unsubscribe = pluginManager.subscribe(() => {
      setPlugin(pluginManager.getPlugin(pluginId))
    })

    return unsubscribe
  }, [pluginId])

  return plugin
}

/**
 * Hook to check if a plugin is active
 */
export function usePluginActive(pluginId: string): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(pluginManager.isPluginActive(pluginId))

    const unsubscribe = pluginManager.subscribe(() => {
      setActive(pluginManager.isPluginActive(pluginId))
    })

    return unsubscribe
  }, [pluginId])

  return active
}

// ============================================================================
// Hooks for UI Extensions
// ============================================================================

/**
 * Hook to get sidebar items registered by plugins
 */
export function usePluginSidebarItems(): SidebarItem[] {
  const [items, setItems] = useState<SidebarItem[]>([])

  useEffect(() => {
    setItems(pluginManager.getSidebarItems())

    const unsubscribe = pluginManager.subscribe(() => {
      setItems(pluginManager.getSidebarItems())
    })

    return unsubscribe
  }, [])

  return items
}

/**
 * Hook to get toolbar buttons registered by plugins
 */
export function usePluginToolbarButtons(): ToolbarButton[] {
  const [buttons, setButtons] = useState<ToolbarButton[]>([])

  useEffect(() => {
    setButtons(pluginManager.getToolbarButtons())

    const unsubscribe = pluginManager.subscribe(() => {
      setButtons(pluginManager.getToolbarButtons())
    })

    return unsubscribe
  }, [])

  return buttons
}

/**
 * Hook to get panels registered by plugins
 */
export function usePluginPanels(): PanelDefinition[] {
  const [panels, setPanels] = useState<PanelDefinition[]>([])

  useEffect(() => {
    setPanels(pluginManager.getPanels())

    const unsubscribe = pluginManager.subscribe(() => {
      setPanels(pluginManager.getPanels())
    })

    return unsubscribe
  }, [])

  return panels
}

/**
 * Hook to get settings sections registered by plugins
 */
export function usePluginSettingsSections(): SettingsSection[] {
  const [sections, setSections] = useState<SettingsSection[]>([])

  useEffect(() => {
    setSections(pluginManager.getSettingsSections())

    const unsubscribe = pluginManager.subscribe(() => {
      setSections(pluginManager.getSettingsSections())
    })

    return unsubscribe
  }, [])

  return sections
}

/**
 * Hook to get active modals registered by plugins
 */
export function usePluginModals(): ModalDefinition[] {
  const [modals, setModals] = useState<ModalDefinition[]>([])

  useEffect(() => {
    setModals(pluginManager.getModals())

    const unsubscribe = pluginManager.subscribe(() => {
      setModals(pluginManager.getModals())
    })

    return unsubscribe
  }, [])

  return modals
}
