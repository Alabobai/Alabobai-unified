/**
 * Plugin System Types
 *
 * Defines all types and interfaces for the Alabobai plugin system.
 * This enables third-party developers to extend the platform functionality.
 */

// ============================================================================
// Plugin Manifest Types
// ============================================================================

/**
 * Plugin manifest - required metadata for every plugin
 */
export interface PluginManifest {
  /** Unique plugin identifier (e.g., 'com.alabobai.theme-plugin') */
  id: string
  /** Human-readable plugin name */
  name: string
  /** Semantic version (e.g., '1.0.0') */
  version: string
  /** Plugin author name or organization */
  author: string
  /** Short description of the plugin */
  description: string
  /** Detailed description for marketplace */
  longDescription?: string
  /** Plugin icon URL or data URI */
  icon?: string
  /** Plugin category for marketplace organization */
  category: PluginCategory
  /** Tags for search */
  tags?: string[]
  /** Plugin homepage URL */
  homepage?: string
  /** Support URL */
  support?: string
  /** License identifier (e.g., 'MIT', 'GPL-3.0') */
  license?: string
  /** Minimum app version required */
  minAppVersion?: string
  /** Required permissions */
  permissions?: PluginPermission[]
  /** Plugin dependencies */
  dependencies?: PluginDependency[]
  /** Settings schema for plugin configuration */
  settingsSchema?: PluginSettingsSchema
}

export type PluginCategory =
  | 'appearance'
  | 'productivity'
  | 'integration'
  | 'analytics'
  | 'security'
  | 'export'
  | 'backup'
  | 'ai'
  | 'developer'
  | 'other'

export type PluginPermission =
  | 'storage'        // Access to plugin-specific storage
  | 'notifications'  // Show toast notifications
  | 'ui.sidebar'     // Add sidebar items
  | 'ui.toolbar'     // Add toolbar buttons
  | 'ui.panels'      // Create custom panels
  | 'ui.settings'    // Add settings sections
  | 'events.chat'    // Subscribe to chat events
  | 'events.file'    // Subscribe to file events
  | 'events.task'    // Subscribe to task events
  | 'events.all'     // Subscribe to all events
  | 'api.ai'         // Access AI services
  | 'api.network'    // Make network requests
  | 'api.fs'         // File system access
  | 'api.clipboard'  // Clipboard access

export interface PluginDependency {
  /** Plugin ID of the dependency */
  pluginId: string
  /** Minimum required version */
  minVersion?: string
  /** Is this an optional dependency */
  optional?: boolean
}

// ============================================================================
// Plugin Settings Schema
// ============================================================================

export interface PluginSettingsSchema {
  /** Settings sections */
  sections: PluginSettingsSection[]
}

export interface PluginSettingsSection {
  /** Section ID */
  id: string
  /** Section title */
  title: string
  /** Section description */
  description?: string
  /** Settings fields */
  fields: PluginSettingsField[]
}

export type PluginSettingsField =
  | PluginTextField
  | PluginNumberField
  | PluginBooleanField
  | PluginSelectField
  | PluginColorField

interface BaseSettingsField {
  /** Field ID (used as key in settings object) */
  id: string
  /** Field label */
  label: string
  /** Field description/help text */
  description?: string
  /** Default value */
  defaultValue?: unknown
  /** Is this field required */
  required?: boolean
}

export interface PluginTextField extends BaseSettingsField {
  type: 'text'
  placeholder?: string
  minLength?: number
  maxLength?: number
  pattern?: string
  defaultValue?: string
}

export interface PluginNumberField extends BaseSettingsField {
  type: 'number'
  min?: number
  max?: number
  step?: number
  defaultValue?: number
}

export interface PluginBooleanField extends BaseSettingsField {
  type: 'boolean'
  defaultValue?: boolean
}

export interface PluginSelectField extends BaseSettingsField {
  type: 'select'
  options: { value: string; label: string }[]
  multiple?: boolean
  defaultValue?: string | string[]
}

export interface PluginColorField extends BaseSettingsField {
  type: 'color'
  defaultValue?: string
}

// ============================================================================
// Plugin Lifecycle Hooks
// ============================================================================

/**
 * Plugin lifecycle hooks - called by the PluginManager
 */
export interface PluginHooks {
  /**
   * Called when the plugin is first registered
   * Use this for one-time setup, resource loading, etc.
   */
  onInit?: (api: PluginAPI) => Promise<void> | void

  /**
   * Called when the plugin is activated (enabled)
   * Use this to register UI elements, event listeners, etc.
   */
  onActivate?: (api: PluginAPI) => Promise<void> | void

