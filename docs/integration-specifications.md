# Alabobai Company Builder - Complete Integration Specifications

## Overview

This document provides complete technical specifications for all external service integrations required for the Alabobai company builder platform to be fully operational on Day 1. Each integration includes API details, authentication methods, implementation specs, and automation sequences.

---

## Integration Dependency Graph

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    PHASE 1: FOUNDATION                      │
                    │            (Must complete first - 5-10 minutes)             │
                    │                                                              │
                    │  ┌─────────┐    ┌─────────────┐    ┌──────────────┐        │
                    │  │ Stripe  │    │   GitHub    │    │   Resend/    │        │
                    │  │(payments)│    │   (repos)   │    │  SendGrid    │        │
                    │  └────┬────┘    └──────┬──────┘    │(transactional)│        │
                    │       │                │           └───────┬──────┘        │
                    └───────┼────────────────┼──────────────────┼────────────────┘
                            │                │                  │
                    ┌───────▼────────────────▼──────────────────▼────────────────┐
                    │                    PHASE 2: INFRASTRUCTURE                  │
                    │           (Can run in parallel - 10-15 minutes)             │
                    │                                                              │
                    │  ┌──────────────┐  ┌───────────┐  ┌────────────────┐       │
                    │  │  Namecheap/  │  │Cloudflare │  │     Vercel     │       │
                    │  │   GoDaddy    │──▶│  (DNS)    │──▶│  (Deploy)     │       │
                    │  │  (Domain)    │  └───────────┘  └────────────────┘       │
                    │  └──────────────┘                                           │
                    │                                                              │
                    │  ┌──────────────┐  ┌───────────┐  ┌────────────────┐       │
                    │  │Google/Zoho  │  │   Slack   │  │     Linear     │       │
                    │  │ Workspace   │  │  (Comms)  │  │   (Project)    │       │
                    │  │  (Email)    │  └───────────┘  └────────────────┘       │
                    │  └──────────────┘                                           │
                    └─────────────────────────────────────────────────────────────┘
                                                │
                    ┌───────────────────────────▼─────────────────────────────────┐
                    │                    PHASE 3: ENHANCEMENT                     │
                    │          (Can run in parallel - 15-20 minutes)              │
                    │                                                              │
                    │  ┌─────────────┐  ┌───────────┐  ┌────────────────┐        │
                    │  │  HubSpot/   │  │  Cal.com  │  │    Notion      │        │
                    │  │  Pipedrive  │  │(Scheduling)│ │(Documentation) │        │
                    │  │   (CRM)     │  └───────────┘  └────────────────┘        │
                    │  └─────────────┘                                            │
                    │                                                              │
                    │  ┌─────────────┐  ┌───────────┐  ┌────────────────┐        │
                    │  │   Google    │  │ Mixpanel/ │  │  Social APIs   │        │
                    │  │  Analytics  │  │ Amplitude │  │(Twitter/LI/IG) │        │
                    │  └─────────────┘  └───────────┘  └────────────────┘        │
                    └─────────────────────────────────────────────────────────────┘
                                                │
                    ┌───────────────────────────▼─────────────────────────────────┐
                    │                    PHASE 4: ASSETS                          │
                    │              (Optional, runs last - 5-10 minutes)           │
                    │                                                              │
                    │  ┌─────────────┐  ┌───────────┐  ┌────────────────┐        │
                    │  │   Logo AI   │  │  Image    │  │      PDF       │        │
                    │  │ (Logomark,  │  │Generation │  │  Generation    │        │
                    │  │  Looka)     │  │(DALL-E)   │  │ (PDFKit/etc)   │        │
                    │  └─────────────┘  └───────────┘  └────────────────┘        │
                    └─────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: FOUNDATION INTEGRATIONS

### 1.1 Stripe (Payments)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://stripe.com/docs/api |
| Authentication | API Key (Bearer Token) |
| Rate Limits | 100 req/sec (25 in test mode) |
| Free Tier | No monthly fee, 2.9% + 30 per transaction |

#### Implementation Spec

```typescript
// src/integrations/connectors/StripeConnector.ts

interface StripeConfig {
  secretKey: string;           // sk_live_xxx or sk_test_xxx
  publishableKey: string;      // pk_live_xxx or pk_test_xxx
  webhookSecret: string;       // whsec_xxx
}

// Core Endpoints
const STRIPE_ENDPOINTS = {
  // Customers
  createCustomer: 'POST /v1/customers',
  getCustomer: 'GET /v1/customers/:id',
  updateCustomer: 'POST /v1/customers/:id',

  // Products & Prices
  createProduct: 'POST /v1/products',
  createPrice: 'POST /v1/prices',

  // Subscriptions
  createSubscription: 'POST /v1/subscriptions',
  updateSubscription: 'POST /v1/subscriptions/:id',
  cancelSubscription: 'DELETE /v1/subscriptions/:id',

  // Payment Intents
  createPaymentIntent: 'POST /v1/payment_intents',
  confirmPaymentIntent: 'POST /v1/payment_intents/:id/confirm',

  // Checkout Sessions
  createCheckoutSession: 'POST /v1/checkout/sessions',

  // Connected Accounts (for marketplace)
  createAccount: 'POST /v1/accounts',
  createAccountLink: 'POST /v1/account_links'
};

// Request/Response Schemas
interface CreateCustomerRequest {
  email: string;
  name?: string;
  description?: string;
  metadata?: Record<string, string>;
  payment_method?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

interface CreateSubscriptionRequest {
  customer: string;
  items: Array<{ price: string; quantity?: number }>;
  payment_behavior?: 'default_incomplete' | 'error_if_incomplete' | 'allow_incomplete';
  payment_settings?: {
    payment_method_types?: string[];
    save_default_payment_method?: 'on_subscription' | 'off';
  };
  trial_period_days?: number;
  metadata?: Record<string, string>;
}

// Error Handling
interface StripeError {
  type: 'api_error' | 'card_error' | 'idempotency_error' | 'invalid_request_error';
  code: string;
  message: string;
  param?: string;
  decline_code?: string;
}

const RETRY_STRATEGY = {
  maxRetries: 3,
  retryableErrors: ['rate_limit_error', 'api_connection_error'],
  backoffMs: [1000, 2000, 4000]
};

// Webhook Events to Handle
const WEBHOOK_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'checkout.session.completed'
];
```

#### Automation Sequence

```
1. CREDENTIAL SETUP (User Input Required)
   ├── Navigate user to https://dashboard.stripe.com/apikeys
   ├── Collect: Secret Key (sk_live_xxx)
   ├── Collect: Publishable Key (pk_live_xxx)
   └── Store encrypted in vault

2. WEBHOOK CONFIGURATION
   ├── POST /v1/webhook_endpoints
   │   body: { url: "{ALABOBAI_URL}/webhooks/stripe", events: [...] }
   ├── Store webhook signing secret
   └── Verify with test event

3. PRODUCT SETUP (for SaaS companies)
   ├── Create base products
   ├── Create pricing tiers
   └── Configure billing portal

4. VERIFICATION
   ├── Create test customer
   ├── Verify webhook delivery
   └── Mark integration complete
```

---

### 1.2 GitHub (Code Repository)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://docs.github.com/en/rest |
| Authentication | OAuth 2.0 or Personal Access Token |
| Rate Limits | 5,000 req/hour (authenticated) |
| Free Tier | Unlimited public repos, 500MB packages |

#### Implementation Spec

```typescript
// Already implemented in: src/integrations/connectors/GitHubConnector.ts

// Additional endpoints for company builder
const GITHUB_ENDPOINTS = {
  // Organizations
  createOrg: 'POST /user/orgs',  // GitHub Enterprise only
  getOrg: 'GET /orgs/:org',
  updateOrg: 'PATCH /orgs/:org',

  // Repositories
  createRepo: 'POST /user/repos',
  createOrgRepo: 'POST /orgs/:org/repos',

  // Teams
  createTeam: 'POST /orgs/:org/teams',
  addTeamMember: 'PUT /orgs/:org/teams/:team_slug/memberships/:username',

  // Branch Protection
  updateBranchProtection: 'PUT /repos/:owner/:repo/branches/:branch/protection',

  // Webhooks
  createRepoWebhook: 'POST /repos/:owner/:repo/hooks',

  // Actions Secrets
  createRepoSecret: 'PUT /repos/:owner/:repo/actions/secrets/:secret_name',

  // Deploy Keys
  createDeployKey: 'POST /repos/:owner/:repo/keys'
};

// OAuth Scopes Required
const REQUIRED_SCOPES = [
  'repo',           // Full repo access
  'workflow',       // GitHub Actions
  'admin:org',      // Organization management (if org)
  'admin:repo_hook',// Webhook management
  'user:email'      // Read user email
];

// Repository Template for New Companies
interface RepoTemplate {
  name: string;
  description: string;
  private: boolean;
  auto_init: boolean;
  gitignore_template?: string;
  license_template?: string;
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  default_branch: string;
}
```

#### Automation Sequence

```
1. OAUTH FLOW
   ├── Redirect: https://github.com/login/oauth/authorize
   │   params: client_id, redirect_uri, scope, state
   ├── Exchange code for token
   └── Store encrypted token

2. ORGANIZATION/USER SETUP
   ├── GET /user (verify authentication)
   ├── Check if org exists or use personal account
   └── Store org/user context

3. REPOSITORY CREATION
   ├── Create company repository
   │   POST /user/repos or /orgs/:org/repos
   │   body: { name, description, private: true, auto_init: true }
   ├── Set up branch protection
   │   PUT /repos/:owner/:repo/branches/main/protection
   ├── Create .github/workflows directory
   └── Add initial CI/CD workflow

4. INTEGRATIONS
   ├── Create webhook for deployments
   │   POST /repos/:owner/:repo/hooks
   ├── Add deploy key for Vercel
   └── Configure repository secrets

5. VERIFICATION
   ├── Verify repo accessible
   ├── Verify webhook working
   └── Mark integration complete
```

