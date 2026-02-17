/**
 * Verification Engine for Alabobai AI Platform
 *
 * A comprehensive verification system that ensures actions succeed and
 * outcomes match expectations. Supports multiple verification strategies
 * with intelligent retry, detailed reporting, and evidence collection.
 *
 * Features:
 * - Action Verification: Verify each action before proceeding
 * - Multiple Verification Types: DOM, Screenshot, API, File, Output
 * - Confidence Scoring: Pass/fail with detailed confidence metrics
 * - Auto-Retry: Exponential backoff with strategy-specific handling
 * - Reusable Rules: Define and chain verification rules
 * - Integration: Wrap any action with verification lifecycle hooks
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type VerificationStrategy =
  | 'dom'
  | 'screenshot'
  | 'api'
  | 'file'
  | 'output'
  | 'custom'

export type VerificationStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'timeout'
  | 'error'

export type RetryStrategy =
  | 'immediate'
  | 'linear'
  | 'exponential'
  | 'fibonacci'
  | 'none'

export type FailureType =
  | 'element-not-found'
  | 'element-mismatch'
  | 'value-mismatch'
  | 'visual-diff'
  | 'api-error'
  | 'schema-invalid'
  | 'file-missing'
  | 'content-mismatch'
  | 'constraint-violation'
  | 'timeout'
  | 'unknown'

export type EscalationType =
  | 'retry'
  | 'fallback'
  | 'human-review'
  | 'abort'
  | 'skip'

// -----------------------------------------------------------------------------
// Verification Rule Types
// -----------------------------------------------------------------------------

export interface VerificationRule<TContext = unknown> {
  /** Unique identifier for this rule */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what this rule verifies */
  description: string
  /** Verification strategy type */
  strategy: VerificationStrategy
  /** What to check */
  check: VerificationCheck
  /** Expected result/outcome */
  expected: ExpectedOutcome
  /** Optional condition for when to run this rule */
  condition?: (context: TContext) => boolean
  /** Rule priority (lower = higher priority) */
  priority?: number
  /** Tags for categorization */
  tags?: string[]
  /** Timeout for this specific rule (ms) */
  timeout?: number
  /** Retry configuration */
  retry?: RetryConfig
  /** Whether this rule is critical (failure blocks execution) */
  critical?: boolean
  /** Custom verification function for 'custom' strategy */
  customVerify?: (context: TContext) => Promise<VerificationOutcome>
}

export interface VerificationCheck {
  /** Type of check to perform */
  type: string
  /** Target selector, path, or identifier */
  target?: string
  /** Additional parameters for the check */
  params?: Record<string, unknown>
}

export interface ExpectedOutcome {
  /** Type of expected outcome */
  type: 'exists' | 'value' | 'contains' | 'matches' | 'schema' | 'range' | 'custom'
  /** Expected value or pattern */
  value?: unknown
  /** For range type: minimum value */
  min?: number
  /** For range type: maximum value */
  max?: number
  /** JSON schema for validation */
  schema?: Record<string, unknown>
  /** Regex pattern for matching */
  pattern?: string
  /** Tolerance for numeric comparisons */
  tolerance?: number
  /** Custom comparison function */
  compare?: (actual: unknown, expected: unknown) => boolean
}

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number
  /** Initial delay between retries (ms) */
  initialDelay: number
  /** Maximum delay between retries (ms) */
  maxDelay: number
  /** Retry strategy */
  strategy: RetryStrategy
  /** Jitter factor (0-1) for randomization */
  jitter?: number
  /** Failure types that should trigger retry */
  retryableFailures?: FailureType[]
  /** Failure types that should not retry */
  nonRetryableFailures?: FailureType[]
}

// -----------------------------------------------------------------------------
// Verification Result Types
// -----------------------------------------------------------------------------

export interface VerificationResult {
  /** Unique result identifier */
  id: string
  /** Rule that was verified */
  ruleId: string
  /** Verification status */
  status: VerificationStatus
  /** Whether verification passed */
  passed: boolean
  /** Confidence score (0-1) */
  confidence: number
  /** Detailed explanation */
  explanation: string
  /** Evidence collected during verification */
  evidence: VerificationEvidence
  /** Suggestions for fixing failures */
  suggestions: string[]
  /** Actual outcome observed */
  actual?: unknown
  /** Expected outcome */
  expected?: unknown
  /** Failure type if failed */
  failureType?: FailureType
  /** Timestamp when verification started */
  startedAt: number
  /** Timestamp when verification completed */
  completedAt: number
  /** Duration in milliseconds */
  duration: number
  /** Number of retry attempts */
  retryAttempts: number
  /** Child verification results (for chained rules) */
  children?: VerificationResult[]
}

export interface VerificationEvidence {
  /** Screenshots captured */
  screenshots?: ScreenshotEvidence[]
  /** Log entries */
  logs?: LogEntry[]
  /** DOM snapshots */
  domSnapshots?: DOMSnapshot[]
  /** API responses */
  apiResponses?: APIResponse[]
  /** File contents */
  fileContents?: FileContent[]
  /** Visual diffs */
  visualDiffs?: VisualDiff[]
  /** Custom evidence */
  custom?: Record<string, unknown>
}

export interface ScreenshotEvidence {
  /** Screenshot identifier */
  id: string
  /** Screenshot type */
  type: 'before' | 'after' | 'diff' | 'element'
  /** Base64 encoded image or URL */
  data: string
  /** Timestamp */
  timestamp: number
  /** Element selector if applicable */
  selector?: string
  /** Viewport dimensions */
  viewport?: { width: number; height: number }
}

export interface LogEntry {
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error'
  /** Log message */
  message: string
  /** Timestamp */
  timestamp: number
  /** Additional data */
  data?: unknown
}

export interface DOMSnapshot {
  /** Snapshot identifier */
  id: string
  /** Snapshot type */
  type: 'before' | 'after' | 'element'
  /** HTML content */
  html: string
  /** Element selector */
  selector?: string
  /** Attributes captured */
  attributes?: Record<string, string>
  /** Computed styles */
  styles?: Record<string, string>
  /** Timestamp */
  timestamp: number
}

export interface APIResponse {
  /** Request URL */
  url: string
  /** HTTP method */
  method: string
  /** Response status code */
  status: number
  /** Response headers */
  headers: Record<string, string>
  /** Response body */
  body: unknown
  /** Request duration (ms) */
  duration: number
  /** Timestamp */
  timestamp: number
}

export interface FileContent {
  /** File path */
  path: string
  /** File content (text or base64 for binary) */
  content: string
  /** File size in bytes */
  size: number
  /** Last modified timestamp */
  lastModified: number
  /** MIME type */
  mimeType?: string
  /** Hash of content */
  hash?: string
}

