/**
 * ============================================================================
 * ALABOBAI EXECUTION STREAMING SPECIFICATION
 * ============================================================================
 *
 * Version: 1.0.0
 * Date: 2026-02-08
 *
 * This specification defines the real-time execution streaming protocol
 * for the Alabobai company builder platform, enabling Manus AI-like
 * visibility into agent work including browser automation, terminal
 * operations, file management, and agent reasoning.
 *
 * ============================================================================
 */

import { z } from 'zod';

// ============================================================================
// SECTION 1: WEBSOCKET PROTOCOL
// ============================================================================

/**
 * 1.1 CONNECTION HANDSHAKE
 *
 * The WebSocket connection follows a structured handshake process:
 *
 * 1. Client initiates connection: wss://api.alabobai.com/v1/stream
 * 2. Server sends CONNECTION_INIT requiring authentication
 * 3. Client responds with CONNECTION_AUTH containing credentials
 * 4. Server sends CONNECTION_ACK or CONNECTION_ERROR
 * 5. Client can then SUBSCRIBE to specific streams
 *
 * Connection URL Format:
 * wss://api.alabobai.com/v1/stream?session={sessionId}&version=1
 */

export const ConnectionState = z.enum([
  'connecting',
  'authenticating',
  'connected',
  'subscribed',
  'reconnecting',
  'disconnected',
  'error'
]);
export type ConnectionState = z.infer<typeof ConnectionState>;

// ============================================================================
// 1.2 BASE MESSAGE FORMAT
// ============================================================================

/**
 * All WebSocket messages follow this base structure.
 * Messages are JSON-encoded with optional binary attachments.
 */
export const BaseMessageSchema = z.object({
  /** Unique message identifier (UUIDv4) */
  id: z.string().uuid(),

  /** Message type for routing */
  type: z.string(),

  /** ISO 8601 timestamp with milliseconds */
  timestamp: z.string().datetime(),

  /** Session identifier for multi-session support */
  sessionId: z.string(),

  /** Sequence number for ordering and gap detection */
  sequence: z.number().int().nonnegative(),

  /** Optional correlation ID for request-response patterns */
  correlationId: z.string().uuid().optional(),

  /** Message payload (type-specific) */
  payload: z.record(z.unknown()),

  /** Optional metadata */
  metadata: z.object({
    /** Agent ID if message originated from agent */
    agentId: z.string().optional(),
    /** Task ID if message relates to a task */
    taskId: z.string().optional(),
    /** Priority for queue ordering */
    priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
    /** Whether this message requires acknowledgment */
    requiresAck: z.boolean().default(false),
    /** Compression algorithm used */
    compression: z.enum(['none', 'gzip', 'lz4', 'zstd']).default('none'),
    /** If payload is chunked, chunk info */
    chunk: z.object({
      index: z.number().int().nonnegative(),
      total: z.number().int().positive(),
      hash: z.string()
    }).optional()
  }).optional()
});
export type BaseMessage = z.infer<typeof BaseMessageSchema>;

// ============================================================================
// 1.3 MESSAGE TYPES
// ============================================================================

export const MessageType = z.enum([
  // Connection lifecycle
  'CONNECTION_INIT',
  'CONNECTION_AUTH',
  'CONNECTION_ACK',
  'CONNECTION_ERROR',
  'CONNECTION_CLOSE',

  // Subscription management
  'SUBSCRIBE',
  'UNSUBSCRIBE',
  'SUBSCRIPTION_ACK',
  'SUBSCRIPTION_ERROR',

  // Heartbeat/keepalive
  'PING',
  'PONG',

  // Browser events
  'BROWSER_SCREENSHOT',
  'BROWSER_DOM_CHANGE',
  'BROWSER_NAVIGATION',
  'BROWSER_CLICK',
  'BROWSER_INPUT',
  'BROWSER_SCROLL',
  'BROWSER_FORM_FILL',
  'BROWSER_PAGE_STATE',
  'BROWSER_CONSOLE',
  'BROWSER_NETWORK',
  'BROWSER_ERROR',

  // Terminal events
  'TERMINAL_COMMAND_START',
  'TERMINAL_STDOUT',
  'TERMINAL_STDERR',
  'TERMINAL_COMMAND_END',
  'TERMINAL_CWD_CHANGE',
  'TERMINAL_ENV_CHANGE',

  // File events
  'FILE_CREATE',
  'FILE_MODIFY',
  'FILE_DELETE',
  'FILE_RENAME',
  'FILE_DIFF',
  'FILE_BINARY',
  'DIRECTORY_CREATE',
  'DIRECTORY_DELETE',
  'DIRECTORY_TREE',

  // Agent events
  'AGENT_STATE_CHANGE',
  'AGENT_THINKING',
  'AGENT_TOOL_INVOKE',
  'AGENT_TOOL_RESULT',
  'AGENT_REASONING',
  'AGENT_PROGRESS',
  'AGENT_ERROR',
  'AGENT_COLLABORATION',

  // Task events
  'TASK_CREATED',
  'TASK_STARTED',
  'TASK_PROGRESS',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'TASK_APPROVAL_REQUIRED',

  // Acknowledgment
  'ACK',
  'NACK'
]);
export type MessageType = z.infer<typeof MessageType>;

// ============================================================================
// 1.4 HEARTBEAT/KEEPALIVE PROTOCOL
// ============================================================================

/**
 * Heartbeat Protocol:
 *
 * - Server sends PING every 30 seconds
 * - Client must respond with PONG within 10 seconds
 * - If no PONG received, connection is considered dead
 * - Client can also send PING to check server health
 * - Heartbeat includes latency measurement
 */

export const PingMessageSchema = z.object({
  type: z.literal('PING'),
  timestamp: z.string().datetime(),
  serverTime: z.number(), // Unix timestamp in ms for RTT calculation
  sequence: z.number().int()
});
export type PingMessage = z.infer<typeof PingMessageSchema>;

export const PongMessageSchema = z.object({
  type: z.literal('PONG'),
  timestamp: z.string().datetime(),
  echoTime: z.number(), // Echo back serverTime from PING
  clientTime: z.number(), // Client's current time for RTT
  sequence: z.number().int()
});
export type PongMessage = z.infer<typeof PongMessageSchema>;

// ============================================================================
// 1.5 RECONNECTION STRATEGY
// ============================================================================

/**
 * Reconnection Configuration
 *
 * The client implements exponential backoff with jitter:
 *
 * 1. Initial delay: 1000ms
 * 2. Maximum delay: 30000ms
 * 3. Backoff multiplier: 2.0
 * 4. Jitter: 0-1000ms random
 * 5. Maximum attempts: 10
 *
 * On reconnection:
 * - Client sends last received sequence number
 * - Server replays missed messages (up to 5 minutes buffer)
 * - If gap too large, server sends RESYNC_REQUIRED
 */

export const ReconnectionConfigSchema = z.object({
  initialDelayMs: z.number().default(1000),
  maxDelayMs: z.number().default(30000),
  backoffMultiplier: z.number().default(2.0),
  jitterMs: z.number().default(1000),
  maxAttempts: z.number().default(10),

  /** Duration in ms to buffer messages for replay */
  replayBufferMs: z.number().default(300000), // 5 minutes

  /** Whether to attempt reconnection on close */
  autoReconnect: z.boolean().default(true),

  /** Close codes that should not trigger reconnection */
  noReconnectCodes: z.array(z.number()).default([1000, 1001, 4001, 4003])
});
export type ReconnectionConfig = z.infer<typeof ReconnectionConfigSchema>;

export const ReconnectionRequestSchema = z.object({
  type: z.literal('RECONNECT'),
  lastSequence: z.number().int(),
  sessionId: z.string(),
  subscriptions: z.array(z.string())
});
export type ReconnectionRequest = z.infer<typeof ReconnectionRequestSchema>;

// ============================================================================
// 1.6 SUBSCRIPTION MANAGEMENT
// ============================================================================

export const SubscriptionTargetSchema = z.object({
  /** Stream type to subscribe to */
  stream: z.enum([
    'browser',
    'terminal',
    'file',
    'agent',
    'task',
    'all'
  ]),

  /** Optional filter for specific agent/task */
  filter: z.object({
    agentId: z.string().optional(),
    taskId: z.string().optional(),
    sessionId: z.string().optional()
  }).optional(),

  /** Event types to include (empty = all) */
  events: z.array(z.string()).optional(),

  /** Throttle rate in ms (0 = no throttle) */
  throttleMs: z.number().default(0),

  /** Whether to include historical events */
  includeHistory: z.boolean().default(false),

  /** How far back to include history (ms) */
  historyDurationMs: z.number().default(60000)
});
export type SubscriptionTarget = z.infer<typeof SubscriptionTargetSchema>;

