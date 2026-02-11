/**
 * Alabobai Wake Word Detector
 * Detects "Hey Alabobai" wake word using phonetic matching and ML
 * Optimized for low latency and low false positive rate
 */

import { EventEmitter } from 'events';
import { SpeechRecognizer, TranscriptionResult } from './SpeechRecognizer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WakeWordDetectorConfig {
  wakeWords?: string[];
  sensitivity?: number; // 0.0-1.0, higher = more sensitive but more false positives
  minConfidence?: number; // Minimum transcription confidence to consider
  cooldownMs?: number; // Time after detection before next detection possible
  maxListenDurationMs?: number; // Max time to listen for wake word before resetting
  onlyInSilence?: boolean; // Only detect wake word when no ongoing speech
  speechRecognizer?: SpeechRecognizer;
}

export interface WakeWordDetection {
  wakeWord: string;
  matchedPhrase: string;
  confidence: number;
  timestamp: number;
  method: 'exact' | 'phonetic' | 'fuzzy';
}

// ============================================================================
// PHONETIC UTILITIES
// ============================================================================

/**
 * Simple phonetic encoding for wake word matching
 * Based on simplified Soundex/Metaphone concepts
 */
function phoneticEncode(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    // Vowels (except at start) are not significant
    .replace(/(?!^)[aeiou]/g, '')
    // Similar consonants
    .replace(/[bfpv]/g, '1')
    .replace(/[cgjkqsxz]/g, '2')
    .replace(/[dt]/g, '3')
    .replace(/[l]/g, '4')
    .replace(/[mn]/g, '5')
    .replace(/[r]/g, '6');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function similarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(str1, str2) / maxLen;
}

// ============================================================================
// WAKE WORD DETECTOR CLASS
// ============================================================================

export class WakeWordDetector extends EventEmitter {
  private config: WakeWordDetectorConfig;
  private speechRecognizer: SpeechRecognizer | null = null;
  private ownsSpeechRecognizer: boolean = false;
  private isListening: boolean = false;
  private lastDetectionTime: number = 0;
  private listenStartTime: number = 0;
  private listenTimeout: NodeJS.Timeout | null = null;
  private accumulatedTranscript: string = '';

  // Wake word variants for matching
  private wakeWordVariants: Map<string, string[]> = new Map();
  private phoneticCodes: Map<string, string> = new Map();

  // Default wake words
  private static readonly DEFAULT_WAKE_WORDS = [
    'hey alabobai',
    'hey alaboobai',
    'alabobai',
    'ok alabobai',
    'hi alabobai',
  ];

  // Common misheard variants
  private static readonly PHONETIC_VARIANTS: Record<string, string[]> = {
    'hey alabobai': [
      'hey alla bo by',
      'hey ala bo bye',
      'hey alabama',
      'hey hello bob eye',
      'a la bob i',
      'hey all a bob i',
      'hey ali baba',
      'hey ala bobby',
      'hey alla bobby',
    ],
    'alabobai': [
      'alla bo by',
      'ala bo bye',
      'all a bob i',
      'ali baba',
      'ala bobby',
      'alla bobby',
      'alabama eye',
    ],
  };