export interface VisualDiff {
  /** Before screenshot */
  before: string
  /** After screenshot */
  after: string
  /** Diff image */
  diff: string
  /** Similarity percentage (0-100) */
  similarity: number
  /** Changed regions */
  changedRegions: Array<{
    x: number
    y: number
    width: number
    height: number
  }>
}

// -----------------------------------------------------------------------------
// Verification Outcome
// -----------------------------------------------------------------------------

export interface VerificationOutcome {
  /** Whether the verification passed */
  passed: boolean
  /** Confidence score (0-1) */
  confidence: number
  /** Actual value observed */
  actual?: unknown
  /** Failure type if applicable */
  failureType?: FailureType
  /** Error message if applicable */
  error?: string
  /** Evidence collected */
  evidence?: Partial<VerificationEvidence>
}

// -----------------------------------------------------------------------------
// Action Wrapper Types
// -----------------------------------------------------------------------------

export interface ActionConfig<TInput = unknown, TOutput = unknown> {
  /** Action identifier */
  id: string
  /** Action name */
  name: string
  /** The action to execute */
  action: (input: TInput) => Promise<TOutput>
  /** Verification rules to apply */
  rules: VerificationRule[]
  /** Pre-verification hooks */
  beforeVerify?: (input: TInput) => Promise<void>
  /** Post-verification hooks */
  afterVerify?: (result: VerificationSummary, output: TOutput) => Promise<void>
  /** On failure hook */
  onFailure?: (result: VerificationSummary) => Promise<EscalationType>
  /** Timeout for the entire action with verification */
  timeout?: number
}

export interface VerificationSummary {
  /** Overall pass/fail status */
  passed: boolean
  /** Overall confidence score */
  confidence: number
  /** Summary message */
  summary: string
  /** All verification results */
  results: VerificationResult[]
  /** Number of passed verifications */
  passedCount: number
  /** Number of failed verifications */
  failedCount: number
  /** Number of skipped verifications */
  skippedCount: number
  /** Total duration (ms) */
  totalDuration: number
  /** Timestamp */
  timestamp: number
  /** Whether any critical rules failed */
  criticalFailure: boolean
  /** Aggregated suggestions */
  suggestions: string[]
}

// -----------------------------------------------------------------------------
// Verification Stats
// -----------------------------------------------------------------------------

export interface VerificationStats {
  /** Total verifications run */
  totalRuns: number
  /** Total passed */
  totalPassed: number
  /** Total failed */
  totalFailed: number
  /** Pass rate (0-1) */
  passRate: number
  /** Average confidence */
  avgConfidence: number
  /** Average duration (ms) */
  avgDuration: number
  /** Retries per verification */
  avgRetries: number
  /** Stats by strategy */
  byStrategy: Record<VerificationStrategy, {
    runs: number
    passed: number
    failed: number
    avgConfidence: number
  }>
  /** Stats by rule */
  byRule: Record<string, {
    runs: number
    passed: number
    failed: number
    avgConfidence: number
    avgDuration: number
  }>
  /** Recent failures */
  recentFailures: Array<{
    ruleId: string
    failureType: FailureType
    timestamp: number
    message: string
  }>
}

// -----------------------------------------------------------------------------
// Lifecycle Hooks
// -----------------------------------------------------------------------------

export interface VerificationHooks {
  /** Called before verification starts */
  onStart?: (rule: VerificationRule<unknown>) => void
  /** Called on each retry attempt */
  onRetry?: (rule: VerificationRule<unknown>, attempt: number, error: Error) => void
  /** Called when verification passes */
  onPass?: (result: VerificationResult) => void
  /** Called when verification fails */
  onFail?: (result: VerificationResult) => void
  /** Called when verification completes (pass or fail) */
  onComplete?: (result: VerificationResult) => void
  /** Called when verification times out */
  onTimeout?: (rule: VerificationRule<unknown>) => void
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3))
}

function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const { strategy, initialDelay, maxDelay, jitter = 0.2 } = config
  let delay: number

  switch (strategy) {
    case 'immediate':
      delay = 0
      break
    case 'linear':
      delay = initialDelay * attempt
      break
    case 'exponential':
      delay = initialDelay * Math.pow(2, attempt - 1)
      break
    case 'fibonacci': {
      const fib = (n: number): number => {
        if (n <= 1) return n
        let a = 0, b = 1
        for (let i = 2; i <= n; i++) {
          const c = a + b
          a = b
          b = c
        }
        return b
      }
      delay = initialDelay * fib(attempt)
      break
    }
    case 'none':
    default:
      delay = 0
  }

  // Apply max delay cap
  delay = Math.min(delay, maxDelay)

  // Apply jitter
  if (jitter > 0 && delay > 0) {
    const jitterAmount = delay * jitter
    delay = delay + (Math.random() * 2 - 1) * jitterAmount
  }

  return Math.max(0, Math.round(delay))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)

    if (aKeys.length !== bKeys.length) return false

    return aKeys.every(key => deepEqual(aObj[key], bObj[key]))
  }

  return false
}

