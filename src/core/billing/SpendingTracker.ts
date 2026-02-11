/**
 * Alabobai Financial Guardian - Spending Tracker
 * Real-time spending dashboard with comprehensive analytics
 *
 * Provides: Live cost tracking, spending patterns, anomaly detection
 */

import { EventEmitter } from 'events';
import { LLMProvider } from './CostEstimator.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Individual spending record
 */
export interface SpendingRecord {
  id: string;
  taskId: string;
  userId: string;
  agentId?: string;

  // Token usage
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;

  // Cost details
  cost: number;
  currency: string;

  // Context
  model: string;
  provider: LLMProvider;
  taskDescription: string;
  taskType: string;

  // Timing
  startedAt: Date;
  completedAt: Date;
  durationMs: number;

  // Tracking
  estimateId?: string;
  wasEstimateAccurate?: boolean;
  estimateVariance?: number; // percentage over/under estimate

  // Metadata
  tags: string[];
  metadata: Record<string, unknown>;
}

/**
 * Aggregated spending summary
 */
export interface SpendingSummary {
  totalCost: number;
  totalTokens: number;
  taskCount: number;
  averageCostPerTask: number;
  averageTokensPerTask: number;

  byModel: Record<string, { cost: number; tokens: number; count: number }>;
  byProvider: Record<string, { cost: number; tokens: number; count: number }>;
  byTaskType: Record<string, { cost: number; tokens: number; count: number }>;
  byAgent: Record<string, { cost: number; tokens: number; count: number }>;
  byTag: Record<string, { cost: number; tokens: number; count: number }>;

  period: {
    start: Date;
    end: Date;
    durationDays: number;
  };
}

/**
 * Time-series data point for charts
 */
export interface SpendingDataPoint {
  timestamp: Date;
  cost: number;
  tokens: number;
  taskCount: number;
}

/**
 * Spending anomaly detection result
 */
export interface SpendingAnomaly {
  id: string;
  type: 'spike' | 'unusual-model' | 'high-frequency' | 'budget-warning';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, unknown>;
  detectedAt: Date;
  records: string[]; // Related spending record IDs
}

/**
 * Dashboard data for UI
 */
export interface DashboardData {
  // Current session
  sessionSpending: number;
  sessionTokens: number;
  sessionTasks: number;

  // Today
  todaySpending: number;
  todayTokens: number;
  todayTasks: number;
  todayBudgetUsed: number; // percentage

  // This week
  weekSpending: number;
  weekTokens: number;
  weekTasks: number;
  weekBudgetUsed: number;

  // This month
  monthSpending: number;
  monthTokens: number;
  monthTasks: number;
  monthBudgetUsed: number;

  // All time
  allTimeSpending: number;
  allTimeTokens: number;
  allTimeTasks: number;

  // Recent activity
  recentRecords: SpendingRecord[];
  recentAnomalies: SpendingAnomaly[];

  // Charts
  hourlyData: SpendingDataPoint[];
  dailyData: SpendingDataPoint[];
  weeklyData: SpendingDataPoint[];

  // Top consumers
  topModels: { model: string; cost: number; percentage: number }[];
  topAgents: { agent: string; cost: number; percentage: number }[];
  topTaskTypes: { type: string; cost: number; percentage: number }[];

  // Rates
  currentBurnRate: number; // cost per hour
  projectedDailyCost: number;
  projectedMonthlyCost: number;

  // Updated
  lastUpdated: Date;
}

// ============================================================================
// SPENDING TRACKER CLASS
// ============================================================================

export class SpendingTracker extends EventEmitter {
  private records: SpendingRecord[] = [];
  private anomalies: SpendingAnomaly[] = [];
  private sessionStart: Date = new Date();
  private userId: string = 'default';

  // Budget references (set by BudgetManager)
  private dailyBudget: number = Infinity;
  private weeklyBudget: number = Infinity;
  private monthlyBudget: number = Infinity;

  // Anomaly detection thresholds
  private spikeThreshold: number = 3.0; // 3x average is a spike
  private frequencyThreshold: number = 60; // More than 60 tasks/hour is unusual

  constructor(userId?: string) {
    super();
    if (userId) {
      this.userId = userId;
    }
  }

  /**
   * Record a spending event
   */
  record(params: Omit<SpendingRecord, 'id' | 'currency'>): SpendingRecord {
    const record: SpendingRecord = {
      ...params,
      id: this.generateRecordId(),
      currency: 'USD',
    };

    this.records.push(record);

    // Check for anomalies
    this.checkForAnomalies(record);

