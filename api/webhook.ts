export const config = {
  runtime: 'edge',
};

// Webhook payload types
interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
  webhookId?: string;
}

interface WebhookConfig {
  id: string;
  secret: string;
  events: string[];
  enabled: boolean;
  url: string;
}

// HMAC signature verification for webhook security
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );

    const signatureBuffer = encoder.encode(signature);
    const payloadBuffer = encoder.encode(payload);
    const expectedSignature = await crypto.subtle.sign('HMAC', key, payloadBuffer);

    // Compare signatures (timing-safe comparison)
    const expectedArray = new Uint8Array(expectedSignature);
    const signatureArray = new Uint8Array(signatureBuffer.buffer);

    if (expectedArray.length !== signatureArray.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < expectedArray.length; i++) {
      result |= expectedArray[i] ^ signatureArray[i];
    }
    return result === 0;
  } catch {
    return false;
  }
}

// Generate webhook signature
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// In-memory storage for webhook events (in production, use a database)
const webhookEvents: Array<{
  id: string;
  webhookId: string;
  event: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  responseCode?: number;
  responseTime?: number;
}> = [];

// Default webhook handler
export default async function handler(req: Request) {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret, X-Webhook-Event, X-Webhook-Signature',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // GET /api/webhook - List webhook events or check health
    if (req.method === 'GET' && pathParts.length === 2) {
      return new Response(JSON.stringify({
        status: 'healthy',
        message: 'Webhook endpoint is active',
        timestamp: new Date().toISOString(),
        recentEvents: webhookEvents.slice(-10),
      }), {
        headers: corsHeaders,
      });
    }

    // GET /api/webhook/:id - Get specific webhook info
    if (req.method === 'GET' && pathParts.length === 3) {
      const webhookId = pathParts[2];
      const events = webhookEvents.filter(e => e.webhookId === webhookId);

      return new Response(JSON.stringify({
        webhookId,
        eventCount: events.length,
        recentEvents: events.slice(-20),
      }), {
        headers: corsHeaders,
      });
    }

    // POST /api/webhook - Receive incoming webhook (from external services)
    if (req.method === 'POST' && pathParts.length === 2) {
      const body = await req.text();
      const signature = req.headers.get('X-Webhook-Signature') || req.headers.get('x-hub-signature-256');
      const eventType = req.headers.get('X-Webhook-Event') || req.headers.get('X-GitHub-Event') || 'unknown';

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { raw: body };
      }

      // Log the incoming webhook
      const eventId = crypto.randomUUID();
      const webhookEvent = {
        id: eventId,
        webhookId: 'incoming',
        event: eventType,
        timestamp: new Date(),
        payload,
        status: 'success' as const,
        responseCode: 200,
      };

      webhookEvents.push(webhookEvent);

      // Keep only last 1000 events in memory
      while (webhookEvents.length > 1000) {
        webhookEvents.shift();
      }

      // Process the webhook based on event type
      let processed = false;
      let processingResult: Record<string, unknown> = {};

      switch (eventType) {
        case 'push':
        case 'github.push':
          // GitHub push event
          processingResult = {
            type: 'github_push',
            repository: payload.repository,
            pusher: payload.pusher,
            commits: payload.commits,
          };
          processed = true;
          break;

        case 'pull_request':
        case 'github.pull_request':
          // GitHub PR event
          processingResult = {
            type: 'github_pr',
            action: payload.action,
            number: payload.number,
            title: (payload.pull_request as Record<string, unknown>)?.title,
          };
          processed = true;
          break;

        case 'message':
        case 'slack.message':
          // Slack message event
          processingResult = {
            type: 'slack_message',
            channel: payload.channel,
            user: payload.user,
            text: payload.text,
          };
          processed = true;
          break;

        default:
          // Generic webhook - just acknowledge receipt
          processingResult = {
            type: 'generic',
            eventType,
            payloadKeys: Object.keys(payload),
          };
          processed = true;
      }

      return new Response(JSON.stringify({
        success: true,
        eventId,
        message: 'Webhook received and processed',
        processed,
        result: processingResult,
        timestamp: new Date().toISOString(),
      }), {
        headers: corsHeaders,
      });
    }

    // POST /api/webhook/:id - Receive webhook for specific webhook ID
    if (req.method === 'POST' && pathParts.length === 3) {
      const webhookId = pathParts[2];
      const body = await req.text();
      const providedSecret = req.headers.get('X-Webhook-Secret');
      const eventType = req.headers.get('X-Webhook-Event') || 'custom';

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { raw: body };
      }

      // Log the event
      const eventId = crypto.randomUUID();
      const webhookEvent = {
        id: eventId,
        webhookId,
        event: eventType,
        timestamp: new Date(),
        payload,
        status: 'success' as const,
        responseCode: 200,
      };

      webhookEvents.push(webhookEvent);

      // Keep only last 1000 events
      while (webhookEvents.length > 1000) {
        webhookEvents.shift();
      }

      return new Response(JSON.stringify({
        success: true,
        eventId,
        webhookId,
        message: 'Webhook event recorded',
        timestamp: new Date().toISOString(),
      }), {
        headers: corsHeaders,
      });
    }

    // POST /api/webhook/dispatch - Dispatch webhook to external URL (outgoing)
    if (req.method === 'POST' && pathParts[2] === 'dispatch') {
      const { url, secret, event, payload, headers: customHeaders } = await req.json() as {
        url: string;
        secret?: string;
        event: string;
        payload: Record<string, unknown>;
        headers?: Record<string, string>;
      };

      if (!url || !event || !payload) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: url, event, payload',
        }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const webhookPayload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = secret ? await generateSignature(payloadString, secret) : undefined;

      const startTime = Date.now();

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            ...(signature && { 'X-Webhook-Signature': signature }),
            ...(customHeaders || {}),
          },
          body: payloadString,
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Log the dispatch
        const eventId = crypto.randomUUID();
        webhookEvents.push({
          id: eventId,
          webhookId: 'outgoing',
          event,
          timestamp: new Date(),
          payload: webhookPayload,
          status: response.ok ? 'success' : 'error',
          responseCode: response.status,
          responseTime,
        });

        let responseBody: string | Record<string, unknown>;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = await response.text();
        }

        return new Response(JSON.stringify({
          success: response.ok,
          eventId,
          statusCode: response.status,
          responseTime,
          response: responseBody,
        }), {
          headers: corsHeaders,
        });
      } catch (error) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Log the failure
        const eventId = crypto.randomUUID();
        webhookEvents.push({
          id: eventId,
          webhookId: 'outgoing',
          event,
          timestamp: new Date(),
          payload: webhookPayload,
          status: 'error',
          responseCode: 0,
          responseTime,
        });

        return new Response(JSON.stringify({
          success: false,
          eventId,
          error: error instanceof Error ? error.message : 'Failed to dispatch webhook',
          responseTime,
        }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // POST /api/webhook/test - Test webhook endpoint
    if (req.method === 'POST' && pathParts[2] === 'test') {
      const { url, secret, type = 'ping' } = await req.json() as {
        url: string;
        secret?: string;
        type?: string;
      };

      if (!url) {
        return new Response(JSON.stringify({
          error: 'Missing required field: url',
        }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const testPayload = {
        event: 'test.' + type,
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from Alabobai',
          type,
          source: 'integration-hub',
        },
      };

      const payloadString = JSON.stringify(testPayload);
      const signature = secret ? await generateSignature(payloadString, secret) : undefined;

      const startTime = Date.now();

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': 'test.' + type,
            ...(signature && { 'X-Webhook-Signature': signature }),
          },
          body: payloadString,
        });

        const endTime = Date.now();

        return new Response(JSON.stringify({
          success: true,
          statusCode: response.status,
          responseTime: endTime - startTime,
          message: response.ok ? 'Test webhook sent successfully' : 'Webhook delivered but received non-2xx response',
        }), {
          headers: corsHeaders,
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send test webhook',
        }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // GET /api/webhook/events - List all recorded events
    if (req.method === 'GET' && pathParts[2] === 'events') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const webhookId = url.searchParams.get('webhookId');

      let filteredEvents = webhookEvents;
      if (webhookId) {
        filteredEvents = webhookEvents.filter(e => e.webhookId === webhookId);
      }

      const paginatedEvents = filteredEvents.slice(offset, offset + limit);

      return new Response(JSON.stringify({
        total: filteredEvents.length,
        limit,
        offset,
        events: paginatedEvents,
      }), {
        headers: corsHeaders,
      });
    }

    // DELETE /api/webhook/events - Clear all events
    if (req.method === 'DELETE' && pathParts[2] === 'events') {
      const clearedCount = webhookEvents.length;
      webhookEvents.length = 0;

      return new Response(JSON.stringify({
        success: true,
        message: `Cleared ${clearedCount} events`,
      }), {
        headers: corsHeaders,
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({
      error: 'Not found',
      availableEndpoints: [
        'GET /api/webhook - Health check',
        'GET /api/webhook/:id - Get webhook info',
        'POST /api/webhook - Receive incoming webhook',
        'POST /api/webhook/:id - Receive webhook for specific ID',
        'POST /api/webhook/dispatch - Dispatch outgoing webhook',
        'POST /api/webhook/test - Test webhook endpoint',
        'GET /api/webhook/events - List recorded events',
        'DELETE /api/webhook/events - Clear all events',
      ],
    }), {
      status: 404,
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('Webhook API Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// Named exports for specific webhook event handlers (can be imported by other modules)
export async function dispatchWebhook(
  url: string,
  event: string,
  payload: Record<string, unknown>,
  secret?: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const webhookPayload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  const payloadString = JSON.stringify(webhookPayload);
  const signature = secret ? await generateSignature(payloadString, secret) : undefined;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
        ...(signature && { 'X-Webhook-Signature': signature }),
      },
      body: payloadString,
    });

    return {
      success: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Utility function to send to Slack webhook
export async function sendSlackWebhook(
  webhookUrl: string,
  message: string,
  options?: {
    channel?: string;
    username?: string;
    icon_emoji?: string;
    attachments?: Array<{
      color?: string;
      title?: string;
      text?: string;
      fields?: Array<{ title: string; value: string; short?: boolean }>;
    }>;
  }
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        ...options,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Utility function to send to Discord webhook
export async function sendDiscordWebhook(
  webhookUrl: string,
  content: string,
  options?: {
    username?: string;
    avatar_url?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      color?: number;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string };
      timestamp?: string;
    }>;
  }
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        ...options,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
