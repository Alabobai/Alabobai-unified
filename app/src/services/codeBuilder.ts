/**
 * Code Builder Service
 *
 * AI-powered code generation with live preview support.
 * Supports HTML, React, Python, JavaScript, and more.
 */

import aiService from './ai'

export interface CodeBlock {
  id: string
  language: string
  code: string
  filename?: string
}

export interface GeneratedCode {
  blocks: CodeBlock[]
  explanation: string
  previewHtml: string | null
  framework: 'html' | 'react' | 'vanilla-js' | 'python' | 'other'
}

export interface GenerationRequest {
  prompt: string
  language?: string
  framework?: string
  context?: string
}

// System prompts for different code types
const CODE_GENERATION_PROMPTS = {
  html: `You are an expert web developer. Generate complete, production-ready HTML pages.
ALWAYS include:
- Complete HTML5 doctype and structure
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Modern, responsive design
- Beautiful UI with proper spacing, colors, and typography
- All CSS and JavaScript inline (no external files)
- Dark/light mode support where appropriate

When generating code, wrap it in \`\`\`html code blocks.`,

  react: `You are an expert React developer. Generate complete, production-ready React components.
ALWAYS include:
- Functional components with hooks
- TypeScript types where appropriate
- Tailwind CSS for styling
- Proper state management
- Error handling
- Mobile-responsive design

When generating code, wrap it in \`\`\`tsx or \`\`\`jsx code blocks.`,

  javascript: `You are an expert JavaScript developer. Generate clean, modern JavaScript code.
ALWAYS include:
- ES6+ syntax
- Clear comments
- Error handling
- Modular design

When generating code, wrap it in \`\`\`javascript code blocks.`,

  python: `You are an expert Python developer. Generate clean, production-ready Python code.
ALWAYS include:
- Type hints
- Docstrings
- Error handling
- PEP 8 style

When generating code, wrap it in \`\`\`python code blocks.`,
}

class CodeBuilderService {
  // Extract code blocks from markdown content
  extractCodeBlocks(content: string): CodeBlock[] {
    const blocks: CodeBlock[] = []
    const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1]?.toLowerCase() || 'text'
      const code = match[2].trim()

