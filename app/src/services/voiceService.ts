// Voice Service - Speech-to-Text and Neural Text-to-Speech
// Uses Web Speech API for recognition and StreamElements for TTS

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
  onaudiostart: (() => void) | null
  onaudioend: (() => void) | null
  onsoundstart: (() => void) | null
  onsoundend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
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

export interface BrowserVoice {
  name: string
  lang: string
  voiceURI: string
  default: boolean
}

export interface SpeechConfig {
  voice: string // Neural voice ID
  rate: number // 0.5 to 2
  pitch: number // 0 to 2
  volume: number // 0 to 1
  useNeural: boolean // Whether to use neural TTS
}

export type TranscriptCallback = (transcript: string, isFinal: boolean) => void
export type ErrorCallback = (error: string) => void
export type SpeechEndCallback = () => void
export type VoiceActivityCallback = (isActive: boolean, volume: number) => void
export type VoiceCommandCallback = (command: string) => void
export type WakeWordCallback = () => void

// Voice commands that can be spoken
export const VOICE_COMMANDS = {
  STOP_LISTENING: ['stop listening', 'stop', 'cancel', 'nevermind', 'never mind'],
  READ_AGAIN: ['read that again', 'repeat that', 'say that again', 'repeat'],
  CLEAR: ['clear', 'clear conversation', 'start over', 'reset'],
  SEND: ['send', 'send it', 'go', 'submit'],
} as const

