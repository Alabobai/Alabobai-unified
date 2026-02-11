/**
 * Alabobai Speech Recognizer
 * Real-time speech-to-text using Deepgram with sub-300ms latency
 * Optimized for streaming recognition and interruption handling
 */

import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface SpeechRecognizerConfig {
  apiKey: string;
  language?: string;
  model?: 'nova-2' | 'nova-2-general' | 'nova-2-meeting' | 'nova-2-phonecall' | 'enhanced' | 'base';
  punctuate?: boolean;
  interimResults?: boolean;
  endpointing?: number; // Milliseconds of silence to detect end of speech
  utteranceEndMs?: number;
  smartFormat?: boolean;
  fillerWords?: boolean;
  profanityFilter?: boolean;
  sampleRate?: number;
  channels?: number;
  encoding?: 'linear16' | 'mulaw' | 'opus';
}

export interface TranscriptionResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
  words: Word[];
  startTime: number;
  endTime: number;
  speechFinal: boolean;
}

export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuatedWord?: string;
}

export interface SpeechRecognizerEvents {
  'transcript': (result: TranscriptionResult) => void;
  'interim-transcript': (result: TranscriptionResult) => void;
  'final-transcript': (result: TranscriptionResult) => void;
  'speech-started': () => void;
  'speech-ended': () => void;
  'utterance-end': () => void;
  'error': (error: Error) => void;
  'connected': () => void;
  'disconnected': () => void;
  'latency': (latencyMs: number) => void;
}

// ============================================================================
// SPEECH RECOGNIZER CLASS
// ============================================================================

export class SpeechRecognizer extends EventEmitter {
  private config: SpeechRecognizerConfig;
  private deepgram: ReturnType<typeof createClient>;
  private connection: LiveClient | null = null;
  private isConnected: boolean = false;
  private isSpeaking: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private lastAudioTime: number = 0;
  private utteranceBuffer: string = '';
  private startTimestamp: number = 0;

  // Latency tracking
  private audioSentTime: Map<number, number> = new Map();
  private averageLatency: number = 0;
  private latencySamples: number[] = [];

  constructor(config: SpeechRecognizerConfig) {
    super();
    this.config = {
      language: 'en-US',
      model: 'nova-2',
      punctuate: true,
      interimResults: true,
      endpointing: 300, // 300ms silence detection for sub-300ms total latency
      utteranceEndMs: 1000,
      smartFormat: true,
      fillerWords: false,
      profanityFilter: false,
      sampleRate: 16000,
      channels: 1,
      encoding: 'linear16',
      ...config,
    };

    this.deepgram = createClient(this.config.apiKey);
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('[SpeechRecognizer] Already connected');
      return;
    }

    try {
      this.startTimestamp = Date.now();

      this.connection = this.deepgram.listen.live({
        language: this.config.language,
        model: this.config.model,
        punctuate: this.config.punctuate,
        interim_results: this.config.interimResults,
        endpointing: this.config.endpointing,
        utterance_end_ms: this.config.utteranceEndMs,
        smart_format: this.config.smartFormat,
        filler_words: this.config.fillerWords,
        profanity_filter: this.config.profanityFilter,
        sample_rate: this.config.sampleRate,
        channels: this.config.channels,
        encoding: this.config.encoding,
        // Performance optimizations for low latency
        vad_events: true,
        diarize: false,
      });

      this.setupEventListeners();

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.connection!.addListener(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          console.log('[SpeechRecognizer] Connected to Deepgram');
          resolve();
        });

        this.connection!.addListener(LiveTranscriptionEvents.Error, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Start keepalive to maintain connection
      this.startKeepAlive();
    } catch (error) {
      console.error('[SpeechRecognizer] Connection error:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.connection) return;

    this.connection.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      this.handleTranscript(data);
    });

