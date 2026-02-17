/**
 * App Component
 *
 * Root application component that provides:
 * - Keyboard shortcut context
 * - Accessibility features
 * - PWA installation support
 * - Main application shell
 */

import { useEffect } from 'react'
import { KeyboardShortcutProvider, useGlobalKeyboardHandler } from '@/hooks/useKeyboardShortcuts'
import AppShell from './components/AppShell'
import PWAPrompt, { OfflineIndicator } from './components/PWAPrompt'

function AppWithKeyboardHandler() {
  useGlobalKeyboardHandler()

  useEffect(() => {
    if (import.meta.env.DEV && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister())
      }).catch(() => {})
    }
  }, [])

  return (
    <>
      <OfflineIndicator />
      <AppShell />
      <PWAPrompt />
    </>
  )
}

function App() {
  return (
    <KeyboardShortcutProvider>
      <AppWithKeyboardHandler />
    </KeyboardShortcutProvider>
  )
}

export default App
