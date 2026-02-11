/**
 * Vercel Connector - Project Deployment, Domain Management, Environment Variables
 * Bearer token authentication with comprehensive deployment workflow
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface VercelConfig {
  token: string;
  teamId?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework: string | null;
  devCommand: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  nodeVersion: string;
  serverlessFunctionRegion: string | null;
  createdAt: number;
  updatedAt: number;
  latestDeployment: VercelDeployment | null;
  productionDeployment: VercelDeployment | null;
  gitRepository: {
    type: string;
    repo: string;
    sourceless: boolean;
    productionBranch: string;
  } | null;
}

export interface VercelDeployment {
  id: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  readyState: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  createdAt: number;
  buildingAt: number | null;
  ready: number | null;
  source: string;
  meta: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
  };
  target: 'production' | 'staging' | null;
  alias: string[];
  creator: {
    uid: string;
    email: string;
    username: string;
  };
}

export interface VercelDomain {
  name: string;
  projectId: string;
  redirect: string | null;
  redirectStatusCode: number | null;
  gitBranch: string | null;
  updatedAt: number;
  createdAt: number;
  verified: boolean;
  verification: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
}

export interface VercelEnvVariable {
  id: string;
  key: string;
  value: string;
  type: 'system' | 'secret' | 'encrypted' | 'plain';
  target: Array<'production' | 'preview' | 'development'>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectOptions {
  name: string;
  framework?: string;
  gitRepository?: {
    repo: string;
    type: 'github' | 'gitlab' | 'bitbucket';
  };
  buildCommand?: string;
  devCommand?: string;
  installCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  environmentVariables?: Array<{
    key: string;
    value: string;
    target: Array<'production' | 'preview' | 'development'>;
    type?: 'system' | 'secret' | 'encrypted' | 'plain';
  }>;
}

export interface CreateDeploymentOptions {
  name?: string;
  project?: string;
  target?: 'production' | 'staging';
  gitSource?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    ref: string;
    repoId: string | number;
  };
  files?: Array<{
    file: string;
    data: string;
    encoding?: 'base64' | 'utf-8';
  }>;
  functions?: Record<string, {
    memory?: number;
    maxDuration?: number;
  }>;
  env?: Record<string, string>;
  build?: {
    env?: Record<string, string>;
  };
}

// ============================================================================
// VERCEL CONNECTOR CLASS
// ============================================================================

export class VercelConnector extends EventEmitter {
  private token: string;
  private teamId?: string;

  private readonly API_BASE = 'https://api.vercel.com';

  constructor(config: VercelConfig) {
    super();
    this.token = config.token;
    this.teamId = config.teamId;
  }

  private getTeamParam(): string {
    return this.teamId ? `?teamId=${this.teamId}` : '';
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: Record<string, unknown> | string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    // Add teamId to URL if present
    const url = endpoint.includes('?')
      ? `${this.API_BASE}${endpoint}${this.teamId ? `&teamId=${this.teamId}` : ''}`
      : `${this.API_BASE}${endpoint}${this.getTeamParam()}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Vercel API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ==========================================================================
  // USER OPERATIONS
  // ==========================================================================

  async getUser(): Promise<{
    id: string;
    email: string;
    name: string;
    username: string;
    avatar: string;
  }> {
    const data = await this.request<{ user: Record<string, unknown> }>('/v2/user');
    return {
      id: data.user.id as string,
      email: data.user.email as string,
      name: data.user.name as string,
      username: data.user.username as string,
      avatar: data.user.avatar as string
    };
  }

  async listTeams(): Promise<Array<{
    id: string;
    name: string;
    slug: string;
  }>> {
    const data = await this.request<{ teams: Array<Record<string, unknown>> }>('/v2/teams');
    return data.teams.map(team => ({
      id: team.id as string,
      name: team.name as string,
      slug: team.slug as string
    }));
  }

  // ==========================================================================
  // PROJECT OPERATIONS
  // ==========================================================================

  async createProject(options: CreateProjectOptions): Promise<VercelProject> {
    const data = await this.request<Record<string, unknown>>('/v10/projects', {
      method: 'POST',
      body: {
        name: options.name,
        framework: options.framework,
        gitRepository: options.gitRepository,
        buildCommand: options.buildCommand,
        devCommand: options.devCommand,
        installCommand: options.installCommand,
        outputDirectory: options.outputDirectory,
        rootDirectory: options.rootDirectory,
        environmentVariables: options.environmentVariables?.map(env => ({
          key: env.key,
          value: env.value,
          target: env.target,
          type: env.type || 'encrypted'
        }))
      }
    });

    this.emit('project_created', { projectId: data.id, name: options.name });
    return this.transformProject(data);
  }

  async getProject(projectId: string): Promise<VercelProject> {
    const data = await this.request<Record<string, unknown>>(`/v9/projects/${projectId}`);
    return this.transformProject(data);
  }

  async listProjects(options?: {
    limit?: number;
    from?: number;
    search?: string;
  }): Promise<{ projects: VercelProject[]; pagination: { count: number; next: number | null } }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.from) params.set('from', options.from.toString());
    if (options?.search) params.set('search', options.search);

    const data = await this.request<{
      projects: Array<Record<string, unknown>>;
      pagination: { count: number; next: number | null };
    }>(`/v9/projects?${params}`);

    return {
      projects: data.projects.map(p => this.transformProject(p)),
      pagination: data.pagination
    };
  }

  async updateProject(projectId: string, updates: {
    name?: string;
    framework?: string;
    buildCommand?: string;
    devCommand?: string;
    installCommand?: string;
    outputDirectory?: string;
    rootDirectory?: string;
    commandForIgnoringBuildStep?: string;
    serverlessFunctionRegion?: string;
  }): Promise<VercelProject> {
    const data = await this.request<Record<string, unknown>>(`/v9/projects/${projectId}`, {
      method: 'PATCH',
      body: updates
    });

    return this.transformProject(data);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request(`/v9/projects/${projectId}`, { method: 'DELETE' });
    this.emit('project_deleted', { projectId });
  }

  private transformProject(data: Record<string, unknown>): VercelProject {
    const gitRepo = data.link as Record<string, unknown> | null;
    const latestDeployments = data.latestDeployments as Array<Record<string, unknown>> | undefined;
    const targets = data.targets as Record<string, Record<string, unknown>> | undefined;

    return {
      id: data.id as string,
      name: data.name as string,
      accountId: data.accountId as string,
      framework: data.framework as string | null,
      devCommand: data.devCommand as string | null,
      installCommand: data.installCommand as string | null,
      buildCommand: data.buildCommand as string | null,
      outputDirectory: data.outputDirectory as string | null,
      rootDirectory: data.rootDirectory as string | null,
      nodeVersion: (data.nodeVersion as string) || '18.x',
      serverlessFunctionRegion: data.serverlessFunctionRegion as string | null,
      createdAt: data.createdAt as number,
      updatedAt: data.updatedAt as number,
      latestDeployment: latestDeployments?.[0]
        ? this.transformDeployment(latestDeployments[0])
        : null,
      productionDeployment: targets?.production
        ? this.transformDeployment(targets.production)
        : null,
      gitRepository: gitRepo ? {
        type: gitRepo.type as string,
        repo: gitRepo.repo as string,
        sourceless: (gitRepo.sourceless as boolean) ?? false,
        productionBranch: (gitRepo.productionBranch as string) || 'main'
      } : null
    };
  }

  // ==========================================================================
  // DEPLOYMENT OPERATIONS
  // ==========================================================================

  async createDeployment(options: CreateDeploymentOptions): Promise<VercelDeployment> {
    const data = await this.request<Record<string, unknown>>('/v13/deployments', {
      method: 'POST',
      body: {
        name: options.name,
        project: options.project,
        target: options.target,
        gitSource: options.gitSource,
        files: options.files,
        functions: options.functions,
        env: options.env,
        build: options.build
      }
    });

    this.emit('deployment_created', { deploymentId: data.id });
    return this.transformDeployment(data);
  }

  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    const data = await this.request<Record<string, unknown>>(`/v13/deployments/${deploymentId}`);
    return this.transformDeployment(data);
  }

  async listDeployments(options?: {
    projectId?: string;
    limit?: number;
    from?: number;
    state?: string;
    target?: 'production' | 'staging';
  }): Promise<{ deployments: VercelDeployment[]; pagination: { count: number; next: number | null } }> {
    const params = new URLSearchParams();
    if (options?.projectId) params.set('projectId', options.projectId);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.from) params.set('from', options.from.toString());
    if (options?.state) params.set('state', options.state);
    if (options?.target) params.set('target', options.target);

    const data = await this.request<{
      deployments: Array<Record<string, unknown>>;
      pagination: { count: number; next: number | null };
    }>(`/v6/deployments?${params}`);

    return {
      deployments: data.deployments.map(d => this.transformDeployment(d)),
      pagination: data.pagination
    };
  }

  async cancelDeployment(deploymentId: string): Promise<VercelDeployment> {
    const data = await this.request<Record<string, unknown>>(`/v12/deployments/${deploymentId}/cancel`, {
      method: 'PATCH'
    });

    return this.transformDeployment(data);
  }

  async getDeploymentEvents(deploymentId: string): Promise<Array<{
    type: string;
    created: number;
    payload: Record<string, unknown>;
  }>> {
    const data = await this.request<{ events: Array<Record<string, unknown>> }>(
      `/v3/deployments/${deploymentId}/events`
    );

    return data.events.map(event => ({
      type: event.type as string,
      created: event.created as number,
      payload: event.payload as Record<string, unknown>
    }));
  }

  async waitForDeployment(
    deploymentId: string,
    options?: {
      timeout?: number;
      pollInterval?: number;
    }
  ): Promise<VercelDeployment> {
    const timeout = options?.timeout || 300000; // 5 minutes default
    const pollInterval = options?.pollInterval || 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const deployment = await this.getDeployment(deploymentId);

      if (deployment.readyState === 'READY') {
        this.emit('deployment_ready', { deploymentId, url: deployment.url });
        return deployment;
      }

      if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
        this.emit('deployment_failed', { deploymentId, state: deployment.readyState });
        throw new Error(`Deployment ${deploymentId} failed with state: ${deployment.readyState}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Deployment ${deploymentId} timed out after ${timeout}ms`);
  }

  private transformDeployment(data: Record<string, unknown>): VercelDeployment {
    const meta = data.meta as Record<string, unknown> || {};
    const creator = data.creator as Record<string, unknown>;

    return {
      id: data.id as string || data.uid as string,
      name: data.name as string,
      url: data.url as string,
      state: data.state as VercelDeployment['state'],
      readyState: (data.readyState || data.state) as VercelDeployment['readyState'],
      createdAt: data.createdAt as number || data.created as number,
      buildingAt: data.buildingAt as number | null,
      ready: data.ready as number | null,
      source: data.source as string,
      meta: {
        githubCommitRef: meta.githubCommitRef as string | undefined,
        githubCommitSha: meta.githubCommitSha as string | undefined,
        githubCommitMessage: meta.githubCommitMessage as string | undefined,
        githubCommitAuthorName: meta.githubCommitAuthorName as string | undefined
      },
      target: data.target as 'production' | 'staging' | null,
      alias: (data.alias as string[]) || [],
      creator: {
        uid: creator?.uid as string || '',
        email: creator?.email as string || '',
        username: creator?.username as string || ''
      }
    };
  }

  // ==========================================================================
  // DOMAIN OPERATIONS
  // ==========================================================================

  async addDomain(projectId: string, domain: string, options?: {
    redirect?: string;
    redirectStatusCode?: 301 | 302 | 307 | 308;
    gitBranch?: string;
  }): Promise<VercelDomain> {
    const data = await this.request<Record<string, unknown>>(`/v10/projects/${projectId}/domains`, {
      method: 'POST',
      body: {
        name: domain,
        redirect: options?.redirect,
        redirectStatusCode: options?.redirectStatusCode,
        gitBranch: options?.gitBranch
      }
    });

    this.emit('domain_added', { projectId, domain });
    return this.transformDomain(data);
  }

  async getDomain(projectId: string, domain: string): Promise<VercelDomain> {
    const data = await this.request<Record<string, unknown>>(`/v9/projects/${projectId}/domains/${domain}`);
    return this.transformDomain(data);
  }

  async listDomains(projectId: string): Promise<{ domains: VercelDomain[] }> {
    const data = await this.request<{ domains: Array<Record<string, unknown>> }>(
      `/v9/projects/${projectId}/domains`
    );

    return {
      domains: data.domains.map(d => this.transformDomain(d))
    };
  }

  async removeDomain(projectId: string, domain: string): Promise<void> {
    await this.request(`/v9/projects/${projectId}/domains/${domain}`, {
      method: 'DELETE'
    });

    this.emit('domain_removed', { projectId, domain });
  }

  async verifyDomain(projectId: string, domain: string): Promise<VercelDomain> {
    const data = await this.request<Record<string, unknown>>(
      `/v9/projects/${projectId}/domains/${domain}/verify`,
      { method: 'POST' }
    );

    if ((data as { verified?: boolean }).verified) {
      this.emit('domain_verified', { projectId, domain });
    }

    return this.transformDomain(data);
  }

  private transformDomain(data: Record<string, unknown>): VercelDomain {
    const verification = data.verification as Array<Record<string, unknown>> || [];

    return {
      name: data.name as string,
      projectId: data.projectId as string,
      redirect: data.redirect as string | null,
      redirectStatusCode: data.redirectStatusCode as number | null,
      gitBranch: data.gitBranch as string | null,
      updatedAt: data.updatedAt as number,
      createdAt: data.createdAt as number,
      verified: data.verified as boolean,
      verification: verification.map(v => ({
        type: v.type as string,
        domain: v.domain as string,
        value: v.value as string,
        reason: v.reason as string
      }))
    };
  }

  // ==========================================================================
  // ENVIRONMENT VARIABLE OPERATIONS
  // ==========================================================================

  async createEnvVariable(projectId: string, options: {
    key: string;
    value: string;
    target: Array<'production' | 'preview' | 'development'>;
    type?: 'system' | 'secret' | 'encrypted' | 'plain';
    gitBranch?: string;
  }): Promise<VercelEnvVariable> {
    const data = await this.request<Record<string, unknown>>(`/v10/projects/${projectId}/env`, {
      method: 'POST',
      body: {
        key: options.key,
        value: options.value,
        target: options.target,
        type: options.type || 'encrypted',
        gitBranch: options.gitBranch
      }
    });

    this.emit('env_created', { projectId, key: options.key });
    return this.transformEnvVariable(data);
  }

  async listEnvVariables(projectId: string, options?: {
    gitBranch?: string;
    decrypt?: boolean;
  }): Promise<{ envs: VercelEnvVariable[] }> {
    const params = new URLSearchParams();
    if (options?.gitBranch) params.set('gitBranch', options.gitBranch);
    if (options?.decrypt) params.set('decrypt', 'true');

    const data = await this.request<{ envs: Array<Record<string, unknown>> }>(
      `/v9/projects/${projectId}/env?${params}`
    );

    return {
      envs: data.envs.map(e => this.transformEnvVariable(e))
    };
  }

  async getEnvVariable(projectId: string, envId: string): Promise<VercelEnvVariable> {
    const data = await this.request<Record<string, unknown>>(`/v1/projects/${projectId}/env/${envId}`);
    return this.transformEnvVariable(data);
  }

  async updateEnvVariable(projectId: string, envId: string, updates: {
    key?: string;
    value?: string;
    target?: Array<'production' | 'preview' | 'development'>;
    type?: 'system' | 'secret' | 'encrypted' | 'plain';
  }): Promise<VercelEnvVariable> {
    const data = await this.request<Record<string, unknown>>(`/v9/projects/${projectId}/env/${envId}`, {
      method: 'PATCH',
      body: updates
    });

    return this.transformEnvVariable(data);
  }

  async deleteEnvVariable(projectId: string, envId: string): Promise<void> {
    await this.request(`/v9/projects/${projectId}/env/${envId}`, {
      method: 'DELETE'
    });

    this.emit('env_deleted', { projectId, envId });
  }

  async bulkCreateEnvVariables(projectId: string, envVars: Array<{
    key: string;
    value: string;
    target: Array<'production' | 'preview' | 'development'>;
    type?: 'system' | 'secret' | 'encrypted' | 'plain';
  }>): Promise<{ created: VercelEnvVariable[] }> {
    // Create all env vars in parallel
    const results = await Promise.all(
      envVars.map(env => this.createEnvVariable(projectId, env))
    );

    return { created: results };
  }

  private transformEnvVariable(data: Record<string, unknown>): VercelEnvVariable {
    return {
      id: data.id as string,
      key: data.key as string,
      value: data.value as string,
      type: data.type as 'system' | 'secret' | 'encrypted' | 'plain',
      target: data.target as Array<'production' | 'preview' | 'development'>,
      createdAt: data.createdAt as number,
      updatedAt: data.updatedAt as number
    };
  }

  // ==========================================================================
  // GIT INTEGRATION
  // ==========================================================================

  async getGitRepository(projectId: string): Promise<{
    type: string;
    repo: string;
    sourceless: boolean;
    productionBranch: string;
  } | null> {
    const project = await this.getProject(projectId);
    return project.gitRepository;
  }

  async configureGitRepository(projectId: string, options: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string;
    productionBranch?: string;
  }): Promise<void> {
    await this.request(`/v9/projects/${projectId}/link`, {
      method: 'POST',
      body: {
        type: options.type,
        repo: options.repo,
        productionBranch: options.productionBranch || 'main'
      }
    });

    this.emit('git_configured', { projectId, repo: options.repo });
  }

  async removeGitRepository(projectId: string): Promise<void> {
    await this.request(`/v9/projects/${projectId}/link`, {
      method: 'DELETE'
    });

    this.emit('git_removed', { projectId });
  }

  // ==========================================================================
  // LOGS & MONITORING
  // ==========================================================================

  async getDeploymentBuildLogs(deploymentId: string): Promise<Array<{
    id: string;
    type: string;
    text: string;
    created: number;
  }>> {
    const data = await this.request<{ logs: Array<Record<string, unknown>> }>(
      `/v2/deployments/${deploymentId}/events`
    );

    return data.logs.map(log => ({
      id: log.id as string,
      type: log.type as string,
      text: log.text as string,
      created: log.created as number
    }));
  }

  async getProjectFunctions(projectId: string, deploymentId: string): Promise<Array<{
    name: string;
    path: string;
    runtime: string;
    memory: number;
    timeout: number;
  }>> {
    const data = await this.request<{ functions: Array<Record<string, unknown>> }>(
      `/v12/deployments/${deploymentId}/functions`
    );

    return data.functions.map(fn => ({
      name: fn.name as string,
      path: fn.path as string,
      runtime: fn.runtime as string,
      memory: fn.memory as number,
      timeout: fn.timeout as number
    }));
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  async createWebhook(projectId: string, options: {
    url: string;
    events: string[];
  }): Promise<{ id: string; url: string; events: string[] }> {
    const data = await this.request<Record<string, unknown>>(`/v1/webhooks`, {
      method: 'POST',
      body: {
        url: options.url,
        events: options.events,
        projectIds: [projectId]
      }
    });

    return {
      id: data.id as string,
      url: data.url as string,
      events: data.events as string[]
    };
  }

  async listWebhooks(): Promise<Array<{
    id: string;
    url: string;
    events: string[];
    projectIds: string[];
  }>> {
    const data = await this.request<Array<Record<string, unknown>>>('/v1/webhooks');

    return data.map(webhook => ({
      id: webhook.id as string,
      url: webhook.url as string,
      events: webhook.events as string[],
      projectIds: webhook.projectIds as string[]
    }));
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request(`/v1/webhooks/${webhookId}`, { method: 'DELETE' });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createVercelConnector(config: VercelConfig): VercelConnector {
  return new VercelConnector(config);
}

export default VercelConnector;
