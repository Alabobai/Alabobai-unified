/**
 * Alabobai Code Builder Agent - File Tools
 * File system operations for code manipulation
 *
 * Features:
 * - Read/Write/Delete files
 * - Search files by pattern (glob)
 * - Search content (grep-like)
 * - Line-based editing
 * - Find & replace
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { OllamaTool } from '../../llm/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FileToolsConfig {
  projectRoot: string;
  allowedExtensions?: string[];
  ignoredDirs?: string[];
  maxFileSize?: number; // in bytes
  backupEnabled?: boolean;
  backupDir?: string;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: Date;
  createdAt: Date;
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  match: string;
}

export interface EditOperation {
  type: 'insert' | 'replace' | 'delete';
  startLine: number;
  endLine?: number;
  content?: string;
}

export interface FileChange {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  oldContent?: string;
  newContent?: string;
  timestamp: Date;
}

// ============================================================================
// FILE TOOLS CLASS
// ============================================================================

export class FileTools extends EventEmitter {
  private config: FileToolsConfig;
  private changeLog: FileChange[] = [];

  private static readonly DEFAULT_IGNORED_DIRS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'coverage',
    '.cache',
    '.turbo',
  ];

  private static readonly DEFAULT_ALLOWED_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml',
    '.css', '.scss', '.html', '.vue', '.svelte', '.prisma', '.sql',
    '.env', '.env.local', '.env.example', '.gitignore', '.dockerignore',
  ];

  constructor(config: FileToolsConfig) {
    super();
    this.config = {
      allowedExtensions: FileTools.DEFAULT_ALLOWED_EXTENSIONS,
      ignoredDirs: FileTools.DEFAULT_IGNORED_DIRS,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      backupEnabled: true,
      backupDir: '.alabobai-backups',
      ...config,
    };
  }

  // ============================================================================
  // FILE READING
  // ============================================================================

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    const stats = await fs.stat(fullPath);
    if (stats.size > this.config.maxFileSize!) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    this.emit('file-read', { path: fullPath, size: stats.size });
    return content;
  }

  /**
   * Read a file with line numbers
   */
  async readFileWithLineNumbers(filePath: string): Promise<{ line: number; content: string }[]> {
    const content = await this.readFile(filePath);
    return content.split('\n').map((line, index) => ({
      line: index + 1,
      content: line,
    }));
  }

  /**
   * Read specific lines from a file
   */
  async readLines(filePath: string, startLine: number, endLine?: number): Promise<string[]> {
    const lines = await this.readFileWithLineNumbers(filePath);
    const end = endLine ?? lines.length;
    return lines
      .filter(l => l.line >= startLine && l.line <= end)
      .map(l => l.content);
  }

  /**
   * Get file information
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    const stats = await fs.stat(fullPath);
    const relativePath = path.relative(this.config.projectRoot, fullPath);

    return {
      path: fullPath,
      relativePath,
      name: path.basename(fullPath),
      extension: path.extname(fullPath),
      size: stats.size,
      isDirectory: stats.isDirectory(),
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
    };
  }

  // ============================================================================
  // FILE WRITING
  // ============================================================================

  /**
   * Write content to a file (creates if doesn't exist)
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    // Create backup if file exists
    let oldContent: string | undefined;
    try {
      oldContent = await fs.readFile(fullPath, 'utf-8');
      if (this.config.backupEnabled) {
        await this.createBackup(fullPath, oldContent);
      }
    } catch {
      // File doesn't exist, that's ok
    }

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write the file
    await fs.writeFile(fullPath, content, 'utf-8');

    // Log the change
    const change: FileChange = {
      path: fullPath,
      operation: oldContent ? 'modify' : 'create',
      oldContent,
      newContent: content,
      timestamp: new Date(),
    };
    this.changeLog.push(change);

    this.emit('file-written', {
      path: fullPath,
      operation: change.operation,
      size: content.length,
    });
  }

  /**
   * Append content to a file
   */
  async appendFile(filePath: string, content: string): Promise<void> {
    const existing = await this.readFile(filePath).catch(() => '');
    await this.writeFile(filePath, existing + content);
  }

  /**
   * Create a new file (fails if exists)
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    try {
      await fs.access(fullPath);
      throw new Error(`File already exists: ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await this.writeFile(filePath, content);
  }

  // ============================================================================
  // FILE EDITING
  // ============================================================================

  /**
   * Edit specific lines in a file
   */
  async editLines(filePath: string, operations: EditOperation[]): Promise<string> {
    const content = await this.readFile(filePath);
    const lines = content.split('\n');

    // Sort operations by line number (descending) to avoid offset issues
    const sortedOps = [...operations].sort((a, b) => b.startLine - a.startLine);

    for (const op of sortedOps) {
      const startIdx = op.startLine - 1;
      const endIdx = (op.endLine ?? op.startLine) - 1;

      switch (op.type) {
        case 'insert':
          if (op.content) {
            const newLines = op.content.split('\n');
            lines.splice(startIdx, 0, ...newLines);
          }
          break;

        case 'replace':
          if (op.content !== undefined) {
            const newLines = op.content.split('\n');
            lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
          }
          break;

        case 'delete':
          lines.splice(startIdx, endIdx - startIdx + 1);
          break;
      }
    }

    const newContent = lines.join('\n');
    await this.writeFile(filePath, newContent);
    return newContent;
  }

  /**
   * Find and replace in a file
   */
  async findReplace(
    filePath: string,
    search: string | RegExp,
    replace: string,
    options?: { all?: boolean }
  ): Promise<{ replacements: number; newContent: string }> {
    const content = await this.readFile(filePath);

    let newContent: string;
    let replacements = 0;

    if (typeof search === 'string') {
      if (options?.all) {
        const regex = new RegExp(this.escapeRegex(search), 'g');
        newContent = content.replace(regex, () => {
          replacements++;
          return replace;
        });
      } else {
        if (content.includes(search)) {
          replacements = 1;
          newContent = content.replace(search, replace);
        } else {
          newContent = content;
        }
      }
    } else {
      const flags = search.flags.includes('g') ? search.flags : search.flags + 'g';
      const globalRegex = new RegExp(search.source, options?.all ? flags : search.flags);
      newContent = content.replace(globalRegex, () => {
        replacements++;
        return replace;
      });
    }

    if (replacements > 0) {
      await this.writeFile(filePath, newContent);
    }

    return { replacements, newContent };
  }

  /**
   * Insert content at a specific line
   */
  async insertAtLine(filePath: string, lineNumber: number, content: string): Promise<void> {
    await this.editLines(filePath, [{
      type: 'insert',
      startLine: lineNumber,
      content,
    }]);
  }

  /**
   * Delete lines from a file
   */
  async deleteLines(filePath: string, startLine: number, endLine?: number): Promise<void> {
    await this.editLines(filePath, [{
      type: 'delete',
      startLine,
      endLine,
    }]);
  }

  // ============================================================================
  // FILE DELETION
  // ============================================================================

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    // Create backup before deletion
    if (this.config.backupEnabled) {
      const content = await fs.readFile(fullPath, 'utf-8');
      await this.createBackup(fullPath, content);
    }

    await fs.unlink(fullPath);

    this.changeLog.push({
      path: fullPath,
      operation: 'delete',
      timestamp: new Date(),
    });

    this.emit('file-deleted', { path: fullPath });
  }

  /**
   * Delete a directory and its contents
   */
  async deleteDirectory(dirPath: string): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    this.validatePath(fullPath);

    await fs.rm(fullPath, { recursive: true, force: true });
    this.emit('directory-deleted', { path: fullPath });
  }

  // ============================================================================
  // FILE SEARCHING
  // ============================================================================

  /**
   * Search for files matching a glob pattern
   */
  async findFiles(pattern: string, options?: { maxResults?: number }): Promise<string[]> {
    const results: string[] = [];
    const maxResults = options?.maxResults ?? 1000;

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= maxResults) return;

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.config.projectRoot, fullPath);

        if (entry.isDirectory()) {
          if (!this.config.ignoredDirs!.includes(entry.name)) {
            await walk(fullPath);
          }
        } else {
          if (this.matchesGlob(relativePath, pattern)) {
            results.push(relativePath);
          }
        }
      }
    };

    await walk(this.config.projectRoot);
    return results;
  }

  /**
   * Search for content in files (grep-like)
   */
  async searchContent(
    pattern: string | RegExp,
    options?: {
      filePattern?: string;
      maxResults?: number;
      contextLines?: number;
    }
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const maxResults = options?.maxResults ?? 100;
    const filePattern = options?.filePattern ?? '**/*';

    const files = await this.findFiles(filePattern);
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;

    for (const file of files) {
      if (results.length >= maxResults) break;

      try {
        const content = await this.readFile(file);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;

          const line = lines[i];
          const matches = line.match(regex);

          if (matches) {
            for (const match of matches) {
              results.push({
                file,
                line: i + 1,
                column: line.indexOf(match) + 1,
                content: line.trim(),
                match,
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results;
  }

  /**
   * List directory contents
   */
  async listDirectory(
    dirPath: string = '.',
    options?: { recursive?: boolean; includeHidden?: boolean }
  ): Promise<FileInfo[]> {
    const fullPath = this.resolvePath(dirPath);
    this.validatePath(fullPath);

    const results: FileInfo[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!options?.includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory() && this.config.ignoredDirs!.includes(entry.name)) {
          continue;
        }

        const stats = await fs.stat(entryPath);
        const relativePath = path.relative(this.config.projectRoot, entryPath);

        results.push({
          path: entryPath,
          relativePath,
          name: entry.name,
          extension: path.extname(entry.name),
          size: stats.size,
          isDirectory: entry.isDirectory(),
          modifiedAt: stats.mtime,
          createdAt: stats.birthtime,
        });

        if (options?.recursive && entry.isDirectory()) {
          await walk(entryPath);
        }
      }
    };

    await walk(fullPath);
    return results;
  }

  // ============================================================================
  // BACKUP & RESTORE
  // ============================================================================

  /**
   * Create a backup of a file
   */
  private async createBackup(filePath: string, content: string): Promise<string> {
    const backupDir = path.join(this.config.projectRoot, this.config.backupDir!);
    await fs.mkdir(backupDir, { recursive: true });

    const relativePath = path.relative(this.config.projectRoot, filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${relativePath}.${timestamp}.bak`);

    const backupFullDir = path.dirname(backupPath);
    await fs.mkdir(backupFullDir, { recursive: true });

    await fs.writeFile(backupPath, content, 'utf-8');
    return backupPath;
  }

  /**
   * List available backups for a file
   */
  async listBackups(filePath: string): Promise<{ path: string; timestamp: Date }[]> {
    const backupDir = path.join(this.config.projectRoot, this.config.backupDir!);
    const relativePath = path.relative(this.config.projectRoot, this.resolvePath(filePath));

    try {
      const backups = await this.findFiles(`${this.config.backupDir}/${relativePath}.*.bak`);
      return backups.map(b => {
        const match = b.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.bak$/);
        const timestamp = match ? new Date(match[1].replace(/-/g, ':').replace('T:', 'T')) : new Date();
        return { path: b, timestamp };
      }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch {
      return [];
    }
  }

  /**
   * Restore a file from backup
   */
  async restoreFromBackup(backupPath: string, targetPath: string): Promise<void> {
    const content = await fs.readFile(
      path.join(this.config.projectRoot, backupPath),
      'utf-8'
    );
    await this.writeFile(targetPath, content);
  }

  // ============================================================================
  // CHANGE TRACKING
  // ============================================================================

  /**
   * Get the change log
   */
  getChangeLog(): FileChange[] {
    return [...this.changeLog];
  }

  /**
   * Clear the change log
   */
  clearChangeLog(): void {
    this.changeLog = [];
  }

  /**
   * Undo the last change
   */
  async undoLastChange(): Promise<boolean> {
    const lastChange = this.changeLog.pop();
    if (!lastChange) return false;

    switch (lastChange.operation) {
      case 'create':
        await fs.unlink(lastChange.path);
        break;
      case 'modify':
        if (lastChange.oldContent !== undefined) {
          await fs.writeFile(lastChange.path, lastChange.oldContent, 'utf-8');
        }
        break;
      case 'delete':
        // Cannot undo delete without backup
        break;
    }

    this.emit('change-undone', lastChange);
    return true;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.config.projectRoot, filePath);
  }

  private validatePath(fullPath: string): void {
    const normalizedRoot = path.normalize(this.config.projectRoot);
    const normalizedPath = path.normalize(fullPath);

    if (!normalizedPath.startsWith(normalizedRoot)) {
      throw new Error(`Path escapes project root: ${fullPath}`);
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private matchesGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching (supports * and **)
    const regexPattern = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
}

// ============================================================================
// TOOL DEFINITIONS FOR LLM
// ============================================================================

export const fileToolDefinitions: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Use this to examine existing code.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to read',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates the file if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to write',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit specific lines in a file using line-based operations.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to edit',
          },
          operations: {
            type: 'string',
            description: 'JSON array of edit operations: [{type: "insert"|"replace"|"delete", startLine: number, endLine?: number, content?: string}]',
          },
        },
        required: ['path', 'operations'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_replace',
      description: 'Find and replace text in a file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file',
          },
          search: {
            type: 'string',
            description: 'The text or regex pattern to search for',
          },
          replace: {
            type: 'string',
            description: 'The text to replace matches with',
          },
          all: {
            type: 'string',
            description: 'Replace all occurrences (true/false)',
          },
        },
        required: ['path', 'search', 'replace'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. A backup will be created automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to delete',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_files',
      description: 'Find files matching a glob pattern (e.g., "**/*.ts" for all TypeScript files).',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.tsx")',
          },
          maxResults: {
            type: 'string',
            description: 'Maximum number of results to return (default: 100)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_content',
      description: 'Search for text or patterns in files (grep-like search).',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Text or regex pattern to search for',
          },
          filePattern: {
            type: 'string',
            description: 'Glob pattern to filter files (default: **/*)',
          },
          maxResults: {
            type: 'string',
            description: 'Maximum number of results (default: 100)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories in a path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list (default: project root)',
          },
          recursive: {
            type: 'string',
            description: 'Include subdirectories (true/false)',
          },
        },
        required: [],
      },
    },
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createFileTools(config: FileToolsConfig): FileTools {
  return new FileTools(config);
}

export default FileTools;
