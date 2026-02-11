// Voice Service - Speech-to-Text and Text-to-Speech using Web Speech API

// Type declarations for Web Speech API
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEventType {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEventType {
  error: string
  message: string
}

interface SpeechRecognitionType extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventType) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventType) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export interface VoiceServiceConfig {
  language: string
  continuous: boolean
  interimResults: boolean
}

export interface SpeechConfig {
  voice: SpeechSynthesisVoice | null
  rate: number // 0.1 to 10
  pitch: number // 0 to 2
  volume: number // 0 to 1
}

export type TranscriptCallback = (transcript: string, isFinal: boolean) => void
export type ErrorCallback = (error: string) => void
export type SpeechEndCallback = () => void

class VoiceService {
  private recognition: SpeechRecognitionType | null = null
  private synthesis: SpeechSynthesis | null = null
  private isListening: boolean = false
  private transcriptCallback: TranscriptCallback | null = null
  private errorCallback: ErrorCallback | null = null

  private config: VoiceServiceConfig = {
    language: 'en-US',
    continuous: true,
    interimResults: true
  }

  private speechConfig: SpeechConfig = {
    voice: null,
    rate: 1,
    pitch: 1,
    volume: 1
  }

  private utteranceQueue: SpeechSynthesisUtterance[] = []
  private isSpeaking: boolean = false
  private availableVoices: SpeechSynthesisVoice[] = []

  constructor() {
    this.initializeSpeechRecognition()
    this.initializeSpeechSynthesis()
  }

  // ============================================
  // SPEECH-TO-TEXT (Speech Recognition)
  // ============================================

  private initializeSpeechRecognition(): void {
    // Check for browser support
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      console.warn('Speech Recognition is not supported in this browser')
      return
    }

