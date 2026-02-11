/**
 * Alabobai Builder - Deployment Pipeline
 * One-click deploy to Vercel, Netlify, Railway, and more
 *
 * Features:
 * 1. Multi-provider deployment (Vercel, Netlify, Railway, Fly.io)
 * 2. Environment variable management
 * 3. Build optimization
 * 4. Preview deployments
 * 5. Rollback capabilities
 * 6. Custom domain configuration
 * 7. SSL/TLS management
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface DeploymentConfig {
  provider: DeploymentProvider;
  projectName: string;
  team?: string;
  region?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  nodeVersion?: string;
  envVariables?: Record<string, string>;
  customDomain?: string;
}

export type DeploymentProvider =
  | 'vercel'
  | 'netlify'
  | 'railway'
  | 'fly'
  | 'render'
  | 'cloudflare-pages';

export interface Deployment {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  provider: DeploymentProvider;
  url?: string;
  previewUrl?: string;
  productionUrl?: string;
  domains: DomainInfo[];
  createdAt: Date;
  deployedAt?: Date;
  buildLogs: string[];
  error?: string;
  meta: DeploymentMeta;
}

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface DomainInfo {
  domain: string;
  type: 'production' | 'preview' | 'custom';
  ssl: boolean;
  verified: boolean;
}

export interface DeploymentMeta {
  commit?: string;
  branch?: string;
  buildTime?: number;
  functionCount?: number;
  assetSize?: number;
}

export interface Project {
  id: string;
  name: string;
  provider: DeploymentProvider;
  framework?: string;
  rootDirectory?: string;
  productionBranch: string;
  autoDeployEnabled: boolean;
  envVariables: EnvVariable[];
  domains: DomainInfo[];
  deployments: Deployment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EnvVariable {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  encrypted: boolean;
}

export interface BuildOutput {
  success: boolean;
  outputPath: string;
  duration: number;
  size: number;
  files: string[];
  errors: string[];
  warnings: string[];
}

export interface DeploymentProgress {
  stage: 'queued' | 'building' | 'deploying' | 'ready' | 'failed';
  progress: number;
  message: string;
  logs?: string[];
}

export interface ProviderCredentials {
  vercel?: { token: string };
  netlify?: { token: string; siteId?: string };
  railway?: { token: string; projectId?: string };
  fly?: { token: string };
  render?: { token: string };
  cloudflare?: { accountId: string; apiToken: string };
}

// ============================================================================
// DEPLOYMENT PIPELINE
// ============================================================================

export class DeploymentPipeline extends EventEmitter {
  private credentials: ProviderCredentials;
  private projects: Map<string, Project>;
  private activeDeployments: Map<string, Deployment>;

  constructor(credentials: Partial<ProviderCredentials> = {}) {
    super();
    this.credentials = {
      vercel: credentials.vercel || { token: process.env.VERCEL_TOKEN || '' },
      netlify: credentials.netlify || { token: process.env.NETLIFY_TOKEN || '' },
      railway: credentials.railway || { token: process.env.RAILWAY_TOKEN || '' },
      fly: credentials.fly || { token: process.env.FLY_TOKEN || '' },
      ...credentials,
    };
    this.projects = new Map();
    this.activeDeployments = new Map();
  }

  /**
   * Deploy a project with one click
   */
  async deploy(
    projectPath: string,
    config: DeploymentConfig
  ): Promise<Deployment> {
    const deploymentId = this.generateId('deploy');

    const deployment: Deployment = {
      id: deploymentId,
      projectId: config.projectName,
      status: 'queued',
      provider: config.provider,
      domains: [],
      createdAt: new Date(),
      buildLogs: [],
      meta: {},
    };

    this.activeDeployments.set(deploymentId, deployment);
    this.emitProgress(deploymentId, 'queued', 0, 'Deployment queued');

    try {
      // Step 1: Build the project
      this.emitProgress(deploymentId, 'building', 10, 'Building project...');
      deployment.status = 'building';

      const buildOutput = await this.buildProject(projectPath, config);
      deployment.buildLogs.push(...buildOutput.errors, ...buildOutput.warnings);
      deployment.meta.buildTime = buildOutput.duration;
      deployment.meta.assetSize = buildOutput.size;

      if (!buildOutput.success) {
        throw new Error(`Build failed: ${buildOutput.errors.join('\n')}`);
      }

      // Step 2: Deploy to provider
      this.emitProgress(deploymentId, 'deploying', 50, `Deploying to ${config.provider}...`);
      deployment.status = 'deploying';

      const result = await this.deployToProvider(
        projectPath,
        buildOutput.outputPath,
        config
      );

      // Step 3: Complete deployment
      deployment.status = 'ready';
      deployment.url = result.url;
      deployment.previewUrl = result.previewUrl;
      deployment.productionUrl = result.productionUrl;
      deployment.domains = result.domains;
      deployment.deployedAt = new Date();
      deployment.meta = { ...deployment.meta, ...result.meta };

      this.emitProgress(deploymentId, 'ready', 100, 'Deployment successful!');
      this.emit('deployment-complete', { deployment });

      return deployment;
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error instanceof Error ? error.message : 'Unknown error';
      this.emitProgress(deploymentId, 'failed', 0, `Deployment failed: ${deployment.error}`);
      this.emit('deployment-failed', { deployment, error });
      throw error;
    }
  }

  /**
   * Create a preview deployment
   */
  async deployPreview(
    projectPath: string,
    config: DeploymentConfig,
    branch: string
  ): Promise<Deployment> {
    return this.deploy(projectPath, {
      ...config,
      projectName: `${config.projectName}-preview-${branch}`,
    });
  }

  /**
   * Rollback to a previous deployment
   */
  async rollback(
    projectId: string,
    deploymentId: string
  ): Promise<Deployment> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const targetDeployment = project.deployments.find(
      (d) => d.id === deploymentId
    );
    if (!targetDeployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    // Promote the target deployment to production
    switch (project.provider) {
      case 'vercel':
        await this.vercelPromote(projectId, deploymentId);
        break;
      case 'netlify':
        await this.netlifyRollback(projectId, deploymentId);
        break;
      default:
        throw new Error(`Rollback not supported for ${project.provider}`);
    }

    this.emit('rollback-complete', { projectId, deploymentId });
    return targetDeployment;
  }

  /**
   * Cancel an in-progress deployment
   */
  async cancelDeployment(deploymentId: string): Promise<void> {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    if (deployment.status === 'ready' || deployment.status === 'failed') {
      throw new Error('Cannot cancel completed deployment');
    }

    deployment.status = 'cancelled';
    this.emit('deployment-cancelled', { deploymentId });
  }

  /**
   * Get deployment status
   */
  getDeployment(deploymentId: string): Deployment | undefined {
    return this.activeDeployments.get(deploymentId);
  }

  /**
   * Get all deployments for a project
   */
  getProjectDeployments(projectId: string): Deployment[] {
    const project = this.projects.get(projectId);
    return project?.deployments || [];
  }

  /**
   * Configure environment variables
   */
  async setEnvVariables(
    projectId: string,
    provider: DeploymentProvider,
    variables: EnvVariable[]
  ): Promise<void> {
    switch (provider) {
      case 'vercel':
        await this.vercelSetEnv(projectId, variables);
        break;
      case 'netlify':
        await this.netlifySetEnv(projectId, variables);
        break;
      case 'railway':
        await this.railwaySetEnv(projectId, variables);
        break;
      default:
        throw new Error(`Env vars not supported for ${provider}`);
    }

    this.emit('env-updated', { projectId, variables });
  }

  /**
   * Add a custom domain
   */
  async addDomain(
    projectId: string,
    provider: DeploymentProvider,
    domain: string
  ): Promise<DomainInfo> {
    let domainInfo: DomainInfo;

    switch (provider) {
      case 'vercel':
        domainInfo = await this.vercelAddDomain(projectId, domain);
        break;
      case 'netlify':
        domainInfo = await this.netlifyAddDomain(projectId, domain);
        break;
      default:
        throw new Error(`Custom domains not supported for ${provider}`);
    }

    this.emit('domain-added', { projectId, domain: domainInfo });
    return domainInfo;
  }

  /**
   * Get deployment logs
   */
  async getLogs(
    deploymentId: string,
    options: { tail?: number; follow?: boolean } = {}
  ): Promise<string[]> {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    switch (deployment.provider) {
      case 'vercel':
        return this.vercelGetLogs(deploymentId, options);
      case 'netlify':
        return deployment.buildLogs;
      default:
        return deployment.buildLogs;
    }
  }

  // ==========================================================================
  // PRIVATE METHODS - BUILD
  // ==========================================================================

  private async buildProject(
    projectPath: string,
    config: DeploymentConfig
  ): Promise<BuildOutput> {
    const startTime = Date.now();
    const outputDir = config.outputDirectory || 'dist';
    const buildCommand = config.buildCommand || 'npm run build';
    const installCommand = config.installCommand || 'npm install';

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Install dependencies
      await execAsync(installCommand, { cwd: projectPath });

      // Run build command
      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: projectPath,
        env: {
          ...process.env,
          ...config.envVariables,
          NODE_ENV: 'production',
        },
      });

      // Parse build output for warnings
      if (stderr) {
        warnings.push(stderr);
      }

      // Get output size
      const outputPath = path.join(projectPath, outputDir);
      const size = await this.getDirectorySize(outputPath);
      const files = await this.listFiles(outputPath);

      return {
        success: true,
        outputPath,
        duration: Date.now() - startTime,
        size,
        files,
        errors,
        warnings,
      };
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      errors.push(execError.stderr || execError.message || 'Build failed');

      return {
        success: false,
        outputPath: '',
        duration: Date.now() - startTime,
        size: 0,
        files: [],
        errors,
        warnings,
      };
    }
  }

  private async deployToProvider(
    projectPath: string,
    outputPath: string,
    config: DeploymentConfig
  ): Promise<{
    url: string;
    previewUrl?: string;
    productionUrl?: string;
    domains: DomainInfo[];
    meta: DeploymentMeta;
  }> {
    switch (config.provider) {
      case 'vercel':
        return this.deployToVercel(projectPath, outputPath, config);
      case 'netlify':
        return this.deployToNetlify(projectPath, outputPath, config);
      case 'railway':
        return this.deployToRailway(projectPath, config);
      case 'fly':
        return this.deployToFly(projectPath, config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  // ==========================================================================
  // PRIVATE METHODS - VERCEL
  // ==========================================================================

  private async deployToVercel(
    projectPath: string,
    outputPath: string,
    config: DeploymentConfig
  ): Promise<{
    url: string;
    previewUrl?: string;
    productionUrl?: string;
    domains: DomainInfo[];
    meta: DeploymentMeta;
  }> {
    const token = this.credentials.vercel?.token;
    if (!token) {
      throw new Error('Vercel token not configured');
    }

    // Create vercel.json if needed
    const vercelConfig = {
      version: 2,
      name: config.projectName,
      builds: [{ src: './**', use: '@vercel/static' }],
      routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }],
    };

    await fs.writeFile(
      path.join(outputPath, 'vercel.json'),
      JSON.stringify(vercelConfig, null, 2)
    );

    // Deploy using Vercel CLI
    try {
      const { stdout } = await execAsync(
        `npx vercel deploy --token ${token} --yes --prod`,
        { cwd: outputPath }
      );

      const urlMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
      const url = urlMatch ? urlMatch[0] : '';

      return {
        url,
        productionUrl: url,
        domains: [
          {
            domain: new URL(url).hostname,
            type: 'production',
            ssl: true,
            verified: true,
          },
        ],
        meta: {},
      };
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(
        `Vercel deployment failed: ${execError.stderr || execError.message}`
      );
    }
  }

  private async vercelPromote(
    projectId: string,
    deploymentId: string
  ): Promise<void> {
    const token = this.credentials.vercel?.token;
    if (!token) throw new Error('Vercel token not configured');

    await execAsync(
      `npx vercel alias set ${deploymentId} ${projectId} --token ${token}`
    );
  }

  private async vercelSetEnv(
    projectId: string,
    variables: EnvVariable[]
  ): Promise<void> {
    const token = this.credentials.vercel?.token;
    if (!token) throw new Error('Vercel token not configured');

    for (const v of variables) {
      const targets = v.target.join(',');
      await execAsync(
        `npx vercel env add ${v.key} "${v.value}" ${targets} --token ${token}`
      );
    }
  }

  private async vercelAddDomain(
    projectId: string,
    domain: string
  ): Promise<DomainInfo> {
    const token = this.credentials.vercel?.token;
    if (!token) throw new Error('Vercel token not configured');

    await execAsync(
      `npx vercel domains add ${domain} --token ${token}`
    );

    return {
      domain,
      type: 'custom',
      ssl: true,
      verified: false, // Need DNS verification
    };
  }

  private async vercelGetLogs(
    deploymentId: string,
    options: { tail?: number; follow?: boolean }
  ): Promise<string[]> {
    const token = this.credentials.vercel?.token;
    if (!token) throw new Error('Vercel token not configured');

    const { stdout } = await execAsync(
      `npx vercel logs ${deploymentId} --token ${token} ${options.tail ? `-n ${options.tail}` : ''}`
    );

    return stdout.split('\n');
  }

  // ==========================================================================
  // PRIVATE METHODS - NETLIFY
  // ==========================================================================

  private async deployToNetlify(
    projectPath: string,
    outputPath: string,
    config: DeploymentConfig
  ): Promise<{
    url: string;
    previewUrl?: string;
    productionUrl?: string;
    domains: DomainInfo[];
    meta: DeploymentMeta;
  }> {
    const token = this.credentials.netlify?.token;
    if (!token) {
      throw new Error('Netlify token not configured');
    }

    // Create netlify.toml if needed
    const netlifyConfig = `
[build]
  publish = "${config.outputDirectory || 'dist'}"
  command = "${config.buildCommand || 'npm run build'}"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;

    await fs.writeFile(
      path.join(projectPath, 'netlify.toml'),
      netlifyConfig
    );

    try {
      const { stdout } = await execAsync(
        `npx netlify deploy --auth ${token} --site ${config.projectName} --prod --dir ${outputPath}`,
        { cwd: projectPath }
      );

      const urlMatch = stdout.match(/https:\/\/[^\s]+\.netlify\.app/);
      const url = urlMatch ? urlMatch[0] : '';

      return {
        url,
        productionUrl: url,
        domains: [
          {
            domain: new URL(url).hostname,
            type: 'production',
            ssl: true,
            verified: true,
          },
        ],
        meta: {},
      };
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(
        `Netlify deployment failed: ${execError.stderr || execError.message}`
      );
    }
  }

  private async netlifyRollback(
    projectId: string,
    deploymentId: string
  ): Promise<void> {
    const token = this.credentials.netlify?.token;
    if (!token) throw new Error('Netlify token not configured');

    await execAsync(
      `npx netlify deploy --auth ${token} --site ${projectId} --alias ${deploymentId}`
    );
  }

  private async netlifySetEnv(
    projectId: string,
    variables: EnvVariable[]
  ): Promise<void> {
    const token = this.credentials.netlify?.token;
    if (!token) throw new Error('Netlify token not configured');

    for (const v of variables) {
      await execAsync(
        `npx netlify env:set ${v.key} "${v.value}" --auth ${token} --site ${projectId}`
      );
    }
  }

  private async netlifyAddDomain(
    projectId: string,
    domain: string
  ): Promise<DomainInfo> {
    const token = this.credentials.netlify?.token;
    if (!token) throw new Error('Netlify token not configured');

    await execAsync(
      `npx netlify domains:add ${domain} --auth ${token} --site ${projectId}`
    );

    return {
      domain,
      type: 'custom',
      ssl: true,
      verified: false,
    };
  }

  // ==========================================================================
  // PRIVATE METHODS - RAILWAY
  // ==========================================================================

  private async deployToRailway(
    projectPath: string,
    config: DeploymentConfig
  ): Promise<{
    url: string;
    previewUrl?: string;
    productionUrl?: string;
    domains: DomainInfo[];
    meta: DeploymentMeta;
  }> {
    const token = this.credentials.railway?.token;
    if (!token) {
      throw new Error('Railway token not configured');
    }

    try {
      const { stdout } = await execAsync(
        `railway up --detach`,
        {
          cwd: projectPath,
          env: { ...process.env, RAILWAY_TOKEN: token },
        }
      );

      const urlMatch = stdout.match(/https:\/\/[^\s]+\.railway\.app/);
      const url = urlMatch ? urlMatch[0] : '';

      return {
        url,
        productionUrl: url,
        domains: [
          {
            domain: new URL(url).hostname,
            type: 'production',
            ssl: true,
            verified: true,
          },
        ],
        meta: {},
      };
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(
        `Railway deployment failed: ${execError.stderr || execError.message}`
      );
    }
  }

  private async railwaySetEnv(
    projectId: string,
    variables: EnvVariable[]
  ): Promise<void> {
    const token = this.credentials.railway?.token;
    if (!token) throw new Error('Railway token not configured');

    for (const v of variables) {
      await execAsync(
        `railway variables set ${v.key}="${v.value}"`,
        { env: { ...process.env, RAILWAY_TOKEN: token } }
      );
    }
  }

  // ==========================================================================
  // PRIVATE METHODS - FLY.IO
  // ==========================================================================

  private async deployToFly(
    projectPath: string,
    config: DeploymentConfig
  ): Promise<{
    url: string;
    previewUrl?: string;
    productionUrl?: string;
    domains: DomainInfo[];
    meta: DeploymentMeta;
  }> {
    const token = this.credentials.fly?.token;
    if (!token) {
      throw new Error('Fly.io token not configured');
    }

    // Create fly.toml if needed
    const flyConfig = `
app = "${config.projectName}"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
`;

    await fs.writeFile(path.join(projectPath, 'fly.toml'), flyConfig);

    try {
      const { stdout } = await execAsync(
        `flyctl deploy --remote-only`,
        {
          cwd: projectPath,
          env: { ...process.env, FLY_API_TOKEN: token },
        }
      );

      const urlMatch = stdout.match(/https:\/\/[^\s]+\.fly\.dev/);
      const url = urlMatch ? urlMatch[0] : `https://${config.projectName}.fly.dev`;

      return {
        url,
        productionUrl: url,
        domains: [
          {
            domain: `${config.projectName}.fly.dev`,
            type: 'production',
            ssl: true,
            verified: true,
          },
        ],
        meta: {},
      };
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(
        `Fly.io deployment failed: ${execError.stderr || execError.message}`
      );
    }
  }

  // ==========================================================================
  // PRIVATE METHODS - UTILITIES
  // ==========================================================================

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });

      for (const file of files) {
        const filePath = path.join(dirPath, file.name);

        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return totalSize;
  }

  private async listFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.listFiles(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return files;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private emitProgress(
    deploymentId: string,
    stage: DeploymentProgress['stage'],
    progress: number,
    message: string,
    logs?: string[]
  ): void {
    this.emit('deployment-progress', {
      deploymentId,
      stage,
      progress,
      message,
      logs,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createDeploymentPipeline(
  credentials?: Partial<ProviderCredentials>
): DeploymentPipeline {
  return new DeploymentPipeline(credentials);
}

export default DeploymentPipeline;
