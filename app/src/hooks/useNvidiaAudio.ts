/**
 * useNvidiaAudio Hook
 *
 * React hook for integrating NVIDIA audio capabilities (ASR + TTS)
 * using Sherpa-ONNX WebAssembly and NeMo backend.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  nvidiaAudio,
  type ASRResult,
  type AudioStreamCallbacks,
  type NvidiaAudioConfig
} from '../services/nvidiaAudio'

export interface UseNvidiaAudioOptions {
  autoInitialize?: boolean
  config?: Partial<NvidiaAudioConfig>
  onTranscript?: (result: ASRResult) => void
  onPartialTranscript?: (text: string) => void
  onError?: (error: Error) => void
  onAudioLevel?: (level: number) => void
}

export interface UseNvidiaAudioReturn {
  // State
  isInitialized: boolean
  isListening: boolean
  isProcessing: boolean
  isSpeaking: boolean
  transcript: string
  partialTranscript: string
  audioLevel: number
  error: Error | null
  providers: {
    sherpaOnnx: boolean
    nemoApi: boolean
    webSpeechApi: boolean
  }

  // Actions
  initialize: () => Promise<void>
  startListening: () => Promise<void>
  stopListening: () => Promise<ASRResult | null>
  transcribeFile: (file: File) => Promise<ASRResult>
  speak: (text: string) => Promise<void>
  cancelSpeech: () => void
  clearTranscript: () => void
  updateConfig: (config: Partial<NvidiaAudioConfig>) => void
}

export function useNvidiaAudio(options: UseNvidiaAudioOptions = {}): UseNvidiaAudioReturn {
  const {
    autoInitialize = true,
    config,
    onTranscript,
    onPartialTranscript,
    onError,
    onAudioLevel
  } = options

  // State
  const [isInitialized, setIsInitialized] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [providers, setProviders] = useState({
    sherpaOnnx: false,
    nemoApi: false,
    webSpeechApi: false
  })

  // Refs for callbacks
  const onTranscriptRef = useRef(onTranscript)
  const onPartialTranscriptRef = useRef(onPartialTranscript)
  const onErrorRef = useRef(onError)
  const onAudioLevelRef = useRef(onAudioLevel)

  // Update refs when callbacks change
  useEffect(() => {
    onTranscriptRef.current = onTranscript
    onPartialTranscriptRef.current = onPartialTranscript
    onErrorRef.current = onError
    onAudioLevelRef.current = onAudioLevel
  }, [onTranscript, onPartialTranscript, onError, onAudioLevel])

  // Initialize on mount
  useEffect(() => {
    if (autoInitialize) {
      initialize()
    }
  }, [autoInitialize])

  // Apply config
  useEffect(() => {
    if (config) {
      nvidiaAudio.updateConfig(config)
    }
  }, [config])

  const initialize = useCallback(async () => {
    try {
      setError(null)
      await nvidiaAudio.initialize()
      setProviders(nvidiaAudio.getStatus())
      setIsInitialized(true)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to initialize')
      setError(error)
      onErrorRef.current?.(error)
    }
  }, [])

  const startListening = useCallback(async () => {
    if (!isInitialized) {
      await initialize()
    }

    setError(null)
    setPartialTranscript('')

    const callbacks: AudioStreamCallbacks = {
      onPartialResult: (text) => {
        setPartialTranscript(text)
        onPartialTranscriptRef.current?.(text)
      },
      onFinalResult: (result) => {
        setTranscript(result.text)
        setPartialTranscript('')
        onTranscriptRef.current?.(result)
      },
      onError: (err) => {
        setError(err)
        setIsListening(false)
        onErrorRef.current?.(err)
      },
      onAudioLevel: (level) => {
        setAudioLevel(level)
        onAudioLevelRef.current?.(level)
      },
      onStatusChange: (status) => {
        setIsListening(status === 'listening')
        setIsProcessing(status === 'processing')
        setIsSpeaking(status === 'speaking')
      }
    }

    try {
      await nvidiaAudio.startListening(callbacks)
      setIsListening(true)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start listening')
      setError(error)
      onErrorRef.current?.(error)
    }
  }, [isInitialized, initialize])

  const stopListening = useCallback(async () => {
    setIsListening(false)
    setIsProcessing(true)

    try {
      const result = await nvidiaAudio.stopListening()
      setIsProcessing(false)

      if (result) {
        setTranscript(result.text)
        onTranscriptRef.current?.(result)
      }

      return result
    } catch (err) {
      setIsProcessing(false)
      const error = err instanceof Error ? err : new Error('Failed to stop listening')
      setError(error)
      onErrorRef.current?.(error)
      return null
    }
  }, [])

  const transcribeFile = useCallback(async (file: File): Promise<ASRResult> => {
    if (!isInitialized) {
      await initialize()
    }

    setIsProcessing(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await nvidiaAudio.transcribeAudio(arrayBuffer)
      setTranscript(result.text)
      onTranscriptRef.current?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Transcription failed')
      setError(error)
      onErrorRef.current?.(error)
      throw error
    } finally {
      setIsProcessing(false)
    }
  }, [isInitialized, initialize])

  const speak = useCallback(async (text: string) => {
    if (!isInitialized) {
      await initialize()
    }

    setIsSpeaking(true)
    setError(null)

    try {
      await nvidiaAudio.speak(text, () => {
        setIsSpeaking(false)
      })
    } catch (err) {
      setIsSpeaking(false)
      const error = err instanceof Error ? err : new Error('TTS failed')
      setError(error)
      onErrorRef.current?.(error)
    }
  }, [isInitialized, initialize])

  const cancelSpeech = useCallback(() => {
    nvidiaAudio.cancelSpeech()
    setIsSpeaking(false)
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    setPartialTranscript('')
  }, [])

  const updateConfig = useCallback((newConfig: Partial<NvidiaAudioConfig>) => {
    nvidiaAudio.updateConfig(newConfig)
  }, [])

  return {
    // State
    isInitialized,
    isListening,
    isProcessing,
    isSpeaking,
    transcript,
    partialTranscript,
    audioLevel,
    error,
    providers,

    // Actions
    initialize,
    startListening,
    stopListening,
    transcribeFile,
    speak,
    cancelSpeech,
    clearTranscript,
    updateConfig
  }
}

export default useNvidiaAudio
