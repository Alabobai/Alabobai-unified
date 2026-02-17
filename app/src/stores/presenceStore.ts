/**
 * Presence Store
 * Manages real-time collaboration state with simulated users
 * Architected for real backend integration (WebSocket, Socket.io, etc.)
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

// ============================================================================
// Types
// ============================================================================

export type UserStatus = 'online' | 'away' | 'offline' | 'busy'
export type ActivityType = 'idle' | 'typing' | 'viewing' | 'editing' | 'reviewing'

export interface UserCursor {
  x: number
  y: number
  lineNumber?: number
  column?: number
  timestamp: Date
}

export interface UserSelection {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  filePath?: string
}

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  color: string // Unique color for cursors/highlights
  status: UserStatus
  lastSeen: Date
  currentView?: string
  currentFile?: string
}

export interface UserPresence extends User {
  activity: ActivityType
  cursor?: UserCursor
  selection?: UserSelection
  isTyping: boolean
  typingIn?: 'chat' | 'editor' | 'search'
}

export interface ActivityFeedItem {
  id: string
  userId: string
  userName: string
  userColor: string
  type: 'file_create' | 'file_edit' | 'file_delete' | 'chat_message' | 'view_change' | 'join' | 'leave' | 'comment'
  description: string
  target?: string // File path, view name, etc.
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface Notification {
  id: string
  type: 'info' | 'mention' | 'update' | 'collaboration' | 'system'
  title: string
  message: string
  timestamp: Date
  read: boolean
  userId?: string
  userName?: string
  userColor?: string
  actionUrl?: string
  actionLabel?: string
}

// ============================================================================
// Simulated User Data
// ============================================================================

const SIMULATED_USERS: User[] = [
  {
    id: 'user-1',
    name: 'Sarah Chen',
    email: 'sarah@example.com',
    color: '#FF6B6B',
    status: 'online',
    lastSeen: new Date(),
  },
  {
    id: 'user-2',
    name: 'Marcus Rodriguez',
    email: 'marcus@example.com',
    color: '#4ECDC4',
    status: 'online',
    lastSeen: new Date(),
  },
  {
    id: 'user-3',
    name: 'Emily Watson',
    email: 'emily@example.com',
    color: '#45B7D1',
    status: 'away',
    lastSeen: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: 'user-4',
    name: 'David Kim',
    email: 'david@example.com',
    color: '#96CEB4',
    status: 'busy',
    lastSeen: new Date(),
  },
  {
    id: 'user-5',
    name: 'Aisha Patel',
    email: 'aisha@example.com',
    color: '#DDA0DD',
    status: 'offline',
    lastSeen: new Date(Date.now() - 30 * 60 * 1000),
  },
]

const ACTIVITY_TEMPLATES = [
  { type: 'file_edit', description: 'edited', targets: ['App.tsx', 'ChatPanel.tsx', 'MonacoEditor.tsx', 'styles.css'] },
  { type: 'file_create', description: 'created', targets: ['NewComponent.tsx', 'utils.ts', 'types.d.ts'] },
  { type: 'view_change', description: 'switched to', targets: ['Code Builder', 'Creative Studio', 'Data Analyst'] },
  { type: 'comment', description: 'commented on', targets: ['PR #142', 'Issue #89', 'ChatPanel.tsx'] },
]

// ============================================================================
// Store Interface
// ============================================================================

interface PresenceState {
  // Current user
  currentUser: User | null

  // Other users
  users: UserPresence[]

  // Activity feed
  activityFeed: ActivityFeedItem[]

  // Notifications
  notifications: Notification[]
  unreadCount: number
  notificationCenterOpen: boolean

  // AI typing indicator
  aiIsTyping: boolean
  aiTypingMessage?: string

  // Simulation state
  simulationActive: boolean

  // Actions - User Management
  setCurrentUser: (user: User) => void
  updateUserPresence: (userId: string, updates: Partial<UserPresence>) => void
  setUserActivity: (userId: string, activity: ActivityType) => void
  setUserCursor: (userId: string, cursor: UserCursor) => void
  setUserSelection: (userId: string, selection: UserSelection | undefined) => void
  setUserTyping: (userId: string, isTyping: boolean, location?: 'chat' | 'editor' | 'search') => void

  // Actions - Activity Feed
  addActivity: (activity: Omit<ActivityFeedItem, 'id' | 'timestamp'>) => void
  clearActivityFeed: () => void

  // Actions - Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  removeNotification: (id: string) => void
  clearAllNotifications: () => void
  toggleNotificationCenter: () => void

  // Actions - AI Typing
  setAiTyping: (isTyping: boolean, message?: string) => void

  // Actions - Simulation
  startSimulation: () => void
  stopSimulation: () => void

  // Getters
  getOnlineUsers: () => UserPresence[]
  getUsersViewingFile: (filePath: string) => UserPresence[]
  getUsersInView: (viewName: string) => UserPresence[]
}

// ============================================================================
// Store Implementation
// ============================================================================

let simulationInterval: ReturnType<typeof setInterval> | null = null

export const usePresenceStore = create<PresenceState>()(
  immer((set, get) => ({
    // Initial state
    currentUser: {
      id: 'current-user',
      name: 'You',
      email: 'you@example.com',
      color: '#d9a07a', // Rose gold to match theme
      status: 'online',
      lastSeen: new Date(),
    },

    users: [],
    activityFeed: [],
    notifications: [],
    unreadCount: 0,
    notificationCenterOpen: false,
    aiIsTyping: false,
    simulationActive: false,

    // User Management
    setCurrentUser: (user) => set(state => {
      state.currentUser = user
    }),

    updateUserPresence: (userId, updates) => set(state => {
      const user = state.users.find(u => u.id === userId)
      if (user) {
        Object.assign(user, updates)
      }
    }),

    setUserActivity: (userId, activity) => set(state => {
      const user = state.users.find(u => u.id === userId)
      if (user) {
        user.activity = activity
      }
    }),

    setUserCursor: (userId, cursor) => set(state => {
      const user = state.users.find(u => u.id === userId)
      if (user) {
        user.cursor = cursor
      }
    }),

    setUserSelection: (userId, selection) => set(state => {
      const user = state.users.find(u => u.id === userId)
      if (user) {
        user.selection = selection
      }
    }),

    setUserTyping: (userId, isTyping, location) => set(state => {
      const user = state.users.find(u => u.id === userId)
      if (user) {
        user.isTyping = isTyping
        user.typingIn = location
        user.activity = isTyping ? 'typing' : 'idle'
      }
    }),

    // Activity Feed
    addActivity: (activity) => set(state => {
      const newActivity: ActivityFeedItem = {
        ...activity,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      }
      state.activityFeed.unshift(newActivity)
      // Keep only last 50 activities
      if (state.activityFeed.length > 50) {
        state.activityFeed = state.activityFeed.slice(0, 50)
      }
    }),

    clearActivityFeed: () => set(state => {
      state.activityFeed = []
    }),

    // Notifications
    addNotification: (notification) => set(state => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        timestamp: new Date(),
        read: false,
      }
      state.notifications.unshift(newNotification)
      state.unreadCount++
      // Keep only last 100 notifications
      if (state.notifications.length > 100) {
        state.notifications = state.notifications.slice(0, 100)
      }
    }),

    markNotificationRead: (id) => set(state => {
      const notification = state.notifications.find(n => n.id === id)
      if (notification && !notification.read) {
        notification.read = true
        state.unreadCount = Math.max(0, state.unreadCount - 1)
      }
    }),

    markAllNotificationsRead: () => set(state => {
      state.notifications.forEach(n => { n.read = true })
      state.unreadCount = 0
    }),

    removeNotification: (id) => set(state => {
      const notification = state.notifications.find(n => n.id === id)
      if (notification && !notification.read) {
        state.unreadCount = Math.max(0, state.unreadCount - 1)
      }
      state.notifications = state.notifications.filter(n => n.id !== id)
    }),

    clearAllNotifications: () => set(state => {
      state.notifications = []
      state.unreadCount = 0
    }),

    toggleNotificationCenter: () => set(state => {
      state.notificationCenterOpen = !state.notificationCenterOpen
    }),

    // AI Typing
    setAiTyping: (isTyping, message) => set(state => {
      state.aiIsTyping = isTyping
      state.aiTypingMessage = message
    }),

    // Simulation
    startSimulation: () => {
      const state = get()
      if (state.simulationActive) return

      set(s => {
        s.simulationActive = true
        // Initialize with some online users
        s.users = SIMULATED_USERS.slice(0, 3).map(user => ({
          ...user,
          activity: 'idle' as ActivityType,
          isTyping: false,
          status: 'online' as UserStatus,
          lastSeen: new Date(),
        }))
      })

      // Add initial activity
      get().addActivity({
        userId: SIMULATED_USERS[0].id,
        userName: SIMULATED_USERS[0].name,
        userColor: SIMULATED_USERS[0].color,
        type: 'join',
        description: 'joined the workspace',
      })

      // Simulate random user activities
      simulationInterval = setInterval(() => {
        const currentState = get()
        if (!currentState.simulationActive) return

        const action = Math.random()

        // 20% chance: User joins or leaves
        if (action < 0.2) {
          const offlineUsers = SIMULATED_USERS.filter(
            u => !currentState.users.some(online => online.id === u.id)
          )
          const onlineUsers = currentState.users.filter(u => u.status === 'online')

          if (offlineUsers.length > 0 && Math.random() > 0.5) {
            // User joins
            const joiningUser = offlineUsers[Math.floor(Math.random() * offlineUsers.length)]
            set(s => {
              s.users.push({
                ...joiningUser,
                activity: 'idle',
                isTyping: false,
                status: 'online',
                lastSeen: new Date(),
              })
            })
            get().addActivity({
              userId: joiningUser.id,
              userName: joiningUser.name,
              userColor: joiningUser.color,
              type: 'join',
              description: 'joined the workspace',
            })
            get().addNotification({
              type: 'collaboration',
              title: 'Team member online',
              message: `${joiningUser.name} joined the workspace`,
              userName: joiningUser.name,
              userColor: joiningUser.color,
            })
          } else if (onlineUsers.length > 1) {
            // User leaves (keep at least 1)
            const leavingUser = onlineUsers[Math.floor(Math.random() * onlineUsers.length)]
            set(s => {
              s.users = s.users.filter(u => u.id !== leavingUser.id)
            })
            get().addActivity({
              userId: leavingUser.id,
              userName: leavingUser.name,
              userColor: leavingUser.color,
              type: 'leave',
              description: 'left the workspace',
            })
          }
        }
        // 30% chance: User activity update
        else if (action < 0.5 && currentState.users.length > 0) {
          const randomUser = currentState.users[Math.floor(Math.random() * currentState.users.length)]
          const template = ACTIVITY_TEMPLATES[Math.floor(Math.random() * ACTIVITY_TEMPLATES.length)]
          const target = template.targets[Math.floor(Math.random() * template.targets.length)]

          get().addActivity({
            userId: randomUser.id,
            userName: randomUser.name,
            userColor: randomUser.color,
            type: template.type as ActivityFeedItem['type'],
            description: `${template.description} ${target}`,
            target,
          })
        }
        // 25% chance: Toggle typing
        else if (action < 0.75 && currentState.users.length > 0) {
          const randomUser = currentState.users[Math.floor(Math.random() * currentState.users.length)]
          const isTyping = Math.random() > 0.5
          const location = ['chat', 'editor', 'search'][Math.floor(Math.random() * 3)] as 'chat' | 'editor' | 'search'

          set(s => {
            const user = s.users.find(u => u.id === randomUser.id)
            if (user) {
              user.isTyping = isTyping
              user.typingIn = isTyping ? location : undefined
              user.activity = isTyping ? 'typing' : 'idle'
            }
          })
        }
        // 25% chance: Update cursor/selection
        else if (currentState.users.length > 0) {
          const randomUser = currentState.users[Math.floor(Math.random() * currentState.users.length)]

          set(s => {
            const user = s.users.find(u => u.id === randomUser.id)
            if (user) {
              user.cursor = {
                x: Math.floor(Math.random() * 100),
                y: Math.floor(Math.random() * 100),
                lineNumber: Math.floor(Math.random() * 200) + 1,
                column: Math.floor(Math.random() * 80) + 1,
                timestamp: new Date(),
              }
              user.activity = 'editing'
              user.currentFile = 'App.tsx'
            }
          })
        }
      }, 3000 + Math.random() * 2000) // Random interval between 3-5 seconds
    },

    stopSimulation: () => {
      if (simulationInterval) {
        clearInterval(simulationInterval)
        simulationInterval = null
      }
      set(s => {
        s.simulationActive = false
        s.users = []
      })
    },

    // Getters
    getOnlineUsers: () => {
      return get().users.filter(u => u.status === 'online' || u.status === 'busy')
    },

    getUsersViewingFile: (filePath) => {
      return get().users.filter(u => u.currentFile === filePath)
    },

    getUsersInView: (viewName) => {
      return get().users.filter(u => u.currentView === viewName)
    },
  }))
)

// Export convenience accessors for use outside React
export const presence = {
  startSimulation: () => usePresenceStore.getState().startSimulation(),
  stopSimulation: () => usePresenceStore.getState().stopSimulation(),
  setAiTyping: (isTyping: boolean, message?: string) =>
    usePresenceStore.getState().setAiTyping(isTyping, message),
  addActivity: (activity: Omit<ActivityFeedItem, 'id' | 'timestamp'>) =>
    usePresenceStore.getState().addActivity(activity),
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) =>
    usePresenceStore.getState().addNotification(notification),
}

export default usePresenceStore