// Wake words to activate the assistant
export const WAKE_WORDS = ['hey alabobai', 'hey alabobayi', 'hey alabama', 'hey ala', 'okay alabobai']

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
  private voiceActivityCallback: VoiceActivityCallback | null = null
  private voiceCommandCallback: VoiceCommandCallback | null = null
  private wakeWordCallback: WakeWordCallback | null = null

  private config: VoiceServiceConfig = {
    language: 'en-US',
    continuous: true,
    interimResults: true
  }

  private speechConfig: SpeechConfig = {
    voice: 'brian', // Default to Brian
    rate: 1,
    pitch: 1,
    volume: 1,
    useNeural: true
  }

  private currentAudio: HTMLAudioElement | null = null
  private isSpeaking: boolean = false
  private speechQueue: { text: string; onEnd?: SpeechEndCallback }[] = []
  private lastResponse: string = ''

  // Audio analysis for voice activity
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private animationFrame: number | null = null

  // Wake word detection
  private wakeWordEnabled: boolean = false
  private awaitingCommand: boolean = false
  private wakeWordTimeout: NodeJS.Timeout | null = null

  // Browser voices cache
  private browserVoices: SpeechSynthesisVoice[] = []
  private selectedBrowserVoice: SpeechSynthesisVoice | null = null

  constructor() {
    this.initializeSpeechRecognition()
    this.loadBrowserVoices()
  }

  // ============================================
  // BROWSER VOICES (for fallback TTS)
  // ============================================

  private loadBrowserVoices(): void {
    if (!('speechSynthesis' in window)) return

    const loadVoices = () => {
      this.browserVoices = window.speechSynthesis.getVoices()
      // Default to a good English voice
      this.selectedBrowserVoice = this.browserVoices.find(v =>
        v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Neural')
      ) || this.browserVoices.find(v => v.lang.startsWith('en')) || null
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }

  getBrowserVoices(): BrowserVoice[] {
    return this.browserVoices.map(v => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      default: v.default
    }))
  }

  setBrowserVoice(voiceURI: string): void {
    this.selectedBrowserVoice = this.browserVoices.find(v => v.voiceURI === voiceURI) || null
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

      // Check for wake word
      if (this.wakeWordEnabled && !this.awaitingCommand) {
        const lowerTranscript = (finalTranscript || interimTranscript).toLowerCase()
        for (const wakeWord of WAKE_WORDS) {
          if (lowerTranscript.includes(wakeWord)) {
            this.awaitingCommand = true
            if (this.wakeWordCallback) {
              this.wakeWordCallback()
            }
            // Reset after 10 seconds of inactivity
            if (this.wakeWordTimeout) clearTimeout(this.wakeWordTimeout)
            this.wakeWordTimeout = setTimeout(() => {
              this.awaitingCommand = false
            }, 10000)
            return
          }
        }
      }

      // Check for voice commands in final transcript
      if (finalTranscript && this.voiceCommandCallback) {
        const command = this.detectVoiceCommand(finalTranscript.toLowerCase())
        if (command) {
          this.voiceCommandCallback(command)
          return // Don't send command as regular transcript
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

    this.recognition.onspeechstart = () => {
      if (this.voiceActivityCallback) {
        this.voiceActivityCallback(true, 0.8)
      }
    }

    this.recognition.onspeechend = () => {
      if (this.voiceActivityCallback) {
        this.voiceActivityCallback(false, 0)
      }
    }
  }

  private detectVoiceCommand(transcript: string): string | null {
    for (const [commandName, phrases] of Object.entries(VOICE_COMMANDS)) {
      for (const phrase of phrases) {
        if (transcript.includes(phrase)) {
          return commandName
        }
      }
    }
    return null
  }

  startListening(
    onTranscript: TranscriptCallback,
    onError?: ErrorCallback,
    options?: {
      onVoiceActivity?: VoiceActivityCallback
      onVoiceCommand?: VoiceCommandCallback
      onWakeWord?: WakeWordCallback
      enableWakeWord?: boolean
    }
  ): boolean {
    if (!this.recognition) {
      if (onError) {
        onError('Speech recognition is not supported in this browser')
      }
      return false
    }

    this.transcriptCallback = onTranscript
    this.errorCallback = onError || null
    this.voiceActivityCallback = options?.onVoiceActivity || null
    this.voiceCommandCallback = options?.onVoiceCommand || null
    this.wakeWordCallback = options?.onWakeWord || null
    this.wakeWordEnabled = options?.enableWakeWord || false

    try {
      this.recognition.start()
      this.isListening = true
      this.startAudioAnalysis()
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
    this.awaitingCommand = false
    if (this.wakeWordTimeout) {
      clearTimeout(this.wakeWordTimeout)
      this.wakeWordTimeout = null
    }
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (e) {
        // Ignore - already stopped
      }
    }
    this.stopAudioAnalysis()
    this.transcriptCallback = null
    this.errorCallback = null
    this.voiceActivityCallback = null
    this.voiceCommandCallback = null
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
  // AUDIO ANALYSIS (Voice Activity Detection)
  // ============================================

  private async startAudioAnalysis(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256

      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      source.connect(this.analyser)

      this.analyzeAudio()
    } catch (error) {
      console.warn('Could not start audio analysis:', error)
    }
  }

  private analyzeAudio(): void {
    if (!this.analyser || !this.isListening) return

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(dataArray)

    // Calculate average volume
    const sum = dataArray.reduce((a, b) => a + b, 0)
    const average = sum / dataArray.length
    const normalizedVolume = average / 255

    // Voice activity threshold
    const isActive = normalizedVolume > 0.1

    if (this.voiceActivityCallback) {
      this.voiceActivityCallback(isActive, normalizedVolume)
    }

    this.animationFrame = requestAnimationFrame(() => this.analyzeAudio())
  }

  private stopAudioAnalysis(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.analyser = null
  }

  // Get audio frequency data for waveform visualization
  getAudioFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(dataArray)
    return dataArray
  }

  // Get current volume level (0-1)
  getCurrentVolume(): number {
    const data = this.getAudioFrequencyData()
    if (!data) return 0
    const sum = data.reduce((a, b) => a + b, 0)
    return (sum / data.length) / 255
  }

  // ============================================
  // TEXT-TO-SPEECH (Neural TTS)
  // ============================================

  getNeuralVoices(): NeuralVoice[] {
    return NEURAL_VOICES
  }

  setVoice(voiceId: string): void {
    this.speechConfig.voice = voiceId
  }

  setRate(rate: number): void {
    this.speechConfig.rate = Math.max(0.5, Math.min(2, rate))
  }

  setPitch(pitch: number): void {
    this.speechConfig.pitch = Math.max(0, Math.min(2, pitch))
  }

  setVolume(volume: number): void {
    this.speechConfig.volume = Math.max(0, Math.min(1, volume))
  }

  setUseNeural(useNeural: boolean): void {
    this.speechConfig.useNeural = useNeural
  }

  getSpeechConfig(): SpeechConfig {
    return { ...this.speechConfig }
  }

  async speak(text: string, onEnd?: SpeechEndCallback): Promise<void> {
    if (!text || text.trim().length === 0) {
      if (onEnd) onEnd()
      return
    }

    // Store for "read again" command
    this.lastResponse = text

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

  private speakWebAPI(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'))
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = this.speechConfig.rate
      utterance.pitch = this.speechConfig.pitch
      utterance.volume = this.speechConfig.volume

      // Use selected browser voice or find a good one
      if (this.selectedBrowserVoice) {
        utterance.voice = this.selectedBrowserVoice
      } else {
        const voices = window.speechSynthesis.getVoices()
        const preferredVoice = voices.find(v =>
          v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Neural')
        ) || voices.find(v => v.lang.startsWith('en'))

        if (preferredVoice) {
          utterance.voice = preferredVoice
        }
      }

      utterance.onend = () => resolve()
      utterance.onerror = (e) => reject(e)

      window.speechSynthesis.speak(utterance)
    })
  }

  async speakMultiple(texts: string[], onAllEnd?: SpeechEndCallback): Promise<void> {
    for (let i = 0; i < texts.length; i++) {
      const isLast = i === texts.length - 1
      await this.speak(texts[i], isLast ? onAllEnd : undefined)
    }
  }

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

  pauseSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause()
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause()
    }
  }

  resumeSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.play()
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume()
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking ||
      (this.currentAudio !== null && !this.currentAudio.paused) ||
      (('speechSynthesis' in window) && window.speechSynthesis.speaking)
  }

  // Read the last response again
  repeatLastResponse(onEnd?: SpeechEndCallback): void {
    if (this.lastResponse) {
      this.speak(this.lastResponse, onEnd)
    }
  }

  getLastResponse(): string {
    return this.lastResponse
  }

  isSpeechSynthesisSupported(): boolean {
    return true // Neural TTS always works via API
  }

  isSpeechRecognitionSupported(): boolean {
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    )
  }

  async previewVoice(voiceId: string): Promise<void> {
    const originalVoice = this.speechConfig.voice
    this.speechConfig.voice = voiceId

    await this.speak('Hello! This is how I sound. I can help you with anything.')

    this.speechConfig.voice = originalVoice
  }

  // ============================================
  // MICROPHONE PERMISSION
  // ============================================

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      return false
    }
  }

  async checkMicrophonePermission(): Promise<PermissionState> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      return result.state
    } catch {
      // Firefox doesn't support permission query for microphone
      return 'prompt'
    }
  }
}

// Export singleton instance
export const voiceService = new VoiceService()
export default voiceService
