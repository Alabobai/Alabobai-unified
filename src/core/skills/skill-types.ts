/**
 * Alabobai Skill System - Type Definitions
 *
 * Core type definitions for the skill/tool registry system.
 * Inspired by OpenClaw's architecture and Claude Code skills.
 */

import { z } from 'zod';

// ============================================================================
// SKILL PARAMETER TYPES
// ============================================================================

/**
 * Parameter types supported by skills
 */
export type SkillParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'file'
  | 'url'
  | 'json'
  | 'regex'
  | 'path';

/**
 * Parameter definition for a skill
 */
export interface SkillParameter {
  name: string;
  type: SkillParameterType;
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  pattern?: string; // Regex for validation
  min?: number;
  max?: number;
  examples?: unknown[];
}

// ============================================================================
// SKILL CONTEXT TYPES
// ============================================================================

/**
 * Permission levels for skills
 */
export type SkillPermission =
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'shell:execute'
  | 'shell:sudo'
  | 'network:fetch'
  | 'network:listen'
  | 'browser:navigate'
  | 'browser:interact'
  | 'browser:screenshot'
  | 'system:info'
  | 'system:process'
  | 'env:read'
  | 'env:write'
  | 'llm:invoke'
  | 'skill:invoke';

/**
 * Logger interface for skills
 */
export interface SkillLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  progress(message: string, percent?: number): void;
}

/**
 * Storage interface for skills to persist data
 */
export interface SkillStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

/**
 * Execution context passed to skills
 */
export interface SkillContext {
  /** Current working directory */
  workingDir: string;

  /** Environment variables (filtered based on permissions) */
  env: Record<string, string>;

  /** Granted permissions for this execution */
  permissions: Set<SkillPermission>;

  /** Logger for output */
  logger: SkillLogger;

  /** Persistent storage for the skill */
  storage: SkillStorage;

  /** Invoke another skill */
  invokeSkill: (skillName: string, params: Record<string, unknown>) => Promise<SkillResult>;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Session ID for tracking */
  sessionId: string;

  /** User ID if authenticated */
  userId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SKILL RESULT TYPES
// ============================================================================

/**
 * Result returned by skill execution
 */
export interface SkillResult {
  /** Whether the skill executed successfully */
  success: boolean;

  /** Output data from the skill */
  data?: Record<string, unknown>;

  /** Human-readable message */
  message?: string;

  /** Error message if failed */
  error?: string;

  /** Error code for programmatic handling */
  errorCode?: string;

  /** Execution duration in milliseconds */
  duration?: number;

  /** Artifacts produced (files, screenshots, etc.) */
  artifacts?: SkillArtifact[];

  /** Suggested follow-up actions */
  suggestions?: string[];
}

/**
 * Artifact produced by a skill
 */
export interface SkillArtifact {
  type: 'file' | 'image' | 'video' | 'audio' | 'code' | 'data';
  name: string;
  path?: string;
  mimeType?: string;
  size?: number;
  content?: string | Buffer;
  url?: string;
}

// ============================================================================
// SKILL DEFINITION TYPES
// ============================================================================

/**
 * Skill source types
 */
export type SkillSource = 'built-in' | 'workspace' | 'user' | 'remote';

/**
 * Skill executor function type
 */
export type SkillExecutor = (
  params: Record<string, unknown>,
  context: SkillContext
) => Promise<SkillResult>;

/**
 * Main skill interface
 */
export interface Skill {
  /** Unique name identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Author name or organization */
  author?: string;

  /** Author email */
  email?: string;

  /** Repository URL */
  repository?: string;

  /** License */
  license?: string;

  /** Tags for categorization and search */
  tags: string[];

  /** Category for grouping */
  category?: string;

  /** Required permissions */
  permissions?: SkillPermission[];

  /** Input parameters */
  parameters: SkillParameter[];

  /** Output schema description */
  outputs?: SkillParameter[];

  /** The executor function */
  execute: SkillExecutor;

  /** Setup function called when skill is loaded */
  setup?: (context: SkillContext) => Promise<void>;

  /** Teardown function called when skill is unloaded */
  teardown?: (context: SkillContext) => Promise<void>;

  /** Validation function for parameters */
  validate?: (params: Record<string, unknown>) => { valid: boolean; errors?: string[] };

  /** Example invocations for documentation */
  examples?: SkillExample[];

  /** Dependencies on other skills */
  dependencies?: string[];

  /** Incompatible skills */
  conflicts?: string[];

  /** Minimum Alabobai version required */
  minVersion?: string;

  /** Maximum Alabobai version supported */
  maxVersion?: string;
}

/**
 * Example invocation for documentation
 */
export interface SkillExample {
  name: string;
  description: string;
  params: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
}

// ============================================================================
// REGISTERED SKILL TYPES
// ============================================================================

/**
 * Registered skill with metadata
 */
export interface RegisteredSkill extends Skill {
  /** Unique ID (name@version) */
  id: string;

  /** Source of the skill */
  source: SkillSource;

  /** Whether the skill is enabled */
  enabled: boolean;

