import { useState, useEffect, useCallback } from 'react'

/**
 * Custom hook for responsive media queries
 * @param query - CSS media query string
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = useCallback((mediaQuery: string): boolean => {
    // Prevent SSR issues
    if (typeof window !== 'undefined') {
      return window.matchMedia(mediaQuery).matches
    }
    return false
  }, [])

  const [matches, setMatches] = useState<boolean>(() => getMatches(query))

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query)

    // Initial check
    setMatches(mediaQueryList.matches)

    // Handler for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Modern browsers
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange)
    } else {
      // Fallback for older browsers
      mediaQueryList.addListener(handleChange)
    }

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange)
      } else {
        mediaQueryList.removeListener(handleChange)
      }
    }
  }, [query])

  return matches
}

// Pre-defined breakpoint queries
export const breakpoints = {
  mobile: '(max-width: 639px)',
  tablet: '(min-width: 640px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
  largeDesktop: '(min-width: 1280px)',

  // Touch capabilities
  touch: '(hover: none) and (pointer: coarse)',
  mouse: '(hover: hover) and (pointer: fine)',

  // Orientation
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',

  // Reduced motion preference
  reducedMotion: '(prefers-reduced-motion: reduce)',

  // Dark mode preference
  darkMode: '(prefers-color-scheme: dark)',
  lightMode: '(prefers-color-scheme: light)',

  // Standalone/PWA mode
  standalone: '(display-mode: standalone)',
  fullscreen: '(display-mode: fullscreen)',
} as const

/**
 * Hook for checking multiple breakpoints at once
 */
export function useBreakpoints() {
  const isMobile = useMediaQuery(breakpoints.mobile)
  const isTablet = useMediaQuery(breakpoints.tablet)
  const isDesktop = useMediaQuery(breakpoints.desktop)
  const isLargeDesktop = useMediaQuery(breakpoints.largeDesktop)
  const isTouch = useMediaQuery(breakpoints.touch)
  const isPortrait = useMediaQuery(breakpoints.portrait)
  const isStandalone = useMediaQuery(breakpoints.standalone)
  const prefersReducedMotion = useMediaQuery(breakpoints.reducedMotion)
  const prefersDarkMode = useMediaQuery(breakpoints.darkMode)

  return {
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    isTouch,
    isPortrait,
    isLandscape: !isPortrait,
    isStandalone,
    prefersReducedMotion,
    prefersDarkMode,

    // Computed values
    isMobileOrTablet: isMobile || isTablet,
    isDesktopOrLarger: isDesktop || isLargeDesktop,
  }
}

export default useMediaQuery
