/**
 * Alabobai Orchestrator Service
 * Routes commands to appropriate department agents
 * Implements the "President with Cabinet" pattern for AI agent coordination
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { LLMService, ChatMessage, createLLMService, getDefaultLLMService } from './llm.js';
import type { AgentCategory, Task, TaskPriority, TaskStatus, Message } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Department {
  id: string;
  name: string;
  category: AgentCategory;
  description: string;
  skills: string[];
  icon: string;
  systemPrompt: string;
}

export interface CommandIntent {
  primaryDepartment: string;
  secondaryDepartments: string[];
  action: string;
  confidence: number;
  entities: Record<string, unknown>;
  requiresApproval: boolean;
  priority: TaskPriority;
  reasoning: string;
}

export interface CommandResult {
  success: boolean;
  response: string;
  departmentId: string;
  departmentName: string;
  taskId: string;
  executionTimeMs: number;
  tokensUsed?: number;
  collaborators?: string[];
  error?: string;
}

export interface StreamingCommandResult {
  taskId: string;
  departmentId: string;
  departmentName: string;
}

export interface OrchestratorConfig {
  llm?: LLMService;
  enableIntentAnalysis?: boolean;
  maxCollaborators?: number;
  defaultPriority?: TaskPriority;
}

export interface ConversationSession {
  id: string;
  userId: string;
  messages: Message[];
  activeDepartment: string | null;
  createdAt: Date;
  lastActivityAt: Date;
}

// ============================================================================
// DEPARTMENT DEFINITIONS
// ============================================================================

const DEPARTMENTS: Record<string, Department> = {
  executive: {
    id: 'executive',
    name: 'Executive Office',
    category: 'advisory',
    description: 'Strategic planning, decision making, company vision',
    skills: ['strategy', 'planning', 'decisions', 'vision', 'okr', 'goals', 'roadmap'],
    icon: 'E',
    systemPrompt: `You are the Executive Department of Alabobai, acting as a world-class CEO advisor.

Your expertise:
- Business strategy and planning
- Decision-making frameworks
- Priority management and OKRs
- Vision and mission development
- Competitive analysis

Always deliver EXECUTABLE outputs - documents they can use immediately.
Be concise but thorough. Provide frameworks, not just advice.`
  },

  legal: {
    id: 'legal',
    name: 'Legal Department',
    category: 'advisory',
    description: 'Business formation, contracts, compliance, IP protection',
    skills: ['contracts', 'llc', 'corp', 'trademark', 'compliance', 'terms', 'privacy', 'nda'],
    icon: 'L',
    systemPrompt: `You are the Legal Department of Alabobai, acting as a virtual General Counsel.

Your expertise:
- Business entity formation (LLC, Corp, etc.)
- Contract drafting and review
- Terms of Service and Privacy Policies
- Intellectual property basics
- Regulatory compliance overview

IMPORTANT: You provide legal INFORMATION, not legal ADVICE.
Always recommend consulting a licensed attorney for complex matters.
Deliver COMPLETE documents - not summaries, actual usable templates.`
  },

  finance: {
    id: 'finance',
    name: 'Finance & Accounting',
    category: 'advisory',
    description: 'Financial planning, taxes, bookkeeping, projections',
    skills: ['tax', 'accounting', 'budget', 'projection', 'cash flow', 'invoice', 'bookkeeping'],
    icon: 'F',
    systemPrompt: `You are the Finance Department of Alabobai, acting as a virtual CFO.

Your expertise:
- Financial projections and modeling
- Tax planning and optimization
- Bookkeeping setup and best practices
- Cash flow management
- Budgeting and expense tracking

Deliver USABLE outputs - actual formulas, templates, and calculations.
Format financial data in clean tables when appropriate.`
  },

  credit: {
    id: 'credit',
    name: 'Credit & Funding',
    category: 'advisory',
    description: 'Credit repair, business credit, funding strategies',
    skills: ['credit score', 'credit repair', 'business credit', 'funding', 'loan', 'investor'],
    icon: 'C',
    systemPrompt: `You are the Credit & Funding Department of Alabobai.

Your expertise:
- Personal and business credit optimization
- Credit dispute strategies
- Funding source identification
- Loan qualification guidance
- Investor pitch preparation

Deliver ACTIONABLE plans with specific steps, timelines, and templates.`
  },

  development: {
    id: 'development',
    name: 'Product & Development',
    category: 'builder',
    description: 'Technical strategy, code, app development, deployment',
    skills: ['code', 'app', 'website', 'api', 'database', 'deploy', 'programming', 'react', 'node'],
    icon: 'D',
    systemPrompt: `You are the Development Department of Alabobai, acting as a virtual CTO.

Your expertise:
- Technical architecture design
- Full-stack development (React, Node, Python, etc.)
- API development
- Database design
- DevOps and deployment

Deliver WORKING code - not pseudocode, actual implementations.
Always include error handling, comments, and best practices.`
  },

  marketing: {
    id: 'marketing',
    name: 'Marketing',
    category: 'advisory',
    description: 'Content, social media, email marketing, advertising',
    skills: ['content', 'social media', 'email', 'ads', 'seo', 'campaign', 'brand', 'copy'],
    icon: 'M',
    systemPrompt: `You are the Marketing Department of Alabobai, acting as a virtual CMO.

Your expertise:
- Marketing strategy
- Content creation (blogs, social, email)
- Social media management
- Paid advertising strategies
- SEO optimization

Deliver READY-TO-USE content - not outlines, actual posts, emails, and ads.`
  },

  sales: {
    id: 'sales',
    name: 'Sales',
    category: 'advisory',
    description: 'Sales strategy, outreach, proposals, CRM',
    skills: ['sales', 'outreach', 'proposal', 'quote', 'crm', 'pipeline', 'cold email', 'close'],
    icon: 'S',
    systemPrompt: `You are the Sales Department of Alabobai, acting as a virtual VP of Sales.

Your expertise:
- Sales strategy and playbooks
- Cold outreach sequences
- Proposal and quote creation
- Objection handling scripts
- CRM setup and management

Deliver READY-TO-SEND materials - actual emails, scripts, and proposals.`
  },

  hr: {
    id: 'hr',
    name: 'Human Resources',
    category: 'advisory',
    description: 'Hiring, employee management, policies, culture',
    skills: ['hiring', 'job description', 'employee', 'handbook', 'interview', 'performance', 'culture'],
    icon: 'H',
    systemPrompt: `You are the HR Department of Alabobai, acting as a virtual HR Director.

Your expertise:
- Recruitment and hiring
- Job descriptions
- Employee handbooks
- Performance management
- Company culture development

Deliver COMPLETE documents - full job descriptions, handbook sections, review templates.`
  },

  operations: {
    id: 'operations',
    name: 'Operations',
    category: 'advisory',
    description: 'Processes, SOPs, project management, efficiency',
    skills: ['process', 'sop', 'workflow', 'project', 'vendor', 'efficiency', 'automation'],
    icon: 'O',
    systemPrompt: `You are the Operations Department of Alabobai, acting as a virtual COO.

Your expertise:
- Process documentation and SOPs
- Project management
- Vendor management
- Operational efficiency
- Systems and automation

Deliver IMPLEMENTABLE processes - complete SOPs, checklists, and workflows.`
  },

  research: {
    id: 'research',
    name: 'Research',
    category: 'research',
    description: 'Market research, competitive analysis, data gathering',
    skills: ['research', 'analysis', 'data', 'market', 'competitor', 'trends', 'report'],
    icon: 'R',
    systemPrompt: `You are the Research Department of Alabobai.

Your expertise:
- Market research and analysis
- Competitive intelligence
- Data gathering and synthesis
- Trend identification
- Research report generation

Deliver COMPREHENSIVE reports with citations and actionable insights.`
  },

  computer: {
    id: 'computer',
    name: 'Computer Control',
    category: 'computer-control',
    description: 'Automation, browser control, screen actions',
    skills: ['automate', 'browser', 'screen', 'click', 'type', 'form', 'automation'],
    icon: 'A',
    systemPrompt: `You are the Computer Control Department of Alabobai.

Your expertise:
- Browser automation
- Form filling
- Data extraction
- Repetitive task automation
- Screen-based workflows

Guide users through automation setup and execution safely.`
  }
};

// ============================================================================
// ORCHESTRATOR SERVICE CLASS
// ============================================================================

export class OrchestratorService extends EventEmitter {
  private llm: LLMService;
  private enableIntentAnalysis: boolean;
  private maxCollaborators: number;
  private defaultPriority: TaskPriority;

  private sessions: Map<string, ConversationSession> = new Map();
  private tasks: Map<string, Task> = new Map();
  private activeCommands: Map<string, AbortController> = new Map();

  constructor(config: OrchestratorConfig = {}) {
    super();

    this.llm = config.llm || getDefaultLLMService();
    this.enableIntentAnalysis = config.enableIntentAnalysis ?? true;
    this.maxCollaborators = config.maxCollaborators || 3;
    this.defaultPriority = config.defaultPriority || 'normal';

    console.log('[OrchestratorService] Initialized with', Object.keys(DEPARTMENTS).length, 'departments');
  }

  // ============================================================================
  // MAIN COMMAND PROCESSING
  // ============================================================================

  async processCommand(
    command: string,
    sessionId: string,
    userId: string,
    options: { departmentHint?: string } = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const taskId = uuid();

    // Get or create session
    const session = this.getOrCreateSession(sessionId, userId);

    // Store user message
    const userMessage: Message = {
      id: uuid(),
      role: 'user',
      content: command,
      timestamp: new Date()
    };
    session.messages.push(userMessage);
    session.lastActivityAt = new Date();

    this.emit('command-received', { taskId, command, sessionId, userId });

    try {
      // Step 1: Analyze intent to determine department
      let intent: CommandIntent;

      if (options.departmentHint && DEPARTMENTS[options.departmentHint]) {
        // Use provided department hint
        intent = {
          primaryDepartment: options.departmentHint,
          secondaryDepartments: [],
          action: 'execute',
          confidence: 1.0,
          entities: {},
          requiresApproval: false,
          priority: this.defaultPriority,
          reasoning: 'User specified department'
        };
      } else if (this.enableIntentAnalysis) {
        // Analyze intent
        intent = await this.analyzeIntent(command, session);
      } else {
        // Default to executive
        intent = {
          primaryDepartment: 'executive',
          secondaryDepartments: [],
          action: 'general',
          confidence: 0.5,
          entities: {},
          requiresApproval: false,
          priority: this.defaultPriority,
          reasoning: 'Default routing'
        };
      }

      this.emit('intent-analyzed', { taskId, intent });

      // Step 2: Create task
      const department = DEPARTMENTS[intent.primaryDepartment];
      if (!department) {
        throw new Error(`Unknown department: ${intent.primaryDepartment}`);
      }

      const task = this.createTask(taskId, command, department, intent);
      this.tasks.set(taskId, task);

      // Step 3: Execute with department
      const response = await this.executeWithDepartment(command, department, session);

      // Step 4: Store assistant message
      const assistantMessage: Message = {
        id: uuid(),
        role: 'assistant',
        content: response,
        agentId: department.id,
        agentName: department.name,
        taskId,
        timestamp: new Date()
      };
      session.messages.push(assistantMessage);
      session.activeDepartment = department.id;

      // Update task status
      task.status = 'completed';
      task.output = { response };
      task.completedAt = new Date();

      const executionTime = Date.now() - startTime;

      this.emit('command-completed', { taskId, department: department.id, executionTime });

      return {
        success: true,
        response,
        departmentId: department.id,
        departmentName: department.name,
        taskId,
        executionTimeMs: executionTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update task if it exists
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = errorMessage;
        task.completedAt = new Date();
      }

      this.emit('command-failed', { taskId, error: errorMessage });

      return {
        success: false,
        response: `I apologize, but I encountered an error: ${errorMessage}`,
        departmentId: 'unknown',
        departmentName: 'Unknown',
        taskId,
        executionTimeMs: Date.now() - startTime,
        error: errorMessage
      };
    }
  }

  // ============================================================================
  // STREAMING COMMAND PROCESSING
  // ============================================================================

  async processCommandStream(
    command: string,
    sessionId: string,
    userId: string,
    callbacks: {
      onStart?: (info: StreamingCommandResult) => void;
      onChunk?: (chunk: string) => void;
      onComplete?: (result: CommandResult) => void;
      onError?: (error: Error) => void;
    },
    options: { departmentHint?: string } = {}
  ): Promise<void> {
    const startTime = Date.now();
    const taskId = uuid();

    const session = this.getOrCreateSession(sessionId, userId);

    // Store user message
    session.messages.push({
      id: uuid(),
      role: 'user',
      content: command,
      timestamp: new Date()
    });
    session.lastActivityAt = new Date();

    // Create abort controller for cancellation
    const abortController = new AbortController();
    this.activeCommands.set(taskId, abortController);

    try {
      // Analyze intent
      let departmentId = options.departmentHint;
      if (!departmentId || !DEPARTMENTS[departmentId]) {
        const intent = await this.analyzeIntent(command, session);
        departmentId = intent.primaryDepartment;
      }

      const department = DEPARTMENTS[departmentId];
      if (!department) {
        throw new Error(`Unknown department: ${departmentId}`);
      }

      // Create task
      const task = this.createTask(taskId, command, department, {
        primaryDepartment: departmentId,
        secondaryDepartments: [],
        action: 'execute',
        confidence: 1.0,
        entities: {},
        requiresApproval: false,
        priority: this.defaultPriority,
        reasoning: 'Streaming execution'
      });
      this.tasks.set(taskId, task);

      // Notify start
      callbacks.onStart?.({
        taskId,
        departmentId: department.id,
        departmentName: department.name
      });

      // Build messages
      const messages = this.buildDepartmentMessages(command, department, session);

      // Stream response
      let fullResponse = '';

      await this.llm.stream(messages, {
        onChunk: (chunk) => {
          if (abortController.signal.aborted) return;
          fullResponse += chunk;
          callbacks.onChunk?.(chunk);
          this.emit('stream-chunk', { taskId, chunk });
        }
      });

      // Store assistant message
      session.messages.push({
        id: uuid(),
        role: 'assistant',
        content: fullResponse,
        agentId: department.id,
        agentName: department.name,
        taskId,
        timestamp: new Date()
      });
      session.activeDepartment = department.id;

      // Update task
      task.status = 'completed';
      task.output = { response: fullResponse };
      task.completedAt = new Date();

      const executionTime = Date.now() - startTime;

      const result: CommandResult = {
        success: true,
        response: fullResponse,
        departmentId: department.id,
        departmentName: department.name,
        taskId,
        executionTimeMs: executionTime
      };

      callbacks.onComplete?.(result);
      this.emit('command-completed', { taskId, result });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(err);
      this.emit('command-failed', { taskId, error: err.message });
    } finally {
      this.activeCommands.delete(taskId);
    }
  }

  // ============================================================================
  // INTENT ANALYSIS
  // ============================================================================

  private async analyzeIntent(command: string, session: ConversationSession): Promise<CommandIntent> {
    const departmentList = Object.entries(DEPARTMENTS)
      .map(([id, dept]) => `${id}: ${dept.description} (skills: ${dept.skills.slice(0, 5).join(', ')})`)
      .join('\n');

    const systemPrompt = `You are an intent classifier for Alabobai's AI department system.
Analyze the user's command and determine which department should handle it.

Available Departments:
${departmentList}

Respond in JSON format:
{
  "primaryDepartment": "department_id",
  "secondaryDepartments": ["other_dept_id"],
  "action": "brief action description",
  "confidence": 0.0-1.0,
  "entities": { "extracted_entities": "values" },
  "requiresApproval": false,
  "priority": "low|normal|high|urgent",
  "reasoning": "brief explanation"
}`;

    // Get recent context
    const recentContext = session.messages
      .slice(-5)
      .map(m => `${m.role}: ${m.content.substring(0, 100)}`)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Recent context:\n${recentContext}\n\nNew command: ${command}` }
    ];

    try {
      const response = await this.llm.chat(messages, { maxTokens: 500 });

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          primaryDepartment: parsed.primaryDepartment || 'executive',
          secondaryDepartments: parsed.secondaryDepartments || [],
          action: parsed.action || 'general',
          confidence: parsed.confidence || 0.8,
          entities: parsed.entities || {},
          requiresApproval: parsed.requiresApproval || false,
          priority: parsed.priority || this.defaultPriority,
          reasoning: parsed.reasoning || ''
        };
      }
    } catch (error) {
      console.error('[OrchestratorService] Intent analysis failed:', error);
    }

    // Fallback: keyword matching
    return this.analyzeIntentByKeywords(command);
  }

  private analyzeIntentByKeywords(command: string): CommandIntent {
    const lower = command.toLowerCase();

    // Match departments by skills
    for (const [id, dept] of Object.entries(DEPARTMENTS)) {
      for (const skill of dept.skills) {
        if (lower.includes(skill.toLowerCase())) {
          return {
            primaryDepartment: id,
            secondaryDepartments: [],
            action: 'execute',
            confidence: 0.7,
            entities: {},
            requiresApproval: false,
            priority: this.defaultPriority,
            reasoning: `Matched keyword: ${skill}`
          };
        }
      }
    }

    // Default to executive
    return {
      primaryDepartment: 'executive',
      secondaryDepartments: [],
      action: 'general',
      confidence: 0.5,
      entities: {},
      requiresApproval: false,
      priority: this.defaultPriority,
      reasoning: 'Default routing'
    };
  }

  // ============================================================================
  // DEPARTMENT EXECUTION
  // ============================================================================

  private async executeWithDepartment(
    command: string,
    department: Department,
    session: ConversationSession
  ): Promise<string> {
    const messages = this.buildDepartmentMessages(command, department, session);

    const response = await this.llm.chat(messages, {
      maxTokens: 4096,
      temperature: 0.7
    });

    return response.content;
  }

  private buildDepartmentMessages(
    command: string,
    department: Department,
    session: ConversationSession
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${department.systemPrompt}

You are part of Alabobai - an AI company platform that gives entrepreneurs access to expert teams.
Current Department: ${department.name}

Core principles:
1. EXECUTE, don't just advise - provide complete, usable deliverables
2. Be specific and actionable - no vague suggestions
3. Ask clarifying questions when needed
4. Deliver Fortune 500 quality work
5. Be concise but thorough`
      }
    ];

    // Add conversation history (last 10 messages)
    const recentHistory = session.messages.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Add current command if not already in history
    const lastMessage = session.messages[session.messages.length - 1];
    if (!lastMessage || lastMessage.content !== command) {
      messages.push({
        role: 'user',
        content: command
      });
    }

    return messages;
  }

  // ============================================================================
  // TASK MANAGEMENT
  // ============================================================================

  private createTask(
    taskId: string,
    command: string,
    department: Department,
    intent: CommandIntent
  ): Task {
    return {
      id: taskId,
      title: intent.action,
      description: command,
      category: department.category,
      priority: intent.priority,
      status: 'in-progress' as TaskStatus,
      assignedAgent: department.id,
      collaborators: intent.secondaryDepartments,
      parentTask: null,
      subtasks: [],
      input: { command, intent },
      output: null,
      requiresApproval: intent.requiresApproval,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null
    };
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  private getOrCreateSession(sessionId: string, userId: string): ConversationSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        userId,
        messages: [],
        activeDepartment: null,
        createdAt: new Date(),
        lastActivityAt: new Date()
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  getSession(sessionId: string): ConversationSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionHistory(sessionId: string): Message[] {
    return this.sessions.get(sessionId)?.messages || [];
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ============================================================================
  // CANCELLATION
  // ============================================================================

  cancelCommand(taskId: string): boolean {
    const controller = this.activeCommands.get(taskId);
    if (controller) {
      controller.abort();
      this.activeCommands.delete(taskId);
      this.emit('command-cancelled', { taskId });
      return true;
    }
    return false;
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  getDepartments(): Department[] {
    return Object.values(DEPARTMENTS);
  }

  getDepartment(id: string): Department | undefined {
    return DEPARTMENTS[id];
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getRecentTasks(limit: number = 20): Task[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; llmHealthy: boolean; departmentCount: number }> {
    const llmHealth = await this.llm.healthCheck();

    return {
      healthy: llmHealth.healthy,
      llmHealthy: llmHealth.healthy,
      departmentCount: Object.keys(DEPARTMENTS).length
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let defaultOrchestrator: OrchestratorService | null = null;

export function createOrchestratorService(config?: OrchestratorConfig): OrchestratorService {
  return new OrchestratorService(config);
}

export function getOrchestratorService(): OrchestratorService {
  if (!defaultOrchestrator) {
    defaultOrchestrator = new OrchestratorService();
  }
  return defaultOrchestrator;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEPARTMENTS };
export default OrchestratorService;
