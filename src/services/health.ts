/**
 * Alabobai Health Monitoring Service
 * Monitors system health, performance metrics, and service availability
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { LLMService, getDefaultLLMService } from './llm.js';
import { OrchestratorService, getOrchestratorService } from './orchestrator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  services: ServiceHealth[];
  system: SystemMetrics;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  lastCheck: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    count: number;
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  process: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    pid: number;
  };
  platform: string;
  nodeVersion: string;
}

export interface PerformanceMetrics {
  timestamp: Date;
  requests: {
    total: number;
    perSecond: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
  };
  llm: {
    totalRequests: number;
    totalTokens: number;
    avgLatencyMs: number;
    errorRate: number;
  };
  departments: {
    id: string;
    name: string;
    requestCount: number;
    avgLatencyMs: number;
  }[];
}

export interface HealthCheckConfig {
  checkIntervalMs?: number;
  llmHealthCheck?: boolean;
  customChecks?: Array<{
    name: string;
    check: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
  }>;
}

// ============================================================================
// HEALTH MONITOR CLASS
// ============================================================================

export class HealthMonitor extends EventEmitter {
  private startTime: Date;
  private version: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private serviceStatuses: Map<string, ServiceHealth> = new Map();
  private requestLatencies: number[] = [];
  private requestCount: number = 0;
  private errorCount: number = 0;
  private departmentMetrics: Map<string, { count: number; totalLatency: number }> = new Map();

  private llmService: LLMService | null = null;
  private orchestratorService: OrchestratorService | null = null;
  private config: Required<HealthCheckConfig>;
  private customChecks: Array<{
    name: string;
    check: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
  }>;

  constructor(config: HealthCheckConfig = {}) {
    super();

    this.startTime = new Date();
    this.version = process.env.npm_package_version || '1.0.0';
    this.config = {
      checkIntervalMs: config.checkIntervalMs || 30000,
      llmHealthCheck: config.llmHealthCheck ?? true,
      customChecks: config.customChecks || []
    };
    this.customChecks = config.customChecks || [];
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    try {
      // Get service references
      this.llmService = getDefaultLLMService();
      this.orchestratorService = getOrchestratorService();

      // Run initial health check
      await this.performHealthCheck();

      // Start periodic health checks
      this.checkInterval = setInterval(
        () => this.performHealthCheck(),
        this.config.checkIntervalMs
      );

      console.log('[HealthMonitor] Initialized, running checks every', this.config.checkIntervalMs, 'ms');
    } catch (error) {
      console.error('[HealthMonitor] Initialization failed:', error);
    }
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  async performHealthCheck(): Promise<void> {
    const checks: Promise<void>[] = [];

    // Check LLM service
    if (this.config.llmHealthCheck && this.llmService) {
      checks.push(this.checkLLMService());
    }

    // Check orchestrator service
    if (this.orchestratorService) {
      checks.push(this.checkOrchestratorService());
    }

    // Run custom checks
    for (const customCheck of this.customChecks) {
      checks.push(this.runCustomCheck(customCheck));
    }

    await Promise.all(checks);

    // Emit health status
    const status = this.getHealthStatus();
    this.emit('health-check', status);

    if (status.status !== 'healthy') {
      this.emit('health-degraded', status);
    }
  }

  private async checkLLMService(): Promise<void> {
    const name = 'llm';
    const startTime = Date.now();

    try {
      const health = await this.llmService!.healthCheck();

      this.serviceStatuses.set(name, {
        name: 'LLM Service',
        status: health.healthy ? 'healthy' : 'unhealthy',
        latencyMs: health.latencyMs,
        lastCheck: new Date(),
        error: health.error,
        metadata: this.llmService!.getProviderInfo()
      });
    } catch (error) {
      this.serviceStatuses.set(name, {
        name: 'LLM Service',
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async checkOrchestratorService(): Promise<void> {
    const name = 'orchestrator';
    const startTime = Date.now();

    try {
      const health = await this.orchestratorService!.healthCheck();

      const orchestratorStatus: 'healthy' | 'degraded' | 'unhealthy' =
        health.healthy ? 'healthy' : (health.llmHealthy ? 'unhealthy' : 'degraded');

      this.serviceStatuses.set(name, {
        name: 'Orchestrator Service',
        status: orchestratorStatus,
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
        metadata: {
          departmentCount: health.departmentCount,
          llmHealthy: health.llmHealthy
        }
      });
    } catch (error) {
      this.serviceStatuses.set(name, {
        name: 'Orchestrator Service',
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async runCustomCheck(check: {
    name: string;
    check: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
  }): Promise<void> {
    try {
      const result = await check.check();

      this.serviceStatuses.set(check.name, {
        name: check.name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        latencyMs: result.latencyMs,
        lastCheck: new Date(),
        error: result.error
      });
    } catch (error) {
      this.serviceStatuses.set(check.name, {
        name: check.name,
        status: 'unhealthy',
        latencyMs: 0,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ============================================================================
  // METRICS COLLECTION
  // ============================================================================

  recordRequest(latencyMs: number, departmentId?: string, isError: boolean = false): void {
    this.requestCount++;
    this.requestLatencies.push(latencyMs);

    if (isError) {
      this.errorCount++;
    }

    // Track department metrics
    if (departmentId) {
      const existing = this.departmentMetrics.get(departmentId) || { count: 0, totalLatency: 0 };
      existing.count++;
      existing.totalLatency += latencyMs;
      this.departmentMetrics.set(departmentId, existing);
    }

    // Keep only last 1000 latencies for percentile calculations
    if (this.requestLatencies.length > 1000) {
      this.requestLatencies.shift();
    }
  }

  // ============================================================================
  // STATUS RETRIEVAL
  // ============================================================================

  getHealthStatus(): HealthStatus {
    const services = Array.from(this.serviceStatuses.values());

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    if (unhealthyCount > 0) {
      status = services.length === unhealthyCount ? 'unhealthy' : 'degraded';
    } else if (degradedCount > 0) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      version: this.version,
      services,
      system: this.getSystemMetrics()
    };
  }

  getSystemMetrics(): SystemMetrics {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }
    const cpuUsage = 1 - totalIdle / totalTick;

    return {
      cpu: {
        usage: Math.round(cpuUsage * 100) / 100,
        count: cpus.length,
        model: cpus[0]?.model || 'Unknown'
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercent: Math.round((usedMemory / totalMemory) * 100)
      },
      process: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid
      },
      platform: os.platform(),
      nodeVersion: process.version
    };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const sortedLatencies = [...this.requestLatencies].sort((a, b) => a - b);
    const uptimeSeconds = (Date.now() - this.startTime.getTime()) / 1000;

    // Calculate percentiles
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const avgLatency = sortedLatencies.length > 0
      ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
      : 0;

    // Get LLM stats
    const llmStats = this.llmService?.getStats() || {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalErrors: 0,
      averageLatencyMs: 0
    };

    // Department metrics
    const departments: PerformanceMetrics['departments'] = [];
    this.departmentMetrics.forEach((metrics, id) => {
      departments.push({
        id,
        name: id,
        requestCount: metrics.count,
        avgLatencyMs: metrics.count > 0 ? metrics.totalLatency / metrics.count : 0
      });
    });

    return {
      timestamp: new Date(),
      requests: {
        total: this.requestCount,
        perSecond: this.requestCount / uptimeSeconds,
        avgLatencyMs: avgLatency,
        p95LatencyMs: sortedLatencies[p95Index] || 0,
        p99LatencyMs: sortedLatencies[p99Index] || 0,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0
      },
      llm: {
        totalRequests: llmStats.totalRequests,
        totalTokens: llmStats.totalInputTokens + llmStats.totalOutputTokens,
        avgLatencyMs: llmStats.averageLatencyMs,
        errorRate: llmStats.totalRequests > 0 ? llmStats.totalErrors / llmStats.totalRequests : 0
      },
      departments
    };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.removeAllListeners();
    console.log('[HealthMonitor] Shutdown complete');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let healthMonitor: HealthMonitor | null = null;

export function createHealthMonitor(config?: HealthCheckConfig): HealthMonitor {
  return new HealthMonitor(config);
}

export function getHealthMonitor(): HealthMonitor {
  if (!healthMonitor) {
    healthMonitor = new HealthMonitor();
  }
  return healthMonitor;
}

export async function initializeHealthMonitor(config?: HealthCheckConfig): Promise<HealthMonitor> {
  healthMonitor = new HealthMonitor(config);
  await healthMonitor.initialize();
  return healthMonitor;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default HealthMonitor;