  /**
   * Called when the plugin is deactivated (disabled)
   * Use this to clean up UI elements, event listeners, etc.
   */
  onDeactivate?: (api: PluginAPI) => Promise<void> | void

  /**
   * Called when the plugin is being uninstalled
   * Use this for cleanup of stored data, etc.
   */
  onUninstall?: (api: PluginAPI) => Promise<void> | void

  /**
   * Called when plugin settings change
   */
  onSettingsChange?: (settings: Record<string, unknown>, api: PluginAPI) => void
}

// ============================================================================
// Plugin API
// ============================================================================

/**
 * API provided to plugins for interacting with the application
 */
export interface PluginAPI {
  /** Plugin manifest */
  manifest: PluginManifest

  // Storage
  storage: PluginStorageAPI

  // UI Extension Points
  ui: PluginUIAPI

  // Event System
  events: PluginEventsAPI

  // Notifications
  notifications: PluginNotificationsAPI

  // Settings
  settings: PluginSettingsAPI

  // AI Services (if permitted)
  ai?: PluginAIAPI

  // Utilities
  utils: PluginUtilsAPI
}

/**
 * Storage API for plugin-specific data
 */
export interface PluginStorageAPI {
  /** Get a value from storage */
  get<T>(key: string): Promise<T | null>
  /** Set a value in storage */
  set<T>(key: string, value: T): Promise<void>
  /** Remove a value from storage */
  remove(key: string): Promise<void>
  /** Clear all plugin storage */
  clear(): Promise<void>
  /** Get all keys */
  keys(): Promise<string[]>
}

/**
 * UI API for extending the application interface
 */
export interface PluginUIAPI {
  /** Register a sidebar item */
  registerSidebarItem(item: SidebarItem): () => void
  /** Register a toolbar button */
  registerToolbarButton(button: ToolbarButton): () => void
  /** Register a panel */
  registerPanel(panel: PanelDefinition): () => void
  /** Register a settings section */
  registerSettingsSection(section: SettingsSection): () => void
  /** Show a modal dialog */
  showModal(modal: ModalDefinition): () => void
  /** Close a modal by ID */
  closeModal(id: string): void
}

export interface SidebarItem {
  id: string
  icon: string | React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  onClick?: () => void
  view?: string
  order?: number
}

export interface ToolbarButton {
  id: string
  icon: string | React.ComponentType<{ className?: string }>
  label: string
  tooltip?: string
  onClick?: () => void
  disabled?: boolean
  order?: number
}

export interface PanelDefinition {
  id: string
  title: string
  icon?: string | React.ComponentType<{ className?: string }>
  position: 'left' | 'right' | 'bottom'
  render: () => React.ReactNode
  defaultOpen?: boolean
  order?: number
}

export interface SettingsSection {
  id: string
  title: string
  icon?: string | React.ComponentType<{ className?: string }>
  render: () => React.ReactNode
  order?: number
}

export interface ModalDefinition {
  id: string
  title: string
  content: React.ReactNode
  size?: 'small' | 'medium' | 'large' | 'fullscreen'
  closable?: boolean
  onClose?: () => void
}

/**
 * Events API for subscribing to application events
 */
export interface PluginEventsAPI {
  /** Subscribe to an event */
  on<T = unknown>(event: AppEvent, handler: EventHandler<T>): () => void
  /** Subscribe to an event once */
  once<T = unknown>(event: AppEvent, handler: EventHandler<T>): () => void
  /** Emit a plugin event (plugin-namespaced) */
  emit<T = unknown>(event: string, data?: T): void
  /** Remove all event listeners for this plugin */
  removeAllListeners(): void
}

export type AppEvent =
  | 'app.ready'
  | 'app.beforeUnload'
  | 'chat.created'
  | 'chat.deleted'
  | 'chat.switched'
  | 'message.sent'
  | 'message.received'
  | 'message.streaming'
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'settings.changed'
  | 'theme.changed'
  | 'view.changed'
  | string

export type EventHandler<T = unknown> = (data: T) => void

/**
 * Notifications API for showing toast messages
 */
export interface PluginNotificationsAPI {
  /** Show a success notification */
  success(title: string, message?: string): void
  /** Show an error notification */
  error(title: string, message?: string): void
  /** Show a warning notification */
  warning(title: string, message?: string): void
  /** Show an info notification */
  info(title: string, message?: string): void
}

/**
 * Settings API for plugin configuration
 */
export interface PluginSettingsAPI {
  /** Get all plugin settings */
  getAll(): Record<string, unknown>
  /** Get a specific setting */
  get<T>(key: string): T | undefined
  /** Set a specific setting */
  set<T>(key: string, value: T): void
  /** Reset settings to defaults */
  reset(): void
}