// ============================================================================
// SECTION 2: BROWSER STREAM EVENTS
// ============================================================================

/**
 * Browser stream events provide real-time visibility into browser automation
 * including screenshots, DOM changes, navigation, and user interactions.
 */

// ============================================================================
// 2.1 SCREENSHOT CAPTURE
// ============================================================================

export const ScreenshotFormatSchema = z.enum([
  'png',      // Lossless, larger
  'jpeg',     // Lossy, smaller
  'webp'      // Best compression/quality ratio
]);
export type ScreenshotFormat = z.infer<typeof ScreenshotFormatSchema>;

export const ScreenshotQualitySchema = z.object({
  /** Image format */
  format: ScreenshotFormatSchema.default('webp'),

  /** JPEG/WebP quality (1-100) */
  quality: z.number().min(1).max(100).default(80),

  /** Target width (height auto-calculated to maintain aspect ratio) */
  width: z.number().int().min(320).max(3840).default(1280),

  /** Target height (optional, defaults to maintain aspect ratio) */
  height: z.number().int().min(240).max(2160).optional(),

  /** Frames per second for continuous capture */
  fps: z.number().min(0.1).max(30).default(2),

  /** Whether to capture full page or viewport only */
  fullPage: z.boolean().default(false),

  /** Whether to hide scrollbars */
  hideScrollbars: z.boolean().default(true),

  /** Optional element selector to capture */
  selector: z.string().optional(),

  /** Scaling factor (1 = 100%, 2 = 200% for retina) */
  scale: z.number().min(0.5).max(2).default(1)
});
export type ScreenshotQuality = z.infer<typeof ScreenshotQualitySchema>;

export const BrowserScreenshotEventSchema = z.object({
  type: z.literal('BROWSER_SCREENSHOT'),

  payload: z.object({
    /** Unique screenshot identifier */
    id: z.string().uuid(),

    /** Timestamp of capture */
    capturedAt: z.string().datetime(),

    /** Current page URL */
    url: z.string().url(),

    /** Page title */
    title: z.string(),

    /** Base64 encoded image data */
    imageData: z.string(),

    /** Image format */
    format: ScreenshotFormatSchema,

    /** Original dimensions before any scaling */
    dimensions: z.object({
      width: z.number().int(),
      height: z.number().int(),
      devicePixelRatio: z.number()
    }),

    /** Viewport information */
    viewport: z.object({
      width: z.number().int(),
      height: z.number().int(),
      scrollX: z.number(),
      scrollY: z.number(),
      pageWidth: z.number().int(),
      pageHeight: z.number().int()
    }),

    /** Size of the encoded image in bytes */
    sizeBytes: z.number().int(),

    /** Whether this is a delta from previous (for video-like streaming) */
    isDelta: z.boolean().default(false),

    /** Previous screenshot ID if isDelta */
    deltaFrom: z.string().uuid().optional(),

    /** Regions that changed (for delta optimization) */
    changedRegions: z.array(z.object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int(),
      height: z.number().int()
    })).optional(),

    /** Cursor position at time of capture */
    cursor: z.object({
      x: z.number(),
      y: z.number(),
      visible: z.boolean()
    }).optional(),

    /** Active element info */
    activeElement: z.object({
      tagName: z.string(),
      id: z.string().optional(),
      className: z.string().optional(),
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      })
    }).optional()
  })
});
export type BrowserScreenshotEvent = z.infer<typeof BrowserScreenshotEventSchema>;

// ============================================================================
// 2.2 DOM CHANGE EVENTS
// ============================================================================

export const DOMChangeTypeSchema = z.enum([
  'attribute',      // Attribute changed on element
  'characterData',  // Text content changed
  'childList',      // Children added/removed
  'subtree'         // Deep subtree change
]);
export type DOMChangeType = z.infer<typeof DOMChangeTypeSchema>;

export const BrowserDOMChangeEventSchema = z.object({
  type: z.literal('BROWSER_DOM_CHANGE'),

  payload: z.object({
    /** Unique change identifier */
    id: z.string().uuid(),

    /** Type of DOM change */
    changeType: DOMChangeTypeSchema,

    /** CSS selector path to the changed element */
    targetSelector: z.string(),

    /** XPath to the changed element */
    targetXPath: z.string(),

    /** Element tag name */
    tagName: z.string(),

    /** Element ID if present */
    elementId: z.string().optional(),

    /** Element classes */
    elementClasses: z.array(z.string()).optional(),

    /** For attribute changes */
    attributeChange: z.object({
      name: z.string(),
      oldValue: z.string().nullable(),
      newValue: z.string().nullable()
    }).optional(),

    /** For text content changes */
    textChange: z.object({
      oldValue: z.string(),
      newValue: z.string()
    }).optional(),

    /** For child list changes */
    childListChange: z.object({
      addedNodes: z.array(z.object({
        tagName: z.string(),
        id: z.string().optional(),
        textContent: z.string().optional()
      })),
      removedNodes: z.array(z.object({
        tagName: z.string(),
        id: z.string().optional(),
        textContent: z.string().optional()
      }))
    }).optional(),

    /** Mutation observer record count (for batching) */
    batchSize: z.number().int().default(1),

    /** Time since last DOM change in ms */
    timeSinceLastChange: z.number().optional()
  })
});
export type BrowserDOMChangeEvent = z.infer<typeof BrowserDOMChangeEventSchema>;

// ============================================================================
// 2.3 NAVIGATION EVENTS
// ============================================================================

export const NavigationTypeSchema = z.enum([
  'navigate',       // New navigation
  'reload',         // Page reload
  'back_forward',   // History navigation
  'form_submit',    // Form submission
  'link_click',     // Link clicked
  'redirect',       // HTTP redirect
  'push_state',     // History.pushState
  'replace_state',  // History.replaceState
  'hash_change'     // Hash change
]);
export type NavigationType = z.infer<typeof NavigationTypeSchema>;

export const BrowserNavigationEventSchema = z.object({
  type: z.literal('BROWSER_NAVIGATION'),

  payload: z.object({
    /** Navigation identifier */
    id: z.string().uuid(),

    /** Navigation type */
    navigationType: NavigationTypeSchema,

    /** Previous URL */
    fromUrl: z.string().url().optional(),

    /** New URL */
    toUrl: z.string().url(),

    /** Previous page title */
    fromTitle: z.string().optional(),

    /** New page title */
    toTitle: z.string(),

    /** HTTP status code (if applicable) */
    statusCode: z.number().int().optional(),

    /** Whether navigation was initiated by user or script */
    initiatedBy: z.enum(['user', 'script', 'agent']),

    /** Time to navigate in ms */
    navigationTime: z.number().optional(),

    /** Referrer if any */
    referrer: z.string().optional(),

    /** Frame ID if not main frame */
    frameId: z.string().optional(),

    /** Whether this is the main frame */
    isMainFrame: z.boolean().default(true)
  })
});
export type BrowserNavigationEvent = z.infer<typeof BrowserNavigationEventSchema>;

// ============================================================================
// 2.4 CLICK/INPUT EVENTS WITH COORDINATES
// ============================================================================

export const BrowserClickEventSchema = z.object({
  type: z.literal('BROWSER_CLICK'),

  payload: z.object({
    /** Click identifier */
    id: z.string().uuid(),

    /** Click coordinates (viewport-relative) */
    x: z.number(),
    y: z.number(),

    /** Click coordinates (page-relative) */
    pageX: z.number(),
    pageY: z.number(),

    /** Mouse button */
    button: z.enum(['left', 'middle', 'right']),

    /** Click type */
    clickType: z.enum(['single', 'double', 'context']),

    /** Target element selector */
    targetSelector: z.string(),

    /** Target element tag */
    targetTag: z.string(),

    /** Target element text (truncated) */
    targetText: z.string().max(200).optional(),

    /** Target element bounds */
    targetBounds: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }),

    /** Modifier keys held */
    modifiers: z.object({
      ctrl: z.boolean().default(false),
      shift: z.boolean().default(false),
      alt: z.boolean().default(false),
      meta: z.boolean().default(false)
    }),

    /** Whether click was performed by agent */
    isAgentAction: z.boolean().default(true),

    /** Screenshot thumbnail at time of click */
    thumbnail: z.string().optional(),

    /** Visual indicator overlay position */
    indicator: z.object({
      x: z.number(),
      y: z.number(),
      radius: z.number().default(20)
    }).optional()
  })
});
export type BrowserClickEvent = z.infer<typeof BrowserClickEventSchema>;

