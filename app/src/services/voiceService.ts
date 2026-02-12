// Voice Service - Speech-to-Text and Neural Text-to-Speech
// Uses StreamElements neural voices for natural sounding speech

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

export interface NeuralVoice {
  id: string
  name: string
  gender: 'male' | 'female'
  preview?: string
}

export interface SpeechConfig {
  voice: string // Neural voice ID
  rate: number // 0.5 to 2
  volume: number // 0 to 1
  useNeural: boolean // Whether to use neural TTS
}

export type TranscriptCallback = (transcript: string, isFinal: boolean) => void
export type ErrorCallback = (error: string) => void
export type SpeechEndCallback = () => void

// Available neural voices (high quality, natural sounding)
const NEURAL_VOICES: NeuralVoice[] = [
  // Female voices - Natural & Professional
  { id: 'aria', name: 'Aria (Natural)', gender: 'female' },
  { id: 'jenny', name: 'Jenny (Friendly)', gender: 'female' },
  { id: 'salli', name: 'Salli (Professional)', gender: 'female' },
  { id: 'kimberly', name: 'Kimberly (Warm)', gender: 'female' },
  { id: 'joanna', name: 'Joanna (Clear)', gender: 'female' },
  { id: 'ivy', name: 'Ivy (Young)', gender: 'female' },
  { id: 'kendra', name: 'Kendra (Confident)', gender: 'female' },

  // Male voices - Natural & Professional
  { id: 'brian', name: 'Brian (Deep)', gender: 'male' },
  { id: 'joey', name: 'Joey (Casual)', gender: 'male' },
  { id: 'justin', name: 'Justin (Young)', gender: 'male' },
  { id: 'matthew', name: 'Matthew (Professional)', gender: 'male' },
  { id: 'russell', name: 'Russell (Australian)', gender: 'male' },
]

class VoiceService {
  private recognition: SpeechRecognitionType | null = null
  private isListening: boolean = false
  private transcriptCallback: TranscriptCallback | null = null
  private errorCallback: ErrorCallback | null = null

  private config: VoiceServiceConfig = {
    language: 'en-US',
    continuous: true,
    interimResults: true
  }

  private speechConfig: SpeechConfig = {
    voice: 'brian', // Default to Brian (sounds like 11Labs)
    rate: 1,
    volume: 1,
    useNeural: true
  }

  private audioContext: AudioContext | null = null
  private currentAudio: HTMLAudioElement | null = null
  private isSpeaking: boolean = false
  private speechQueue: { text: string; onEnd?: SpeechEndCallback }[] = []

  constructor() {
    this.initializeSpeechRecognition()
  }

  // ============================================
  // SPEECH-TO-TEXT (Speech Recognition)
  // ============================================

