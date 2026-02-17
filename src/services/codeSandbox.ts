/**
 * Alabobai Code Sandbox Service
 * Docker-based secure code execution for Python and JavaScript
 * Provides isolated container environments with resource limits
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { Writable } from 'stream';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type SupportedLanguage = 'python' | 'javascript' | 'typescript';

export interface ExecutionRequest {
  id?: string;
  language: SupportedLanguage;
  code: string;
  files?: Record<string, string>; // filename -> content
  packages?: string[]; // pip/npm packages to install
  timeout?: number; // ms, default 60000 (1 min)
  memoryLimit?: number; // MB, default 512
  cpuLimit?: number; // CPU shares, default 512
  networkEnabled?: boolean; // default false for security
  env?: Record<string, string>;
}

export interface ExecutionOutput {
  type: 'stdout' | 'stderr' | 'system' | 'file';
  content: string;
  timestamp: Date;
  filename?: string; // for file outputs
}

export interface ExecutionResult {
  id: string;
  success: boolean;
  exitCode: number;
  outputs: ExecutionOutput[];
  stdout: string;
  stderr: string;
  duration: number; // ms
  timedOut: boolean;
  filesCreated: string[];
  error?: string;
  status: ExecutionStatus;
}

export type ExecutionStatus =
  | 'pending'
  | 'preparing'
  | 'installing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

export interface SandboxSession {
  id: string;
  language: SupportedLanguage;
  status: ExecutionStatus;
  workspacePath: string;
  containerId?: string;
  createdAt: Date;
  updatedAt: Date;
  outputs: ExecutionOutput[];
  filesCreated: string[];
  result?: ExecutionResult;
}

export interface SandboxConfig {
  basePath: string;
  pythonImage: string;
  nodeImage: string;
  defaultTimeout: number;
  defaultMemoryLimit: number;
  defaultCpuLimit: number;
  maxConcurrentExecutions: number;
  cleanupAfterMs: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: SandboxConfig = {
  basePath: '/tmp/alabobai-sandbox',
  pythonImage: 'python:3.11-slim',
  nodeImage: 'node:20-slim',
  defaultTimeout: 60000, // 1 minute
  defaultMemoryLimit: 512, // 512 MB
  defaultCpuLimit: 512, // 50% of one CPU
  maxConcurrentExecutions: 10,
  cleanupAfterMs: 300000, // 5 minutes
};

// ============================================================================
// CODE SANDBOX SERVICE
// ============================================================================

export class CodeSandboxService extends EventEmitter {
  private docker: Docker;
  private config: SandboxConfig;
  private sessions: Map<string, SandboxSession> = new Map();
  private activeExecutions: Map<string, AbortController> = new Map();
  private cleanupIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<SandboxConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.docker = new Docker();

    // Ensure base path exists
    this.initializeBasePath();
  }

  private async initializeBasePath(): Promise<void> {
    try {
      await fs.mkdir(this.config.basePath, { recursive: true });
    } catch (error) {
      console.error('[CodeSandbox] Failed to create base path:', error);
    }
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Execute code in a sandboxed container
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = request.id || uuid();
    const session = await this.createSession(executionId, request.language);

    try {
      // Check concurrent execution limit
      if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
        throw new Error('Maximum concurrent executions reached. Please try again later.');
      }

      const controller = new AbortController();
      this.activeExecutions.set(executionId, controller);

      // Update status
      this.updateSessionStatus(executionId, 'preparing');

      // Write files to workspace
      await this.prepareWorkspace(session, request);

      // Build and run container
      const result = await this.runInContainer(session, request, controller.signal);

      // Update session with result
      session.result = result;
      session.status = result.success ? 'completed' : 'failed';
      session.updatedAt = new Date();
      this.sessions.set(executionId, session);

      // Schedule cleanup
      this.scheduleCleanup(executionId);

      this.emit('execution-completed', { executionId, result });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: ExecutionResult = {
        id: executionId,
        success: false,
        exitCode: -1,
        outputs: [{
          type: 'stderr',
          content: errorMessage,
          timestamp: new Date()
        }],
        stdout: '',
        stderr: errorMessage,
        duration: 0,
        timedOut: false,
        filesCreated: [],
        error: errorMessage,
        status: 'failed'
      };

      session.result = result;
      session.status = 'failed';
      session.updatedAt = new Date();
      this.sessions.set(executionId, session);

      this.emit('execution-error', { executionId, error: errorMessage });
      return result;

    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute code with streaming output
   */
  async executeWithStream(
    request: ExecutionRequest,
    onOutput: (output: ExecutionOutput) => void
  ): Promise<ExecutionResult> {
    const executionId = request.id || uuid();
    const session = await this.createSession(executionId, request.language);

    try {
      if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
        throw new Error('Maximum concurrent executions reached. Please try again later.');
      }

      const controller = new AbortController();
      this.activeExecutions.set(executionId, controller);

      this.updateSessionStatus(executionId, 'preparing');
      onOutput({ type: 'system', content: 'Preparing execution environment...', timestamp: new Date() });

      await this.prepareWorkspace(session, request);

      const result = await this.runInContainerWithStream(session, request, controller.signal, onOutput);

      session.result = result;
      session.status = result.success ? 'completed' : 'failed';
      session.updatedAt = new Date();
      this.sessions.set(executionId, session);

      this.scheduleCleanup(executionId);
      this.emit('execution-completed', { executionId, result });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onOutput({ type: 'stderr', content: errorMessage, timestamp: new Date() });

      const result: ExecutionResult = {
        id: executionId,
        success: false,
        exitCode: -1,
        outputs: session.outputs,
        stdout: '',
        stderr: errorMessage,
        duration: 0,
        timedOut: false,
        filesCreated: [],
        error: errorMessage,
        status: 'failed'
      };

      session.result = result;
      session.status = 'failed';
      this.sessions.set(executionId, session);

      this.emit('execution-error', { executionId, error: errorMessage });
      return result;

    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Cancel an ongoing execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const controller = this.activeExecutions.get(executionId);
    if (!controller) {
      return false;
    }

    controller.abort();
    this.updateSessionStatus(executionId, 'cancelled');
    this.emit('execution-cancelled', { executionId });
    return true;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  private async createSession(id: string, language: SupportedLanguage): Promise<SandboxSession> {
    const workspacePath = path.join(this.config.basePath, id);
    await fs.mkdir(workspacePath, { recursive: true });

    const session: SandboxSession = {
      id,
      language,
      status: 'pending',
      workspacePath,
      createdAt: new Date(),
      updatedAt: new Date(),
      outputs: [],
      filesCreated: []
    };

    this.sessions.set(id, session);
    return session;
  }

  private updateSessionStatus(id: string, status: ExecutionStatus): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      session.updatedAt = new Date();
      this.emit('status-changed', { executionId: id, status });
    }
  }

  /**
   * Get execution status
   */
  getStatus(executionId: string): SandboxSession | undefined {
    return this.sessions.get(executionId);
  }

  /**
   * Get execution output
   */
  getOutput(executionId: string): ExecutionOutput[] {
    const session = this.sessions.get(executionId);
    return session?.outputs || [];
  }

  /**
   * Get execution result
   */
  getResult(executionId: string): ExecutionResult | undefined {
    const session = this.sessions.get(executionId);
    return session?.result;
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Upload files to a sandbox workspace
   */
  async uploadFiles(executionId: string, files: Record<string, Buffer | string>): Promise<string[]> {
    const session = this.sessions.get(executionId);
    if (!session) {
      throw new Error(`Session not found: ${executionId}`);
    }

    const uploadedFiles: string[] = [];

    for (const [filename, content] of Object.entries(files)) {
      const safeName = this.sanitizeFilename(filename);
      const filePath = path.join(session.workspacePath, safeName);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      if (typeof content === 'string') {
        await fs.writeFile(filePath, content, 'utf-8');
      } else {
        await fs.writeFile(filePath, content);
      }

      uploadedFiles.push(safeName);
    }

    return uploadedFiles;
  }

  /**
   * Download a file from sandbox workspace
   */
  async downloadFile(executionId: string, filename: string): Promise<Buffer> {
    const session = this.sessions.get(executionId);
    if (!session) {
      throw new Error(`Session not found: ${executionId}`);
    }

    const safeName = this.sanitizeFilename(filename);
    const filePath = path.join(session.workspacePath, safeName);

    // Security check - ensure path is within workspace
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(session.workspacePath))) {
      throw new Error('Invalid file path: path traversal detected');
    }

    return fs.readFile(filePath);
  }

  /**
   * List files in sandbox workspace
   */
  async listFiles(executionId: string, subdir: string = ''): Promise<string[]> {
    const session = this.sessions.get(executionId);
    if (!session) {
      throw new Error(`Session not found: ${executionId}`);
    }

    const targetPath = path.join(session.workspacePath, subdir);

    // Security check
    const resolvedPath = path.resolve(targetPath);
    if (!resolvedPath.startsWith(path.resolve(session.workspacePath))) {
      throw new Error('Invalid path: path traversal detected');
    }

    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      return entries.map(entry =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
      );
    } catch {
      return [];
    }
  }

  // ============================================================================
  // CONTAINER EXECUTION
  // ============================================================================

  private async prepareWorkspace(session: SandboxSession, request: ExecutionRequest): Promise<void> {
    // Write the main code file
    const mainFile = this.getMainFilename(request.language);
    await fs.writeFile(
      path.join(session.workspacePath, mainFile),
      request.code,
      'utf-8'
    );

    // Write additional files
    if (request.files) {
      for (const [filename, content] of Object.entries(request.files)) {
        const safeName = this.sanitizeFilename(filename);
        const filePath = path.join(session.workspacePath, safeName);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }

    // Create requirements/package files if packages specified
    if (request.packages && request.packages.length > 0) {
      if (request.language === 'python') {
        await fs.writeFile(
          path.join(session.workspacePath, 'requirements.txt'),
          request.packages.join('\n'),
          'utf-8'
        );
      } else {
        const packageJson = {
          name: 'sandbox-execution',
          version: '1.0.0',
          dependencies: request.packages.reduce((acc, pkg) => {
            const [name, version = 'latest'] = pkg.split('@');
            acc[name] = version;
            return acc;
          }, {} as Record<string, string>)
        };
        await fs.writeFile(
          path.join(session.workspacePath, 'package.json'),
          JSON.stringify(packageJson, null, 2),
          'utf-8'
        );
      }
    }
  }

  private async runInContainer(
    session: SandboxSession,
    request: ExecutionRequest,
    signal: AbortSignal
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const outputs: ExecutionOutput[] = [];
    let stdout = '';
    let stderr = '';

    try {
      const image = this.getContainerImage(request.language);
      const timeout = request.timeout || this.config.defaultTimeout;
      const memoryLimit = (request.memoryLimit || this.config.defaultMemoryLimit) * 1024 * 1024;
      const cpuLimit = request.cpuLimit || this.config.defaultCpuLimit;

      // Build the execution command
      const { installCmd, runCmd } = this.buildCommands(request);

      // Create container
      const container = await this.docker.createContainer({
        Image: image,
        name: `alabobai-sandbox-${session.id}`,
        Tty: false,
        WorkingDir: '/workspace',
        Env: this.buildEnvironmentVariables(request),
        Cmd: ['sh', '-c', `${installCmd}${runCmd}`],
        HostConfig: {
          Memory: memoryLimit,
          MemorySwap: memoryLimit, // No swap
          CpuShares: cpuLimit,
          NetworkMode: request.networkEnabled ? 'bridge' : 'none',
          Binds: [`${session.workspacePath}:/workspace:rw`],
          SecurityOpt: ['no-new-privileges:true'],
          ReadonlyRootfs: false,
          CapDrop: ['ALL'],
          CapAdd: ['CHOWN', 'SETUID', 'SETGID'],
          Ulimits: [
            { Name: 'nproc', Soft: 256, Hard: 512 },
            { Name: 'nofile', Soft: 1024, Hard: 2048 },
          ],
        },
        Labels: {
          'alabobai.sandbox': 'true',
          'alabobai.execution-id': session.id,
        },
      });

      session.containerId = container.id;

      // Handle abort signal
      const abortHandler = async () => {
        try {
          await container.stop({ t: 1 });
          await container.remove({ force: true });
        } catch {
          // Ignore cleanup errors
        }
      };
      signal.addEventListener('abort', abortHandler);

      // Start container and capture output
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true
      });

      await container.start();

      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeout);
      });

      // Capture output
      const outputPromise = new Promise<void>((resolve) => {
        this.docker.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => {
              const content = chunk.toString();
              stdout += content;
              outputs.push({ type: 'stdout', content, timestamp: new Date() });
            }
          } as Writable,
          {
            write: (chunk: Buffer) => {
              const content = chunk.toString();
              stderr += content;
              outputs.push({ type: 'stderr', content, timestamp: new Date() });
            }
          } as Writable
        );
        stream.on('end', resolve);
      });

      // Wait for completion or timeout
      let timedOut = false;
      let exitCode = 0;

      try {
        await Promise.race([outputPromise, timeoutPromise]);
        const inspectResult = await container.inspect();
        exitCode = inspectResult.State?.ExitCode ?? 0;
      } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT') {
          timedOut = true;
          exitCode = 124;
          stderr += '\n[Execution timed out]';
        } else {
          throw error;
        }
      }

      // Cleanup
      signal.removeEventListener('abort', abortHandler);
      try {
        await container.stop({ t: 1 }).catch(() => {});
        await container.remove({ force: true });
      } catch {
        // Ignore cleanup errors
      }

      // List created files
      const filesCreated = await this.listCreatedFiles(session.workspacePath);

      const duration = Date.now() - startTime;

      return {
        id: session.id,
        success: exitCode === 0 && !timedOut,
        exitCode,
        outputs,
        stdout,
        stderr,
        duration,
        timedOut,
        filesCreated,
        status: timedOut ? 'timeout' : (exitCode === 0 ? 'completed' : 'failed')
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        id: session.id,
        success: false,
        exitCode: -1,
        outputs,
        stdout,
        stderr: stderr + '\n' + errorMessage,
        duration,
        timedOut: false,
        filesCreated: [],
        error: errorMessage,
        status: 'failed'
      };
    }
  }

  private async runInContainerWithStream(
    session: SandboxSession,
    request: ExecutionRequest,
    signal: AbortSignal,
    onOutput: (output: ExecutionOutput) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    try {
      const image = this.getContainerImage(request.language);
      const timeout = request.timeout || this.config.defaultTimeout;
      const memoryLimit = (request.memoryLimit || this.config.defaultMemoryLimit) * 1024 * 1024;
      const cpuLimit = request.cpuLimit || this.config.defaultCpuLimit;

      // Pull image if needed (with status updates)
      onOutput({ type: 'system', content: `Using image: ${image}`, timestamp: new Date() });

      const { installCmd, runCmd } = this.buildCommands(request);

      if (installCmd) {
        onOutput({ type: 'system', content: 'Installing dependencies...', timestamp: new Date() });
        this.updateSessionStatus(session.id, 'installing');
      }

      const container = await this.docker.createContainer({
        Image: image,
        name: `alabobai-sandbox-${session.id}`,
        Tty: false,
        WorkingDir: '/workspace',
        Env: this.buildEnvironmentVariables(request),
        Cmd: ['sh', '-c', `${installCmd}${runCmd}`],
        HostConfig: {
          Memory: memoryLimit,
          MemorySwap: memoryLimit,
          CpuShares: cpuLimit,
          NetworkMode: request.networkEnabled ? 'bridge' : 'none',
          Binds: [`${session.workspacePath}:/workspace:rw`],
          SecurityOpt: ['no-new-privileges:true'],
          CapDrop: ['ALL'],
          CapAdd: ['CHOWN', 'SETUID', 'SETGID'],
          Ulimits: [
            { Name: 'nproc', Soft: 256, Hard: 512 },
            { Name: 'nofile', Soft: 1024, Hard: 2048 },
          ],
        },
        Labels: {
          'alabobai.sandbox': 'true',
          'alabobai.execution-id': session.id,
        },
      });

      session.containerId = container.id;
      this.updateSessionStatus(session.id, 'running');
      onOutput({ type: 'system', content: 'Executing code...', timestamp: new Date() });

      // Handle abort
      const abortHandler = async () => {
        try {
          await container.stop({ t: 1 });
          await container.remove({ force: true });
        } catch {}
      };
      signal.addEventListener('abort', abortHandler);

      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true
      });

      await container.start();

      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeout);
      });

      // Stream output in real-time
      const outputPromise = new Promise<void>((resolve) => {
        this.docker.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => {
              const content = chunk.toString();
              stdout += content;
              const output: ExecutionOutput = { type: 'stdout', content, timestamp: new Date() };
              session.outputs.push(output);
              onOutput(output);
            }
          } as Writable,
          {
            write: (chunk: Buffer) => {
              const content = chunk.toString();
              stderr += content;
              const output: ExecutionOutput = { type: 'stderr', content, timestamp: new Date() };
              session.outputs.push(output);
              onOutput(output);
            }
          } as Writable
        );
        stream.on('end', resolve);
      });

      let timedOut = false;
      let exitCode = 0;

      try {
        await Promise.race([outputPromise, timeoutPromise]);
        const inspectResult = await container.inspect();
        exitCode = inspectResult.State?.ExitCode ?? 0;
      } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT') {
          timedOut = true;
          exitCode = 124;
          const timeoutOutput: ExecutionOutput = {
            type: 'stderr',
            content: '\n[Execution timed out]',
            timestamp: new Date()
          };
          session.outputs.push(timeoutOutput);
          onOutput(timeoutOutput);
        } else {
          throw error;
        }
      }

      signal.removeEventListener('abort', abortHandler);
      try {
        await container.stop({ t: 1 }).catch(() => {});
        await container.remove({ force: true });
      } catch {}

      const filesCreated = await this.listCreatedFiles(session.workspacePath);
      session.filesCreated = filesCreated;

      if (filesCreated.length > 0) {
        onOutput({
          type: 'system',
          content: `Files created: ${filesCreated.join(', ')}`,
          timestamp: new Date()
        });
      }

      const duration = Date.now() - startTime;

      return {
        id: session.id,
        success: exitCode === 0 && !timedOut,
        exitCode,
        outputs: session.outputs,
        stdout,
        stderr,
        duration,
        timedOut,
        filesCreated,
        status: timedOut ? 'timeout' : (exitCode === 0 ? 'completed' : 'failed')
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        id: session.id,
        success: false,
        exitCode: -1,
        outputs: session.outputs,
        stdout,
        stderr: stderr + '\n' + errorMessage,
        duration,
        timedOut: false,
        filesCreated: [],
        error: errorMessage,
        status: 'failed'
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getContainerImage(language: SupportedLanguage): string {
    switch (language) {
      case 'python':
        return this.config.pythonImage;
      case 'javascript':
      case 'typescript':
        return this.config.nodeImage;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  private getMainFilename(language: SupportedLanguage): string {
    switch (language) {
      case 'python':
        return 'main.py';
      case 'javascript':
        return 'main.js';
      case 'typescript':
        return 'main.ts';
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  private buildCommands(request: ExecutionRequest): { installCmd: string; runCmd: string } {
    const hasPackages = request.packages && request.packages.length > 0;

    switch (request.language) {
      case 'python':
        return {
          installCmd: hasPackages
            ? 'pip install --quiet --disable-pip-version-check -r requirements.txt && '
            : '',
          runCmd: 'python main.py'
        };
      case 'javascript':
        return {
          installCmd: hasPackages ? 'npm install --silent && ' : '',
          runCmd: 'node main.js'
        };
      case 'typescript':
        return {
          installCmd: hasPackages
            ? 'npm install --silent && npx tsc main.ts --esModuleInterop && '
            : 'npx tsc main.ts --esModuleInterop && ',
          runCmd: 'node main.js'
        };
      default:
        throw new Error(`Unsupported language: ${request.language}`);
    }
  }

  private buildEnvironmentVariables(request: ExecutionRequest): string[] {
    const env: string[] = [
      'PYTHONUNBUFFERED=1',
      'NODE_ENV=production',
      'HOME=/root',
      'TERM=xterm-256color',
    ];

    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        // Sanitize environment variable names
        const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
        env.push(`${safeKey}=${value}`);
      }
    }

    return env;
  }

  private sanitizeFilename(filename: string): string {
    // Remove path traversal attempts and dangerous characters
    return filename
      .replace(/\.\./g, '')
      .replace(/^\/+/, '')
      .replace(/[<>:"|?*]/g, '_');
  }

  private async listCreatedFiles(workspacePath: string): Promise<string[]> {
    const files: string[] = [];
    const mainFiles = ['main.py', 'main.js', 'main.ts', 'requirements.txt', 'package.json', 'package-lock.json'];

    try {
      const entries = await fs.readdir(workspacePath, { withFileTypes: true, recursive: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const relativePath = entry.name;
          // Exclude the main code files we created
          if (!mainFiles.includes(relativePath)) {
            files.push(relativePath);
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  private scheduleCleanup(executionId: string): void {
    const existingTimeout = this.cleanupIntervals.get(executionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      await this.cleanup(executionId);
    }, this.config.cleanupAfterMs);

    this.cleanupIntervals.set(executionId, timeout);
  }

  /**
   * Clean up a specific execution session
   */
  async cleanup(executionId: string): Promise<void> {
    const session = this.sessions.get(executionId);
    if (!session) {
      return;
    }

    // Remove workspace directory
    try {
      await fs.rm(session.workspacePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clear intervals and sessions
    const interval = this.cleanupIntervals.get(executionId);
    if (interval) {
      clearTimeout(interval);
      this.cleanupIntervals.delete(executionId);
    }

    this.sessions.delete(executionId);
    this.emit('session-cleaned', { executionId });
  }

  /**
   * Clean up all sessions
   */
  async cleanupAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      await this.cleanup(id);
    }
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    activeSessions: number;
    activeExecutions: number;
    maxConcurrent: number;
  } {
    return {
      activeSessions: this.sessions.size,
      activeExecutions: this.activeExecutions.size,
      maxConcurrent: this.config.maxConcurrentExecutions,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let sandboxInstance: CodeSandboxService | null = null;

export function getCodeSandbox(config?: Partial<SandboxConfig>): CodeSandboxService {
  if (!sandboxInstance) {
    sandboxInstance = new CodeSandboxService(config);
  }
  return sandboxInstance;
}

export function createCodeSandbox(config?: Partial<SandboxConfig>): CodeSandboxService {
  return new CodeSandboxService(config);
}

export default CodeSandboxService;