---

### 1.3 Resend (Transactional Email)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://resend.com/docs/api-reference |
| Authentication | API Key |
| Rate Limits | 100 emails/day (free), 3,000/month (starter) |
| Free Tier | 100 emails/day, 1 domain |

#### Implementation Spec

```typescript
// src/integrations/connectors/ResendConnector.ts

interface ResendConfig {
  apiKey: string;  // re_xxx
}

const RESEND_ENDPOINTS = {
  // Emails
  sendEmail: 'POST /emails',
  getEmail: 'GET /emails/:id',

  // Domains
  createDomain: 'POST /domains',
  getDomain: 'GET /domains/:id',
  verifyDomain: 'POST /domains/:id/verify',
  listDomains: 'GET /domains',
  deleteDomain: 'DELETE /domains/:id',

  // API Keys
  createApiKey: 'POST /api-keys',
  listApiKeys: 'GET /api-keys',
  deleteApiKey: 'DELETE /api-keys/:id',

  // Audiences (for marketing)
  createAudience: 'POST /audiences',
  addContact: 'POST /audiences/:id/contacts'
};

// Request Schemas
interface SendEmailRequest {
  from: string;          // "Company <noreply@company.com>"
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    content_type?: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
}

interface CreateDomainRequest {
  name: string;          // "mail.company.com"
  region?: 'us-east-1' | 'eu-west-1' | 'sa-east-1';
}

interface DomainVerificationRecords {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  status: 'not_started' | 'pending' | 'verified' | 'failed';
}
```

#### Alternative: SendGrid

```typescript
// src/integrations/connectors/SendGridConnector.ts

interface SendGridConfig {
  apiKey: string;  // SG.xxx
}

const SENDGRID_ENDPOINTS = {
  sendEmail: 'POST /v3/mail/send',
  addDomain: 'POST /v3/whitelabel/domains',
  verifyDomain: 'POST /v3/whitelabel/domains/:id/validate',
  getStats: 'GET /v3/stats'
};

// Rate Limits: 100 emails/day free, then tiered
```

#### Automation Sequence

```
1. API KEY SETUP
   ├── Collect API key from user
   │   Navigate to: https://resend.com/api-keys
   ├── Verify key: GET /domains (should return empty or existing)
   └── Store encrypted

2. DOMAIN SETUP
   ├── POST /domains { name: "mail.{company-domain}" }
   ├── Extract DNS records for verification:
   │   - SPF record (TXT)
   │   - DKIM record (TXT)
   │   - DMARC record (TXT, optional but recommended)
   └── Return records to user for DNS configuration

3. DOMAIN VERIFICATION (After DNS propagation)
   ├── POST /domains/:id/verify
   ├── Poll GET /domains/:id until status: "verified"
   │   (retry every 60s for up to 48 hours)
   └── Mark domain active

4. TEST EMAIL
   ├── POST /emails
   │   { from: "test@{domain}", to: "{user-email}", subject: "Test" }
   ├── Verify delivery
   └── Mark integration complete

5. TEMPLATE SETUP (Optional)
   ├── Create welcome email template
   ├── Create password reset template
   ├── Create notification templates
   └── Store template IDs
```

---

## PHASE 2: INFRASTRUCTURE INTEGRATIONS

### 2.1 Namecheap (Domain Registration)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://www.namecheap.com/support/api/intro |
| Authentication | API Key + Username + IP Whitelisting |
| Rate Limits | 20 requests/minute, 700/hour, 8000/day |
| Pricing | Varies by TLD (~$8-15/year for .com) |

#### Implementation Spec

```typescript
// src/integrations/connectors/NamecheapConnector.ts

interface NamecheapConfig {
  apiUser: string;
  apiKey: string;
  username: string;
  clientIp: string;
  sandbox?: boolean;  // Use sandbox.namecheap.com for testing
}

const NAMECHEAP_ENDPOINTS = {
  baseUrl: 'https://api.namecheap.com/xml.response',

  // Commands (passed as query param)
  commands: {
    checkDomain: 'namecheap.domains.check',
    getDomainList: 'namecheap.domains.getList',
    getDomainInfo: 'namecheap.domains.getInfo',
    registerDomain: 'namecheap.domains.create',
    renewDomain: 'namecheap.domains.renew',

    // DNS
    getHosts: 'namecheap.domains.dns.getHosts',
    setHosts: 'namecheap.domains.dns.setHosts',
    setNameservers: 'namecheap.domains.dns.setCustom',

    // Contacts
    getContacts: 'namecheap.domains.getContacts',
    setContacts: 'namecheap.domains.setContacts'
  }
};

// Domain Registration Request
interface RegisterDomainRequest {
  DomainName: string;
  Years: number;

  // Registrant Contact (required)
  RegistrantFirstName: string;
  RegistrantLastName: string;
  RegistrantAddress1: string;
  RegistrantCity: string;
  RegistrantStateProvince: string;
  RegistrantPostalCode: string;
  RegistrantCountry: string;
  RegistrantPhone: string;
  RegistrantEmailAddress: string;

  // Other contacts (Tech, Admin, AuxBilling) - same fields
  // Can use same as registrant

  // Options
  AddFreeWhoisguard?: 'yes' | 'no';
  WGEnabled?: 'yes' | 'no';
  Nameservers?: string;  // Comma-separated
}

// DNS Record Types
interface DNSRecord {
  HostName: string;     // '@' or subdomain
  RecordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'URL' | 'FRAME';
  Address: string;
  MXPref?: number;
  TTL?: number;
}
```

#### Alternative: GoDaddy

```typescript
// src/integrations/connectors/GoDaddyConnector.ts

interface GoDaddyConfig {
  apiKey: string;
  apiSecret: string;
  customerId?: string;
}

const GODADDY_ENDPOINTS = {
  baseUrl: 'https://api.godaddy.com/v1',

  // Domains
  checkAvailability: 'GET /domains/available',
  purchaseDomain: 'POST /domains/purchase',
  getDomain: 'GET /domains/:domain',
  updateDomain: 'PATCH /domains/:domain',

  // DNS
  getRecords: 'GET /domains/:domain/records',
  addRecords: 'PATCH /domains/:domain/records',
  replaceRecords: 'PUT /domains/:domain/records/:type/:name',
  deleteRecords: 'DELETE /domains/:domain/records/:type/:name'
};

// GoDaddy has better API ergonomics but higher prices
```

#### Automation Sequence

```
1. API SETUP (User Input Required)
   ├── Guide user to enable API access:
   │   https://www.namecheap.com/support/api/intro/
   ├── Collect: API User, API Key, Username
   ├── Whitelist server IP
   └── Verify with domains.getList

2. DOMAIN AVAILABILITY CHECK
   ├── namecheap.domains.check
   │   params: DomainList={company}.com,{company}.io,{company}.co
   ├── Return available options with pricing
   └── User selects domain

3. DOMAIN REGISTRATION
   ├── namecheap.domains.create
   │   params: DomainName, Years, Contact Info
   ├── Wait for registration confirmation
   ├── Store domain info in database
   └── Proceed to DNS configuration

4. NAMESERVER UPDATE (for Cloudflare)
   ├── namecheap.domains.dns.setCustom
   │   params: SLD, TLD, Nameservers=ns1.cloudflare.com,ns2.cloudflare.com
   ├── Wait for propagation (can take 24-48 hours)
   └── Verify with DNS lookup

5. VERIFICATION
   ├── Verify domain appears in getList
   ├── Verify nameservers updated
   └── Mark integration complete
```

---

### 2.2 Cloudflare (DNS & SSL)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developers.cloudflare.com/api |
| Authentication | API Token or API Key + Email |
| Rate Limits | 1,200 requests/5 minutes |
| Free Tier | Free plan includes DNS, SSL, basic DDoS protection |

#### Implementation Spec

```typescript
// src/integrations/connectors/CloudflareConnector.ts

interface CloudflareConfig {
  apiToken: string;      // Preferred: scoped token
  // OR
  apiKey?: string;
  email?: string;
}

const CLOUDFLARE_ENDPOINTS = {
  baseUrl: 'https://api.cloudflare.com/client/v4',

  // Zones
  createZone: 'POST /zones',
  getZone: 'GET /zones/:zone_id',
  listZones: 'GET /zones',
  deleteZone: 'DELETE /zones/:zone_id',

  // DNS Records
  createDNSRecord: 'POST /zones/:zone_id/dns_records',
  listDNSRecords: 'GET /zones/:zone_id/dns_records',
  updateDNSRecord: 'PUT /zones/:zone_id/dns_records/:record_id',
  deleteDNSRecord: 'DELETE /zones/:zone_id/dns_records/:record_id',

  // SSL/TLS
  getSSLSettings: 'GET /zones/:zone_id/settings/ssl',
  updateSSLSettings: 'PATCH /zones/:zone_id/settings/ssl',

  // Page Rules
  createPageRule: 'POST /zones/:zone_id/pagerules',

  // Firewall
  createFirewallRule: 'POST /zones/:zone_id/firewall/rules',

  // Workers (optional)
  createWorker: 'PUT /accounts/:account_id/workers/scripts/:script_name'
};

// Request Schemas
interface CreateZoneRequest {
  name: string;           // "company.com"
  account: { id: string };
  type?: 'full' | 'partial';
  jump_start?: boolean;   // Scan for existing DNS records
}

interface DNSRecordRequest {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV';
  name: string;           // "@" or subdomain
  content: string;
  ttl?: number;           // 1 = auto
  priority?: number;      // For MX records
  proxied?: boolean;      // Enable Cloudflare proxy
}

// Standard DNS Setup for New Company
const STANDARD_DNS_RECORDS = [
  // Website (Vercel)
  { type: 'A', name: '@', content: '76.76.21.21', proxied: true },
  { type: 'CNAME', name: 'www', content: 'cname.vercel-dns.com', proxied: true },

  // Email (if using Google Workspace)
  { type: 'MX', name: '@', content: 'aspmx.l.google.com', priority: 1 },
  { type: 'MX', name: '@', content: 'alt1.aspmx.l.google.com', priority: 5 },
  { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.google.com ~all' },

  // Email (if using Resend)
  { type: 'TXT', name: 'resend._domainkey', content: '{DKIM_KEY}' },

  // Verification
  { type: 'TXT', name: '@', content: 'google-site-verification={TOKEN}' }
];
```

