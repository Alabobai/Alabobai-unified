/**
 * Activity Store
 * Tracks user activity for recent actions timeline and analytics
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BRAND_STATUS_COLORS, BRAND_TOKENS } from '@/config/brandTokens'

// ============================================================================
// Types
// ============================================================================

export type ActivityType =
  | 'chat_created'
  | 'chat_message'
  | 'project_created'
  | 'project_opened'
  | 'file_created'
  | 'file_edited'
  | 'research_started'
  | 'research_completed'
  | 'image_generated'
  | 'video_generated'
  | 'voice_session'
  | 'analysis_run'
  | 'transaction_added'
  | 'goal_created'
  | 'agent_deployed'
  | 'integration_connected'
  | 'settings_changed'
  | 'view_opened'

export interface Activity {
  id: string
  type: ActivityType
  title: string
  description: string
  timestamp: Date
  metadata?: {
    entityId?: string
    entityType?: string
    view?: string
    [key: string]: unknown
  }
  icon?: string
  color?: string
}

export interface UserStats {
  projectsCreated: number
  chatsStarted: number
  researchCompleted: number
  imagesGenerated: number
  voiceSessions: number
  analysisRuns: number
  transactionsLogged: number
  totalTimeSpent: number // in minutes
  streakDays: number
  lastActiveDate: string
}

export interface FeatureUsage {
  featureId: string
  usageCount: number
  lastUsed: Date
}

interface ActivityState {
  // Activity timeline
  activities: Activity[]

  // User statistics
  stats: UserStats

  // Feature usage tracking
  featureUsage: FeatureUsage[]

  // Session tracking
  sessionStartTime: Date | null
  currentView: string | null

  // Continue where left off
  lastActivity: Activity | null
  continueItems: Array<{
    type: string
    id: string
    title: string
    view: string
    timestamp: Date
  }>

  // Actions
  logActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void
  getRecentActivities: (limit?: number) => Activity[]
  clearActivities: () => void

  // Stats actions
  incrementStat: (stat: keyof UserStats, amount?: number) => void
  updateStreak: () => void
  getStats: () => UserStats

  // Feature usage
  trackFeatureUsage: (featureId: string) => void
  getFeatureUsage: (featureId: string) => FeatureUsage | undefined
  getMostUsedFeatures: (limit?: number) => FeatureUsage[]

  // Session tracking
  startSession: () => void
  endSession: () => void
  setCurrentView: (view: string) => void

  // Continue items
  addContinueItem: (item: Omit<ActivityState['continueItems'][0], 'timestamp'>) => void
  getContinueItems: () => ActivityState['continueItems']
  removeContinueItem: (id: string) => void
}

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = () => crypto.randomUUID()

const getActivityIcon = (type: ActivityType): string => {
  const icons: Record<ActivityType, string> = {
    chat_created: 'MessageSquare',
    chat_message: 'MessageCircle',
    project_created: 'FolderPlus',
    project_opened: 'FolderOpen',
    file_created: 'FilePlus',
    file_edited: 'Edit',
    research_started: 'Search',
    research_completed: 'CheckCircle',
    image_generated: 'Image',
    video_generated: 'Film',
    voice_session: 'Mic',
    analysis_run: 'BarChart3',
    transaction_added: 'DollarSign',
    goal_created: 'Target',
    agent_deployed: 'Bot',
    integration_connected: 'Plug',
    settings_changed: 'Settings',
    view_opened: 'Eye'
  }
  return icons[type] || 'Activity'
}

const getActivityColor = (type: ActivityType): string => {
  const colors: Record<ActivityType, string> = {
    chat_created: BRAND_STATUS_COLORS.info,
    chat_message: BRAND_STATUS_COLORS.info,
    project_created: BRAND_STATUS_COLORS.success,
    project_opened: BRAND_STATUS_COLORS.success,
    file_created: BRAND_TOKENS.accent.strong,
    file_edited: BRAND_TOKENS.accent.base,
    research_started: BRAND_STATUS_COLORS.warning,
    research_completed: BRAND_STATUS_COLORS.success,
    image_generated: BRAND_TOKENS.accent.soft,
    video_generated: BRAND_TOKENS.accent.deep,
    voice_session: BRAND_TOKENS.accent.base,
    analysis_run: BRAND_STATUS_COLORS.warning,
    transaction_added: BRAND_STATUS_COLORS.success,
    goal_created: BRAND_TOKENS.accent.strong,
    agent_deployed: BRAND_TOKENS.accent.deep,
    integration_connected: BRAND_STATUS_COLORS.info,
    settings_changed: BRAND_STATUS_COLORS.neutral,
    view_opened: BRAND_STATUS_COLORS.neutral
  }
  return colors[type] || BRAND_STATUS_COLORS.neutral
}

const isToday = (date: Date): boolean => {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

const isYesterday = (date: Date): boolean => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return date.toDateString() === yesterday.toDateString()
}

// ============================================================================
// Store
// ============================================================================

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      // Initial state
      activities: [],
      stats: {
        projectsCreated: 0,
        chatsStarted: 0,
        researchCompleted: 0,
        imagesGenerated: 0,
        voiceSessions: 0,
        analysisRuns: 0,
        transactionsLogged: 0,
        totalTimeSpent: 0,
        streakDays: 0,
        lastActiveDate: ''
      },
      featureUsage: [],
      sessionStartTime: null,
      currentView: null,
      lastActivity: null,
      continueItems: [],

      // Log new activity
      logActivity: (activity) => {
        const newActivity: Activity = {
          id: generateId(),
          timestamp: new Date(),
          icon: activity.icon || getActivityIcon(activity.type),
          color: activity.color || getActivityColor(activity.type),
          ...activity
        }

        set((state) => ({
          activities: [newActivity, ...state.activities].slice(0, 100), // Keep last 100
          lastActivity: newActivity
        }))

        // Auto-update stats based on activity type
        const statMap: Partial<Record<ActivityType, keyof UserStats>> = {
          project_created: 'projectsCreated',
          chat_created: 'chatsStarted',
          research_completed: 'researchCompleted',
          image_generated: 'imagesGenerated',
          voice_session: 'voiceSessions',
          analysis_run: 'analysisRuns',
          transaction_added: 'transactionsLogged'
        }

        const statKey = statMap[activity.type]
        if (statKey) {
          get().incrementStat(statKey)
        }
      },

      // Get recent activities
      getRecentActivities: (limit = 10) => {
        return get().activities.slice(0, limit)
      },

      // Clear all activities
      clearActivities: () => {
        set({ activities: [], lastActivity: null })
      },

      // Increment a stat
      incrementStat: (stat, amount = 1) => {
        set((state) => ({
          stats: {
            ...state.stats,
            [stat]: (state.stats[stat] as number) + amount
          }
        }))
      },

      // Update streak
      updateStreak: () => {
        const { stats } = get()
        const today = new Date().toDateString()
        const lastActive = stats.lastActiveDate

        if (lastActive === today) {
          return // Already counted today
        }

        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)

        let newStreak = stats.streakDays
        if (lastActive === yesterday.toDateString()) {
          newStreak += 1
        } else if (lastActive !== today) {
          newStreak = 1 // Reset streak
        }

        set((state) => ({
          stats: {
            ...state.stats,
            streakDays: newStreak,
            lastActiveDate: today
          }
        }))
      },

      // Get current stats
      getStats: () => get().stats,

      // Track feature usage
      trackFeatureUsage: (featureId) => {
        set((state) => {
          const existing = state.featureUsage.find(f => f.featureId === featureId)

          if (existing) {
            return {
              featureUsage: state.featureUsage.map(f =>
                f.featureId === featureId
                  ? { ...f, usageCount: f.usageCount + 1, lastUsed: new Date() }
                  : f
              )
            }
          }

          return {
            featureUsage: [...state.featureUsage, {
              featureId,
              usageCount: 1,
              lastUsed: new Date()
            }]
          }
        })
      },

      // Get feature usage
      getFeatureUsage: (featureId) => {
        return get().featureUsage.find(f => f.featureId === featureId)
      },

      // Get most used features
      getMostUsedFeatures: (limit = 5) => {
        return [...get().featureUsage]
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, limit)
      },

      // Start session
      startSession: () => {
        set({ sessionStartTime: new Date() })
        get().updateStreak()
      },

      // End session
      endSession: () => {
        const { sessionStartTime } = get()
        if (sessionStartTime) {
          const minutes = Math.round(
            (new Date().getTime() - sessionStartTime.getTime()) / 60000
          )
          get().incrementStat('totalTimeSpent', minutes)
        }
        set({ sessionStartTime: null })
      },

      // Set current view
      setCurrentView: (view) => {
        set({ currentView: view })
        get().trackFeatureUsage(view)
      },

      // Add continue item
      addContinueItem: (item) => {
        set((state) => {
          // Remove existing item with same id
          const filtered = state.continueItems.filter(i => i.id !== item.id)

          return {
            continueItems: [
              { ...item, timestamp: new Date() },
              ...filtered
            ].slice(0, 5) // Keep last 5
          }
        })
      },

      // Get continue items
      getContinueItems: () => get().continueItems,

      // Remove continue item
      removeContinueItem: (id) => {
        set((state) => ({
          continueItems: state.continueItems.filter(i => i.id !== id)
        }))
      }
    }),
    {
      name: 'alabobai-activity',
      partialize: (state) => ({
        activities: state.activities.slice(0, 50), // Persist last 50
        stats: state.stats,
        featureUsage: state.featureUsage,
        continueItems: state.continueItems
      }),
      // Revive dates from JSON
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.activities = state.activities.map(a => ({
            ...a,
            timestamp: new Date(a.timestamp)
          }))
          state.featureUsage = state.featureUsage.map(f => ({
            ...f,
            lastUsed: new Date(f.lastUsed)
          }))
          state.continueItems = state.continueItems.map(c => ({
            ...c,
            timestamp: new Date(c.timestamp)
          }))
        }
      }
    }
  )
)

// ============================================================================
// Helper Hooks
// ============================================================================

export const useRecentActivities = (limit = 10) => {
  const activities = useActivityStore((state) => state.activities)
  return activities.slice(0, limit)
}

export const useUserStats = () => {
  return useActivityStore((state) => state.stats)
}

export const useContinueItems = () => {
  return useActivityStore((state) => state.continueItems)
}

// Format relative time
export const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default useActivityStore
