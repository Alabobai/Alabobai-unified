/**
 * Alabobai Agent Template System
 *
 * A comprehensive template system for creating, managing, and sharing
 * reusable agent configurations. Provides foundation for marketplace functionality.
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type { AgentCategory, AgentStatus } from '../../../src/core/types.js';

// ============================================================================
// TEMPLATE CATEGORIES
// ============================================================================

export type TemplateCategory =
  | 'research'      // Research and information gathering agents
  | 'coding'        // Code generation, review, and development agents
  | 'automation'    // Workflow automation and task execution agents
  | 'analysis'      // Data analysis and insight generation agents
  | 'content'       // Content creation and writing agents
  | 'support'       // Customer support and communication agents
  | 'financial'     // Financial analysis and advisory agents
  | 'legal'         // Legal document and compliance agents
  | 'custom';       // User-defined categories

// ============================================================================
// TOOL CONFIGURATION TYPES
// ============================================================================

export interface ToolConfig {
  /** Unique tool identifier */
  id: string;
  /** Human-readable tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Whether the tool is enabled by default */
  enabled: boolean;
  /** Tool-specific configuration */
  config?: Record<string, unknown>;
  /** Required permissions for this tool */
  requiredPermissions?: string[];
}

export interface ToolSet {
  /** Browser/web automation tools */
  browserAutomation?: string[];
  /** Terminal/shell command tools */
  terminalCommands?: string[];
  /** API integration tools */
  apis?: string[];
  /** File system operation tools */
  fileOperations?: string[];
  /** External service integrations */
  externalServices?: string[];
  /** Custom tools specific to this template */
  custom?: ToolConfig[];
}

// ============================================================================
// PROMPT CONFIGURATION
// ============================================================================

export interface PromptConfig {
  /** Main system prompt defining agent behavior */
  systemPrompt: string;
  /** Additional context prompts for specific situations */
  contextPrompts?: Record<string, string>;
  /** Prompt templates with placeholders */
  templates?: PromptTemplate[];
  /** Instructions for specific task types */
  taskInstructions?: Record<string, string>;
}

export interface PromptTemplate {
  /** Template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template content with {{placeholders}} */
  content: string;
  /** Required placeholder values */
  requiredVariables: string[];
  /** Optional placeholder values with defaults */
  optionalVariables?: Record<string, string>;
}

// ============================================================================
// SETTINGS AND CONSTRAINTS
// ============================================================================

export interface TemplateSettings {
  /** LLM model preference */
  preferredModel?: string;
  /** Temperature setting (0-1) */
  temperature?: number;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Maximum conversation context messages */
  maxContextMessages?: number;
  /** Timeout for operations in milliseconds */
  timeoutMs?: number;
  /** Enable streaming responses */
  streamingEnabled?: boolean;
  /** Custom settings key-value pairs */
  custom?: Record<string, unknown>;
}

export interface TemplateConstraints {
  /** Actions that require user approval */
  requireApproval?: string[];
  /** Domains/topics the agent should avoid */
  blockedTopics?: string[];
  /** Maximum file size for uploads (bytes) */
  maxFileSizeBytes?: number;
  /** Allowed file types for processing */
  allowedFileTypes?: string[];
  /** Rate limits */
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerHour?: number;
  };
  /** Content moderation settings */
  contentModeration?: {
    enabled: boolean;
    strictness: 'low' | 'medium' | 'high';
  };
}

// ============================================================================
// TEMPLATE CONFIGURATION
// ============================================================================

export interface TemplateConfig {
  /** Tool configuration */
  tools: ToolSet;
  /** Prompt configuration */
  prompts: PromptConfig;
  /** Agent settings */
  settings: TemplateSettings;
  /** Operational constraints */
  constraints: TemplateConstraints;
  /** Agent capabilities/skills */
  capabilities: string[];
  /** Agent category mapping */
  agentCategory: AgentCategory;
  /** Icon identifier or URL */
  icon?: string;
}

// ============================================================================
// TEMPLATE METADATA
// ============================================================================

export interface TemplateAuthor {
  /** Author identifier */
  id: string;
  /** Author display name */
  name: string;
  /** Author email (optional) */
  email?: string;
  /** Author organization */
  organization?: string;
  /** Author website/profile URL */
  url?: string;
  /** Whether author is verified */
  verified?: boolean;
}

export interface TemplateStats {
  /** Number of times template has been used */
  usageCount: number;
  /** Number of active instances */
  activeInstances: number;
  /** Average rating (1-5) */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Number of times shared/forked */
  forkCount: number;
  /** Success rate of template executions */
  successRate: number;
  /** Average execution time in milliseconds */
  avgExecutionTimeMs: number;
}

export interface TemplateMetadata {
  /** Template author information */
  author: TemplateAuthor;
  /** Creation timestamp */
  created: Date;
  /** Last update timestamp */
  updated: Date;
  /** Template category */
  category: TemplateCategory;
  /** Searchable tags */
  tags: string[];
  /** Usage statistics */
  stats: TemplateStats;
  /** Whether template is featured */
  featured?: boolean;
  /** Whether template is trending */
  trending?: boolean;
  /** Template license */
  license?: string;
  /** Template documentation URL */
  documentationUrl?: string;
  /** Template source repository */
  repositoryUrl?: string;
  /** Minimum platform version required */
  minPlatformVersion?: string;
  /** Changelog entries */
  changelog?: ChangelogEntry[];
}

export interface ChangelogEntry {
  /** Version number */
  version: string;
  /** Release date */
  date: Date;
  /** List of changes */
  changes: string[];
  /** Type of release */
  type: 'major' | 'minor' | 'patch';
}

// ============================================================================
// AGENT TEMPLATE
// ============================================================================

export interface AgentTemplate {
  /** Unique template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Long description for marketplace listing */
  longDescription?: string;
  /** Current version (semver) */
  version: string;
  /** Template configuration */
  config: TemplateConfig;
  /** Template metadata */
  metadata: TemplateMetadata;
  /** Parent template ID (for inheritance) */
  parentTemplateId?: string;
  /** Whether this template is deleted (soft delete) */
  isDeleted?: boolean;
  /** Deletion timestamp */
  deletedAt?: Date;
  /** Whether template is published/public */
  isPublished?: boolean;
}

// ============================================================================
// TEMPLATE VERSION HISTORY
// ============================================================================

export interface TemplateVersion {
  /** Version identifier */
  id: string;
  /** Template ID this version belongs to */
  templateId: string;
  /** Version number (semver) */
  version: string;
  /** Snapshot of config at this version */
  config: TemplateConfig;
  /** Version creation timestamp */
  createdAt: Date;
  /** User who created this version */
  createdBy: string;
  /** Version notes/changelog */
  notes?: string;
  /** Whether this is the current active version */
  isActive: boolean;
}

