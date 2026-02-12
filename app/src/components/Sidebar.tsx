import { MessageSquare, Plus, FolderOpen, Settings, ChevronLeft, ChevronRight, Rocket, LayoutDashboard, Brain, Zap, Flame, Search, Shield, Wallet, Palette, Mic, BarChart3, ShieldCheck, Plug } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import AgentsPanel from './AgentsPanel'

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, chats, activeChat, setActiveChat, createChat, currentView, setView, toggleSettings } = useAppStore()

  if (!sidebarOpen) {
    return (
      <div className="w-14 morphic-glass border-r border-rose-gold-400/10 flex flex-col items-center py-4 bg-dark-400/95">
        {/* Collapsed Logo */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center mb-4 shadow-glow-sm">
          <span className="text-lg font-bold text-dark-500">A</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-rose-gold-400/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="morphic-divider w-8 my-3" />
        <button
          onClick={createChat}
          className="p-2 rounded-lg text-rose-gold-400 hover:bg-rose-gold-400/15 transition-colors shadow-glow-sm"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-72 morphic-glass border-r border-rose-gold-400/10 flex flex-col bg-dark-400/95">
      {/* Header with Prominent Logo */}
      <div className="p-4 flex items-center justify-between border-b border-rose-gold-400/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-sm animate-pulse-glow">
            <span className="text-lg font-bold text-dark-500">A</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide">Alabobai</h1>
            <p className="text-xs text-rose-gold-400/60">AI Agent Platform</p>
          </div>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-rose-gold-400/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={createChat}
          className="w-full morphic-glass border border-rose-gold-400/20 hover:border-rose-gold-400/40 hover:bg-rose-gold-400/10 flex items-center justify-center gap-2 py-2.5 rounded-xl text-rose-gold-400 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">New Chat</span>
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar px-3">
        <div className="text-xs font-medium text-rose-gold-400/50 uppercase tracking-wider px-2 py-2">
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
      <div className="border-t border-rose-gold-400/10 p-3">
        <div className="text-xs font-medium text-rose-gold-400/50 uppercase tracking-wider px-2 py-2">
          AI Workforce
        </div>
        <div className="space-y-1">
          <button
            onClick={() => setView('autonomous-agents')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'autonomous-agents'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Brain className={`w-4 h-4 ${currentView === 'autonomous-agents' ? 'animate-pulse' : ''}`} />
            <span className="text-sm">Autonomous Agents</span>
            <Zap className="w-3 h-3 ml-auto text-rose-gold-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={() => setView('self-annealing')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'self-annealing'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Flame className={`w-4 h-4 ${currentView === 'self-annealing' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Self-Annealing</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'self-annealing'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              AI+
            </span>
          </button>
          <button
            onClick={() => setView('deep-research')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'deep-research'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Search className={`w-4 h-4 ${currentView === 'deep-research' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Deep Research</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'deep-research'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={() => setView('privacy-fortress')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'privacy-fortress'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Shield className={`w-4 h-4 ${currentView === 'privacy-fortress' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Privacy Fortress</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'privacy-fortress'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={() => setView('financial-guardian')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'financial-guardian'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Wallet className={`w-4 h-4 ${currentView === 'financial-guardian' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Financial Guardian</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'financial-guardian'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={() => setView('creative-studio')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'creative-studio'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Palette className={`w-4 h-4 ${currentView === 'creative-studio' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Creative Studio</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'creative-studio'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={() => setView('data-analyst')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'data-analyst'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <BarChart3 className={`w-4 h-4 ${currentView === 'data-analyst' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Data Analyst</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'data-analyst'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={() => setView('voice-interface')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'voice-interface'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Mic className={`w-4 h-4 ${currentView === 'voice-interface' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Voice Interface</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'voice-interface'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={() => setView('trust-architect')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'trust-architect'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 ${currentView === 'trust-architect' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Trust Architect</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'trust-architect'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
        </div>
      </div>

      {/* Company Section */}
      <div className="border-t border-rose-gold-400/10 p-3">
        <div className="text-xs font-medium text-rose-gold-400/50 uppercase tracking-wider px-2 py-2">
          Your Company
        </div>
        <div className="space-y-1">
          <button
            onClick={() => setView('company-wizard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
              currentView === 'company-wizard'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Rocket className="w-4 h-4" />
            <span className="text-sm">Build Company</span>
          </button>
          <button
            onClick={() => setView('company-dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
              currentView === 'company-dashboard'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-sm">Dashboard</span>
          </button>
          <button
            onClick={() => setView('chat')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
              currentView === 'chat'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm">AI Chat</span>
          </button>
        </div>
      </div>

      {/* Projects Section */}
      <div className="border-t border-rose-gold-400/10 p-3">
        <div className="text-xs font-medium text-rose-gold-400/50 uppercase tracking-wider px-2 py-2">
          Projects
        </div>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90 transition-colors">
          <FolderOpen className="w-4 h-4" />
          <span className="text-sm">Browse Projects</span>
        </button>
      </div>

      {/* AI Agents Section */}
      <AgentsPanel />

      {/* System Section */}
      <div className="border-t border-rose-gold-400/10 p-3">
        <div className="text-xs font-medium text-rose-gold-400/50 uppercase tracking-wider px-2 py-2">
          System
        </div>
        <div className="space-y-1">
          <button
            onClick={() => setView('integration-hub')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              currentView === 'integration-hub'
                ? 'morphic-glass bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30 shadow-glow-sm'
                : 'text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90'
            }`}
          >
            <Plug className={`w-4 h-4 ${currentView === 'integration-hub' ? 'animate-pulse text-rose-gold-400' : ''}`} />
            <span className="text-sm">Integration Hub</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
              currentView === 'integration-hub'
                ? 'bg-rose-gold-400/30 text-rose-gold-300'
                : 'bg-rose-gold-400/20 text-rose-gold-400 opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              NEW
            </span>
          </button>
          <button
            onClick={toggleSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:bg-rose-gold-400/5 hover:text-rose-gold-400/90 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      </div>
    </div>
  )
}
