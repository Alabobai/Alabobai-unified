/**
 * Alabobai Skill Registry
 *
 * Central management system for all skills in Alabobai.
 * Handles registration, discovery, search, enable/disable, and versioning.
 */

import { EventEmitter } from 'events';
import type {
  Skill,
  RegisteredSkill,
  SkillSource,
  SkillPermission,
  SkillSearchOptions,
  SkillEvent,
  SkillRegistryConfig,
  SkillResult,
  SkillContext,
} from './skill-types.js';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<SkillRegistryConfig> = {
  workspaceSkillsDir: '.alabobai/skills',
  userSkillsDir: '~/.alabobai/skills',
  remoteRegistries: [],
  autoLoad: true,
  defaultPermissions: ['file:read', 'network:fetch'],
  maxExecutionTime: 60000,
  enableCache: true,
  cacheTTL: 3600,
  enableMetrics: true,
  sandboxMode: false,
};

// ============================================================================
// SKILL REGISTRY CLASS
// ============================================================================

export class SkillRegistry extends EventEmitter {
  private skills: Map<string, RegisteredSkill> = new Map();
  private skillsByName: Map<string, Set<string>> = new Map(); // name -> Set<id>
  private config: Required<SkillRegistryConfig>;
  private initialized: boolean = false;

  constructor(config: SkillRegistryConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.emit('registry:initialized', { timestamp: new Date() });
  }

