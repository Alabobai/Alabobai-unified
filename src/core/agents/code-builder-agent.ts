/**
 * Alabobai Code Builder Agent
 * Self-building capabilities - allows the AI to modify its own codebase
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import type { AgenticLoop, ToolDefinition, LLMClient } from '../brain/agentic-loop.js';

export interface CodeBuilderConfig {
  projectRoot: string;
  allowedPaths?: string[];
  deniedPaths?: string[];
  maxFileSize?: number;
  backupEnabled?: boolean;
  sandboxMode?: boolean;
  gitEnabled?: boolean;
  testEnabled?: boolean;
}

export interface FileEdit {
  path: string;
  oldContent?: string;
  newContent: string;
  operation: 'create' | 'update' | 'delete';
}

export class CodeBuilderAgent extends EventEmitter {
  private config: CodeBuilderConfig;
  private pendingEdits: FileEdit[] = [];
  private backups: Map<string, string> = new Map();

  constructor(config: CodeBuilderConfig) {
    super();
    this.config = {
      maxFileSize: 1024 * 1024,
      backupEnabled: true,
      sandboxMode: false,
      gitEnabled: true,
      testEnabled: true,
      ...config,
    };
  }

  getTools(): ToolDefinition[] {
    return [
      this.createReadFileTool(),
      this.createWriteFileTool(),
      this.createEditFileTool(),
      this.createListFilesTool(),
      this.createGrepTool(),
      this.createGitStatusTool(),
      this.createGitDiffTool(),
      this.createGitCommitTool(),
      this.createRunCommandTool(),
      this.createTypeCheckTool(),
    ];
  }

  private createReadFileTool(): ToolDefinition {
    return {
      name: 'read_file',
      description: 'Read the contents of a file with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          startLine: { type: 'number', description: 'Start line (optional)' },
          endLine: { type: 'number', description: 'End line (optional)' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const filePath = this.resolvePath(args.path);
        this.validatePath(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const start = (args.startLine || 1) - 1;
        const end = args.endLine || lines.length;
        return lines.slice(start, end).map((line, i) => (start + i + 1) + ': ' + line).join('\n');
      },
    };
  }

  private createWriteFileTool(): ToolDefinition {
    return {
      name: 'write_file',
      description: 'Write content to a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        const filePath = this.resolvePath(args.path);
        this.validatePath(filePath);
        if (this.config.backupEnabled) {
          try {
            const existing = await fs.readFile(filePath, 'utf-8');
            this.backups.set(filePath, existing);
          } catch {}
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        if (!this.config.sandboxMode) {
          await fs.writeFile(filePath, args.content, 'utf-8');
          return 'Successfully wrote ' + args.content.length + ' bytes to ' + args.path;
        }
        this.pendingEdits.push({ path: filePath, newContent: args.content, operation: 'create' });
        return '[SANDBOX] Queued write to ' + args.path;
      },
    };
  }

  private createEditFileTool(): ToolDefinition {
    return {
      name: 'edit_file',
      description: 'Edit a file by replacing specific text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          oldText: { type: 'string', description: 'Text to find' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'oldText', 'newText'],
      },
      execute: async (args) => {
        const filePath = this.resolvePath(args.path);
        this.validatePath(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        if (!content.includes(args.oldText)) {
          throw new Error('Could not find the specified text in ' + args.path);
        }
        if (this.config.backupEnabled) this.backups.set(filePath, content);
        const newContent = content.replace(args.oldText, args.newText);
        if (!this.config.sandboxMode) {
          await fs.writeFile(filePath, newContent, 'utf-8');
          return 'Successfully edited ' + args.path;
        }
        this.pendingEdits.push({ path: filePath, oldContent: content, newContent, operation: 'update' });
        return '[SANDBOX] Queued edit to ' + args.path;
      },
    };
  }

  private createListFilesTool(): ToolDefinition {
    return {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
          pattern: { type: 'string', description: 'Glob pattern' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const dirPath = this.resolvePath(args.path);
        const files = await this.listFilesRecursive(dirPath, true);
        return files.join('\n');
      },
    };
  }

  private createGrepTool(): ToolDefinition {
    return {
      name: 'grep',
      description: 'Search for a pattern in files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          path: { type: 'string', description: 'Path to search' },
        },
        required: ['pattern', 'path'],
      },
      execute: async (args) => {
        const searchPath = this.resolvePath(args.path);
        const regex = new RegExp(args.pattern, 'gi');
        const results: string[] = [];
        const searchFile = async (filePath: string) => {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            lines.forEach((line, i) => {
              if (regex.test(line)) {
                results.push(filePath + ':' + (i + 1) + ': ' + line.trim());
              }
            });
          } catch {}
        };
        const stat = await fs.stat(searchPath);
        if (stat.isDirectory()) {
          const files = await this.listFilesRecursive(searchPath, true);
          for (const file of files.slice(0, 100)) await searchFile(file);
        } else {
          await searchFile(searchPath);
        }
        return results.slice(0, 50).join('\n') || 'No matches found';
      },
    };
  }

  private createGitStatusTool(): ToolDefinition {
    return {
      name: 'git_status',
      description: 'Get git status.',
      parameters: { type: 'object', properties: {} },
      execute: async () => this.runGitCommand('status --short'),
    };
  }

  private createGitDiffTool(): ToolDefinition {
    return {
      name: 'git_diff',
      description: 'Show git diff.',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Show staged changes' },
        },
      },
      execute: async (args) => {
        return this.runGitCommand('diff' + (args.staged ? ' --staged' : ''));
      },
    };
  }

  private createGitCommitTool(): ToolDefinition {
    return {
      name: 'git_commit',
      description: 'Create a git commit.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' },
        },
        required: ['message'],
      },
      execute: async (args) => {
        if (this.config.sandboxMode) return '[SANDBOX] Would commit: ' + args.message;
        if (args.files) for (const file of args.files) this.runGitCommand('add ' + file);
        return this.runGitCommand('commit -m "' + args.message + '"');
      },
    };
  }

  private createRunCommandTool(): ToolDefinition {
    return {
      name: 'run_command',
      description: 'Run a shell command.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
        },
        required: ['command'],
      },
      execute: async (args) => {
        const dangerous = ['rm -rf', 'sudo', 'mkfs', 'dd if='];
        if (dangerous.some(d => args.command.includes(d))) {
          throw new Error('Command blocked for safety');
        }
        if (this.config.sandboxMode) return '[SANDBOX] Would run: ' + args.command;
        try {
          return execSync(args.command, { cwd: this.config.projectRoot, encoding: 'utf-8', timeout: 60000 });
        } catch (error: any) {
          return 'Command failed: ' + error.message;
        }
      },
    };
  }

  private createTypeCheckTool(): ToolDefinition {
    return {
      name: 'typecheck',
      description: 'Run TypeScript type checking.',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        try {
          return execSync('npx tsc --noEmit', { cwd: this.config.projectRoot, encoding: 'utf-8', timeout: 120000 });
        } catch (error: any) {
          return 'Type errors:\n' + (error.stdout || error.message);
        }
      },
    };
  }

  private resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) return inputPath;
    return path.resolve(this.config.projectRoot, inputPath);
  }

  private validatePath(filePath: string): void {
    const normalized = path.normalize(filePath);
    const allowedRoots = [this.config.projectRoot, ...(this.config.allowedPaths || [])];
    const isAllowed = allowedRoots.some(root => normalized.startsWith(path.normalize(root)));
    if (!isAllowed) throw new Error('Access denied: ' + filePath);
    const denied = this.config.deniedPaths || ['/etc', '/usr', '/bin'];
    if (denied.some(d => normalized.startsWith(d))) throw new Error('Path restricted: ' + filePath);
  }

  private async listFilesRecursive(dir: string, recursive: boolean): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && ['node_modules', '.git', 'dist'].includes(entry.name)) continue;
      if (entry.isFile()) files.push(fullPath);
      else if (entry.isDirectory() && recursive) files.push(...await this.listFilesRecursive(fullPath, recursive));
    }
    return files;
  }

  private runGitCommand(cmd: string): string {
    try {
      return execSync('git ' + cmd, { cwd: this.config.projectRoot, encoding: 'utf-8', timeout: 30000 }).trim();
    } catch (error: any) {
      return 'Git error: ' + error.message;
    }
  }

  getPendingEdits(): FileEdit[] { return [...this.pendingEdits]; }
  async applyPendingEdits(): Promise<void> {
    for (const edit of this.pendingEdits) {
      if (edit.operation === 'delete') await fs.unlink(edit.path);
      else {
        await fs.mkdir(path.dirname(edit.path), { recursive: true });
        await fs.writeFile(edit.path, edit.newContent, 'utf-8');
      }
    }
    this.pendingEdits = [];
  }
  clearPendingEdits(): void { this.pendingEdits = []; }
  enableSandboxMode(): void { this.config.sandboxMode = true; }
  disableSandboxMode(): void { this.config.sandboxMode = false; }
}

export function createCodeBuilderAgent(projectRoot: string, config?: Partial<CodeBuilderConfig>): CodeBuilderAgent {
  return new CodeBuilderAgent({ projectRoot, ...config });
}
