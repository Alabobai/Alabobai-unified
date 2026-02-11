# Alabobai Platform - Technical Architecture Specification

**Version:** 1.0.0
**Last Updated:** 2026-02-08
**Status:** Production-Ready

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Schema](#2-database-schema)
3. [API Design](#3-api-design)
4. [Agent Runtime](#4-agent-runtime)
5. [Deployment Architecture](#5-deployment-architecture)
6. [Security Model](#6-security-model)
7. [Scalability Considerations](#7-scalability-considerations)
8. [Monitoring & Observability](#8-monitoring--observability)

---

## 1. System Architecture

### 1.1 Frontend Stack

```
Framework:        Next.js 14 (App Router)
Language:         TypeScript 5.3+
State Management: Zustand + React Query (TanStack Query v5)
Styling:          Tailwind CSS 3.4 + shadcn/ui
Real-time:        Socket.io-client
Forms:            React Hook Form + Zod validation
Charts:           Recharts / Tremor
```

**Directory Structure:**
```
app/
├── (auth)/
│   ├── login/
│   └── signup/
├── (dashboard)/
│   ├── agents/
│   ├── companies/
│   ├── executions/
│   └── settings/
├── api/
│   └── [...routes]/
├── components/
│   ├── ui/           # shadcn components
│   ├── agents/       # Agent-specific components
│   ├── chat/         # Chat interface
│   └── shared/       # Shared components
├── hooks/
├── lib/
├── stores/           # Zustand stores
└── types/
```

### 1.2 Backend Stack

```
Runtime:          Node.js 20 LTS
Language:         TypeScript 5.3+
Framework:        Express.js 4.18 (REST) + Custom WebSocket
Database:         PostgreSQL 16 (primary) + SQLite (local dev)
ORM:              Drizzle ORM
Cache:            Redis 7.2
Search:           PostgreSQL Full-Text Search (initial), Elasticsearch (scale)
```

**Core Dependencies:**
```json
{
  "@anthropic-ai/sdk": "^0.30.0",
  "openai": "^4.70.0",
  "express": "^4.18.2",
  "ws": "^8.16.0",
  "drizzle-orm": "^0.29.0",
  "ioredis": "^5.3.0",
  "bullmq": "^5.1.0",
  "zod": "^3.22.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "dockerode": "^4.0.0",
  "puppeteer": "^22.0.0"
}
```

### 1.3 Real-time Infrastructure

```typescript
// WebSocket Server Configuration
interface WebSocketConfig {
  server: 'ws' | 'socket.io';
  path: '/ws';
  pingInterval: 30000;
  pingTimeout: 5000;
  maxPayload: 1048576; // 1MB
  perMessageDeflate: true;

  // Scaling with Redis adapter
  adapter: {
    type: 'redis';
    host: process.env.REDIS_HOST;
    port: 6379;
    keyPrefix: 'alabobai:ws:';
  };
}

// Event Types
type WebSocketEvent =
  | 'agent:started' | 'agent:progress' | 'agent:completed' | 'agent:error'
  | 'task:created' | 'task:updated' | 'task:completed'
  | 'approval:requested' | 'approval:resolved'
  | 'chat:message' | 'chat:stream'
  | 'system:health' | 'system:notification';
```

### 1.4 Job Queue System

```typescript
// BullMQ Configuration
interface QueueConfig {
  connection: {
    host: string;
    port: 6379;
    maxRetriesPerRequest: null;
  };

  queues: {
    'agent-execution': {
      defaultJobOptions: {
        attempts: 3;
        backoff: { type: 'exponential'; delay: 1000 };
        removeOnComplete: { age: 86400 }; // 24 hours
        removeOnFail: { age: 604800 };    // 7 days
      };
    };
    'document-generation': {
      defaultJobOptions: {
        attempts: 2;
        timeout: 300000; // 5 minutes
      };
    };
    'notifications': {
      defaultJobOptions: {
        attempts: 5;
        priority: 1;
      };
    };
    'analytics': {
      defaultJobOptions: {
        attempts: 1;
        delay: 5000; // Batch processing
      };
    };
  };
}
```

### 1.5 File Storage Solution

```typescript
// Storage Configuration
interface StorageConfig {
  provider: 'cloudflare-r2' | 's3' | 'local';

  buckets: {
    'alabobai-assets': {
      purpose: 'User uploads, generated files';
      maxSize: '100MB';
      allowedTypes: ['image/*', 'application/pdf', 'text/*'];
    };
    'alabobai-checkpoints': {
      purpose: 'Agent state checkpoints';
      maxSize: '50MB';
      lifecycle: { expireAfter: '30d' };
    };
    'alabobai-exports': {
      purpose: 'Generated exports, reports';
      maxSize: '500MB';
      lifecycle: { expireAfter: '7d' };
    };
  };

  // Cloudflare R2 Configuration (recommended)
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: 'https://{account_id}.r2.cloudflarestorage.com';
  };
}
```

### 1.6 CDN Configuration

```typescript
// Cloudflare CDN Configuration
interface CDNConfig {
  provider: 'cloudflare';

  zones: {
    static: {
      domain: 'cdn.alabobai.com';
      cacheRules: {
        '*.js': { edge: '1y', browser: '1y' };
        '*.css': { edge: '1y', browser: '1y' };
        '*.woff2': { edge: '1y', browser: '1y' };
        '/api/*': { edge: 0, browser: 0 };
      };
    };
    assets: {
      domain: 'assets.alabobai.com';
      cacheRules: {
        '/uploads/*': { edge: '30d', browser: '7d' };
        '/exports/*': { edge: '1d', browser: '1h' };
      };
    };
  };

  security: {
    waf: true;
    ddosProtection: true;
    botManagement: true;
    rateLimit: {
      '/api/*': '100 req/min';
      '/api/chat/*': '30 req/min';
    };
  };
}
```

---

## 2. Database Schema

### 2.1 Core Tables

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  oauth_provider VARCHAR(20), -- 'google', 'github'
  oauth_id VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user', -- 'user', 'admin', 'super_admin'
  subscription_tier VARCHAR(20) DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  subscription_status VARCHAR(20) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT valid_oauth CHECK (
    (oauth_provider IS NULL AND oauth_id IS NULL) OR
    (oauth_provider IS NOT NULL AND oauth_id IS NOT NULL)
  )
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX idx_users_subscription ON users(subscription_tier, subscription_status);

-- Companies Table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  website VARCHAR(500),
  industry VARCHAR(100),
  stage VARCHAR(50), -- 'idea', 'mvp', 'growth', 'scale'
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'archived'
  settings JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_stage CHECK (stage IN ('idea', 'mvp', 'growth', 'scale'))
);

CREATE INDEX idx_companies_owner ON companies(owner_id);
CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_status ON companies(status);

-- Agents Table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'wealth', 'credit', 'legal', 'business', 'health', 'computer', 'builder', 'research', 'guardian'
  category VARCHAR(50) NOT NULL, -- 'advisory', 'computer-control', 'builder', 'research', 'orchestrator'
  status VARCHAR(20) DEFAULT 'idle', -- 'idle', 'working', 'waiting-approval', 'collaborating', 'error'
  icon VARCHAR(10),
  description TEXT,
  skills TEXT[] DEFAULT '{}',
  system_prompt TEXT,
  config JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{"completed_tasks": 0, "success_rate": 1.0}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

CREATE INDEX idx_agents_company ON agents(company_id);
CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_status ON agents(status);

-- Executions Table (Agent Task Executions)
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID NOT NULL,

  -- Task Information
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- 'pending', 'in-progress', 'waiting-approval', 'approved', 'rejected', 'completed', 'failed', 'cancelled'

  -- Hierarchy
  parent_execution_id UUID REFERENCES executions(id),

  -- Input/Output
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error TEXT,

  -- Approval
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_reason TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metrics
  iterations INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  execution_time_ms INTEGER,

  -- Checkpointing
  checkpoint_id UUID,
  checkpoint_data JSONB
);

CREATE INDEX idx_executions_company ON executions(company_id);
CREATE INDEX idx_executions_agent ON executions(agent_id);
CREATE INDEX idx_executions_session ON executions(session_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_parent ON executions(parent_execution_id);
CREATE INDEX idx_executions_created ON executions(created_at DESC);

-- Assets Table
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'image', 'document', 'code', 'export', 'checkpoint'
  mime_type VARCHAR(100),
  size_bytes BIGINT,

  storage_provider VARCHAR(20) DEFAULT 'r2', -- 'r2', 's3', 'local'
  storage_key VARCHAR(500) NOT NULL,
  public_url TEXT,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_assets_company ON assets(company_id);
CREATE INDEX idx_assets_execution ON assets(execution_id);
CREATE INDEX idx_assets_type ON assets(type);
CREATE INDEX idx_assets_storage ON assets(storage_key);

-- Integrations Table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  provider VARCHAR(50) NOT NULL, -- 'stripe', 'plaid', 'twilio', 'sendgrid', 'slack', etc.
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'active', 'error', 'disabled'

  -- Encrypted credentials
  credentials_encrypted BYTEA,
  credentials_iv BYTEA,

  -- OAuth tokens (encrypted)
  access_token_encrypted BYTEA,
  refresh_token_encrypted BYTEA,
  token_expires_at TIMESTAMPTZ,

  config JSONB DEFAULT '{}',
  webhook_url TEXT,
  webhook_secret_encrypted BYTEA,

  last_sync_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integrations_company ON integrations(company_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE UNIQUE INDEX idx_integrations_unique ON integrations(company_id, provider);

-- Metrics Table (Time-Series)
CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  metric_type VARCHAR(50) NOT NULL,
  -- 'execution_count', 'success_rate', 'token_usage', 'response_time', 'error_rate'

  value DECIMAL(20, 6) NOT NULL,
  unit VARCHAR(20), -- 'count', 'percentage', 'ms', 'tokens'

  dimensions JSONB DEFAULT '{}', -- Additional grouping dimensions

  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Partitioning support
  created_date DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED
);

-- Partition by month for efficient time-series queries
CREATE INDEX idx_metrics_company_time ON metrics(company_id, timestamp DESC);
CREATE INDEX idx_metrics_type_time ON metrics(metric_type, timestamp DESC);
CREATE INDEX idx_metrics_agent ON metrics(agent_id, timestamp DESC);

-- Feedback Table
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  type VARCHAR(30) NOT NULL, -- 'rating', 'thumbs', 'comment', 'bug_report'

  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  thumbs VARCHAR(10) CHECK (thumbs IN ('up', 'down')),
  comment TEXT,

  context JSONB DEFAULT '{}', -- Message context, screenshots, etc.

  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'reviewed', 'actioned'
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_company ON feedback(company_id);
CREATE INDEX idx_feedback_execution ON feedback(execution_id);
CREATE INDEX idx_feedback_type ON feedback(type, created_at DESC);
```

### 2.2 Session & Conversation Tables

```sql
-- Sessions Table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'abandoned'

  context JSONB DEFAULT '{}',
  active_agents UUID[] DEFAULT '{}',
  pending_approvals UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_company ON sessions(company_id);
CREATE INDEX idx_sessions_active ON sessions(status, last_activity_at DESC);

-- Messages Table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,

  role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system', 'agent'
  content TEXT NOT NULL,

  agent_id UUID REFERENCES agents(id),
  agent_name VARCHAR(100),

  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',

  tokens_used INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_messages_execution ON messages(execution_id);

-- Approvals Table
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  action VARCHAR(50) NOT NULL,
  -- 'send-email', 'send-payment', 'delete-file', 'execute-code', 'post-social', 'sign-document', 'make-purchase', 'deploy-app'

  description TEXT NOT NULL,
  details JSONB NOT NULL,

  risk_level VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'

  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'

  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes'
);

CREATE INDEX idx_approvals_execution ON approvals(execution_id);
CREATE INDEX idx_approvals_status ON approvals(status, expires_at);
```

### 2.3 Audit & Security Tables

```sql
-- Audit Log Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,

  details JSONB DEFAULT '{}',

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_company ON audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

-- API Keys Table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL, -- Hashed API key
  key_prefix VARCHAR(8) NOT NULL, -- First 8 chars for identification

  scopes TEXT[] DEFAULT '{}', -- 'read', 'write', 'admin', 'agents', 'executions'

  rate_limit INTEGER DEFAULT 1000, -- Requests per minute

  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_company ON api_keys(company_id);

-- Refresh Tokens Table
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  token_hash VARCHAR(255) NOT NULL,

  device_info JSONB DEFAULT '{}',
  ip_address INET,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

---

## 3. API Design

### 3.1 RESTful Endpoints

```yaml
# Authentication
POST   /api/v1/auth/signup              # Create new account
POST   /api/v1/auth/login               # Login with email/password
POST   /api/v1/auth/logout              # Logout (revoke tokens)
POST   /api/v1/auth/refresh             # Refresh access token
POST   /api/v1/auth/forgot-password     # Request password reset
POST   /api/v1/auth/reset-password      # Reset password with token
GET    /api/v1/auth/me                  # Get current user
PATCH  /api/v1/auth/me                  # Update current user

# OAuth
GET    /api/v1/auth/oauth/google        # Initiate Google OAuth
GET    /api/v1/auth/oauth/google/callback
GET    /api/v1/auth/oauth/github        # Initiate GitHub OAuth
GET    /api/v1/auth/oauth/github/callback

# Users (Admin)
GET    /api/v1/users                    # List users (admin)
GET    /api/v1/users/:id                # Get user by ID
PATCH  /api/v1/users/:id                # Update user
DELETE /api/v1/users/:id                # Delete user

# Companies
GET    /api/v1/companies                # List user's companies
POST   /api/v1/companies                # Create company
GET    /api/v1/companies/:id            # Get company
PATCH  /api/v1/companies/:id            # Update company
DELETE /api/v1/companies/:id            # Delete company

# Agents
GET    /api/v1/companies/:companyId/agents          # List agents
POST   /api/v1/companies/:companyId/agents          # Create agent
GET    /api/v1/companies/:companyId/agents/:id      # Get agent
PATCH  /api/v1/companies/:companyId/agents/:id      # Update agent
DELETE /api/v1/companies/:companyId/agents/:id      # Delete agent
POST   /api/v1/companies/:companyId/agents/:id/execute  # Execute agent task

# Executions
GET    /api/v1/executions               # List executions (with filters)
POST   /api/v1/executions               # Create execution
GET    /api/v1/executions/:id           # Get execution details
PATCH  /api/v1/executions/:id           # Update execution
DELETE /api/v1/executions/:id           # Cancel execution
GET    /api/v1/executions/:id/events    # Get execution events
POST   /api/v1/executions/:id/pause     # Pause execution
POST   /api/v1/executions/:id/resume    # Resume execution
POST   /api/v1/executions/:id/stop      # Stop execution

# Chat (Primary Interface)
POST   /api/v1/chat                     # Send message (non-streaming)
POST   /api/v1/chat/stream              # Send message (SSE streaming)
GET    /api/v1/chat/sessions            # List chat sessions
GET    /api/v1/chat/sessions/:id        # Get session with messages
DELETE /api/v1/chat/sessions/:id        # Delete session

# Approvals
GET    /api/v1/approvals                # List pending approvals
POST   /api/v1/approvals/:id/approve    # Approve action
POST   /api/v1/approvals/:id/reject     # Reject action

# Assets
GET    /api/v1/assets                   # List assets
POST   /api/v1/assets/upload            # Upload asset
GET    /api/v1/assets/:id               # Get asset metadata
GET    /api/v1/assets/:id/download      # Download asset
DELETE /api/v1/assets/:id               # Delete asset

# Integrations
GET    /api/v1/integrations             # List integrations
POST   /api/v1/integrations             # Create integration
GET    /api/v1/integrations/:id         # Get integration
PATCH  /api/v1/integrations/:id         # Update integration
DELETE /api/v1/integrations/:id         # Delete integration
POST   /api/v1/integrations/:id/test    # Test integration
POST   /api/v1/integrations/:id/sync    # Trigger sync

# Metrics & Analytics
GET    /api/v1/metrics                  # Get metrics (time-series)
GET    /api/v1/metrics/summary          # Get summary dashboard
GET    /api/v1/metrics/agents           # Agent performance metrics

# Feedback
POST   /api/v1/feedback                 # Submit feedback
GET    /api/v1/feedback                 # List feedback (admin)

# Health & System
GET    /api/v1/health                   # Health check
GET    /api/v1/health/detailed          # Detailed health status
GET    /api/v1/system/status            # System status
```

### 3.2 WebSocket Event Handlers

```typescript
// Connection Events
interface WSConnection {
  event: 'connection';
  handler: (socket: WebSocket, request: Request) => void;
  authentication: 'jwt' | 'api-key';
  queryParams: {
    sessionId?: string;
    companyId?: string;
  };
}

// Client -> Server Messages
type ClientMessage =
  | { type: 'chat'; content: string; sessionId: string; attachments?: Attachment[] }
  | { type: 'approve'; approvalId: string; approved: boolean; reason?: string }
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'ping' }
  | { type: 'execution:pause'; executionId: string }
  | { type: 'execution:resume'; executionId: string }
  | { type: 'execution:stop'; executionId: string };

// Server -> Client Messages
type ServerMessage =
  | { event: 'connected'; data: { sessionId: string; agents: AgentInfo[] } }
  | { event: 'chat:response'; data: Message }
  | { event: 'chat:stream'; data: { chunk: string; messageId: string } }
  | { event: 'chat:stream:end'; data: { messageId: string } }
  | { event: 'agent:started'; data: { agentId: string; taskId: string } }
  | { event: 'agent:progress'; data: { agentId: string; progress: number; message: string } }
  | { event: 'agent:completed'; data: { agentId: string; taskId: string; result: unknown } }
  | { event: 'agent:error'; data: { agentId: string; taskId: string; error: string } }
  | { event: 'approval:requested'; data: ApprovalRequest }
  | { event: 'approval:resolved'; data: { approvalId: string; approved: boolean } }
  | { event: 'execution:updated'; data: ExecutionUpdate }
  | { event: 'error'; data: { code: string; message: string } }
  | { event: 'pong'; timestamp: number };

// Channel Subscriptions
type Channel =
  | `company:${string}`      // All company events
  | `agent:${string}`        // Specific agent events
  | `execution:${string}`    // Specific execution events
  | `session:${string}`;     // Chat session events
```

### 3.3 Authentication Flow

```typescript
// JWT Token Structure
interface AccessToken {
  userId: string;
  email: string;
  role: 'user' | 'admin' | 'super_admin';
  companyIds: string[];
  type: 'access';
  iat: number;
  exp: number; // 15 minutes
  iss: 'alabobai';
  aud: 'alabobai-api';
}

interface RefreshToken {
  userId: string;
  type: 'refresh';
  jti: string; // Unique token ID for revocation
  iat: number;
  exp: number; // 7 days (30 days if "remember me")
}

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Authentication required' }
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: 'alabobai',
      audience: 'alabobai-api'
    });

    req.user = payload;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token expired' }
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    });
  }
};

// API Key Authentication (for programmatic access)
const apiKeyMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) return next(); // Fall through to JWT auth

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyRecord = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash)
  });

  if (!keyRecord || keyRecord.revokedAt) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'Invalid API key' }
    });
  }

  // Check rate limit
  const rateLimitKey = `rate:${keyRecord.id}`;
  const requests = await redis.incr(rateLimitKey);
  if (requests === 1) await redis.expire(rateLimitKey, 60);

  if (requests > keyRecord.rateLimit) {
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' }
    });
  }

  req.user = { userId: keyRecord.userId, companyId: keyRecord.companyId };
  req.apiKey = keyRecord;
  next();
};
```

### 3.4 Rate Limiting Strategy

```typescript
// Rate Limiting Configuration
interface RateLimitConfig {
  // By endpoint category
  tiers: {
    free: {
      chat: { requests: 20, window: '1m' };
      api: { requests: 60, window: '1m' };
      executions: { requests: 10, window: '1h' };
    };
    pro: {
      chat: { requests: 100, window: '1m' };
      api: { requests: 300, window: '1m' };
      executions: { requests: 100, window: '1h' };
    };
    enterprise: {
      chat: { requests: 1000, window: '1m' };
      api: { requests: 3000, window: '1m' };
      executions: { requests: 1000, window: '1h' };
    };
  };

  // Special limits
  special: {
    '/api/v1/auth/login': { requests: 5, window: '15m' };
    '/api/v1/auth/forgot-password': { requests: 3, window: '1h' };
    '/api/v1/assets/upload': { requests: 10, window: '1h' };
  };

  // Response headers
  headers: {
    'X-RateLimit-Limit': string;
    'X-RateLimit-Remaining': string;
    'X-RateLimit-Reset': string;
    'Retry-After': string; // Only on 429
  };
}

// Redis-based rate limiter implementation
const rateLimiter = async (req, res, next) => {
  const key = `rate:${req.user?.userId || req.ip}:${req.path}`;
  const limit = getLimit(req.user?.subscriptionTier, req.path);

  const multi = redis.multi();
  multi.incr(key);
  multi.expire(key, limit.windowSeconds);
  const [count] = await multi.exec();

  res.set({
    'X-RateLimit-Limit': limit.requests.toString(),
    'X-RateLimit-Remaining': Math.max(0, limit.requests - count).toString(),
    'X-RateLimit-Reset': (Date.now() + limit.windowSeconds * 1000).toString()
  });

  if (count > limit.requests) {
    res.set('Retry-After', limit.windowSeconds.toString());
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${limit.windowSeconds} seconds.`
      }
    });
  }

  next();
};
```

### 3.5 Error Response Format

```typescript
// Standard Error Response
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: unknown;      // Additional context
    field?: string;         // For validation errors
    requestId?: string;     // For debugging
  };
  timestamp: string;
}

