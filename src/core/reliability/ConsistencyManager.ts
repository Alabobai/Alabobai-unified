/**
 * Alabobai Reliability Engine - Consistency Manager
 * Pin to model version, reproducible results
 *
 * Solves: Claude "inconsistent bugs", same prompt different results
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelVersion {
  provider: string;           // anthropic, openai, etc.
  model: string;              // claude-3-opus, gpt-4, etc.
  version: string;            // Specific version string
  snapshot?: string;          // Snapshot identifier if available
  capabilities: ModelCapabilities;
  releaseDate?: Date;
  deprecationDate?: Date;
}

export interface ModelCapabilities {
  maxTokens: number;
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  temperature: {
    min: number;
    max: number;
    default: number;
  };
}

export interface ConsistencyConfig {
  seed?: number;                   // Fixed seed for reproducibility
  temperature: number;             // Fixed temperature
  topP?: number;                   // Nucleus sampling
  topK?: number;                   // Top-k sampling
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens: number;
  stopSequences?: string[];
  systemPromptHash?: string;       // Pin system prompt
}

export interface ConsistencyProfile {
  id: string;
  name: string;
  description: string;
  modelVersion: ModelVersion;
  config: ConsistencyConfig;
  systemPrompt: string;
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
  successRate: number;
}

export interface ExecutionRecord {
  id: string;
  profileId: string;
  inputHash: string;
  outputHash: string;
  input: string;
  output: string;
  config: ConsistencyConfig;
  timestamp: Date;
  duration: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  metadata?: Record<string, unknown>;
}

export interface ConsistencyCheck {
  profileId: string;
  inputHash: string;
  expectedOutputHash?: string;
  actualOutputHash: string;
  isConsistent: boolean;
  similarity: number;           // 0-100
  drift: DriftAnalysis;
  timestamp: Date;
}

export interface DriftAnalysis {
  detected: boolean;
  severity: 'none' | 'minor' | 'moderate' | 'major';
  factors: DriftFactor[];
  recommendation: string;
}

export interface DriftFactor {
  type: 'model-version' | 'config-change' | 'prompt-change' | 'output-variation';
  description: string;
  impact: number;  // 0-100
}

export interface ConsistencyManagerConfig {
  enableSeeding: boolean;          // Use fixed seeds
  enableCaching: boolean;          // Cache responses
  cacheExpiryHours: number;
  enableDriftDetection: boolean;   // Monitor for drift
  driftThreshold: number;          // Similarity threshold (0-100)
  maxRecordHistory: number;        // Max records per profile
  defaultTemperature: number;
  strictMode: boolean;             // Fail on inconsistency
}

// ============================================================================
// MODEL VERSION REGISTRY
// ============================================================================

const MODEL_REGISTRY: Record<string, ModelVersion> = {
  'claude-3-opus-20240229': {
    provider: 'anthropic',
    model: 'claude-3-opus',
    version: '20240229',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      temperature: { min: 0, max: 1, default: 1 },
    },
    releaseDate: new Date('2024-02-29'),
  },
  'claude-3-sonnet-20240229': {
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    version: '20240229',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      temperature: { min: 0, max: 1, default: 1 },
    },
    releaseDate: new Date('2024-02-29'),
  },
  'claude-sonnet-4-20250514': {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    version: '20250514',
    capabilities: {
      maxTokens: 8192,
      contextWindow: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      temperature: { min: 0, max: 1, default: 1 },
    },
    releaseDate: new Date('2025-05-14'),
  },
  'gpt-4-turbo-2024-04-09': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    version: '2024-04-09',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 128000,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      temperature: { min: 0, max: 2, default: 1 },
    },
    releaseDate: new Date('2024-04-09'),
  },
  'gpt-4o-2024-05-13': {
    provider: 'openai',
    model: 'gpt-4o',
    version: '2024-05-13',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 128000,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      temperature: { min: 0, max: 2, default: 1 },
    },
    releaseDate: new Date('2024-05-13'),
  },
};

// ============================================================================
// CONSISTENCY MANAGER CLASS
// ============================================================================

export class ConsistencyManager extends EventEmitter {
  private config: ConsistencyManagerConfig;
  private profiles: Map<string, ConsistencyProfile> = new Map();
  private executionHistory: Map<string, ExecutionRecord[]> = new Map();
  private responseCache: Map<string, { output: string; timestamp: Date }> = new Map();
  private currentSeed: number;

  constructor(config?: Partial<ConsistencyManagerConfig>) {
    super();

    this.config = {
      enableSeeding: true,
      enableCaching: true,
      cacheExpiryHours: 24,
      enableDriftDetection: true,
      driftThreshold: 85,          // 85% similarity required
      maxRecordHistory: 100,
      defaultTemperature: 0.7,
      strictMode: false,
      ...config,
    };

    // Initialize seed
    this.currentSeed = Math.floor(Math.random() * 2147483647);
  }

  // ============================================================================
  // PROFILE MANAGEMENT
  // ============================================================================

  createProfile(
    name: string,
    modelId: string,
    systemPrompt: string,
    config?: Partial<ConsistencyConfig>
  ): ConsistencyProfile {
    const modelVersion = MODEL_REGISTRY[modelId];
    if (!modelVersion) {
      throw new Error(`Unknown model: ${modelId}. Available: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
    }

    const profile: ConsistencyProfile = {
      id: uuid(),
      name,
      description: `Consistency profile for ${modelVersion.model}`,
      modelVersion,
      config: {
        seed: this.config.enableSeeding ? this.generateSeed() : undefined,
        temperature: config?.temperature ?? this.config.defaultTemperature,
        topP: config?.topP,
        topK: config?.topK,
        presencePenalty: config?.presencePenalty,
        frequencyPenalty: config?.frequencyPenalty,
        maxTokens: config?.maxTokens ?? modelVersion.capabilities.maxTokens,
        stopSequences: config?.stopSequences,
        systemPromptHash: this.hashString(systemPrompt),
      },
      systemPrompt,
      createdAt: new Date(),
      lastUsed: new Date(),
      usageCount: 0,
      successRate: 100,
    };

    this.profiles.set(profile.id, profile);
    this.executionHistory.set(profile.id, []);

    this.emit('profile-created', { profile });
    return profile;
  }

  getProfile(profileId: string): ConsistencyProfile | undefined {
    return this.profiles.get(profileId);
  }

  getProfileByName(name: string): ConsistencyProfile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.name === name) return profile;
    }
    return undefined;
  }

  listProfiles(): ConsistencyProfile[] {
    return Array.from(this.profiles.values());
  }

  updateProfile(
    profileId: string,
    updates: Partial<Pick<ConsistencyProfile, 'name' | 'description' | 'systemPrompt'>>
  ): ConsistencyProfile {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    if (updates.name) profile.name = updates.name;
    if (updates.description) profile.description = updates.description;
    if (updates.systemPrompt) {
      profile.systemPrompt = updates.systemPrompt;
      profile.config.systemPromptHash = this.hashString(updates.systemPrompt);
    }

    this.emit('profile-updated', { profile });
    return profile;
  }

  deleteProfile(profileId: string): void {
    this.profiles.delete(profileId);
    this.executionHistory.delete(profileId);
    this.emit('profile-deleted', { profileId });
  }

  // ============================================================================
  // EXECUTION WITH CONSISTENCY
  // ============================================================================

  async prepareRequest(
    profileId: string,
    input: string
  ): Promise<{
    profile: ConsistencyProfile;
    requestConfig: ConsistencyConfig & { systemPrompt: string };
    inputHash: string;
    cacheKey: string;
  }> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const inputHash = this.hashString(input);
    const cacheKey = this.generateCacheKey(profileId, inputHash);

    // Update usage stats
    profile.lastUsed = new Date();
    profile.usageCount++;

    return {
      profile,
      requestConfig: {
        ...profile.config,
        systemPrompt: profile.systemPrompt,
      },
      inputHash,
      cacheKey,
    };
  }

  async recordExecution(
    profileId: string,
    input: string,
    output: string,
    duration: number,
    tokenUsage: { input: number; output: number; total: number },
    metadata?: Record<string, unknown>
  ): Promise<ExecutionRecord> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const inputHash = this.hashString(input);
    const outputHash = this.hashString(output);
    const cacheKey = this.generateCacheKey(profileId, inputHash);

    const record: ExecutionRecord = {
      id: uuid(),
      profileId,
      inputHash,
      outputHash,
      input,
      output,
      config: profile.config,
      timestamp: new Date(),
      duration,
      tokenUsage,
      metadata,
    };

    // Store in history
    const history = this.executionHistory.get(profileId) || [];
    history.push(record);

    // Enforce max history
    while (history.length > this.config.maxRecordHistory) {
      history.shift();
    }
    this.executionHistory.set(profileId, history);

    // Update cache
    if (this.config.enableCaching) {
      this.responseCache.set(cacheKey, {
        output,
        timestamp: new Date(),
      });
    }

    // Check for drift
    if (this.config.enableDriftDetection) {
      const driftCheck = await this.checkConsistency(profileId, input, output);
      if (driftCheck.drift.detected) {
        this.emit('drift-detected', { record, drift: driftCheck.drift });
      }
    }

    this.emit('execution-recorded', { record });
    return record;
  }

  // ============================================================================
  // CONSISTENCY CHECKING
  // ============================================================================

  async checkConsistency(
    profileId: string,
    input: string,
    output: string
  ): Promise<ConsistencyCheck> {
    const inputHash = this.hashString(input);
    const actualOutputHash = this.hashString(output);

    // Find previous executions with same input
    const history = this.executionHistory.get(profileId) || [];
    const previousExecutions = history.filter(r => r.inputHash === inputHash);

    if (previousExecutions.length === 0) {
      return {
        profileId,
        inputHash,
        actualOutputHash,
        isConsistent: true,
        similarity: 100,
        drift: {
          detected: false,
          severity: 'none',
          factors: [],
          recommendation: 'First execution with this input.',
        },
        timestamp: new Date(),
      };
    }

    // Compare with most recent previous execution
    const previousExecution = previousExecutions[previousExecutions.length - 1];
    const similarity = this.calculateSimilarity(previousExecution.output, output);
    const isConsistent = similarity >= this.config.driftThreshold;

    // Analyze drift
    const drift = this.analyzeDrift(previousExecution, output, similarity);

    // Update profile success rate
    const profile = this.profiles.get(profileId);
    if (profile) {
      const totalChecks = previousExecutions.length + 1;
      const consistentChecks = previousExecutions.filter(
        r => r.outputHash === actualOutputHash
      ).length + (isConsistent ? 1 : 0);
      profile.successRate = (consistentChecks / totalChecks) * 100;
    }

    const check: ConsistencyCheck = {
      profileId,
      inputHash,
      expectedOutputHash: previousExecution.outputHash,
      actualOutputHash,
      isConsistent,
      similarity,
      drift,
      timestamp: new Date(),
    };

    if (!isConsistent && this.config.strictMode) {
      this.emit('consistency-violation', { check });
      throw new Error(`Consistency violation: similarity ${similarity}% below threshold ${this.config.driftThreshold}%`);
    }

    return check;
  }

  private analyzeDrift(
    previousExecution: ExecutionRecord,
    currentOutput: string,
    similarity: number
  ): DriftAnalysis {
    const factors: DriftFactor[] = [];
    let severity: DriftAnalysis['severity'] = 'none';

    // Check output variation
    if (similarity < 100) {
      const variationImpact = 100 - similarity;
      factors.push({
        type: 'output-variation',
        description: `Output differs by ${variationImpact.toFixed(1)}% from previous execution`,
        impact: variationImpact,
      });

      if (similarity < 50) severity = 'major';
      else if (similarity < 70) severity = 'moderate';
      else if (similarity < this.config.driftThreshold) severity = 'minor';
    }

    // Check config changes (would be caught if profile was modified)
    const profile = this.profiles.get(previousExecution.profileId);
    if (profile) {
      const configHash = this.hashString(JSON.stringify(profile.config));
      const prevConfigHash = this.hashString(JSON.stringify(previousExecution.config));

      if (configHash !== prevConfigHash) {
        factors.push({
          type: 'config-change',
          description: 'Configuration has changed since previous execution',
          impact: 30,
        });
        severity = severity === 'none' ? 'minor' : severity;
      }
    }

    const detected = factors.length > 0;
    let recommendation = 'No action needed.';

    if (severity === 'major') {
      recommendation = 'Consider investigating cause of significant output drift. May indicate model behavior change.';
    } else if (severity === 'moderate') {
      recommendation = 'Monitor for continued drift. Consider adjusting temperature if not expected.';
    } else if (severity === 'minor') {
      recommendation = 'Minor variation detected. May be normal for non-zero temperature.';
    }

    return {
      detected,
      severity,
      factors,
      recommendation,
    };
  }

  // ============================================================================
  // CACHING
  // ============================================================================

  getCachedResponse(profileId: string, input: string): string | null {
    if (!this.config.enableCaching) return null;

    const inputHash = this.hashString(input);
    const cacheKey = this.generateCacheKey(profileId, inputHash);
    const cached = this.responseCache.get(cacheKey);

    if (!cached) return null;

    // Check expiry
    const age = Date.now() - cached.timestamp.getTime();
    const maxAge = this.config.cacheExpiryHours * 60 * 60 * 1000;

    if (age > maxAge) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    this.emit('cache-hit', { profileId, inputHash });
    return cached.output;
  }

  clearCache(profileId?: string): void {
    if (profileId) {
      // Clear cache for specific profile
      for (const key of this.responseCache.keys()) {
        if (key.startsWith(profileId)) {
          this.responseCache.delete(key);
        }
      }
    } else {
      this.responseCache.clear();
    }

    this.emit('cache-cleared', { profileId });
  }

  // ============================================================================
  // REPRODUCIBILITY HELPERS
  // ============================================================================

  generateSeed(): number {
    // Generate deterministic seed based on timestamp and counter
    this.currentSeed = (this.currentSeed * 1103515245 + 12345) & 0x7fffffff;
    return this.currentSeed;
  }

  setSeed(seed: number): void {
    this.currentSeed = seed;
    this.emit('seed-set', { seed });
  }

  exportProfile(profileId: string): string {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    return JSON.stringify({
      profile,
      history: this.executionHistory.get(profileId) || [],
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    }, null, 2);
  }

  importProfile(data: string): ConsistencyProfile {
    const parsed = JSON.parse(data);

    if (!parsed.profile || !parsed.profile.id) {
      throw new Error('Invalid profile export data');
    }

    const profile = parsed.profile as ConsistencyProfile;

    // Generate new ID to avoid conflicts
    profile.id = uuid();

    this.profiles.set(profile.id, profile);
    this.executionHistory.set(profile.id, parsed.history || []);

    this.emit('profile-imported', { profile });
    return profile;
  }

  // ============================================================================
  // EXECUTION HISTORY
  // ============================================================================

  getExecutionHistory(profileId: string): ExecutionRecord[] {
    return this.executionHistory.get(profileId) || [];
  }

  getRecentExecutions(profileId: string, limit: number = 10): ExecutionRecord[] {
    const history = this.executionHistory.get(profileId) || [];
    return history.slice(-limit);
  }

  findSimilarExecutions(
    profileId: string,
    input: string,
    limit: number = 5
  ): ExecutionRecord[] {
    const history = this.executionHistory.get(profileId) || [];
    const inputHash = this.hashString(input);

    // First, find exact matches
    const exactMatches = history.filter(r => r.inputHash === inputHash);
    if (exactMatches.length >= limit) {
      return exactMatches.slice(-limit);
    }

    // Then find similar by text comparison
    const scored = history
      .filter(r => r.inputHash !== inputHash)
      .map(r => ({
        record: r,
        similarity: this.calculateSimilarity(r.input, input),
      }))
      .filter(s => s.similarity > 50)
      .sort((a, b) => b.similarity - a.similarity);

    return [
      ...exactMatches,
      ...scored.slice(0, limit - exactMatches.length).map(s => s.record),
    ].slice(0, limit);
  }

  // ============================================================================
  // MODEL VERSION MANAGEMENT
  // ============================================================================

  getAvailableModels(): ModelVersion[] {
    return Object.values(MODEL_REGISTRY);
  }

  getModelVersion(modelId: string): ModelVersion | undefined {
    return MODEL_REGISTRY[modelId];
  }

  registerModel(modelId: string, version: ModelVersion): void {
    MODEL_REGISTRY[modelId] = version;
    this.emit('model-registered', { modelId, version });
  }

  isModelDeprecated(modelId: string): boolean {
    const model = MODEL_REGISTRY[modelId];
    if (!model || !model.deprecationDate) return false;
    return new Date() > model.deprecationDate;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private hashString(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  private generateCacheKey(profileId: string, inputHash: string): string {
    return `${profileId}:${inputHash}`;
  }

  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 100;

    // Levenshtein-based similarity
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 100;

    const distance = this.levenshteinDistance(a, b);
    return Math.max(0, ((maxLen - distance) / maxLen) * 100);
  }

  private levenshteinDistance(a: string, b: string): number {
    // Optimized Levenshtein for long strings - use sample
    const maxSampleLength = 1000;
    if (a.length > maxSampleLength || b.length > maxSampleLength) {
      // Sample from beginning, middle, and end
      const sampleA = a.substring(0, 300) + a.substring(a.length / 2 - 200, a.length / 2 + 200) + a.substring(a.length - 300);
      const sampleB = b.substring(0, 300) + b.substring(b.length / 2 - 200, b.length / 2 + 200) + b.substring(b.length - 300);
      return this.levenshteinDistanceCore(sampleA, sampleB);
    }

    return this.levenshteinDistanceCore(a, b);
  }

  private levenshteinDistanceCore(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  getStats(): {
    totalProfiles: number;
    totalExecutions: number;
    cacheSize: number;
    averageSuccessRate: number;
  } {
    let totalExecutions = 0;
    let totalSuccessRate = 0;

    for (const [profileId, history] of this.executionHistory.entries()) {
      totalExecutions += history.length;
      const profile = this.profiles.get(profileId);
      if (profile) {
        totalSuccessRate += profile.successRate;
      }
    }

    return {
      totalProfiles: this.profiles.size,
      totalExecutions,
      cacheSize: this.responseCache.size,
      averageSuccessRate: this.profiles.size > 0
        ? totalSuccessRate / this.profiles.size
        : 100,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createConsistencyManager(
  config?: Partial<ConsistencyManagerConfig>
): ConsistencyManager {
  return new ConsistencyManager(config);
}
