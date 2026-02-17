import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Search,
  MessageSquare,
  Settings,
  Brain,
  Flame,
  Shield,
  Wallet,
  Palette,
  Mic,
  BarChart3,
  ShieldCheck,
  Plug,
  Cpu,
  LayoutDashboard,
  Rocket,
  PanelRight,
  ChevronRight,
  Command,
  Keyboard,
  Plus,
  Eye,
  Code2,
  Moon,
  Sun
} from 'lucide-react'
import {
  useKeyboardShortcutContext,
  useFocusTrap,
  useReducedMotion
} from '@/hooks/useKeyboardShortcuts'
import { useAppStore } from '@/stores/appStore'

// ============================================================================
// Types
// ============================================================================

interface CommandItem {
  id: string
  name: string
  description?: string
  icon: React.ReactNode
  category: 'navigation' | 'actions' | 'settings' | 'recent'
  shortcut?: string
  action: () => void
  keywords?: string[]
}

// ============================================================================
// Fuzzy Search
// ============================================================================

function fuzzyMatch(query: string, text: string): { matches: boolean; score: number } {
  if (!query) return { matches: true, score: 0 }

  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  // Exact match gets highest score
  if (textLower === queryLower) {
    return { matches: true, score: 100 }
  }

  // Starts with gets high score
  if (textLower.startsWith(queryLower)) {
    return { matches: true, score: 90 }
  }

  // Contains gets medium score
  if (textLower.includes(queryLower)) {
    return { matches: true, score: 70 }
  }

  // Fuzzy character matching
  let queryIndex = 0
  let consecutiveMatches = 0
  let maxConsecutive = 0
  let score = 0

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++
      consecutiveMatches++
      score += consecutiveMatches * 10 // Reward consecutive matches
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches)
    } else {
      consecutiveMatches = 0
    }
  }

  if (queryIndex === queryLower.length) {
    // Bonus for shorter strings (more relevant)
    score += (20 - Math.min(textLower.length, 20))
    return { matches: true, score }
  }

  return { matches: false, score: 0 }
}

// ============================================================================
// Recent Commands Storage
// ============================================================================

const RECENT_COMMANDS_KEY = 'alabobai-recent-commands'
const MAX_RECENT_COMMANDS = 5

function getRecentCommands(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addRecentCommand(id: string): void {
  try {
    const recent = getRecentCommands().filter(r => r !== id)
    recent.unshift(id)
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_COMMANDS)))
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Command Palette Component
// ============================================================================

