/**
 * Date Utilities
 * Helper functions for date formatting and manipulation
 */

/**
 * Format a date relative to now (e.g., "2 minutes ago", "3 hours ago")
 */
export function formatDistanceToNow(date: Date | string | number): string {
  const now = new Date()
  const target = new Date(date)
  const diffMs = now.getTime() - target.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffSeconds < 5) {
    return 'just now'
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`
  }
  if (diffWeeks < 4) {
    return `${diffWeeks}w ago`
  }
  if (diffMonths < 12) {
    return `${diffMonths}mo ago`
  }
  return `${diffYears}y ago`
}

/**
 * Format a date for display (e.g., "Jan 15, 2024")
 */
export function formatDate(date: Date | string | number): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format a time for display (e.g., "2:30 PM")
 */
export function formatTime(date: Date | string | number): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Format a date and time for display (e.g., "Jan 15, 2024 at 2:30 PM")
 */
export function formatDateTime(date: Date | string | number): string {
  return `${formatDate(date)} at ${formatTime(date)}`
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string | number): boolean {
  const today = new Date()
  const target = new Date(date)
  return (
    target.getDate() === today.getDate() &&
    target.getMonth() === today.getMonth() &&
    target.getFullYear() === today.getFullYear()
  )
}

/**
 * Check if a date is yesterday
 */
export function isYesterday(date: Date | string | number): boolean {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const target = new Date(date)
  return (
    target.getDate() === yesterday.getDate() &&
    target.getMonth() === yesterday.getMonth() &&
    target.getFullYear() === yesterday.getFullYear()
  )
}

/**
 * Get a human-readable date label
 */
export function getDateLabel(date: Date | string | number): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return formatDate(date)
}
