/**
 * Alabobai Unified Platform - Core Types
 * The type definitions for the entire AI Operating System
 */

import { z } from 'zod';

// ============================================================================
// AGENT TYPES
// ============================================================================

export type AgentCategory =
  | 'advisory'        // Gives advice (wealth, credit, legal, health, business)
  | 'computer-control' // Controls screen/mouse/keyboard
  | 'builder'         // Builds apps/websites
  | 'research'        // Searches web, analyzes documents
  | 'orchestrator';   // Routes and coordinates

export type AgentStatus =
  | 'idle'
  | 'working'
  | 'waiting-approval'
  | 'collaborating'
  | 'error';

export interface Agent {
  id: string;
  name: string;
  category: AgentCategory;
  skills: string[];
  status: AgentStatus;
  icon: string;
  description: string;
  currentTask: Task | null;
  completedTasks: number;
  createdAt: Date;
}

// ============================================================================
// TASK TYPES
// ============================================================================

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus =
  | 'pending'
  | 'in-progress'
  | 'waiting-approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

export interface Task {
  id: string;
  title: string;
  description: string;
  category: AgentCategory;
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent: string | null;
  collaborators: string[];
  parentTask: string | null;
  subtasks: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  requiresApproval: boolean;
  approvalReason?: string;
  requiredCapabilities?: string[];
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error?: string;
}

// ============================================================================
// TASK RESULT TYPES
// ============================================================================

export interface TaskResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  recommendation?: {
    summary: string;
    details: string;
    confidence: number;
    sources: string[];
    alternatives: string[];
  };
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system' | 'agent';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  agentId?: string;
  agentName?: string;
  taskId?: string;
  attachments?: Attachment[];
  timestamp: Date;
}

export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'code' | 'app';
  name: string;
  url?: string;
  data?: string; // base64 for inline
  mimeType?: string;
}

// ============================================================================
// APPROVAL TYPES
// ============================================================================

export type ApprovalAction =
  | 'send-email'
  | 'send-payment'
  | 'delete-file'
  | 'execute-code'
  | 'post-social'
  | 'sign-document'
  | 'make-purchase'
  | 'deploy-app';

export interface ApprovalRequest {
  id: string;
  taskId: string;
  agentId: string;
  action: ApprovalAction;
  description: string;
  details: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
}

// ============================================================================
// COMPUTER CONTROL TYPES
// ============================================================================

export interface ScreenCapture {
  id: string;
  timestamp: Date;
  width: number;
  height: number;
  imageData: string; // base64
  elements?: UIElement[];
}

export interface UIElement {
  type: 'button' | 'input' | 'link' | 'text' | 'image' | 'form' | 'unknown';
  text?: string;
  bounds: { x: number; y: number; width: number; height: number };
  interactable: boolean;
  attributes?: Record<string, string>;
}

export type ComputerAction =
  | { type: 'click'; x: number; y: number; button?: 'left' | 'right' }
  | { type: 'double-click'; x: number; y: number }
  | { type: 'type'; text: string }
  | { type: 'key'; key: string; modifiers?: string[] }
  | { type: 'scroll'; x: number; y: number; deltaX?: number; deltaY: number }
  | { type: 'drag'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'screenshot' }
  | { type: 'wait'; ms: number };

// ============================================================================
// BUILDER TYPES
// ============================================================================

export interface AppSpec {
  name: string;
  description: string;
  type: 'website' | 'webapp' | 'api' | 'mobile';
  framework?: string;
  features: string[];
  pages?: string[];
  styling?: {
    theme: 'light' | 'dark' | 'custom';
    primaryColor?: string;
    fontFamily?: string;
  };
}

export interface GeneratedApp {
  id: string;
  spec: AppSpec;
  files: GeneratedFile[];
  previewUrl?: string;
  deployedUrl?: string;
  status: 'generating' | 'preview' | 'deployed' | 'failed';
  createdAt: Date;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

// ============================================================================
// ORCHESTRATOR TYPES
// ============================================================================

export interface Intent {
  category: AgentCategory;
  action: string;
  confidence: number;
  entities: Record<string, unknown>;
  requiresApproval: boolean;
}

export interface ConversationContext {
  sessionId: string;
  userId: string;
  messages: Message[];
  activeAgents: string[];
  pendingApprovals: string[];
  memory: Map<string, unknown>;
  createdAt: Date;
  lastActivityAt: Date;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type SystemEvent =
  | { type: 'agent-started'; agentId: string; taskId: string }
  | { type: 'agent-completed'; agentId: string; taskId: string; result: unknown }
  | { type: 'agent-error'; agentId: string; taskId: string; error: string }
  | { type: 'approval-requested'; approvalId: string }
  | { type: 'approval-resolved'; approvalId: string; approved: boolean }
  | { type: 'message-received'; messageId: string }
  | { type: 'screen-captured'; captureId: string }
  | { type: 'app-generated'; appId: string };

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AlabobaiConfig {
  llm: {
    provider: 'anthropic' | 'openai';
    model: string;
    apiKey: string;
  };
  voice: {
    enabled: boolean;
    sttProvider: 'deepgram';
    ttsProvider: 'deepgram' | 'elevenlabs';
    apiKey: string;
  };
  computerControl: {
    enabled: boolean;
    screenshotInterval: number;
    enableMouse: boolean;
    enableKeyboard: boolean;
  };
  guardian: {
    requireApprovalFor: ApprovalAction[];
    autoApprove: string[];
    riskThresholds: Record<string, number>;
  };
  agents: {
    maxConcurrent: number;
    timeout: number;
  };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const TaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  category: z.enum(['advisory', 'computer-control', 'builder', 'research']).optional(),
});

export const MessageInputSchema = z.object({
  content: z.string().min(1).max(10000),
  attachments: z.array(z.object({
    type: z.enum(['image', 'file', 'audio', 'code', 'app']),
    name: z.string(),
    data: z.string().optional(),
    url: z.string().url().optional(),
  })).optional(),
});

export const ApprovalResponseSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});
