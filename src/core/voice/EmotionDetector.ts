/**
 * Alabobai Emotion Detector
 * Detects user emotion from voice characteristics and speech content
 * Combines audio analysis with sentiment analysis for accurate detection
 */

import { EventEmitter } from 'events';
import { TranscriptionResult, Word } from './SpeechRecognizer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionDetectorConfig {
  enabled?: boolean;
  analysisWindowMs?: number; // Time window for emotion analysis
  confidenceThreshold?: number; // Minimum confidence to report emotion
  smoothingFactor?: number; // How much to smooth emotion transitions (0-1)
  enableAudioAnalysis?: boolean;
  enableTextAnalysis?: boolean;
}

export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'surprised'
  | 'disgusted'
  | 'confused'
  | 'frustrated'
  | 'excited'
  | 'calm';

export interface EmotionResult {
  primary: EmotionType;
  primaryConfidence: number;
  secondary?: EmotionType;
  secondaryConfidence?: number;
  valence: number; // -1 (negative) to 1 (positive)
  arousal: number; // 0 (calm) to 1 (excited)
  dominance: number; // 0 (submissive) to 1 (dominant)
  timestamp: number;
  source: 'audio' | 'text' | 'combined';
}

export interface AudioFeatures {
  pitch: number; // Average pitch in Hz
  pitchVariation: number; // Pitch variance
  intensity: number; // Average loudness
  intensityVariation: number;
  speechRate: number; // Words per minute
  pauseDuration: number; // Average pause duration
  voiceQuality: VoiceQuality;
}

export interface VoiceQuality {
  jitter: number; // Voice stability
  shimmer: number; // Amplitude variation
  hnr: number; // Harmonics-to-noise ratio
}

export interface TextEmotionIndicators {
  sentimentScore: number; // -1 to 1
  emotionalWords: string[];
  intensifiers: number;
  negations: number;
  questionMarks: number;
  exclamationMarks: number;
}

// ============================================================================
// EMOTION CLASSIFIER
// ============================================================================

/**
 * Emotion classification based on audio and text features
 */
