/**
 * Audio Settings Component
 *
 * Configure NVIDIA audio capabilities (ASR + TTS) settings.
 */

import React, { useState, useEffect } from 'react'
import {
  Mic,
  Volume2,
  Cpu,
  Cloud,
  Globe,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap
} from 'lucide-react'
import { nvidiaAudio } from '../services/nvidiaAudio'
import { CustomSelect } from './ui/CustomSelect'

interface AudioSettingsProps {
  onClose?: () => void
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({ onClose }) => {
  const [providers, setProviders] = useState({
    sherpaOnnx: false,
    nemoApi: false,
    webSpeechApi: false
  })
  const [isLoading, setIsLoading] = useState(true)
  const [testResult, setTestResult] = useState<string | null>(null)

  // ASR Settings
  const [asrModel, setAsrModel] = useState('parakeet-tdt-0.6b')
  const [asrLanguage, setAsrLanguage] = useState('en')
  const [enablePunctuation, setEnablePunctuation] = useState(true)
  const [enableTimestamps, setEnableTimestamps] = useState(false)

  // TTS Settings
  const [ttsModel, setTtsModel] = useState('vits')
  const [ttsVoice, setTtsVoice] = useState('default')
  const [speakingRate, setSpeakingRate] = useState(1.0)
  const [pitch, setPitch] = useState(1.0)

  // Backend Settings
  const [nemoApiUrl, setNemoApiUrl] = useState('')
  const [useGpuAcceleration, setUseGpuAcceleration] = useState(true)

  useEffect(() => {
    loadProviderStatus()
  }, [])

  const loadProviderStatus = async () => {
    setIsLoading(true)
    try {
      await nvidiaAudio.initialize()
      setProviders(nvidiaAudio.getStatus())
    } catch (error) {
      console.error('Failed to load provider status:', error)
    }
    setIsLoading(false)
  }

  const testASR = async () => {
    setTestResult('Testing ASR... Speak into your microphone.')
    try {
      // Quick 3-second test
      await nvidiaAudio.startListening({
        onFinalResult: (result) => {
          setTestResult(`ASR Test Result (${result.provider}): "${result.text}"`)
        },
        onError: (error) => {
          setTestResult(`ASR Test Failed: ${error.message}`)
        }
      })

      setTimeout(async () => {
        const result = await nvidiaAudio.stopListening()
        if (result) {
          setTestResult(`ASR Test Result (${result.provider}): "${result.text}"`)
        }
      }, 3000)
    } catch (error) {
      setTestResult(`ASR Test Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const testTTS = async () => {
    setTestResult('Testing TTS...')
    try {
      await nvidiaAudio.speak('Hello! This is a test of the NVIDIA audio text to speech system.')
      setTestResult('TTS test completed successfully!')
    } catch (error) {
      setTestResult(`TTS Test Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const saveSettings = () => {
    nvidiaAudio.updateConfig({
      asrModel: asrModel as any,
      asrLanguage,
      enablePunctuation,
      enableTimestamps,
      ttsModel: ttsModel as any,
      ttsVoice,
      ttsSpeakingRate: speakingRate,
      ttsPitch: pitch,
      nemoApiUrl: nemoApiUrl || undefined,
      useGpuAcceleration
    })

    // Save to localStorage
    localStorage.setItem('alabobai-audio-settings', JSON.stringify({
      asrModel,
      asrLanguage,
      enablePunctuation,
      enableTimestamps,
      ttsModel,
      ttsVoice,
      speakingRate,
      pitch,
      nemoApiUrl,
      useGpuAcceleration
    }))

    setTestResult('Settings saved!')
    setTimeout(() => setTestResult(null), 2000)
  }

  const ProviderStatus: React.FC<{ name: string; available: boolean; icon: React.ReactNode }> = ({
    name,
    available,
    icon
  }) => (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${
      available ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/5 border border-white/10'
    }`}>
      <div className={available ? 'text-green-400' : 'text-white/40'}>
        {icon}
      </div>
      <div className="flex-1">
        <div className={`font-medium ${available ? 'text-white' : 'text-white/60'}`}>
          {name}
        </div>
        <div className={`text-xs ${available ? 'text-green-400' : 'text-white/40'}`}>
          {available ? 'Available' : 'Not configured'}
        </div>
      </div>
      {available ? (
        <CheckCircle className="w-5 h-5 text-green-400" />
      ) : (
        <XCircle className="w-5 h-5 text-white/30" />
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Provider Status */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-rose-gold-400" />
            NVIDIA Audio Providers
          </h3>
          <button
            onClick={loadProviderStatus}
            disabled={isLoading}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ProviderStatus
            name="Sherpa-ONNX (Browser)"
            available={providers.sherpaOnnx}
            icon={<Cpu className="w-5 h-5" />}
          />
          <ProviderStatus
            name="NeMo API (Server)"
            available={providers.nemoApi}
            icon={<Cloud className="w-5 h-5" />}
          />
          <ProviderStatus
            name="Web Speech API"
            available={providers.webSpeechApi}
            icon={<Globe className="w-5 h-5" />}
          />
        </div>
      </div>

      {/* ASR Settings */}
      <div className="border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <Mic className="w-5 h-5 text-rose-gold-400" />
          Speech Recognition (ASR)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CustomSelect
            label="Model"
            value={asrModel}
            onChange={setAsrModel}
            options={[
              { value: 'parakeet-tdt-0.6b', label: 'Parakeet TDT 0.6B', description: 'English, #1 Accuracy' },
              { value: 'canary-1b', label: 'Canary 1B', description: 'Multilingual, 25 languages' },
              { value: 'nemotron-streaming', label: 'Nemotron Streaming', description: 'Low latency' }
            ]}
          />

          <CustomSelect
            label="Language"
            value={asrLanguage}
            onChange={setAsrLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'de', label: 'German' },
              { value: 'fr', label: 'French' },
              { value: 'es', label: 'Spanish' },
              { value: 'it', label: 'Italian' },
              { value: 'pt', label: 'Portuguese' },
              { value: 'nl', label: 'Dutch' },
              { value: 'pl', label: 'Polish' }
            ]}
          />

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enablePunctuation"
              checked={enablePunctuation}
              onChange={(e) => setEnablePunctuation(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 accent-rose-gold-400 focus:ring-rose-gold-400/50"
            />
            <label htmlFor="enablePunctuation" className="text-white/80">
              Auto-punctuation
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enableTimestamps"
              checked={enableTimestamps}
              onChange={(e) => setEnableTimestamps(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 accent-rose-gold-400 focus:ring-rose-gold-400/50"
            />
            <label htmlFor="enableTimestamps" className="text-white/80">
              Word timestamps
            </label>
          </div>
        </div>
      </div>

      {/* TTS Settings */}
      <div className="border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <Volume2 className="w-5 h-5 text-rose-gold-400" />
          Text-to-Speech (TTS)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CustomSelect
            label="Model"
            value={ttsModel}
            onChange={setTtsModel}
            options={[
              { value: 'vits', label: 'VITS', description: 'Natural, fast' },
              { value: 'fastpitch', label: 'FastPitch', description: 'High quality' },
              { value: 'hifigan', label: 'HiFi-GAN', description: 'Ultra quality' }
            ]}
          />

          <CustomSelect
            label="Voice"
            value={ttsVoice}
            onChange={setTtsVoice}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'amy', label: 'Amy', description: 'US Female' },
              { value: 'ryan', label: 'Ryan', description: 'US Male' },
              { value: 'emma', label: 'Emma', description: 'UK Female' }
            ]}
          />

          <div>
            <label className="block text-sm text-white/60 mb-2">
              Speaking Rate: {speakingRate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speakingRate}
              onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
              className="w-full accent-rose-gold-400"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-2">
              Pitch: {pitch.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full accent-rose-gold-400"
            />
          </div>
        </div>
      </div>

      {/* Backend Settings */}
      <div className="border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <Cloud className="w-5 h-5 text-rose-gold-400" />
          Backend Configuration
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-2">
              NeMo/Riva API URL (optional)
            </label>
            <input
              type="text"
              value={nemoApiUrl}
              onChange={(e) => setNemoApiUrl(e.target.value)}
              placeholder="http://localhost:5001 or https://your-riva-server.com"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
            />
            <p className="text-xs text-white/40 mt-1">
              Leave empty for browser-only processing (Sherpa-ONNX)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="useGpuAcceleration"
              checked={useGpuAcceleration}
              onChange={(e) => setUseGpuAcceleration(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 accent-rose-gold-400 focus:ring-rose-gold-400/50"
            />
            <label htmlFor="useGpuAcceleration" className="text-white/80">
              Use GPU acceleration (requires NVIDIA GPU on server)
            </label>
          </div>
        </div>
      </div>

      {/* Test & Save */}
      <div className="border-t border-white/10 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={testASR}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Mic className="w-4 h-4" />
            Test ASR
          </button>
          <button
            onClick={testTTS}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Volume2 className="w-4 h-4" />
            Test TTS
          </button>
          <div className="flex-1" />
          <button
            onClick={saveSettings}
            className="px-4 py-2 rounded-lg bg-rose-gold-400/20 border border-rose-gold-400/30 text-rose-gold-400 hover:bg-rose-gold-400/30 transition-all"
          >
            Save Settings
          </button>
        </div>

        {testResult && (
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm">
            {testResult}
          </div>
        )}
      </div>
    </div>
  )
}

export default AudioSettings
