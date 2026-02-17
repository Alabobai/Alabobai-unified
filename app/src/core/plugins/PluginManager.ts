/**
 * Plugin Manager
 *
 * Central manager for the Alabobai plugin system.
 * Handles plugin registration, lifecycle, settings, and communication.
 */

import type {
  PluginDefinition,
  PluginInstance,
  PluginState,
  PluginAPI,
  PluginManifest,
  PluginHooks,
  InstalledPlugin,
  PluginEventBus,
  EventHandler,
  AppEvent,
  SidebarItem,
  ToolbarButton,
  PanelDefinition,
  SettingsSection,
  ModalDefinition,
  AIMessage,
  AIChatOptions,
} from './types'
import { toast } from '@/stores/toastStore'

// ============================================================================
// Constants
// ============================================================================

const PLUGIN_STORAGE_PREFIX = 'alabobai-plugin-'
const INSTALLED_PLUGINS_KEY = 'alabobai-installed-plugins'

// ============================================================================
// Event Bus Implementation
// ============================================================================

class EventBus implements PluginEventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map()

  emit<T = unknown>(event: string, data?: T): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[PluginEventBus] Error in handler for event "${event}":`, error)
        }
      })
    }
  }

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EventHandler)
    return () => this.off(event, handler)
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrappedHandler = (data: T) => {
      handler(data)
      this.off(event, wrappedHandler)
    }
    return this.on(event, wrappedHandler)
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as EventHandler)
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  offAll(event: string): void {
    this.listeners.delete(event)
  }

  clear(): void {
    this.listeners.clear()
  }
}

// ============================================================================
// Plugin Manager Class
// ============================================================================

export class PluginManager {
  private static instance: PluginManager | null = null

  private plugins: Map<string, PluginInstance> = new Map()
  private eventBus: EventBus = new EventBus()
  private initialized = false

  // UI Extension Registries
  private sidebarItems: Map<string, SidebarItem> = new Map()
  private toolbarButtons: Map<string, ToolbarButton> = new Map()
  private panels: Map<string, PanelDefinition> = new Map()
  private settingsSections: Map<string, SettingsSection> = new Map()
  private modals: Map<string, ModalDefinition> = new Map()

  // Change listeners for React integration
  private changeListeners: Set<() => void> = new Set()

  private constructor() {}

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager()
    }
    return PluginManager.instance
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[PluginManager] Already initialized')
      return
    }

    console.log('[PluginManager] Initializing...')

    // Load installed plugins from storage
    await this.loadInstalledPlugins()

    this.initialized = true
    this.eventBus.emit('app.ready')
    console.log('[PluginManager] Initialized successfully')
  }

  private async loadInstalledPlugins(): Promise<void> {
    try {
      const stored = localStorage.getItem(INSTALLED_PLUGINS_KEY)
      if (!stored) return

      const installedPlugins: InstalledPlugin[] = JSON.parse(stored)

      for (const plugin of installedPlugins) {
        // Re-register built-in plugins
        if (plugin.enabled) {
          // Note: Built-in plugins will be registered by the app on startup
          console.log(`[PluginManager] Found installed plugin: ${plugin.id}`)
        }
      }
    } catch (error) {
      console.error('[PluginManager] Failed to load installed plugins:', error)
    }
  }

  // ============================================================================
  // Plugin Registration & Lifecycle
  // ============================================================================

  async register(definition: PluginDefinition): Promise<boolean> {
    const { manifest } = definition

    if (this.plugins.has(manifest.id)) {
      console.warn(`[PluginManager] Plugin ${manifest.id} already registered`)
      return false
    }

    console.log(`[PluginManager] Registering plugin: ${manifest.name} v${manifest.version}`)

    // Create plugin API
    const api = this.createPluginAPI(manifest)

    // Create plugin instance
    const instance: PluginInstance = {
      definition,
      state: 'registered',
      api,
      cleanupFns: [],
    }

    this.plugins.set(manifest.id, instance)

    // Call onInit hook
    try {
      await definition.hooks.onInit?.(api)
      instance.state = 'initialized'
    } catch (error) {
      console.error(`[PluginManager] Failed to initialize plugin ${manifest.id}:`, error)
      instance.state = 'error'
      return false
    }

    // Save to installed plugins
    this.saveInstalledPlugin(manifest, true)
    this.notifyChange()

    return true
  }

  async activate(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      console.error(`[PluginManager] Plugin ${pluginId} not found`)
      return false
    }

    if (instance.state === 'active') {
      console.warn(`[PluginManager] Plugin ${pluginId} already active`)
      return true
    }

    console.log(`[PluginManager] Activating plugin: ${pluginId}`)

    try {
      await instance.definition.hooks.onActivate?.(instance.api)
      instance.state = 'active'
      this.updateInstalledPlugin(pluginId, { enabled: true })
      this.eventBus.emit('plugin.activated', { pluginId })
      this.notifyChange()
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to activate plugin ${pluginId}:`, error)
      instance.state = 'error'
      return false
    }
  }

  async deactivate(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      console.error(`[PluginManager] Plugin ${pluginId} not found`)
      return false
    }

    if (instance.state !== 'active') {
      console.warn(`[PluginManager] Plugin ${pluginId} not active`)
      return true
    }

    console.log(`[PluginManager] Deactivating plugin: ${pluginId}`)

    try {
      // Run cleanup functions
      instance.cleanupFns.forEach(cleanup => {
        try {
          cleanup()
        } catch (error) {
          console.error(`[PluginManager] Cleanup error for ${pluginId}:`, error)
        }
      })
      instance.cleanupFns = []

      await instance.definition.hooks.onDeactivate?.(instance.api)
      instance.state = 'inactive'
      this.updateInstalledPlugin(pluginId, { enabled: false })
      this.eventBus.emit('plugin.deactivated', { pluginId })
      this.notifyChange()
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to deactivate plugin ${pluginId}:`, error)
      return false
    }
  }

  async uninstall(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      console.error(`[PluginManager] Plugin ${pluginId} not found`)
      return false
    }

    console.log(`[PluginManager] Uninstalling plugin: ${pluginId}`)

    // Deactivate first if active
    if (instance.state === 'active') {
      await this.deactivate(pluginId)
    }

    try {
      await instance.definition.hooks.onUninstall?.(instance.api)

      // Clear plugin storage
      await instance.api.storage.clear()

      // Remove from plugins map
      this.plugins.delete(pluginId)

      // Remove from installed plugins
      this.removeInstalledPlugin(pluginId)

      this.eventBus.emit('plugin.uninstalled', { pluginId })
      this.notifyChange()
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to uninstall plugin ${pluginId}:`, error)
      return false
    }
  }

  // ============================================================================
  // Plugin API Factory
  // ============================================================================

  private createPluginAPI(manifest: PluginManifest): PluginAPI {
    const pluginId = manifest.id

    return {
      manifest,

      storage: this.createStorageAPI(pluginId),
      ui: this.createUIAPI(pluginId),
      events: this.createEventsAPI(pluginId),
      notifications: this.createNotificationsAPI(pluginId),
      settings: this.createSettingsAPI(pluginId),
      ai: manifest.permissions?.includes('api.ai') ? this.createAIAPI() : undefined,
      utils: this.createUtilsAPI(),
    }
  }

  private createStorageAPI(pluginId: string) {
    const storageKey = `${PLUGIN_STORAGE_PREFIX}${pluginId}`

    const getStorage = (): Record<string, unknown> => {
      try {
        const stored = localStorage.getItem(storageKey)
        return stored ? JSON.parse(stored) : {}
      } catch {
        return {}
      }
    }

    const setStorage = (data: Record<string, unknown>): void => {
      localStorage.setItem(storageKey, JSON.stringify(data))
    }

    return {
      async get<T>(key: string): Promise<T | null> {
        const storage = getStorage()
        return (storage[key] as T) ?? null
      },
      async set<T>(key: string, value: T): Promise<void> {
        const storage = getStorage()
        storage[key] = value
        setStorage(storage)
      },
      async remove(key: string): Promise<void> {
        const storage = getStorage()
        delete storage[key]
        setStorage(storage)
      },
      async clear(): Promise<void> {
        localStorage.removeItem(storageKey)
      },
      async keys(): Promise<string[]> {
        const storage = getStorage()
        return Object.keys(storage)
      },
    }
  }

  private createUIAPI(pluginId: string) {
    const manager = this

    return {
      registerSidebarItem(item: SidebarItem): () => void {
        const fullId = `${pluginId}:${item.id}`
        manager.sidebarItems.set(fullId, { ...item, id: fullId })
        manager.notifyChange()

        const cleanup = () => {
          manager.sidebarItems.delete(fullId)
          manager.notifyChange()
        }

        const instance = manager.plugins.get(pluginId)
        if (instance) {
          instance.cleanupFns.push(cleanup)
        }

        return cleanup
      },

      registerToolbarButton(button: ToolbarButton): () => void {
        const fullId = `${pluginId}:${button.id}`
        manager.toolbarButtons.set(fullId, { ...button, id: fullId })
        manager.notifyChange()

        const cleanup = () => {
          manager.toolbarButtons.delete(fullId)
          manager.notifyChange()
        }

        const instance = manager.plugins.get(pluginId)
        if (instance) {
          instance.cleanupFns.push(cleanup)
        }

        return cleanup
      },

      registerPanel(panel: PanelDefinition): () => void {
        const fullId = `${pluginId}:${panel.id}`
        manager.panels.set(fullId, { ...panel, id: fullId })
        manager.notifyChange()

        const cleanup = () => {
          manager.panels.delete(fullId)
          manager.notifyChange()
        }

        const instance = manager.plugins.get(pluginId)
        if (instance) {
          instance.cleanupFns.push(cleanup)
        }

        return cleanup
      },

      registerSettingsSection(section: SettingsSection): () => void {
        const fullId = `${pluginId}:${section.id}`
        manager.settingsSections.set(fullId, { ...section, id: fullId })
        manager.notifyChange()

        const cleanup = () => {
          manager.settingsSections.delete(fullId)
          manager.notifyChange()
        }

        const instance = manager.plugins.get(pluginId)
        if (instance) {
          instance.cleanupFns.push(cleanup)
        }

        return cleanup
      },

      showModal(modal: ModalDefinition): () => void {
        const fullId = `${pluginId}:${modal.id}`
        manager.modals.set(fullId, { ...modal, id: fullId })
        manager.notifyChange()

        return () => manager.closeModal(fullId)
      },

      closeModal(id: string): void {
        const fullId = id.includes(':') ? id : `${pluginId}:${id}`
        manager.modals.delete(fullId)
        manager.notifyChange()
      },
    }
  }

  private createEventsAPI(pluginId: string) {
    const manager = this
    const pluginListeners: Array<() => void> = []

    return {
      on<T = unknown>(event: AppEvent, handler: EventHandler<T>): () => void {
        const unsubscribe = manager.eventBus.on(event, handler)
        pluginListeners.push(unsubscribe)
        return unsubscribe
      },

      once<T = unknown>(event: AppEvent, handler: EventHandler<T>): () => void {
        const unsubscribe = manager.eventBus.once(event, handler)
        pluginListeners.push(unsubscribe)
        return unsubscribe
      },

      emit<T = unknown>(event: string, data?: T): void {
        // Plugin events are namespaced
        manager.eventBus.emit(`plugin.${pluginId}.${event}`, data)
      },

      removeAllListeners(): void {
        pluginListeners.forEach(unsubscribe => unsubscribe())
        pluginListeners.length = 0
      },
    }
  }

  private createNotificationsAPI(_pluginId: string) {
    return {
      success(title: string, message?: string): void {
        toast.success(title, message)
      },
      error(title: string, message?: string): void {
        toast.error(title, message)
      },
      warning(title: string, message?: string): void {
        toast.warning(title, message)
      },
      info(title: string, message?: string): void {
        toast.info(title, message)
      },
    }
  }

  private createSettingsAPI(pluginId: string) {
    const manager = this

    const getSettings = (): Record<string, unknown> => {
      const installed = manager.getInstalledPlugin(pluginId)
      return installed?.settings ?? {}
    }

    const getDefaults = (): Record<string, unknown> => {
      const instance = manager.plugins.get(pluginId)
      const schema = instance?.definition.manifest.settingsSchema
      if (!schema) return {}

      const defaults: Record<string, unknown> = {}
      schema.sections.forEach(section => {
        section.fields.forEach(field => {
          if (field.defaultValue !== undefined) {
            defaults[field.id] = field.defaultValue
          }
        })
      })
      return defaults
    }

    return {
      getAll(): Record<string, unknown> {
        return { ...getDefaults(), ...getSettings() }
      },

      get<T>(key: string): T | undefined {
        const settings = this.getAll()
        return settings[key] as T | undefined
      },

      set<T>(key: string, value: T): void {
        const settings = getSettings()
        settings[key] = value
        manager.updateInstalledPlugin(pluginId, { settings })

        // Notify plugin of settings change
        const instance = manager.plugins.get(pluginId)
        if (instance) {
          instance.definition.hooks.onSettingsChange?.(settings, instance.api)
        }
      },

      reset(): void {
        manager.updateInstalledPlugin(pluginId, { settings: {} })
      },
    }
  }

  private createAIAPI() {
    // This would integrate with the actual AI service
    return {
      async chat(_messages: AIMessage[], _options?: AIChatOptions) {
        // Placeholder - would call actual AI service
        return {
          content: 'AI response placeholder',
          model: 'mock',
        }
      },

      async chatStream(
        _messages: AIMessage[],
        _onToken: (token: string) => void,
        _options?: AIChatOptions
      ) {
        // Placeholder - would call actual AI service with streaming
        return {
          content: 'AI response placeholder',
          model: 'mock',
        }
      },

      isAvailable(): boolean {
        return true // Would check actual AI service availability
      },
    }
  }

  private createUtilsAPI() {
    return {
      generateId(): string {
        return crypto.randomUUID()
      },

      formatDate(date: Date, format = 'YYYY-MM-DD'): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')

        return format
          .replace('YYYY', String(year))
          .replace('MM', month)
          .replace('DD', day)
          .replace('HH', hours)
          .replace('mm', minutes)
          .replace('ss', seconds)
      },

      deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj))
      },

      debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T {
        let timeoutId: ReturnType<typeof setTimeout>
        return ((...args: unknown[]) => {
          clearTimeout(timeoutId)
          timeoutId = setTimeout(() => fn(...args), delay)
        }) as T
      },

      throttle<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T {
        let lastCall = 0
        return ((...args: unknown[]) => {
          const now = Date.now()
          if (now - lastCall >= delay) {
            lastCall = now
            return fn(...args)
          }
        }) as T
      },
    }
  }

  // ============================================================================
  // Installed Plugin Storage
  // ============================================================================

  private getInstalledPlugins(): InstalledPlugin[] {
    try {
      const stored = localStorage.getItem(INSTALLED_PLUGINS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  private saveInstalledPlugins(plugins: InstalledPlugin[]): void {
    localStorage.setItem(INSTALLED_PLUGINS_KEY, JSON.stringify(plugins))
  }

  private getInstalledPlugin(pluginId: string): InstalledPlugin | undefined {
    return this.getInstalledPlugins().find(p => p.id === pluginId)
  }

  private saveInstalledPlugin(manifest: PluginManifest, enabled: boolean): void {
    const plugins = this.getInstalledPlugins()
    const existing = plugins.findIndex(p => p.id === manifest.id)

    const installedPlugin: InstalledPlugin = {
      id: manifest.id,
      manifest,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      enabled,
      settings: {},
      version: manifest.version,
    }

    if (existing >= 0) {
      plugins[existing] = { ...plugins[existing], ...installedPlugin }
    } else {
      plugins.push(installedPlugin)
    }

    this.saveInstalledPlugins(plugins)
  }

  private updateInstalledPlugin(pluginId: string, updates: Partial<InstalledPlugin>): void {
    const plugins = this.getInstalledPlugins()
    const index = plugins.findIndex(p => p.id === pluginId)

    if (index >= 0) {
      plugins[index] = {
        ...plugins[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      this.saveInstalledPlugins(plugins)
    }
  }

  private removeInstalledPlugin(pluginId: string): void {
    const plugins = this.getInstalledPlugins().filter(p => p.id !== pluginId)
    this.saveInstalledPlugins(plugins)
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  getPluginState(pluginId: string): PluginState | undefined {
    return this.plugins.get(pluginId)?.state
  }

  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  getActivePlugins(): PluginInstance[] {
    return this.getAllPlugins().filter(p => p.state === 'active')
  }

  isPluginActive(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.state === 'active'
  }

  // UI Extension Getters
  getSidebarItems(): SidebarItem[] {
    return Array.from(this.sidebarItems.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  getToolbarButtons(): ToolbarButton[] {
    return Array.from(this.toolbarButtons.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  getPanels(): PanelDefinition[] {
    return Array.from(this.panels.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  getSettingsSections(): SettingsSection[] {
    return Array.from(this.settingsSections.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  getModals(): ModalDefinition[] {
    return Array.from(this.modals.values())
  }

  closeModal(id: string): void {
    const modal = this.modals.get(id)
    if (modal) {
      modal.onClose?.()
      this.modals.delete(id)
      this.notifyChange()
    }
  }

  // Event Bus Access
  getEventBus(): PluginEventBus {
    return this.eventBus
  }

  // ============================================================================
  // Change Notifications
  // ============================================================================

  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private notifyChange(): void {
    this.changeListeners.forEach(listener => listener())
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async shutdown(): Promise<void> {
    console.log('[PluginManager] Shutting down...')

    // Deactivate all plugins
    for (const [pluginId, instance] of this.plugins) {
      if (instance.state === 'active') {
        await this.deactivate(pluginId)
      }
    }

    this.eventBus.emit('app.beforeUnload')
    this.eventBus.clear()
    this.plugins.clear()
    this.changeListeners.clear()

    console.log('[PluginManager] Shutdown complete')
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const pluginManager = PluginManager.getInstance()

export default pluginManager
