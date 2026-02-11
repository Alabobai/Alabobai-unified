/**
 * Alabobai Self-Annealing System - Database Schema
 *
 * SQLite/PostgreSQL compatible schema for storing all annealing system data.
 * Designed for high-volume writes, efficient querying, and time-series analysis.
 */

// ============================================================================
// DATABASE SCHEMA DEFINITIONS
// ============================================================================

export const ANNEALING_SCHEMA = `
-- ============================================================================
-- EXECUTION LOGS
-- High-volume table - optimized for writes and time-range queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Context
    company_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    task_id TEXT NOT NULL,

    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'intent-classification',
        'task-execution',
        'tool-call',
        'llm-inference',
        'approval-request',
        'collaboration',
        'output-generation'
    )),
    action_name TEXT NOT NULL,
    action_input JSONB NOT NULL DEFAULT '{}',
    action_output JSONB,

    -- Execution metrics
    duration_ms INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    llm_model TEXT,
    prompt_version TEXT,

    -- Result
    status TEXT NOT NULL CHECK (status IN (
        'success', 'partial-success', 'failure', 'timeout', 'cancelled'
    )),
    error_type TEXT,
    error_message TEXT,
    error_stack TEXT,

    -- Hierarchy
    parent_execution_id TEXT REFERENCES execution_logs(id),

    -- Tool usage (denormalized for query performance)
    tools_used JSONB NOT NULL DEFAULT '[]',

    -- Context factors
    context_factors JSONB NOT NULL DEFAULT '[]',

    -- Partition key for time-based partitioning
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Indexing columns
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_execution_logs_company_timestamp
    ON execution_logs(company_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_timestamp
    ON execution_logs(agent_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_execution_logs_session
    ON execution_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_execution_logs_task
    ON execution_logs(task_id);

CREATE INDEX IF NOT EXISTS idx_execution_logs_status
    ON execution_logs(status, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_execution_logs_date
    ON execution_logs(log_date);

CREATE INDEX IF NOT EXISTS idx_execution_logs_action_type
    ON execution_logs(action_type, timestamp DESC);


-- ============================================================================
-- FEEDBACK
-- Captures all forms of user and system feedback
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_log_id TEXT NOT NULL REFERENCES execution_logs(id) ON DELETE CASCADE,

    -- Source
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'explicit-rating',
        'explicit-comment',
        'approval-decision',
        'output-modification',
        'implicit-signal',
        'system-evaluation'
    )),

    -- Explicit feedback
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    comment TEXT,

    -- Approval feedback
    approval_decision TEXT CHECK (approval_decision IN ('approved', 'rejected', 'modified')),
    modifications_applied JSONB,
    time_to_decision_ms INTEGER,

    -- Quality scores
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    quality_dimensions JSONB,

    -- Implicit signals
    implicit_signals JSONB NOT NULL DEFAULT '[]',

    -- Timestamp for analytics
    feedback_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_feedback_execution
    ON feedback(execution_log_id);

CREATE INDEX IF NOT EXISTS idx_feedback_company_timestamp
    ON feedback(company_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_type
    ON feedback(feedback_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_rating
    ON feedback(rating, timestamp DESC) WHERE rating IS NOT NULL;


-- ============================================================================
-- PATTERNS
-- Identified patterns from analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Pattern identification
    pattern_type TEXT NOT NULL CHECK (pattern_type IN (
        'success-pattern',
        'failure-pattern',
        'optimization-pattern',
        'anti-pattern'
    )),
    pattern_name TEXT NOT NULL,
    description TEXT,

    -- Statistical validation
    sample_size INTEGER NOT NULL DEFAULT 0,
    confidence_level REAL NOT NULL DEFAULT 0 CHECK (confidence_level >= 0 AND confidence_level <= 1),
    statistical_significance REAL, -- p-value
    effect_size REAL, -- Cohen's d

    -- Pattern definition
    conditions JSONB NOT NULL DEFAULT '[]',
    outcome JSONB NOT NULL,

    -- Scope
    scope JSONB NOT NULL DEFAULT '{"global": true}',

    -- Status
    status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
        'candidate', 'validated', 'applied', 'deprecated', 'rejected'
    )),
    validated_at TIMESTAMP,
    validated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_patterns_type_status
    ON patterns(pattern_type, status);

CREATE INDEX IF NOT EXISTS idx_patterns_confidence
    ON patterns(confidence_level DESC) WHERE status = 'validated';


-- ============================================================================
-- ADAPTATIONS
-- Changes made based on pattern analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS adaptations (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMP,

    -- Adaptation details
    adaptation_type TEXT NOT NULL CHECK (adaptation_type IN (
        'prompt-optimization',
        'tool-selection',
        'execution-strategy',
        'output-template',
        'context-priority',
        'parameter-tuning'
    )),
    name TEXT NOT NULL,
    description TEXT,

    -- Triggers
    trigger_pattern_ids JSONB NOT NULL DEFAULT '[]',
    trigger_reason TEXT,

    -- The change
    change_target TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN (
        'replace', 'append', 'prepend', 'modify', 'remove'
    )),
    previous_value JSONB,
    new_value JSONB NOT NULL,
    change_diff TEXT,

    -- Rollout
    rollout_strategy JSONB NOT NULL,
    current_rollout_percentage REAL NOT NULL DEFAULT 0,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending-approval' CHECK (status IN (
        'pending-approval', 'approved', 'rolling-out', 'active', 'rolled-back', 'superseded'
    )),

    -- Safety
    rollback_conditions JSONB NOT NULL DEFAULT '[]',
    rollback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    rollback_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_adaptations_status
    ON adaptations(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adaptations_type
    ON adaptations(adaptation_type, status);


-- ============================================================================
-- ADAPTATION METRICS
-- Track performance of adaptations over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS adaptation_metrics (
    id TEXT PRIMARY KEY,
    adaptation_id TEXT NOT NULL REFERENCES adaptations(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    metric_name TEXT NOT NULL,
    baseline_value REAL NOT NULL,
    current_value REAL NOT NULL,
    target_value REAL,
    measurement_count INTEGER NOT NULL DEFAULT 0,
    measurement_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_adaptation_metrics_adaptation
    ON adaptation_metrics(adaptation_id, timestamp DESC);


-- ============================================================================
-- AGGREGATE INSIGHTS
-- Cross-company anonymized learnings
-- ============================================================================

CREATE TABLE IF NOT EXISTS aggregate_insights (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'performance-trend',
        'best-practice',
        'common-failure',
        'optimization-opportunity',
        'industry-pattern'
    )),
    name TEXT NOT NULL,
    description TEXT,

    -- Aggregation scope
    company_count INTEGER NOT NULL DEFAULT 0,
    execution_count INTEGER NOT NULL DEFAULT 0,
    time_range_start TIMESTAMP NOT NULL,
    time_range_end TIMESTAMP NOT NULL,

    -- Statistics
    statistics JSONB NOT NULL,
    industry_breakdown JSONB,

    -- Recommendations
    recommendations JSONB NOT NULL DEFAULT '[]',

    -- Benchmark
    benchmark JSONB
);

CREATE INDEX IF NOT EXISTS idx_insights_type
    ON aggregate_insights(insight_type, created_at DESC);


-- ============================================================================
-- PERFORMANCE METRICS (Time-Series)
-- Aggregated metrics for dashboards
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_metrics (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    granularity TEXT NOT NULL CHECK (granularity IN (
        'minute', 'hour', 'day', 'week', 'month'
    )),

    -- Scope
    company_id TEXT,
    agent_id TEXT,
    task_type TEXT,
    industry TEXT,

    -- Core metrics
    execution_count INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0,
    approval_rate REAL NOT NULL DEFAULT 0,

    -- Speed metrics
    avg_latency_ms REAL NOT NULL DEFAULT 0,
    p50_latency_ms REAL NOT NULL DEFAULT 0,
    p95_latency_ms REAL NOT NULL DEFAULT 0,
    p99_latency_ms REAL NOT NULL DEFAULT 0,

    -- Quality metrics
    avg_quality_score REAL,
    avg_user_rating REAL,
    modification_rate REAL NOT NULL DEFAULT 0,

    -- Efficiency metrics
    avg_token_count REAL NOT NULL DEFAULT 0,
    avg_tool_calls REAL NOT NULL DEFAULT 0,
    cost_per_execution REAL NOT NULL DEFAULT 0,

    -- Learning metrics
    adaptation_count INTEGER NOT NULL DEFAULT 0,
    pattern_discovery_rate REAL NOT NULL DEFAULT 0,
    improvement_rate REAL NOT NULL DEFAULT 0,

    -- Unique constraint for upserts
    UNIQUE(timestamp, granularity, company_id, agent_id, task_type, industry)
);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_time
    ON performance_metrics(timestamp DESC, granularity);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_company
    ON performance_metrics(company_id, timestamp DESC) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_performance_metrics_agent
    ON performance_metrics(agent_id, timestamp DESC) WHERE agent_id IS NOT NULL;


-- ============================================================================
-- A/B TESTS
-- Experimentation framework
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_tests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    hypothesis TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,

    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'running', 'paused', 'completed', 'stopped'
    )),

    -- Variants
    control_variant JSONB NOT NULL,
    treatment_variants JSONB NOT NULL DEFAULT '[]',

    -- Traffic allocation
    traffic_allocation JSONB NOT NULL DEFAULT '{}',

    -- Targeting
    targeting_rules JSONB NOT NULL DEFAULT '[]',

    -- Metrics
    primary_metric TEXT NOT NULL,
    secondary_metrics JSONB NOT NULL DEFAULT '[]',
    minimum_detectable_effect REAL NOT NULL DEFAULT 0.05,
    required_sample_size INTEGER NOT NULL DEFAULT 1000,

    -- Results
    results JSONB
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_status
    ON ab_tests(status, started_at DESC);


-- ============================================================================
-- AB TEST EXPOSURES
-- Track which users see which variants
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_test_exposures (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    execution_log_id TEXT REFERENCES execution_logs(id),
    exposed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(test_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_test_exposures_test
    ON ab_test_exposures(test_id, variant_id);


-- ============================================================================
-- SAFETY RAILS
-- Constraints on adaptations
-- ============================================================================

CREATE TABLE IF NOT EXISTS safety_rails (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,

    rail_type TEXT NOT NULL CHECK (rail_type IN (
        'metric-degradation',
        'rate-limit',
        'change-scope',
        'approval-required',
        'rollback-trigger'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('warning', 'block')),

    -- Condition
    condition JSONB NOT NULL,

    -- Action
    action JSONB NOT NULL,

    -- Tracking
    trigger_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMP,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_safety_rails_enabled
    ON safety_rails(enabled, rail_type);


-- ============================================================================
-- SAFETY RAIL TRIGGERS
-- Log of when rails were triggered
-- ============================================================================

CREATE TABLE IF NOT EXISTS safety_rail_triggers (
    id TEXT PRIMARY KEY,
    rail_id TEXT NOT NULL REFERENCES safety_rails(id) ON DELETE CASCADE,
    triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    adaptation_id TEXT REFERENCES adaptations(id),
    trigger_context JSONB NOT NULL,
    action_taken TEXT NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by TEXT,
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_safety_triggers_rail
    ON safety_rail_triggers(rail_id, triggered_at DESC);


-- ============================================================================
-- PROMPT VERSIONS
-- Track prompt evolution for reproducibility
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_versions (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    prompt_type TEXT NOT NULL, -- 'system', 'user-template', 'tool-description'
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    parent_version_id TEXT REFERENCES prompt_versions(id),
    adaptation_id TEXT REFERENCES adaptations(id),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    performance_score REAL,
    sample_count INTEGER NOT NULL DEFAULT 0,

    UNIQUE(agent_name, prompt_type, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_active
    ON prompt_versions(agent_name, prompt_type) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_prompt_versions_agent
    ON prompt_versions(agent_name, created_at DESC);


-- ============================================================================
-- ANONYMIZATION MAPPINGS
-- For cross-company learning
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymization_mappings (
    id TEXT PRIMARY KEY,
    original_company_id TEXT NOT NULL,
    anonymous_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    salt TEXT NOT NULL -- For consistent hashing
);

CREATE INDEX IF NOT EXISTS idx_anon_original
    ON anonymization_mappings(original_company_id);
`;