export const BrowserInputEventSchema = z.object({
  type: z.literal('BROWSER_INPUT'),

  payload: z.object({
    /** Input event identifier */
    id: z.string().uuid(),

    /** Input type */
    inputType: z.enum([
      'keydown',
      'keyup',
      'keypress',
      'input',
      'paste',
      'cut',
      'copy'
    ]),

    /** Key code (for key events) */
    keyCode: z.string().optional(),

    /** Key name */
    key: z.string().optional(),

    /** Character input (may differ from key) */
    character: z.string().optional(),

    /** Full text being typed (accumulated) */
    accumulatedText: z.string().optional(),

    /** Target element selector */
    targetSelector: z.string(),

    /** Target element type */
    targetType: z.enum([
      'text',
      'password',
      'email',
      'number',
      'tel',
      'url',
      'search',
      'textarea',
      'contenteditable',
      'other'
    ]),

    /** Current value of input (masked for passwords) */
    currentValue: z.string(),

    /** Whether value is masked (password) */
    isMasked: z.boolean().default(false),

    /** Selection range */
    selection: z.object({
      start: z.number().int(),
      end: z.number().int()
    }).optional(),

    /** Modifier keys */
    modifiers: z.object({
      ctrl: z.boolean().default(false),
      shift: z.boolean().default(false),
      alt: z.boolean().default(false),
      meta: z.boolean().default(false)
    }),

    /** Whether this was an agent action */
    isAgentAction: z.boolean().default(true)
  })
});
export type BrowserInputEvent = z.infer<typeof BrowserInputEventSchema>;

// ============================================================================
// 2.5 FORM FILL EVENTS
// ============================================================================

export const FormFieldSchema = z.object({
  /** Field name attribute */
  name: z.string(),

  /** Field ID */
  id: z.string().optional(),

  /** Field type */
  type: z.string(),

  /** Field label (from label element or aria-label) */
  label: z.string().optional(),

  /** Value being filled (masked for sensitive) */
  value: z.string(),

  /** Whether value is masked */
  isMasked: z.boolean().default(false),

  /** Field selector */
  selector: z.string(),

  /** Field bounds */
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }),

  /** Whether field is required */
  required: z.boolean().default(false),

  /** Validation state */
  validation: z.object({
    valid: z.boolean(),
    message: z.string().optional()
  }).optional()
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const BrowserFormFillEventSchema = z.object({
  type: z.literal('BROWSER_FORM_FILL'),

  payload: z.object({
    /** Form fill identifier */
    id: z.string().uuid(),

    /** Form element selector */
    formSelector: z.string(),

    /** Form action URL */
    formAction: z.string().optional(),

    /** Form method */
    formMethod: z.enum(['get', 'post']).optional(),

    /** Form name */
    formName: z.string().optional(),

    /** Fill operation type */
    operation: z.enum([
      'field_focus',    // Field received focus
      'field_fill',     // Field value changed
      'field_blur',     // Field lost focus
      'form_submit',    // Form submitted
      'form_reset',     // Form reset
      'autofill'        // Browser/agent autofill
    ]),

    /** Field being operated on (for single field ops) */
    field: FormFieldSchema.optional(),

    /** All form fields (for form-level ops) */
    allFields: z.array(FormFieldSchema).optional(),

    /** Progress through form fields */
    progress: z.object({
      currentIndex: z.number().int(),
      totalFields: z.number().int(),
      filledFields: z.number().int(),
      remainingFields: z.number().int()
    }).optional(),

    /** Form-level validation state */
    formValidation: z.object({
      valid: z.boolean(),
      invalidFields: z.array(z.string())
    }).optional()
  })
});
export type BrowserFormFillEvent = z.infer<typeof BrowserFormFillEventSchema>;

// ============================================================================
// 2.6 PAGE LOAD STATES
// ============================================================================

export const PageLoadStateSchema = z.enum([
  'initiated',         // Navigation started
  'loading',           // DOM loading
  'interactive',       // DOM ready, resources loading
  'complete',          // All resources loaded
  'networkIdle',       // No network activity for 500ms
  'error'              // Load error
]);
export type PageLoadState = z.infer<typeof PageLoadStateSchema>;

export const BrowserPageStateEventSchema = z.object({
  type: z.literal('BROWSER_PAGE_STATE'),

  payload: z.object({
    /** Page state identifier */
    id: z.string().uuid(),

    /** Current load state */
    state: PageLoadStateSchema,

    /** Current URL */
    url: z.string().url(),

    /** Page title */
    title: z.string(),

    /** Performance metrics */
    performance: z.object({
      /** Time since navigation started */
      navigationStart: z.number(),

      /** DNS lookup time */
      dnsLookup: z.number().optional(),

      /** TCP connection time */
      tcpConnect: z.number().optional(),

      /** Time to first byte */
      ttfb: z.number().optional(),

      /** DOM content loaded time */
      domContentLoaded: z.number().optional(),

      /** Full load time */
      loadComplete: z.number().optional(),

      /** First contentful paint */
      firstContentfulPaint: z.number().optional(),

      /** Largest contentful paint */
      largestContentfulPaint: z.number().optional(),

      /** Cumulative layout shift */
      cumulativeLayoutShift: z.number().optional(),

      /** First input delay */
      firstInputDelay: z.number().optional()
    }).optional(),

    /** Resource loading stats */
    resources: z.object({
      total: z.number().int(),
      loaded: z.number().int(),
      failed: z.number().int(),
      pending: z.number().int(),
      totalBytes: z.number().int(),
      loadedBytes: z.number().int()
    }).optional(),

    /** JavaScript execution state */
    jsState: z.object({
      scriptsLoaded: z.number().int(),
      scriptsExecuted: z.number().int(),
      errors: z.number().int()
    }).optional(),

    /** Error information if state is 'error' */
    error: z.object({
      type: z.string(),
      message: z.string(),
      statusCode: z.number().int().optional()
    }).optional()
  })
});
export type BrowserPageStateEvent = z.infer<typeof BrowserPageStateEventSchema>;

// ============================================================================
// SECTION 3: TERMINAL STREAM EVENTS
// ============================================================================

/**
 * Terminal stream events provide visibility into command execution,
 * including real-time stdout/stderr streaming with ANSI preservation.
 */

// ============================================================================
// 3.1 COMMAND EXECUTION START/END
// ============================================================================

export const TerminalCommandStartEventSchema = z.object({
  type: z.literal('TERMINAL_COMMAND_START'),

  payload: z.object({
    /** Command execution identifier */
    id: z.string().uuid(),

    /** Full command being executed */
    command: z.string(),

    /** Parsed command parts */
    parsed: z.object({
      /** Executable/program name */
      executable: z.string(),
      /** Arguments */
      args: z.array(z.string()),
      /** Whether piped */
      isPiped: z.boolean(),
      /** Pipe chain if piped */
      pipeChain: z.array(z.string()).optional()
    }),

    /** Working directory */
    cwd: z.string(),

    /** Environment variables (filtered for security) */
    env: z.record(z.string()).optional(),

    /** Whether running in shell */
    shell: z.string().optional(),

    /** Terminal dimensions */
    dimensions: z.object({
      cols: z.number().int(),
      rows: z.number().int()
    }),

    /** Whether command requires user input */
    interactive: z.boolean().default(false),

    /** Expected duration hint (ms) */
    expectedDuration: z.number().optional(),

    /** Whether this is a background process */
    background: z.boolean().default(false),

    /** Process ID if available */
    pid: z.number().int().optional(),

    /** Agent/task context */
    context: z.object({
      agentId: z.string(),
      taskId: z.string(),
      reason: z.string() // Why agent is running this command
    }).optional()
  })
});
export type TerminalCommandStartEvent = z.infer<typeof TerminalCommandStartEventSchema>;

export const TerminalCommandEndEventSchema = z.object({
  type: z.literal('TERMINAL_COMMAND_END'),

  payload: z.object({
    /** Command execution identifier (matches start event) */
    id: z.string().uuid(),

    /** Exit code */
    exitCode: z.number().int(),

    /** Exit signal if killed by signal */
    signal: z.string().optional(),

    /** Whether command succeeded (exit code 0) */
    success: z.boolean(),

    /** Total execution time in ms */
    durationMs: z.number(),

    /** Summary of output */
    summary: z.object({
      /** Total stdout bytes */
      stdoutBytes: z.number().int(),
      /** Total stderr bytes */
      stderrBytes: z.number().int(),
      /** Total lines of output */
      totalLines: z.number().int(),
      /** Last few lines of output */
      tailOutput: z.string().optional()
    }),

    /** Resource usage if available */
    resources: z.object({
      /** User CPU time ms */
      userCpuMs: z.number().optional(),
      /** System CPU time ms */
      systemCpuMs: z.number().optional(),
      /** Max memory RSS bytes */
      maxRssBytes: z.number().optional()
    }).optional(),

    /** Error information if failed */
    error: z.object({
      type: z.string(),
      message: z.string(),
      stack: z.string().optional()
    }).optional()
  })
});
export type TerminalCommandEndEvent = z.infer<typeof TerminalCommandEndEventSchema>;

