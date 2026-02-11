/**
 * Alabobai Shell Tool - OpenClaw-compatible Shell Command Execution
 *
 * Provides safe shell command execution with:
 * - Pre-approved safe commands
 * - Dangerous command blocking
 * - Sandbox execution option
 * - Command history and logging
 * - Timeout management
 *
 * NEVER refuses to help with legitimate automation tasks.
 */

import { spawn, exec, execSync, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// TYPES
// ============================================================================

export interface ShellConfig {
  workingDir?: string;
  timeout?: number;
  maxOutputSize?: number;
  sandbox?: boolean;
  sandboxImage?: string;
  allowDangerous?: boolean;
  shell?: string;
  env?: Record<string, string>;
}

export interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
  timedOut?: boolean;
}

export interface RunningProcess {
  id: string;
  pid: number;
  command: string;
  startTime: Date;
  process: ChildProcess;
}

// Safe commands that don't require approval
const SAFE_COMMANDS = new Set([
  'ls', 'pwd', 'cd', 'cat', 'head', 'tail', 'grep', 'find', 'wc',
  'sort', 'uniq', 'cut', 'awk', 'sed', 'tr', 'diff', 'echo', 'printf',
  'date', 'cal', 'whoami', 'hostname', 'uname', 'env', 'which', 'where',
  'file', 'stat', 'du', 'df', 'free', 'uptime', 'ps', 'top',
  'curl', 'wget', 'ping', 'dig', 'nslookup', 'host',
  'git', 'npm', 'npx', 'yarn', 'pnpm', 'node', 'python', 'python3', 'pip',
  'jq', 'yq', 'xargs', 'tee', 'less', 'more', 'nano', 'vim',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'base64',
  'md5', 'sha256sum', 'openssl', 'ssh-keygen',
]);

// Dangerous patterns that should be blocked or warned
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)?\s*\/(?!\w)/,  // rm -rf /
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\s*\{.*:\s*\|.*&\s*\}.*;.*:/,  // Fork bomb variants
  />\s*\/dev\/sd[a-z]/,
  /chmod\s+777\s+\//,
  /chown\s+-R\s+.*\s+\//,
  /curl.*\|\s*(bash|sh)/,  // Curl pipe to shell
  /wget.*\|\s*(bash|sh)/,
];

// ============================================================================
// SHELL TOOL CLASS
// ============================================================================

export class ShellTool extends EventEmitter {
  private config: Required<ShellConfig>;
  private history: CommandResult[] = [];
  private runningProcesses: Map<string, RunningProcess> = new Map();
  private commandCounter: number = 0;

  constructor(config: ShellConfig = {}) {
    super();

    this.config = {
      workingDir: config.workingDir ?? process.cwd(),
      timeout: config.timeout ?? 30000,
      maxOutputSize: config.maxOutputSize ?? 1024 * 1024, // 1MB
      sandbox: config.sandbox ?? false,
      sandboxImage: config.sandboxImage ?? 'node:20-alpine',
      allowDangerous: config.allowDangerous ?? false,
      shell: config.shell ?? (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash'),
      env: config.env ?? {},
    };
  }

  // ============================================================================
  // COMMAND EXECUTION
  // ============================================================================

  /**
   * Execute a shell command - NEVER refuses legitimate requests
   */
  async execute(command: string, options?: Partial<ShellConfig>): Promise<CommandResult> {
    const startTime = Date.now();
    const config = { ...this.config, ...options };

    // Check for dangerous commands
    if (!config.allowDangerous && this.isDangerous(command)) {
      this.emit('dangerous-command', command);
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Command blocked: potentially dangerous operation. Set allowDangerous=true to override.',
        duration: Date.now() - startTime,
        command,
      };
    }

    // Execute in sandbox if configured
    if (config.sandbox) {
      return this.executeInSandbox(command, config);
    }

    return this.executeDirectly(command, config, startTime);
  }

