/**
 * ActivityFeed Component
 * Shows recent actions and activities in the project
 */

import { useState, useMemo } from 'react'
import {
  Activity,
  FileText,
  FilePlus,
  FileX,
  MessageSquare,
  Layout,
  LogIn,
  LogOut,
  MessageCircle,
  Clock,
  Filter,
  ChevronDown,
  Sparkles,
} from 'lucide-react'
import UserAvatar from './ui/UserAvatar'
import { usePresenceStore, ActivityFeedItem } from '@/stores/presenceStore'
import { formatDistanceToNow } from '@/utils/dateUtils'

interface ActivityFeedProps {
  maxItems?: number
  showFilters?: boolean
  compact?: boolean
  className?: string
}

const ACTIVITY_CONFIG: Record<
  ActivityFeedItem['type'],
  { icon: typeof FileText; label: string; color: string }
> = {
  file_create: { icon: FilePlus, label: 'created', color: 'text-rose-gold-400' },
  file_edit: { icon: FileText, label: 'edited', color: 'text-rose-gold-400' },
  file_delete: { icon: FileX, label: 'deleted', color: 'text-rose-gold-400' },
  chat_message: { icon: MessageSquare, label: 'sent', color: 'text-rose-gold-400' },
  view_change: { icon: Layout, label: 'switched to', color: 'text-rose-gold-400' },
  join: { icon: LogIn, label: 'joined', color: 'text-rose-gold-400' },
  leave: { icon: LogOut, label: 'left', color: 'text-gray-400' },
  comment: { icon: MessageCircle, label: 'commented on', color: 'text-rose-gold-400' },
}

type FilterType = 'all' | 'files' | 'collaboration' | 'chat'

export default function ActivityFeed({
  maxItems = 20,
  showFilters = true,
  compact = false,
  className = '',
}: ActivityFeedProps) {
  const { activityFeed } = usePresenceStore()
  const [filter, setFilter] = useState<FilterType>('all')
  const [expanded, setExpanded] = useState(true)

  const filteredActivities = useMemo(() => {
    let filtered = activityFeed

    switch (filter) {
      case 'files':
        filtered = activityFeed.filter(a =>
          ['file_create', 'file_edit', 'file_delete'].includes(a.type)
        )
        break
      case 'collaboration':
        filtered = activityFeed.filter(a =>
          ['join', 'leave', 'comment', 'view_change'].includes(a.type)
        )
        break
      case 'chat':
        filtered = activityFeed.filter(a => a.type === 'chat_message')
        break
    }

    return filtered.slice(0, maxItems)
  }, [activityFeed, filter, maxItems])

  // Group activities by time
  const groupedActivities = useMemo(() => {
    const groups: { label: string; items: ActivityFeedItem[] }[] = []
    const now = new Date()
    const today: ActivityFeedItem[] = []
    const yesterday: ActivityFeedItem[] = []
    const earlier: ActivityFeedItem[] = []

    filteredActivities.forEach(activity => {
      const activityDate = new Date(activity.timestamp)
      const daysDiff = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff === 0) {
        today.push(activity)
      } else if (daysDiff === 1) {
        yesterday.push(activity)
      } else {
        earlier.push(activity)
      }
    })

    if (today.length > 0) groups.push({ label: 'Today', items: today })
    if (yesterday.length > 0) groups.push({ label: 'Yesterday', items: yesterday })
    if (earlier.length > 0) groups.push({ label: 'Earlier', items: earlier })

    return groups
  }, [filteredActivities])

  if (compact) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
          <Activity className="w-4 h-4 text-rose-gold-400" />
          <span className="text-sm font-medium text-white">Activity</span>
        </div>
        <div className="max-h-[300px] overflow-y-auto morphic-scrollbar">
          {filteredActivities.slice(0, 5).map(activity => (
            <CompactActivityItem key={activity.id} activity={activity} />
          ))}
          {filteredActivities.length === 0 && (
            <div className="px-4 py-6 text-center text-white/40 text-sm">
              No recent activity
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2"
        >
          <Activity className="w-4 h-4 text-rose-gold-400" />
          <span className="text-sm font-medium text-white">Activity Feed</span>
          <ChevronDown
            className={`w-4 h-4 text-white/40 transition-transform ${
              expanded ? '' : '-rotate-90'
            }`}
          />
        </button>

        {showFilters && expanded && (
          <FilterDropdown value={filter} onChange={setFilter} />
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div className="max-h-[400px] overflow-y-auto morphic-scrollbar">
          {groupedActivities.map(group => (
            <div key={group.label}>
              <div className="px-4 py-2 sticky top-0 bg-dark-400/95 backdrop-blur-sm border-b border-white/5">
                <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              <div className="divide-y divide-white/5">
                {group.items.map(activity => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            </div>
          ))}

          {filteredActivities.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Sparkles className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/40">No activity yet</p>
              <p className="text-xs text-white/30 mt-1">
                Activity will appear here as your team works
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ActivityItem Component
 * Full activity row with avatar and details
 */
interface ActivityItemProps {
  activity: ActivityFeedItem
}

function ActivityItem({ activity }: ActivityItemProps) {
  const config = ACTIVITY_CONFIG[activity.type]
  const Icon = config.icon

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
      <UserAvatar
        name={activity.userName}
        color={activity.userColor}
        size="sm"
        showStatus={false}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium text-white">{activity.userName}</span>
          <span className="text-white/50"> {activity.description}</span>
        </p>
        {activity.target && (
          <p className="text-xs text-white/40 mt-0.5 truncate">
            {activity.target}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-xs text-white/30">
          <Clock className="w-3 h-3" />
          <span>{formatDistanceToNow(activity.timestamp)}</span>
        </div>
      </div>

      <div className={`p-1.5 rounded-lg bg-white/5 ${config.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
    </div>
  )
}

/**
 * CompactActivityItem Component
 * Minimal activity row for compact view
 */
function CompactActivityItem({ activity }: ActivityItemProps) {
  const config = ACTIVITY_CONFIG[activity.type]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium"
        style={{ backgroundColor: activity.userColor }}
      >
        {activity.userName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">
          <span className="text-white">{activity.userName}</span>
          <span className="text-white/40"> {activity.description}</span>
        </p>
      </div>
      <Icon className={`w-3 h-3 ${config.color}`} />
    </div>
  )
}

/**
 * FilterDropdown Component
 */
interface FilterDropdownProps {
  value: FilterType
  onChange: (value: FilterType) => void
}

function FilterDropdown({ value, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false)

  const options: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All Activity' },
    { value: 'files', label: 'File Changes' },
    { value: 'collaboration', label: 'Collaboration' },
    { value: 'chat', label: 'Chat Messages' },
  ]

  const current = options.find(o => o.value === value) || options[0]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
      >
        <Filter className="w-3 h-3" />
        <span>{current.label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 bg-dark-300 border border-rose-gold-400/20 rounded-xl p-1 min-w-[140px] shadow-xl">
            {options.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`
                  w-full px-3 py-2 rounded-lg text-xs text-left
                  ${option.value === value ? 'bg-rose-gold-400/10 text-rose-gold-400' : 'text-white/70 hover:bg-white/5'}
                  transition-colors
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