class EmotionClassifier {
  // Emotion keywords and patterns
  private static readonly EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
    happy: ['happy', 'great', 'awesome', 'wonderful', 'fantastic', 'love', 'excited', 'glad', 'pleased', 'delighted', 'joy', 'yay', 'yes'],
    sad: ['sad', 'sorry', 'unfortunately', 'miss', 'lost', 'crying', 'depressed', 'down', 'unhappy', 'disappointed', 'heartbroken'],
    angry: ['angry', 'mad', 'furious', 'annoyed', 'frustrated', 'irritated', 'hate', 'stupid', 'ridiculous', 'terrible', 'awful'],
    fearful: ['scared', 'afraid', 'worried', 'anxious', 'nervous', 'terrified', 'fear', 'panic', 'dread', 'concern'],
    surprised: ['wow', 'really', 'seriously', 'unbelievable', 'incredible', 'amazing', 'shocking', 'unexpected', 'oh my'],
    disgusted: ['disgusting', 'gross', 'yuck', 'ugh', 'nasty', 'revolting', 'vile', 'sick'],
    confused: ['confused', 'unclear', 'what', 'huh', 'dont understand', 'makes no sense', 'puzzled', 'lost'],
    frustrated: ['frustrated', 'stuck', 'cant', 'wont work', 'not working', 'impossible', 'give up', 'tried everything'],
    excited: ['excited', 'cant wait', 'thrilled', 'pumped', 'eager', 'looking forward', 'amazing'],
    calm: ['calm', 'relaxed', 'peaceful', 'serene', 'okay', 'fine', 'alright', 'good'],
    neutral: [],
  };

  // Intensifier words that amplify emotions
  private static readonly INTENSIFIERS = [
    'very', 'really', 'extremely', 'incredibly', 'absolutely', 'totally', 'completely',
    'so', 'such', 'quite', 'too', 'super', 'highly', 'terribly', 'awfully',
  ];

  // Negation words that may flip emotion
  private static readonly NEGATIONS = [
    'not', "n't", 'no', 'never', 'none', 'nobody', 'nothing', 'neither', 'nowhere',
    'hardly', 'barely', 'scarcely', "doesn't", "don't", "didn't", "won't", "wouldn't",
  ];

  /**
   * Classify emotion from text
   */
  classifyFromText(text: string): { emotion: EmotionType; confidence: number; indicators: TextEmotionIndicators } {
    const words = text.toLowerCase().split(/\s+/);
    const emotionScores: Record<EmotionType, number> = {
      neutral: 0.1, // Base score for neutral
      happy: 0,
      sad: 0,
      angry: 0,
      fearful: 0,
      surprised: 0,
      disgusted: 0,
      confused: 0,
      frustrated: 0,
      excited: 0,
      calm: 0,
    };

    // Count emotion keywords
    for (const [emotion, keywords] of Object.entries(EmotionClassifier.EMOTION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.toLowerCase().includes(keyword)) {
          emotionScores[emotion as EmotionType] += 1;
        }
      }
    }

    // Count indicators
    const intensifiers = words.filter(w =>
      EmotionClassifier.INTENSIFIERS.includes(w)
    ).length;

    const negations = words.filter(w =>
      EmotionClassifier.NEGATIONS.some(n => w.includes(n))
    ).length;

    const questionMarks = (text.match(/\?/g) || []).length;
    const exclamationMarks = (text.match(/!/g) || []).length;

    // Boost scores based on indicators
    if (exclamationMarks > 0) {
      emotionScores.excited += 0.5;
      emotionScores.angry += 0.3;
      emotionScores.happy += 0.3;
    }

    if (questionMarks > 1) {
      emotionScores.confused += 0.5;
    }

    if (intensifiers > 0) {
      // Amplify the highest emotion
      const maxEmotion = Object.entries(emotionScores)
        .filter(([e]) => e !== 'neutral')
        .reduce((a, b) => a[1] > b[1] ? a : b);
      if (maxEmotion[1] > 0) {
        emotionScores[maxEmotion[0] as EmotionType] *= (1 + 0.2 * intensifiers);
      }
    }

    // Find primary emotion
    const sortedEmotions = Object.entries(emotionScores)
      .sort((a, b) => b[1] - a[1]);

    const primary = sortedEmotions[0][0] as EmotionType;
    const primaryScore = sortedEmotions[0][1];

    // Calculate confidence based on score differential
    const totalScore = Object.values(emotionScores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.min(1, primaryScore / totalScore + 0.3) : 0.3;

    // Calculate sentiment score
    const positiveEmotions = ['happy', 'excited', 'calm', 'surprised'];
    const negativeEmotions = ['sad', 'angry', 'fearful', 'disgusted', 'frustrated'];

    const posScore = positiveEmotions.reduce((sum, e) => sum + emotionScores[e as EmotionType], 0);
    const negScore = negativeEmotions.reduce((sum, e) => sum + emotionScores[e as EmotionType], 0);
    const sentimentScore = totalScore > 0 ? (posScore - negScore) / totalScore : 0;

    return {
      emotion: primary,
      confidence,
      indicators: {
        sentimentScore,
        emotionalWords: words.filter(w =>
          Object.values(EmotionClassifier.EMOTION_KEYWORDS)
            .flat()
            .includes(w)
        ),
        intensifiers,
        negations,
        questionMarks,
        exclamationMarks,
      },
    };
  }

  /**
   * Classify emotion from audio features
   */
  classifyFromAudio(features: AudioFeatures): { emotion: EmotionType; confidence: number } {
    // Emotion classification based on prosodic features
    // Based on research in affective computing

    const scores: Record<EmotionType, number> = {
      neutral: 0.2,
      happy: 0,
      sad: 0,
      angry: 0,
      fearful: 0,
      surprised: 0,
      disgusted: 0,
      confused: 0,
      frustrated: 0,
      excited: 0,
      calm: 0,
    };

    // High pitch + high pitch variation + fast speech = excited/happy
    if (features.pitch > 200 && features.pitchVariation > 50) {
      scores.excited += 0.5;
      scores.happy += 0.4;
      scores.surprised += 0.3;
    }

    // High intensity + high pitch = angry
    if (features.intensity > 0.7 && features.pitch > 180) {
      scores.angry += 0.5;
      scores.frustrated += 0.4;
    }

    // Low pitch + slow speech + low intensity = sad
    if (features.pitch < 150 && features.speechRate < 100 && features.intensity < 0.4) {
      scores.sad += 0.5;
      scores.calm += 0.3;
    }

    // Fast speech + high pitch variation = fearful/anxious
    if (features.speechRate > 180 && features.pitchVariation > 60) {
      scores.fearful += 0.4;
      scores.confused += 0.3;
    }

    // Low pitch variation + moderate intensity = calm/neutral
    if (features.pitchVariation < 30 && features.intensity > 0.3 && features.intensity < 0.6) {
      scores.calm += 0.5;
      scores.neutral += 0.4;
    }

    // Long pauses + slow speech = confused or sad
    if (features.pauseDuration > 0.5 && features.speechRate < 100) {
      scores.confused += 0.3;
      scores.sad += 0.2;
    }

    // Voice quality analysis
    if (features.voiceQuality.jitter > 0.03) {
      // High jitter indicates stress or emotion
      scores.angry += 0.2;
      scores.fearful += 0.2;
      scores.frustrated += 0.2;
    }

    // Find primary emotion
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0][0] as EmotionType;
    const confidence = Math.min(1, sorted[0][1] + 0.3);

    return { emotion: primary, confidence };
  }

  /**
   * Combine text and audio classification
   */
  combineClassifications(
    textResult: { emotion: EmotionType; confidence: number },
    audioResult: { emotion: EmotionType; confidence: number }
  ): EmotionResult {
    // Weight text slightly higher as it's more reliable from Deepgram
    const textWeight = 0.6;
    const audioWeight = 0.4;

    const emotionScores: Record<EmotionType, number> = {
      neutral: 0,
      happy: 0,
      sad: 0,
      angry: 0,
      fearful: 0,
      surprised: 0,
      disgusted: 0,
      confused: 0,
      frustrated: 0,
      excited: 0,
      calm: 0,
    };

    // Add weighted scores
    emotionScores[textResult.emotion] += textResult.confidence * textWeight;
    emotionScores[audioResult.emotion] += audioResult.confidence * audioWeight;

    // Find primary and secondary
    const sorted = Object.entries(emotionScores).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0][0] as EmotionType;
    const primaryConfidence = sorted[0][1];
    const secondary = sorted[1][0] as EmotionType;
    const secondaryConfidence = sorted[1][1];

    // Calculate VAD (Valence-Arousal-Dominance)
    const vadMap: Record<EmotionType, { v: number; a: number; d: number }> = {
      neutral: { v: 0, a: 0.3, d: 0.5 },
      happy: { v: 0.8, a: 0.6, d: 0.6 },
      sad: { v: -0.7, a: 0.2, d: 0.2 },
      angry: { v: -0.6, a: 0.8, d: 0.8 },
      fearful: { v: -0.5, a: 0.7, d: 0.2 },
      surprised: { v: 0.3, a: 0.8, d: 0.5 },
      disgusted: { v: -0.7, a: 0.5, d: 0.6 },
      confused: { v: -0.2, a: 0.4, d: 0.3 },
      frustrated: { v: -0.6, a: 0.6, d: 0.4 },
      excited: { v: 0.7, a: 0.9, d: 0.7 },
      calm: { v: 0.5, a: 0.1, d: 0.5 },
    };

    const vad = vadMap[primary];

    return {
      primary,
      primaryConfidence,
      secondary: secondaryConfidence > 0.1 ? secondary : undefined,
      secondaryConfidence: secondaryConfidence > 0.1 ? secondaryConfidence : undefined,
      valence: vad.v,
      arousal: vad.a,
      dominance: vad.d,
      timestamp: Date.now(),
      source: 'combined',
    };
  }
}

