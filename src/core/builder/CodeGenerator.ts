/**
 * Alabobai Builder - Code Generator
 * Generates full-stack code from natural language prompts
 *
 * Unlike Bolt.new which regenerates entire files, this generator:
 * 1. Understands project context before generating
 * 2. Generates only necessary code
 * 3. Maintains consistency with existing codebase
 * 4. Supports React, Node, databases, and more
 */

import { EventEmitter } from 'events';
import { LLMClient, createLLMClient, LLMConfig } from '../llm-client.js';
import { GeneratedFile, AppSpec } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CodeGenerationRequest {
  prompt: string;
  projectContext?: ProjectContext;
  targetStack?: TargetStack;
  existingFiles?: Map<string, string>;
  constraints?: GenerationConstraints;
}

export interface ProjectContext {
  name: string;
  description: string;
  existingStructure: DirectoryNode[];
  dependencies: Record<string, string>;
  configFiles: Record<string, string>;
  patterns: CodePattern[];
}

export interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: DirectoryNode[];
  language?: string;
}

export interface TargetStack {
  frontend: FrontendFramework;
  backend: BackendFramework;
  database: DatabaseType;
  styling: StylingFramework;
  authentication?: AuthProvider;
  deployment?: DeploymentTarget;
}

export type FrontendFramework = 'react' | 'next' | 'vue' | 'svelte' | 'solid' | 'vanilla';
export type BackendFramework = 'express' | 'fastify' | 'nest' | 'hono' | 'none';
export type DatabaseType = 'postgresql' | 'mysql' | 'mongodb' | 'sqlite' | 'supabase' | 'prisma' | 'none';
export type StylingFramework = 'tailwind' | 'css-modules' | 'styled-components' | 'emotion' | 'vanilla';
export type AuthProvider = 'clerk' | 'auth0' | 'supabase' | 'nextauth' | 'custom' | 'none';
export type DeploymentTarget = 'vercel' | 'netlify' | 'railway' | 'fly' | 'docker' | 'aws';

export interface GenerationConstraints {
  maxFiles?: number;
  maxLinesPerFile?: number;
  useExistingPatterns?: boolean;
  preserveComments?: boolean;
  typescript?: boolean;
  strictMode?: boolean;
}

export interface CodePattern {
  name: string;
  type: 'component' | 'hook' | 'api' | 'model' | 'util' | 'test';
  template: string;
  usage: string;
}

