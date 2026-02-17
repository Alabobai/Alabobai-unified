/**
 * NotificationCenter Component
 * Dropdown notification panel with badge counts
 */

import { useState, useRef, useEffect } from 'react'
import {
  Bell,
  BellRing,
  X,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  Info,
  AtSign,
  RefreshCw,
  Users,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import UserAvatar from './ui/UserAvatar'
import { usePresenceStore, Notification } from '@/stores/presenceStore'
import { formatDistanceToNow } from '@/utils/dateUtils'

interface NotificationCenterProps {
  className?: string
}

export default function NotificationCenter({ className = '' }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    notificationCenterOpen,
    toggleNotificationCenter,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearAllNotifications,
  } = usePresenceStore()

  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (notificationCenterOpen) {
          toggleNotificationCenter()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notificationCenterOpen, toggleNotificationCenter])

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell Button with Badge */}
      <button
        onClick={toggleNotificationCenter}
        className={`
          relative p-2 rounded-xl transition-colors
          ${notificationCenterOpen
            ? 'text-rose-gold-400 bg-rose-gold-400/15 border border-rose-gold-400/30'
            : 'text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10'
          }
        `}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 animate-wiggle" />
        ) : (
          <Bell className="w-5 h-5" />
        )}

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-gold-500 text-dark-500 text-[10px] font-bold flex items-center justify-center animate-bounce-in">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {notificationCenterOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[500px] bg-dark-300 border border-rose-gold-400/20 rounded-xl shadow-xl overflow-hidden animate-slide-down z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-rose-gold-400" />
              <span className="font-medium text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-gold-400/20 text-rose-gold-400 text-xs">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-500/10 transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => {/* Open notification settings */}}
                className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                title="Notification settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto morphic-scrollbar">
            {notifications.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="divide-y divide-white/5">
                {notifications.map(notification => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={() => markNotificationRead(notification.id)}
                    onRemove={() => removeNotification(notification.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-white/10">
              <button className="w-full py-2 text-center text-sm text-rose-gold-400 hover:text-rose-gold-300 transition-colors">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * NotificationItem Component
 */
interface NotificationItemProps {
  notification: Notification
  onMarkRead: () => void
  onRemove: () => void
}

function NotificationItem({ notification, onMarkRead, onRemove }: NotificationItemProps) {
  const [showActions, setShowActions] = useState(false)

  const getTypeIcon = () => {
    switch (notification.type) {
      case 'mention':
        return AtSign
      case 'update':
        return RefreshCw
      case 'collaboration':
        return Users
      case 'system':
        return AlertCircle
      default:
        return Info
    }
  }

  const TypeIcon = getTypeIcon()

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead()
    }
    if (notification.actionUrl) {
      // Navigate to action URL
      console.log('Navigate to:', notification.actionUrl)
    }
  }

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3 cursor-pointer
        transition-colors
        ${notification.read ? 'bg-transparent' : 'bg-rose-gold-400/5'}
        hover:bg-white/5
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={handleClick}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rose-gold-400" />
      )}

      {/* Avatar or Icon */}
      {notification.userName && notification.userColor ? (
        <UserAvatar
          name={notification.userName}
          color={notification.userColor}
          size="sm"
          showStatus={false}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-rose-gold-400/10 flex items-center justify-center">
          <TypeIcon className="w-4 h-4 text-rose-gold-400" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${notification.read ? 'text-white/70' : 'text-white'}`}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}
        <p className="text-xs text-white/30 mt-1">
          {formatDistanceToNow(notification.timestamp)}
        </p>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-1">
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkRead()
              }}
              className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
              title="Mark as read"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-1.5 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-500/10 transition-colors"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Action indicator */}
      {notification.actionUrl && !showActions && (
        <ChevronRight className="w-4 h-4 text-white/20" />
      )}
    </div>
  )
}

/**
 * EmptyState Component
 */
function EmptyState() {
  return (
    <div className="px-4 py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
        <Bell className="w-6 h-6 text-white/20" />
      </div>
      <p className="text-sm text-white/50">No notifications</p>
      <p className="text-xs text-white/30 mt-1">
        You're all caught up!
      </p>
    </div>
  )
}

/**
 * NotificationBadge Component
 * Standalone badge for use in other components
 */
export function NotificationBadge({ className = '' }: { className?: string }) {
  const { unreadCount } = usePresenceStore()

  if (unreadCount === 0) return null

  return (
    <span
      className={`
        min-w-[18px] h-[18px] px-1 rounded-full
        bg-rose-gold-500 text-dark-500 text-[10px] font-bold
        flex items-center justify-center
        ${className}
      `}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  )
}
