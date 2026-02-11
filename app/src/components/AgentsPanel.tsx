import { useState } from 'react'
import {
  Search, Brain, Code2, Shield, Lock, Fingerprint,
  Monitor, Mic, Plug, RefreshCw, Palette, BarChart3,
  Cloud, ChevronRight, Activity, Wallet
} from 'lucide-react'
import { DEPARTMENT_AGENTS, type Agent } from '@/services/orchestrator'
import { useAppStore } from '@/stores/appStore'

const agentIcons: Record<string, typeof Brain> = {
  'deep-research': Search,
  'code-builder': Code2,
  'financial-guardian': Wallet,
  'privacy-fortress': Lock,
  'trust-architect': Fingerprint,
  'computer-control': Monitor,
  'voice-interface': Mic,
  'integration-hub': Plug,
  'reliability-engine': RefreshCw,
  'creative-studio': Palette,
  'data-analyst': BarChart3,
  'deployment-ops': Cloud,
}

interface AgentsPanelProps {
  onSelectAgent?: (agent: Agent) => void
}

export default function AgentsPanel({ onSelectAgent }: AgentsPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const setView = useAppStore(state => state.setView)

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent.id)
    onSelectAgent?.(agent)

    // Navigate to Deep Research view if that agent is selected
    if (agent.id === 'deep-research') {
      setView('deep-research')
    }

    // Navigate to Privacy Fortress view if that agent is selected
    if (agent.id === 'privacy-fortress') {
      setView('privacy-fortress')
    }

    // Navigate to Financial Guardian view if that agent is selected
    if (agent.id === 'financial-guardian') {
      setView('financial-guardian')
    }
  }

  return (
    <div className="border-t border-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" />
          <span>AI Agents</span>
        </div>
        <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="px-2 pb-3 space-y-1 max-h-64 overflow-y-auto morphic-scrollbar">
          {DEPARTMENT_AGENTS.map(agent => {
            const Icon = agentIcons[agent.id] || Brain
            const isSelected = selectedAgent === agent.id
            const isWorking = agent.status === 'working'

            return (
              <button
                key={agent.id}
                onClick={() => handleAgentClick(agent)}
                className={`agent-item w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className={`relative ${isWorking ? 'animate-pulse' : ''}`}>
                  <Icon className="w-4 h-4" />
                  {isWorking && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-rose-gold-400 rounded-full animate-ping" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{agent.name}</div>
                  <div className="text-[10px] text-white/40 truncate">{agent.description}</div>
                </div>
                {agent.status === 'working' && (
                  <Activity className="w-3 h-3 text-rose-gold-400 animate-pulse" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
