/**
 * AppShell Component
 *
 * Provides the main application shell with:
 * - Keyboard shortcut registration
 * - Command palette integration
 * - Accessibility features (skip links, focus management)
 * - Global shortcut handlers
 */

import { Suspense, lazy, useEffect, useCallback, useRef } from 'react'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import WorkspacePanel from './WorkspacePanel'
import { useAppStore } from '@/stores/appStore'
// presence simulation disabled for production single-user UX
import { aiService } from '@/services/ai'
import ViewErrorBoundary from './ViewErrorBoundary'
import { ToastContainer } from './Toast'
import { toast } from '@/stores/toastStore'
import { useOnboardingStore, useShouldShowOnboarding } from '@/stores/onboardingStore'
import SkipToContent from './SkipToContent'
import CommandPalette from './CommandPalette'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import { BrandMark } from './BrandIdentity'
import { BRAND } from '@/config/brand'
// NotificationCenter is now included in the Sidebar component
import {
  useKeyboardShortcutContext,
  useKeyboardShortcuts,
  DEFAULT_SHORTCUTS,
  getViewShortcut
} from '@/hooks/useKeyboardShortcuts'

// Lazy-loaded views
const OnboardingModal = lazy(() => import('./OnboardingModal'))
const HomeView = lazy(() => import('./HomeView'))
const CompanyWizard = lazy(() => import('./CompanyWizard'))
const CompanyDashboard = lazy(() => import('./CompanyDashboard'))
const AutonomousAgentView = lazy(() => import('./AutonomousAgentView'))
const CommandCenterView = lazy(() => import('./CommandCenterView'))
const SelfAnnealingAgentView = lazy(() => import('./SelfAnnealingAgentView'))
const DeepResearchView = lazy(() => import('./DeepResearchView'))
const PrivacyFortressView = lazy(() => import('./PrivacyFortressView'))
const FinancialGuardianView = lazy(() => import('./FinancialGuardianView'))
const CreativeStudioView = lazy(() => import('./CreativeStudioView'))
const VoiceInterfaceView = lazy(() => import('./VoiceInterfaceView'))
const DataAnalystView = lazy(() => import('./DataAnalystView'))
const TrustArchitectView = lazy(() => import('./TrustArchitectView'))
const IntegrationHubView = lazy(() => import('./IntegrationHubView'))
const LocalAIBrainView = lazy(() => import('./LocalAIBrainView'))
const MemoryDashboard = lazy(() => import('./MemoryDashboard'))
const SettingsModal = lazy(() => import('./SettingsModal'))

// ============================================================================
// Loading Component
// ============================================================================

function ViewLoading() {
  return (
    <div
      className="h-full w-full flex items-center justify-center"
      role="status"
      aria-label="Loading content"
    >
      <div className="flex flex-col items-center gap-4">
        <BrandMark size="lg" className="animate-pulse" />
        <div className="text-rose-gold-400/60 text-sm">Loading...</div>
      </div>
    </div>
  )
}

// ============================================================================
// Lazy Modal Wrappers
// ============================================================================

function LazySettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <SettingsModal isOpen={isOpen} onClose={onClose} />
    </Suspense>
  )
}

function LazyOnboardingModal() {
  return (
    <Suspense fallback={null}>
      <OnboardingModal />
    </Suspense>
  )
}

// ============================================================================
// View Mapping
// ============================================================================

type AppView = 'home' | 'chat' | 'company-wizard' | 'company-dashboard' | 'autonomous-agents' |
               'command-center' | 'local-ai-brain' | 'self-annealing' | 'deep-research' | 'privacy-fortress' |
               'financial-guardian' | 'creative-studio' | 'data-analyst' | 'voice-interface' |
               'trust-architect' | 'integration-hub' | 'memory-dashboard'

const VIEW_COMPONENTS: Record<string, { component: React.LazyExoticComponent<React.ComponentType<object>>; title: string }> = {
  'home': { component: HomeView, title: 'Home Dashboard' },
  'company-wizard': { component: CompanyWizard, title: 'Company Wizard' },
  'company-dashboard': { component: CompanyDashboard, title: 'Company Dashboard' },
  'autonomous-agents': { component: AutonomousAgentView, title: 'Autonomous Agents' },
  'command-center': { component: CommandCenterView, title: 'Command Center' },
  'local-ai-brain': { component: LocalAIBrainView, title: 'Local AI Brain' },
  'self-annealing': { component: SelfAnnealingAgentView, title: 'Self-Annealing Agents' },
  'deep-research': { component: DeepResearchView, title: 'Deep Research' },
  'privacy-fortress': { component: PrivacyFortressView, title: 'Privacy Fortress' },
  'financial-guardian': { component: FinancialGuardianView, title: 'Financial Guardian' },
  'creative-studio': { component: CreativeStudioView, title: 'Creative Studio' },
  'voice-interface': { component: VoiceInterfaceView, title: 'Voice Interface' },
  'data-analyst': { component: DataAnalystView, title: 'Data Analyst' },
  'trust-architect': { component: TrustArchitectView, title: 'Trust Architect' },
  'integration-hub': { component: IntegrationHubView, title: 'Integration Hub' },
  'memory-dashboard': { component: MemoryDashboard, title: 'Memory Dashboard' }
}

