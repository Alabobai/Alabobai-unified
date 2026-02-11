/**
 * Alabobai Computer Control - Intervention Handler Module
 * Production-ready user intervention system for agent control
 *
 * Features:
 * - Pause agent execution at any time
 * - User takeover of mouse/keyboard
 * - Emergency stop functionality
 * - Confirmation dialogs for risky actions
 * - Rollback capabilities
 * - Session handoff between human and AI
 * - Real-time status streaming
 */

import { EventEmitter } from 'events';
import * as readline from 'readline';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type InterventionType =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'takeover'
  | 'handback'
  | 'approve'
  | 'reject'
  | 'modify'
  | 'rollback'
  | 'skip';

export type InterventionReason =
  | 'user-initiated'
  | 'safety-trigger'
  | 'error-recovery'
  | 'approval-required'
  | 'timeout'
  | 'anomaly-detected'
  | 'resource-limit'
  | 'external-signal';

export interface Intervention {
  id: string;
  type: InterventionType;
  reason: InterventionReason;
  timestamp: Date;
  source: 'user' | 'system' | 'safety' | 'api';
  message?: string;
  details?: Record<string, unknown>;
  resolvedAt?: Date;
  resolution?: string;
}

export interface ApprovalRequest {
  id: string;
  actionDescription: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  timeout: number; // ms
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'modified';
  modifiedAction?: Record<string, unknown>;
  response?: {
    decision: 'approve' | 'reject' | 'modify';
    reason?: string;
    modifiedData?: Record<string, unknown>;
    respondedAt: Date;
    respondedBy: string;
  };
}

export interface ControlState {
  isRunning: boolean;
  isPaused: boolean;
  isUserControlled: boolean;
  lastIntervention: Intervention | null;
  pendingApproval: ApprovalRequest | null;
  sessionId: string;
  agentId?: string;
  taskId?: string;
  startTime: Date;
  actionCount: number;
  interventionCount: number;
}

export interface InterventionHandlerConfig {
  enableKeyboardShortcuts?: boolean;
  emergencyStopKey?: string;
  pauseKey?: string;
  takeoverKey?: string;
  approvalTimeout?: number; // ms
  maxPauseDuration?: number; // ms, 0 = unlimited
  autoResumeOnInactivity?: boolean;
  inactivityTimeout?: number; // ms
  safetyCheckInterval?: number; // ms
  enableVoiceCommands?: boolean;
  streamStatusUpdates?: boolean;
}

export interface SafetyCheck {
  name: string;
  check: () => boolean | Promise<boolean>;
  onFail: (handler: InterventionHandler) => void | Promise<void>;
  interval?: number;
}

export type InterventionEvents = {
  'paused': (intervention: Intervention) => void;
  'resumed': (intervention: Intervention) => void;
  'stopped': (intervention: Intervention) => void;
  'takeover-started': (intervention: Intervention) => void;
  'takeover-ended': (intervention: Intervention) => void;
  'approval-requested': (request: ApprovalRequest) => void;
  'approval-resolved': (request: ApprovalRequest) => void;
  'state-changed': (state: ControlState) => void;
  'safety-triggered': (check: string, intervention: Intervention) => void;
  'error': (error: Error) => void;
  'status': (status: StatusUpdate) => void;
};

export interface StatusUpdate {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ============================================================================
// INTERVENTION HANDLER CLASS
// ============================================================================

export class InterventionHandler extends EventEmitter {
  private config: Required<InterventionHandlerConfig>;
  private state: ControlState;
  private interventionHistory: Intervention[] = [];
  private approvalHistory: ApprovalRequest[] = [];
  private safetyChecks: SafetyCheck[] = [];
  private safetyCheckTimer: NodeJS.Timeout | null = null;
  private pauseTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private keyboardListener: readline.Interface | null = null;
  private statusSubscribers: Set<(update: StatusUpdate) => void> = new Set();