// ============================================================================
// EMOTION DETECTOR CLASS
// ============================================================================

export class EmotionDetector extends EventEmitter {
  private config: EmotionDetectorConfig;
  private classifier: EmotionClassifier;
  private emotionHistory: EmotionResult[] = [];
  private smoothedEmotion: EmotionResult | null = null;
  private analysisBuffer: { text: string; timestamp: number }[] = [];
  private wordTimings: Word[] = [];

  constructor(config: EmotionDetectorConfig = {}) {
    super();
    this.config = {
      enabled: true,
      analysisWindowMs: 5000,
      confidenceThreshold: 0.4,
      smoothingFactor: 0.3,
      enableAudioAnalysis: true,
      enableTextAnalysis: true,
      ...config,
    };

    this.classifier = new EmotionClassifier();
  }

  // ============================================================================
  // DETECTION METHODS
  // ============================================================================

  /**
   * Process a transcription result and detect emotion
   */
  processTranscription(result: TranscriptionResult): EmotionResult | null {
    if (!this.config.enabled) return null;

    // Add to analysis buffer
    this.analysisBuffer.push({
      text: result.transcript,
      timestamp: Date.now(),
    });

    // Store word timings for audio analysis
    if (result.words) {
      this.wordTimings.push(...result.words);
    }

    // Clean old entries from buffer
    const cutoff = Date.now() - this.config.analysisWindowMs!;
    this.analysisBuffer = this.analysisBuffer.filter(e => e.timestamp > cutoff);
    this.wordTimings = this.wordTimings.filter(w => (w.end * 1000) > cutoff);

    // Only analyze on final transcripts
    if (!result.isFinal) return null;

    // Combine buffered text
    const combinedText = this.analysisBuffer.map(e => e.text).join(' ');

    // Detect emotion
    const emotion = this.detectEmotion(combinedText, result.words);

    if (emotion && emotion.primaryConfidence >= this.config.confidenceThreshold!) {
      // Apply smoothing
      const smoothed = this.applySmoothing(emotion);

      this.emotionHistory.push(smoothed);
      if (this.emotionHistory.length > 100) {
        this.emotionHistory.shift();
      }

      this.emit('emotion-detected', smoothed);
      return smoothed;
    }

    return null;
  }

