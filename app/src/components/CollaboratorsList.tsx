/**
 * CollaboratorsList Component
 * Shows all collaborators in workspace with their current activity
 */

import { useState } from 'react'
import {
  Users,
  Eye,
  Edit3,
  MessageSquare,
  Search,
  ChevronRight,
  Circle,
  MoreHorizontal,
  UserPlus,
  Video,
  Phone,
} from 'lucide-react'
import UserAvatar from './ui/UserAvatar'
import { usePresenceStore, UserPresence, UserStatus } from '@/stores/presenceStore'

interface CollaboratorsListProps {
  collapsed?: boolean
  onFollowUser?: (userId: string) => void
  className?: string
}

export default function CollaboratorsList({
  collapsed = false,
  onFollowUser,
  className = '',
}: CollaboratorsListProps) {
  const { users, currentUser } = usePresenceStore()
  const [expandedSection, setExpandedSection] = useState<string | null>('online')

  // Group users by status
  const onlineUsers = users.filter(u => u.status === 'online')
  const busyUsers = users.filter(u => u.status === 'busy')
  const awayUsers = users.filter(u => u.status === 'away')
  const offlineUsers = users.filter(u => u.status === 'offline')

  const sections = [
    { id: 'online', label: 'Online', users: onlineUsers, color: 'text-rose-gold-400' },
    { id: 'busy', label: 'Busy', users: busyUsers, color: 'text-rose-gold-400' },
    { id: 'away', label: 'Away', users: awayUsers, color: 'text-rose-gold-400' },
    { id: 'offline', label: 'Offline', users: offlineUsers, color: 'text-gray-500' },
  ]

  if (collapsed) {
    return (
      <div className={`py-2 ${className}`}>
        <div className="flex flex-col items-center gap-2">
          {currentUser && (
            <UserAvatar
              name={currentUser.name}
              color={currentUser.color}
              status={currentUser.status}
              size="sm"
            />
          )}
          <div className="w-px h-4 bg-white/10" />
          {onlineUsers.slice(0, 4).map(user => (
            <UserAvatar
              key={user.id}
              name={user.name}
              color={user.color}
              status={user.status}
              size="sm"
              isTyping={user.isTyping}
              onClick={() => onFollowUser?.(user.id)}
            />
          ))}
          {onlineUsers.length > 4 && (
            <div className="w-8 h-8 rounded-full bg-dark-300 border border-rose-gold-400/30 flex items-center justify-center text-rose-gold-400 text-xs font-medium">
              +{onlineUsers.length - 4}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`py-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-rose-gold-400" />
          <span className="text-sm font-medium text-white">Team</span>
          <span className="px-1.5 py-0.5 rounded-full bg-rose-gold-400/20 text-rose-gold-400 text-xs">
            {onlineUsers.length + busyUsers.length}
          </span>
        </div>
        <button className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors">
          <UserPlus className="w-4 h-4" />
        </button>
      </div>

      {/* Current User */}
      {currentUser && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-gold-400/10 border border-rose-gold-400/20">
            <UserAvatar
              name={currentUser.name}
              color={currentUser.color}
              status={currentUser.status}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-xs text-rose-gold-400/60">You</p>
            </div>
            <StatusDropdown currentStatus={currentUser.status} />
          </div>
        </div>
      )}

      {/* User Sections */}
      <div className="space-y-1">
        {sections.map(section => (
          section.users.length > 0 && (
            <div key={section.id}>
              {/* Section Header */}
              <button
                onClick={() => setExpandedSection(
                  expandedSection === section.id ? null : section.id
                )}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors"
              >
                <ChevronRight
                  className={`w-3 h-3 text-white/40 transition-transform ${
                    expandedSection === section.id ? 'rotate-90' : ''
                  }`}
                />
                <Circle className={`w-2 h-2 ${section.color}`} />
                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
                  {section.label}
                </span>
                <span className="text-xs text-white/40">
                  {section.users.length}
                </span>
              </button>

              {/* Section Users */}
              {expandedSection === section.id && (
                <div className="px-2 pb-2">
                  {section.users.map(user => (
                    <CollaboratorItem
                      key={user.id}
                      user={user}
                      onFollow={() => onFollowUser?.(user.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        ))}
      </div>

      {/* Empty State */}
      {users.length === 0 && (
        <div className="px-4 py-8 text-center">
          <Users className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-sm text-white/40">No team members online</p>
          <button className="mt-3 text-xs text-rose-gold-400 hover:text-rose-gold-300 transition-colors">
            Invite collaborators
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * CollaboratorItem Component
 * Individual collaborator row with activity info
 */
interface CollaboratorItemProps {
  user: UserPresence
  onFollow?: () => void
}

function CollaboratorItem({ user, onFollow }: CollaboratorItemProps) {
  const [showActions, setShowActions] = useState(false)

  const getActivityIcon = () => {
    if (user.isTyping) {
      return user.typingIn === 'chat' ? MessageSquare :
             user.typingIn === 'editor' ? Edit3 : Search
    }
    switch (user.activity) {
      case 'editing':
        return Edit3
      case 'viewing':
        return Eye
      case 'reviewing':
        return Search
      default:
        return null
    }
  }

  const getActivityText = () => {
    if (user.isTyping) {
      return user.typingIn === 'chat' ? 'Typing in chat' :
             user.typingIn === 'editor' ? 'Editing code' : 'Searching'
    }
    switch (user.activity) {
      case 'editing':
        return user.currentFile ? `Editing ${user.currentFile}` : 'Editing'
      case 'viewing':
        return user.currentView ? `In ${user.currentView}` : 'Viewing'
      case 'reviewing':
        return 'Reviewing'
      default:
        return 'Online'
    }
  }

  const ActivityIcon = getActivityIcon()

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={onFollow}
    >
      <UserAvatar
        name={user.name}
        avatar={user.avatar}
        color={user.color}
        status={user.status}
        size="sm"
        isTyping={user.isTyping}
        showActivity
        activity={user.activity}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{user.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          {ActivityIcon && (
            <ActivityIcon
              className="w-3 h-3"
              style={{ color: user.isTyping ? user.color : undefined }}
            />
          )}
          <span className={user.isTyping ? 'animate-pulse' : ''}>
            {getActivityText()}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      {showActions && (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              // Initiate video call
            }}
            className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
            title="Video call"
          >
            <Video className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              // Initiate voice call
            }}
            className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
            title="Voice call"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              // Show more options
            }}
            className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
            title="More options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * StatusDropdown Component
 * Dropdown to change user status
 */
interface StatusDropdownProps {
  currentStatus: UserStatus
  onChange?: (status: UserStatus) => void
}

function StatusDropdown({ currentStatus, onChange }: StatusDropdownProps) {
  const [open, setOpen] = useState(false)

  const statuses: { status: UserStatus; label: string; color: string }[] = [
    { status: 'online', label: 'Online', color: 'bg-rose-gold-500' },
    { status: 'busy', label: 'Busy', color: 'bg-rose-gold-500' },
    { status: 'away', label: 'Away', color: 'bg-rose-gold-500' },
    { status: 'offline', label: 'Invisible', color: 'bg-gray-500' },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 bg-dark-300 border border-rose-gold-400/20 rounded-xl p-1 min-w-[140px] shadow-xl">
            {statuses.map(({ status, label, color }) => (
              <button
                key={status}
                onClick={() => {
                  onChange?.(status)
                  setOpen(false)
                }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left
                  ${status === currentStatus ? 'bg-rose-gold-400/10 text-rose-gold-400' : 'text-white/70 hover:bg-white/5'}
                  transition-colors
                `}
              >
                <span className={`w-2 h-2 rounded-full ${color}`} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
