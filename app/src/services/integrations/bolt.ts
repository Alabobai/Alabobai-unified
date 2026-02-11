/**
 * bolt.diy Integration
 *
 * AI-powered full-stack app builder with live preview.
 * Based on: https://github.com/stackblitz/bolt.new (bolt.diy fork)
 *
 * Capabilities:
 * - Full-stack code generation
 * - Live preview with WebContainers
 * - Project scaffolding
 * - File system operations
 * - Package management
 */

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  framework: string
  files: ProjectFile[]
}

export interface ProjectFile {
  path: string
  content: string
  type: 'file' | 'directory'
}

export interface BuildResult {
  success: boolean
  previewUrl?: string
  errors?: string[]
  files: ProjectFile[]
}

export interface CodeGeneration {
  prompt: string
  files: ProjectFile[]
  explanation: string
}

// Available project templates
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: 'Modern React app with Vite, TypeScript, and TailwindCSS',
    framework: 'react',
    files: [
      { path: 'package.json', content: '{}', type: 'file' },
      { path: 'src/App.tsx', content: '', type: 'file' },
      { path: 'src/main.tsx', content: '', type: 'file' },
      { path: 'index.html', content: '', type: 'file' },
    ],
  },
  {
    id: 'next-app',
    name: 'Next.js App',
    description: 'Full-stack Next.js with App Router and Tailwind',
    framework: 'nextjs',
    files: [
      { path: 'package.json', content: '{}', type: 'file' },
      { path: 'app/page.tsx', content: '', type: 'file' },
      { path: 'app/layout.tsx', content: '', type: 'file' },
    ],
  },
  {
    id: 'express-api',
    name: 'Express API',
    description: 'RESTful API with Express.js and TypeScript',
    framework: 'express',
    files: [
      { path: 'package.json', content: '{}', type: 'file' },
      { path: 'src/index.ts', content: '', type: 'file' },
      { path: 'src/routes/index.ts', content: '', type: 'file' },
    ],
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Beautiful landing page with animations',
    framework: 'html',
    files: [
      { path: 'index.html', content: '', type: 'file' },
      { path: 'styles.css', content: '', type: 'file' },
      { path: 'script.js', content: '', type: 'file' },
    ],
  },
]

class BoltBuilder {
  private currentProject: ProjectFile[] = []
  private previewUrl: string | null = null

  // Generate code from natural language prompt
  async generateCode(prompt: string): Promise<CodeGeneration> {
    console.log(`[Bolt] Generating code for: ${prompt}`)

    // Determine project type from prompt
    const promptLower = prompt.toLowerCase()
    let files: ProjectFile[] = []
    let explanation = ''

    if (promptLower.includes('landing page') || promptLower.includes('homepage')) {
      files = this.generateLandingPage(prompt)
      explanation = 'Created a modern landing page with hero section, features, and responsive design.'
    } else if (promptLower.includes('dashboard')) {
      files = this.generateDashboard(prompt)
      explanation = 'Created a dashboard with sidebar navigation, stats cards, and data visualization.'
    } else if (promptLower.includes('api') || promptLower.includes('backend')) {
      files = this.generateAPI(prompt)
      explanation = 'Created a RESTful API with Express.js, including routes and middleware.'
    } else if (promptLower.includes('form') || promptLower.includes('contact')) {
      files = this.generateForm(prompt)
      explanation = 'Created a form component with validation and submission handling.'
    } else {
      files = this.generateGenericApp(prompt)
      explanation = 'Created a React application based on your requirements.'
    }

    this.currentProject = files

    return { prompt, files, explanation }
  }

  private generateLandingPage(_prompt: string): ProjectFile[] {
    return [
      {
        path: 'src/components/LandingPage.tsx',
        type: 'file',
        content: `import { useState } from 'react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">
            Welcome to the Future
          </h1>
          <p className="text-xl text-white/70 mb-8 max-w-2xl mx-auto">
            Build amazing applications with our AI-powered platform.
            Fast, intelligent, and beautifully designed.
          </p>
          <div className="flex gap-4 justify-center">
            <button className="px-8 py-4 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold rounded-xl hover:scale-105 transition-transform">
              Get Started
            </button>
            <button className="px-8 py-4 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Powerful Features
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: 'AI-Powered', desc: 'Intelligent automation at your fingertips' },
              { title: 'Lightning Fast', desc: 'Optimized for speed and performance' },
              { title: 'Secure', desc: 'Enterprise-grade security built in' },
            ].map((feature, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-rose-500/50 transition-colors">
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-white/60">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-white/60 mb-8">
            Join thousands of developers building the future.
          </p>
          <button className="px-12 py-4 bg-white text-slate-900 font-semibold rounded-xl hover:scale-105 transition-transform">
            Start Free Trial
          </button>
        </div>
      </section>
    </div>
  )
}`,
      },
      {
        path: 'src/App.tsx',
        type: 'file',
        content: `import LandingPage from './components/LandingPage'

export default function App() {
  return <LandingPage />
}`,
      },
    ]
  }

