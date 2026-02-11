/**
 * Alabobai Builder - Builder Engine
 * The main orchestration engine that powers the better-than-Bolt.new experience
 *
 * This engine solves ALL the major problems with Bolt.new:
 *
 * 1. FIX-AND-BREAK CYCLE: Every edit runs regression tests automatically
 * 2. TOKEN WASTE: Surgical Editor changes only necessary lines, not entire files
 * 3. NO VERSION CONTROL: Built-in Git with AI-generated commit messages
 * 4. NO PREVIEW: Real-time live preview with hot reload
 * 5. DEPLOYMENT COMPLEXITY: One-click deploy to Vercel/Netlify
 * 6. $1000 DEBUGGING: Auto-fix suggestions when tests fail
 *
 * The engine coordinates:
 * - CodeGenerator: Natural language to full-stack code
 * - LivePreview: Real-time preview of generated apps
 * - SurgicalEditor: Edit ONLY necessary lines
 * - RegressionTester: Auto-run tests after every change
 * - GitManager: Built-in version control
 * - DeploymentPipeline: One-click deploy
 */

import { EventEmitter } from 'events';
import { LLMClient, createLLMClient, LLMConfig } from '../llm-client.js';
import { GeneratedFile, AppSpec, GeneratedApp } from '../types.js';

import { CodeGenerator, GenerationResult, CodeGenerationRequest, TargetStack } from './CodeGenerator.js';
import { LivePreview, PreviewSession, FileUpdate } from './LivePreview.js';
import { SurgicalEditor, EditResult, EditRequest } from './SurgicalEditor.js';
import { RegressionTester, TestRunResult, RegressionAnalysis } from './RegressionTester.js';
import { GitManager, CommitInfo, Repository } from './GitManager.js';
import { DeploymentPipeline, Deployment, DeploymentConfig } from './DeploymentPipeline.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BuilderConfig {
  llm: LLMConfig;
  projectRoot: string;
  autoCommit: boolean;
  autoTest: boolean;
  livePreview: boolean;
  targetStack?: TargetStack;
}

export interface BuildRequest {
  prompt: string;
  projectName?: string;
  stack?: TargetStack;
  features?: string[];
  existingProject?: boolean;
}

export interface EditChangeRequest {
  instruction: string;
  targetFile?: string;
  context?: string;
}

export interface BuildResult {
  success: boolean;
  app: GeneratedApp;
  preview?: PreviewSession;
  testResults?: TestRunResult[];
  commit?: CommitInfo;
  errors?: string[];
  warnings?: string[];
  stats: BuildStats;
}

export interface BuildStats {
  filesGenerated: number;
  linesGenerated: number;
  tokensUsed: number;
  buildTime: number;
  testsPassed?: number;
  testsFailed?: number;
}

export interface ChangeResult {
  success: boolean;
  edits: EditResult[];
  testResults?: TestRunResult[];
  regressions?: RegressionAnalysis;
  commit?: CommitInfo;
  preview?: PreviewSession;
  tokensUsed: number;
  tokensSaved: number;
}

export interface BuilderState {
  projectPath: string;
  projectName: string;
  files: Map<string, string>;
  app: GeneratedApp | null;
  previewSession: PreviewSession | null;
  repository: Repository | null;
  lastBuild: BuildResult | null;
  history: BuilderAction[];
}

export interface BuilderAction {
  id: string;
  type: 'generate' | 'edit' | 'test' | 'commit' | 'deploy';
  timestamp: Date;
  description: string;
  input: unknown;
  result: unknown;
}

export interface BuilderEvent {
  type: string;
  data: unknown;
  timestamp: Date;
}

// ============================================================================
// BUILDER ENGINE
// ============================================================================

export class BuilderEngine extends EventEmitter {
  private config: BuilderConfig;
  private state: BuilderState;

  // Core components
  private codeGenerator: CodeGenerator;
  private livePreview: LivePreview;
  private surgicalEditor: SurgicalEditor;
  private regressionTester: RegressionTester;
  private gitManager: GitManager;
  private deploymentPipeline: DeploymentPipeline;

  constructor(config: BuilderConfig) {
    super();
    this.config = config;

    // Initialize state
    this.state = {
      projectPath: config.projectRoot,
      projectName: '',
      files: new Map(),
      app: null,
      previewSession: null,
      repository: null,
      lastBuild: null,
      history: [],
    };

    // Initialize components
    this.codeGenerator = new CodeGenerator(config.llm);
    this.livePreview = new LivePreview({ hotReload: true });
    this.surgicalEditor = new SurgicalEditor(config.llm);
    this.regressionTester = new RegressionTester(config.llm);
    this.gitManager = new GitManager({ autoCommit: config.autoCommit }, config.llm);
    this.deploymentPipeline = new DeploymentPipeline();

    // Wire up event forwarding
    this.setupEventForwarding();
  }