// ============================================================================
// 3.2 STDOUT/STDERR STREAMING
// ============================================================================

export const TerminalOutputEventSchema = z.object({
  type: z.enum(['TERMINAL_STDOUT', 'TERMINAL_STDERR']),

  payload: z.object({
    /** Command execution identifier */
    commandId: z.string().uuid(),

    /** Chunk identifier for ordering */
    chunkId: z.number().int(),

    /** Raw output data (with ANSI codes preserved) */
    data: z.string(),

    /** Output data with ANSI codes stripped */
    plainText: z.string(),

    /** Parsed ANSI sequences for rich rendering */
    ansiParsed: z.array(z.object({
      text: z.string(),
      style: z.object({
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        underline: z.boolean().optional(),
        strikethrough: z.boolean().optional(),
        foreground: z.string().optional(), // Hex color
        background: z.string().optional(), // Hex color
        dim: z.boolean().optional(),
        blink: z.boolean().optional(),
        inverse: z.boolean().optional(),
        hidden: z.boolean().optional()
      }).optional()
    })).optional(),

    /** Whether this chunk ends with newline */
    endsWithNewline: z.boolean(),

    /** Line number in output stream */
    lineNumber: z.number().int().optional(),

    /** Time since command start in ms */
    elapsedMs: z.number(),

    /** Byte offset in stream */
    byteOffset: z.number().int(),

    /** Whether stream is complete */
    isComplete: z.boolean().default(false),

    /** Progress if detectable (e.g., download progress) */
    progress: z.object({
      current: z.number(),
      total: z.number(),
      unit: z.string(), // bytes, files, etc.
      percentage: z.number()
    }).optional()
  })
});
export type TerminalOutputEvent = z.infer<typeof TerminalOutputEventSchema>;

// ============================================================================
// 3.3 WORKING DIRECTORY CHANGES
// ============================================================================

export const TerminalCwdChangeEventSchema = z.object({
  type: z.literal('TERMINAL_CWD_CHANGE'),

  payload: z.object({
    /** Change identifier */
    id: z.string().uuid(),

    /** Previous working directory */
    fromDir: z.string(),

    /** New working directory */
    toDir: z.string(),

    /** Command that caused the change */
    causedBy: z.object({
      commandId: z.string().uuid(),
      command: z.string()
    }).optional(),

    /** Directory info */
    dirInfo: z.object({
      exists: z.boolean(),
      isSymlink: z.boolean(),
      fileCount: z.number().int().optional(),
      subDirCount: z.number().int().optional()
    }).optional()
  })
});
export type TerminalCwdChangeEvent = z.infer<typeof TerminalCwdChangeEventSchema>;

// ============================================================================
// SECTION 4: FILE STREAM EVENTS
// ============================================================================

/**
 * File stream events track all file system operations including
 * creation, modification, deletion, and binary file handling.
 */

// ============================================================================
// 4.1 FILE CREATE/MODIFY/DELETE
// ============================================================================

export const FileOperationType = z.enum([
  'create',
  'modify',
  'delete',
  'rename',
  'copy',
  'move'
]);
export type FileOperationType = z.infer<typeof FileOperationType>;

export const FileCreateEventSchema = z.object({
  type: z.literal('FILE_CREATE'),

  payload: z.object({
    /** Operation identifier */
    id: z.string().uuid(),

    /** Full file path */
    path: z.string(),

    /** File name only */
    filename: z.string(),

    /** Parent directory */
    directory: z.string(),

    /** File extension */
    extension: z.string().optional(),

    /** Detected file type */
    fileType: z.enum([
      'text',
      'code',
      'image',
      'audio',
      'video',
      'pdf',
      'document',
      'spreadsheet',
      'archive',
      'binary',
      'unknown'
    ]),

    /** Programming language if code file */
    language: z.string().optional(),

    /** File content (for text files, may be truncated) */
    content: z.string().optional(),

    /** Whether content is truncated */
    truncated: z.boolean().default(false),

    /** Full content size in bytes */
    sizeBytes: z.number().int(),

    /** Content preview (first N characters) */
    preview: z.string().optional(),

    /** MIME type */
    mimeType: z.string().optional(),

    /** File mode/permissions */
    mode: z.string().optional(),

    /** Agent/task context */
    context: z.object({
      agentId: z.string(),
      taskId: z.string(),
      reason: z.string()
    }).optional(),

    /** Line count for text files */
    lineCount: z.number().int().optional(),

    /** Encoding for text files */
    encoding: z.string().default('utf-8')
  })
});
export type FileCreateEvent = z.infer<typeof FileCreateEventSchema>;

export const FileModifyEventSchema = z.object({
  type: z.literal('FILE_MODIFY'),

  payload: z.object({
    /** Operation identifier */
    id: z.string().uuid(),

    /** Full file path */
    path: z.string(),

    /** File name only */
    filename: z.string(),

    /** Modification type */
    modificationType: z.enum([
      'content',     // Content changed
      'append',      // Content appended
      'truncate',    // File truncated
      'permissions', // Permissions changed
      'metadata'     // Metadata changed
    ]),

    /** Previous file size */
    previousSizeBytes: z.number().int(),

    /** New file size */
    newSizeBytes: z.number().int(),

    /** Change in size */
    sizeDelta: z.number().int(),

    /** Lines added */
    linesAdded: z.number().int().optional(),

    /** Lines removed */
    linesRemoved: z.number().int().optional(),

    /** Lines modified */
    linesModified: z.number().int().optional(),

    /** Include diff if available */
    includeDiff: z.boolean().default(true),

    /** Diff reference (link to FILE_DIFF event) */
    diffId: z.string().uuid().optional(),

    /** Agent/task context */
    context: z.object({
      agentId: z.string(),
      taskId: z.string(),
      reason: z.string()
    }).optional()
  })
});
export type FileModifyEvent = z.infer<typeof FileModifyEventSchema>;

export const FileDeleteEventSchema = z.object({
  type: z.literal('FILE_DELETE'),

  payload: z.object({
    /** Operation identifier */
    id: z.string().uuid(),

    /** Full file path */
    path: z.string(),

    /** File name only */
    filename: z.string(),

    /** File size before deletion */
    sizeBytes: z.number().int(),

    /** Whether file was backed up */
    backedUp: z.boolean().default(false),

    /** Backup location if backed up */
    backupPath: z.string().optional(),

    /** Final content hash for verification */
    contentHash: z.string().optional(),

    /** Agent/task context */
    context: z.object({
      agentId: z.string(),
      taskId: z.string(),
      reason: z.string()
    }).optional()
  })
});
export type FileDeleteEvent = z.infer<typeof FileDeleteEventSchema>;

// ============================================================================
// 4.2 CONTENT DIFFS
// ============================================================================

export const DiffHunkSchema = z.object({
  /** Starting line in old file */
  oldStart: z.number().int(),

  /** Number of lines in old file */
  oldLines: z.number().int(),

  /** Starting line in new file */
  newStart: z.number().int(),

  /** Number of lines in new file */
  newLines: z.number().int(),

  /** Hunk header (e.g., function name) */
  header: z.string().optional(),

  /** Individual line changes */
  changes: z.array(z.object({
    /** Line type */
    type: z.enum(['add', 'remove', 'context']),
    /** Line content */
    content: z.string(),
    /** Line number in old file */
    oldLineNumber: z.number().int().optional(),
    /** Line number in new file */
    newLineNumber: z.number().int().optional()
  }))
});
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

export const FileDiffEventSchema = z.object({
  type: z.literal('FILE_DIFF'),

  payload: z.object({
    /** Diff identifier */
    id: z.string().uuid(),

    /** File path */
    path: z.string(),

    /** Diff format */
    format: z.enum(['unified', 'split', 'inline']).default('unified'),

    /** Original file content hash */
    oldHash: z.string().optional(),

    /** New file content hash */
    newHash: z.string(),

    /** Diff hunks */
    hunks: z.array(DiffHunkSchema),

    /** Raw unified diff text */
    rawDiff: z.string(),

    /** Statistics */
    stats: z.object({
      additions: z.number().int(),
      deletions: z.number().int(),
      changes: z.number().int()
    }),

    /** Whether diff is truncated (large files) */
    truncated: z.boolean().default(false),

    /** Total hunks if truncated */
    totalHunks: z.number().int().optional(),

    /** Semantic change summary */
    summary: z.string().optional(),

    /** Related file modify event */
    modifyEventId: z.string().uuid().optional()
  })
});
export type FileDiffEvent = z.infer<typeof FileDiffEventSchema>;