// ============================================================================
// TEMPLATE INSTANCE
// ============================================================================

export interface TemplateOverrides {
  /** Overridden prompt configuration */
  prompts?: Partial<PromptConfig>;
  /** Overridden settings */
  settings?: Partial<TemplateSettings>;
  /** Overridden constraints */
  constraints?: Partial<TemplateConstraints>;
  /** Additional tools to enable */
  additionalTools?: ToolSet;
  /** Tools to disable */
  disabledTools?: string[];
  /** Custom overrides */
  custom?: Record<string, unknown>;
}

export interface ExecutionRecord {
  /** Execution identifier */
  id: string;
  /** Timestamp of execution */
  timestamp: Date;
  /** Task/prompt that was executed */
  task: string;
  /** Execution status */
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Tokens used */
  tokensUsed?: number;
  /** Error message if failed */
  error?: string;
  /** Execution result summary */
  resultSummary?: string;
}

export interface TemplateInstance {
  /** Instance identifier */
  id: string;
  /** Source template ID */
  templateId: string;
  /** Template version at instantiation */
  templateVersion: string;
  /** Instance name (user-defined) */
  name: string;
  /** Instance description */
  description?: string;
  /** Template overrides applied to this instance */
  overrides: TemplateOverrides;
  /** Execution history for this instance */
  executionHistory: ExecutionRecord[];
  /** Instance creation timestamp */
  createdAt: Date;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Owner user ID */
  ownerId: string;
  /** Current instance status */
  status: AgentStatus;
  /** Resolved/merged configuration */
  resolvedConfig?: TemplateConfig;
}

// ============================================================================
// TEMPLATE ANALYTICS
// ============================================================================

export interface TemplateAnalytics {
  /** Template ID */
  templateId: string;
  /** Time period for analytics */
  period: {
    start: Date;
    end: Date;
  };
  /** Total executions in period */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Success rate percentage */
  successRate: number;
  /** Average execution time in milliseconds */
  avgExecutionTimeMs: number;
  /** Total tokens consumed */
  totalTokensUsed: number;
  /** Unique users */
  uniqueUsers: number;
  /** Peak usage hours (0-23) */
  peakUsageHours: number[];
  /** Most common task types */
  topTaskTypes: Array<{ type: string; count: number }>;
  /** Error breakdown */
  errorBreakdown: Array<{ error: string; count: number }>;
}

// ============================================================================
// SEARCH AND DISCOVERY TYPES
// ============================================================================

export interface TemplateSearchQuery {
  /** Text search query */
  query?: string;
  /** Filter by category */
  category?: TemplateCategory | TemplateCategory[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by capabilities */
  capabilities?: string[];
  /** Minimum rating filter */
  minRating?: number;
  /** Filter by author */
  authorId?: string;
  /** Include only featured templates */
  featuredOnly?: boolean;
  /** Include only trending templates */
  trendingOnly?: boolean;
  /** Sort options */
  sortBy?: 'relevance' | 'rating' | 'popularity' | 'newest' | 'name';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Maximum results to return */
  limit?: number;
}

export interface TemplateSearchResult {
  /** Found templates */
  templates: AgentTemplate[];
  /** Total matching templates */
  totalCount: number;
  /** Search metadata */
  metadata: {
    query: TemplateSearchQuery;
    executionTimeMs: number;
    facets?: {
      categories: Array<{ category: TemplateCategory; count: number }>;
      tags: Array<{ tag: string; count: number }>;
    };
  };
}

export interface TemplateRecommendation {
  /** Recommended template */
  template: AgentTemplate;
  /** Recommendation score (0-1) */
  score: number;
  /** Reason for recommendation */
  reason: string;
  /** Matched capabilities/features */
  matchedFeatures: string[];
}

// ============================================================================
// IMPORT/EXPORT TYPES
// ============================================================================

export interface TemplateExport {
  /** Export format version */
  formatVersion: string;
  /** Export timestamp */
  exportedAt: Date;
  /** Exporting platform version */
  platformVersion: string;
  /** Template data */
  template: AgentTemplate;
  /** Include version history */
  versions?: TemplateVersion[];
  /** Checksum for validation */
  checksum: string;
}

export interface TemplateImportResult {
  /** Whether import was successful */
  success: boolean;
  /** Imported template (if successful) */
  template?: AgentTemplate;
  /** Validation errors (if any) */
  errors?: TemplateValidationError[];
  /** Validation warnings */
  warnings?: string[];
  /** Suggested fixes for errors */
  suggestedFixes?: Record<string, string>;
}

export interface TemplateValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Path to the problematic field */
  path: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

// ============================================================================
// TEMPLATE EVENTS
// ============================================================================

export type TemplateEvent =
  | { type: 'template:created'; templateId: string; template: AgentTemplate }
  | { type: 'template:updated'; templateId: string; version: string; changes: string[] }
  | { type: 'template:deleted'; templateId: string }
  | { type: 'template:published'; templateId: string }
  | { type: 'template:unpublished'; templateId: string }
  | { type: 'instance:created'; instanceId: string; templateId: string }
  | { type: 'instance:executed'; instanceId: string; executionId: string; status: string }
  | { type: 'instance:destroyed'; instanceId: string }
  | { type: 'template:imported'; templateId: string; source: string }
  | { type: 'template:exported'; templateId: string; destination: string };

// ============================================================================
// AGENT TEMPLATE MANAGER CLASS
// ============================================================================

export class AgentTemplateManager extends EventEmitter {
  private templates: Map<string, AgentTemplate>;
  private instances: Map<string, TemplateInstance>;
  private versions: Map<string, TemplateVersion[]>;
  private analytics: Map<string, ExecutionRecord[]>;

  private readonly EXPORT_FORMAT_VERSION = '1.0.0';
  private readonly PLATFORM_VERSION = '1.0.0';

  constructor() {
    super();
    this.templates = new Map();
    this.instances = new Map();
    this.versions = new Map();
    this.analytics = new Map();
  }

  // ============================================================================
  // TEMPLATE CREATION
  // ============================================================================