// ============================================================================
// RETENTION POLICY DEFINITIONS
// ============================================================================

export const RETENTION_POLICIES = {
  execution_logs: {
    hot: 7,           // 7 days in hot storage (fast SSD)
    warm: 30,         // 30 days in warm storage (standard)
    cold: 365,        // 1 year in cold storage (compressed)
    archive: 2555,    // 7 years archived (compliance)
    piiRetention: 90, // PII scrubbed after 90 days
  },
  feedback: {
    hot: 30,
    warm: 90,
    cold: 365,
    archive: 2555,
    piiRetention: 90,
  },
  patterns: {
    // Patterns kept indefinitely while active
    deprecated: 365,  // Deprecated patterns deleted after 1 year
  },
  adaptations: {
    // All adaptations kept for audit trail
    archive: 2555,
  },
  performance_metrics: {
    minute: 1,        // 1 day of minute granularity
    hour: 7,          // 7 days of hourly
    day: 365,         // 1 year of daily
    week: 2555,       // 7 years of weekly
    month: 9999,      // Monthly kept indefinitely
  },
};


// ============================================================================
// PARTITIONING STRATEGY
// ============================================================================

export const PARTITIONING_STRATEGY = `
-- For PostgreSQL, create partitioned tables for high-volume data
-- Partition execution_logs by month

CREATE TABLE IF NOT EXISTS execution_logs_partitioned (
    LIKE execution_logs INCLUDING ALL
) PARTITION BY RANGE (log_date);

-- Create partitions dynamically
-- Example: CREATE TABLE execution_logs_2024_01
--          PARTITION OF execution_logs_partitioned
--          FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- For SQLite, use date-based archival instead
-- Move old data to archive tables periodically
`;


