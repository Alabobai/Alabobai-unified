/**
 * Alabobai Companies API Routes
 * Endpoints for creating and managing AI-powered company infrastructure
 * Integrates with CompanyBuilderOrchestrator for full company setup automation
 */

import { Router, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { EventEmitter } from 'events';

import {
  CompanyBuilderOrchestrator,
  createCompanyBuilderOrchestrator,
  CompanyConfig,
  CredentialStore,
  SetupProgress,
  CompanySetupResult,
  IntegrationResult
} from '../../integrations/CompanyBuilderOrchestrator.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CompanyTypeSchema = z.enum(['saas', 'ecommerce', 'app', 'agency', 'content', 'service']);
const TargetMarketSchema = z.enum(['B2B', 'B2C', 'Both']);

const ExistingAssetsSchema = z.object({
  domain: z.string().optional(),
  logo: z.string().optional(),
  brandGuide: z.string().optional()
}).optional();

const CreateCompanySchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100, 'Company name too long'),
  companyType: CompanyTypeSchema,
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description too long'),
  founderEmail: z.string().email('Invalid email format'),
  industry: z.string().optional(),
  targetMarket: TargetMarketSchema.optional(),
  existingAssets: ExistingAssetsSchema
});

// ============================================================================
// TYPES
// ============================================================================

export interface CompaniesRouterConfig {
  credentialStore?: CredentialStore;
  orchestrator?: CompanyBuilderOrchestrator;
  enableWebSocket?: boolean;
}

export interface CompanyCreationRequest {
  companyName: string;
  companyType: z.infer<typeof CompanyTypeSchema>;
  description: string;
  founderEmail: string;
  industry?: string;
  targetMarket?: z.infer<typeof TargetMarketSchema>;
  existingAssets?: {
    domain?: string;
    logo?: string;
    brandGuide?: string;
  };
}

export interface StoredCompany {
  id: string;
  request: CompanyCreationRequest;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: SetupProgress | null;
  result: CompanySetupResult | null;
  assets: GeneratedAssets | null;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
}

export interface GeneratedAssets {
  logo?: {
    url: string;
    variants: { size: string; url: string }[];
    generatedAt: Date;
  };
  brandGuide?: {
    colors: { primary: string; secondary: string; accent: string };
    fonts: { heading: string; body: string };
    logoUsage: string;
    generatedAt: Date;
  };
  socialAssets?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    generatedAt: Date;
  };
  websiteContent?: {
    tagline: string;
    headline: string;
    description: string;
    features: string[];
    generatedAt: Date;
  };
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

class InMemoryCredentialStore implements CredentialStore {
  private credentials: Map<string, Record<string, unknown>> = new Map();

  async get(service: string): Promise<Record<string, unknown> | null> {
    return this.credentials.get(service) || null;
  }

  async set(service: string, credentials: Record<string, unknown>): Promise<void> {
    this.credentials.set(service, credentials);
  }

  async delete(service: string): Promise<void> {
    this.credentials.delete(service);
  }
}

class CompanyStore {
  private companies: Map<string, StoredCompany> = new Map();
  private emailIndex: Map<string, Set<string>> = new Map();

  create(request: CompanyCreationRequest, userId?: string): StoredCompany {
    const id = this.generateId(request.companyName);
    const now = new Date();

    const company: StoredCompany = {
      id,
      request,
      status: 'pending',
      progress: null,
      result: null,
      assets: null,
      createdAt: now,
      updatedAt: now,
      userId
    };

    this.companies.set(id, company);

    // Index by email
    if (!this.emailIndex.has(request.founderEmail)) {
      this.emailIndex.set(request.founderEmail, new Set());
    }
    this.emailIndex.get(request.founderEmail)!.add(id);

    return company;
  }

  get(id: string): StoredCompany | undefined {
    return this.companies.get(id);
  }

