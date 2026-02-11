import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../stores/appStore'

// Types for terminal entries
interface OutputLine {
  text: string
  type: 'normal' | 'success' | 'error' | 'warning' | 'info' | 'muted' | 'heading' | 'link' | 'code'
}

interface HistoryEntry {
  input: string
  output: OutputLine[]
  timestamp: Date
  isLoading?: boolean
}

// Available commands for tab completion
const AVAILABLE_COMMANDS = [
  'help',
  'clear',
  'ai',
  'search',
  'build',
  'deploy',
  'status',
  'echo',
  'date',
  'whoami',
  'ls',
  'pwd',
  'history',
  'theme',
] as const

type CommandName = (typeof AVAILABLE_COMMANDS)[number]

// Command descriptions for help
const COMMAND_DESCRIPTIONS: Record<CommandName, string> = {
  help: 'Show available commands',
  clear: 'Clear terminal',
  ai: 'Send prompt to AI and show response',
  search: 'Search the web via /api/search',
  build: 'Trigger code generation',
  deploy: 'Simulate deployment',
  status: 'Show system status',
  echo: 'Echo text',
  date: 'Show current date/time',
  whoami: 'Show current user',
  ls: 'List files in current directory',
  pwd: 'Print working directory',
  history: 'Show command history',
  theme: 'Toggle terminal theme (dark/light)',
}

// Utility function to create output lines
const line = (text: string, type: OutputLine['type'] = 'normal'): OutputLine => ({ text, type })
const success = (text: string): OutputLine => line(text, 'success')
const error = (text: string): OutputLine => line(text, 'error')
const warning = (text: string): OutputLine => line(text, 'warning')
const info = (text: string): OutputLine => line(text, 'info')
const muted = (text: string): OutputLine => line(text, 'muted')
const heading = (text: string): OutputLine => line(text, 'heading')
const code = (text: string): OutputLine => line(text, 'code')
const link = (text: string): OutputLine => line(text, 'link')

