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

function getFallbackPayload(method: string, pathname: string): { status: number; body: unknown } {
  if (pathname === '/api/sandbox/health') {
    return {
      status: 200,
      body: {
        ok: false,
        degraded: true,
        reason: 'sandbox-backend-unavailable',
      },
    }
  }

  if (pathname === '/api/sandbox/languages') {
    return {
      status: 200,
      body: {
        languages: ['javascript', 'typescript', 'python', 'bash'],
        degraded: true,
      },
    }
  }

  if (pathname === '/api/sandbox/execute' && method === 'POST') {
    return {
      status: 200,
      body: {
        output: 'Running in browser sandbox fallback (backend unavailable).',
        exitCode: 0,
        degraded: true,
      },
    }
  }

  if (pathname === '/api/memory/stats') {
    return {
      status: 200,
      body: {
        total: 0,
        byType: {},
        degraded: true,
      },
    }
  }

  if (/^\/api\/memory\/settings\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        memoryEnabled: true,
        autoExtract: false,
        retentionDays: 30,
        maxMemories: 1000,
        degraded: true,
      },
    }
  }

  if (/^\/api\/memory\/user\/.+/.test(pathname)) {
    return {
      status: 200,
      body: {
        memories: [],
        total: 0,
        degraded: true,
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