  /**
   * Create a new template from configuration
   */
  createTemplate(params: {
    name: string;
    description: string;
    longDescription?: string;
    config: TemplateConfig;
    category: TemplateCategory;
    tags?: string[];
    author: TemplateAuthor;
    parentTemplateId?: string;
  }): AgentTemplate {
    const now = new Date();
    const templateId = `tpl-${uuid()}`;

    // Validate parent template if inheritance is specified
    if (params.parentTemplateId) {
      const parent = this.templates.get(params.parentTemplateId);
      if (!parent) {
        throw new Error(`Parent template not found: ${params.parentTemplateId}`);
      }
      // Merge parent config with provided config
      params.config = this.mergeConfigs(parent.config, params.config);
    }

    const template: AgentTemplate = {
      id: templateId,
      name: params.name,
      description: params.description,
      longDescription: params.longDescription,
      version: '1.0.0',
      config: params.config,
      metadata: {
        author: params.author,
        created: now,
        updated: now,
        category: params.category,
        tags: params.tags || [],
        stats: {
          usageCount: 0,
          activeInstances: 0,
          rating: 0,
          ratingCount: 0,
          forkCount: 0,
          successRate: 0,
          avgExecutionTimeMs: 0,
        },
        changelog: [
          {
            version: '1.0.0',
            date: now,
            changes: ['Initial release'],
            type: 'major',
          },
        ],
      },
      parentTemplateId: params.parentTemplateId,
      isDeleted: false,
      isPublished: false,
    };

    // Validate template before storing
    const validation = this.validateTemplate(template);
    if (!validation.valid) {
      throw new Error(`Invalid template: ${validation.errors?.map(e => e.message).join(', ')}`);
    }

    // Store template
    this.templates.set(templateId, template);

    // Create initial version
    this.createVersion(templateId, template.config, params.author.id, 'Initial version');

    // Emit event
    this.emitTemplateEvent({
      type: 'template:created',
      templateId,
      template,
    });

    return template;
  }

  /**
   * Create a template from an existing agent's configuration
   */
  createTemplateFromAgent(params: {
    agentConfig: {
      name: string;
      description: string;
      systemPrompt: string;
      skills: string[];
      category: AgentCategory;
      icon?: string;
      temperature?: number;
      maxContextMessages?: number;
    };
    templateName: string;
    templateDescription: string;
    category: TemplateCategory;
    author: TemplateAuthor;
    tags?: string[];
  }): AgentTemplate {
    const config: TemplateConfig = {
      tools: {
        browserAutomation: [],
        terminalCommands: [],
        apis: [],
        fileOperations: [],
        externalServices: [],
      },
      prompts: {
        systemPrompt: params.agentConfig.systemPrompt,
        contextPrompts: {},
        templates: [],
        taskInstructions: {},
      },
      settings: {
        temperature: params.agentConfig.temperature ?? 0.7,
        maxContextMessages: params.agentConfig.maxContextMessages ?? 20,
        streamingEnabled: true,
      },
      constraints: {
        requireApproval: [],
        blockedTopics: [],
        contentModeration: {
          enabled: true,
          strictness: 'medium',
        },
      },
      capabilities: params.agentConfig.skills,
      agentCategory: params.agentConfig.category,
      icon: params.agentConfig.icon,
    };

    return this.createTemplate({
      name: params.templateName,
      description: params.templateDescription,
      config,
      category: params.category,
      tags: params.tags,
      author: params.author,
    });
  }

  // ============================================================================
  // TEMPLATE APPLICATION
  // ============================================================================

  /**
   * Apply a template to create a new agent instance
   */
  applyTemplate(params: {
    templateId: string;
    instanceName: string;
    instanceDescription?: string;
    overrides?: TemplateOverrides;
    ownerId: string;
  }): TemplateInstance {
    const template = this.templates.get(params.templateId);
    if (!template) {
      throw new Error(`Template not found: ${params.templateId}`);
    }

    if (template.isDeleted) {
      throw new Error(`Template has been deleted: ${params.templateId}`);
    }

    const instanceId = `inst-${uuid()}`;
    const now = new Date();

    // Resolve configuration with overrides
    const resolvedConfig = this.resolveConfig(template.config, params.overrides);

    const instance: TemplateInstance = {
      id: instanceId,
      templateId: params.templateId,
      templateVersion: template.version,
      name: params.instanceName,
      description: params.instanceDescription,
      overrides: params.overrides || {},
      executionHistory: [],
      createdAt: now,
      ownerId: params.ownerId,
      status: 'idle',
      resolvedConfig,
    };

    // Store instance
    this.instances.set(instanceId, instance);

    // Update template stats
    template.metadata.stats.activeInstances++;
    template.metadata.stats.usageCount++;

    // Emit event
    this.emitTemplateEvent({
      type: 'instance:created',
      instanceId,
      templateId: params.templateId,
    });

    return instance;
  }

  /**
   * Get resolved agent configuration from an instance
   */
  getInstanceConfig(instanceId: string): TemplateConfig {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    if (!instance.resolvedConfig) {
      const template = this.templates.get(instance.templateId);
      if (!template) {
        throw new Error(`Template not found: ${instance.templateId}`);
      }
      instance.resolvedConfig = this.resolveConfig(template.config, instance.overrides);
    }

    return instance.resolvedConfig;
  }

  /**
   * Record an execution for analytics
   */
  recordExecution(
    instanceId: string,
    execution: Omit<ExecutionRecord, 'id'>
  ): ExecutionRecord {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const record: ExecutionRecord = {
      id: `exec-${uuid()}`,
      ...execution,
    };

    // Add to instance history
    instance.executionHistory.push(record);
    instance.lastUsedAt = record.timestamp;

    // Update template analytics
    const template = this.templates.get(instance.templateId);
    if (template) {
      const stats = template.metadata.stats;
      stats.usageCount++;

      // Update success rate
      const totalExecutions = instance.executionHistory.length;
      const successfulExecutions = instance.executionHistory.filter(
        e => e.status === 'success'
      ).length;
      stats.successRate = (successfulExecutions / totalExecutions) * 100;

      // Update average execution time
      const totalTime = instance.executionHistory.reduce(
        (sum, e) => sum + e.durationMs,
        0
      );
      stats.avgExecutionTimeMs = totalTime / totalExecutions;
    }

    // Store in analytics map
    let templateAnalytics = this.analytics.get(instance.templateId);
    if (!templateAnalytics) {
      templateAnalytics = [];
      this.analytics.set(instance.templateId, templateAnalytics);
    }
    templateAnalytics.push(record);

    // Emit event
    this.emitTemplateEvent({
      type: 'instance:executed',
      instanceId,
      executionId: record.id,
      status: record.status,
    });

    return record;
  }

  // ============================================================================
  // TEMPLATE UPDATES
  // ============================================================================

  /**
   * Update a template (creates new version)
   */
  updateTemplate(
    templateId: string,
    updates: {
      name?: string;
      description?: string;
      longDescription?: string;
      config?: Partial<TemplateConfig>;
      tags?: string[];
    },
    userId: string,
    versionNotes?: string
  ): AgentTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (template.isDeleted) {
      throw new Error(`Cannot update deleted template: ${templateId}`);
    }

    const changes: string[] = [];
    const now = new Date();

    // Apply updates
    if (updates.name && updates.name !== template.name) {
      template.name = updates.name;
      changes.push('Updated name');
    }

    if (updates.description && updates.description !== template.description) {
      template.description = updates.description;
      changes.push('Updated description');
    }

