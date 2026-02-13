import { Suspense, lazy, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import WorkspacePanel from './components/WorkspacePanel'
import { useAppStore } from './stores/appStore'
import { aiService } from './services/ai'
import ViewErrorBoundary from './components/ViewErrorBoundary'

const CompanyWizard = lazy(() => import('./components/CompanyWizard'))
const CompanyDashboard = lazy(() => import('./components/CompanyDashboard'))
const AutonomousAgentView = lazy(() => import('./components/AutonomousAgentView'))
const SelfAnnealingAgentView = lazy(() => import('./components/SelfAnnealingAgentView'))
const DeepResearchView = lazy(() => import('./components/DeepResearchView'))
const PrivacyFortressView = lazy(() => import('./components/PrivacyFortressView'))
const FinancialGuardianView = lazy(() => import('./components/FinancialGuardianView'))
const CreativeStudioView = lazy(() => import('./components/CreativeStudioView'))
const VoiceInterfaceView = lazy(() => import('./components/VoiceInterfaceView'))
const DataAnalystView = lazy(() => import('./components/DataAnalystView'))
const TrustArchitectView = lazy(() => import('./components/TrustArchitectView'))
const IntegrationHubView = lazy(() => import('./components/IntegrationHubView'))
const LocalAIBrainView = lazy(() => import('./components/LocalAIBrainView'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))

function ViewLoading() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-black">
      <div className="text-white/60 text-sm">Loading view...</div>
    </div>
  )
}

function LazySettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <SettingsModal isOpen={isOpen} onClose={onClose} />
    </Suspense>
  )
}

function App() {
  const { workspaceOpen, currentView, settingsOpen, toggleSettings } = useAppStore()

  // Initialize AI service on mount
  useEffect(() => {
    aiService.initialize().catch(console.error)
  }, [])

  // Render Company Wizard (full screen)
  if (currentView === 'company-wizard') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<ViewLoading />}>
            <CompanyWizard />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Company Dashboard (full screen)
  if (currentView === 'company-dashboard') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <CompanyDashboard />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Autonomous Agents (full screen)
  if (currentView === 'autonomous-agents') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <AutonomousAgentView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Local AI Brain (full screen)
  if (currentView === 'local-ai-brain') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <ViewErrorBoundary title="Local AI Brain encountered an error">
            <Suspense fallback={<ViewLoading />}>
              <LocalAIBrainView />
            </Suspense>
          </ViewErrorBoundary>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Self-Annealing Agents (full screen)
  if (currentView === 'self-annealing') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <SelfAnnealingAgentView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Deep Research (full screen)
  if (currentView === 'deep-research') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <DeepResearchView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Privacy Fortress (full screen)
  if (currentView === 'privacy-fortress') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <PrivacyFortressView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Financial Guardian (full screen)
  if (currentView === 'financial-guardian') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <FinancialGuardianView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Creative Studio (full screen)
  if (currentView === 'creative-studio') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <CreativeStudioView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Voice Interface (full screen)
  if (currentView === 'voice-interface') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <VoiceInterfaceView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Data Analyst (full screen)
  if (currentView === 'data-analyst') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <DataAnalystView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Trust Architect (full screen)
  if (currentView === 'trust-architect') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <TrustArchitectView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Integration Hub (full screen)
  if (currentView === 'integration-hub') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoading />}>
            <IntegrationHubView />
          </Suspense>
        </div>
        <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Default: Chat view with workspace
  return (
    <div className="h-screen w-screen flex bg-black overflow-hidden">
      {/* Left Sidebar - Chat History & Projects */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex min-w-0">
        {/* Center - Chat Panel */}
        <div className={`flex-1 min-w-0 transition-all duration-300 ${workspaceOpen ? 'max-w-[50%]' : ''}`}>
          <ChatPanel />
        </div>

        {/* Right - Live Workspace Panel */}
        {workspaceOpen && (
          <div className="w-[50%] border-l border-white/10">
            <WorkspacePanel />
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <LazySettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
    </div>
  )
}

export default App