// Error Codes
const ERROR_CODES = {
  // Authentication (401)
  'MISSING_TOKEN': 'Authentication token is required',
  'INVALID_TOKEN': 'Invalid authentication token',
  'TOKEN_EXPIRED': 'Authentication token has expired',
  'INVALID_CREDENTIALS': 'Invalid email or password',

  // Authorization (403)
  'FORBIDDEN': 'You do not have permission to perform this action',
  'INSUFFICIENT_PERMISSIONS': 'Insufficient permissions for this resource',

  // Not Found (404)
  'NOT_FOUND': 'Resource not found',
  'USER_NOT_FOUND': 'User not found',
  'COMPANY_NOT_FOUND': 'Company not found',

  // Validation (400)
  'VALIDATION_ERROR': 'Request validation failed',
  'INVALID_INPUT': 'Invalid input provided',
  'MISSING_REQUIRED_FIELD': 'Required field is missing',

  // Rate Limiting (429)
  'RATE_LIMIT_EXCEEDED': 'Too many requests',

  // Server Errors (500)
  'INTERNAL_ERROR': 'An internal error occurred',
  'SERVICE_UNAVAILABLE': 'Service temporarily unavailable',
} as const;

// Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuid();

  // Log error
  logger.error({
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.userId
  });

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Don't leak internal errors in production
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'An internal error occurred'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      details: err.details,
      requestId
    },
    timestamp: new Date().toISOString()
  });
};
```

---

## 4. Agent Runtime

### 4.1 Agent Instantiation

```typescript
// Agent Factory Pattern
interface AgentFactory {
  create(type: AgentType, config: AgentConfig): Agent;
  spawn(definition: AgentDefinition): RunningAgent;
  destroy(agentId: string): Promise<void>;
}

