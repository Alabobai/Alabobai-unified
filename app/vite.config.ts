import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
        target: 'http://localhost:8888',
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
