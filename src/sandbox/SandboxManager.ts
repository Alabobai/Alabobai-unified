/**
 * Alabobai Sandbox Manager
 * Manages Docker-based sandboxes for secure task execution
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Sandbox, SandboxConfig, SandboxStatus, ExecutionRequest, ExecutionResult, ExecutionLanguage } from './Sandbox.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SandboxManagerConfig {
  dockerSocketPath?: string;
  defaultImageName?: string;
  workspaceBaseDir?: string;
  maxConcurrentSandboxes?: number;
  defaultMemoryLimit?: number; // bytes
  defaultCpuLimit?: number; // CPU shares
  defaultTimeout?: number; // ms
  enableNetworkByDefault?: boolean;
  autoCleanupInterval?: number; // ms
  maxIdleTime?: number; // ms
}

export interface CreateSandboxOptions {
  taskId: string;
  memoryLimit?: number;
  cpuLimit?: number;
  networkEnabled?: boolean;
  timeout?: number;
  workspaceFiles?: Record<string, string | Buffer>;
}

export interface SandboxManagerStatus {
  activeSandboxes: number;
  maxSandboxes: number;
  dockerConnected: boolean;
  imageAvailable: boolean;
  sandboxes: SandboxStatus[];
}

export interface BatchExecutionRequest {
  sandboxId?: string;
  taskId?: string;
  language: ExecutionLanguage;
  code: string;
  timeout?: number;
  workDir?: string;
  env?: Record<string, string>;
  files?: Record<string, string | Buffer>;
}

export interface BatchExecutionResult extends ExecutionResult {
  sandboxId: string;
  taskId: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<SandboxManagerConfig> = {
  dockerSocketPath: '/var/run/docker.sock',
  defaultImageName: 'alabobai/sandbox:latest',
  workspaceBaseDir: path.join(os.tmpdir(), 'alabobai-sandboxes'),
  maxConcurrentSandboxes: 10,
  defaultMemoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
  defaultCpuLimit: 1024, // Default CPU shares
  defaultTimeout: 300000, // 5 minutes
  enableNetworkByDefault: false,
  autoCleanupInterval: 60000, // 1 minute
  maxIdleTime: 600000, // 10 minutes
};

// ============================================================================
// SANDBOX MANAGER CLASS
// ============================================================================

export class SandboxManager extends EventEmitter {
  private docker: Docker;
  private config: Required<SandboxManagerConfig>;
  private sandboxes: Map<string, Sandbox> = new Map();
  private taskToSandbox: Map<string, string> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  private imageAvailable: boolean = false;

  constructor(config: SandboxManagerConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.docker = new Docker({ socketPath: this.config.dockerSocketPath });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the sandbox manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[SandboxManager] Initializing...');

    try {
      // Test Docker connection
      await this.docker.ping();
      console.log('[SandboxManager] Docker connection established');

      // Check if sandbox image exists
      await this.checkOrBuildImage();

      // Create workspace base directory
      await fs.mkdir(this.config.workspaceBaseDir, { recursive: true });
      console.log(`[SandboxManager] Workspace directory: ${this.config.workspaceBaseDir}`);

      // Start auto-cleanup
      this.startAutoCleanup();

      this.initialized = true;
      console.log('[SandboxManager] Initialization complete');
      this.emit('initialized');

    } catch (error) {
      console.error('[SandboxManager] Initialization failed:', error);
      throw new Error(`Failed to initialize SandboxManager: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Shutdown the sandbox manager
   */
  async shutdown(): Promise<void> {
    console.log('[SandboxManager] Shutting down...');

    // Stop auto-cleanup
    this.stopAutoCleanup();

    // Stop all sandboxes
    const stopPromises = Array.from(this.sandboxes.values()).map(sandbox =>
      sandbox.stop().catch(err => console.warn(`[SandboxManager] Error stopping sandbox:`, err))
    );
    await Promise.all(stopPromises);

    this.sandboxes.clear();
    this.taskToSandbox.clear();
    this.initialized = false;

    console.log('[SandboxManager] Shutdown complete');
    this.emit('shutdown');
  }

  // ============================================================================
  // SANDBOX LIFECYCLE
  // ============================================================================

  /**
   * Create a new sandbox for a task
   */
  async createSandbox(options: CreateSandboxOptions): Promise<Sandbox> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check concurrent sandbox limit
    if (this.sandboxes.size >= this.config.maxConcurrentSandboxes) {
      throw new Error(`Maximum concurrent sandboxes (${this.config.maxConcurrentSandboxes}) reached`);
    }

    // Check if task already has a sandbox
    const existingSandboxId = this.taskToSandbox.get(options.taskId);
    if (existingSandboxId) {
      const existing = this.sandboxes.get(existingSandboxId);
      if (existing && existing.isRunning()) {
        console.log(`[SandboxManager] Reusing existing sandbox for task: ${options.taskId}`);
        return existing;
      }
    }

    const sandboxId = uuid();
    const workspacePath = path.join(this.config.workspaceBaseDir, sandboxId);

    console.log(`[SandboxManager] Creating sandbox: ${sandboxId} for task: ${options.taskId}`);

    const sandboxConfig: SandboxConfig = {
      id: sandboxId,
      taskId: options.taskId,
      memoryLimit: options.memoryLimit ?? this.config.defaultMemoryLimit,
      cpuLimit: options.cpuLimit ?? this.config.defaultCpuLimit,
      networkEnabled: options.networkEnabled ?? this.config.enableNetworkByDefault,
      workspacePath,
      imageName: this.config.defaultImageName,
      timeout: options.timeout ?? this.config.defaultTimeout,
    };

    const sandbox = new Sandbox(this.docker, sandboxConfig);

    // Forward events
    sandbox.on('started', (data) => this.emit('sandbox-started', data));
    sandbox.on('stopped', (data) => this.emit('sandbox-stopped', data));
    sandbox.on('execution-completed', (data) => this.emit('execution-completed', data));

    try {
      // Start the sandbox
      await sandbox.start();

      // Write initial files if provided
      if (options.workspaceFiles) {
        for (const [filePath, content] of Object.entries(options.workspaceFiles)) {
          await sandbox.writeFile(filePath, content);
        }
      }

      this.sandboxes.set(sandboxId, sandbox);
      this.taskToSandbox.set(options.taskId, sandboxId);

      console.log(`[SandboxManager] Sandbox created successfully: ${sandboxId}`);
      return sandbox;

    } catch (error) {
      // Cleanup on failure
      await sandbox.stop().catch(() => {});
      await this.cleanupWorkspace(workspacePath);
      throw error;
    }
  }

  /**
   * Get a sandbox by ID
   */
  getSandbox(sandboxId: string): Sandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Get a sandbox by task ID
   */
  getSandboxByTask(taskId: string): Sandbox | undefined {
    const sandboxId = this.taskToSandbox.get(taskId);
    return sandboxId ? this.sandboxes.get(sandboxId) : undefined;
  }

  /**
   * Destroy a sandbox
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      console.warn(`[SandboxManager] Sandbox not found: ${sandboxId}`);
      return;
    }

    console.log(`[SandboxManager] Destroying sandbox: ${sandboxId}`);

    const taskId = sandbox.getTaskId();
    const workspacePath = sandbox.getWorkspacePath();

    await sandbox.stop();

    // Cleanup workspace
    await this.cleanupWorkspace(workspacePath);

    this.sandboxes.delete(sandboxId);
    this.taskToSandbox.delete(taskId);

    console.log(`[SandboxManager] Sandbox destroyed: ${sandboxId}`);
  }

  /**
   * Destroy sandbox by task ID
   */
  async destroySandboxByTask(taskId: string): Promise<void> {
    const sandboxId = this.taskToSandbox.get(taskId);
    if (sandboxId) {
      await this.destroySandbox(sandboxId);
    }
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Execute code in a sandbox (creates one if needed)
   */
  async execute(request: BatchExecutionRequest): Promise<BatchExecutionResult> {
    const taskId = request.taskId ?? `task-${uuid()}`;
    let sandbox: Sandbox;

    // Get or create sandbox
    if (request.sandboxId) {
      const existing = this.sandboxes.get(request.sandboxId);
      if (!existing) {
        throw new Error(`Sandbox not found: ${request.sandboxId}`);
      }
      sandbox = existing;
    } else {
      sandbox = await this.createSandbox({
        taskId,
        workspaceFiles: request.files,
      });
    }

    // Write additional files if provided
    if (request.files && !request.sandboxId) {
      for (const [filePath, content] of Object.entries(request.files)) {
        await sandbox.writeFile(filePath, content);
      }
    }

    // Execute the code
    const result = await sandbox.execute({
      language: request.language,
      code: request.code,
      timeout: request.timeout,
      workDir: request.workDir,
      env: request.env,
    });

    return {
      ...result,
      sandboxId: sandbox.getId(),
      taskId: sandbox.getTaskId(),
    };
  }

  /**
   * Execute shell command
   */
  async executeShell(taskId: string, command: string, timeout?: number): Promise<BatchExecutionResult> {
    return this.execute({
      taskId,
      language: 'shell',
      code: command,
      timeout,
    });
  }

  /**
   * Execute Python code
   */
  async executePython(taskId: string, code: string, timeout?: number): Promise<BatchExecutionResult> {
    return this.execute({
      taskId,
      language: 'python',
      code,
      timeout,
    });
  }

  /**
   * Execute Node.js code
   */
  async executeNode(taskId: string, code: string, timeout?: number): Promise<BatchExecutionResult> {
    return this.execute({
      taskId,
      language: 'node',
      code,
      timeout,
    });
  }

  // ============================================================================
  // IMAGE MANAGEMENT
  // ============================================================================

  private async checkOrBuildImage(): Promise<void> {
    try {
      // Check if image exists
      const images = await this.docker.listImages({
        filters: { reference: [this.config.defaultImageName] },
      });

      if (images.length > 0) {
        this.imageAvailable = true;
        console.log(`[SandboxManager] Sandbox image found: ${this.config.defaultImageName}`);
        return;
      }

      // Try to pull the image
      console.log(`[SandboxManager] Pulling sandbox image: ${this.config.defaultImageName}`);
      await this.pullImage(this.config.defaultImageName);
      this.imageAvailable = true;

    } catch (error) {
      console.warn(`[SandboxManager] Image not available, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Use a fallback public image
      const fallbackImage = 'ubuntu:22.04';
      console.log(`[SandboxManager] Attempting to use fallback image: ${fallbackImage}`);

      try {
        const fallbackImages = await this.docker.listImages({
          filters: { reference: [fallbackImage] },
        });

        if (fallbackImages.length === 0) {
          await this.pullImage(fallbackImage);
        }

        // Update config to use fallback
        this.config.defaultImageName = fallbackImage;
        this.imageAvailable = true;
        console.log(`[SandboxManager] Using fallback image: ${fallbackImage}`);

      } catch (fallbackError) {
        console.error('[SandboxManager] Failed to get fallback image:', fallbackError);
        throw new Error('No suitable Docker image available for sandbox');
      }
    }
  }

  private async pullImage(imageName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        if (!stream) {
          reject(new Error('No pull stream returned'));
          return;
        }

        this.docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Build the sandbox image from Dockerfile
   */
  async buildImage(dockerfilePath: string, imageName?: string): Promise<void> {
    const targetImage = imageName ?? this.config.defaultImageName;
    console.log(`[SandboxManager] Building sandbox image: ${targetImage}`);

    const dockerfileDir = path.dirname(dockerfilePath);

    return new Promise<void>((resolve, reject) => {
      this.docker.buildImage(
        {
          context: dockerfileDir,
          src: ['Dockerfile'],
        },
        {
          t: targetImage,
          rm: true,
        },
        (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
          if (err) {
            reject(err);
            return;
          }

          if (!stream) {
            reject(new Error('No build stream returned'));
            return;
          }

          this.docker.modem.followProgress(
            stream,
            (err: Error | null) => {
              if (err) {
                reject(err);
              } else {
                this.imageAvailable = true;
                console.log(`[SandboxManager] Image built successfully: ${targetImage}`);
                resolve();
              }
            },
            (event: { stream?: string }) => {
              if (event.stream) {
                process.stdout.write(event.stream);
              }
            }
          );
        }
      );
    });
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  private startAutoCleanup(): void {
    if (this.cleanupIntervalId) {
      return;
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupIdleSandboxes().catch(err =>
        console.error('[SandboxManager] Auto-cleanup error:', err)
      );
    }, this.config.autoCleanupInterval);

    console.log(`[SandboxManager] Auto-cleanup started (interval: ${this.config.autoCleanupInterval}ms)`);
  }

  private stopAutoCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      console.log('[SandboxManager] Auto-cleanup stopped');
    }
  }

  private async cleanupIdleSandboxes(): Promise<void> {
    const now = Date.now();
    const toCleanup: string[] = [];

    for (const [id, sandbox] of this.sandboxes) {
      const status = sandbox.getStatus();
      const idleTime = now - status.lastActivityAt.getTime();

      if (status.state === 'idle' && idleTime > this.config.maxIdleTime) {
        toCleanup.push(id);
      }
    }

    if (toCleanup.length > 0) {
      console.log(`[SandboxManager] Cleaning up ${toCleanup.length} idle sandboxes`);
      for (const id of toCleanup) {
        await this.destroySandbox(id).catch(err =>
          console.error(`[SandboxManager] Failed to cleanup sandbox ${id}:`, err)
        );
      }
    }
  }

  private async cleanupWorkspace(workspacePath: string): Promise<void> {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[SandboxManager] Failed to cleanup workspace: ${workspacePath}`, error);
    }
  }

  /**
   * Cleanup orphaned containers
   */
  async cleanupOrphanedContainers(): Promise<number> {
    console.log('[SandboxManager] Cleaning up orphaned containers...');

    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: ['alabobai.sandbox=true'],
      },
    });

    let cleaned = 0;
    for (const containerInfo of containers) {
      const id = containerInfo.Id;
      const sandboxId = containerInfo.Labels['alabobai.sandbox-id'];

      if (!this.sandboxes.has(sandboxId)) {
        console.log(`[SandboxManager] Removing orphaned container: ${id.substring(0, 12)}`);
        try {
          const container = this.docker.getContainer(id);
          await container.remove({ force: true, v: true });
          cleaned++;
        } catch (error) {
          console.warn(`[SandboxManager] Failed to remove orphaned container:`, error);
        }
      }
    }

    console.log(`[SandboxManager] Cleaned up ${cleaned} orphaned containers`);
    return cleaned;
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  /**
   * Get manager status
   */
  getStatus(): SandboxManagerStatus {
    return {
      activeSandboxes: this.sandboxes.size,
      maxSandboxes: this.config.maxConcurrentSandboxes,
      dockerConnected: this.initialized,
      imageAvailable: this.imageAvailable,
      sandboxes: Array.from(this.sandboxes.values()).map(s => s.getStatus()),
    };
  }

  /**
   * Get all active sandboxes
   */
  getSandboxes(): Sandbox[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Required<SandboxManagerConfig>> {
    return { ...this.config };
  }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

let sandboxManagerInstance: SandboxManager | null = null;

/**
 * Create a new SandboxManager instance
 */
export function createSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  return new SandboxManager(config);
}

/**
 * Get or create the singleton SandboxManager instance
 */
export function getSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager(config);
  }
  return sandboxManagerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSandboxManager(): void {
  if (sandboxManagerInstance) {
    sandboxManagerInstance.shutdown().catch(console.error);
    sandboxManagerInstance = null;
  }
}

export default SandboxManager;