// ============================================================================
// MATERIALIZED VIEWS FOR ANALYTICS
// ============================================================================

export const MATERIALIZED_VIEWS = `
-- Daily success rate by agent
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_agent_success AS
SELECT
    DATE(timestamp) as date,
    agent_name,
    company_id,
    COUNT(*) as total_executions,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
    ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate,
    AVG(duration_ms) as avg_duration_ms,
    AVG(total_tokens) as avg_tokens
FROM execution_logs
GROUP BY DATE(timestamp), agent_name, company_id;

-- Hourly feedback summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_feedback AS
SELECT
    DATE_TRUNC('hour', timestamp) as hour,
    company_id,
    COUNT(*) as feedback_count,
    AVG(rating) as avg_rating,
    SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive_count,
    SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count,
    AVG(quality_score) as avg_quality_score
FROM feedback
GROUP BY DATE_TRUNC('hour', timestamp), company_id;

-- Pattern effectiveness tracking
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pattern_effectiveness AS
SELECT
    p.id as pattern_id,
    p.pattern_name,
    p.pattern_type,
    p.confidence_level,
    COUNT(DISTINCT a.id) as adaptations_created,
    SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END) as active_adaptations,
    SUM(CASE WHEN a.rollback_triggered THEN 1 ELSE 0 END) as rollbacks
FROM patterns p
LEFT JOIN adaptations a ON p.id = ANY(
    SELECT jsonb_array_elements_text(a.trigger_pattern_ids)::text
)
GROUP BY p.id, p.pattern_name, p.pattern_type, p.confidence_level;

-- Cross-company benchmark (anonymized)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_industry_benchmarks AS
SELECT
    industry,
    task_type,
    granularity,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY success_rate) as median_success_rate,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY success_rate) as p75_success_rate,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY success_rate) as p90_success_rate,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_latency_ms) as median_latency,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_quality_score) as median_quality
FROM performance_metrics
WHERE timestamp > NOW() - INTERVAL '30 days'
AND industry IS NOT NULL
GROUP BY industry, task_type, granularity;
`;


