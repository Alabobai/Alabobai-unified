-- Memory System Database Schema
-- Migration: 001_create_memory_tables
-- Description: Creates tables for the persistent memory system

-- ============================================================================
-- Main Memories Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'user_preference',
    'conversation_summary',
    'fact',
    'project_context',
    'decision',
    'code_pattern',
    'error_resolution',
    'knowledge'
  )),
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 50 CHECK(importance >= 0 AND importance <= 100),
  tags TEXT DEFAULT '[]', -- JSON array of strings
  metadata TEXT DEFAULT '{}', -- JSON object
  privacy TEXT DEFAULT 'private' CHECK(privacy IN ('private', 'shared', 'public')),
  created_at INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0,
  expires_at INTEGER,
  compressed INTEGER DEFAULT 0
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at);
CREATE INDEX IF NOT EXISTS idx_memories_user_type ON memories(user_id, type);

-- ============================================================================
-- Memory Relations Table (for knowledge graph)
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_relations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength REAL DEFAULT 0.5 CHECK(strength >= 0 AND strength <= 1),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relations_source ON memory_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON memory_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_relations_type ON memory_relations(relation_type);

-- ============================================================================
-- User Preferences Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence REAL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  updated_at INTEGER NOT NULL,
  application_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_prefs_user ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_prefs_category ON user_preferences(category);
CREATE INDEX IF NOT EXISTS idx_prefs_confidence ON user_preferences(confidence DESC);

-- ============================================================================
-- Memory Settings Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_settings (
  user_id TEXT PRIMARY KEY,
  memory_enabled INTEGER DEFAULT 1,
  auto_extract INTEGER DEFAULT 1,
  retention_days INTEGER DEFAULT 365,
  max_memories INTEGER DEFAULT 10000,
  updated_at INTEGER NOT NULL
);

-- ============================================================================
-- Vectors Table (for embedding storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vectors_created ON vectors(created_at DESC);

-- ============================================================================
-- Vector Metadata Table (for filtering)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vector_metadata (
  vector_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (vector_id, key),
  FOREIGN KEY (vector_id) REFERENCES vectors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metadata_key ON vector_metadata(key, value);
CREATE INDEX IF NOT EXISTS idx_metadata_vector ON vector_metadata(vector_id);

-- ============================================================================
-- Migration Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT
);

-- Record this migration
INSERT OR IGNORE INTO _migrations (id, applied_at, description)
VALUES (
  '001_create_memory_tables',
  strftime('%s', 'now') * 1000,
  'Creates tables for the persistent memory system'
);
