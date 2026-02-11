import { useState } from 'react'
import { X, Cpu, Globe, Key, Palette, Bell, Shield, Download } from 'lucide-react'
import { aiService } from '@/services/ai'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState('ai')
  const [settings, setSettings] = useState({
    aiProvider: aiService.getProviderName(),
    theme: 'dark',
    notifications: true,
    autoSave: true,
    fontSize: 14,
  })
  const [isLoadingWebLLM, setIsLoadingWebLLM] = useState(false)

  if (!isOpen) return null

  const handleLoadWebLLM = async () => {
    setIsLoadingWebLLM(true)
    try {
      const success = await aiService.switchToWebLLM({
        onStatus: (status) => console.log('[Settings]', status),
        onToken: () => {},
        onComplete: () => {},
        onError: (err) => console.error('[Settings] WebLLM error:', err),
      })
      if (success) {
        setSettings(prev => ({ ...prev, aiProvider: 'WebLLM' }))
      }
    } finally {
      setIsLoadingWebLLM(false)
    }
  }

  const sections = [
    { id: 'ai', label: 'AI Provider', icon: Cpu },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'data', label: 'Data', icon: Download },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-dark-300 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[500px]">
          {/* Sidebar */}
          <div className="w-48 border-r border-white/10 p-2">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === section.id
                    ? 'bg-rose-gold-400/15 text-rose-gold-400'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <section.icon className="w-4 h-4" />
                {section.label}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeSection === 'ai' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">AI Provider</h3>
                  <div className="space-y-3">
                    {/* Current Provider Status */}
                    <div className="p-4 rounded-xl bg-dark-400 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white/70 text-sm">Current Provider</span>
                        <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">
                          Active
                        </span>
                      </div>
                      <div className="text-lg font-medium text-white">{settings.aiProvider}</div>
                    </div>

                    {/* Provider Options */}
                    <div className="space-y-2">
                      <button
                        className={`w-full p-4 rounded-xl border transition-colors text-left ${
                          settings.aiProvider === 'Groq'
                            ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                            : 'bg-dark-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-rose-gold-400" />
                          <div>
                            <div className="text-white font-medium">Groq API</div>
                            <div className="text-white/50 text-xs">Fast cloud inference (requires API key)</div>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={handleLoadWebLLM}
                        disabled={isLoadingWebLLM}
                        className={`w-full p-4 rounded-xl border transition-colors text-left ${
                          settings.aiProvider === 'WebLLM'
                            ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                            : 'bg-dark-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Cpu className="w-5 h-5 text-blue-400" />
                          <div className="flex-1">
                            <div className="text-white font-medium">WebLLM (Browser)</div>
                            <div className="text-white/50 text-xs">Runs locally in your browser - no API key needed</div>
                          </div>
                          {isLoadingWebLLM && (
                            <div className="w-4 h-4 border-2 border-rose-gold-400 border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>
                      </button>

                      <button
                        className={`w-full p-4 rounded-xl border transition-colors text-left ${
                          settings.aiProvider === 'Offline'
                            ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                            : 'bg-dark-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Key className="w-5 h-5 text-yellow-400" />
                          <div>
                            <div className="text-white font-medium">Offline Mode</div>
                            <div className="text-white/50 text-xs">Limited functionality with pre-built responses</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-sm font-medium text-white mb-4">API Keys</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Groq API Key</label>
                      <input
                        type="password"
                        placeholder="gsk_..."
                        className="w-full px-3 py-2 rounded-lg bg-dark-400 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-white/40">
                        Get a free key at{' '}
                        <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-rose-gold-400 hover:underline">
                          console.groq.com
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Theme</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {['Dark', 'Light', 'System'].map(theme => (
                      <button
                        key={theme}
                        className={`p-3 rounded-xl border text-center transition-colors ${
                          settings.theme === theme.toLowerCase()
                            ? 'bg-rose-gold-400/10 border-rose-gold-400/30 text-rose-gold-400'
                            : 'bg-dark-400 border-white/10 text-white/70 hover:border-white/20'
                        }`}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Font Size</h3>
                  <input
                    type="range"
                    min="12"
                    max="18"
                    value={settings.fontSize}
                    onChange={e => setSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                    className="w-full accent-rose-gold-400"
                  />
                  <div className="flex justify-between text-xs text-white/50 mt-1">
                    <span>Small</span>
                    <span>{settings.fontSize}px</span>
                    <span>Large</span>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-dark-400 border border-white/10">
                  <div>
                    <div className="text-white font-medium">Push Notifications</div>
                    <div className="text-white/50 text-xs">Get notified when tasks complete</div>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, notifications: !prev.notifications }))}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      settings.notifications ? 'bg-rose-gold-400' : 'bg-white/20'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      settings.notifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-dark-400 border border-white/10">
                  <h4 className="text-white font-medium mb-2">Data Privacy</h4>
                  <p className="text-white/50 text-sm">
                    When using WebLLM, all AI processing happens locally in your browser.
                    No data is sent to external servers.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-dark-400 border border-white/10">
                  <h4 className="text-white font-medium mb-2">API Usage</h4>
                  <p className="text-white/50 text-sm">
                    When using Groq API, your messages are sent to Groq's servers for processing.
                    Review their privacy policy for more information.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'data' && (
              <div className="space-y-4">
                <button className="w-full p-4 rounded-xl bg-dark-400 border border-white/10 text-left hover:border-white/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-rose-gold-400" />
                    <div>
                      <div className="text-white font-medium">Export Data</div>
                      <div className="text-white/50 text-xs">Download all your chats and projects</div>
                    </div>
                  </div>
                </button>
                <button className="w-full p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-left hover:bg-red-500/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <X className="w-5 h-5 text-red-400" />
                    <div>
                      <div className="text-red-400 font-medium">Delete All Data</div>
                      <div className="text-red-400/70 text-xs">Permanently delete all your data</div>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
