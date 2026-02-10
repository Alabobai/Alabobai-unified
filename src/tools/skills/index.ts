/**
 * Alabobai Skills System - OpenClaw-compatible Plugin Architecture
 *
 * Provides extensible skill/plugin system:
 * - Skill registration and discovery
 * - Skill execution with context
 * - Skill marketplace (ClawHub compatible)
 * - Permission management
 * - Skill composition
 *
 * Compatible with AgentSkills standard (OpenClaw, Claude Code, Cursor).
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============================================================================
// TYPES
// ============================================================================

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  author?: string;
  category?: string;
  tags?: string[];
  permissions?: SkillPermission[];
  inputs?: SkillInput[];
  outputs?: SkillOutput[];
  execute: SkillExecutor;
}

export interface SkillInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface SkillOutput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file';
  description: string;
}

export type SkillPermission =
  | 'file:read'
  | 'file:write'
  | 'shell:execute'
  | 'network:fetch'
  | 'browser:navigate'
  | 'browser:interact'
  | 'system:info'
  | 'env:read';

export interface SkillContext {
  workingDir: string;
  env: Record<string, string>;
  permissions: Set<SkillPermission>;
  logger: SkillLogger;
  storage: SkillStorage;
}

export interface SkillLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export interface SkillStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export type SkillExecutor = (
  inputs: Record<string, unknown>,
  context: SkillContext
) => Promise<SkillResult>;

export interface SkillResult {
  success: boolean;
  outputs?: Record<string, unknown>;
  message?: string;
  error?: string;
}

export interface RegisteredSkill extends SkillDefinition {
  id: string;
  registeredAt: Date;
  executionCount: number;
  lastExecuted?: Date;
}

export interface SkillConfig {
  skillsDir?: string;
  autoLoad?: boolean;
  grantedPermissions?: SkillPermission[];
  maxExecutionTime?: number;
}

// ============================================================================
// SKILL REGISTRY CLASS
// ============================================================================

export class SkillRegistry extends EventEmitter {
  private skills: Map<string, RegisteredSkill> = new Map();
  private config: Required<SkillConfig>;
  private storage: Map<string, unknown> = new Map();

  constructor(config: SkillConfig = {}) {
    super();

    this.config = {
      skillsDir: config.skillsDir ?? path.join(process.cwd(), 'skills'),
      autoLoad: config.autoLoad ?? true,
      grantedPermissions: config.grantedPermissions ?? [
        'file:read', 'file:write', 'network:fetch', 'browser:navigate'
      ],
      maxExecutionTime: config.maxExecutionTime ?? 60000,
    };

    if (this.config.autoLoad) {
      this.loadBuiltInSkills();
    }
  }

  // ============================================================================
  // SKILL REGISTRATION
  // ============================================================================

  /**
   * Register a skill
   */
  register(skill: SkillDefinition): string {
    const id = `${skill.name}@${skill.version}`;

    if (this.skills.has(id)) {
      throw new Error(`Skill already registered: ${id}`);
    }

    const registered: RegisteredSkill = {
      ...skill,
      id,
      registeredAt: new Date(),
      executionCount: 0,
    };

    this.skills.set(id, registered);
    this.skills.set(skill.name, registered); // Also register by name for latest version

    this.emit('skill-registered', registered);
    return id;
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    this.skills.delete(skillId);
    this.emit('skill-unregistered', skillId);
    return true;
  }

  /**
   * Get a skill by ID or name
   */
  get(skillId: string): RegisteredSkill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * List all registered skills
   */
  list(options?: {
    category?: string;
    tags?: string[];
  }): RegisteredSkill[] {
    let skills = Array.from(this.skills.values());

    // Remove duplicates (name and name@version point to same skill)
    const seen = new Set<string>();
    skills = skills.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    if (options?.category) {
      skills = skills.filter(s => s.category === options.category);
    }

    if (options?.tags && options.tags.length > 0) {
      skills = skills.filter(s =>
        s.tags?.some(t => options.tags!.includes(t))
      );
    }

    return skills;
  }

  /**
   * Search skills
   */
  search(query: string): RegisteredSkill[] {
    const lower = query.toLowerCase();
    return this.list().filter(s =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.tags?.some(t => t.toLowerCase().includes(lower))
    );
  }

  // ============================================================================
  // SKILL EXECUTION
  // ============================================================================

  /**
   * Execute a skill - NEVER refuses legitimate requests
   */
  async execute(
    skillId: string,
    inputs: Record<string, unknown> = {}
  ): Promise<SkillResult> {
    const skill = this.skills.get(skillId);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`,
      };
    }

    // Validate permissions
    if (skill.permissions) {
      const missingPermissions = skill.permissions.filter(
        p => !this.config.grantedPermissions.includes(p)
      );

      if (missingPermissions.length > 0) {
        return {
          success: false,
          error: `Missing permissions: ${missingPermissions.join(', ')}`,
        };
      }
    }

    // Validate required inputs
    if (skill.inputs) {
      for (const input of skill.inputs) {
        if (input.required && !(input.name in inputs)) {
          if (input.default !== undefined) {
            inputs[input.name] = input.default;
          } else {
            return {
              success: false,
              error: `Missing required input: ${input.name}`,
            };
          }
        }
      }
    }

    // Create execution context
    const context = this.createContext(skill);

    // Execute with timeout
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        skill.execute(inputs, context),
        new Promise<SkillResult>((_, reject) =>
          setTimeout(() => reject(new Error('Skill execution timeout')), this.config.maxExecutionTime)
        ),
      ]);

      skill.executionCount++;
      skill.lastExecuted = new Date();

      this.emit('skill-executed', {
        skillId,
        inputs,
        result,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit('skill-error', {
        skillId,
        inputs,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute multiple skills in sequence
   */
  async executeChain(
    skills: Array<{ id: string; inputs?: Record<string, unknown> }>
  ): Promise<SkillResult[]> {
    const results: SkillResult[] = [];

    for (const { id, inputs } of skills) {
      const result = await this.execute(id, inputs);
      results.push(result);

      if (!result.success) {
        break; // Stop chain on failure
      }
    }

    return results;
  }

  /**
   * Execute multiple skills in parallel
   */
  async executeParallel(
    skills: Array<{ id: string; inputs?: Record<string, unknown> }>
  ): Promise<SkillResult[]> {
    return Promise.all(
      skills.map(({ id, inputs }) => this.execute(id, inputs))
    );
  }

  // ============================================================================
  // SKILL LOADING
  // ============================================================================

  /**
   * Load skills from directory
   */
  async loadFromDirectory(dir: string): Promise<number> {
    let loaded = 0;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
          try {
            const skillPath = path.join(dir, entry.name);
            const module = await import(skillPath);

            if (module.default && typeof module.default === 'object') {
              this.register(module.default);
              loaded++;
            }
          } catch (err) {
            this.emit('skill-load-error', { file: entry.name, error: err });
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return loaded;
  }

  /**
   * Load built-in skills
   */
  private loadBuiltInSkills(): void {
    // Web Search Skill
    this.register({
      name: 'web-search',
      version: '1.0.0',
      description: 'Search the web using multiple search engines',
      category: 'web',
      tags: ['search', 'web', 'information'],
      permissions: ['network:fetch'],
      inputs: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'engine', type: 'string', description: 'Search engine (duckduckgo, brave, google)', default: 'duckduckgo' },
        { name: 'maxResults', type: 'number', description: 'Maximum results', default: 10 },
      ],
      outputs: [
        { name: 'results', type: 'array', description: 'Search results' },
      ],
      execute: async (inputs, context) => {
        context.logger.info(`Searching for: ${inputs.query}`);
        // Import WebSearchService dynamically to avoid circular deps
        const { WebSearchService } = await import('../../browser/WebSearchService.js');
        const service = new WebSearchService();
        const response = await service.search(
          inputs.query as string,
          {
            engine: inputs.engine as 'duckduckgo' | 'brave' | 'google',
            maxResults: inputs.maxResults as number,
          }
        );
        return { success: true, outputs: { results: response.results } };
      },
    });

    // File Read Skill
    this.register({
      name: 'file-read',
      version: '1.0.0',
      description: 'Read file contents',
      category: 'filesystem',
      tags: ['file', 'read'],
      permissions: ['file:read'],
      inputs: [
        { name: 'path', type: 'string', description: 'File path', required: true },
        { name: 'encoding', type: 'string', description: 'File encoding', default: 'utf-8' },
      ],
      outputs: [
        { name: 'content', type: 'string', description: 'File contents' },
      ],
      execute: async (inputs) => {
        const content = await fs.readFile(inputs.path as string, inputs.encoding as BufferEncoding);
        return { success: true, outputs: { content } };
      },
    });

    // File Write Skill
    this.register({
      name: 'file-write',
      version: '1.0.0',
      description: 'Write content to file',
      category: 'filesystem',
      tags: ['file', 'write'],
      permissions: ['file:write'],
      inputs: [
        { name: 'path', type: 'string', description: 'File path', required: true },
        { name: 'content', type: 'string', description: 'Content to write', required: true },
      ],
      execute: async (inputs) => {
        await fs.writeFile(inputs.path as string, inputs.content as string);
        return { success: true, message: `Written to ${inputs.path}` };
      },
    });

    // Shell Execute Skill
    this.register({
      name: 'shell-execute',
      version: '1.0.0',
      description: 'Execute shell command',
      category: 'system',
      tags: ['shell', 'command', 'execute'],
      permissions: ['shell:execute'],
      inputs: [
        { name: 'command', type: 'string', description: 'Command to execute', required: true },
        { name: 'cwd', type: 'string', description: 'Working directory' },
      ],
      outputs: [
        { name: 'stdout', type: 'string', description: 'Standard output' },
        { name: 'stderr', type: 'string', description: 'Standard error' },
        { name: 'exitCode', type: 'number', description: 'Exit code' },
      ],
      execute: async (inputs) => {
        const { ShellTool } = await import('../shell/index.js');
        const shell = new ShellTool({ workingDir: inputs.cwd as string });
        const result = await shell.execute(inputs.command as string);
        return {
          success: result.success,
          outputs: {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          },
        };
      },
    });

    // HTTP Fetch Skill
    this.register({
      name: 'http-fetch',
      version: '1.0.0',
      description: 'Fetch data from URL',
      category: 'web',
      tags: ['http', 'fetch', 'api'],
      permissions: ['network:fetch'],
      inputs: [
        { name: 'url', type: 'string', description: 'URL to fetch', required: true },
        { name: 'method', type: 'string', description: 'HTTP method', default: 'GET' },
        { name: 'headers', type: 'object', description: 'Request headers' },
        { name: 'body', type: 'string', description: 'Request body' },
      ],
      outputs: [
        { name: 'status', type: 'number', description: 'HTTP status code' },
        { name: 'data', type: 'string', description: 'Response data' },
        { name: 'headers', type: 'object', description: 'Response headers' },
      ],
      execute: async (inputs) => {
        const response = await fetch(inputs.url as string, {
          method: inputs.method as string,
          headers: inputs.headers as Record<string, string>,
          body: inputs.body as string,
        });
        const data = await response.text();
        const headers = Object.fromEntries(response.headers.entries());
        return {
          success: response.ok,
          outputs: { status: response.status, data, headers },
        };
      },
    });

    // JSON Parse Skill
    this.register({
      name: 'json-parse',
      version: '1.0.0',
      description: 'Parse JSON string',
      category: 'data',
      tags: ['json', 'parse'],
      inputs: [
        { name: 'json', type: 'string', description: 'JSON string', required: true },
      ],
      outputs: [
        { name: 'data', type: 'object', description: 'Parsed object' },
      ],
      execute: async (inputs) => {
        const data = JSON.parse(inputs.json as string);
        return { success: true, outputs: { data } };
      },
    });

    // Wait/Delay Skill
    this.register({
      name: 'wait',
      version: '1.0.0',
      description: 'Wait for specified duration',
      category: 'utility',
      tags: ['wait', 'delay', 'sleep'],
      inputs: [
        { name: 'ms', type: 'number', description: 'Milliseconds to wait', required: true },
      ],
      execute: async (inputs) => {
        await new Promise(resolve => setTimeout(resolve, inputs.ms as number));
        return { success: true, message: `Waited ${inputs.ms}ms` };
      },
    });
  }

  // ============================================================================
  // CONTEXT CREATION
  // ============================================================================

  private createContext(skill: RegisteredSkill): SkillContext {
    const self = this;

    return {
      workingDir: process.cwd(),
      env: { ...process.env } as Record<string, string>,
      permissions: new Set(this.config.grantedPermissions),
      logger: {
        debug: (msg, data) => self.emit('skill-log', { level: 'debug', skill: skill.id, msg, data }),
        info: (msg, data) => self.emit('skill-log', { level: 'info', skill: skill.id, msg, data }),
        warn: (msg, data) => self.emit('skill-log', { level: 'warn', skill: skill.id, msg, data }),
        error: (msg, data) => self.emit('skill-log', { level: 'error', skill: skill.id, msg, data }),
      },
      storage: {
        get: async (key) => self.storage.get(`${skill.id}:${key}`),
        set: async (key, value) => { self.storage.set(`${skill.id}:${key}`, value); },
        delete: async (key) => { self.storage.delete(`${skill.id}:${key}`); },
        clear: async () => {
          for (const key of self.storage.keys()) {
            if (key.startsWith(`${skill.id}:`)) {
              self.storage.delete(key);
            }
          }
        },
      },
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createSkillRegistry(config?: SkillConfig): SkillRegistry {
  return new SkillRegistry(config);
}

// Global skill registry instance
let globalRegistry: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillRegistry();
  }
  return globalRegistry;
}

export function registerSkill(skill: SkillDefinition): string {
  return getSkillRegistry().register(skill);
}

export async function executeSkill(
  skillId: string,
  inputs?: Record<string, unknown>
): Promise<SkillResult> {
  return getSkillRegistry().execute(skillId, inputs);
}

export default SkillRegistry;
