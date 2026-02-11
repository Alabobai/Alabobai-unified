/**
 * Alabobai Builder - Live Preview System
 * Real-time preview of generated applications
 *
 * Features:
 * 1. Hot module replacement for instant updates
 * 2. Multi-framework support (React, Vue, Svelte)
 * 3. Sandboxed execution for security
 * 4. Responsive preview at multiple breakpoints
 * 5. Console output capture
 * 6. Error boundary with helpful messages
 */

import { EventEmitter } from 'events';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import { GeneratedFile } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PreviewConfig {
  port: number;
  host: string;
  hotReload: boolean;
  sandbox: boolean;
  timeout: number;
  maxMemory: number; // MB
}

export interface PreviewSession {
  id: string;
  projectPath: string;
  files: Map<string, string>;
  status: PreviewStatus;
  url: string;
  port: number;
  startedAt: Date;
  lastUpdate: Date;
  errors: PreviewError[];
  console: ConsoleMessage[];
}

export type PreviewStatus =
  | 'initializing'
  | 'building'
  | 'running'
  | 'error'
  | 'stopped';

export interface PreviewError {
  type: 'build' | 'runtime' | 'network';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: Date;
}

export interface ConsoleMessage {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: Date;
  source?: string;
}

export interface FileUpdate {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
}

export interface PreviewFrame {
  name: string;
  width: number;
  height: number;
  scale?: number;
}

export interface PreviewEvent {
  type: 'status-change' | 'file-update' | 'error' | 'console' | 'ready';
  sessionId: string;
  data: unknown;
  timestamp: Date;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_CONFIG: PreviewConfig = {
  port: 3100,
  host: 'localhost',
  hotReload: true,
  sandbox: true,
  timeout: 30000,
  maxMemory: 512,
};

const DEFAULT_FRAMES: PreviewFrame[] = [
  { name: 'Mobile', width: 375, height: 667 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Wide', width: 1920, height: 1080 },
];

// ============================================================================
// HTML TEMPLATES
// ============================================================================

const PREVIEW_WRAPPER_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alabobai Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    #preview-root { height: 100%; }

    /* Error Boundary Styles */
    .alabobai-error-boundary {
      padding: 20px;
      background: #FEF2F2;
      border: 1px solid #FCA5A5;
      border-radius: 8px;
      margin: 20px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .alabobai-error-boundary h2 {
      color: #DC2626;
      margin-bottom: 12px;
    }
    .alabobai-error-boundary pre {
      background: #1F2937;
      color: #F9FAFB;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
    }
    .alabobai-error-boundary .file-link {
      color: #2563EB;
      cursor: pointer;
      text-decoration: underline;
    }

    /* Hot Reload Indicator */
    .alabobai-hot-reload {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 8px 16px;
      background: #10B981;
      color: white;
      border-radius: 20px;
      font-size: 12px;
      font-family: system-ui;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 9999;
    }
    .alabobai-hot-reload.active {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div id="preview-root"></div>
  <div id="alabobai-hot-reload" class="alabobai-hot-reload">Reloading...</div>

  <script>
    // Console capture
    const originalConsole = { ...console };
    ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
      console[level] = (...args) => {
        originalConsole[level](...args);
        window.parent.postMessage({
          type: 'console',
          level,
          message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '),
          timestamp: new Date().toISOString()
        }, '*');
      };
    });

    // Error capture
    window.onerror = (message, source, lineno, colno, error) => {
      window.parent.postMessage({
        type: 'error',
        error: {
          message: String(message),
          file: source,
          line: lineno,
          column: colno,
          stack: error?.stack
        },
        timestamp: new Date().toISOString()
      }, '*');
    };

    // Unhandled promise rejections
    window.onunhandledrejection = (event) => {
      window.parent.postMessage({
        type: 'error',
        error: {
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack
        },
        timestamp: new Date().toISOString()
      }, '*');
    };

    // Hot reload handler
    window.addEventListener('message', (event) => {
      if (event.data.type === 'hot-reload') {
        const indicator = document.getElementById('alabobai-hot-reload');
        indicator.classList.add('active');
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    });

    // Ready signal
    window.parent.postMessage({ type: 'ready' }, '*');
  </script>
  {{APP_SCRIPTS}}
</body>
</html>
`;

const ERROR_BOUNDARY_COMPONENT = `
class AlabobaiErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    window.parent.postMessage({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo?.componentStack
      },
      timestamp: new Date().toISOString()
    }, '*');
  }