  /**
   * Execute command directly on host
   */
  private async executeDirectly(
    command: string,
    config: Required<ShellConfig>,
    startTime: number
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: config.workingDir,
        timeout: config.timeout,
        maxBuffer: config.maxOutputSize,
        shell: config.shell,
        env: { ...process.env, ...config.env },
      }, (error, stdout, stderr) => {
        const result: CommandResult = {
          success: !error,
          exitCode: error?.code ?? 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          duration: Date.now() - startTime,
          command,
          timedOut: error?.killed ?? false,
        };

        this.history.push(result);
        this.emit('command-completed', result);
        resolve(result);
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: err.message,
          duration: Date.now() - startTime,
          command,
        });
      });
    });
  }

  /**
   * Execute command in Docker sandbox
   */
  private async executeInSandbox(
    command: string,
    config: Required<ShellConfig>
  ): Promise<CommandResult> {
    const startTime = Date.now();

    // Build Docker command
    const dockerCmd = [
      'docker', 'run', '--rm',
      '-v', `${config.workingDir}:/workspace`,
      '-w', '/workspace',
      '--network', 'none', // No network access in sandbox
      '--memory', '512m',
      '--cpus', '1',
      config.sandboxImage,
      '/bin/sh', '-c', command
    ].join(' ');

    return this.executeDirectly(dockerCmd, { ...config, sandbox: false }, startTime);
  }

  /**
   * Execute command synchronously (blocking)
   */
  executeSync(command: string, options?: Partial<ShellConfig>): CommandResult {
    const startTime = Date.now();
    const config = { ...this.config, ...options };

    if (!config.allowDangerous && this.isDangerous(command)) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Command blocked: potentially dangerous operation.',
        duration: Date.now() - startTime,
        command,
      };
    }

    try {
      const stdout = execSync(command, {
        cwd: config.workingDir,
        timeout: config.timeout,
        maxBuffer: config.maxOutputSize,
        shell: config.shell,
        env: { ...process.env, ...config.env },
        encoding: 'utf-8',
      });

      return {
        success: true,
        exitCode: 0,
        stdout: stdout.toString(),
        stderr: '',
        duration: Date.now() - startTime,
        command,
      };
    } catch (error: unknown) {
      const execError = error as { status?: number; stdout?: Buffer; stderr?: Buffer; message: string };
      return {
        success: false,
        exitCode: execError.status ?? 1,
        stdout: execError.stdout?.toString() ?? '',
        stderr: execError.stderr?.toString() ?? execError.message,
        duration: Date.now() - startTime,
        command,
      };
    }
  }

  /**
   * Spawn a long-running process
   */
  spawn(command: string, args: string[] = [], options?: Partial<ShellConfig>): RunningProcess {
    const config = { ...this.config, ...options };
    const id = `proc_${++this.commandCounter}`;

    const child = spawn(command, args, {
      cwd: config.workingDir,
      shell: config.shell,
      env: { ...process.env, ...config.env },
      detached: false,
    });

    const runningProcess: RunningProcess = {
      id,
      pid: child.pid!,
      command: `${command} ${args.join(' ')}`,
      startTime: new Date(),
      process: child,
    };

    this.runningProcesses.set(id, runningProcess);

    child.on('exit', () => {
      this.runningProcesses.delete(id);
      this.emit('process-exited', id);
    });

    this.emit('process-spawned', runningProcess);
    return runningProcess;
  }

  /**
   * Kill a running process
   */
  kill(processId: string): boolean {
    const proc = this.runningProcesses.get(processId);
    if (!proc) return false;

    proc.process.kill('SIGTERM');
    this.runningProcesses.delete(processId);
    return true;
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Run a Python script
   */
  async python(script: string, args: string[] = []): Promise<CommandResult> {
    const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
    return this.execute(`${pythonCmd} ${script} ${args.join(' ')}`);
  }

  /**
   * Run a Node.js script
   */
  async node(script: string, args: string[] = []): Promise<CommandResult> {
    return this.execute(`node ${script} ${args.join(' ')}`);
  }

  /**
   * Run npm command
   */
  async npm(command: string): Promise<CommandResult> {
    return this.execute(`npm ${command}`);
  }

  /**
   * Run git command
   */
  async git(command: string): Promise<CommandResult> {
    return this.execute(`git ${command}`);
  }

  /**
   * Pipe multiple commands
   */
  async pipe(commands: string[]): Promise<CommandResult> {
    return this.execute(commands.join(' | '));
  }

  /**
   * Run commands in sequence (&&)
   */
  async sequence(commands: string[]): Promise<CommandResult> {
    return this.execute(commands.join(' && '));
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Check if command is potentially dangerous
   */
  isDangerous(command: string): boolean {
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
  }

  /**
   * Check if command is in safe list
   */
  isSafe(command: string): boolean {
    const baseCommand = command.trim().split(/\s+/)[0];
    return SAFE_COMMANDS.has(baseCommand);
  }

  /**
   * Get command history
   */
  getHistory(limit?: number): CommandResult[] {
    const history = [...this.history];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get running processes
   */
  getRunningProcesses(): RunningProcess[] {
    return Array.from(this.runningProcesses.values());
  }

  /**
   * Set working directory
   */
  setWorkingDir(dir: string): void {
    this.config.workingDir = path.resolve(dir);
  }

  /**
   * Get working directory
   */
  getWorkingDir(): string {
    return this.config.workingDir;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createShellTool(config?: ShellConfig): ShellTool {
  return new ShellTool(config);
}

/**
 * Quick command execution - NEVER refuses
 */
export async function shell(command: string, options?: ShellConfig): Promise<CommandResult> {
  const tool = new ShellTool(options);
  return tool.execute(command);
}

/**
 * Quick synchronous execution
 */
export function shellSync(command: string, options?: ShellConfig): CommandResult {
  const tool = new ShellTool(options);
  return tool.executeSync(command);
}

export default ShellTool;