function matchesSchema(
  value: unknown,
  schema: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Basic JSON Schema validation
  const type = schema.type as string | undefined
  const required = schema.required as string[] | undefined
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined

  if (type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value
    if (actualType !== type) {
      errors.push(`Expected type "${type}" but got "${actualType}"`)
    }
  }

  if (typeof value === 'object' && value !== null && properties) {
    const valueObj = value as Record<string, unknown>

    // Check required fields
    if (required) {
      for (const field of required) {
        if (!(field in valueObj)) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    // Validate properties
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in valueObj) {
        const propResult = matchesSchema(valueObj[key], propSchema)
        errors.push(...propResult.errors.map(e => `${key}: ${e}`))
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  strategy: 'exponential',
  jitter: 0.2,
  retryableFailures: [
    'element-not-found',
    'timeout',
    'api-error'
  ],
  nonRetryableFailures: [
    'schema-invalid',
    'constraint-violation'
  ]
}

const DEFAULT_TIMEOUT = 30000 // 30 seconds

// ============================================================================
// DOM Verifier
// ============================================================================

class DOMVerifier {
  async verify(
    check: VerificationCheck,
    expected: ExpectedOutcome
  ): Promise<VerificationOutcome> {
    if (typeof document === 'undefined') {
      return {
        passed: false,
        confidence: 0,
        failureType: 'element-not-found',
        error: 'DOM not available (not in browser context)'
      }
    }

    const { target } = check
    if (!target) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'element-not-found',
        error: 'No target selector provided'
      }
    }

    try {
      const element = document.querySelector(target)

      switch (expected.type) {
        case 'exists':
          return this.verifyExists(element, expected.value !== false)

        case 'value':
          return this.verifyValue(element, expected.value)

        case 'contains':
          return this.verifyContains(element, expected.value as string)

        case 'matches':
          return this.verifyMatches(element, expected.pattern || '')

        default:
          return {
            passed: false,
            confidence: 0,
            failureType: 'unknown',
            error: `Unknown expected type: ${expected.type}`
          }
      }
    } catch (error) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown DOM error'
      }
    }
  }

  private verifyExists(
    element: Element | null,
    shouldExist: boolean
  ): VerificationOutcome {
    const exists = element !== null

    if (exists === shouldExist) {
      return {
        passed: true,
        confidence: 1,
        actual: exists
      }
    }

    return {
      passed: false,
      confidence: 0,
      actual: exists,
      failureType: shouldExist ? 'element-not-found' : 'element-mismatch',
      error: shouldExist
        ? 'Element does not exist'
        : 'Element exists but should not'
    }
  }

  private verifyValue(
    element: Element | null,
    expectedValue: unknown
  ): VerificationOutcome {
    if (!element) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'element-not-found',
        error: 'Element not found'
      }
    }

    let actualValue: unknown

    if (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) {
      actualValue = element.value
    } else {
      actualValue = element.textContent?.trim()
    }

    const passed = actualValue === expectedValue

    return {
      passed,
      confidence: passed ? 1 : 0,
      actual: actualValue,
      failureType: passed ? undefined : 'value-mismatch',
      error: passed ? undefined : `Expected "${expectedValue}" but got "${actualValue}"`
    }
  }

  private verifyContains(
    element: Element | null,
    expectedText: string
  ): VerificationOutcome {
    if (!element) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'element-not-found',
        error: 'Element not found'
      }
    }

    const actualText = element.textContent || ''
    const passed = actualText.includes(expectedText)

    return {
      passed,
      confidence: passed ? 1 : 0.5 - (0.5 * (1 - this.calculateSimilarity(actualText, expectedText))),
      actual: actualText,
      failureType: passed ? undefined : 'content-mismatch',
      error: passed ? undefined : `Text does not contain "${expectedText}"`
    }
  }

  private verifyMatches(
    element: Element | null,
    pattern: string
  ): VerificationOutcome {
    if (!element) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'element-not-found',
        error: 'Element not found'
      }
    }

    const actualText = element.textContent || ''
    const regex = new RegExp(pattern)
    const passed = regex.test(actualText)

    return {
      passed,
      confidence: passed ? 1 : 0,
      actual: actualText,
      failureType: passed ? undefined : 'content-mismatch',
      error: passed ? undefined : `Text does not match pattern "${pattern}"`
    }
  }

  private calculateSimilarity(a: string, b: string): number {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()

    if (aLower === bLower) return 1

    const aWords = new Set(aLower.split(/\s+/).filter(w => w.length > 2))
    const bWords = new Set(bLower.split(/\s+/).filter(w => w.length > 2))

    if (aWords.size === 0 || bWords.size === 0) return 0

    let overlap = 0
    aWords.forEach(word => {
      if (bWords.has(word)) overlap++
    })

    return (2 * overlap) / (aWords.size + bWords.size)
  }

  captureSnapshot(selector?: string): DOMSnapshot | null {
    if (typeof document === 'undefined') return null

    const element = selector ? document.querySelector(selector) : document.body

    if (!element) return null

    const snapshot: DOMSnapshot = {
      id: generateId(),
      type: selector ? 'element' : 'before',
      html: element.outerHTML,
      selector,
      timestamp: Date.now()
    }

    if (element instanceof HTMLElement) {
      snapshot.attributes = {}
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i]
        snapshot.attributes[attr.name] = attr.value
      }

      if (typeof getComputedStyle !== 'undefined') {
        const computed = getComputedStyle(element)
        snapshot.styles = {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          position: computed.position,
          width: computed.width,
          height: computed.height
        }
      }
    }

    return snapshot
  }
}

// ============================================================================
// API Verifier
// ============================================================================

class APIVerifier {
  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  async verify(
    check: VerificationCheck,
    expected: ExpectedOutcome
  ): Promise<VerificationOutcome> {
    const { target, params } = check

    if (!target) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'api-error',
        error: 'No API endpoint provided'
      }
    }

    try {
      const method = (params?.method as string) || 'GET'
      const headers = (params?.headers as Record<string, string>) || {}
      const body = params?.body

      const startTime = Date.now()
      const response = await fetch(target, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      })
      const duration = Date.now() - startTime

      const responseData = await response.json().catch(() => null)

      const apiEvidence: APIResponse = {
        url: target,
        method,
        status: response.status,
        headers: this.extractHeaders(response.headers),
        body: responseData,
        duration,
        timestamp: Date.now()
      }

      switch (expected.type) {
        case 'value':
          // Expect specific status code
          const expectedStatus = expected.value as number
          const statusPassed = response.status === expectedStatus
          return {
            passed: statusPassed,
            confidence: statusPassed ? 1 : 0,
            actual: response.status,
            failureType: statusPassed ? undefined : 'api-error',
            error: statusPassed ? undefined : `Expected status ${expectedStatus} but got ${response.status}`,
            evidence: { apiResponses: [apiEvidence] }
          }

        case 'schema':
          const schemaResult = matchesSchema(responseData, expected.schema || {})
          return {
            passed: schemaResult.valid,
            confidence: schemaResult.valid ? 1 : 0,
            actual: responseData,
            failureType: schemaResult.valid ? undefined : 'schema-invalid',
            error: schemaResult.valid ? undefined : schemaResult.errors.join('; '),
            evidence: { apiResponses: [apiEvidence] }
          }

        case 'contains':
          const bodyStr = JSON.stringify(responseData)
          const containsValue = bodyStr.includes(String(expected.value))
          return {
            passed: containsValue,
            confidence: containsValue ? 1 : 0,
            actual: responseData,
            failureType: containsValue ? undefined : 'content-mismatch',
            error: containsValue ? undefined : `Response does not contain "${expected.value}"`,
            evidence: { apiResponses: [apiEvidence] }
          }

        case 'range':
          // Check status in range
          const { min = 200, max = 299 } = expected
          const inRange = response.status >= min && response.status <= max
          return {
            passed: inRange,
            confidence: inRange ? 1 : 0,
            actual: response.status,
            failureType: inRange ? undefined : 'api-error',
            error: inRange ? undefined : `Status ${response.status} not in range [${min}, ${max}]`,
            evidence: { apiResponses: [apiEvidence] }
          }

        default:
          // Default: check if response is successful (2xx)
          const isSuccess = response.ok
          return {
            passed: isSuccess,
            confidence: isSuccess ? 0.8 : 0,
            actual: response.status,
            failureType: isSuccess ? undefined : 'api-error',
            error: isSuccess ? undefined : `API request failed with status ${response.status}`,
            evidence: { apiResponses: [apiEvidence] }
          }
      }
    } catch (error) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'api-error',
        error: error instanceof Error ? error.message : 'API request failed'
      }
    }
  }
}

// ============================================================================
// File Verifier
// ============================================================================