// Agent Instantiation Flow
class AgentRuntime {
  private pool: Map<string, RunningAgent> = new Map();
  private maxPoolSize: number = 20;

  async instantiate(
    type: AgentType,
    context: ExecutionContext
  ): Promise<RunningAgent> {
    // 1. Check pool for idle agent of this type
    const pooled = this.findIdleAgent(type);
    if (pooled) {
      pooled.assign(context);
      return pooled;
    }

    // 2. Check pool capacity
    if (this.pool.size >= this.maxPoolSize) {
      // Evict least recently used idle agent
      await this.evictLRU();
    }

    // 3. Create new agent instance
    const definition = agentRegistry.get(type);
    const agent = new RunningAgent({
      id: uuid(),
      definition,
      llm: await this.getLLMClient(context),
      memory: await this.getMemoryStore(context),
      sandbox: context.enableSandbox ? await this.getSandbox() : null,
      browser: context.enableBrowser ? await this.getBrowser() : null,
    });

    // 4. Initialize agent
    await agent.initialize();

    // 5. Add to pool
    this.pool.set(agent.id, agent);

    // 6. Assign context
    agent.assign(context);

    return agent;
  }

  private async getLLMClient(context: ExecutionContext): Promise<LLMClient> {
    // Route to appropriate LLM based on task complexity
    const complexity = analyzeComplexity(context.task);

    if (complexity === 'high') {
      return createLLMClient({ model: 'claude-opus-4-20250514' });
    } else if (complexity === 'medium') {
      return createLLMClient({ model: 'claude-sonnet-4-20250514' });
    } else {
      return createLLMClient({ model: 'claude-3-5-haiku-20241022' });
    }
  }
}
```

### 4.2 Memory/Context Management

```typescript
// Context Window Management
interface ContextManager {
  maxTokens: number;           // Model's max context
  reservedForOutput: number;   // Reserve for response
  systemPromptTokens: number;  // Fixed system prompt