#### Automation Sequence

```
1. API TOKEN SETUP
   ├── Guide user to create API token:
   │   https://dash.cloudflare.com/profile/api-tokens
   ├── Required permissions:
   │   - Zone:Zone:Edit
   │   - Zone:DNS:Edit
   │   - Zone:SSL and Certificates:Edit
   ├── Collect token
   └── Verify with GET /user/tokens/verify

2. ZONE CREATION
   ├── POST /zones
   │   { name: "{domain}", account: { id: "{account_id}" } }
   ├── Extract nameservers from response
   ├── Return nameservers to user for registrar update
   └── Store zone_id

3. WAIT FOR ACTIVATION
   ├── Poll GET /zones/:zone_id
   ├── Check status === "active"
   │   (requires nameserver update at registrar)
   ├── Retry every 5 minutes for up to 48 hours
   └── Proceed when active

4. DNS CONFIGURATION
   ├── Add all required DNS records:
   │   - A record for root domain
   │   - CNAME for www
   │   - MX records for email
   │   - TXT records for SPF/DKIM/verification
   ├── Configure SSL mode: "full_strict"
   └── Enable "Always Use HTTPS"

5. OPTIONAL ENHANCEMENTS
   ├── Create page rule: www -> root redirect
   ├── Enable Brotli compression
   ├── Enable HTTP/3
   └── Configure security headers

6. VERIFICATION
   ├── Verify DNS propagation: dig {domain}
   ├── Verify SSL working: curl -I https://{domain}
   └── Mark integration complete
```

---

### 2.3 Vercel (Deployment)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://vercel.com/docs/rest-api |
| Authentication | Bearer Token |
| Rate Limits | 100 requests/minute |
| Free Tier | Hobby tier free, Pro at $20/month |

#### Implementation Spec

```typescript
// src/integrations/connectors/VercelConnector.ts

interface VercelConfig {
  token: string;
  teamId?: string;
}

const VERCEL_ENDPOINTS = {
  baseUrl: 'https://api.vercel.com',

  // Projects
  createProject: 'POST /v10/projects',
  getProject: 'GET /v9/projects/:projectId',
  listProjects: 'GET /v9/projects',
  deleteProject: 'DELETE /v9/projects/:projectId',

  // Deployments
  createDeployment: 'POST /v13/deployments',
  getDeployment: 'GET /v13/deployments/:deploymentId',
  listDeployments: 'GET /v6/deployments',
  cancelDeployment: 'PATCH /v12/deployments/:deploymentId/cancel',

  // Domains
  addDomain: 'POST /v10/projects/:projectId/domains',
  getDomain: 'GET /v9/projects/:projectId/domains/:domain',
  removeDomain: 'DELETE /v9/projects/:projectId/domains/:domain',
  verifyDomain: 'POST /v9/projects/:projectId/domains/:domain/verify',

  // Environment Variables
  createEnvVar: 'POST /v10/projects/:projectId/env',
  listEnvVars: 'GET /v9/projects/:projectId/env',
  deleteEnvVar: 'DELETE /v9/projects/:projectId/env/:envId',

  // Integrations (Git)
  linkGitRepo: 'POST /v1/integrations/configuration/:configId/connect'
};

// Request Schemas
interface CreateProjectRequest {
  name: string;
  framework?: 'nextjs' | 'gatsby' | 'react' | 'vue' | 'svelte' | 'nuxt';
  gitRepository?: {
    repo: string;         // "owner/repo"
    type: 'github' | 'gitlab' | 'bitbucket';
  };
  buildCommand?: string;
  devCommand?: string;
  installCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  environmentVariables?: Array<{
    key: string;
    value: string;
    target: ('production' | 'preview' | 'development')[];
    type?: 'system' | 'secret' | 'encrypted' | 'plain';
  }>;
}

interface AddDomainRequest {
  name: string;           // "company.com" or "www.company.com"
  redirect?: string;      // Redirect to another domain
  redirectStatusCode?: 301 | 302 | 307 | 308;
}

// Deployment via Git (preferred)
interface DeploymentConfig {
  gitSource: {
    type: 'github';
    repoId: number;
    ref: string;          // Branch or commit
  };
  projectSettings?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
  };
}
```

#### Automation Sequence

```
1. TOKEN SETUP
   ├── Guide user: https://vercel.com/account/tokens
   ├── Collect token
   ├── Verify: GET /v2/user
   └── Store encrypted

2. GITHUB INTEGRATION
   ├── Check if Vercel-GitHub app installed
   │   GET /v1/integrations/search?type=github
   ├── If not: guide user to install
   │   https://vercel.com/integrations/github
   └── Get installation ID

3. PROJECT CREATION
   ├── POST /v10/projects
   │   {
   │     name: "{company-slug}",
   │     framework: "nextjs",
   │     gitRepository: {
   │       repo: "{owner}/{repo}",
   │       type: "github"
   │     }
   │   }
   ├── Store project ID
   └── Wait for initial deployment

4. DOMAIN CONFIGURATION
   ├── POST /v10/projects/:projectId/domains
   │   { name: "{company}.com" }
   ├── POST /v10/projects/:projectId/domains
   │   { name: "www.{company}.com", redirect: "{company}.com" }
   ├── Get verification records (if needed)
   └── Domain auto-verifies if Cloudflare nameservers used

5. ENVIRONMENT VARIABLES
   ├── POST /v10/projects/:projectId/env
   │   (Add all required env vars)
   ├── Common vars:
   │   - DATABASE_URL
   │   - STRIPE_SECRET_KEY
   │   - NEXT_PUBLIC_STRIPE_KEY
   │   - RESEND_API_KEY
   └── Trigger redeploy

6. VERIFICATION
   ├── GET deployment status
   ├── Verify site accessible at domain
   ├── Verify SSL working
   └── Mark integration complete
```

---

### 2.4 Google Workspace (Business Email)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developers.google.com/admin-sdk |
| Authentication | OAuth 2.0 with Service Account |
| Rate Limits | Varies by API (typically 2400 req/day) |
| Pricing | $6/user/month (Business Starter) |

#### Implementation Spec

```typescript
// Already partially implemented in: src/integrations/connectors/GoogleConnector.ts
// Extension for Admin SDK

interface GoogleWorkspaceConfig {
  serviceAccountEmail: string;
  privateKey: string;
  customerId: string;
  adminEmail: string;  // For domain-wide delegation
}

const WORKSPACE_ENDPOINTS = {
  // Directory API
  createUser: 'POST /admin/directory/v1/users',
  getUser: 'GET /admin/directory/v1/users/:userKey',
  listUsers: 'GET /admin/directory/v1/users',
  updateUser: 'PUT /admin/directory/v1/users/:userKey',
  deleteUser: 'DELETE /admin/directory/v1/users/:userKey',

  createGroup: 'POST /admin/directory/v1/groups',
  addGroupMember: 'POST /admin/directory/v1/groups/:groupKey/members',

  // Domain verification (for new domains)
  getDomainAlias: 'GET /admin/directory/v1/customer/:customerId/domainaliases/:domainAliasName',
  insertDomain: 'POST /admin/directory/v1/customer/:customerId/domains',
  verifyDomain: 'POST /admin/directory/v1/customer/:customerId/domains/:domainName/verify'
};

// User Creation
interface CreateUserRequest {
  primaryEmail: string;
  password: string;
  name: {
    givenName: string;
    familyName: string;
  };
  changePasswordAtNextLogin?: boolean;
  orgUnitPath?: string;
  isAdmin?: boolean;
}

// Required DNS Records for Google Workspace
const GOOGLE_WORKSPACE_DNS = [
  // MX Records
  { type: 'MX', name: '@', value: 'aspmx.l.google.com', priority: 1 },
  { type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com', priority: 5 },
  { type: 'MX', name: '@', value: 'alt2.aspmx.l.google.com', priority: 5 },
  { type: 'MX', name: '@', value: 'alt3.aspmx.l.google.com', priority: 10 },
  { type: 'MX', name: '@', value: 'alt4.aspmx.l.google.com', priority: 10 },

  // SPF
  { type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all' },

  // Domain verification
  { type: 'TXT', name: '@', value: 'google-site-verification={token}' }
];
```

#### Alternative: Zoho Mail

