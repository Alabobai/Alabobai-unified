import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import WorkspacePanel from './components/WorkspacePanel'
import CompanyWizard from './components/CompanyWizard'
import CompanyDashboard from './components/CompanyDashboard'
import AutonomousAgentView from './components/AutonomousAgentView'
import SelfAnnealingAgentView from './components/SelfAnnealingAgentView'
import DeepResearchView from './components/DeepResearchView'
import PrivacyFortressView from './components/PrivacyFortressView'
import FinancialGuardianView from './components/FinancialGuardianView'
import CreativeStudioView from './components/CreativeStudioView'
import VoiceInterfaceView from './components/VoiceInterfaceView'
import DataAnalystView from './components/DataAnalystView'
import TrustArchitectView from './components/TrustArchitectView'
import IntegrationHubView from './components/IntegrationHubView'
import SettingsModal from './components/SettingsModal'
import { useAppStore } from './stores/appStore'
import { aiService } from './services/ai'

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
          <CompanyWizard />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Company Dashboard (full screen)
  if (currentView === 'company-dashboard') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <CompanyDashboard />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Autonomous Agents (full screen)
  if (currentView === 'autonomous-agents') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <AutonomousAgentView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Self-Annealing Agents (full screen)
  if (currentView === 'self-annealing') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <SelfAnnealingAgentView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Deep Research (full screen)
  if (currentView === 'deep-research') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <DeepResearchView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Privacy Fortress (full screen)
  if (currentView === 'privacy-fortress') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <PrivacyFortressView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Financial Guardian (full screen)
  if (currentView === 'financial-guardian') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <FinancialGuardianView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Creative Studio (full screen)
  if (currentView === 'creative-studio') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <CreativeStudioView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Voice Interface (full screen)
  if (currentView === 'voice-interface') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <VoiceInterfaceView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Data Analyst (full screen)
  if (currentView === 'data-analyst') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <DataAnalystView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Trust Architect (full screen)
  if (currentView === 'trust-architect') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <TrustArchitectView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
      </div>
    )
  }

  // Render Integration Hub (full screen)
  if (currentView === 'integration-hub') {
    return (
      <div className="h-screen w-screen flex bg-black overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <IntegrationHubView />
        </div>
        <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
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
      <SettingsModal isOpen={settingsOpen} onClose={toggleSettings} />
    </div>
  )
}

export default App