  // Available for conversation
  availableTokens: number;
}

class ConversationContext {
  private messages: Message[] = [];
  private tokenCounts: Map<string, number> = new Map();
  private maxContextTokens: number = 180000; // Claude's 200k - buffer

  async addMessage(message: Message): Promise<void> {
    const tokens = await countTokens(message.content);
    this.tokenCounts.set(message.id, tokens);
    this.messages.push(message);

    // Prune if over limit
    await this.pruneIfNeeded();
  }

  private async pruneIfNeeded(): Promise<void> {
    let totalTokens = this.getTotalTokens();

    while (totalTokens > this.maxContextTokens && this.messages.length > 2) {
      // Keep system message and last user message
      const toRemove = this.messages[1]; // Second oldest

      // Summarize before removing if important
      if (toRemove.role === 'assistant' && toRemove.content.length > 500) {
        const summary = await this.summarize(toRemove);
        toRemove.content = `[Summary] ${summary}`;
        this.tokenCounts.set(toRemove.id, await countTokens(toRemove.content));
      } else {
        this.messages.splice(1, 1);
        this.tokenCounts.delete(toRemove.id);
      }

      totalTokens = this.getTotalTokens();
    }
  }

  // Memory hierarchy
  shortTermMemory: Map<string, unknown>;     // Current session
  workingMemory: Map<string, unknown>;       // Current task
  longTermMemory: MemoryStore;               // Persistent storage

  async recall(query: string, limit: number = 5): Promise<MemoryEntry[]> {
    // 1. Check working memory
    const workingHits = this.searchWorkingMemory(query);
    if (workingHits.length >= limit) return workingHits.slice(0, limit);

    // 2. Check short-term memory
    const shortTermHits = this.searchShortTermMemory(query);
    const combined = [...workingHits, ...shortTermHits];
    if (combined.length >= limit) return combined.slice(0, limit);

    // 3. Query long-term memory (semantic search)
    const longTermHits = await this.longTermMemory.recall(
      this.sessionId,
      query,
      limit - combined.length
    );

    return [...combined, ...longTermHits];
  }
}
```

### 4.3 Tool Execution Sandboxing

```typescript
// Sandbox Execution Environment
interface SandboxConfig {
  runtime: 'docker' | 'vm' | 'wasm';

  // Resource limits
  memory: {
    max: '2GB';
    swap: '0';
  };
  cpu: {
    shares: 1024;
    quota: 100000;  // microseconds per period
    period: 100000;
  };

  // Network
  network: {
    enabled: boolean;
    allowedHosts?: string[];
    blockedPorts?: number[];
  };

  // Filesystem
  filesystem: {
    readOnly: boolean;
    workDir: '/workspace';
    mounts: Mount[];
  };

  // Time limits
  timeout: number; // milliseconds
}

class SecureSandbox {
  private container: Docker.Container | null = null;

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // 1. Create isolated container
      this.container = await docker.createContainer({
        Image: `alabobai/sandbox:${request.language}`,
        HostConfig: {
          Memory: 2 * 1024 * 1024 * 1024, // 2GB
          MemorySwap: 2 * 1024 * 1024 * 1024,
          CpuShares: 1024,
          NetworkMode: request.networkEnabled ? 'bridge' : 'none',
          ReadonlyRootfs: true,
          SecurityOpt: ['no-new-privileges'],
          CapDrop: ['ALL'],
        },
        Env: this.sanitizeEnv(request.env),
        WorkingDir: '/workspace',
      });

      // 2. Copy files into container
      if (request.files) {
        await this.copyFiles(request.files);
      }

      // 3. Start container
      await this.container.start();

      // 4. Execute with timeout
      const result = await Promise.race([
        this.runCommand(request.code, request.language),
        this.timeout(request.timeout || 300000)
      ]);

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime: Date.now() - startTime,
        files: await this.extractOutputFiles()
      };

    } finally {
      // 5. Cleanup
      await this.cleanup();
    }
  }

  private sanitizeEnv(env?: Record<string, string>): string[] {
    const blocked = ['AWS_', 'ANTHROPIC_', 'OPENAI_', 'DATABASE_'];
    return Object.entries(env || {})
      .filter(([key]) => !blocked.some(prefix => key.startsWith(prefix)))
      .map(([key, value]) => `${key}=${value}`);
  }
}
```

### 4.4 Parallel Execution Coordination

```typescript
// Parallel Execution Manager
class ParallelExecutor {
  private maxConcurrent: number = 5;
  private running: Map<string, Promise<unknown>> = new Map();
  private queue: ExecutionRequest[] = [];

  async executeParallel(
    tasks: ExecutionRequest[],
    options: ParallelOptions = {}
  ): Promise<ExecutionResult[]> {
    const {
      maxConcurrent = this.maxConcurrent,
      failFast = false,
      timeout = 600000
    } = options;

    const results: ExecutionResult[] = [];
    const errors: Error[] = [];

    // Create execution promises
    const executors = tasks.map((task, index) => async () => {
      try {
        const result = await this.executeWithRetry(task);
        results[index] = result;
        return result;
      } catch (error) {
        errors.push(error as Error);
        if (failFast) throw error;
        results[index] = { success: false, error: (error as Error).message };
        return results[index];
      }
    });

    // Execute with concurrency limit
    await pLimit(maxConcurrent)(executors);

    return results;
  }

  // Coordination primitives
  async coordinate(
    mainTask: Task,
    subtasks: SubTask[]
  ): Promise<CoordinationResult> {
    const plan = await this.createExecutionPlan(mainTask, subtasks);

    // Execute phases
    for (const phase of plan.phases) {
      // Parallel execution within phase
      const phaseResults = await this.executeParallel(phase.tasks, {
        maxConcurrent: phase.concurrency
      });

      // Check phase success
      if (!this.phaseSucceeded(phaseResults, phase.successThreshold)) {
        return {
          success: false,
          completedPhases: plan.phases.indexOf(phase),
          error: 'Phase failed to meet success threshold'
        };
      }

      // Pass results to next phase
      this.injectResults(plan.phases[plan.phases.indexOf(phase) + 1], phaseResults);
    }

    return { success: true, results: this.aggregateResults(plan) };
  }
}