// ============================================================================
// 4.3 BINARY FILE HANDLING
// ============================================================================

export const FileBinaryEventSchema = z.object({
  type: z.literal('FILE_BINARY'),

  payload: z.object({
    /** Operation identifier */
    id: z.string().uuid(),

    /** Full file path */
    path: z.string(),

    /** File name */
    filename: z.string(),

    /** Operation type */
    operation: FileOperationType,

    /** File type */
    fileType: z.enum([
      'image',
      'audio',
      'video',
      'pdf',
      'archive',
      'executable',
      'font',
      'model', // 3D model
      'data',  // Binary data format
      'unknown'
    ]),

    /** MIME type */
    mimeType: z.string(),

    /** File size in bytes */
    sizeBytes: z.number().int(),

    /** Human readable size */
    sizeHuman: z.string(),

    /** Content hash (SHA-256) */
    hash: z.string(),

    /** For images: dimensions */
    imageDimensions: z.object({
      width: z.number().int(),
      height: z.number().int()
    }).optional(),

    /** For images: thumbnail (base64, small) */
    thumbnail: z.string().optional(),

    /** For audio/video: duration in seconds */
    duration: z.number().optional(),

    /** For PDFs: page count */
    pageCount: z.number().int().optional(),

    /** For archives: contained file count */
    containedFiles: z.number().int().optional(),

    /** File metadata */
    metadata: z.record(z.unknown()).optional(),

    /** Agent/task context */
    context: z.object({
      agentId: z.string(),
      taskId: z.string(),
      reason: z.string()
    }).optional()
  })
});
export type FileBinaryEvent = z.infer<typeof FileBinaryEventSchema>;

// ============================================================================
// 4.4 DIRECTORY STRUCTURE CHANGES
// ============================================================================

export const DirectoryTreeNodeSchema: z.ZodType<DirectoryTreeNode> = z.lazy(() =>
  z.object({
    /** Node name */
    name: z.string(),

    /** Full path */
    path: z.string(),

    /** Node type */
    type: z.enum(['file', 'directory', 'symlink']),

    /** File size if file */
    sizeBytes: z.number().int().optional(),

    /** File extension if file */
    extension: z.string().optional(),

    /** Children if directory */
    children: z.array(DirectoryTreeNodeSchema).optional(),

    /** Number of children (for collapsed dirs) */
    childCount: z.number().int().optional(),

    /** Whether this node changed */
    changed: z.boolean().default(false),

    /** Change type if changed */
    changeType: z.enum(['added', 'modified', 'deleted']).optional(),

    /** Symlink target if symlink */
    symlinkTarget: z.string().optional()
  })
);
export interface DirectoryTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  sizeBytes?: number;
  extension?: string;
  children?: DirectoryTreeNode[];
  childCount?: number;
  changed?: boolean;
  changeType?: 'added' | 'modified' | 'deleted';
  symlinkTarget?: string;
}

export const DirectoryTreeEventSchema = z.object({
  type: z.literal('DIRECTORY_TREE'),

  payload: z.object({
    /** Tree update identifier */
    id: z.string().uuid(),

    /** Root path of tree */
    rootPath: z.string(),

    /** Tree structure */
    tree: DirectoryTreeNodeSchema,

    /** Whether this is a full tree or delta */
    isDelta: z.boolean().default(false),

    /** Changed paths if delta */
    changedPaths: z.array(z.string()).optional(),

    /** Tree statistics */
    stats: z.object({
      totalFiles: z.number().int(),
      totalDirectories: z.number().int(),
      totalSizeBytes: z.number().int(),
      maxDepth: z.number().int()
    }),

    /** Ignore patterns applied */
    ignorePatterns: z.array(z.string()).optional()
  })
});
export type DirectoryTreeEvent = z.infer<typeof DirectoryTreeEventSchema>;

// ============================================================================
// SECTION 5: AGENT STREAM EVENTS
// ============================================================================

/**
 * Agent stream events provide visibility into agent reasoning,
 * tool usage, state changes, and coordination.
 */

// ============================================================================
// 5.1 AGENT STATE CHANGES
// ============================================================================

export const AgentStateSchema = z.enum([
  'idle',           // Waiting for work
  'initializing',   // Starting up
  'thinking',       // Processing/reasoning
  'planning',       // Creating execution plan
  'acting',         // Executing action
  'waiting',        // Waiting for external resource
  'blocked',        // Blocked by dependency
  'collaborating',  // Working with other agents
  'paused',         // Paused by user
  'error',          // Error state
  'completed'       // Task completed
]);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentStateChangeEventSchema = z.object({
  type: z.literal('AGENT_STATE_CHANGE'),

  payload: z.object({
    /** Agent identifier */
    agentId: z.string(),

    /** Agent name */
    agentName: z.string(),

    /** Agent type/category */
    agentType: z.string(),

    /** Previous state */
    fromState: AgentStateSchema,

    /** New state */
    toState: AgentStateSchema,

    /** Reason for state change */
    reason: z.string(),

    /** Associated task */
    taskId: z.string().optional(),

    /** Duration in previous state (ms) */
    durationInPreviousState: z.number().optional(),

    /** Current activity description */
    activity: z.string().optional(),

    /** Expected duration in new state (ms) */
    expectedDuration: z.number().optional(),

    /** Resource usage */
    resources: z.object({
      memoryMb: z.number().optional(),
      cpuPercent: z.number().optional(),
      tokensUsed: z.number().int().optional()
    }).optional()
  })
});
export type AgentStateChangeEvent = z.infer<typeof AgentStateChangeEventSchema>;

// ============================================================================
// 5.2 TOOL INVOCATIONS
// ============================================================================

export const AgentToolInvokeEventSchema = z.object({
  type: z.literal('AGENT_TOOL_INVOKE'),

  payload: z.object({
    /** Invocation identifier */
    id: z.string().uuid(),

    /** Agent identifier */
    agentId: z.string(),

    /** Tool name */
    toolName: z.string(),

    /** Tool category */
    toolCategory: z.enum([
      'browser',
      'terminal',
      'file',
      'search',
      'api',
      'llm',
      'memory',
      'communication',
      'analysis',
      'other'
    ]),

    /** Tool input parameters */
    input: z.record(z.unknown()),

    /** Sanitized input (sensitive data masked) */
    inputSanitized: z.record(z.unknown()).optional(),

    /** Why agent is using this tool */
    reasoning: z.string(),

    /** Expected outcome */
    expectedOutcome: z.string().optional(),

    /** Whether this is a retry */
    isRetry: z.boolean().default(false),

    /** Retry count if retrying */
    retryCount: z.number().int().optional(),

    /** Associated task */
    taskId: z.string().optional(),

    /** Timestamp of invocation */
    invokedAt: z.string().datetime()
  })
});
export type AgentToolInvokeEvent = z.infer<typeof AgentToolInvokeEventSchema>;

export const AgentToolResultEventSchema = z.object({
  type: z.literal('AGENT_TOOL_RESULT'),

  payload: z.object({
    /** Invocation identifier (matches invoke event) */
    invocationId: z.string().uuid(),

    /** Agent identifier */
    agentId: z.string(),

    /** Tool name */
    toolName: z.string(),

    /** Whether tool succeeded */
    success: z.boolean(),

    /** Tool output/result */
    output: z.record(z.unknown()).optional(),

    /** Sanitized output (sensitive data masked) */
    outputSanitized: z.record(z.unknown()).optional(),

    /** Output summary for display */
    summary: z.string(),

    /** Error if failed */
    error: z.object({
      type: z.string(),
      message: z.string(),
      code: z.string().optional(),
      recoverable: z.boolean()
    }).optional(),

    /** Execution duration (ms) */
    durationMs: z.number(),

    /** Resource consumption */
    resources: z.object({
      tokensIn: z.number().int().optional(),
      tokensOut: z.number().int().optional(),
      bytesRead: z.number().int().optional(),
      bytesWritten: z.number().int().optional(),
      apiCalls: z.number().int().optional()
    }).optional(),

    /** Follow-up actions triggered */
    triggeredActions: z.array(z.string()).optional()
  })
});
export type AgentToolResultEvent = z.infer<typeof AgentToolResultEventSchema>;

// ============================================================================
// 5.3 REASONING/THOUGHT PROCESS
// ============================================================================