    this.recognition = new SpeechRecognitionAPI()
    this.configureRecognition()
  }

  private configureRecognition(): void {
    if (!this.recognition) return

    this.recognition.continuous = this.config.continuous
    this.recognition.interimResults = this.config.interimResults
    this.recognition.lang = this.config.language

    this.recognition.onresult = (event: SpeechRecognitionEventType) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      if (finalTranscript && this.transcriptCallback) {
        this.transcriptCallback(finalTranscript, true)
      } else if (interimTranscript && this.transcriptCallback) {
        this.transcriptCallback(interimTranscript, false)
      }
    }

    this.recognition.onerror = (event: SpeechRecognitionErrorEventType) => {
      const errorMessages: Record<string, string> = {
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone found. Please check your settings.',
        'not-allowed': 'Microphone access denied. Please allow microphone access.',
        'network': 'Network error occurred. Please check your connection.',
        'aborted': 'Speech recognition was aborted.',
        'language-not-supported': 'Language is not supported.',
        'service-not-allowed': 'Speech recognition service not allowed.'
      }

      const message = errorMessages[event.error] || `Speech recognition error: ${event.error}`

      if (this.errorCallback) {
        this.errorCallback(message)
      }

      this.isListening = false
    }

    this.recognition.onend = () => {
      // Auto-restart if continuous mode is enabled and we're still supposed to be listening
      if (this.isListening && this.config.continuous) {
        try {
          this.recognition?.start()
        } catch (e) {
          // Ignore - already started
        }
      } else {
        this.isListening = false
      }
    }
  }

  /**
   * Start listening for speech
   */
  startListening(
    onTranscript: TranscriptCallback,
    onError?: ErrorCallback
  ): boolean {
    if (!this.recognition) {
      if (onError) {
        onError('Speech recognition is not supported in this browser')
      }
      return false
    }

    this.transcriptCallback = onTranscript
    this.errorCallback = onError || null

    try {
      this.recognition.start()
      this.isListening = true
      return true
    } catch (error) {
      if (onError) {
        onError('Failed to start speech recognition')
      }
      return false
    }
  }

  /**
   * Stop listening for speech
   */
  stopListening(): void {
    this.isListening = false
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (e) {
        // Ignore - already stopped
      }
    }
    this.transcriptCallback = null
    this.errorCallback = null
  }

  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening
  }

  /**
   * Set the language for speech recognition
   */
  setLanguage(language: string): void {
    this.config.language = language
    if (this.recognition) {
      this.recognition.lang = language
    }
  }

  /**
   * Set continuous mode
   */
  setContinuous(continuous: boolean): void {
    this.config.continuous = continuous
    if (this.recognition) {
      this.recognition.continuous = continuous
    }
  }

  /**
   * Get available languages for speech recognition
   */
  getSupportedLanguages(): { code: string; name: string }[] {
    return [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'es-MX', name: 'Spanish (Mexico)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German' },
      { code: 'it-IT', name: 'Italian' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'ja-JP', name: 'Japanese' },
      { code: 'ko-KR', name: 'Korean' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'zh-TW', name: 'Chinese (Traditional)' },
      { code: 'ru-RU', name: 'Russian' },
      { code: 'ar-SA', name: 'Arabic' },
      { code: 'hi-IN', name: 'Hindi' },
      { code: 'nl-NL', name: 'Dutch' },
      { code: 'pl-PL', name: 'Polish' },
      { code: 'sv-SE', name: 'Swedish' },
      { code: 'th-TH', name: 'Thai' },
      { code: 'vi-VN', name: 'Vietnamese' }
    ]
  }

  // ============================================
  // TEXT-TO-SPEECH (Speech Synthesis)
  // ============================================

  private initializeSpeechSynthesis(): void {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech Synthesis is not supported in this browser')
      return
    }

    this.synthesis = window.speechSynthesis

    // Load voices - they may not be available immediately
    this.loadVoices()

    // Some browsers fire voiceschanged event when voices are loaded
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = () => this.loadVoices()
    }
  }

  private loadVoices(): void {
    if (!this.synthesis) return

    this.availableVoices = this.synthesis.getVoices()

    // Set default voice if not already set
    if (!this.speechConfig.voice && this.availableVoices.length > 0) {
      // Try to find a default English voice
      const defaultVoice = this.availableVoices.find(v =>
        v.default || v.lang.startsWith('en')
      ) || this.availableVoices[0]

      this.speechConfig.voice = defaultVoice
    }
  }

  /**
   * Get available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.availableVoices
  }

  /**
   * Set the voice for speech synthesis
   */
  setVoice(voice: SpeechSynthesisVoice | null): void {
    this.speechConfig.voice = voice
  }

  /**
   * Set speech rate (0.1 to 10)
   */
  setRate(rate: number): void {
    this.speechConfig.rate = Math.max(0.1, Math.min(10, rate))
  }

  /**
   * Set speech pitch (0 to 2)
   */
  setPitch(pitch: number): void {
    this.speechConfig.pitch = Math.max(0, Math.min(2, pitch))
  }

  /**
   * Set speech volume (0 to 1)
   */
  setVolume(volume: number): void {
    this.speechConfig.volume = Math.max(0, Math.min(1, volume))
  }

  /**
   * Get current speech config
   */
  getSpeechConfig(): SpeechConfig {
    return { ...this.speechConfig }
  }

  /**
   * Speak text aloud
   */
  speak(text: string, onEnd?: SpeechEndCallback): void {
    if (!this.synthesis) {
      console.warn('Speech synthesis not available')
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)

    if (this.speechConfig.voice) {
      utterance.voice = this.speechConfig.voice
    }
    utterance.rate = this.speechConfig.rate
    utterance.pitch = this.speechConfig.pitch
    utterance.volume = this.speechConfig.volume

    utterance.onend = () => {
      this.isSpeaking = false
      this.processQueue()
      if (onEnd) onEnd()
    }

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error)
      this.isSpeaking = false
      this.processQueue()
    }

    // Add to queue and process
    this.utteranceQueue.push(utterance)
    this.processQueue()
  }

  private processQueue(): void {
    if (!this.synthesis || this.isSpeaking || this.utteranceQueue.length === 0) {
      return
    }

    const utterance = this.utteranceQueue.shift()
    if (utterance) {
      this.isSpeaking = true
      this.synthesis.speak(utterance)
    }
  }

  /**
   * Queue multiple texts to speak
   */
  speakMultiple(texts: string[], onAllEnd?: SpeechEndCallback): void {
    texts.forEach((text, index) => {
      const isLast = index === texts.length - 1
      this.speak(text, isLast ? onAllEnd : undefined)
    })
  }

  /**
   * Stop speaking and clear queue
   */
  stopSpeaking(): void {
    if (this.synthesis) {
      this.synthesis.cancel()
      this.utteranceQueue = []
      this.isSpeaking = false
    }
  }

  /**
   * Pause speaking
   */
  pauseSpeaking(): void {
    if (this.synthesis) {
      this.synthesis.pause()
    }
  }

  /**
   * Resume speaking
   */
  resumeSpeaking(): void {
    if (this.synthesis) {
      this.synthesis.resume()
    }
  }

  /**
   * Check if currently speaking
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking || (this.synthesis?.speaking ?? false)
  }

  /**
   * Check if speech synthesis is supported
   */
  isSpeechSynthesisSupported(): boolean {
    return 'speechSynthesis' in window
  }

  /**
   * Check if speech recognition is supported
   */
  isSpeechRecognitionSupported(): boolean {
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    )
  }
}

// Export singleton instance
export const voiceService = new VoiceService()
export default voiceService
