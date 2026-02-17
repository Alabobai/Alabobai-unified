import { useRef, useEffect, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useAppStore } from '@/stores/appStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { EditorPresenceBar } from './ui/EditorPresence'

interface MonacoEditorProps {
  value?: string
  language?: string
  onChange?: (value: string) => void
  readOnly?: boolean
  filePath?: string
  showPresence?: boolean
}

export default function MonacoEditor({
  value = '',
  language = 'typescript',
  onChange,
  readOnly = false,
  filePath,
  showPresence = true
}: MonacoEditorProps) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const { generatedCode } = useAppStore()
  const { users, getUsersViewingFile } = usePresenceStore()
  const [decorations, setDecorations] = useState<string[]>([])

  // Use generated code if available
  const displayValue = value || generatedCode || ''

  // Detect language from content
  const detectedLanguage = detectLanguage(displayValue) || language

  // Get users editing this file
  const usersEditing = filePath ? getUsersViewingFile(filePath) : users.filter(u => u.activity === 'editing')

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Configure Monaco theme
    monaco.editor.defineTheme('alabobai', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A6A6A', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'd9a07a' },
        { token: 'string', foreground: '98C379' },
        { token: 'number', foreground: 'D19A66' },
        { token: 'type', foreground: 'E5C07B' },
        { token: 'function', foreground: '61AFEF' },
      ],
      colors: {
        'editor.background': '#0a0808',
        'editor.foreground': '#E0E0E0',
        'editorLineNumber.foreground': '#4A4A4A',
        'editorLineNumber.activeForeground': '#d9a07a',
        'editor.selectionBackground': '#d9a07a33',
        'editor.lineHighlightBackground': '#1A1A1A',
        'editorCursor.foreground': '#d9a07a',
        'editorIndentGuide.background': '#1A1A1A',
        'editorIndentGuide.activeBackground': '#333333',
      }
    })

    monaco.editor.setTheme('alabobai')

    // Configure editor options
    editor.updateOptions({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Monaco', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      tabSize: 2,
      wordWrap: 'on',
      automaticLayout: true,
      padding: { top: 16, bottom: 16 },
    })
  }

  useEffect(() => {
    if (editorRef.current && displayValue) {
      const currentValue = editorRef.current.getValue()
      if (currentValue !== displayValue) {
        editorRef.current.setValue(displayValue)
      }
    }
  }, [displayValue])

  // Update remote cursor decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !showPresence) return

    const newDecorations: any[] = []

    usersEditing.forEach(user => {
      if (user.cursor && user.cursor.lineNumber) {
        // Add cursor line decoration
        newDecorations.push({
          range: new monacoRef.current.Range(
            user.cursor.lineNumber,
            user.cursor.column || 1,
            user.cursor.lineNumber,
            (user.cursor.column || 1) + 1
          ),
          options: {
            className: `remote-cursor-${user.id}`,
            beforeContentClassName: `remote-cursor-line`,
            after: {
              content: ` ${user.name}`,
              inlineClassName: 'remote-cursor-label',
            },
            stickiness: 1,
          }
        })
      }

      // Add selection decoration
      if (user.selection) {
        newDecorations.push({
          range: new monacoRef.current.Range(
            user.selection.startLine,
            user.selection.startColumn,
            user.selection.endLine,
            user.selection.endColumn
          ),
          options: {
            className: `remote-selection`,
            inlineClassName: 'remote-selection-inline',
            stickiness: 1,
          }
        })
      }
    })

    // Apply decorations
    const newDecIds = editorRef.current.deltaDecorations(decorations, newDecorations)
    setDecorations(newDecIds)

    // Inject CSS for remote cursors
    const styleId = 'monaco-presence-styles'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    const css = usersEditing.map(user => `
      .remote-cursor-${user.id}::before {
        content: '';
        position: absolute;
        width: 2px;
        height: 18px;
        background-color: ${user.color};
        animation: blink 1s ease-in-out infinite;
      }
      .remote-cursor-${user.id}::after {
        content: '${user.name}';
        position: absolute;
        top: -20px;
        left: 0;
        background-color: ${user.color};
        color: white;
        padding: 2px 6px;
        font-size: 10px;
        border-radius: 4px;
        white-space: nowrap;
        z-index: 100;
      }
    `).join('\n') + `
      .remote-selection {
        background-color: rgba(255, 255, 255, 0.1);
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `
    styleEl.textContent = css

    return () => {
      if (editorRef.current && decorations.length > 0) {
        editorRef.current.deltaDecorations(decorations, [])
      }
    }
  }, [usersEditing, showPresence])

  return (
    <div className="h-full flex flex-col">
      {/* Presence bar showing who's editing */}
      {showPresence && usersEditing.length > 0 && (
        <EditorPresenceBar filePath={filePath} />
      )}

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          defaultLanguage={detectedLanguage}
          language={detectedLanguage}
          value={displayValue}
          onMount={handleEditorMount}
          onChange={(val) => onChange?.(val || '')}
          options={{
            readOnly,
            domReadOnly: readOnly,
          }}
          loading={
            <div className="h-full flex items-center justify-center bg-dark-400">
              <div className="text-white/50">Loading editor...</div>
            </div>
          }
        />
      </div>
    </div>
  )
}

function detectLanguage(content: string): string | null {
  if (!content) return null

  // Check for HTML
  if (content.includes('<!DOCTYPE') || content.includes('<html') || content.includes('<div')) {
    return 'html'
  }

  // Check for JSX/TSX
  if (content.includes('import React') || content.includes('export default function') || content.includes('useState')) {
    if (content.includes(': React') || content.includes(': string') || content.includes(': number')) {
      return 'typescript'
    }
    return 'javascript'
  }

  // Check for JSON
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      JSON.parse(content)
      return 'json'
    } catch {
      // Not valid JSON
    }
  }

  // Check for CSS
  if (content.includes('{') && (content.includes('color:') || content.includes('display:') || content.includes('margin:'))) {
    return 'css'
  }

  // Check for Python
  if (content.includes('def ') || content.includes('import ') && content.includes(':')) {
    return 'python'
  }

  return 'typescript'
}
