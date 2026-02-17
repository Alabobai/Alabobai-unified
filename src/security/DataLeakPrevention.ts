/**
 * Data Leak Prevention (DLP)
 *
 * Monitors and prevents accidental or malicious data leakage
 * across the platform, including in AI conversations, exports,
 * and external API calls.
 */

export interface DataLeakScanResult {
  clean: boolean
  leaks: DetectedLeak[]
  recommendations: string[]
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

export interface DetectedLeak {
  type: LeakType
  value: string
  maskedValue: string
  location: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  context?: string
}

export type LeakType =
  | 'api_key'
  | 'password'
  | 'private_key'
  | 'jwt_token'
  | 'database_connection'
  | 'personal_info'
  | 'financial_data'
  | 'health_data'
  | 'internal_url'
  | 'source_code'
  | 'credential'

// ============================================================================
// Detection Patterns
// ============================================================================

interface PatternDefinition {
  pattern: RegExp
  type: LeakType
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  validate?: (match: string) => boolean
}

const LEAK_PATTERNS: PatternDefinition[] = [
  // API Keys
  {
    pattern: /(?:api[_-]?key|apikey)[=:\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    type: 'api_key',
    severity: 'critical',
    description: 'Generic API key'
  },
  {
    pattern: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'OpenAI API key'
  },
  {
    pattern: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'Stripe API key'
  },
  {
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'Google API key'
  },
  {
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'GitHub Personal Access Token'
  },
  {
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'GitHub OAuth Token'
  },
  {
    pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'Slack token'
  },
  {
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
    type: 'api_key',
    severity: 'critical',
    description: 'AWS Access Key ID'
  },

  // Private Keys
  {
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    type: 'private_key',
    severity: 'critical',
    description: 'Private cryptographic key'
  },
  {
    pattern: /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    type: 'private_key',
    severity: 'high',
    description: 'Certificate (may contain sensitive info)'
  },

  // JWT Tokens
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    type: 'jwt_token',
    severity: 'high',
    description: 'JWT token'
  },

  // Database Connection Strings
  {
    pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|mssql):\/\/[^\s'"]+/gi,
    type: 'database_connection',
    severity: 'critical',
    description: 'Database connection string'
  },
  {
    pattern: /(?:Server|Data Source)=[^;]+;(?:Database|Initial Catalog)=[^;]+;(?:User Id|UID)=[^;]+;(?:Password|PWD)=[^;]+/gi,
    type: 'database_connection',
    severity: 'critical',
    description: 'SQL Server connection string'
  },

  // Passwords
  {
    pattern: /(?:password|passwd|pwd|secret)[=:\s]*['"]([^'"]{8,})['"]?/gi,
    type: 'password',
    severity: 'critical',
    description: 'Password in plaintext'
  },
  {
    pattern: /(?:the\s+)?password\s+is\s+(\S{6,})/gi,
    type: 'password',
    severity: 'critical',
    description: 'Exposed password in text'
  },
  {
    pattern: /(?:auth|authentication)[_-]?(?:token|key)[=:\s]*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,
    type: 'credential',
    severity: 'high',
    description: 'Authentication token'
  },

  // Personal Information (PII)
  {
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    type: 'personal_info',
    severity: 'high',
    description: 'Social Security Number',
    validate: (match) => {
      // Basic SSN validation
      const cleaned = match.replace(/[-.\s]/g, '')
      if (cleaned.length !== 9) return false
      // Invalid SSN patterns
      if (/^0{3}|^6{3}|^9{3}/.test(cleaned)) return false
      if (/^\d{3}0{2}|^\d{3}9{2}/.test(cleaned)) return false
      return true
    }
  },
  {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    type: 'financial_data',
    severity: 'critical',
    description: 'Credit card number',
    validate: (match) => {
      // Luhn algorithm validation
      const digits = match.replace(/\D/g, '')
      let sum = 0
      let isEven = false
      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i], 10)
        if (isEven) {
          digit *= 2
          if (digit > 9) digit -= 9
        }
        sum += digit
        isEven = !isEven
      }
      return sum % 10 === 0
    }
  },
  {
    pattern: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
    type: 'financial_data',
    severity: 'critical',
    description: 'Credit card number with separators'
  },
  {
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b/g,
    type: 'financial_data',
    severity: 'high',
    description: 'IBAN number'
  },

  // Health Data (HIPAA)
  {
    pattern: /(?:patient|medical|health)\s*(?:id|record|number)[=:\s]*['"]?([a-zA-Z0-9-]+)['"]?/gi,
    type: 'health_data',
    severity: 'critical',
    description: 'Health record identifier'
  },
  {
    pattern: /\b(?:diagnosis|prescription|medication|treatment):\s*[^\n]+/gi,
    type: 'health_data',
    severity: 'high',
    description: 'Medical information'
  },

  // Internal URLs and Endpoints
  {
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)[:\d]*(?:\/[^\s'"]*)?/gi,
    type: 'internal_url',
    severity: 'medium',
    description: 'Internal/private network URL'
  },
  {
    pattern: /https?:\/\/[^\s'"]*\.(?:internal|local|corp|intranet)\.[^\s'"]*/gi,
    type: 'internal_url',
    severity: 'medium',
    description: 'Internal domain URL'
  },

  // Source Code Patterns
  {
    pattern: /(?:const|let|var|function|class|import|export|require)\s+\w+/g,
    type: 'source_code',
    severity: 'low',
    description: 'Source code fragment'
  }
]

// ============================================================================
// Data Leak Prevention Class
// ============================================================================

export class DataLeakPrevention {
  private static instance: DataLeakPrevention
  private allowedDomains: Set<string> = new Set()
  private redactionHistory: Array<{
    timestamp: Date
    type: LeakType
    context: string
  }> = []

  private config = {
    enabled: true,
    logRedactions: true,
    blockOnCritical: true,
    maskCharacter: '*',
    preserveLength: true,
    scanSourceCode: false // Set to true for stricter mode
  }

  private constructor() {
    // Add some default allowed domains
    this.allowedDomains.add('example.com')
    this.allowedDomains.add('localhost')
  }

  static getInstance(): DataLeakPrevention {
    if (!DataLeakPrevention.instance) {
      DataLeakPrevention.instance = new DataLeakPrevention()
    }
    return DataLeakPrevention.instance
  }

  /**
   * Scan content for potential data leaks
   */
  scan(content: string, context: string = 'unknown'): DataLeakScanResult {
    if (!this.config.enabled) {
      return {
        clean: true,
        leaks: [],
        recommendations: [],
        riskLevel: 'none'
      }
    }

    const leaks: DetectedLeak[] = []

    for (const { pattern, type, severity, description, validate } of LEAK_PATTERNS) {
      // Skip source code patterns unless explicitly enabled
      if (type === 'source_code' && !this.config.scanSourceCode) continue

      const matches = content.matchAll(new RegExp(pattern))

      for (const match of matches) {
        const value = match[1] || match[0]

        // Run custom validation if provided
        if (validate && !validate(value)) continue

        // Skip if it's an allowed domain
        if (type === 'internal_url' && this.isAllowedDomain(value)) continue

        leaks.push({
          type,
          value,
          maskedValue: this.maskValue(value),
          location: `offset ${match.index}`,
          severity,
          context: description
        })
      }
    }

    // Log redactions
    if (this.config.logRedactions && leaks.length > 0) {
      for (const leak of leaks) {
        this.redactionHistory.push({
          timestamp: new Date(),
          type: leak.type,
          context
        })
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(leaks)

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(leaks)

    return {
      clean: leaks.length === 0,
      leaks,
      recommendations,
      riskLevel
    }
  }

  /**
   * Redact sensitive data from content
   */
  redact(content: string): string {
    let redacted = content

    for (const { pattern, type, validate } of LEAK_PATTERNS) {
      if (type === 'source_code' && !this.config.scanSourceCode) continue

      redacted = redacted.replace(pattern, (match, ...groups) => {
        const value = groups[0] || match

        if (validate && !validate(value)) {
          return match
        }

        return this.maskValue(match)
      })
    }

    return redacted
  }

  /**
   * Check if content can be safely exported/shared
   */
  canExport(content: string): { allowed: boolean; reason?: string } {
    const result = this.scan(content, 'export_check')

    if (result.riskLevel === 'critical' && this.config.blockOnCritical) {
      return {
        allowed: false,
        reason: `Critical data leak detected: ${result.leaks[0]?.context}`
      }
    }

    if (result.riskLevel === 'high') {
      return {
        allowed: false,
        reason: `High-risk data detected: ${result.leaks.map(l => l.context).join(', ')}`
      }
    }

    return { allowed: true }
  }

  /**
   * Validate data before sending to external API
   */
  validateForExternalAPI(data: unknown): { safe: boolean; issues: string[] } {
    const issues: string[] = []
    const jsonString = JSON.stringify(data, null, 2)

    const result = this.scan(jsonString, 'external_api')

    for (const leak of result.leaks) {
      if (leak.severity === 'critical' || leak.severity === 'high') {
        issues.push(`${leak.context}: ${leak.maskedValue}`)
      }
    }

    return {
      safe: issues.length === 0,
      issues
    }
  }

  /**
   * Mask a sensitive value
   */
  private maskValue(value: string): string {
    if (!this.config.preserveLength) {
      return '[REDACTED]'
    }

    const maskChar = this.config.maskCharacter

    // Preserve some characters for context
    if (value.length <= 8) {
      return maskChar.repeat(value.length)
    }

    // Show first and last 2 characters
    const visibleStart = value.slice(0, 2)
    const visibleEnd = value.slice(-2)
    const maskedMiddle = maskChar.repeat(value.length - 4)

    return `${visibleStart}${maskedMiddle}${visibleEnd}`
  }

  /**
   * Check if URL belongs to allowed domain
   */
  private isAllowedDomain(url: string): boolean {
    try {
      const parsed = new URL(url)
      return this.allowedDomains.has(parsed.hostname)
    } catch {
      return false
    }
  }

  /**
   * Generate recommendations based on detected leaks
   */
  private generateRecommendations(leaks: DetectedLeak[]): string[] {
    const recommendations: string[] = []
    const leakTypes = new Set(leaks.map(l => l.type))

    if (leakTypes.has('api_key')) {
      recommendations.push('Store API keys in environment variables or a secrets manager')
      recommendations.push('Rotate any exposed API keys immediately')
    }

    if (leakTypes.has('password')) {
      recommendations.push('Never store passwords in plaintext')
      recommendations.push('Use environment variables or a secrets vault')
    }

    if (leakTypes.has('private_key')) {
      recommendations.push('Private keys should never be shared or logged')
      recommendations.push('Regenerate any exposed private keys immediately')
    }

    if (leakTypes.has('database_connection')) {
      recommendations.push('Use environment variables for database credentials')
      recommendations.push('Consider using connection pooling with secure credential storage')
    }

    if (leakTypes.has('personal_info') || leakTypes.has('financial_data')) {
      recommendations.push('Implement data masking for PII in logs and outputs')
      recommendations.push('Ensure compliance with GDPR/CCPA requirements')
    }

    if (leakTypes.has('health_data')) {
      recommendations.push('Ensure HIPAA compliance for health data handling')
      recommendations.push('Implement strict access controls for medical information')
    }

    return recommendations
  }

  /**
   * Calculate overall risk level from detected leaks
   */
  private calculateRiskLevel(leaks: DetectedLeak[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (leaks.length === 0) return 'none'

    const severities = leaks.map(l => l.severity)

    if (severities.includes('critical')) return 'critical'
    if (severities.includes('high')) return 'high'
    if (severities.includes('medium')) return 'medium'
    return 'low'
  }

  /**
   * Add allowed domain
   */
  addAllowedDomain(domain: string): void {
    this.allowedDomains.add(domain)
  }

  /**
   * Remove allowed domain
   */
  removeAllowedDomain(domain: string): void {
    this.allowedDomains.delete(domain)
  }

  /**
   * Get redaction history
   */
  getRedactionHistory(limit: number = 100): typeof this.redactionHistory {
    return this.redactionHistory.slice(-limit)
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<typeof this.config>): void {
    Object.assign(this.config, config)
  }

  /**
   * Run comprehensive DLP tests
   */
  async runTests(): Promise<{ passed: number; failed: number; results: Array<{ test: string; passed: boolean; details: string }> }> {
    const results: Array<{ test: string; passed: boolean; details: string }> = []

    console.log('\n🔐 Running Data Leak Prevention Tests...\n')

    const testCases = [
      // API Keys
      { input: 'api_key=sk-1234567890abcdefghijklmn', type: 'api_key', shouldDetect: true },
      { input: 'My OpenAI key is sk-proj-abcdefghijklmnopqrstuvwxyz', type: 'api_key', shouldDetect: true },
      { input: 'AWS key: AKIAIOSFODNN7EXAMPLE', type: 'api_key', shouldDetect: true },
      { input: 'GitHub token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'api_key', shouldDetect: true },

      // Private Keys
      { input: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----', type: 'private_key', shouldDetect: true },

      // JWT Tokens
      { input: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', type: 'jwt_token', shouldDetect: true },

      // Database connections
      { input: 'mongodb://user:password@localhost:27017/mydb', type: 'database_connection', shouldDetect: true },
      { input: 'postgres://admin:secret123@db.example.com:5432/production', type: 'database_connection', shouldDetect: true },

      // Passwords
      { input: 'password="SuperSecret123!"', type: 'password', shouldDetect: true },
      { input: 'The password is myP@ssw0rd', type: 'password', shouldDetect: true },

      // Credit cards
      { input: 'Card number: 4111111111111111', type: 'financial_data', shouldDetect: true },
      { input: 'Pay with 5500-0000-0000-0004', type: 'financial_data', shouldDetect: true },

      // SSN
      { input: 'SSN: 123-45-6789', type: 'personal_info', shouldDetect: true },

      // Safe content
      { input: 'Hello, how can I help you today?', type: 'none', shouldDetect: false },
      { input: 'The weather is nice today', type: 'none', shouldDetect: false },
    ]

    for (const { input, type, shouldDetect } of testCases) {
      const result = this.scan(input, 'test')
      const detected = result.leaks.length > 0
      const correctType = type === 'none' || result.leaks.some(l => l.type === type)
      const passed = detected === shouldDetect && (shouldDetect ? correctType : true)

      results.push({
        test: `${type}: "${input.slice(0, 50)}${input.length > 50 ? '...' : ''}"`,
        passed,
        details: passed
          ? `Correctly ${detected ? 'detected' : 'allowed'}`
          : `Expected ${shouldDetect ? 'detection' : 'clean'}, got ${detected ? 'detected' : 'clean'}`
      })
    }

    // Test redaction
    const redactionTest = this.redact('My API key is sk-1234567890abcdefghijklmnop')
    const redactionPassed = !redactionTest.includes('sk-1234567890')
    results.push({
      test: 'Redaction of API key',
      passed: redactionPassed,
      details: redactionPassed ? 'API key successfully redacted' : 'Redaction failed'
    })

    // Print results
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length

    console.log('=' .repeat(60))
    console.log('📊 DATA LEAK PREVENTION TEST RESULTS')
    console.log('=' .repeat(60))
    console.log(`\n✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log('\n--- Detailed Results ---\n')

    for (const result of results) {
      const icon = result.passed ? '✅' : '❌'
      console.log(`${icon} ${result.test}`)
      console.log(`   ${result.details}`)
    }

    return { passed, failed, results }
  }
}

// ============================================================================
// Export singleton
// ============================================================================

export const dataLeakPrevention = DataLeakPrevention.getInstance()