    if (updates.longDescription !== undefined) {
      template.longDescription = updates.longDescription;
      changes.push('Updated long description');
    }

    if (updates.config) {
      template.config = this.mergeConfigs(template.config, updates.config);
      changes.push('Updated configuration');
    }

    if (updates.tags) {
      template.metadata.tags = updates.tags;
      changes.push('Updated tags');
    }

    // Increment version
    const newVersion = this.incrementVersion(template.version, changes);
    template.version = newVersion;
    template.metadata.updated = now;

    // Add changelog entry
    template.metadata.changelog?.push({
      version: newVersion,
      date: now,
      changes,
      type: this.getVersionType(changes),
    });

    // Create version snapshot
    this.createVersion(templateId, template.config, userId, versionNotes || changes.join(', '));

    // Emit event
    this.emitTemplateEvent({
      type: 'template:updated',
      templateId,
      version: newVersion,
      changes,
    });

    return template;
  }

  /**
   * Soft delete a template
   */
  deleteTemplate(templateId: string): void {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.isDeleted = true;
    template.deletedAt = new Date();

    // Emit event
    this.emitTemplateEvent({
      type: 'template:deleted',
      templateId,
    });
  }

  /**
   * Restore a soft-deleted template
   */
  restoreTemplate(templateId: string): AgentTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.isDeleted = false;
    template.deletedAt = undefined;

