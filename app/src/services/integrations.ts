/**
 * Integration Service
 * Handles webhook dispatching, API key management, and integration testing
 */
import { BRAND } from '@/config/brand'

// ============================================================================
// Types
// ============================================================================

export interface WebhookDispatchResult {
  success: boolean
  statusCode?: number
  responseTime?: number
  response?: unknown
  error?: string
}

export interface APITestResult {
  success: boolean
  message: string
  data?: unknown
}

// ============================================================================
// Webhook Functions
// ============================================================================

/**
 * Dispatch a webhook to an external URL
 */
export async function dispatchWebhook(
  url: string,
  event: string,
  payload: Record<string, unknown>,
  secret?: string
): Promise<WebhookDispatchResult> {
  try {
    const response = await fetch('/api/webhook/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        event,
        payload,
        secret,
      }),
    })

    const result = await response.json()
    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Test a webhook endpoint
 */
export async function testWebhook(
  url: string,
  secret?: string,
  type: string = 'ping'
): Promise<WebhookDispatchResult> {
  try {
    const response = await fetch('/api/webhook/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, secret, type }),
    })

    const result = await response.json()
    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get webhook events
 */
export async function getWebhookEvents(
  webhookId?: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ events: unknown[]; total: number }> {
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (webhookId) {
      params.set('webhookId', webhookId)
    }

    const response = await fetch(`/api/webhook/events?${params}`)
    const result = await response.json()
    return result
  } catch {
    return { events: [], total: 0 }
  }
}

// ============================================================================
// API Testing Functions
// ============================================================================

/**
 * Test Slack webhook
 */
export async function testSlackWebhook(webhookUrl: string): Promise<APITestResult> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: `Test message from ${BRAND.name} Integration Hub`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${BRAND.name} Integration Test*\nThis is a test message to verify your Slack webhook is working correctly.`,
            },
          },
        ],
      }),
      mode: 'no-cors',
    })

    // no-cors mode doesn't give us response details
    return {
      success: true,
      message: 'Test message sent to Slack. Check your channel!',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send test message',
    }
  }
}

/**
 * Test Discord webhook
 */
export async function testDiscordWebhook(webhookUrl: string): Promise<APITestResult> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `Test message from ${BRAND.name} Integration Hub`,
        embeds: [
          {
            title: 'Integration Test',
            description: 'This is a test message to verify your Discord webhook is working correctly.',
            color: 0xD4A574, // Rose gold color
            footer: {
              text: `${BRAND.name} Integration Hub`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      mode: 'no-cors',
    })

    return {
      success: true,
      message: 'Test message sent to Discord. Check your channel!',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send test message',
    }
  }
}

/**
 * Test Notion API
 */
export async function testNotionAPI(apiKey: string): Promise<APITestResult> {
  try {
    const response = await fetch('https://api.notion.com/v1/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
      },
    })

    if (response.ok) {
      const data = await response.json()
      return {
        success: true,
        message: `Connected as: ${data.name || data.id}`,
        data,
      }
    } else {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      return {
        success: false,
        message: error.message || `HTTP ${response.status}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Notion',
    }
  }
}

/**
 * Test Linear API
 */
export async function testLinearAPI(apiKey: string): Promise<APITestResult> {
  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query {
            viewer {
              id
              name
              email
            }
          }
        `,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.data?.viewer) {
        return {
          success: true,
          message: `Connected as: ${data.data.viewer.name || data.data.viewer.email}`,
          data: data.data.viewer,
        }
      } else {
        return {
          success: false,
          message: data.errors?.[0]?.message || 'Invalid API key',
        }
      }
    } else {
      return {
        success: false,
        message: `HTTP ${response.status}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Linear',
    }
  }
}

// ============================================================================
// Integration Dispatch Functions
// ============================================================================

/**
 * Send a message to Slack
 */
export async function sendToSlack(
  webhookUrl: string,
  message: string,
  options?: {
    blocks?: unknown[]
    attachments?: unknown[]
    channel?: string
    username?: string
    icon_emoji?: string
  }
): Promise<boolean> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message,
        ...options,
      }),
      mode: 'no-cors',
    })
    return true
  } catch {
    return false
  }
}