// Agent Collaboration Protocol
interface CollaborationProtocol {
  // Request collaboration from another agent
  requestCollaboration(
    fromAgent: string,
    toAgentType: AgentType,
    subtask: Partial<Task>
  ): Promise<CollaborationResult>;

  // Hand off task to another agent
  handoff(
    fromAgent: string,
    toAgentType: AgentType,
    task: Task,
    context: HandoffContext
  ): Promise<void>;

  // Broadcast message to all agents
  broadcast(
    fromAgent: string,
    message: BroadcastMessage
  ): void;
}
```

### 4.5 State Persistence

```typescript
// Checkpoint System
interface CheckpointState {
  // Session state
  sessionId: string;
  userId: string;
  timestamp: Date;

  // Conversation state
  conversation: {
    messages: Message[];
    context: Record<string, unknown>;
  };

  // Execution state
  execution: {
    currentTask: Task | null;
    completedTasks: string[];
    pendingTasks: string[];
    results: Map<string, unknown>;
  };

  // Agent states
  agents: Array<{
    id: string;
    type: AgentType;
    status: AgentStatus;
    workingMemory: Record<string, unknown>;
  }>;

  // Memory state
  memory: {
    shortTerm: Record<string, unknown>;
    longTerm: MemoryReference[];
  };
}

class CheckpointManager {
  private storage: CheckpointStorage;
  private autoSaveInterval: number = 30000; // 30 seconds
  private maxCheckpoints: number = 50;

  async createCheckpoint(
    sessionId: string,
    state: CheckpointState,
    type: 'auto' | 'manual' | 'milestone',
    label?: string
  ): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: uuid(),
      sessionId,
      type,
      label,
      state: await this.serializeState(state),
      timestamp: new Date(),
      sizeBytes: 0 // Updated after serialization
    };

    // Store checkpoint
    await this.storage.save(checkpoint);

    // Prune old checkpoints
    await this.pruneOldCheckpoints(sessionId);

    this.emit('checkpoint-created', checkpoint);
    return checkpoint;
  }

  async restore(checkpointId: string): Promise<CheckpointState> {
    const checkpoint = await this.storage.load(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    return this.deserializeState(checkpoint.state);
  }

  // Incremental checkpointing (only store diff)
  async createIncrementalCheckpoint(
    sessionId: string,
    currentState: CheckpointState
  ): Promise<Checkpoint> {
    const lastCheckpoint = await this.getLatestCheckpoint(sessionId);

    if (!lastCheckpoint) {
      return this.createCheckpoint(sessionId, currentState, 'auto');
    }

    const diff = this.computeDiff(lastCheckpoint.state, currentState);

    return this.createCheckpoint(
      sessionId,
      { ...diff, baseCheckpointId: lastCheckpoint.id } as any,
      'auto'
    );
  }
}
```

---

## 5. Deployment Architecture

### 5.1 Production Environment

```yaml
# Primary: Vercel + Railway + Cloudflare
# Alternative: AWS ECS/EKS

Architecture Overview:
┌─────────────────────────────────────────────────────────────────┐
│                         Cloudflare                               │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │    CDN    │  │    WAF    │  │   DDoS    │  │   DNS     │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Vercel                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Next.js Frontend (Edge)                     │    │
│  │  - SSR/SSG pages                                        │    │
│  │  - API routes (lightweight)                             │    │
│  │  - Edge functions                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Railway                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │   API Server  │  │ Agent Workers │  │  Job Workers  │       │
│  │   (Express)   │  │   (Node.js)   │  │   (BullMQ)    │       │
│  │               │  │               │  │               │       │
│  │ - REST API    │  │ - Execution   │  │ - Background  │       │
│  │ - WebSocket   │  │ - Sandboxing  │  │ - Scheduled   │       │
│  │ - Auth        │  │ - Browser     │  │ - Analytics   │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │   Neon/Supabase│  │    Upstash    │  │ Cloudflare R2 │       │
│  │   PostgreSQL   │  │     Redis     │  │   (Storage)   │       │
│  │               │  │               │  │               │       │
│  │ - Primary DB  │  │ - Cache       │  │ - Assets      │       │
│  │ - Replicas    │  │ - Sessions    │  │ - Checkpoints │       │
│  │ - Backups     │  │ - Queues      │  │ - Exports     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Infrastructure Configuration

```typescript
// Environment Configuration
interface EnvironmentConfig {
  production: {
    // Compute
    frontend: {
      provider: 'vercel';
      regions: ['iad1', 'sfo1', 'cdg1']; // US East, West, EU
      minInstances: 1;
      maxInstances: 100;
    };

    backend: {
      provider: 'railway';
      services: {
        api: {
          replicas: 3;
          memory: '2GB';
          cpu: 2;
          healthCheck: '/api/v1/health';
        };
        workers: {
          replicas: 5;
          memory: '4GB';
          cpu: 4;
          autoscaling: {
            metric: 'queue_depth';
            target: 10;
            minReplicas: 2;
            maxReplicas: 20;
          };
        };
      };
    };

    // Data
    database: {
      provider: 'neon'; // or 'supabase'
      tier: 'scale';
      storage: '100GB';
      connections: 1000;
      readReplicas: 2;
    };

    redis: {
      provider: 'upstash';
      tier: 'pro';
      maxMemory: '10GB';
      evictionPolicy: 'volatile-lru';
    };

    storage: {
      provider: 'cloudflare-r2';
      buckets: ['assets', 'checkpoints', 'exports'];
    };
  };

  staging: {
    // Reduced resources for staging
    // ...
  };
}
```

### 5.3 Docker Configuration

```dockerfile
# Dockerfile.api
FROM node:20-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Build
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 alabobai

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

USER alabobai
EXPOSE 8888

CMD ["node", "dist/index.js"]

# Dockerfile.sandbox
FROM python:3.11-slim AS python-sandbox
RUN pip install --no-cache-dir numpy pandas requests beautifulsoup4

FROM node:20-alpine AS node-sandbox
RUN npm install -g typescript ts-node

FROM ubuntu:22.04 AS sandbox
RUN apt-get update && apt-get install -y \
    python3 python3-pip nodejs npm \
    curl wget git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python-sandbox /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=node-sandbox /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN useradd -m -s /bin/bash sandbox
USER sandbox
WORKDIR /workspace

CMD ["/bin/bash"]
```

### 5.4 Domain Configuration

```typescript
// DNS Configuration (Cloudflare)
const dnsConfig = {
  zones: {
    'alabobai.com': {
      records: [
        { type: 'A', name: '@', content: 'vercel-ip', proxied: true },
        { type: 'CNAME', name: 'www', content: 'alabobai.com', proxied: true },
        { type: 'CNAME', name: 'api', content: 'api.railway.app', proxied: true },
        { type: 'CNAME', name: 'ws', content: 'ws.railway.app', proxied: true },
        { type: 'CNAME', name: 'cdn', content: 'cdn.cloudflare.com', proxied: true },
        { type: 'CNAME', name: 'assets', content: 'r2.cloudflare.com', proxied: true },
        { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.google.com ~all' },
      ],
      ssl: {
        mode: 'full_strict',
        minVersion: '1.2',
        cipherSuites: 'ECDHE-RSA-AES128-GCM-SHA256',
      },
    },
  },
};
```

---

## 6. Security Model

### 6.1 Authentication

