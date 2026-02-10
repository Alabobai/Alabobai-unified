/**
 * Alabobai Tools - Main Entry Point
 * Production-ready tool implementations for the Alabobai platform
 */

// ============================================================================
// CORE TOOLS INFRASTRUCTURE
// ============================================================================

export {
  // Types
  type ToolResult,
  type ToolStatus,
  type ToolExecutionContext,
  type RateLimitConfig,
  type LogLevel,
  type LogEntry,
  type ToolDefinition,

  // Classes
  BaseTool,
  RateLimiter,
  Logger,
  CoreToolRegistry,

  // Instances
  coreToolRegistry,
  logger,
} from './CoreTools.js';

// ============================================================================
// SHELL TOOL
// ============================================================================

export {
  // Types
  type ShellInput,
  type ShellOutput,
  ShellInputSchema,

  // Class
  ShellTool,

  // Factory and instance
  createShellTool,
  shellTool,
} from './ShellTool.js';

// ============================================================================
// PYTHON TOOL
// ============================================================================

export {
  // Types
  type PythonInput,
  type PythonOutput,
  PythonInputSchema,

  // Class
  PythonTool,

  // Factory and instance
  createPythonTool,
  pythonTool,
} from './PythonTool.js';

// ============================================================================
// FILE TOOL
// ============================================================================

export {
  // Types
  type FileOperation,
  type FileInfo,
  type FileOutput,
  FileOperationSchema,

  // Class
  FileTool,

  // Factory and instance
  createFileTool,
  fileTool,
} from './FileTool.js';

// ============================================================================
// SEARCH TOOL
// ============================================================================

export {
  // Types
  type SearchInput,
  type SearchOutput,
  type SearchResult,
  SearchInputSchema,

  // Class
  SearchTool,

  // Factory and instance
  createSearchTool,
  searchTool,
} from './SearchTool.js';

// ============================================================================
// UNIFIED TOOLS REGISTRY
// ============================================================================

import { coreToolRegistry } from './CoreTools.js';
import { shellTool } from './ShellTool.js';
import { pythonTool } from './PythonTool.js';
import { fileTool } from './FileTool.js';
import { searchTool } from './SearchTool.js';

/**
 * Initialize and register all default tools
 */
export function initializeTools(): void {
  coreToolRegistry.register(shellTool);
  coreToolRegistry.register(pythonTool);
  coreToolRegistry.register(fileTool);
  coreToolRegistry.register(searchTool);
}

/**
 * Get all registered tools
 */
export function getAllTools() {
  return coreToolRegistry.getAll();
}

/**
 * Execute a tool by ID
 */
export async function executeTool<TInput, TOutput>(
  toolId: string,
  input: TInput,
  context?: Partial<import('./CoreTools.js').ToolExecutionContext>
) {
  return coreToolRegistry.execute<TInput, TOutput>(toolId, input, context);
}

/**
 * Get tool by ID
 */
export function getTool<TInput, TOutput>(toolId: string) {
  return coreToolRegistry.get<TInput, TOutput>(toolId);
}

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

export const ToolCategories = {
  EXECUTION: 'execution',
  FILESYSTEM: 'filesystem',
  SEARCH: 'search',
  BROWSER: 'browser',
  DATABASE: 'database',
  AI: 'ai',
} as const;

export type ToolCategory = typeof ToolCategories[keyof typeof ToolCategories];

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute a shell command
 */
export async function executeShell(command: string, options?: {
  workingDirectory?: string;
  timeout?: number;
  environment?: Record<string, string>;
  shell?: 'bash' | 'sh' | 'zsh';
  captureStderr?: boolean;
}) {
  return shellTool.execute({
    command,
    shell: options?.shell ?? 'bash',
    captureStderr: options?.captureStderr ?? true,
    timeout: options?.timeout ?? 30000,
    workingDirectory: options?.workingDirectory,
    environment: options?.environment,
  });
}

/**
 * Execute Python code
 */
export async function executePython(code: string, options?: {
  packages?: string[];
  timeout?: number;
  returnValue?: boolean;
  captureOutput?: boolean;
  environment?: Record<string, string>;
  pythonPath?: string;
  workingDirectory?: string;
  virtualEnv?: string;
}) {
  return pythonTool.execute({
    code,
    captureOutput: options?.captureOutput ?? true,
    returnValue: options?.returnValue ?? false,
    timeout: options?.timeout ?? 60000,
    packages: options?.packages,
    environment: options?.environment,
    pythonPath: options?.pythonPath,
    workingDirectory: options?.workingDirectory,
    virtualEnv: options?.virtualEnv,
  });
}

/**
 * Read a file
 */
export async function readFile(filePath: string, encoding?: 'utf-8' | 'utf8' | 'base64' | 'binary' | 'hex') {
  return fileTool.execute({
    operation: 'read',
    path: filePath,
    encoding: encoding ?? 'utf-8',
  });
}

/**
 * Write a file
 */
export async function writeFile(filePath: string, content: string, options?: {
  encoding?: 'utf-8' | 'utf8' | 'base64' | 'binary' | 'hex';
  append?: boolean;
  createDirs?: boolean;
  mode?: number;
}) {
  return fileTool.execute({
    operation: 'write',
    path: filePath,
    content,
    encoding: options?.encoding ?? 'utf-8',
    append: options?.append ?? false,
    createDirs: options?.createDirs ?? true,
    mode: options?.mode,
  });
}

