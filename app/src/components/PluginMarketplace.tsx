/**
 * Plugin Marketplace Component
 * Browse, search, and install plugins
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Package,
  Download,
  Trash2,
  Power,
  PowerOff,
  Star,
  ExternalLink,
  ChevronDown,
  Settings,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Code,
  Palette,
  FileText,
  Mic,
  BarChart3,
  Shield,
  Cloud,
  Zap
} from 'lucide-react'
import { usePluginStore, usePlugins } from '@/stores/pluginStore'
import type { PluginManifest, PluginCategory, PluginInstance } from '@/core/plugins/types'

// ============================================================================
// Category Icons
// ============================================================================

const CATEGORY_ICONS: Record<PluginCategory, React.ComponentType<{ className?: string }>> = {
  appearance: Palette,
  productivity: Zap,
  integration: Cloud,
  analytics: BarChart3,
  security: Shield,
  export: FileText,
  backup: Cloud,
  ai: Code,
  developer: Code,
  other: Package
}

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  appearance: 'Appearance',
  productivity: 'Productivity',
  integration: 'Integration',
  analytics: 'Analytics',
  security: 'Security',
  export: 'Export',
  backup: 'Backup',
  ai: 'AI Tools',
  developer: 'Developer',
  other: 'Other'
}

// ============================================================================
// Plugin Card Component
// ============================================================================

interface PluginCardProps {
  plugin: PluginManifest
  installed: PluginInstance | undefined
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onActivate: (id: string) => void
  onDeactivate: (id: string) => void
  loading: boolean
}

function PluginCard({
  plugin,
  installed,
  onInstall,
  onUninstall,
  onActivate,
  onDeactivate,
  loading
}: PluginCardProps) {
  const isActive = installed?.state === 'active'
  const CategoryIcon = CATEGORY_ICONS[plugin.category]

  return (
    <div className="p-4 bg-dark-400 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-start gap-4">
        {/* Plugin Icon */}
        <div className="w-12 h-12 rounded-xl bg-rose-gold-400/10 flex items-center justify-center flex-shrink-0">
          <CategoryIcon className="w-6 h-6 text-rose-gold-400" />
        </div>

        {/* Plugin Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-medium truncate">{plugin.name}</h3>
            <span className="text-xs text-white/40">v{plugin.version}</span>
            {installed && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isActive
                  ? 'bg-rose-gold-400/20 text-rose-gold-300'
                  : 'bg-white/10 text-white/50'
              }`}>
                {isActive ? 'Active' : 'Installed'}
              </span>
            )}
          </div>

          <p className="text-sm text-white/60 line-clamp-2 mb-3">
            {plugin.description}
          </p>

          <div className="flex items-center gap-4 text-xs text-white/40">
            <span>By {plugin.author}</span>
            <span className="flex items-center gap-1">
              <CategoryIcon className="w-3 h-3" />
              {CATEGORY_LABELS[plugin.category]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {installed ? (
            <>
              <button
                onClick={() => isActive ? onDeactivate(plugin.id) : onActivate(plugin.id)}
                disabled={loading}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-rose-gold-400/15 text-rose-gold-400 hover:bg-rose-gold-400/25'
                    : 'bg-rose-gold-400/20 text-rose-gold-300 hover:bg-rose-gold-400/30'
                }`}
                title={isActive ? 'Deactivate' : 'Activate'}
              >
                {isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
              </button>
              <button
                onClick={() => onUninstall(plugin.id)}
                disabled={loading}
                className="p-2 rounded-lg bg-rose-gold-500/20 text-rose-gold-300 hover:bg-rose-gold-500/30 transition-colors"
                title="Uninstall"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => onInstall(plugin.id)}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-rose-gold-400 text-dark-400 hover:bg-rose-gold-300 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Install
            </button>
          )}
        </div>
      </div>

      {/* Tags */}
      {plugin.tags && plugin.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
          {plugin.tags.map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-1 rounded-md bg-white/5 text-white/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Marketplace Component
// ============================================================================

export default function PluginMarketplace() {
  const {
    availablePlugins,
    marketplaceLoading,
    searchQuery,
    categoryFilter,
    loading,
    searchPlugins,
    filterByCategory,
    installPlugin,
    uninstallPlugin,
    activatePlugin,
    deactivatePlugin,
    fetchMarketplace
  } = usePluginStore()

  const installedPlugins = usePlugins()

  // Fetch marketplace on mount
  useEffect(() => {
    fetchMarketplace()
  }, [fetchMarketplace])

  // Get installed plugin map
  const installedMap = useMemo(() => {
    const map = new Map<string, PluginInstance>()
    installedPlugins.forEach(plugin => {
      map.set(plugin.definition.manifest.id, plugin)
    })
    return map
  }, [installedPlugins])

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    let plugins = availablePlugins

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      plugins = plugins.filter(plugin =>
        plugin.name.toLowerCase().includes(query) ||
        plugin.description.toLowerCase().includes(query) ||
        plugin.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    // Filter by category
    if (categoryFilter) {
      plugins = plugins.filter(plugin => plugin.category === categoryFilter)
    }

    return plugins
  }, [availablePlugins, searchQuery, categoryFilter])

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<PluginCategory>()
    availablePlugins.forEach(plugin => cats.add(plugin.category))
    return Array.from(cats).sort()
  }, [availablePlugins])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-gold-400/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Plugin Marketplace</h2>
              <p className="text-sm text-white/50">
                {availablePlugins.length} plugins available
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchMarketplace()}
            disabled={marketplaceLoading}
            className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${marketplaceLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => searchPlugins(e.target.value)}
            placeholder="Search plugins..."
            className="w-full pl-10 pr-4 py-2.5 bg-dark-400 border border-white/10 rounded-xl text-white placeholder-white/40 outline-none focus:border-rose-gold-400/50"
          />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => filterByCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !categoryFilter
                ? 'bg-rose-gold-400/20 text-rose-gold-400'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            All
          </button>
          {categories.map(category => {
            const Icon = CATEGORY_ICONS[category]
            return (
              <button
                key={category}
                onClick={() => filterByCategory(category)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === category
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {CATEGORY_LABELS[category]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Plugin List */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6">
        {marketplaceLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-rose-gold-400 animate-spin mb-4" />
            <p className="text-white/50">Loading plugins...</p>
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Search className="w-12 h-12 text-white/20 mb-4" />
            <p className="text-white/50 text-lg">No plugins found</p>
            <p className="text-white/30 text-sm">Try a different search term</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredPlugins.map(plugin => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                installed={installedMap.get(plugin.id)}
                onInstall={installPlugin}
                onUninstall={uninstallPlugin}
                onActivate={activatePlugin}
                onDeactivate={deactivatePlugin}
                loading={loading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Installed Plugins Summary */}
      {installedPlugins.length > 0 && (
        <div className="flex-shrink-0 p-4 border-t border-white/10 bg-dark-400/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <CheckCircle className="w-4 h-4 text-rose-gold-400" />
              <span>{installedPlugins.length} plugins installed</span>
              <span className="text-white/30">|</span>
              <span>{installedPlugins.filter(p => p.state === 'active').length} active</span>
            </div>
            <button className="text-xs text-rose-gold-400 hover:text-rose-gold-300 transition-colors">
              Manage Installed
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