export const ThoughtTypeSchema = z.enum([
  'observation',    // What agent observed
  'analysis',       // Analysis of situation
  'planning',       // Planning next steps
  'hypothesis',     // Hypothesis formed
  'decision',       // Decision made
  'reflection',     // Reflection on action
  'correction',     // Correcting previous thought
  'question',       // Question to explore
  'insight',        // New insight gained
  'summary'         // Summarizing progress
]);
export type ThoughtType = z.infer<typeof ThoughtTypeSchema>;

export const AgentReasoningEventSchema = z.object({
  type: z.literal('AGENT_REASONING'),

  payload: z.object({
    /** Thought identifier */
    id: z.string().uuid(),

    /** Agent identifier */
    agentId: z.string(),

    /** Type of thought */
    thoughtType: ThoughtTypeSchema,

    /** The thought/reasoning content */
    content: z.string(),

    /** Confidence in this reasoning (0-1) */
    confidence: z.number().min(0).max(1).optional(),

    /** Related thoughts (chain of reasoning) */
    parentThoughtId: z.string().uuid().optional(),

    /** Depth in reasoning chain */
    depth: z.number().int().default(0),

    /** Key entities/concepts mentioned */
    entities: z.array(z.object({
      type: z.string(),
      value: z.string(),
      relevance: z.number().min(0).max(1)
    })).optional(),

    /** Whether this thought led to an action */
    ledToAction: z.boolean().default(false),

    /** Action taken if ledToAction */
    action: z.string().optional(),

    /** Associated task */
    taskId: z.string().optional(),

    /** Tokens used for this thought */
    tokensUsed: z.number().int().optional(),

    /** Internal vs user-visible thought */
    visibility: z.enum(['internal', 'user']).default('user')
  })
});
export type AgentReasoningEvent = z.infer<typeof AgentReasoningEventSchema>;

// ============================================================================
// 5.4 PROGRESS PERCENTAGE
// ============================================================================

export const AgentProgressEventSchema = z.object({
  type: z.literal('AGENT_PROGRESS'),

  payload: z.object({
    /** Progress update identifier */
    id: z.string().uuid(),

    /** Agent identifier */
    agentId: z.string(),

    /** Associated task */
    taskId: z.string(),

    /** Overall progress (0-100) */
    percentage: z.number().min(0).max(100),

    /** Current phase/stage */
    phase: z.string(),

    /** Phase number */
    phaseNumber: z.number().int(),

    /** Total phases */
    totalPhases: z.number().int(),

    /** Current step within phase */
    currentStep: z.string(),

    /** Step number within phase */
    stepNumber: z.number().int(),

    /** Total steps in phase */
    totalSteps: z.number().int(),

    /** Estimated time remaining (ms) */
    estimatedRemainingMs: z.number().optional(),

    /** Items processed vs total */
    items: z.object({
      processed: z.number().int(),
      total: z.number().int(),
      unit: z.string() // files, requests, etc.
    }).optional(),

    /** Subtask progress */
    subtasks: z.array(z.object({
      id: z.string(),
      name: z.string(),
      percentage: z.number().min(0).max(100),
      status: z.enum(['pending', 'active', 'completed', 'failed'])
    })).optional(),

    /** Milestones achieved */
    milestones: z.array(z.object({
      id: z.string(),
      name: z.string(),
      achievedAt: z.string().datetime()
    })).optional(),

    /** Progress visualization type */
    visualizationType: z.enum([
      'linear',     // Simple progress bar
      'phased',     // Multi-phase progress
      'tree',       // Hierarchical subtasks
      'circular',   // Circular progress
      'steps'       // Step-by-step wizard
    ]).default('linear')
  })
});
export type AgentProgressEvent = z.infer<typeof AgentProgressEventSchema>;

// ============================================================================
// 5.5 PARALLEL TASK COORDINATION
// ============================================================================

export const AgentCollaborationEventSchema = z.object({
  type: z.literal('AGENT_COLLABORATION'),

  payload: z.object({
    /** Collaboration identifier */
    id: z.string().uuid(),

    /** Collaboration type */
    collaborationType: z.enum([
      'delegation',     // Agent delegates to another
      'request',        // Agent requests info/action from another
      'response',       // Agent responds to request
      'handoff',        // Agent hands off task to another
      'sync',           // Agents synchronizing state
      'broadcast',      // Agent broadcasting to all
      'completion'      // Collaboration completed
    ]),

    /** Source agent */
    sourceAgent: z.object({
      id: z.string(),
      name: z.string(),
      type: z.string()
    }),

    /** Target agent(s) */
    targetAgents: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string()
    })),

    /** Parent task */
    parentTaskId: z.string(),

    /** Delegated subtask if delegation */
    subtask: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string()
    }).optional(),

    /** Message/request content */
    message: z.string(),

    /** Data being shared */
    sharedData: z.record(z.unknown()).optional(),

    /** Priority of collaboration */
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),

    /** Expected response time (ms) */
    expectedResponseMs: z.number().optional(),

    /** Whether response is required */
    requiresResponse: z.boolean().default(false),

    /** Dependencies between agents */
    dependencies: z.array(z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(['blocks', 'informs', 'requires'])
    })).optional(),

    /** Current parallel execution status */
    parallelStatus: z.object({
      activeAgents: z.number().int(),
      completedAgents: z.number().int(),
      totalAgents: z.number().int(),
      blockedAgents: z.number().int()
    }).optional()
  })
});
export type AgentCollaborationEvent = z.infer<typeof AgentCollaborationEventSchema>;

// ============================================================================
// SECTION 6: BANDWIDTH OPTIMIZATION
// ============================================================================

/**
 * Bandwidth optimization strategies for efficient streaming
 * in various network conditions.
 */

// ============================================================================
// 6.1 COMPRESSION STRATEGY
// ============================================================================

export const CompressionConfigSchema = z.object({
  /** Compression algorithm */
  algorithm: z.enum([
    'none',       // No compression
    'gzip',       // Standard gzip (good compatibility)
    'lz4',        // Fast compression/decompression
    'zstd',       // Best ratio, good speed
    'brotli'      // Best for text content
  ]).default('zstd'),

  /** Compression level (1-9, algorithm dependent) */
  level: z.number().min(1).max(9).default(3),

  /** Minimum size to compress (bytes) */
  minSizeBytes: z.number().default(1024),

  /** Content types to compress */
  compressibleTypes: z.array(z.string()).default([
    'text/*',
    'application/json',
    'application/javascript',
    'image/svg+xml'
  ]),

  /** Use dictionary compression for repeated patterns */
  useDictionary: z.boolean().default(true),

  /** Pre-shared compression dictionary ID */
  dictionaryId: z.string().optional()
});
export type CompressionConfig = z.infer<typeof CompressionConfigSchema>;

// ============================================================================
// 6.2 DELTA UPDATES
// ============================================================================

export const DeltaUpdateConfigSchema = z.object({
  /** Enable delta updates */
  enabled: z.boolean().default(true),

  /** Delta algorithm */
  algorithm: z.enum([
    'xdelta3',     // Binary delta
    'bsdiff',      // Binary diff (good for executables)
    'text-diff',   // Line-based text diff
    'json-patch'   // RFC 6902 JSON Patch
  ]).default('json-patch'),

  /** Maximum delta size relative to full update */
  maxDeltaRatio: z.number().default(0.5),

  /** Full sync after N deltas */
  fullSyncInterval: z.number().default(100),

  /** Maximum pending deltas before full sync */
  maxPendingDeltas: z.number().default(50),

  /** Types of updates to delta */
  deltaTypes: z.array(z.string()).default([
    'BROWSER_SCREENSHOT',
    'BROWSER_DOM_CHANGE',
    'FILE_MODIFY',
    'DIRECTORY_TREE'
  ])
});
export type DeltaUpdateConfig = z.infer<typeof DeltaUpdateConfigSchema>;

export const DeltaUpdateSchema = z.object({
  /** Update identifier */
  id: z.string().uuid(),

  /** Reference to base state */
  baseId: z.string().uuid(),

  /** Base state sequence number */
  baseSequence: z.number().int(),

  /** Delta operations */
  operations: z.array(z.object({
    op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
    path: z.string(),
    value: z.unknown().optional(),
    from: z.string().optional()
  })),

  /** Delta size vs full update size */
  compressionRatio: z.number(),

  /** Checksum of resulting state */
  resultChecksum: z.string()
});
export type DeltaUpdate = z.infer<typeof DeltaUpdateSchema>;

// ============================================================================
// 6.3 PRIORITY QUEUING
// ============================================================================

