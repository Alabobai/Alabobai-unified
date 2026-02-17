/**
 * Memory Dashboard Component
 *
 * Visualizes and manages the persistent memory system:
 * - View stored memories with search
 * - User preferences and privacy controls
 * - Memory statistics
 * - Manual memory management (edit, delete, export)
 * - Settings for memory features
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Search, Trash2, RefreshCw, Download, Upload,
  Database, Settings, Zap, ChevronDown, ChevronRight,
  Clock, Star, Eye, FileText, Lightbulb, Target, Edit3,
  Lock, Globe, Users, Shield, AlertTriangle, X, Check
} from 'lucide-react'
import { useMemory, useMemorySearch } from '../hooks/useMemory'
import type {
  Memory,
  MemoryType,
  MemorySettings,
  PrivacySetting,
} from '../services/memory'
import { BRAND } from '@/config/brand'

// ============================================================================
// Types
// ============================================================================

type TabType = 'memories' | 'stats' | 'settings'

interface MemoryCardProps {
  memory: Memory
  onDelete: (id: string) => void
  onView: (memory: Memory) => void
  onEdit: (memory: Memory) => void
}

// ============================================================================
// Sub-Components
// ============================================================================

function MemoryTypeIcon({ type }: { type: MemoryType }) {
  const icons: Record<MemoryType, typeof Brain> = {
    project_context: FileText,
    user_preference: Settings,
    fact: Lightbulb,
    decision: Target,
    code_pattern: Zap,
    conversation_summary: Brain,
    knowledge: Database,
    error_resolution: RefreshCw
  }
  const Icon = icons[type] || Brain
  return <Icon className="w-4 h-4" />
}

function PrivacyIcon({ privacy }: { privacy: PrivacySetting }) {
  const icons: Record<PrivacySetting, typeof Lock> = {
    private: Lock,
    shared: Users,
    public: Globe,
  }
  const Icon = icons[privacy] || Lock
  return <Icon className="w-3 h-3" />
}

function MemoryCard({ memory, onDelete, onView, onEdit }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false)

  const typeColors: Record<MemoryType, string> = {
    project_context: 'bg-rose-gold-400/20 text-rose-gold-300',
    user_preference: 'bg-rose-gold-400/25 text-rose-gold-300',
    fact: 'bg-rose-gold-400/30 text-rose-gold-300',
    decision: 'bg-rose-gold-400/20 text-rose-gold-400',
    code_pattern: 'bg-rose-gold-400/15 text-rose-gold-300',
    conversation_summary: 'bg-rose-gold-400/20 text-rose-gold-300',
    knowledge: 'bg-rose-gold-400/25 text-rose-gold-400',
    error_resolution: 'bg-rose-gold-500/20 text-rose-gold-300'
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-rose-gold-400/30 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${typeColors[memory.type]}`}>
          <MemoryTypeIcon type={memory.type} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[memory.type]}`}>
              {memory.type.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-white/40 flex items-center gap-1">
              <Star className="w-3 h-3" />
              {memory.importance}
            </span>
            <span className="text-xs text-white/40 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {memory.accessCount}
            </span>
            <span className="text-xs text-white/40 flex items-center gap-1">
              <PrivacyIcon privacy={memory.privacy} />
              {memory.privacy}
            </span>
          </div>

          <p className={`text-sm text-white/80 ${expanded ? '' : 'line-clamp-2'}`}>
            {memory.content}
          </p>

          {memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {memory.tags.slice(0, expanded ? undefined : 5).map(tag => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-white/50"
                >
                  {tag}
                </span>
              ))}
              {!expanded && memory.tags.length > 5 && (
                <span className="text-xs text-white/40">+{memory.tags.length - 5}</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(memory.createdAt).toLocaleDateString()}
            </span>
            {memory.decayedImportance !== undefined && memory.decayedImportance !== memory.importance && (
              <span className="text-white/30">
                (decayed: {Math.round(memory.decayedImportance)})
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onView(memory)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"
            title="View details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(memory)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"
            title="Edit"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(memory.id)}
            className="p-1.5 rounded-lg bg-rose-gold-500/10 hover:bg-rose-gold-500/20 text-rose-gold-300"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string
  value: string | number
  icon: typeof Brain
  color: string
}) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-white/40">{label}</p>
    </div>
  )
}

function SettingsPanel({
  settings,
  onUpdate,
  isLoading
}: {
  settings: MemorySettings | null
  onUpdate: (settings: Partial<MemorySettings>) => void
  isLoading: boolean
}) {
  if (!settings) {
    return (
      <div className="text-center py-12">
        <Settings className="w-12 h-12 text-white/20 mx-auto mb-3" />
        <p className="text-white/40">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Memory Enabled */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-rose-gold-300" />
            </div>
            <div>
              <p className="font-medium text-white">Memory System</p>
              <p className="text-xs text-white/50">Enable or disable the memory system entirely</p>
            </div>
          </div>
          <button
            onClick={() => onUpdate({ memoryEnabled: !settings.memoryEnabled })}
            disabled={isLoading}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.memoryEnabled ? 'bg-rose-gold-400' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.memoryEnabled ? 'left-8' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Auto Extract */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-rose-gold-300" />
            </div>
            <div>
              <p className="font-medium text-white">Auto-Extract</p>
              <p className="text-xs text-white/50">Automatically extract facts and preferences from conversations</p>
            </div>
          </div>
          <button
            onClick={() => onUpdate({ autoExtract: !settings.autoExtract })}
            disabled={isLoading || !settings.memoryEnabled}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.autoExtract && settings.memoryEnabled ? 'bg-rose-gold-400' : 'bg-white/20'
            } ${!settings.memoryEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.autoExtract && settings.memoryEnabled ? 'left-8' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Retention Days */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-rose-gold-300" />
          </div>
          <div>
            <p className="font-medium text-white">Retention Period</p>
            <p className="text-xs text-white/50">How long to keep memories (in days)</p>
          </div>
        </div>
        <input
          type="range"
          min="30"
          max="730"
          step="30"
          value={settings.retentionDays}
          onChange={e => onUpdate({ retentionDays: parseInt(e.target.value) })}
          disabled={isLoading || !settings.memoryEnabled}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
            settings.memoryEnabled ? 'bg-white/10' : 'bg-white/5 opacity-50'
          }`}
          style={{
            background: settings.memoryEnabled
              ? `linear-gradient(to right, #be7a6a 0%, #be7a6a ${((settings.retentionDays - 30) / 700) * 100}%, rgba(255,255,255,0.1) ${((settings.retentionDays - 30) / 700) * 100}%, rgba(255,255,255,0.1) 100%)`
              : undefined
          }}
        />
        <div className="flex justify-between text-xs text-white/40 mt-2">
          <span>30 days</span>
          <span className="text-rose-gold-300 font-medium">{settings.retentionDays} days</span>
          <span>2 years</span>
        </div>
      </div>

      {/* Max Memories */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 flex items-center justify-center">
            <Database className="w-5 h-5 text-rose-gold-300" />
          </div>
          <div>
            <p className="font-medium text-white">Maximum Memories</p>
            <p className="text-xs text-white/50">Limit total stored memories (oldest low-importance removed first)</p>
          </div>
        </div>
        <input
          type="range"
          min="100"
          max="50000"
          step="100"
          value={settings.maxMemories}
          onChange={e => onUpdate({ maxMemories: parseInt(e.target.value) })}
          disabled={isLoading || !settings.memoryEnabled}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
            settings.memoryEnabled ? 'bg-white/10' : 'bg-white/5 opacity-50'
          }`}
          style={{
            background: settings.memoryEnabled
              ? `linear-gradient(to right, #be7a6a 0%, #be7a6a ${((settings.maxMemories - 100) / 49900) * 100}%, rgba(255,255,255,0.1) ${((settings.maxMemories - 100) / 49900) * 100}%, rgba(255,255,255,0.1) 100%)`
              : undefined
          }}
        />
        <div className="flex justify-between text-xs text-white/40 mt-2">
          <span>100</span>
          <span className="text-rose-gold-300 font-medium">{settings.maxMemories.toLocaleString()}</span>
          <span>50,000</span>
        </div>
      </div>

      {/* Privacy Warning */}
      <div className="p-4 rounded-xl bg-rose-gold-500/10 border border-rose-gold-400/30">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-rose-gold-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-rose-gold-300">Privacy Notice</p>
            <p className="text-xs text-white/60 mt-1">
              Memories are stored locally and never shared with third parties.
              You can export or delete all your memories at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function MemoryDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('memories')
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editImportance, setEditImportance] = useState(50)
  const [editPrivacy, setEditPrivacy] = useState<PrivacySetting>('private')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('')

  const {
    memories,
    stats,
    settings,
    isLoading,
    isDeleting,
    isConsolidating,
    delete: deleteMemory,
    bulkDelete,
    update,
    updateSettings,
    consolidate,
    export: exportMemories,
    import: importMemories,
    refresh,
  } = useMemory()

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isSearching,
    debouncedSearch,
  } = useMemorySearch()

  // Handle search
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    debouncedSearch(value)
  }, [setSearchQuery, debouncedSearch])

  // Handle delete
  const handleDeleteMemory = useCallback(async (id: string) => {
    await deleteMemory(id)
  }, [deleteMemory])

  // Handle view
  const handleViewMemory = useCallback((memory: Memory) => {
    setSelectedMemory(memory)
  }, [])

  // Handle edit
  const handleEditMemory = useCallback((memory: Memory) => {
    setEditingMemory(memory)
    setEditContent(memory.content)
    setEditImportance(memory.importance)
    setEditPrivacy(memory.privacy)
  }, [])

  // Save edit
  const handleSaveEdit = useCallback(async () => {
    if (!editingMemory) return

    await update(editingMemory.id, {
      content: editContent,
      importance: editImportance,
      privacy: editPrivacy,
    })

    setEditingMemory(null)
  }, [editingMemory, editContent, editImportance, editPrivacy, update])

  // Handle export
  const handleExport = useCallback(async () => {
    await exportMemories()
  }, [exportMemories])

  // Handle import
  const handleImport = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const text = await file.text()
      try {
        const data = JSON.parse(text)
        await importMemories(data)
        refresh()
      } catch (err) {
        console.error('Import failed:', err)
        alert('Failed to import memories. Invalid file format.')
      }
    }
    input.click()
  }, [importMemories, refresh])

  // Handle delete all
  const handleDeleteAll = useCallback(async () => {
    if (deleteAllConfirm !== 'DELETE ALL') return

    await bulkDelete()
    setShowDeleteConfirm(false)
    setDeleteAllConfirm('')
  }, [deleteAllConfirm, bulkDelete])

  // Display memories (search results or all)
  const displayMemories = searchQuery.trim() ? searchResults.map(r => r.memory) : memories

  const tabs: { id: TabType; label: string; icon: typeof Brain }[] = [
    { id: 'memories', label: 'Memories', icon: Brain },
    { id: 'stats', label: 'Statistics', icon: Database },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="h-full w-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-rose-gold-400/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-8 h-8 object-contain logo-render" />
              <div className="h-6 w-px bg-white/10" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center shadow-glow-lg">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Memory System</h2>
                <p className="text-xs text-rose-gold-400/70">Persistent AI Memory & Learning</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => consolidate()}
              disabled={isConsolidating}
              className="morphic-btn px-3 py-2 text-sm flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isConsolidating ? 'animate-spin' : ''}`} />
              Consolidate
            </button>
            <button
              onClick={handleImport}
              className="morphic-btn px-3 py-2 text-sm flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={handleExport}
              className="morphic-btn px-3 py-2 text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="morphic-btn px-3 py-2 text-sm flex items-center gap-2 bg-rose-gold-500/10 hover:bg-rose-gold-500/20 text-rose-gold-300"
            >
              <Trash2 className="w-4 h-4" />
              Delete All
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                activeTab === tab.id
                  ? 'bg-rose-gold-400/20 text-rose-gold-400'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6">
        <AnimatePresence mode="wait">
          {/* Memories Tab */}
          {activeTab === 'memories' && (
            <motion.div
              key="memories"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearch}
                  placeholder="Search memories..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-rose-gold-400/50"
                />
                {isSearching && (
                  <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-gold-400 animate-spin" />
                )}
              </div>

              {/* Memory List */}
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 text-rose-gold-400 animate-spin" />
                </div>
              ) : displayMemories.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40">
                    {searchQuery ? 'No memories found matching your search' : 'No memories found'}
                  </p>
                  <p className="text-sm text-white/30 mt-1">Start a conversation to create memories</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayMemories.map(memory => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      onDelete={handleDeleteMemory}
                      onView={handleViewMemory}
                      onEdit={handleEditMemory}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Statistics Tab */}
          {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {stats ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      label="Total Memories"
                      value={stats.totalMemories}
                      icon={Brain}
                      color="bg-rose-gold-400/20 text-rose-gold-300"
                    />
                    <StatCard
                      label="Avg Importance"
                      value={Math.round(stats.averageImportance)}
                      icon={Star}
                      color="bg-rose-gold-400/25 text-rose-gold-300"
                    />
                    <StatCard
                      label="Expiring Soon"
                      value={stats.expiringCount}
                      icon={Clock}
                      color="bg-rose-gold-400/30 text-rose-gold-300"
                    />
                    <StatCard
                      label="Storage Used"
                      value={`${(stats.totalStorageBytes / 1024).toFixed(1)} KB`}
                      icon={Database}
                      color="bg-rose-gold-400/20 text-rose-gold-400"
                    />
                  </div>

                  <div className="morphic-card p-6 rounded-xl">
                    <h3 className="text-lg font-semibold text-white mb-4">Memories by Type</h3>
                    <div className="space-y-2">
                      {Object.entries(stats.memoriesByType).map(([type, count]) => (
                        <div key={type} className="flex items-center gap-3">
                          <span className="text-sm text-white/60 w-40">{type.replace(/_/g, ' ')}</span>
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-rose-gold-400 rounded-full transition-all"
                              style={{ width: `${stats.totalMemories > 0 ? (count / stats.totalMemories) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-sm text-white/80 w-8 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {stats.oldestMemory && stats.newestMemory && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="morphic-card p-4 rounded-xl">
                        <p className="text-sm text-white/40">Oldest Memory</p>
                        <p className="text-lg font-bold text-white">
                          {new Date(stats.oldestMemory).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="morphic-card p-4 rounded-xl">
                        <p className="text-sm text-white/40">Newest Memory</p>
                        <p className="text-lg font-bold text-white">
                          {new Date(stats.newestMemory).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 text-rose-gold-400 animate-spin" />
                </div>
              )}
            </motion.div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SettingsPanel
                settings={settings}
                onUpdate={updateSettings}
                isLoading={isLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Memory Detail Modal */}
      <AnimatePresence>
        {selectedMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedMemory(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="morphic-card p-6 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Memory Details</h3>
                <button
                  onClick={() => setSelectedMemory(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-white/40 mb-1">Type</p>
                  <p className="text-sm text-white">{selectedMemory.type.replace(/_/g, ' ')}</p>
                </div>

                <div>
                  <p className="text-xs text-white/40 mb-1">Content</p>
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{selectedMemory.content}</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Importance</p>
                    <p className="text-sm text-white">{selectedMemory.importance}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Access Count</p>
                    <p className="text-sm text-white">{selectedMemory.accessCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Privacy</p>
                    <p className="text-sm text-white flex items-center gap-1">
                      <PrivacyIcon privacy={selectedMemory.privacy} />
                      {selectedMemory.privacy}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Created</p>
                    <p className="text-sm text-white">{new Date(selectedMemory.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Last Accessed</p>
                    <p className="text-sm text-white">{new Date(selectedMemory.accessedAt).toLocaleString()}</p>
                  </div>
                </div>

                {selectedMemory.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedMemory.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded bg-white/10 text-xs text-white/80">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(selectedMemory.metadata).length > 0 && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Metadata</p>
                    <pre className="text-xs text-white/60 bg-white/5 p-2 rounded overflow-x-auto">
                      {JSON.stringify(selectedMemory.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Memory Modal */}
      <AnimatePresence>
        {editingMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setEditingMemory(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="morphic-card p-6 rounded-xl max-w-2xl w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-4">Edit Memory</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Content</label>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={5}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-rose-gold-400/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Importance: {editImportance}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={editImportance}
                    onChange={e => setEditImportance(parseInt(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10"
                    style={{
                      background: `linear-gradient(to right, #be7a6a 0%, #be7a6a ${editImportance}%, rgba(255,255,255,0.1) ${editImportance}%, rgba(255,255,255,0.1) 100%)`
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-2 block">Privacy</label>
                  <div className="flex gap-2">
                    {(['private', 'shared', 'public'] as PrivacySetting[]).map(privacy => (
                      <button
                        key={privacy}
                        onClick={() => setEditPrivacy(privacy)}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                          editPrivacy === privacy
                            ? 'bg-rose-gold-400/20 text-rose-gold-300 border border-rose-gold-400/30'
                            : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <PrivacyIcon privacy={privacy} />
                        {privacy}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setEditingMemory(null)}
                  className="morphic-btn px-4 py-2 text-white/60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="morphic-btn px-4 py-2 bg-rose-gold-400/20 text-rose-gold-300 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete All Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => {
              setShowDeleteConfirm(false)
              setDeleteAllConfirm('')
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="morphic-card p-6 rounded-xl max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-rose-gold-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-rose-gold-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Delete All Memories</h3>
              </div>

              <p className="text-white/60 text-sm mb-4">
                This action cannot be undone. All your memories will be permanently deleted.
                Type <span className="text-rose-gold-300 font-mono">DELETE ALL</span> to confirm.
              </p>

              <input
                type="text"
                value={deleteAllConfirm}
                onChange={e => setDeleteAllConfirm(e.target.value)}
                placeholder="Type DELETE ALL"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-rose-gold-400/50 mb-4"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteAllConfirm('')
                  }}
                  className="morphic-btn px-4 py-2 text-white/60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteAllConfirm !== 'DELETE ALL' || isDeleting}
                  className={`morphic-btn px-4 py-2 flex items-center gap-2 ${
                    deleteAllConfirm === 'DELETE ALL'
                      ? 'bg-rose-gold-500/20 text-rose-gold-300'
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className={`w-4 h-4 ${isDeleting ? 'animate-spin' : ''}`} />
                  Delete All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
