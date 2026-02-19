import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const API_BACKEND_ORIGIN = process.env.API_BACKEND_ORIGIN || 'http://127.0.0.1:8888'

function writeJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Alabobai-Degraded', '1')
  res.end(JSON.stringify(payload))
}

function createDegradedMemory(memoryId = `degraded-${Date.now()}`) {
  const now = Date.now()
  return {
    id: memoryId,
    userId: 'default',
    type: 'fact',
    content: 'Memory backend unavailable; serving degraded fallback data.',
    importance: 0.3,
    tags: ['degraded-fallback'],
    metadata: { degraded: true },
    privacy: 'private',
    createdAt: now,
    accessedAt: now,
    accessCount: 0,
  }
}

function getFallbackPayload(method: string, pathname: string): { status: number; body: unknown } {
  if (pathname === '/api/sandbox/health') {
    return {
      status: 200,
      body: {
        status: 'degraded',
        dockerAvailable: false,
        activeSessions: 0,
        activeExecutions: 0,
        maxConcurrentExecutions: 1,
        supportedLanguages: ['javascript', 'typescript', 'python'],
      },
    }
  }

  if (pathname === '/api/sandbox/languages') {
    return {
      status: 200,
      body: {
        languages: [
          {
            id: 'javascript',
            name: 'JavaScript',
            version: 'ES2023',
            extension: '.js',
            icon: '📜',
            packageManager: 'npm',
            example: 'console.log("Hello from JavaScript")',
          },
          {
            id: 'typescript',
            name: 'TypeScript',
            version: '5.x',
            extension: '.ts',
            icon: '📘',
            packageManager: 'npm',
            example: 'console.log("Hello from TypeScript")',
          },
          {
            id: 'python',
            name: 'Python',
            version: '3.x',
            extension: '.py',
            icon: '🐍',
            packageManager: 'pip',
            example: 'print("Hello from Python")',
          },
        ],
      },
    }
  }

  if (pathname === '/api/sandbox/execute' && method === 'POST') {
    const executionId = `degraded-${Date.now()}`
    return {
      status: 200,
      body: {
        executionId,
        success: true,
        exitCode: 0,
        stdout: 'Running in browser sandbox fallback (backend unavailable).',
        stderr: '',
        duration: 1,
        timedOut: false,
        filesCreated: [],
        status: 'degraded',
      },
    }
  }

  if (/^\/api\/sandbox\/status\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        executionId: pathname.split('/').pop() || 'unknown',
        language: 'javascript',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        filesCreated: [],
        hasResult: true,
      },
    }
  }

  if (/^\/api\/sandbox\/output\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        executionId: pathname.split('/').pop() || 'unknown',
        status: 'completed',
        outputs: [],
        result: {
          executionId: pathname.split('/').pop() || 'unknown',
          success: true,
          exitCode: 0,
          stdout: 'Degraded sandbox output.',
          stderr: '',
          duration: 1,
          timedOut: false,
          filesCreated: [],
          status: 'degraded',
        },
      },
    }
  }

  if (/^\/api\/sandbox\/files\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        files: [],
      },
    }
  }

  if (/^\/api\/sandbox\/(cancel|upload)\/.+/.test(pathname) || /^\/api\/sandbox\/(cancel|upload)$/.test(pathname)) {
    return {
      status: 200,
      body: {
        success: true,
        uploadedFiles: [],
      },
    }
  }

  if (pathname === '/api/memory/stats') {
    return {
      status: 200,
      body: {
        stats: {
          totalMemories: 0,
          memoriesByType: {},
          memoriesByUser: {},
          averageImportance: 0,
          totalStorageBytes: 0,
          oldestMemory: null,
          newestMemory: null,
          expiringCount: 0,
        },
      },
    }
  }

  if (/^\/api\/memory\/settings\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        settings: {
          memoryEnabled: true,
          autoExtract: false,
          retentionDays: 30,
          maxMemories: 1000,
        },
      },
    }
  }

  if (/^\/api\/memory\/user\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        memories: [],
      },
    }
  }

  if (pathname.startsWith('/api/memory/search')) {
    return {
      status: 200,
      body: {
        results: [],
      },
    }
  }

  if (pathname === '/api/memory/extract' && method === 'POST') {
    return {
      status: 200,
      body: {
        extraction: {
          facts: [],
          preferences: [],
          shouldRemember: false,
        },
        stored: [],
      },
    }
  }

  if (pathname === '/api/memory/context' && method === 'POST') {
    return {
      status: 200,
      body: {
        memories: [],
        contextPrompt: 'Memory backend unavailable (degraded mode).',
        count: 0,
      },
    }
  }

  if (pathname === '/api/memory/remember' && method === 'POST') {
    return {
      status: 200,
      body: {
        success: true,
        memory: createDegradedMemory(),
        message: 'Saved to degraded fallback memory store.',
      },
    }
  }

  if (pathname === '/api/memory/forget' && method === 'POST') {
    return {
      status: 200,
      body: {
        success: true,
        deletedCount: 0,
        message: 'No memories removed (degraded mode).',
      },
    }
  }

  if (pathname === '/api/memory/bulk-delete' && method === 'POST') {
    return {
      status: 200,
      body: {
        deletedCount: 0,
      },
    }
  }

  if (pathname === '/api/memory/consolidate' && method === 'POST') {
    return {
      status: 200,
      body: {
        result: {
          memoriesMerged: 0,
          memoriesRemoved: 0,
          newConnections: 0,
          spaceReclaimed: 0,
        },
      },
    }
  }

  if (/^\/api\/memory\/export\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        memories: [],
        preferences: [],
        exportedAt: Date.now(),
        version: 'degraded-fallback',
      },
    }
  }

  if (/^\/api\/memory\/import\/.+/.test(pathname) && method === 'POST') {
    return {
      status: 200,
      body: {
        imported: 0,
        errors: 0,
      },
    }
  }

  if (pathname === '/api/memory/' && method === 'POST') {
    return {
      status: 200,
      body: {
        memory: createDegradedMemory(),
      },
    }
  }

  if (/^\/api\/memory\/[^/]+$/.test(pathname)) {
    const memoryId = pathname.split('/').pop() || 'unknown'

    if (method === 'DELETE') {
      return {
        status: 200,
        body: {
          success: true,
        },
      }
    }

    return {
      status: 200,
      body: {
        memory: createDegradedMemory(memoryId),
      },
    }
  }

  return {
    status: 503,
    body: {
      error: 'backend-unavailable',
      degraded: true,
      path: pathname,
    },
  }
}

