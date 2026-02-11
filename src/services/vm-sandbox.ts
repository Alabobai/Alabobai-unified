/**
 * Alabobai VM Sandbox Service
 * Sandboxed environment management for secure browser automation
 * Provides isolation, resource limits, and security controls
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess, execSync } from 'child_process';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// TYPES
// ============================================================================

export interface SandboxConfig {
  // Resource limits
  maxMemoryMB?: number;
  maxCpuPercent?: number;
  maxDiskMB?: number;
  maxProcesses?: number;

  // Network controls
  allowNetwork?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];

  // Security settings
  enableClipboard?: boolean;
  enableFileAccess?: boolean;
  allowedPaths?: string[];
  enableWebRTC?: boolean;
  enableGeolocation?: boolean;

  // Isolation
  isolateUserData?: boolean;
  clearOnClose?: boolean;

  // Timeouts
  sessionTimeoutMs?: number;
  actionTimeoutMs?: number;
}

export interface SandboxEnvironment {
  id: string;
  config: Required<SandboxConfig>;
  status: SandboxStatus;
  process?: ChildProcess;
  tempDir: string;
  userDataDir: string;
  createdAt: Date;
  lastActivity: Date;
  resourceUsage: ResourceUsage;
  violations: SecurityViolation[];
}

export type SandboxStatus =
  | 'initializing'
  | 'ready'
  | 'running'
  | 'suspended'
  | 'terminated'
  | 'error';

export interface ResourceUsage {
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  networkBytesIn: number;
  networkBytesOut: number;
  processCount: number;
}

export interface SecurityViolation {
  id: string;
  timestamp: Date;
  type: ViolationType;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
}

export type ViolationType =
  | 'network-blocked'
  | 'file-access-denied'
  | 'resource-limit-exceeded'
  | 'unauthorized-domain'
  | 'suspicious-behavior'
  | 'timeout-exceeded';

export interface SandboxPolicy {
  name: string;
  description: string;
  rules: PolicyRule[];
}

export interface PolicyRule {
  type: 'allow' | 'deny';
  resource: 'network' | 'file' | 'clipboard' | 'geolocation' | 'webrtc' | 'domain';
  pattern?: string;
  action: 'block' | 'warn' | 'log';
}

// ============================================================================
// VM SANDBOX SERVICE
// ============================================================================

export class VMSandboxService extends EventEmitter {
  private environments: Map<string, SandboxEnvironment> = new Map();
  private policies: Map<string, SandboxPolicy> = new Map();
  private monitorInterval?: NodeJS.Timeout;
  private defaultConfig: Required<SandboxConfig>;

  constructor(defaultConfig: SandboxConfig = {}) {
    super();
    this.defaultConfig = {
      maxMemoryMB: defaultConfig.maxMemoryMB ?? 1024,
      maxCpuPercent: defaultConfig.maxCpuPercent ?? 50,
      maxDiskMB: defaultConfig.maxDiskMB ?? 512,
      maxProcesses: defaultConfig.maxProcesses ?? 10,
      allowNetwork: defaultConfig.allowNetwork ?? true,
      allowedDomains: defaultConfig.allowedDomains ?? [],
      blockedDomains: defaultConfig.blockedDomains ?? [],
      enableClipboard: defaultConfig.enableClipboard ?? false,
      enableFileAccess: defaultConfig.enableFileAccess ?? false,
      allowedPaths: defaultConfig.allowedPaths ?? [],
      enableWebRTC: defaultConfig.enableWebRTC ?? false,
      enableGeolocation: defaultConfig.enableGeolocation ?? false,
      isolateUserData: defaultConfig.isolateUserData ?? true,
      clearOnClose: defaultConfig.clearOnClose ?? true,
      sessionTimeoutMs: defaultConfig.sessionTimeoutMs ?? 3600000, // 1 hour
      actionTimeoutMs: defaultConfig.actionTimeoutMs ?? 30000, // 30 seconds
    };

    // Start resource monitoring
    this.startMonitoring();

    // Set up default policies
    this.setupDefaultPolicies();
  }

  // ============================================================================
  // ENVIRONMENT MANAGEMENT
  // ============================================================================

  /**
   * Create a new sandboxed environment
   */
  async createEnvironment(config?: Partial<SandboxConfig>): Promise<SandboxEnvironment> {
    const envId = uuid();
    const mergedConfig = { ...this.defaultConfig, ...config };

    // Create temp directories
    const tempDir = path.join(os.tmpdir(), 'alabobai-sandbox', envId);
    const userDataDir = path.join(tempDir, 'user-data');

    try {
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to create sandbox directories: ${err.message}`);
    }

    const environment: SandboxEnvironment = {
      id: envId,
      config: mergedConfig,
      status: 'initializing',
      tempDir,
      userDataDir,
      createdAt: new Date(),
      lastActivity: new Date(),
      resourceUsage: {
        memoryMB: 0,
        cpuPercent: 0,
        diskMB: 0,
        networkBytesIn: 0,
        networkBytesOut: 0,
        processCount: 0,
      },
      violations: [],
    };

    this.environments.set(envId, environment);

    // Initialize the sandbox
    await this.initializeSandbox(environment);

    environment.status = 'ready';
    this.emit('environment-created', { envId, config: mergedConfig });

    return environment;
  }

  /**
   * Get environment by ID
   */
  getEnvironment(envId: string): SandboxEnvironment | undefined {
    return this.environments.get(envId);
  }

  /**
   * Get all environments
   */
  getAllEnvironments(): SandboxEnvironment[] {
    return Array.from(this.environments.values());
  }

  /**
   * Destroy an environment
   */
  async destroyEnvironment(envId: string): Promise<void> {
    const environment = this.environments.get(envId);
    if (!environment) {
      throw new Error(`Environment not found: ${envId}`);
    }

    // Terminate any running processes
    if (environment.process) {
      environment.process.kill('SIGTERM');
    }

    environment.status = 'terminated';

    // Clean up directories if configured
    if (environment.config.clearOnClose) {
      try {
        fs.rmSync(environment.tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.environments.delete(envId);
    this.emit('environment-destroyed', { envId });
  }

  /**
   * Suspend an environment
   */
  async suspendEnvironment(envId: string): Promise<void> {
    const environment = this.environments.get(envId);
    if (!environment) {
      throw new Error(`Environment not found: ${envId}`);
    }

    if (environment.process) {
      environment.process.kill('SIGSTOP');
    }

    environment.status = 'suspended';
    this.emit('environment-suspended', { envId });
  }

  /**
   * Resume a suspended environment
   */
  async resumeEnvironment(envId: string): Promise<void> {
    const environment = this.environments.get(envId);
    if (!environment) {
      throw new Error(`Environment not found: ${envId}`);
    }

    if (environment.process) {
      environment.process.kill('SIGCONT');
    }

    environment.status = 'running';
    environment.lastActivity = new Date();
    this.emit('environment-resumed', { envId });
  }

  // ============================================================================
  // BROWSER LAUNCH CONFIGURATION
  // ============================================================================

  /**
   * Get Puppeteer launch arguments for sandboxed browser
   */
  getBrowserLaunchArgs(envId: string): string[] {
    const environment = this.environments.get(envId);
    if (!environment) {
      throw new Error(`Environment not found: ${envId}`);
    }

    const args: string[] = [
      // Sandbox settings
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',

      // User data isolation
      `--user-data-dir=${environment.userDataDir}`,

      // Disable various features for security
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-ipc-flooding-protection',

      // Memory limits
      `--js-flags=--max-old-space-size=${Math.floor(environment.config.maxMemoryMB * 0.75)}`,

      // Disable features based on config
      '--disable-notifications',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];

    // Network controls
    if (!environment.config.allowNetwork) {
      args.push('--disable-network');
    }

    // WebRTC
    if (!environment.config.enableWebRTC) {
      args.push('--disable-webrtc');
      args.push('--disable-webrtc-encryption');
      args.push('--disable-webrtc-hw-encoding');
      args.push('--disable-webrtc-hw-decoding');
    }

    // Geolocation
    if (!environment.config.enableGeolocation) {
      args.push('--disable-geolocation');
    }

    // Clipboard
    if (!environment.config.enableClipboard) {
      args.push('--disable-reading-from-canvas');
    }

    return args;
  }

  /**
   * Get browser preferences for sandboxed environment
   */
  getBrowserPreferences(envId: string): Record<string, unknown> {
    const environment = this.environments.get(envId);
    if (!environment) {
      throw new Error(`Environment not found: ${envId}`);
    }

    return {
      // Disable downloads
      download_restrictions: 3,

      // Disable various features
      enable_do_not_track: true,
      safebrowsing: {
        enabled: true,
      },

      // Privacy settings
      profile: {
        content_settings: {
          exceptions: {
            geolocation: environment.config.enableGeolocation ? {} : { '*': { setting: 2 } },
            notifications: { '*': { setting: 2 } },
            media_stream_camera: { '*': { setting: 2 } },
            media_stream_mic: { '*': { setting: 2 } },
            clipboard: environment.config.enableClipboard ? {} : { '*': { setting: 2 } },
          },
        },
      },
    };
  }

  // ============================================================================
  // SECURITY VALIDATION
  // ============================================================================

  /**
   * Validate a URL against security policies
   */
  validateUrl(envId: string, url: string): { allowed: boolean; reason?: string } {
    const environment = this.environments.get(envId);
    if (!environment) {
      return { allowed: false, reason: 'Environment not found' };
    }

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Check blocked domains
      if (environment.config.blockedDomains.length > 0) {
        for (const blocked of environment.config.blockedDomains) {
          if (domain.includes(blocked) || this.matchDomainPattern(domain, blocked)) {
            this.recordViolation(envId, 'unauthorized-domain', `Blocked domain: ${domain}`, 'medium');
            return { allowed: false, reason: `Domain blocked: ${domain}` };
          }
        }
      }

      // Check allowed domains (if specified)
      if (environment.config.allowedDomains.length > 0) {
        const isAllowed = environment.config.allowedDomains.some(
          allowed => domain.includes(allowed) || this.matchDomainPattern(domain, allowed)
        );

        if (!isAllowed) {
          this.recordViolation(envId, 'unauthorized-domain', `Domain not in allowlist: ${domain}`, 'medium');
          return { allowed: false, reason: `Domain not allowed: ${domain}` };
        }
      }

      // Check network access
      if (!environment.config.allowNetwork) {
        this.recordViolation(envId, 'network-blocked', `Network access blocked for: ${url}`, 'low');
        return { allowed: false, reason: 'Network access disabled' };
      }

      return { allowed: true };
    } catch (error) {
      return { allowed: false, reason: 'Invalid URL' };
    }
  }

  /**
   * Validate file access
   */
  validateFileAccess(envId: string, filePath: string, operation: 'read' | 'write'): { allowed: boolean; reason?: string } {
    const environment = this.environments.get(envId);
    if (!environment) {
      return { allowed: false, reason: 'Environment not found' };
    }

    if (!environment.config.enableFileAccess) {
      this.recordViolation(envId, 'file-access-denied', `File access blocked: ${filePath}`, 'medium');
      return { allowed: false, reason: 'File access disabled' };
    }

    // Check if path is in allowed paths
    const absolutePath = path.resolve(filePath);
    const isAllowed = environment.config.allowedPaths.some(
      allowed => absolutePath.startsWith(path.resolve(allowed))
    );

    // Always allow access to temp directory
    if (absolutePath.startsWith(environment.tempDir)) {
      return { allowed: true };
    }

    if (!isAllowed) {
      this.recordViolation(envId, 'file-access-denied', `Unauthorized path: ${filePath}`, 'high');
      return { allowed: false, reason: `Path not allowed: ${filePath}` };
    }

    return { allowed: true };
  }

  /**
   * Validate resource usage
   */
  validateResources(envId: string): { allowed: boolean; violations: string[] } {
    const environment = this.environments.get(envId);
    if (!environment) {
      return { allowed: false, violations: ['Environment not found'] };
    }

    const violations: string[] = [];

    if (environment.resourceUsage.memoryMB > environment.config.maxMemoryMB) {
      violations.push(`Memory exceeded: ${environment.resourceUsage.memoryMB}MB > ${environment.config.maxMemoryMB}MB`);
    }

    if (environment.resourceUsage.cpuPercent > environment.config.maxCpuPercent) {
      violations.push(`CPU exceeded: ${environment.resourceUsage.cpuPercent}% > ${environment.config.maxCpuPercent}%`);
    }

    if (environment.resourceUsage.diskMB > environment.config.maxDiskMB) {
      violations.push(`Disk exceeded: ${environment.resourceUsage.diskMB}MB > ${environment.config.maxDiskMB}MB`);
    }

    if (environment.resourceUsage.processCount > environment.config.maxProcesses) {
      violations.push(`Processes exceeded: ${environment.resourceUsage.processCount} > ${environment.config.maxProcesses}`);
    }

    for (const violation of violations) {
      this.recordViolation(envId, 'resource-limit-exceeded', violation, 'high');
    }

    return { allowed: violations.length === 0, violations };
  }

  // ============================================================================
  // SECURITY VIOLATIONS
  // ============================================================================

  /**
   * Record a security violation
   */
  recordViolation(
    envId: string,
    type: ViolationType,
    details: string,
    severity: SecurityViolation['severity'],
    blocked: boolean = true
  ): void {
    const environment = this.environments.get(envId);
    if (!environment) return;

    const violation: SecurityViolation = {
      id: uuid(),
      timestamp: new Date(),
      type,
      details,
      severity,
      blocked,
    };

    environment.violations.push(violation);

    this.emit('security-violation', { envId, violation });

    // Auto-terminate on critical violations
    if (severity === 'critical') {
      this.emit('critical-violation', { envId, violation });
      this.destroyEnvironment(envId).catch(() => {});
    }
  }

  /**
   * Get violations for an environment
   */
  getViolations(envId: string): SecurityViolation[] {
    const environment = this.environments.get(envId);
    return environment?.violations ?? [];
  }

  /**
   * Clear violations for an environment
   */
  clearViolations(envId: string): void {
    const environment = this.environments.get(envId);
    if (environment) {
      environment.violations = [];
    }
  }

  // ============================================================================
  // POLICY MANAGEMENT
  // ============================================================================

  /**
   * Add a security policy
   */
  addPolicy(policy: SandboxPolicy): void {
    this.policies.set(policy.name, policy);
    this.emit('policy-added', { name: policy.name });
  }

  /**
   * Remove a security policy
   */
  removePolicy(name: string): void {
    this.policies.delete(name);
    this.emit('policy-removed', { name });
  }

  /**
   * Get all policies
   */
  getPolicies(): SandboxPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Apply a policy to an environment
   */
  applyPolicy(envId: string, policyName: string): void {
    const environment = this.environments.get(envId);
    const policy = this.policies.get(policyName);

    if (!environment || !policy) {
      return;
    }

    for (const rule of policy.rules) {
      switch (rule.resource) {
        case 'network':
          environment.config.allowNetwork = rule.type === 'allow';
          break;
        case 'file':
          environment.config.enableFileAccess = rule.type === 'allow';
          break;
        case 'clipboard':
          environment.config.enableClipboard = rule.type === 'allow';
          break;
        case 'geolocation':
          environment.config.enableGeolocation = rule.type === 'allow';
          break;
        case 'webrtc':
          environment.config.enableWebRTC = rule.type === 'allow';
          break;
        case 'domain':
          if (rule.pattern) {
            if (rule.type === 'allow') {
              environment.config.allowedDomains.push(rule.pattern);
            } else {
              environment.config.blockedDomains.push(rule.pattern);
            }
          }
          break;
      }
    }

    this.emit('policy-applied', { envId, policyName });
  }

  // ============================================================================
  // RESOURCE MONITORING
  // ============================================================================

  /**
   * Update resource usage for an environment
   */
  async updateResourceUsage(envId: string): Promise<ResourceUsage> {
    const environment = this.environments.get(envId);
    if (!environment) {
      throw new Error(`Environment not found: ${envId}`);
    }

    try {
      // Get disk usage
      const diskUsage = this.getDirectorySize(environment.tempDir);

      // In a real implementation, we would monitor the actual process
      // For now, we'll use placeholder values
      environment.resourceUsage = {
        memoryMB: environment.resourceUsage.memoryMB,
        cpuPercent: environment.resourceUsage.cpuPercent,
        diskMB: Math.round(diskUsage / (1024 * 1024)),
        networkBytesIn: environment.resourceUsage.networkBytesIn,
        networkBytesOut: environment.resourceUsage.networkBytesOut,
        processCount: environment.resourceUsage.processCount,
      };

      return environment.resourceUsage;
    } catch (error) {
      return environment.resourceUsage;
    }
  }

  /**
   * Set resource usage (called from browser process monitor)
   */
  setResourceUsage(envId: string, usage: Partial<ResourceUsage>): void {
    const environment = this.environments.get(envId);
    if (!environment) return;

    environment.resourceUsage = {
      ...environment.resourceUsage,
      ...usage,
    };

    // Check for resource violations
    this.validateResources(envId);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async initializeSandbox(environment: SandboxEnvironment): Promise<void> {
    // Create necessary subdirectories
    const dirs = ['cache', 'downloads', 'logs'];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(environment.tempDir, dir), { recursive: true });
    }

    // Write security configuration
    const securityConfig = {
      envId: environment.id,
      config: environment.config,
      createdAt: environment.createdAt.toISOString(),
    };

    fs.writeFileSync(
      path.join(environment.tempDir, 'security.json'),
      JSON.stringify(securityConfig, null, 2)
    );
  }

  private startMonitoring(): void {
    // Monitor environments every 5 seconds
    this.monitorInterval = setInterval(async () => {
      const entries = Array.from(this.environments.entries());
      for (let i = 0; i < entries.length; i++) {
        const [envId, environment] = entries[i];
        // Check session timeout
        const elapsed = Date.now() - environment.lastActivity.getTime();
        if (elapsed > environment.config.sessionTimeoutMs) {
          this.recordViolation(envId, 'timeout-exceeded', 'Session timeout exceeded', 'medium');
          await this.destroyEnvironment(envId);
          continue;
        }

        // Update and validate resource usage
        await this.updateResourceUsage(envId);
      }
    }, 5000);
  }

  private setupDefaultPolicies(): void {
    // Strict policy - minimal permissions
    this.addPolicy({
      name: 'strict',
      description: 'Minimal permissions for high-security tasks',
      rules: [
        { type: 'deny', resource: 'network', action: 'block' },
        { type: 'deny', resource: 'file', action: 'block' },
        { type: 'deny', resource: 'clipboard', action: 'block' },
        { type: 'deny', resource: 'geolocation', action: 'block' },
        { type: 'deny', resource: 'webrtc', action: 'block' },
      ],
    });

    // Browsing policy - allow network, block sensitive features
    this.addPolicy({
      name: 'browsing',
      description: 'Standard web browsing with network access',
      rules: [
        { type: 'allow', resource: 'network', action: 'log' },
        { type: 'deny', resource: 'file', action: 'block' },
        { type: 'deny', resource: 'clipboard', action: 'block' },
        { type: 'deny', resource: 'geolocation', action: 'warn' },
        { type: 'deny', resource: 'webrtc', action: 'block' },
      ],
    });

    // Development policy - more permissive for testing
    this.addPolicy({
      name: 'development',
      description: 'Permissive settings for development and testing',
      rules: [
        { type: 'allow', resource: 'network', action: 'log' },
        { type: 'allow', resource: 'file', action: 'log' },
        { type: 'allow', resource: 'clipboard', action: 'log' },
        { type: 'deny', resource: 'geolocation', action: 'warn' },
        { type: 'deny', resource: 'webrtc', action: 'warn' },
      ],
    });
  }

  private matchDomainPattern(domain: string, pattern: string): boolean {
    // Convert glob-like pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i').test(domain);
  }

  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          totalSize += this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return totalSize;
  }

  /**
   * Cleanup all environments
   */
  async cleanup(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    const envIds = Array.from(this.environments.keys());
    for (const envId of envIds) {
      try {
        await this.destroyEnvironment(envId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

// Factory function
export function createVMSandbox(config?: SandboxConfig): VMSandboxService {
  return new VMSandboxService(config);
}
