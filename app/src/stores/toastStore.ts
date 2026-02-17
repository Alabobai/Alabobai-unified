/**
 * Toast Notification Store
 * Manages toast notifications with auto-dismiss and manual dismiss functionality
 */

import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number // in milliseconds, 0 for no auto-dismiss
  dismissible?: boolean
  action?: {
    label: string
    onClick: () => void
  }
  createdAt: Date
}

export interface ToastOptions {
  type?: ToastType
  title: string
  message?: string
  duration?: number
  dismissible?: boolean
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastState {
  toasts: Toast[]

  // Actions
  addToast: (options: ToastOptions) => string
  removeToast: (id: string) => void
  clearAllToasts: () => void

  // Convenience methods
  success: (title: string, message?: string, duration?: number) => string
  error: (title: string, message?: string, duration?: number) => string
  warning: (title: string, message?: string, duration?: number) => string
  info: (title: string, message?: string, duration?: number) => string
}

// Default durations by type (in milliseconds)
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000, // Errors stay longer so users can read them
}

// Maximum number of toasts to show at once
const MAX_TOASTS = 5

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (options: ToastOptions) => {
    const id = crypto.randomUUID()
    const type = options.type || 'info'
    const duration = options.duration ?? DEFAULT_DURATIONS[type]

    const toast: Toast = {
      id,
      type,
      title: options.title,
      message: options.message,
      duration,
      dismissible: options.dismissible ?? true,
      action: options.action,
      createdAt: new Date(),
    }

    set((state) => {
      // Remove oldest toasts if we exceed the maximum
      let newToasts = [...state.toasts, toast]
      if (newToasts.length > MAX_TOASTS) {
        newToasts = newToasts.slice(-MAX_TOASTS)
      }
      return { toasts: newToasts }
    })

    // Set up auto-dismiss if duration is specified
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id)
      }, duration)
    }

    return id
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }))
  },

  clearAllToasts: () => {
    set({ toasts: [] })
  },

  // Convenience methods for common toast types
  success: (title: string, message?: string, duration?: number) => {
    return get().addToast({ type: 'success', title, message, duration })
  },

  error: (title: string, message?: string, duration?: number) => {
    return get().addToast({ type: 'error', title, message, duration })
  },

  warning: (title: string, message?: string, duration?: number) => {
    return get().addToast({ type: 'warning', title, message, duration })
  },

  info: (title: string, message?: string, duration?: number) => {
    return get().addToast({ type: 'info', title, message, duration })
  },
}))

// Export a singleton-like access for use outside of React components
export const toast = {
  success: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().success(title, message, duration),
  error: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().error(title, message, duration),
  warning: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().warning(title, message, duration),
  info: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().info(title, message, duration),
  dismiss: (id: string) => useToastStore.getState().removeToast(id),
  dismissAll: () => useToastStore.getState().clearAllToasts(),
}

export default useToastStore