    this.connection.addListener(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.handleUtteranceEnd();
    });

    this.connection.addListener(LiveTranscriptionEvents.SpeechStarted, () => {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.emit('speech-started');
      }
    });

    this.connection.addListener(LiveTranscriptionEvents.Error, (error) => {
      console.error('[SpeechRecognizer] Error:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    });

    this.connection.addListener(LiveTranscriptionEvents.Close, () => {
      this.handleDisconnect();
    });

    this.connection.addListener(LiveTranscriptionEvents.Metadata, (metadata) => {
      // Track processing latency from metadata
      if (metadata.request_id) {
        this.trackLatency(metadata.request_id);
      }
    });
  }

  private handleTranscript(data: any): void {
    const receiveTime = Date.now();

    // Parse transcript data
    const alternative = data.channel?.alternatives?.[0];
    if (!alternative) return;

    const result: TranscriptionResult = {
      transcript: alternative.transcript || '',
      isFinal: data.is_final === true,
      confidence: alternative.confidence || 0,
      words: (alternative.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
        punctuatedWord: w.punctuated_word,
      })),
      startTime: data.start || 0,
      endTime: data.start + (data.duration || 0),
      speechFinal: data.speech_final === true,
    };

    // Skip empty transcripts
    if (!result.transcript.trim()) return;

    // Calculate and emit latency
    if (this.lastAudioTime > 0) {
      const latency = receiveTime - this.lastAudioTime;
      this.updateLatencyMetrics(latency);
      this.emit('latency', latency);
    }

    // Emit appropriate event
    this.emit('transcript', result);

    if (result.isFinal) {
      this.emit('final-transcript', result);
      this.utteranceBuffer += ' ' + result.transcript;
    } else {
      this.emit('interim-transcript', result);
    }

    // Handle speech end
    if (result.speechFinal) {
      if (this.isSpeaking) {
        this.isSpeaking = false;
        this.emit('speech-ended');
      }
    }
  }

  private handleUtteranceEnd(): void {
    this.emit('utterance-end');
    if (this.utteranceBuffer.trim()) {
      this.utteranceBuffer = '';
    }
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.emit('speech-ended');
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.stopKeepAlive();
    this.emit('disconnected');
    console.log('[SpeechRecognizer] Disconnected from Deepgram');

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[SpeechRecognizer] Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
    }
  }

  // ============================================================================
  // AUDIO PROCESSING
  // ============================================================================

  /**
   * Send audio data for transcription
   * Audio should be PCM 16-bit mono at configured sample rate
   */
  sendAudio(audioData: Buffer | ArrayBuffer | Uint8Array): void {
    if (!this.isConnected || !this.connection) {
      console.warn('[SpeechRecognizer] Not connected, cannot send audio');
      return;
    }

    this.lastAudioTime = Date.now();

    // Convert to appropriate format if needed
    let data: Buffer;
    if (audioData instanceof ArrayBuffer) {
      data = Buffer.from(audioData);
    } else if (audioData instanceof Uint8Array) {
      data = Buffer.from(audioData);
    } else {
      data = audioData;
    }

    try {
      // Convert Buffer to ArrayBuffer for Deepgram SDK compatibility
      const arrayBuffer: ArrayBuffer = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      ) as ArrayBuffer;
      this.connection.send(arrayBuffer);
    } catch (error) {
      console.error('[SpeechRecognizer] Error sending audio:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send audio from a stream (e.g., microphone)
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
        this.emit('error', error);
        reject(error);
      });
    });
  }

  // ============================================================================
  // LATENCY TRACKING
  // ============================================================================

  private updateLatencyMetrics(latency: number): void {
    this.latencySamples.push(latency);

    // Keep only last 100 samples
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }

    // Calculate average
    this.averageLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }

  private trackLatency(requestId: string): void {
    // Additional latency tracking per request if needed
  }

  /**
   * Get current latency metrics
   */
  getLatencyMetrics(): {
    average: number;
    min: number;
    max: number;
    p95: number;
    samples: number;
  } {
    if (this.latencySamples.length === 0) {
      return { average: 0, min: 0, max: 0, p95: 0, samples: 0 };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      average: this.averageLatency,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[p95Index],
      samples: sorted.length,
    };
  }

  // ============================================================================
  // KEEPALIVE
  // ============================================================================

  private startKeepAlive(): void {
    this.stopKeepAlive();

    // Send keepalive every 8 seconds (Deepgram timeout is 10s)
    this.keepAliveInterval = setInterval(() => {
      if (this.connection && this.isConnected) {
        try {
          this.connection.keepAlive();
        } catch (error) {
          console.error('[SpeechRecognizer] Keepalive error:', error);
        }
      }
    }, 8000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  // ============================================================================
  // CONTROL METHODS
  // ============================================================================

  /**
   * Gracefully finish transcription
   */
  finalize(): void {
    if (this.connection && this.isConnected) {
      try {
        this.connection.requestClose();
      } catch (error) {
        console.error('[SpeechRecognizer] Error finalizing:', error);
      }
    }
  }

  /**
   * Disconnect from Deepgram
   */
  async disconnect(): Promise<void> {
    this.stopKeepAlive();

    if (this.connection && this.isConnected) {
      try {
        this.connection.requestClose();
        this.connection = null;
        this.isConnected = false;
      } catch (error) {
        console.error('[SpeechRecognizer] Error disconnecting:', error);
      }
    }
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Check if user is currently speaking
   */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Reset the recognizer state
   */
  reset(): void {
    this.utteranceBuffer = '';
    this.latencySamples = [];
    this.averageLatency = 0;
    this.lastAudioTime = 0;
    this.audioSentTime.clear();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createSpeechRecognizer(config: SpeechRecognizerConfig): SpeechRecognizer {
  return new SpeechRecognizer(config);
}

export function createDefaultSpeechRecognizer(): SpeechRecognizer {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is required');
  }

  return new SpeechRecognizer({
    apiKey,
    model: 'nova-2',
    endpointing: 300,
    interimResults: true,
  });
}