  /**
   * Detect emotion from text and optional audio features
   */
  detectEmotion(text: string, words?: Word[]): EmotionResult {
    let textResult = { emotion: 'neutral' as EmotionType, confidence: 0.5 };
    let audioResult = { emotion: 'neutral' as EmotionType, confidence: 0.5 };

    // Text-based analysis
    if (this.config.enableTextAnalysis && text.trim()) {
      const textAnalysis = this.classifier.classifyFromText(text);
      textResult = {
        emotion: textAnalysis.emotion,
        confidence: textAnalysis.confidence,
      };
    }

    // Audio-based analysis (if words with timing are available)
    if (this.config.enableAudioAnalysis && words && words.length > 0) {
      const audioFeatures = this.extractAudioFeatures(words);
      audioResult = this.classifier.classifyFromAudio(audioFeatures);
    }

    // Combine results
    if (this.config.enableTextAnalysis && this.config.enableAudioAnalysis) {
      return this.classifier.combineClassifications(textResult, audioResult);
    } else if (this.config.enableTextAnalysis) {
      return this.createEmotionResult(textResult.emotion, textResult.confidence, 'text');
    } else {
      return this.createEmotionResult(audioResult.emotion, audioResult.confidence, 'audio');
    }
  }

  /**
   * Extract audio features from word timings
   */
  private extractAudioFeatures(words: Word[]): AudioFeatures {
    // Calculate speech rate (words per minute)
    const totalDuration = words.length > 0
      ? words[words.length - 1].end - words[0].start
      : 0;
    const speechRate = totalDuration > 0
      ? (words.length / totalDuration) * 60
      : 120;

    // Calculate pause durations
    let totalPauseDuration = 0;
    let pauseCount = 0;
    for (let i = 1; i < words.length; i++) {
      const pause = words[i].start - words[i - 1].end;
      if (pause > 0.1) { // Pause > 100ms
        totalPauseDuration += pause;
        pauseCount++;
      }
    }
    const avgPauseDuration = pauseCount > 0 ? totalPauseDuration / pauseCount : 0;

    // Estimate pitch and intensity from confidence patterns
    // (Real implementation would use actual audio analysis)
    const avgConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
    const confidenceVariation = this.calculateVariation(words.map(w => w.confidence));

    // Use confidence as proxy for intensity (higher confidence often = clearer speech = moderate intensity)
    // Use confidence variation as proxy for pitch variation
    return {
      pitch: 150 + (avgConfidence * 100), // Estimate
      pitchVariation: confidenceVariation * 100,
      intensity: Math.min(1, avgConfidence + 0.2),
      intensityVariation: confidenceVariation,
      speechRate,
      pauseDuration: avgPauseDuration,
      voiceQuality: {
        jitter: (1 - avgConfidence) * 0.05, // Estimate
        shimmer: (1 - avgConfidence) * 0.1,
        hnr: avgConfidence * 20,
      },
    };
  }