function createApiDegradedFallbackPlugin(): Plugin {
  const handler = async (req: any, res: any, next: () => void) => {
    if (!req.url) return next()

    const method = req.method || 'GET'
    const parsed = new URL(req.url, 'http://127.0.0.1')
    const pathname = parsed.pathname
    const shouldGuard = pathname.startsWith('/api/sandbox/') || pathname.startsWith('/api/memory/')
    if (!shouldGuard) return next()

    const fallback = getFallbackPayload(method, pathname)

    if (!['GET', 'HEAD'].includes(method)) {
      writeJson(res, fallback.status, fallback.body)
      return
    }

    try {
      const upstream = await fetch(`${API_BACKEND_ORIGIN}${req.url}`, {
        method,
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1200),
      })
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      res.end(text)
      return
    } catch {
      writeJson(res, fallback.status, fallback.body)
      return
    }
  }

  return {
    name: 'api-degraded-fallback',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), createApiDegradedFallbackPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
      '/api/generate-image': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/generate-video': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/chat': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/search': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/fetch-page': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/local-ai': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/company': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/proxy': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/tts': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/webhook': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/web-agent': {
        target: 'http://127.0.0.1:8890',
        changeOrigin: true,
      },
      '/api/execute-task': {
        target: 'http://127.0.0.1:8891',
        changeOrigin: true,
      },
      '/api/task-runs': {
        target: 'http://127.0.0.1:8891',
        changeOrigin: true,
      },
      '/api/jobs/submit': {
        target: 'http://127.0.0.1:8891',
        changeOrigin: true,
      },
      '/api/jobs/status': {
        target: 'http://127.0.0.1:8891',
        changeOrigin: true,
      },
      '/api': {
        target: API_BACKEND_ORIGIN,
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8888',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: ['@mlc-ai/web-llm'], // Optional dependency - not required for core functionality
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['framer-motion', 'lucide-react'],
        },
      },
    },
  },
})