```typescript
// JWT Configuration
const jwtConfig = {
  accessToken: {
    secret: process.env.JWT_SECRET,
    algorithm: 'HS256',
    expiresIn: '15m',
    issuer: 'alabobai',
    audience: 'alabobai-api',
  },

  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET,
    algorithm: 'HS256',
    expiresIn: '7d', // 30d with "remember me"
  },

  // Token rotation
  rotation: {
    enabled: true,
    maxAge: '24h',
    gracePeriod: '5m',
  },
};

// Session Management
interface SessionConfig {
  // Redis-backed sessions
  store: 'redis';
  prefix: 'sess:';
  ttl: 86400; // 24 hours

  // Concurrent sessions
  maxConcurrentSessions: 5;

  // Device tracking
  trackDevices: true;

  // Session invalidation
  invalidateOnPasswordChange: true;
  invalidateOnRoleChange: true;
}
```

### 6.2 Authorization (RBAC)

```typescript
// Role-Based Access Control
interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[]; // Role inheritance
}

const ROLES: Record<string, Role> = {
  user: {
    name: 'user',
    permissions: [
      'read:own_profile',
      'update:own_profile',
      'read:own_companies',
      'create:companies',
      'read:own_agents',
      'execute:own_agents',
      'read:own_executions',
      'create:feedback',
    ],
  },

  company_admin: {
    name: 'company_admin',
    inherits: ['user'],
    permissions: [
      'manage:company_members',
      'manage:company_settings',
      'manage:company_agents',
      'manage:company_integrations',
      'read:company_metrics',
      'delete:company',
    ],
  },

  admin: {
    name: 'admin',
    inherits: ['company_admin'],
    permissions: [
      'read:all_users',
      'manage:users',
      'read:all_companies',
      'read:system_metrics',
      'manage:system_settings',
    ],
  },

  super_admin: {
    name: 'super_admin',
    permissions: ['*'], // All permissions
  },
};

// Authorization Middleware
const authorize = (...requiredPermissions: Permission[]) => {
  return async (req, res, next) => {
    const userRole = req.user.role;
    const userPermissions = expandPermissions(ROLES[userRole]);

    const hasPermission = requiredPermissions.every(
      perm => userPermissions.includes(perm) || userPermissions.includes('*')
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
};
```

### 6.3 API Key Management

```typescript
// API Key Generation
class APIKeyManager {
  private readonly PREFIX = 'alb_';
  private readonly KEY_LENGTH = 32;

  async generate(userId: string, companyId: string, options: APIKeyOptions): Promise<{
    key: string;
    keyPrefix: string;
    keyRecord: APIKeyRecord;
  }> {
    // Generate cryptographically secure key
    const rawKey = crypto.randomBytes(this.KEY_LENGTH).toString('base64url');
    const fullKey = `${this.PREFIX}${rawKey}`;

    // Hash for storage
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    const keyPrefix = fullKey.substring(0, 8);

    // Store in database
    const keyRecord = await db.insert(apiKeys).values({
      userId,
      companyId,
      name: options.name,
      keyHash,
      keyPrefix,
      scopes: options.scopes,
      rateLimit: options.rateLimit || 1000,
      expiresAt: options.expiresAt,
    }).returning();

    // Return full key only once - it won't be retrievable later
    return {
      key: fullKey,
      keyPrefix,
      keyRecord: keyRecord[0],
    };
  }

  async revoke(keyId: string): Promise<void> {
    await db.update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, keyId));
  }
}
```

### 6.4 Secrets Storage

```typescript
// Secrets Management
interface SecretsConfig {
  // Primary: Environment variables (for platform secrets)
  // Secondary: Encrypted database storage (for user secrets)

  encryption: {
    algorithm: 'aes-256-gcm';
    keyDerivation: 'argon2id';
    masterKeySource: 'env'; // JWT_SECRET used to derive
  };

  // Per-tenant encryption keys
  tenantKeys: {
    rotationInterval: '90d';
    keyVersioning: true;
  };
}

class SecretsManager {
  private masterKey: Buffer;

  constructor() {
    this.masterKey = this.deriveMasterKey(process.env.ENCRYPTION_SECRET!);
  }

  async encrypt(data: string, tenantId: string): Promise<EncryptedData> {
    const tenantKey = await this.getTenantKey(tenantId);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', tenantKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyVersion: await this.getCurrentKeyVersion(tenantId),
    };
  }

  async decrypt(data: EncryptedData, tenantId: string): Promise<string> {
    const tenantKey = await this.getTenantKey(tenantId, data.keyVersion);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      tenantKey,
      Buffer.from(data.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

### 6.5 Data Encryption

```typescript
// Encryption Strategy
interface EncryptionStrategy {
  // At-rest encryption
  atRest: {
    database: 'transparent'; // PostgreSQL TDE or provider encryption
    storage: 'server-side'; // R2/S3 server-side encryption
    backups: 'encrypted'; // Encrypted backups
  };

  // In-transit encryption
  inTransit: {
    tls: '1.3';
    certificateProvider: 'cloudflare';
    hsts: true;
    hstsMaxAge: 31536000;
  };

  // Field-level encryption (for sensitive data)
  fieldLevel: {
    fields: [
      'users.password_hash',
      'integrations.credentials_encrypted',
      'integrations.access_token_encrypted',
      'api_keys.key_hash',
    ];
    algorithm: 'aes-256-gcm';
  };
}
```

### 6.6 Audit Logging

```typescript
// Audit Log Configuration
interface AuditConfig {
  // What to log
  events: [
    'auth.login',
    'auth.logout',
    'auth.failed_login',
    'user.created',
    'user.updated',
    'user.deleted',
    'company.created',
    'company.updated',
    'agent.executed',
    'execution.approved',
    'execution.rejected',
    'integration.connected',
    'api_key.created',
    'api_key.revoked',
    'settings.changed',
  ];

  // Retention
  retention: {
    default: '1y';
    security: '7y';
    compliance: '7y';
  };

  // Export
  export: {
    format: 'json';
    destination: 's3'; // For compliance
  };
}

// Audit Logger
class AuditLogger {
  async log(event: AuditEvent): Promise<void> {
    const entry: AuditLogEntry = {
      id: uuid(),
      timestamp: new Date(),
      event: event.type,
      userId: event.userId,
      companyId: event.companyId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      action: event.action,
      details: this.sanitize(event.details),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      success: event.success,
    };

    // Write to database
    await db.insert(auditLogs).values(entry);

    // High-severity events: send to SIEM
    if (this.isHighSeverity(event)) {
      await this.sendToSIEM(entry);
    }

    // Compliance events: write to immutable log
    if (this.isComplianceEvent(event)) {
      await this.writeToComplianceLog(entry);
    }
  }

  private sanitize(details: unknown): unknown {
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
    return this.redact(details, sensitiveFields);
  }
}
```

---

## 7. Scalability Considerations

### 7.1 Horizontal Scaling Points

```typescript
// Scaling Configuration
interface ScalingConfig {
  // API Servers (stateless)
  api: {
    autoscaling: true;
    minInstances: 2;
    maxInstances: 50;
    targetCPU: 70;
    targetMemory: 80;
    scaleUpCooldown: '60s';
    scaleDownCooldown: '300s';
  };

  // Agent Workers (stateless with affinity)
  workers: {
    autoscaling: true;
    minInstances: 3;
    maxInstances: 100;
    metrics: [
      { type: 'queue_depth', target: 5 },
      { type: 'cpu', target: 70 },
    ];
    // Prefer keeping long-running agents on same node
    podAffinity: {
      preferredDuringScheduling: true;
      key: 'execution_id';
    };
  };

  // WebSocket Servers (sticky sessions)
  websocket: {
    autoscaling: true;
    minInstances: 2;
    maxInstances: 20;
    connectionLimit: 10000; // per instance
    stickySession: {
      enabled: true;
      cookieName: 'ALABOBAI_WS';
      ttl: '1h';
    };
  };
}
```

### 7.2 Database Scaling Strategy

```typescript
// Database Scaling
interface DatabaseScaling {
  // Vertical scaling first
  vertical: {
    currentTier: 'scale';
    maxConnections: 1000;
    sharedBuffers: '4GB';
    effectiveCacheSize: '12GB';
  };