      if (code.length > 0) {
        blocks.push({
          id: crypto.randomUUID(),
          language: this.normalizeLanguage(language),
          code,
          filename: this.generateFilename(language, blocks.length),
        })
      }
    }

    return blocks
  }

  // Normalize language names
  private normalizeLanguage(lang: string): string {
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'sh': 'bash',
      'shell': 'bash',
      'yml': 'yaml',
    }
    return langMap[lang] || lang
  }

  // Generate sensible filename
  private generateFilename(language: string, index: number): string {
    const extensions: Record<string, string> = {
      'html': 'index.html',
      'javascript': `script${index > 0 ? index : ''}.js`,
      'typescript': `index${index > 0 ? index : ''}.tsx`,
      'python': `main${index > 0 ? index : ''}.py`,
      'css': `styles${index > 0 ? index : ''}.css`,
      'json': 'data.json',
    }
    return extensions[language] || `file${index}.${language || 'txt'}`
  }

  // Detect the primary framework/language from code
  detectFramework(code: string): 'html' | 'react' | 'vanilla-js' | 'python' | 'other' {
    if (code.includes('<!DOCTYPE') || code.includes('<html')) {
      return 'html'
    }
    if (code.includes('import React') || code.includes('useState') || code.includes('export default function')) {
      return 'react'
    }
    if (code.includes('def ') || code.includes('import ') && code.includes(':') && !code.includes('from \'react\'')) {
      return 'python'
    }
    if (code.includes('<script') || code.includes('document.') || code.includes('function ')) {
      return 'vanilla-js'
    }
    return 'other'
  }

  // Convert code to previewable HTML
  makePreviewable(blocks: CodeBlock[]): string | null {
    // Find HTML block
    const htmlBlock = blocks.find(b => b.language === 'html')
    if (htmlBlock) {
      return this.enhanceHtml(htmlBlock.code)
    }

    // Find React/JSX block
    const reactBlock = blocks.find(b =>
      b.language === 'javascript' || b.language === 'typescript'
    )
    if (reactBlock && (reactBlock.code.includes('React') || reactBlock.code.includes('useState') || reactBlock.code.includes('export default'))) {
      return this.wrapReactCode(reactBlock.code)
    }

    // Find CSS + JS combo
    const cssBlock = blocks.find(b => b.language === 'css')
    const jsBlock = blocks.find(b => b.language === 'javascript' && !b.code.includes('React'))

    if (cssBlock || jsBlock) {
      return this.createHtmlFromParts(cssBlock?.code, jsBlock?.code)
    }

    return null
  }

  // Enhance HTML with additional resources
  private enhanceHtml(html: string): string {
    // Already complete HTML document
    if (html.includes('<!DOCTYPE') || html.includes('<html')) {
      // Add Tailwind if not present
      if (!html.includes('tailwindcss')) {
        html = html.replace('<head>', '<head>\n  <script src="https://cdn.tailwindcss.com"></script>')
      }
      // Add Inter font if not present
      if (!html.includes('fonts.googleapis.com')) {
        html = html.replace('<head>',
          `<head>\n  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`)
      }
      return html
    }

    // Partial HTML - wrap in full document
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Inter', sans-serif; }
    body { margin: 0; min-height: 100vh; }
  </style>
</head>
<body class="antialiased">
  ${html}
</body>
</html>`
  }

  // Wrap React code for browser preview
  private wrapReactCode(code: string): string {
    // Clean up the code for browser execution
    let cleanCode = code
      // Remove TypeScript type annotations for browser execution
      .replace(/: React\.FC<[^>]*>/g, '')
      .replace(/: React\.ReactNode/g, '')
      .replace(/interface \w+ \{[^}]+\}/g, '')
      .replace(/type \w+ = [^;]+;/g, '')
      // Convert exports to window assignments
      .replace(/export default function (\w+)/g, 'function $1')
      .replace(/export function (\w+)/g, 'function $1')
      .replace(/export const (\w+)/g, 'const $1')

    // Find the main component name
    const componentMatch = code.match(/(?:export default )?function (\w+)/)
    const componentName = componentMatch?.[1] || 'App'

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide-react@0.263.1/dist/umd/lucide-react.min.js"></script>
  <style>
    * { font-family: 'Inter', sans-serif; }
    body { margin: 0; min-height: 100vh; }
  </style>
</head>
<body class="antialiased">
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    // Lucide icons (if available)
    const LucideIcons = window.lucide || {};

    ${cleanCode}

    // Render the main component
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(${componentName}));
  </script>
</body>
</html>`
  }

  // Create HTML from CSS and JS parts
  private createHtmlFromParts(css?: string, js?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Inter', sans-serif; }
    body { margin: 0; min-height: 100vh; background: #0f172a; }
    ${css || ''}
  </style>
</head>
<body class="antialiased">
  <div id="app"></div>
  <script>
    ${js || 'console.log("Preview ready");'}
  </script>
</body>
</html>`
  }

  // Generate code from a prompt
  async generateCode(request: GenerationRequest): Promise<GeneratedCode> {
    const { prompt, language = 'html', context } = request

    // Determine system prompt
    const systemPrompt = CODE_GENERATION_PROMPTS[language as keyof typeof CODE_GENERATION_PROMPTS]
      || CODE_GENERATION_PROMPTS.html

    type MessageRole = 'user' | 'assistant' | 'system'
    const messages: { role: MessageRole; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ]

    if (context) {
      messages.push({ role: 'user', content: `Context: ${context}` })
    }

    messages.push({ role: 'user', content: prompt })

    // Generate code using AI
    const response = await aiService.chatSync(messages)

    // Extract code blocks
    const blocks = this.extractCodeBlocks(response)

    // Detect framework
    const mainCode = blocks[0]?.code || ''
    const framework = this.detectFramework(mainCode)

    // Generate preview HTML
    const previewHtml = this.makePreviewable(blocks)

    // Extract explanation (text outside code blocks)
    const explanation = response
      .replace(/```[\s\S]*?```/g, '')
      .trim()

    return {
      blocks,
      explanation,
      previewHtml,
      framework,
    }
  }

  // Auto-detect language from prompt
  detectLanguageFromPrompt(prompt: string): string {
    const lower = prompt.toLowerCase()

    if (lower.includes('python') || lower.includes('script') && lower.includes('py')) {
      return 'python'
    }
    if (lower.includes('react') || lower.includes('component')) {
      return 'react'
    }
    if (lower.includes('api') || lower.includes('backend') || lower.includes('server')) {
      return 'javascript'
    }
    if (lower.includes('landing') || lower.includes('page') || lower.includes('website') || lower.includes('html')) {
      return 'html'
    }

    return 'html' // Default to HTML for visual output
  }
}

export const codeBuilder = new CodeBuilderService()
export default codeBuilder