const VIEW_ORDER: AppView[] = [
  'home',
  'local-ai-brain',
  'autonomous-agents',
  'command-center',
  'self-annealing',
  'deep-research',
  'privacy-fortress',
  'financial-guardian',
  'creative-studio',
  'data-analyst',
  'voice-interface'
]

// ============================================================================
// Main App Shell Component
// ============================================================================

export default function AppShell() {
  const {
    workspaceOpen,
    currentView,
    settingsOpen,
    toggleSettings,
    toggleSidebar,
    toggleWorkspace,
    createChat,
    setView,
    setActiveTab
  } = useAppStore()

  const { openOnboarding, isOnboardingOpen } = useOnboardingStore()
  const shouldShowOnboarding = useShouldShowOnboarding()
  // collaborator presence intentionally disabled
  const {
    toggleCommandPalette,
    openShortcutsModal,
    announceToScreenReader
  } = useKeyboardShortcutContext()

  // Ref for the app shell container
  const appShellRef = useRef<HTMLDivElement>(null)

  // presence simulation removed for focused production UX

  // ============================================================================
  // Shortcut Handlers
  // ============================================================================

  const handleNewChat = useCallback(() => {
    createChat()
    setView('chat')
    announceToScreenReader('New chat created')
  }, [createChat, setView, announceToScreenReader])

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar()
    announceToScreenReader('Sidebar toggled')
  }, [toggleSidebar, announceToScreenReader])

  const handleToggleWorkspace = useCallback(() => {
    toggleWorkspace()
    announceToScreenReader('Workspace panel toggled')
  }, [toggleWorkspace, announceToScreenReader])

  const handleTogglePreview = useCallback(() => {
    if (!workspaceOpen) {
      toggleWorkspace()
    }
    setActiveTab('preview')
    announceToScreenReader('Preview panel opened')
  }, [workspaceOpen, toggleWorkspace, setActiveTab, announceToScreenReader])

  const handleOpenSettings = useCallback(() => {
    toggleSettings()
    announceToScreenReader('Settings opened')
  }, [toggleSettings, announceToScreenReader])

  const handleViewSwitch = useCallback((index: number) => {
    if (index >= 0 && index < VIEW_ORDER.length) {
      const view = VIEW_ORDER[index]
      setView(view)
      announceToScreenReader(`Switched to ${VIEW_COMPONENTS[view]?.title || view}`)
    }
  }, [setView, announceToScreenReader])

  // ============================================================================
  // Register Global Shortcuts
  // ============================================================================

  useKeyboardShortcuts([
    // Command Palette
    {
      id: 'command-palette',
      key: DEFAULT_SHORTCUTS.COMMAND_PALETTE.key,
      modifiers: DEFAULT_SHORTCUTS.COMMAND_PALETTE.modifiers,
      description: DEFAULT_SHORTCUTS.COMMAND_PALETTE.description,
      category: DEFAULT_SHORTCUTS.COMMAND_PALETTE.category,
      action: toggleCommandPalette
    },
    // New Chat
    {
      id: 'new-chat',
      key: DEFAULT_SHORTCUTS.NEW_CHAT.key,
      modifiers: DEFAULT_SHORTCUTS.NEW_CHAT.modifiers,
      description: DEFAULT_SHORTCUTS.NEW_CHAT.description,
      category: DEFAULT_SHORTCUTS.NEW_CHAT.category,
      action: handleNewChat
    },
    // Open Settings
    {
      id: 'open-settings',
      key: DEFAULT_SHORTCUTS.OPEN_SETTINGS.key,
      modifiers: DEFAULT_SHORTCUTS.OPEN_SETTINGS.modifiers,
      description: DEFAULT_SHORTCUTS.OPEN_SETTINGS.description,
      category: DEFAULT_SHORTCUTS.OPEN_SETTINGS.category,
      action: handleOpenSettings
    },
    // Toggle Preview
    {
      id: 'toggle-preview',
      key: DEFAULT_SHORTCUTS.TOGGLE_PREVIEW.key,
      modifiers: DEFAULT_SHORTCUTS.TOGGLE_PREVIEW.modifiers,
      description: DEFAULT_SHORTCUTS.TOGGLE_PREVIEW.description,
      category: DEFAULT_SHORTCUTS.TOGGLE_PREVIEW.category,
      action: handleTogglePreview
    },
    // Toggle Sidebar
    {
      id: 'toggle-sidebar',
      key: DEFAULT_SHORTCUTS.TOGGLE_SIDEBAR.key,
      modifiers: DEFAULT_SHORTCUTS.TOGGLE_SIDEBAR.modifiers,
      description: DEFAULT_SHORTCUTS.TOGGLE_SIDEBAR.description,
      category: DEFAULT_SHORTCUTS.TOGGLE_SIDEBAR.category,
      action: handleToggleSidebar
    },
    // Toggle Workspace
    {
      id: 'toggle-workspace',
      key: DEFAULT_SHORTCUTS.TOGGLE_WORKSPACE.key,
      modifiers: DEFAULT_SHORTCUTS.TOGGLE_WORKSPACE.modifiers,
      description: DEFAULT_SHORTCUTS.TOGGLE_WORKSPACE.description,
      category: DEFAULT_SHORTCUTS.TOGGLE_WORKSPACE.category,
      action: handleToggleWorkspace
    },
    // Show Keyboard Shortcuts
    {
      id: 'show-shortcuts',
      key: DEFAULT_SHORTCUTS.KEYBOARD_SHORTCUTS.key,
      modifiers: DEFAULT_SHORTCUTS.KEYBOARD_SHORTCUTS.modifiers,
      description: DEFAULT_SHORTCUTS.KEYBOARD_SHORTCUTS.description,
      category: DEFAULT_SHORTCUTS.KEYBOARD_SHORTCUTS.category,
      action: openShortcutsModal
    },
    // View switches (1-9)
    ...VIEW_ORDER.map((view, index) => ({
      id: `view-switch-${index + 1}`,
      key: getViewShortcut(index + 1).key,
      modifiers: getViewShortcut(index + 1).modifiers,
      description: `Switch to ${VIEW_COMPONENTS[view]?.title || view}`,
      category: 'navigation' as const,
      action: () => handleViewSwitch(index)
    }))
  ], [
    toggleCommandPalette,
    handleNewChat,
    handleOpenSettings,
    handleTogglePreview,
    handleToggleSidebar,
    handleToggleWorkspace,
    openShortcutsModal,
    handleViewSwitch
  ])

  // ============================================================================
  // Initialize AI Service
  // ============================================================================

  useEffect(() => {
    aiService.initialize().catch((error) => {
      console.error('Failed to initialize AI service:', error)
      toast.warning(
        'AI Service Unavailable',
        'Using offline mode. Some features may be limited.'
      )
    })
  }, [])

  // ============================================================================
  // Show Onboarding for First-time Users
  // ============================================================================

  useEffect(() => {
    // Keep onboarding non-blocking; users can start it from Home when ready.
    // This preserves immediate scrolling/clicking access to the platform.
  }, [])

  // ============================================================================
  // Render View Content
  // ============================================================================

  const renderViewContent = () => {
    const viewConfig = VIEW_COMPONENTS[currentView]

    if (viewConfig) {
      const ViewComponent = viewConfig.component
      return (
        <ViewErrorBoundary title={`${viewConfig.title} encountered an error`}>
          <Suspense fallback={<ViewLoading />}>
            <ViewComponent />
          </Suspense>
        </ViewErrorBoundary>
      )
    }

    // Default chat view
    return (
      <div className="flex-1 flex min-w-0">
        <div
          className={`flex-1 min-w-0 transition-all duration-300 ${workspaceOpen ? 'max-w-[50%]' : ''}`}
        >
          <ViewErrorBoundary title="Chat Panel encountered an error">
            <ChatPanel />
          </ViewErrorBoundary>
        </div>

        {workspaceOpen && (
          <div
            className="w-[50%] border-l border-white/10"
            role="complementary"
            aria-label="Workspace panel"
          >
            <ViewErrorBoundary title="Workspace Panel encountered an error">
              <WorkspacePanel />
            </ViewErrorBoundary>
          </div>
        )}
      </div>
    )
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  const isFullScreenView = currentView !== 'chat'

  return (
    <>
      {/* Skip to main content link for keyboard users */}
      <SkipToContent />

      <div
        ref={appShellRef}
        className="h-screen w-screen flex app-background alabobai-shell premium-type"
        role="application"
        aria-label={BRAND.product}
      >
        {/* Navigation Sidebar */}
        <nav aria-label="Main navigation">
          <Sidebar />
        </nav>

        {/* Main Content Area */}
        <main
          id="main-content"
          className={`flex-1 min-w-0 w-full ${isFullScreenView ? 'overflow-auto' : 'flex'}`}
          tabIndex={-1}
          role="main"
          aria-label={VIEW_COMPONENTS[currentView]?.title || 'Chat'}
        >
          {renderViewContent()}
        </main>

        {/* Settings Modal */}
        <LazySettingsModal
          isOpen={settingsOpen}
          onClose={toggleSettings}
        />

        {/* Toast Notifications */}
        <ToastContainer />

        {/* Onboarding Modal */}
        {isOnboardingOpen && <LazyOnboardingModal />}

        {/* Command Palette */}
        <CommandPalette />

        {/* Keyboard Shortcuts Modal */}
        <KeyboardShortcutsModal />
      </div>
    </>
  )
}