export interface GenerationResult {
  success: boolean;
  files: GeneratedFile[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  envVariables: string[];
  setupInstructions: string[];
  errors?: string[];
  warnings?: string[];
  tokensUsed: number;
}

export interface GenerationProgress {
  stage: 'analyzing' | 'planning' | 'generating' | 'validating' | 'complete';
  progress: number; // 0-100
  currentFile?: string;
  message: string;
}

// ============================================================================
// CODE TEMPLATES
// ============================================================================

const TEMPLATES = {
  react: {
    component: `import React from 'react';

interface {{name}}Props {
  {{props}}
}

export const {{name}}: React.FC<{{name}}Props> = ({{destructuredProps}}) => {
  return (
    {{jsx}}
  );
};

export default {{name}};`,
    hook: `import { useState, useEffect, useCallback } from 'react';

interface Use{{name}}Options {
  {{options}}
}

interface Use{{name}}Return {
  {{returnType}}
}

export function use{{name}}(options: Use{{name}}Options = {}): Use{{name}}Return {
  {{implementation}}
}`,
    context: `import React, { createContext, useContext, useState, ReactNode } from 'react';

interface {{name}}ContextType {
  {{contextType}}
}

const {{name}}Context = createContext<{{name}}ContextType | undefined>(undefined);

interface {{name}}ProviderProps {
  children: ReactNode;
}

export function {{name}}Provider({ children }: {{name}}ProviderProps) {
  {{implementation}}

  return (
    <{{name}}Context.Provider value={{ {{values}} }}>
      {children}
    </{{name}}Context.Provider>
  );
}

export function use{{name}}() {
  const context = useContext({{name}}Context);
  if (context === undefined) {
    throw new Error('use{{name}} must be used within a {{name}}Provider');
  }
  return context;
}`,
  },
  node: {
    expressRoute: `import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schemas
const {{name}}Schema = z.object({
  {{schema}}
});

// GET {{path}}
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    {{getImplementation}}
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST {{path}}
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = {{name}}Schema.parse(req.body);
    {{postImplementation}}
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;`,
    service: `import { EventEmitter } from 'events';

export interface {{name}}Config {
  {{config}}
}

export interface {{name}}Result {
  {{resultType}}
}

export class {{name}}Service extends EventEmitter {
  private config: {{name}}Config;

  constructor(config: {{name}}Config) {
    super();
    this.config = config;
  }

  {{methods}}
}

// Singleton instance
let instance: {{name}}Service | null = null;

export function get{{name}}Service(config?: {{name}}Config): {{name}}Service {
  if (!instance && config) {
    instance = new {{name}}Service(config);
  }
  if (!instance) {
    throw new Error('{{name}}Service not initialized');
  }
  return instance;
}`,
  },
  database: {
    prismaModel: `model {{name}} {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  {{fields}}
}`,
    migration: `-- Create {{name}} table
CREATE TABLE IF NOT EXISTS {{tableName}} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  {{columns}}
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_{{tableName}}_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER {{tableName}}_updated_at
  BEFORE UPDATE ON {{tableName}}
  FOR EACH ROW
  EXECUTE FUNCTION update_{{tableName}}_updated_at();`,
  },
};

// ============================================================================
// CODE GENERATOR
// ============================================================================

export class CodeGenerator extends EventEmitter {
  private llm: LLMClient;
  private templates: typeof TEMPLATES;
  private defaultStack: TargetStack;

  constructor(llmConfig?: LLMConfig) {
    super();
    this.llm = llmConfig
      ? createLLMClient(llmConfig)
      : createLLMClient({
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          model: 'claude-sonnet-4-20250514',
        });
    this.templates = TEMPLATES;
    this.defaultStack = {
      frontend: 'react',
      backend: 'express',
      database: 'postgresql',
      styling: 'tailwind',
      authentication: 'none',
      deployment: 'vercel',
    };
  }

  /**
   * Generate full-stack code from a natural language prompt
   */
  async generate(request: CodeGenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now();
    let tokensUsed = 0;

    try {
      // Stage 1: Analyze the prompt
      this.emitProgress('analyzing', 0, 'Analyzing your request...');
      const analysis = await this.analyzePrompt(request.prompt, request.projectContext);
      tokensUsed += analysis.tokensUsed;

      // Stage 2: Plan the generation
      this.emitProgress('planning', 20, 'Planning file structure...');
      const plan = await this.createGenerationPlan(analysis, request);
      tokensUsed += plan.tokensUsed;

      // Stage 3: Generate files
      this.emitProgress('generating', 40, 'Generating code...');
      const files: GeneratedFile[] = [];
      const totalFiles = plan.files.length;

      for (let i = 0; i < plan.files.length; i++) {
        const filePlan = plan.files[i];
        this.emitProgress(
          'generating',
          40 + Math.floor((i / totalFiles) * 40),
          `Generating ${filePlan.path}...`,
          filePlan.path
        );

        const generated = await this.generateFile(filePlan, request, analysis);
        files.push(generated.file);
        tokensUsed += generated.tokensUsed;
      }

      // Stage 4: Validate generated code
      this.emitProgress('validating', 80, 'Validating generated code...');
      const validation = await this.validateGeneratedCode(files, request);
      tokensUsed += validation.tokensUsed;

      // Stage 5: Complete
      this.emitProgress('complete', 100, 'Generation complete!');

      return {
        success: true,
        files,
        dependencies: plan.dependencies,
        devDependencies: plan.devDependencies,
        scripts: plan.scripts,
        envVariables: plan.envVariables,
        setupInstructions: plan.setupInstructions,
        warnings: validation.warnings,
        tokensUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        files: [],
        dependencies: {},
        devDependencies: {},
        scripts: {},
        envVariables: [],
        setupInstructions: [],
        errors: [errorMessage],
        tokensUsed,
      };
    }
  }

