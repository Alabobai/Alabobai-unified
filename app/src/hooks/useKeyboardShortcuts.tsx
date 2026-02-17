import { useEffect, useCallback, useRef, useState, createContext, useContext, type ReactNode } from 'react'

// ============================================================================
// Types
// ============================================================================

export type ShortcutCategory = 'navigation' | 'actions' | 'editor' | 'general' | 'settings' | 'editing'

export interface ShortcutModifiers {
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ShortcutConfig {
  key: string
  modifiers: ShortcutModifiers
  description: string
  category: ShortcutCategory
}

export interface Shortcut extends ShortcutConfig {
  id: string
  action: () => void
}

// ============================================================================
// Default Shortcuts Configuration
// ============================================================================

export const DEFAULT_SHORTCUTS = {
  COMMAND_PALETTE: {
    key: 'k',
    modifiers: { meta: true },
    description: 'Open command palette',
    category: 'general' as const,
  },
  NEW_CHAT: {
    key: 'n',
    modifiers: { meta: true },
    description: 'New chat',
    category: 'actions' as const,
  },
  OPEN_SETTINGS: {
    key: ',',
    modifiers: { meta: true },
    description: 'Open settings',
    category: 'general' as const,
  },
  TOGGLE_PREVIEW: {
    key: 'p',
    modifiers: { meta: true, shift: true },
    description: 'Toggle preview',
    category: 'editor' as const,
  },
  TOGGLE_SIDEBAR: {
    key: 'b',
    modifiers: { meta: true },
    description: 'Toggle sidebar',
    category: 'navigation' as const,
  },
  TOGGLE_WORKSPACE: {
    key: '/',
    modifiers: { meta: true },
    description: 'Toggle workspace',
    category: 'editor' as const,
  },
  KEYBOARD_SHORTCUTS: {
    key: '/',
    modifiers: { meta: true, shift: true },
    description: 'Show keyboard shortcuts',
    category: 'general' as const,
  },
} as const

// View shortcuts (Cmd/Ctrl + 1-9)
export function getViewShortcut(index: number): { key: string; modifiers: ShortcutModifiers } {
  return {
    key: index.toString(),
    modifiers: { meta: true },
  }
}

// ============================================================================
// Shortcut Registry
// ============================================================================

interface ShortcutRegistry {
  shortcuts: Map<string, Shortcut>
  enabled: boolean
}

const registry: ShortcutRegistry = {
  shortcuts: new Map(),
  enabled: true,
}

function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const key = event.key.toLowerCase()
  const mods = shortcut.modifiers

  // Support both Ctrl and Cmd (Meta) for cross-platform
  const cmdOrCtrl = mods.meta || mods.ctrl
  const eventCmdOrCtrl = event.metaKey || event.ctrlKey

  if (cmdOrCtrl && !eventCmdOrCtrl) return false
  if (!cmdOrCtrl && eventCmdOrCtrl) return false
  if (mods.shift && !event.shiftKey) return false
  if (!mods.shift && event.shiftKey) return false
  if (mods.alt && !event.altKey) return false
  if (!mods.alt && event.altKey) return false
  if (shortcut.key.toLowerCase() !== key) return false

  return true
}

export function registerShortcut(shortcut: Shortcut): () => void {
  registry.shortcuts.set(shortcut.id, shortcut)
  return () => {
    registry.shortcuts.delete(shortcut.id)
  }
}

export function unregisterShortcut(id: string): void {
  registry.shortcuts.delete(id)
}

export function setShortcutsEnabled(enabled: boolean): void {
  registry.enabled = enabled
}

export function getAllShortcuts(): Shortcut[] {
  return Array.from(registry.shortcuts.values())
}

// ============================================================================
// Format Shortcut for Display
// ============================================================================

export function formatShortcut(shortcut: ShortcutConfig): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const parts: string[] = []

  if (shortcut.modifiers.meta || shortcut.modifiers.ctrl) {
    parts.push(isMac ? '⌘' : 'Ctrl')
  }
  if (shortcut.modifiers.shift) parts.push(isMac ? '⇧' : 'Shift')
  if (shortcut.modifiers.alt) parts.push(isMac ? '⌥' : 'Alt')

  const keyMap: Record<string, string> = {
    'arrowup': '↑',
    'arrowdown': '↓',
    'arrowleft': '←',
    'arrowright': '→',
    'enter': '↵',
    'escape': 'Esc',
    'backspace': '⌫',
    'delete': 'Del',
    'tab': 'Tab',
    ' ': 'Space',
    '/': '/',
    ',': ',',
  }
  const displayKey = keyMap[shortcut.key.toLowerCase()] || shortcut.key.toUpperCase()
  parts.push(displayKey)

  return parts.join(isMac ? '' : '+')
}

// Alias for compatibility
export const formatShortcutDisplay = formatShortcut

