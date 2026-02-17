/**
 * PWA Install Prompt Component
 * Displays install and update prompts for PWA functionality
 */

import { useEffect, useCallback } from 'react'
import { Download, RefreshCw, X, Wifi, WifiOff, Smartphone } from 'lucide-react'
import { usePWAStore } from '@/stores/pwaStore'
import { registerServiceWorker, skipWaiting, isStandalone } from '@/services/serviceWorker'
import { toast } from '@/stores/toastStore'
import { BRAND } from '@/config/brand'

// ============================================================================
// PWA Prompt Component
// ============================================================================

export default function PWAPrompt() {
  const {
    isInstallable,
    isInstalled,
    installPromptDismissed,
    updateAvailable,
    updateDismissed,
    isOnline,
    setDeferredPrompt,
    setUpdateAvailable,
    setOnline,
    setInstalled,
    dismissInstallPrompt,
    dismissUpdate,
    promptInstall
  } = usePWAStore()

  // Initialize PWA functionality
  useEffect(() => {
    // Check if already installed
    if (isStandalone()) {
      setInstalled(true)
    }

    // Register service worker
    registerServiceWorker({
      onUpdate: () => {
        setUpdateAvailable(true)
        toast.info('Update Available', 'A new version is ready. Click to update.')
      },
      onSuccess: () => {
        toast.success('Ready for Offline', 'App can now work offline.')
      },
      onOffline: () => {
        setOnline(false)
        toast.warning('Offline Mode', 'You are now offline. Some features may be limited.')
      },
      onOnline: () => {
        setOnline(true)
        toast.success('Back Online', 'Your connection has been restored.')
      }
    })

    // Handle install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as BeforeInstallPromptEvent)
    }

    // Handle app installed
    const handleAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      toast.success('App Installed', `${BRAND.name} has been added to your home screen!`)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [setDeferredPrompt, setInstalled, setOnline, setUpdateAvailable])

  // Handle install click
  const handleInstall = useCallback(async () => {
    const success = await promptInstall()
    if (success) {
      toast.success('Installing...', `Please wait while ${BRAND.name} is installed.`)
    }
  }, [promptInstall])

  // Handle update click
  const handleUpdate = useCallback(() => {
    skipWaiting()
    window.location.reload()
  }, [])

  // Don't show anything if installed or all prompts dismissed
  const showInstallPrompt = isInstallable && !isInstalled && !installPromptDismissed
  const showUpdatePrompt = updateAvailable && !updateDismissed

  if (!showInstallPrompt && !showUpdatePrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
      {/* Update Available Prompt */}
      {showUpdatePrompt && (
        <div className="bg-dark-300 border border-rose-gold-400/30 rounded-2xl p-4 shadow-xl animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-gold-400/20 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm mb-1">
                Update Available
              </h3>
              <p className="text-white/60 text-xs mb-3">
                A new version of {BRAND.name} is ready. Update now for the latest features.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUpdate}
                  className="px-4 py-1.5 bg-rose-gold-400 text-dark-400 rounded-lg text-xs font-medium hover:bg-rose-gold-300 transition-colors"
                >
                  Update Now
                </button>
                <button
                  onClick={dismissUpdate}
                  className="px-4 py-1.5 bg-white/5 text-white/60 rounded-lg text-xs font-medium hover:bg-white/10 hover:text-white transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              onClick={dismissUpdate}
              className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Dismiss update prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Install Prompt */}
      {showInstallPrompt && (
        <div className="bg-dark-300 border border-white/10 rounded-2xl p-4 shadow-xl animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-rose-gold-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm mb-1">
                Install {BRAND.name}
              </h3>
              <p className="text-white/60 text-xs mb-3">
                Add to your home screen for quick access and offline support.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleInstall}
                  className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-gold-400 to-rose-gold-500 text-dark-400 rounded-lg text-xs font-medium hover:from-rose-gold-300 hover:to-rose-gold-400 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install
                </button>
                <button
                  onClick={dismissInstallPrompt}
                  className="px-4 py-1.5 bg-white/5 text-white/60 rounded-lg text-xs font-medium hover:bg-white/10 hover:text-white transition-colors"
                >
                  Not Now
                </button>
              </div>
            </div>
            <button
              onClick={dismissInstallPrompt}
              className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Dismiss install prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Offline Indicator Component
// ============================================================================

export function OfflineIndicator() {
  const { isOnline } = usePWAStore()

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-rose-gold-400/90 backdrop-blur-sm py-1.5 px-4">
      <div className="flex items-center justify-center gap-2 text-dark-500 text-sm font-medium">
        <WifiOff className="w-4 h-4" />
        <span>You are offline. Some features may be unavailable.</span>
      </div>
    </div>
  )
}

// ============================================================================
// Types
// ============================================================================

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
    appinstalled: Event
  }
}
