/**
 * UserAvatar Component
 * Displays user avatar with online/offline indicator and status badge
 */

import { useMemo } from 'react'
import { Edit3, Eye, MessageSquare, Search } from 'lucide-react'
import type { UserStatus, ActivityType } from '@/stores/presenceStore'

interface UserAvatarProps {
  name: string
  email?: string
  avatar?: string
  color?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  status?: UserStatus
  activity?: ActivityType
  isTyping?: boolean
  typingIn?: 'chat' | 'editor' | 'search'
  showStatus?: boolean
  showActivity?: boolean
  className?: string
  onClick?: () => void
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
}

const STATUS_INDICATOR_SIZE = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
}

const STATUS_COLORS: Record<UserStatus, string> = {
  online: 'bg-rose-gold-500',
  away: 'bg-rose-gold-500',
  busy: 'bg-rose-gold-500',
  offline: 'bg-gray-500',
}

const ACTIVITY_ICONS = {
  typing: MessageSquare,
  editing: Edit3,
  viewing: Eye,
  reviewing: Search,
  idle: null,
}

export default function UserAvatar({
  name,
  avatar,
  color,
  size = 'md',
  status = 'online',
  activity = 'idle',
  isTyping = false,
  typingIn,
  showStatus = true,
  showActivity = false,
  className = '',
  onClick,
}: UserAvatarProps) {
  // Generate initials from name
  const initials = useMemo(() => {
    const parts = name.split(' ').filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }, [name])

  // Determine background color
  const backgroundColor = color || generateColorFromName(name)

  // Get activity icon
  const ActivityIcon = isTyping
    ? ACTIVITY_ICONS[typingIn === 'editor' ? 'editing' : typingIn === 'search' ? 'reviewing' : 'typing']
    : ACTIVITY_ICONS[activity]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={`relative inline-flex ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Open profile for ${name}` : undefined}
    >
      {/* Avatar circle */}
      <div
        className={`
          ${SIZE_CLASSES[size]}
          rounded-full flex items-center justify-center font-medium
          transition-transform duration-200
          ${onClick ? 'cursor-pointer hover:scale-105' : ''}
          ${avatar ? '' : 'text-white'}
        `}
        style={{ backgroundColor: avatar ? undefined : backgroundColor }}
        title={name}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {/* Status indicator */}
      {showStatus && (
        <span
          className={`
            absolute bottom-0 right-0
            ${STATUS_INDICATOR_SIZE[size]}
            ${STATUS_COLORS[status]}
            rounded-full border-2 border-dark-500
            ${status === 'online' ? 'animate-pulse' : ''}
          `}
          title={status.charAt(0).toUpperCase() + status.slice(1)}
        />
      )}

      {/* Activity badge */}
      {showActivity && ActivityIcon && (
        <span
          className={`
            absolute -top-1 -right-1
            w-4 h-4 rounded-full
            bg-dark-400 border border-rose-gold-400/30
            flex items-center justify-center
            ${isTyping ? 'animate-pulse' : ''}
          `}
          style={{ color: backgroundColor }}
        >
          <ActivityIcon className="w-2.5 h-2.5" />
        </span>
      )}

      {/* Typing indicator animation */}
      {isTyping && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          <span
            className="w-1 h-1 rounded-full animate-bounce"
            style={{ backgroundColor, animationDelay: '0ms' }}
          />
          <span
            className="w-1 h-1 rounded-full animate-bounce"
            style={{ backgroundColor, animationDelay: '150ms' }}
          />
          <span
            className="w-1 h-1 rounded-full animate-bounce"
            style={{ backgroundColor, animationDelay: '300ms' }}
          />
        </span>
      )}
    </div>
  )
}

/**
 * Generate a consistent color from a name string
 */
function generateColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Generate HSL color with good saturation and lightness
  const h = Math.abs(hash % 360)
  const s = 60 + (hash % 20) // 60-80% saturation
  const l = 45 + (hash % 15) // 45-60% lightness

  return `hsl(${h}, ${s}%, ${l}%)`
}

/**
 * AvatarGroup Component
 * Displays a group of overlapping avatars with overflow count
 */
interface AvatarGroupProps {
  users: Array<{
    id: string
    name: string
    avatar?: string
    color?: string
    status?: UserStatus
    isTyping?: boolean
  }>
  max?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  onUserClick?: (userId: string) => void
  onOverflowClick?: () => void
}

export function AvatarGroup({
  users,
  max = 4,
  size = 'sm',
  className = '',
  onUserClick,
  onOverflowClick,
}: AvatarGroupProps) {
  const visibleUsers = users.slice(0, max)
  const overflowCount = Math.max(0, users.length - max)

  const overlapClass = {
    xs: '-ml-1.5',
    sm: '-ml-2',
    md: '-ml-2.5',
    lg: '-ml-3',
  }

  return (
    <div className={`flex items-center ${className}`}>
      {visibleUsers.map((user, index) => (
        <div
          key={user.id}
          className={`${index > 0 ? overlapClass[size] : ''} transition-transform hover:z-10 hover:-translate-y-0.5`}
          style={{ zIndex: visibleUsers.length - index }}
        >
          <UserAvatar
            name={user.name}
            avatar={user.avatar}
            color={user.color}
            status={user.status}
            size={size}
            isTyping={user.isTyping}
            onClick={onUserClick ? () => onUserClick(user.id) : undefined}
          />
        </div>
      ))}
      {overflowCount > 0 && (
        <button
          onClick={onOverflowClick}
          className={`
            ${overlapClass[size]}
            ${SIZE_CLASSES[size]}
            rounded-full bg-dark-300 border border-rose-gold-400/30
            flex items-center justify-center
            text-rose-gold-400 font-medium
            hover:bg-dark-200 hover:-translate-y-0.5
            transition-all duration-200
          `}
          title={`${overflowCount} more users`}
        >
          +{overflowCount}
        </button>
      )}
    </div>
  )
}
