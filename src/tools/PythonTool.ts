/**
 * Python Tool - Execute Python code with output capture and error handling
 * Provides secure Python execution within sandbox constraints
 */

import { z } from 'zod';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuid } from 'uuid';
import { BaseTool, ToolResult, Logger, RateLimitConfig } from './CoreTools.js';

// ============================================================================
// INPUT/OUTPUT SCHEMAS
// ============================================================================

export const PythonInputSchema = z.object({
  code: z.string().min(1).max(100000).describe('Python code to execute'),
  pythonPath: z.string().optional().describe('Path to Python executable'),
  workingDirectory: z.string().optional().describe('Working directory for execution'),
  timeout: z.number().min(100).max(600000).default(60000).describe('Timeout in milliseconds'),
  environment: z.record(z.string()).optional().describe('Environment variables'),
  packages: z.array(z.string()).optional().describe('Required pip packages to install'),
  virtualEnv: z.string().optional().describe('Path to virtual environment'),
  captureOutput: z.boolean().default(true).describe('Capture stdout/stderr'),
  returnValue: z.boolean().default(false).describe('Return last expression value'),
});

export type PythonInput = z.infer<typeof PythonInputSchema>;

export interface PythonOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  returnValue?: unknown;
  executionTime: number;
  memoryUsage?: number;
  killed: boolean;
  error?: string;
  traceback?: string;
}

// ============================================================================
// BLOCKED CODE PATTERNS (Security)
// ============================================================================