  constructor(config: WakeWordDetectorConfig = {}) {
    super();
    this.config = {
      wakeWords: WakeWordDetector.DEFAULT_WAKE_WORDS,
      sensitivity: 0.7,
      minConfidence: 0.6,
      cooldownMs: 2000,
      maxListenDurationMs: 60000,
      onlyInSilence: false,
      ...config,
    };

    // Pre-compute phonetic codes and variants
    this.initializeWakeWords();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeWakeWords(): void {
    for (const wakeWord of this.config.wakeWords!) {
      const normalized = wakeWord.toLowerCase().trim();

      // Generate phonetic code
      this.phoneticCodes.set(normalized, phoneticEncode(normalized));

      // Get variants (including phonetic variants)
      const variants: string[] = [normalized];
      const phoneticVariants = WakeWordDetector.PHONETIC_VARIANTS[normalized];
      if (phoneticVariants) {
        variants.push(...phoneticVariants.map(v => v.toLowerCase()));
      }

      this.wakeWordVariants.set(normalized, variants);
    }
  }

  /**
   * Initialize with a speech recognizer
   */
  async initialize(recognizer?: SpeechRecognizer): Promise<void> {
    if (recognizer) {
      this.speechRecognizer = recognizer;
      this.ownsSpeechRecognizer = false;
    } else if (this.config.speechRecognizer) {
      this.speechRecognizer = this.config.speechRecognizer;
      this.ownsSpeechRecognizer = false;
    }

    if (this.speechRecognizer) {
      this.setupSpeechRecognizerListeners();
    }
  }

  private setupSpeechRecognizerListeners(): void {
    if (!this.speechRecognizer) return;

    // Listen to interim transcripts for faster detection
    this.speechRecognizer.on('interim-transcript', (result: TranscriptionResult) => {
      if (this.isListening) {
        this.processTranscript(result, false);
      }
    });

    // Also process final transcripts
    this.speechRecognizer.on('final-transcript', (result: TranscriptionResult) => {
      if (this.isListening) {
        this.processTranscript(result, true);
      }
    });

    // Reset on speech end
    this.speechRecognizer.on('utterance-end', () => {
      this.accumulatedTranscript = '';
    });
  }

  // ============================================================================
  // DETECTION
  // ============================================================================

  /**
   * Start listening for wake word
   */
  startListening(): void {
    if (this.isListening) return;

    this.isListening = true;
    this.listenStartTime = Date.now();
    this.accumulatedTranscript = '';

    // Set timeout for max listen duration
    this.listenTimeout = setTimeout(() => {
      this.resetListening();
    }, this.config.maxListenDurationMs!);

    this.emit('listening-started');
    console.log('[WakeWordDetector] Started listening for wake word');
  }

  /**
   * Stop listening for wake word
   */
  stopListening(): void {
    if (!this.isListening) return;

    this.isListening = false;
    this.clearListenTimeout();
    this.accumulatedTranscript = '';

    this.emit('listening-stopped');
    console.log('[WakeWordDetector] Stopped listening for wake word');
  }

  /**
   * Reset listening state (for timeout/cooldown)
   */
  private resetListening(): void {
    this.accumulatedTranscript = '';
    this.listenStartTime = Date.now();
    this.clearListenTimeout();

    // Restart timeout
    this.listenTimeout = setTimeout(() => {
      this.resetListening();
    }, this.config.maxListenDurationMs!);
  }

  private clearListenTimeout(): void {
    if (this.listenTimeout) {
      clearTimeout(this.listenTimeout);
      this.listenTimeout = null;
    }
  }

  /**
   * Process incoming transcript for wake word
   */
  private processTranscript(result: TranscriptionResult, isFinal: boolean): void {
    // Check cooldown
    if (Date.now() - this.lastDetectionTime < this.config.cooldownMs!) {
      return;
    }

    // Check minimum confidence
    if (result.confidence < this.config.minConfidence!) {
      return;
    }

    // Accumulate transcript for better matching
    if (isFinal) {
      this.accumulatedTranscript += ' ' + result.transcript;
      // Trim to last 100 chars to keep relevant
      if (this.accumulatedTranscript.length > 100) {
        this.accumulatedTranscript = this.accumulatedTranscript.slice(-100);
      }
    }

    const textToCheck = isFinal
      ? this.accumulatedTranscript.toLowerCase().trim()
      : result.transcript.toLowerCase().trim();

    // Check for wake word
    const detection = this.detectWakeWord(textToCheck, result.confidence);

    if (detection) {
      this.lastDetectionTime = Date.now();
      this.accumulatedTranscript = '';

      console.log(`[WakeWordDetector] Wake word detected: "${detection.matchedPhrase}" (${(detection.confidence * 100).toFixed(1)}%)`);

      this.emit('wake-word-detected', detection);
    }
  }

  /**
   * Check text for wake word matches
   */
  private detectWakeWord(text: string, transcriptionConfidence: number): WakeWordDetection | null {
    // Clean and normalize text
    const normalized = text.replace(/[^\w\s]/g, '').toLowerCase();

    for (const [wakeWord, variants] of this.wakeWordVariants) {
      // 1. Exact match
      if (normalized.includes(wakeWord)) {
        return {
          wakeWord,
          matchedPhrase: wakeWord,
          confidence: Math.min(1, transcriptionConfidence + 0.2),
          timestamp: Date.now(),
          method: 'exact',
        };
      }

      // 2. Check known variants
      for (const variant of variants) {
        if (normalized.includes(variant)) {
          return {
            wakeWord,
            matchedPhrase: variant,
            confidence: transcriptionConfidence * 0.95,
            timestamp: Date.now(),
            method: 'phonetic',
          };
        }
      }

      // 3. Fuzzy phonetic matching
      const phoneticCode = this.phoneticCodes.get(wakeWord)!;
      const words = normalized.split(/\s+/);

      // Check sliding windows of words
      for (let windowSize = 2; windowSize <= 4; windowSize++) {
        for (let i = 0; i <= words.length - windowSize; i++) {
          const phrase = words.slice(i, i + windowSize).join(' ');
          const phrasePhonetic = phoneticEncode(phrase);

          const phoneticSimilarity = similarity(phoneticCode, phrasePhonetic);
          const textSimilarity = similarity(wakeWord, phrase);
          const combinedScore = (phoneticSimilarity * 0.6 + textSimilarity * 0.4);

          const threshold = 1 - this.config.sensitivity!;

          if (combinedScore >= threshold && combinedScore >= 0.6) {
            return {
              wakeWord,
              matchedPhrase: phrase,
              confidence: combinedScore * transcriptionConfidence,
              timestamp: Date.now(),
              method: 'fuzzy',
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Manually check a string for wake word (for testing or custom pipelines)
   */
  checkText(text: string, confidence: number = 0.9): WakeWordDetection | null {
    return this.detectWakeWord(text.toLowerCase().trim(), confidence);
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Add a custom wake word
   */
  addWakeWord(wakeWord: string, variants?: string[]): void {
    const normalized = wakeWord.toLowerCase().trim();

    this.config.wakeWords!.push(normalized);
    this.phoneticCodes.set(normalized, phoneticEncode(normalized));

    const allVariants = [normalized];
    if (variants) {
      allVariants.push(...variants.map(v => v.toLowerCase()));
    }
    this.wakeWordVariants.set(normalized, allVariants);

    console.log(`[WakeWordDetector] Added wake word: "${normalized}" with ${allVariants.length - 1} variants`);
  }

  /**
   * Remove a wake word
   */
  removeWakeWord(wakeWord: string): void {
    const normalized = wakeWord.toLowerCase().trim();

    this.config.wakeWords = this.config.wakeWords!.filter(w => w !== normalized);
    this.phoneticCodes.delete(normalized);
    this.wakeWordVariants.delete(normalized);
  }

  /**
   * Set sensitivity (0-1)
   */
  setSensitivity(sensitivity: number): void {
    this.config.sensitivity = Math.max(0, Math.min(1, sensitivity));
  }

  /**
   * Get current configuration
   */
  getConfig(): WakeWordDetectorConfig {
    return { ...this.config };
  }

  /**
   * Get all registered wake words
   */
  getWakeWords(): string[] {
    return [...this.config.wakeWords!];
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopListening();

    if (this.speechRecognizer) {
      this.speechRecognizer.removeAllListeners('interim-transcript');
      this.speechRecognizer.removeAllListeners('final-transcript');
      this.speechRecognizer.removeAllListeners('utterance-end');

      if (this.ownsSpeechRecognizer) {
        this.speechRecognizer.disconnect();
      }
      this.speechRecognizer = null;
    }
  }

  /**
   * Get listening status
   */
  get listening(): boolean {
    return this.isListening;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createWakeWordDetector(config?: WakeWordDetectorConfig): WakeWordDetector {
  return new WakeWordDetector(config);
}