/**
 * AI API for accessing AI services
 */
export interface PluginAIAPI {
  /** Generate a chat completion */
  chat(messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse>
  /** Stream a chat completion */
  chatStream(
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions
  ): Promise<AIResponse>
  /** Check if AI is available */
  isAvailable(): boolean
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIChatOptions {
  temperature?: number
  maxTokens?: number
  model?: string
}

export interface AIResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Utility functions for plugins
 */
export interface PluginUtilsAPI {
  /** Generate a unique ID */
  generateId(): string
  /** Format a date */
  formatDate(date: Date, format?: string): string
  /** Deep clone an object */
  deepClone<T>(obj: T): T
  /** Debounce a function */
  debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
  ): T
  /** Throttle a function */
  throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
  ): T
}

// ============================================================================
// Plugin Instance Types
// ============================================================================

/**
 * Complete plugin definition - what plugin developers export
 */
export interface PluginDefinition {
  manifest: PluginManifest
  hooks: PluginHooks
}

/**
 * Plugin instance - internal representation of an installed plugin
 */
export interface PluginInstance {
  /** Plugin definition */
  definition: PluginDefinition
  /** Plugin state */
  state: PluginState
  /** Plugin API instance */
  api: PluginAPI
  /** Cleanup functions to call on deactivation */
  cleanupFns: Array<() => void>
}

export type PluginState =
  | 'registered'    // Plugin registered but not initialized
  | 'initialized'   // Plugin initialized (onInit called)
  | 'active'        // Plugin active (onActivate called)
  | 'inactive'      // Plugin deactivated (onDeactivate called)
  | 'error'         // Plugin in error state

/**
 * Serializable plugin data for storage
 */
export interface InstalledPlugin {
  /** Plugin ID */
  id: string
  /** Plugin manifest snapshot */
  manifest: PluginManifest
  /** Installation timestamp */
  installedAt: string
  /** Last updated timestamp */
  updatedAt: string
  /** Is plugin enabled */
  enabled: boolean
  /** Plugin settings */
  settings: Record<string, unknown>
  /** Plugin version at installation */
  version: string
}

// ============================================================================
// Plugin Event Bus Types
// ============================================================================

export interface PluginEventBus {
  /** Emit an event */
  emit<T = unknown>(event: string, data?: T): void
  /** Subscribe to an event */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void
  /** Subscribe to an event once */
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void
  /** Remove a specific handler */
  off<T = unknown>(event: string, handler: EventHandler<T>): void
  /** Remove all handlers for an event */
  offAll(event: string): void
}

// ============================================================================
// Plugin Registry Types
// ============================================================================

/**
 * Available plugin in marketplace
 */
export interface MarketplacePlugin {
  manifest: PluginManifest
  /** Downloads count */
  downloads: number
  /** Average rating (1-5) */
  rating: number
  /** Number of ratings */
  ratingCount: number
  /** Is this a featured plugin */
  featured?: boolean
  /** Screenshots URLs */
  screenshots?: string[]
  /** Changelog */
  changelog?: PluginChangelogEntry[]
  /** Published date */
  publishedAt: string
  /** Last updated date */
  updatedAt: string
}

export interface PluginChangelogEntry {
  version: string
  date: string
  changes: string[]
}

// ============================================================================
// Built-in Plugin Types
// ============================================================================

export interface ThemePluginSettings {
  theme: 'dark' | 'light' | 'system' | 'custom'
  customColors?: {
    primary: string
    secondary: string
    background: string
    surface: string
    text: string
    accent: string
  }
  fontFamily?: string
  fontSize?: 'small' | 'medium' | 'large'
  borderRadius?: 'none' | 'small' | 'medium' | 'large'
  animations?: boolean
}

export interface ExportPluginSettings {
  defaultFormat: 'pdf' | 'markdown' | 'html' | 'json'
  includeTimestamps: boolean
  includeMetadata: boolean
  styling: boolean
}

export interface AnalyticsPluginSettings {
  enabled: boolean
  trackMessages: boolean
  trackSessions: boolean
  trackFeatures: boolean
  retentionDays: number
}

export interface BackupPluginSettings {
  autoBackup: boolean
  backupInterval: 'hourly' | 'daily' | 'weekly'
  backupDestination: 'local' | 'cloud'
  cloudProvider?: 'google' | 'dropbox' | 'onedrive'
  maxBackups: number
  includeChats: boolean
  includeSettings: boolean
  includePluginData: boolean
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  PluginDefinition as Plugin,
}