    // Emit events
    this.emit('spending-recorded', record);
    this.emit('dashboard-updated', this.getDashboardData());

    return record;
  }

  /**
   * Create a spending record from token usage
   */
  recordFromUsage(params: {
    taskId: string;
    userId: string;
    agentId?: string;
    inputTokens: number;
    outputTokens: number;
    cacheTokens?: number;
    model: string;
    provider: LLMProvider;
    taskDescription: string;
    taskType: string;
    startedAt: Date;
    completedAt: Date;
    estimateId?: string;
    estimatedCost?: number;
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    cachePricePerMillion?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): SpendingRecord {
    const {
      inputTokens,
      outputTokens,
      cacheTokens = 0,
      inputPricePerMillion,
      outputPricePerMillion,
      cachePricePerMillion = 0,
      estimatedCost,
      startedAt,
      completedAt,
      ...rest
    } = params;

    // Calculate actual cost
    const inputCost = (inputTokens / 1_000_000) * inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * outputPricePerMillion;
    const cacheCost = (cacheTokens / 1_000_000) * cachePricePerMillion;
    const totalCost = inputCost + outputCost + cacheCost;

    // Calculate estimate variance
    let wasEstimateAccurate: boolean | undefined;
    let estimateVariance: number | undefined;
    if (estimatedCost !== undefined && estimatedCost > 0) {
      estimateVariance = ((totalCost - estimatedCost) / estimatedCost) * 100;
      wasEstimateAccurate = Math.abs(estimateVariance) <= 25; // Within 25% is accurate
    }

    return this.record({
      ...rest,
      inputTokens,
      outputTokens,
      cacheTokens,
      totalTokens: inputTokens + outputTokens + cacheTokens,
      cost: Math.round(totalCost * 10000) / 10000,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      estimateId: params.estimateId,
      wasEstimateAccurate,
      estimateVariance,
      tags: params.tags || [],
      metadata: params.metadata || {},
    });
  }

  /**
   * Get comprehensive dashboard data
   */
  getDashboardData(): DashboardData {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filter records by time period
    const sessionRecords = this.records.filter(r => r.completedAt >= this.sessionStart);
    const todayRecords = this.records.filter(r => r.completedAt >= todayStart);
    const weekRecords = this.records.filter(r => r.completedAt >= weekStart);
    const monthRecords = this.records.filter(r => r.completedAt >= monthStart);

    // Calculate summaries
    const calcSummary = (records: SpendingRecord[]) => ({
      spending: records.reduce((sum, r) => sum + r.cost, 0),
      tokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
      tasks: records.length,
    });

    const session = calcSummary(sessionRecords);
    const today = calcSummary(todayRecords);
    const week = calcSummary(weekRecords);
    const month = calcSummary(monthRecords);
    const allTime = calcSummary(this.records);

    // Calculate budget usage
    const todayBudgetUsed = this.dailyBudget !== Infinity
      ? (today.spending / this.dailyBudget) * 100
      : 0;
    const weekBudgetUsed = this.weeklyBudget !== Infinity
      ? (week.spending / this.weeklyBudget) * 100
      : 0;
    const monthBudgetUsed = this.monthlyBudget !== Infinity
      ? (month.spending / this.monthlyBudget) * 100
      : 0;

    // Calculate burn rate (cost per hour in last 4 hours)
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const recentRecords = this.records.filter(r => r.completedAt >= fourHoursAgo);
    const recentSpending = recentRecords.reduce((sum, r) => sum + r.cost, 0);
    const hoursElapsed = Math.max(1, (now.getTime() - fourHoursAgo.getTime()) / (60 * 60 * 1000));
    const currentBurnRate = recentSpending / hoursElapsed;

    // Generate chart data
    const hourlyData = this.generateHourlyData(24);
    const dailyData = this.generateDailyData(7);
    const weeklyData = this.generateWeeklyData(12);

    // Top consumers
    const topModels = this.getTopModels(monthRecords, 5);
    const topAgents = this.getTopAgents(monthRecords, 5);
    const topTaskTypes = this.getTopTaskTypes(monthRecords, 5);

    return {
      sessionSpending: this.roundCost(session.spending),
      sessionTokens: session.tokens,
      sessionTasks: session.tasks,

      todaySpending: this.roundCost(today.spending),
      todayTokens: today.tokens,
      todayTasks: today.tasks,
      todayBudgetUsed: Math.round(todayBudgetUsed * 10) / 10,

      weekSpending: this.roundCost(week.spending),
      weekTokens: week.tokens,
      weekTasks: week.tasks,
      weekBudgetUsed: Math.round(weekBudgetUsed * 10) / 10,

      monthSpending: this.roundCost(month.spending),
      monthTokens: month.tokens,
      monthTasks: month.tasks,
      monthBudgetUsed: Math.round(monthBudgetUsed * 10) / 10,

      allTimeSpending: this.roundCost(allTime.spending),
      allTimeTokens: allTime.tokens,
      allTimeTasks: allTime.tasks,

      recentRecords: this.records.slice(-10).reverse(),
      recentAnomalies: this.anomalies.slice(-5).reverse(),

      hourlyData,
      dailyData,
      weeklyData,

      topModels,
      topAgents,
      topTaskTypes,

      currentBurnRate: this.roundCost(currentBurnRate),
      projectedDailyCost: this.roundCost(currentBurnRate * 24),
      projectedMonthlyCost: this.roundCost(currentBurnRate * 24 * 30),

      lastUpdated: now,
    };
  }

  /**
   * Get spending summary for a time period
   */
  getSummary(startDate?: Date, endDate?: Date): SpendingSummary {
    const start = startDate || new Date(0);
    const end = endDate || new Date();

    const filtered = this.records.filter(
      r => r.completedAt >= start && r.completedAt <= end
    );

    const totalCost = filtered.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = filtered.reduce((sum, r) => sum + r.totalTokens, 0);

    const byModel: SpendingSummary['byModel'] = {};
    const byProvider: SpendingSummary['byProvider'] = {};
    const byTaskType: SpendingSummary['byTaskType'] = {};
    const byAgent: SpendingSummary['byAgent'] = {};
    const byTag: SpendingSummary['byTag'] = {};

    for (const record of filtered) {
      // By model
      if (!byModel[record.model]) {
        byModel[record.model] = { cost: 0, tokens: 0, count: 0 };
      }
      byModel[record.model].cost += record.cost;
      byModel[record.model].tokens += record.totalTokens;
      byModel[record.model].count++;

      // By provider
      if (!byProvider[record.provider]) {
        byProvider[record.provider] = { cost: 0, tokens: 0, count: 0 };
      }
      byProvider[record.provider].cost += record.cost;
      byProvider[record.provider].tokens += record.totalTokens;
      byProvider[record.provider].count++;

      // By task type
      if (!byTaskType[record.taskType]) {
        byTaskType[record.taskType] = { cost: 0, tokens: 0, count: 0 };
      }
      byTaskType[record.taskType].cost += record.cost;
      byTaskType[record.taskType].tokens += record.totalTokens;
      byTaskType[record.taskType].count++;

      // By agent
      if (record.agentId) {
        if (!byAgent[record.agentId]) {
          byAgent[record.agentId] = { cost: 0, tokens: 0, count: 0 };
        }
        byAgent[record.agentId].cost += record.cost;
        byAgent[record.agentId].tokens += record.totalTokens;
        byAgent[record.agentId].count++;
      }

      // By tag
      for (const tag of record.tags) {
        if (!byTag[tag]) {
          byTag[tag] = { cost: 0, tokens: 0, count: 0 };
        }
        byTag[tag].cost += record.cost;
        byTag[tag].tokens += record.totalTokens;
        byTag[tag].count++;
      }
    }

    return {
      totalCost: this.roundCost(totalCost),
      totalTokens,
      taskCount: filtered.length,
      averageCostPerTask: filtered.length > 0 ? this.roundCost(totalCost / filtered.length) : 0,
      averageTokensPerTask: filtered.length > 0 ? Math.round(totalTokens / filtered.length) : 0,
      byModel,
      byProvider,
      byTaskType,
      byAgent,
      byTag,
      period: {
        start,
        end,
        durationDays: Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
      },
    };
  }

  /**
   * Get records for a specific task
   */
  getRecordsByTask(taskId: string): SpendingRecord[] {
    return this.records.filter(r => r.taskId === taskId);
  }

  /**
   * Get records for a specific user
   */
  getRecordsByUser(userId: string): SpendingRecord[] {
    return this.records.filter(r => r.userId === userId);
  }

  /**
   * Get total spending for a task
   */
  getTaskSpending(taskId: string): number {
    return this.records
      .filter(r => r.taskId === taskId)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Set budget references for dashboard calculations
   */
  setBudgets(daily: number, weekly: number, monthly: number): void {
    this.dailyBudget = daily;
    this.weeklyBudget = weekly;
    this.monthlyBudget = monthly;
  }

  /**
   * Reset session tracking
   */
  resetSession(): void {
    this.sessionStart = new Date();
    this.emit('session-reset');
  }

  /**
   * Export records for backup/analysis
   */
  exportRecords(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'id', 'taskId', 'userId', 'agentId', 'inputTokens', 'outputTokens',
        'cacheTokens', 'totalTokens', 'cost', 'currency', 'model', 'provider',
        'taskDescription', 'taskType', 'startedAt', 'completedAt', 'durationMs',
      ];
      const rows = this.records.map(r => [
        r.id, r.taskId, r.userId, r.agentId || '', r.inputTokens, r.outputTokens,
        r.cacheTokens, r.totalTokens, r.cost, r.currency, r.model, r.provider,
        `"${r.taskDescription.replace(/"/g, '""')}"`, r.taskType,
        r.startedAt.toISOString(), r.completedAt.toISOString(), r.durationMs,
      ].join(','));
      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(this.records, null, 2);
  }

  /**
   * Import records from backup
   */
  importRecords(data: string, format: 'json' | 'csv' = 'json'): number {
    let imported = 0;

    if (format === 'json') {
      const records = JSON.parse(data) as SpendingRecord[];
      for (const record of records) {
        // Convert date strings back to Date objects
        record.startedAt = new Date(record.startedAt);
        record.completedAt = new Date(record.completedAt);
        this.records.push(record);
        imported++;
      }
    }

    this.emit('records-imported', imported);
    return imported;
  }

  /**
   * Get all anomalies
   */
  getAnomalies(): SpendingAnomaly[] {
    return [...this.anomalies];
  }

  /**
   * Clear old records (keep last N days)
   */
  pruneRecords(keepDays: number = 90): number {
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
    const originalCount = this.records.length;
    this.records = this.records.filter(r => r.completedAt >= cutoff);
    const pruned = originalCount - this.records.length;
    this.emit('records-pruned', pruned);
    return pruned;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Check for spending anomalies
   */
  private checkForAnomalies(record: SpendingRecord): void {
    const recentRecords = this.records.filter(
      r => r.completedAt >= new Date(Date.now() - 60 * 60 * 1000)
    );

    // Check for cost spike
    if (recentRecords.length > 5) {
      const avgCost = recentRecords.slice(0, -1).reduce((sum, r) => sum + r.cost, 0) /
        (recentRecords.length - 1);
      if (record.cost > avgCost * this.spikeThreshold) {
        this.reportAnomaly({
          type: 'spike',
          severity: record.cost > avgCost * 5 ? 'critical' : 'warning',
          message: `Cost spike detected: $${record.cost.toFixed(4)} is ${(record.cost / avgCost).toFixed(1)}x the recent average`,
          details: { cost: record.cost, averageCost: avgCost, ratio: record.cost / avgCost },
          records: [record.id],
        });
      }
    }

    // Check for high frequency
    const hourlyTasks = recentRecords.length;
    if (hourlyTasks > this.frequencyThreshold) {
      this.reportAnomaly({
        type: 'high-frequency',
        severity: 'warning',
        message: `High task frequency: ${hourlyTasks} tasks in the last hour`,
        details: { taskCount: hourlyTasks, threshold: this.frequencyThreshold },
        records: recentRecords.map(r => r.id),
      });
    }

    // Check budget warnings
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todaySpending = this.records
      .filter(r => r.completedAt >= todayStart)
      .reduce((sum, r) => sum + r.cost, 0);

    if (this.dailyBudget !== Infinity && todaySpending > this.dailyBudget * 0.8) {
      this.reportAnomaly({
        type: 'budget-warning',
        severity: todaySpending >= this.dailyBudget ? 'critical' : 'warning',
        message: `Daily budget ${todaySpending >= this.dailyBudget ? 'exceeded' : 'at 80%'}: $${todaySpending.toFixed(2)} / $${this.dailyBudget.toFixed(2)}`,
        details: { spending: todaySpending, budget: this.dailyBudget, percentage: (todaySpending / this.dailyBudget) * 100 },
        records: [record.id],
      });
    }
  }

  /**
   * Report an anomaly
   */
  private reportAnomaly(params: Omit<SpendingAnomaly, 'id' | 'detectedAt'>): void {
    // Avoid duplicate anomalies within 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingAnomaly = this.anomalies.find(
      a => a.type === params.type && a.detectedAt >= fiveMinutesAgo
    );
    if (existingAnomaly) return;

    const anomaly: SpendingAnomaly = {
      ...params,
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      detectedAt: new Date(),
    };

    this.anomalies.push(anomaly);

    // Keep only last 100 anomalies
    if (this.anomalies.length > 100) {
      this.anomalies = this.anomalies.slice(-100);
    }

    this.emit('anomaly-detected', anomaly);
  }

  /**
   * Generate hourly chart data
   */
  private generateHourlyData(hours: number): SpendingDataPoint[] {
    const data: SpendingDataPoint[] = [];
    const now = new Date();

    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const hourRecords = this.records.filter(
        r => r.completedAt >= hourStart && r.completedAt < hourEnd
      );

      data.push({
        timestamp: hourStart,
        cost: hourRecords.reduce((sum, r) => sum + r.cost, 0),
        tokens: hourRecords.reduce((sum, r) => sum + r.totalTokens, 0),
        taskCount: hourRecords.length,
      });
    }

    return data;
  }