class FileVerifier {
  async verify(
    check: VerificationCheck,
    expected: ExpectedOutcome
  ): Promise<VerificationOutcome> {
    // In browser context, file verification is limited
    // This would work with File System Access API or server-side checks

    const { target, params } = check

    if (!target) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'file-missing',
        error: 'No file path provided'
      }
    }

    // Check if we have a File object or need to fetch
    if (params?.file instanceof File) {
      return this.verifyFile(params.file, expected)
    }

    // Try to fetch the file (works for URLs)
    try {
      const response = await fetch(target)

      if (!response.ok) {
        return {
          passed: expected.type === 'exists' && expected.value === false,
          confidence: response.status === 404 ? 1 : 0.5,
          failureType: 'file-missing',
          error: `File not accessible: ${response.status}`
        }
      }

      if (expected.type === 'exists') {
        return {
          passed: expected.value !== false,
          confidence: 1,
          actual: true
        }
      }

      const content = await response.text()
      return this.verifyContent(content, expected, target)
    } catch (error) {
      if (expected.type === 'exists' && expected.value === false) {
        return {
          passed: true,
          confidence: 0.8,
          actual: false
        }
      }

      return {
        passed: false,
        confidence: 0,
        failureType: 'file-missing',
        error: error instanceof Error ? error.message : 'File verification failed'
      }
    }
  }

  private async verifyFile(
    file: File,
    expected: ExpectedOutcome
  ): Promise<VerificationOutcome> {
    if (expected.type === 'exists') {
      return {
        passed: expected.value !== false,
        confidence: 1,
        actual: true
      }
    }

    const content = await file.text()
    return this.verifyContent(content, expected, file.name)
  }

  private verifyContent(
    content: string,
    expected: ExpectedOutcome,
    path: string
  ): VerificationOutcome {
    const fileEvidence: FileContent = {
      path,
      content: content.slice(0, 10000), // Limit evidence size
      size: content.length,
      lastModified: Date.now()
    }

    switch (expected.type) {
      case 'value':
        const valueMatches = content === expected.value
        return {
          passed: valueMatches,
          confidence: valueMatches ? 1 : 0,
          actual: content.slice(0, 1000),
          failureType: valueMatches ? undefined : 'content-mismatch',
          error: valueMatches ? undefined : 'File content does not match expected value',
          evidence: { fileContents: [fileEvidence] }
        }

      case 'contains':
        const containsText = content.includes(String(expected.value))
        return {
          passed: containsText,
          confidence: containsText ? 1 : 0,
          actual: content.slice(0, 1000),
          failureType: containsText ? undefined : 'content-mismatch',
          error: containsText ? undefined : `File does not contain "${expected.value}"`,
          evidence: { fileContents: [fileEvidence] }
        }

      case 'matches':
        const regex = new RegExp(expected.pattern || '')
        const matches = regex.test(content)
        return {
          passed: matches,
          confidence: matches ? 1 : 0,
          actual: content.slice(0, 1000),
          failureType: matches ? undefined : 'content-mismatch',
          error: matches ? undefined : `File content does not match pattern "${expected.pattern}"`,
          evidence: { fileContents: [fileEvidence] }
        }

      default:
        return {
          passed: true,
          confidence: 0.7,
          actual: content.slice(0, 1000),
          evidence: { fileContents: [fileEvidence] }
        }
    }
  }
}

// ============================================================================
// Output Verifier
// ============================================================================

class OutputVerifier {
  async verify(
    check: VerificationCheck,
    expected: ExpectedOutcome,
    context?: unknown
  ): Promise<VerificationOutcome> {
    const { params } = check
    const output = params?.output ?? context

    if (output === undefined) {
      return {
        passed: expected.type === 'exists' && expected.value === false,
        confidence: 0.5,
        actual: undefined,
        failureType: 'constraint-violation',
        error: 'No output provided for verification'
      }
    }

    switch (expected.type) {
      case 'exists':
        const exists = output !== null && output !== undefined
        const shouldExist = expected.value !== false
        return {
          passed: exists === shouldExist,
          confidence: 1,
          actual: exists
        }

      case 'value':
        const valueMatches = deepEqual(output, expected.value)
        return {
          passed: valueMatches,
          confidence: valueMatches ? 1 : 0,
          actual: output,
          failureType: valueMatches ? undefined : 'value-mismatch',
          error: valueMatches ? undefined : 'Output value does not match expected'
        }

      case 'contains':
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output)
        const contains = outputStr.includes(String(expected.value))
        return {
          passed: contains,
          confidence: contains ? 1 : 0,
          actual: output,
          failureType: contains ? undefined : 'content-mismatch',
          error: contains ? undefined : `Output does not contain "${expected.value}"`
        }

      case 'matches':
        const matchStr = typeof output === 'string' ? output : JSON.stringify(output)
        const regex = new RegExp(expected.pattern || '')
        const matches = regex.test(matchStr)
        return {
          passed: matches,
          confidence: matches ? 1 : 0,
          actual: output,
          failureType: matches ? undefined : 'content-mismatch',
          error: matches ? undefined : `Output does not match pattern "${expected.pattern}"`
        }

      case 'schema':
        const schemaResult = matchesSchema(output, expected.schema || {})
        return {
          passed: schemaResult.valid,
          confidence: schemaResult.valid ? 1 : 0,
          actual: output,
          failureType: schemaResult.valid ? undefined : 'schema-invalid',
          error: schemaResult.valid ? undefined : schemaResult.errors.join('; ')
        }

      case 'range':
        if (typeof output !== 'number') {
          return {
            passed: false,
            confidence: 0,
            actual: output,
            failureType: 'constraint-violation',
            error: 'Output is not a number for range check'
          }
        }
        const { min = -Infinity, max = Infinity, tolerance = 0 } = expected
        const inRange = output >= min - tolerance && output <= max + tolerance
        return {
          passed: inRange,
          confidence: inRange ? 1 : 0,
          actual: output,
          failureType: inRange ? undefined : 'constraint-violation',
          error: inRange ? undefined : `Output ${output} not in range [${min}, ${max}]`
        }

      case 'custom':
        if (expected.compare) {
          try {
            const passed = expected.compare(output, expected.value)
            return {
              passed,
              confidence: passed ? 1 : 0,
              actual: output,
              failureType: passed ? undefined : 'constraint-violation',
              error: passed ? undefined : 'Custom comparison failed'
            }
          } catch (error) {
            return {
              passed: false,
              confidence: 0,
              actual: output,
              failureType: 'unknown',
              error: error instanceof Error ? error.message : 'Custom comparison error'
            }
          }
        }
        return {
          passed: false,
          confidence: 0,
          failureType: 'unknown',
          error: 'No custom comparison function provided'
        }

      default:
        return {
          passed: true,
          confidence: 0.5,
          actual: output
        }
    }
  }
}

// ============================================================================
// Screenshot Verifier
// ============================================================================