  // Read replicas for read scaling
  readReplicas: {
    count: 2;
    regions: ['us-east', 'eu-west'];
    loadBalancing: 'round-robin';
    lagThreshold: '100ms';
  };

  // Connection pooling
  connectionPool: {
    provider: 'pgbouncer';
    poolMode: 'transaction';
    maxClientConn: 10000;
    defaultPoolSize: 25;
  };

  // Query optimization
  optimization: {
    preparedStatements: true;
    queryCache: true;
    partitioning: {
      tables: ['metrics', 'audit_logs', 'executions'],
      strategy: 'time_based', // Monthly partitions
    };
  };

  // Future: Sharding strategy
  sharding: {
    enabled: false;
    strategy: 'tenant_based';
    shardKey: 'company_id';
    shardCount: 16;
  };
}
```

### 7.3 WebSocket Scaling

```typescript
// WebSocket Scaling with Redis Pub/Sub
class ScalableWebSocketServer {
  private redis: Redis;
  private pubClient: Redis;
  private subClient: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.pubClient = this.redis.duplicate();
    this.subClient = this.redis.duplicate();

    this.setupPubSub();
  }

  private setupPubSub(): void {
    // Subscribe to all channels
    this.subClient.psubscribe('ws:*');

    this.subClient.on('pmessage', (pattern, channel, message) => {
      const [, type, id] = channel.split(':');
      this.handleRemoteMessage(type, id, JSON.parse(message));
    });
  }

  async broadcast(channel: string, message: unknown): Promise<void> {
    // Publish to Redis - all instances receive
    await this.pubClient.publish(`ws:${channel}`, JSON.stringify(message));
  }

  async sendToSession(sessionId: string, message: unknown): Promise<void> {
    // Find which instance owns this session
    const instanceId = await this.redis.get(`session:${sessionId}:instance`);

    if (instanceId === this.instanceId) {
      // Local - send directly
      this.localSend(sessionId, message);
    } else {
      // Remote - publish to that instance's channel
      await this.pubClient.publish(
        `ws:instance:${instanceId}`,
        JSON.stringify({ sessionId, message })
      );
    }
  }

  // Connection tracking
  async registerConnection(sessionId: string, ws: WebSocket): Promise<void> {
    await this.redis.setex(
      `session:${sessionId}:instance`,
      3600, // 1 hour TTL
      this.instanceId
    );

    // Track connection count per instance for load balancing
    await this.redis.hincrby('ws:connections', this.instanceId, 1);
  }
}
```

### 7.4 Queue Scaling

```typescript
// Queue Scaling Configuration
interface QueueScaling {
  // BullMQ with Redis Cluster
  redis: {
    mode: 'cluster';
    nodes: [
      { host: 'redis-1', port: 6379 },
      { host: 'redis-2', port: 6379 },
      { host: 'redis-3', port: 6379 },
    ];
  };

  // Queue partitioning
  partitioning: {
    strategy: 'by_priority';
    partitions: {
      high: { concurrency: 20, workers: 5 };
      normal: { concurrency: 50, workers: 10 };
      low: { concurrency: 100, workers: 3 };
    };
  };

  // Worker scaling
  workers: {
    autoscaling: {
      enabled: true;
      minWorkers: 3;
      maxWorkers: 50;

      scaleUpThreshold: {
        queueDepth: 100;
        waitTime: '30s';
      };

      scaleDownThreshold: {
        queueDepth: 10;
        idleTime: '5m';
      };
    };

    // Worker health
    health: {
      stalledInterval: 30000;
      maxStalledCount: 3;
      drainDelay: 5000;
    };
  };
}

// Adaptive Queue Processing
class AdaptiveQueueProcessor {
  private currentConcurrency: number;
  private readonly minConcurrency = 5;
  private readonly maxConcurrency = 100;

  async adjustConcurrency(): Promise<void> {
    const metrics = await this.getQueueMetrics();

    if (metrics.errorRate > 0.1) {
      // High error rate - reduce concurrency
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.currentConcurrency * 0.8)
      );
    } else if (metrics.waitTime > 30000 && metrics.successRate > 0.95) {
      // Long wait, high success - increase concurrency
      this.currentConcurrency = Math.min(
        this.maxConcurrency,
        Math.floor(this.currentConcurrency * 1.2)
      );
    }

    await this.worker.changeConcurrency(this.currentConcurrency);
  }
}
```

### 7.5 Cost Optimization

```typescript
// Cost Optimization Strategies
interface CostOptimization {
  // Compute
  compute: {
    // Spot instances for workers
    spotInstances: {
      enabled: true;
      fallbackToOnDemand: true;
      maxSpotPrice: 0.5; // 50% of on-demand
    };

    // Scheduled scaling
    scheduledScaling: {
      enabled: true;
      schedules: [
        { cron: '0 8 * * 1-5', minInstances: 10 }, // Workday start
        { cron: '0 18 * * 1-5', minInstances: 5 },  // Evening
        { cron: '0 0 * * 0,6', minInstances: 2 },   // Weekend
      ];
    };

    // Right-sizing
    rightSizing: {
      analysisInterval: '7d';
      downsizeThreshold: 0.3; // 30% utilization
    };
  };

  // Storage
  storage: {
    // Lifecycle policies
    lifecycle: {
      checkpoints: { expireAfter: '30d' };
      exports: { expireAfter: '7d' };
      logs: { archiveAfter: '30d', expireAfter: '1y' };
    };

    // Tiered storage
    tiering: {
      hot: { age: '0-7d', class: 'standard' };
      warm: { age: '7-30d', class: 'infrequent_access' };
      cold: { age: '30d+', class: 'glacier' };
    };
  };

  // LLM
  llm: {
    // Model routing by complexity
    modelRouting: {
      simple: 'claude-3-5-haiku-20241022', // $0.25/1M tokens
      medium: 'claude-sonnet-4-20250514',  // $3/1M tokens
      complex: 'claude-opus-4-20250514',    // $15/1M tokens
    };

    // Caching
    caching: {
      enabled: true;
      provider: 'redis';
      ttl: '24h';
      maxSize: '10GB';
    };

    // Rate limiting
    rateLimiting: {
      enabled: true;
      quotas: {
        free: { tokensPerDay: 100000 };
        pro: { tokensPerDay: 1000000 };
        enterprise: { tokensPerDay: 10000000 };
      };
    };
  };
}
```

---

## 8. Monitoring & Observability

### 8.1 Logging Strategy

```typescript
// Structured Logging Configuration
interface LoggingConfig {
  // Log levels by environment
  levels: {
    production: 'info';
    staging: 'debug';
    development: 'debug';
  };

  // Structured format
  format: {
    type: 'json';
    fields: [
      'timestamp',
      'level',
      'message',
      'requestId',
      'userId',
      'companyId',
      'service',
      'duration',
      'error',
    ];
  };

  // Log destinations
  destinations: {
    console: true;
    file: false; // Use stdout for containerized apps
    external: {
      provider: 'datadog' | 'logtail' | 'axiom';
      batchSize: 100;
      flushInterval: 5000;
    };
  };

  // Sensitive data masking
  masking: {
    fields: ['password', 'token', 'apiKey', 'secret', 'authorization'];
    replacement: '[REDACTED]';
  };
}

// Logger Implementation
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['password', 'token', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || uuid();

  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.userId,
  });

  res.on('finish', () => {
    req.log.info({
      statusCode: res.statusCode,
      duration: Date.now() - startTime,
    }, 'Request completed');
  });

  next();
};
```

### 8.2 Metrics Collection

```typescript
// Metrics Configuration
interface MetricsConfig {
  // Prometheus-compatible metrics
  provider: 'prometheus';

  // Collection interval
  scrapeInterval: 15000;