  /**
   * Generate daily chart data
   */
  private generateDailyData(days: number): SpendingDataPoint[] {
    const data: SpendingDataPoint[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayRecords = this.records.filter(
        r => r.completedAt >= dayStart && r.completedAt < dayEnd
      );

      data.push({
        timestamp: dayStart,
        cost: dayRecords.reduce((sum, r) => sum + r.cost, 0),
        tokens: dayRecords.reduce((sum, r) => sum + r.totalTokens, 0),
        taskCount: dayRecords.length,
      });
    }

    return data;
  }

  /**
   * Generate weekly chart data
   */
  private generateWeeklyData(weeks: number): SpendingDataPoint[] {
    const data: SpendingDataPoint[] = [];
    const now = new Date();

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const weekRecords = this.records.filter(
        r => r.completedAt >= weekStart && r.completedAt < weekEnd
      );

      data.push({
        timestamp: weekStart,
        cost: weekRecords.reduce((sum, r) => sum + r.cost, 0),
        tokens: weekRecords.reduce((sum, r) => sum + r.totalTokens, 0),
        taskCount: weekRecords.length,
      });
    }

    return data;
  }

  /**
   * Get top models by cost
   */
  private getTopModels(
    records: SpendingRecord[],
    limit: number
  ): { model: string; cost: number; percentage: number }[] {
    const totals: Record<string, number> = {};
    const totalCost = records.reduce((sum, r) => sum + r.cost, 0);

    for (const record of records) {
      const key = record.model || 'unknown';
      totals[key] = (totals[key] || 0) + record.cost;
    }

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([model, cost]) => ({
        model,
        cost: this.roundCost(cost),
        percentage: totalCost > 0 ? Math.round((cost / totalCost) * 1000) / 10 : 0,
      }));
  }

  /**
   * Get top agents by cost
   */
  private getTopAgents(
    records: SpendingRecord[],
    limit: number
  ): { agent: string; cost: number; percentage: number }[] {
    const totals: Record<string, number> = {};
    const totalCost = records.reduce((sum, r) => sum + r.cost, 0);

    for (const record of records) {
      const key = record.agentId || 'unknown';
      totals[key] = (totals[key] || 0) + record.cost;
    }

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([agent, cost]) => ({
        agent,
        cost: this.roundCost(cost),
        percentage: totalCost > 0 ? Math.round((cost / totalCost) * 1000) / 10 : 0,
      }));
  }

  /**
   * Get top task types by cost
   */
  private getTopTaskTypes(
    records: SpendingRecord[],
    limit: number
  ): { type: string; cost: number; percentage: number }[] {
    const totals: Record<string, number> = {};
    const totalCost = records.reduce((sum, r) => sum + r.cost, 0);

    for (const record of records) {
      const key = record.taskType || 'unknown';
      totals[key] = (totals[key] || 0) + record.cost;
    }

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([type, cost]) => ({
        type,
        cost: this.roundCost(cost),
        percentage: totalCost > 0 ? Math.round((cost / totalCost) * 1000) / 10 : 0,
      }));
  }

  /**
   * Generate unique record ID
   */
  private generateRecordId(): string {
    return `spend_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Round cost to reasonable precision
   */
  private roundCost(cost: number): number {
    if (cost < 0.01) {
      return Math.round(cost * 10000) / 10000;
    }
    return Math.round(cost * 100) / 100;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let spendingTrackerInstance: SpendingTracker | null = null;

export function getSpendingTracker(userId?: string): SpendingTracker {
  if (!spendingTrackerInstance) {
    spendingTrackerInstance = new SpendingTracker(userId);
  }
  return spendingTrackerInstance;
}

export function createSpendingTracker(userId?: string): SpendingTracker {
  return new SpendingTracker(userId);
}
