/**
 * Service Worker Registration
 * Handles PWA installation and updates
 */

interface ServiceWorkerConfig {
  onUpdate?: (registration: ServiceWorkerRegistration) => void
  onSuccess?: (registration: ServiceWorkerRegistration) => void
  onOffline?: () => void
  onOnline?: () => void
}

let swRegistration: ServiceWorkerRegistration | null = null

export async function registerServiceWorker(config?: ServiceWorkerConfig): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Service workers are not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })

    swRegistration = registration

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available
            console.log('[SW] New content available, please refresh')
            config?.onUpdate?.(registration)
          } else if (newWorker.state === 'activated') {
            // Content has been cached for offline use
            console.log('[SW] Content cached for offline use')
            config?.onSuccess?.(registration)
          }
        })
      }
    })

    // Handle online/offline events
    window.addEventListener('online', () => {
      console.log('[SW] Back online')
      config?.onOnline?.()
    })

    window.addEventListener('offline', () => {
      console.log('[SW] Went offline')
      config?.onOffline?.()
    })

    console.log('[SW] Service worker registered successfully')
    return registration
  } catch (error) {
    console.error('[SW] Service worker registration failed:', error)
    return null
  }
}

export function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(false)
  }

  return navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((error) => {
      console.error('[SW] Service worker unregistration failed:', error)
      return false
    })
}

export function skipWaiting(): void {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }
}

export function clearCache(): void {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
  }
}

export function cacheUrls(urls: string[]): void {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls })
  }
}

export function getRegistration(): ServiceWorkerRegistration | null {
  return swRegistration
}

// Check if running as PWA
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
         document.referrer.includes('android-app://')
}

// Check if installable
export function isInstallable(): boolean {
  return 'BeforeInstallPromptEvent' in window
}
