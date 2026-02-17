import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  Square,
  Send,
  AlertCircle,
  CheckCircle,
  Loader2,
  Languages,
  SlidersHorizontal,
  Waves,
  Play,
  Sparkles,
  RefreshCw,
  Zap,
  Radio,
  Bell,
  BellOff
} from 'lucide-react'
import { voiceService, type NeuralVoice, type BrowserVoice, VOICE_COMMANDS } from '@/services/voiceService'
import { useAppStore } from '@/stores/appStore'
import aiService from '@/services/ai'
import { BRAND } from '@/config/brand'

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error' | 'wake_word'

// Waveform component for real-time audio visualization
function AudioWaveform({
  isActive,
  volume,
  status
}: {
  isActive: boolean
  volume: number
  status: VoiceStatus
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const barsRef = useRef<number[]>(Array(32).fill(0))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const animate = () => {
      const width = canvas.width
      const height = canvas.height
      const barCount = 32
      const barWidth = width / barCount - 2
      const maxBarHeight = height * 0.8

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Update bars based on status
      for (let i = 0; i < barCount; i++) {
        let targetHeight = 0

        if (status === 'listening' || status === 'wake_word') {
          // Use actual volume with some randomness for visual interest
          targetHeight = isActive
            ? (volume * maxBarHeight * 0.7) + (Math.random() * maxBarHeight * 0.3)
            : Math.random() * maxBarHeight * 0.1 + 5
        } else if (status === 'speaking') {
          // Animated wave pattern when speaking
          const time = Date.now() / 200
          targetHeight = (Math.sin(time + i * 0.5) * 0.5 + 0.5) * maxBarHeight * 0.6 + 10
        } else if (status === 'processing') {
          // Loading animation
          const time = Date.now() / 150
          const wave = Math.sin(time + i * 0.3) * 0.5 + 0.5
          targetHeight = wave * maxBarHeight * 0.4 + 5
        } else {
          targetHeight = 5
        }

        // Smooth transition
        barsRef.current[i] += (targetHeight - barsRef.current[i]) * 0.15
        const barHeight = Math.max(3, barsRef.current[i])

        // Gradient color based on status
        let color = 'rgba(255, 255, 255, 0.2)'
        if (status === 'listening') {
          const intensity = barHeight / maxBarHeight
          color = `rgba(244, 63, 94, ${0.4 + intensity * 0.6})` // rose-500
        } else if (status === 'wake_word') {
          color = `rgba(34, 197, 94, ${0.4 + (barHeight / maxBarHeight) * 0.6})` // green-500
        } else if (status === 'speaking') {
          color = `rgba(168, 85, 247, ${0.4 + (barHeight / maxBarHeight) * 0.6})` // purple-500
        } else if (status === 'processing') {
          color = `rgba(251, 191, 36, ${0.4 + (barHeight / maxBarHeight) * 0.6})` // amber-400
        }

        ctx.fillStyle = color
        const x = i * (barWidth + 2) + 1
        const y = (height - barHeight) / 2

        // Rounded rectangle
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 2)
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isActive, volume, status])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={60}
      className="w-full h-[60px]"
    />
  )
}

