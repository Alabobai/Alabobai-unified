/**
 * Settings Hook
 * Provides access to application settings throughout the app
 */

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// Types
// ============================================================================

export type AIProviderType = 'Groq' | 'Ollama' | 'WebLLM' | 'Mock'
export type ThemeType = 'dark' | 'light' | 'system'
export type FontSizeType = 'small' | 'medium' | 'large'

export interface AppSettings {
  // AI Provider
  aiProvider: AIProviderType
  groqApiKey: string
  geminiApiKey: string
  ollamaUrl: string

  // Appearance
  theme: ThemeType
  fontSize: FontSizeType
  compactMode: boolean

  // Privacy
  dataRetention: boolean
  analyticsOptOut: boolean

  // Advanced
  debugMode: boolean
  showApiLogs: boolean
}

// ============================================================================
// Constants
// ============================================================================

const SETTINGS_STORAGE_KEY = 'alabobai-settings'

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'Mock',
  groqApiKey: '',
  geminiApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  theme: 'dark',
  fontSize: 'medium',
  compactMode: false,
  dataRetention: true,
  analyticsOptOut: false,
  debugMode: false,
  showApiLogs: false,
}

// ============================================================================
// Settings Utility Functions
// ============================================================================

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (error) {
    console.error('[Settings] Failed to load settings:', error)
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('[Settings] Failed to save settings:', error)
  }
}

export function applyTheme(theme: ThemeType): void {
  const root = document.documentElement
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  root.classList.remove('light', 'dark')
  root.classList.add(isDark ? 'dark' : 'light')
  root.style.setProperty('--theme-mode', isDark ? 'dark' : 'light')
}

export function applyFontSize(size: FontSizeType): void {
  const root = document.documentElement
  const sizes = { small: '14px', medium: '16px', large: '18px' }
  root.style.setProperty('--base-font-size', sizes[size])
  root.style.fontSize = sizes[size]
}

export function applyCompactMode(compact: boolean): void {
  const root = document.documentElement
  if (compact) {
    root.classList.add('compact-mode')
  } else {
    root.classList.remove('compact-mode')
  }
}

export function applyAllSettings(settings: AppSettings): void {
  applyTheme(settings.theme)
  applyFontSize(settings.fontSize)
  applyCompactMode(settings.compactMode)
}

// ============================================================================
// Initialize Settings on Page Load
// ============================================================================

export function initializeSettings(): AppSettings {
  const settings = loadSettings()
  applyAllSettings(settings)

  // Listen for system theme changes
  if (settings.theme === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      applyTheme('system')
    })
  }

  return settings
}

// ============================================================================
// React Hook
// ============================================================================

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  // Load settings on mount
  useEffect(() => {
    const loaded = loadSettings()
    setSettings(loaded)
    applyAllSettings(loaded)
  }, [])

  // Update a single setting
  const updateSetting = useCallback(<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value }
      saveSettings(newSettings)
      applyAllSettings(newSettings)
      return newSettings
    })
  }, [])

  // Update multiple settings at once
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates }
      saveSettings(newSettings)
      applyAllSettings(newSettings)
      return newSettings
    })
  }, [])

  // Reset all settings to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
    applyAllSettings(DEFAULT_SETTINGS)
  }, [])

  // Check if debug mode is enabled
  const isDebugMode = settings.debugMode

  // Log helper that only logs in debug mode
  const debugLog = useCallback((...args: unknown[]) => {
    if (settings.debugMode) {
      console.log('[Debug]', ...args)
    }
  }, [settings.debugMode])

  return {
    settings,
    updateSetting,
    updateSettings,
    resetSettings,
    isDebugMode,
    debugLog,
    DEFAULT_SETTINGS,
  }
}

export default useSettings