/**
 * List directory contents
 */
export async function listDirectory(dirPath: string, options?: {
  recursive?: boolean;
  pattern?: string;
  includeHidden?: boolean;
}) {
  return fileTool.execute({
    operation: 'list',
    path: dirPath,
    recursive: options?.recursive ?? false,
    pattern: options?.pattern,
    includeHidden: options?.includeHidden ?? false,
  });
}

/**
 * Delete a file or directory
 */
export async function deleteFile(filePath: string, options?: {
  recursive?: boolean;
  force?: boolean;
}) {
  return fileTool.execute({
    operation: 'delete',
    path: filePath,
    recursive: options?.recursive ?? false,
    force: options?.force ?? false,
  });
}

/**
 * Search the web
 */
export async function webSearch(query: string, options?: {
  maxResults?: number;
  searchType?: 'web' | 'news' | 'images' | 'videos';
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  provider?: 'auto' | 'serper' | 'tavily';
  country?: string;
  language?: string;
  includeSnippets?: boolean;
  includeImages?: boolean;
  safeSearch?: boolean;
  domain?: string;
}) {
  return searchTool.execute({
    query,
    provider: options?.provider ?? 'auto',
    maxResults: options?.maxResults ?? 10,
    searchType: options?.searchType ?? 'web',
    timeRange: options?.timeRange ?? 'all',
    country: options?.country,
    language: options?.language,
    includeSnippets: options?.includeSnippets ?? true,
    includeImages: options?.includeImages ?? false,
    safeSearch: options?.safeSearch ?? true,
    domain: options?.domain,
  });
}

// ============================================================================
// TOOL BUILDER
// ============================================================================

export interface ToolBuilder {
  shell: typeof shellTool;
  python: typeof pythonTool;
  file: typeof fileTool;
  search: typeof searchTool;
  registry: typeof coreToolRegistry;
}

/**
 * Create a tool builder with all tools
 */
export function createToolBuilder(): ToolBuilder {
  return {
    shell: shellTool,
    python: pythonTool,
    file: fileTool,
    search: searchTool,
    registry: coreToolRegistry,
  };
}

// ============================================================================
// OPENCLAW-COMPATIBLE TOOLS
// ============================================================================

// Shell Tool (OpenClaw-compatible with safety checks)
export {
  ShellTool as OpenClawShellTool,
  ShellConfig,
  CommandResult,
  RunningProcess,
  createShellTool as createOpenClawShellTool,
  shell,
  shellSync,
} from './shell/index.js';

// File System Tool (OpenClaw-compatible)
export {
  FileSystemTool,
  FileSystemConfig,
  FileInfo as FSFileInfo,
  SearchResult as FSSearchResult,
  DirectoryTree,
  createFileSystemTool,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  findFiles,
} from './filesystem/index.js';

// Skills/Plugin System (OpenClaw AgentSkills compatible)
export {
  SkillRegistry,
  SkillDefinition,
  SkillContext,
  SkillPermission,
  SkillResult,
  createSkillRegistry,
  getSkillRegistry,
  registerSkill,
  executeSkill,
} from './skills/index.js';

// Workflow Tool (Cron scheduling, task chains)
export {
  WorkflowTool,
  WorkflowConfig,
  CronJob,
  ScheduledTask,
  TaskChain,
  TaskStep,
  StepContext,
  WorkflowTrigger,
  CronParser,
  createWorkflowTool,
  defaultWorkflow,
  cron,
  delay,
  chain,
} from './workflow/index.js';

// Messaging Tool (Multi-platform messaging)
export {
  MessagingTool,
  MessagingConfig,
  MessagingPlatform,
  Message,
  Attachment,
  SendOptions,
  Channel,
  MessageHandler,
  HandlerContext,
  PlatformAdapter,
  createMessagingTool,
  defaultMessenger,
  sendMessage,
  configureWhatsApp,
  configureTelegram,
  configureDiscord,
  configureSlack,
} from './messaging/index.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import { ShellTool as OpenClawShellTool, createShellTool as createOpenClawShellTool } from './shell/index.js';
import { FileSystemTool, createFileSystemTool } from './filesystem/index.js';
import { SkillRegistry, getSkillRegistry } from './skills/index.js';
import { WorkflowTool, createWorkflowTool, defaultWorkflow } from './workflow/index.js';
import { MessagingTool, createMessagingTool, defaultMessenger } from './messaging/index.js';

export default {
  // Initialize
  initializeTools,

  // Registry
  registry: coreToolRegistry,

  // Tools
  shell: shellTool,
  python: pythonTool,
  file: fileTool,
  search: searchTool,

  // OpenClaw-compatible tools
  openClawShell: createOpenClawShellTool(),
  fileSystem: createFileSystemTool(),
  skills: getSkillRegistry(),
  workflow: defaultWorkflow,
  messenger: defaultMessenger,

  // Convenience functions
  executeShell,
  executePython,
  readFile,
  writeFile,
  listDirectory,
  deleteFile,
  webSearch,

  // Builder
  createToolBuilder,
};