const BLOCKED_PATTERNS = [
  // System commands
  /os\.system\s*\(/i,
  /subprocess\.call\s*\(/i,
  /subprocess\.run\s*\(/i,
  /subprocess\.Popen\s*\(/i,
  /__import__\s*\(['"]subprocess['"]\)/i,
  /__import__\s*\(['"]os['"]\)\.system/i,

  // Dangerous file operations
  /shutil\.rmtree\s*\(\s*['"]\//i,
  /os\.remove\s*\(\s*['"]\//i,
  /os\.unlink\s*\(\s*['"]\//i,

  // Network backdoors
  /socket\.socket\s*\(/i,
  /http\.server/i,
  /socketserver/i,

  // Eval/exec with network content
  /exec\s*\(\s*requests\.get/i,
  /eval\s*\(\s*requests\.get/i,
  /exec\s*\(\s*urllib/i,
  /eval\s*\(\s*urllib/i,

  // Crypto mining
  /xmrig/i,
  /cpuminer/i,
  /hashlib.*while.*True/i,

  // Code injection
  /compile\s*\([^)]*,\s*['"]\w+['"]\s*,\s*['"]exec['"]/i,
];

const BLOCKED_IMPORTS = [
  'ctypes',      // Low-level memory access
  'pty',         // Pseudo-terminal
  'resource',    // System resource control
  'syslog',      // System logging
  'multiprocessing.shared_memory',
];

// ============================================================================
// PYTHON TOOL IMPLEMENTATION
// ============================================================================

export class PythonTool extends BaseTool<PythonInput, PythonOutput> {
  private currentProcess?: ChildProcess;
  private tempDir: string;
  private pythonPath: string;
  private allowedPaths: string[] = [];
  private blockedPatterns: RegExp[] = [...BLOCKED_PATTERNS];
  private blockedImports: string[] = [...BLOCKED_IMPORTS];
  private installedPackages: Set<string> = new Set();

  constructor(options?: {
    pythonPath?: string;
    allowedPaths?: string[];
    additionalBlockedImports?: string[];
    rateLimit?: RateLimitConfig;
    timeout?: number;
    tempDir?: string;
  }) {
    super({
      id: 'python',
      name: 'Python Code Executor',
      description: 'Execute Python code with output capture, error handling, and package management',
      version: '1.0.0',
      category: 'execution',
      inputSchema: PythonInputSchema as z.ZodType<PythonInput>,
      timeout: options?.timeout ?? 60000,
      rateLimit: options?.rateLimit ?? { maxRequests: 30, windowMs: 60000 },
    });

    this.pythonPath = options?.pythonPath ?? this.detectPython();
    this.tempDir = options?.tempDir ?? path.join(os.tmpdir(), 'alabobai-python');
    this.allowedPaths = options?.allowedPaths ?? [os.tmpdir(), process.cwd()];

    if (options?.additionalBlockedImports) {
      this.blockedImports.push(...options.additionalBlockedImports);
    }

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Detect available Python installation
   */
  private detectPython(): string {
    const candidates = ['python3', 'python', 'python3.11', 'python3.10', 'python3.9'];

    for (const candidate of candidates) {
      try {
        execSync(`${candidate} --version`, { encoding: 'utf-8', stdio: 'pipe' });
        return candidate;
      } catch {
        continue;
      }
    }

    return 'python3'; // Default, may fail
  }

  /**
   * Validate Python code against security rules
   */
  private validateCode(code: string): { valid: boolean; reason?: string } {
    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(code)) {
        return { valid: false, reason: `Code contains blocked pattern` };
      }
    }

    // Check blocked imports
    for (const blockedImport of this.blockedImports) {
      const importPatterns = [
        new RegExp(`^\\s*import\\s+${blockedImport}`, 'm'),
        new RegExp(`^\\s*from\\s+${blockedImport}\\s+import`, 'm'),
        new RegExp(`__import__\\s*\\(['"']${blockedImport}['"']\\)`, 'i'),
      ];

      for (const pattern of importPatterns) {
        if (pattern.test(code)) {
          return { valid: false, reason: `Blocked import: ${blockedImport}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Install required packages
   */
  private async installPackages(packages: string[], pythonPath: string): Promise<void> {
    const toInstall = packages.filter(pkg => !this.installedPackages.has(pkg));

    if (toInstall.length === 0) return;

    this.logger.info(`Installing packages: ${toInstall.join(', ')}`, {}, this.id);

    for (const pkg of toInstall) {
      // Validate package name (prevent command injection)
      if (!/^[a-zA-Z0-9_\-\[\]]+([<>=!]+[0-9.]+)?$/.test(pkg)) {
        throw new Error(`Invalid package name: ${pkg}`);
      }

      try {
        execSync(`${pythonPath} -m pip install ${pkg} --quiet`, {
          timeout: 120000,
          encoding: 'utf-8',
        });
        this.installedPackages.add(pkg);
      } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to install package ${pkg}: ${err.message}`);
      }
    }
  }

  /**
   * Create execution script with proper error handling
   */
  private createExecutionScript(code: string, returnValue: boolean): string {
    const escapedCode = code.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    if (returnValue) {
      return `
import sys
import json
import traceback

_result = None
_error = None
_traceback = None

try:
    exec('''${escapedCode}''')
    # Try to capture last expression
    import ast
    tree = ast.parse('''${escapedCode}''')
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        _result = eval(compile(ast.Expression(tree.body[-1].value), '<string>', 'eval'))
except Exception as e:
    _error = str(e)
    _traceback = traceback.format_exc()

# Output result as JSON
print('__ALABOBAI_RESULT_START__')
print(json.dumps({
    'result': _result if _result is not None else None,
    'error': _error,
    'traceback': _traceback
}))
print('__ALABOBAI_RESULT_END__')
`.trim();
    }

    return code;
  }

  /**
   * Parse execution result from output
   */
  private parseResult(stdout: string): { value?: unknown; stdout: string } {
    const startMarker = '__ALABOBAI_RESULT_START__';
    const endMarker = '__ALABOBAI_RESULT_END__';

    const startIndex = stdout.indexOf(startMarker);
    const endIndex = stdout.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      return { stdout };
    }

    const resultJson = stdout.slice(startIndex + startMarker.length, endIndex).trim();
    const cleanStdout = stdout.slice(0, startIndex).trim();

    try {
      const result = JSON.parse(resultJson);
      return {
        value: result.result,
        stdout: cleanStdout,
      };
    } catch {
      return { stdout };
    }
  }

  /**
   * Run the Python code
   */
  protected async run(input: PythonInput): Promise<PythonOutput> {
    const startTime = Date.now();
    const workingDirectory = input.workingDirectory || process.cwd();
    const timeout = input.timeout ?? this.timeout;
    const pythonPath = input.pythonPath || this.pythonPath;

    // Validate code
    const codeValidation = this.validateCode(input.code);
    if (!codeValidation.valid) {
      throw new Error(`Code validation failed: ${codeValidation.reason}`);
    }

    // Install required packages
    if (input.packages && input.packages.length > 0) {
      await this.installPackages(input.packages, pythonPath);
    }

    // Create temp script file
    const scriptId = uuid();
    const scriptPath = path.join(this.tempDir, `script_${scriptId}.py`);
    const executionCode = this.createExecutionScript(input.code, input.returnValue ?? false);

    try {
      fs.writeFileSync(scriptPath, executionCode, 'utf-8');
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to create script file: ${err.message}`);
    }

    this.logger.info(`Executing Python code`, {
      codeLength: input.code.length,
      workingDirectory,
      packages: input.packages,
    }, this.id);

    return new Promise<PythonOutput>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Prepare environment
      const env = {
        ...globalThis.process.env,
        ...input.environment,
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      };

      // Handle virtual environment
      let effectivePythonPath = pythonPath;
      if (input.virtualEnv) {
        const venvBin = globalThis.process.platform === 'win32' ? 'Scripts' : 'bin';
        effectivePythonPath = path.join(input.virtualEnv, venvBin, 'python');
      }

      // Spawn Python process
      this.currentProcess = spawn(effectivePythonPath, [scriptPath], {
        cwd: workingDirectory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const childProcess = this.currentProcess;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        childProcess.kill('SIGTERM');
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Capture stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 10 * 1024 * 1024) {
          killed = true;
          childProcess.kill('SIGTERM');
        }
      });

      // Capture stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > 10 * 1024 * 1024) {
          killed = true;
          childProcess.kill('SIGTERM');
        }
      });

      // Handle process completion
      childProcess.on('close', (exitCode, signal) => {
        clearTimeout(timeoutId);
        this.currentProcess = undefined;

        // Clean up script file
        try {
          fs.unlinkSync(scriptPath);
        } catch {
          // Ignore cleanup errors
        }

        const executionTime = Date.now() - startTime;

        // Parse result if returnValue was requested
        let returnValue: unknown;
        let cleanStdout = stdout;

        if (input.returnValue) {
          const parsed = this.parseResult(stdout);
          returnValue = parsed.value;
          cleanStdout = parsed.stdout;
        }

        // Extract traceback if present
        let traceback: string | undefined;
        const tracebackMatch = stderr.match(/Traceback \(most recent call last\):[\s\S]+$/);
        if (tracebackMatch) {
          traceback = tracebackMatch[0];
        }

        resolve({
          stdout: cleanStdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? (killed ? 137 : -1),
          returnValue,
          executionTime,
          killed,
          traceback,
        });
      });

      // Handle errors
      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        this.currentProcess = undefined;

        // Clean up script file
        try {
          fs.unlinkSync(scriptPath);
        } catch {
          // Ignore cleanup errors
        }

        reject(new Error(`Failed to spawn Python process: ${error.message}`));
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
   * Execute Python expression and return result
   */
  async eval(expression: string): Promise<unknown> {
    const result = await this.execute({
      code: expression,
      returnValue: true,
      timeout: 10000,
      captureOutput: true,
    });

    if (result.success && result.data) {
      return result.data.returnValue;
    }

    throw new Error(result.error || 'Failed to evaluate expression');
  }

  /**
   * Get Python version
   */
  async getVersion(): Promise<string> {
    try {
      const output = execSync(`${this.pythonPath} --version`, { encoding: 'utf-8' });
      return output.trim();
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Check if a package is installed
   */
  async isPackageInstalled(packageName: string): Promise<boolean> {
    try {
      execSync(`${this.pythonPath} -c "import ${packageName}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get installed packages
   */
  async getInstalledPackages(): Promise<string[]> {
    try {
      const output = execSync(`${this.pythonPath} -m pip list --format=freeze`, {
        encoding: 'utf-8',
      });
      return output.trim().split('\n').map(line => line.split('==')[0]);
    } catch {
      return [];
    }
  }

  /**
   * Create virtual environment
   */
  async createVirtualEnv(path: string): Promise<void> {
    execSync(`${this.pythonPath} -m venv ${path}`, { encoding: 'utf-8' });
  }

  /**
   * Add blocked import
   */
  addBlockedImport(importName: string): void {
    if (!this.blockedImports.includes(importName)) {
      this.blockedImports.push(importName);
    }
  }

  /**
   * Add blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern);
  }

  /**
   * Clean up temp directory
   */
  cleanup(): void {
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        if (file.startsWith('script_')) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createPythonTool(options?: {
  pythonPath?: string;
  allowedPaths?: string[];
  additionalBlockedImports?: string[];
  rateLimit?: RateLimitConfig;
  timeout?: number;
  tempDir?: string;
}): PythonTool {
  return new PythonTool(options);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const pythonTool = createPythonTool();