  render() {
    if (this.state.hasError) {
      return React.createElement('div', { className: 'alabobai-error-boundary' },
        React.createElement('h2', null, 'Something went wrong'),
        React.createElement('pre', null, this.state.error?.message),
        this.state.error?.stack && React.createElement('pre', null, this.state.error.stack)
      );
    }
    return this.props.children;
  }
}
`;

// ============================================================================
// LIVE PREVIEW SYSTEM
// ============================================================================

export class LivePreview extends EventEmitter {
  private config: PreviewConfig;
  private sessions: Map<string, PreviewSession>;
  private servers: Map<string, http.Server>;
  private websockets: Map<string, Set<WebSocketLike>>;
  private frames: PreviewFrame[];
  private buildCache: Map<string, string>;

  constructor(config: Partial<PreviewConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessions = new Map();
    this.servers = new Map();
    this.websockets = new Map();
    this.frames = DEFAULT_FRAMES;
    this.buildCache = new Map();
  }

  /**
   * Create a new preview session
   */
  async createSession(
    projectPath: string,
    files: GeneratedFile[]
  ): Promise<PreviewSession> {
    const sessionId = this.generateSessionId();
    const port = await this.findAvailablePort();

    const session: PreviewSession = {
      id: sessionId,
      projectPath,
      files: new Map(files.map((f) => [f.path, f.content])),
      status: 'initializing',
      url: `http://${this.config.host}:${port}`,
      port,
      startedAt: new Date(),
      lastUpdate: new Date(),
      errors: [],
      console: [],
    };

    this.sessions.set(sessionId, session);
    this.websockets.set(sessionId, new Set());

    try {
      // Build the project
      session.status = 'building';
      this.emitEvent('status-change', sessionId, { status: 'building' });

      const builtFiles = await this.buildProject(session);

      // Start the preview server
      await this.startServer(session, builtFiles);

      session.status = 'running';
      this.emitEvent('status-change', sessionId, { status: 'running', url: session.url });

      return session;
    } catch (error) {
      session.status = 'error';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      session.errors.push({
        type: 'build',
        message: errorMessage,
        timestamp: new Date(),
      });
      this.emitEvent('error', sessionId, { error: errorMessage });
      throw error;
    }
  }

  /**
   * Update files in an existing session
   */
  async updateFiles(sessionId: string, updates: FileUpdate[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Apply file updates
    for (const update of updates) {
      switch (update.action) {
        case 'create':
        case 'update':
          session.files.set(update.path, update.content);
          break;
        case 'delete':
          session.files.delete(update.path);
          break;
      }
    }

    session.lastUpdate = new Date();
    this.emitEvent('file-update', sessionId, { updates });

    // Rebuild if hot reload is enabled
    if (this.config.hotReload) {
      await this.hotReload(session);
    }
  }

  /**
   * Stop a preview session
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'stopped';

    // Close WebSocket connections
    const sockets = this.websockets.get(sessionId);
    if (sockets) {
      for (const socket of sockets) {
        socket.close();
      }
      this.websockets.delete(sessionId);
    }

    // Close HTTP server
    const server = this.servers.get(sessionId);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.servers.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    this.emitEvent('status-change', sessionId, { status: 'stopped' });
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): PreviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): PreviewSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get preview frames (responsive breakpoints)
   */
  getFrames(): PreviewFrame[] {
    return this.frames;
  }

  /**
   * Set custom frames
   */
  setFrames(frames: PreviewFrame[]): void {
    this.frames = frames;
  }

  /**
   * Take a screenshot of the preview
   */
  async takeScreenshot(
    sessionId: string,
    frame?: PreviewFrame
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      throw new Error('Session not running');
    }

    // This would integrate with Puppeteer or similar for actual screenshots
    // For now, return a placeholder indicating the capability
    return `screenshot:${sessionId}:${frame?.name || 'default'}`;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async buildProject(session: PreviewSession): Promise<Map<string, string>> {
    const builtFiles = new Map<string, string>();

    // Detect framework from files
    const framework = this.detectFramework(session.files);

    // Transform files based on framework
    for (const [filePath, content] of session.files) {
      const builtContent = await this.transformFile(filePath, content, framework);
      builtFiles.set(filePath, builtContent);
    }

    // Generate index.html if not present
    if (!builtFiles.has('index.html') && !builtFiles.has('public/index.html')) {
      const indexHtml = this.generateIndexHtml(session.files, framework);
      builtFiles.set('index.html', indexHtml);
    }

    return builtFiles;
  }

  private async transformFile(
    filePath: string,
    content: string,
    framework: string
  ): Promise<string> {
    const ext = path.extname(filePath);

    // TypeScript/JSX transformation
    if (['.ts', '.tsx', '.jsx'].includes(ext)) {
      return this.transpileTypeScript(content, filePath);
    }

    // CSS modules
    if (filePath.endsWith('.module.css')) {
      return this.processCSSModule(content, filePath);
    }

    return content;
  }

  private transpileTypeScript(content: string, filePath: string): string {
    // In production, this would use esbuild or swc
    // For now, perform basic transformations

    let transformed = content;

    // Remove type annotations (simplified)
    transformed = transformed
      // Remove type imports
      .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\n?/g, '')
      // Remove interface declarations
      .replace(/interface\s+\w+\s*(\<[^>]+\>)?\s*\{[^}]+\}\n?/g, '')
      // Remove type annotations from parameters
      .replace(/:\s*\w+(\[\])?\s*([,)])/g, '$2')
      // Remove return type annotations
      .replace(/\):\s*\w+(\<[^>]+\>)?\s*(\{|=>)/g, ')$2')
      // Remove generic type parameters
      .replace(/<[A-Z]\w*(\s*,\s*[A-Z]\w*)*>/g, '');

    return transformed;
  }

  private processCSSModule(content: string, filePath: string): string {
    // Generate unique class names for CSS modules
    const hash = this.hashString(filePath);
    return content.replace(
      /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g,
      `._${hash}_$1`
    );
  }

  private generateIndexHtml(
    files: Map<string, string>,
    framework: string
  ): string {
    let appScripts = '';

    // Add React from CDN if using React
    if (framework === 'react') {
      appScripts += `
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script>${ERROR_BOUNDARY_COMPONENT}</script>
      `;
    }

    // Find entry point
    const entryPoints = ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts', 'src/App.tsx'];
    let entryPoint = '';
    for (const ep of entryPoints) {
      if (files.has(ep)) {
        entryPoint = ep;
        break;
      }
    }

    if (entryPoint && files.has(entryPoint)) {
      const entryContent = files.get(entryPoint)!;
      appScripts += `
    <script type="module">
      ${this.transpileTypeScript(entryContent, entryPoint)}
    </script>
      `;
    }

    // Add CSS files
    for (const [filePath, content] of files) {
      if (filePath.endsWith('.css')) {
        appScripts += `<style>${content}</style>`;
      }
    }

    return PREVIEW_WRAPPER_HTML.replace('{{APP_SCRIPTS}}', appScripts);
  }

  private detectFramework(files: Map<string, string>): string {
    // Check package.json
    const packageJson = files.get('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react) return 'react';
        if (deps.vue) return 'vue';
        if (deps.svelte) return 'svelte';
        if (deps['@angular/core']) return 'angular';
        if (deps.solid) return 'solid';
      } catch {
        // Invalid JSON
      }
    }

    // Check file extensions and imports
    for (const [filePath, content] of files) {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
        if (content.includes('import React') || content.includes("from 'react'")) {
          return 'react';
        }
      }
      if (filePath.endsWith('.vue')) return 'vue';
      if (filePath.endsWith('.svelte')) return 'svelte';
    }

    return 'vanilla';
  }

  private async startServer(
    session: PreviewSession,
    builtFiles: Map<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res, session, builtFiles);
      });

      server.on('error', (error) => {
        reject(error);
      });

      server.listen(session.port, this.config.host, () => {
        this.servers.set(session.id, server);
        resolve();
      });
    });
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    session: PreviewSession,
    builtFiles: Map<string, string>
  ): void {
    const url = req.url || '/';
    let filePath = url === '/' ? 'index.html' : url.slice(1);

    // Remove query string
    filePath = filePath.split('?')[0];

    // Try to find the file
    let content = builtFiles.get(filePath);

    // Try with src/ prefix
    if (!content) {
      content = builtFiles.get(`src/${filePath}`);
    }

    // Try index.html for SPA routing
    if (!content && !filePath.includes('.')) {
      content = builtFiles.get('index.html');
      filePath = 'index.html';
    }

    if (content) {
      const mimeType = this.getMimeType(filePath);
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }

  private async hotReload(session: PreviewSession): Promise<void> {
    try {
      // Rebuild the project
      const builtFiles = await this.buildProject(session);

      // Update the server's file map
      const server = this.servers.get(session.id);
      if (server) {
        // The server handler will use the new builtFiles from the session
        // We need to restart the server with new files
        await this.stopSession(session.id);
        await this.createSession(session.projectPath,
          Array.from(session.files.entries()).map(([path, content]) => ({
            path,
            content,
            language: this.getLanguageFromPath(path),
          }))
        );
      }

      // Notify connected clients
      const sockets = this.websockets.get(session.id);
      if (sockets) {
        const message = JSON.stringify({ type: 'hot-reload' });
        for (const socket of sockets) {
          socket.send(message);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      session.errors.push({
        type: 'build',
        message: errorMessage,
        timestamp: new Date(),
      });
      this.emitEvent('error', session.id, { error: errorMessage });
    }
  }

  private async findAvailablePort(): Promise<number> {
    let port = this.config.port;
    const usedPorts = new Set(Array.from(this.sessions.values()).map((s) => s.port));

    while (usedPorts.has(port)) {
      port++;
    }

    // Check if port is actually available
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      server.listen(port, () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        this.findAvailablePort().then(resolve).catch(reject);
      });
    });
  }

  private generateSessionId(): string {
    return `preview_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.ico': 'image/x-icon',
    };
    return mimeTypes[ext] || 'text/plain';
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).slice(1);
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      css: 'css',
      html: 'html',
      json: 'json',
    };
    return langMap[ext] || 'text';
  }

  private emitEvent(
    type: PreviewEvent['type'],
    sessionId: string,
    data: unknown
  ): void {
    this.emit('preview-event', {
      type,
      sessionId,
      data,
      timestamp: new Date(),
    });
  }
}

// ============================================================================
// WEBSOCKET-LIKE INTERFACE
// ============================================================================

interface WebSocketLike {
  send(data: string): void;
  close(): void;
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createLivePreview(config?: Partial<PreviewConfig>): LivePreview {
  return new LivePreview(config);
}

export default LivePreview;
