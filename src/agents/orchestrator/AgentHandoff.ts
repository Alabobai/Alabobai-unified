/**
 * Alabobai Agent Handoff
 * Manages seamless context transfer between agents during task execution
 * Ensures continuity and preserves conversation state across agent boundaries
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { Agent, Task, Message, ConversationContext } from '../../core/types.js';
import { LLMClient } from '../../core/llm-client.js';
import { MemoryStore } from '../../core/memory.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HandoffContext {
  id: string;
  sourceAgentId: string;
  sourceAgentName: string;
  targetAgentId: string;
  targetAgentName: string;
  taskId: string;
  reason: HandoffReason;
  contextSummary: string;
  relevantHistory: Message[];
  sharedMemory: Record<string, unknown>;
  userPreferences: Record<string, unknown>;
  pendingActions: PendingAction[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  completedAt: Date | null;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export type HandoffReason =
  | 'capability-mismatch'      // Source agent lacks required skill
  | 'task-completion'          // Source completed their part
  | 'collaboration-request'    // Explicit request to involve another agent
  | 'escalation'              // Issue requires different expertise
  | 'load-balancing'          // Source is overloaded
  | 'user-request'            // User explicitly asked for different agent
  | 'error-recovery';         // Source encountered unrecoverable error

export interface PendingAction {
  type: string;
  description: string;
  data: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high';
}

export interface HandoffResult {
  success: boolean;
  handoffId: string;
  targetAgentReady: boolean;
  contextTransferred: boolean;
  error?: string;
  warnings: string[];
}

export interface HandoffRequest {
  sourceAgent: Agent;
  targetAgentName: string;
  task: Task;
  reason: HandoffReason;
  contextData?: Record<string, unknown>;
  urgency?: 'low' | 'normal' | 'high' | 'critical';
}

// ============================================================================
// AGENT HANDOFF MANAGER CLASS
// ============================================================================

export class AgentHandoff extends EventEmitter {
  private llm: LLMClient;
  private memory: MemoryStore;
  private activeHandoffs: Map<string, HandoffContext> = new Map();
  private handoffHistory: HandoffContext[] = [];
  private maxHistorySize: number = 100;

  constructor(llm: LLMClient, memory: MemoryStore) {
    super();
    this.llm = llm;
    this.memory = memory;
  }

  /**
   * Initiates a handoff from one agent to another
   */
  async initiateHandoff(
    request: HandoffRequest,
    conversationContext: ConversationContext,
    targetAgent: Agent
  ): Promise<HandoffResult> {
    const handoffId = uuid();
    const warnings: string[] = [];

    try {
      // Step 1: Validate handoff request
      const validation = this.validateHandoffRequest(request, targetAgent);
      if (!validation.valid) {
        return {
          success: false,
          handoffId,
          targetAgentReady: false,
          contextTransferred: false,
          error: validation.error,
          warnings: [],
        };
      }

      // Step 2: Generate context summary
      const contextSummary = await this.generateContextSummary(
        request,
        conversationContext
      );

      // Step 3: Extract relevant history
      const relevantHistory = this.extractRelevantHistory(
        conversationContext,
        request.task
      );

      // Step 4: Gather shared memory
      const sharedMemory = await this.gatherSharedMemory(
        request.sourceAgent,
        request.task,
        conversationContext
      );

      // Step 5: Get user preferences relevant to target agent
      const userPreferences = this.memory.getUserPreferences(conversationContext.userId);

      // Step 6: Identify pending actions
      const pendingActions = this.identifyPendingActions(request.task);

      // Step 7: Create handoff context
      const handoffContext: HandoffContext = {
        id: handoffId,
        sourceAgentId: request.sourceAgent.id,
        sourceAgentName: request.sourceAgent.name,
        targetAgentId: targetAgent.id,
        targetAgentName: targetAgent.name,
        taskId: request.task.id,
        reason: request.reason,
        contextSummary,
        relevantHistory,
        sharedMemory,
        userPreferences,
        pendingActions,
        metadata: {
          urgency: request.urgency || 'normal',
          originalRequest: request.task.description,
          ...request.contextData,
        },
        createdAt: new Date(),
        completedAt: null,
        status: 'pending',
      };

      this.activeHandoffs.set(handoffId, handoffContext);

      // Step 8: Notify target agent
      this.emit('handoff-initiated', {
        handoffId,
        sourceAgent: request.sourceAgent.name,
        targetAgent: targetAgent.name,
        reason: request.reason,
      });

      // Step 9: Transfer context to target agent
      const transferResult = await this.transferContext(handoffContext, targetAgent);

      if (!transferResult.success) {
        warnings.push(`Context transfer warning: ${transferResult.message}`);
      }

      // Update handoff status
      handoffContext.status = 'in-progress';

      return {
        success: true,
        handoffId,
        targetAgentReady: targetAgent.status === 'idle',
        contextTransferred: transferResult.success,
        warnings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown handoff error';

      this.emit('handoff-failed', { handoffId, error: errorMessage });

      return {
        success: false,
        handoffId,
        targetAgentReady: false,
        contextTransferred: false,
        error: errorMessage,
        warnings,
      };
    }
  }

  /**
   * Completes a handoff after target agent finishes
   */
  async completeHandoff(
    handoffId: string,
    result: { success: boolean; output?: Record<string, unknown>; error?: string }
  ): Promise<void> {
    const handoff = this.activeHandoffs.get(handoffId);
    if (!handoff) {
      console.warn(`[AgentHandoff] Handoff not found: ${handoffId}`);
      return;
    }

    handoff.status = result.success ? 'completed' : 'failed';
    handoff.completedAt = new Date();
    handoff.metadata.result = result;

    // Move to history
    this.activeHandoffs.delete(handoffId);
    this.handoffHistory.push(handoff);

    // Trim history if needed
    while (this.handoffHistory.length > this.maxHistorySize) {
      this.handoffHistory.shift();
    }

    this.emit('handoff-completed', {
      handoffId,
      success: result.success,
      sourceAgent: handoff.sourceAgentName,
      targetAgent: handoff.targetAgentName,
    });
  }

  /**
   * Generates a concise context summary for the receiving agent
   */
  private async generateContextSummary(
    request: HandoffRequest,
    context: ConversationContext
  ): Promise<string> {
    const recentMessages = context.messages.slice(-10);
    const messageText = recentMessages
      .map(m => `${m.agentName || m.role}: ${m.content.substring(0, 200)}`)
      .join('\n');

    const prompt = `Summarize this conversation context for a handoff to another AI agent.
Focus on:
1. What the user originally wanted
2. What has been done so far
3. What still needs to be done
4. Any important constraints or preferences

Task: ${request.task.description}
Handoff Reason: ${request.reason}

Recent conversation:
${messageText}

Provide a concise summary (2-4 sentences):`;

    try {
      const summary = await this.llm.chat([
        { role: 'system', content: 'You are a context summarizer. Be concise and actionable.' },
        { role: 'user', content: prompt },
      ]);
      return summary;
    } catch (error) {
      // Fallback to simple summary
      return `User requested: "${request.task.description}". Handoff reason: ${request.reason}. ${recentMessages.length} messages in conversation.`;
    }
  }

  /**
   * Extracts messages relevant to the current task
   */
  private extractRelevantHistory(
    context: ConversationContext,
    task: Task
  ): Message[] {
    // Get messages from this task and related parent/child tasks
    const relevantTaskIds = new Set([task.id, task.parentTask, ...task.subtasks].filter(Boolean));

    const relevantMessages = context.messages.filter(m => {
      // Include if directly related to task
      if (m.taskId && relevantTaskIds.has(m.taskId)) return true;

      // Include recent messages (last 5)
      const messageIndex = context.messages.indexOf(m);
      if (messageIndex >= context.messages.length - 5) return true;

      return false;
    });

    // Limit to last 20 messages
    return relevantMessages.slice(-20);
  }

  /**
   * Gathers memory items relevant to the handoff
   */
  private async gatherSharedMemory(
    sourceAgent: Agent,
    task: Task,
    context: ConversationContext
  ): Promise<Record<string, unknown>> {
    const sharedMemory: Record<string, unknown> = {};

    // Get task-related memory
    const taskMemory = this.memory.get(`task:${task.id}`);
    if (taskMemory) {
      sharedMemory.taskData = taskMemory;
    }

    // Get agent-specific findings
    const agentFindings = this.memory.get(`agent:${sourceAgent.id}:findings`);
    if (agentFindings) {
      sharedMemory.previousFindings = agentFindings;
    }

    // Get relevant context memory
    for (const [key, value] of context.memory) {
      if (key.includes(task.id) || key.includes('shared')) {
        sharedMemory[key] = value;
      }
    }

    return sharedMemory;
  }

  /**
   * Identifies actions that need to be continued by target agent
   */
  private identifyPendingActions(task: Task): PendingAction[] {
    const actions: PendingAction[] = [];

    // Check for incomplete subtasks
    if (task.subtasks.length > 0) {
      actions.push({
        type: 'continue-subtasks',
        description: `${task.subtasks.length} subtasks pending completion`,
        data: { subtaskIds: task.subtasks },
        priority: 'high',
      });
    }

    // Check for pending approvals
    if (task.status === 'waiting-approval') {
      actions.push({
        type: 'await-approval',
        description: task.approvalReason || 'Action requires user approval',
        data: { taskId: task.id },
        priority: 'high',
      });
    }

    // Check for required follow-ups in task output
    if (task.output && typeof task.output === 'object') {
      const output = task.output as Record<string, unknown>;
      if (output.followUpRequired) {
        actions.push({
          type: 'follow-up',
          description: output.followUpDescription as string || 'Follow-up action needed',
          data: output.followUpData as Record<string, unknown> || {},
          priority: 'normal',
        });
      }
    }

    return actions;
  }

  /**
   * Validates a handoff request
   */
  private validateHandoffRequest(
    request: HandoffRequest,
    targetAgent: Agent
  ): { valid: boolean; error?: string } {
    // Check source agent exists and is valid
    if (!request.sourceAgent) {
      return { valid: false, error: 'Source agent not specified' };
    }

    // Check target agent is available
    if (targetAgent.status === 'error') {
      return { valid: false, error: `Target agent ${targetAgent.name} is in error state` };
    }

    // Prevent self-handoff
    if (request.sourceAgent.id === targetAgent.id) {
      return { valid: false, error: 'Cannot handoff to same agent' };
    }

    // Check task exists
    if (!request.task) {
      return { valid: false, error: 'Task not specified' };
    }

    return { valid: true };
  }

  /**
   * Transfers context to target agent
   */
  private async transferContext(
    handoff: HandoffContext,
    targetAgent: Agent
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Store handoff context in memory for target agent
      this.memory.set(`handoff:${handoff.id}`, {
        summary: handoff.contextSummary,
        sharedMemory: handoff.sharedMemory,
        pendingActions: handoff.pendingActions,
        sourceAgent: handoff.sourceAgentName,
      });

      // Create briefing message for target agent
      const briefing = this.createAgentBriefing(handoff);

      this.emit('context-transferred', {
        handoffId: handoff.id,
        targetAgentId: targetAgent.id,
        briefingLength: briefing.length,
      });

      return { success: true, message: 'Context transferred successfully' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Context transfer failed',
      };
    }
  }

  /**
   * Creates a briefing message for the target agent
   */
  private createAgentBriefing(handoff: HandoffContext): string {
    const sections = [
      `## Handoff from ${handoff.sourceAgentName}`,
      '',
      `**Reason:** ${this.formatHandoffReason(handoff.reason)}`,
      '',
      '### Context Summary',
      handoff.contextSummary,
      '',
    ];

    if (handoff.pendingActions.length > 0) {
      sections.push('### Pending Actions');
      for (const action of handoff.pendingActions) {
        sections.push(`- [${action.priority.toUpperCase()}] ${action.description}`);
      }
      sections.push('');
    }

    if (Object.keys(handoff.userPreferences).length > 0) {
      sections.push('### User Preferences');
      for (const [key, value] of Object.entries(handoff.userPreferences)) {
        sections.push(`- ${key}: ${JSON.stringify(value)}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Formats handoff reason for display
   */
  private formatHandoffReason(reason: HandoffReason): string {
    const reasonMap: Record<HandoffReason, string> = {
      'capability-mismatch': 'Required capabilities not available',
      'task-completion': 'Previous phase completed',
      'collaboration-request': 'Collaboration needed',
      'escalation': 'Escalated for specialized expertise',
      'load-balancing': 'Redistributing workload',
      'user-request': 'User requested different agent',
      'error-recovery': 'Recovering from previous error',
    };
    return reasonMap[reason] || reason;
  }

  /**
   * Gets handoff context by ID
   */
  getHandoff(handoffId: string): HandoffContext | undefined {
    return this.activeHandoffs.get(handoffId);
  }

  /**
   * Gets all active handoffs
   */
  getActiveHandoffs(): HandoffContext[] {
    return Array.from(this.activeHandoffs.values());
  }

  /**
   * Gets handoff history
   */
  getHandoffHistory(limit: number = 50): HandoffContext[] {
    return this.handoffHistory.slice(-limit);
  }

  /**
   * Cancels an active handoff
   */
  cancelHandoff(handoffId: string, reason: string): boolean {
    const handoff = this.activeHandoffs.get(handoffId);
    if (!handoff) return false;

    handoff.status = 'failed';
    handoff.completedAt = new Date();
    handoff.metadata.cancellationReason = reason;

    this.activeHandoffs.delete(handoffId);
    this.handoffHistory.push(handoff);

    this.emit('handoff-cancelled', { handoffId, reason });
    return true;
  }

  /**
   * Gets statistics about handoffs
   */
  getHandoffStats(): Record<string, unknown> {
    const completed = this.handoffHistory.filter(h => h.status === 'completed');
    const failed = this.handoffHistory.filter(h => h.status === 'failed');

    const reasonCounts: Record<string, number> = {};
    for (const handoff of this.handoffHistory) {
      reasonCounts[handoff.reason] = (reasonCounts[handoff.reason] || 0) + 1;
    }

    return {
      totalHandoffs: this.handoffHistory.length,
      activeHandoffs: this.activeHandoffs.size,
      successRate: completed.length > 0
        ? ((completed.length / (completed.length + failed.length)) * 100).toFixed(1) + '%'
        : 'N/A',
      reasonDistribution: reasonCounts,
      averageDuration: this.calculateAverageHandoffDuration(),
    };
  }

  /**
   * Calculates average handoff duration
   */
  private calculateAverageHandoffDuration(): string {
    const completedWithDuration = this.handoffHistory.filter(
      h => h.completedAt && h.createdAt
    );

    if (completedWithDuration.length === 0) return 'N/A';

    const totalMs = completedWithDuration.reduce((sum, h) => {
      return sum + (h.completedAt!.getTime() - h.createdAt.getTime());
    }, 0);

    const avgMs = totalMs / completedWithDuration.length;
    return `${Math.round(avgMs / 1000)}s`;
  }
}

/**
 * Factory function to create an AgentHandoff manager
 */
export function createAgentHandoff(llm: LLMClient, memory: MemoryStore): AgentHandoff {
  return new AgentHandoff(llm, memory);
}

export default AgentHandoff;
