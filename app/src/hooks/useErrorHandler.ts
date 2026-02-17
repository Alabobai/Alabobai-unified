/**
 * Error Handler Hook
 * Provides standardized error handling with toast notifications
 */

import { useCallback } from 'react'
import { toast } from '@/stores/toastStore'

export interface ErrorHandlerOptions {
  /** Custom error title */
  title?: string
  /** Whether to log the error to console */
  logToConsole?: boolean
  /** Custom handler to run after showing toast */
  onError?: (error: Error) => void
  /** Whether to show toast (default: true) */
  showToast?: boolean
}

export interface UseErrorHandlerReturn {
  /** Wrap an async function with error handling */
  handleAsync: <T>(
    fn: () => Promise<T>,
    options?: ErrorHandlerOptions
  ) => Promise<T | null>
  /** Handle an error directly */
  handleError: (error: unknown, options?: ErrorHandlerOptions) => void
  /** Wrap an async function that returns a result or throws */
  tryAsync: <T>(
    fn: () => Promise<T>,
    fallback?: T
  ) => Promise<T>
}

/**
 * Hook for standardized error handling with toast notifications
 *
 * @example
 * const { handleAsync, handleError } = useErrorHandler()
 *
 * // Wrap async operations
 * const result = await handleAsync(async () => {
 *   return await fetchData()
 * }, { title: 'Failed to fetch data' })
 *
 * // Handle errors directly
 * try {
 *   await riskyOperation()
 * } catch (e) {
 *   handleError(e, { title: 'Operation failed' })
 * }
 */
export function useErrorHandler(): UseErrorHandlerReturn {
  const handleError = useCallback(
    (error: unknown, options: ErrorHandlerOptions = {}) => {
      const {
        title,
        logToConsole = true,
        onError,
        showToast = true,
      } = options

      const err = normalizeError(error)

      if (logToConsole) {
        console.error('[ErrorHandler]', err)
      }

      if (showToast) {
        const { toastTitle, toastMessage } = getErrorMessage(err, title)
        toast.error(toastTitle, toastMessage)
      }

      onError?.(err)
    },
    []
  )

  const handleAsync = useCallback(
    async <T>(
      fn: () => Promise<T>,
      options: ErrorHandlerOptions = {}
    ): Promise<T | null> => {
      try {
        return await fn()
      } catch (error) {
        handleError(error, options)
        return null
      }
    },
    [handleError]
  )

  const tryAsync = useCallback(
    async <T>(fn: () => Promise<T>, fallback?: T): Promise<T> => {
      try {
        return await fn()
      } catch (error) {
        handleError(error, { showToast: true })
        if (fallback !== undefined) {
          return fallback
        }
        throw error
      }
    },
    [handleError]
  )

  return { handleAsync, handleError, tryAsync }
}

/**
 * Normalize any error to an Error object
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'string') {
    return new Error(error)
  }
  if (typeof error === 'object' && error !== null) {
    const message =
      (error as Record<string, unknown>).message ||
      (error as Record<string, unknown>).error ||
      JSON.stringify(error)
    return new Error(String(message))
  }
  return new Error('An unknown error occurred')
}

/**
 * Get user-friendly error message based on error type
 */
function getErrorMessage(
  error: Error,
  customTitle?: string
): { toastTitle: string; toastMessage: string } {
  const message = error.message.toLowerCase()

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('net::err')
  ) {
    return {
      toastTitle: customTitle || 'Connection Error',
      toastMessage:
        'Unable to connect to the server. Please check your internet connection.',
    }
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      toastTitle: customTitle || 'Request Timeout',
      toastMessage: 'The request took too long. Please try again.',
    }
  }

  // Authentication errors
  if (
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('authentication')
  ) {
    return {
      toastTitle: customTitle || 'Authentication Required',
      toastMessage: 'Please sign in to continue.',
    }
  }

  // Permission errors
  if (
    message.includes('forbidden') ||
    message.includes('403') ||
    message.includes('permission')
  ) {
    return {
      toastTitle: customTitle || 'Access Denied',
      toastMessage: "You don't have permission to perform this action.",
    }
  }

  // Not found errors
  if (message.includes('not found') || message.includes('404')) {
    return {
      toastTitle: customTitle || 'Not Found',
      toastMessage: 'The requested resource could not be found.',
    }
  }

  // Rate limit errors
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return {
      toastTitle: customTitle || 'Rate Limited',
      toastMessage: 'Too many requests. Please wait a moment and try again.',
    }
  }

  // Server errors
  if (message.includes('500') || message.includes('server error')) {
    return {
      toastTitle: customTitle || 'Server Error',
      toastMessage: 'Something went wrong on the server. Please try again later.',
    }
  }

  // Abort errors (user cancelled)
  if (message.includes('abort')) {
    return {
      toastTitle: 'Cancelled',
      toastMessage: 'The operation was cancelled.',
    }
  }

  // Default error
  return {
    toastTitle: customTitle || 'Error',
    toastMessage: error.message || 'An unexpected error occurred.',
  }
}

export default useErrorHandler