  /**
   * Shutdown the registry
   */
  async shutdown(): Promise<void> {
    // Call teardown on all skills
    for (const skill of this.skills.values()) {
      if (skill.teardown) {
        try {
          const context = this.createMinimalContext(skill);
          await skill.teardown(context);
        } catch {
          // Ignore teardown errors
        }
      }
    }

    this.skills.clear();
    this.skillsByName.clear();
    this.initialized = false;
    this.emit('registry:shutdown', { timestamp: new Date() });
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register a skill
   */
  register(skill: Skill, options: {
    source?: SkillSource;
    filePath?: string;
    remoteUrl?: string;
    enabled?: boolean;
  } = {}): RegisteredSkill {
    const id = `${skill.name}@${skill.version}`;

    // Check for conflicts
    if (this.skills.has(id)) {
      throw new Error(`Skill already registered: ${id}`);
    }

    // Validate the skill
    const validation = this.validateSkill(skill);
    if (!validation.valid) {
      throw new Error(`Invalid skill: ${validation.errors?.join(', ')}`);
    }

    // Check for conflicts with other skills
    if (skill.conflicts) {
      for (const conflictName of skill.conflicts) {
        const conflicting = this.getByName(conflictName);
        if (conflicting.length > 0 && conflicting.some(s => s.enabled)) {
          throw new Error(`Skill conflicts with enabled skill: ${conflictName}`);
        }
      }
    }

    // Create registered skill
    const registered: RegisteredSkill = {
      ...skill,
      id,
      source: options.source ?? 'built-in',
      enabled: options.enabled ?? true,
      filePath: options.filePath,
      remoteUrl: options.remoteUrl,
      registeredAt: new Date(),
      executionCount: 0,
    };

    // Store in maps
    this.skills.set(id, registered);

    // Track by name for versioning
    if (!this.skillsByName.has(skill.name)) {
      this.skillsByName.set(skill.name, new Set());
    }
    this.skillsByName.get(skill.name)!.add(id);

    // Emit event
    this.emitEvent({ type: 'skill:registered', skill: registered });

    return registered;
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    // Remove from maps
    this.skills.delete(skillId);

    const nameSet = this.skillsByName.get(skill.name);
    if (nameSet) {
      nameSet.delete(skillId);
      if (nameSet.size === 0) {
        this.skillsByName.delete(skill.name);
      }
    }

    // Emit event
    this.emitEvent({ type: 'skill:unregistered', skillId });

    return true;
  }

  /**
   * Update a skill (re-register with new version)
   */
  update(skill: Skill, options: {
    source?: SkillSource;
    filePath?: string;
  } = {}): RegisteredSkill {
    const existingVersions = this.getByName(skill.name);

    // Unregister older versions if they have the same version number
    for (const existing of existingVersions) {
      if (existing.version === skill.version) {
        this.unregister(existing.id);
      }
    }

    // Register the new version
    const registered = this.register(skill, options);
    registered.updatedAt = new Date();

    this.emitEvent({ type: 'skill:updated', skill: registered });

    return registered;
  }

  // ==========================================================================
  // RETRIEVAL
  // ==========================================================================

  /**
   * Get a skill by exact ID (name@version)
   */
  get(skillId: string): RegisteredSkill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get a skill by name (returns latest version)
   */
  getLatest(name: string): RegisteredSkill | undefined {
    const versions = this.getByName(name);
    if (versions.length === 0) return undefined;

    // Sort by version (semver) and return latest
    return versions.sort((a, b) => this.compareVersions(b.version, a.version))[0];
  }

  /**
   * Get all versions of a skill by name
   */
  getByName(name: string): RegisteredSkill[] {
    const ids = this.skillsByName.get(name);
    if (!ids) return [];

    return Array.from(ids)
      .map(id => this.skills.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get skill by name or ID (convenience method)
   */
  resolve(nameOrId: string): RegisteredSkill | undefined {
    // Try exact ID first
    const byId = this.skills.get(nameOrId);
    if (byId) return byId;

    // Try as name (get latest version)
    return this.getLatest(nameOrId);
  }

  // ==========================================================================
  // LISTING AND SEARCH
  // ==========================================================================

  /**
   * List all registered skills
   */
  list(options: {
    source?: SkillSource;
    enabled?: boolean;
    category?: string;
  } = {}): RegisteredSkill[] {
    let skills = Array.from(this.skills.values());

    // Remove duplicates (keep only latest version of each name)
    const seen = new Set<string>();
    skills = skills.filter(s => {
      if (seen.has(s.name)) {
        // Check if this version is newer
        const existing = this.getLatest(s.name);
        return existing?.id === s.id;
      }
      seen.add(s.name);
      return true;
    });

    // Apply filters
    if (options.source !== undefined) {
      skills = skills.filter(s => s.source === options.source);
    }

    if (options.enabled !== undefined) {
      skills = skills.filter(s => s.enabled === options.enabled);
    }

    if (options.category !== undefined) {
      skills = skills.filter(s => s.category === options.category);
    }

    return skills;
  }

  /**
   * Search skills by query
   */
  search(options: SkillSearchOptions): RegisteredSkill[] {
    let skills = this.list({
      source: options.source,
      enabled: options.enabled,
      category: options.category,
    });

    // Filter by query
    if (options.query) {
      const query = options.query.toLowerCase();
      skills = skills.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some(t => t.toLowerCase().includes(query)) ||
        s.author?.toLowerCase().includes(query)
      );
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      skills = skills.filter(s =>
        options.tags!.some(tag => s.tags.includes(tag))
      );
    }

    // Filter by permissions
    if (options.permissions && options.permissions.length > 0) {
      skills = skills.filter(s =>
        s.permissions?.some(p => options.permissions!.includes(p))
      );
    }

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? skills.length;

    return skills.slice(offset, offset + limit);
  }

  /**
   * Get all unique categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const skill of this.skills.values()) {
      if (skill.category) {
        categories.add(skill.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all unique tags
   */
  getTags(): string[] {
    const tags = new Set<string>();
    for (const skill of this.skills.values()) {
      for (const tag of skill.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    bySource: Record<SkillSource, number>;
    byCategory: Record<string, number>;
    totalExecutions: number;
    avgSuccessRate: number;
  } {
    const skills = Array.from(this.skills.values());
    const enabled = skills.filter(s => s.enabled);
    const disabled = skills.filter(s => !s.enabled);

    const bySource: Record<SkillSource, number> = {
      'built-in': 0,
      'workspace': 0,
      'user': 0,
      'remote': 0,
    };

    const byCategory: Record<string, number> = {};
    let totalExecutions = 0;
    let totalSuccessRate = 0;
    let skillsWithRate = 0;

    for (const skill of skills) {
      bySource[skill.source]++;

      if (skill.category) {
        byCategory[skill.category] = (byCategory[skill.category] ?? 0) + 1;
      }

      totalExecutions += skill.executionCount;

      if (skill.successRate !== undefined) {
        totalSuccessRate += skill.successRate;
        skillsWithRate++;
      }
    }

    return {
      total: skills.length,
      enabled: enabled.length,
      disabled: disabled.length,
      bySource,
      byCategory,
      totalExecutions,
      avgSuccessRate: skillsWithRate > 0 ? totalSuccessRate / skillsWithRate : 1,
    };
  }

  // ==========================================================================
  // ENABLE/DISABLE
  // ==========================================================================

  /**
   * Enable a skill
   */
  enable(skillId: string): boolean {
    const skill = this.resolve(skillId);
    if (!skill) return false;

    if (skill.enabled) return true;

    // Check for conflicts
    if (skill.conflicts) {
      for (const conflictName of skill.conflicts) {
        const conflicting = this.getByName(conflictName);
        if (conflicting.some(s => s.enabled)) {
          throw new Error(`Cannot enable: conflicts with ${conflictName}`);
        }
      }
    }

    skill.enabled = true;
    this.emitEvent({ type: 'skill:enabled', skillId: skill.id });

    return true;
  }

  /**
   * Disable a skill
   */
  disable(skillId: string): boolean {
    const skill = this.resolve(skillId);
    if (!skill) return false;

    if (!skill.enabled) return true;

    // Check if other skills depend on this one
    const dependents = this.findDependents(skill.name);
    const enabledDependents = dependents.filter(d => d.enabled);

    if (enabledDependents.length > 0) {
      throw new Error(
        `Cannot disable: required by ${enabledDependents.map(d => d.name).join(', ')}`
      );
    }

    skill.enabled = false;
    this.emitEvent({ type: 'skill:disabled', skillId: skill.id });

    return true;
  }

  /**
   * Toggle a skill's enabled state
   */
  toggle(skillId: string): boolean {
    const skill = this.resolve(skillId);
    if (!skill) return false;

    if (skill.enabled) {
      return this.disable(skillId);
    } else {
      return this.enable(skillId);
    }
  }

  // ==========================================================================
  // VERSIONING
  // ==========================================================================

  /**
   * Get all versions of a skill
   */
  getVersions(name: string): string[] {
    return this.getByName(name)
      .map(s => s.version)
      .sort((a, b) => this.compareVersions(b, a));
  }

  /**
   * Check if a specific version is registered
   */
  hasVersion(name: string, version: string): boolean {
    return this.skills.has(`${name}@${version}`);
  }

  /**
   * Compare semver versions
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
      if (diff !== 0) return diff;
    }

    return 0;
  }

  // ==========================================================================
  // DEPENDENCY MANAGEMENT
  // ==========================================================================

  /**
   * Find skills that depend on a given skill
   */
  findDependents(skillName: string): RegisteredSkill[] {
    return Array.from(this.skills.values()).filter(
      s => s.dependencies?.includes(skillName)
    );
  }

  /**
   * Check if all dependencies are satisfied
   */
  checkDependencies(skill: Skill): { satisfied: boolean; missing: string[] } {
    const missing: string[] = [];

    if (skill.dependencies) {
      for (const dep of skill.dependencies) {
        const depSkill = this.getLatest(dep);
        if (!depSkill || !depSkill.enabled) {
          missing.push(dep);
        }
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * Get dependency tree for a skill
   */
  getDependencyTree(skillName: string, visited = new Set<string>()): Map<string, string[]> {
    const tree = new Map<string, string[]>();
    const skill = this.getLatest(skillName);

    if (!skill || visited.has(skillName)) {
      return tree;
    }

    visited.add(skillName);
    tree.set(skillName, skill.dependencies ?? []);

    for (const dep of skill.dependencies ?? []) {
      const subTree = this.getDependencyTree(dep, visited);
      for (const [key, value] of subTree) {
        tree.set(key, value);
      }
    }

    return tree;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate a skill definition
   */
  validateSkill(skill: Skill): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!skill.name || typeof skill.name !== 'string') {
      errors.push('Invalid or missing name');
    } else if (!/^[a-z0-9-]+$/.test(skill.name)) {
      errors.push('Name must be lowercase alphanumeric with dashes');
    }

    if (!skill.description || typeof skill.description !== 'string') {
      errors.push('Invalid or missing description');
    }

    if (!skill.version || !/^\d+\.\d+\.\d+$/.test(skill.version)) {
      errors.push('Invalid or missing version (must be semver)');
    }

    if (!Array.isArray(skill.tags)) {
      errors.push('Tags must be an array');
    }

    if (!Array.isArray(skill.parameters)) {
      errors.push('Parameters must be an array');
    } else {
      // Validate each parameter
      for (const param of skill.parameters) {
        if (!param.name || typeof param.name !== 'string') {
          errors.push(`Invalid parameter: missing name`);
        }
        if (!param.type) {
          errors.push(`Invalid parameter ${param.name}: missing type`);
        }
        if (!param.description || typeof param.description !== 'string') {
          errors.push(`Invalid parameter ${param.name}: missing description`);
        }
      }
    }

    if (typeof skill.execute !== 'function') {
      errors.push('Execute must be a function');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ==========================================================================
  // METRICS
  // ==========================================================================

  /**
   * Record execution metrics
   */
  recordExecution(skillId: string, result: SkillResult, duration: number): void {
    const skill = this.skills.get(skillId);
    if (!skill || !this.config.enableMetrics) return;

    skill.executionCount++;
    skill.lastExecutedAt = new Date();

    // Update average duration
    if (skill.avgDuration === undefined) {
      skill.avgDuration = duration;
    } else {
      // Exponential moving average
      skill.avgDuration = skill.avgDuration * 0.9 + duration * 0.1;
    }

    // Update success rate
    const success = result.success ? 1 : 0;
    if (skill.successRate === undefined) {
      skill.successRate = success;
    } else {
      // Exponential moving average
      skill.successRate = skill.successRate * 0.9 + success * 0.1;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Emit a typed event
   */
  private emitEvent(event: SkillEvent): void {
    this.emit(event.type, event);
    this.emit('skill:event', event);
  }

  /**
   * Create a minimal context for setup/teardown
   */
  private createMinimalContext(skill: RegisteredSkill): SkillContext {
    return {
      workingDir: process.cwd(),
      env: {},
      permissions: new Set(this.config.defaultPermissions),
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        progress: () => {},
      },
      storage: {
        get: async () => undefined,
        set: async () => {},
        delete: async () => {},
        has: async () => false,
        keys: async () => [],
        clear: async () => {},
      },
      invokeSkill: async () => ({ success: false, error: 'Not available during setup/teardown' }),
      sessionId: 'system',
    };
  }

  /**
   * Get the total number of registered skills
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Check if registry has a skill
   */
  has(skillId: string): boolean {
    return this.skills.has(skillId) || this.skillsByName.has(skillId);
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
    this.skillsByName.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalRegistry: SkillRegistry | null = null;

/**
 * Get or create the global skill registry
 */
export function getSkillRegistry(config?: SkillRegistryConfig): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillRegistry(config);
  }
  return globalRegistry;
}

/**
 * Create a new skill registry instance
 */
export function createSkillRegistry(config?: SkillRegistryConfig): SkillRegistry {
  return new SkillRegistry(config);
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetSkillRegistry(): void {
  globalRegistry?.shutdown();
  globalRegistry = null;
}

export default SkillRegistry;
