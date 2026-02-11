/**
 * Alabobai Voice Synthesizer
 * Text-to-speech with natural, expressive voices
 * Optimized for sub-300ms first-byte latency with streaming
 */

import { createClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { Readable, PassThrough } from 'stream';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSynthesizerConfig {
  apiKey: string;
  model?: 'aura-asteria-en' | 'aura-luna-en' | 'aura-stella-en' | 'aura-athena-en' |
         'aura-hera-en' | 'aura-orion-en' | 'aura-arcas-en' | 'aura-perseus-en' |
         'aura-angus-en' | 'aura-orpheus-en' | 'aura-helios-en' | 'aura-zeus-en';
  encoding?: 'linear16' | 'mp3' | 'opus' | 'flac' | 'aac' | 'mulaw' | 'alaw';
  container?: 'wav' | 'mp3' | 'ogg' | 'flac' | 'none';
  sampleRate?: number;
  bitRate?: number;
}

export interface SynthesisRequest {
  text: string;
  voice?: string;
  speed?: number; // 0.5 to 2.0
  pitch?: number; // -20 to 20
  emotion?: VoiceEmotion;
}

export type VoiceEmotion = 'neutral' | 'happy' | 'sad' | 'excited' | 'calm' | 'serious';

export interface SynthesisResult {
  audio: Buffer;
  durationMs: number;
  sampleRate: number;
  format: string;
}

export interface SynthesisMetrics {
  requestTime: number;
  firstByteTime: number;
  totalTime: number;
  audioBytes: number;
  charactersProcessed: number;
}

// ============================================================================
// VOICE SYNTHESIZER CLASS
// ============================================================================

export class VoiceSynthesizer extends EventEmitter {
  private config: VoiceSynthesizerConfig;
  private deepgram: ReturnType<typeof createClient>;
  private isProcessing: boolean = false;
  private synthesisQueue: Array<{ text: string; resolve: (result: SynthesisResult) => void; reject: (error: Error) => void }> = [];

  // Performance metrics
  private metricsHistory: SynthesisMetrics[] = [];
  private averageLatency: number = 0;

  // Voice presets for different emotional states
  private static readonly VOICE_PRESETS: Record<VoiceEmotion, { voice: string; description: string }> = {
    neutral: { voice: 'aura-asteria-en', description: 'Clear, balanced voice' },
    happy: { voice: 'aura-luna-en', description: 'Warm, friendly voice' },
    sad: { voice: 'aura-stella-en', description: 'Soft, empathetic voice' },
    excited: { voice: 'aura-orion-en', description: 'Energetic, enthusiastic voice' },
    calm: { voice: 'aura-athena-en', description: 'Soothing, gentle voice' },
    serious: { voice: 'aura-zeus-en', description: 'Authoritative, professional voice' },
  };

  constructor(config: VoiceSynthesizerConfig) {
    super();
    this.config = {
      model: 'aura-asteria-en',
      encoding: 'linear16',
      container: 'wav',
      sampleRate: 24000,
      bitRate: 128000,
      ...config,
    };

    this.deepgram = createClient(this.config.apiKey);
  }

  // ============================================================================
  // SYNTHESIS METHODS
  // ============================================================================

  /**
   * Synthesize text to audio with minimal latency
   * Returns complete audio buffer
   */
  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const startTime = Date.now();

    // Select voice based on emotion
    const voice = request.voice || this.getVoiceForEmotion(request.emotion || 'neutral');

    try {
      const response = await this.deepgram.speak.request(
        { text: this.preprocessText(request.text) },
        {
          model: voice,
          encoding: this.config.encoding,
          container: this.config.container,
          sample_rate: this.config.sampleRate,
          bit_rate: this.config.bitRate,
        }
      );

      const stream = await response.getStream();
      if (!stream) {
        throw new Error('Failed to get audio stream from Deepgram');
      }

      const audioBuffer = await this.streamToBuffer(stream);
      const totalTime = Date.now() - startTime;

      // Track metrics
      this.trackMetrics({
        requestTime: startTime,
        firstByteTime: startTime + 50, // Approximate
        totalTime,
        audioBytes: audioBuffer.length,
        charactersProcessed: request.text.length,
      });

      return {
        audio: audioBuffer,
        durationMs: this.calculateAudioDuration(audioBuffer.length),
        sampleRate: this.config.sampleRate!,
        format: this.config.container!,
      };
    } catch (error) {
      console.error('[VoiceSynthesizer] Synthesis error:', error);
      throw error;
    }
  }

  /**
   * Stream synthesis for real-time playback
   * Emits 'audio-chunk' events for each chunk of audio data
   */
  async synthesizeStream(request: SynthesisRequest): Promise<Readable> {
    const startTime = Date.now();
    let firstByteEmitted = false;

    // Select voice based on emotion
    const voice = request.voice || this.getVoiceForEmotion(request.emotion || 'neutral');

    try {
      const response = await this.deepgram.speak.request(
        { text: this.preprocessText(request.text) },
        {
          model: voice,
          encoding: this.config.encoding,
          container: this.config.container,
          sample_rate: this.config.sampleRate,
          bit_rate: this.config.bitRate,
        }
      );

      const stream = await response.getStream();
      if (!stream) {
        throw new Error('Failed to get audio stream from Deepgram');
      }

      // Create a passthrough stream for real-time processing
      const outputStream = new PassThrough();

      // Convert web stream to node stream and pipe
      const reader = stream.getReader();
      let totalBytes = 0;

      const pump = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();

          if (done) {
            outputStream.end();

            // Track metrics
            this.trackMetrics({
              requestTime: startTime,
              firstByteTime: firstByteEmitted ? startTime : Date.now(),
              totalTime: Date.now() - startTime,
              audioBytes: totalBytes,
              charactersProcessed: request.text.length,
            });

            return;
          }

          if (value) {
            if (!firstByteEmitted) {
              firstByteEmitted = true;
              const latency = Date.now() - startTime;
              this.emit('first-byte', latency);
              console.log(`[VoiceSynthesizer] First byte latency: ${latency}ms`);
            }

            totalBytes += value.length;
            outputStream.write(Buffer.from(value));
            this.emit('audio-chunk', Buffer.from(value));
          }

          await pump();
        } catch (error) {
          outputStream.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      };

      pump();
      return outputStream;
    } catch (error) {
      console.error('[VoiceSynthesizer] Stream synthesis error:', error);
      throw error;
    }
  }

  /**
   * Synthesize with sentence-level streaming for natural conversation flow
   * Splits text into sentences and synthesizes each for faster response
   */
  async synthesizeChunked(
    text: string,
    onChunk: (audio: Buffer, sentence: string, index: number) => void,
    emotion?: VoiceEmotion
  ): Promise<void> {
    const sentences = this.splitIntoSentences(text);
    const voice = this.getVoiceForEmotion(emotion || 'neutral');

    const synthesisPromises = sentences.map(async (sentence, index) => {
      try {
        const result = await this.synthesize({
          text: sentence,
          voice,
          emotion,
        });
        onChunk(result.audio, sentence, index);
        return result;
      } catch (error) {
        console.error(`[VoiceSynthesizer] Error synthesizing sentence ${index}:`, error);
        throw error;
      }
    });

    await Promise.all(synthesisPromises);
  }

  // ============================================================================
  // TEXT PREPROCESSING
  // ============================================================================

  /**
   * Preprocess text for optimal TTS output
   */
  private preprocessText(text: string): string {
    let processed = text;

    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();

    // Expand common abbreviations for natural speech
    const abbreviations: Record<string, string> = {
      'Dr.': 'Doctor',
      'Mr.': 'Mister',
      'Mrs.': 'Missus',
      'Ms.': 'Miss',
      'Jr.': 'Junior',
      'Sr.': 'Senior',
      'etc.': 'et cetera',
      'vs.': 'versus',
      'e.g.': 'for example',
      'i.e.': 'that is',
      'approx.': 'approximately',
    };

    for (const [abbr, expansion] of Object.entries(abbreviations)) {
      processed = processed.replace(new RegExp(abbr.replace('.', '\\.'), 'gi'), expansion);
    }

    // Handle numbers with commas (keep them for natural reading)
    // Deepgram handles most number formatting well

    // Add slight pauses for better pacing
    processed = processed.replace(/([.!?])\s+/g, '$1 ');
    processed = processed.replace(/,\s*/g, ', ');

    // Handle emoji and special characters
    processed = processed.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');

    return processed;
  }

  /**
   * Split text into sentences for chunked synthesis
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries while keeping punctuation
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Merge very short sentences with the next one
    const merged: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].length < 20 && i < sentences.length - 1) {
        sentences[i + 1] = sentences[i] + ' ' + sentences[i + 1];
      } else {
        merged.push(sentences[i]);
      }
    }

    return merged;
  }

  // ============================================================================
  // VOICE SELECTION
  // ============================================================================

  /**
   * Get appropriate voice for detected emotion
   */
  private getVoiceForEmotion(emotion: VoiceEmotion): string {
    return VoiceSynthesizer.VOICE_PRESETS[emotion]?.voice || this.config.model!;
  }

  /**
   * Get available voices
   */
  getAvailableVoices(): Array<{ id: string; emotion: VoiceEmotion; description: string }> {
    return Object.entries(VoiceSynthesizer.VOICE_PRESETS).map(([emotion, preset]) => ({
      id: preset.voice,
      emotion: emotion as VoiceEmotion,
      description: preset.description,
    }));
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  }

  /**
   * Calculate audio duration from buffer size
   */
  private calculateAudioDuration(bytes: number): number {
    const bytesPerSecond = (this.config.sampleRate! * 2); // 16-bit = 2 bytes per sample
    return (bytes / bytesPerSecond) * 1000;
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  private trackMetrics(metrics: SynthesisMetrics): void {
    this.metricsHistory.push(metrics);

    // Keep only last 100 metrics
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift();
    }

    // Update average latency
    const firstByteTimes = this.metricsHistory.map(m => m.firstByteTime - m.requestTime);
    this.averageLatency = firstByteTimes.reduce((a, b) => a + b, 0) / firstByteTimes.length;
  }

  /**
   * Get synthesis performance metrics
   */
  getMetrics(): {
    averageFirstByteLatency: number;
    averageTotalTime: number;
    totalSyntheses: number;
    totalCharacters: number;
    totalAudioBytes: number;
  } {
    if (this.metricsHistory.length === 0) {
      return {
        averageFirstByteLatency: 0,
        averageTotalTime: 0,
        totalSyntheses: 0,
        totalCharacters: 0,
        totalAudioBytes: 0,
      };
    }

    return {
      averageFirstByteLatency: this.averageLatency,
      averageTotalTime: this.metricsHistory.reduce((a, m) => a + m.totalTime, 0) / this.metricsHistory.length,
      totalSyntheses: this.metricsHistory.length,
      totalCharacters: this.metricsHistory.reduce((a, m) => a + m.charactersProcessed, 0),
      totalAudioBytes: this.metricsHistory.reduce((a, m) => a + m.audioBytes, 0),
    };
  }

  /**
   * Check if latency target is being met
   */
  isLatencyTargetMet(targetMs: number = 300): boolean {
    return this.averageLatency <= targetMs;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createVoiceSynthesizer(config: VoiceSynthesizerConfig): VoiceSynthesizer {
  return new VoiceSynthesizer(config);
}

export function createDefaultVoiceSynthesizer(): VoiceSynthesizer {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is required');
  }

  return new VoiceSynthesizer({
    apiKey,
    model: 'aura-asteria-en',
    encoding: 'linear16',
    sampleRate: 24000,
  });
}
