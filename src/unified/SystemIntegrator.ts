/**
 * Alabobai System Integrator
 * Wires together all system components with clean dependency injection
 *
 * This is the glue that connects:
 * - Sandbox system
 * - Event stream
 * - Browser automation
 * - LLM router
 * - Tools
 * - Checkpointing
 * - Planner
 * - Orchestrator
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// Core imports
import { LLMClient, LLMConfig, createLLMClient, getDefaultLLMClient } from '../core/llm-client.js';
import { MemoryStore, createMemoryStore } from '../core/memory.js';
import { CheckpointManager, CheckpointConfig, createCheckpointManager } from '../core/reliability/CheckpointManager.js';
import { BrowserAutomation, BrowserAutomationConfig, createBrowserAutomation } from '../core/computer/BrowserAutomation.js';

// Service imports
import { VMSandboxService, SandboxConfig, createVMSandbox } from '../services/vm-sandbox.js';

// Agent imports
import { Orchestrator, OrchestratorConfig, createOrchestrator } from '../agents/orchestrator/Orchestrator.js';
import { TaskDecomposer, createTaskDecomposer } from '../agents/orchestrator/TaskDecomposer.js';

// Tool definitions
import { ToolDefinition } from './AgentLoop.js';

// ============================================================================
// TYPES
// ============================================================================

export interface IntegrationConfig {
  // Feature flags
  enableSandbox?: boolean;
  enableBrowser?: boolean;
  enableVoice?: boolean;
  enableCheckpointing?: boolean;

  // Component configurations
  llmConfig?: LLMConfig;
  sandboxConfig?: Partial<SandboxConfig>;
  browserConfig?: BrowserAutomationConfig;
  checkpointConfig?: Partial<CheckpointConfig>;
  orchestratorConfig?: Partial<OrchestratorConfig>;

  // Memory configuration
  memoryType?: 'sqlite' | 'in-memory';
  memoryPath?: string;

  // Health monitoring
  healthCheckInterval?: number;
}

export interface SystemComponents {
  llm: LLMClient;
  memory: MemoryStore;
  sandbox: VMSandboxService | null;
  browser: BrowserAutomation | null;
  checkpointManager: CheckpointManager | null;
  orchestrator: Orchestrator | null;
  planner: TaskDecomposer | null;
  tools: Map<string, ToolDefinition>;
  eventBus: EventEmitter;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    llm: ComponentHealth;
    memory: ComponentHealth;
    sandbox: ComponentHealth;
    browser: ComponentHealth;
    checkpoint: ComponentHealth;
    orchestrator: ComponentHealth;
  };
  lastCheck: Date;
  uptime: number;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
  latency?: number;
  error?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// SYSTEM INTEGRATOR CLASS
// ============================================================================

export class SystemIntegrator extends EventEmitter {
  private config: Required<IntegrationConfig>;
  private components: Partial<SystemComponents> = {};
  private initialized: boolean = false;
  private startTime: Date = new Date();
  private healthCheckTimer?: NodeJS.Timeout;
  private shutdownHandlers: Array<() => Promise<void>> = [];

  constructor(config: IntegrationConfig = {}) {
    super();

    this.config = {
      enableSandbox: config.enableSandbox ?? true,
      enableBrowser: config.enableBrowser ?? true,
      enableVoice: config.enableVoice ?? false,
      enableCheckpointing: config.enableCheckpointing ?? true,
      llmConfig: config.llmConfig || {
        provider: (process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'groq') || 'groq',
        model: process.env.GROQ_MODEL || process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
        apiKey: process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
      },
      sandboxConfig: config.sandboxConfig || {},
      browserConfig: config.browserConfig || {},
      checkpointConfig: config.checkpointConfig || {},
      orchestratorConfig: config.orchestratorConfig || {},
      memoryType: config.memoryType || 'in-memory',
      memoryPath: config.memoryPath || '.alabobai/memory.db',
      healthCheckInterval: config.healthCheckInterval || 30000,
    };

    // Set up process signal handlers
    this.setupGracefulShutdown();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize all system components
   */
  async initialize(): Promise<SystemComponents> {
    if (this.initialized) {
      return this.components as SystemComponents;
    }

    console.log('[SystemIntegrator] Initializing system components...');
    const initStart = Date.now();

    try {
      // Create event bus
      this.components.eventBus = new EventEmitter();
      this.components.eventBus.setMaxListeners(100);

      // Initialize components in dependency order
      await this.initializeLLM();
      await this.initializeMemory();
      await this.initializeTools();

      // Optional components
      if (this.config.enableCheckpointing) {
        await this.initializeCheckpointing();
      }

      if (this.config.enableSandbox) {
        await this.initializeSandbox();
      }

      if (this.config.enableBrowser) {
        await this.initializeBrowser();
      }

      // Initialize orchestrator and planner (depends on LLM and memory)
      await this.initializeOrchestrator();
      await this.initializePlanner();

      // Start health monitoring
      this.startHealthMonitoring();

      this.initialized = true;

      const initTime = Date.now() - initStart;
      console.log(`[SystemIntegrator] System initialized in ${initTime}ms`);
      this.emit('initialized', { duration: initTime });

      return this.components as SystemComponents;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SystemIntegrator] Initialization failed:', errorMessage);
      this.emit('error', { phase: 'initialization', error: errorMessage });
      throw error;
    }
  }

  /**
   * Initialize LLM client
   */
  private async initializeLLM(): Promise<void> {
    console.log('[SystemIntegrator] Initializing LLM client...');
    const provider = this.config.llmConfig.provider;
    const apiKey = this.config.llmConfig.apiKey || '';

    try {
      const isPlaceholder = !apiKey ||
        apiKey.includes('your-key') ||
        apiKey.includes('your_key') ||
        apiKey.includes('your-api-key') ||
        apiKey.length < 20;

      if (isPlaceholder) {
        console.warn('[SystemIntegrator] No valid API key found - running in demo mode');
        console.warn('[SystemIntegrator] Set GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env for full functionality');
        console.warn(`[SystemIntegrator] Provider: ${provider}, Key length: ${apiKey.length}`);
        // Create a mock LLM client for demo mode
        this.components.llm = {
          chat: async () => 'Demo mode: Please configure a valid API key in .env to enable AI features.',
          stream: async function* () { yield 'Demo mode: Please configure a valid API key in .env to enable AI features.'; },
        } as any;
        return;
      }

      console.log(`[SystemIntegrator] Connecting to ${provider} (key: ${apiKey.substring(0, 8)}...)`);
      this.components.llm = createLLMClient(this.config.llmConfig);

      // Verify LLM is working
      console.log('[SystemIntegrator] Testing LLM connection...');
      await this.components.llm.chat([
        { role: 'system', content: 'You are a test assistant.' },
        { role: 'user', content: 'Hello' },
      ]);

      console.log(`[SystemIntegrator] LLM initialized successfully (${provider})`);
    } catch (error) {
      console.error('[SystemIntegrator] LLM initialization failed:', error);
      console.warn('[SystemIntegrator] Running in demo mode due to LLM initialization failure');
      // Create a mock LLM client for demo mode
      this.components.llm = {
        chat: async () => 'Demo mode: LLM initialization failed. Please check your API key in .env',
        stream: async function* () { yield 'Demo mode: LLM initialization failed. Please check your API key in .env'; },
      } as any;
    }
  }

  /**
   * Initialize memory store
   */
  private async initializeMemory(): Promise<void> {
    console.log('[SystemIntegrator] Initializing memory store...');

    this.components.memory = createMemoryStore(
      this.config.memoryType,
      this.config.memoryPath
    );

    console.log(`[SystemIntegrator] Memory store initialized (${this.config.memoryType})`);
  }

  /**
   * Initialize sandbox environment
   */
  private async initializeSandbox(): Promise<void> {
    console.log('[SystemIntegrator] Initializing sandbox...');

    this.components.sandbox = createVMSandbox(this.config.sandboxConfig);

    // Register shutdown handler
    this.shutdownHandlers.push(async () => {
      if (this.components.sandbox) {
        await this.components.sandbox.cleanup();
      }
    });

    console.log('[SystemIntegrator] Sandbox initialized');
  }

  /**
   * Initialize browser automation
   */
  private async initializeBrowser(): Promise<void> {
    console.log('[SystemIntegrator] Initializing browser automation...');

    const browserConfig: BrowserAutomationConfig = {
      headless: true,
      ...this.config.browserConfig,
    };

    this.components.browser = createBrowserAutomation(browserConfig);

    // Set up browser event forwarding
    this.components.browser.on('action', (data) => {
      this.components.eventBus!.emit('browser:action', data);
    });

    this.components.browser.on('error', (data) => {
      this.components.eventBus!.emit('browser:error', data);
    });

    // Register shutdown handler
    this.shutdownHandlers.push(async () => {
      if (this.components.browser) {
        await this.components.browser.dispose();
      }
    });

    console.log('[SystemIntegrator] Browser automation initialized');
  }

  /**
   * Initialize checkpointing system
   */
  private async initializeCheckpointing(): Promise<void> {
    console.log('[SystemIntegrator] Initializing checkpoint manager...');

    this.components.checkpointManager = await createCheckpointManager({
      storageDir: '.alabobai/checkpoints',
      autoSaveInterval: 30000,
      ...this.config.checkpointConfig,
    });

    // Set up checkpoint event forwarding
    this.components.checkpointManager.on('checkpoint-created', (data) => {
      this.components.eventBus!.emit('checkpoint:created', data);
    });

    // Register shutdown handler
    this.shutdownHandlers.push(async () => {
      if (this.components.checkpointManager) {
        await this.components.checkpointManager.shutdown();
      }
    });

    console.log('[SystemIntegrator] Checkpoint manager initialized');
  }

  /**
   * Initialize orchestrator
   */
  private async initializeOrchestrator(): Promise<void> {
    console.log('[SystemIntegrator] Initializing orchestrator...');

    if (!this.components.llm || !this.components.memory) {
      throw new Error('LLM and Memory must be initialized before Orchestrator');
    }

    this.components.orchestrator = createOrchestrator(
      this.components.llm,
      this.components.memory,
      this.config.orchestratorConfig
    );

    // Set up orchestrator event forwarding
    this.components.orchestrator.on('progress', (data) => {
      this.components.eventBus!.emit('orchestrator:progress', data);
    });

    this.components.orchestrator.on('approval-requested', (data) => {
      this.components.eventBus!.emit('orchestrator:approval', data);
    });

    // Register shutdown handler
    this.shutdownHandlers.push(async () => {
      if (this.components.orchestrator) {
        await this.components.orchestrator.shutdown();
      }
    });

    console.log('[SystemIntegrator] Orchestrator initialized');
  }

  /**
   * Initialize task planner
   */
  private async initializePlanner(): Promise<void> {
    console.log('[SystemIntegrator] Initializing planner...');

    if (!this.components.llm) {
      throw new Error('LLM must be initialized before Planner');
    }

    this.components.planner = createTaskDecomposer(this.components.llm, {
      maxDepth: 3,
      maxSubtasks: 10,
    });

    console.log('[SystemIntegrator] Planner initialized');
  }

  /**
   * Initialize tool registry
   */
  private async initializeTools(): Promise<void> {
    console.log('[SystemIntegrator] Initializing tools...');

    this.components.tools = new Map();

    // System tools will be registered by AgentLoop
    // This just creates the container

    console.log('[SystemIntegrator] Tool registry initialized');
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      const health = await this.checkHealth();
      this.emit('health-check', health);

      if (health.overall !== 'healthy') {
        console.warn('[SystemIntegrator] System health degraded:', health);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Check health of all components
   */
  async checkHealth(): Promise<SystemHealth> {
    const health: SystemHealth = {
      overall: 'healthy',
      components: {
        llm: { status: 'disabled' },
        memory: { status: 'disabled' },
        sandbox: { status: 'disabled' },
        browser: { status: 'disabled' },
        checkpoint: { status: 'disabled' },
        orchestrator: { status: 'disabled' },
      },
      lastCheck: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
    };

    // Check LLM
    if (this.components.llm) {
      try {
        const start = Date.now();
        await this.components.llm.chat([
          { role: 'user', content: 'ping' },
        ]);
        health.components.llm = {
          status: 'healthy',
          latency: Date.now() - start,
        };
      } catch (error) {
        health.components.llm = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        health.overall = 'degraded';
      }
    }

    // Check Memory
    if (this.components.memory) {
      try {
        const start = Date.now();
        await this.components.memory.recall('health-check', 'test');
        health.components.memory = {
          status: 'healthy',
          latency: Date.now() - start,
        };
      } catch (error) {
        health.components.memory = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        health.overall = 'degraded';
      }
    }

    // Check Sandbox
    if (this.components.sandbox) {
      const envs = this.components.sandbox.getAllEnvironments();
      health.components.sandbox = {
        status: 'healthy',
        details: { activeEnvironments: envs.length },
      };
    }

    // Check Browser
    if (this.components.browser) {
      health.components.browser = {
        status: this.components.browser.isRunning() ? 'healthy' : 'degraded',
        details: { running: this.components.browser.isRunning() },
      };
    }

    // Check Checkpointing
    if (this.components.checkpointManager) {
      const stats = this.components.checkpointManager.getStats();
      health.components.checkpoint = {
        status: 'healthy',
        details: stats,
      };
    }

    // Check Orchestrator
    if (this.components.orchestrator) {
      const stats = this.components.orchestrator.getStats();
      health.components.orchestrator = {
        status: 'healthy',
        details: stats,
      };
    }

    // Determine overall health
    const statuses = Object.values(health.components)
      .filter((c) => c.status !== 'disabled')
      .map((c) => c.status);

    if (statuses.includes('unhealthy')) {
      health.overall = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      health.overall = 'degraded';
    }

    return health;
  }

  // ============================================================================
  // GRACEFUL SHUTDOWN
  // ============================================================================

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`[SystemIntegrator] Received ${signal}, starting graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', async (error) => {
      console.error('[SystemIntegrator] Uncaught exception:', error);
      await this.shutdown();
      process.exit(1);
    });
    process.on('unhandledRejection', async (reason) => {
      console.error('[SystemIntegrator] Unhandled rejection:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * Gracefully shutdown all components
   */
  async shutdown(): Promise<void> {
    console.log('[SystemIntegrator] Shutting down...');

    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Execute shutdown handlers in reverse order
    for (const handler of this.shutdownHandlers.reverse()) {
      try {
        await handler();
      } catch (error) {
        console.error('[SystemIntegrator] Shutdown handler error:', error);
      }
    }

    this.initialized = false;
    this.emit('shutdown');
    console.log('[SystemIntegrator] Shutdown complete');
  }

  // ============================================================================
  // COMPONENT ACCESS
  // ============================================================================

  /**
   * Get all components
   */
  getComponents(): SystemComponents {
    if (!this.initialized) {
      throw new Error('System not initialized. Call initialize() first.');
    }
    return this.components as SystemComponents;
  }

  /**
   * Get specific component
   */
  getComponent<K extends keyof SystemComponents>(name: K): SystemComponents[K] {
    if (!this.initialized) {
      throw new Error('System not initialized. Call initialize() first.');
    }
    return this.components[name] as SystemComponents[K];
  }

  /**
   * Check if system is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get system uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get configuration
   */
  getConfig(): Required<IntegrationConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<IntegrationConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
    this.emit('config-updated', this.config);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a system integrator
 */
export function createSystemIntegrator(config?: IntegrationConfig): SystemIntegrator {
  return new SystemIntegrator(config);
}

/**
 * Create and initialize a system integrator
 */
export async function initializeSystem(config?: IntegrationConfig): Promise<SystemComponents> {
  const integrator = new SystemIntegrator(config);
  return await integrator.initialize();
}

export default SystemIntegrator;