    return template;
  }

  // ============================================================================
  // TEMPLATE EXPORT/IMPORT
  // ============================================================================

  /**
   * Export a template as JSON
   */
  exportTemplate(templateId: string, includeVersions: boolean = false): TemplateExport {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const exportData: TemplateExport = {
      formatVersion: this.EXPORT_FORMAT_VERSION,
      exportedAt: new Date(),
      platformVersion: this.PLATFORM_VERSION,
      template: this.sanitizeTemplateForExport(template),
      checksum: '',
    };

    if (includeVersions) {
      exportData.versions = this.versions.get(templateId) || [];
    }

    // Calculate checksum
    exportData.checksum = this.calculateChecksum(exportData);

    // Emit event
    this.emitTemplateEvent({
      type: 'template:exported',
      templateId,
      destination: 'json',
    });

    return exportData;
  }

  /**
   * Export template as JSON string
   */
  exportTemplateAsJson(templateId: string, includeVersions: boolean = false): string {
    const exportData = this.exportTemplate(templateId, includeVersions);
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import a template from JSON
   */
  importTemplate(
    jsonData: string | TemplateExport,
    options?: {
      /** Override author with importing user */
      overrideAuthor?: TemplateAuthor;
      /** Validate checksum */
      validateChecksum?: boolean;
      /** Prefix for imported template name */
      namePrefix?: string;
    }
  ): TemplateImportResult {
    let exportData: TemplateExport;

    // Parse JSON if string
    try {
      exportData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    } catch {
      return {
        success: false,
        errors: [
          {
            code: 'INVALID_JSON',
            message: 'Failed to parse JSON data',
            path: '',
            severity: 'error',
          },
        ],
      };
    }

    // Validate format version
    if (!this.isCompatibleVersion(exportData.formatVersion)) {
      return {
        success: false,
        errors: [
          {
            code: 'INCOMPATIBLE_VERSION',
            message: `Export format version ${exportData.formatVersion} is not compatible with current version ${this.EXPORT_FORMAT_VERSION}`,
            path: 'formatVersion',
            severity: 'error',
          },
        ],
      };
    }

    // Validate checksum if requested
    if (options?.validateChecksum) {
      const calculatedChecksum = this.calculateChecksum({
        ...exportData,
        checksum: '',
      });
      if (calculatedChecksum !== exportData.checksum) {
        return {
          success: false,
          errors: [
            {
              code: 'CHECKSUM_MISMATCH',
              message: 'Template data has been modified or corrupted',
              path: 'checksum',
              severity: 'error',
            },
          ],
        };
      }
    }

    // Validate template structure
    const validation = this.validateTemplate(exportData.template);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
        suggestedFixes: validation.suggestedFixes,
      };
    }

    // Create new template with fresh ID
    const now = new Date();
    const newTemplateId = `tpl-${uuid()}`;
    const importedTemplate: AgentTemplate = {
      ...exportData.template,
      id: newTemplateId,
      name: options?.namePrefix
        ? `${options.namePrefix}${exportData.template.name}`
        : exportData.template.name,
      metadata: {
        ...exportData.template.metadata,
        author: options?.overrideAuthor || exportData.template.metadata.author,
        created: now,
        updated: now,
        stats: {
          usageCount: 0,
          activeInstances: 0,
          rating: 0,
          ratingCount: 0,
          forkCount: 0,
          successRate: 0,
          avgExecutionTimeMs: 0,
        },
      },
      isDeleted: false,
      isPublished: false,
    };

    // Store template
    this.templates.set(newTemplateId, importedTemplate);

    // Import versions if present
    if (exportData.versions) {
      const importedVersions = exportData.versions.map(v => ({
        ...v,
        id: `ver-${uuid()}`,
        templateId: newTemplateId,
      }));
      this.versions.set(newTemplateId, importedVersions);
    }

    // Emit event
    this.emitTemplateEvent({
      type: 'template:imported',
      templateId: newTemplateId,
      source: 'json',
    });

    return {
      success: true,
      template: importedTemplate,
      warnings: validation.warnings,
    };
  }

  // ============================================================================
  // TEMPLATE SEARCH AND DISCOVERY
  // ============================================================================

  /**
   * Search templates with filtering and sorting
   */
  searchTemplates(query: TemplateSearchQuery): TemplateSearchResult {
    const startTime = Date.now();
    let results = Array.from(this.templates.values()).filter(t => !t.isDeleted);

    // Apply text search
    if (query.query) {
      const searchTerms = query.query.toLowerCase().split(/\s+/);
      results = results.filter(t => {
        const searchableText = [
          t.name,
          t.description,
          t.longDescription || '',
          ...t.metadata.tags,
          ...t.config.capabilities,
        ]
          .join(' ')
          .toLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
      });
    }

    // Apply category filter
    if (query.category) {
      const categories = Array.isArray(query.category) ? query.category : [query.category];
      results = results.filter(t => categories.includes(t.metadata.category));
    }

    // Apply tag filter
    if (query.tags && query.tags.length > 0) {
      results = results.filter(t =>
        query.tags!.some(tag => t.metadata.tags.includes(tag))
      );
    }

    // Apply capability filter
    if (query.capabilities && query.capabilities.length > 0) {
      results = results.filter(t =>
        query.capabilities!.some(cap => t.config.capabilities.includes(cap))
      );
    }

    // Apply rating filter
    if (query.minRating !== undefined) {
      results = results.filter(t => t.metadata.stats.rating >= query.minRating!);
    }

    // Apply author filter
    if (query.authorId) {
      results = results.filter(t => t.metadata.author.id === query.authorId);
    }

    // Apply featured filter
    if (query.featuredOnly) {
      results = results.filter(t => t.metadata.featured);
    }

    // Apply trending filter
    if (query.trendingOnly) {
      results = results.filter(t => t.metadata.trending);
    }

    // Calculate facets before pagination
    const facets = {
      categories: this.calculateCategoryFacets(results),
      tags: this.calculateTagFacets(results),
    };

    // Apply sorting
    results = this.sortTemplates(results, query.sortBy || 'relevance', query.sortDirection || 'desc');

    // Get total count before pagination
    const totalCount = results.length;

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    results = results.slice(offset, offset + limit);

    return {
      templates: results,
      totalCount,
      metadata: {
        query,
        executionTimeMs: Date.now() - startTime,
        facets,
      },
    };
  }

  /**
   * Get recommended templates based on task description
   */
  recommendTemplates(
    taskDescription: string,
    maxRecommendations: number = 5
  ): TemplateRecommendation[] {
    const templates = Array.from(this.templates.values()).filter(
      t => !t.isDeleted && t.isPublished
    );

    const recommendations: TemplateRecommendation[] = [];
    const taskKeywords = this.extractKeywords(taskDescription);

    for (const template of templates) {
      const templateKeywords = [
        ...template.config.capabilities,
        ...template.metadata.tags,
        template.metadata.category,
      ];

      const matchedFeatures = taskKeywords.filter(kw =>
        templateKeywords.some(
          tk => tk.toLowerCase().includes(kw) || kw.includes(tk.toLowerCase())
        )
      );

      if (matchedFeatures.length > 0) {
        // Calculate score based on matches, rating, and usage
        const matchScore = matchedFeatures.length / taskKeywords.length;
        const ratingScore = template.metadata.stats.rating / 5;
        const popularityScore = Math.min(template.metadata.stats.usageCount / 1000, 1);
        const successScore = template.metadata.stats.successRate / 100;

        const score =
          matchScore * 0.4 +
          ratingScore * 0.25 +
          popularityScore * 0.15 +
          successScore * 0.2;

        recommendations.push({
          template,
          score,
          reason: this.generateRecommendationReason(template, matchedFeatures),
          matchedFeatures,
        });
      }
    }

    // Sort by score and return top N
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, maxRecommendations);
  }

  /**
   * Get featured templates
   */
  getFeaturedTemplates(limit: number = 10): AgentTemplate[] {
    return Array.from(this.templates.values())
      .filter(t => !t.isDeleted && t.isPublished && t.metadata.featured)
      .sort((a, b) => b.metadata.stats.rating - a.metadata.stats.rating)
      .slice(0, limit);
  }

  /**
   * Get trending templates
   */
  getTrendingTemplates(limit: number = 10): AgentTemplate[] {
    return Array.from(this.templates.values())
      .filter(t => !t.isDeleted && t.isPublished && t.metadata.trending)
      .sort((a, b) => b.metadata.stats.usageCount - a.metadata.stats.usageCount)
      .slice(0, limit);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: TemplateCategory, limit?: number): AgentTemplate[] {
    let results = Array.from(this.templates.values())
      .filter(t => !t.isDeleted && t.metadata.category === category)
      .sort((a, b) => b.metadata.stats.rating - a.metadata.stats.rating);

    if (limit) {
      results = results.slice(0, limit);
    }

    return results;
  }

  // ============================================================================
  // TEMPLATE ANALYTICS
  // ============================================================================

  /**
   * Get analytics for a template
   */
  getTemplateAnalytics(
    templateId: string,
    startDate: Date,
    endDate: Date
  ): TemplateAnalytics {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const executions = (this.analytics.get(templateId) || []).filter(
      e => e.timestamp >= startDate && e.timestamp <= endDate
    );

    const successfulExecutions = executions.filter(e => e.status === 'success');
    const failedExecutions = executions.filter(e => e.status === 'failure');

    // Calculate peak usage hours
    const hourCounts = new Map<number, number>();
    executions.forEach(e => {
      const hour = e.timestamp.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });
    const peakUsageHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    // Calculate error breakdown
    const errorCounts = new Map<string, number>();
    failedExecutions.forEach(e => {
      const error = e.error || 'Unknown error';
      errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
    });

    return {
      templateId,
      period: { start: startDate, end: endDate },
      totalExecutions: executions.length,
      successfulExecutions: successfulExecutions.length,
      failedExecutions: failedExecutions.length,
      successRate:
        executions.length > 0
          ? (successfulExecutions.length / executions.length) * 100
          : 0,
      avgExecutionTimeMs:
        executions.length > 0
          ? executions.reduce((sum, e) => sum + e.durationMs, 0) / executions.length
          : 0,
      totalTokensUsed: executions.reduce((sum, e) => sum + (e.tokensUsed || 0), 0),
      uniqueUsers: new Set(
        Array.from(this.instances.values())
          .filter(i => i.templateId === templateId)
          .map(i => i.ownerId)
      ).size,
      peakUsageHours,
      topTaskTypes: this.calculateTopTaskTypes(executions),
      errorBreakdown: Array.from(errorCounts.entries()).map(([error, count]) => ({
        error,
        count,
      })),
    };
  }

  // ============================================================================
  // TEMPLATE RETRIEVAL
  // ============================================================================

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): AgentTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get an instance by ID
   */
  getInstance(instanceId: string): TemplateInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get all templates
   */
  getAllTemplates(includeDeleted: boolean = false): AgentTemplate[] {
    return Array.from(this.templates.values()).filter(
      t => includeDeleted || !t.isDeleted
    );
  }

  /**
   * Get all instances for a template
   */
  getTemplateInstances(templateId: string): TemplateInstance[] {
    return Array.from(this.instances.values()).filter(
      i => i.templateId === templateId
    );
  }

  /**
   * Get version history for a template
   */
  getTemplateVersions(templateId: string): TemplateVersion[] {
    return this.versions.get(templateId) || [];
  }

  /**
   * Get a specific version
   */
  getTemplateVersion(templateId: string, version: string): TemplateVersion | undefined {
    const versions = this.versions.get(templateId);
    return versions?.find(v => v.version === version);
  }

  // ============================================================================
  // TEMPLATE PUBLISHING
  // ============================================================================

  /**
   * Publish a template (make it public)
   */
  publishTemplate(templateId: string): AgentTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.isPublished = true;

    this.emitTemplateEvent({
      type: 'template:published',
      templateId,
    });

    return template;
  }

  /**
   * Unpublish a template (make it private)
   */
  unpublishTemplate(templateId: string): AgentTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.isPublished = false;

    this.emitTemplateEvent({
      type: 'template:unpublished',
      templateId,
    });

    return template;
  }

  /**
   * Rate a template
   */
  rateTemplate(templateId: string, rating: number): void {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const stats = template.metadata.stats;
    const totalRating = stats.rating * stats.ratingCount + rating;
    stats.ratingCount++;
    stats.rating = totalRating / stats.ratingCount;
  }

  /**
   * Fork a template (create a copy)
   */
  forkTemplate(
    templateId: string,
    newAuthor: TemplateAuthor,
    options?: {
      name?: string;
      description?: string;
    }
  ): AgentTemplate {
    const original = this.templates.get(templateId);
    if (!original) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Update fork count on original
    original.metadata.stats.forkCount++;

    // Create the fork
    return this.createTemplate({
      name: options?.name || `Fork of ${original.name}`,
      description: options?.description || original.description,
      longDescription: original.longDescription,
      config: JSON.parse(JSON.stringify(original.config)), // Deep clone
      category: original.metadata.category,
      tags: [...original.metadata.tags],
      author: newAuthor,
      parentTemplateId: templateId,
    });
  }

  // ============================================================================
  // INSTANCE MANAGEMENT
  // ============================================================================

  /**
   * Update instance overrides
   */
  updateInstanceOverrides(
    instanceId: string,
    overrides: TemplateOverrides
  ): TemplateInstance {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.overrides = { ...instance.overrides, ...overrides };

    // Recalculate resolved config
    const template = this.templates.get(instance.templateId);
    if (template) {
      instance.resolvedConfig = this.resolveConfig(template.config, instance.overrides);
    }

    return instance;
  }

  /**
   * Destroy an instance
   */
  destroyInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    // Update template stats
    const template = this.templates.get(instance.templateId);
    if (template) {
      template.metadata.stats.activeInstances = Math.max(
        0,
        template.metadata.stats.activeInstances - 1
      );
    }

    this.instances.delete(instanceId);

    this.emitTemplateEvent({
      type: 'instance:destroyed',
      instanceId,
    });
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private createVersion(
    templateId: string,
    config: TemplateConfig,
    createdBy: string,
    notes?: string
  ): void {
    const template = this.templates.get(templateId);
    if (!template) return;

    const versionId = `ver-${uuid()}`;
    const version: TemplateVersion = {
      id: versionId,
      templateId,
      version: template.version,
      config: JSON.parse(JSON.stringify(config)), // Deep clone
      createdAt: new Date(),
      createdBy,
      notes,
      isActive: true,
    };

    // Mark previous versions as inactive
    const existingVersions = this.versions.get(templateId) || [];
    existingVersions.forEach(v => (v.isActive = false));

    existingVersions.push(version);
    this.versions.set(templateId, existingVersions);
  }

  private validateTemplate(template: AgentTemplate): {
    valid: boolean;
    errors?: TemplateValidationError[];
    warnings?: string[];
    suggestedFixes?: Record<string, string>;
  } {
    const errors: TemplateValidationError[] = [];
    const warnings: string[] = [];
    const suggestedFixes: Record<string, string> = {};

    // Required fields validation
    if (!template.name || template.name.trim().length === 0) {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Template name is required',
        path: 'name',
        severity: 'error',
      });
    } else if (template.name.length > 100) {
      errors.push({
        code: 'NAME_TOO_LONG',
        message: 'Template name must be 100 characters or less',
        path: 'name',
        severity: 'error',
      });
      suggestedFixes['name'] = template.name.substring(0, 100);
    }

    if (!template.description || template.description.trim().length === 0) {
      errors.push({
        code: 'MISSING_DESCRIPTION',
        message: 'Template description is required',
        path: 'description',
        severity: 'error',
      });
    }

    // Config validation
    if (!template.config) {
      errors.push({
        code: 'MISSING_CONFIG',
        message: 'Template configuration is required',
        path: 'config',
        severity: 'error',
      });
    } else {
      // Prompts validation
      if (!template.config.prompts?.systemPrompt) {
        errors.push({
          code: 'MISSING_SYSTEM_PROMPT',
          message: 'System prompt is required',
          path: 'config.prompts.systemPrompt',
          severity: 'error',
        });
      }

      // Settings validation
      if (template.config.settings?.temperature !== undefined) {
        if (template.config.settings.temperature < 0 || template.config.settings.temperature > 2) {
          errors.push({
            code: 'INVALID_TEMPERATURE',
            message: 'Temperature must be between 0 and 2',
            path: 'config.settings.temperature',
            severity: 'error',
          });
          suggestedFixes['config.settings.temperature'] = Math.max(
            0,
            Math.min(2, template.config.settings.temperature)
          ).toString();
        }
      }

      // Capabilities check
      if (!template.config.capabilities || template.config.capabilities.length === 0) {
        warnings.push('Template has no defined capabilities');
      }
    }

    // Version validation
    if (!template.version || !/^\d+\.\d+\.\d+$/.test(template.version)) {
      errors.push({
        code: 'INVALID_VERSION',
        message: 'Version must be in semver format (e.g., 1.0.0)',
        path: 'version',
        severity: 'error',
      });
      suggestedFixes['version'] = '1.0.0';
    }

    // Metadata validation
    if (!template.metadata?.author?.id) {
      errors.push({
        code: 'MISSING_AUTHOR',
        message: 'Template author is required',
        path: 'metadata.author',
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestedFixes: Object.keys(suggestedFixes).length > 0 ? suggestedFixes : undefined,
    };
  }

  private mergeConfigs(base: TemplateConfig, override: Partial<TemplateConfig>): TemplateConfig {
    return {
      tools: {
        ...base.tools,
        ...override.tools,
      },
      prompts: {
        ...base.prompts,
        ...override.prompts,
        contextPrompts: {
          ...base.prompts.contextPrompts,
          ...override.prompts?.contextPrompts,
        },
        taskInstructions: {
          ...base.prompts.taskInstructions,
          ...override.prompts?.taskInstructions,
        },
      },
      settings: {
        ...base.settings,
        ...override.settings,
        custom: {
          ...base.settings.custom,
          ...override.settings?.custom,
        },
      },
      constraints: {
        ...base.constraints,
        ...override.constraints,
        rateLimits: {
          ...base.constraints.rateLimits,
          ...override.constraints?.rateLimits,
        },
        contentModeration:
          override.constraints?.contentModeration ??
          base.constraints.contentModeration,
      },
      capabilities: override.capabilities || base.capabilities,
      agentCategory: override.agentCategory || base.agentCategory,
      icon: override.icon || base.icon,
    };
  }

  private resolveConfig(base: TemplateConfig, overrides?: TemplateOverrides): TemplateConfig {
    if (!overrides) return base;

    let resolved = { ...base };

    // Apply prompt overrides
    if (overrides.prompts) {
      resolved.prompts = {
        ...resolved.prompts,
        ...overrides.prompts,
      };
    }

    // Apply settings overrides
    if (overrides.settings) {
      resolved.settings = {
        ...resolved.settings,
        ...overrides.settings,
      };
    }

    // Apply constraint overrides
    if (overrides.constraints) {
      resolved.constraints = {
        ...resolved.constraints,
        ...overrides.constraints,
      };
    }

    // Add additional tools
    if (overrides.additionalTools) {
      resolved.tools = {
        browserAutomation: [
          ...(resolved.tools.browserAutomation || []),
          ...(overrides.additionalTools.browserAutomation || []),
        ],
        terminalCommands: [
          ...(resolved.tools.terminalCommands || []),
          ...(overrides.additionalTools.terminalCommands || []),
        ],
        apis: [
          ...(resolved.tools.apis || []),
          ...(overrides.additionalTools.apis || []),
        ],
        fileOperations: [
          ...(resolved.tools.fileOperations || []),
          ...(overrides.additionalTools.fileOperations || []),
        ],
        externalServices: [
          ...(resolved.tools.externalServices || []),
          ...(overrides.additionalTools.externalServices || []),
        ],
        custom: [
          ...(resolved.tools.custom || []),
          ...(overrides.additionalTools.custom || []),
        ],
      };
    }

    // Remove disabled tools
    if (overrides.disabledTools && overrides.disabledTools.length > 0) {
      const disabled = new Set(overrides.disabledTools);
      resolved.tools = {
        browserAutomation: resolved.tools.browserAutomation?.filter(t => !disabled.has(t)),
        terminalCommands: resolved.tools.terminalCommands?.filter(t => !disabled.has(t)),
        apis: resolved.tools.apis?.filter(t => !disabled.has(t)),
        fileOperations: resolved.tools.fileOperations?.filter(t => !disabled.has(t)),
        externalServices: resolved.tools.externalServices?.filter(t => !disabled.has(t)),
        custom: resolved.tools.custom?.filter(t => !disabled.has(t.id)),
      };
    }

    return resolved;
  }

  private incrementVersion(currentVersion: string, changes: string[]): string {
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    // Determine version bump based on changes
    const isBreaking = changes.some(
      c =>
        c.toLowerCase().includes('breaking') ||
        c.toLowerCase().includes('removed') ||
        c.toLowerCase().includes('renamed')
    );
    const isFeature = changes.some(
      c =>
        c.toLowerCase().includes('added') ||
        c.toLowerCase().includes('new') ||
        c.toLowerCase().includes('feature')
    );

    if (isBreaking) {
      return `${major + 1}.0.0`;
    } else if (isFeature) {
      return `${major}.${minor + 1}.0`;
    } else {
      return `${major}.${minor}.${patch + 1}`;
    }
  }

  private getVersionType(changes: string[]): 'major' | 'minor' | 'patch' {
    const isBreaking = changes.some(
      c =>
        c.toLowerCase().includes('breaking') ||
        c.toLowerCase().includes('removed')
    );
    const isFeature = changes.some(
      c =>
        c.toLowerCase().includes('added') ||
        c.toLowerCase().includes('new')
    );

    if (isBreaking) return 'major';
    if (isFeature) return 'minor';
    return 'patch';
  }

  private sanitizeTemplateForExport(template: AgentTemplate): AgentTemplate {
    // Remove sensitive or internal data before export
    const sanitized = JSON.parse(JSON.stringify(template));

    // Remove internal fields
    Reflect.deleteProperty(sanitized, 'isDeleted');
    Reflect.deleteProperty(sanitized, 'deletedAt');

    // Reset stats that shouldn't transfer
    sanitized.metadata.stats = {
      usageCount: 0,
      activeInstances: 0,
      rating: 0,
      ratingCount: 0,
      forkCount: 0,
      successRate: 0,
      avgExecutionTimeMs: 0,
    };

    return sanitized;
  }

  private calculateChecksum(data: Omit<TemplateExport, 'checksum'> | TemplateExport): string {
    const dataToHash = { ...data };
    if ('checksum' in dataToHash) {
      Reflect.deleteProperty(dataToHash, 'checksum');
    }
    const str = JSON.stringify(dataToHash);
    // Simple hash function for demo - in production use crypto
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private isCompatibleVersion(version: string): boolean {
    const [major] = version.split('.').map(Number);
    const [currentMajor] = this.EXPORT_FORMAT_VERSION.split('.').map(Number);
    return major === currentMajor;
  }

  private sortTemplates(
    templates: AgentTemplate[],
    sortBy: string,
    direction: 'asc' | 'desc'
  ): AgentTemplate[] {
    const multiplier = direction === 'asc' ? 1 : -1;

    return templates.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return (a.metadata.stats.rating - b.metadata.stats.rating) * multiplier;
        case 'popularity':
          return (a.metadata.stats.usageCount - b.metadata.stats.usageCount) * multiplier;
        case 'newest':
          return (
            (a.metadata.created.getTime() - b.metadata.created.getTime()) * multiplier
          );
        case 'name':
          return a.name.localeCompare(b.name) * multiplier;
        case 'relevance':
        default:
          // For relevance, combine multiple factors
          const scoreA =
            a.metadata.stats.rating * 0.3 +
            Math.min(a.metadata.stats.usageCount / 100, 1) * 0.3 +
            (a.metadata.featured ? 0.2 : 0) +
            (a.metadata.trending ? 0.2 : 0);
          const scoreB =
            b.metadata.stats.rating * 0.3 +
            Math.min(b.metadata.stats.usageCount / 100, 1) * 0.3 +
            (b.metadata.featured ? 0.2 : 0) +
            (b.metadata.trending ? 0.2 : 0);
          return (scoreA - scoreB) * multiplier;
      }
    });
  }

  private calculateCategoryFacets(
    templates: AgentTemplate[]
  ): Array<{ category: TemplateCategory; count: number }> {
    const counts = new Map<TemplateCategory, number>();
    templates.forEach(t => {
      counts.set(t.metadata.category, (counts.get(t.metadata.category) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  private calculateTagFacets(
    templates: AgentTemplate[]
  ): Array<{ tag: string; count: number }> {
    const counts = new Map<string, number>();
    templates.forEach(t => {
      t.metadata.tags.forEach(tag => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 tags
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'just', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
      'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
      'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who',
      'whom', 'this', 'that', 'these', 'those', 'am',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter((word, index, self) => self.indexOf(word) === index);
  }

  private generateRecommendationReason(
    template: AgentTemplate,
    matchedFeatures: string[]
  ): string {
    const reasons: string[] = [];

    if (matchedFeatures.length > 0) {
      reasons.push(`Matches: ${matchedFeatures.slice(0, 3).join(', ')}`);
    }

    if (template.metadata.stats.rating >= 4) {
      reasons.push(`Highly rated (${template.metadata.stats.rating.toFixed(1)}/5)`);
    }

    if (template.metadata.stats.usageCount > 100) {
      reasons.push(`Popular (${template.metadata.stats.usageCount} uses)`);
    }

    if (template.metadata.featured) {
      reasons.push('Featured template');
    }

    if (template.metadata.stats.successRate > 90) {
      reasons.push(`High success rate (${template.metadata.stats.successRate.toFixed(0)}%)`);
    }

    return reasons.join('. ') || 'Potential match for your task';
  }

  private calculateTopTaskTypes(
    executions: ExecutionRecord[]
  ): Array<{ type: string; count: number }> {
    const counts = new Map<string, number>();
    executions.forEach(e => {
      // Extract task type from task description (first few words)
      const taskType = e.task.split(' ').slice(0, 3).join(' ');
      counts.set(taskType, (counts.get(taskType) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private emitTemplateEvent(event: TemplateEvent): void {
    this.emit(event.type, event);
    this.emit('template-event', event);
  }

  // ============================================================================
  // BUILT-IN TEMPLATE PRESETS
  // ============================================================================

  /**
   * Get built-in template presets for common use cases
   */
  getBuiltInPresets(): Record<string, Omit<AgentTemplate, 'id' | 'metadata'>> {
    return {
      research: {
        name: 'Research Agent',
        description: 'Deep research and information gathering agent',
        version: '1.0.0',
        config: {
          tools: {
            browserAutomation: ['navigate', 'search', 'extract'],
            apis: ['search-api', 'document-api'],
          },
          prompts: {
            systemPrompt: `You are a thorough research agent. Your goal is to gather comprehensive, accurate information on any topic.

Guidelines:
- Search multiple sources for verification
- Cite your sources clearly
- Distinguish between facts and opinions
- Highlight conflicting information when found
- Summarize findings in a structured format`,
            taskInstructions: {
              'deep-dive': 'Conduct extensive research with multiple source verification',
              'quick-lookup': 'Find specific information quickly from reliable sources',
              'fact-check': 'Verify claims against multiple authoritative sources',
            },
          },
          settings: {
            temperature: 0.3,
            maxTokens: 4000,
            maxContextMessages: 30,
          },
          constraints: {
            contentModeration: { enabled: true, strictness: 'high' },
          },
          capabilities: ['research', 'analysis', 'summarization', 'fact-checking'],
          agentCategory: 'research',
          icon: 'search',
        },
      },
      coding: {
        name: 'Coding Assistant',
        description: 'Code generation, review, and development assistance',
        version: '1.0.0',
        config: {
          tools: {
            terminalCommands: ['git', 'npm', 'yarn', 'python', 'node'],
            fileOperations: ['read', 'write', 'create', 'delete'],
            apis: ['github-api'],
          },
          prompts: {
            systemPrompt: `You are an expert software engineer. Help users with coding tasks including:
- Writing clean, efficient code
- Debugging and fixing issues
- Code review and optimization
- Architecture decisions
- Best practices and patterns

Always explain your reasoning and provide comments in code.`,
            taskInstructions: {
              'code-review': 'Review code for bugs, security issues, and best practices',
              'refactor': 'Improve code quality while maintaining functionality',
              'implement': 'Write new code following specifications',
            },
          },
          settings: {
            temperature: 0.2,
            maxTokens: 8000,
            maxContextMessages: 40,
          },
          constraints: {
            requireApproval: ['execute-code', 'deploy'],
          },
          capabilities: ['coding', 'debugging', 'code-review', 'architecture'],
          agentCategory: 'builder',
          icon: 'code',
        },
      },
      automation: {
        name: 'Automation Agent',
        description: 'Workflow automation and task execution',
        version: '1.0.0',
        config: {
          tools: {
            browserAutomation: ['navigate', 'click', 'fill', 'submit'],
            terminalCommands: ['bash', 'python'],
            apis: ['webhook-api', 'integration-api'],
            externalServices: ['zapier', 'make', 'n8n'],
          },
          prompts: {
            systemPrompt: `You are an automation specialist. Help users automate repetitive tasks and workflows.

Capabilities:
- Browser automation for web tasks
- API integrations
- Scheduled tasks
- Multi-step workflows
- Error handling and recovery

Always prioritize reliability and idempotency in automations.`,
          },
          settings: {
            temperature: 0.1,
            timeoutMs: 120000,
          },
          constraints: {
            requireApproval: ['execute-code', 'send-email', 'make-purchase'],
            rateLimits: {
              requestsPerMinute: 30,
            },
          },
          capabilities: ['automation', 'workflow', 'integration', 'scheduling'],
          agentCategory: 'computer-control',
          icon: 'cog',
        },
      },
      analysis: {
        name: 'Data Analysis Agent',
        description: 'Data analysis and insight generation',
        version: '1.0.0',
        config: {
          tools: {
            terminalCommands: ['python', 'jupyter'],
            fileOperations: ['read', 'write'],
            apis: ['data-api', 'visualization-api'],
          },
          prompts: {
            systemPrompt: `You are a data analyst expert. Help users understand and gain insights from their data.

Expertise:
- Statistical analysis
- Data visualization
- Pattern recognition
- Predictive modeling
- Report generation

Always explain your methodology and assumptions clearly.`,
          },
          settings: {
            temperature: 0.3,
            maxTokens: 6000,
          },
          constraints: {
            contentModeration: { enabled: true, strictness: 'medium' },
          },
          capabilities: ['analysis', 'statistics', 'visualization', 'reporting'],
          agentCategory: 'advisory',
          icon: 'chart',
        },
      },
    };
  }

  /**
   * Create a template from a built-in preset
   */
  createFromPreset(
    presetName: keyof ReturnType<typeof this.getBuiltInPresets>,
    author: TemplateAuthor,
    overrides?: Partial<TemplateConfig>
  ): AgentTemplate {
    const presets = this.getBuiltInPresets();
    const preset = presets[presetName];

    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }

    const categoryMap: Record<string, TemplateCategory> = {
      research: 'research',
      coding: 'coding',
      automation: 'automation',
      analysis: 'analysis',
    };

    return this.createTemplate({
      name: preset.name,
      description: preset.description,
      config: overrides ? this.mergeConfigs(preset.config, overrides) : preset.config,
      category: categoryMap[presetName] || 'custom',
      author,
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let templateManagerInstance: AgentTemplateManager | null = null;

/**
 * Get the singleton AgentTemplateManager instance
 */
export function getTemplateManager(): AgentTemplateManager {
  if (!templateManagerInstance) {
    templateManagerInstance = new AgentTemplateManager();
  }
  return templateManagerInstance;
}

/**
 * Create a new AgentTemplateManager instance (useful for testing)
 */
export function createTemplateManager(): AgentTemplateManager {
  return new AgentTemplateManager();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AgentTemplateManager;