// Format shortcut for screen readers
export function formatShortcutForScreen(shortcut: ShortcutConfig): string {
  const parts: string[] = []

  if (shortcut.modifiers.meta || shortcut.modifiers.ctrl) {
    parts.push('Command or Control')
  }
  if (shortcut.modifiers.shift) parts.push('Shift')
  if (shortcut.modifiers.alt) parts.push('Alt or Option')

  const keyMap: Record<string, string> = {
    'arrowup': 'Up Arrow',
    'arrowdown': 'Down Arrow',
    'arrowleft': 'Left Arrow',
    'arrowright': 'Right Arrow',
    'enter': 'Enter',
    'escape': 'Escape',
    'backspace': 'Backspace',
    'delete': 'Delete',
    'tab': 'Tab',
    ' ': 'Space',
    '/': 'Slash',
    ',': 'Comma',
  }
  const displayKey = keyMap[shortcut.key.toLowerCase()] || shortcut.key.toUpperCase()
  parts.push(displayKey)

  return parts.join(' plus ')
}

// Get shortcuts organized by category
export function getShortcutsByCategory(): Record<ShortcutCategory, Shortcut[]> {
  const result: Record<ShortcutCategory, Shortcut[]> = {
    navigation: [],
    actions: [],
    editor: [],
    general: [],
    settings: [],
    editing: [],
  }

  for (const shortcut of registry.shortcuts.values()) {
    if (result[shortcut.category]) {
      result[shortcut.category].push(shortcut)
    }
  }

  return result
}

// ============================================================================
// useKeyboardShortcuts Hook
// ============================================================================

export function useKeyboardShortcuts(shortcuts: Shortcut[], deps: unknown[] = []): void {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const cleanups = shortcutsRef.current.map(s => registerShortcut(s))
    return () => cleanups.forEach(cleanup => cleanup())
  }, deps)
}

// ============================================================================
// Global Keyboard Handler
// ============================================================================

export function useGlobalKeyboardHandler(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!registry.enabled) return

      const target = event.target as HTMLElement
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable

      for (const shortcut of registry.shortcuts.values()) {
        if (matchesShortcut(event, shortcut)) {
          // Allow shortcuts in inputs for command palette (Cmd+K)
          if (isInput && shortcut.id !== 'command-palette') continue

          event.preventDefault()
          event.stopPropagation()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])
}

// ============================================================================
// Keyboard Shortcut Context
// ============================================================================

interface KeyboardShortcutContextValue {
  isCommandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void
  isShortcutsModalOpen: boolean
  openShortcutsModal: () => void
  closeShortcutsModal: () => void
  announceToScreenReader: (message: string) => void
  getShortcutsByCategory: () => Record<ShortcutCategory, Shortcut[]>
}

const KeyboardShortcutContext = createContext<KeyboardShortcutContextValue | null>(null)

export function KeyboardShortcutProvider({ children }: { children: ReactNode }) {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)

  const openCommandPalette = useCallback(() => setIsCommandPaletteOpen(true), [])
  const closeCommandPalette = useCallback(() => setIsCommandPaletteOpen(false), [])
  const toggleCommandPalette = useCallback(() => setIsCommandPaletteOpen(prev => !prev), [])
  const openShortcutsModal = useCallback(() => setIsShortcutsModalOpen(true), [])
  const closeShortcutsModal = useCallback(() => setIsShortcutsModalOpen(false), [])

  // Screen reader announcements
  const announceToScreenReader = useCallback((message: string) => {
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', 'polite')
    announcement.setAttribute('aria-atomic', 'true')
    announcement.className = 'sr-only'
    announcement.textContent = message
    document.body.appendChild(announcement)
    setTimeout(() => announcement.remove(), 1000)
  }, [])

  return (
    <KeyboardShortcutContext.Provider
      value={{
        isCommandPaletteOpen,
        openCommandPalette,
        closeCommandPalette,
        toggleCommandPalette,
        isShortcutsModalOpen,
        openShortcutsModal,
        closeShortcutsModal,
        announceToScreenReader,
        getShortcutsByCategory,
      }}
    >
      {children}
    </KeyboardShortcutContext.Provider>
  )
}

export function useKeyboardShortcutContext(): KeyboardShortcutContextValue {
  const context = useContext(KeyboardShortcutContext)
  if (!context) {
    return {
      isCommandPaletteOpen: false,
      openCommandPalette: () => {},
      closeCommandPalette: () => {},
      toggleCommandPalette: () => {},
      isShortcutsModalOpen: false,
      openShortcutsModal: () => {},
      closeShortcutsModal: () => {},
      announceToScreenReader: () => {},
      getShortcutsByCategory,
    }
  }
  return context
}

// ============================================================================
// Focus Trap Hook
// ============================================================================

interface FocusTrapOptions {
  enabled?: boolean
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {}
): void {
  const { enabled = true, initialFocusRef } = options

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus initial element on mount
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus()
    } else {
      firstElement.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [containerRef, enabled, initialFocusRef])
}

// ============================================================================
// Reduced Motion Hook
// ============================================================================

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function handleChange(event: MediaQueryListEvent) {
      setReducedMotion(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return reducedMotion
}