export default function TerminalComponent() {
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      input: '',
      output: [
        heading('╭─────────────────────────────────────────────────────╮'),
        heading('│  Alabobai Terminal v2.0                             │'),
        heading('│  Type "help" for available commands                 │'),
        heading('│  AI-powered terminal with web search & code gen     │'),
        heading('╰─────────────────────────────────────────────────────╯'),
        line(''),
      ],
      timestamp: new Date(),
    },
  ])
  const [currentInput, setCurrentInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { setGeneratedCode, setActiveTab } = useAppStore()

  // Scroll to bottom when history changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [history])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])


  // Command implementations
  const commands: Record<string, (args: string[]) => Promise<OutputLine[]> | OutputLine[]> = {
    help: () => {
      const lines: OutputLine[] = [
        heading('Available Commands:'),
        line(''),
      ]
      for (const cmd of AVAILABLE_COMMANDS) {
        lines.push(info(`  ${cmd.padEnd(12)} - ${COMMAND_DESCRIPTIONS[cmd]}`))
      }
      lines.push(line(''))
      lines.push(muted('Usage examples:'))
      lines.push(code('  ai write me a React component for a todo list'))
      lines.push(code('  search latest typescript features'))
      lines.push(code('  build landing-page'))
      lines.push(line(''))
      return lines
    },

    clear: () => ['__CLEAR__'] as unknown as OutputLine[],

    echo: (args) => {
      if (args.length === 0) {
        return [line('')]
      }
      return [line(args.join(' ')), line('')]
    },

    date: () => {
      const now = new Date()
      return [
        info(now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })),
        info(now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })),
        line(''),
      ]
    },

    whoami: () => [
      success('alabobai-agent'),
      muted('AI-powered development assistant'),
      line(''),
    ],

    ls: () => [
      info('src/'),
      info('public/'),
      muted('node_modules/'),
      line('package.json'),
      line('tsconfig.json'),
      line('vite.config.ts'),
      line('README.md'),
      line('.env'),
      line(''),
    ],

    pwd: () => [
      info('/home/alabobai/projects/alabobai-unified'),
      line(''),
    ],

    history: () => {
      const cmdHistory = history.filter((h) => h.input).slice(-20)
      if (cmdHistory.length === 0) {
        return [muted('No command history'), line('')]
      }
      const lines: OutputLine[] = [heading('Command History:'), line('')]
      cmdHistory.forEach((h, i) => {
        lines.push(muted(`  ${(i + 1).toString().padStart(3)}  ${h.input}`))
      })
      lines.push(line(''))
      return lines
    },

    theme: () => {
      return [
        info('Theme toggle not implemented in terminal.'),
        muted('Use the settings panel to change themes.'),
        line(''),
      ]
    },

    status: async () => {
      const lines: OutputLine[] = [
        heading('System Status'),
        line(''),
      ]

      // Check AI service
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'ping' }],
            stream: false,
          }),
          signal: AbortSignal.timeout(5000),
        })
        if (response.ok) {
          lines.push(success('  [ONLINE]  AI Service'))
        } else {
          lines.push(warning('  [DEGRADED] AI Service'))
        }
      } catch {
        lines.push(error('  [OFFLINE] AI Service'))
      }

      // Check search service
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', limit: 1 }),
          signal: AbortSignal.timeout(5000),
        })
        if (response.ok) {
          lines.push(success('  [ONLINE]  Search Service'))
        } else {
          lines.push(warning('  [DEGRADED] Search Service'))
        }
      } catch {
        lines.push(error('  [OFFLINE] Search Service'))
      }

      lines.push(line(''))
      lines.push(info('  Memory:     ' + (performance as any).memory?.usedJSHeapSize
        ? `${Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)}MB`
        : 'N/A'))
      lines.push(info('  Uptime:     ' + formatUptime(performance.now())))
      lines.push(info('  Platform:   ' + navigator.platform))
      lines.push(info('  User Agent: ' + navigator.userAgent.slice(0, 60) + '...'))
      lines.push(line(''))

      return lines
    },

    ai: async (args) => {
      if (args.length === 0) {
        return [
          error('Usage: ai <prompt>'),
          muted('Example: ai write me a React button component'),
          line(''),
        ]
      }

      const prompt = args.join(' ')
      const lines: OutputLine[] = [
        muted(`Sending to AI: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`),
        line(''),
      ]

      try {
        const controller = new AbortController()
        setAbortController(controller)

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            stream: true,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let fullResponse = ''

        // Stream the response
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const eventLines = buffer.split('\n')
          buffer = eventLines.pop() || ''

          for (const eventLine of eventLines) {
            if (eventLine.startsWith('data: ')) {
              const data = eventLine.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.token) {
                  fullResponse += parsed.token
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        // Format the response
        const responseLines = fullResponse.split('\n')
        for (const responseLine of responseLines) {
          if (responseLine.startsWith('```')) {
            lines.push(code(responseLine))
          } else if (responseLine.startsWith('#')) {
            lines.push(heading(responseLine))
          } else if (responseLine.startsWith('- ') || responseLine.startsWith('* ')) {
            lines.push(info(responseLine))
          } else {
            lines.push(line(responseLine))
          }
        }

        // Check if response contains code and offer to preview it
        if (fullResponse.includes('```html') || fullResponse.includes('```jsx') || fullResponse.includes('```tsx')) {
          lines.push(line(''))
          lines.push(success('Code detected! Use "build" command to preview.'))
        }

        lines.push(line(''))
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          lines.push(warning('Request cancelled.'))
        } else {
          lines.push(error(`AI Error: ${(err as Error).message}`))
        }
        lines.push(line(''))
      } finally {
        setAbortController(null)
      }

      return lines
    },

    search: async (args) => {
      if (args.length === 0) {
        return [
          error('Usage: search <query>'),
          muted('Example: search TypeScript best practices'),
          line(''),
        ]
      }

      const query = args.join(' ')
      const lines: OutputLine[] = [
        muted(`Searching for: "${query}"`),
        line(''),
      ]

      try {
        const controller = new AbortController()
        setAbortController(controller)

        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 5 }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`)
        }

        const data = await response.json()

        if (data.results && data.results.length > 0) {
          lines.push(success(`Found ${data.results.length} results:`))
          lines.push(line(''))

          for (const result of data.results) {
            lines.push(heading(`  ${result.title}`))
            lines.push(link(`  ${result.url}`))
            if (result.snippet) {
              lines.push(muted(`  ${result.snippet.slice(0, 100)}${result.snippet.length > 100 ? '...' : ''}`))
            }
            lines.push(line(''))
          }
        } else {
          lines.push(warning('No results found.'))
          lines.push(line(''))
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          lines.push(warning('Search cancelled.'))
        } else {
          lines.push(error(`Search Error: ${(err as Error).message}`))
        }
        lines.push(line(''))
      } finally {
        setAbortController(null)
      }

      return lines
    },

    build: async (args) => {
      const buildType = args[0] || 'landing-page'
      const lines: OutputLine[] = [
        heading(`Building: ${buildType}`),
        line(''),
      ]

      // Determine what to build based on type
      const prompts: Record<string, string> = {
        'landing-page': 'Create a modern, beautiful landing page with hero section, features, and CTA. Use Tailwind CSS. Make it dark theme with gradient backgrounds.',
        'dashboard': 'Create an admin dashboard with sidebar navigation, stats cards, and a chart placeholder. Use Tailwind CSS. Dark theme.',
        'form': 'Create a beautiful contact form with validation styling. Use Tailwind CSS. Dark theme with glassmorphism effect.',
        'card': 'Create a product card component with image, title, description, and price. Use Tailwind CSS. Modern design.',
        'navbar': 'Create a responsive navigation bar with logo, links, and mobile menu. Use Tailwind CSS.',
        'footer': 'Create a modern footer with multiple columns, social links, and newsletter signup. Use Tailwind CSS.',
        'hero': 'Create an animated hero section with headline, subtext, and CTA buttons. Use Tailwind CSS.',
        'pricing': 'Create a pricing table with 3 tiers. Use Tailwind CSS. Highlight the middle tier.',
      }

      const prompt = prompts[buildType] || `Create a ${buildType} component. Use Tailwind CSS. Make it modern and beautiful.`

      lines.push(muted(`Generating ${buildType}...`))

      try {
        const controller = new AbortController()
        setAbortController(controller)

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Generate ONLY the HTML code (no explanations) for: ${prompt}. Include the full HTML document with <!DOCTYPE html>.`
            }],
            stream: false,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Build failed: ${response.status}`)
        }

        const data = await response.json()
        const content = data.content || ''

        // Extract HTML from the response
        const htmlMatch = content.match(/```html\s*([\s\S]*?)```/) || content.match(/<!DOCTYPE[\s\S]*<\/html>/i)
        let html = htmlMatch ? (htmlMatch[1] || htmlMatch[0]) : content

        // Ensure it's a complete HTML document
        if (!html.includes('<!DOCTYPE')) {
          html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${buildType}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white">
  ${html}
</body>
</html>`
        }

        // Add Tailwind if not present
        if (!html.includes('tailwindcss')) {
          html = html.replace('<head>', '<head>\n  <script src="https://cdn.tailwindcss.com"></script>')
        }

        // Set the generated code for preview
        setGeneratedCode(html)
        setActiveTab('preview')

        lines.push(success('Build complete!'))
        lines.push(line(''))
        lines.push(info('Preview opened in the workspace panel.'))
        lines.push(muted(`Generated ${html.length} bytes of HTML`))
        lines.push(line(''))
        lines.push(muted('Available build types: landing-page, dashboard, form, card, navbar, footer, hero, pricing'))
        lines.push(line(''))
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          lines.push(warning('Build cancelled.'))
        } else {
          lines.push(error(`Build Error: ${(err as Error).message}`))
        }
        lines.push(line(''))
      } finally {
        setAbortController(null)
      }

      return lines
    },

    deploy: async () => {
      const lines: OutputLine[] = [
        heading('Deploying to Production'),
        line(''),
      ]

      const steps = [
        { text: 'Running type checks...', delay: 500 },
        { text: 'Building for production...', delay: 1000 },
        { text: 'Optimizing assets...', delay: 800 },
        { text: 'Uploading to CDN...', delay: 1200 },
        { text: 'Invalidating cache...', delay: 400 },
        { text: 'Running health checks...', delay: 600 },
      ]

      for (const step of steps) {
        lines.push(muted(`  ${step.text}`))
        await new Promise((resolve) => setTimeout(resolve, step.delay))
      }

      lines.push(line(''))
      lines.push(success('Deployment successful!'))
      lines.push(line(''))
      lines.push(info('Production URL: https://alabobai-unified.vercel.app'))
      lines.push(info('Deployment ID: ' + generateDeploymentId()))
      lines.push(info('Build time: 4.2s'))
      lines.push(info('Bundle size: 145KB gzipped'))
      lines.push(line(''))

      return lines
    },
  }

  // Execute a command
  const executeCommand = async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return

    const parts = trimmed.split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    // Add the command to history with loading state
    setHistory((prev) => [
      ...prev,
      {
        input: trimmed,
        output: [],
        timestamp: new Date(),
        isLoading: true,
      },
    ])
    setCurrentInput('')
    setHistoryIndex(-1)
    setIsLoading(true)

    try {
      let output: OutputLine[]

      if (cmd in commands) {
        const result = commands[cmd](args)
        output = result instanceof Promise ? await result : result
      } else {
        output = [
          error(`Command not found: ${cmd}`),
          muted('Type "help" for available commands'),
          line(''),
        ]
      }

      // Handle clear command
      if (output.length === 1 && (output[0] as any) === '__CLEAR__') {
        setHistory([])
        setIsLoading(false)
        return
      }

      // Update the last history entry with the output
      setHistory((prev) => {
        const updated = [...prev]
        const lastEntry = updated[updated.length - 1]
        if (lastEntry) {
          lastEntry.output = output
          lastEntry.isLoading = false
        }
        return updated
      })
    } catch (err) {
      setHistory((prev) => {
        const updated = [...prev]
        const lastEntry = updated[updated.length - 1]
        if (lastEntry) {
          lastEntry.output = [
            error(`Error executing command: ${(err as Error).message}`),
            line(''),
          ]
          lastEntry.isLoading = false
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(currentInput)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const commandHistory = history.filter((h) => h.input)
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex]?.input || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        const commandHistory = history.filter((h) => h.input)
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex]?.input || '')
      } else {
        setHistoryIndex(-1)
        setCurrentInput('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleTabCompletion()
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      // Cancel any ongoing request
      if (abortController) {
        abortController.abort()
        setAbortController(null)
      }
      setCurrentInput('')
      setHistory((prev) => [
        ...prev,
        {
          input: currentInput + '^C',
          output: [warning('Cancelled')],
          timestamp: new Date(),
        },
      ])
      setIsLoading(false)
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setHistory([])
    }
  }

  // Tab completion
  const handleTabCompletion = () => {
    const input = currentInput.toLowerCase().trim()

    // Only complete the first word (command name)
    if (input.includes(' ')) {
      // Could add argument completion here in the future
      return
    }

    const matches = AVAILABLE_COMMANDS.filter((c) => c.startsWith(input))

    if (matches.length === 1) {
      setCurrentInput(matches[0] + ' ')
    } else if (matches.length > 1) {
      // Show available completions
      setHistory((prev) => [
        ...prev,
        {
          input: '',
          output: [info(matches.join('  ')), line('')],
          timestamp: new Date(),
        },
      ])

      // Find common prefix for partial completion
      const commonPrefix = findCommonPrefix(matches)
      if (commonPrefix.length > input.length) {
        setCurrentInput(commonPrefix)
      }
    }
  }

  // Get output line style
  const getLineStyle = (type: OutputLine['type']): string => {
    switch (type) {
      case 'success':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      case 'warning':
        return 'text-yellow-400'
      case 'info':
        return 'text-blue-400'
      case 'muted':
        return 'text-white/50'
      case 'heading':
        return 'text-rose-gold-400 font-semibold'
      case 'link':
        return 'text-cyan-400 underline'
      case 'code':
        return 'text-purple-400 font-mono'
      default:
        return 'text-white/80'
    }
  }

  return (
    <div
      ref={containerRef}
      className="h-full bg-black overflow-auto morphic-scrollbar p-4 font-mono text-sm cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {history.map((entry, i) => (
        <div key={i} className="mb-1">
          {entry.input && (
            <div className="flex items-center gap-2">
              <span className="text-rose-gold-400 select-none">$</span>
              <span className="text-white/90">{entry.input}</span>
            </div>
          )}
          {entry.isLoading ? (
            <div className="flex items-center gap-2 text-white/50">
              <LoadingSpinner />
              <span>Processing...</span>
            </div>
          ) : (
            entry.output.map((outputLine, j) => (
              <div key={j} className={getLineStyle(outputLine.type)}>
                {outputLine.text || '\u00A0'}
              </div>
            ))
          )}
        </div>
      ))}

      {/* Current input line */}
      <div className="flex items-center gap-2">
        <span className="text-rose-gold-400 select-none">$</span>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="w-full bg-transparent text-white/90 outline-none caret-rose-gold-400 disabled:opacity-50"
            spellCheck={false}
            autoComplete="off"
            placeholder={isLoading ? 'Processing...' : ''}
          />
        </div>
        {isLoading && <LoadingSpinner />}
      </div>
    </div>
  )
}

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="animate-spin h-4 w-4 border-2 border-rose-gold-400 border-t-transparent rounded-full" />
  )
}

// Helper functions
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

function generateDeploymentId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return `dpl_${result}`
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  if (strings.length === 1) return strings[0]

  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1)
      if (prefix === '') return ''
    }
  }
  return prefix
}
