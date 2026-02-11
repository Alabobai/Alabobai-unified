import { useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useAppStore } from '@/stores/appStore'

interface MonacoEditorProps {
  value?: string
  language?: string
  onChange?: (value: string) => void
  readOnly?: boolean
}

export default function MonacoEditor({
  value = '',
  language = 'typescript',
  onChange,
  readOnly = false
}: MonacoEditorProps) {
  const editorRef = useRef<any>(null)
  const { generatedCode } = useAppStore()

  // Use generated code if available
  const displayValue = value || generatedCode || ''

  // Detect language from content
  const detectedLanguage = detectLanguage(displayValue) || language

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

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

  return (
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
