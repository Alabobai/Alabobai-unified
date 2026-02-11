/**
 * Alabobai Memory System
 * Persistent memory for context, user preferences, and learned behaviors
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';

export interface MemoryEntry {
  id: string;
  type: 'fact' | 'preference' | 'history' | 'learning';
  key: string;
  value: unknown;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface MemoryStore {
  get(key: string): unknown;
  set(key: string, value: unknown, type?: string): void;
  search(query: string, limit?: number): MemoryEntry[];
  delete(key: string): void;
  getHistory(userId: string, limit?: number): MemoryEntry[];
  remember(userId: string, fact: string, metadata?: Record<string, unknown>): void;
  recall(userId: string, query: string, limit?: number): MemoryEntry[];
  forget(userId: string, key: string): void;
  getUserPreferences(userId: string): Record<string, unknown>;
  setUserPreference(userId: string, key: string, value: unknown): void;
}

// ============================================================================
// SQLITE MEMORY STORE
// ============================================================================

export class SQLiteMemoryStore implements MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string = './data/memory.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        embedding BLOB,
        user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );

      CREATE TABLE IF NOT EXISTS conversation_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        agent_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_history_user ON conversation_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_history_session ON conversation_history(session_id);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        oauth_provider TEXT,
        oauth_id TEXT,
        avatar_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        plan TEXT NOT NULL DEFAULT 'pro',
        status TEXT NOT NULL DEFAULT 'active',
        lemon_customer_id TEXT,
        lemon_subscription_id TEXT,
        current_period_start TEXT,
        current_period_end TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_lemon ON subscriptions(lemon_subscription_id);

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    `);
  }

  get(key: string): unknown {
    const stmt = this.db.prepare(`
      SELECT value, access_count FROM memories WHERE key = ?
    `);
    const row = stmt.get(key) as { value: string; access_count: number } | undefined;

    if (row) {
      // Update access count
      this.db.prepare(`
        UPDATE memories SET access_count = ?, last_accessed_at = ? WHERE key = ?
      `).run(row.access_count + 1, new Date().toISOString(), key);

      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    }

    return undefined;
  }

  set(key: string, value: unknown, type: string = 'fact'): void {
    const now = new Date().toISOString();
    const id = uuid();
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    const existing = this.db.prepare('SELECT id FROM memories WHERE key = ?').get(key);

    if (existing) {
      this.db.prepare(`
        UPDATE memories SET value = ?, type = ?, updated_at = ? WHERE key = ?
      `).run(valueStr, type, now, key);
    } else {
      this.db.prepare(`
        INSERT INTO memories (id, type, key, value, created_at, updated_at, last_accessed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, type, key, valueStr, now, now, now);
    }
  }

  search(query: string, limit: number = 10): MemoryEntry[] {
    // Simple text search - in production would use vector similarity
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY access_count DESC, updated_at DESC
      LIMIT ?
    `);

    const pattern = `%${query}%`;
    const rows = stmt.all(pattern, pattern, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      key: row.key,
      value: this.parseValue(row.value),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      accessCount: row.access_count,
      lastAccessedAt: new Date(row.last_accessed_at),
    }));
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM memories WHERE key = ?').run(key);
  }

  getHistory(userId: string, limit: number = 50): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(userId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: 'history' as const,
      key: row.session_id,
      value: { role: row.role, content: row.content, agentId: row.agent_id },
      metadata: {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.created_at),
      accessCount: 0,
      lastAccessedAt: new Date(row.created_at),
    }));
  }

  remember(userId: string, fact: string, metadata: Record<string, unknown> = {}): void {
    const key = `user:${userId}:fact:${uuid().slice(0, 8)}`;
    const id = uuid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO memories (id, type, key, value, metadata, user_id, created_at, updated_at, last_accessed_at)
      VALUES (?, 'fact', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, key, fact, JSON.stringify(metadata), userId, now, now, now);
  }

  forget(userId: string, key: string): void {
    this.db.prepare(`
      DELETE FROM memories WHERE user_id = ? AND key = ?
    `).run(userId, key);
  }

  recall(userId: string, query: string, limit: number = 10): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE user_id = ? AND (key LIKE ? OR value LIKE ?)
      ORDER BY access_count DESC, updated_at DESC
      LIMIT ?
    `);

    const pattern = `%${query}%`;
    const rows = stmt.all(userId, pattern, pattern, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      key: row.key,
      value: this.parseValue(row.value),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      accessCount: row.access_count,
      lastAccessedAt: new Date(row.last_accessed_at),
    }));
  }

  getUserPreferences(userId: string): Record<string, unknown> {
    const stmt = this.db.prepare(`
      SELECT key, value FROM user_preferences WHERE user_id = ?
    `);

    const rows = stmt.all(userId) as { key: string; value: string }[];
    const prefs: Record<string, unknown> = {};

    for (const row of rows) {
      prefs[row.key] = this.parseValue(row.value);
    }

    return prefs;
  }

  setUserPreference(userId: string, key: string, value: unknown): void {
    const now = new Date().toISOString();
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    this.db.prepare(`
      INSERT OR REPLACE INTO user_preferences (user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, key, valueStr, now);
  }

  // Save conversation message to history
  saveMessage(userId: string, sessionId: string, role: string, content: string, agentId?: string): void {
    const id = uuid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO conversation_history (id, user_id, session_id, role, content, agent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, sessionId, role, content, agentId || null, now);
  }

  private parseValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  close(): void {
    this.db.close();
  }
}

// ============================================================================
// IN-MEMORY STORE (for testing/development)
// ============================================================================

export class InMemoryStore implements MemoryStore {
  private memories: Map<string, MemoryEntry> = new Map();
  private preferences: Map<string, Map<string, unknown>> = new Map();
  private history: MemoryEntry[] = [];

  get(key: string): unknown {
    const entry = this.memories.get(key);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessedAt = new Date();
      return entry.value;
    }
    return undefined;
  }

  set(key: string, value: unknown, type: string = 'fact'): void {
    const now = new Date();
    const existing = this.memories.get(key);

    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
    } else {
      this.memories.set(key, {
        id: uuid(),
        type: type as any,
        key,
        value,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessedAt: now,
      });
    }
  }

  search(query: string, limit: number = 10): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    const lowerQuery = query.toLowerCase();

    for (const entry of this.memories.values()) {
      const keyMatch = entry.key.toLowerCase().includes(lowerQuery);
      const valueMatch = JSON.stringify(entry.value).toLowerCase().includes(lowerQuery);

      if (keyMatch || valueMatch) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }

    return results.sort((a, b) => b.accessCount - a.accessCount);
  }

  delete(key: string): void {
    this.memories.delete(key);
  }

  getHistory(userId: string, limit: number = 50): MemoryEntry[] {
    return this.history
      .filter(e => e.metadata.userId === userId)
      .slice(-limit);
  }

  remember(userId: string, fact: string, metadata: Record<string, unknown> = {}): void {
    const key = `user:${userId}:fact:${uuid().slice(0, 8)}`;
    this.set(key, fact, 'fact');
    const entry = this.memories.get(key);
    if (entry) {
      entry.metadata = { ...metadata, userId };
    }
  }

  forget(userId: string, key: string): void {
    this.memories.delete(key);
  }

  recall(userId: string, query: string, limit: number = 10): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    const lowerQuery = query.toLowerCase();

    for (const entry of this.memories.values()) {
      if (entry.metadata.userId !== userId) continue;

      const keyMatch = entry.key.toLowerCase().includes(lowerQuery);
      const valueMatch = JSON.stringify(entry.value).toLowerCase().includes(lowerQuery);

      if (keyMatch || valueMatch) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }

    return results.sort((a, b) => b.accessCount - a.accessCount);
  }

  getUserPreferences(userId: string): Record<string, unknown> {
    return Object.fromEntries(this.preferences.get(userId) || new Map());
  }

  setUserPreference(userId: string, key: string, value: unknown): void {
    if (!this.preferences.has(userId)) {
      this.preferences.set(userId, new Map());
    }
    this.preferences.get(userId)!.set(key, value);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createMemoryStore(type: 'sqlite' | 'memory' | 'in-memory' = 'sqlite', dbPath?: string): MemoryStore {
  if (type === 'sqlite') {
    return new SQLiteMemoryStore(dbPath || './data/memory.db');
  }
  return new InMemoryStore();
}

// Async version for initialization flows
export async function createMemoryStoreAsync(type: 'sqlite' | 'memory' | 'in-memory' = 'sqlite', dbPath?: string): Promise<MemoryStore> {
  return createMemoryStore(type, dbPath);
}