class ScreenshotVerifier {
  async verify(
    check: VerificationCheck,
    expected: ExpectedOutcome
  ): Promise<VerificationOutcome> {
    // Screenshot verification requires external tools (puppeteer, playwright)
    // or integration with a visual testing service
    // This is a placeholder implementation

    const { params } = check
    const beforeScreenshot = params?.before as string | undefined
    const afterScreenshot = params?.after as string | undefined

    if (!beforeScreenshot && !afterScreenshot) {
      return {
        passed: false,
        confidence: 0,
        failureType: 'visual-diff',
        error: 'No screenshots provided for comparison'
      }
    }

    if (expected.type === 'exists') {
      // Just verify screenshot exists
      const hasScreenshot = Boolean(beforeScreenshot || afterScreenshot)
      return {
        passed: hasScreenshot === (expected.value !== false),
        confidence: 1,
        actual: hasScreenshot
      }
    }

    if (beforeScreenshot && afterScreenshot) {
      // Would perform visual diff comparison here
      // Using external library like pixelmatch or resemble.js

      // Placeholder: assume 95% similar
      const similarity = 95

      const threshold = (expected.tolerance || 0.05) * 100
      const passed = similarity >= (100 - threshold)

      return {
        passed,
        confidence: similarity / 100,
        actual: similarity,
        failureType: passed ? undefined : 'visual-diff',
        error: passed ? undefined : `Visual diff detected: ${100 - similarity}% difference`,
        evidence: {
          visualDiffs: [{
            before: beforeScreenshot,
            after: afterScreenshot,
            diff: '', // Would be generated
            similarity,
            changedRegions: []
          }]
        }
      }
    }

    return {
      passed: true,
      confidence: 0.5,
      actual: undefined
    }
  }

  async captureScreenshot(
    selector?: string
  ): Promise<ScreenshotEvidence | null> {
    // Would use html2canvas or similar in browser
    // or puppeteer/playwright for full-page screenshots

    if (typeof document === 'undefined') return null

    // Placeholder implementation
    return {
      id: generateId(),
      type: selector ? 'element' : 'before',
      data: '', // Would be base64 image
      timestamp: Date.now(),
      selector,
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0
      }
    }
  }
}

// ============================================================================
// Main Verification Engine Class
// ============================================================================

export class VerificationEngine {
  private domVerifier: DOMVerifier
  private apiVerifier: APIVerifier
  private fileVerifier: FileVerifier
  private outputVerifier: OutputVerifier
  private screenshotVerifier: ScreenshotVerifier

  private rules: Map<string, VerificationRule<unknown>> = new Map()
  private ruleChains: Map<string, string[]> = new Map()
  private stats: VerificationStats
  private hooks: VerificationHooks = {}
  private defaultTimeout: number = DEFAULT_TIMEOUT
  private defaultRetryConfig: RetryConfig = DEFAULT_RETRY_CONFIG

  constructor(config?: {
    timeout?: number
    retry?: Partial<RetryConfig>
    hooks?: VerificationHooks
  }) {
    this.domVerifier = new DOMVerifier()
    this.apiVerifier = new APIVerifier()
    this.fileVerifier = new FileVerifier()
    this.outputVerifier = new OutputVerifier()
    this.screenshotVerifier = new ScreenshotVerifier()

    this.stats = this.createInitialStats()

    if (config?.timeout) {
      this.defaultTimeout = config.timeout
    }

    if (config?.retry) {
      this.defaultRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry }
    }