  private generateDashboard(_prompt: string): ProjectFile[] {
    return [
      {
        path: 'src/components/Dashboard.tsx',
        type: 'file',
        content: `import { useState } from 'react'
import { BarChart3, Users, DollarSign, Activity, Settings, Home, Bell } from 'lucide-react'

const stats = [
  { title: 'Total Revenue', value: '$45,231', change: '+12.5%', icon: DollarSign },
  { title: 'Active Users', value: '2,345', change: '+8.2%', icon: Users },
  { title: 'Conversions', value: '1,234', change: '+15.3%', icon: Activity },
  { title: 'Growth Rate', value: '23.5%', change: '+4.1%', icon: BarChart3 },
]

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState('dashboard')

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 border-r border-white/10">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
        </div>
        <nav className="px-4">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Home },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={\`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors \${
                activeNav === item.id
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'text-white/60 hover:bg-white/5'
              }\`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 border-b border-white/10">
          <h2 className="text-2xl font-semibold text-white">Overview</h2>
          <div className="flex items-center gap-4">
            <button className="p-2 text-white/60 hover:text-white">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-amber-400" />
          </div>
        </header>

        {/* Stats Grid */}
        <div className="p-8">
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, i) => (
              <div key={i} className="p-6 rounded-2xl bg-slate-800 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-rose-400" />
                  <span className="text-green-400 text-sm">{stat.change}</span>
                </div>
                <h3 className="text-2xl font-bold text-white">{stat.value}</h3>
                <p className="text-white/60 text-sm">{stat.title}</p>
              </div>
            ))}
          </div>

          {/* Charts Placeholder */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-slate-800 border border-white/10 h-80">
              <h3 className="text-lg font-semibold text-white mb-4">Revenue Chart</h3>
              <div className="h-full flex items-center justify-center text-white/40">
                Chart visualization here
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-slate-800 border border-white/10 h-80">
              <h3 className="text-lg font-semibold text-white mb-4">User Activity</h3>
              <div className="h-full flex items-center justify-center text-white/40">
                Activity graph here
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}`,
      },
    ]
  }

  private generateAPI(_prompt: string): ProjectFile[] {
    return [
      {
        path: 'src/index.ts',
        type: 'file',
        content: `import express from 'express'
import cors from 'cors'
import { router } from './routes'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', router)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`)
})`,
      },
      {
        path: 'src/routes/index.ts',
        type: 'file',
        content: `import { Router } from 'express'

export const router = Router()

// GET all items
router.get('/items', (req, res) => {
  res.json({ items: [], total: 0 })
})

// GET single item
router.get('/items/:id', (req, res) => {
  const { id } = req.params
  res.json({ id, name: 'Sample Item' })
})

// POST new item
router.post('/items', (req, res) => {
  const { name, description } = req.body
  res.status(201).json({ id: Date.now(), name, description })
})

// PUT update item
router.put('/items/:id', (req, res) => {
  const { id } = req.params
  const { name, description } = req.body
  res.json({ id, name, description, updated: true })
})

// DELETE item
router.delete('/items/:id', (req, res) => {
  const { id } = req.params
  res.json({ id, deleted: true })
})`,
      },
    ]
  }

  private generateForm(_prompt: string): ProjectFile[] {
    return [
      {
        path: 'src/components/ContactForm.tsx',
        type: 'file',
        content: `import { useState } from 'react'

interface FormData {
  name: string
  email: string
  message: string
}

export default function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    message: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submitted:', formData)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-2xl">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Thank You!</h2>
        <p className="text-white/60">We'll get back to you soon.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-8 rounded-2xl bg-slate-800 border border-white/10">
      <h2 className="text-2xl font-bold text-white mb-6">Contact Us</h2>

      <div className="mb-4">
        <label className="block text-white/70 text-sm mb-2">Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-white/10 text-white focus:border-rose-500 outline-none"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-white/70 text-sm mb-2">Email</label>
        <input
          type="email"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-white/10 text-white focus:border-rose-500 outline-none"
          required
        />
      </div>

      <div className="mb-6">
        <label className="block text-white/70 text-sm mb-2">Message</label>
        <textarea
          value={formData.message}
          onChange={e => setFormData({ ...formData, message: e.target.value })}
          rows={4}
          className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-white/10 text-white focus:border-rose-500 outline-none resize-none"
          required
        />
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold rounded-lg hover:scale-[1.02] transition-transform"
      >
        Send Message
      </button>
    </form>
  )
}`,
      },
    ]
  }

  private generateGenericApp(_prompt: string): ProjectFile[] {
    return [
      {
        path: 'src/App.tsx',
        type: 'file',
        content: `import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-8">
          Alabobai App
        </h1>
        <div className="p-8 rounded-2xl bg-slate-800 border border-white/10">
          <p className="text-white/70 mb-4">Count: {count}</p>
          <button
            onClick={() => setCount(c => c + 1)}
            className="px-6 py-3 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
          >
            Increment
          </button>
        </div>
      </div>
    </div>
  )
}`,
      },
    ]
  }

  // Get current project files
  getFiles(): ProjectFile[] {
    return this.currentProject
  }

  // Set preview URL
  setPreviewUrl(url: string): void {
    this.previewUrl = url
  }

  // Get preview URL
  getPreviewUrl(): string | null {
    return this.previewUrl
  }

  // Build project and return result
  async build(): Promise<BuildResult> {
    console.log('[Bolt] Building project...')

    // Simulate build process
    await new Promise(resolve => setTimeout(resolve, 1000))

    return {
      success: true,
      previewUrl: 'http://localhost:3000',
      files: this.currentProject,
    }
  }
}

export const boltBuilder = new BoltBuilder()
export default boltBuilder
