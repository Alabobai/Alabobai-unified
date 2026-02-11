/**
 * Alabobai Financial Guardian - Token Audit
 * Complete audit trail for every token consumed
 *
 * Features: Immutable logs, detailed breakdown, reconciliation, compliance
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import { LLMProvider } from './CostEstimator.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Token usage types
 */
export type TokenType = 'input' | 'output' | 'cache-read' | 'cache-write' | 'system' | 'tool';

/**
 * Audit entry - immutable record of token usage
 */
export interface AuditEntry {
  // Identifiers
  id: string;
  hash: string;           // SHA-256 of entry for integrity
  previousHash: string;   // Chain hash for tamper detection
  sequence: number;       // Sequential number for ordering

  // Task context
  taskId: string;
  sessionId: string;
  userId: string;
  agentId?: string;
  requestId: string;

  // Token details
  tokenType: TokenType;
  tokenCount: number;
  model: string;
  provider: LLMProvider;

  // Cost
  pricePerMillion: number;
  cost: number;
  currency: string;

  // Context
  operation: string;      // e.g., "chat", "vision", "embed", "tool_call"
  promptLength?: number;
  responseLength?: number;
  cacheHit?: boolean;
  streamingUsed?: boolean;

  // Metadata
  metadata: Record<string, unknown>;
  tags: string[];

  // Timing
  timestamp: Date;
  processingTimeMs?: number;

  // Reconciliation
  reconciled: boolean;
  reconciledAt?: Date;
  reconciledWith?: string; // External invoice/receipt ID
}

/**
 * Aggregated audit summary
 */
export interface AuditSummary {
  period: {
    start: Date;
    end: Date;
  };

  // Token totals
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalTokens: number;

  // Cost totals
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheCost: number;

  // Breakdowns
  byModel: Record<string, { tokens: number; cost: number; count: number }>;
  byProvider: Record<string, { tokens: number; cost: number; count: number }>;
  byOperation: Record<string, { tokens: number; cost: number; count: number }>;
  byUser: Record<string, { tokens: number; cost: number; count: number }>;
  byAgent: Record<string, { tokens: number; cost: number; count: number }>;

  // Statistics
  entryCount: number;
  averageTokensPerRequest: number;
  averageCostPerRequest: number;
  cacheHitRate: number;

  // Integrity
  firstEntryHash: string;
  lastEntryHash: string;
  chainIntact: boolean;
}

/**
 * Detailed invoice line item
 */
export interface InvoiceLineItem {
  description: string;
  model: string;
  provider: LLMProvider;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  unitPrice: string;      // Human readable
  subtotal: number;
  entryIds: string[];     // Source audit entries
}

/**
 * Itemized invoice
 */
export interface ItemizedInvoice {
  id: string;
  userId: string;
  period: {
    start: Date;
    end: Date;
  };

  lineItems: InvoiceLineItem[];

  subtotal: number;
  adjustments: { description: string; amount: number }[];
  credits: number;
  refunds: number;
  total: number;
  currency: string;

  generatedAt: Date;
  status: 'draft' | 'finalized' | 'paid';
}

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
  success: boolean;
  matched: number;
  unmatched: number;
  discrepancies: {
    entryId: string;
    ourCost: number;
    externalCost: number;
    difference: number;
  }[];
  totalOurCost: number;
  totalExternalCost: number;
  totalDifference: number;
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  agentId?: string;
  taskId?: string;
  sessionId?: string;
  model?: string;
  provider?: LLMProvider;
  operation?: string;
  minCost?: number;
  maxCost?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'cost' | 'tokens';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// TOKEN AUDIT CLASS
// ============================================================================

export class TokenAudit extends EventEmitter {
  private entries: AuditEntry[] = [];
  private lastHash: string = 'GENESIS';
  private sequence: number = 0;
  private invoices: Map<string, ItemizedInvoice> = new Map();

  constructor() {
    super();
  }

