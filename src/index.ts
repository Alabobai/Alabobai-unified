/**
 * Alabobai Unified Platform
 * Main Entry Point
 *
 * Your AI Operating System - Every person with their own "cabinet" of AI agents
 *
 * This entry point initializes the complete Alabobai platform including:
 * - Unified Agent system (multi-agent orchestration)
 * - System integration layer (sandbox, browser, checkpointing)
 * - API server for external access
 * - Health monitoring and graceful shutdown
 */

import 'dotenv/config';
import { startServer } from './api/server.js';
import { SystemIntegrator, createSystemIntegrator } from './unified/SystemIntegrator.js';
import { UnifiedAgent, createUnifiedAgent } from './unified/UnifiedAgent.js';
import { validateEnv } from './config/env.js';

// ============================================================================
// BANNER
// ============================================================================

console.log(`
    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                                                                       ║
    ║      █████╗ ██╗      █████╗ ██████╗  ██████╗ ██████╗  █████╗ ██╗     ║
    ║     ██╔══██╗██║     ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██║     ║
    ║     ███████║██║     ███████║██████╔╝██║   ██║██████╔╝███████║██║     ║
    ║     ██╔══██║██║     ██╔══██║██╔══██╗██║   ██║██╔══██╗██╔══██║██║     ║
    ║     ██║  ██║███████╗██║  ██║██████╔╝╚██████╔╝██████╔╝██║  ██║██║     ║
    ║     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ║
    ║                                                                       ║
    ║                    UNIFIED AI PLATFORM                                ║
    ║           "Your AI Operating System"                                  ║
    ║                                                                       ║
    ║  Features:                                                            ║
    ║  - Multi-Agent Orchestration (9 specialized agents)                   ║
    ║  - Autonomous Agent Loop (Manus pattern)                              ║
    ║  - Sandboxed Execution                                                ║
    ║  - Browser Automation                                                 ║
    ║  - Checkpointing & Recovery                                           ║
    ║  - Voice Interface                                                    ║
    ║                                                                       ║
    ╚═══════════════════════════════════════════════════════════════════════╝
`);

// ============================================================================
// GLOBAL STATE
// ============================================================================

let systemIntegrator: SystemIntegrator | null = null;
let systemAgent: UnifiedAgent | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the unified platform
 */
async function initializePlatform(): Promise<void> {
  console.log('[Alabobai] Initializing unified platform...');

  try {
    // Create system integrator
    systemIntegrator = createSystemIntegrator({
      enableSandbox: process.env.ENABLE_SANDBOX !== 'false',
      enableBrowser: process.env.ENABLE_BROWSER !== 'false',
      enableCheckpointing: process.env.ENABLE_CHECKPOINTING !== 'false',
      enableVoice: process.env.ENABLE_VOICE === 'true',
      llmConfig: {
        provider: (process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'groq') || 'groq',
        model: process.env.LLM_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        apiKey: process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
      },
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    });

    // Initialize all components
    const components = await systemIntegrator.initialize();

    // Create the system-level unified agent
    systemAgent = createUnifiedAgent({
      userId: 'system',
      mode: 'supervised',
      enableBrowserAutomation: process.env.ENABLE_BROWSER !== 'false',
      enableSandbox: process.env.ENABLE_SANDBOX !== 'false',
      enableCheckpointing: process.env.ENABLE_CHECKPOINTING !== 'false',
      verbose: process.env.VERBOSE === 'true',
    });

    // Initialize the agent
    await systemAgent.initialize();

    // Set up health monitoring
    systemIntegrator.on('health-check', (health) => {
      if (health.overall !== 'healthy') {
        console.warn('[Alabobai] System health degraded:', health.overall);
      }
    });

    console.log('[Alabobai] Platform initialized successfully');
    console.log('[Alabobai] System components:');
    console.log(`  - LLM: ${process.env.LLM_PROVIDER || 'anthropic'}`);
    console.log(`  - Sandbox: ${process.env.ENABLE_SANDBOX !== 'false' ? 'enabled' : 'disabled'}`);
    console.log(`  - Browser: ${process.env.ENABLE_BROWSER !== 'false' ? 'enabled' : 'disabled'}`);
    console.log(`  - Checkpointing: ${process.env.ENABLE_CHECKPOINTING !== 'false' ? 'enabled' : 'disabled'}`);
    console.log(`  - Voice: ${process.env.ENABLE_VOICE === 'true' ? 'enabled' : 'disabled'}`);
  } catch (error) {
    console.error('[Alabobai] Platform initialization failed:', error);
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[Alabobai] Received ${signal}, initiating graceful shutdown...`);

  try {
    // Shutdown unified agent
    if (systemAgent) {
      console.log('[Alabobai] Shutting down unified agent...');
      await systemAgent.shutdown();
    }

    // Shutdown system integrator
    if (systemIntegrator) {
      console.log('[Alabobai] Shutting down system integrator...');
      await systemIntegrator.shutdown();
    }

    console.log('[Alabobai] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Alabobai] Error during shutdown:', error);
    process.exit(1);
  }
}

// ============================================================================
// MAIN STARTUP
// ============================================================================

async function main(): Promise<void> {
  try {
    // Validate env early so production misconfig fails fast.
    validateEnv();

    // Initialize the unified platform first
    await initializePlatform();

    // Start the API server
    await startServer();

    console.log('[Alabobai] Platform is ready!');
    console.log('[Alabobai] Access the API at http://localhost:' + (process.env.PORT || 3000));
  } catch (error) {
    console.error('[Alabobai] Failed to start:', error);
    process.exit(1);
  }
}

// Start the platform
main();

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('[Alabobai] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Alabobai] Unhandled rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

// ============================================================================
// EXPORTS
// ============================================================================

// Export for programmatic access
export { systemIntegrator, systemAgent };

// Re-export key unified module exports (avoiding conflicts)
export {
  UnifiedAgent,
  createUnifiedAgent,
  initializeUnifiedAgent,
  AgentLoop,
  createAgentLoop,
  SystemIntegrator,
  createSystemIntegrator,
  initializeSystem,
  quickStart,
} from './unified/index.js';

export type {
  UnifiedAgentConfig,
  UnifiedAgentState,
  UnifiedAgentResult,
  AgentMetrics,
  StreamCallback,
  AgentLoopConfig,
  LoopEvent,
  LoopState,
  LoopResult,
  ToolDefinition,
  ToolParameter,
  ToolResult,
  RunOptions,
  IntegrationConfig,
  SystemComponents,
  SystemHealth,
  ComponentHealth,
} from './unified/index.js';

// Re-export core types and utilities (avoiding conflicts with unified)
export {
  AgentRegistry,
  agentRegistry,
  Orchestrator,
  getOrchestrator,
  createLLMClient,
  getDefaultLLMClient,
  createMemoryStore,
} from './core/index.js';

export type {
  Task,
  TaskStatus,
  TaskPriority,
  Message,
  Agent,
  AgentCategory,
  AgentStatus,
  ApprovalRequest,
  LLMClient,
  LLMMessage,
  LLMConfig,
  MemoryStore,
  MemoryEntry,
  AgentDefinition,
  AgentHandler,
  AgentContext,
  AgentResult,
} from './core/index.js';