  getByEmail(email: string): StoredCompany[] {
    const ids = this.emailIndex.get(email);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.companies.get(id))
      .filter((c): c is StoredCompany => c !== undefined);
  }

  update(id: string, updates: Partial<StoredCompany>): StoredCompany | null {
    const company = this.companies.get(id);
    if (!company) return null;

    Object.assign(company, updates, { updatedAt: new Date() });
    return company;
  }

  updateProgress(id: string, progress: SetupProgress): void {
    const company = this.companies.get(id);
    if (company) {
      company.progress = progress;
      company.status = progress.status === 'completed' ? 'completed' :
                       progress.status === 'failed' ? 'failed' : 'in_progress';
      company.updatedAt = new Date();
    }
  }

  updateResult(id: string, result: CompanySetupResult): void {
    const company = this.companies.get(id);
    if (company) {
      company.result = result;
      company.status = result.success ? 'completed' : 'failed';
      company.updatedAt = new Date();
    }
  }

  updateAssets(id: string, assets: Partial<GeneratedAssets>): void {
    const company = this.companies.get(id);
    if (company) {
      company.assets = { ...company.assets, ...assets } as GeneratedAssets;
      company.updatedAt = new Date();
    }
  }

  list(options: { limit?: number; offset?: number; status?: string } = {}): StoredCompany[] {
    let companies = Array.from(this.companies.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options.status) {
      companies = companies.filter(c => c.status === options.status);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 20;

    return companies.slice(offset, offset + limit);
  }

  private generateId(companyName: string): string {
    const slug = companyName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${slug}-${timestamp}${random}`;
  }
}

// ============================================================================
// WEBSOCKET MANAGER FOR PROGRESS STREAMING
// ============================================================================

class CompanyWebSocketManager extends EventEmitter {
  private wss?: WebSocketServer;
  private connections: Map<string, Set<WebSocket>> = new Map();

  attachToServer(server: HTTPServer, path: string = '/ws/companies'): WebSocketServer {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = new URL(req.url || '', 'http://localhost');
      const companyId = url.searchParams.get('companyId');

      if (companyId) {
        this.subscribe(companyId, ws);

        ws.on('close', () => {
          this.unsubscribe(companyId, ws);
        });

        // Send acknowledgment
        ws.send(JSON.stringify({
          type: 'connected',
          companyId,
          timestamp: new Date().toISOString()
        }));
      } else {
        ws.close(4000, 'companyId query parameter required');
      }
    });

    console.log(`[Companies WebSocket] Attached at ${path}`);
    return this.wss;
  }

  subscribe(companyId: string, ws: WebSocket): void {
    if (!this.connections.has(companyId)) {
      this.connections.set(companyId, new Set());
    }
    this.connections.get(companyId)!.add(ws);
  }

  unsubscribe(companyId: string, ws: WebSocket): void {
    this.connections.get(companyId)?.delete(ws);
    if (this.connections.get(companyId)?.size === 0) {
      this.connections.delete(companyId);
    }
  }

  broadcast(companyId: string, event: string, data: unknown): void {
    const clients = this.connections.get(companyId);
    if (!clients) return;

    const message = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString()
    });

    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// ============================================================================
// FEATURE FLAGS FOR COMPANY TYPE
// ============================================================================

function getDefaultFeatures(companyType: z.infer<typeof CompanyTypeSchema>): CompanyConfig['features'] {
  const baseFeatures = {
    payments: true,
    email: true,
    crm: true,
    scheduling: true,
    analytics: true,
    projectManagement: true,
    documentation: true,
    social: true
  };

  switch (companyType) {
    case 'saas':
      return { ...baseFeatures, payments: true, analytics: true };
    case 'ecommerce':
      return { ...baseFeatures, payments: true, crm: true };
    case 'app':
      return { ...baseFeatures, analytics: true, social: true };
    case 'agency':
      return { ...baseFeatures, projectManagement: true, scheduling: true };
    case 'content':
      return { ...baseFeatures, social: true, analytics: true };
    case 'service':
      return { ...baseFeatures, scheduling: true, crm: true };
    default:
      return baseFeatures;
  }
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createCompaniesRouter(config: CompaniesRouterConfig = {}): Router {
  const router = Router();
  const credentialStore = config.credentialStore || new InMemoryCredentialStore();
  const orchestrator = config.orchestrator || createCompanyBuilderOrchestrator(credentialStore);
  const companyStore = new CompanyStore();
  const wsManager = config.enableWebSocket !== false ? new CompanyWebSocketManager() : null;

  // ============================================================================
  // POST /api/companies/create - Create a new company
  // ============================================================================

  router.post('/create', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = CreateCompanySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        });
      }

      const request = validation.data as CompanyCreationRequest;

      // Create company record
      const userId = (req as Request & { user?: { id: string } }).user?.id;
      const company = companyStore.create(request, userId);

      // Generate domain from company name if not provided
      const domain = request.existingAssets?.domain ||
        `${request.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      // Build CompanyConfig from request
      const companyConfig: CompanyConfig = {
        companyName: request.companyName,
        domain,
        industry: request.industry || 'Technology',
        description: request.description,
        owner: {
          name: request.companyName,
          email: request.founderEmail
        },
        features: getDefaultFeatures(request.companyType)
      };

      // Start company creation in background
      companyStore.update(company.id, { status: 'in_progress' });

      // Set up progress listener
      const progressHandler = (progress: SetupProgress) => {
        companyStore.updateProgress(company.id, progress);
        wsManager?.broadcast(company.id, 'progress', progress);
      };

      orchestrator.on('progress', progressHandler);

      // Set up asset generation listeners
      orchestrator.on('asset_generated', (data: { companyId: string; asset: string; message: string }) => {
        if (data.companyId === company.id) {
          wsManager?.broadcast(company.id, 'asset_generated', data);
        }
      });

      orchestrator.on('asset_generation_failed', (data: { companyId?: string; error: string }) => {
        if (data.companyId === company.id) {
          wsManager?.broadcast(company.id, 'asset_generation_failed', data);
        }
      });

      // Start setup process (async, don't await)
      orchestrator.setupCompany(companyConfig)
        .then(result => {
          companyStore.updateResult(company.id, result);
          wsManager?.broadcast(company.id, 'completed', result);
          orchestrator.off('progress', progressHandler);
        })
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          companyStore.update(company.id, {
            status: 'failed',
            progress: {
              phase: 1,
              phaseName: 'Error',
              step: 'Failed',
              status: 'failed',
              message: errorMessage,
              progress: 0,
              requiresUserAction: false,
              error: errorMessage
            }
          });
          wsManager?.broadcast(company.id, 'error', { error: errorMessage });
          orchestrator.off('progress', progressHandler);
        });

      // Return immediately with company ID
      res.status(202).json({
        success: true,
        data: {
          companyId: company.id,
          status: 'in_progress',
          message: 'Company creation started. Connect to WebSocket for real-time progress.',
          websocketUrl: wsManager ? `/ws/companies?companyId=${company.id}` : null,
          statusUrl: `/api/companies/${company.id}`
        }
      });

    } catch (error) {
      console.error('[Companies API] Create error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create company',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  // ============================================================================
  // GET /api/companies/:id - Get company status
  // ============================================================================

  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const company = companyStore.get(id);

      if (!company) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Company not found'
          }
        });
      }

      res.json({
        success: true,
        data: {
          id: company.id,
          companyName: company.request.companyName,
          companyType: company.request.companyType,
          status: company.status,
          progress: company.progress,
          result: company.result ? {
            success: company.result.success,
            companyId: company.result.companyId,
            urls: company.result.urls,
            pendingSteps: company.result.pendingSteps,
            integrations: company.result.integrations.map(i => ({
              service: i.service,
              success: i.success,
              requiresManualStep: i.requiresManualStep,
              error: i.error
            }))
          } : null,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt
        }
      });

    } catch (error) {
      console.error('[Companies API] Get error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get company status'
        }
      });
    }
  });

  // ============================================================================
  // GET /api/companies/:id/assets - Get generated assets
  // ============================================================================

  router.get('/:id/assets', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const company = companyStore.get(id);

      if (!company) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Company not found'
          }
        });
      }

      // Compile all assets from the company result
      const assets: Record<string, unknown> = {};

      // Add URLs as assets
      if (company.result?.urls) {
        assets.urls = company.result.urls;
      }

      // Add domain info
      if (company.result?.domain) {
        assets.domain = company.result.domain;
      }

      // Add credentials
      if (company.result?.credentials) {
        assets.credentials = company.result.credentials;
      }

      // Add generated assets
      if (company.assets) {
        assets.generated = company.assets;
      }

      // Add existing assets from request
      if (company.request.existingAssets) {
        assets.existing = company.request.existingAssets;
      }

      // Add integration-specific assets
      const integrationAssets: Record<string, unknown> = {};
      if (company.result?.integrations) {
        for (const integration of company.result.integrations) {
          if (integration.success && integration.data) {
            integrationAssets[integration.service] = integration.data;
          }
        }
      }
      if (Object.keys(integrationAssets).length > 0) {
        assets.integrations = integrationAssets;
      }

      res.json({
        success: true,
        data: {
          companyId: company.id,
          companyName: company.request.companyName,
          status: company.status,
          assets
        }
      });

    } catch (error) {
      console.error('[Companies API] Get assets error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get company assets'
        }
      });
    }
  });

  // ============================================================================
  // GET /api/companies/:id/integrations - Get integration status
  // ============================================================================

  router.get('/:id/integrations', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const company = companyStore.get(id);

      if (!company) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Company not found'
          }
        });
      }

      const integrations = company.result?.integrations || [];

      res.json({
        success: true,
        data: {
          companyId: company.id,
          status: company.status,
          integrations: integrations.map(i => ({
            service: i.service,
            success: i.success,
            data: i.data,
            error: i.error,
            requiresManualStep: i.requiresManualStep,
            manualStepInstructions: i.manualStepInstructions
          })),
          summary: {
            total: integrations.length,
            successful: integrations.filter(i => i.success).length,
            failed: integrations.filter(i => !i.success && !i.requiresManualStep).length,
            pendingManual: integrations.filter(i => i.requiresManualStep).length
          }
        }
      });

    } catch (error) {
      console.error('[Companies API] Get integrations error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get integration status'
        }
      });
    }
  });

  // ============================================================================
  // GET /api/companies - List all companies (for authenticated user)
  // ============================================================================

  router.get('/', (req: Request, res: Response) => {
    try {
      const { status, limit, offset } = req.query;

      const companies = companyStore.list({
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0
      });

      res.json({
        success: true,
        data: {
          companies: companies.map(c => ({
            id: c.id,
            companyName: c.request.companyName,
            companyType: c.request.companyType,
            status: c.status,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
          })),
          count: companies.length
        }
      });

    } catch (error) {
      console.error('[Companies API] List error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list companies'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/companies/:id/credentials - Add credentials for integrations
  // ============================================================================

  router.post('/:id/credentials', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { service, credentials } = req.body;

      if (!service || typeof service !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'service is required'
          }
        });
      }

      if (!credentials || typeof credentials !== 'object') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'credentials object is required'
          }
        });
      }

      const company = companyStore.get(id);
      if (!company) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Company not found'
          }
        });
      }

      // Store credentials
      await credentialStore.set(service, credentials);

      res.json({
        success: true,
        data: {
          message: `Credentials for ${service} stored successfully`,
          service
        }
      });

    } catch (error) {
      console.error('[Companies API] Store credentials error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to store credentials'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/companies/:id/retry - Retry failed integrations
  // ============================================================================

  router.post('/:id/retry', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { services } = req.body;

      const company = companyStore.get(id);
      if (!company) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Company not found'
          }
        });
      }

      if (company.status === 'in_progress') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Company setup is already in progress'
          }
        });
      }

      // Restart setup
      companyStore.update(id, { status: 'in_progress' });

      const domain = company.request.existingAssets?.domain ||
        `${company.request.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      const companyConfig: CompanyConfig = {
        companyName: company.request.companyName,
        domain,
        industry: company.request.industry || 'Technology',
        description: company.request.description,
        owner: {
          name: company.request.companyName,
          email: company.request.founderEmail
        },
        features: getDefaultFeatures(company.request.companyType)
      };

      // Start retry in background
      orchestrator.setupCompany(companyConfig)
        .then(result => {
          companyStore.updateResult(id, result);
          wsManager?.broadcast(id, 'completed', result);
        })
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          companyStore.update(id, { status: 'failed' });
          wsManager?.broadcast(id, 'error', { error: errorMessage });
        });

      res.status(202).json({
        success: true,
        data: {
          companyId: id,
          status: 'in_progress',
          message: 'Retry started'
        }
      });

    } catch (error) {
      console.error('[Companies API] Retry error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retry company setup'
        }
      });
    }
  });

  // ============================================================================
  // GET /api/companies/types - Get available company types
  // ============================================================================

  router.get('/meta/types', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        types: [
          { value: 'saas', label: 'SaaS', description: 'Software as a Service business' },
          { value: 'ecommerce', label: 'E-commerce', description: 'Online retail business' },
          { value: 'app', label: 'App', description: 'Mobile or web application' },
          { value: 'agency', label: 'Agency', description: 'Service agency (marketing, design, etc.)' },
          { value: 'content', label: 'Content', description: 'Content creation and media' },
          { value: 'service', label: 'Service', description: 'Professional services business' }
        ],
        targetMarkets: [
          { value: 'B2B', label: 'B2B', description: 'Business to Business' },
          { value: 'B2C', label: 'B2C', description: 'Business to Consumer' },
          { value: 'Both', label: 'Both', description: 'Both B2B and B2C' }
        ]
      }
    });
  });

  return router;
}

// ============================================================================
// WEBSOCKET INTEGRATION HELPER
// ============================================================================

export function attachCompaniesWebSocket(
  server: HTTPServer,
  path: string = '/ws/companies'
): WebSocketServer {
  const wsManager = new CompanyWebSocketManager();
  return wsManager.attachToServer(server, path);
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default createCompaniesRouter;
