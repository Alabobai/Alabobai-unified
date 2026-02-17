import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMediaQuery, breakpoints } from './useMediaQuery'

export interface MobileState {
  // Device type
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isMobileOrTablet: boolean

  // Capabilities
  isTouch: boolean
  hasNotch: boolean
  isStandalone: boolean
  isPWA: boolean

  // Orientation
  isPortrait: boolean
  isLandscape: boolean

  // Keyboard state (for virtual keyboard handling)
  isKeyboardOpen: boolean
  keyboardHeight: number

  // Safe areas
  safeAreaInsets: {
    top: number
    right: number
    bottom: number
    left: number
  }

  // Screen info
  screenWidth: number
  screenHeight: number
  viewportHeight: number

  // Animation preferences
  prefersReducedMotion: boolean
}

/**
 * Comprehensive mobile detection and state hook
 * Provides everything needed for mobile-responsive behavior
 */
export function useMobile(): MobileState {
  const isMobile = useMediaQuery(breakpoints.mobile)
  const isTablet = useMediaQuery(breakpoints.tablet)
  const isDesktop = useMediaQuery(breakpoints.desktop)
  const isTouch = useMediaQuery(breakpoints.touch)
  const isPortrait = useMediaQuery(breakpoints.portrait)
  const isStandalone = useMediaQuery(breakpoints.standalone)
  const prefersReducedMotion = useMediaQuery(breakpoints.reducedMotion)

  // Keyboard state
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  // Screen dimensions
  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  )
  const [screenHeight, setScreenHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0
  )
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0
  )

  // Safe area insets
  const [safeAreaInsets, setSafeAreaInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  // Detect notch (iPhone X and later)
  const hasNotch = useMemo(() => {
    if (typeof window === 'undefined') return false

    // Check if device has a notch based on safe area insets
    const root = document.documentElement
    const style = getComputedStyle(root)

    // iOS Safari provides these values
    const safeAreaTop = parseInt(
      style.getPropertyValue('--sat') ||
      style.getPropertyValue('env(safe-area-inset-top)') ||
      '0',
      10
    )

    return safeAreaTop > 20
  }, [])

  // Detect if running as PWA
  const isPWA = useMemo(() => {
    if (typeof window === 'undefined') return false

    // Check various PWA detection methods
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches
    const navigatorStandalone = (window.navigator as any).standalone === true
    const referrerPWA = document.referrer.includes('android-app://')

    return standaloneMode || navigatorStandalone || referrerPWA
  }, [isStandalone])

  // Update screen dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth)
      setScreenHeight(window.innerHeight)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Detect virtual keyboard on mobile
  useEffect(() => {
    if (!isMobile && !isTablet) return

    const handleViewportResize = () => {
      // Visual viewport API for keyboard detection
      if ('visualViewport' in window && window.visualViewport) {
        const vv = window.visualViewport
        const heightDiff = window.innerHeight - vv.height

        // If viewport is significantly smaller, keyboard is likely open
        const keyboardOpen = heightDiff > 100
        setIsKeyboardOpen(keyboardOpen)
        setKeyboardHeight(keyboardOpen ? heightDiff : 0)
        setViewportHeight(vv.height)
      }
    }

    // Use Visual Viewport API if available
    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize)
      handleViewportResize() // Initial check

      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportResize)
      }
    }

    // Fallback for browsers without Visual Viewport API
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Delay to allow keyboard to open
        setTimeout(() => {
          setIsKeyboardOpen(true)
          // Estimate keyboard height as 40% of screen
          setKeyboardHeight(window.innerHeight * 0.4)
        }, 300)
      }
    }

    const handleFocusOut = () => {
      setIsKeyboardOpen(false)
      setKeyboardHeight(0)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [isMobile, isTablet])

  // Get safe area insets from CSS environment variables
  useEffect(() => {
    const updateSafeAreas = () => {
      const root = document.documentElement

      // Create a temporary element to compute safe area values
      const tempEl = document.createElement('div')
      tempEl.style.cssText = `
        position: fixed;
        top: env(safe-area-inset-top, 0px);
        right: env(safe-area-inset-right, 0px);
        bottom: env(safe-area-inset-bottom, 0px);
        left: env(safe-area-inset-left, 0px);
        pointer-events: none;
        visibility: hidden;
      `
      document.body.appendChild(tempEl)

      const style = getComputedStyle(tempEl)
      const insets = {
        top: parseInt(style.top, 10) || 0,
        right: parseInt(style.right, 10) || 0,
        bottom: parseInt(style.bottom, 10) || 0,
        left: parseInt(style.left, 10) || 0,
      }

      document.body.removeChild(tempEl)
      setSafeAreaInsets(insets)

      // Also set CSS custom properties
      root.style.setProperty('--safe-area-inset-top', `${insets.top}px`)
      root.style.setProperty('--safe-area-inset-right', `${insets.right}px`)
      root.style.setProperty('--safe-area-inset-bottom', `${insets.bottom}px`)
      root.style.setProperty('--safe-area-inset-left', `${insets.left}px`)
    }

    updateSafeAreas()
    window.addEventListener('resize', updateSafeAreas)
    window.addEventListener('orientationchange', updateSafeAreas)

    return () => {
      window.removeEventListener('resize', updateSafeAreas)
      window.removeEventListener('orientationchange', updateSafeAreas)
    }
  }, [])

  return {
    // Device type
    isMobile,
    isTablet,
    isDesktop,
    isMobileOrTablet: isMobile || isTablet,

    // Capabilities
    isTouch,
    hasNotch,
    isStandalone,
    isPWA,

    // Orientation
    isPortrait,
    isLandscape: !isPortrait,

    // Keyboard state
    isKeyboardOpen,
    keyboardHeight,

    // Safe areas
    safeAreaInsets,

    // Screen info
    screenWidth,
    screenHeight,
    viewportHeight,

    // Animation preferences
    prefersReducedMotion,
  }
}

/**
 * Hook to handle mobile-specific scroll locking
 */
export function useLockBodyScroll(lock: boolean): void {
  useEffect(() => {
    if (!lock) return

    const originalStyle = window.getComputedStyle(document.body).overflow
    const scrollY = window.scrollY

    // Lock scroll
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      // Restore scroll
      document.body.style.overflow = originalStyle
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [lock])
}

/**
 * Hook for handling viewport height changes (virtual keyboard)
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0
  )

  useEffect(() => {
    const updateHeight = () => {
      // Use Visual Viewport API if available
      if ('visualViewport' in window && window.visualViewport) {
        setHeight(window.visualViewport.height)
      } else {
        setHeight(window.innerHeight)
      }
    }

    updateHeight()

    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight)
      return () => window.visualViewport?.removeEventListener('resize', updateHeight)
    } else {
      window.addEventListener('resize', updateHeight)
      return () => window.removeEventListener('resize', updateHeight)
    }
  }, [])

  return height
}

export default useMobile
