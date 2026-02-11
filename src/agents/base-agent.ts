/**
 * Alabobai Base Agent
 * Abstract base class that all department agents inherit from
 * Provides common functionality for task execution, streaming, and error handling
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type { LLMClient, LLMMessage } from '../core/llm-client.js';
import type { Task, TaskResult, Message, AgentStatus, AgentCategory } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BaseAgentConfig {
  id?: string;
  name: string;
  category: AgentCategory;
  description: string;
  icon: string;
  skills: string[];
  systemPrompt: string;
  llm: LLMClient;
  maxContextMessages?: number;
  temperature?: number;
}

export interface AgentExecutionContext {
  sessionId: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface AgentCapability {
  name: string;
  description: string;
  requiredSkills: string[];
}

// ============================================================================
// BASE AGENT CLASS
// ============================================================================

export abstract class BaseAgent extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly category: AgentCategory;
  readonly description: string;
  readonly icon: string;
  readonly skills: string[];

  protected llm: LLMClient;
  protected systemPrompt: string;
  protected conversationHistory: Map<string, Message[]> = new Map();
  protected maxContextMessages: number;
  protected temperature: number;

  private _status: AgentStatus = 'idle';
  private _currentTask: Task | null = null;
  private _completedTasks: number = 0;
  private _createdAt: Date;

  constructor(config: BaseAgentConfig) {
    super();

    this.id = config.id || `agent-${uuid()}`;
    this.name = config.name;
    this.category = config.category;
    this.description = config.description;
    this.icon = config.icon;
    this.skills = config.skills;
    this.llm = config.llm;
    this.systemPrompt = config.systemPrompt;
    this.maxContextMessages = config.maxContextMessages || 20;
    this.temperature = config.temperature || 0.7;
    this._createdAt = new Date();
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  get status(): AgentStatus {
    return this._status;
  }

  get currentTask(): Task | null {
    return this._currentTask;
  }

  get completedTasks(): number {
    return this._completedTasks;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  // ============================================================================
  // STATUS MANAGEMENT
  // ============================================================================

  protected setStatus(status: AgentStatus): void {
    const previousStatus = this._status;
    this._status = status;
    this.emit('status-changed', {
      agentId: this.id,
      previousStatus,
      newStatus: status,
      timestamp: new Date()
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    this.setStatus('idle');
    this.emit('initialized', { agentId: this.id, name: this.name });
  }

  // ============================================================================
  // TASK EXECUTION - Standard
  // ============================================================================

  async execute(task: Task, context?: AgentExecutionContext): Promise<TaskResult> {
    if (this._status === 'working') {
      return {
        success: false,
        error: `Agent ${this.name} is currently busy with another task`
      };
    }

    this._currentTask = task;
    this.setStatus('working');
    this.emit('task-started', {
      agentId: this.id,
      taskId: task.id,
      taskTitle: task.title,
      timestamp: new Date()
    });

    try {
      // Build message context
      const messages = this.buildMessages(task, context);

      // Execute the LLM call
      const response = await this.llm.chat(messages);

      // Process the response (can be overridden by subclasses)
      const processedResponse = await this.processResponse(response, task);

      // Store in conversation history
      this.storeInHistory(task.description, response, context?.sessionId);

      // Update stats
      this._completedTasks++;
      this._currentTask = null;
      this.setStatus('idle');

      this.emit('task-completed', {
        agentId: this.id,
        taskId: task.id,
        success: true,
        timestamp: new Date()
      });

      return {
        success: true,
        data: { response: processedResponse },
        recommendation: {
          summary: this.extractSummary(processedResponse),
          details: processedResponse,
          confidence: this.calculateConfidence(processedResponse),
          sources: this.extractSources(processedResponse),
          alternatives: []
        }
      };
    } catch (error) {
      this._currentTask = null;
      this.setStatus('error');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      this.emit('task-failed', {
        agentId: this.id,
        taskId: task.id,
        error: errorMessage,
        timestamp: new Date()
      });

      // Auto-recover to idle after error
      setTimeout(() => {
        if (this._status === 'error') {
          this.setStatus('idle');
        }
      }, 5000);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // ============================================================================
  // TASK EXECUTION - Streaming
  // ============================================================================

  async executeStream(
    task: Task,
    callbacks: StreamCallbacks,
    context?: AgentExecutionContext
  ): Promise<TaskResult> {
    if (this._status === 'working') {
      const error = new Error(`Agent ${this.name} is currently busy with another task`);
      callbacks.onError?.(error);
      return { success: false, error: error.message };
    }

    this._currentTask = task;
    this.setStatus('working');

    this.emit('task-started', {
      agentId: this.id,
      taskId: task.id,
      streaming: true,
      timestamp: new Date()
    });

    callbacks.onStart?.();

    try {
      const messages = this.buildMessages(task, context);

      let fullResponse = '';

      // Stream the response
      fullResponse = await this.llm.stream(messages, (chunk: string) => {
        callbacks.onChunk?.(chunk);
        this.emit('stream-chunk', {
          agentId: this.id,
          taskId: task.id,
          chunk
        });
      });

      // Process the complete response
      const processedResponse = await this.processResponse(fullResponse, task);

      // Store in history
      this.storeInHistory(task.description, processedResponse, context?.sessionId);

      // Update stats
      this._completedTasks++;
      this._currentTask = null;
      this.setStatus('idle');

      callbacks.onComplete?.(processedResponse);

      this.emit('task-completed', {
        agentId: this.id,
        taskId: task.id,
        success: true,
        streaming: true,
        timestamp: new Date()
      });

      return {
        success: true,
        data: { response: processedResponse },
        recommendation: {
          summary: this.extractSummary(processedResponse),
          details: processedResponse,
          confidence: this.calculateConfidence(processedResponse),
          sources: this.extractSources(processedResponse),
          alternatives: []
        }
      };
    } catch (error) {
      this._currentTask = null;
      this.setStatus('error');

      const err = error instanceof Error ? error : new Error('Unknown error');
      callbacks.onError?.(err);

      this.emit('task-failed', {
        agentId: this.id,
        taskId: task.id,
        error: err.message,
        timestamp: new Date()
      });

      setTimeout(() => {
        if (this._status === 'error') {
          this.setStatus('idle');
        }
      }, 5000);

      return {
        success: false,
        error: err.message
      };
    }
  }

  // ============================================================================
  // MESSAGE BUILDING
  // ============================================================================

  protected buildMessages(task: Task, context?: AgentExecutionContext): LLMMessage[] {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(task, context) }
    ];

    // Add conversation history if available
    const sessionId = context?.sessionId || 'default';
    const history = this.conversationHistory.get(sessionId) || [];

    // Take last N messages from history
    const recentHistory = history.slice(-this.maxContextMessages);

    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Add the current task as user message
    messages.push({
      role: 'user',
      content: this.buildUserMessage(task)
    });

    return messages;
  }

  protected buildSystemPrompt(task: Task, context?: AgentExecutionContext): string {
    const basePrompt = this.systemPrompt;

    // Add context-specific instructions
    const contextInstructions = this.getContextInstructions(context);

    // Add task-specific instructions
    const taskInstructions = this.getTaskInstructions(task);

    return `${basePrompt}

${contextInstructions}

${taskInstructions}

Current Task Priority: ${task.priority}
Task Category: ${task.category}`;
  }

  protected buildUserMessage(task: Task): string {
    let message = task.description;

    // Add task input data if present
    if (task.input && Object.keys(task.input).length > 0) {
      const inputStr = JSON.stringify(task.input, null, 2);
      message += `\n\nAdditional Context:\n${inputStr}`;
    }

    return message;
  }

  // ============================================================================
  // RESPONSE PROCESSING - Override in subclasses for custom behavior
  // ============================================================================

  protected async processResponse(response: string, task: Task): Promise<string> {
    // Default implementation - subclasses can override for custom processing
    return response;
  }

  protected extractSummary(response: string): string {
    // Extract first paragraph or first 200 characters as summary
    const firstParagraph = response.split('\n\n')[0];
    return firstParagraph.length > 200
      ? firstParagraph.substring(0, 200) + '...'
      : firstParagraph;
  }

  protected calculateConfidence(response: string): number {
    // Base confidence calculation - subclasses can override
    // Higher confidence for longer, more detailed responses
    const length = response.length;
    const hasStructure = response.includes('\n') || response.includes('-') || response.includes('1.');

    let confidence = 0.7; // Base confidence

    if (length > 500) confidence += 0.1;
    if (length > 1000) confidence += 0.05;
    if (hasStructure) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  protected extractSources(response: string): string[] {
    // Extract URLs or references from the response
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = response.match(urlRegex) || [];
    return Array.from(new Set(urls)); // Remove duplicates
  }

  // ============================================================================
  // CONTEXT INSTRUCTIONS - Override in subclasses
  // ============================================================================

  protected getContextInstructions(context?: AgentExecutionContext): string {
    if (!context) return '';

    return `Session: ${context.sessionId}
User: ${context.userId}`;
  }

  protected getTaskInstructions(task: Task): string {
    return `Task: ${task.title}`;
  }

  // ============================================================================
  // CONVERSATION HISTORY
  // ============================================================================

  protected storeInHistory(userMessage: string, assistantResponse: string, sessionId?: string): void {
    const sid = sessionId || 'default';

    if (!this.conversationHistory.has(sid)) {
      this.conversationHistory.set(sid, []);
    }

    const history = this.conversationHistory.get(sid)!;

    history.push({
      id: `msg-${uuid()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    history.push({
      id: `msg-${uuid()}`,
      role: 'assistant',
      content: assistantResponse,
      agentId: this.id,
      agentName: this.name,
      timestamp: new Date()
    });

    // Trim history if too long
    if (history.length > this.maxContextMessages * 2) {
      history.splice(0, history.length - this.maxContextMessages * 2);
    }
  }

  getConversationHistory(sessionId: string): Message[] {
    return this.conversationHistory.get(sessionId) || [];
  }

  clearConversationHistory(sessionId?: string): void {
    if (sessionId) {
      this.conversationHistory.delete(sessionId);
    } else {
      this.conversationHistory.clear();
    }
  }

  // ============================================================================
  // CAPABILITY CHECKING
  // ============================================================================

  canHandle(task: Task): boolean {
    // Check if this agent's skills match any required capabilities
    if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) {
      // If no specific capabilities required, check category match
      return task.category === this.category;
    }

    return task.requiredCapabilities.some(cap =>
      this.skills.some(skill =>
        skill.toLowerCase().includes(cap.toLowerCase()) ||
        cap.toLowerCase().includes(skill.toLowerCase())
      )
    );
  }

  getCapabilities(): AgentCapability[] {
    return this.skills.map(skill => ({
      name: skill,
      description: `Handles ${skill} related tasks`,
      requiredSkills: [skill]
    }));
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      description: this.description,
      icon: this.icon,
      skills: this.skills,
      status: this._status,
      completedTasks: this._completedTasks,
      currentTask: this._currentTask?.id || null,
      createdAt: this._createdAt.toISOString()
    };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async shutdown(): Promise<void> {
    this.setStatus('idle');
    this.conversationHistory.clear();
    this.removeAllListeners();
    this.emit('shutdown', { agentId: this.id });
  }
}

// ============================================================================
// HELPER TYPES FOR AGENT IMPLEMENTATIONS
// ============================================================================

export type AgentFactory<T extends BaseAgent> = (llm: LLMClient) => T;

export interface AgentMetadata {
  name: string;
  category: AgentCategory;
  description: string;
  icon: string;
  skills: string[];
}

// ============================================================================
// EXPORT
// ============================================================================

export default BaseAgent;