  private calculateVariation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Create emotion result with VAD values
   */
  private createEmotionResult(
    emotion: EmotionType,
    confidence: number,
    source: 'audio' | 'text' | 'combined'
  ): EmotionResult {
    const vadMap: Record<EmotionType, { v: number; a: number; d: number }> = {
      neutral: { v: 0, a: 0.3, d: 0.5 },
      happy: { v: 0.8, a: 0.6, d: 0.6 },
      sad: { v: -0.7, a: 0.2, d: 0.2 },
      angry: { v: -0.6, a: 0.8, d: 0.8 },
      fearful: { v: -0.5, a: 0.7, d: 0.2 },
      surprised: { v: 0.3, a: 0.8, d: 0.5 },
      disgusted: { v: -0.7, a: 0.5, d: 0.6 },
      confused: { v: -0.2, a: 0.4, d: 0.3 },
      frustrated: { v: -0.6, a: 0.6, d: 0.4 },
      excited: { v: 0.7, a: 0.9, d: 0.7 },
      calm: { v: 0.5, a: 0.1, d: 0.5 },
    };

    const vad = vadMap[emotion];

    return {
      primary: emotion,
      primaryConfidence: confidence,
      valence: vad.v,
      arousal: vad.a,
      dominance: vad.d,
      timestamp: Date.now(),
      source,
    };
  }

  /**
   * Apply temporal smoothing to emotion detection
   */
  private applySmoothing(newEmotion: EmotionResult): EmotionResult {
    if (!this.smoothedEmotion) {
      this.smoothedEmotion = newEmotion;
      return newEmotion;
    }

    const alpha = this.config.smoothingFactor!;

    // Smooth VAD values
    const smoothedValence = alpha * newEmotion.valence + (1 - alpha) * this.smoothedEmotion.valence;
    const smoothedArousal = alpha * newEmotion.arousal + (1 - alpha) * this.smoothedEmotion.arousal;
    const smoothedDominance = alpha * newEmotion.dominance + (1 - alpha) * this.smoothedEmotion.dominance;

    // Keep the new primary emotion if confidence is high enough
    const smoothed: EmotionResult = {
      ...newEmotion,
      valence: smoothedValence,
      arousal: smoothedArousal,
      dominance: smoothedDominance,
    };

    this.smoothedEmotion = smoothed;
    return smoothed;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get emotion trend over recent history
   */
  getEmotionTrend(): {
    averageValence: number;
    averageArousal: number;
    dominantEmotion: EmotionType;
    trend: 'improving' | 'declining' | 'stable';
  } {
    if (this.emotionHistory.length < 2) {
      return {
        averageValence: 0,
        averageArousal: 0.5,
        dominantEmotion: 'neutral',
        trend: 'stable',
      };
    }

    const recentHistory = this.emotionHistory.slice(-10);

    const avgValence = recentHistory.reduce((sum, e) => sum + e.valence, 0) / recentHistory.length;
    const avgArousal = recentHistory.reduce((sum, e) => sum + e.arousal, 0) / recentHistory.length;

    // Count dominant emotion
    const emotionCounts: Record<string, number> = {};
    for (const e of recentHistory) {
      emotionCounts[e.primary] = (emotionCounts[e.primary] || 0) + 1;
    }
    const dominantEmotion = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])[0][0] as EmotionType;

    // Calculate trend
    const firstHalf = recentHistory.slice(0, Math.floor(recentHistory.length / 2));
    const secondHalf = recentHistory.slice(Math.floor(recentHistory.length / 2));

    const firstValence = firstHalf.reduce((sum, e) => sum + e.valence, 0) / firstHalf.length;
    const secondValence = secondHalf.reduce((sum, e) => sum + e.valence, 0) / secondHalf.length;

    let trend: 'improving' | 'declining' | 'stable';
    if (secondValence - firstValence > 0.1) {
      trend = 'improving';
    } else if (firstValence - secondValence > 0.1) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return { averageValence: avgValence, averageArousal: avgArousal, dominantEmotion, trend };
  }

  /**
   * Get current smoothed emotion
   */
  getCurrentEmotion(): EmotionResult | null {
    return this.smoothedEmotion;
  }

  /**
   * Get emotion history
   */
  getHistory(): EmotionResult[] {
    return [...this.emotionHistory];
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.emotionHistory = [];
    this.smoothedEmotion = null;
    this.analysisBuffer = [];
    this.wordTimings = [];
  }

  /**
   * Enable/disable detector
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if detector is enabled
   */
  get enabled(): boolean {
    return this.config.enabled!;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createEmotionDetector(config?: EmotionDetectorConfig): EmotionDetector {
  return new EmotionDetector(config);
}
