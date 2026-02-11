/**
 * Bolt.diy Integration
 * Full-stack app generation from natural language
 * Based on the open-source Bolt.new alternative
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { AppSpec, GeneratedApp, GeneratedFile } from '../../core/types.js';
import { LLMClient } from '../../core/llm-client.js';

// ============================================================================
// APP BUILDER
// ============================================================================

export interface BuilderConfig {
  llm: LLMClient;
  outputDir?: string;
  deployTarget?: 'vercel' | 'netlify' | 'local';
}

export class AppBuilder extends EventEmitter {
  private config: BuilderConfig;
  private llm: LLMClient;
  private apps: Map<string, GeneratedApp> = new Map();

  constructor(config: BuilderConfig) {
    super();
    this.config = config;
    this.llm = config.llm;
  }

  // ============================================================================
  // APP GENERATION
  // ============================================================================

  async generateApp(prompt: string, type: AppSpec['type'] = 'webapp'): Promise<GeneratedApp> {
    const appId = uuid();

    this.emit('generation-started', { appId, prompt, type });

    // Step 1: Parse the prompt into an app spec
    const spec = await this.parsePromptToSpec(prompt, type);

    // Step 2: Generate the app files
    const files = await this.generateFiles(spec);

    // Step 3: Create the app object
    const app: GeneratedApp = {
      id: appId,
      spec,
      files,
      status: 'preview',
      createdAt: new Date(),
    };

    this.apps.set(appId, app);
    this.emit('generation-completed', { appId, app });

    return app;
  }

  private async parsePromptToSpec(prompt: string, type: AppSpec['type']): Promise<AppSpec> {
    const systemPrompt = `You are an expert app architect. Given a user's request, create a detailed specification for the app.

Output JSON in this format:
{
  "name": "app-name-kebab-case",
  "description": "Brief description",
  "type": "webapp|website|api|mobile",
  "framework": "react|nextjs|vue|svelte|express",
  "features": ["feature1", "feature2"],
  "pages": ["Home", "About", "Dashboard"],
  "styling": {
    "theme": "dark|light|custom",
    "primaryColor": "#hex",
    "fontFamily": "Inter"
  }
}

Be specific and practical. Focus on what can be built quickly.`;

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a ${type} based on this request:\n\n${prompt}` },
    ]);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[Builder] Failed to parse spec:', e);
    }

    // Default spec
    return {
      name: 'generated-app',
      description: prompt,
      type,
      framework: 'react',
      features: ['responsive design', 'modern UI'],
      pages: ['Home'],
    };
  }

  private async generateFiles(spec: AppSpec): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Generate based on framework
    switch (spec.framework) {
      case 'react':
      case 'nextjs':
        files.push(...(await this.generateReactApp(spec)));
        break;
      case 'vue':
        files.push(...(await this.generateVueApp(spec)));
        break;
      default:
        files.push(...(await this.generateReactApp(spec)));
    }

    return files;
  }

  private async generateReactApp(spec: AppSpec): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Package.json
    files.push({
      path: 'package.json',
      language: 'json',
      content: JSON.stringify({
        name: spec.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          'react-router-dom': '^6.20.0',
        },
        devDependencies: {
          '@types/react': '^18.2.0',
          '@types/react-dom': '^18.2.0',
          '@vitejs/plugin-react': '^4.2.0',
          typescript: '^5.3.0',
          vite: '^5.0.0',
          tailwindcss: '^3.4.0',
          autoprefixer: '^10.4.0',
          postcss: '^8.4.0',
        },
      }, null, 2),
    });

    // Vite config
    files.push({
      path: 'vite.config.ts',
      language: 'typescript',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    });

    // Tailwind config
    files.push({
      path: 'tailwind.config.js',
      language: 'javascript',
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '${spec.styling?.primaryColor || '#3b82f6'}',
      },
    },
  },
  plugins: [],
};
`,
    });

    // Index HTML
    files.push({
      path: 'index.html',
      language: 'html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${spec.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    });

    // Main entry
    files.push({
      path: 'src/main.tsx',
      language: 'typescript',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    });

    // CSS
    files.push({
      path: 'src/index.css',
      language: 'css',
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: ${spec.styling?.fontFamily || 'Inter'}, system-ui, sans-serif;
}
`,
    });

    // Generate App component with LLM
    const appComponent = await this.generateComponent(spec, 'App', spec.description);
    files.push({
      path: 'src/App.tsx',
      language: 'typescript',
      content: appComponent,
    });

    // Generate page components
    for (const page of spec.pages || ['Home']) {
      const pageComponent = await this.generateComponent(spec, page, `${page} page for ${spec.description}`);
      files.push({
        path: `src/pages/${page}.tsx`,
        language: 'typescript',
        content: pageComponent,
      });
    }

    return files;
  }

  private async generateVueApp(spec: AppSpec): Promise<GeneratedFile[]> {
    // Similar structure for Vue apps
    return this.generateReactApp(spec); // Placeholder
  }

  private async generateComponent(spec: AppSpec, name: string, description: string): Promise<string> {
    const systemPrompt = `You are an expert React developer. Generate a complete, working React component.

Rules:
- Use TypeScript
- Use Tailwind CSS for styling
- Make it responsive
- Include proper types
- Keep it self-contained
- Use modern React patterns (hooks, functional components)
- Make it visually appealing with ${spec.styling?.theme || 'dark'} theme

Output ONLY the code, no explanations.`;

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a ${name} component for: ${description}

App context:
- Name: ${spec.name}
- Features: ${spec.features?.join(', ')}
- Primary color: ${spec.styling?.primaryColor || '#3b82f6'}` },
    ]);

    // Extract code from response
    const codeMatch = response.match(/```(?:tsx?|jsx?)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }

    // If no code block, assume the whole response is code
    return response.trim();
  }

  // ============================================================================
  // FILE MANAGEMENT
  // ============================================================================

  async writeFilesToDisk(app: GeneratedApp, outputDir?: string): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dir = outputDir || this.config.outputDir || `/tmp/alabobai-apps/${app.id}`;

    // Create directory
    await fs.mkdir(dir, { recursive: true });

    // Write each file
    for (const file of app.files) {
      const filePath = path.join(dir, file.path);
      const fileDir = path.dirname(filePath);

      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf8');
    }

    this.emit('files-written', { appId: app.id, dir });
    return dir;
  }

  // ============================================================================
  // DEPLOYMENT
  // ============================================================================

  async deployApp(appId: string): Promise<{ url: string; status: string }> {
    const app = this.apps.get(appId);
    if (!app) {
      throw new Error(`App not found: ${appId}`);
    }

    // Write files to disk first
    const dir = await this.writeFilesToDisk(app);

    // Deploy based on target
    switch (this.config.deployTarget) {
      case 'vercel':
        return this.deployToVercel(app, dir);
      case 'netlify':
        return this.deployToNetlify(app, dir);
      default:
        return this.deployLocally(app, dir);
    }
  }

  private async deployToVercel(app: GeneratedApp, dir: string): Promise<{ url: string; status: string }> {
    const { execSync } = await import('child_process');

    try {
      // Run vercel deploy
      const output = execSync('npx vercel --yes', {
        cwd: dir,
        encoding: 'utf8',
      });

      const urlMatch = output.match(/https:\/\/[\w-]+\.vercel\.app/);
      const url = urlMatch ? urlMatch[0] : `https://${app.spec.name}.vercel.app`;

      app.deployedUrl = url;
      app.status = 'deployed';

      this.emit('app-deployed', { appId: app.id, url });
      return { url, status: 'deployed' };
    } catch (error) {
      console.error('[Builder] Vercel deployment failed:', error);
      return { url: '', status: 'failed' };
    }
  }

  private async deployToNetlify(app: GeneratedApp, dir: string): Promise<{ url: string; status: string }> {
    const { execSync } = await import('child_process');

    try {
      // Build first
      execSync('npm install && npm run build', { cwd: dir });

      // Deploy
      const output = execSync('npx netlify deploy --prod --dir=dist', {
        cwd: dir,
        encoding: 'utf8',
      });

      const urlMatch = output.match(/https:\/\/[\w-]+\.netlify\.app/);
      const url = urlMatch ? urlMatch[0] : '';

      app.deployedUrl = url;
      app.status = 'deployed';

      return { url, status: 'deployed' };
    } catch (error) {
      console.error('[Builder] Netlify deployment failed:', error);
      return { url: '', status: 'failed' };
    }
  }

  private async deployLocally(app: GeneratedApp, dir: string): Promise<{ url: string; status: string }> {
    const { exec } = await import('child_process');

    // Install and start dev server
    exec('npm install && npm run dev', { cwd: dir });

    const url = 'http://localhost:5173';
    app.previewUrl = url;
    app.status = 'preview';

    return { url, status: 'preview' };
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getApp(appId: string): GeneratedApp | undefined {
    return this.apps.get(appId);
  }

  getAllApps(): GeneratedApp[] {
    return Array.from(this.apps.values());
  }
}

// Factory function
export function createAppBuilder(config: BuilderConfig): AppBuilder {
  return new AppBuilder(config);
}