  constructor(config: InterventionHandlerConfig = {}) {
    super();
    this.config = {
      enableKeyboardShortcuts: config.enableKeyboardShortcuts ?? true,
      emergencyStopKey: config.emergencyStopKey ?? 'q',
      pauseKey: config.pauseKey ?? 'p',
      takeoverKey: config.takeoverKey ?? 't',
      approvalTimeout: config.approvalTimeout ?? 60000, // 1 minute
      maxPauseDuration: config.maxPauseDuration ?? 0, // unlimited
      autoResumeOnInactivity: config.autoResumeOnInactivity ?? false,
      inactivityTimeout: config.inactivityTimeout ?? 300000, // 5 minutes
      safetyCheckInterval: config.safetyCheckInterval ?? 5000, // 5 seconds
      enableVoiceCommands: config.enableVoiceCommands ?? false,
      streamStatusUpdates: config.streamStatusUpdates ?? true,
    };

    this.state = this.createInitialState();
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the intervention handler
   */
  async initialize(options: { agentId?: string; taskId?: string } = {}): Promise<void> {
    this.state = this.createInitialState();
    this.state.agentId = options.agentId;
    this.state.taskId = options.taskId;
    this.state.isRunning = true;

    // Set up keyboard shortcuts if enabled
    if (this.config.enableKeyboardShortcuts && process.stdin.isTTY) {
      this.setupKeyboardShortcuts();
    }

    // Start safety checks
    this.startSafetyChecks();

    this.emitStatus('info', 'Intervention handler initialized');
    this.emitStateChange();
  }

  /**
   * Shutdown the intervention handler
   */
  async shutdown(): Promise<void> {
    this.stopSafetyChecks();
    this.stopPauseTimer();
    this.stopInactivityTimer();

    if (this.keyboardListener) {
      this.keyboardListener.close();
      this.keyboardListener = null;
    }

    this.state.isRunning = false;
    this.emitStatus('info', 'Intervention handler shut down');
    this.emitStateChange();
  }

  // ============================================================================
  // CONTROL METHODS
  // ============================================================================

  /**
   * Pause agent execution
   */
  async pause(reason: InterventionReason = 'user-initiated', message?: string): Promise<Intervention> {
    if (this.state.isPaused) {
      throw new Error('Already paused');
    }

    const intervention = this.createIntervention('pause', reason, message);
    this.state.isPaused = true;
    this.state.lastIntervention = intervention;
    this.state.interventionCount++;

    // Start max pause timer if configured
    if (this.config.maxPauseDuration > 0) {
      this.startPauseTimer();
    }

    this.interventionHistory.push(intervention);
    this.emit('paused', intervention);
    this.emitStatus('warning', `Execution paused: ${message || reason}`);
    this.emitStateChange();

    return intervention;
  }

  /**
   * Resume agent execution
   */
  async resume(message?: string): Promise<Intervention> {
    if (!this.state.isPaused) {
      throw new Error('Not paused');
    }

    const intervention = this.createIntervention('resume', 'user-initiated', message);
    this.state.isPaused = false;
    this.state.lastIntervention = intervention;
    this.state.interventionCount++;

    this.stopPauseTimer();

    this.interventionHistory.push(intervention);
    this.emit('resumed', intervention);
    this.emitStatus('success', `Execution resumed: ${message || 'User initiated'}`);
    this.emitStateChange();

    return intervention;
  }

  /**
   * Emergency stop - immediately halt all operations
   */
  async emergencyStop(reason: string = 'Emergency stop triggered'): Promise<Intervention> {
    const intervention = this.createIntervention('stop', 'user-initiated', reason);
    intervention.details = { emergency: true };

    this.state.isRunning = false;
    this.state.isPaused = true;
    this.state.lastIntervention = intervention;
    this.state.interventionCount++;

    this.stopSafetyChecks();
    this.stopPauseTimer();

    this.interventionHistory.push(intervention);
    this.emit('stopped', intervention);
    this.emitStatus('error', `EMERGENCY STOP: ${reason}`);
    this.emitStateChange();

    return intervention;
  }

  /**
   * User takes over control
   */
  async takeover(message?: string): Promise<Intervention> {
    if (this.state.isUserControlled) {
      throw new Error('User already in control');
    }

    const intervention = this.createIntervention('takeover', 'user-initiated', message);
    this.state.isUserControlled = true;
    this.state.isPaused = true;
    this.state.lastIntervention = intervention;
    this.state.interventionCount++;

    this.interventionHistory.push(intervention);
    this.emit('takeover-started', intervention);
    this.emitStatus('info', `User takeover: ${message || 'Manual control activated'}`);
    this.emitStateChange();

    // Start inactivity timer if configured
    if (this.config.autoResumeOnInactivity) {
      this.startInactivityTimer();
    }

    return intervention;
  }

  /**
   * Hand control back to agent
   */
  async handback(message?: string): Promise<Intervention> {
    if (!this.state.isUserControlled) {
      throw new Error('User not in control');
    }

    const intervention = this.createIntervention('handback', 'user-initiated', message);
    this.state.isUserControlled = false;
    this.state.isPaused = false;
    this.state.lastIntervention = intervention;
    this.state.interventionCount++;

    this.stopInactivityTimer();

    this.interventionHistory.push(intervention);
    this.emit('takeover-ended', intervention);
    this.emitStatus('success', `Control returned to agent: ${message || ''}`);
    this.emitStateChange();

    return intervention;
  }

  /**
   * Skip the current action
   */
  async skip(message?: string): Promise<Intervention> {
    const intervention = this.createIntervention('skip', 'user-initiated', message);
    this.state.lastIntervention = intervention;
    this.state.interventionCount++;

    this.interventionHistory.push(intervention);
    this.emitStatus('info', `Action skipped: ${message || ''}`);
    this.emitStateChange();

    return intervention;
  }

  // ============================================================================
  // APPROVAL SYSTEM
  // ============================================================================

  /**
   * Request approval for an action
   */
  async requestApproval(
    actionDescription: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, unknown>,
    timeout?: number
  ): Promise<ApprovalRequest> {
    const timeoutMs = timeout ?? this.config.approvalTimeout;
    const now = new Date();

    const request: ApprovalRequest = {
      id: uuid(),
      actionDescription,
      riskLevel,
      details,
      timeout: timeoutMs,
      createdAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
      status: 'pending',
    };

    // Pause execution while waiting for approval
    if (!this.state.isPaused) {
      await this.pause('approval-required', `Approval needed: ${actionDescription}`);
    }

    this.state.pendingApproval = request;
    this.approvalHistory.push(request);
    this.emit('approval-requested', request);
    this.emitStatus('warning', `Approval required: ${actionDescription} (${riskLevel} risk)`);
    this.emitStateChange();

    return request;
  }

  /**
   * Wait for approval (blocking)
   */
  async waitForApproval(request: ApprovalRequest): Promise<{
    approved: boolean;
    modified?: Record<string, unknown>;
    reason?: string;
  }> {
    return new Promise((resolve, reject) => {
      const checkApproval = () => {
        const current = this.approvalHistory.find((r) => r.id === request.id);
        if (!current) {
          reject(new Error('Approval request not found'));
          return;
        }

        if (current.status === 'approved') {
          resolve({ approved: true, modified: current.modifiedAction, reason: current.response?.reason });
        } else if (current.status === 'rejected') {
          resolve({ approved: false, reason: current.response?.reason });
        } else if (current.status === 'modified') {
          resolve({ approved: true, modified: current.response?.modifiedData, reason: current.response?.reason });
        } else if (current.status === 'expired') {
          resolve({ approved: false, reason: 'Approval request expired' });
        } else {
          // Still pending, check again
          setTimeout(checkApproval, 100);
        }
      };

      // Set up expiration
      setTimeout(() => {
        const current = this.approvalHistory.find((r) => r.id === request.id);
        if (current && current.status === 'pending') {
          current.status = 'expired';
          this.emit('approval-resolved', current);
          this.emitStatus('warning', `Approval expired: ${current.actionDescription}`);
        }
      }, request.timeout);

      checkApproval();
    });
  }

  /**
   * Approve a pending request
   */
  async approve(requestId: string, respondedBy: string = 'user', reason?: string): Promise<void> {
    const request = this.approvalHistory.find((r) => r.id === requestId);
    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot approve: request is ${request.status}`);
    }

    request.status = 'approved';
    request.response = {
      decision: 'approve',
      reason,
      respondedAt: new Date(),
      respondedBy,
    };

    if (this.state.pendingApproval?.id === requestId) {
      this.state.pendingApproval = null;
    }

    this.emit('approval-resolved', request);
    this.emitStatus('success', `Approved: ${request.actionDescription}`);
    this.emitStateChange();

    // Auto-resume if was paused for approval
    if (this.state.isPaused) {
      await this.resume('Approval granted');
    }
  }

  /**
   * Reject a pending request
   */
  async reject(requestId: string, respondedBy: string = 'user', reason?: string): Promise<void> {
    const request = this.approvalHistory.find((r) => r.id === requestId);
    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot reject: request is ${request.status}`);
    }

