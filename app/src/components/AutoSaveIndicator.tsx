/**
 * AutoSaveIndicator Component
 * Shows save status with auto-save functionality
 */

import { useState, useEffect } from 'react'
import { Save, Check, Loader2, AlertCircle, Clock } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'

// ============================================================================
// Types
// ============================================================================

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

interface AutoSaveIndicatorProps {
  className?: string
  showLastSaved?: boolean
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

export default function AutoSaveIndicator({
  className = '',
  showLastSaved = true,
  compact = false,
}: AutoSaveIndicatorProps) {
  const { hasUnsavedChanges, isSaving, lastSavedAt, autoSaveEnabled } = useProjectStore()
  const [status, setStatus] = useState<SaveStatus>('saved')

  // Determine current status
  useEffect(() => {
    if (isSaving) {
      setStatus('saving')
    } else if (hasUnsavedChanges) {
      setStatus('unsaved')
    } else {
      setStatus('saved')
    }
  }, [hasUnsavedChanges, isSaving])

  // Format last saved time
  const formatLastSaved = () => {
    if (!lastSavedAt) return null

    const now = new Date()
    const diff = now.getTime() - new Date(lastSavedAt).getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 10) return 'Just now'
    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return new Date(lastSavedAt).toLocaleDateString()
  }

  const statusConfig = {
    saved: {
      icon: Check,
      text: 'Saved',
      color: 'text-rose-gold-400',
      bgColor: 'bg-rose-gold-500/10',
      animate: false,
    },
    saving: {
      icon: Loader2,
      text: 'Saving...',
      color: 'text-rose-gold-400',
      bgColor: 'bg-rose-gold-500/10',
      animate: true,
    },
    unsaved: {
      icon: Save,
      text: 'Unsaved changes',
      color: 'text-rose-gold-400',
      bgColor: 'bg-rose-gold-500/10',
      animate: false,
    },
    error: {
      icon: AlertCircle,
      text: 'Save failed',
      color: 'text-rose-gold-400',
      bgColor: 'bg-rose-gold-500/10',
      animate: false,
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bgColor} ${className}`}
        title={`${config.text}${lastSavedAt ? ` - Last saved ${formatLastSaved()}` : ''}`}
      >
        <Icon
          className={`w-3 h-3 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
        />
        {status === 'unsaved' && (
          <span className="w-1.5 h-1.5 rounded-full bg-rose-gold-500 animate-pulse" />
        )}
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.bgColor} ${className}`}
    >
      <Icon
        className={`w-4 h-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
      />
      <span className={`text-xs font-medium ${config.color}`}>{config.text}</span>

      {showLastSaved && lastSavedAt && status === 'saved' && (
        <span className="text-xs text-white/40 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatLastSaved()}
        </span>
      )}

      {autoSaveEnabled && (
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Auto</span>
      )}
    </div>
  )
}

// ============================================================================
// Mini Indicator (for toolbar)
// ============================================================================

export function SaveStatusDot() {
  const { hasUnsavedChanges, isSaving } = useProjectStore()

  if (isSaving) {
    return (
      <Loader2 className="w-3 h-3 text-rose-gold-400 animate-spin" />
    )
  }

  if (hasUnsavedChanges) {
    return (
      <span className="w-2 h-2 rounded-full bg-rose-gold-500 animate-pulse" title="Unsaved changes" />
    )
  }

  return (
    <span className="w-2 h-2 rounded-full bg-rose-gold-500" title="All changes saved" />
  )
}

// ============================================================================
// Save Button
// ============================================================================

interface SaveButtonProps {
  onSave: () => void
  className?: string
}

export function SaveButton({ onSave, className = '' }: SaveButtonProps) {
  const { hasUnsavedChanges, isSaving } = useProjectStore()

  return (
    <button
      onClick={onSave}
      disabled={!hasUnsavedChanges || isSaving}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
        hasUnsavedChanges && !isSaving
          ? 'bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30'
          : 'bg-white/5 text-white/30 cursor-not-allowed'
      } ${className}`}
      title={hasUnsavedChanges ? 'Save changes (Ctrl+S)' : 'All changes saved'}
    >
      {isSaving ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      <span className="text-sm">Save</span>
    </button>
  )
}
