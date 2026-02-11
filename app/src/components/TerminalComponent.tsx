import { useState, useRef, useEffect, KeyboardEvent } from 'react'

interface Command {
  input: string
  output: string[]
  timestamp: Date
}

const COMMANDS: Record<string, (args: string[]) => string[]> = {
  help: () => [
    'Available commands:',
    '  help     - Show this help message',
    '  clear    - Clear terminal',
    '  ls       - List files in current directory',
    '  pwd      - Print working directory',
    '  echo     - Print text',
    '  date     - Show current date/time',
    '  whoami   - Show current user',
    '  ai       - Send a message to AI',
    '  build    - Build the project',
    '  deploy   - Deploy to production',
    '',
  ],
  clear: () => ['__CLEAR__'],
  ls: () => [
    'src/',
    'public/',
    'node_modules/',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'README.md',
    '',
  ],
  pwd: () => ['/home/alabobai/projects/my-app', ''],
  date: () => [new Date().toString(), ''],
  whoami: () => ['alabobai', ''],
  echo: (args) => [args.join(' '), ''],
  ai: (args) => {
    if (args.length === 0) {
      return ['Usage: ai <message>', 'Example: ai help me write a function', '']
    }
    return [
      'Sending to AI: "' + args.join(' ') + '"',
      'AI is thinking...',
      '(Use the chat panel for full AI interaction)',
      '',
    ]
  },
  build: () => [
    '> alabobai@2.0.0 build',
    '> tsc && vite build',
    '',
    'Building for production...',
    '✓ 1599 modules transformed.',
    'dist/index.html          1.01 kB │ gzip:  0.52 kB',
    'dist/assets/index.css   47.60 kB │ gzip:  9.32 kB',
    'dist/assets/index.js   450.00 kB │ gzip: 145.00 kB',
    '',
    '✓ built in 3.2s',
    '',
  ],
  deploy: () => [
    'Deploying to Vercel...',
    '',
    '✓ Uploaded build output',
    '✓ Build completed successfully',
    '✓ Deployed to production',
    '',
    'Live at: https://alabobai-unified.vercel.app',
    '',
  ],
}

export default function TerminalComponent() {
  const [history, setHistory] = useState<Command[]>([
    {
      input: '',
      output: [
        '╭─────────────────────────────────────────╮',
        '│  Alabobai Terminal v2.0                 │',
        '│  Type "help" for available commands     │',
        '╰─────────────────────────────────────────╯',
        '',
      ],
      timestamp: new Date(),
    },
  ])
  const [currentInput, setCurrentInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const executeCommand = (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return

    const parts = trimmed.split(' ')
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    let output: string[]

    if (cmd in COMMANDS) {
      output = COMMANDS[cmd](args)
    } else {
      output = [`Command not found: ${cmd}`, 'Type "help" for available commands', '']
    }

    // Handle clear command
    if (output[0] === '__CLEAR__') {
      setHistory([])
      setCurrentInput('')
      return
    }

    setHistory((prev) => [
      ...prev,
      {
        input: trimmed,
        output,
        timestamp: new Date(),
      },
    ])
    setCurrentInput('')
    setHistoryIndex(-1)
  }

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
      // Simple tab completion
      const commands = Object.keys(COMMANDS)
      const matches = commands.filter((c) => c.startsWith(currentInput.toLowerCase()))
      if (matches.length === 1) {
        setCurrentInput(matches[0])
      } else if (matches.length > 1) {
        setHistory((prev) => [
          ...prev,
          {
            input: '',
            output: [matches.join('  '), ''],
            timestamp: new Date(),
          },
        ])
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      setCurrentInput('')
      setHistory((prev) => [
        ...prev,
        {
          input: currentInput + '^C',
          output: [''],
          timestamp: new Date(),
        },
      ])
    }
  }

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [history])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-full bg-black overflow-auto morphic-scrollbar p-4 font-mono text-sm cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {history.map((cmd, i) => (
        <div key={i} className="mb-1">
          {cmd.input && (
            <div className="flex items-center gap-2">
              <span className="text-rose-gold-400">$</span>
              <span className="text-white/90">{cmd.input}</span>
            </div>
          )}
          {cmd.output.map((line, j) => (
            <div
              key={j}
              className={`${
                line.startsWith('✓') ? 'text-green-400' :
                line.startsWith('✗') || line.includes('error') ? 'text-red-400' :
                line.startsWith('>') ? 'text-white/50' :
                line.includes('│') || line.includes('╭') || line.includes('╰') ? 'text-rose-gold-400' :
                'text-white/70'
              }`}
            >
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      ))}

      {/* Current input line */}
      <div className="flex items-center gap-2">
        <span className="text-rose-gold-400">$</span>
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-white/90 outline-none caret-rose-gold-400"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