  /** File path if loaded from disk */
  filePath?: string;

  /** Remote URL if loaded from registry */
  remoteUrl?: string;

  /** Registration timestamp */
  registeredAt: Date;

  /** Last updated timestamp */
  updatedAt?: Date;

  /** Total execution count */
  executionCount: number;

  /** Last execution timestamp */
  lastExecutedAt?: Date;

  /** Average execution duration */
  avgDuration?: number;

  /** Success rate (0-1) */
  successRate?: number;
}

// ============================================================================
// SKILL CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration for the skill registry
 */
export interface SkillRegistryConfig {
  /** Directory for workspace skills */
  workspaceSkillsDir?: string;

  /** Directory for user skills */
  userSkillsDir?: string;

  /** Remote registry URLs */
  remoteRegistries?: string[];

  /** Auto-load skills on startup */
  autoLoad?: boolean;

  /** Default granted permissions */
  defaultPermissions?: SkillPermission[];

  /** Maximum execution time in ms */
  maxExecutionTime?: number;

  /** Enable skill caching */
  enableCache?: boolean;

  /** Cache TTL in seconds */
  cacheTTL?: number;

  /** Enable metrics collection */
  enableMetrics?: boolean;

  /** Sandbox mode (restrict dangerous operations) */
  sandboxMode?: boolean;
}

/**
 * Skill loader configuration
 */
export interface SkillLoaderConfig {
  /** Built-in skills directory */
  builtInDir?: string;

  /** Workspace skills directory (project-specific) */
  workspaceDir?: string;

  /** User skills directory (global) */
  userDir?: string;

  /** Remote registry endpoints */
  remoteEndpoints?: string[];

  /** File extensions to load */
  extensions?: string[];

  /** Whether to load recursively */
  recursive?: boolean;

  /** Validate skills on load */
  validateOnLoad?: boolean;
}

/**
 * Skill executor configuration
 */
export interface SkillExecutorConfig {
  /** Default timeout in ms */
  timeout?: number;

  /** Maximum retries on failure */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelay?: number;

  /** Capture stdout/stderr */
  captureOutput?: boolean;

  /** Enable sandboxing */
  sandbox?: boolean;

  /** Memory limit in MB */
  memoryLimit?: number;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Events emitted by the skill system
 */
export type SkillEvent =
  | { type: 'skill:registered'; skill: RegisteredSkill }
  | { type: 'skill:unregistered'; skillId: string }
  | { type: 'skill:enabled'; skillId: string }
  | { type: 'skill:disabled'; skillId: string }
  | { type: 'skill:updated'; skill: RegisteredSkill }
  | { type: 'skill:executing'; skillId: string; params: Record<string, unknown> }
  | { type: 'skill:completed'; skillId: string; result: SkillResult; duration: number }
  | { type: 'skill:failed'; skillId: string; error: string; duration: number }
  | { type: 'skill:timeout'; skillId: string }
  | { type: 'skill:log'; skillId: string; level: string; message: string; data?: unknown }
  | { type: 'skill:progress'; skillId: string; message: string; percent?: number }
  | { type: 'loader:started'; source: SkillSource }
  | { type: 'loader:completed'; source: SkillSource; count: number }
  | { type: 'loader:error'; source: SkillSource; error: string };

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for skill parameter validation
 */
export const SkillParameterSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'file', 'url', 'json', 'regex', 'path']),
  description: z.string().max(500),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  enum: z.array(z.unknown()).optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  examples: z.array(z.unknown()).optional(),
});

/**
 * Zod schema for skill definition validation
 */
export const SkillDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(1000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.string().optional(),
  email: z.string().email().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  tags: z.array(z.string()),
  category: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  parameters: z.array(SkillParameterSchema),
  examples: z.array(z.object({
    name: z.string(),
    description: z.string(),
    params: z.record(z.unknown()),
    expectedOutput: z.record(z.unknown()).optional(),
  })).optional(),
  dependencies: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
  minVersion: z.string().optional(),
  maxVersion: z.string().optional(),
});

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Skill search options
 */
export interface SkillSearchOptions {
  query?: string;
  tags?: string[];
  category?: string;
  source?: SkillSource;
  enabled?: boolean;
  permissions?: SkillPermission[];
  limit?: number;
  offset?: number;
}

/**
 * Skill execution options
 */
export interface SkillExecutionOptions {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
  permissions?: SkillPermission[];
  workingDir?: string;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Remote skill manifest
 */
export interface RemoteSkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  downloadUrl: string;
  checksum?: string;
  size?: number;
  downloads?: number;
  rating?: number;
  tags: string[];
  permissions?: SkillPermission[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Skill manifest file format (skill.json)
 */
export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  author?: string;
  email?: string;
  repository?: string;
  license?: string;
  tags?: string[];
  category?: string;
  permissions?: SkillPermission[];
  dependencies?: string[];
  alabobai?: {
    minVersion?: string;
    maxVersion?: string;
  };
}

export default {
  SkillParameterSchema,
  SkillDefinitionSchema,
};