```typescript
// src/integrations/connectors/ZohoMailConnector.ts

interface ZohoMailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
}

const ZOHO_ENDPOINTS = {
  baseUrl: 'https://mail.zoho.com/api/organization',

  addDomain: 'POST /:orgId/domains',
  verifyDomain: 'POST /:orgId/domains/:domainId/verify',
  addUser: 'POST /:orgId/accounts',
  createGroup: 'POST /:orgId/groups'
};

// Zoho is cheaper: Free for 5 users, $1/user/month after
```

#### Automation Sequence

```
1. WORKSPACE SETUP (Manual Step)
   ├── Guide user to sign up: https://workspace.google.com/
   ├── User adds their domain during signup
   ├── Google provides verification token
   └── User provides admin credentials

2. DOMAIN VERIFICATION
   ├── Add TXT record to Cloudflare:
   │   google-site-verification={token}
   ├── Wait for DNS propagation
   ├── Trigger verification in Google Admin
   └── Wait for verification confirmation

3. DNS RECORD SETUP
   ├── Add all MX records to Cloudflare
   ├── Add SPF record
   ├── Configure DKIM (get key from Google Admin)
   ├── Add DKIM TXT record
   └── Configure DMARC (optional but recommended)

4. USER SETUP
   ├── Create admin user
   ├── Create standard email aliases:
   │   - hello@company.com
   │   - support@company.com
   │   - legal@company.com
   └── Configure email routing

5. VERIFICATION
   ├── Send test email to new address
   ├── Verify email delivery
   ├── Verify calendar/drive working
   └── Mark integration complete
```

---

### 2.5 Slack (Team Communication)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://api.slack.com/docs |
| Authentication | OAuth 2.0 |
| Rate Limits | Tier-based (1-100+ req/min depending on method) |
| Free Tier | 90-day message history, 10 app integrations |

#### Implementation Spec

```typescript
// Already implemented in: src/integrations/connectors/SlackConnector.ts

// Additional methods for company setup
interface SlackWorkspaceSetup {
  // Standard channels for new company
  defaultChannels: [
    { name: 'general', purpose: 'Company-wide announcements' },
    { name: 'random', purpose: 'Non-work conversations' },
    { name: 'engineering', purpose: 'Engineering team discussions' },
    { name: 'product', purpose: 'Product updates and feedback' },
    { name: 'sales', purpose: 'Sales team channel' },
    { name: 'support', purpose: 'Customer support discussions' },
    { name: 'alerts', purpose: 'System and monitoring alerts' }
  ];
}

// Bot/App Configuration
interface SlackAppManifest {
  display_information: {
    name: string;
    description: string;
    background_color: string;
  };
  features: {
    bot_user: {
      display_name: string;
      always_online: boolean;
    };
    slash_commands?: Array<{
      command: string;
      url: string;
      description: string;
    }>;
  };
  oauth_config: {
    scopes: {
      bot: string[];
    };
  };
  settings: {
    event_subscriptions?: {
      request_url: string;
      bot_events: string[];
    };
    interactivity?: {
      is_enabled: boolean;
      request_url: string;
    };
  };
}

// Required Scopes
const REQUIRED_SCOPES = [
  'chat:write',
  'channels:manage',
  'channels:read',
  'channels:join',
  'groups:read',
  'groups:write',
  'users:read',
  'users:read.email',
  'files:write',
  'reactions:write',
  'team:read'
];
```

#### Automation Sequence

```
1. WORKSPACE CREATION (Manual if new)
   ├── If new: guide user to https://slack.com/create
   ├── If existing: user provides workspace URL
   └── Collect workspace details

2. APP INSTALLATION
   ├── Create app via manifest API or guide to:
   │   https://api.slack.com/apps
   ├── Configure OAuth redirect URL
   ├── Add required scopes
   └── Install to workspace

3. OAUTH FLOW
   ├── Redirect: https://slack.com/oauth/v2/authorize
   │   params: client_id, scope, redirect_uri
   ├── Exchange code for token
   ├── Store bot token and user token
   └── Verify with auth.test

4. WORKSPACE SETUP
   ├── Create default channels
   ├── Set channel purposes
   ├── Configure workspace notifications
   └── Post welcome message

5. INTEGRATIONS
   ├── Configure webhook for events
   ├── Set up slash commands (optional)
   ├── Connect to other services
   └── Configure Slack Connect (if needed)

6. VERIFICATION
   ├── Verify bot can post messages
   ├── Verify channels created
   ├── Verify events receiving
   └── Mark integration complete
```

---

### 2.6 Linear (Project Management)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developers.linear.app/docs |
| Authentication | OAuth 2.0 or API Key |
| Rate Limits | 1500 requests/hour |
| Free Tier | Free for up to 250 issues |

#### Implementation Spec

```typescript
// src/integrations/connectors/LinearConnector.ts

interface LinearConfig {
  apiKey: string;
}

// GraphQL API
const LINEAR_API = 'https://api.linear.app/graphql';

// Common Queries
const LINEAR_QUERIES = {
  viewer: `query { viewer { id name email } }`,

  teams: `query { teams { nodes { id name key } } }`,

  createTeam: `
    mutation CreateTeam($input: TeamCreateInput!) {
      teamCreate(input: $input) {
        success
        team { id name key }
      }
    }
  `,

  createProject: `
    mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name }
      }
    }
  `,

  createIssue: `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
  `,

  createCycle: `
    mutation CreateCycle($input: CycleCreateInput!) {
      cycleCreate(input: $input) {
        success
        cycle { id name startsAt endsAt }
      }
    }
  `,

  createLabel: `
    mutation CreateLabel($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel { id name color }
      }
    }
  `,

  // Webhooks
  createWebhook: `
    mutation CreateWebhook($input: WebhookCreateInput!) {
      webhookCreate(input: $input) {
        success
        webhook { id url enabled }
      }
    }
  `
};

// Standard Issue Labels for New Company
const DEFAULT_LABELS = [
  { name: 'bug', color: '#eb5757' },
  { name: 'feature', color: '#5e6ad2' },
  { name: 'improvement', color: '#26b5ce' },
  { name: 'documentation', color: '#4ea7fc' },
  { name: 'urgent', color: '#f2c94c' },
  { name: 'blocked', color: '#f87171' }
];

// Issue Priorities
type Priority = 0 | 1 | 2 | 3 | 4; // No priority, Urgent, High, Medium, Low

// Workflow States (customizable per team)
const DEFAULT_STATES = [
  'Backlog',
  'Todo',
  'In Progress',
  'In Review',
  'Done',
  'Canceled'
];
```

#### Automation Sequence

```
1. AUTHENTICATION
   ├── OAuth: https://linear.app/oauth/authorize
   │   params: client_id, redirect_uri, scope, response_type
   ├── OR collect API key:
   │   https://linear.app/settings/api
   ├── Verify: query { viewer { id name } }
   └── Store credentials

2. ORGANIZATION SETUP
   ├── Get or create organization
   ├── Verify user is admin
   └── Store org details

3. TEAM CREATION
   ├── Create main team:
   │   mutation teamCreate { name, key }
   ├── Configure workflow states
   ├── Add default labels
   └── Store team ID

4. PROJECT SETUP
   ├── Create initial project:
   │   "Launch" or "MVP"
   ├── Set project target date
   └── Create initial milestones

5. INTEGRATIONS
   ├── Create webhook for status updates
   ├── Connect to GitHub (issue linking)
   ├── Connect to Slack notifications
   └── Configure automations

6. VERIFICATION
   ├── Create test issue
   ├── Verify webhook delivery
   ├── Verify team access
   └── Mark integration complete
```

---

## PHASE 3: ENHANCEMENT INTEGRATIONS

### 3.1 HubSpot (CRM)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developers.hubspot.com/docs/api |
| Authentication | OAuth 2.0 or Private App Token |
| Rate Limits | 100 requests/10 sec (free), 200 (paid) |
| Free Tier | Free CRM with unlimited users |

#### Implementation Spec

```typescript
// src/integrations/connectors/HubSpotConnector.ts

interface HubSpotConfig {
  accessToken: string;  // Private app or OAuth token
  portalId?: string;
}

const HUBSPOT_ENDPOINTS = {
  baseUrl: 'https://api.hubapi.com',

  // Contacts
  createContact: 'POST /crm/v3/objects/contacts',
  getContact: 'GET /crm/v3/objects/contacts/:contactId',
  updateContact: 'PATCH /crm/v3/objects/contacts/:contactId',
  searchContacts: 'POST /crm/v3/objects/contacts/search',

  // Companies
  createCompany: 'POST /crm/v3/objects/companies',
  getCompany: 'GET /crm/v3/objects/companies/:companyId',
  updateCompany: 'PATCH /crm/v3/objects/companies/:companyId',

  // Deals
  createDeal: 'POST /crm/v3/objects/deals',
  getDeal: 'GET /crm/v3/objects/deals/:dealId',
  updateDeal: 'PATCH /crm/v3/objects/deals/:dealId',

  // Pipelines
  listPipelines: 'GET /crm/v3/pipelines/:objectType',
  createPipeline: 'POST /crm/v3/pipelines/:objectType',

  // Associations
  createAssociation: 'PUT /crm/v4/objects/:fromObjectType/:fromObjectId/associations/:toObjectType/:toObjectId',

  // Forms
  createForm: 'POST /marketing/v3/forms',
  submitForm: 'POST /submissions/v3/integration/submit/:portalId/:formGuid',

  // Webhooks
  createSubscription: 'POST /webhooks/v3/:appId/subscriptions'
};

// Request Schemas
interface CreateContactRequest {
  properties: {
    email: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    website?: string;
    lifecyclestage?: 'subscriber' | 'lead' | 'marketingqualifiedlead' | 'salesqualifiedlead' | 'opportunity' | 'customer' | 'evangelist';
    [key: string]: string | undefined;
  };
}

interface CreateDealRequest {
  properties: {
    dealname: string;
    dealstage: string;
    amount?: string;
    closedate?: string;
    pipeline?: string;
    hubspot_owner_id?: string;
  };
}

// Standard Deal Pipeline Stages
const DEFAULT_PIPELINE_STAGES = [
  { label: 'Qualification', displayOrder: 0, probability: 0.1 },
  { label: 'Needs Analysis', displayOrder: 1, probability: 0.2 },
  { label: 'Proposal', displayOrder: 2, probability: 0.4 },
  { label: 'Negotiation', displayOrder: 3, probability: 0.8 },
  { label: 'Closed Won', displayOrder: 4, probability: 1.0, metadata: { isClosed: true, isWon: true } },
  { label: 'Closed Lost', displayOrder: 5, probability: 0, metadata: { isClosed: true, isWon: false } }
];
```

