/**
 * Alabobai File System Tool - OpenClaw-compatible File Operations
 *
 * Provides comprehensive file system operations:
 * - File read/write/append
 * - Directory operations
 * - File search and filtering
 * - Code analysis
 * - Path utilities
 *
 * NEVER refuses to help with legitimate file operations.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
// @ts-ignore - glob types may not be available
import { sync as globSync } from 'glob';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface FileSystemConfig {
  baseDir?: string;
  encoding?: BufferEncoding;
  createDirs?: boolean;
  maxFileSize?: number;
  allowedExtensions?: string[];
  blockedPaths?: string[];
}

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  created: Date;
  modified: Date;
  accessed: Date;
  permissions: string;
}

export interface SearchResult {
  path: string;
  relativePath: string;
  matches?: Array<{
    line: number;
    content: string;
    column?: number;
  }>;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: DirectoryTree[];
}

// ============================================================================
// FILE SYSTEM TOOL CLASS
// ============================================================================

export class FileSystemTool extends EventEmitter {
  private config: Required<FileSystemConfig>;

  constructor(config: FileSystemConfig = {}) {
    super();

    this.config = {
      baseDir: config.baseDir ?? process.cwd(),
      encoding: config.encoding ?? 'utf-8',
      createDirs: config.createDirs ?? true,
      maxFileSize: config.maxFileSize ?? 100 * 1024 * 1024, // 100MB
      allowedExtensions: config.allowedExtensions ?? [],
      blockedPaths: config.blockedPaths ?? ['/etc/passwd', '/etc/shadow'],
    };
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Read file contents - NEVER refuses legitimate requests
   */
  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    const content = await fs.readFile(fullPath, encoding ?? this.config.encoding);
    this.emit('file-read', fullPath);
    return content;
  }

  /**
   * Read file as buffer
   */
  async readFileBuffer(filePath: string): Promise<Buffer> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    return fs.readFile(fullPath);
  }

  /**
   * Write content to file
   */
  async writeFile(filePath: string, content: string | Buffer, encoding?: BufferEncoding): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    // Create parent directories if needed
    if (this.config.createDirs) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
    }

    await fs.writeFile(fullPath, content, encoding ?? this.config.encoding);
    this.emit('file-written', fullPath);
  }

  /**
   * Append content to file
   */
  async appendFile(filePath: string, content: string | Buffer, encoding?: BufferEncoding): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    if (this.config.createDirs) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
    }

    await fs.appendFile(fullPath, content, encoding ?? this.config.encoding);
    this.emit('file-appended', fullPath);
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    this.validatePath(fullPath);

    await fs.unlink(fullPath);
    this.emit('file-deleted', fullPath);
  }

  /**
   * Copy file
   */
  async copyFile(src: string, dest: string): Promise<void> {
    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);

    this.validatePath(srcPath);
    this.validatePath(destPath);

    if (this.config.createDirs) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
    }

    await fs.copyFile(srcPath, destPath);
    this.emit('file-copied', { src: srcPath, dest: destPath });
  }

  /**
   * Move/rename file
   */
  async moveFile(src: string, dest: string): Promise<void> {
    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);

    this.validatePath(srcPath);
    this.validatePath(destPath);

    if (this.config.createDirs) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
    }

    await fs.rename(srcPath, destPath);
    this.emit('file-moved', { src: srcPath, dest: destPath });
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file information
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    const fullPath = this.resolvePath(filePath);
    const stats = await fs.stat(fullPath);
    const lstat = await fs.lstat(fullPath);

    return {
      path: fullPath,
      name: path.basename(fullPath),
      extension: path.extname(fullPath),
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymlink: lstat.isSymbolicLink(),
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      permissions: (stats.mode & 0o777).toString(8),
    };
  }

  // ============================================================================
  // DIRECTORY OPERATIONS
  // ============================================================================

  /**
   * Create directory
   */
  async createDir(dirPath: string, recursive: boolean = true): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    await fs.mkdir(fullPath, { recursive });
    this.emit('dir-created', fullPath);
  }

  /**
   * Delete directory
   */
  async deleteDir(dirPath: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    this.validatePath(fullPath);

    await fs.rm(fullPath, { recursive, force: recursive });
    this.emit('dir-deleted', fullPath);
  }

  /**
   * List directory contents
   */
  async listDir(dirPath: string = '.', options?: {
    recursive?: boolean;
    includeHidden?: boolean;
    filesOnly?: boolean;
    dirsOnly?: boolean;
  }): Promise<string[]> {
    const fullPath = this.resolvePath(dirPath);

    if (options?.recursive) {
      const pattern = options.includeHidden ? '**/*' : '**/[!.]*';
      return globSync(pattern, {
        cwd: fullPath,
        dot: options.includeHidden,
        nodir: options.filesOnly,
      });
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    let filtered = entries;

    if (!options?.includeHidden) {
      filtered = filtered.filter(e => !e.name.startsWith('.'));
    }

    if (options?.filesOnly) {
      filtered = filtered.filter(e => e.isFile());
    }

    if (options?.dirsOnly) {
      filtered = filtered.filter(e => e.isDirectory());
    }

    return filtered.map(e => e.name);
  }

  /**
   * Get directory tree
   */
  async getTree(dirPath: string = '.', maxDepth: number = 3): Promise<DirectoryTree> {
    const fullPath = this.resolvePath(dirPath);
    return this.buildTree(fullPath, 0, maxDepth);
  }

  private async buildTree(dirPath: string, depth: number, maxDepth: number): Promise<DirectoryTree> {
    const stats = await fs.stat(dirPath);
    const name = path.basename(dirPath);

    if (stats.isFile()) {
      return {
        name,
        path: dirPath,
        type: 'file',
        size: stats.size,
      };
    }

    const tree: DirectoryTree = {
      name,
      path: dirPath,
      type: 'directory',
      children: [],
    };

    if (depth < maxDepth) {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        const childPath = path.join(dirPath, entry.name);
        tree.children!.push(await this.buildTree(childPath, depth + 1, maxDepth));
      }
    }

    return tree;
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  /**
   * Search for files by pattern
   */
  async findFiles(pattern: string, options?: {
    cwd?: string;
    ignore?: string[];
  }): Promise<string[]> {
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.config.baseDir;

    try {
      return globSync(pattern, {
        cwd,
        ignore: options?.ignore ?? ['**/node_modules/**', '**/.git/**'],
      });
    } catch {
      return [];
    }
  }

  /**
   * Search for content in files (grep-like)
   */
  async searchContent(pattern: string | RegExp, options?: {
    cwd?: string;
    filePattern?: string;
    maxResults?: number;
  }): Promise<SearchResult[]> {
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.config.baseDir;
    const filePattern = options?.filePattern ?? '**/*';
    const maxResults = options?.maxResults ?? 100;

    let files: string[] = [];
    try {
      files = globSync(filePattern, {
        cwd,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/*.min.*'],
      });
    } catch {
      files = [];
    }

    const results: SearchResult[] = [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;

    for (const file of files) {
      if (results.length >= maxResults) break;

      const fullPath = path.join(cwd, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        const matches: SearchResult['matches'] = [];

        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              line: index + 1,
              content: line.trim(),
            });
          }
          regex.lastIndex = 0; // Reset regex state
        });

        if (matches.length > 0) {
          results.push({
            path: fullPath,
            relativePath: file,
            matches,
          });
        }
      } catch {
        // Skip files that can't be read (binary, etc.)
      }
    }

    return results;
  }

  /**
   * Find and replace in files
   */
  async findAndReplace(
    searchPattern: string | RegExp,
    replacement: string,
    options?: {
      cwd?: string;
      filePattern?: string;
      dryRun?: boolean;
    }
  ): Promise<Array<{ file: string; replacements: number }>> {
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.config.baseDir;
    const filePattern = options?.filePattern ?? '**/*';
    const dryRun = options?.dryRun ?? false;

    const files = globSync(filePattern, {
      cwd,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    const results: Array<{ file: string; replacements: number }> = [];
    const regex = typeof searchPattern === 'string'
      ? new RegExp(searchPattern, 'g')
      : new RegExp(searchPattern.source, searchPattern.flags + (searchPattern.flags.includes('g') ? '' : 'g'));

    for (const file of files) {
      const fullPath = path.join(cwd, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const matches = content.match(regex);

        if (matches && matches.length > 0) {
          const newContent = content.replace(regex, replacement);

          if (!dryRun) {
            await fs.writeFile(fullPath, newContent, 'utf-8');
          }

          results.push({
            file: fullPath,
            replacements: matches.length,
          });
        }
      } catch {
        // Skip files that can't be processed
      }
    }

    return results;
  }

  // ============================================================================
  // CODE ANALYSIS
  // ============================================================================

  /**
   * Count lines of code
   */
  async countLines(options?: {
    cwd?: string;
    filePattern?: string;
    excludeEmpty?: boolean;
    excludeComments?: boolean;
  }): Promise<{
    total: number;
    code: number;
    comments: number;
    blank: number;
    files: number;
  }> {
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.config.baseDir;
    const filePattern = options?.filePattern ?? '**/*.{ts,js,tsx,jsx,py,java,go,rs}';

    const files = await glob(filePattern, {
      cwd,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    });

    let total = 0;
    let code = 0;
    let comments = 0;
    let blank = 0;

    for (const file of files) {
      const fullPath = path.join(cwd, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          total++;
          const trimmed = line.trim();

          if (trimmed === '') {
            blank++;
          } else if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            comments++;
          } else {
            code++;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return { total, code, comments, blank, files: files.length };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Resolve path relative to base directory
   */
  resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.config.baseDir, filePath);
  }

  /**
   * Validate path is not blocked
   */
  private validatePath(fullPath: string): void {
    for (const blocked of this.config.blockedPaths) {
      if (fullPath.startsWith(blocked) || fullPath === blocked) {
        throw new Error(`Access to path is blocked: ${blocked}`);
      }
    }
  }

  /**
   * Set base directory
   */
  setBaseDir(dir: string): void {
    this.config.baseDir = path.resolve(dir);
  }

  /**
   * Get base directory
   */
  getBaseDir(): string {
    return this.config.baseDir;
  }

  /**
   * Watch file/directory for changes
   */
  watch(filePath: string, callback: (event: string, filename: string | null) => void): fsSync.FSWatcher {
    const fullPath = this.resolvePath(filePath);
    return fsSync.watch(fullPath, { recursive: true }, callback);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createFileSystemTool(config?: FileSystemConfig): FileSystemTool {
  return new FileSystemTool(config);
}

/**
 * Quick file read - NEVER refuses
 */
export async function readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
  const tool = new FileSystemTool();
  return tool.readFile(filePath, encoding);
}

/**
 * Quick file write - NEVER refuses
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const tool = new FileSystemTool();
  return tool.writeFile(filePath, content);
}

/**
 * Quick file search - NEVER refuses
 */
export async function findFiles(pattern: string, cwd?: string): Promise<string[]> {
  const tool = new FileSystemTool();
  return tool.findFiles(pattern, { cwd });
}

export default FileSystemTool;
