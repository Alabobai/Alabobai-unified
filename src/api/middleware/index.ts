/**
 * Alabobai API Middleware
 * Authentication, rate limiting, logging, and request validation
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export interface AuthConfig {
  apiKeyHeader?: string;
  validateApiKey?: (key: string) => Promise<boolean> | boolean;
  skipPaths?: string[];
}

export type ApiRole = 'viewer' | 'operator' | 'admin';

export interface RequestLogEntry {
  id: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  duration?: number;
  statusCode?: number;
  error?: string;
}

export interface AuditLogEntry {
  requestId: string;
  actorRole: ApiRole | 'unknown';
  method: string;
  path: string;
  statusCode: number;
  timestamp: Date;
  ip: string;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      message: config.message || 'Too many requests, please try again later.',
      skipFailedRequests: config.skipFailedRequests ?? false,
      keyGenerator: config.keyGenerator || ((req) => req.ip || 'unknown')
    };

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    this.entries.forEach((entry, key) => {
      if (entry.resetTime < now) {
        this.entries.delete(key);
      }
    });
  }

  isAllowed(key: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    let entry = this.entries.get(key);

    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs
      };
      this.entries.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    const allowed = entry.count <= this.config.maxRequests;

    return { allowed, remaining, resetTime: entry.resetTime };
  }

  getMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.config.keyGenerator(req);
      const { allowed, remaining, resetTime } = this.isAllowed(key);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      if (!allowed) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: this.config.message,
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
        });
        return;
      }

      next();
    };
  }
}

export function createRateLimiter(config: RateLimitConfig): RequestHandler {
  const limiter = new RateLimiter(config);
  return limiter.getMiddleware();
}

// ============================================================================
// API KEY AUTHENTICATION
// ============================================================================

export function createAuthMiddleware(config: AuthConfig = {}): RequestHandler {
  const {
    apiKeyHeader = 'X-API-Key',
    validateApiKey = () => true,
    skipPaths = ['/api/health', '/api/docs']
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip authentication for certain paths
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const apiKey = req.headers[apiKeyHeader.toLowerCase()] as string;

    if (!apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: `Missing ${apiKeyHeader} header`
      });
    }

    try {
      const isValid = await validateApiKey(apiKey);

      if (!isValid) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key'
        });
      }

      // Attach API key to request for downstream use
      (req as Request & { apiKey?: string }).apiKey = apiKey;

      next();
    } catch (error) {
      console.error('[Auth Middleware] Validation error:', error);
      res.status(500).json({
        error: 'Authentication error',
        message: 'Failed to validate API key'
      });
    }
  };
}

export function createRoleAuthMiddleware(
  requiredRole: ApiRole,
  keys: { admin?: string; operator?: string; viewer?: string },
  apiKeyHeader: string = 'X-API-Key'
): RequestHandler {
  const rank: Record<ApiRole, number> = { viewer: 1, operator: 2, admin: 3 };

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers[apiKeyHeader.toLowerCase()] as string | undefined;

    // Dev-open mode if no keys configured
    if (!keys.admin && !keys.operator && !keys.viewer && process.env.NODE_ENV !== 'production') {
      return next();
    }

    if (!key) {
      return res.status(401).json({ error: 'Unauthorized', message: `Missing ${apiKeyHeader} header` });
    }

    let role: ApiRole | null = null;
    if (keys.admin && key === keys.admin) role = 'admin';
    else if (keys.operator && key === keys.operator) role = 'operator';
    else if (keys.viewer && key === keys.viewer) role = 'viewer';

    if (!role) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
    }

    if (rank[role] < rank[requiredRole]) {
      return res.status(403).json({ error: 'Forbidden', message: `Requires ${requiredRole} role` });
    }

    (req as Request & { apiRole?: ApiRole }).apiRole = role;
    next();
  };
}

// ============================================================================
// REQUEST LOGGING
// ============================================================================

const requestLogs: RequestLogEntry[] = [];
const auditLogs: AuditLogEntry[] = [];
const MAX_LOGS = 10000;

export function createRequestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = uuid();
    const startTime = Date.now();

    // Attach request ID to request object
    (req as Request & { requestId?: string }).requestId = requestId;

    // Set request ID header
    res.setHeader('X-Request-ID', requestId);

    const logEntry: RequestLogEntry = {
      id: requestId,
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      timestamp: new Date()
    };

    // Log on response finish
    res.on('finish', () => {
      logEntry.duration = Date.now() - startTime;
      logEntry.statusCode = res.statusCode;

      // Store log
      requestLogs.push(logEntry);

      // Structured audit logs for state-changing API actions
      if (
        req.path.startsWith('/api') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      ) {
        const actorRole = ((req as Request & { apiRole?: ApiRole }).apiRole || 'unknown') as ApiRole | 'unknown';
        auditLogs.push({
          requestId,
          actorRole,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          timestamp: new Date(),
          ip: logEntry.ip,
        });
      }

      // Trim old logs
      if (requestLogs.length > MAX_LOGS) {
        requestLogs.splice(0, requestLogs.length - MAX_LOGS);
      }
      if (auditLogs.length > MAX_LOGS) {
        auditLogs.splice(0, auditLogs.length - MAX_LOGS);
      }

      // Console log (structured in production)
      if (process.env.NODE_ENV === 'production') {
        console.log(JSON.stringify({
          type: 'http_request',
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: logEntry.duration,
          ip: logEntry.ip,
          userAgent: logEntry.userAgent,
          timestamp: logEntry.timestamp.toISOString(),
        }));
      } else {
        const status = res.statusCode >= 400 ? `[${res.statusCode}]` : res.statusCode;
        console.log(`[API] ${req.method} ${req.path} ${status} ${logEntry.duration}ms (${requestId})`);
      }
    });

    next();
  };
}

export function getRequestLogs(limit: number = 100): RequestLogEntry[] {
  return requestLogs.slice(-limit).reverse();
}

export function getAuditLogs(limit: number = 100): AuditLogEntry[] {
  return auditLogs.slice(-limit).reverse();
}

// ============================================================================
// ERROR HANDLER
// ============================================================================

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function createErrorHandler(): (err: ApiError, req: Request, res: Response, next: NextFunction) => void {
  return (err: ApiError, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const requestId = (req as Request & { requestId?: string }).requestId;

    // Log error
    console.error(`[API Error] ${requestId}:`, err);

    // Update log entry if exists
    const logEntry = requestLogs.find(l => l.id === requestId);
    if (logEntry) {
      logEntry.error = err.message;
    }

    // Send error response
    res.status(statusCode).json({
      error: err.name || 'Error',
      message: err.message || 'An unexpected error occurred',
      code: err.code,
      requestId,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  };
}

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

export interface CorsConfig {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}

export function createCorsMiddleware(config: CorsConfig = {}): RequestHandler {
  const {
    allowedOrigins = ['*'],
    allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    allowCredentials = true,
    maxAge = 86400
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || '*';

    // Check if origin is allowed
    const isAllowed = allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
    }

    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', maxAge.toString());

    if (allowCredentials && !allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

export function validateContentType(allowedTypes: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const contentType = req.headers['content-type'] || '';
    const isValid = allowedTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isValid && Object.keys(req.body || {}).length > 0) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`
      });
    }

    next();
  };
}

// ============================================================================
// SESSION EXTRACTION
// ============================================================================

export function extractSession(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract session ID from various sources
    const sessionId =
      req.headers['x-session-id'] as string ||
      req.query.sessionId as string ||
      req.body?.sessionId ||
      uuid();

    // Extract user ID
    const userId =
      req.headers['x-user-id'] as string ||
      req.query.userId as string ||
      req.body?.userId ||
      'anonymous';

    // Attach to request
    (req as Request & { sessionId?: string; userId?: string }).sessionId = sessionId;
    (req as Request & { sessionId?: string; userId?: string }).userId = userId;

    next();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createRateLimiter,
  createAuthMiddleware,
  createRoleAuthMiddleware,
  createRequestLogger,
  createErrorHandler,
  createCorsMiddleware,
  validateContentType,
  extractSession,
  getRequestLogs,
  getAuditLogs
};