#### Alternative: Pipedrive

```typescript
// src/integrations/connectors/PipedriveConnector.ts

interface PipedriveConfig {
  apiToken: string;
  companyDomain: string;  // {company}.pipedrive.com
}

const PIPEDRIVE_ENDPOINTS = {
  baseUrl: 'https://api.pipedrive.com/v1',

  // Persons (Contacts)
  createPerson: 'POST /persons',
  getPerson: 'GET /persons/:id',

  // Organizations
  createOrganization: 'POST /organizations',

  // Deals
  createDeal: 'POST /deals',
  updateDeal: 'PUT /deals/:id',

  // Pipelines
  listPipelines: 'GET /pipelines',
  listStages: 'GET /stages',

  // Webhooks
  createWebhook: 'POST /webhooks'
};

// Pipedrive pricing: $14.90/user/month (Essential)
```

#### Automation Sequence

```
1. AUTHENTICATION
   ├── Option A: Create Private App
   │   https://app.hubspot.com/private-apps/{portalId}
   │   Required scopes: crm.objects.contacts, crm.objects.deals, etc.
   ├── Option B: OAuth flow
   │   https://app.hubspot.com/oauth/authorize
   └── Store access token

2. PORTAL SETUP
   ├── GET /account-info/v3/api-usage (verify access)
   ├── Get portal ID
   └── Store portal context

3. CRM CONFIGURATION
   ├── Create/verify deal pipeline
   │   POST /crm/v3/pipelines/deals
   ├── Create custom properties (if needed)
   │   POST /crm/v3/properties/contacts
   ├── Set up lifecycle stages
   └── Configure lead scoring (optional)

4. FORM SETUP (Optional)
   ├── Create lead capture form
   ├── Configure form notifications
   ├── Embed form on website
   └── Test form submission

5. INTEGRATIONS
   ├── Create webhooks for:
   │   - contact.creation
   │   - deal.creation
   │   - deal.propertyChange
   ├── Connect to email (for tracking)
   └── Connect to Slack notifications

6. VERIFICATION
   ├── Create test contact
   ├── Create test deal
   ├── Verify webhook delivery
   └── Mark integration complete
```

---

### 3.2 Cal.com (Scheduling)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://cal.com/docs/api-reference |
| Authentication | API Key |
| Rate Limits | 100 requests/minute |
| Free Tier | Free for individuals, Teams at $12/user/month |

#### Implementation Spec

```typescript
// src/integrations/connectors/CalComConnector.ts

interface CalComConfig {
  apiKey: string;
  baseUrl?: string;  // For self-hosted: your-domain.com
}

const CALCOM_ENDPOINTS = {
  baseUrl: 'https://api.cal.com/v1',

  // Event Types
  listEventTypes: 'GET /event-types',
  createEventType: 'POST /event-types',
  getEventType: 'GET /event-types/:id',
  updateEventType: 'PATCH /event-types/:id',
  deleteEventType: 'DELETE /event-types/:id',

  // Bookings
  listBookings: 'GET /bookings',
  getBooking: 'GET /bookings/:id',
  cancelBooking: 'DELETE /bookings/:id',

  // Availability
  listSchedules: 'GET /schedules',
  createSchedule: 'POST /schedules',
  updateSchedule: 'PATCH /schedules/:id',

  // Users
  listUsers: 'GET /users',
  getUser: 'GET /users/:id',

  // Teams
  listTeams: 'GET /teams',
  createTeam: 'POST /teams',

  // Webhooks
  listWebhooks: 'GET /webhooks',
  createWebhook: 'POST /webhooks',
  deleteWebhook: 'DELETE /webhooks/:id'
};

// Request Schemas
interface CreateEventTypeRequest {
  title: string;
  slug: string;
  description?: string;
  length: number;           // Duration in minutes
  locations?: Array<{
    type: 'integrations:google:meet' | 'integrations:zoom' | 'link' | 'inPerson' | 'phone';
    link?: string;
    address?: string;
    phone?: string;
  }>;
  minimumBookingNotice?: number;  // Minutes
  beforeEventBuffer?: number;
  afterEventBuffer?: number;
  slotInterval?: number;
  price?: number;
  currency?: string;
  hidden?: boolean;
}

interface CreateScheduleRequest {
  name: string;
  timezone: string;
  availability: Array<{
    days: number[];        // 0=Sunday, 6=Saturday
    startTime: string;     // "09:00"
    endTime: string;       // "17:00"
  }>;
  isDefault?: boolean;
}

// Standard Event Types for New Company
const DEFAULT_EVENT_TYPES = [
  {
    title: '15 Min Meeting',
    slug: '15min',
    length: 15,
    description: 'Quick sync or intro call'
  },
  {
    title: '30 Min Meeting',
    slug: '30min',
    length: 30,
    description: 'Standard meeting'
  },
  {
    title: '60 Min Meeting',
    slug: '60min',
    length: 60,
    description: 'Deep dive or demo'
  },
  {
    title: 'Sales Call',
    slug: 'sales',
    length: 30,
    description: 'Product demo and pricing discussion'
  }
];
```

#### Automation Sequence

```
1. AUTHENTICATION
   ├── Guide user to: https://cal.com/settings/developer/api-keys
   ├── Create API key with required scopes
   ├── Verify: GET /event-types
   └── Store encrypted

2. SCHEDULE SETUP
   ├── Create default schedule:
   │   POST /schedules
   │   { name: "Business Hours", timezone, availability }
   ├── Configure working hours
   ├── Set buffer times
   └── Store schedule ID

3. EVENT TYPES
   ├── Create standard event types:
   │   - 15 min intro
   │   - 30 min meeting
   │   - Sales demo
   ├── Configure locations (Zoom/Meet)
   ├── Set confirmation emails
   └── Store event type IDs

4. INTEGRATIONS
   ├── Connect calendar (Google/Outlook)
   ├── Connect video conferencing
   ├── Create webhooks for:
   │   - BOOKING_CREATED
   │   - BOOKING_CANCELLED
   │   - BOOKING_RESCHEDULED
   └── Connect to CRM (optional)

5. EMBED SETUP
   ├── Get embed code for website
   ├── Generate booking links
   └── Configure branding

6. VERIFICATION
   ├── Create test booking
   ├── Verify calendar event created
   ├── Verify webhook delivery
   └── Mark integration complete
```

---

### 3.3 Notion (Documentation)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developers.notion.com |
| Authentication | OAuth 2.0 or Integration Token |
| Rate Limits | 3 requests/second |
| Free Tier | Free for personal use, Plus at $8/user/month |

#### Implementation Spec

```typescript
// src/integrations/connectors/NotionConnector.ts

interface NotionConfig {
  integrationToken: string;  // secret_xxx
}

const NOTION_ENDPOINTS = {
  baseUrl: 'https://api.notion.com/v1',

  // Pages
  createPage: 'POST /pages',
  getPage: 'GET /pages/:page_id',
  updatePage: 'PATCH /pages/:page_id',

  // Databases
  createDatabase: 'POST /databases',
  queryDatabase: 'POST /databases/:database_id/query',
  getDatabase: 'GET /databases/:database_id',
  updateDatabase: 'PATCH /databases/:database_id',

  // Blocks
  getBlock: 'GET /blocks/:block_id',
  getBlockChildren: 'GET /blocks/:block_id/children',
  appendBlockChildren: 'PATCH /blocks/:block_id/children',
  deleteBlock: 'DELETE /blocks/:block_id',

  // Search
  search: 'POST /search',

  // Users
  listUsers: 'GET /users',
  getUser: 'GET /users/:user_id'
};

// Request Schemas
interface CreatePageRequest {
  parent: {
    database_id?: string;
    page_id?: string;
  };
  properties: Record<string, NotionProperty>;
  children?: NotionBlock[];
  icon?: { type: 'emoji'; emoji: string } | { type: 'external'; external: { url: string } };
  cover?: { type: 'external'; external: { url: string } };
}

interface NotionProperty {
  type: 'title' | 'rich_text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url' | 'email' | 'phone_number';
  // Specific fields based on type
  title?: Array<{ type: 'text'; text: { content: string } }>;
  rich_text?: Array<{ type: 'text'; text: { content: string } }>;
  number?: number;
  select?: { name: string };
  multi_select?: Array<{ name: string }>;
  date?: { start: string; end?: string };
  checkbox?: boolean;
  url?: string;
  email?: string;
  phone_number?: string;
}

interface NotionBlock {
  type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do' | 'toggle' | 'code' | 'callout' | 'divider' | 'table_of_contents';
  [key: string]: unknown;  // Type-specific content
}

// Standard Workspace Template for New Company
const WORKSPACE_TEMPLATE = {
  pages: [
    {
      title: 'Company Wiki',
      icon: '📚',
      children: [
        { title: 'Vision & Mission', icon: '🎯' },
        { title: 'Values', icon: '💎' },
        { title: 'Team', icon: '👥' },
        { title: 'Processes', icon: '📋' }
      ]
    },
    {
      title: 'Engineering',
      icon: '⚙️',
      children: [
        { title: 'Architecture', icon: '🏗️' },
        { title: 'APIs', icon: '🔌' },
        { title: 'Runbooks', icon: '📕' }
      ]
    },
    {
      title: 'Product',
      icon: '📦',
      children: [
        { title: 'Roadmap', icon: '🗺️' },
        { title: 'Feature Specs', icon: '📝' },
        { title: 'User Research', icon: '🔬' }
      ]
    },
    {
      title: 'Templates',
      icon: '📄',
      type: 'database',
      properties: ['Name', 'Type', 'Last Updated']
    }
  ]
};
```