export default function VoiceInterfaceView() {
  // State
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([])

  // Voice settings
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [neuralVoices, setNeuralVoices] = useState<NeuralVoice[]>([])
  const [browserVoices, setBrowserVoices] = useState<BrowserVoice[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState('brian')
  const [selectedBrowserVoiceURI, setSelectedBrowserVoiceURI] = useState('')
  const [speechRate, setSpeechRate] = useState(1)
  const [speechPitch, setSpeechPitch] = useState(1)
  const [speechVolume, setSpeechVolume] = useState(1)
  const [useNeural, setUseNeural] = useState(true)
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false)

  // Voice activity state
  const [voiceActive, setVoiceActive] = useState(false)
  const [currentVolume, setCurrentVolume] = useState(0)
  const [micPermission, setMicPermission] = useState<PermissionState>('prompt')

  // Animation state
  const [waveformIntensity, setWaveformIntensity] = useState(0)
  const waveformInterval = useRef<NodeJS.Timeout | null>(null)

  // Browser support checks
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(true)
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(true)

  const { addMessage, activeChat, createChat, setStreaming } = useAppStore()

  // Initialize and check browser support
  useEffect(() => {
    setSpeechRecognitionSupported(voiceService.isSpeechRecognitionSupported())
    setSpeechSynthesisSupported(voiceService.isSpeechSynthesisSupported())

    // Load neural voices
    const voices = voiceService.getNeuralVoices()
    setNeuralVoices(voices)

    // Load browser voices
    const loadBrowserVoices = () => {
      const bVoices = voiceService.getBrowserVoices()
      setBrowserVoices(bVoices)
    }
    loadBrowserVoices()
    // Reload when voices change
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadBrowserVoices
    }

    // Get current speech config
    const config = voiceService.getSpeechConfig()
    setSelectedVoiceId(config.voice)
    setSpeechRate(config.rate)
    setSpeechPitch(config.pitch)
    setSpeechVolume(config.volume)
    setUseNeural(config.useNeural)

    // Check microphone permission
    voiceService.checkMicrophonePermission().then(setMicPermission)
  }, [])

  // Apply voice settings changes
  useEffect(() => {
    voiceService.setLanguage(selectedLanguage)
  }, [selectedLanguage])

  useEffect(() => {
    voiceService.setVoice(selectedVoiceId)
  }, [selectedVoiceId])

  useEffect(() => {
    voiceService.setRate(speechRate)
  }, [speechRate])

  useEffect(() => {
    voiceService.setPitch(speechPitch)
  }, [speechPitch])

  useEffect(() => {
    voiceService.setVolume(speechVolume)
  }, [speechVolume])

  useEffect(() => {
    voiceService.setUseNeural(useNeural)
  }, [useNeural])

  useEffect(() => {
    if (selectedBrowserVoiceURI) {
      voiceService.setBrowserVoice(selectedBrowserVoiceURI)
    }
  }, [selectedBrowserVoiceURI])

  // Waveform animation
  const startWaveformAnimation = useCallback(() => {
    if (waveformInterval.current) return
    waveformInterval.current = setInterval(() => {
      setWaveformIntensity(Math.random() * 0.5 + 0.5)
    }, 100)
  }, [])

  const stopWaveformAnimation = useCallback(() => {
    if (waveformInterval.current) {
      clearInterval(waveformInterval.current)
      waveformInterval.current = null
    }
    setWaveformIntensity(0)
  }, [])

  // Handle voice commands
  const handleVoiceCommand = useCallback((command: string) => {
    switch (command) {
      case 'STOP_LISTENING':
        stopListening()
        break
      case 'READ_AGAIN':
        voiceService.repeatLastResponse(() => {
          setVoiceStatus('idle')
          stopWaveformAnimation()
        })
        setVoiceStatus('speaking')
        startWaveformAnimation()
        break
      case 'CLEAR':
        clearConversation()
        break
      case 'SEND':
        sendToAI()
        break
    }
  }, [])

  // Handle wake word detection
  const handleWakeWord = useCallback(() => {
    setVoiceStatus('wake_word')
    // Play a subtle acknowledgment sound or visual feedback
    setTimeout(() => {
      if (voiceService.getIsListening()) {
        setVoiceStatus('listening')
      }
    }, 1500)
  }, [])

  // Start listening
  const startListening = useCallback(async () => {
    setError(null)
    setInterimTranscript('')

    // Request permission if needed
    if (micPermission !== 'granted') {
      const granted = await voiceService.requestMicrophonePermission()
      if (!granted) {
        setError('Microphone permission is required for voice input')
        return
      }
      setMicPermission('granted')
    }

    const success = voiceService.startListening(
      (text, isFinal) => {
        if (isFinal) {
          setTranscript(prev => prev + (prev ? ' ' : '') + text)
          setInterimTranscript('')
        } else {
          setInterimTranscript(text)
        }
      },
      (errorMsg) => {
        setError(errorMsg)
        setVoiceStatus('error')
        stopWaveformAnimation()
        setVoiceActive(false)
      },
      {
        onVoiceActivity: (isActive, volume) => {
          setVoiceActive(isActive)
          setCurrentVolume(volume)
        },
        onVoiceCommand: handleVoiceCommand,
        onWakeWord: handleWakeWord,
        enableWakeWord: wakeWordEnabled
      }
    )

    if (success) {
      setVoiceStatus('listening')
      startWaveformAnimation()
    }
  }, [startWaveformAnimation, stopWaveformAnimation, handleVoiceCommand, handleWakeWord, wakeWordEnabled, micPermission])

  // Stop listening
  const stopListening = useCallback(() => {
    voiceService.stopListening()
    setVoiceStatus('idle')
    stopWaveformAnimation()
    setVoiceActive(false)
    setCurrentVolume(0)
  }, [stopWaveformAnimation])

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (voiceStatus === 'listening' || voiceStatus === 'wake_word') {
      stopListening()
    } else if (voiceStatus === 'idle' || voiceStatus === 'error') {
      startListening()
    }
  }, [voiceStatus, startListening, stopListening])

  // Send transcript to AI
  const sendToAI = useCallback(async () => {
    const textToSend = transcript.trim()
    if (!textToSend) return

    // Stop listening while processing
    stopListening()
    setVoiceStatus('processing')
    setAiResponse('')

    // Add to conversation history
    setConversationHistory(prev => [...prev, { role: 'user', text: textToSend }])

    // Create chat if needed and add message
    if (!activeChat) {
      createChat()
    }

    const chatId = activeChat || useAppStore.getState().activeChat!

    addMessage(chatId, {
      role: 'user',
      content: textToSend,
      status: 'complete'
    })

    setStreaming(true)

    // Get full conversation for context
    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.text
    }))
    messages.push({ role: 'user' as const, content: textToSend })

    let fullResponse = ''

    try {
      await aiService.chat(messages, {
        onToken: (token) => {
          fullResponse += token
          setAiResponse(fullResponse)
        },
        onComplete: () => {
          setConversationHistory(prev => [...prev, { role: 'assistant', text: fullResponse }])

          // Add assistant message to chat
          addMessage(chatId, {
            role: 'assistant',
            content: fullResponse,
            status: 'complete'
          })

          setStreaming(false)

          // Speak the response if voice output is enabled
          if (voiceOutputEnabled) {
            setVoiceStatus('speaking')
            startWaveformAnimation()
            voiceService.speak(fullResponse, () => {
              setVoiceStatus('idle')
              stopWaveformAnimation()
            })
          } else {
            setVoiceStatus('idle')
          }
        },
        onError: (error) => {
          setError(error.message)
          setVoiceStatus('error')
          setStreaming(false)
        }
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'AI error occurred')
      setVoiceStatus('error')
      setStreaming(false)
    }

    // Clear transcript for next input
    setTranscript('')
    setInterimTranscript('')
  }, [
    transcript,
    conversationHistory,
    voiceOutputEnabled,
    stopListening,
    startWaveformAnimation,
    stopWaveformAnimation,
    activeChat,
    createChat,
    addMessage,
    setStreaming
  ])

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    voiceService.stopSpeaking()
    setVoiceStatus('idle')
    stopWaveformAnimation()
  }, [stopWaveformAnimation])

  // Repeat last response
  const repeatLastResponse = useCallback(() => {
    const lastResponse = voiceService.getLastResponse()
    if (lastResponse) {
      setVoiceStatus('speaking')
      startWaveformAnimation()
      voiceService.repeatLastResponse(() => {
        setVoiceStatus('idle')
        stopWaveformAnimation()
      })
    }
  }, [startWaveformAnimation, stopWaveformAnimation])

  // Test/preview voice
  const previewVoice = useCallback(async (voiceId: string) => {
    setPreviewingVoice(voiceId)
    try {
      await voiceService.previewVoice(voiceId)
    } finally {
      setPreviewingVoice(null)
    }
  }, [])

  // Test current voice
  const testVoice = useCallback(() => {
    voiceService.speak('Hello! This is how I sound. Pretty natural, right?')
  }, [])

  // Clear conversation
  const clearConversation = useCallback(() => {
    setConversationHistory([])
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setError(null)
  }, [])

  const languages = voiceService.getSupportedLanguages()

  // Get status color
  const getStatusColor = () => {
    switch (voiceStatus) {
      case 'listening': return 'from-rose-400 to-rose-600'
      case 'wake_word': return 'from-rose-gold-500 to-rose-gold-600'
      case 'speaking': return 'from-rose-gold-500 to-rose-gold-600'
      case 'processing': return 'from-rose-gold-500 to-rose-gold-600'
      case 'error': return 'from-rose-gold-500 to-rose-gold-600'
      default: return 'from-rose-gold-400 to-rose-gold-600'
    }
  }

  // Get pulse animation
  const getPulseClass = () => {
    if (voiceStatus === 'listening' && voiceActive) return 'animate-pulse'
    if (voiceStatus === 'wake_word') return 'animate-bounce'
    if (voiceStatus === 'speaking') return 'animate-pulse'
    return ''
  }

  return (
    <div className="h-full w-full flex flex-col bg-dark-400">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getStatusColor()} flex items-center justify-center ${getPulseClass()}`}>
            {voiceStatus === 'speaking' ? (
              <Waves className="w-5 h-5 text-dark-500" />
            ) : voiceStatus === 'wake_word' ? (
              <Zap className="w-5 h-5 text-dark-500" />
            ) : (
              <Mic className="w-5 h-5 text-dark-500" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Voice Interface</h2>
            <p className="text-xs text-white/40">
              {voiceStatus === 'idle' && 'Ready to listen'}
              {voiceStatus === 'listening' && (voiceActive ? 'Hearing you...' : 'Listening...')}
              {voiceStatus === 'processing' && 'Processing...'}
              {voiceStatus === 'speaking' && 'Speaking...'}
              {voiceStatus === 'wake_word' && 'Wake word detected!'}
              {voiceStatus === 'error' && 'Error occurred'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Wake Word Toggle */}
          <button
            onClick={() => setWakeWordEnabled(!wakeWordEnabled)}
            className={`p-2 rounded-lg transition-colors ${
              wakeWordEnabled
                ? 'text-rose-gold-400 bg-rose-gold-500/10'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
            title={wakeWordEnabled ? `Wake word ON (say "Hey ${BRAND.name}")` : 'Wake word OFF'}
          >
            {wakeWordEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
            className={`p-2 rounded-lg transition-colors ${
              voiceOutputEnabled
                ? 'text-rose-gold-400 bg-rose-gold-400/10'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
            title={voiceOutputEnabled ? 'Voice output ON' : 'Voice output OFF'}
          >
            {voiceOutputEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings
                ? 'text-rose-gold-400 bg-rose-gold-400/10'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Browser Support Warning */}
      {(!speechRecognitionSupported || !speechSynthesisSupported) && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-rose-gold-500/10 border border-rose-gold-400/30">
          <div className="flex items-center gap-2 text-rose-gold-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Limited Browser Support</span>
          </div>
          <p className="text-sm text-rose-gold-400/70 mt-1">
            {!speechRecognitionSupported && 'Speech recognition is not supported. '}
            {!speechSynthesisSupported && 'Speech synthesis is not supported. '}
            Try using Chrome or Edge for full functionality.
          </p>
        </div>
      )}

      {/* Microphone Permission Request */}
      {micPermission === 'denied' && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-rose-gold-500/10 border border-rose-gold-400/30">
          <div className="flex items-center gap-2 text-rose-gold-400">
            <MicOff className="w-5 h-5" />
            <span className="font-medium">Microphone Access Denied</span>
          </div>
          <p className="text-sm text-rose-gold-400/70 mt-1">
            Please enable microphone access in your browser settings to use voice input.
          </p>
        </div>
      )}

      {/* Voice Commands Help */}
      {voiceStatus === 'listening' && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-gold-400/5 border border-rose-gold-400/20">
          <p className="text-xs text-white/50 flex items-center gap-2">
            <Radio className="w-3 h-3 text-rose-gold-400" />
            Voice commands: "Stop listening" | "Read that again" | "Clear" | "Send"
          </p>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-dark-300/50 border border-white/10 space-y-4 max-h-[400px] overflow-y-auto morphic-scrollbar">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/80 font-medium">
              <SlidersHorizontal className="w-4 h-4" />
              <span>Voice Settings</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-gold-400" />
              <span className="text-xs text-rose-gold-400 font-medium">Neural TTS</span>
            </div>
          </div>

          {/* Neural TTS Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-dark-500/50 border border-white/5">
            <div>
              <span className="text-sm text-white">Use Neural Voices</span>
              <p className="text-xs text-white/40">High-quality, natural sounding voices</p>
            </div>
            <button
              onClick={() => setUseNeural(!useNeural)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                useNeural ? 'bg-rose-gold-400' : 'bg-white/20'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  useNeural ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Language Selection */}
          <div>
            <label className="flex items-center gap-2 text-sm text-white/60 mb-2">
              <Languages className="w-4 h-4" />
              Recognition Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full bg-dark-500 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-gold-400/50"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Neural Voice Selection */}
          {useNeural && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">Output Voice (Neural)</label>

              {/* Female Voices */}
              <div className="mb-3">
                <span className="text-xs text-white/40 uppercase tracking-wider">Female Voices</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {neuralVoices.filter(v => v.gender === 'female').map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoiceId(voice.id)}
                      className={`group relative p-2 rounded-lg text-left transition-all ${
                        selectedVoiceId === voice.id
                          ? 'bg-rose-gold-400/20 border border-rose-gold-400/50'
                          : 'bg-dark-500/50 border border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${selectedVoiceId === voice.id ? 'text-rose-gold-400' : 'text-white/80'}`}>
                          {voice.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            previewVoice(voice.id)
                          }}
                          disabled={previewingVoice === voice.id}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                        >
                          {previewingVoice === voice.id ? (
                            <Loader2 className="w-3 h-3 text-rose-gold-400 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 text-white/60" />
                          )}
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Male Voices */}
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider">Male Voices</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {neuralVoices.filter(v => v.gender === 'male').map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoiceId(voice.id)}
                      className={`group relative p-2 rounded-lg text-left transition-all ${
                        selectedVoiceId === voice.id
                          ? 'bg-rose-gold-400/20 border border-rose-gold-400/50'
                          : 'bg-dark-500/50 border border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${selectedVoiceId === voice.id ? 'text-rose-gold-400' : 'text-white/80'}`}>
                          {voice.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            previewVoice(voice.id)
                          }}
                          disabled={previewingVoice === voice.id}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                        >
                          {previewingVoice === voice.id ? (
                            <Loader2 className="w-3 h-3 text-rose-gold-400 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 text-white/60" />
                          )}
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Browser Voice Selection (when not using neural) */}
          {!useNeural && browserVoices.length > 0 && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">Browser Voice</label>
              <select
                value={selectedBrowserVoiceURI}
                onChange={(e) => setSelectedBrowserVoiceURI(e.target.value)}
                className="w-full bg-dark-500 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-gold-400/50"
              >
                <option value="">Auto-select best voice</option>
                {browserVoices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Speed */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">
              Speed: {speechRate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speechRate}
              onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
              className="w-full accent-rose-gold-400"
            />
          </div>

          {/* Pitch (only for browser TTS) */}
          {!useNeural && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">
                Pitch: {speechPitch.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={speechPitch}
                onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                className="w-full accent-rose-gold-400"
              />
            </div>
          )}

          {/* Volume */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">
              Volume: {Math.round(speechVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={speechVolume}
              onChange={(e) => setSpeechVolume(parseFloat(e.target.value))}
              className="w-full accent-rose-gold-400"
            />
          </div>

          {/* Test Voice Button */}
          <button
            onClick={testVoice}
            className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-rose-gold-400/20 to-rose-gold-600/20 text-rose-gold-400 hover:from-rose-gold-400/30 hover:to-rose-gold-600/30 transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <Volume2 className="w-4 h-4" />
            Test Current Voice
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto morphic-scrollbar">
        {/* Waveform Visualization */}
        <div className="relative w-full max-w-md mb-8">
          {/* Audio Waveform */}
          <div className="mb-6">
            <AudioWaveform
              isActive={voiceActive}
              volume={currentVolume}
              status={voiceStatus}
            />
          </div>

          {/* Center button */}
          <div className="flex justify-center">
            <button
              onClick={toggleListening}
              disabled={!speechRecognitionSupported || voiceStatus === 'processing' || micPermission === 'denied'}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                voiceStatus === 'listening'
                  ? 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-lg shadow-rose-500/50'
                  : voiceStatus === 'wake_word'
                  ? 'bg-gradient-to-br from-rose-gold-500 to-rose-gold-600 shadow-lg shadow-green-500/50'
                  : voiceStatus === 'speaking'
                  ? 'bg-gradient-to-br from-rose-gold-500 to-rose-gold-600 shadow-lg shadow-purple-500/50'
                  : voiceStatus === 'processing'
                  ? 'bg-gradient-to-br from-rose-gold-500 to-rose-gold-600 shadow-lg shadow-amber-500/50'
                  : voiceStatus === 'error'
                  ? 'bg-gradient-to-br from-rose-gold-500 to-rose-gold-600 shadow-lg shadow-red-500/50'
                  : 'bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 hover:shadow-lg hover:shadow-rose-gold-500/30'
              } ${(!speechRecognitionSupported || micPermission === 'denied') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {/* Pulsing rings when listening */}
              {(voiceStatus === 'listening' || voiceStatus === 'wake_word') && (
                <>
                  <div className={`absolute inset-0 rounded-full border-2 ${voiceStatus === 'wake_word' ? 'border-rose-gold-400' : 'border-rose-400'} animate-ping opacity-30`} />
                  <div className={`absolute inset-[-8px] rounded-full border ${voiceStatus === 'wake_word' ? 'border-rose-gold-400' : 'border-rose-400'} animate-pulse opacity-20`} />
                  <div className={`absolute inset-[-16px] rounded-full border ${voiceStatus === 'wake_word' ? 'border-rose-gold-400' : 'border-rose-400'} animate-pulse opacity-10`} style={{ animationDelay: '0.2s' }} />
                </>
              )}

              {voiceStatus === 'listening' && <MicOff className="w-10 h-10 text-dark-500" />}
              {voiceStatus === 'wake_word' && <Zap className="w-10 h-10 text-dark-500 animate-pulse" />}
              {voiceStatus === 'speaking' && <Waves className="w-10 h-10 text-dark-500 animate-pulse" />}
              {voiceStatus === 'processing' && (
                <Loader2 className="w-10 h-10 text-dark-500 animate-spin" />
              )}
              {voiceStatus === 'error' && <AlertCircle className="w-10 h-10 text-dark-500" />}
              {voiceStatus === 'idle' && <Mic className="w-10 h-10 text-dark-500" />}
            </button>
          </div>

          {/* Volume indicator */}
          {voiceStatus === 'listening' && (
            <div className="mt-4 flex justify-center">
              <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 transition-all duration-100"
                  style={{ width: `${currentVolume * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Status Text */}
        <div className="text-center mb-6">
          {voiceStatus === 'idle' && (
            <p className="text-white/60">
              {wakeWordEnabled
                ? `Say "Hey ${BRAND.name}" or click the microphone`
                : 'Click the microphone to start speaking'
              }
            </p>
          )}
          {voiceStatus === 'listening' && (
            <p className="text-rose-gold-400 animate-pulse">Listening... Speak now</p>
          )}
          {voiceStatus === 'wake_word' && (
            <p className="text-rose-gold-400 font-medium">I'm listening! How can I help?</p>
          )}
          {voiceStatus === 'processing' && (
            <p className="text-rose-gold-400">Processing your request...</p>
          )}
          {voiceStatus === 'speaking' && (
            <p className="text-rose-gold-400">AI is speaking...</p>
          )}
          {voiceStatus === 'error' && error && (
            <p className="text-rose-gold-400">{error}</p>
          )}
        </div>

        {/* Transcript Display */}
        <div className="w-full max-w-2xl space-y-4">
          {/* Current transcript */}
          {(transcript || interimTranscript) && (
            <div className="morphic-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-4 h-4 text-rose-gold-400" />
                <span className="text-sm font-medium text-rose-gold-400">Your Speech</span>
              </div>
              <p className="text-white">
                {transcript}
                {interimTranscript && (
                  <span className="text-white/50 italic"> {interimTranscript}</span>
                )}
              </p>
            </div>
          )}

          {/* AI Response */}
          {aiResponse && (
            <div className="morphic-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-rose-gold-400" />
                  <span className="text-sm font-medium text-rose-gold-400">AI Response</span>
                </div>
                {voiceOutputEnabled && voiceStatus !== 'speaking' && (
                  <button
                    onClick={repeatLastResponse}
                    className="p-1 rounded hover:bg-white/5 transition-colors"
                    title="Read again"
                  >
                    <RefreshCw className="w-4 h-4 text-white/40 hover:text-white/60" />
                  </button>
                )}
              </div>
              <p className="text-white whitespace-pre-wrap">{aiResponse}</p>
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-3 mt-6">
          {/* Send to AI */}
          <button
            onClick={sendToAI}
            disabled={!transcript.trim() || voiceStatus === 'processing'}
            className="morphic-btn py-2 px-4 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>Send to AI</span>
          </button>

          {/* Stop Speaking */}
          {voiceStatus === 'speaking' && (
            <button
              onClick={stopSpeaking}
              className="py-2 px-4 rounded-lg bg-rose-gold-500/20 text-rose-gold-400 hover:bg-rose-gold-500/30 transition-colors text-sm flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}

          {/* Read Again */}
          {voiceService.getLastResponse() && voiceStatus === 'idle' && (
            <button
              onClick={repeatLastResponse}
              className="py-2 px-4 rounded-lg bg-rose-gold-500/20 text-rose-gold-400 hover:bg-rose-gold-500/30 transition-colors text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Read Again</span>
            </button>
          )}

          {/* Clear */}
          <button
            onClick={clearConversation}
            className="py-2 px-4 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Conversation History */}
      {conversationHistory.length > 0 && (
        <div className="border-t border-white/10 px-6 py-4 max-h-64 overflow-y-auto morphic-scrollbar">
          <h3 className="text-sm font-medium text-white/60 mb-3">Conversation History</h3>
          <div className="space-y-3">
            {conversationHistory.map((msg, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-rose-gold-400/10 border border-rose-gold-400/20'
                    : 'bg-rose-gold-500/10 border border-rose-gold-400/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {msg.role === 'user' ? (
                    <Mic className="w-3 h-3 text-rose-gold-400" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-rose-gold-400" />
                  )}
                  <span
                    className={`text-xs font-medium ${
                      msg.role === 'user' ? 'text-rose-gold-400' : 'text-rose-gold-400'
                    }`}
                  >
                    {msg.role === 'user' ? 'You' : 'AI'}
                  </span>
                </div>
                <p className="text-sm text-white/80 line-clamp-2">{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
