/**
 * Alabobai Health API Routes
 * Endpoints for health checks, metrics, and system monitoring
 */

import { Router, Request, Response } from 'express';
import {
  HealthMonitor,
  getHealthMonitor,
  initializeHealthMonitor
} from '../../services/health.js';
import { getAuditLogs } from '../middleware/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HealthRouterConfig {
  healthMonitor?: HealthMonitor;
  enableMetrics?: boolean;
  enableDetailedHealth?: boolean;
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createHealthRouter(config: HealthRouterConfig = {}): Router {
  const router = Router();
  const enableMetrics = config.enableMetrics ?? true;
  const enableDetailedHealth = config.enableDetailedHealth ?? true;

  // Get or create health monitor (lazy initialization)
  let healthMonitor: HealthMonitor | null = config.healthMonitor || null;

  const getMonitor = async (): Promise<HealthMonitor> => {
    if (!healthMonitor) {
      healthMonitor = await initializeHealthMonitor();
    }
    return healthMonitor;
  };

  // ============================================================================
  // GET /api/health - Basic health check
  // ============================================================================

  router.get('/', async (req: Request, res: Response) => {
    try {
      const monitor = await getMonitor();
      const status = monitor.getHealthStatus();

      // Return appropriate status code based on health
      const statusCode = status.status === 'healthy' ? 200 :
                         status.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        status: status.status,
        timestamp: status.timestamp,
        uptime: status.uptime,
        version: status.version
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Health check failed'
      });
    }
  });

  // ============================================================================
  // GET /api/health/live - Kubernetes liveness probe
  // ============================================================================

  router.get('/live', (req: Request, res: Response) => {
    // Simple liveness check - just confirms the process is running
    res.status(200).json({
      status: 'alive',
      timestamp: new Date()
    });
  });

  // ============================================================================
  // GET /api/health/ready - Kubernetes readiness probe
  // ============================================================================

  router.get('/ready', async (req: Request, res: Response) => {
    try {
      const monitor = await getMonitor();
      const status = monitor.getHealthStatus();

      // Only ready if healthy or degraded (can still serve some traffic)
      const isReady = status.status !== 'unhealthy';

      res.status(isReady ? 200 : 503).json({
        ready: isReady,
        status: status.status,
        timestamp: status.timestamp
      });
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: error instanceof Error ? error.message : 'Readiness check failed'
      });
    }
  });

  // Dependency readiness matrix for ops dashboards
  router.get('/readiness', async (_req: Request, res: Response) => {
    try {
      const monitor = await getMonitor();
      const status = monitor.getHealthStatus();
      const dependencies = status.services.map(s => ({
        name: s.name,
        status: s.status,
        latencyMs: s.latencyMs || 0,
        lastCheck: s.lastCheck,
        error: s.error || null,
      }));

      const ready = status.status !== 'unhealthy';
      res.status(ready ? 200 : 503).json({
        ready,
        overall: status.status,
        timestamp: status.timestamp,
        dependencies,
      });
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: error instanceof Error ? error.message : 'Readiness matrix failed',
      });
    }
  });

  // ============================================================================
  // GET /api/health/detailed - Detailed health status with services
  // ============================================================================

  if (enableDetailedHealth) {
    router.get('/detailed', async (req: Request, res: Response) => {
      try {
        const monitor = await getMonitor();
        const status = monitor.getHealthStatus();

        res.json({
          status: status.status,
          timestamp: status.timestamp,
          uptime: status.uptime,
          uptimeFormatted: formatUptime(status.uptime),
          version: status.version,
          services: status.services.map(s => ({
            name: s.name,
            status: s.status,
            latencyMs: s.latencyMs,
            lastCheck: s.lastCheck,
            error: s.error,
            metadata: s.metadata
          })),
          system: {
            cpu: {
              usage: `${Math.round(status.system.cpu.usage * 100)}%`,
              cores: status.system.cpu.count,
              model: status.system.cpu.model
            },
            memory: {
              total: formatBytes(status.system.memory.total),
              used: formatBytes(status.system.memory.used),
              free: formatBytes(status.system.memory.free),
              usagePercent: `${status.system.memory.usagePercent}%`
            },
            process: {
              heapUsed: formatBytes(status.system.process.memoryUsage.heapUsed),
              heapTotal: formatBytes(status.system.process.memoryUsage.heapTotal),
              rss: formatBytes(status.system.process.memoryUsage.rss),
              uptime: formatUptime(status.system.process.uptime * 1000),
              pid: status.system.process.pid
            },
            platform: status.system.platform,
            nodeVersion: status.system.nodeVersion
          }
        });
      } catch (error) {
        console.error('[Health API] Detailed health check error:', error);
        res.status(500).json({
          error: 'Failed to get detailed health status',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  // ============================================================================
  // GET /api/health/metrics - Performance metrics
  // ============================================================================

  if (enableMetrics) {
    router.get('/metrics', async (req: Request, res: Response) => {
      try {
        const monitor = await getMonitor();
        const metrics = monitor.getPerformanceMetrics();

        res.json({
          timestamp: metrics.timestamp,
          requests: {
            total: metrics.requests.total,
            perSecond: Math.round(metrics.requests.perSecond * 100) / 100,
            latency: {
              average: Math.round(metrics.requests.avgLatencyMs),
              p95: Math.round(metrics.requests.p95LatencyMs),
              p99: Math.round(metrics.requests.p99LatencyMs)
            },
            errorRate: `${Math.round(metrics.requests.errorRate * 10000) / 100}%`
          },
          llm: {
            totalRequests: metrics.llm.totalRequests,
            totalTokens: metrics.llm.totalTokens,
            avgLatencyMs: Math.round(metrics.llm.avgLatencyMs),
            errorRate: `${Math.round(metrics.llm.errorRate * 10000) / 100}%`
          },
          departments: metrics.departments.map(d => ({
            id: d.id,
            name: d.name,
            requests: d.requestCount,
            avgLatencyMs: Math.round(d.avgLatencyMs)
          }))
        });
      } catch (error) {
        console.error('[Health API] Metrics error:', error);
        res.status(500).json({
          error: 'Failed to get metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // SLO/Error-budget summary endpoint
    router.get('/slo', async (_req: Request, res: Response) => {
      try {
        const monitor = await getMonitor();
        const m = monitor.getPerformanceMetrics();

        const availability = Math.max(0, 1 - m.requests.errorRate);
        const latencyTargetMs = 500;
        const latencyBreaching = m.requests.p95LatencyMs > latencyTargetMs;
        const errorBudget = 0.001; // 99.9% availability target
        const budgetBurn = m.requests.errorRate / errorBudget;

        res.json({
          timestamp: m.timestamp,
          slo: {
            availabilityTarget: 0.999,
            observedAvailability: availability,
            p95LatencyTargetMs: latencyTargetMs,
            observedP95LatencyMs: m.requests.p95LatencyMs,
          },
          status: {
            latencyBreaching,
            errorBudgetBurnRatio: budgetBurn,
            healthy: !latencyBreaching && budgetBurn <= 1,
          },
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to calculate SLOs',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Prometheus-style metrics endpoint
    router.get('/metrics/prometheus', async (req: Request, res: Response) => {
      try {
        const monitor = await getMonitor();
        const status = monitor.getHealthStatus();
        const metrics = monitor.getPerformanceMetrics();

        const lines: string[] = [
          '# HELP alabobai_up Platform health status (1 = healthy, 0.5 = degraded, 0 = unhealthy)',
          '# TYPE alabobai_up gauge',
          `alabobai_up ${status.status === 'healthy' ? 1 : status.status === 'degraded' ? 0.5 : 0}`,
          '',
          '# HELP alabobai_uptime_seconds Platform uptime in seconds',
          '# TYPE alabobai_uptime_seconds counter',
          `alabobai_uptime_seconds ${Math.round(status.uptime / 1000)}`,
          '',
          '# HELP alabobai_requests_total Total number of requests',
          '# TYPE alabobai_requests_total counter',
          `alabobai_requests_total ${metrics.requests.total}`,
          '',
          '# HELP alabobai_request_latency_ms Average request latency in milliseconds',
          '# TYPE alabobai_request_latency_ms gauge',
          `alabobai_request_latency_ms{quantile="avg"} ${Math.round(metrics.requests.avgLatencyMs)}`,
          `alabobai_request_latency_ms{quantile="p95"} ${Math.round(metrics.requests.p95LatencyMs)}`,
          `alabobai_request_latency_ms{quantile="p99"} ${Math.round(metrics.requests.p99LatencyMs)}`,
          '',
          '# HELP alabobai_error_rate Request error rate',
          '# TYPE alabobai_error_rate gauge',
          `alabobai_error_rate ${metrics.requests.errorRate}`,
          '',
          '# HELP alabobai_llm_requests_total Total LLM requests',
          '# TYPE alabobai_llm_requests_total counter',
          `alabobai_llm_requests_total ${metrics.llm.totalRequests}`,
          '',
          '# HELP alabobai_llm_tokens_total Total LLM tokens used',
          '# TYPE alabobai_llm_tokens_total counter',
          `alabobai_llm_tokens_total ${metrics.llm.totalTokens}`,
          '',
          '# HELP alabobai_memory_usage_bytes Process memory usage',
          '# TYPE alabobai_memory_usage_bytes gauge',
          `alabobai_memory_usage_bytes{type="heap_used"} ${status.system.process.memoryUsage.heapUsed}`,
          `alabobai_memory_usage_bytes{type="heap_total"} ${status.system.process.memoryUsage.heapTotal}`,
          `alabobai_memory_usage_bytes{type="rss"} ${status.system.process.memoryUsage.rss}`,
          '',
          '# HELP alabobai_cpu_usage System CPU usage',
          '# TYPE alabobai_cpu_usage gauge',
          `alabobai_cpu_usage ${status.system.cpu.usage}`
        ];

        // Add department metrics
        if (metrics.departments.length > 0) {
          lines.push('');
          lines.push('# HELP alabobai_department_requests_total Requests per department');
          lines.push('# TYPE alabobai_department_requests_total counter');
          for (const dept of metrics.departments) {
            lines.push(`alabobai_department_requests_total{department="${dept.id}"} ${dept.requestCount}`);
          }
        }

        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(lines.join('\n'));
      } catch (error) {
        res.status(500).send(`# Error generating metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  const requireAdminKey = (req: Request, res: Response): boolean => {
    const key = req.headers['x-api-key'] as string | undefined;
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && key !== adminKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  // ============================================================================
  // GET /api/health/audit - Structured audit logs (admin key required)
  // ============================================================================

  router.get('/audit', (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const logs = getAuditLogs(limit);
    return res.json({ count: logs.length, logs });
  });

  // ============================================================================
  // POST /api/health/check - Trigger manual health check
  // ============================================================================

  router.post('/check', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const monitor = await getMonitor();
      await monitor.performHealthCheck();
      const status = monitor.getHealthStatus();

      res.json({
        message: 'Health check completed',
        status: status.status,
        services: status.services.map(s => ({
          name: s.name,
          status: s.status,
          latencyMs: s.latencyMs
        }))
      });
    } catch (error) {
      res.status(500).json({
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${Math.round(value * 100) / 100} ${units[unitIndex]}`;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createHealthRouter;