    request.status = 'rejected';
    request.response = {
      decision: 'reject',
      reason,
      respondedAt: new Date(),
      respondedBy,
    };

    if (this.state.pendingApproval?.id === requestId) {
      this.state.pendingApproval = null;
    }

    this.emit('approval-resolved', request);
    this.emitStatus('warning', `Rejected: ${request.actionDescription} - ${reason || 'No reason provided'}`);
    this.emitStateChange();
  }

  /**
   * Modify and approve a request
   */
  async modifyAndApprove(
    requestId: string,
    modifications: Record<string, unknown>,
    respondedBy: string = 'user',
    reason?: string
  ): Promise<void> {
    const request = this.approvalHistory.find((r) => r.id === requestId);
    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot modify: request is ${request.status}`);
    }

    request.status = 'modified';
    request.modifiedAction = modifications;
    request.response = {
      decision: 'modify',
      reason,
      modifiedData: modifications,
      respondedAt: new Date(),
      respondedBy,
    };

    if (this.state.pendingApproval?.id === requestId) {
      this.state.pendingApproval = null;
    }

    this.emit('approval-resolved', request);
    this.emitStatus('info', `Modified and approved: ${request.actionDescription}`);
    this.emitStateChange();

    if (this.state.isPaused) {
      await this.resume('Modified approval granted');
    }
  }

  // ============================================================================
  // SAFETY CHECKS
  // ============================================================================

  /**
   * Add a safety check
   */
  addSafetyCheck(check: SafetyCheck): void {
    this.safetyChecks.push(check);
  }

  /**
   * Remove a safety check
   */
  removeSafetyCheck(name: string): void {
    this.safetyChecks = this.safetyChecks.filter((c) => c.name !== name);
  }

  /**
   * Run all safety checks immediately
   */
  async runSafetyChecks(): Promise<{ passed: boolean; failed: string[] }> {
    const failed: string[] = [];

    for (const check of this.safetyChecks) {
      try {
        const passed = await check.check();
        if (!passed) {
          failed.push(check.name);
          await check.onFail(this);

          const intervention = this.createIntervention('pause', 'safety-trigger', `Safety check failed: ${check.name}`);
          this.emit('safety-triggered', check.name, intervention);
        }
      } catch (error) {
        failed.push(check.name);
        this.emit('error', error as Error);
      }
    }

    return { passed: failed.length === 0, failed };
  }

  // ============================================================================
  // STATE & STATUS
  // ============================================================================

  /**
   * Get current state
   */
  getState(): ControlState {
    return { ...this.state };
  }

  /**
   * Check if execution should proceed
   */
  canProceed(): boolean {
    return this.state.isRunning && !this.state.isPaused && !this.state.isUserControlled && !this.state.pendingApproval;
  }

  /**
   * Wait until execution can proceed
   */
  async waitUntilCanProceed(timeoutMs?: number): Promise<boolean> {
    const startTime = Date.now();

    while (!this.canProceed()) {
      if (timeoutMs && Date.now() - startTime > timeoutMs) {
        return false;
      }

      await this.sleep(100);

      // Check if stopped
      if (!this.state.isRunning) {
        return false;
      }
    }

    return true;
  }

  /**
   * Subscribe to status updates
   */
  subscribeToStatus(callback: (update: StatusUpdate) => void): void {
    this.statusSubscribers.add(callback);
  }

  /**
   * Unsubscribe from status updates
   */
  unsubscribeFromStatus(callback: (update: StatusUpdate) => void): void {
    this.statusSubscribers.delete(callback);
  }

  /**
   * Get intervention history
   */
  getHistory(): Intervention[] {
    return [...this.interventionHistory];
  }

  /**
   * Get approval history
   */
  getApprovalHistory(): ApprovalRequest[] {
    return [...this.approvalHistory];
  }

  /**
   * Increment action count
   */
  incrementActionCount(): void {
    this.state.actionCount++;
    this.resetInactivityTimer();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createInitialState(): ControlState {
    return {
      isRunning: false,
      isPaused: false,
      isUserControlled: false,
      lastIntervention: null,
      pendingApproval: null,
      sessionId: uuid(),
      startTime: new Date(),
      actionCount: 0,
      interventionCount: 0,
    };
  }

  private createIntervention(
    type: InterventionType,
    reason: InterventionReason,
    message?: string
  ): Intervention {
    return {
      id: uuid(),
      type,
      reason,
      timestamp: new Date(),
      source: 'user',
      message,
    };
  }

  private setupKeyboardShortcuts(): void {
    if (this.keyboardListener) {
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    this.keyboardListener = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdin.on('keypress', async (str, key) => {
      if (!key) return;

      try {
        // Ctrl+C always stops
        if (key.ctrl && key.name === 'c') {
          await this.emergencyStop('Ctrl+C pressed');
          process.exit(0);
        }

        // Emergency stop key
        if (key.name === this.config.emergencyStopKey) {
          await this.emergencyStop('Emergency stop key pressed');
        }

        // Pause/resume key
        if (key.name === this.config.pauseKey) {
          if (this.state.isPaused) {
            await this.resume('Pause key pressed');
          } else {
            await this.pause('user-initiated', 'Pause key pressed');
          }
        }

        // Takeover key
        if (key.name === this.config.takeoverKey) {
          if (this.state.isUserControlled) {
            await this.handback('Takeover key pressed');
          } else {
            await this.takeover('Takeover key pressed');
          }
        }
      } catch (error) {
        this.emit('error', error as Error);
      }
    });
  }

  private startSafetyChecks(): void {
    if (this.safetyCheckTimer) {
      return;
    }

    this.safetyCheckTimer = setInterval(async () => {
      if (this.state.isRunning && !this.state.isPaused) {
        await this.runSafetyChecks();
      }
    }, this.config.safetyCheckInterval);
  }

  private stopSafetyChecks(): void {
    if (this.safetyCheckTimer) {
      clearInterval(this.safetyCheckTimer);
      this.safetyCheckTimer = null;
    }
  }

  private startPauseTimer(): void {
    if (this.pauseTimer || this.config.maxPauseDuration <= 0) {
      return;
    }

    this.pauseTimer = setTimeout(async () => {
      this.emitStatus('warning', 'Max pause duration reached, auto-resuming');
      await this.resume('Max pause duration reached');
    }, this.config.maxPauseDuration);
  }

  private stopPauseTimer(): void {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }

  private startInactivityTimer(): void {
    if (this.inactivityTimer) {
      return;
    }

    this.inactivityTimer = setTimeout(async () => {
      this.emitStatus('warning', 'Inactivity timeout, returning control to agent');
      await this.handback('Inactivity timeout');
    }, this.config.inactivityTimeout);
  }

  private stopInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private resetInactivityTimer(): void {
    if (this.state.isUserControlled && this.config.autoResumeOnInactivity) {
      this.stopInactivityTimer();
      this.startInactivityTimer();
    }
  }

  private emitStatus(type: StatusUpdate['type'], message: string, data?: Record<string, unknown>): void {
    if (!this.config.streamStatusUpdates) {
      return;
    }

    const update: StatusUpdate = {
      type,
      message,
      timestamp: new Date(),
      data,
    };

    this.emit('status', update);

    for (const subscriber of this.statusSubscribers) {
      try {
        subscriber(update);
      } catch (error) {
        this.emit('error', error as Error);
      }
    }
  }

  private emitStateChange(): void {
    this.emit('state-changed', this.getState());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.shutdown();
    this.statusSubscribers.clear();
    this.removeAllListeners();
    this.interventionHistory = [];
    this.approvalHistory = [];
    this.safetyChecks = [];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createInterventionHandler(config?: InterventionHandlerConfig): InterventionHandler {
  return new InterventionHandler(config);
}

export default InterventionHandler;