#### Automation Sequence

```
1. INTEGRATION SETUP
   ├── Guide user to: https://www.notion.so/my-integrations
   ├── Create integration with capabilities:
   │   - Read content
   │   - Update content
   │   - Insert content
   ├── Collect integration token
   └── Store encrypted

2. WORKSPACE ACCESS
   ├── User shares workspace/pages with integration
   ├── GET /search to verify access
   ├── Find or create root workspace page
   └── Store workspace page ID

3. STRUCTURE SETUP
   ├── Create main pages:
   │   - Company Wiki
   │   - Engineering
   │   - Product
   │   - Templates
   ├── Create sub-pages
   ├── Add initial content
   └── Store page IDs

4. DATABASE SETUP (Optional)
   ├── Create databases for:
   │   - Meeting Notes
   │   - Decision Log
   │   - Templates
   ├── Configure properties
   └── Add template entries

5. INTEGRATIONS
   ├── Connect to Slack (for updates)
   ├── Configure page permissions
   └── Set up sync with Linear (optional)

6. VERIFICATION
   ├── Verify pages accessible
   ├── Create test page
   ├── Verify search working
   └── Mark integration complete
```

---

### 3.4 Google Analytics

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developers.google.com/analytics/devguides/reporting/ga4 |
| Authentication | OAuth 2.0 |
| Rate Limits | 50,000 requests/day |
| Free Tier | Free (GA4) |

#### Implementation Spec

```typescript
// src/integrations/connectors/GoogleAnalyticsConnector.ts

interface GAConfig {
  propertyId: string;      // GA4 property ID
  measurementId: string;   // G-XXXXXXXXXX
}

const GA_ENDPOINTS = {
  // Admin API (for setup)
  admin: 'https://analyticsadmin.googleapis.com/v1beta',

  listAccounts: 'GET /accounts',
  createProperty: 'POST /properties',
  getProperty: 'GET /properties/:propertyId',
  createDataStream: 'POST /properties/:propertyId/dataStreams',

  // Data API (for reporting)
  data: 'https://analyticsdata.googleapis.com/v1beta',

  runReport: 'POST /properties/:propertyId:runReport',
  runRealtimeReport: 'POST /properties/:propertyId:runRealtimeReport'
};

// Property Creation
interface CreatePropertyRequest {
  displayName: string;
  timeZone: string;
  currencyCode: string;
  industryCategory: string;
  parent: string;  // accounts/{accountId}
}

interface CreateDataStreamRequest {
  displayName: string;
  type: 'WEB_DATA_STREAM';
  webStreamData: {
    defaultUri: string;  // https://company.com
  };
}

// Report Request
interface ReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit?: number;
  offset?: number;
  dimensionFilter?: FilterExpression;
  metricFilter?: FilterExpression;
}

// Common Dimensions/Metrics
const COMMON_DIMENSIONS = [
  'date', 'dateHour', 'country', 'city', 'deviceCategory',
  'browser', 'operatingSystem', 'sessionSource', 'sessionMedium',
  'pagePath', 'pageTitle', 'landingPage', 'eventName'
];

const COMMON_METRICS = [
  'activeUsers', 'newUsers', 'sessions', 'screenPageViews',
  'engagementRate', 'averageSessionDuration', 'conversions',
  'totalRevenue', 'bounceRate'
];

// GTM Container for Event Tracking (recommended)
interface GTMContainer {
  accountId: string;
  containerId: string;
  publicId: string;  // GTM-XXXXXX
}
```

#### Automation Sequence

```
1. ACCOUNT ACCESS
   ├── OAuth flow for Google
   │   Scopes: analytics.readonly, analytics.edit
   ├── GET /accounts to list accounts
   ├── User selects or creates account
   └── Store account context

2. PROPERTY CREATION
   ├── POST /properties
   │   { displayName, timeZone, currencyCode, parent }
   ├── Store property ID
   └── Get measurement ID

3. DATA STREAM SETUP
   ├── POST /properties/:id/dataStreams
   │   { type: 'WEB_DATA_STREAM', webStreamData: { defaultUri } }
   ├── Get measurement ID (G-XXXXXXXXXX)
   └── Store stream configuration

4. WEBSITE INTEGRATION
   ├── Generate tracking script:
   │   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXX"></script>
   ├── Add to Vercel environment variables
   └── Deploy updated site

5. CONVERSION SETUP (Optional)
   ├── Configure conversion events
   ├── Set up goals
   └── Configure e-commerce tracking

6. VERIFICATION
   ├── Visit site to generate data
   ├── Verify realtime report shows traffic
   ├── Check data stream status
   └── Mark integration complete
```

---

### 3.5 Mixpanel (Product Analytics)

#### Service Details
| Property | Value |
|----------|-------|
| API Documentation | https://developer.mixpanel.com |
| Authentication | Project Token + Service Account |
| Rate Limits | 2000 requests/minute |
| Free Tier | 20M events/month |

#### Implementation Spec

```typescript
// src/integrations/connectors/MixpanelConnector.ts

interface MixpanelConfig {
  projectToken: string;    // For client-side
  apiSecret?: string;      // For server-side (deprecated)
  serviceAccountUser: string;
  serviceAccountSecret: string;
}

const MIXPANEL_ENDPOINTS = {
  // Ingestion
  track: 'POST https://api.mixpanel.com/track',
  import: 'POST https://api.mixpanel.com/import',
  engage: 'POST https://api.mixpanel.com/engage',
  groups: 'POST https://api.mixpanel.com/groups',

  // Query API
  query: 'POST https://mixpanel.com/api/2.0/jql',

  // Export
  export: 'GET https://data.mixpanel.com/api/2.0/export',

  // Lexicon (data governance)
  listEvents: 'GET https://mixpanel.com/api/app/projects/:projectId/data/events',
  listProperties: 'GET https://mixpanel.com/api/app/projects/:projectId/data/properties'
};

// Event Tracking
interface TrackEvent {
  event: string;
  properties: {
    token: string;
    distinct_id: string;
    time?: number;
    $insert_id?: string;
    [key: string]: unknown;
  };
}

// User Profile Update
interface ProfileUpdate {
  $token: string;
  $distinct_id: string;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
  $add?: Record<string, number>;
  $append?: Record<string, unknown>;
  $unset?: string[];
}

// Standard Events for SaaS
const STANDARD_EVENTS = [
  'Sign Up',
  'Login',
  'Page View',
  'Feature Used',
  'Subscription Started',
  'Subscription Upgraded',
  'Subscription Cancelled',
  'Payment Completed',
  'Invite Sent',
  'Team Member Added'
];

// Standard User Properties
const STANDARD_PROPERTIES = [
  '$email',
  '$name',
  '$created',
  'plan',
  'company',
  'role',
  'mrr',
  'lifetime_value'
];
```

#### Alternative: Amplitude

```typescript
// src/integrations/connectors/AmplitudeConnector.ts

interface AmplitudeConfig {
  apiKey: string;
  secretKey: string;
}

const AMPLITUDE_ENDPOINTS = {
  track: 'POST https://api2.amplitude.com/2/httpapi',
  identify: 'POST https://api2.amplitude.com/identify',
  groupIdentify: 'POST https://api2.amplitude.com/groupidentify',
  export: 'GET https://amplitude.com/api/2/export'
};

// Amplitude free tier: 10M events/month
```

#### Automation Sequence

```
1. PROJECT SETUP
   ├── Guide user to: https://mixpanel.com/project
   ├── Create project or select existing
   ├── Get project token
   └── Create service account

2. SDK INTEGRATION
   ├── Generate client-side init code:
   │   mixpanel.init("{token}", {track_pageview: true})
   ├── Add to Vercel environment
   ├── Generate server-side setup
   └── Deploy updated code

3. EVENT TAXONOMY
   ├── Define standard events
   ├── Create event/property documentation
   ├── Set up data governance rules
   └── Configure conversion events

4. FUNNELS & COHORTS (Optional)
   ├── Create onboarding funnel
   ├── Create conversion funnel
   ├── Set up key cohorts
   └── Configure alerts

5. VERIFICATION
   ├── Send test event
   ├── Verify in live view
   ├── Check event schema
   └── Mark integration complete
```

---

### 3.6 Social Media APIs

#### Twitter/X API

