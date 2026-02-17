/**
 * Export Plugin
 * Enables exporting chats and documents in various formats
 */

import type { PluginDefinition, PluginAPI } from '../types'
import { BRAND } from '../../../config/brand'

export const exportPlugin: PluginDefinition = {
  manifest: {
    id: 'com.alabobai.export',
    name: 'Export',
    version: '1.0.0',
    author: BRAND.name,
    description: 'Export chats and documents to PDF, Markdown, HTML, or JSON',
    longDescription: 'A comprehensive export solution that lets you save your conversations and documents in multiple formats. Perfect for archiving, sharing, or backup purposes.',
    icon: 'Download',
    category: 'export',
    tags: ['export', 'pdf', 'markdown', 'backup'],
    permissions: ['storage', 'ui.toolbar', 'notifications'],
    settingsSchema: {
      sections: [
        {
          id: 'export-settings',
          title: 'Export Settings',
          description: 'Configure default export options',
          fields: [
            {
              id: 'defaultFormat',
              type: 'select',
              label: 'Default Format',
              description: 'Choose your preferred export format',
              options: [
                { value: 'pdf', label: 'PDF Document' },
                { value: 'markdown', label: 'Markdown' },
                { value: 'html', label: 'HTML Page' },
                { value: 'json', label: 'JSON Data' }
              ],
              defaultValue: 'markdown'
            },
            {
              id: 'includeTimestamps',
              type: 'boolean',
              label: 'Include Timestamps',
              description: 'Add message timestamps to exports',
              defaultValue: true
            },
            {
              id: 'includeMetadata',
              type: 'boolean',
              label: 'Include Metadata',
              description: 'Include chat metadata like model, settings, etc.',
              defaultValue: false
            },
            {
              id: 'styling',
              type: 'boolean',
              label: 'Apply Styling',
              description: 'Include formatting and styles in exports',
              defaultValue: true
            }
          ]
        }
      ]
    }
  },

  hooks: {
    async onInit(api: PluginAPI) {
      console.log('[ExportPlugin] Initializing...')
    },

    async onActivate(api: PluginAPI) {
      console.log('[ExportPlugin] Activating...')

      // Register toolbar button
      api.ui.registerToolbarButton({
        id: 'export-button',
        icon: 'Download',
        label: 'Export',
        tooltip: 'Export current chat',
        onClick: () => {
          showExportDialog(api)
        },
        order: 100
      })

      api.notifications.success('Export Plugin', 'Ready to export your conversations')
    },

    async onDeactivate(api: PluginAPI) {
      console.log('[ExportPlugin] Deactivating...')
    },

    onSettingsChange(settings, api) {
      console.log('[ExportPlugin] Settings changed:', settings)
    }
  }
}

// Export dialog function
function showExportDialog(api: PluginAPI) {
  const settings = api.settings.getAll()
  const defaultFormat = settings.defaultFormat as string || 'markdown'

  api.ui.showModal({
    id: 'export-dialog',
    title: 'Export Chat',
    size: 'medium',
    closable: true,
    content: null, // Would be a React component in production
    onClose: () => {
      api.ui.closeModal('export-dialog')
    }
  })
}

// Export functions
export async function exportToMarkdown(messages: Array<{ role: string; content: string }>, includeTimestamps: boolean): Promise<string> {
  let markdown = '# Chat Export\n\n'

  for (const message of messages) {
    const role = message.role === 'user' ? '**You**' : '**Assistant**'
    markdown += `${role}\n\n${message.content}\n\n---\n\n`
  }

  return markdown
}

export async function exportToPDF(_messages: Array<{ role: string; content: string }>): Promise<Blob> {
  // Placeholder - would use a PDF library
  return new Blob(['PDF content'], { type: 'application/pdf' })
}

export async function exportToHTML(messages: Array<{ role: string; content: string }>, styling: boolean): Promise<string> {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Chat Export</title>
  ${styling ? `
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    .message { padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    .user { background: #f0f0f0; }
    .assistant { background: #e8f4fc; }
    .role { font-weight: bold; margin-bottom: 0.5rem; }
  </style>
  ` : ''}
</head>
<body>
  <h1>Chat Export</h1>
`

  for (const message of messages) {
    const roleClass = message.role === 'user' ? 'user' : 'assistant'
    const roleLabel = message.role === 'user' ? 'You' : 'Assistant'
    html += `
  <div class="message ${roleClass}">
    <div class="role">${roleLabel}</div>
    <div class="content">${message.content}</div>
  </div>
`
  }

  html += `
</body>
</html>`

  return html
}

export async function exportToJSON(messages: Array<{ role: string; content: string }>, includeMetadata: boolean): Promise<string> {
  const data = {
    exportedAt: new Date().toISOString(),
    messages,
    ...(includeMetadata && {
      metadata: {
        version: '1.0',
        format: 'alabobai-chat-export'
      }
    })
  }

  return JSON.stringify(data, null, 2)
}
