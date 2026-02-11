/**
 * Alabobai Unified Integration Layer
 *
 * This module provides the unified entry point for the entire Alabobai platform.
 * It connects all subsystems and provides a clean API for agent operations.
 *
 * Main exports:
 * - UnifiedAgent: Single entry point that orchestrates all capabilities
 * - AgentLoop: Core agent loop implementing analyze -> plan -> execute -> observe
 * - SystemIntegrator: Wires all components together with dependency injection
 */

// Main unified agent - import for local use and re-export
import {
  UnifiedAgent,
  createUnifiedAgent,
  initializeUnifiedAgent,
} from './UnifiedAgent.js';

export {
  UnifiedAgent,
  createUnifiedAgent,
  initializeUnifiedAgent,
};

export type {
  UnifiedAgentConfig,
  UnifiedAgentState,
  UnifiedAgentResult,
  AgentMetrics,
  StreamCallback,
} from './UnifiedAgent.js';

// Agent loop
export {
  AgentLoop,
  createAgentLoop,
} from './AgentLoop.js';

export type {
  AgentLoopConfig,
  LoopEvent,
  LoopState,
  LoopResult,
  ToolDefinition,
  ToolParameter,
  ToolResult,
  RunOptions,
} from './AgentLoop.js';

// System integrator
export {
  SystemIntegrator,
  createSystemIntegrator,
  initializeSystem,
} from './SystemIntegrator.js';

export type {
  IntegrationConfig,
  SystemComponents,
  SystemHealth,
  ComponentHealth,
} from './SystemIntegrator.js';

// Re-export commonly used types from core
export type {
  Task,
  TaskStatus,
  TaskPriority,
  Message,
  Agent,
  AgentCategory,
  ApprovalRequest,
} from '../core/types.js';

// Re-export LLM client
export { createLLMClient, getDefaultLLMClient } from '../core/llm-client.js';
export type { LLMClient, LLMMessage } from '../core/llm-client.js';

// Re-export memory
export { createMemoryStore } from '../core/memory.js';
export type { MemoryStore } from '../core/memory.js';

/**
 * Quick start helper for common use cases
 */
export async function quickStart(options: {
  userId: string;
  mode?: 'autonomous' | 'supervised' | 'interactive';
  verbose?: boolean;
}): Promise<UnifiedAgent> {
  return initializeUnifiedAgent({
    userId: options.userId,
    mode: options.mode || 'supervised',
    verbose: options.verbose || false,
  });
}

/**
 * Default export - the main UnifiedAgent class
 */
export { UnifiedAgent as default } from './UnifiedAgent.js';
