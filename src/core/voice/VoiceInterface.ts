/**
 * Alabobai Voice Interface
 * Main voice interface that orchestrates all voice components
 * Designed for sub-300ms end-to-end latency like GPT-4o
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { Readable } from 'stream';

import { SpeechRecognizer, TranscriptionResult, createSpeechRecognizer } from './SpeechRecognizer.js';
import { VoiceSynthesizer, createVoiceSynthesizer, VoiceEmotion } from './VoiceSynthesizer.js';
import { ConversationManager, createConversationManager, ConversationState } from './ConversationManager.js';
import { WakeWordDetector, WakeWordDetection, createWakeWordDetector } from './WakeWordDetector.js';
import { EmotionDetector, EmotionResult, createEmotionDetector } from './EmotionDetector.js';
import { LLMClient } from '../llm-client.js';
import { Orchestrator } from '../orchestrator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceInterfaceConfig {
  deepgramApiKey: string;
  llmClient?: LLMClient;
  orchestrator?: Orchestrator;
  wakeWordEnabled?: boolean;
  wakeWords?: string[];
  emotionDetectionEnabled?: boolean;
  interruptionEnabled?: boolean;
  latencyTarget?: number; // Target latency in ms
  audioSampleRate?: number;
  streamingResponse?: boolean;
  voiceModel?: string;
  language?: string;
}

export interface VoiceSession {
  id: string;
  state: VoiceSessionState;
  startTime: number;
  lastActivityTime: number;
  conversation: ConversationState | null;
  metrics: VoiceSessionMetrics;
}

export type VoiceSessionState =
  | 'idle'
  | 'listening-wake-word'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted'
  | 'error';

export interface VoiceSessionMetrics {
  totalUtterances: number;
  totalResponses: number;
  averageLatency: number;
  latencyBreakdown: {
    stt: number;
    llm: number;
    tts: number;
  };
  interruptionCount: number;
  wakeWordDetections: number;
}

export interface VoiceResponse {
  text: string;
  audio: Buffer | null;
  emotion: VoiceEmotion;
  latency: {
    total: number;
    stt: number;
    llm: number;
    tts: number;
  };
}

// ============================================================================
// VOICE INTERFACE CLASS
// ============================================================================

export class VoiceInterface extends EventEmitter {
  private config: VoiceInterfaceConfig;

  // Core components
  private speechRecognizer: SpeechRecognizer;
  private voiceSynthesizer: VoiceSynthesizer;
  private conversationManager: ConversationManager;
  private wakeWordDetector: WakeWordDetector;
  private emotionDetector: EmotionDetector;

  // External dependencies
  private llmClient: LLMClient | null = null;
  private orchestrator: Orchestrator | null = null;

  // Session state
  private session: VoiceSession;
  private isRunning: boolean = false;
  private isSpeaking: boolean = false;
  private currentAudioStream: Readable | null = null;

  // Timing for latency measurement
  private utteranceStartTime: number = 0;
  private sttEndTime: number = 0;
  private llmEndTime: number = 0;

  // Buffers for streaming
  private pendingTranscript: string = '';
  private interruptionBuffer: Buffer[] = [];

  constructor(config: VoiceInterfaceConfig) {
    super();
    this.config = {
      wakeWordEnabled: true,
      emotionDetectionEnabled: true,
      interruptionEnabled: true,
      latencyTarget: 300,
      audioSampleRate: 16000,
      streamingResponse: true,
      language: 'en-US',
      ...config,
    };

    // Initialize components
    this.speechRecognizer = createSpeechRecognizer({
      apiKey: config.deepgramApiKey,
      model: 'nova-2',
      endpointing: 200, // Aggressive endpointing for low latency
      interimResults: true,
      sampleRate: this.config.audioSampleRate,
    });

    this.voiceSynthesizer = createVoiceSynthesizer({
      apiKey: config.deepgramApiKey,
      model: (config.voiceModel as any) || 'aura-asteria-en',
      encoding: 'linear16',
      sampleRate: 24000,
    });

    this.conversationManager = createConversationManager({
      maxHistoryLength: 50,
      silenceTimeoutMs: 30000,
      interruptionThresholdMs: 200,
    });

    this.wakeWordDetector = createWakeWordDetector({
      wakeWords: config.wakeWords,
      sensitivity: 0.7,
      minConfidence: 0.6,
    });

    this.emotionDetector = createEmotionDetector({
      enabled: config.emotionDetectionEnabled,
      analysisWindowMs: 5000,
    });

    // Initialize session
    this.session = this.createNewSession();

    // Set external dependencies
    if (config.llmClient) {
      this.llmClient = config.llmClient;
    }
    if (config.orchestrator) {
      this.orchestrator = config.orchestrator;
    }

    // Setup internal event handlers
    this.setupEventHandlers();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private createNewSession(): VoiceSession {
    return {
      id: uuid(),
      state: 'idle',
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      conversation: null,
      metrics: {
        totalUtterances: 0,
        totalResponses: 0,
        averageLatency: 0,
        latencyBreakdown: { stt: 0, llm: 0, tts: 0 },
        interruptionCount: 0,
        wakeWordDetections: 0,
      },
    };
  }

  private setupEventHandlers(): void {
    // Speech Recognition Events
    this.speechRecognizer.on('connected', () => {
      console.log('[VoiceInterface] Speech recognizer connected');
      this.emit('stt-connected');
    });

    this.speechRecognizer.on('speech-started', () => {
      this.utteranceStartTime = Date.now();
      this.handleSpeechStart();
    });

    this.speechRecognizer.on('interim-transcript', (result: TranscriptionResult) => {
      this.handleInterimTranscript(result);
    });

    this.speechRecognizer.on('final-transcript', (result: TranscriptionResult) => {
      this.sttEndTime = Date.now();
      this.handleFinalTranscript(result);
    });

    this.speechRecognizer.on('utterance-end', () => {
      this.handleUtteranceEnd();
    });

    this.speechRecognizer.on('error', (error: Error) => {
      this.handleError('stt', error);
    });

    // Wake Word Events
    this.wakeWordDetector.on('wake-word-detected', (detection: WakeWordDetection) => {
      this.handleWakeWord(detection);
    });

    // Conversation Events
    this.conversationManager.on('interruption', () => {
      this.handleInterruption();
    });

    this.conversationManager.on('silence-timeout', () => {
      this.handleSilenceTimeout();
    });

    // Synthesizer Events
    this.voiceSynthesizer.on('first-byte', (latency: number) => {
      console.log(`[VoiceInterface] TTS first byte: ${latency}ms`);
    });
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the voice interface
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[VoiceInterface] Already running');
      return;
    }

    console.log('[VoiceInterface] Starting voice interface...');

    try {
      // Connect to speech recognition
      await this.speechRecognizer.connect();

      // Initialize wake word detector
      await this.wakeWordDetector.initialize(this.speechRecognizer);

      // Start in appropriate state
      if (this.config.wakeWordEnabled) {
        this.setState('listening-wake-word');
        this.wakeWordDetector.startListening();
      } else {
        this.setState('listening');
      }

      this.isRunning = true;
      this.emit('started', this.session);
      console.log('[VoiceInterface] Voice interface started');
    } catch (error) {
      this.handleError('startup', error as Error);
      throw error;
    }
  }

  /**
   * Stop the voice interface
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[VoiceInterface] Stopping voice interface...');

    this.isRunning = false;
    this.wakeWordDetector.stopListening();
    await this.speechRecognizer.disconnect();
    this.conversationManager.endConversation();

    this.setState('idle');
    this.emit('stopped', this.session);
    console.log('[VoiceInterface] Voice interface stopped');
  }

  /**
   * Reset the session
   */
  reset(): void {
    this.conversationManager.cleanup();
    this.emotionDetector.reset();
    this.speechRecognizer.reset();
    this.pendingTranscript = '';
    this.session = this.createNewSession();

    if (this.config.wakeWordEnabled) {
      this.setState('listening-wake-word');
    } else {
      this.setState('listening');
    }

    this.emit('session-reset', this.session);
  }

  // ============================================================================
  // AUDIO INPUT
  // ============================================================================

  /**
   * Send audio data for processing
   */
  sendAudio(audioData: Buffer | ArrayBuffer | Uint8Array): void {
    if (!this.isRunning) return;

    // If in wake word mode, always send audio
    // If actively listening or speaking (for interruption), send audio
    if (this.session.state === 'listening-wake-word' ||
        this.session.state === 'listening' ||
        (this.session.state === 'speaking' && this.config.interruptionEnabled)) {
      this.speechRecognizer.sendAudio(audioData);
    }
  }

  /**
   * Stream audio from a readable stream
   */
  async streamAudio(audioStream: NodeJS.ReadableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => {
        this.sendAudio(chunk);
      });

      audioStream.on('end', () => {
        resolve();
      });

      audioStream.on('error', (error) => {
        reject(error);
      });
    });
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  private handleSpeechStart(): void {
    // Check for interruption when assistant is speaking
    if (this.session.state === 'speaking' && this.config.interruptionEnabled) {
      // User might be interrupting
      this.conversationManager.onUserSpeechStart();
    } else if (this.session.state === 'listening') {
      this.conversationManager.onUserSpeechStart();
      this.emit('user-speaking');
    }
  }

  private handleInterimTranscript(result: TranscriptionResult): void {
    if (this.session.state === 'listening-wake-word') {
      // Wake word detector handles this via its own listener
      return;
    }

    if (this.session.state === 'listening' || this.session.state === 'speaking') {
      this.pendingTranscript = result.transcript;

      // Detect emotion on interim results too
      if (this.config.emotionDetectionEnabled) {
        this.emotionDetector.processTranscription(result);
      }

      this.emit('interim-transcript', {
        text: result.transcript,
        confidence: result.confidence,
      });

      // Check for interruption
      if (this.session.state === 'speaking' && this.conversationManager.isInterruption()) {
        this.handleInterruption();
      }
    }
  }

  private handleFinalTranscript(result: TranscriptionResult): void {
    if (this.session.state === 'listening-wake-word') return;
    if (this.session.state !== 'listening' && this.session.state !== 'speaking') return;

    const sttLatency = this.sttEndTime - this.utteranceStartTime;
    console.log(`[VoiceInterface] STT latency: ${sttLatency}ms`);

    // Detect emotion
    let emotion: EmotionResult | null = null;
    if (this.config.emotionDetectionEnabled) {
      emotion = this.emotionDetector.processTranscription(result);
    }

    // Complete user turn in conversation
    const turn = this.conversationManager.onUserSpeechEnd(
      result.transcript,
      result.confidence,
      emotion?.primary
    );

    this.session.metrics.totalUtterances++;
    this.emit('final-transcript', {
      text: result.transcript,
      confidence: result.confidence,
      emotion: emotion?.primary,
      sttLatency,
    });
  }

  private async handleUtteranceEnd(): Promise<void> {
    if (this.session.state !== 'listening') return;
    if (!this.pendingTranscript.trim()) return;

    const transcript = this.pendingTranscript.trim();
    this.pendingTranscript = '';

    // Process the utterance
    await this.processUtterance(transcript);
  }

  private handleWakeWord(detection: WakeWordDetection): void {
    console.log(`[VoiceInterface] Wake word detected: "${detection.matchedPhrase}"`);

    this.session.metrics.wakeWordDetections++;
    this.wakeWordDetector.stopListening();

    // Start active conversation
    const conversation = this.conversationManager.startConversation();
    this.session.conversation = conversation;

    this.setState('listening');
    this.emit('wake-word-detected', detection);

    // Play acknowledgment sound or say something
    this.respondWithGreeting();
  }

  private async handleInterruption(): Promise<void> {
    console.log('[VoiceInterface] Handling interruption');

    this.session.metrics.interruptionCount++;
    this.session.state = 'interrupted';

    // Stop current audio playback
    if (this.currentAudioStream) {
      this.currentAudioStream.destroy();
      this.currentAudioStream = null;
    }
    this.isSpeaking = false;

    // Notify conversation manager
    this.conversationManager.handleInterruption();

    this.emit('interruption');

    // Go back to listening state
    this.setState('listening');
  }

  private handleSilenceTimeout(): void {
    console.log('[VoiceInterface] Silence timeout - going back to wake word mode');

    this.session.conversation = null;

    if (this.config.wakeWordEnabled) {
      this.setState('listening-wake-word');
      this.wakeWordDetector.startListening();
    }

    this.emit('silence-timeout');
  }

  private handleError(source: string, error: Error): void {
    console.error(`[VoiceInterface] Error from ${source}:`, error);
    this.emit('error', { source, error });

    // Try to recover
    if (source === 'stt' && this.isRunning) {
      this.setState('error');
      // Attempt reconnection
      setTimeout(() => {
        this.speechRecognizer.connect().catch(console.error);
      }, 1000);
    }
  }

  // ============================================================================
  // PROCESSING PIPELINE
  // ============================================================================

  /**
   * Process a user utterance through the full pipeline
   */
  private async processUtterance(text: string): Promise<void> {
    if (!text.trim()) return;

    const pipelineStart = Date.now();
    this.setState('processing');

    try {
      // Get context from conversation
      const context = this.conversationManager.getContextForAI();

      // Get response from LLM/Orchestrator
      const llmStart = Date.now();
      let responseText: string;

      if (this.orchestrator) {
        // Use orchestrator for full agent capabilities
        const response = await this.orchestrator.processMessage(
          this.session.id,
          'user',
          text
        );
        responseText = response.content;
      } else if (this.llmClient) {
        // Use LLM client directly
        responseText = await this.llmClient.chat([
          {
            role: 'system',
            content: this.buildSystemPrompt(context),
          },
          {
            role: 'user',
            content: text,
          },
        ]);
      } else {
        // Fallback response
        responseText = "I hear you, but I'm not connected to a language model. Please configure the LLM client.";
      }

      this.llmEndTime = Date.now();
      const llmLatency = this.llmEndTime - llmStart;
      console.log(`[VoiceInterface] LLM latency: ${llmLatency}ms`);

      // Determine voice emotion based on context and content
      const voiceEmotion = this.determineVoiceEmotion(responseText, context.emotion);

      // Synthesize and speak response
      const ttsStart = Date.now();
      await this.speakResponse(responseText, voiceEmotion);
      const ttsLatency = Date.now() - ttsStart;

      // Calculate total latency
      const totalLatency = Date.now() - pipelineStart;
      const sttLatency = this.sttEndTime - this.utteranceStartTime;

      // Update metrics
      this.updateLatencyMetrics(sttLatency, llmLatency, ttsLatency, totalLatency);

      // Log latency
      console.log(`[VoiceInterface] Total latency: ${totalLatency}ms (STT: ${sttLatency}ms, LLM: ${llmLatency}ms, TTS: ${ttsLatency}ms)`);

      // Check if we met latency target
      if (totalLatency > this.config.latencyTarget!) {
        console.warn(`[VoiceInterface] Latency target ${this.config.latencyTarget}ms exceeded`);
      }

      this.emit('response-complete', {
        text: responseText,
        emotion: voiceEmotion,
        latency: { total: totalLatency, stt: sttLatency, llm: llmLatency, tts: ttsLatency },
      });

    } catch (error) {
      console.error('[VoiceInterface] Processing error:', error);
      this.emit('error', { source: 'processing', error });
      this.setState('listening');
    }
  }

  /**
   * Build system prompt for LLM
   */
  private buildSystemPrompt(context: ReturnType<typeof this.conversationManager.getContextForAI>): string {
    return `You are Alabobai, a helpful AI assistant engaged in a voice conversation.
Keep your responses concise and natural for speech - aim for 1-2 sentences unless more detail is needed.
Avoid markdown formatting, bullet points, or other text-only formatting.
Match the user's emotional tone when appropriate.

User's current emotional state: ${context.emotion}
Speaking preference: ${context.preferences.verbosity} detail level, ${context.preferences.formalityLevel} tone

Recent conversation:
${context.recentHistory.slice(-5).join('\n')}

Respond naturally as if speaking out loud.`;
  }

  /**
   * Determine the best voice emotion for the response
   */
  private determineVoiceEmotion(responseText: string, userEmotion: string): VoiceEmotion {
    // Map user emotions to appropriate response emotions
    const emotionMap: Record<string, VoiceEmotion> = {
      happy: 'happy',
      excited: 'excited',
      sad: 'calm', // Respond calmly to sad users
      angry: 'calm', // Stay calm when user is angry
      frustrated: 'calm',
      fearful: 'calm',
      confused: 'neutral',
      surprised: 'excited',
      neutral: 'neutral',
      calm: 'calm',
    };

    // Check if response contains positive/celebratory content
    const positiveIndicators = ['congratulations', 'great', 'awesome', 'wonderful', 'excellent'];
    if (positiveIndicators.some(word => responseText.toLowerCase().includes(word))) {
      return 'happy';
    }

    // Check if response is apologetic/sympathetic
    const sympatheticIndicators = ['sorry', 'understand', 'difficult', 'challenging'];
    if (sympatheticIndicators.some(word => responseText.toLowerCase().includes(word))) {
      return 'calm';
    }

    return emotionMap[userEmotion] || 'neutral';
  }

  /**
   * Speak a response with optional streaming
   */
  private async speakResponse(text: string, emotion: VoiceEmotion): Promise<void> {
    this.setState('speaking');
    this.isSpeaking = true;
    this.conversationManager.onAssistantSpeechStart();

    try {
      if (this.config.streamingResponse) {
        // Stream for lower latency
        const audioStream = await this.voiceSynthesizer.synthesizeStream({
          text,
          emotion,
        });

        this.currentAudioStream = audioStream;

        // Emit audio chunks
        audioStream.on('data', (chunk: Buffer) => {
          if (this.isSpeaking) {
            this.emit('audio-chunk', chunk);
          }
        });

        await new Promise<void>((resolve, reject) => {
          audioStream.on('end', resolve);
          audioStream.on('error', reject);
        });
      } else {
        // Non-streaming (full synthesis before playback)
        const result = await this.voiceSynthesizer.synthesize({
          text,
          emotion,
        });

        if (this.isSpeaking) {
          this.emit('audio-complete', result.audio);
        }
      }

      // Complete assistant turn
      if (this.isSpeaking) {
        this.conversationManager.onAssistantSpeechEnd(text);
        this.session.metrics.totalResponses++;
      }
    } finally {
      this.isSpeaking = false;
      this.currentAudioStream = null;
      this.setState('listening');
    }
  }

  /**
   * Respond with a brief greeting after wake word
   */
  private async respondWithGreeting(): Promise<void> {
    const greetings = [
      "I'm here!",
      "Yes?",
      "How can I help?",
      "I'm listening.",
      "What can I do for you?",
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    try {
      this.setState('speaking');
      this.isSpeaking = true;

      const result = await this.voiceSynthesizer.synthesize({
        text: greeting,
        emotion: 'neutral',
      });

      this.emit('audio-complete', result.audio);
    } finally {
      this.isSpeaking = false;
      this.setState('listening');
    }
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  private setState(state: VoiceSessionState): void {
    const previousState = this.session.state;
    this.session.state = state;
    this.session.lastActivityTime = Date.now();

    if (previousState !== state) {
      this.emit('state-changed', { from: previousState, to: state });
    }
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  private updateLatencyMetrics(stt: number, llm: number, tts: number, total: number): void {
    const metrics = this.session.metrics;
    const count = metrics.totalResponses;

    // Rolling average
    metrics.averageLatency = (metrics.averageLatency * count + total) / (count + 1);
    metrics.latencyBreakdown.stt = (metrics.latencyBreakdown.stt * count + stt) / (count + 1);
    metrics.latencyBreakdown.llm = (metrics.latencyBreakdown.llm * count + llm) / (count + 1);
    metrics.latencyBreakdown.tts = (metrics.latencyBreakdown.tts * count + tts) / (count + 1);
  }

  /**
   * Get current session metrics
   */
  getMetrics(): VoiceSessionMetrics {
    return { ...this.session.metrics };
  }

  /**
   * Check if latency target is being met
   */
  isLatencyTargetMet(): boolean {
    return this.session.metrics.averageLatency <= this.config.latencyTarget!;
  }

  /**
   * Get detailed latency report
   */
  getLatencyReport(): {
    target: number;
    average: number;
    breakdown: { stt: number; llm: number; tts: number };
    meetingTarget: boolean;
    recognizerMetrics: ReturnType<SpeechRecognizer['getLatencyMetrics']>;
    synthesizerMetrics: ReturnType<VoiceSynthesizer['getMetrics']>;
  } {
    return {
      target: this.config.latencyTarget!,
      average: this.session.metrics.averageLatency,
      breakdown: this.session.metrics.latencyBreakdown,
      meetingTarget: this.isLatencyTargetMet(),
      recognizerMetrics: this.speechRecognizer.getLatencyMetrics(),
      synthesizerMetrics: this.voiceSynthesizer.getMetrics(),
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get current session
   */
  getSession(): VoiceSession {
    return { ...this.session };
  }

  /**
   * Get current state
   */
  getState(): VoiceSessionState {
    return this.session.state;
  }

  /**
   * Check if running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Check if currently speaking
   */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Get conversation transcript
   */
  getTranscript(): string {
    return this.conversationManager.getTranscript();
  }

  /**
   * Get current emotion state
   */
  getCurrentEmotion(): EmotionResult | null {
    return this.emotionDetector.getCurrentEmotion();
  }

  /**
   * Set LLM client
   */
  setLLMClient(client: LLMClient): void {
    this.llmClient = client;
  }

  /**
   * Set orchestrator
   */
  setOrchestrator(orchestrator: Orchestrator): void {
    this.orchestrator = orchestrator;
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    await this.stop();
    this.conversationManager.cleanup();
    this.wakeWordDetector.cleanup();
    this.emotionDetector.reset();
    this.removeAllListeners();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createVoiceInterface(config: VoiceInterfaceConfig): VoiceInterface {
  return new VoiceInterface(config);
}

export function createDefaultVoiceInterface(): VoiceInterface {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is required');
  }

  return new VoiceInterface({
    deepgramApiKey: apiKey,
    wakeWordEnabled: true,
    emotionDetectionEnabled: true,
    interruptionEnabled: true,
    latencyTarget: 300,
    streamingResponse: true,
  });
}