  private initializeSpeechRecognition(): void {
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

  getIsListening(): boolean {
    return this.isListening
  }

  setLanguage(language: string): void {
    this.config.language = language
    if (this.recognition) {
      this.recognition.lang = language
    }
  }

  setContinuous(continuous: boolean): void {
    this.config.continuous = continuous
    if (this.recognition) {
      this.recognition.continuous = continuous
    }
  }

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
    ]
  }

  // ============================================
  // TEXT-TO-SPEECH (Neural TTS)
  // ============================================

  /**
   * Get available neural voices (high quality)
   */
  getNeuralVoices(): NeuralVoice[] {
    return NEURAL_VOICES
  }

  /**
   * Set the neural voice
   */
  setVoice(voiceId: string): void {
    this.speechConfig.voice = voiceId
  }

  /**
   * Set speech rate (0.5 to 2)
   */
  setRate(rate: number): void {
    this.speechConfig.rate = Math.max(0.5, Math.min(2, rate))
  }

  /**
   * Set speech volume (0 to 1)
   */
  setVolume(volume: number): void {
    this.speechConfig.volume = Math.max(0, Math.min(1, volume))
  }

  /**
   * Enable/disable neural TTS
   */
  setUseNeural(useNeural: boolean): void {
    this.speechConfig.useNeural = useNeural
  }

  /**
   * Get current speech config
   */
  getSpeechConfig(): SpeechConfig {
    return { ...this.speechConfig }
  }

  /**
   * Speak text using neural TTS (natural voice)
   */
  async speak(text: string, onEnd?: SpeechEndCallback): Promise<void> {
    if (!text || text.trim().length === 0) {
      if (onEnd) onEnd()
      return
    }

    // Add to queue
    this.speechQueue.push({ text, onEnd })

    // Process queue if not already speaking
    if (!this.isSpeaking) {
      this.processQueue()
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isSpeaking || this.speechQueue.length === 0) {
      return
    }

    const item = this.speechQueue.shift()
    if (!item) return

    this.isSpeaking = true

    try {
      if (this.speechConfig.useNeural) {
        await this.speakNeural(item.text)
      } else {
        await this.speakWebAPI(item.text)
      }
    } catch (error) {
      console.error('TTS error, falling back to Web Speech API:', error)
      try {
        await this.speakWebAPI(item.text)
      } catch (e) {
        console.error('Web Speech API also failed:', e)
      }
    }

    this.isSpeaking = false
    if (item.onEnd) item.onEnd()

    // Process next in queue
    this.processQueue()
  }

  /**
   * Neural TTS via API (high quality)
   */
  private async speakNeural(text: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Call our neural TTS API
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: this.speechConfig.voice,
          }),
        })

        if (!response.ok) {
          throw new Error(`TTS API error: ${response.status}`)
        }

        // Get audio blob and play it
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)

        this.currentAudio = new Audio(audioUrl)
        this.currentAudio.volume = this.speechConfig.volume
        this.currentAudio.playbackRate = this.speechConfig.rate

        this.currentAudio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          this.currentAudio = null
          resolve()
        }

        this.currentAudio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl)
          this.currentAudio = null
          reject(e)
        }

        await this.currentAudio.play()
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Web Speech API fallback (basic quality)
   */
  private speakWebAPI(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'))
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = this.speechConfig.rate
      utterance.volume = this.speechConfig.volume

      // Try to find a good voice
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find(v =>
        v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Neural')
      ) || voices.find(v => v.lang.startsWith('en'))

      if (preferredVoice) {
        utterance.voice = preferredVoice
      }

      utterance.onend = () => resolve()
      utterance.onerror = (e) => reject(e)

      window.speechSynthesis.speak(utterance)
    })
  }

  /**
   * Speak multiple texts in sequence
   */
  async speakMultiple(texts: string[], onAllEnd?: SpeechEndCallback): Promise<void> {
    for (let i = 0; i < texts.length; i++) {
      const isLast = i === texts.length - 1
      await this.speak(texts[i], isLast ? onAllEnd : undefined)
    }
  }

  /**
   * Stop speaking and clear queue
   */
  stopSpeaking(): void {
    // Stop current audio
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio = null
    }

    // Cancel Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    // Clear queue
    this.speechQueue = []
    this.isSpeaking = false
  }

  /**
   * Pause speaking
   */
  pauseSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause()
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause()
    }
  }

  /**
   * Resume speaking
   */
  resumeSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.play()
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume()
    }
  }

  /**
   * Check if currently speaking
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking ||
      (this.currentAudio !== null && !this.currentAudio.paused) ||
      (('speechSynthesis' in window) && window.speechSynthesis.speaking)
  }

  /**
   * Check if speech synthesis is supported
   */
  isSpeechSynthesisSupported(): boolean {
    return true // Neural TTS always works via API
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

  /**
   * Preview a voice with sample text
   */
  async previewVoice(voiceId: string): Promise<void> {
    const originalVoice = this.speechConfig.voice
    this.speechConfig.voice = voiceId

    await this.speak('Hello! This is how I sound. I can help you with anything.')

    this.speechConfig.voice = originalVoice
  }
}

// Export singleton instance
export const voiceService = new VoiceService()
export default voiceService