/**
 * Send a message to Discord
 */
export async function sendToDiscord(
  webhookUrl: string,
  content: string,
  options?: {
    embeds?: Array<{
      title?: string
      description?: string
      color?: number
      fields?: Array<{ name: string; value: string; inline?: boolean }>
      footer?: { text: string }
      timestamp?: string
    }>
    username?: string
    avatar_url?: string
  }
): Promise<boolean> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        ...options,
      }),
      mode: 'no-cors',
    })
    return true
  } catch {
    return false
  }
}

/**
 * Create a page in Notion
 */
export async function createNotionPage(
  apiKey: string,
  parentId: string,
  title: string,
  content?: string
): Promise<{ success: boolean; pageId?: string; error?: string }> {
  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: parentId },
        properties: {
          Name: {
            title: [{ text: { content: title } }],
          },
        },
        children: content
          ? [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ text: { content } }],
                },
              },
            ]
          : [],
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return { success: true, pageId: data.id }
    } else {
      const error = await response.json().catch(() => ({}))
      return { success: false, error: error.message || `HTTP ${response.status}` }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create an issue in Linear
 */
export async function createLinearIssue(
  apiKey: string,
  teamId: string,
  title: string,
  description?: string
): Promise<{ success: boolean; issueId?: string; error?: string }> {
  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
              }
            }
          }
        `,
        variables: {
          input: {
            teamId,
            title,
            description,
          },
        },
      }),
    })

    const data = await response.json()

    if (data.data?.issueCreate?.success) {
      return {
        success: true,
        issueId: data.data.issueCreate.issue.identifier,
      }
    } else {
      return {
        success: false,
        error: data.errors?.[0]?.message || 'Failed to create issue',
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Event Emitter for Integration Events
// ============================================================================

type IntegrationEventType =
  | 'chat.message'
  | 'chat.complete'
  | 'agent.start'
  | 'agent.complete'
  | 'agent.error'
  | 'research.complete'
  | 'company.created'
  | 'task.created'
  | 'task.complete'
  | 'file.created'
  | 'file.updated'

interface WebhookConfig {
  id: string
  name: string
  url: string
  secret: string
  events: string[]
  enabled: boolean
}

const WEBHOOKS_STORAGE_KEY = 'alabobai-webhooks'
const ENCRYPTION_KEY = 'alabobai-secure-2024'

function decryptData(data: string): string {
  try {
    const decoded = atob(data)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
      )
    }
    return atob(result)
  } catch {
    return data
  }
}

function loadWebhooks(): WebhookConfig[] {
  try {
    const stored = localStorage.getItem(WEBHOOKS_STORAGE_KEY)
    if (stored) {
      const decrypted = decryptData(stored)
      return JSON.parse(decrypted)
    }
  } catch {
    console.error('[Integrations] Failed to load webhooks')
  }
  return []
}

/**
 * Emit an event to all subscribed webhooks
 */
export async function emitIntegrationEvent(
  event: IntegrationEventType,
  data: Record<string, unknown>
): Promise<void> {
  const webhooks = loadWebhooks()
  const matchingWebhooks = webhooks.filter(
    (w) => w.enabled && w.events.includes(event)
  )

  await Promise.all(
    matchingWebhooks.map((webhook) =>
      dispatchWebhook(webhook.url, event, data, webhook.secret).catch((error) =>
        console.error(`[Integrations] Failed to dispatch to ${webhook.name}:`, error)
      )
    )
  )
}

// Export convenience function for other parts of the app
export const integrationService = {
  dispatchWebhook,
  testWebhook,
  getWebhookEvents,
  testSlackWebhook,
  testDiscordWebhook,
  testNotionAPI,
  testLinearAPI,
  sendToSlack,
  sendToDiscord,
  createNotionPage,
  createLinearIssue,
  emitIntegrationEvent,
}

export default integrationService
