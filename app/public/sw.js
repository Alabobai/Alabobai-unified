/* global self, caches, console, URL, fetch */
/**
 * Alabobai Service Worker
 * Provides offline support, caching, and background sync
 */

const STATIC_CACHE = 'alabobai-static-v1'
const DYNAMIC_CACHE = 'alabobai-dynamic-v1'

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
]

// API routes that should use network-first strategy
const API_ROUTES = [
  '/api/',
  '/auth/'
]

// Assets that should use cache-first strategy
const CACHE_FIRST_ROUTES = [
  '/assets/',
  '/icons/',
  '/fonts/'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('alabobai-') &&
                     name !== STATIC_CACHE &&
                     name !== DYNAMIC_CACHE
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
      .then(() => {
        console.log('[SW] Activated and ready')
        return self.clients.claim()
      })
  )
})

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return
  }

  // API routes - network first, fall back to cache
  if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
    event.respondWith(networkFirst(request))
    return
  }

  // Static assets - cache first, fall back to network
  if (CACHE_FIRST_ROUTES.some(route => url.pathname.startsWith(route))) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Navigation requests - network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request)
        .catch(() => caches.match('/'))
    )
    return
  }

  // Default - stale while revalidate
  event.respondWith(staleWhileRevalidate(request))
})

// Network first strategy
async function networkFirst(request) {
  try {
    const response = await fetch(request)

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    throw error
  }
}

// Cache first strategy
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.error('[SW] Cache first failed:', error)
    throw error
  }
}

// Stale while revalidate strategy
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(DYNAMIC_CACHE)
          .then((cache) => cache.put(request, response.clone()))
      }
      return response
    })
    .catch((error) => {
      console.error('[SW] Fetch failed:', error)
      throw error
    })

  return cached || fetchPromise
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages())
  }
})

async function syncMessages() {
  // Implement message sync when back online
  console.log('[SW] Syncing messages...')
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title || 'Alabobai', {
      body: data.body || 'You have a new notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: data.tag || 'default',
      data: data.data || {},
      actions: data.actions || []
    })
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if available
        for (const client of clients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus()
          }
        }
        // Open new window
        return self.clients.openWindow(urlToOpen)
      })
  )
})

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE)
        .then((cache) => cache.addAll(event.data.urls))
    )
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => Promise.all(
          cacheNames.map((name) => caches.delete(name))
        ))
    )
  }
})

console.log('[SW] Service Worker loaded')
