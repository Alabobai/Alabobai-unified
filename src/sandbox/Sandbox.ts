/**
 * Alabobai Sandbox - Individual Container Instance
 * Represents a single isolated Docker container for task execution
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============================================================================
// TYPES
// ============================================================================

export type ExecutionLanguage = 'shell' | 'python' | 'node';

export interface ExecutionRequest {
  language: ExecutionLanguage;
  code: string;
  timeout?: number; // ms, default 300000 (5 min)
  workDir?: string;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number; // ms
  timedOut: boolean;
  error?: string;
}

export interface SandboxConfig {
  id: string;
  taskId: string;
  memoryLimit: number; // bytes, default 2GB
  cpuLimit: number; // CPU shares, default 1024
  networkEnabled: boolean;
  workspacePath: string;
  imageName: string;
  timeout: number; // container timeout in ms
}

export interface SandboxStatus {
  id: string;
  containerId?: string;
  state: 'creating' | 'running' | 'idle' | 'executing' | 'stopped' | 'error';
  createdAt: Date;
  lastActivityAt: Date;
  executionCount: number;
  error?: string;
}

// ============================================================================
// SANDBOX CLASS
// ============================================================================

export class Sandbox extends EventEmitter {
  private docker: Docker;
  private config: SandboxConfig;
  private container: Docker.Container | null = null;
  private status: SandboxStatus;
  private executions: Map<string, AbortController> = new Map();

  constructor(docker: Docker, config: SandboxConfig) {
    super();
    this.docker = docker;
    this.config = config;
    this.status = {
      id: config.id,
      state: 'creating',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      executionCount: 0,
    };
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Initialize and start the container
   */
  async start(): Promise<void> {
    try {
      console.log(`[Sandbox:${this.config.id}] Starting container...`);

      // Ensure workspace directory exists
      await fs.mkdir(this.config.workspacePath, { recursive: true });

      // Create container
      this.container = await this.docker.createContainer({
        Image: this.config.imageName,
        name: `alabobai-sandbox-${this.config.id}`,
        Tty: true,
        OpenStdin: true,
        WorkingDir: '/workspace',
        Env: [
          'PYTHONUNBUFFERED=1',
          'NODE_ENV=production',
          'HOME=/root',
          'TERM=xterm-256color',
        ],
        HostConfig: {
          Memory: this.config.memoryLimit,
          MemorySwap: this.config.memoryLimit, // No swap
          CpuShares: this.config.cpuLimit,
          NetworkMode: this.config.networkEnabled ? 'bridge' : 'none',
          Binds: [`${this.config.workspacePath}:/workspace:rw`],
          SecurityOpt: ['no-new-privileges:true'],
          ReadonlyRootfs: false,
          CapDrop: ['ALL'],
          CapAdd: ['CHOWN', 'SETUID', 'SETGID'],
          // Prevent fork bombs
          Ulimits: [
            { Name: 'nproc', Soft: 1024, Hard: 2048 },
            { Name: 'nofile', Soft: 65536, Hard: 65536 },
          ],
          // Limit disk usage
          StorageOpt: {
            size: '5G',
          },
        },
        Labels: {
          'alabobai.sandbox': 'true',
          'alabobai.task-id': this.config.taskId,
          'alabobai.sandbox-id': this.config.id,
        },
      });

      // Start container
      await this.container.start();

      this.status.containerId = this.container.id;
      this.status.state = 'idle';
      this.status.lastActivityAt = new Date();

      console.log(`[Sandbox:${this.config.id}] Container started: ${this.container.id.substring(0, 12)}`);
      this.emit('started', { sandboxId: this.config.id, containerId: this.container.id });

    } catch (error) {
      this.status.state = 'error';
      this.status.error = error instanceof Error ? error.message : 'Failed to start container';
      console.error(`[Sandbox:${this.config.id}] Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Stop and remove the container
   */
  async stop(): Promise<void> {
    if (!this.container) {
      return;
    }

    try {
      console.log(`[Sandbox:${this.config.id}] Stopping container...`);

      // Cancel any running executions
      for (const [execId, controller] of this.executions) {
        controller.abort();
        console.log(`[Sandbox:${this.config.id}] Aborted execution: ${execId}`);
      }
      this.executions.clear();

      // Stop container with timeout
      try {
        await this.container.stop({ t: 5 });
      } catch (error) {
        // Container might already be stopped
        if (!(error instanceof Error && error.message.includes('already stopped'))) {
          console.warn(`[Sandbox:${this.config.id}] Stop warning:`, error);
        }
      }

      // Remove container
      try {
        await this.container.remove({ force: true, v: true });
      } catch (error) {
        console.warn(`[Sandbox:${this.config.id}] Remove warning:`, error);
      }

      this.status.state = 'stopped';
      this.container = null;

      console.log(`[Sandbox:${this.config.id}] Container stopped and removed`);
      this.emit('stopped', { sandboxId: this.config.id });

    } catch (error) {
      console.error(`[Sandbox:${this.config.id}] Error stopping container:`, error);
      this.status.state = 'error';
      this.status.error = error instanceof Error ? error.message : 'Failed to stop container';
      throw error;
    }
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Execute code in the sandbox
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.container) {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: 'Sandbox container not running',
        duration: 0,
        timedOut: false,
        error: 'Container not started',
      };
    }

    if (this.status.state !== 'idle') {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `Sandbox is ${this.status.state}, cannot execute`,
        duration: 0,
        timedOut: false,
        error: 'Sandbox busy',
      };
    }

    const execId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const controller = new AbortController();
    this.executions.set(execId, controller);

    const timeout = request.timeout ?? 300000; // 5 minutes default
    const startTime = Date.now();

    try {
      this.status.state = 'executing';
      this.status.lastActivityAt = new Date();

      console.log(`[Sandbox:${this.config.id}] Executing ${request.language} code (timeout: ${timeout}ms)`);

      // Build the execution command based on language
      const { cmd, shell } = this.buildCommand(request);

      // Prepare command array
      const cmdArray: string[] = shell ? ['sh', '-c', typeof cmd === 'string' ? cmd : cmd.join(' ')] : (typeof cmd === 'string' ? [cmd] : cmd);

      // Create exec instance
      const exec = await this.container.exec({
        Cmd: cmdArray,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: request.workDir ?? '/workspace',
        Env: request.env ? Object.entries(request.env).map(([k, v]) => `${k}=${v}`) : undefined,
      });

      // Start exec and capture output
      const result = await this.runExecWithTimeout(exec, timeout, controller.signal);

      const duration = Date.now() - startTime;
      this.status.executionCount++;
      this.status.state = 'idle';
      this.status.lastActivityAt = new Date();

      const executionResult: ExecutionResult = {
        success: result.exitCode === 0 && !result.timedOut,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration,
        timedOut: result.timedOut,
        error: result.timedOut ? 'Execution timed out' : undefined,
      };

      console.log(`[Sandbox:${this.config.id}] Execution completed: exit=${result.exitCode}, duration=${duration}ms`);
      this.emit('execution-completed', { sandboxId: this.config.id, result: executionResult });

      return executionResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.status.state = 'idle';
      this.status.lastActivityAt = new Date();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Sandbox:${this.config.id}] Execution failed:`, error);

      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: errorMessage,
        duration,
        timedOut: false,
        error: errorMessage,
      };

    } finally {
      this.executions.delete(execId);
    }
  }

  /**
   * Execute a shell command
   */
  async executeShell(command: string, timeout?: number): Promise<ExecutionResult> {
    return this.execute({
      language: 'shell',
      code: command,
      timeout,
    });
  }

  /**
   * Execute Python code
   */
  async executePython(code: string, timeout?: number): Promise<ExecutionResult> {
    return this.execute({
      language: 'python',
      code,
      timeout,
    });
  }

  /**
   * Execute Node.js code
   */
  async executeNode(code: string, timeout?: number): Promise<ExecutionResult> {
    return this.execute({
      language: 'node',
      code,
      timeout,
    });
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Write a file to the workspace
   */
  async writeFile(relativePath: string, content: string | Buffer): Promise<void> {
    const fullPath = path.join(this.config.workspacePath, relativePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  /**
   * Read a file from the workspace
   */
  async readFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.config.workspacePath, relativePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Check if a file exists in the workspace
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.config.workspacePath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files in the workspace
   */
  async listFiles(relativePath: string = ''): Promise<string[]> {
    const fullPath = path.join(this.config.workspacePath, relativePath);
    try {
      return await fs.readdir(fullPath);
    } catch {
      return [];
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private buildCommand(request: ExecutionRequest): { cmd: string[] | string; shell: boolean } {
    switch (request.language) {
      case 'shell':
        return { cmd: request.code, shell: true };

      case 'python':
        // Write code to temp file and execute
        return {
          cmd: `python3 -c ${this.escapeShellArg(request.code)}`,
          shell: true,
        };

      case 'node':
        // Execute Node.js code directly
        return {
          cmd: `node -e ${this.escapeShellArg(request.code)}`,
          shell: true,
        };

      default:
        throw new Error(`Unsupported language: ${request.language}`);
    }
  }

  private escapeShellArg(arg: string): string {
    // Use double quotes and escape special characters
    return `"${arg.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
  }

  private async runExecWithTimeout(
    exec: Docker.Exec,
    timeout: number,
    signal: AbortSignal
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise(async (resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let resolved = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode: 124, timedOut: true });
        }
      }, timeout);

      // Handle abort signal
      signal.addEventListener('abort', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve({ stdout, stderr, exitCode: 130, timedOut: false });
        }
      });

      try {
        const stream = await exec.start({ Detach: false, Tty: false });

        // Demux stdout and stderr
        this.docker.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => {
              stdout += chunk.toString();
            },
          } as Writable,
          {
            write: (chunk: Buffer) => {
              stderr += chunk.toString();
            },
          } as Writable
        );

        // Wait for stream to end
        await new Promise<void>((streamResolve) => {
          stream.on('end', streamResolve);
          stream.on('error', (err: Error) => {
            if (!resolved) {
              stderr += `\nStream error: ${err.message}`;
            }
            streamResolve();
          });
        });

        // Get exit code
        const inspectResult = await exec.inspect();
        const exitCode = inspectResult.ExitCode ?? 0;

        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode, timedOut: false });
        }

      } catch (error) {
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      }
    });
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getId(): string {
    return this.config.id;
  }

  getTaskId(): string {
    return this.config.taskId;
  }

  getContainerId(): string | undefined {
    return this.container?.id;
  }

  getStatus(): SandboxStatus {
    return { ...this.status };
  }

  getWorkspacePath(): string {
    return this.config.workspacePath;
  }

  isRunning(): boolean {
    return this.status.state === 'idle' || this.status.state === 'executing';
  }

  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config };
  }
}

export default Sandbox;
