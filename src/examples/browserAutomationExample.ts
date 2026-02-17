/**
 * Alabobai Browser Automation Example
 *
 * This file demonstrates how to use the complete browser automation system.
 * Run with: npx tsx src/examples/browserAutomationExample.ts
 */

import express from 'express';
import cors from 'cors';
import { createBrowserSystem } from '../browser/index.js';

async function main() {
  console.log('Starting Alabobai Browser Automation Example...\n');

  // ============================================================================
  // 1. Create the complete browser system
  // ============================================================================

  const system = createBrowserSystem({
    safety: {
      // Only allow specific domains (remove for no restrictions)
      domainAllowlist: undefined,
      // Block localhost and internal IPs
      domainBlocklist: ['localhost', '127.0.0.1', '0.0.0.0'],
      // Rate limit actions
      maxActionsPerMinute: 60,
      // Session timeout (30 minutes)
      sessionTimeout: 30 * 60 * 1000,
      // Max concurrent sessions
      maxConcurrentSessions: 5,
      // Actions requiring confirmation
      requireConfirmation: ['evaluate', 'set-cookie', 'clear-storage'],
    },
    agent: {
      model: 'claude-sonnet-4-20250514',
      maxRetries: 3,
      screenshotOnAction: true,
      maxStepsPerTask: 50,
    },
    webSocketPort: 3001,
  });

  const { browserService, agentService, router, wsHandler } = system;

  // ============================================================================
  // 2. Set up Express server with browser routes
  // ============================================================================

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Mount browser routes
  app.use('/api/browser', router);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      sessions: browserService.getAllSessions().length,
      wsClients: wsHandler.getClientCount(),
    });
  });

  const PORT = process.env.PORT || 8080;
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket server on ws://localhost:3001/ws/browser`);
    console.log('\nAvailable endpoints:');
    console.log('  POST /api/browser/session - Create browser session');
    console.log('  DELETE /api/browser/session/:id - Close session');
    console.log('  POST /api/browser/navigate - Navigate to URL');
    console.log('  POST /api/browser/action - Execute action');
    console.log('  GET /api/browser/screenshot/:id - Get screenshot');
    console.log('  GET /api/browser/dom/:id - Get DOM snapshot');
    console.log('  POST /api/browser/evaluate - Run JavaScript');
    console.log('\n');
  });

  // ============================================================================
  // 3. Set up event listeners
  // ============================================================================

  browserService.on('session:created', (data) => {
    console.log(`[Event] Session created: ${data.sessionId}`);
  });

  browserService.on('session:closed', (data) => {
    console.log(`[Event] Session closed: ${data.sessionId}`);
  });

  browserService.on('navigation', (data) => {
    console.log(`[Event] Navigation: ${data.url} - ${data.title}`);
  });

  browserService.on('action', (action) => {
    console.log(`[Event] Action: ${action.type} - ${action.success ? 'success' : 'failed'}`);
  });

  agentService.on('task:started', (data) => {
    console.log(`[Agent] Task started: ${data.goal}`);
  });

  agentService.on('step:completed', (data) => {
    console.log(`[Agent] Step completed: ${data.step.description}`);
  });

  agentService.on('thought', (data) => {
    console.log(`[Agent] ${data.thought.type}: ${data.thought.content}`);
  });

  // ============================================================================
  // 4. Demo: Create a session and perform actions
  // ============================================================================

  console.log('\n--- Starting Demo ---\n');

  try {
    // Create a session
    const session = await browserService.createSession({
      headless: true,
      viewport: { width: 1280, height: 720 },
    });
    console.log(`Created session: ${session.id}`);

    // Navigate to a website
    const navResult = await browserService.navigate(session.id, 'https://example.com');
    console.log(`Navigated to: ${navResult.data?.url}`);

    // Take a screenshot
    const ssResult = await browserService.screenshot(session.id);
    if (ssResult.success && ssResult.data) {
      console.log(`Screenshot captured: ${ssResult.data.width}x${ssResult.data.height}`);
    }

    // Get DOM snapshot
    const domResult = await browserService.getDOM(session.id);
    if (domResult.success && domResult.data) {
      console.log(`DOM extracted: ${domResult.data.elements.length} interactive elements`);
      console.log(`  Title: ${domResult.data.title}`);
      console.log(`  Links: ${domResult.data.links.length}`);
    }

    // Scroll the page
    const scrollResult = await browserService.scroll(session.id, { deltaY: 300 });
    console.log(`Scrolled: ${scrollResult.success ? 'success' : 'failed'}`);

    // Get action history
    const history = browserService.getActionHistory(session.id);
    console.log(`Action history: ${history.length} actions`);

    // Close session
    await browserService.closeSession(session.id);
    console.log('Session closed');

  } catch (error) {
    console.error('Demo error:', error);
  }

  // ============================================================================
  // 5. Demo: AI-powered task execution
  // ============================================================================

  console.log('\n--- Starting AI Agent Demo ---\n');

  try {
    // Create a new session for AI agent
    const aiSession = await browserService.createSession({
      headless: true,
      viewport: { width: 1280, height: 720 },
    });

    // Execute an AI task
    console.log('Starting AI task...');
    const taskResult = await agentService.executeTask(aiSession.id, {
      goal: 'Navigate to example.com and find the main heading text',
      preferences: {
        speed: 'normal',
        verbosity: 'detailed',
      },
    });

    console.log(`Task completed: ${taskResult.status}`);
    console.log(`Steps executed: ${taskResult.results.length}`);

    // Get thought log
    const thoughts = agentService.getThoughtLog(taskResult.id);
    console.log(`Agent thoughts: ${thoughts.length}`);
    thoughts.forEach(t => {
      console.log(`  [${t.type}] ${t.content}`);
    });

    await browserService.closeSession(aiSession.id);

  } catch (error) {
    console.error('AI Agent demo error:', error);
  }

  console.log('\n--- Demo Complete ---\n');
  console.log('Server is still running. Press Ctrl+C to exit.\n');

  // ============================================================================
  // 6. Graceful shutdown
  // ============================================================================

  const shutdown = async () => {
    console.log('\nShutting down...');

    await system.cleanup();
    server.close();

    console.log('Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the example
main().catch(console.error);
