/**
 * Alabobai Conversation Manager
 * Manages the flow of voice conversations with context awareness
 * Handles turn-taking, interruptions, and conversation state
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  id: string;
  speaker: 'user' | 'assistant';
  text: string;
  startTime: number;
  endTime: number;
  interrupted: boolean;
  emotion?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationState {
  id: string;
  turns: ConversationTurn[];
  currentSpeaker: 'user' | 'assistant' | null;
  isActive: boolean;
  startTime: number;
  lastActivityTime: number;
  context: ConversationContext;
  metrics: ConversationMetrics;
}

export interface ConversationContext {
  topic?: string;
  userIntent?: string;
  entities: Map<string, unknown>;
  history: string[];
  emotionalState: EmotionalState;
  preferences: UserPreferences;
}

export interface EmotionalState {
  currentEmotion: string;
  intensity: number; // 0-1
  trend: 'improving' | 'declining' | 'stable';
}

export interface UserPreferences {
  speakingPace: 'slow' | 'normal' | 'fast';
  verbosity: 'concise' | 'normal' | 'detailed';
  formalityLevel: 'casual' | 'normal' | 'formal';
}

export interface ConversationMetrics {
  totalTurns: number;
  userTurns: number;
  assistantTurns: number;
  averageTurnDuration: number;
  interruptionCount: number;
  silenceDuration: number;
  averageResponseLatency: number;
}

export interface ConversationManagerConfig {
  maxHistoryLength?: number;
  silenceTimeoutMs?: number;
  interruptionThresholdMs?: number;
  contextWindowSize?: number;
}

// ============================================================================
// CONVERSATION MANAGER CLASS
// ============================================================================

export class ConversationManager extends EventEmitter {
  private config: ConversationManagerConfig;
  private conversations: Map<string, ConversationState> = new Map();
  private activeConversation: ConversationState | null = null;
  private pendingTurn: Partial<ConversationTurn> | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private responseStartTime: number = 0;

  constructor(config: ConversationManagerConfig = {}) {
    super();
    this.config = {
      maxHistoryLength: 50,
      silenceTimeoutMs: 30000, // 30 seconds of silence ends conversation
      interruptionThresholdMs: 200, // User speaking within 200ms of assistant is interruption
      contextWindowSize: 10,
      ...config,
    };
  }

  // ============================================================================
  // CONVERSATION LIFECYCLE
  // ============================================================================

  /**
   * Start a new conversation
   */
  startConversation(conversationId?: string): ConversationState {
    const id = conversationId || uuid();
    const now = Date.now();

    const conversation: ConversationState = {
      id,
      turns: [],
      currentSpeaker: null,
      isActive: true,
      startTime: now,
      lastActivityTime: now,
      context: {
        entities: new Map(),
        history: [],
        emotionalState: {
          currentEmotion: 'neutral',
          intensity: 0.5,
          trend: 'stable',
        },
        preferences: {
          speakingPace: 'normal',
          verbosity: 'normal',
          formalityLevel: 'normal',
        },
      },
      metrics: {
        totalTurns: 0,
        userTurns: 0,
        assistantTurns: 0,
        averageTurnDuration: 0,
        interruptionCount: 0,
        silenceDuration: 0,
        averageResponseLatency: 0,
      },
    };

    this.conversations.set(id, conversation);
    this.activeConversation = conversation;
    this.resetSilenceTimer();

    this.emit('conversation-started', conversation);
    console.log(`[ConversationManager] Started conversation: ${id}`);

    return conversation;
  }

  /**
   * End the current conversation
   */
  endConversation(conversationId?: string): void {
    const conversation = conversationId
      ? this.conversations.get(conversationId)
      : this.activeConversation;

    if (!conversation) return;

    conversation.isActive = false;
    this.clearSilenceTimer();

    if (this.activeConversation?.id === conversation.id) {
      this.activeConversation = null;
    }

    this.emit('conversation-ended', conversation);
    console.log(`[ConversationManager] Ended conversation: ${conversation.id}`);
  }

  /**
   * Get current active conversation
   */
  getActiveConversation(): ConversationState | null {
    return this.activeConversation;
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): ConversationState | undefined {
    return this.conversations.get(conversationId);
  }

  // ============================================================================
  // TURN MANAGEMENT
  // ============================================================================

  /**
   * Handle start of user speech
   */
  onUserSpeechStart(): void {
    if (!this.activeConversation) {
      this.startConversation();
    }

    const now = Date.now();
    const conversation = this.activeConversation!;

    // Check for interruption
    if (conversation.currentSpeaker === 'assistant') {
      const timeSinceAssistant = now - (this.responseStartTime || conversation.lastActivityTime);
      if (timeSinceAssistant < this.config.interruptionThresholdMs!) {
        this.handleInterruption();
      }
    }

    // Start pending turn
    this.pendingTurn = {
      id: uuid(),
      speaker: 'user',
      startTime: now,
      interrupted: false,
      confidence: 0,
    };

    conversation.currentSpeaker = 'user';
    conversation.lastActivityTime = now;
    this.resetSilenceTimer();

    this.emit('user-speech-start');
  }

  /**
   * Handle end of user speech with transcript
   */
  onUserSpeechEnd(transcript: string, confidence: number, emotion?: string): ConversationTurn | null {
    if (!this.activeConversation || !this.pendingTurn) return null;

    const now = Date.now();
    const conversation = this.activeConversation;

    // Complete the turn
    const turn: ConversationTurn = {
      id: this.pendingTurn.id!,
      speaker: 'user',
      text: transcript,
      startTime: this.pendingTurn.startTime!,
      endTime: now,
      interrupted: this.pendingTurn.interrupted || false,
      emotion,
      confidence,
    };

    // Add to conversation
    this.addTurn(turn);
    this.pendingTurn = null;
    conversation.currentSpeaker = null;

    // Update context
    this.updateContext(transcript, emotion);

    this.emit('user-turn-complete', turn);
    return turn;
  }

  /**
   * Handle start of assistant response
   */
  onAssistantSpeechStart(): void {
    if (!this.activeConversation) return;

    const now = Date.now();
    this.responseStartTime = now;
    this.activeConversation.currentSpeaker = 'assistant';

    // Start pending turn
    this.pendingTurn = {
      id: uuid(),
      speaker: 'assistant',
      startTime: now,
      interrupted: false,
      confidence: 1,
    };

    this.emit('assistant-speech-start');
  }

  /**
   * Handle end of assistant response
   */
  onAssistantSpeechEnd(response: string): ConversationTurn | null {
    if (!this.activeConversation || !this.pendingTurn) return null;

    const now = Date.now();
    const conversation = this.activeConversation;

    // Complete the turn
    const turn: ConversationTurn = {
      id: this.pendingTurn.id!,
      speaker: 'assistant',
      text: response,
      startTime: this.pendingTurn.startTime!,
      endTime: now,
      interrupted: this.pendingTurn.interrupted || false,
      confidence: 1,
    };

    // Add to conversation
    this.addTurn(turn);
    this.pendingTurn = null;
    conversation.currentSpeaker = null;

    // Calculate response latency
    this.updateResponseLatency(now - this.responseStartTime);

    this.emit('assistant-turn-complete', turn);
    return turn;
  }

  /**
   * Add a turn to the conversation
   */
  private addTurn(turn: ConversationTurn): void {
    const conversation = this.activeConversation!;

    conversation.turns.push(turn);
    conversation.lastActivityTime = turn.endTime;

    // Update metrics
    conversation.metrics.totalTurns++;
    if (turn.speaker === 'user') {
      conversation.metrics.userTurns++;
    } else {
      conversation.metrics.assistantTurns++;
    }

    // Calculate average turn duration
    const totalDuration = conversation.turns.reduce(
      (sum, t) => sum + (t.endTime - t.startTime),
      0
    );
    conversation.metrics.averageTurnDuration = totalDuration / conversation.turns.length;

    // Maintain history limit
    if (conversation.turns.length > this.config.maxHistoryLength!) {
      conversation.turns.shift();
    }

    // Update context history
    conversation.context.history.push(`${turn.speaker}: ${turn.text}`);
    if (conversation.context.history.length > this.config.contextWindowSize!) {
      conversation.context.history.shift();
    }

    this.emit('turn-added', turn);
  }

  // ============================================================================
  // INTERRUPTION HANDLING
  // ============================================================================

  /**
   * Handle user interrupting assistant
   */
  handleInterruption(): void {
    if (!this.activeConversation) return;

    console.log('[ConversationManager] User interruption detected');

    // Mark pending assistant turn as interrupted
    if (this.pendingTurn?.speaker === 'assistant') {
      this.pendingTurn.interrupted = true;
    }

    this.activeConversation.metrics.interruptionCount++;
    this.emit('interruption', {
      timestamp: Date.now(),
      previousSpeaker: 'assistant',
    });
  }

  /**
   * Check if user is trying to interrupt
   */
  isInterruption(): boolean {
    if (!this.activeConversation) return false;

    return (
      this.activeConversation.currentSpeaker === 'assistant' &&
      Date.now() - this.responseStartTime < this.config.interruptionThresholdMs!
    );
  }

  // ============================================================================
  // CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Update conversation context based on user input
   */
  private updateContext(text: string, emotion?: string): void {
    if (!this.activeConversation) return;

    const context = this.activeConversation.context;

    // Update emotional state
    if (emotion) {
      const previousEmotion = context.emotionalState.currentEmotion;
      context.emotionalState.currentEmotion = emotion;

      // Determine trend
      const emotionValence: Record<string, number> = {
        happy: 1, excited: 1, neutral: 0, calm: 0,
        sad: -1, angry: -1, frustrated: -1,
      };

      const prev = emotionValence[previousEmotion] ?? 0;
      const curr = emotionValence[emotion] ?? 0;

      if (curr > prev) {
        context.emotionalState.trend = 'improving';
      } else if (curr < prev) {
        context.emotionalState.trend = 'declining';
      } else {
        context.emotionalState.trend = 'stable';
      }
    }

    // Extract potential entities (simple pattern matching)
    this.extractEntities(text, context.entities);
  }

  /**
   * Simple entity extraction from text
   */
  private extractEntities(text: string, entities: Map<string, unknown>): void {
    // Email pattern
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/g);
    if (emailMatch) {
      entities.set('email', emailMatch[0]);
    }

    // Phone pattern
    const phoneMatch = text.match(/\+?[\d\s()-]{10,}/g);
    if (phoneMatch) {
      entities.set('phone', phoneMatch[0].trim());
    }

    // Date patterns (simple)
    const dateMatch = text.match(/\b(today|tomorrow|yesterday|next week|next month)\b/gi);
    if (dateMatch) {
      entities.set('date_reference', dateMatch[0].toLowerCase());
    }

    // Money amounts
    const moneyMatch = text.match(/\$[\d,]+(?:\.\d{2})?/g);
    if (moneyMatch) {
      entities.set('amount', moneyMatch[0]);
    }

    // Numbers
    const numberMatch = text.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g);
    if (numberMatch && numberMatch.length > 0) {
      entities.set('number', numberMatch[0]);
    }
  }

  /**
   * Get context for AI processing
   */
  getContextForAI(): {
    recentHistory: string[];
    entities: Record<string, unknown>;
    emotion: string;
    preferences: UserPreferences;
  } {
    if (!this.activeConversation) {
      return {
        recentHistory: [],
        entities: {},
        emotion: 'neutral',
        preferences: { speakingPace: 'normal', verbosity: 'normal', formalityLevel: 'normal' },
      };
    }

    const context = this.activeConversation.context;
    return {
      recentHistory: context.history.slice(-this.config.contextWindowSize!),
      entities: Object.fromEntries(context.entities),
      emotion: context.emotionalState.currentEmotion,
      preferences: context.preferences,
    };
  }

  /**
   * Set user preferences
   */
  setUserPreferences(preferences: Partial<UserPreferences>): void {
    if (!this.activeConversation) return;

    Object.assign(this.activeConversation.context.preferences, preferences);
    this.emit('preferences-updated', this.activeConversation.context.preferences);
  }

  // ============================================================================
  // SILENCE HANDLING
  // ============================================================================

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();

    this.silenceTimer = setTimeout(() => {
      if (this.activeConversation?.isActive) {
        console.log('[ConversationManager] Silence timeout - ending conversation');
        this.emit('silence-timeout');
        this.endConversation();
      }
    }, this.config.silenceTimeoutMs!);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  private updateResponseLatency(latency: number): void {
    if (!this.activeConversation) return;

    const metrics = this.activeConversation.metrics;
    const turnCount = metrics.assistantTurns;

    // Rolling average
    metrics.averageResponseLatency =
      (metrics.averageResponseLatency * (turnCount - 1) + latency) / turnCount;
  }

  /**
   * Get conversation metrics
   */
  getMetrics(conversationId?: string): ConversationMetrics | null {
    const conversation = conversationId
      ? this.conversations.get(conversationId)
      : this.activeConversation;

    return conversation?.metrics || null;
  }

  /**
   * Get full conversation transcript
   */
  getTranscript(conversationId?: string): string {
    const conversation = conversationId
      ? this.conversations.get(conversationId)
      : this.activeConversation;

    if (!conversation) return '';

    return conversation.turns
      .map(turn => `${turn.speaker === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
      .join('\n\n');
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.clearSilenceTimer();
    this.conversations.clear();
    this.activeConversation = null;
    this.pendingTurn = null;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createConversationManager(config?: ConversationManagerConfig): ConversationManager {
  return new ConversationManager(config);
}
