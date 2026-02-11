/**
 * Alabobai Executive Agent Base Class
 * Executable agents that DO work, not just advise
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { LLMClient } from '../../core/llm-client.js';
import { Task, TaskResult } from '../../core/types.js';
import { BrowserAutomation } from '../../core/computer/BrowserAutomation.js';
import { BuilderEngine } from '../../core/builder/BuilderEngine.js';
import { DeepResearchEngine } from '../../core/research/DeepResearchEngine.js';
import { IntegrationHub } from '../../integrations/IntegrationHub.js';
import {
  ExecutiveAgentSpec,
  ExecutiveCapability,
  ExecutiveOutput,
  CollaborationProtocol,
  SelfAnnealingTrigger
} from './index.js';
import { ResearchFocus } from '../../core/research/DeepResearchEngine.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutiveAgentConfig {
  spec: ExecutiveAgentSpec;
  llm: LLMClient;
  browserAutomation?: BrowserAutomation;
  builderEngine?: BuilderEngine;
  researchEngine?: DeepResearchEngine;
  integrationHub?: IntegrationHub;
}

export interface ExecutionContext {
  sessionId: string;
  userId: string;
  companyId: string;
  collaboratingAgents?: string[];
  metadata?: Record<string, unknown>;
}

export interface CapabilityExecution {
  id: string;
  capabilityName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  startedAt: Date;
  completedAt?: Date;
  input: Record<string, unknown>;
  output?: ExecutiveOutput;
  error?: string;
  tokensUsed: number;
  approvalRequired: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
}

export interface AgentMemory {
  recentExecutions: CapabilityExecution[];
  learnedPatterns: LearnedPattern[];
  collaborationHistory: CollaborationRecord[];
  performanceMetrics: PerformanceMetrics;
}

export interface LearnedPattern {
  patternId: string;
  trigger: string;
  outcome: 'success' | 'failure';
  confidence: number;
  occurrences: number;
  lastSeen: Date;
  adaptation?: string;
}

export interface CollaborationRecord {
  id: string;
  partnerAgent: string;
  context: Record<string, unknown>;
  outcome: 'success' | 'failure';
  timestamp: Date;
}

export interface PerformanceMetrics {
  totalExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  tokensUsedTotal: number;
  approvalRate: number;
  collaborationCount: number;
}

// ============================================================================
// EXECUTIVE AGENT BASE CLASS
// ============================================================================

export class ExecutiveAgent extends EventEmitter {
  readonly id: string;
  readonly spec: ExecutiveAgentSpec;

  protected llm: LLMClient;
  protected browser?: BrowserAutomation;
  protected builder?: BuilderEngine;
  protected research?: DeepResearchEngine;
  protected integrations?: IntegrationHub;

  protected memory: AgentMemory;
  protected activeExecutions: Map<string, CapabilityExecution>;

  constructor(config: ExecutiveAgentConfig) {
    super();

    this.id = `exec-${config.spec.identity.role}-${uuid().substring(0, 8)}`;
    this.spec = config.spec;
    this.llm = config.llm;
    this.browser = config.browserAutomation;
    this.builder = config.builderEngine;
    this.research = config.researchEngine;
    this.integrations = config.integrationHub;

    this.activeExecutions = new Map();
    this.memory = {
      recentExecutions: [],
      learnedPatterns: [],
      collaborationHistory: [],
      performanceMetrics: {
        totalExecutions: 0,
        successRate: 1,
        averageExecutionTime: 0,
        tokensUsedTotal: 0,
        approvalRate: 1,
        collaborationCount: 0
      }
    };
  }

  // ============================================================================
  // CORE EXECUTION
  // ============================================================================

  /**
   * Execute a capability by name
   */
  async executeCapability(
    capabilityName: string,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<CapabilityExecution> {
    const capability = this.spec.capabilities.find(c => c.name === capabilityName);
    if (!capability) {
      throw new Error(`Capability not found: ${capabilityName}`);
    }

    const executionId = uuid();
    const execution: CapabilityExecution = {
      id: executionId,
      capabilityName,
      status: 'pending',
      startedAt: new Date(),
      input,
      tokensUsed: 0,
      approvalRequired: capability.approvalRequired
    };

    this.activeExecutions.set(executionId, execution);
    this.emit('execution-started', { executionId, capability: capabilityName });

    // Check if approval is required before execution
    if (capability.approvalRequired) {
      execution.status = 'awaiting_approval';
      execution.approvalStatus = 'pending';
      this.emit('approval-required', {
        executionId,
        capability: capabilityName,
        input,
        estimatedDuration: capability.estimatedDuration
      });
      return execution;
    }

    return this.runExecution(execution, capability, input, context);
  }

  /**
   * Resume execution after approval
   */
  async resumeAfterApproval(
    executionId: string,
    approved: boolean,
    context: ExecutionContext
  ): Promise<CapabilityExecution> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'awaiting_approval') {
      throw new Error(`Execution is not awaiting approval: ${execution.status}`);
    }

    execution.approvalStatus = approved ? 'approved' : 'rejected';

    if (!approved) {
      execution.status = 'failed';
      execution.error = 'Execution rejected by user';
      execution.completedAt = new Date();
      this.emit('execution-rejected', { executionId });
      return execution;
    }

    const capability = this.spec.capabilities.find(c => c.name === execution.capabilityName)!;
    return this.runExecution(execution, capability, execution.input, context);
  }

  /**
   * Internal execution logic
   */
  protected async runExecution(
    execution: CapabilityExecution,
    capability: ExecutiveCapability,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<CapabilityExecution> {
    execution.status = 'running';
    const startTime = Date.now();

    try {
      // Build the execution prompt
      const prompt = this.buildExecutionPrompt(capability, input, context);

      // Execute with LLM
      const response = await this.llm.chat([
        { role: 'system', content: this.buildSystemPrompt() },
        { role: 'user', content: prompt }
      ]);

      // Parse and validate output
      const output = await this.processOutput(response, capability, input, context);

      execution.status = 'completed';
      execution.output = output;
      execution.completedAt = new Date();
      execution.tokensUsed = this.estimateTokens(prompt + response);

      // Update memory
      this.updateMemory(execution, 'success');

      this.emit('execution-completed', {
        executionId: execution.id,
        output,
        duration: Date.now() - startTime
      });

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.completedAt = new Date();

      // Update memory
      this.updateMemory(execution, 'failure');

      this.emit('execution-failed', {
        executionId: execution.id,
        error: execution.error
      });

      return execution;
    }
  }

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  protected buildSystemPrompt(): string {
    const { identity, capabilities, tools, outputs } = this.spec;

    return `You are ${identity.name}, the ${identity.title} for an AI-powered company builder platform.

PERSONALITY:
${identity.personality.map(p => `- ${p}`).join('\n')}

COMMUNICATION STYLE:
${identity.communicationStyle}

EXPERTISE:
${identity.expertise.map(e => `- ${e}`).join('\n')}

CAPABILITIES YOU CAN EXECUTE:
${capabilities.map(c => `- ${c.name}: ${c.description}`).join('\n')}

AVAILABLE TOOLS:
Browser Automation: ${tools.browserAutomation.join(', ')}
Terminal Commands: ${tools.terminalCommands.join(', ')}
APIs: ${tools.apis.join(', ')}
File Operations: ${tools.fileOperations.join(', ')}
External Services: ${tools.externalServices.join(', ')}

OUTPUT FORMATS:
Documents: ${outputs.documents.map(d => d.type).join(', ')}
Deployments: ${outputs.deployments.map(d => d.type).join(', ')}
Data: ${outputs.data.map(d => d.type).join(', ')}
Decisions: ${outputs.decisions.map(d => d.type).join(', ')}

IMPORTANT: You are an EXECUTION agent, not just an advisory agent. You must:
1. Actually perform the requested tasks, not just explain how to do them
2. Use the available tools to gather real data and create real outputs
3. Provide specific, actionable results with actual content
4. Format outputs according to the specified schemas
5. Track progress and report status

When you need to use a tool, format your response as:
[TOOL: tool_name]
{parameters as JSON}
[/TOOL]

When you produce an output, format it as:
[OUTPUT: output_type]
{content in appropriate format}
[/OUTPUT]`;
  }

  protected buildExecutionPrompt(
    capability: ExecutiveCapability,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): string {
    return `EXECUTE CAPABILITY: ${capability.name}

DESCRIPTION: ${capability.description}

INPUT:
${JSON.stringify(input, null, 2)}

CONTEXT:
- Session: ${context.sessionId}
- User: ${context.userId}
- Company: ${context.companyId}
${context.collaboratingAgents ? `- Collaborating with: ${context.collaboratingAgents.join(', ')}` : ''}

REQUIRED TOOLS: ${capability.requiredTools.join(', ')}

EXPECTED OUTPUT SCHEMA:
${JSON.stringify(capability.outputSchema, null, 2)}

ESTIMATED DURATION: ${capability.estimatedDuration}

Execute this capability now. Use the available tools to gather data, perform analysis, and produce the specified outputs. Be thorough and provide real, actionable results.`;
  }

  // ============================================================================
  // OUTPUT PROCESSING
  // ============================================================================

  protected async processOutput(
    response: string,
    capability: ExecutiveCapability,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutiveOutput> {
    // Extract tool calls and execute them
    const toolCalls = this.extractToolCalls(response);
    const toolResults: Record<string, unknown> = {};

    for (const toolCall of toolCalls) {
      try {
        const result = await this.executeTool(toolCall.tool, toolCall.params, context);
        toolResults[toolCall.tool] = result;
      } catch (error) {
        toolResults[toolCall.tool] = { error: error instanceof Error ? error.message : 'Tool execution failed' };
      }
    }

    // Extract outputs
    const outputs = this.extractOutputs(response);

    // Determine output type
    let outputType: ExecutiveOutput['type'] = 'decision';
    if (outputs.some(o => o.type.includes('document') || o.type.includes('report'))) {
      outputType = 'document';
    } else if (outputs.some(o => o.type.includes('deploy') || o.type.includes('app'))) {
      outputType = 'deployment';
    } else if (outputs.some(o => o.type.includes('data') || o.type.includes('analysis'))) {
      outputType = 'data';
    }

    return {
      type: outputType,
      format: this.determineFormat(outputs),
      content: {
        response,
        toolResults,
        outputs,
        structuredData: this.parseStructuredData(response, capability.outputSchema)
      },
      artifacts: outputs.map(o => o.type),
      metrics: {
        toolCallsExecuted: toolCalls.length,
        outputsProduced: outputs.length
      }
    };
  }

  protected extractToolCalls(response: string): Array<{ tool: string; params: Record<string, unknown> }> {
    const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
    const toolRegex = /\[TOOL:\s*(\w+)\]([\s\S]*?)\[\/TOOL\]/g;

    let match;
    while ((match = toolRegex.exec(response)) !== null) {
      try {
        const params = JSON.parse(match[2].trim());
        toolCalls.push({ tool: match[1], params });
      } catch {
        // Skip malformed tool calls
      }
    }

    return toolCalls;
  }

  protected extractOutputs(response: string): Array<{ type: string; content: string }> {
    const outputs: Array<{ type: string; content: string }> = [];
    const outputRegex = /\[OUTPUT:\s*(\w+)\]([\s\S]*?)\[\/OUTPUT\]/g;

    let match;
    while ((match = outputRegex.exec(response)) !== null) {
      outputs.push({ type: match[1], content: match[2].trim() });
    }

    return outputs;
  }

  protected parseStructuredData(response: string, schema: Record<string, unknown>): Record<string, unknown> {
    // Try to extract JSON from the response
    const jsonRegex = /```json\n?([\s\S]*?)\n?```/g;
    const matches = [];
    let match;
    while ((match = jsonRegex.exec(response)) !== null) {
      try {
        matches.push(JSON.parse(match[1]));
      } catch {
        // Skip malformed JSON
      }
    }

    if (matches.length > 0) {
      return matches.length === 1 ? matches[0] : { results: matches };
    }

    // Return empty object if no structured data found
    return {};
  }

  protected determineFormat(outputs: Array<{ type: string; content: string }>): string {
    if (outputs.length === 0) return 'text';

    const types = outputs.map(o => o.type.toLowerCase());
    if (types.some(t => t.includes('json'))) return 'json';
    if (types.some(t => t.includes('markdown'))) return 'markdown';
    if (types.some(t => t.includes('html'))) return 'html';
    if (types.some(t => t.includes('excel') || t.includes('spreadsheet'))) return 'excel';
    if (types.some(t => t.includes('pdf'))) return 'pdf';

    return 'text';
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  protected async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    // Route to appropriate tool implementation
    switch (toolName.toLowerCase()) {
      case 'browserautomation':
      case 'webscraper':
      case 'navigate':
        if (!this.browser) throw new Error('Browser automation not available');
        return this.executeBrowserTool(params);

      case 'deepresearchengine':
      case 'research':
      case 'websearch':
        if (!this.research) throw new Error('Research engine not available');
        return this.executeResearchTool(params);

      case 'builderengine':
      case 'codegenerator':
      case 'deploymentpipeline':
        if (!this.builder) throw new Error('Builder engine not available');
        return this.executeBuilderTool(params);

      case 'documentgenerator':
      case 'reportgenerator':
        return this.executeDocumentTool(params);

      case 'crmintegration':
      case 'emailplatformapi':
      case 'analyticsplatform':
        if (!this.integrations) throw new Error('Integration hub not available');
        return this.executeIntegrationTool(toolName, params, context);

      default:
        // Generic LLM-based tool execution
        return this.executeGenericTool(toolName, params);
    }
  }

  protected async executeBrowserTool(params: Record<string, unknown>): Promise<unknown> {
    if (!this.browser) throw new Error('Browser not available');

    const action = params.action as string;
    switch (action) {
      case 'navigate':
        await this.browser.navigate(params.url as string);
        return { success: true, url: params.url };

      case 'screenshot':
        const screenshot = await this.browser.screenshot();
        return { success: true, screenshot };

      case 'getText':
        const text = await this.browser.getText(params.selector as string);
        return { success: true, text };

      case 'click':
        await this.browser.click(params.selector as string);
        return { success: true };

      case 'type':
        await this.browser.type(params.selector as string, params.text as string);
        return { success: true };

      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }

  protected async executeResearchTool(params: Record<string, unknown>): Promise<unknown> {
    if (!this.research) throw new Error('Research engine not available');

    const result = await this.research.research({
      query: params.query as string,
      depth: (params.depth as 'quick' | 'standard' | 'deep') || 'standard',
      focus: params.focus as ResearchFocus[] | undefined
    });

    return {
      findings: result.findings.slice(0, 10),
      citations: result.citations.slice(0, 10),
      accuracy: result.accuracy
    };
  }

  protected async executeBuilderTool(params: Record<string, unknown>): Promise<unknown> {
    if (!this.builder) throw new Error('Builder engine not available');

    const action = params.action as string;
    switch (action) {
      case 'build':
        const buildResult = await this.builder.build({
          prompt: params.prompt as string,
          projectName: params.projectName as string,
          features: params.features as string[] | undefined
        });
        return {
          success: buildResult.success,
          previewUrl: buildResult.preview?.url,
          files: buildResult.app.files.length
        };

      case 'deploy':
        const deployment = await this.builder.deploy(params.provider as 'vercel' | 'netlify' | 'railway' | 'fly');
        return {
          success: true,
          url: deployment.productionUrl
        };

      default:
        throw new Error(`Unknown builder action: ${action}`);
    }
  }

  protected async executeDocumentTool(params: Record<string, unknown>): Promise<unknown> {
    // Document generation via LLM
    const prompt = `Generate a ${params.documentType} document with the following specifications:
${JSON.stringify(params, null, 2)}

Format the output as a complete, professional document.`;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a professional document generator. Create well-structured, comprehensive documents.' },
      { role: 'user', content: prompt }
    ]);

    return {
      type: params.documentType,
      content: response,
      format: params.format || 'markdown'
    };
  }

  protected async executeIntegrationTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    if (!this.integrations) throw new Error('Integration hub not available');

    // Map tool names to integration IDs
    const integrationMap: Record<string, string> = {
      'crmintegration': 'salesforce',
      'emailplatformapi': 'sendgrid',
      'analyticsplatform': 'mixpanel'
    };

    const integrationId = integrationMap[toolName.toLowerCase()];
    if (!integrationId) {
      throw new Error(`Unknown integration: ${toolName}`);
    }

    // Execute via integration hub
    const result = await this.integrations.execute({
      integrationId,
      userId: context.userId,
      method: params.method as string || 'GET',
      endpoint: params.endpoint as string,
      params: params.queryParams as Record<string, unknown>,
      body: params.body as Record<string, unknown>
    });

    return result;
  }

  protected async executeGenericTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    // Generic tool execution via LLM reasoning
    const prompt = `Simulate the execution of tool "${toolName}" with the following parameters:
${JSON.stringify(params, null, 2)}

Provide a realistic result that this tool would produce.`;

    const response = await this.llm.chat([
      { role: 'system', content: `You are simulating the ${toolName} tool. Provide realistic, helpful results.` },
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return { result: response };
    }
  }

  // ============================================================================
  // COLLABORATION
  // ============================================================================

  /**
   * Request collaboration from another agent
   */
  async requestCollaboration(
    partnerAgentId: string,
    request: {
      reason: string;
      sharedContext: Record<string, unknown>;
      expectedOutput: string;
    }
  ): Promise<void> {
    // Find matching collaboration protocol
    const protocol = this.spec.collaboration.find(c => c.partnerAgent === partnerAgentId);

    if (!protocol) {
      throw new Error(`No collaboration protocol with agent: ${partnerAgentId}`);
    }

    // Emit collaboration request event
    this.emit('collaboration-requested', {
      requestingAgent: this.id,
      partnerAgent: partnerAgentId,
      protocol,
      request
    });
  }

  /**
   * Handle incoming collaboration request
   */
  async handleCollaborationRequest(
    requestingAgentId: string,
    context: Record<string, unknown>,
    context_: ExecutionContext
  ): Promise<Record<string, unknown>> {
    // Find matching protocol
    const protocol = this.spec.collaboration.find(
      c => c.partnerAgent === requestingAgentId.split('-')[1] // Extract role from agent ID
    );

    // Process the collaboration request
    const prompt = `You are receiving a collaboration request from ${requestingAgentId}.

Context provided:
${JSON.stringify(context, null, 2)}

Protocol for this collaboration:
${protocol ? JSON.stringify(protocol, null, 2) : 'No specific protocol defined'}

Provide your contribution to this collaboration based on your expertise.`;

    const response = await this.llm.chat([
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: prompt }
    ]);

    // Record collaboration
    this.memory.collaborationHistory.push({
      id: uuid(),
      partnerAgent: requestingAgentId,
      context,
      outcome: 'success',
      timestamp: new Date()
    });

    this.memory.performanceMetrics.collaborationCount++;

    return {
      response,
      agentId: this.id,
      timestamp: new Date()
    };
  }

  // ============================================================================
  // SELF-ANNEALING
  // ============================================================================

  /**
   * Process feedback to improve performance
   */
  processFeedback(feedback: {
    executionId: string;
    feedbackType: string;
    rating: 'positive' | 'negative' | 'neutral';
    details?: string;
  }): void {
    const execution = this.memory.recentExecutions.find(e => e.id === feedback.executionId);
    if (!execution) return;

    // Find matching annealing trigger
    const trigger = this.spec.selfAnnealing.find(t => t.feedbackType === feedback.feedbackType);
    if (!trigger) return;

    // Create or update learned pattern
    const patternKey = `${execution.capabilityName}-${feedback.feedbackType}`;
    let pattern = this.memory.learnedPatterns.find(p => p.patternId === patternKey);

    if (pattern) {
      pattern.occurrences++;
      pattern.lastSeen = new Date();

      // Update confidence based on feedback
      if (feedback.rating === 'positive') {
        pattern.confidence = Math.min(1, pattern.confidence + 0.1);
        pattern.outcome = 'success';
      } else if (feedback.rating === 'negative') {
        pattern.confidence = Math.max(0, pattern.confidence - 0.1);
        pattern.outcome = 'failure';
        pattern.adaptation = trigger.adaptationMechanism;
      }
    } else {
      pattern = {
        patternId: patternKey,
        trigger: feedback.feedbackType,
        outcome: feedback.rating === 'positive' ? 'success' : 'failure',
        confidence: feedback.rating === 'positive' ? 0.6 : 0.4,
        occurrences: 1,
        lastSeen: new Date(),
        adaptation: feedback.rating === 'negative' ? trigger.adaptationMechanism : undefined
      };
      this.memory.learnedPatterns.push(pattern);
    }

    this.emit('pattern-learned', { pattern, feedback });
  }

  /**
   * Apply learned patterns to improve execution
   */
  protected applyLearnedPatterns(capabilityName: string): string[] {
    const relevantPatterns = this.memory.learnedPatterns.filter(
      p => p.patternId.startsWith(capabilityName) && p.adaptation
    );

    return relevantPatterns
      .filter(p => p.confidence > 0.5)
      .map(p => p.adaptation!)
      .filter((v, i, a) => a.indexOf(v) === i); // Unique adaptations
  }

  // ============================================================================
  // MEMORY MANAGEMENT
  // ============================================================================

  protected updateMemory(execution: CapabilityExecution, outcome: 'success' | 'failure'): void {
    // Add to recent executions
    this.memory.recentExecutions.unshift(execution);
    if (this.memory.recentExecutions.length > 100) {
      this.memory.recentExecutions.pop();
    }

    // Update metrics
    const metrics = this.memory.performanceMetrics;
    metrics.totalExecutions++;
    metrics.tokensUsedTotal += execution.tokensUsed;

    const executionTime = execution.completedAt
      ? execution.completedAt.getTime() - execution.startedAt.getTime()
      : 0;

    metrics.averageExecutionTime = (
      (metrics.averageExecutionTime * (metrics.totalExecutions - 1) + executionTime) /
      metrics.totalExecutions
    );

    // Update success rate
    const successCount = this.memory.recentExecutions.filter(e => e.status === 'completed').length;
    metrics.successRate = successCount / Math.min(this.memory.recentExecutions.length, 100);

    // Update approval rate
    const approvalExecutions = this.memory.recentExecutions.filter(e => e.approvalRequired);
    if (approvalExecutions.length > 0) {
      const approvedCount = approvalExecutions.filter(e => e.approvalStatus === 'approved').length;
      metrics.approvalRate = approvedCount / approvalExecutions.length;
    }
  }

  protected estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  get name(): string {
    return this.spec.identity.name;
  }

  get role(): string {
    return this.spec.identity.role;
  }

  get title(): string {
    return this.spec.identity.title;
  }

  get capabilities(): ExecutiveCapability[] {
    return this.spec.capabilities;
  }

  getMemory(): Readonly<AgentMemory> {
    return this.memory;
  }

  getActiveExecutions(): CapabilityExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.memory.performanceMetrics };
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      title: this.title,
      capabilities: this.capabilities.map(c => c.name),
      performanceMetrics: this.memory.performanceMetrics,
      activeExecutions: this.getActiveExecutions().length,
      learnedPatterns: this.memory.learnedPatterns.length
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createExecutiveAgent(config: ExecutiveAgentConfig): ExecutiveAgent {
  return new ExecutiveAgent(config);
}

export default ExecutiveAgent;
