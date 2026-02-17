/**
 * Toast Notification Component
 * Displays toast notifications with success, error, warning, and info variants
 * Rose-gold themed styling with auto-dismiss and manual dismiss options
 */

import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore, Toast as ToastType, ToastType as ToastVariant } from '@/stores/toastStore'

// Toast icon and color configurations
const TOAST_CONFIG: Record<ToastVariant, {
  icon: typeof CheckCircle
  bgClass: string
  borderClass: string
  iconClass: string
  progressClass: string
}> = {
  success: {
    icon: CheckCircle,
    bgClass: 'bg-rose-gold-400/10',
    borderClass: 'border-rose-gold-400/30',
    iconClass: 'text-rose-gold-400',
    progressClass: 'bg-rose-gold-400',
  },
  error: {
    icon: AlertCircle,
    bgClass: 'bg-rose-gold-500/10',
    borderClass: 'border-rose-gold-400/30',
    iconClass: 'text-rose-gold-400',
    progressClass: 'bg-rose-gold-500',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-rose-gold-500/10',
    borderClass: 'border-rose-gold-400/30',
    iconClass: 'text-rose-gold-400',
    progressClass: 'bg-rose-gold-500',
  },
  info: {
    icon: Info,
    bgClass: 'bg-rose-gold-400/10',
    borderClass: 'border-rose-gold-400/30',
    iconClass: 'text-rose-gold-400',
    progressClass: 'bg-rose-gold-400',
  },
}

interface ToastItemProps {
  toast: ToastType
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false)
  const [progress, setProgress] = useState(100)

  const config = TOAST_CONFIG[toast.type]
  const Icon = config.icon

  // Handle progress bar animation
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return

    const startTime = Date.now()
    const duration = toast.duration

    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)

      if (remaining > 0) {
        requestAnimationFrame(updateProgress)
      }
    }

    requestAnimationFrame(updateProgress)
  }, [toast.duration])

  // Handle dismiss with animation
  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 200) // Match animation duration
  }

  return (
    <div
      className={`
        relative overflow-hidden
        w-full max-w-md
        rounded-xl border backdrop-blur-md
        shadow-lg shadow-black/20
        transform transition-all duration-200 ease-out
        ${config.bgClass} ${config.borderClass}
        ${isExiting ? 'opacity-0 translate-x-4 scale-95' : 'opacity-100 translate-x-0 scale-100'}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className={`flex-shrink-0 ${config.iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{toast.title}</p>
          {toast.message && (
            <p className="mt-1 text-sm text-white/70">{toast.message}</p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick()
                handleDismiss()
              }}
              className="mt-2 text-sm font-medium text-rose-gold-400 hover:text-rose-gold-300 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Dismiss button */}
        {toast.dismissible && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      {toast.duration && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
          <div
            className={`h-full transition-none ${config.progressClass}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Toast Container Component
 * Renders all active toasts in a stack at the bottom-right of the screen
 */
export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto animate-slide-up">
          <ToastItem toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
