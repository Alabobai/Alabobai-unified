import { useRef, useEffect, useCallback, useState } from 'react'

export interface TouchGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onPullToRefresh?: () => Promise<void> | void
  onLongPress?: (event: TouchEvent) => void
  swipeThreshold?: number
  longPressDelay?: number
  pullRefreshThreshold?: number
  enabled?: boolean
}

export interface SwipeState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  deltaX: number
  deltaY: number
  direction: 'left' | 'right' | 'up' | 'down' | null
  isSwiping: boolean
}

/**
 * Hook for handling touch gestures including swipe, pull-to-refresh, and long press
 */
export function useTouchGestures<T extends HTMLElement = HTMLElement>(
  options: TouchGestureOptions = {}
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPullToRefresh,
    onLongPress,
    swipeThreshold = 50,
    longPressDelay = 500,
    pullRefreshThreshold = 80,
    enabled = true,
  } = options

  const ref = useRef<T>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Cancel long press timer
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // Touch start handler
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return

      const touch = e.touches[0]
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }

      // Start long press timer
      if (onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          onLongPress(e)
        }, longPressDelay)
      }
    },
    [enabled, onLongPress, longPressDelay]
  )

  // Touch move handler
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !touchStartRef.current) return

      const touch = e.touches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y

      // Cancel long press if user moves
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        cancelLongPress()
      }

      // Pull to refresh logic
      if (onPullToRefresh && !isRefreshing) {
        const element = ref.current
        if (element && element.scrollTop <= 0 && deltaY > 0) {
          setIsPulling(true)
          setPullDistance(Math.min(deltaY, pullRefreshThreshold * 1.5))

          // Prevent default scroll if pulling
          if (deltaY > 10) {
            e.preventDefault()
          }
        }
      }
    },
    [enabled, onPullToRefresh, isRefreshing, cancelLongPress, pullRefreshThreshold]
  )

  // Touch end handler
  const handleTouchEnd = useCallback(
    async (e: TouchEvent) => {
      if (!enabled || !touchStartRef.current) return

      cancelLongPress()

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const time = Date.now() - touchStartRef.current.time

      // Calculate velocity for more responsive swipes
      const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / time

      // Handle pull to refresh
      if (isPulling && pullDistance >= pullRefreshThreshold && onPullToRefresh) {
        setIsRefreshing(true)
        try {
          await onPullToRefresh()
        } finally {
          setIsRefreshing(false)
        }
      }
      setIsPulling(false)
      setPullDistance(0)

      // Determine swipe direction
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      // Only trigger if swipe meets threshold or has good velocity
      const meetsThreshold =
        (absX > swipeThreshold || absY > swipeThreshold) && velocity > 0.2

      if (meetsThreshold) {
        // Horizontal swipe
        if (absX > absY) {
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight()
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft()
          }
        }
        // Vertical swipe
        else {
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown()
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp()
          }
        }
      }

      touchStartRef.current = null
    },
    [
      enabled,
      cancelLongPress,
      isPulling,
      pullDistance,
      pullRefreshThreshold,
      onPullToRefresh,
      swipeThreshold,
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
    ]
  )

  // Touch cancel handler
  const handleTouchCancel = useCallback(() => {
    cancelLongPress()
    touchStartRef.current = null
    setIsPulling(false)
    setPullDistance(0)
  }, [cancelLongPress])

  // Attach event listeners
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
    element.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('touchcancel', handleTouchCancel)
      cancelLongPress()
    }
  }, [
    enabled,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    cancelLongPress,
  ])

  return {
    ref,
    isPulling,
    pullDistance,
    isRefreshing,
    // Normalized pull progress (0 to 1)
    pullProgress: Math.min(pullDistance / pullRefreshThreshold, 1),
  }
}

/**
 * Simple swipe-only hook for lighter use cases
 */
export function useSwipeGesture<T extends HTMLElement = HTMLElement>(
  onSwipe: (direction: 'left' | 'right' | 'up' | 'down') => void,
  options: { threshold?: number; enabled?: boolean } = {}
) {
  const { threshold = 50, enabled = true } = options
  const ref = useRef<T>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    const handleStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startRef.current = { x: touch.clientX, y: touch.clientY }
    }

    const handleEnd = (e: TouchEvent) => {
      if (!startRef.current) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - startRef.current.x
      const deltaY = touch.clientY - startRef.current.y
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      if (absX > threshold || absY > threshold) {
        if (absX > absY) {
          onSwipe(deltaX > 0 ? 'right' : 'left')
        } else {
          onSwipe(deltaY > 0 ? 'down' : 'up')
        }
      }

      startRef.current = null
    }

    element.addEventListener('touchstart', handleStart, { passive: true })
    element.addEventListener('touchend', handleEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleStart)
      element.removeEventListener('touchend', handleEnd)
    }
  }, [enabled, threshold, onSwipe])

  return ref
}

/**
 * Hook for back navigation gesture (iOS-style swipe from left edge)
 */
export function useBackGesture(
  onBack: () => void,
  options: { edgeWidth?: number; enabled?: boolean } = {}
) {
  const { edgeWidth = 20, enabled = true } = options
  const startRef = useRef<{ x: number; fromEdge: boolean } | null>(null)

  useEffect(() => {
    if (!enabled) return

    const handleStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      const fromEdge = touch.clientX < edgeWidth
      startRef.current = { x: touch.clientX, fromEdge }
    }

    const handleEnd = (e: TouchEvent) => {
      if (!startRef.current?.fromEdge) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - startRef.current.x

      // Swipe from left edge to right
      if (deltaX > 100) {
        onBack()
      }

      startRef.current = null
    }

    document.addEventListener('touchstart', handleStart, { passive: true })
    document.addEventListener('touchend', handleEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleStart)
      document.removeEventListener('touchend', handleEnd)
    }
  }, [enabled, edgeWidth, onBack])
}

/**
 * Hook for long press context menu
 */
export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: (event: TouchEvent | MouseEvent, element: T) => void,
  options: { delay?: number; enabled?: boolean } = {}
) {
  const { delay = 500, enabled = true } = options
  const ref = useRef<T>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [isPressed, setIsPressed] = useState(false)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsPressed(false)
  }, [])

  const start = useCallback(
    (e: TouchEvent | MouseEvent) => {
      if (!enabled || !ref.current) return

      setIsPressed(true)
      timerRef.current = setTimeout(() => {
        onLongPress(e, ref.current!)
        setIsPressed(false)
      }, delay)
    },
    [enabled, delay, onLongPress]
  )

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    const handleTouchStart = (e: TouchEvent) => start(e)
    const handleMouseDown = (e: MouseEvent) => start(e)
    const handleTouchEnd = () => cancel()
    const handleTouchMove = () => cancel()
    const handleMouseUp = () => cancel()
    const handleMouseLeave = () => cancel()

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('mousedown', handleMouseDown)
    element.addEventListener('mouseup', handleMouseUp)
    element.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('mousedown', handleMouseDown)
      element.removeEventListener('mouseup', handleMouseUp)
      element.removeEventListener('mouseleave', handleMouseLeave)
      cancel()
    }
  }, [enabled, start, cancel])

  return { ref, isPressed }
}

export default useTouchGestures
