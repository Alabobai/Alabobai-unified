/**
 * PresenceIndicator Component
 * Shows who's viewing current document with animated avatars
 */

import { useState, useEffect, useRef } from 'react'
import { Eye, Users } from 'lucide-react'
import UserAvatar, { AvatarGroup } from './UserAvatar'
import { usePresenceStore, UserPresence } from '@/stores/presenceStore'

interface PresenceIndicatorProps {
  context?: 'file' | 'view' | 'chat'
  contextId?: string
  showLabel?: boolean
  maxAvatars?: number
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

export default function PresenceIndicator({
  context = 'view',
  contextId,
  showLabel = true,
  maxAvatars = 3,
  size = 'sm',
  className = '',
}: PresenceIndicatorProps) {
  const { users, getOnlineUsers, getUsersViewingFile, getUsersInView } = usePresenceStore()
  const [animatingUsers, setAnimatingUsers] = useState<string[]>([])
  const previousUsersRef = useRef<string[]>([])

  // Get relevant users based on context
  const relevantUsers = (() => {
    if (context === 'file' && contextId) {
      return getUsersViewingFile(contextId)
    }
    if (context === 'view' && contextId) {
      return getUsersInView(contextId)
    }
    return getOnlineUsers()
  })()

  // Detect user changes for animations
  useEffect(() => {
    const currentUserIds = relevantUsers.map(u => u.id)
    const previousUserIds = previousUsersRef.current

    // Find newly joined users
    const newUsers = currentUserIds.filter(id => !previousUserIds.includes(id))

    if (newUsers.length > 0) {
      setAnimatingUsers(prev => [...prev, ...newUsers])
      // Remove animation class after animation completes
      setTimeout(() => {
        setAnimatingUsers(prev => prev.filter(id => !newUsers.includes(id)))
      }, 500)
    }

    previousUsersRef.current = currentUserIds
  }, [relevantUsers])

  if (relevantUsers.length === 0) {
    return null
  }

  const avatarUsers = relevantUsers.map(user => ({
    ...user,
    className: animatingUsers.includes(user.id) ? 'animate-slide-in' : '',
  }))

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <div className="flex items-center gap-1.5 text-rose-gold-400/60 text-xs">
          <Eye className="w-3.5 h-3.5" />
          <span>Viewing</span>
        </div>
      )}

      <div className="relative">
        <AvatarGroup
          users={avatarUsers}
          max={maxAvatars}
          size={size}
          onOverflowClick={() => {
            // Could open a modal or popover with full list
          }}
        />
      </div>

      {relevantUsers.length > maxAvatars && (
        <span className="text-xs text-white/50">
          +{relevantUsers.length - maxAvatars} others
        </span>
      )}
    </div>
  )
}

/**
 * TypingIndicator Component
 * Shows animated dots when someone is typing
 */
interface TypingIndicatorProps {
  userName?: string
  userColor?: string
  isAI?: boolean
  message?: string
  className?: string
}

export function TypingIndicator({
  userName,
  userColor = '#d9a07a',
  isAI = false,
  message,
  className = '',
}: TypingIndicatorProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {userName && (
        <span className="text-sm" style={{ color: userColor }}>
          {userName}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-white/50">
          {isAI ? message || 'AI is thinking' : 'is typing'}
        </span>
        <div className="flex gap-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: userColor, animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: userColor, animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: userColor, animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * AITypingIndicator Component
 * Specialized typing indicator for AI responses
 */
export function AITypingIndicator({ message }: { message?: string }) {
  const { aiIsTyping, aiTypingMessage } = usePresenceStore()

  if (!aiIsTyping) return null

  return (
    <div className="flex items-center gap-3 py-3 px-4 bg-rose-gold-400/5 rounded-xl border border-rose-gold-400/10">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center animate-pulse">
        <span className="text-dark-500 font-bold text-sm">AI</span>
      </div>
      <TypingIndicator
        isAI
        userColor="#d9a07a"
        message={aiTypingMessage || message}
      />
    </div>
  )
}

/**
 * UsersTypingIndicator Component
 * Shows all users who are currently typing
 */
interface UsersTypingIndicatorProps {
  location?: 'chat' | 'editor' | 'search'
  className?: string
}

export function UsersTypingIndicator({
  location = 'chat',
  className = '',
}: UsersTypingIndicatorProps) {
  const { users } = usePresenceStore()

  const typingUsers = users.filter(u => u.isTyping && u.typingIn === location)

  if (typingUsers.length === 0) return null

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0].name} is typing...`
    }
    if (typingUsers.length === 2) {
      return `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
    }
    return `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing...`
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex -space-x-1">
        {typingUsers.slice(0, 3).map(user => (
          <UserAvatar
            key={user.id}
            name={user.name}
            color={user.color}
            size="xs"
            showStatus={false}
            isTyping
          />
        ))}
      </div>
      <span className="text-xs text-white/50 animate-pulse">
        {getTypingText()}
      </span>
    </div>
  )
}

/**
 * CollaboratorTooltip Component
 * Shows detailed collaborator info on hover
 */
interface CollaboratorTooltipProps {
  user: UserPresence
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function CollaboratorTooltip({
  user,
  position = 'top',
}: CollaboratorTooltipProps) {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const getActivityText = () => {
    if (user.isTyping) {
      return user.typingIn === 'chat'
        ? 'Typing in chat...'
        : user.typingIn === 'editor'
        ? 'Editing code...'
        : 'Searching...'
    }
    switch (user.activity) {
      case 'editing':
        return `Editing ${user.currentFile || 'a file'}`
      case 'viewing':
        return `Viewing ${user.currentView || 'workspace'}`
      case 'reviewing':
        return 'Reviewing changes'
      default:
        return 'Online'
    }
  }

  return (
    <div
      className={`
        absolute z-50 ${positionClasses[position]}
        bg-dark-300 border border-rose-gold-400/20 rounded-xl
        p-3 min-w-[180px] shadow-xl
        animate-fade-in
      `}
    >
      <div className="flex items-center gap-3 mb-2">
        <UserAvatar
          name={user.name}
          avatar={user.avatar}
          color={user.color}
          status={user.status}
          size="md"
        />
        <div>
          <p className="text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-white/50">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: user.color }}
        />
        <span className="text-xs text-white/60">{getActivityText()}</span>
      </div>
    </div>
  )
}