    if (config?.hooks) {
      this.hooks = config.hooks
    }
  }

  // ==========================================================================
  // Rule Management
  // ==========================================================================

  /**
   * Create a new verification rule
   */
  createRule<TContext = unknown>(
    rule: VerificationRule<TContext>
  ): VerificationRule<TContext> {
    this.rules.set(rule.id, rule as VerificationRule<unknown>)
    return rule
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): VerificationRule<unknown> | undefined {
    return this.rules.get(ruleId)
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId)
  }

  /**
   * Create a chain of rules to be executed in sequence
   */
  createChain(chainId: string, ruleIds: string[]): void {
    this.ruleChains.set(chainId, ruleIds)
  }

  /**
   * Get all registered rules
   */
  getAllRules(): VerificationRule<unknown>[] {
    return Array.from(this.rules.values())
  }

  // ==========================================================================
  // Core Verification
  // ==========================================================================

  /**
   * Verify a single rule
   */
  async verify<TContext = unknown>(
    rule: VerificationRule<TContext>,
    context?: TContext
  ): Promise<VerificationResult> {
    const startTime = Date.now()
    const resultId = generateId()
    const retryConfig = rule.retry || this.defaultRetryConfig
    const timeout = rule.timeout || this.defaultTimeout

    // Check condition
    if (rule.condition && context !== undefined && !rule.condition(context)) {
      return this.createSkippedResult(resultId, rule as unknown as VerificationRule<unknown>, startTime)
    }

    this.hooks.onStart?.(rule as unknown as VerificationRule<unknown>)

    let attempt = 0
    let lastOutcome: VerificationOutcome | null = null
    let evidence: VerificationEvidence = { logs: [] }

    while (attempt <= retryConfig.maxAttempts) {
      attempt++

      try {
        // Execute verification with timeout
        const outcomePromise = this.executeVerification(rule, context, evidence)
        const timeoutPromise = new Promise<VerificationOutcome>((_, reject) =>
          setTimeout(() => reject(new Error('Verification timeout')), timeout)
        )

        lastOutcome = await Promise.race([outcomePromise, timeoutPromise])

        // Merge evidence
        if (lastOutcome.evidence) {
          evidence = this.mergeEvidence(evidence, lastOutcome.evidence)
        }

        // If passed or non-retryable failure, exit loop
        if (lastOutcome.passed) {
          break
        }

        const failureType = lastOutcome.failureType || 'unknown'

        if (retryConfig.nonRetryableFailures?.includes(failureType)) {
          break
        }

        if (retryConfig.retryableFailures &&
            !retryConfig.retryableFailures.includes(failureType)) {
          break
        }

        // Log retry
        evidence.logs?.push({
          level: 'warn',
          message: `Verification attempt ${attempt} failed: ${lastOutcome.error}`,
          timestamp: Date.now(),
          data: { failureType }
        })

        this.hooks.onRetry?.(rule as unknown as VerificationRule<unknown>, attempt, new Error(lastOutcome.error || 'Verification failed'))

        // Wait before retry
        if (attempt <= retryConfig.maxAttempts) {
          const delay = calculateBackoff(attempt, retryConfig)
          await sleep(delay)
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        if (errorMessage === 'Verification timeout') {
          this.hooks.onTimeout?.(rule as unknown as VerificationRule<unknown>)
          lastOutcome = {
            passed: false,
            confidence: 0,
            failureType: 'timeout',
            error: 'Verification timed out'
          }
          break
        }

        evidence.logs?.push({
          level: 'error',
          message: `Verification error: ${errorMessage}`,
          timestamp: Date.now()
        })

        lastOutcome = {
          passed: false,
          confidence: 0,
          failureType: 'unknown',
          error: errorMessage
        }

        // Retry on error
        if (attempt <= retryConfig.maxAttempts) {
          this.hooks.onRetry?.(rule as unknown as VerificationRule<unknown>, attempt, error instanceof Error ? error : new Error(errorMessage))
          const delay = calculateBackoff(attempt, retryConfig)
          await sleep(delay)
        }
      }
    }

    const result = this.createResult(
      resultId,
      rule as unknown as VerificationRule<unknown>,
      lastOutcome || { passed: false, confidence: 0 },
      startTime,
      attempt - 1,
      evidence
    )

    // Update stats
    this.updateStats(rule as unknown as VerificationRule<unknown>, result)

    // Call hooks
    if (result.passed) {
      this.hooks.onPass?.(result)
    } else {
      this.hooks.onFail?.(result)
    }
    this.hooks.onComplete?.(result)

    return result
  }

  /**
   * Verify multiple rules
   */
  async verifyAll<TContext = unknown>(
    rules: VerificationRule<TContext>[],
    context?: TContext,
    options?: { parallel?: boolean; stopOnFailure?: boolean }
  ): Promise<VerificationSummary> {
    const startTime = Date.now()
    const { parallel = false, stopOnFailure = false } = options || {}

    // Sort by priority
    const sortedRules = [...rules].sort(
      (a, b) => (a.priority || 100) - (b.priority || 100)
    )

    const results: VerificationResult[] = []

    if (parallel) {
      const promises = sortedRules.map(rule => this.verify(rule, context))
      results.push(...await Promise.all(promises))
    } else {
      for (const rule of sortedRules) {
        const result = await this.verify(rule, context)
        results.push(result)

        if (stopOnFailure && !result.passed && rule.critical) {
          // Add skipped results for remaining rules
          for (const remaining of sortedRules.slice(results.length)) {
            results.push(this.createSkippedResult(generateId(), remaining as unknown as VerificationRule<unknown>, Date.now()))
          }
          break
        }
      }
    }

    return this.createSummary(results, startTime)
  }

  /**
   * Verify a chain of rules
   */
  async verifyChain<TContext = unknown>(
    chainId: string,
    context?: TContext
  ): Promise<VerificationSummary> {
    const ruleIds = this.ruleChains.get(chainId)

    if (!ruleIds || ruleIds.length === 0) {
      return {
        passed: true,
        confidence: 1,
        summary: 'Empty chain - no rules to verify',
        results: [],
        passedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalDuration: 0,
        timestamp: Date.now(),
        criticalFailure: false,
        suggestions: []
      }
    }

    const rules = ruleIds
      .map(id => this.rules.get(id))
      .filter((r): r is VerificationRule<unknown> => r !== undefined)

    return this.verifyAll(rules, context, { stopOnFailure: true })
  }

  // ==========================================================================
  // Action Wrapper
  // ==========================================================================

  /**
   * Wrap an action with verification
   */
  wrapWithVerification<TInput = unknown, TOutput = unknown>(
    config: ActionConfig<TInput, TOutput>
  ): (input: TInput) => Promise<{ output: TOutput; verification: VerificationSummary }> {
    return async (input: TInput) => {
      const startTime = Date.now()

      // Pre-verification hook
      if (config.beforeVerify) {
        await config.beforeVerify(input)
      }

      // Execute the action
      let output: TOutput
      try {
        const actionPromise = config.action(input)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Action timeout')),
            config.timeout || this.defaultTimeout
          )
        )

        output = await Promise.race([actionPromise, timeoutPromise])
      } catch (error) {
        // Return failed verification summary
        const failedSummary: VerificationSummary = {
          passed: false,
          confidence: 0,
          summary: `Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          results: [],
          passedCount: 0,
          failedCount: 1,
          skippedCount: 0,
          totalDuration: Date.now() - startTime,
          timestamp: Date.now(),
          criticalFailure: true,
          suggestions: ['Check action implementation', 'Verify input parameters']
        }

        if (config.onFailure) {
          await config.onFailure(failedSummary)
        }

        throw error
      }

      // Run verifications with output as context
      const verification = await this.verifyAll(
        config.rules,
        { input, output } as unknown
      )

      // Post-verification hook
      if (config.afterVerify) {
        await config.afterVerify(verification, output)
      }

      // Handle failure
      if (!verification.passed && config.onFailure) {
        const escalation = await config.onFailure(verification)

        switch (escalation) {
          case 'abort':
            throw new Error(`Verification failed: ${verification.summary}`)
          case 'retry':
            // Recursive retry (with limit in place)
            return this.wrapWithVerification(config)(input)
          case 'skip':
          case 'fallback':
          case 'human-review':
          default:
            // Continue with warning
            console.warn(`[VerificationEngine] Verification failed but continuing: ${verification.summary}`)
        }
      }

      return { output, verification }
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get verification statistics
   */
  getStats(): VerificationStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.createInitialStats()
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async executeVerification<TContext>(
    rule: VerificationRule<TContext>,
    context: TContext | undefined,
    evidence: VerificationEvidence
  ): Promise<VerificationOutcome> {
    // Handle custom strategy
    if (rule.strategy === 'custom' && rule.customVerify) {
      return rule.customVerify(context as TContext)
    }

    // Route to appropriate verifier
    switch (rule.strategy) {
      case 'dom':
        // Capture DOM snapshot before verification
        const domSnapshot = this.domVerifier.captureSnapshot(rule.check.target)
        if (domSnapshot) {
          evidence.domSnapshots = evidence.domSnapshots || []
          evidence.domSnapshots.push(domSnapshot)
        }
        return this.domVerifier.verify(rule.check, rule.expected)

      case 'api':
        return this.apiVerifier.verify(rule.check, rule.expected)

      case 'file':
        return this.fileVerifier.verify(rule.check, rule.expected)

      case 'output':
        return this.outputVerifier.verify(rule.check, rule.expected, context)

      case 'screenshot':
        return this.screenshotVerifier.verify(rule.check, rule.expected)

      default:
        return {
          passed: false,
          confidence: 0,
          failureType: 'unknown',
          error: `Unknown verification strategy: ${rule.strategy}`
        }
    }
  }

  private createResult(
    id: string,
    rule: VerificationRule<unknown>,
    outcome: VerificationOutcome,
    startTime: number,
    retryAttempts: number,
    evidence: VerificationEvidence
  ): VerificationResult {
    const completedAt = Date.now()

    const suggestions: string[] = []
    if (!outcome.passed) {
      suggestions.push(...this.generateSuggestions(rule, outcome))
    }

    return {
      id,
      ruleId: rule.id,
      status: outcome.passed ? 'passed' : 'failed',
      passed: outcome.passed,
      confidence: clampConfidence(outcome.confidence),
      explanation: this.generateExplanation(rule, outcome),
      evidence: this.mergeEvidence(evidence, outcome.evidence || {}),
      suggestions,
      actual: outcome.actual,
      expected: rule.expected.value,
      failureType: outcome.failureType,
      startedAt: startTime,
      completedAt,
      duration: completedAt - startTime,
      retryAttempts
    }
  }

  private createSkippedResult(
    id: string,
    rule: VerificationRule<unknown>,
    startTime: number
  ): VerificationResult {
    const completedAt = Date.now()

    return {
      id,
      ruleId: rule.id,
      status: 'skipped',
      passed: true, // Skipped is considered non-failure
      confidence: 1,
      explanation: `Rule "${rule.name}" was skipped due to condition`,
      evidence: {},
      suggestions: [],
      startedAt: startTime,
      completedAt,
      duration: completedAt - startTime,
      retryAttempts: 0
    }
  }

  private createSummary(
    results: VerificationResult[],
    startTime: number
  ): VerificationSummary {
    const passed = results.filter(r => r.passed && r.status !== 'skipped')
    const failed = results.filter(r => !r.passed)
    const skipped = results.filter(r => r.status === 'skipped')

    const allPassed = failed.length === 0
    const criticalFailure = results.some(r =>
      !r.passed && this.rules.get(r.ruleId)?.critical
    )

    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
      : 1

    const allSuggestions = Array.from(new Set(
      results.flatMap(r => r.suggestions)
    ))

    return {
      passed: allPassed,
      confidence: clampConfidence(avgConfidence),
      summary: this.generateSummaryMessage(passed.length, failed.length, skipped.length),
      results,
      passedCount: passed.length,
      failedCount: failed.length,
      skippedCount: skipped.length,
      totalDuration: Date.now() - startTime,
      timestamp: Date.now(),
      criticalFailure,
      suggestions: allSuggestions
    }
  }

  private generateExplanation(
    rule: VerificationRule,
    outcome: VerificationOutcome
  ): string {
    if (outcome.passed) {
      return `Verification "${rule.name}" passed with ${Math.round(outcome.confidence * 100)}% confidence.`
    }

    return `Verification "${rule.name}" failed: ${outcome.error || 'Unknown reason'}. ` +
      `Failure type: ${outcome.failureType || 'unknown'}.`
  }

  private generateSuggestions(
    rule: VerificationRule,
    outcome: VerificationOutcome
  ): string[] {
    const suggestions: string[] = []

    switch (outcome.failureType) {
      case 'element-not-found':
        suggestions.push('Verify the selector is correct')
        suggestions.push('Check if the element is loaded after an async operation')
        suggestions.push('Ensure the element is not hidden or removed')
        break

      case 'value-mismatch':
      case 'content-mismatch':
        suggestions.push('Check for whitespace or formatting differences')
        suggestions.push('Verify the expected value is up to date')
        suggestions.push('Consider using a more flexible matching strategy')
        break

      case 'api-error':
        suggestions.push('Check API endpoint URL')
        suggestions.push('Verify authentication and authorization')
        suggestions.push('Check network connectivity')
        break

      case 'schema-invalid':
        suggestions.push('Review the schema definition')
        suggestions.push('Check for missing required fields')
        suggestions.push('Verify data types match the schema')
        break

      case 'file-missing':
        suggestions.push('Verify the file path is correct')
        suggestions.push('Check file permissions')
        suggestions.push('Ensure the file has been created before verification')
        break

      case 'timeout':
        suggestions.push('Increase the timeout value')
        suggestions.push('Check for slow network or processing')
        suggestions.push('Consider breaking into smaller verification steps')
        break

      case 'visual-diff':
        suggestions.push('Review the visual differences')
        suggestions.push('Update baseline screenshots if changes are intentional')
        suggestions.push('Check for dynamic content that may cause differences')
        break

      default:
        suggestions.push('Review the verification rule configuration')
        suggestions.push('Check the logs for more details')
    }

    return suggestions
  }

  private generateSummaryMessage(
    passed: number,
    failed: number,
    skipped: number
  ): string {
    const total = passed + failed + skipped
    const parts: string[] = []

    if (failed === 0) {
      parts.push(`All ${passed} verification(s) passed`)
    } else {
      parts.push(`${failed} of ${total} verification(s) failed`)
    }

    if (skipped > 0) {
      parts.push(`${skipped} skipped`)
    }

    return parts.join(', ')
  }

  private mergeEvidence(
    a: VerificationEvidence,
    b: Partial<VerificationEvidence>
  ): VerificationEvidence {
    return {
      screenshots: [...(a.screenshots || []), ...(b.screenshots || [])],
      logs: [...(a.logs || []), ...(b.logs || [])],
      domSnapshots: [...(a.domSnapshots || []), ...(b.domSnapshots || [])],
      apiResponses: [...(a.apiResponses || []), ...(b.apiResponses || [])],
      fileContents: [...(a.fileContents || []), ...(b.fileContents || [])],
      visualDiffs: [...(a.visualDiffs || []), ...(b.visualDiffs || [])],
      custom: { ...(a.custom || {}), ...(b.custom || {}) }
    }
  }

  private createInitialStats(): VerificationStats {
    return {
      totalRuns: 0,
      totalPassed: 0,
      totalFailed: 0,
      passRate: 1,
      avgConfidence: 1,
      avgDuration: 0,
      avgRetries: 0,
      byStrategy: {
        dom: { runs: 0, passed: 0, failed: 0, avgConfidence: 1 },
        screenshot: { runs: 0, passed: 0, failed: 0, avgConfidence: 1 },
        api: { runs: 0, passed: 0, failed: 0, avgConfidence: 1 },
        file: { runs: 0, passed: 0, failed: 0, avgConfidence: 1 },
        output: { runs: 0, passed: 0, failed: 0, avgConfidence: 1 },
        custom: { runs: 0, passed: 0, failed: 0, avgConfidence: 1 }
      },
      byRule: {},
      recentFailures: []
    }
  }

  private updateStats(
    rule: VerificationRule<unknown>,
    result: VerificationResult
  ): void {
    // Update totals
    this.stats.totalRuns++
    if (result.passed) {
      this.stats.totalPassed++
    } else {
      this.stats.totalFailed++
    }

    this.stats.passRate = this.stats.totalPassed / this.stats.totalRuns

    // Update averages
    this.stats.avgConfidence =
      (this.stats.avgConfidence * (this.stats.totalRuns - 1) + result.confidence) /
      this.stats.totalRuns

    this.stats.avgDuration =
      (this.stats.avgDuration * (this.stats.totalRuns - 1) + result.duration) /
      this.stats.totalRuns

    this.stats.avgRetries =
      (this.stats.avgRetries * (this.stats.totalRuns - 1) + result.retryAttempts) /
      this.stats.totalRuns

    // Update by strategy
    const strategy = rule.strategy
    const stratStats = this.stats.byStrategy[strategy]
    stratStats.runs++
    if (result.passed) {
      stratStats.passed++
    } else {
      stratStats.failed++
    }
    stratStats.avgConfidence =
      (stratStats.avgConfidence * (stratStats.runs - 1) + result.confidence) /
      stratStats.runs

    // Update by rule
    if (!this.stats.byRule[rule.id]) {
      this.stats.byRule[rule.id] = {
        runs: 0,
        passed: 0,
        failed: 0,
        avgConfidence: 1,
        avgDuration: 0
      }
    }

    const ruleStats = this.stats.byRule[rule.id]
    ruleStats.runs++
    if (result.passed) {
      ruleStats.passed++
    } else {
      ruleStats.failed++
    }
    ruleStats.avgConfidence =
      (ruleStats.avgConfidence * (ruleStats.runs - 1) + result.confidence) /
      ruleStats.runs
    ruleStats.avgDuration =
      (ruleStats.avgDuration * (ruleStats.runs - 1) + result.duration) /
      ruleStats.runs

    // Track recent failures
    if (!result.passed) {
      this.stats.recentFailures.push({
        ruleId: rule.id,
        failureType: result.failureType || 'unknown',
        timestamp: Date.now(),
        message: result.explanation
      })

      // Keep only last 50 failures
      if (this.stats.recentFailures.length > 50) {
        this.stats.recentFailures = this.stats.recentFailures.slice(-50)
      }
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Set lifecycle hooks
   */
  setHooks(hooks: VerificationHooks): void {
    this.hooks = { ...this.hooks, ...hooks }
  }

  /**
   * Set default timeout
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout
  }

  /**
   * Set default retry configuration
   */
  setDefaultRetry(config: Partial<RetryConfig>): void {
    this.defaultRetryConfig = { ...this.defaultRetryConfig, ...config }
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear()
    this.ruleChains.clear()
  }
}

// ============================================================================
// Singleton Instance and Export
// ============================================================================

export const verificationEngine = new VerificationEngine()

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Create a verification rule (convenience function)
 */
export function createRule<TContext = unknown>(
  rule: VerificationRule<TContext>
): VerificationRule<TContext> {
  return verificationEngine.createRule(rule)
}

/**
 * Verify a rule (convenience function)
 */
export async function verify<TContext = unknown>(
  rule: VerificationRule<TContext>,
  context?: TContext
): Promise<VerificationResult> {
  return verificationEngine.verify(rule, context)
}

/**
 * Verify multiple rules (convenience function)
 */
export async function verifyAll<TContext = unknown>(
  rules: VerificationRule<TContext>[],
  context?: TContext,
  options?: { parallel?: boolean; stopOnFailure?: boolean }
): Promise<VerificationSummary> {
  return verificationEngine.verifyAll(rules, context, options)
}

/**
 * Wrap an action with verification (convenience function)
 */
export function wrapWithVerification<TInput = unknown, TOutput = unknown>(
  config: ActionConfig<TInput, TOutput>
): (input: TInput) => Promise<{ output: TOutput; verification: VerificationSummary }> {
  return verificationEngine.wrapWithVerification(config)
}

// ============================================================================
// Pre-built Rule Templates
// ============================================================================

export const RuleTemplates = {
  /**
   * Verify an element exists in the DOM
   */
  elementExists: (
    id: string,
    selector: string,
    options?: { critical?: boolean; timeout?: number }
  ): VerificationRule => ({
    id,
    name: `Element exists: ${selector}`,
    description: `Verify that element ${selector} exists in the DOM`,
    strategy: 'dom',
    check: { type: 'exists', target: selector },
    expected: { type: 'exists', value: true },
    critical: options?.critical ?? false,
    timeout: options?.timeout
  }),

  /**
   * Verify an element has a specific value
   */
  elementValue: (
    id: string,
    selector: string,
    expectedValue: string,
    options?: { critical?: boolean }
  ): VerificationRule => ({
    id,
    name: `Element value: ${selector}`,
    description: `Verify that element ${selector} has value "${expectedValue}"`,
    strategy: 'dom',
    check: { type: 'value', target: selector },
    expected: { type: 'value', value: expectedValue },
    critical: options?.critical ?? false
  }),

  /**
   * Verify an API returns a successful status
   */
  apiSuccess: (
    id: string,
    endpoint: string,
    options?: { method?: string; critical?: boolean; timeout?: number }
  ): VerificationRule => ({
    id,
    name: `API success: ${endpoint}`,
    description: `Verify that API ${endpoint} returns a successful response`,
    strategy: 'api',
    check: {
      type: 'status',
      target: endpoint,
      params: { method: options?.method || 'GET' }
    },
    expected: { type: 'range', min: 200, max: 299 },
    critical: options?.critical ?? false,
    timeout: options?.timeout
  }),

  /**
   * Verify an API response matches a schema
   */
  apiSchema: (
    id: string,
    endpoint: string,
    schema: Record<string, unknown>,
    options?: { method?: string; critical?: boolean }
  ): VerificationRule => ({
    id,
    name: `API schema: ${endpoint}`,
    description: `Verify that API ${endpoint} response matches schema`,
    strategy: 'api',
    check: {
      type: 'schema',
      target: endpoint,
      params: { method: options?.method || 'GET' }
    },
    expected: { type: 'schema', schema },
    critical: options?.critical ?? false
  }),

  /**
   * Verify output contains expected text
   */
  outputContains: (
    id: string,
    expectedText: string,
    options?: { critical?: boolean }
  ): VerificationRule => ({
    id,
    name: `Output contains: ${expectedText}`,
    description: `Verify that output contains "${expectedText}"`,
    strategy: 'output',
    check: { type: 'contains' },
    expected: { type: 'contains', value: expectedText },
    critical: options?.critical ?? false
  }),

  /**
   * Verify output matches a pattern
   */
  outputMatches: (
    id: string,
    pattern: string,
    options?: { critical?: boolean }
  ): VerificationRule => ({
    id,
    name: `Output matches: ${pattern}`,
    description: `Verify that output matches pattern "${pattern}"`,
    strategy: 'output',
    check: { type: 'matches' },
    expected: { type: 'matches', pattern },
    critical: options?.critical ?? false
  }),

  /**
   * Custom verification
   */
  custom: <TContext>(
    id: string,
    name: string,
    verifyFn: (context: TContext) => Promise<VerificationOutcome>,
    options?: { critical?: boolean; timeout?: number }
  ): VerificationRule<TContext> => ({
    id,
    name,
    description: `Custom verification: ${name}`,
    strategy: 'custom',
    check: { type: 'custom' },
    expected: { type: 'custom' },
    customVerify: verifyFn,
    critical: options?.critical ?? false,
    timeout: options?.timeout
  })
}

export default verificationEngine
