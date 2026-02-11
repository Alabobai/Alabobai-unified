/**
 * File Tool - Read, write, list, delete files with proper error handling
 * Provides secure file operations within sandbox constraints
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { BaseTool, ToolResult, Logger, RateLimitConfig } from './CoreTools.js';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);
const copyFileAsync = promisify(fs.copyFile);
const renameAsync = promisify(fs.rename);

// ============================================================================
// INPUT/OUTPUT SCHEMAS
// ============================================================================

// Individual operation schemas
const ReadOperationSchema = z.object({
  operation: z.literal('read'),
  path: z.string().min(1).describe('File path to read'),
  encoding: z.enum(['utf-8', 'utf8', 'base64', 'binary', 'hex']).default('utf-8').describe('File encoding'),
  offset: z.number().optional().describe('Start reading from byte offset'),
  length: z.number().optional().describe('Number of bytes to read'),
});

const WriteOperationSchema = z.object({
  operation: z.literal('write'),
  path: z.string().min(1).describe('File path to write'),
  content: z.string().describe('Content to write'),
  encoding: z.enum(['utf-8', 'utf8', 'base64', 'binary', 'hex']).default('utf-8').describe('File encoding'),
  append: z.boolean().default(false).describe('Append to existing file'),
  createDirs: z.boolean().default(true).describe('Create parent directories if needed'),
  mode: z.number().optional().describe('File permissions (octal)'),
});

const ListOperationSchema = z.object({
  operation: z.literal('list'),
  path: z.string().min(1).describe('Directory path to list'),
  recursive: z.boolean().default(false).describe('List recursively'),
  pattern: z.string().optional().describe('Glob pattern to filter files'),
  includeHidden: z.boolean().default(false).describe('Include hidden files'),
});

const DeleteOperationSchema = z.object({
  operation: z.literal('delete'),
  path: z.string().min(1).describe('Path to delete'),
  recursive: z.boolean().default(false).describe('Delete directory recursively'),
  force: z.boolean().default(false).describe('Ignore errors if file does not exist'),
});

const ExistsOperationSchema = z.object({
  operation: z.literal('exists'),
  path: z.string().min(1).describe('Path to check'),
});

const StatOperationSchema = z.object({
  operation: z.literal('stat'),
  path: z.string().min(1).describe('Path to get info for'),
});

const CopyOperationSchema = z.object({
  operation: z.literal('copy'),
  source: z.string().min(1).describe('Source path'),
  destination: z.string().min(1).describe('Destination path'),
  overwrite: z.boolean().default(false).describe('Overwrite if exists'),
});

const MoveOperationSchema = z.object({
  operation: z.literal('move'),
  source: z.string().min(1).describe('Source path'),
  destination: z.string().min(1).describe('Destination path'),
  overwrite: z.boolean().default(false).describe('Overwrite if exists'),
});

const MkdirOperationSchema = z.object({
  operation: z.literal('mkdir'),
  path: z.string().min(1).describe('Directory path to create'),
  recursive: z.boolean().default(true).describe('Create parent directories'),
  mode: z.number().optional().describe('Directory permissions (octal)'),
});

const HashOperationSchema = z.object({
  operation: z.literal('hash'),
  path: z.string().min(1).describe('File path to hash'),
  algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).default('sha256').describe('Hash algorithm'),
});

export const FileOperationSchema = z.discriminatedUnion('operation', [
  ReadOperationSchema,
  WriteOperationSchema,
  ListOperationSchema,
  DeleteOperationSchema,
  ExistsOperationSchema,
  StatOperationSchema,
  CopyOperationSchema,
  MoveOperationSchema,
  MkdirOperationSchema,
  HashOperationSchema,
]);

// Type definitions
export type ReadOperation = z.infer<typeof ReadOperationSchema>;
export type WriteOperation = z.infer<typeof WriteOperationSchema>;
export type ListOperation = z.infer<typeof ListOperationSchema>;
export type DeleteOperation = z.infer<typeof DeleteOperationSchema>;
export type ExistsOperation = z.infer<typeof ExistsOperationSchema>;
export type StatOperation = z.infer<typeof StatOperationSchema>;
export type CopyOperation = z.infer<typeof CopyOperationSchema>;
export type MoveOperation = z.infer<typeof MoveOperationSchema>;
export type MkdirOperation = z.infer<typeof MkdirOperationSchema>;
export type HashOperation = z.infer<typeof HashOperationSchema>;

export type FileOperation = z.infer<typeof FileOperationSchema>;

export interface FileInfo {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  mode: number;
  uid: number;
  gid: number;
}

export interface FileOutput {
  success: boolean;
  operation: string;
  path: string;
  data?: string | FileInfo | FileInfo[];
  message?: string;
  bytesWritten?: number;
  bytesRead?: number;
  hash?: string;
}

// ============================================================================
// BLOCKED PATHS (Security)
// ============================================================================

const BLOCKED_PATHS = [
  // System directories
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/ssh',
  '/etc/ssl',
  '/root',
  '/var/log',
  '/var/run',
  '/proc',
  '/sys',
  '/dev',

  // Windows system
  'C:\\Windows',
  'C:\\System32',
  'C:\\Program Files',
  'C:\\ProgramData',

  // macOS system
  '/System',
  '/Library',
  '/private/etc',
  '/private/var',

  // Sensitive files
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.gcloud',
  '.config/gcloud',
  '.kube',
  '.docker',
];

const BLOCKED_EXTENSIONS_WRITE = [
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sys',
  '.bin',
  '.com',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.js',  // Only blocked for write, not read
  '.msi',
  '.app',
];

// ============================================================================
// FILE TOOL IMPLEMENTATION
// ============================================================================

export class FileTool extends BaseTool<FileOperation, FileOutput> {
  private allowedPaths: string[] = [];
  private blockedPaths: string[] = [...BLOCKED_PATHS];
  private blockedExtensionsWrite: string[] = [...BLOCKED_EXTENSIONS_WRITE];
  private maxFileSize: number = 100 * 1024 * 1024; // 100MB
  private maxListDepth: number = 10;

  constructor(options?: {
    allowedPaths?: string[];
    additionalBlockedPaths?: string[];
    maxFileSize?: number;
    maxListDepth?: number;
    rateLimit?: RateLimitConfig;
  }) {
    super({
      id: 'file',
      name: 'File Operations',
      description: 'Read, write, list, copy, move, and delete files with security controls',
      version: '1.0.0',
      category: 'filesystem',
      inputSchema: FileOperationSchema as z.ZodType<FileOperation>,
      timeout: 60000,
      rateLimit: options?.rateLimit ?? { maxRequests: 100, windowMs: 60000 },
    });

    this.allowedPaths = options?.allowedPaths ?? [os.tmpdir(), process.cwd()];
    this.maxFileSize = options?.maxFileSize ?? 100 * 1024 * 1024;
    this.maxListDepth = options?.maxListDepth ?? 10;

    if (options?.additionalBlockedPaths) {
      this.blockedPaths.push(...options.additionalBlockedPaths);
    }
  }

  /**
   * Validate path against security rules
   */
  private validatePath(filePath: string, operation: 'read' | 'write' | 'delete' | 'list'): { valid: boolean; reason?: string } {
    const absolutePath = path.resolve(filePath);
    const normalizedPath = path.normalize(absolutePath);

    // Check for path traversal attacks
    if (filePath.includes('..') || normalizedPath !== absolutePath) {
      // Allow if the resolved path is still safe
      if (absolutePath.includes('..')) {
        return { valid: false, reason: 'Path traversal detected' };
      }
    }

    // Check blocked paths
    for (const blocked of this.blockedPaths) {
      if (normalizedPath.toLowerCase().includes(blocked.toLowerCase())) {
        return { valid: false, reason: `Access to blocked path: ${blocked}` };
      }
    }

    // Check blocked extensions for write operations
    if (operation === 'write') {
      const ext = path.extname(normalizedPath).toLowerCase();
      if (this.blockedExtensionsWrite.includes(ext)) {
        return { valid: false, reason: `Writing to ${ext} files is not allowed` };
      }
    }

    // Check if path is in allowed paths
    if (this.allowedPaths.length > 0) {
      const isAllowed = this.allowedPaths.some(allowed =>
        normalizedPath.startsWith(path.resolve(allowed))
      );

      if (!isAllowed) {
        return { valid: false, reason: `Path not in allowed directories` };
      }
    }

    return { valid: true };
  }

  /**
   * Get file info from stats
   */
  private statToFileInfo(filePath: string, stats: fs.Stats): FileInfo {
    return {
      name: path.basename(filePath),
      path: path.resolve(filePath),
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymlink: stats.isSymbolicLink(),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid,
    };
  }

  /**
   * List directory recursively
   */
  private async listRecursive(
    dirPath: string,
    options: { includeHidden: boolean; pattern?: string; depth?: number },
    currentDepth: number = 0
  ): Promise<FileInfo[]> {
    if (currentDepth >= (options.depth ?? this.maxListDepth)) {
      return [];
    }

    const results: FileInfo[] = [];

    try {
      const entries = await readdirAsync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files if not included
        if (!options.includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        // Check pattern if specified
        if (options.pattern) {
          const regex = new RegExp(
            options.pattern.replace(/\*/g, '.*').replace(/\?/g, '.'),
            'i'
          );
          if (!regex.test(entry.name)) {
            continue;
          }
        }

        try {
          const stats = await statAsync(fullPath);
          results.push(this.statToFileInfo(fullPath, stats));

          // Recurse into directories
          if (entry.isDirectory()) {
            const subResults = await this.listRecursive(fullPath, options, currentDepth + 1);
            results.push(...subResults);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to list directory: ${err.message}`);
    }

    return results;
  }

  /**
   * Run the file operation
   */
  protected async run(input: FileOperation): Promise<FileOutput> {
    switch (input.operation) {
      case 'read':
        return this.readFile(input as ReadOperation);
      case 'write':
        return this.writeFile(input as WriteOperation);
      case 'list':
        return this.listDirectory(input as ListOperation);
      case 'delete':
        return this.deleteFile(input as DeleteOperation);
      case 'exists':
        return this.checkExists(input as ExistsOperation);
      case 'stat':
        return this.getFileStat(input as StatOperation);
      case 'copy':
        return this.copyFile(input as CopyOperation);
      case 'move':
        return this.moveFile(input as MoveOperation);
      case 'mkdir':
        return this.makeDirectory(input as MkdirOperation);
      case 'hash':
        return this.getFileHash(input as HashOperation);
      default:
        throw new Error(`Unknown operation`);
    }
  }

  /**
   * Read file operation
   */
  private async readFile(input: ReadOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'read');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);

    // Check file size
    const stats = await statAsync(absolutePath);
    if (stats.size > this.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize})`);
    }

    let content: Buffer;

    if (input.offset !== undefined || input.length !== undefined) {
      // Partial read
      const fd = fs.openSync(absolutePath, 'r');
      const buffer = Buffer.alloc(input.length ?? stats.size);
      fs.readSync(fd, buffer, 0, buffer.length, input.offset ?? 0);
      fs.closeSync(fd);
      content = buffer;
    } else {
      content = await readFileAsync(absolutePath);
    }

    let data: string;
    switch (input.encoding) {
      case 'base64':
        data = content.toString('base64');
        break;
      case 'hex':
        data = content.toString('hex');
        break;
      case 'binary':
        data = content.toString('binary');
        break;
      default:
        data = content.toString('utf-8');
    }

    this.logger.info(`Read file: ${absolutePath}`, { size: stats.size }, this.id);

    return {
      success: true,
      operation: 'read',
      path: absolutePath,
      data,
      bytesRead: content.length,
    };
  }

  /**
   * Write file operation
   */
  private async writeFile(input: WriteOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'write');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);

    // Create parent directories if needed
    if (input.createDirs) {
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        await mkdirAsync(dir, { recursive: true });
      }
    }

    let content: Buffer;
    switch (input.encoding) {
      case 'base64':
        content = Buffer.from(input.content, 'base64');
        break;
      case 'hex':
        content = Buffer.from(input.content, 'hex');
        break;
      case 'binary':
        content = Buffer.from(input.content, 'binary');
        break;
      default:
        content = Buffer.from(input.content, 'utf-8');
    }

    // Check file size
    if (content.length > this.maxFileSize) {
      throw new Error(`Content too large: ${content.length} bytes (max: ${this.maxFileSize})`);
    }

    const flag = input.append ? 'a' : 'w';
    await writeFileAsync(absolutePath, content, { flag, mode: input.mode });

    this.logger.info(`Wrote file: ${absolutePath}`, { size: content.length, append: input.append }, this.id);

    return {
      success: true,
      operation: 'write',
      path: absolutePath,
      bytesWritten: content.length,
      message: input.append ? 'Content appended to file' : 'File written successfully',
    };
  }

  /**
   * List directory operation
   */
  private async listDirectory(input: ListOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'list');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);

    // Check if it's a directory
    const stats = await statAsync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    let files: FileInfo[];

    if (input.recursive) {
      files = await this.listRecursive(absolutePath, {
        includeHidden: input.includeHidden ?? false,
        pattern: input.pattern,
      });
    } else {
      const entries = await readdirAsync(absolutePath, { withFileTypes: true });
      files = [];

      for (const entry of entries) {
        if (!input.includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        if (input.pattern) {
          const regex = new RegExp(
            input.pattern.replace(/\*/g, '.*').replace(/\?/g, '.'),
            'i'
          );
          if (!regex.test(entry.name)) {
            continue;
          }
        }

        try {
          const entryPath = path.join(absolutePath, entry.name);
          const entryStats = await statAsync(entryPath);
          files.push(this.statToFileInfo(entryPath, entryStats));
        } catch {
          // Skip files we can't stat
        }
      }
    }

    this.logger.info(`Listed directory: ${absolutePath}`, { count: files.length }, this.id);

    return {
      success: true,
      operation: 'list',
      path: absolutePath,
      data: files,
      message: `Found ${files.length} items`,
    };
  }

  /**
   * Delete file operation
   */
  private async deleteFile(input: DeleteOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'delete');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);

    try {
      const stats = await statAsync(absolutePath);

      if (stats.isDirectory()) {
        if (input.recursive) {
          fs.rmSync(absolutePath, { recursive: true, force: true });
        } else {
          fs.rmdirSync(absolutePath);
        }
      } else {
        await unlinkAsync(absolutePath);
      }

      this.logger.info(`Deleted: ${absolutePath}`, { recursive: input.recursive }, this.id);

      return {
        success: true,
        operation: 'delete',
        path: absolutePath,
        message: 'Successfully deleted',
      };
    } catch (error) {
      if (input.force) {
        return {
          success: true,
          operation: 'delete',
          path: absolutePath,
          message: 'Path did not exist (force=true)',
        };
      }
      throw error;
    }
  }

  /**
   * Check if path exists
   */
  private async checkExists(input: ExistsOperation): Promise<FileOutput> {
    const absolutePath = path.resolve(input.path);
    const exists = fs.existsSync(absolutePath);

    return {
      success: true,
      operation: 'exists',
      path: absolutePath,
      data: exists ? 'true' : 'false',
      message: exists ? 'Path exists' : 'Path does not exist',
    };
  }

  /**
   * Get file stats
   */
  private async getFileStat(input: StatOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'read');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);
    const stats = await statAsync(absolutePath);

    return {
      success: true,
      operation: 'stat',
      path: absolutePath,
      data: this.statToFileInfo(absolutePath, stats),
    };
  }

  /**
   * Copy file
   */
  private async copyFile(input: CopyOperation): Promise<FileOutput> {
    const sourceValidation = this.validatePath(input.source, 'read');
    if (!sourceValidation.valid) {
      throw new Error(`Source: ${sourceValidation.reason}`);
    }

    const destValidation = this.validatePath(input.destination, 'write');
    if (!destValidation.valid) {
      throw new Error(`Destination: ${destValidation.reason}`);
    }

    const sourcePath = path.resolve(input.source);
    const destPath = path.resolve(input.destination);

    // Check if destination exists
    if (fs.existsSync(destPath) && !input.overwrite) {
      throw new Error('Destination already exists. Set overwrite=true to replace.');
    }

    // Create destination directory if needed
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      await mkdirAsync(destDir, { recursive: true });
    }

    const flags = input.overwrite ? 0 : fs.constants.COPYFILE_EXCL;
    await copyFileAsync(sourcePath, destPath, flags);

    this.logger.info(`Copied: ${sourcePath} -> ${destPath}`, {}, this.id);

    return {
      success: true,
      operation: 'copy',
      path: destPath,
      message: `Copied from ${sourcePath}`,
    };
  }

  /**
   * Move file
   */
  private async moveFile(input: MoveOperation): Promise<FileOutput> {
    const sourceValidation = this.validatePath(input.source, 'delete');
    if (!sourceValidation.valid) {
      throw new Error(`Source: ${sourceValidation.reason}`);
    }

    const destValidation = this.validatePath(input.destination, 'write');
    if (!destValidation.valid) {
      throw new Error(`Destination: ${destValidation.reason}`);
    }

    const sourcePath = path.resolve(input.source);
    const destPath = path.resolve(input.destination);

    // Check if destination exists
    if (fs.existsSync(destPath) && !input.overwrite) {
      throw new Error('Destination already exists. Set overwrite=true to replace.');
    }

    // Create destination directory if needed
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      await mkdirAsync(destDir, { recursive: true });
    }

    await renameAsync(sourcePath, destPath);

    this.logger.info(`Moved: ${sourcePath} -> ${destPath}`, {}, this.id);

    return {
      success: true,
      operation: 'move',
      path: destPath,
      message: `Moved from ${sourcePath}`,
    };
  }

  /**
   * Create directory
   */
  private async makeDirectory(input: MkdirOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'write');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);

    await mkdirAsync(absolutePath, {
      recursive: input.recursive ?? true,
      mode: input.mode,
    });

    this.logger.info(`Created directory: ${absolutePath}`, {}, this.id);

    return {
      success: true,
      operation: 'mkdir',
      path: absolutePath,
      message: 'Directory created successfully',
    };
  }

  /**
   * Get file hash
   */
  private async getFileHash(input: HashOperation): Promise<FileOutput> {
    const validation = this.validatePath(input.path, 'read');
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const absolutePath = path.resolve(input.path);
    const algorithm = input.algorithm ?? 'sha256';

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(absolutePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => {
        const hashValue = hash.digest('hex');
        this.logger.info(`Computed ${algorithm} hash: ${absolutePath}`, {}, this.id);

        resolve({
          success: true,
          operation: 'hash',
          path: absolutePath,
          hash: hashValue,
          message: `${algorithm.toUpperCase()} hash computed`,
        });
      });
      stream.on('error', reject);
    });
  }

  /**
   * Add allowed path
   */
  addAllowedPath(pathToAdd: string): void {
    const absolutePath = path.resolve(pathToAdd);
    if (!this.allowedPaths.includes(absolutePath)) {
      this.allowedPaths.push(absolutePath);
    }
  }

  /**
   * Add blocked path
   */
  addBlockedPath(pathToBlock: string): void {
    if (!this.blockedPaths.includes(pathToBlock)) {
      this.blockedPaths.push(pathToBlock);
    }
  }

  /**
   * Set max file size
   */
  setMaxFileSize(bytes: number): void {
    this.maxFileSize = bytes;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createFileTool(options?: {
  allowedPaths?: string[];
  additionalBlockedPaths?: string[];
  maxFileSize?: number;
  maxListDepth?: number;
  rateLimit?: RateLimitConfig;
}): FileTool {
  return new FileTool(options);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const fileTool = createFileTool();
