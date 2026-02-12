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
  Sparkles
} from 'lucide-react'
import { voiceService, type NeuralVoice } from '@/services/voiceService'
import { useAppStore } from '@/stores/appStore'
import aiService from '@/services/ai'

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

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
  const [selectedVoiceId, setSelectedVoiceId] = useState('brian')
  const [speechRate, setSpeechRate] = useState(1)
  const [speechVolume, setSpeechVolume] = useState(1)
  const [useNeural, setUseNeural] = useState(true)
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)

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

    // Get current speech config
    const config = voiceService.getSpeechConfig()
    setSelectedVoiceId(config.voice)
    setSpeechRate(config.rate)
    setSpeechVolume(config.volume)
    setUseNeural(config.useNeural)
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
    voiceService.setVolume(speechVolume)
  }, [speechVolume])

  useEffect(() => {
    voiceService.setUseNeural(useNeural)
  }, [useNeural])

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

  // Start listening
  const startListening = useCallback(() => {
    setError(null)
    setInterimTranscript('')

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
      }
    )

    if (success) {
      setVoiceStatus('listening')
      startWaveformAnimation()
    }
  }, [startWaveformAnimation, stopWaveformAnimation])

  // Stop listening
  const stopListening = useCallback(() => {
    voiceService.stopListening()
    setVoiceStatus('idle')
    stopWaveformAnimation()
  }, [stopWaveformAnimation])

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (voiceStatus === 'listening') {
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

  return (
    <div className="h-full flex flex-col bg-dark-400">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center animate-pulse-glow">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Voice Interface</h2>
            <p className="text-xs text-white/40">
              {voiceStatus === 'idle' && 'Ready to listen'}
              {voiceStatus === 'listening' && 'Listening...'}
              {voiceStatus === 'processing' && 'Processing...'}
              {voiceStatus === 'speaking' && 'Speaking...'}
              {voiceStatus === 'error' && 'Error occurred'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
            className={`p-2 rounded-lg transition-colors ${
              voiceOutputEnabled
                ? 'text-cyan-400 bg-cyan-400/10'
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
        <div className="mx-6 mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Limited Browser Support</span>
          </div>
          <p className="text-sm text-yellow-400/70 mt-1">
            {!speechRecognitionSupported && 'Speech recognition is not supported. '}
            {!speechSynthesisSupported && 'Speech synthesis is not supported. '}
            Try using Chrome or Edge for full functionality.
          </p>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-dark-300/50 border border-white/10 space-y-4 max-h-96 overflow-y-auto morphic-scrollbar">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/80 font-medium">
              <SlidersHorizontal className="w-4 h-4" />
              <span>Voice Settings</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-cyan-400 font-medium">Neural TTS</span>
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
                useNeural ? 'bg-cyan-500' : 'bg-white/20'
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
              className="w-full bg-dark-500 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400/50"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Neural Voice Selection */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">Output Voice</label>

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
                        ? 'bg-cyan-500/20 border border-cyan-500/50'
                        : 'bg-dark-500/50 border border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${selectedVoiceId === voice.id ? 'text-cyan-400' : 'text-white/80'}`}>
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
                          <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
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
                        ? 'bg-cyan-500/20 border border-cyan-500/50'
                        : 'bg-dark-500/50 border border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${selectedVoiceId === voice.id ? 'text-cyan-400' : 'text-white/80'}`}>
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
                          <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
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
              className="w-full accent-cyan-400"
            />
          </div>

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
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Test Voice Button */}
          <button
            onClick={testVoice}
            className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30 transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <Volume2 className="w-4 h-4" />
            Test Current Voice
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
        {/* Waveform Visualization */}
        <div className="relative w-48 h-48 mb-8">
          {/* Outer rings */}
          <div
            className={`absolute inset-0 rounded-full border-2 transition-all duration-200 ${
              voiceStatus === 'listening'
                ? 'border-cyan-400 animate-ping'
                : voiceStatus === 'speaking'
                ? 'border-blue-400 animate-ping'
                : 'border-white/10'
            }`}
            style={{
              opacity: waveformIntensity * 0.3,
              transform: `scale(${1 + waveformIntensity * 0.2})`
            }}
          />
          <div
            className={`absolute inset-4 rounded-full border-2 transition-all duration-200 ${
              voiceStatus === 'listening'
                ? 'border-cyan-400'
                : voiceStatus === 'speaking'
                ? 'border-blue-400'
                : 'border-white/10'
            }`}
            style={{
              opacity: waveformIntensity * 0.5,
              transform: `scale(${1 + waveformIntensity * 0.15})`
            }}
          />
          <div
            className={`absolute inset-8 rounded-full border-2 transition-all duration-200 ${
              voiceStatus === 'listening'
                ? 'border-cyan-400'
                : voiceStatus === 'speaking'
                ? 'border-blue-400'
                : 'border-white/10'
            }`}
            style={{
              opacity: waveformIntensity * 0.7,
              transform: `scale(${1 + waveformIntensity * 0.1})`
            }}
          />

          {/* Center button */}
          <button
            onClick={toggleListening}
            disabled={!speechRecognitionSupported || voiceStatus === 'processing'}
            className={`absolute inset-12 rounded-full flex items-center justify-center transition-all duration-300 ${
              voiceStatus === 'listening'
                ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50'
                : voiceStatus === 'speaking'
                ? 'bg-blue-500 shadow-lg shadow-blue-500/50'
                : voiceStatus === 'processing'
                ? 'bg-purple-500 shadow-lg shadow-purple-500/50'
                : voiceStatus === 'error'
                ? 'bg-red-500 shadow-lg shadow-red-500/50'
                : 'bg-gradient-to-br from-cyan-400 to-blue-600 hover:shadow-lg hover:shadow-cyan-500/30'
            } ${!speechRecognitionSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {voiceStatus === 'listening' && <MicOff className="w-10 h-10 text-white" />}
            {voiceStatus === 'speaking' && <Waves className="w-10 h-10 text-white animate-pulse" />}
            {voiceStatus === 'processing' && (
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            )}
            {voiceStatus === 'error' && <AlertCircle className="w-10 h-10 text-white" />}
            {voiceStatus === 'idle' && <Mic className="w-10 h-10 text-white" />}
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center mb-6">
          {voiceStatus === 'idle' && (
            <p className="text-white/60">Click the microphone to start speaking</p>
          )}
          {voiceStatus === 'listening' && (
            <p className="text-cyan-400 animate-pulse">Listening... Speak now</p>
          )}
          {voiceStatus === 'processing' && (
            <p className="text-purple-400">Processing your request...</p>
          )}
          {voiceStatus === 'speaking' && (
            <p className="text-blue-400">AI is speaking...</p>
          )}
          {voiceStatus === 'error' && error && (
            <p className="text-red-400">{error}</p>
          )}
        </div>

        {/* Transcript Display */}
        <div className="w-full max-w-2xl space-y-4">
          {/* Current transcript */}
          {(transcript || interimTranscript) && (
            <div className="morphic-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-cyan-400">Your Speech</span>
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
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">AI Response</span>
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
              className="py-2 px-4 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
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
                    ? 'bg-cyan-500/10 border border-cyan-500/20'
                    : 'bg-blue-500/10 border border-blue-500/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {msg.role === 'user' ? (
                    <Mic className="w-3 h-3 text-cyan-400" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-blue-400" />
                  )}
                  <span
                    className={`text-xs font-medium ${
                      msg.role === 'user' ? 'text-cyan-400' : 'text-blue-400'
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