// ============================================================================
// DATABASE INITIALIZATION FUNCTION
// ============================================================================

export async function initializeAnnealingDatabase(db: any): Promise<void> {
  // Execute main schema
  await db.exec(ANNEALING_SCHEMA);

  // Create initial safety rails
  await db.run(`
    INSERT OR IGNORE INTO safety_rails (id, name, description, rail_type, severity, condition, action)
    VALUES
    ('rail-success-rate', 'Success Rate Degradation', 'Triggers when success rate drops significantly', 'metric-degradation', 'block',
     '{"metric": "success_rate", "threshold": 0.1, "operator": "greater", "windowMinutes": 60}',
     '{"actionType": "rollback", "message": "Success rate dropped by more than 10%"}'),

    ('rail-latency-spike', 'Latency Spike', 'Triggers on abnormal latency increase', 'metric-degradation', 'warning',
     '{"metric": "p95_latency_ms", "threshold": 2.0, "operator": "greater", "windowMinutes": 30}',
     '{"actionType": "notify", "notifyRoles": ["admin"], "message": "Latency doubled from baseline"}'),

    ('rail-rate-limit', 'Adaptation Rate Limit', 'Limits adaptation frequency', 'rate-limit', 'block',
     '{"maxAdaptationsPerHour": 5, "maxAdaptationsPerDay": 20}',
     '{"actionType": "block", "message": "Adaptation rate limit exceeded"}'),

    ('rail-major-change', 'Major Change Approval', 'Requires approval for major changes', 'approval-required', 'block',
     '{"changeType": "replace", "patternMatch": [{"dimension": "scope.global", "operator": "equals", "value": true}]}',
     '{"actionType": "require-approval", "notifyRoles": ["admin", "ml-engineer"], "message": "Global prompt changes require approval"}')
  `);

  console.log('[Annealing] Database initialized with schema and safety rails');
}


// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

export async function runRetentionCleanup(db: any): Promise<{ deleted: number }> {
  const now = new Date();
  let totalDeleted = 0;

  // Clean execution logs beyond cold retention
  const coldCutoff = new Date(now.getTime() - RETENTION_POLICIES.execution_logs.cold * 24 * 60 * 60 * 1000);
  const result = await db.run(`
    DELETE FROM execution_logs
    WHERE log_date < ?
    AND id NOT IN (
      SELECT DISTINCT execution_log_id FROM feedback
    )
  `, [coldCutoff.toISOString().split('T')[0]]);
  totalDeleted += result.changes || 0;

  // Scrub PII from older logs
  const piiCutoff = new Date(now.getTime() - RETENTION_POLICIES.execution_logs.piiRetention * 24 * 60 * 60 * 1000);
  await db.run(`
    UPDATE execution_logs
    SET
      action_input = json_remove(action_input, '$.user_data', '$.email', '$.name', '$.address'),
      action_output = json_remove(action_output, '$.user_data', '$.email', '$.name', '$.address')
    WHERE log_date < ?
    AND action_input IS NOT NULL
  `, [piiCutoff.toISOString().split('T')[0]]);

  // Clean deprecated patterns
  const deprecatedCutoff = new Date(now.getTime() - RETENTION_POLICIES.patterns.deprecated * 24 * 60 * 60 * 1000);
  await db.run(`
    DELETE FROM patterns
    WHERE status = 'deprecated'
    AND updated_at < ?
  `, [deprecatedCutoff.toISOString()]);

  // Aggregate and clean minute-level metrics
  const minuteCutoff = new Date(now.getTime() - RETENTION_POLICIES.performance_metrics.minute * 24 * 60 * 60 * 1000);
  await db.run(`
    DELETE FROM performance_metrics
    WHERE granularity = 'minute'
    AND timestamp < ?
  `, [minuteCutoff.toISOString()]);

  return { deleted: totalDeleted };
}