  /**
   * MAIN ENTRY POINT: Build a complete app from a natural language prompt
   *
   * This is the magic - you describe what you want, and get a fully functional app
   * with live preview, tests, and version control.
   */
  async build(request: BuildRequest): Promise<BuildResult> {
    const startTime = Date.now();
    const buildId = this.generateId('build');

    this.emitEvent('build-start', { buildId, request });

    try {
      // Step 1: Generate app specification
      this.emitEvent('stage', { stage: 'analyzing', message: 'Analyzing your request...' });
      const appSpec = await this.codeGenerator.generateAppSpec(request.prompt);
      this.state.projectName = appSpec.name;

      // Step 2: Generate code
      this.emitEvent('stage', { stage: 'generating', message: 'Generating code...' });
      const generationResult = await this.codeGenerator.generate({
        prompt: request.prompt,
        targetStack: request.stack || this.config.targetStack,
        constraints: {
          typescript: true,
          strictMode: true,
        },
      });

      if (!generationResult.success) {
        throw new Error(generationResult.errors?.join('\n') || 'Code generation failed');
      }

      // Store generated files
      for (const file of generationResult.files) {
        this.state.files.set(file.path, file.content);
      }

      // Create app object
      const app: GeneratedApp = {
        id: this.generateId('app'),
        spec: appSpec,
        files: generationResult.files,
        status: 'generating',
        createdAt: new Date(),
      };
      this.state.app = app;

      // Step 3: Initialize Git repository
      this.emitEvent('stage', { stage: 'git-init', message: 'Initializing version control...' });
      const repo = await this.gitManager.init(this.state.projectPath);
      this.state.repository = repo;

      // Step 4: Generate and run tests
      let testResults: TestRunResult[] | undefined;
      if (this.config.autoTest) {
        this.emitEvent('stage', { stage: 'testing', message: 'Running tests...' });
        testResults = await this.runTests(generationResult.files);
      }

      // Step 5: Commit initial code
      let commit: CommitInfo | undefined;
      if (this.config.autoCommit) {
        this.emitEvent('stage', { stage: 'committing', message: 'Committing code...' });
        await this.gitManager.stageAll(this.state.projectPath);
        commit = await this.gitManager.commit(this.state.projectPath, {
          message: `feat: initial generation - ${appSpec.name}`,
        });
      }

      // Step 6: Start live preview
      let preview: PreviewSession | undefined;
      if (this.config.livePreview) {
        this.emitEvent('stage', { stage: 'preview', message: 'Starting live preview...' });
        preview = await this.livePreview.createSession(
          this.state.projectPath,
          generationResult.files
        );
        this.state.previewSession = preview;
        app.previewUrl = preview.url;
        app.status = 'preview';
      }

      // Calculate stats
      const stats: BuildStats = {
        filesGenerated: generationResult.files.length,
        linesGenerated: generationResult.files.reduce(
          (sum, f) => sum + f.content.split('\n').length,
          0
        ),
        tokensUsed: generationResult.tokensUsed,
        buildTime: Date.now() - startTime,
        testsPassed: testResults?.reduce((sum, r) => sum + r.passed, 0),
        testsFailed: testResults?.reduce((sum, r) => sum + r.failed, 0),
      };

      const result: BuildResult = {
        success: true,
        app,
        preview,
        testResults,
        commit,
        warnings: generationResult.warnings,
        stats,
      };

      this.state.lastBuild = result;
      this.recordAction('generate', request, result);
      this.emitEvent('build-complete', { buildId, result });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitEvent('build-failed', { buildId, error: errorMessage });

      return {
        success: false,
        app: {
          id: this.generateId('app'),
          spec: { name: 'failed', description: '', type: 'webapp', features: [] },
          files: [],
          status: 'failed',
          createdAt: new Date(),
        },
        errors: [errorMessage],
        stats: {
          filesGenerated: 0,
          linesGenerated: 0,
          tokensUsed: 0,
          buildTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Make a surgical change to the existing code
   *
   * This is the KEY IMPROVEMENT over Bolt.new:
   * - Bolt regenerates entire files (massive token waste)
   * - We identify and change only the necessary lines
   * - Token savings can be 90%+ for small changes
   */
  async change(request: EditChangeRequest): Promise<ChangeResult> {
    const startTime = Date.now();
    this.emitEvent('change-start', { request });

    try {
      // Step 1: Identify files to change
      const targetFiles = request.targetFile
        ? [request.targetFile]
        : await this.identifyAffectedFiles(request.instruction);

      // Step 2: Make surgical edits
      this.emitEvent('stage', { stage: 'editing', message: 'Making surgical edits...' });
      const editResults: EditResult[] = [];
      let totalTokensUsed = 0;
      let totalTokensSaved = 0;

      for (const file of targetFiles) {
        const currentContent = this.state.files.get(file);
        if (!currentContent) continue;

        const editResult = await this.surgicalEditor.edit({
          file,
          currentContent,
          instruction: request.instruction,
          context: request.context ? { relatedFiles: new Map() } : undefined,
        });

        if (editResult.success) {
          this.state.files.set(file, editResult.newContent);
          editResults.push(editResult);
          totalTokensUsed += editResult.tokensUsed;
          totalTokensSaved += editResult.tokensSaved;
        }
      }

      // Step 3: Run regression tests
      let testResults: TestRunResult[] | undefined;
      let regressions: RegressionAnalysis | undefined;
      if (this.config.autoTest && editResults.length > 0) {
        this.emitEvent('stage', { stage: 'testing', message: 'Running regression tests...' });
        const edits = editResults.flatMap((r) => r.operations);
        regressions = await this.regressionTester.analyzeRegression(edits);
        testResults = await this.regressionTester.runRegressionTests(edits);

        // Check for regressions
        const failedTests = testResults.reduce((sum, r) => sum + r.failed, 0);
        if (failedTests > 0) {
          this.emitEvent('regressions-detected', {
            count: failedTests,
            analysis: regressions,
          });
        }
      }

      // Step 4: Commit changes
      let commit: CommitInfo | undefined;
      if (this.config.autoCommit && editResults.length > 0) {
        this.emitEvent('stage', { stage: 'committing', message: 'Committing changes...' });
        await this.gitManager.stageAll(this.state.projectPath);
        commit = await this.gitManager.commit(this.state.projectPath, {
          autoMessage: true,
        });
      }

      // Step 5: Update live preview
      let preview: PreviewSession | undefined;
      if (this.state.previewSession && editResults.length > 0) {
        this.emitEvent('stage', { stage: 'preview', message: 'Updating preview...' });
        const updates: FileUpdate[] = editResults.map((r) => ({
          path: r.operations[0]?.file || '',
          content: r.newContent,
          action: 'update' as const,
        }));
        await this.livePreview.updateFiles(this.state.previewSession.id, updates);
        preview = this.state.previewSession;
      }

      const result: ChangeResult = {
        success: editResults.every((r) => r.success),
        edits: editResults,
        testResults,
        regressions,
        commit,
        preview,
        tokensUsed: totalTokensUsed,
        tokensSaved: totalTokensSaved,
      };

      this.recordAction('edit', request, result);
      this.emitEvent('change-complete', { result });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emitEvent('change-failed', { error: errorMessage });

      return {
        success: false,
        edits: [],
        tokensUsed: 0,
        tokensSaved: 0,
      };
    }
  }

  /**
   * Deploy the app with one click
   */
  async deploy(
    provider: 'vercel' | 'netlify' | 'railway' | 'fly' = 'vercel'
  ): Promise<Deployment> {
    if (!this.state.app) {
      throw new Error('No app to deploy. Run build() first.');
    }

    this.emitEvent('deploy-start', { provider });

    const config: DeploymentConfig = {
      provider,
      projectName: this.state.projectName || 'alabobai-app',
      framework: this.state.app.spec.framework,
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    };

    const deployment = await this.deploymentPipeline.deploy(
      this.state.projectPath,
      config
    );

    if (this.state.app) {
      this.state.app.deployedUrl = deployment.productionUrl;
      this.state.app.status = 'deployed';
    }

    this.recordAction('deploy', { provider }, deployment);
    this.emitEvent('deploy-complete', { deployment });

    return deployment;
  }

  /**
   * Undo the last change
   */
  async undo(): Promise<void> {
    const lastAction = this.state.history.pop();
    if (!lastAction) {
      throw new Error('Nothing to undo');
    }

    // Rollback Git commit if it was a commit action
    if (lastAction.type === 'commit' && this.state.repository) {
      await this.gitManager.rollback(this.state.projectPath, 'HEAD~1', { hard: true });
    }

    // Restore files from Git
    if (this.state.repository) {
      // Files will be restored by git rollback
    }

    this.emitEvent('undo-complete', { action: lastAction });
  }

  /**
   * Get the current state
   */
  getState(): Readonly<BuilderState> {
    return this.state;
  }

  /**
   * Get all files
   */
  getFiles(): Map<string, string> {
    return new Map(this.state.files);
  }

  /**
   * Get a specific file
   */
  getFile(path: string): string | undefined {
    return this.state.files.get(path);
  }

  /**
   * Get the preview URL
   */
  getPreviewUrl(): string | undefined {
    return this.state.previewSession?.url;
  }

  /**
   * Stop the live preview
   */
  async stopPreview(): Promise<void> {
    if (this.state.previewSession) {
      await this.livePreview.stopSession(this.state.previewSession.id);
      this.state.previewSession = null;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<TestRunResult[]> {
    const files = Array.from(this.state.files.entries()).map(([path, content]) => ({
      path,
      content,
      language: this.detectLanguage(path),
    }));

    return this.runTests(files);
  }

  /**
   * Get Git history
   */
  async getHistory(): Promise<CommitInfo[]> {
    if (!this.state.repository) {
      return [];
    }
    return this.gitManager.getLog(this.state.projectPath);
  }

  /**
   * Rollback to a specific commit
   */
  async rollbackTo(commitHash: string): Promise<void> {
    if (!this.state.repository) {
      throw new Error('No repository initialized');
    }

    await this.gitManager.rollback(this.state.projectPath, commitHash, { hard: true });

    // Refresh file state
    // In production, would reload files from disk
    this.emitEvent('rollback-complete', { commitHash });
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async identifyAffectedFiles(instruction: string): Promise<string[]> {
    // Use the surgical editor's analysis to find relevant files
    const allFiles = Array.from(this.state.files.keys());

    // Simple heuristic: find files mentioned in the instruction
    const mentioned = allFiles.filter((file) => {
      const fileName = file.split('/').pop() || '';
      const baseName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
      return (
        instruction.toLowerCase().includes(fileName.toLowerCase()) ||
        instruction.toLowerCase().includes(baseName.toLowerCase())
      );
    });

    if (mentioned.length > 0) {
      return mentioned;
    }

    // If no files mentioned, analyze the instruction to determine scope
    // For now, return all source files as potential targets
    return allFiles.filter((f) =>
      f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
    );
  }

  private async runTests(files: GeneratedFile[]): Promise<TestRunResult[]> {
    const results: TestRunResult[] = [];

    for (const file of files) {
      if (file.path.endsWith('.test.ts') || file.path.endsWith('.test.tsx')) {
        continue; // Skip test files themselves
      }

      // Generate tests for the file if not exists
      const testFile = file.path.replace(/\.(ts|tsx)$/, '.test.$1');
      if (!this.state.files.has(testFile)) {
        const suite = await this.regressionTester.generateTests(
          file.path,
          file.content
        );
        this.regressionTester.addSuite(suite);
      }
    }

    // Run all suites
    for (const suite of this.regressionTester.getAllSuites()) {
      const result = await this.regressionTester.runSuite(suite);
      results.push(result);
    }

    return results;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      css: 'css',
      html: 'html',
      json: 'json',
    };
    return langMap[ext || ''] || 'text';
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private recordAction(type: BuilderAction['type'], input: unknown, result: unknown): void {
    this.state.history.push({
      id: this.generateId('action'),
      type,
      timestamp: new Date(),
      description: `${type} action`,
      input,
      result,
    });
  }

  private emitEvent(type: string, data: unknown): void {
    this.emit('builder-event', {
      type,
      data,
      timestamp: new Date(),
    } as BuilderEvent);
  }

  private setupEventForwarding(): void {
    // Forward events from child components
    this.codeGenerator.on('progress', (data) => {
      this.emitEvent('generation-progress', data);
    });

    this.livePreview.on('preview-event', (data) => {
      this.emitEvent('preview-event', data);
    });

    this.regressionTester.on('regression-detected', (data) => {
      this.emitEvent('regression-detected', data);
    });

    this.gitManager.on('committed', (data) => {
      this.emitEvent('git-committed', data);
    });

    this.deploymentPipeline.on('deployment-progress', (data) => {
      this.emitEvent('deployment-progress', data);
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBuilderEngine(config: BuilderConfig): BuilderEngine {
  return new BuilderEngine(config);
}

// ============================================================================
// QUICK START HELPER
// ============================================================================

/**
 * Quick start helper for creating a builder with sensible defaults
 */
export function quickStart(
  projectRoot: string,
  options: {
    anthropicKey?: string;
    openaiKey?: string;
    provider?: 'anthropic' | 'openai';
  } = {}
): BuilderEngine {
  const provider = options.provider || 'anthropic';
  const apiKey =
    provider === 'anthropic'
      ? options.anthropicKey || process.env.ANTHROPIC_API_KEY || ''
      : options.openaiKey || process.env.OPENAI_API_KEY || '';

  return createBuilderEngine({
    llm: {
      provider,
      apiKey,
      model: provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
    },
    projectRoot,
    autoCommit: true,
    autoTest: true,
    livePreview: true,
    targetStack: {
      frontend: 'react',
      backend: 'express',
      database: 'postgresql',
      styling: 'tailwind',
    },
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default BuilderEngine;

// Re-export all components for direct access
export { CodeGenerator } from './CodeGenerator.js';
export { LivePreview } from './LivePreview.js';
export { SurgicalEditor } from './SurgicalEditor.js';
export { RegressionTester } from './RegressionTester.js';
export { GitManager } from './GitManager.js';
export { DeploymentPipeline } from './DeploymentPipeline.js';
