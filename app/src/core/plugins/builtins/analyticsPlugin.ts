/**
 * Analytics Plugin
 * Tracks usage patterns and provides insights
 */

import type { PluginDefinition, PluginAPI } from '../types'
import { BRAND } from '../../../config/brand'

interface UsageStats {
  totalMessages: number
  totalChats: number
  totalSessions: number
  messagesByDay: Record<string, number>
  tokenUsage: number
  featureUsage: Record<string, number>
  lastActivity: string
}

const DEFAULT_STATS: UsageStats = {
  totalMessages: 0,
  totalChats: 0,
  totalSessions: 0,
  messagesByDay: {},
  tokenUsage: 0,
  featureUsage: {},
  lastActivity: new Date().toISOString()
}

export const analyticsPlugin: PluginDefinition = {
  manifest: {
    id: 'com.alabobai.analytics',
    name: 'Usage Analytics',
    version: '1.0.0',
    author: BRAND.name,
    description: 'Track your usage patterns and get insights',
    longDescription: `See how you use ${BRAND.name} with detailed analytics. Track message counts, token usage, feature adoption, and more. All data stays on your device.`,
    icon: 'BarChart3',
    category: 'analytics',
    tags: ['analytics', 'insights', 'tracking'],
    permissions: ['storage', 'ui.sidebar', 'events.all', 'notifications'],
    settingsSchema: {
      sections: [
        {
          id: 'analytics-settings',
          title: 'Analytics Settings',
          description: 'Configure what to track',
          fields: [
            {
              id: 'enabled',
              type: 'boolean',
              label: 'Enable Analytics',
              description: 'Track usage statistics',
              defaultValue: true
            },
            {
              id: 'trackMessages',
              type: 'boolean',
              label: 'Track Messages',
              description: 'Count messages sent and received',
              defaultValue: true
            },
            {
              id: 'trackSessions',
              type: 'boolean',
              label: 'Track Sessions',
              description: 'Track session duration and frequency',
              defaultValue: true
            },
            {
              id: 'trackFeatures',
              type: 'boolean',
              label: 'Track Features',
              description: 'Track which features you use most',
              defaultValue: true
            },
            {
              id: 'retentionDays',
              type: 'number',
              label: 'Data Retention (days)',
              description: 'How long to keep analytics data',
              min: 7,
              max: 365,
              defaultValue: 30
            }
          ]
        }
      ]
    }
  },

  hooks: {
    async onInit(api: PluginAPI) {
      console.log('[AnalyticsPlugin] Initializing...')

      // Initialize stats if not present
      const stats = await api.storage.get<UsageStats>('stats')
      if (!stats) {
        await api.storage.set('stats', DEFAULT_STATS)
      }
    },

    async onActivate(api: PluginAPI) {
      console.log('[AnalyticsPlugin] Activating...')

      const settings = api.settings.getAll()
      if (!settings.enabled) {
        console.log('[AnalyticsPlugin] Analytics disabled')
        return
      }

      // Track session start
      if (settings.trackSessions) {
        await incrementStat(api, 'totalSessions')
      }

      // Subscribe to message events
      if (settings.trackMessages) {
        api.events.on('message.sent', async () => {
          await incrementStat(api, 'totalMessages')
          await trackDailyActivity(api)
        })

        api.events.on('message.received', async () => {
          await incrementStat(api, 'totalMessages')
        })
      }

      // Subscribe to chat events
      api.events.on('chat.created', async () => {
        await incrementStat(api, 'totalChats')
      })

      // Subscribe to feature usage
      if (settings.trackFeatures) {
        api.events.on('view.changed', async (data) => {
          const view = (data as { view: string })?.view || 'unknown'
          await trackFeatureUsage(api, view)
        })
      }

      // Register sidebar item
      api.ui.registerSidebarItem({
        id: 'analytics',
        icon: 'BarChart3',
        label: 'Analytics',
        order: 90,
        onClick: () => {
          showAnalyticsPanel(api)
        }
      })

      api.notifications.info('Analytics', 'Usage tracking enabled')
    },

    async onDeactivate(api: PluginAPI) {
      console.log('[AnalyticsPlugin] Deactivating...')
      api.events.removeAllListeners()
    },

    async onUninstall(api: PluginAPI) {
      console.log('[AnalyticsPlugin] Uninstalling...')
      // Optionally clear all analytics data
      await api.storage.clear()
    },

    onSettingsChange(settings, api) {
      console.log('[AnalyticsPlugin] Settings changed:', settings)
      if (!settings.enabled) {
        api.events.removeAllListeners()
        api.notifications.info('Analytics', 'Usage tracking disabled')
      }
    }
  }
}

// Helper functions
async function incrementStat(api: PluginAPI, key: keyof UsageStats): Promise<void> {
  const stats = await api.storage.get<UsageStats>('stats') || DEFAULT_STATS
  if (typeof stats[key] === 'number') {
    (stats[key] as number)++
  }
  stats.lastActivity = new Date().toISOString()
  await api.storage.set('stats', stats)
}

async function trackDailyActivity(api: PluginAPI): Promise<void> {
  const stats = await api.storage.get<UsageStats>('stats') || DEFAULT_STATS
  const today = new Date().toISOString().split('T')[0]
  stats.messagesByDay[today] = (stats.messagesByDay[today] || 0) + 1
  await api.storage.set('stats', stats)
}

async function trackFeatureUsage(api: PluginAPI, feature: string): Promise<void> {
  const stats = await api.storage.get<UsageStats>('stats') || DEFAULT_STATS
  stats.featureUsage[feature] = (stats.featureUsage[feature] || 0) + 1
  await api.storage.set('stats', stats)
}

async function showAnalyticsPanel(api: PluginAPI): Promise<void> {
  const stats = await api.storage.get<UsageStats>('stats') || DEFAULT_STATS

  api.ui.showModal({
    id: 'analytics-panel',
    title: 'Usage Analytics',
    size: 'large',
    closable: true,
    content: null, // Would be a React component showing charts
    onClose: () => {
      api.ui.closeModal('analytics-panel')
    }
  })
}

// Export stats getter
export async function getAnalyticsStats(api: PluginAPI): Promise<UsageStats> {
  return await api.storage.get<UsageStats>('stats') || DEFAULT_STATS
}

// Export stats reset function
export async function resetAnalyticsStats(api: PluginAPI): Promise<void> {
  await api.storage.set('stats', DEFAULT_STATS)
  api.notifications.success('Analytics', 'Statistics have been reset')
}