  // Custom metrics
  metrics: {
    // Counters
    counters: [
      'http_requests_total',
      'agent_executions_total',
      'llm_requests_total',
      'errors_total',
      'queue_jobs_processed_total',
    ];

    // Gauges
    gauges: [
      'active_connections',
      'active_executions',
      'queue_depth',
      'memory_usage_bytes',
    ];

    // Histograms
    histograms: [
      { name: 'http_request_duration_seconds', buckets: [0.01, 0.05, 0.1, 0.5, 1, 5] },
      { name: 'agent_execution_duration_seconds', buckets: [1, 5, 10, 30, 60, 300] },
      { name: 'llm_response_time_seconds', buckets: [0.5, 1, 2, 5, 10, 30] },
    ];
  };

  // Labels
  defaultLabels: {
    service: 'alabobai';
    environment: process.env.NODE_ENV;
    version: process.env.VERSION;
  };
}

// Metrics Implementation
import { Registry, Counter, Gauge, Histogram } from 'prom-client';

const registry = new Registry();

// HTTP metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

// Agent metrics
const agentExecutionsTotal = new Counter({
  name: 'agent_executions_total',
  help: 'Total agent executions',
  labelNames: ['agent_type', 'status'],
  registers: [registry],
});

const activeExecutions = new Gauge({
  name: 'active_executions',
  help: 'Currently active executions',
  registers: [registry],
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});
```

### 8.3 Error Tracking

```typescript
// Error Tracking Configuration
interface ErrorTrackingConfig {
  provider: 'sentry';

  // Sentry configuration
  sentry: {
    dsn: process.env.SENTRY_DSN;
    environment: process.env.NODE_ENV;
    release: process.env.VERSION;

    // Sampling
    tracesSampleRate: 0.1; // 10% of transactions
    profilesSampleRate: 0.1;

    // Error filtering
    beforeSend: (event) => {
      // Don't send expected errors
      if (event.exception?.values?.[0]?.type === 'NotFoundError') {
        return null;
      }
      return event;
    };

    // User context
    setUser: (userId, email) => {
      Sentry.setUser({ id: userId, email });
    };

    // Tags
    setTags: {
      service: 'alabobai-api';
    };
  };
}

// Error Tracking Implementation
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.VERSION,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
    new Sentry.Integrations.Postgres(),
  ],
});

// Error handler
const errorTracker = (err, req, res, next) => {
  Sentry.withScope((scope) => {
    scope.setUser({
      id: req.user?.userId,
      email: req.user?.email,
    });
    scope.setTag('path', req.path);
    scope.setContext('request', {
      method: req.method,
      query: req.query,
      headers: req.headers,
    });
    Sentry.captureException(err);
  });

  next(err);
};
```

### 8.4 Performance Monitoring

```typescript
// APM Configuration
interface APMConfig {
  provider: 'datadog' | 'newrelic' | 'opentelemetry';

  // OpenTelemetry (vendor-agnostic)
  opentelemetry: {
    serviceName: 'alabobai';

    // Exporters
    exporters: {
      traces: 'otlp';
      metrics: 'otlp';
      logs: 'otlp';
    };

    // Instrumentation
    instrumentations: [
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-express',
      '@opentelemetry/instrumentation-pg',
      '@opentelemetry/instrumentation-redis',
    ];

    // Sampling
    sampling: {
      type: 'parentbased_traceidratio';
      ratio: 0.1;
    };
  };
}

// OpenTelemetry Setup
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Custom spans
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('alabobai');

async function executeAgent(task) {
  return tracer.startActiveSpan('agent.execute', async (span) => {
    span.setAttributes({
      'agent.type': task.agentType,
      'task.id': task.id,
      'task.priority': task.priority,
    });

    try {
      const result = await doExecute(task);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 8.5 Alerting

```typescript
// Alerting Configuration
interface AlertingConfig {
  // Alert channels
  channels: {
    slack: {
      webhook: process.env.SLACK_WEBHOOK;
      channel: '#alerts';
    };
    pagerduty: {
      routingKey: process.env.PAGERDUTY_KEY;
      severity: 'critical' | 'error' | 'warning' | 'info';
    };
    email: {
      to: ['oncall@alabobai.com'];
      from: 'alerts@alabobai.com';
    };
  };

  // Alert rules
  rules: [
    {
      name: 'High Error Rate';
      condition: 'rate(errors_total[5m]) > 0.05';
      severity: 'critical';
      channels: ['slack', 'pagerduty'];
      cooldown: '15m';
    },
    {
      name: 'High Latency';
      condition: 'histogram_quantile(0.95, http_request_duration_seconds) > 2';
      severity: 'warning';
      channels: ['slack'];
      cooldown: '30m';
    },
    {
      name: 'Queue Backlog';
      condition: 'queue_depth > 1000';
      severity: 'warning';
      channels: ['slack'];
      cooldown: '15m';
    },
    {
      name: 'LLM API Errors';
      condition: 'rate(llm_errors_total[5m]) > 0.1';
      severity: 'critical';
      channels: ['slack', 'pagerduty'];
      cooldown: '5m';
    },
    {
      name: 'Database Connection Pool Exhausted';
      condition: 'pg_pool_available_connections < 5';
      severity: 'critical';
      channels: ['slack', 'pagerduty'];
      cooldown: '5m';
    },
  ];

  // On-call schedule
  oncall: {
    provider: 'pagerduty';
    schedule: 'alabobai-oncall';
    escalationPolicy: 'alabobai-escalation';
  };
}

// Alert Manager Implementation
class AlertManager {
  private cooldowns: Map<string, Date> = new Map();

  async sendAlert(alert: Alert): Promise<void> {
    // Check cooldown
    const lastSent = this.cooldowns.get(alert.name);
    if (lastSent && Date.now() - lastSent.getTime() < alert.cooldown) {
      return; // Still in cooldown
    }

    // Send to channels
    const promises = alert.channels.map((channel) => {
      switch (channel) {
        case 'slack':
          return this.sendSlackAlert(alert);
        case 'pagerduty':
          return this.sendPagerDutyAlert(alert);
        case 'email':
          return this.sendEmailAlert(alert);
      }
    });

    await Promise.allSettled(promises);

    // Update cooldown
    this.cooldowns.set(alert.name, new Date());
  }

  private async sendSlackAlert(alert: Alert): Promise<void> {
    await fetch(process.env.SLACK_WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${alert.severity.toUpperCase()}*: ${alert.name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${alert.name}*\n${alert.message}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Severity: ${alert.severity} | Time: ${new Date().toISOString()}`,
              },
            ],
          },
        ],
      }),
    });
  }
}
```

---

## Appendix A: Environment Variables

```bash
# Application
NODE_ENV=production
PORT=8888
VERSION=1.0.0

# Database
DATABASE_URL=postgresql://user:pass@host:5432/alabobai
DATABASE_POOL_SIZE=25
DATABASE_SSL=true

# Redis
REDIS_URL=redis://user:pass@host:6379
REDIS_TLS=true

# Authentication
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-256-bit-refresh-secret
ENCRYPTION_SECRET=your-256-bit-encryption-secret

# LLM Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_ASSETS=alabobai-assets
R2_BUCKET_CHECKPOINTS=alabobai-checkpoints

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
OTEL_EXPORTER_OTLP_ENDPOINT=https://...
DATADOG_API_KEY=...

# Alerts
SLACK_WEBHOOK=https://hooks.slack.com/...
PAGERDUTY_KEY=...

# Feature Flags
ENABLE_SANDBOX=true
ENABLE_BROWSER=true
ENABLE_CHECKPOINTING=true
ENABLE_VOICE=false
```

---

## Appendix B: API Response Examples

```json
// Successful Response
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "execution",
    "attributes": {
      "status": "completed",
      "result": {...}
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-02-08T12:00:00Z"
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    },
    "requestId": "req_abc123"
  },
  "timestamp": "2026-02-08T12:00:00Z"
}

// Paginated Response
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 156,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

**Document End**

*This architecture specification provides a complete blueprint for implementing the Alabobai platform at production scale. All components are designed for horizontal scalability, security, and observability.*