  /**
   * Generate a single file based on specifications
   */
  async generateSingleFile(
    filePath: string,
    description: string,
    context?: ProjectContext
  ): Promise<GeneratedFile> {
    const language = this.detectLanguage(filePath);
    const fileType = this.detectFileType(filePath);

    const prompt = this.buildFilePrompt(filePath, description, language, fileType, context);

    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.getSystemPrompt('file'),
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    const content = this.extractCodeFromResponse(response);

    return {
      path: filePath,
      content,
      language,
    };
  }

  /**
   * Generate app specification from natural language
   */
  async generateAppSpec(prompt: string): Promise<AppSpec> {
    const response = await this.llm.chat([
      {
        role: 'system',
        content: `You are an expert software architect. Analyze the user's request and create a detailed application specification.

Return a JSON object with this structure:
{
  "name": "app-name",
  "description": "Brief description",
  "type": "webapp",
  "framework": "react",
  "features": ["feature1", "feature2"],
  "pages": ["Home", "About", "Dashboard"],
  "styling": {
    "theme": "light",
    "primaryColor": "#3B82F6",
    "fontFamily": "Inter"
  }
}`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AppSpec;
      }
    } catch {
      // Parse failed, create default spec
    }

    return {
      name: 'my-app',
      description: prompt.slice(0, 200),
      type: 'webapp',
      framework: 'react',
      features: [],
    };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async analyzePrompt(
    prompt: string,
    context?: ProjectContext
  ): Promise<PromptAnalysis> {
    const systemPrompt = `You are an expert code generator. Analyze the user's request and determine:
1. What features they need
2. What files should be created/modified
3. What technologies to use
4. What data models are needed

Return a JSON object with this structure:
{
  "features": ["feature1", "feature2"],
  "components": ["ComponentName"],
  "apis": [{"method": "GET", "path": "/api/items", "description": "..."}],
  "models": [{"name": "Item", "fields": ["id", "name", "createdAt"]}],
  "pages": ["HomePage", "DashboardPage"],
  "utilities": ["formatDate", "validateEmail"],
  "stack": {
    "frontend": "react",
    "backend": "express",
    "database": "postgresql",
    "styling": "tailwind"
  }
}`;

    const userPrompt = context
      ? `Project Context:\n${JSON.stringify(context, null, 2)}\n\nUser Request:\n${prompt}`
      : prompt;

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return {
          ...JSON.parse(jsonMatch[0]),
          tokensUsed: response.length / 4, // Rough estimate
        };
      }
    } catch {
      // Parse failed
    }

    return {
      features: [],
      components: [],
      apis: [],
      models: [],
      pages: [],
      utilities: [],
      stack: this.defaultStack,
      tokensUsed: response.length / 4,
    };
  }

