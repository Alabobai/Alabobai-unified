/**
 * Shell Tool - Execute bash commands with timeout and output capture
 * Provides secure command execution within sandbox constraints
 */

import { z } from 'zod';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BaseTool, ToolResult, Logger, RateLimitConfig } from './CoreTools.js';
import type { VMSandboxService, SandboxEnvironment } from '../services/vm-sandbox.js';

// ============================================================================
// INPUT/OUTPUT SCHEMAS
// ============================================================================

export const ShellInputSchema = z.object({
  command: z.string().min(1).max(10000).describe('The shell command to execute'),
  workingDirectory: z.string().optional().describe('Working directory for command execution'),
  timeout: z.number().min(100).max(600000).default(30000).describe('Timeout in milliseconds'),
  environment: z.record(z.string()).optional().describe('Environment variables'),
  shell: z.enum(['bash', 'sh', 'zsh']).default('bash').describe('Shell to use'),
  captureStderr: z.boolean().default(true).describe('Capture stderr output'),
});

export type ShellInput = z.infer<typeof ShellInputSchema>;

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  killed: boolean;
  command: string;
  workingDirectory: string;
  duration: number;
}

// ============================================================================
// BLOCKED COMMANDS (Security)
// ============================================================================

const BLOCKED_COMMANDS = [
  // Dangerous file operations
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'rm -rf ~/*',
  'rm -rf /home',
  'rm -rf /etc',
  'rm -rf /var',
  'rm -rf /usr',
  ':(){:|:&};:', // Fork bomb

  // System commands
  'shutdown',
  'reboot',
  'poweroff',
  'init 0',
  'init 6',
  'halt',

  // Dangerous network commands
  'nc -e',  // Netcat shell
  'ncat -e',

  // Crypto miners
  'xmrig',
  'minerd',
  'cpuminer',

  // Privilege escalation
  'chmod 777 /',
  'chown root',
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf?\s+\/[^\s]*/i,           // rm -rf on root paths
  /dd\s+if=.*of=\/dev\//i,            // dd to device
  /mkfs\./i,                          // Format filesystem
  />\s*\/dev\/sd[a-z]/i,              // Write to disk device
  /curl.*\|\s*(ba)?sh/i,              // Curl pipe to shell
  /wget.*\|\s*(ba)?sh/i,              // Wget pipe to shell
  /eval\s*\$\(/i,                     // Dangerous eval
  /\$\(\s*curl/i,                     // Command substitution with curl
  /\$\(\s*wget/i,                     // Command substitution with wget
];

// ============================================================================
// SHELL TOOL IMPLEMENTATION
// ============================================================================

export class ShellTool extends BaseTool<ShellInput, ShellOutput> {
  private currentProcess?: ChildProcess;
  private sandboxService?: VMSandboxService;
  private allowedPaths: string[] = [];
  private blockedCommands: string[] = [...BLOCKED_COMMANDS];
  private blockedPatterns: RegExp[] = [...BLOCKED_PATTERNS];

  constructor(options?: {
    sandboxService?: VMSandboxService;
    allowedPaths?: string[];
    additionalBlockedCommands?: string[];
    rateLimit?: RateLimitConfig;
    timeout?: number;
  }) {
    super({
      id: 'shell',
      name: 'Shell Command Executor',
      description: 'Execute shell commands with timeout, output capture, and security controls',
      version: '1.0.0',
      category: 'execution',
      inputSchema: ShellInputSchema as z.ZodType<ShellInput>,
      timeout: options?.timeout ?? 30000,
      rateLimit: options?.rateLimit ?? { maxRequests: 60, windowMs: 60000 },
    });

    this.sandboxService = options?.sandboxService;
    this.allowedPaths = options?.allowedPaths ?? [os.tmpdir(), process.cwd()];

    if (options?.additionalBlockedCommands) {
      this.blockedCommands.push(...options.additionalBlockedCommands);
    }
  }

  /**
   * Validate command against security rules
   */
  private validateCommand(command: string): { valid: boolean; reason?: string } {
    const normalizedCommand = command.toLowerCase().trim();

    // Check blocked commands
    for (const blocked of this.blockedCommands) {
      if (normalizedCommand.includes(blocked.toLowerCase())) {
        return { valid: false, reason: `Command contains blocked pattern: ${blocked}` };
      }
    }

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return { valid: false, reason: `Command matches blocked pattern` };
      }
    }

    return { valid: true };
  }

  /**
   * Validate working directory
   */
  private validateWorkingDirectory(dir: string): { valid: boolean; reason?: string } {
    const absolutePath = path.resolve(dir);

    // Check if path exists
    if (!fs.existsSync(absolutePath)) {
      return { valid: false, reason: `Directory does not exist: ${absolutePath}` };
    }

    // Check if it's a directory
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      return { valid: false, reason: `Path is not a directory: ${absolutePath}` };
    }

    // Check if path is in allowed paths
    const isAllowed = this.allowedPaths.some(allowed =>
      absolutePath.startsWith(path.resolve(allowed))
    );

    if (!isAllowed && this.allowedPaths.length > 0) {
      return { valid: false, reason: `Directory not in allowed paths: ${absolutePath}` };
    }

    return { valid: true };
  }

  /**
   * Get shell path based on shell type
   */
  private getShellPath(shell: 'bash' | 'sh' | 'zsh'): string {
    switch (shell) {
      case 'bash':
        return process.platform === 'win32' ? 'bash.exe' : '/bin/bash';
      case 'sh':
        return process.platform === 'win32' ? 'sh.exe' : '/bin/sh';
      case 'zsh':
        return process.platform === 'win32' ? 'zsh.exe' : '/bin/zsh';
      default:
        return '/bin/bash';
    }
  }

  /**
   * Run the shell command
   */
  protected async run(input: ShellInput): Promise<ShellOutput> {
    const startTime = Date.now();
    const workingDirectory = input.workingDirectory || process.cwd();
    const timeout = input.timeout ?? this.timeout;

    // Validate command
    const commandValidation = this.validateCommand(input.command);
    if (!commandValidation.valid) {
      throw new Error(`Command validation failed: ${commandValidation.reason}`);
    }

    // Validate working directory
    const dirValidation = this.validateWorkingDirectory(workingDirectory);
    if (!dirValidation.valid) {
      throw new Error(`Working directory validation failed: ${dirValidation.reason}`);
    }

    this.logger.info(`Executing shell command`, {
      command: input.command.substring(0, 100),
      workingDirectory,
      shell: input.shell,
    }, this.id);

    return new Promise<ShellOutput>((resolve, reject) => {
      const shellPath = this.getShellPath(input.shell ?? 'bash');

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Prepare environment
      const env = {
        ...globalThis.process.env,
        ...input.environment,
        // Limit PATH for security
        PATH: globalThis.process.env.PATH,
      };

      // Spawn the process
      this.currentProcess = spawn(shellPath, ['-c', input.command], {
        cwd: workingDirectory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
        killSignal: 'SIGTERM',
      });

      const childProcess = this.currentProcess;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        childProcess.kill('SIGTERM');
        // Force kill after 5 seconds
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Capture stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 10 * 1024 * 1024) { // 10MB limit
          killed = true;
          childProcess.kill('SIGTERM');
        }
      });

      // Capture stderr
      if (input.captureStderr) {
        childProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
          // Limit output size
          if (stderr.length > 10 * 1024 * 1024) { // 10MB limit
            killed = true;
            childProcess.kill('SIGTERM');
          }
        });
      }

      // Handle process completion
      childProcess.on('close', (exitCode, signal) => {
        clearTimeout(timeoutId);
        this.currentProcess = undefined;

        const duration = Date.now() - startTime;

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? (killed ? 137 : -1),
          signal: signal ?? undefined,
          killed,
          command: input.command,
          workingDirectory,
          duration,
        });
      });

      // Handle errors
      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        this.currentProcess = undefined;
        reject(new Error(`Failed to spawn process: ${error.message}`));
      });
    });
  }

  /**
   * Abort current execution
   */
  abort(): void {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    super.abort();
  }

  /**
   * Execute a simple command synchronously (for quick operations)
   */
  executeSync(command: string, options?: { timeout?: number; cwd?: string }): { stdout: string; stderr: string } {
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.reason}`);
    }

    try {
      const stdout = execSync(command, {
        timeout: options?.timeout ?? 10000,
        cwd: options?.cwd ?? process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: stdout.trim(), stderr: '' };
    } catch (error: unknown) {
      const execError = error as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
      return {
        stdout: String(execError.stdout || '').trim(),
        stderr: String(execError.stderr || execError.message).trim(),
      };
    }
  }

  /**
   * Add allowed path for directory access
   */
  addAllowedPath(pathToAdd: string): void {
    const absolutePath = path.resolve(pathToAdd);
    if (!this.allowedPaths.includes(absolutePath)) {
      this.allowedPaths.push(absolutePath);
    }
  }

  /**
   * Add blocked command
   */
  addBlockedCommand(command: string): void {
    if (!this.blockedCommands.includes(command)) {
      this.blockedCommands.push(command);
    }
  }

  /**
   * Add blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createShellTool(options?: {
  sandboxService?: VMSandboxService;
  allowedPaths?: string[];
  additionalBlockedCommands?: string[];
  rateLimit?: RateLimitConfig;
  timeout?: number;
}): ShellTool {
  return new ShellTool(options);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const shellTool = createShellTool();
