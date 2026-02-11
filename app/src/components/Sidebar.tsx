import { MessageSquare, Plus, FolderOpen, Settings, ChevronLeft, ChevronRight, Rocket, LayoutDashboard, Brain, Zap, Flame } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import AgentsPanel from './AgentsPanel'

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, chats, activeChat, setActiveChat, createChat, currentView, setView, toggleSettings } = useAppStore()

  if (!sidebarOpen) {
    return (
      <div className="w-12 bg-dark-300 border-r border-white/10 flex flex-col items-center py-4">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="morphic-divider w-8" />
        <button
          onClick={createChat}
          className="p-2 rounded-lg text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-72 bg-dark-300 border-r border-white/10 flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center">
            <span className="text-sm font-bold text-dark-500">C</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Alabobai</h1>
            <p className="text-xs text-white/40">AI Agent Platform</p>
          </div>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={createChat}
          className="w-full morphic-btn-ghost flex items-center justify-center gap-2 py-2.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar px-3">
        <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-2 py-2">
          Recent Chats
        </div>
        <div className="space-y-1">
          {chats.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">
              No chats yet. Start a new conversation!
            </div>
          ) : (
            chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  activeChat === chat.id
                    ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{chat.title}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Autonomous Agents Section */}
      <div className="border-t border-white/10 p-3">
        <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-2 py-2">
          AI Workforce
        </div>
        <div className="space-y-1">
          <button
            onClick={() => setView('autonomous-agents')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
              currentView === 'autonomous-agents'
                ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Brain className={`w-4 h-4 ${currentView === 'autonomous-agents' ? 'animate-pulse' : ''}`} />
            <span className="text-sm">Autonomous Agents</span>
            <Zap className="w-3 h-3 ml-auto text-rose-gold-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={() => setView('self-annealing')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
              currentView === 'self-annealing'
                ? 'bg-gradient-to-r from-rose-gold-400/20 to-orange-500/20 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Flame className={`w-4 h-4 ${currentView === 'self-annealing' ? 'animate-pulse text-orange-400' : ''}`} />
            <span className="text-sm">Self-Annealing</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'self-annealing'
                ? 'bg-orange-500/30 text-orange-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              AI+
            </span>
          </button>
        </div>
      </div>

      {/* Company Section */}
      <div className="border-t border-white/10 p-3">
        <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-2 py-2">
          Your Company
        </div>
        <div className="space-y-1">
          <button
            onClick={() => setView('company-wizard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              currentView === 'company-wizard'
                ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Rocket className="w-4 h-4" />
            <span className="text-sm">Build Company</span>
          </button>
          <button
            onClick={() => setView('company-dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              currentView === 'company-dashboard'
                ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-sm">Dashboard</span>
          </button>
          <button
            onClick={() => setView('chat')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              currentView === 'chat'
                ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm">AI Chat</span>
          </button>
        </div>
      </div>

      {/* Projects Section */}
      <div className="border-t border-white/10 p-3">
        <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-2 py-2">
          Projects
        </div>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition-colors">
          <FolderOpen className="w-4 h-4" />
          <span className="text-sm">Browse Projects</span>
        </button>
      </div>

      {/* AI Agents Section */}
      <AgentsPanel />

      {/* Footer */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={toggleSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">Settings</span>
        </button>
      </div>
    </div>
  )
}