  private async createGenerationPlan(
    analysis: PromptAnalysis,
    request: CodeGenerationRequest
  ): Promise<GenerationPlan> {
    const files: FilePlan[] = [];
    const stack = request.targetStack || analysis.stack || this.defaultStack;

    // Plan component files
    for (const component of analysis.components || []) {
      files.push({
        path: `src/components/${component}.tsx`,
        type: 'component',
        description: `React component: ${component}`,
        dependencies: [],
      });
    }

    // Plan page files
    for (const page of analysis.pages || []) {
      files.push({
        path: `src/pages/${page}.tsx`,
        type: 'page',
        description: `Page component: ${page}`,
        dependencies: analysis.components || [],
      });
    }

    // Plan API routes
    for (const api of analysis.apis || []) {
      const routeName = api.path.split('/').filter(Boolean).pop() || 'api';
      files.push({
        path: `src/api/routes/${routeName}.ts`,
        type: 'api',
        description: `API route: ${api.method} ${api.path} - ${api.description}`,
        dependencies: [],
      });
    }

    // Plan model files
    for (const model of analysis.models || []) {
      files.push({
        path: `src/models/${model.name}.ts`,
        type: 'model',
        description: `Data model: ${model.name}`,
        dependencies: [],
      });

      // Add Prisma schema if using Prisma
      if (stack.database === 'prisma') {
        files.push({
          path: `prisma/schema.prisma`,
          type: 'schema',
          description: `Prisma schema for ${model.name}`,
          dependencies: [],
        });
      }
    }

    // Plan utility files
    for (const util of analysis.utilities || []) {
      files.push({
        path: `src/utils/${util}.ts`,
        type: 'util',
        description: `Utility function: ${util}`,
        dependencies: [],
      });
    }

    // Add config files
    files.push(
      { path: 'package.json', type: 'config', description: 'Package configuration', dependencies: [] },
      { path: 'tsconfig.json', type: 'config', description: 'TypeScript configuration', dependencies: [] }
    );

    if (stack.styling === 'tailwind') {
      files.push({
        path: 'tailwind.config.js',
        type: 'config',
        description: 'Tailwind CSS configuration',
        dependencies: [],
      });
    }

    return {
      files,
      dependencies: this.getDependencies(stack),
      devDependencies: this.getDevDependencies(stack),
      scripts: this.getScripts(stack),
      envVariables: this.getEnvVariables(stack, analysis),
      setupInstructions: this.getSetupInstructions(stack),
      tokensUsed: 0,
    };
  }

  private async generateFile(
    plan: FilePlan,
    request: CodeGenerationRequest,
    analysis: PromptAnalysis
  ): Promise<{ file: GeneratedFile; tokensUsed: number }> {
    const language = this.detectLanguage(plan.path);
    const existingContent = request.existingFiles?.get(plan.path);

    const systemPrompt = this.getSystemPrompt(plan.type);
    const userPrompt = this.buildGenerationPrompt(plan, analysis, existingContent);

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const content = this.extractCodeFromResponse(response);

    return {
      file: {
        path: plan.path,
        content,
        language,
      },
      tokensUsed: response.length / 4,
    };
  }