```typescript
// src/integrations/connectors/TwitterConnector.ts

interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken: string;
}

const TWITTER_ENDPOINTS = {
  baseUrl: 'https://api.twitter.com/2',

  // Tweets
  createTweet: 'POST /tweets',
  getTweet: 'GET /tweets/:id',
  deleteTweet: 'DELETE /tweets/:id',

  // Users
  getUser: 'GET /users/:id',
  getUserByUsername: 'GET /users/by/username/:username',

  // Timeline
  getUserTimeline: 'GET /users/:id/tweets',

  // Media (v1.1)
  uploadMedia: 'POST https://upload.twitter.com/1.1/media/upload.json'
};

// Rate Limits:
// - Free: 1,500 tweets/month (write), 100 reads/month
// - Basic ($100/mo): 50,000 tweets/month, 10,000 reads
// - Pro ($5,000/mo): 1M tweets/month, 1M reads

interface CreateTweetRequest {
  text: string;
  media?: { media_ids: string[] };
  poll?: { options: string[]; duration_minutes: number };
  reply?: { in_reply_to_tweet_id: string };
  reply_settings?: 'everyone' | 'mentionedUsers' | 'following';
}
```

#### LinkedIn API

```typescript
// src/integrations/connectors/LinkedInConnector.ts

interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
}

const LINKEDIN_ENDPOINTS = {
  baseUrl: 'https://api.linkedin.com/v2',

  // Profile
  getProfile: 'GET /me',
  getProfilePicture: 'GET /me?projection=(profilePicture(displayImage~:playableStreams))',

  // Posts (UGC - User Generated Content)
  createPost: 'POST /ugcPosts',
  getPost: 'GET /ugcPosts/:id',
  deletePost: 'DELETE /ugcPosts/:id',

  // Organization
  getOrganization: 'GET /organizations/:id',

  // Media
  registerUpload: 'POST /assets?action=registerUpload',
  uploadAsset: 'PUT {uploadUrl}'  // From registerUpload response
};

// Required Scopes
const LINKEDIN_SCOPES = [
  'r_liteprofile',
  'r_emailaddress',
  'w_member_social',  // Post on behalf of user
  'rw_organization_admin'  // For company pages
];

// Note: LinkedIn Marketing APIs require partnership approval
// Rate limits: 100 requests/day for basic
```

#### Instagram API (via Meta)

```typescript
// src/integrations/connectors/InstagramConnector.ts

interface InstagramConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  businessAccountId: string;
}

const INSTAGRAM_ENDPOINTS = {
  baseUrl: 'https://graph.facebook.com/v18.0',

  // Media (Business/Creator accounts only)
  createMedia: 'POST /:ig-user-id/media',
  publishMedia: 'POST /:ig-user-id/media_publish',
  getMedia: 'GET /:media-id',

  // Account
  getAccount: 'GET /:ig-user-id',
  getInsights: 'GET /:ig-user-id/insights',

  // Content
  getMediaList: 'GET /:ig-user-id/media',
  getStories: 'GET /:ig-user-id/stories'
};

// Requirements:
// - Must be Business or Creator account
// - Must be connected to Facebook Page
// - No direct DM access for most apps

interface CreateMediaRequest {
  image_url?: string;
  video_url?: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  location_id?: string;
  user_tags?: Array<{ username: string; x: number; y: number }>;
  children?: string[];  // For carousel
}
```

#### Automation Sequence (Social Media)

```
1. AUTHENTICATION
   ├── Twitter: OAuth 1.0a flow or API key
   ├── LinkedIn: OAuth 2.0 flow
   ├── Instagram: OAuth via Facebook
   └── Store tokens securely

2. PROFILE SETUP
   ├── Verify account access
   ├── Get account/page IDs
   ├── Configure posting permissions
   └── Store account context

3. CONTENT QUEUE (Optional)
   ├── Create content calendar database
   ├── Set up scheduling system
   ├── Configure auto-posting
   └── Set up approval workflow

4. ANALYTICS CONNECTION
   ├── Enable insights/analytics
   ├── Set up metrics tracking
   └── Configure reporting

5. VERIFICATION
   ├── Post test content (private/draft if possible)
   ├── Verify metrics accessible
   └── Mark integration complete

Note: Social APIs have strict rate limits and approval processes.
Twitter Basic ($100/mo) and LinkedIn Marketing API partnership required for production use.
```

---

## PHASE 4: ASSET GENERATION INTEGRATIONS

### 4.1 Logo Generation

#### Recommended Services

**Option 1: LogoAI (Recommended for automation)**
```typescript
// src/integrations/connectors/LogoAIConnector.ts

interface LogoAIConfig {
  apiKey: string;
}

const LOGOAI_ENDPOINTS = {
  baseUrl: 'https://app.logo.com/api/v1',

  generateLogos: 'POST /logos/generate',
  getLogoVariants: 'GET /logos/:id/variants',
  downloadLogo: 'GET /logos/:id/download'
};

// Pricing: API access requires enterprise plan (~$500/mo)
// Alternative: Use their website programmatically via Puppeteer
```

**Option 2: Looka (Better quality, manual)**
```
URL: https://looka.com
Process:
1. User provides company name, industry, style preferences
2. Generate through website
3. Download and upload to asset storage
Pricing: $65-$80 one-time for brand kit
```

**Option 3: OpenAI DALL-E (For custom generation)**
```typescript
// Using existing OpenAI integration

interface LogoGenerationRequest {
  prompt: string;  // "Modern minimalist logo for {company}, technology startup, clean lines, professional"
  size: '1024x1024';
  quality: 'hd';
  style: 'vivid' | 'natural';
}

// Pricing: $0.08 per HD image
// Note: Quality varies, may need multiple attempts
```

#### Automation Sequence (Logo)

```
1. GATHER REQUIREMENTS
   ├── Company name
   ├── Industry/vertical
   ├── Style preferences (modern, classic, playful, etc.)
   ├── Color preferences
   └── Icon preferences

2. GENERATION (Choose approach)
   ├── Option A: DALL-E generation
   │   - Generate 4-6 variants
   │   - User selects favorite
   ├── Option B: Looka redirect
   │   - Redirect user to Looka with prefilled data
   │   - User downloads and uploads
   └── Option C: Template-based
       - Use predefined SVG templates
       - Customize colors/text

3. ASSET CREATION
   ├── Generate variants:
   │   - Primary logo (full color)
   │   - White/knockout version
   │   - Icon only
   │   - Favicon (16x16, 32x32, etc.)
   ├── Export formats:
   │   - SVG (primary)
   │   - PNG (various sizes)
   │   - ICO (favicon)
   └── Store in asset storage

4. DISTRIBUTION
   ├── Upload to Vercel/website
   ├── Add to brand guide
   ├── Configure as favicon
   └── Add to email signatures
```

---

### 4.2 Image Generation (DALL-E / Stable Diffusion)

```typescript
// src/integrations/connectors/ImageGenerationConnector.ts

interface ImageGenerationConfig {
  provider: 'openai' | 'stability' | 'midjourney';
  apiKey: string;
}

// OpenAI DALL-E
const DALLE_ENDPOINTS = {
  generate: 'POST https://api.openai.com/v1/images/generations',
  edit: 'POST https://api.openai.com/v1/images/edits',
  variations: 'POST https://api.openai.com/v1/images/variations'
};

interface DALLERequest {
  prompt: string;
  model: 'dall-e-3' | 'dall-e-2';
  n: number;           // 1-10 (1 for DALL-E 3)
  size: '1024x1024' | '1792x1024' | '1024x1792';
  quality: 'standard' | 'hd';
  style: 'vivid' | 'natural';
  response_format: 'url' | 'b64_json';
}

// Stability AI
const STABILITY_ENDPOINTS = {
  generate: 'POST https://api.stability.ai/v1/generation/:engine/text-to-image',
  upscale: 'POST https://api.stability.ai/v1/generation/:engine/image-to-image/upscale'
};

// Use cases for company builder:
const IMAGE_USE_CASES = [
  'Hero images for landing page',
  'Product mockups',
  'Team placeholder photos',
  'Blog post headers',
  'Social media graphics',
  'Presentation backgrounds'
];
```

---

### 4.3 PDF Generation

```typescript
// src/integrations/connectors/PDFConnector.ts

// Option 1: PDFKit (Node.js library, no API needed)
import PDFDocument from 'pdfkit';

// Option 2: Puppeteer (HTML to PDF)
// Already available via computer-use integration

// Option 3: DocRaptor (cloud API)
interface DocRaptorConfig {
  apiKey: string;
}

const DOCRAPTOR_ENDPOINTS = {
  createDocument: 'POST https://docraptor.com/docs'
};

interface DocRaptorRequest {
  name: string;
  document_type: 'pdf' | 'xls' | 'xlsx';
  document_content: string;  // HTML
  test: boolean;
  prince_options?: {
    media: 'screen' | 'print';
    baseurl?: string;
  };
}

// Common PDFs for new company:
const COMPANY_PDF_TEMPLATES = [
  {
    name: 'Proposal Template',
    sections: ['Cover', 'Introduction', 'Solution', 'Pricing', 'Terms']
  },
  {
    name: 'Invoice',
    sections: ['Header', 'Line Items', 'Totals', 'Payment Info']
  },
  {
    name: 'Contract',
    sections: ['Parties', 'Scope', 'Terms', 'Signatures']
  },
  {
    name: 'Pitch Deck (Export)',
    sections: ['Title', 'Problem', 'Solution', 'Market', 'Team', 'Ask']
  }
];
```

#### Automation Sequence (PDFs)

