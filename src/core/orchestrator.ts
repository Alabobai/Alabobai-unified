/**
 * Alabobai Orchestrator
 * The "Brain" that routes requests to appropriate agents
 * Implements the "President with Cabinet" pattern
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import {
  Agent,
  AgentCategory,
  Task,
  TaskStatus,
  TaskPriority,
  Message,
  Intent,
  ConversationContext,
  ApprovalRequest,
  ApprovalAction,
} from './types.js';
import { agentRegistry, AgentResult } from './agent-registry.js';
import { LLMClient } from './llm-client.js';
import { MemoryStore } from './memory.js';

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

export class Orchestrator extends EventEmitter {
  private llm: LLMClient;
  private memory: MemoryStore;
  private contexts: Map<string, ConversationContext> = new Map();
  private tasks: Map<string, Task> = new Map();
  private approvals: Map<string, ApprovalRequest> = new Map();
  private activeAgents: Map<string, Agent> = new Map();

  constructor(llm: LLMClient, memory: MemoryStore) {
    super();
    this.llm = llm;
    this.memory = memory;

    // Initialize default agents
    this.initializeAgents();
  }

  private initializeAgents(): void {
    // Spawn one of each agent type
    const agentTypes = [
      'WealthLabobai',
      'CreditLabobai',
      'LegalLabobai',
      'BusinessLabobai',
      'HealthLabobai',
      'GuardianLabobai',
      'ComputerLabobai',
      'BuilderLabobai',
      'ResearchLabobai',
    ];

    for (const type of agentTypes) {
      const agent = agentRegistry.spawn(type);
      this.activeAgents.set(agent.id, agent);
    }

    console.log(`[Orchestrator] Initialized ${this.activeAgents.size} agents`);
  }

  // ============================================================================
  // MAIN ENTRY POINT - Process user message
  // ============================================================================

  async processMessage(
    sessionId: string,
    userId: string,
    content: string,
    attachments?: Array<{ type: string; data: string }>
  ): Promise<Message> {
    // Get or create conversation context
    let context = this.contexts.get(sessionId);
    if (!context) {
      context = this.createContext(sessionId, userId);
    }

    // Create user message
    const userMessage: Message = {
      id: uuid(),
      role: 'user',
      content,
      attachments: attachments as any,
      timestamp: new Date(),
    };
    context.messages.push(userMessage);
    context.lastActivityAt = new Date();

    // Step 1: Analyze intent
    const intent = await this.analyzeIntent(content, context);
    console.log(`[Orchestrator] Intent: ${intent.category}/${intent.action} (${(intent.confidence * 100).toFixed(0)}%)`);

    // Step 2: Route to appropriate agent(s)
    const response = await this.routeToAgent(intent, content, context);

    // Step 3: Create assistant message
    const assistantMessage: Message = {
      id: uuid(),
      role: 'assistant',
      content: response.message || '',
      agentId: response.agentId,
      agentName: response.agentName,
      taskId: response.taskId,
      timestamp: new Date(),
    };
    context.messages.push(assistantMessage);

    // Emit events
    this.emit('message-processed', { sessionId, userMessage, assistantMessage });

    return assistantMessage;
  }

  // ============================================================================
  // INTENT ANALYSIS
  // ============================================================================

  private async analyzeIntent(content: string, context: ConversationContext): Promise<Intent> {
    const systemPrompt = `You are an intent classifier for an AI assistant platform.
Analyze the user's message and determine:
1. What category of agent should handle this (advisory, computer-control, builder, research)
2. What specific action they want
3. Whether this requires user approval before execution

Categories:
- advisory: Questions, advice requests, analysis (wealth, credit, legal, business, health)
- computer-control: Actions on their computer (click, type, fill forms, navigate, automate)
- builder: Creating apps, websites, code, documents
- research: Searching the web, analyzing documents, gathering information

Respond in JSON format:
{
  "category": "advisory|computer-control|builder|research",
  "action": "brief description of action",
  "confidence": 0.0-1.0,
  "entities": { extracted entities },
  "requiresApproval": true/false,
  "subCategory": "wealth|credit|legal|business|health|screen|browser|webapp|website|search|etc"
}`;

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Recent context: ${this.getRecentContext(context)}\n\nCurrent message: ${content}` },
    ]);

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category: parsed.category || 'advisory',
          action: parsed.action || 'general',
          confidence: parsed.confidence || 0.8,
          entities: parsed.entities || {},
          requiresApproval: parsed.requiresApproval || false,
        };
      }
    } catch (e) {
      console.error('[Orchestrator] Failed to parse intent:', e);
    }

    // Default fallback
    return {
      category: 'advisory',
      action: 'general-query',
      confidence: 0.5,
      entities: {},
      requiresApproval: false,
    };
  }

  // ============================================================================
  // AGENT ROUTING
  // ============================================================================

  private async routeToAgent(
    intent: Intent,
    content: string,
    context: ConversationContext
  ): Promise<{ message: string; agentId?: string; agentName?: string; taskId?: string }> {
    // Find appropriate agent
    const agent = this.findBestAgent(intent);
    if (!agent) {
      return {
        message: "I apologize, but I couldn't find an appropriate agent to handle your request. Could you please rephrase or provide more details?",
      };
    }

    // Create task
    const task = this.createTask(intent, content, agent);

    // Check if approval is needed
    if (intent.requiresApproval) {
      const approval = await this.requestApproval(task, agent);
      if (approval) {
        // Wait for approval
        return {
          message: `I understand you want me to ${intent.action}. Before I proceed, I need your approval.\n\n${approval.description}\n\nPlease confirm by saying "approve" or "yes" to continue, or "deny" to cancel.`,
          agentId: agent.id,
          agentName: agent.name,
          taskId: task.id,
        };
      }
    }

    // Execute task
    const result = await this.executeTask(task, agent);

    return {
      message: result.message || 'Task completed.',
      agentId: agent.id,
      agentName: agent.name,
      taskId: task.id,
    };
  }

  private findBestAgent(intent: Intent): Agent | undefined {
    const agents = Array.from(this.activeAgents.values());

    // Filter by category
    const categoryAgents = agents.filter(a => a.category === intent.category);
    if (categoryAgents.length === 0) {
      // Fallback to any idle agent
      return agents.find(a => a.status === 'idle');
    }

    // Prefer idle agents
    const idleAgents = categoryAgents.filter(a => a.status === 'idle');
    if (idleAgents.length > 0) {
      return idleAgents[0];
    }

    // Return first matching category agent even if busy
    return categoryAgents[0];
  }

  private createTask(intent: Intent, content: string, agent: Agent): Task {
    const task: Task = {
      id: uuid(),
      title: intent.action,
      description: content,
      category: intent.category,
      priority: 'normal',
      status: 'pending',
      assignedAgent: agent.id,
      collaborators: [],
      parentTask: null,
      subtasks: [],
      input: { content, intent },
      output: null,
      requiresApproval: intent.requiresApproval,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  // ============================================================================
  // TASK EXECUTION
  // ============================================================================

  private async executeTask(task: Task, agent: Agent): Promise<AgentResult> {
    task.status = 'in-progress';
    task.startedAt = new Date();

    this.emit('task-started', { taskId: task.id, agentId: agent.id });

    try {
      const result = await agentRegistry.assignTask(agent.id, task, {
        llm: this.llm,
        memory: this.memory,
        emit: (event, data) => this.emit(event, data),
        requestApproval: (action, details) => this.handleApprovalRequest(task, agent, action, details),
        collaborate: (agentName, subtask) => this.handleCollaboration(task, agentName, subtask),
      });

      task.status = result.success ? 'completed' : 'failed';
      task.output = result.output;
      task.completedAt = new Date();

      if (!result.success) {
        task.error = result.error;
      }

      this.emit('task-completed', { taskId: task.id, result });
      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.completedAt = new Date();

      this.emit('task-failed', { taskId: task.id, error: task.error });
      return {
        success: false,
        output: {},
        error: task.error,
      };
    }
  }

  // ============================================================================
  // APPROVAL SYSTEM (President with Cabinet)
  // ============================================================================

  private async requestApproval(task: Task, agent: Agent): Promise<ApprovalRequest | null> {
    const approval: ApprovalRequest = {
      id: uuid(),
      taskId: task.id,
      agentId: agent.id,
      action: 'execute-code', // Will be more specific based on task
      description: `${agent.name} wants to: ${task.description}`,
      details: task.input,
      riskLevel: this.assessRisk(task),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minute expiry
      status: 'pending',
    };

    this.approvals.set(approval.id, approval);
    task.status = 'waiting-approval';

    this.emit('approval-requested', { approvalId: approval.id, task, agent });
    return approval;
  }

  private async handleApprovalRequest(
    task: Task,
    agent: Agent,
    action: string,
    details: Record<string, unknown>
  ): Promise<boolean> {
    const approval: ApprovalRequest = {
      id: uuid(),
      taskId: task.id,
      agentId: agent.id,
      action: action as ApprovalAction,
      description: `${agent.name} requests permission to ${action}`,
      details,
      riskLevel: 'medium',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      status: 'pending',
    };

    this.approvals.set(approval.id, approval);
    this.emit('approval-requested', { approvalId: approval.id });

    // For now, return pending - in real impl would wait for user response
    return false;
  }

  // Process approval response from user
  async processApproval(approvalId: string, approved: boolean, reason?: string): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    approval.status = approved ? 'approved' : 'rejected';
    approval.approvedAt = new Date();
    if (!approved && reason) {
      approval.rejectionReason = reason;
    }

    const task = this.tasks.get(approval.taskId);
    if (task) {
      if (approved) {
        task.status = 'approved';
        // Re-execute the task
        const agent = this.activeAgents.get(approval.agentId);
        if (agent) {
          await this.executeTask(task, agent);
        }
      } else {
        task.status = 'rejected';
      }
    }

    this.emit('approval-resolved', { approvalId, approved });
  }

  private assessRisk(task: Task): 'low' | 'medium' | 'high' | 'critical' {
    const content = task.description.toLowerCase();

    // Critical risk actions
    if (content.includes('delete') || content.includes('payment') || content.includes('transfer')) {
      return 'critical';
    }

    // High risk actions
    if (content.includes('send') || content.includes('post') || content.includes('deploy')) {
      return 'high';
    }

    // Medium risk for computer control
    if (task.category === 'computer-control') {
      return 'medium';
    }

    return 'low';
  }

  // ============================================================================
  // COLLABORATION BETWEEN AGENTS
  // ============================================================================

  private async handleCollaboration(
    parentTask: Task,
    agentName: string,
    subtaskData: Partial<Task>
  ): Promise<unknown> {
    // Find the requested collaborator agent
    const collaborator = Array.from(this.activeAgents.values()).find(
      a => a.name === agentName && a.status === 'idle'
    );

    if (!collaborator) {
      console.log(`[Orchestrator] Collaborator ${agentName} not available`);
      return null;
    }

    // Create subtask
    const subtask: Task = {
      id: uuid(),
      title: subtaskData.title || `Subtask for ${parentTask.title}`,
      description: subtaskData.description || '',
      category: collaborator.category,
      priority: parentTask.priority,
      status: 'pending',
      assignedAgent: collaborator.id,
      collaborators: [],
      parentTask: parentTask.id,
      subtasks: [],
      input: subtaskData.input || {},
      output: null,
      requiresApproval: false,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    parentTask.subtasks.push(subtask.id);
    parentTask.collaborators.push(collaborator.id);
    this.tasks.set(subtask.id, subtask);

    const result = await this.executeTask(subtask, collaborator);
    return result.output;
  }

  // ============================================================================
  // CONTEXT MANAGEMENT
  // ============================================================================

  private createContext(sessionId: string, userId: string): ConversationContext {
    const context: ConversationContext = {
      sessionId,
      userId,
      messages: [],
      activeAgents: Array.from(this.activeAgents.keys()),
      pendingApprovals: [],
      memory: new Map(),
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.contexts.set(sessionId, context);
    return context;
  }

  private getRecentContext(context: ConversationContext, limit: number = 5): string {
    return context.messages
      .slice(-limit)
      .map(m => `${m.role}: ${m.content.substring(0, 200)}`)
      .join('\n');
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  getAgents(): Agent[] {
    return Array.from(this.activeAgents.values());
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter(a => a.status === 'pending');
  }

  getContext(sessionId: string): ConversationContext | undefined {
    return this.contexts.get(sessionId);
  }
}

// Export singleton factory
let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(llm: LLMClient, memory: MemoryStore): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator(llm, memory);
  }
  return orchestratorInstance;
}

export async function createOrchestrator(config: {
  llm: LLMClient;
  memory: MemoryStore;
}): Promise<Orchestrator> {
  const orchestrator = new Orchestrator(config.llm, config.memory);
  return orchestrator;
}