export const PriorityQueueConfigSchema = z.object({
  /** Priority levels with weights */
  levels: z.object({
    critical: z.object({
      weight: z.number().default(100),
      maxDelay: z.number().default(0)  // Immediate
    }),
    high: z.object({
      weight: z.number().default(50),
      maxDelay: z.number().default(100)  // 100ms
    }),
    normal: z.object({
      weight: z.number().default(10),
      maxDelay: z.number().default(500)  // 500ms
    }),
    low: z.object({
      weight: z.number().default(1),
      maxDelay: z.number().default(2000)  // 2s
    })
  }),

  /** Event type priorities */
  eventPriorities: z.record(z.enum(['critical', 'high', 'normal', 'low'])).default({
    'AGENT_ERROR': 'critical',
    'AGENT_STATE_CHANGE': 'high',
    'AGENT_REASONING': 'normal',
    'BROWSER_SCREENSHOT': 'normal',
    'TERMINAL_STDOUT': 'high',
    'FILE_CREATE': 'normal',
    'FILE_DIFF': 'low'
  }),

  /** Maximum queue size per priority */
  maxQueueSize: z.object({
    critical: z.number().default(1000),
    high: z.number().default(5000),
    normal: z.number().default(10000),
    low: z.number().default(20000)
  }),

  /** Drop policy when queue full */
  dropPolicy: z.enum([
    'drop_oldest',   // Drop oldest in same priority
    'drop_lowest',   // Drop from lowest priority
    'block',         // Block until space available
    'drop_newest'    // Drop incoming message
  ]).default('drop_oldest')
});
export type PriorityQueueConfig = z.infer<typeof PriorityQueueConfigSchema>;

// ============================================================================
// 6.4 THROTTLING UNDER LOAD
// ============================================================================

export const ThrottlingConfigSchema = z.object({
  /** Enable adaptive throttling */
  enabled: z.boolean().default(true),

  /** Target messages per second */
  targetMps: z.number().default(100),

  /** Maximum messages per second */
  maxMps: z.number().default(500),

  /** Minimum messages per second (floor) */
  minMps: z.number().default(10),

  /** Throttling triggers */
  triggers: z.object({
    /** CPU usage threshold (%) */
    cpuThreshold: z.number().default(80),

    /** Memory usage threshold (%) */
    memoryThreshold: z.number().default(85),

    /** Queue depth threshold */
    queueDepthThreshold: z.number().default(1000),

    /** Client RTT threshold (ms) */
    rttThreshold: z.number().default(500),

    /** Packet loss threshold (%) */
    packetLossThreshold: z.number().default(5)
  }),

  /** Throttling strategies by trigger */
  strategies: z.object({
    /** Reduce screenshot FPS */
    reduceScreenshotFps: z.object({
      enabled: z.boolean().default(true),
      minFps: z.number().default(0.5)
    }),

    /** Batch small events */
    batchEvents: z.object({
      enabled: z.boolean().default(true),
      maxBatchSize: z.number().default(50),
      maxBatchDelay: z.number().default(200)
    }),

    /** Drop low-priority events */
    dropLowPriority: z.object({
      enabled: z.boolean().default(true),
      threshold: z.enum(['low', 'normal']).default('low')
    }),

    /** Reduce diff granularity */
    coarserDiffs: z.object({
      enabled: z.boolean().default(true),
      minChangeThreshold: z.number().default(10)
    }),

    /** Increase compression */
    increaseCompression: z.object({
      enabled: z.boolean().default(true),
      maxLevel: z.number().default(9)
    })
  }),

  /** Backoff configuration */
  backoff: z.object({
    /** Initial throttle duration (ms) */
    initialMs: z.number().default(100),

    /** Maximum throttle duration (ms) */
    maxMs: z.number().default(5000),

    /** Backoff multiplier */
    multiplier: z.number().default(1.5),

    /** Recovery rate (% per second) */
    recoveryRate: z.number().default(10)
  }),

  /** Client bandwidth hints */
  clientHints: z.object({
    /** Detected connection type */
    connectionType: z.enum(['slow-2g', '2g', '3g', '4g', '5g', 'wifi', 'ethernet', 'unknown']).optional(),

    /** Downlink bandwidth (Mbps) */
    downlinkMbps: z.number().optional(),

    /** Round-trip time (ms) */
    rttMs: z.number().optional(),

    /** Whether to save data */
    saveData: z.boolean().optional()
  }).optional()
});
export type ThrottlingConfig = z.infer<typeof ThrottlingConfigSchema>;

// ============================================================================
// 6.5 BATCHING CONFIGURATION
// ============================================================================

export const BatchingConfigSchema = z.object({
  /** Enable event batching */
  enabled: z.boolean().default(true),

  /** Maximum events per batch */
  maxBatchSize: z.number().default(100),

  /** Maximum batch delay (ms) */
  maxBatchDelay: z.number().default(50),

  /** Events that should never be batched */
  neverBatch: z.array(z.string()).default([
    'AGENT_ERROR',
    'CONNECTION_ERROR',
    'TERMINAL_COMMAND_END'
  ]),

  /** Events that can be batched together */
  batchGroups: z.array(z.object({
    name: z.string(),
    events: z.array(z.string()),
    maxSize: z.number(),
    maxDelay: z.number()
  })).default([
    {
      name: 'terminal_output',
      events: ['TERMINAL_STDOUT', 'TERMINAL_STDERR'],
      maxSize: 50,
      maxDelay: 100
    },
    {
      name: 'dom_changes',
      events: ['BROWSER_DOM_CHANGE'],
      maxSize: 20,
      maxDelay: 200
    }
  ])
});
export type BatchingConfig = z.infer<typeof BatchingConfigSchema>;

// ============================================================================
// SECTION 7: CLIENT SDK INTERFACE
// ============================================================================

/**
 * TypeScript interface for the client SDK that implements
 * this streaming specification.
 */

export interface StreamingClient {
  // Connection management
  connect(url: string, options?: ConnectionOptions): Promise<void>;
  disconnect(code?: number, reason?: string): Promise<void>;
  reconnect(): Promise<void>;

  // State
  getState(): ConnectionState;
  getSessionId(): string;
  getSequence(): number;

  // Subscriptions
  subscribe(target: SubscriptionTarget): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;

  // Event listeners
  on<T extends MessageType>(type: T, handler: EventHandler<T>): void;
  off<T extends MessageType>(type: T, handler: EventHandler<T>): void;
  once<T extends MessageType>(type: T, handler: EventHandler<T>): void;

  // Metrics
  getMetrics(): StreamingMetrics;

  // Configuration
  updateConfig(config: Partial<StreamingClientConfig>): void;
}

export interface ConnectionOptions {
  /** Authentication token */
  token: string;

  /** Session ID (for reconnection) */
  sessionId?: string;

  /** Last received sequence (for reconnection) */
  lastSequence?: number;

  /** Subscriptions to restore */
  subscriptions?: SubscriptionTarget[];

  /** Connection timeout (ms) */
  timeout?: number;
}

export type EventHandler<T extends MessageType> = (event: StreamEvent<T>) => void;

export interface StreamEvent<T extends MessageType> {
  type: T;
  payload: unknown; // Type-specific payload
  timestamp: Date;
  sequence: number;
  metadata?: Record<string, unknown>;
}

export interface StreamingMetrics {
  /** Connection uptime (ms) */
  uptimeMs: number;

  /** Total messages received */
  messagesReceived: number;

  /** Total bytes received */
  bytesReceived: number;

  /** Messages per second (rolling average) */
  messagesPerSecond: number;

  /** Current RTT (ms) */
  rttMs: number;

  /** Packet loss rate (%) */
  packetLossRate: number;

  /** Reconnection count */
  reconnectionCount: number;

  /** Last reconnection timestamp */
  lastReconnection?: Date;

  /** Queue depth */
  queueDepth: number;

  /** Throttle status */
  throttled: boolean;
}

export interface StreamingClientConfig {
  reconnection: ReconnectionConfig;
  compression: CompressionConfig;
  delta: DeltaUpdateConfig;
  priorityQueue: PriorityQueueConfig;
  throttling: ThrottlingConfig;
  batching: BatchingConfigSchema;
}

// ============================================================================
// SECTION 8: WIRE PROTOCOL EXAMPLES
// ============================================================================

/**
 * Example messages for documentation and testing.
 */