export default function CommandPalette() {
  const { isCommandPaletteOpen, closeCommandPalette, openShortcutsModal } = useKeyboardShortcutContext()
  const { setView, toggleSidebar, toggleWorkspace, toggleSettings, createChat, setActiveTab, workspaceOpen } = useAppStore()
  const reducedMotion = useReducedMotion()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentCommandIds] = useState(() => getRecentCommands())

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus trap
  useFocusTrap(containerRef, { enabled: isCommandPaletteOpen })

  // Build commands list
  const allCommands = useMemo((): CommandItem[] => {
    const primaryModifier = navigator.platform.toLowerCase().includes('mac') ? '\u2318' : 'Ctrl+'

    const commands: CommandItem[] = [
      // Navigation
      {
        id: 'nav-chat',
        name: 'AI Chat',
        description: 'Open AI chat interface',
        icon: <MessageSquare className="w-4 h-4" />,
        category: 'navigation',
        action: () => setView('chat'),
        keywords: ['message', 'conversation', 'talk']
      },
      {
        id: 'nav-local-ai',
        name: 'Local AI Brain',
        description: 'Local AI processing with Ollama',
        icon: <Cpu className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}1`,
        action: () => setView('local-ai-brain'),
        keywords: ['ollama', 'local', 'offline']
      },
      {
        id: 'nav-autonomous',
        name: 'Autonomous Agents',
        description: 'Multi-agent AI system',
        icon: <Brain className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}2`,
        action: () => setView('autonomous-agents'),
        keywords: ['agent', 'multi', 'auto']
      },
      {
        id: 'nav-self-annealing',
        name: 'Self-Annealing Agents',
        description: 'Self-improving AI agents',
        icon: <Flame className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}3`,
        action: () => setView('self-annealing'),
        keywords: ['improve', 'learn', 'optimize']
      },
      {
        id: 'nav-deep-research',
        name: 'Deep Research',
        description: 'In-depth research assistant',
        icon: <Search className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}4`,
        action: () => setView('deep-research'),
        keywords: ['search', 'analyze', 'investigate']
      },
      {
        id: 'nav-privacy',
        name: 'Privacy Fortress',
        description: 'Privacy and security tools',
        icon: <Shield className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}5`,
        action: () => setView('privacy-fortress'),
        keywords: ['security', 'protect', 'encrypt']
      },
      {
        id: 'nav-financial',
        name: 'Financial Guardian',
        description: 'Financial analysis and tracking',
        icon: <Wallet className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}6`,
        action: () => setView('financial-guardian'),
        keywords: ['money', 'budget', 'finance']
      },
      {
        id: 'nav-creative',
        name: 'Creative Studio',
        description: 'Creative content generation',
        icon: <Palette className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}7`,
        action: () => setView('creative-studio'),
        keywords: ['design', 'art', 'create']
      },
      {
        id: 'nav-data',
        name: 'Data Analyst',
        description: 'Data analysis and visualization',
        icon: <BarChart3 className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}8`,
        action: () => setView('data-analyst'),
        keywords: ['analytics', 'chart', 'statistics']
      },
      {
        id: 'nav-voice',
        name: 'Voice Interface',
        description: 'Voice-controlled AI assistant',
        icon: <Mic className="w-4 h-4" />,
        category: 'navigation',
        shortcut: `${primaryModifier}9`,
        action: () => setView('voice-interface'),
        keywords: ['speak', 'talk', 'audio']
      },
      {
        id: 'nav-trust',
        name: 'Trust Architect',
        description: 'Trust and verification system',
        icon: <ShieldCheck className="w-4 h-4" />,
        category: 'navigation',
        action: () => setView('trust-architect'),
        keywords: ['verify', 'trust', 'auth']
      },
      {
        id: 'nav-integration',
        name: 'Integration Hub',
        description: 'Connect external services',
        icon: <Plug className="w-4 h-4" />,
        category: 'navigation',
        action: () => setView('integration-hub'),
        keywords: ['connect', 'api', 'plugin']
      },
      {
        id: 'nav-wizard',
        name: 'Build Company',
        description: 'Company setup wizard',
        icon: <Rocket className="w-4 h-4" />,
        category: 'navigation',
        action: () => setView('company-wizard'),
        keywords: ['setup', 'company', 'business']
      },
      {
        id: 'nav-dashboard',
        name: 'Dashboard',
        description: 'Company dashboard overview',
        icon: <LayoutDashboard className="w-4 h-4" />,
        category: 'navigation',
        action: () => setView('company-dashboard'),
        keywords: ['overview', 'home', 'main']
      },

      // Actions
      {
        id: 'action-new-chat',
        name: 'New Chat',
        description: 'Start a new conversation',
        icon: <Plus className="w-4 h-4" />,
        category: 'actions',
        shortcut: `${primaryModifier}N`,
        action: () => createChat(),
        keywords: ['create', 'start', 'begin']
      },
      {
        id: 'action-toggle-sidebar',
        name: 'Toggle Sidebar',
        description: 'Show or hide the sidebar',
        icon: <PanelRight className="w-4 h-4" />,
        category: 'actions',
        shortcut: `${primaryModifier}B`,
        action: () => toggleSidebar(),
        keywords: ['hide', 'show', 'panel']
      },
      {
        id: 'action-toggle-workspace',
        name: 'Toggle Workspace',
        description: 'Show or hide the workspace panel',
        icon: <Code2 className="w-4 h-4" />,
        category: 'actions',
        shortcut: `${primaryModifier}/`,
        action: () => toggleWorkspace(),
        keywords: ['hide', 'show', 'code', 'preview']
      },
      {
        id: 'action-view-preview',
        name: 'View Preview',
        description: 'Open live preview panel',
        icon: <Eye className="w-4 h-4" />,
        category: 'actions',
        shortcut: `${primaryModifier}\u21E7P`,
        action: () => {
          if (!workspaceOpen) toggleWorkspace()
          setActiveTab('preview')
        },
        keywords: ['live', 'render', 'display']
      },
      {
        id: 'action-view-code',
        name: 'View Code',
        description: 'Open code editor panel',
        icon: <Code2 className="w-4 h-4" />,
        category: 'actions',
        action: () => {
          if (!workspaceOpen) toggleWorkspace()
          setActiveTab('code')
        },
        keywords: ['editor', 'source']
      },

      // Settings
      {
        id: 'settings-open',
        name: 'Open Settings',
        description: 'Configure application settings',
        icon: <Settings className="w-4 h-4" />,
        category: 'settings',
        shortcut: `${primaryModifier},`,
        action: () => toggleSettings(),
        keywords: ['preferences', 'configure', 'options']
      },
      {
        id: 'settings-shortcuts',
        name: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        icon: <Keyboard className="w-4 h-4" />,
        category: 'settings',
        shortcut: `${primaryModifier}\u21E7/`,
        action: () => openShortcutsModal(),
        keywords: ['keys', 'hotkeys', 'bindings']
      },
      {
        id: 'settings-theme-dark',
        name: 'Switch to Dark Mode',
        description: 'Apply dark theme',
        icon: <Moon className="w-4 h-4" />,
        category: 'settings',
        action: () => {
          document.documentElement.classList.remove('light')
          document.documentElement.classList.add('dark')
        },
        keywords: ['night', 'dark', 'theme']
      },
      {
        id: 'settings-theme-light',
        name: 'Switch to Light Mode',
        description: 'Apply light theme',
        icon: <Sun className="w-4 h-4" />,
        category: 'settings',
        action: () => {
          document.documentElement.classList.remove('dark')
          document.documentElement.classList.add('light')
        },
        keywords: ['day', 'light', 'theme']
      }
    ]

    return commands
  }, [setView, toggleSidebar, toggleWorkspace, toggleSettings, createChat, setActiveTab, openShortcutsModal, workspaceOpen])

  // Filter and sort commands
  const filteredCommands = useMemo(() => {
    const results: Array<CommandItem & { score: number; isRecent: boolean }> = []

    for (const command of allCommands) {
      // Check name
      const nameMatch = fuzzyMatch(query, command.name)
      // Check description
      const descMatch = command.description ? fuzzyMatch(query, command.description) : { matches: false, score: 0 }
      // Check keywords
      const keywordMatches = (command.keywords || []).map(kw => fuzzyMatch(query, kw))
      const bestKeywordMatch = keywordMatches.reduce((best, match) => match.score > best.score ? match : best, { matches: false, score: 0 })

      if (nameMatch.matches || descMatch.matches || bestKeywordMatch.matches) {
        const score = Math.max(nameMatch.score, descMatch.score * 0.8, bestKeywordMatch.score * 0.9)
        const isRecent = recentCommandIds.includes(command.id)
        results.push({
          ...command,
          score: score + (isRecent ? 50 : 0), // Boost recent commands
          isRecent
        })
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score)

    return results
  }, [allCommands, query, recentCommandIds])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, typeof filteredCommands> = {
      recent: [],
      navigation: [],
      actions: [],
      settings: []
    }

    for (const command of filteredCommands) {
      if (command.isRecent && !query) {
        groups.recent.push(command)
      } else {
        groups[command.category].push(command)
      }
    }

    return groups
  }, [filteredCommands, query])

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    return [
      ...groupedCommands.recent,
      ...groupedCommands.navigation,
      ...groupedCommands.actions,
      ...groupedCommands.settings
    ]
  }, [groupedCommands])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isCommandPaletteOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Execute command
  const executeCommand = useCallback((command: CommandItem) => {
    addRecentCommand(command.id)
    closeCommandPalette()
    // Execute after palette closes
    setTimeout(() => command.action(), 50)
  }, [closeCommandPalette])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, flatCommands.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (flatCommands[selectedIndex]) {
          executeCommand(flatCommands[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        closeCommandPalette()
        break
    }
  }, [flatCommands, selectedIndex, executeCommand, closeCommandPalette])

  if (!isCommandPaletteOpen) return null

  // Render category section
  const renderCategory = (category: string, commands: typeof filteredCommands, label: string) => {
    if (commands.length === 0) return null

    return (
      <div className="px-2 py-1" key={category}>
        <div className="px-2 py-1.5 text-xs font-medium text-rose-gold-400/60 uppercase tracking-wider">
          {label}
        </div>
        {commands.map((command) => {
          const globalIndex = flatCommands.indexOf(command)
          return (
            <button
              key={command.id}
              data-index={globalIndex}
              onClick={() => executeCommand(command)}
              onMouseEnter={() => setSelectedIndex(globalIndex)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 framer-btn group ${
                selectedIndex === globalIndex
                  ? 'bg-rose-gold-400/15 text-rose-gold-400'
                  : 'text-white/80 hover:bg-white/5'
              }`}
              role="option"
              aria-selected={selectedIndex === globalIndex}
            >
              <span className={`flex-shrink-0 ${selectedIndex === globalIndex ? 'text-rose-gold-400' : 'text-white/50'}`}>
                {command.icon}
              </span>
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium truncate">{command.name}</div>
                {command.description && (
                  <div className="text-xs text-white/40 truncate">{command.description}</div>
                )}
              </div>
              {command.shortcut && (
                <kbd className="flex-shrink-0 px-2 py-1 text-xs font-mono bg-dark-400 rounded border border-white/10 text-white/50">
                  {command.shortcut}
                </kbd>
              )}
              <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-opacity ${
                selectedIndex === globalIndex ? 'opacity-100 text-rose-gold-400' : 'opacity-0'
              }`} />
            </button>
          )
        })}
      </div>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] command-palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm command-palette-backdrop ${
          reducedMotion ? '' : 'animate-fade-in'
        }`}
        onClick={closeCommandPalette}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        ref={containerRef}
        className={`relative w-full max-w-xl glass-premium command-palette-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden ${
          reducedMotion ? '' : 'animate-scale-in'
        }`}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <Search className="w-5 h-5 text-rose-gold-400/60" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-base"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={flatCommands[selectedIndex]?.id}
            aria-autocomplete="list"
          />
          <kbd className="px-2 py-1 text-xs font-mono bg-dark-400/80 rounded border border-white/10 text-white/50">
            Esc
          </kbd>
        </div>

        {/* Commands list */}
        <div
          ref={listRef}
          id="command-list"
          className="max-h-[400px] overflow-y-auto morphic-scrollbar py-2"
          role="listbox"
          aria-label="Commands"
        >
          {flatCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/50">
              No commands found for "{query}"
            </div>
          ) : (
            <>
              {renderCategory('recent', groupedCommands.recent, 'Recent')}
              {renderCategory('navigation', groupedCommands.navigation, 'Navigation')}
              {renderCategory('actions', groupedCommands.actions, 'Actions')}
              {renderCategory('settings', groupedCommands.settings, 'Settings')}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 text-xs text-white/40">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-dark-400 rounded border border-white/10">\u2191</kbd>
              <kbd className="px-1.5 py-0.5 bg-dark-400 rounded border border-white/10">\u2193</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-dark-400 rounded border border-white/10">\u21B5</kbd>
              <span className="ml-1">Select</span>
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>Command Palette</span>
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
