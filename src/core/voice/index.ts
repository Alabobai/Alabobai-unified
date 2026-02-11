/**
 * Alabobai Voice Module
 * Complete voice interface for sub-300ms latency voice interactions
 */

// Speech Recognition
export {
  SpeechRecognizer,
  createSpeechRecognizer,
  createDefaultSpeechRecognizer,
} from './SpeechRecognizer.js';
export type {
  SpeechRecognizerConfig,
  TranscriptionResult,
  Word,
  SpeechRecognizerEvents,
} from './SpeechRecognizer.js';

// Voice Synthesis
export {
  VoiceSynthesizer,
  createVoiceSynthesizer,
  createDefaultVoiceSynthesizer,
} from './VoiceSynthesizer.js';
export type {
  VoiceSynthesizerConfig,
  SynthesisRequest,
  SynthesisResult,
  SynthesisMetrics,
  VoiceEmotion,
} from './VoiceSynthesizer.js';

// Conversation Management
export {
  ConversationManager,
  createConversationManager,
} from './ConversationManager.js';
export type {
  ConversationTurn,
  ConversationState,
  ConversationContext as VoiceConversationContext,
  ConversationMetrics,
  ConversationManagerConfig,
  EmotionalState,
  UserPreferences,
} from './ConversationManager.js';

// Wake Word Detection
export {
  WakeWordDetector,
  createWakeWordDetector,
} from './WakeWordDetector.js';
export type {
  WakeWordDetectorConfig,
  WakeWordDetection,
} from './WakeWordDetector.js';

// Emotion Detection
export {
  EmotionDetector,
  createEmotionDetector,
} from './EmotionDetector.js';
export type {
  EmotionDetectorConfig,
  EmotionType,
  EmotionResult,
  AudioFeatures,
  VoiceQuality,
  TextEmotionIndicators,
} from './EmotionDetector.js';

// Main Voice Interface
export {
  VoiceInterface,
  createVoiceInterface,
  createDefaultVoiceInterface,
} from './VoiceInterface.js';
export type {
  VoiceInterfaceConfig,
  VoiceSession,
  VoiceSessionState,
  VoiceSessionMetrics,
  VoiceResponse,
} from './VoiceInterface.js';