export const EXAMPLE_MESSAGES = {
  // Connection handshake
  connectionInit: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "CONNECTION_INIT",
    timestamp: "2026-02-08T10:30:00.000Z",
    sessionId: "session-123",
    sequence: 0,
    payload: {
      version: "1.0.0",
      capabilities: ["compression", "delta", "batching"]
    }
  },

  connectionAuth: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    type: "CONNECTION_AUTH",
    timestamp: "2026-02-08T10:30:00.100Z",
    sessionId: "session-123",
    sequence: 1,
    correlationId: "550e8400-e29b-41d4-a716-446655440000",
    payload: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      userId: "user-456"
    }
  },

  // Browser screenshot event
  browserScreenshot: {
    id: "550e8400-e29b-41d4-a716-446655440010",
    type: "BROWSER_SCREENSHOT",
    timestamp: "2026-02-08T10:30:05.000Z",
    sessionId: "session-123",
    sequence: 15,
    payload: {
      id: "screenshot-001",
      capturedAt: "2026-02-08T10:30:05.000Z",
      url: "https://example.com/dashboard",
      title: "Dashboard - Example App",
      imageData: "data:image/webp;base64,UklGRh4AAABXRUJQVlA4...",
      format: "webp",
      dimensions: {
        width: 1280,
        height: 720,
        devicePixelRatio: 2
      },
      viewport: {
        width: 1280,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        pageWidth: 1280,
        pageHeight: 3500
      },
      sizeBytes: 45678,
      isDelta: false,
      cursor: {
        x: 640,
        y: 360,
        visible: true
      }
    },
    metadata: {
      agentId: "agent-789",
      taskId: "task-101",
      priority: "normal",
      compression: "none"
    }
  },

  // Agent reasoning event
  agentReasoning: {
    id: "550e8400-e29b-41d4-a716-446655440020",
    type: "AGENT_REASONING",
    timestamp: "2026-02-08T10:30:06.500Z",
    sessionId: "session-123",
    sequence: 20,
    payload: {
      id: "thought-001",
      agentId: "agent-789",
      thoughtType: "planning",
      content: "I need to navigate to the settings page to configure the API key. I can see a Settings link in the navigation menu at coordinates (1050, 45). I will click on this link.",
      confidence: 0.92,
      depth: 1,
      entities: [
        { type: "ui_element", value: "Settings link", relevance: 0.95 },
        { type: "concept", value: "API key", relevance: 0.8 }
      ],
      ledToAction: true,
      action: "BROWSER_CLICK",
      taskId: "task-101",
      tokensUsed: 45,
      visibility: "user"
    },
    metadata: {
      agentId: "agent-789",
      taskId: "task-101",
      priority: "normal"
    }
  },

  // Terminal output event
  terminalStdout: {
    id: "550e8400-e29b-41d4-a716-446655440030",
    type: "TERMINAL_STDOUT",
    timestamp: "2026-02-08T10:30:10.000Z",
    sessionId: "session-123",
    sequence: 30,
    payload: {
      commandId: "cmd-001",
      chunkId: 5,
      data: "\x1b[32m✓\x1b[0m Dependencies installed successfully\n",
      plainText: "✓ Dependencies installed successfully\n",
      ansiParsed: [
        {
          text: "✓",
          style: { foreground: "#00ff00" }
        },
        {
          text: " Dependencies installed successfully\n",
          style: {}
        }
      ],
      endsWithNewline: true,
      lineNumber: 45,
      elapsedMs: 5000,
      byteOffset: 2048,
      isComplete: false
    },
    metadata: {
      agentId: "agent-789",
      taskId: "task-101",
      priority: "high"
    }
  },

  // Agent progress event
  agentProgress: {
    id: "550e8400-e29b-41d4-a716-446655440040",
    type: "AGENT_PROGRESS",
    timestamp: "2026-02-08T10:30:15.000Z",
    sessionId: "session-123",
    sequence: 40,
    payload: {
      id: "progress-001",
      agentId: "agent-789",
      taskId: "task-101",
      percentage: 45,
      phase: "Installing Dependencies",
      phaseNumber: 2,
      totalPhases: 5,
      currentStep: "Running npm install",
      stepNumber: 3,
      totalSteps: 4,
      estimatedRemainingMs: 30000,
      items: {
        processed: 45,
        total: 100,
        unit: "packages"
      },
      subtasks: [
        {
          id: "subtask-1",
          name: "Parse package.json",
          percentage: 100,
          status: "completed"
        },
        {
          id: "subtask-2",
          name: "Install dependencies",
          percentage: 45,
          status: "active"
        },
        {
          id: "subtask-3",
          name: "Build project",
          percentage: 0,
          status: "pending"
        }
      ],
      visualizationType: "phased"
    },
    metadata: {
      agentId: "agent-789",
      taskId: "task-101",
      priority: "normal"
    }
  }
};

// ============================================================================
// SECTION 9: ERROR CODES
// ============================================================================

export const StreamingErrorCodes = {
  // Connection errors (1xxx)
  CONNECTION_FAILED: { code: 1001, message: "Failed to establish WebSocket connection" },
  CONNECTION_TIMEOUT: { code: 1002, message: "Connection attempt timed out" },
  CONNECTION_CLOSED: { code: 1003, message: "Connection closed unexpectedly" },

  // Authentication errors (2xxx)
  AUTH_REQUIRED: { code: 2001, message: "Authentication required" },
  AUTH_INVALID: { code: 2002, message: "Invalid authentication token" },
  AUTH_EXPIRED: { code: 2003, message: "Authentication token expired" },
  AUTH_INSUFFICIENT: { code: 2004, message: "Insufficient permissions" },

  // Subscription errors (3xxx)
  SUBSCRIPTION_INVALID: { code: 3001, message: "Invalid subscription target" },
  SUBSCRIPTION_LIMIT: { code: 3002, message: "Subscription limit exceeded" },
  SUBSCRIPTION_NOT_FOUND: { code: 3003, message: "Subscription not found" },

  // Protocol errors (4xxx)
  PROTOCOL_ERROR: { code: 4001, message: "Protocol error" },
  INVALID_MESSAGE: { code: 4002, message: "Invalid message format" },
  SEQUENCE_GAP: { code: 4003, message: "Message sequence gap detected" },
  RESYNC_REQUIRED: { code: 4004, message: "Full resync required" },

  // Rate limiting errors (5xxx)
  RATE_LIMITED: { code: 5001, message: "Rate limit exceeded" },
  THROTTLED: { code: 5002, message: "Connection throttled" },
  QUEUE_FULL: { code: 5003, message: "Message queue full" },

  // Server errors (6xxx)
  SERVER_ERROR: { code: 6001, message: "Internal server error" },
  SERVICE_UNAVAILABLE: { code: 6002, message: "Service temporarily unavailable" },
  MAINTENANCE: { code: 6003, message: "Server under maintenance" }
} as const;

// ============================================================================
// SECTION 10: IMPLEMENTATION NOTES
// ============================================================================

/**
 * IMPLEMENTATION NOTES
 * ====================
 *
 * 1. SCREENSHOT STREAMING OPTIMIZATION
 *    - Use WebP format for best compression/quality ratio
 *    - Implement region-based delta encoding for sequential screenshots
 *    - Consider video codec (H.264) for high-FPS streaming scenarios
 *    - Adaptive quality based on network conditions
 *
 * 2. TERMINAL OUTPUT HANDLING
 *    - Preserve ANSI escape codes for proper color rendering
 *    - Parse ANSI to structured format for consistent cross-platform rendering
 *    - Buffer partial lines until newline received
 *    - Handle carriage returns for progress bars
 *
 * 3. FILE DIFF OPTIMIZATION
 *    - Use semantic diff for code files (language-aware)
 *    - Implement Myers diff algorithm for text
 *    - Binary files: hash-based change detection only
 *    - Consider operational transform for collaborative editing
 *
 * 4. AGENT REASONING PRIVACY
 *    - Internal thoughts (visibility: 'internal') never sent to client
 *    - Sanitize sensitive data from reasoning traces
 *    - Implement thought summarization for bandwidth savings
 *
 * 5. RECONNECTION RESILIENCE
 *    - Server maintains 5-minute message buffer per session
 *    - Client tracks last received sequence for gap detection
 *    - Implement idempotent message processing
 *    - Use exponential backoff with jitter
 *
 * 6. SECURITY CONSIDERATIONS
 *    - All connections require WSS (TLS)
 *    - JWT tokens with short expiry (1 hour)
 *    - Rate limiting per connection and per user
 *    - Sanitize all file paths to prevent traversal
 *    - Mask passwords and sensitive form fields
 *    - Never stream credentials or API keys
 *
 * 7. PERFORMANCE TARGETS
 *    - Screenshot latency: < 200ms (capture to client receive)
 *    - Terminal output latency: < 50ms
 *    - Agent state change latency: < 100ms
 *    - Maximum message size: 16MB (for large screenshots)
 *    - Target bandwidth: < 1 Mbps for typical usage
 *
 * 8. CLIENT IMPLEMENTATION
 *    - Use Web Workers for message processing
 *    - Implement virtual scrolling for terminal output
 *    - Use requestAnimationFrame for screenshot updates
 *    - Debounce DOM change events on client
 */

export const SPEC_VERSION = "1.0.0";
export const SPEC_DATE = "2026-02-08";