  /**
   * Log token usage (creates immutable audit entry)
   */
  logUsage(params: {
    taskId: string;
    sessionId: string;
    userId: string;
    agentId?: string;
    requestId: string;
    tokenType: TokenType;
    tokenCount: number;
    model: string;
    provider: LLMProvider;
    pricePerMillion: number;
    operation: string;
    promptLength?: number;
    responseLength?: number;
    cacheHit?: boolean;
    streamingUsed?: boolean;
    processingTimeMs?: number;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): AuditEntry {
    const timestamp = new Date();
    const cost = (params.tokenCount / 1_000_000) * params.pricePerMillion;

    // Create entry content for hashing
    const entryContent = {
      sequence: this.sequence + 1,
      previousHash: this.lastHash,
      ...params,
      cost,
      timestamp: timestamp.toISOString(),
    };

    // Calculate hash
    const hash = this.calculateHash(entryContent);

    const entry: AuditEntry = {
      id: this.generateEntryId(),
      hash,
      previousHash: this.lastHash,
      sequence: ++this.sequence,
      taskId: params.taskId,
      sessionId: params.sessionId,
      userId: params.userId,
      agentId: params.agentId,
      requestId: params.requestId,
      tokenType: params.tokenType,
      tokenCount: params.tokenCount,
      model: params.model,
      provider: params.provider,
      pricePerMillion: params.pricePerMillion,
      cost: Math.round(cost * 1000000) / 1000000, // 6 decimal precision
      currency: 'USD',
      operation: params.operation,
      promptLength: params.promptLength,
      responseLength: params.responseLength,
      cacheHit: params.cacheHit,
      streamingUsed: params.streamingUsed,
      metadata: params.metadata || {},
      tags: params.tags || [],
      timestamp,
      processingTimeMs: params.processingTimeMs,
      reconciled: false,
    };

    // Update chain
    this.lastHash = hash;
    this.entries.push(entry);

    this.emit('entry-logged', entry);
    return entry;
  }

  /**
   * Log a complete API call with all token types
   */
  logApiCall(params: {
    taskId: string;
    sessionId: string;
    userId: string;
    agentId?: string;
    requestId?: string;
    model: string;
    provider: LLMProvider;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    cacheReadPricePerMillion?: number;
    cacheWritePricePerMillion?: number;
    promptLength?: number;
    responseLength?: number;
    cacheHit?: boolean;
    streamingUsed?: boolean;
    processingTimeMs?: number;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): AuditEntry[] {
    const requestId = params.requestId || this.generateRequestId();
    const entries: AuditEntry[] = [];

    // Log input tokens
    if (params.inputTokens > 0) {
      entries.push(this.logUsage({
        taskId: params.taskId,
        sessionId: params.sessionId,
        userId: params.userId,
        agentId: params.agentId,
        requestId,
        tokenType: 'input',
        tokenCount: params.inputTokens,
        model: params.model,
        provider: params.provider,
        pricePerMillion: params.inputPricePerMillion,
        operation: params.operation,
        promptLength: params.promptLength,
        cacheHit: params.cacheHit,
        streamingUsed: params.streamingUsed,
        processingTimeMs: params.processingTimeMs,
        metadata: params.metadata,
        tags: params.tags,
      }));
    }

    // Log output tokens
    if (params.outputTokens > 0) {
      entries.push(this.logUsage({
        taskId: params.taskId,
        sessionId: params.sessionId,
        userId: params.userId,
        agentId: params.agentId,
        requestId,
        tokenType: 'output',
        tokenCount: params.outputTokens,
        model: params.model,
        provider: params.provider,
        pricePerMillion: params.outputPricePerMillion,
        operation: params.operation,
        responseLength: params.responseLength,
        streamingUsed: params.streamingUsed,
        metadata: params.metadata,
        tags: params.tags,
      }));
    }

    // Log cache read tokens
    if (params.cacheReadTokens && params.cacheReadTokens > 0 && params.cacheReadPricePerMillion) {
      entries.push(this.logUsage({
        taskId: params.taskId,
        sessionId: params.sessionId,
        userId: params.userId,
        agentId: params.agentId,
        requestId,
        tokenType: 'cache-read',
        tokenCount: params.cacheReadTokens,
        model: params.model,
        provider: params.provider,
        pricePerMillion: params.cacheReadPricePerMillion,
        operation: params.operation,
        cacheHit: true,
        metadata: params.metadata,
        tags: params.tags,
      }));
    }

    // Log cache write tokens
    if (params.cacheWriteTokens && params.cacheWriteTokens > 0 && params.cacheWritePricePerMillion) {
      entries.push(this.logUsage({
        taskId: params.taskId,
        sessionId: params.sessionId,
        userId: params.userId,
        agentId: params.agentId,
        requestId,
        tokenType: 'cache-write',
        tokenCount: params.cacheWriteTokens,
        model: params.model,
        provider: params.provider,
        pricePerMillion: params.cacheWritePricePerMillion,
        operation: params.operation,
        metadata: params.metadata,
        tags: params.tags,
      }));
    }

    return entries;
  }

  /**
   * Query audit entries
   */
  query(options: AuditQueryOptions): AuditEntry[] {
    let results = [...this.entries];

    // Apply filters
    if (options.startDate) {
      results = results.filter(e => e.timestamp >= options.startDate!);
    }
    if (options.endDate) {
      results = results.filter(e => e.timestamp <= options.endDate!);
    }
    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }
    if (options.agentId) {
      results = results.filter(e => e.agentId === options.agentId);
    }
    if (options.taskId) {
      results = results.filter(e => e.taskId === options.taskId);
    }
    if (options.sessionId) {
      results = results.filter(e => e.sessionId === options.sessionId);
    }
    if (options.model) {
      results = results.filter(e => e.model === options.model);
    }
    if (options.provider) {
      results = results.filter(e => e.provider === options.provider);
    }
    if (options.operation) {
      results = results.filter(e => e.operation === options.operation);
    }
    if (options.minCost !== undefined) {
      results = results.filter(e => e.cost >= options.minCost!);
    }
    if (options.maxCost !== undefined) {
      results = results.filter(e => e.cost <= options.maxCost!);
    }
    if (options.tags && options.tags.length > 0) {
      results = results.filter(e => options.tags!.some(tag => e.tags.includes(tag)));
    }

    // Sort
    const sortBy = options.sortBy || 'timestamp';
    const sortOrder = options.sortOrder || 'desc';
    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'timestamp':
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'cost':
          comparison = a.cost - b.cost;
          break;
        case 'tokens':
          comparison = a.tokenCount - b.tokenCount;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get summary for a period
   */
  getSummary(startDate?: Date, endDate?: Date): AuditSummary {
    const start = startDate || new Date(0);
    const end = endDate || new Date();

    const entries = this.query({ startDate: start, endDate: end });

    // Initialize counters
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheTokens = 0;
    let inputCost = 0;
    let outputCost = 0;
    let cacheCost = 0;
    let cacheHits = 0;
    let totalRequests = 0;

    const byModel: AuditSummary['byModel'] = {};
    const byProvider: AuditSummary['byProvider'] = {};
    const byOperation: AuditSummary['byOperation'] = {};
    const byUser: AuditSummary['byUser'] = {};
    const byAgent: AuditSummary['byAgent'] = {};
    const requestIds = new Set<string>();

    for (const entry of entries) {
      requestIds.add(entry.requestId);

      // Token type aggregation
      switch (entry.tokenType) {
        case 'input':
        case 'system':
        case 'tool':
          totalInputTokens += entry.tokenCount;
          inputCost += entry.cost;
          break;
        case 'output':
          totalOutputTokens += entry.tokenCount;
          outputCost += entry.cost;
          break;
        case 'cache-read':
        case 'cache-write':
          totalCacheTokens += entry.tokenCount;
          cacheCost += entry.cost;
          if (entry.cacheHit) cacheHits++;
          break;
      }

      // By model
      if (!byModel[entry.model]) {
        byModel[entry.model] = { tokens: 0, cost: 0, count: 0 };
      }
      byModel[entry.model].tokens += entry.tokenCount;
      byModel[entry.model].cost += entry.cost;
      byModel[entry.model].count++;

      // By provider
      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = { tokens: 0, cost: 0, count: 0 };
      }
      byProvider[entry.provider].tokens += entry.tokenCount;
      byProvider[entry.provider].cost += entry.cost;
      byProvider[entry.provider].count++;

      // By operation
      if (!byOperation[entry.operation]) {
        byOperation[entry.operation] = { tokens: 0, cost: 0, count: 0 };
      }
      byOperation[entry.operation].tokens += entry.tokenCount;
      byOperation[entry.operation].cost += entry.cost;
      byOperation[entry.operation].count++;

      // By user
      if (!byUser[entry.userId]) {
        byUser[entry.userId] = { tokens: 0, cost: 0, count: 0 };
      }
      byUser[entry.userId].tokens += entry.tokenCount;
      byUser[entry.userId].cost += entry.cost;
      byUser[entry.userId].count++;

      // By agent
      if (entry.agentId) {
        if (!byAgent[entry.agentId]) {
          byAgent[entry.agentId] = { tokens: 0, cost: 0, count: 0 };
        }
        byAgent[entry.agentId].tokens += entry.tokenCount;
        byAgent[entry.agentId].cost += entry.cost;
        byAgent[entry.agentId].count++;
      }
    }

    totalRequests = requestIds.size;
    const totalTokens = totalInputTokens + totalOutputTokens + totalCacheTokens;
    const totalCost = inputCost + outputCost + cacheCost;

    return {
      period: { start, end },
      totalInputTokens,
      totalOutputTokens,
      totalCacheTokens,
      totalTokens,
      totalCost: this.roundCost(totalCost),
      inputCost: this.roundCost(inputCost),
      outputCost: this.roundCost(outputCost),
      cacheCost: this.roundCost(cacheCost),
      byModel,
      byProvider,
      byOperation,
      byUser,
      byAgent,
      entryCount: entries.length,
      averageTokensPerRequest: totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0,
      averageCostPerRequest: totalRequests > 0 ? this.roundCost(totalCost / totalRequests) : 0,
      cacheHitRate: entries.length > 0 ? cacheHits / entries.length : 0,
      firstEntryHash: entries[0]?.hash || '',
      lastEntryHash: entries[entries.length - 1]?.hash || '',
      chainIntact: this.verifyChainIntegrity(entries),
    };
  }

  /**
   * Generate itemized invoice
   */
  generateInvoice(
    userId: string,
    startDate: Date,
    endDate: Date,
    adjustments?: { description: string; amount: number }[],
    credits?: number,
    refunds?: number
  ): ItemizedInvoice {
    const entries = this.query({ userId, startDate, endDate });

    // Group entries by model + operation
    const groups = new Map<string, {
      model: string;
      provider: LLMProvider;
      operation: string;
      inputTokens: number;
      outputTokens: number;
      cacheTokens: number;
      inputCost: number;
      outputCost: number;
      cacheCost: number;
      entryIds: string[];
    }>();

    for (const entry of entries) {
      const key = `${entry.model}:${entry.provider}:${entry.operation}`;

      if (!groups.has(key)) {
        groups.set(key, {
          model: entry.model,
          provider: entry.provider,
          operation: entry.operation,
          inputTokens: 0,
          outputTokens: 0,
          cacheTokens: 0,
          inputCost: 0,
          outputCost: 0,
          cacheCost: 0,
          entryIds: [],
        });
      }

      const group = groups.get(key)!;
      group.entryIds.push(entry.id);

      switch (entry.tokenType) {
        case 'input':
        case 'system':
        case 'tool':
          group.inputTokens += entry.tokenCount;
          group.inputCost += entry.cost;
          break;
        case 'output':
          group.outputTokens += entry.tokenCount;
          group.outputCost += entry.cost;
          break;
        case 'cache-read':
        case 'cache-write':
          group.cacheTokens += entry.tokenCount;
          group.cacheCost += entry.cost;
          break;
      }
    }

    // Convert to line items
    const lineItems: InvoiceLineItem[] = [];
    for (const group of Array.from(groups.values())) {
      const subtotal = group.inputCost + group.outputCost + group.cacheCost;
      const totalTokens = group.inputTokens + group.outputTokens + group.cacheTokens;

      lineItems.push({
        description: `${group.model} - ${group.operation}`,
        model: group.model,
        provider: group.provider,
        operation: group.operation,
        inputTokens: group.inputTokens,
        outputTokens: group.outputTokens,
        cacheTokens: group.cacheTokens,
        unitPrice: `${totalTokens.toLocaleString()} tokens`,
        subtotal: this.roundCost(subtotal),
        entryIds: group.entryIds,
      });
    }

    // Sort by subtotal descending
    lineItems.sort((a, b) => b.subtotal - a.subtotal);

    const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const adjustmentTotal = (adjustments || []).reduce((sum, adj) => sum + adj.amount, 0);
    const total = subtotal + adjustmentTotal - (credits || 0) - (refunds || 0);

    const invoice: ItemizedInvoice = {
      id: this.generateInvoiceId(),
      userId,
      period: { start: startDate, end: endDate },
      lineItems,
      subtotal: this.roundCost(subtotal),
      adjustments: adjustments || [],
      credits: credits || 0,
      refunds: refunds || 0,
      total: this.roundCost(total),
      currency: 'USD',
      generatedAt: new Date(),
      status: 'draft',
    };

    this.invoices.set(invoice.id, invoice);
    this.emit('invoice-generated', invoice);
    return invoice;
  }

  /**
   * Verify chain integrity
   */
  verifyChainIntegrity(entries?: AuditEntry[]): boolean {
    const entriesToCheck = entries || this.entries;

    if (entriesToCheck.length === 0) return true;

    let previousHash = 'GENESIS';

    for (const entry of entriesToCheck) {
      // Check previous hash matches
      if (entry.previousHash !== previousHash) {
        this.emit('integrity-violation', {
          entryId: entry.id,
          expected: previousHash,
          found: entry.previousHash,
        });
        return false;
      }

      // Verify entry hash
      const entryContent = {
        sequence: entry.sequence,
        previousHash: entry.previousHash,
        taskId: entry.taskId,
        sessionId: entry.sessionId,
        userId: entry.userId,
        agentId: entry.agentId,
        requestId: entry.requestId,
        tokenType: entry.tokenType,
        tokenCount: entry.tokenCount,
        model: entry.model,
        provider: entry.provider,
        pricePerMillion: entry.pricePerMillion,
        cost: entry.cost,
        timestamp: entry.timestamp.toISOString(),
      };

      const calculatedHash = this.calculateHash(entryContent);
      if (calculatedHash !== entry.hash) {
        this.emit('integrity-violation', {
          entryId: entry.id,
          type: 'hash-mismatch',
          expected: calculatedHash,
          found: entry.hash,
        });
        return false;
      }

      previousHash = entry.hash;
    }

    return true;
  }

  /**
   * Reconcile with external billing
   */
  reconcile(
    externalRecords: { id: string; cost: number; timestamp: Date }[],
    startDate: Date,
    endDate: Date
  ): ReconciliationResult {
    const ourEntries = this.query({ startDate, endDate });

    // Group our entries by timestamp (to hour)
    const ourByHour = new Map<string, number>();
    for (const entry of ourEntries) {
      const hourKey = new Date(entry.timestamp).setMinutes(0, 0, 0).toString();
      ourByHour.set(hourKey, (ourByHour.get(hourKey) || 0) + entry.cost);
    }

    // Group external by timestamp
    const externalByHour = new Map<string, { cost: number; ids: string[] }>();
    for (const record of externalRecords) {
      const hourKey = new Date(record.timestamp).setMinutes(0, 0, 0).toString();
      if (!externalByHour.has(hourKey)) {
        externalByHour.set(hourKey, { cost: 0, ids: [] });
      }
      const entry = externalByHour.get(hourKey)!;
      entry.cost += record.cost;
      entry.ids.push(record.id);
    }

    // Compare
    const discrepancies: ReconciliationResult['discrepancies'] = [];
    let matched = 0;
    let totalOurCost = 0;
    let totalExternalCost = 0;

    const allHours = new Set([...Array.from(ourByHour.keys()), ...Array.from(externalByHour.keys())]);

    for (const hourKey of Array.from(allHours)) {
      const ourCost = ourByHour.get(hourKey) || 0;
      const external = externalByHour.get(hourKey);
      const externalCost = external?.cost || 0;

      totalOurCost += ourCost;
      totalExternalCost += externalCost;

      const difference = Math.abs(ourCost - externalCost);
      const threshold = Math.max(ourCost, externalCost) * 0.01; // 1% tolerance

      if (difference > threshold && difference > 0.001) {
        discrepancies.push({
          entryId: hourKey,
          ourCost,
          externalCost,
          difference: ourCost - externalCost,
        });
      } else {
        matched++;
      }
    }

    const result: ReconciliationResult = {
      success: discrepancies.length === 0,
      matched,
      unmatched: discrepancies.length,
      discrepancies,
      totalOurCost: this.roundCost(totalOurCost),
      totalExternalCost: this.roundCost(totalExternalCost),
      totalDifference: this.roundCost(totalOurCost - totalExternalCost),
    };

    this.emit('reconciliation-complete', result);
    return result;
  }

  /**
   * Mark entries as reconciled
   */
  markReconciled(entryIds: string[], externalRef: string): number {
    let count = 0;
    const now = new Date();

    for (const entry of this.entries) {
      if (entryIds.includes(entry.id)) {
        entry.reconciled = true;
        entry.reconciledAt = now;
        entry.reconciledWith = externalRef;
        count++;
      }
    }

    this.emit('entries-reconciled', { count, externalRef });
    return count;
  }

  /**
   * Get entries for a specific task
   */
  getTaskEntries(taskId: string): AuditEntry[] {
    return this.query({ taskId });
  }

  /**
   * Get total cost for a task
   */
  getTaskCost(taskId: string): number {
    return this.getTaskEntries(taskId).reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Export audit log
   */
  export(format: 'json' | 'csv' | 'ndjson' = 'json', options?: AuditQueryOptions): string {
    const entries = options ? this.query(options) : this.entries;

    if (format === 'csv') {
      const headers = [
        'id', 'sequence', 'timestamp', 'taskId', 'sessionId', 'userId', 'agentId',
        'requestId', 'tokenType', 'tokenCount', 'model', 'provider', 'pricePerMillion',
        'cost', 'currency', 'operation', 'cacheHit', 'hash', 'previousHash',
      ];
      const rows = entries.map(e => [
        e.id, e.sequence, e.timestamp.toISOString(), e.taskId, e.sessionId,
        e.userId, e.agentId || '', e.requestId, e.tokenType, e.tokenCount,
        e.model, e.provider, e.pricePerMillion, e.cost, e.currency, e.operation,
        e.cacheHit || false, e.hash, e.previousHash,
      ].join(','));
      return [headers.join(','), ...rows].join('\n');
    }

    if (format === 'ndjson') {
      return entries.map(e => JSON.stringify(e)).join('\n');
    }

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Import audit entries (for backup restore)
   */
  import(data: string, format: 'json' | 'ndjson' = 'json', validateChain: boolean = true): number {
    const entries: AuditEntry[] = format === 'ndjson'
      ? data.split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
      : JSON.parse(data);

    // Convert date strings back to Date objects
    for (const entry of entries) {
      entry.timestamp = new Date(entry.timestamp);
      if (entry.reconciledAt) {
        entry.reconciledAt = new Date(entry.reconciledAt);
      }
    }

    // Sort by sequence
    entries.sort((a, b) => a.sequence - b.sequence);

    // Validate chain if requested
    if (validateChain && !this.verifyChainIntegrity(entries)) {
      throw new Error('Import failed: Chain integrity verification failed');
    }

    // Import entries
    this.entries = entries;
    this.sequence = entries.length > 0 ? entries[entries.length - 1].sequence : 0;
    this.lastHash = entries.length > 0 ? entries[entries.length - 1].hash : 'GENESIS';

    this.emit('entries-imported', entries.length);
    return entries.length;
  }

  /**
   * Get an invoice by ID
   */
  getInvoice(invoiceId: string): ItemizedInvoice | undefined {
    return this.invoices.get(invoiceId);
  }

  /**
   * Finalize an invoice
   */
  finalizeInvoice(invoiceId: string): boolean {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.status !== 'draft') return false;

    invoice.status = 'finalized';
    this.emit('invoice-finalized', invoice);
    return true;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(content: unknown): string {
    const str = JSON.stringify(content, Object.keys(content as object).sort());
    return createHash('sha256').update(str).digest('hex');
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(): string {
    return `audit_${Date.now()}_${randomBytes(4).toString('hex')}`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${randomBytes(4).toString('hex')}`;
  }

  /**
   * Generate unique invoice ID
   */
  private generateInvoiceId(): string {
    return `inv_${Date.now()}_${randomBytes(4).toString('hex')}`;
  }

  /**
   * Round cost to reasonable precision
   */
  private roundCost(cost: number): number {
    return Math.round(cost * 1000000) / 1000000;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let tokenAuditInstance: TokenAudit | null = null;

export function getTokenAudit(): TokenAudit {
  if (!tokenAuditInstance) {
    tokenAuditInstance = new TokenAudit();
  }
  return tokenAuditInstance;
}

export function createTokenAudit(): TokenAudit {
  return new TokenAudit();
}