  private async validateGeneratedCode(
    files: GeneratedFile[],
    request: CodeGenerationRequest
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[]; tokensUsed: number }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const file of files) {
      // Basic syntax validation
      if (file.language === 'typescript' || file.language === 'javascript') {
        const syntaxErrors = this.checkJSSyntax(file.content);
        errors.push(...syntaxErrors.map((e) => `${file.path}: ${e}`));
      }

      // Check for common issues
      if (file.content.includes('// TODO') || file.content.includes('// FIXME')) {
        warnings.push(`${file.path}: Contains TODO/FIXME comments`);
      }

      if (file.content.includes('any')) {
        warnings.push(`${file.path}: Contains 'any' type (consider more specific types)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      tokensUsed: 0,
    };
  }

  private checkJSSyntax(code: string): string[] {
    const errors: string[] = [];

    // Check for unclosed brackets
    const brackets = { '{': 0, '[': 0, '(': 0 };
    const closers: Record<string, keyof typeof brackets> = { '}': '{', ']': '[', ')': '(' };

    for (const char of code) {
      if (char in brackets) {
        brackets[char as keyof typeof brackets]++;
      } else if (char in closers) {
        brackets[closers[char]]--;
      }
    }

    if (brackets['{'] !== 0) errors.push('Unbalanced curly braces');
    if (brackets['['] !== 0) errors.push('Unbalanced square brackets');
    if (brackets['('] !== 0) errors.push('Unbalanced parentheses');

    return errors;
  }

  private getSystemPrompt(type: string): string {
    const basePrompt = `You are an expert TypeScript/JavaScript developer. Generate clean, production-ready code.

Rules:
1. Use TypeScript with strict typing
2. Include comprehensive JSDoc comments
3. Handle errors gracefully
4. Follow modern best practices
5. NO placeholder comments like "// implement later"
6. Generate COMPLETE, working code

Output ONLY the code, wrapped in a code block. No explanations.`;

    const typePrompts: Record<string, string> = {
      component: `${basePrompt}

For React components:
- Use functional components with hooks
- Use proper TypeScript interfaces for props
- Include proper accessibility attributes
- Use semantic HTML`,
      api: `${basePrompt}

For API routes:
- Use proper HTTP methods
- Include input validation with Zod
- Handle errors with try/catch
- Return consistent response format`,
      model: `${basePrompt}

For data models:
- Define TypeScript interfaces
- Include validation schemas
- Add utility functions for common operations`,
      file: basePrompt,
    };

    return typePrompts[type] || basePrompt;
  }

  private buildFilePrompt(
    filePath: string,
    description: string,
    language: string,
    fileType: string,
    context?: ProjectContext
  ): string {
    let prompt = `Generate a ${language} file at path: ${filePath}\n\n`;
    prompt += `Description: ${description}\n\n`;
    prompt += `File type: ${fileType}\n`;

    if (context) {
      prompt += `\nProject context:\n`;
      prompt += `- Project: ${context.name}\n`;
      prompt += `- Description: ${context.description}\n`;

      if (context.patterns.length > 0) {
        prompt += `\nExisting patterns to follow:\n`;
        for (const pattern of context.patterns) {
          prompt += `- ${pattern.name}: ${pattern.usage}\n`;
        }
      }
    }

    return prompt;
  }

  private buildGenerationPrompt(
    plan: FilePlan,
    analysis: PromptAnalysis,
    existingContent?: string
  ): string {
    let prompt = `Generate file: ${plan.path}\n`;
    prompt += `Type: ${plan.type}\n`;
    prompt += `Description: ${plan.description}\n\n`;

    prompt += `Context from analysis:\n`;
    prompt += `- Features: ${(analysis.features || []).join(', ')}\n`;
    prompt += `- Components: ${(analysis.components || []).join(', ')}\n`;

    if (analysis.models && analysis.models.length > 0) {
      prompt += `- Models: ${analysis.models.map((m) => m.name).join(', ')}\n`;
    }

    if (existingContent) {
      prompt += `\nExisting file content (update only what's needed):\n\`\`\`\n${existingContent}\n\`\`\`\n`;
    }

    return prompt;
  }

  private extractCodeFromResponse(response: string): string {
    // Try to extract code from markdown code blocks
    const codeBlockMatch = response.match(/```(?:typescript|javascript|tsx|jsx|ts|js)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try any code block
    const anyBlockMatch = response.match(/```\n?([\s\S]*?)```/);
    if (anyBlockMatch) {
      return anyBlockMatch[1].trim();
    }

    // Return as-is if no code blocks
    return response.trim();
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      css: 'css',
      scss: 'scss',
      html: 'html',
      md: 'markdown',
      prisma: 'prisma',
      sql: 'sql',
      yml: 'yaml',
      yaml: 'yaml',
    };
    return languageMap[ext || ''] || 'text';
  }

  private detectFileType(filePath: string): string {
    if (filePath.includes('/components/')) return 'component';
    if (filePath.includes('/pages/')) return 'page';
    if (filePath.includes('/api/')) return 'api';
    if (filePath.includes('/models/')) return 'model';
    if (filePath.includes('/utils/')) return 'utility';
    if (filePath.includes('/hooks/')) return 'hook';
    if (filePath.includes('/services/')) return 'service';
    if (filePath.includes('/tests/') || filePath.includes('.test.')) return 'test';
    if (filePath.match(/\.(json|yml|yaml|toml)$/)) return 'config';
    return 'file';
  }

  private getDependencies(stack: TargetStack): Record<string, string> {
    const deps: Record<string, string> = {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    };

    if (stack.backend === 'express') {
      deps.express = '^4.18.2';
      deps.cors = '^2.8.5';
      deps.helmet = '^7.1.0';
    }

    if (stack.backend === 'fastify') {
      deps.fastify = '^4.24.3';
      deps['@fastify/cors'] = '^8.4.0';
    }

    if (stack.database === 'prisma') {
      deps['@prisma/client'] = '^5.6.0';
    }

    if (stack.database === 'supabase') {
      deps['@supabase/supabase-js'] = '^2.38.4';
    }

    deps.zod = '^3.22.4';

    return deps;
  }

  private getDevDependencies(stack: TargetStack): Record<string, string> {
    const deps: Record<string, string> = {
      typescript: '^5.3.2',
      '@types/react': '^18.2.39',
      '@types/react-dom': '^18.2.17',
      '@types/node': '^20.10.0',
      vite: '^5.0.2',
      '@vitejs/plugin-react': '^4.2.0',
    };

    if (stack.backend === 'express') {
      deps['@types/express'] = '^4.17.21';
      deps['@types/cors'] = '^2.8.16';
    }

    if (stack.styling === 'tailwind') {
      deps.tailwindcss = '^3.3.5';
      deps.autoprefixer = '^10.4.16';
      deps.postcss = '^8.4.31';
    }

    if (stack.database === 'prisma') {
      deps.prisma = '^5.6.0';
    }

    // Testing
    deps.vitest = '^0.34.6';
    deps['@testing-library/react'] = '^14.1.0';

    return deps;
  }

  private getScripts(stack: TargetStack): Record<string, string> {
    const scripts: Record<string, string> = {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
      test: 'vitest',
      'test:coverage': 'vitest --coverage',
      lint: 'eslint . --ext .ts,.tsx',
      typecheck: 'tsc --noEmit',
    };

    if (stack.database === 'prisma') {
      scripts['db:generate'] = 'prisma generate';
      scripts['db:push'] = 'prisma db push';
      scripts['db:migrate'] = 'prisma migrate dev';
    }

    return scripts;
  }

  private getEnvVariables(stack: TargetStack, analysis: PromptAnalysis): string[] {
    const vars: string[] = ['NODE_ENV=development'];

    if (stack.database === 'postgresql' || stack.database === 'mysql') {
      vars.push('DATABASE_URL=');
    }

    if (stack.database === 'supabase') {
      vars.push('SUPABASE_URL=');
      vars.push('SUPABASE_ANON_KEY=');
    }

    if (stack.authentication === 'clerk') {
      vars.push('CLERK_PUBLISHABLE_KEY=');
      vars.push('CLERK_SECRET_KEY=');
    }

    if (stack.authentication === 'auth0') {
      vars.push('AUTH0_DOMAIN=');
      vars.push('AUTH0_CLIENT_ID=');
      vars.push('AUTH0_CLIENT_SECRET=');
    }

    return vars;
  }

  private getSetupInstructions(stack: TargetStack): string[] {
    const instructions: string[] = [
      '1. Run `npm install` to install dependencies',
      '2. Copy `.env.example` to `.env` and fill in values',
    ];

    if (stack.database === 'prisma') {
      instructions.push('3. Run `npx prisma generate` to generate Prisma client');
      instructions.push('4. Run `npx prisma db push` to create database tables');
    }

    instructions.push(`${instructions.length + 1}. Run \`npm run dev\` to start development server`);

    return instructions;
  }

  private emitProgress(
    stage: GenerationProgress['stage'],
    progress: number,
    message: string,
    currentFile?: string
  ): void {
    this.emit('progress', { stage, progress, message, currentFile });
  }
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface PromptAnalysis {
  features?: string[];
  components?: string[];
  apis?: { method: string; path: string; description: string }[];
  models?: { name: string; fields: string[] }[];
  pages?: string[];
  utilities?: string[];
  stack?: TargetStack;
  tokensUsed: number;
}

interface FilePlan {
  path: string;
  type: string;
  description: string;
  dependencies: string[];
}

interface GenerationPlan {
  files: FilePlan[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  envVariables: string[];
  setupInstructions: string[];
  tokensUsed: number;
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createCodeGenerator(config?: LLMConfig): CodeGenerator {
  return new CodeGenerator(config);
}

export default CodeGenerator;
