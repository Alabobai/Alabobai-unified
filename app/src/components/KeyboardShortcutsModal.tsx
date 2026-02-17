import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Keyboard, Navigation, Zap, Settings, Edit3, Command } from 'lucide-react'
import {
  useKeyboardShortcutContext,
  formatShortcutDisplay,
  formatShortcutForScreen,
  useFocusTrap,
  useReducedMotion,
  ShortcutCategory
} from '@/hooks/useKeyboardShortcuts'

// ============================================================================
// Category Display Config
// ============================================================================

const CATEGORY_CONFIG: Record<ShortcutCategory, { label: string; icon: React.ReactNode; description: string }> = {
  navigation: {
    label: 'Navigation',
    icon: <Navigation className="w-4 h-4" />,
    description: 'Move around the application'
  },
  actions: {
    label: 'Actions',
    icon: <Zap className="w-4 h-4" />,
    description: 'Perform common tasks'
  },
  editor: {
    label: 'Editor',
    icon: <Edit3 className="w-4 h-4" />,
    description: 'Editor and workspace controls'
  },
  settings: {
    label: 'Settings',
    icon: <Settings className="w-4 h-4" />,
    description: 'Configure the application'
  },
  editing: {
    label: 'Editing',
    icon: <Edit3 className="w-4 h-4" />,
    description: 'Edit and modify content'
  },
  general: {
    label: 'General',
    icon: <Command className="w-4 h-4" />,
    description: 'General shortcuts'
  }
}

const CATEGORY_ORDER: ShortcutCategory[] = ['navigation', 'actions', 'editor', 'editing', 'settings', 'general']

// ============================================================================
// Keyboard Shortcuts Modal
// ============================================================================

export default function KeyboardShortcutsModal() {
  const { isShortcutsModalOpen, closeShortcutsModal, getShortcutsByCategory } = useKeyboardShortcutContext()
  const reducedMotion = useReducedMotion()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ShortcutCategory | 'all'>('all')

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus trap
  useFocusTrap(containerRef, {
    enabled: isShortcutsModalOpen,
    initialFocusRef: searchInputRef
  })

  // Get all shortcuts grouped by category
  const shortcutsByCategory = useMemo(() => {
    return getShortcutsByCategory()
  }, [getShortcutsByCategory])

  // Filter shortcuts by search query
  const filteredShortcuts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const result: Record<ShortcutCategory, typeof shortcutsByCategory.navigation> = {
      navigation: [],
      actions: [],
      editor: [],
      settings: [],
      editing: [],
      general: []
    }

    for (const category of CATEGORY_ORDER) {
      if (activeCategory !== 'all' && activeCategory !== category) continue

      for (const shortcut of shortcutsByCategory[category]) {
        if (!query) {
          result[category].push(shortcut)
        } else {
          const descriptionMatch = shortcut.description.toLowerCase().includes(query)
          const keyMatch = shortcut.key.toLowerCase().includes(query)
          const categoryMatch = category.toLowerCase().includes(query)

          if (descriptionMatch || keyMatch || categoryMatch) {
            result[category].push(shortcut)
          }
        }
      }
    }

    return result
  }, [shortcutsByCategory, searchQuery, activeCategory])

  // Check if any shortcuts exist
  const hasShortcuts = useMemo(() => {
    return CATEGORY_ORDER.some(cat => filteredShortcuts[cat].length > 0)
  }, [filteredShortcuts])

  // Count total shortcuts
  const totalCount = useMemo(() => {
    return CATEGORY_ORDER.reduce((sum, cat) => sum + shortcutsByCategory[cat].length, 0)
  }, [shortcutsByCategory])

  if (!isShortcutsModalOpen) return null

  // Detect platform for display
  const isMac = navigator.platform.toLowerCase().includes('mac')

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
          reducedMotion ? '' : 'animate-fade-in'
        }`}
        onClick={closeShortcutsModal}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={containerRef}
        className={`relative w-full max-w-2xl max-h-[85vh] bg-dark-300 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col ${
          reducedMotion ? '' : 'animate-scale-in'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-gold-400/20 flex items-center justify-center">
              <Keyboard className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="text-lg font-semibold text-white">
                Keyboard Shortcuts
              </h2>
              <p className="text-xs text-white/50">
                {totalCount} shortcuts available
              </p>
            </div>
          </div>
          <button
            onClick={closeShortcutsModal}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-rose-gold-400"
            aria-label="Close keyboard shortcuts modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 py-4 border-b border-white/10 space-y-4 flex-shrink-0">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="w-full pl-10 pr-4 py-2.5 bg-dark-400 border border-white/10 rounded-xl text-white placeholder-white/40 outline-none focus:border-rose-gold-400/50 focus:ring-2 focus:ring-rose-gold-400/20"
              aria-label="Search keyboard shortcuts"
            />
          </div>

          {/* Category filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-rose-gold-400 ${
                activeCategory === 'all'
                  ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                  : 'bg-dark-400 text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              All
            </button>
            {CATEGORY_ORDER.map(category => {
              const config = CATEGORY_CONFIG[category]
              const count = shortcutsByCategory[category].length
              if (count === 0) return null

              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-rose-gold-400 ${
                    activeCategory === category
                      ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                      : 'bg-dark-400 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {config.icon}
                  <span>{config.label}</span>
                  <span className="text-xs opacity-60">({count})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="flex-1 overflow-y-auto morphic-scrollbar px-6 py-4">
          {!hasShortcuts ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/50 text-lg">No shortcuts found</p>
              <p className="text-white/30 text-sm mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-6">
              {CATEGORY_ORDER.map(category => {
                const shortcuts = filteredShortcuts[category]
                if (shortcuts.length === 0) return null

                const config = CATEGORY_CONFIG[category]

                return (
                  <div key={category}>
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-rose-gold-400">{config.icon}</span>
                      <h3 className="text-sm font-medium text-rose-gold-400 uppercase tracking-wider">
                        {config.label}
                      </h3>
                      <span className="text-xs text-white/30">({shortcuts.length})</span>
                    </div>

                    {/* Shortcuts grid */}
                    <div className="grid gap-2">
                      {shortcuts.map(shortcut => (
                        <div
                          key={shortcut.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-dark-400 border border-white/5 hover:border-white/10 transition-colors group"
                        >
                          <span className="text-white/80 group-hover:text-white transition-colors">
                            {shortcut.description}
                          </span>
                          <kbd
                            className="flex items-center gap-1 px-3 py-1.5 bg-dark-300 rounded-lg border border-white/10 text-sm font-mono text-rose-gold-400"
                            aria-label={formatShortcutForScreen(shortcut)}
                          >
                            {formatShortcutDisplay(shortcut)}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-dark-400/50 flex-shrink-0">
          <div className="text-xs text-white/40">
            {isMac ? (
              <span>\u2318 = Command, \u2325 = Option, \u21E7 = Shift, \u2303 = Control</span>
            ) : (
              <span>Ctrl = Control, Alt = Alt, Shift = Shift</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-white/40">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 bg-dark-400 rounded border border-white/10">Esc</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
