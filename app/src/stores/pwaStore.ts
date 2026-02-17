/**
 * PWA Store
 * Manages PWA installation state and updates
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PWAState {
  // Installation state
  isInstallable: boolean
  isInstalled: boolean
  installPromptDismissed: boolean
  deferredPrompt: BeforeInstallPromptEvent | null

  // Update state
  updateAvailable: boolean
  updateDismissed: boolean

  // Online state
  isOnline: boolean

  // Actions
  setInstallable: (installable: boolean) => void
  setInstalled: (installed: boolean) => void
  setDeferredPrompt: (prompt: BeforeInstallPromptEvent | null) => void
  dismissInstallPrompt: () => void
  resetInstallPrompt: () => void
  setUpdateAvailable: (available: boolean) => void
  dismissUpdate: () => void
  setOnline: (online: boolean) => void
  promptInstall: () => Promise<boolean>
}

export const usePWAStore = create<PWAState>()(
  persist(
    (set, get) => ({
      // Initial state
      isInstallable: false,
      isInstalled: false,
      installPromptDismissed: false,
      deferredPrompt: null,
      updateAvailable: false,
      updateDismissed: false,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

      // Actions
      setInstallable: (installable) => set({ isInstallable: installable }),

      setInstalled: (installed) => set({
        isInstalled: installed,
        isInstallable: installed ? false : get().isInstallable
      }),

      setDeferredPrompt: (prompt) => set({
        deferredPrompt: prompt,
        isInstallable: prompt !== null,
        installPromptDismissed: false
      }),

      dismissInstallPrompt: () => set({ installPromptDismissed: true }),

      resetInstallPrompt: () => set({ installPromptDismissed: false }),

      setUpdateAvailable: (available) => set({
        updateAvailable: available,
        updateDismissed: false
      }),

      dismissUpdate: () => set({ updateDismissed: true }),

      setOnline: (online) => set({ isOnline: online }),

      promptInstall: async () => {
        const { deferredPrompt } = get()

        if (!deferredPrompt) {
          console.log('[PWA] No installation prompt available')
          return false
        }

        try {
          await deferredPrompt.prompt()
          const { outcome } = await deferredPrompt.userChoice

          if (outcome === 'accepted') {
            console.log('[PWA] User accepted installation')
            set({
              isInstalled: true,
              isInstallable: false,
              deferredPrompt: null
            })
            return true
          } else {
            console.log('[PWA] User dismissed installation')
            set({ installPromptDismissed: true })
            return false
          }
        } catch (error) {
          console.error('[PWA] Installation prompt failed:', error)
          return false
        }
      }
    }),
    {
      name: 'alabobai-pwa-storage',
      partialize: (state) => ({
        isInstalled: state.isInstalled,
        installPromptDismissed: state.installPromptDismissed,
        updateDismissed: state.updateDismissed
      })
    }
  )
)