```
1. TEMPLATE SETUP
   ├── Create HTML templates for each document type
   ├── Configure company branding (logo, colors, fonts)
   ├── Set up variable placeholders
   └── Store in template storage

2. GENERATION FLOW
   ├── Receive generation request with data
   ├── Render HTML with data
   ├── Convert to PDF (Puppeteer or PDFKit)
   ├── Apply digital signature if needed
   └── Return PDF or store URL

3. INTEGRATION
   ├── Connect to CRM for proposal generation
   ├── Connect to Stripe for invoice generation
   ├── Add to document management
   └── Configure email attachments

4. VERIFICATION
   ├── Generate test PDF
   ├── Verify formatting
   ├── Verify branding applied
   └── Mark integration complete
```

---

## Environment Variables Configuration

```bash
# .env.example for Alabobai Company Builder

# =====================
# PHASE 1: FOUNDATION
# =====================

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# GitHub
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REDIRECT_URI=https://app.alabobai.com/auth/github/callback
GITHUB_WEBHOOK_SECRET=xxx

# Resend
RESEND_API_KEY=re_xxx

# SendGrid (alternative)
SENDGRID_API_KEY=SG.xxx

# =====================
# PHASE 2: INFRASTRUCTURE
# =====================

# Namecheap
NAMECHEAP_API_USER=xxx
NAMECHEAP_API_KEY=xxx
NAMECHEAP_USERNAME=xxx
NAMECHEAP_CLIENT_IP=xxx

# GoDaddy (alternative)
GODADDY_API_KEY=xxx
GODADDY_API_SECRET=xxx

# Cloudflare
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx

# Vercel
VERCEL_TOKEN=xxx
VERCEL_TEAM_ID=xxx

# Google Workspace
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx
GOOGLE_SERVICE_ACCOUNT_KEY=xxx

# Zoho (alternative)
ZOHO_CLIENT_ID=xxx
ZOHO_CLIENT_SECRET=xxx
ZOHO_ORG_ID=xxx

# Slack
SLACK_CLIENT_ID=xxx
SLACK_CLIENT_SECRET=xxx
SLACK_SIGNING_SECRET=xxx
SLACK_APP_TOKEN=xapp-xxx

# Linear
LINEAR_API_KEY=lin_api_xxx

# =====================
# PHASE 3: ENHANCEMENT
# =====================

# HubSpot
HUBSPOT_ACCESS_TOKEN=xxx
HUBSPOT_PORTAL_ID=xxx

# Pipedrive (alternative)
PIPEDRIVE_API_TOKEN=xxx

# Cal.com
CALCOM_API_KEY=cal_xxx

# Notion
NOTION_INTEGRATION_TOKEN=secret_xxx

# Google Analytics
GA_MEASUREMENT_ID=G-xxx
GA_PROPERTY_ID=xxx

# Mixpanel
MIXPANEL_PROJECT_TOKEN=xxx
MIXPANEL_SERVICE_ACCOUNT_USER=xxx
MIXPANEL_SERVICE_ACCOUNT_SECRET=xxx

# Amplitude (alternative)
AMPLITUDE_API_KEY=xxx
AMPLITUDE_SECRET_KEY=xxx

# Twitter/X
TWITTER_API_KEY=xxx
TWITTER_API_SECRET=xxx
TWITTER_ACCESS_TOKEN=xxx
TWITTER_ACCESS_TOKEN_SECRET=xxx
TWITTER_BEARER_TOKEN=xxx

# LinkedIn
LINKEDIN_CLIENT_ID=xxx
LINKEDIN_CLIENT_SECRET=xxx

# Instagram (via Meta)
META_APP_ID=xxx
META_APP_SECRET=xxx
INSTAGRAM_BUSINESS_ACCOUNT_ID=xxx

# =====================
# PHASE 4: ASSETS
# =====================

# OpenAI (for image generation)
OPENAI_API_KEY=sk-xxx

# Stability AI (alternative)
STABILITY_API_KEY=sk-xxx

# DocRaptor (PDF)
DOCRAPTOR_API_KEY=xxx

# =====================
# ENCRYPTION
# =====================

# Credential encryption key (generate with: openssl rand -hex 32)
CREDENTIAL_ENCRYPTION_KEY=xxx

# Webhook signing key
WEBHOOK_SIGNING_KEY=xxx
```

---

## Integration Orchestration

```typescript
// src/integrations/CompanyBuilderOrchestrator.ts

interface CompanySetupRequest {
  companyName: string;
  domain: string;
  industry: string;
  owner: {
    name: string;
    email: string;
  };
  features: {
    payments: boolean;
    crm: boolean;
    scheduling: boolean;
    analytics: boolean;
    social: boolean;
  };
}

interface SetupProgress {
  phase: 1 | 2 | 3 | 4;
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  requiresUserAction: boolean;
  userActionUrl?: string;
}

class CompanyBuilderOrchestrator {
  async setupCompany(request: CompanySetupRequest): Promise<void> {
    // Phase 1: Foundation (Sequential - must complete first)
    await this.setupStripe(request);
    await this.setupGitHub(request);
    await this.setupTransactionalEmail(request);

    // Phase 2: Infrastructure (Parallel where possible)
    await Promise.all([
      this.setupDomain(request),      // Domain + Cloudflare (sequential)
      this.setupSlack(request),        // Independent
      this.setupLinear(request)        // Independent
    ]);

    // After domain is ready
    await this.setupVercel(request);
    await this.setupBusinessEmail(request);

    // Phase 3: Enhancement (Parallel)
    await Promise.all([
      this.setupCRM(request),
      this.setupScheduling(request),
      this.setupDocumentation(request),
      this.setupAnalytics(request),
      this.setupSocialMedia(request)
    ]);

    // Phase 4: Assets (Can run async)
    this.generateAssets(request);  // Don't await
  }

  // Estimated total time: 30-45 minutes
  // (Most time spent waiting for DNS propagation and user OAuth approvals)
}
```

---

## Error Handling & Retry Strategy

```typescript
// src/integrations/utils/RetryHandler.ts

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'RATE_LIMIT_EXCEEDED'
  ]
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      const isRetryable =
        config.retryableStatuses.includes(error.status) ||
        config.retryableErrors.includes(error.code);

      if (!isRetryable || attempt === config.maxAttempts) {
        throw error;
      }

      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt - 1),
        config.maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Circuit Breaker for external services
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeMs: number = 60000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }
}
```

---

## Credential Storage

```typescript
// src/integrations/utils/CredentialVault.ts

import * as crypto from 'crypto';

interface StoredCredential {
  service: string;
  userId: string;
  credentials: string;  // Encrypted
  iv: string;
  authTag: string;
  createdAt: number;
  expiresAt?: number;
}

class CredentialVault {
  private encryptionKey: Buffer;

  constructor(key: string) {
    this.encryptionKey = crypto.scryptSync(key, 'alabobai-salt', 32);
  }

  encrypt(data: Record<string, unknown>): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex')
    };
  }

  decrypt(encrypted: string, iv: string, authTag: string): Record<string, unknown> {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  async store(
    service: string,
    userId: string,
    credentials: Record<string, unknown>,
    expiresAt?: number
  ): Promise<void> {
    const { encrypted, iv, authTag } = this.encrypt(credentials);

    // Store in database
    await db.credentials.upsert({
      where: { service_userId: { service, userId } },
      create: {
        service,
        userId,
        credentials: encrypted,
        iv,
        authTag,
        createdAt: Date.now(),
        expiresAt
      },
      update: {
        credentials: encrypted,
        iv,
        authTag,
        createdAt: Date.now(),
        expiresAt
      }
    });
  }

  async retrieve(
    service: string,
    userId: string
  ): Promise<Record<string, unknown> | null> {
    const stored = await db.credentials.findUnique({
      where: { service_userId: { service, userId } }
    });

    if (!stored) return null;

    if (stored.expiresAt && Date.now() > stored.expiresAt) {
      await this.revoke(service, userId);
      return null;
    }

    return this.decrypt(stored.credentials, stored.iv, stored.authTag);
  }

  async revoke(service: string, userId: string): Promise<void> {
    await db.credentials.delete({
      where: { service_userId: { service, userId } }
    });
  }
}
```

---

## Summary

This specification covers **17 external service integrations** organized into 4 phases:

### Phase 1: Foundation (5-10 min)
1. **Stripe** - Payments
2. **GitHub** - Code repository
3. **Resend/SendGrid** - Transactional email

### Phase 2: Infrastructure (10-15 min)
4. **Namecheap/GoDaddy** - Domain registration
5. **Cloudflare** - DNS & SSL
6. **Vercel** - Website deployment
7. **Google Workspace/Zoho** - Business email
8. **Slack** - Team communication
9. **Linear** - Project management

### Phase 3: Enhancement (15-20 min)
10. **HubSpot/Pipedrive** - CRM
11. **Cal.com** - Scheduling
12. **Notion** - Documentation
13. **Google Analytics** - Web analytics
14. **Mixpanel/Amplitude** - Product analytics
15. **Twitter/LinkedIn/Instagram** - Social media

### Phase 4: Assets (5-10 min, async)
16. **Logo generation** - Looka/DALL-E
17. **Image generation** - DALL-E/Stability
18. **PDF generation** - PDFKit/Puppeteer

**Total estimated setup time: 35-55 minutes** (primarily waiting for DNS propagation and user approvals)

All integrations include:
- Complete API endpoint specifications
- Request/response schemas
- Authentication flows
- Rate limit handling
- Retry strategies
- Error handling
- Verification steps
