/**
 * Alabobai Integrations Master Index
 * Connects OpenManus, Computer Control, Bolt.diy Builder, and Advisory Agents
 */

import { EventEmitter } from 'events';
import { LLMClient } from '../core/llm-client.js';
import { Orchestrator, createOrchestrator } from '../core/orchestrator.js';
import { agentRegistry as globalAgentRegistry, AgentRegistry } from '../core/agent-registry.js';
import { createMemoryStore } from '../core/memory.js';
import { createAdvisoryAgents } from '../agents/advisory/index.js';
import { ComputerController, createComputerController } from './computer-use/index.js';
import { AppBuilder, createAppBuilder } from './bolt-diy/index.js';

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

export interface IntegrationConfig {
  llm: LLMClient;
  enableComputerControl?: boolean;
  enableAppBuilder?: boolean;
  enableVoice?: boolean;
  deployTarget?: 'vercel' | 'netlify' | 'local';
}

export interface UnifiedPlatform {
  orchestrator: Orchestrator;
  agentRegistry: AgentRegistry;
  computerController?: ComputerController;
  appBuilder?: AppBuilder;
  llm: LLMClient;
}

// ============================================================================
// UNIFIED PLATFORM FACTORY
// ============================================================================

export async function createUnifiedPlatform(config: IntegrationConfig): Promise<UnifiedPlatform> {
  const { llm, enableComputerControl = true, enableAppBuilder = true, deployTarget = 'local' } = config;

  // Use global agent registry (already has default agents registered)
  const agentRegistry = globalAgentRegistry;

  // Initialize advisory agents (they're already registered via agent-registry defaults)
  const advisoryAgents = createAdvisoryAgents(llm);
  for (const [, agent] of advisoryAgents) {
    await agent.initialize();
  }

  // Create computer controller if enabled
  let computerController: ComputerController | undefined;
  if (enableComputerControl) {
    computerController = createComputerController({
      llm,
      enableMouse: true,
      enableKeyboard: true,
      screenshotInterval: 2000
    });
  }

  // Create app builder if enabled
  let appBuilder: AppBuilder | undefined;
  if (enableAppBuilder) {
    appBuilder = createAppBuilder({
      llm,
      deployTarget
    });
  }

  // Create orchestrator with memory store
  const memory = createMemoryStore('memory');
  const orchestrator = await createOrchestrator({
    llm,
    memory
  });

  return {
    orchestrator,
    agentRegistry,
    computerController,
    appBuilder,
    llm
  };
}

// ============================================================================
// INTEGRATION MANAGER
// ============================================================================

export class IntegrationManager extends EventEmitter {
  private platform: UnifiedPlatform | null = null;
  private config: IntegrationConfig;

  constructor(config: IntegrationConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<UnifiedPlatform> {
    this.platform = await createUnifiedPlatform(this.config);
    this.emit('initialized', this.platform);
    return this.platform;
  }

  getPlatform(): UnifiedPlatform | null {
    return this.platform;
  }

  async processMessage(sessionId: string, userId: string, message: string): Promise<{
    response: string;
    agentUsed?: string;
    requiresApproval?: boolean;
    approvalId?: string;
  }> {
    if (!this.platform) {
      throw new Error('Platform not initialized');
    }

    const result = await this.platform.orchestrator.processMessage(sessionId, userId, message);
    return {
      response: result.content,
      agentUsed: result.agentName,
      requiresApproval: false,
      approvalId: undefined
    };
  }

  async captureScreen(): Promise<{ imageData: string; width: number; height: number } | null> {
    if (!this.platform?.computerController) {
      return null;
    }
    return this.platform.computerController.captureScreen();
  }

  async generateApp(prompt: string): Promise<{ appId: string; files: unknown[]; previewUrl?: string } | null> {
    if (!this.platform?.appBuilder) {
      return null;
    }
    const app = await this.platform.appBuilder.generateApp(prompt);
    return {
      appId: app.id,
      files: app.files,
      previewUrl: app.previewUrl
    };
  }

  getStatus(): {
    initialized: boolean;
    agentCount: number;
    computerControlEnabled: boolean;
    appBuilderEnabled: boolean;
  } {
    return {
      initialized: !!this.platform,
      agentCount: this.platform?.agentRegistry.getAgents().length ?? 0,
      computerControlEnabled: !!this.platform?.computerController,
      appBuilderEnabled: !!this.platform?.appBuilder
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ComputerController, createComputerController } from './computer-use/index.js';
export { AppBuilder, createAppBuilder } from './bolt-diy/index.js';

// External Service Connectors
export { StripeConnector, createStripeConnector } from './connectors/StripeConnector.js';
export { VercelConnector, createVercelConnector } from './connectors/VercelConnector.js';
export { CloudflareConnector, createCloudflareConnector } from './connectors/CloudflareConnector.js';
export { LinearConnector, createLinearConnector } from './connectors/LinearConnector.js';
export { SlackConnector, createSlackConnector } from './connectors/SlackConnector.js';
export { GoogleConnector, createGoogleConnector } from './connectors/GoogleConnector.js';
export { GitHubConnector, createGitHubConnector } from './connectors/GitHubConnector.js';
export { PlaidConnector, createPlaidConnector } from './connectors/PlaidConnector.js';

// Company Builder Orchestrator
export {
  CompanyBuilderOrchestrator,
  createCompanyBuilderOrchestrator,
  type CompanyConfig,
  type SetupProgress,
  type IntegrationResult,
  type CompanySetupResult,
  type CredentialStore
} from './CompanyBuilderOrchestrator.js';

// Integration Registry
export {
  IntegrationRegistry,
  type IntegrationDefinition,
  type IntegrationCategory,
  type AuthType,
  type IntegrationCapability,
  type RateLimitConfig
} from './IntegrationRegistry.js';

export default IntegrationManager;
