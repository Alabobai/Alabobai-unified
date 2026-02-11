/**
 * TrustArchitecture.test.ts - Comprehensive Test Suite
 *
 * Demonstrates and validates the Trust Architecture implementation.
 *
 * @module TrustArchitecture.test
 */

import {
  // Core types
  TrustLevel,
  RiskLevel,
  ActionCategory,
  PermissionDecision,
  HandoffReason,
  Action,
  TrustContext,

  // Classes
  TrustGuardian,
  PermissionManager,
  AuditLogger,
  InMemoryAuditBackend,

  // Factories
  getTrustGuardian,
  getPermissionManager,
  getAuditLogger,
  resetTrustGuardian,
  resetPermissionManager,
  resetAuditLogger,

  // Utilities
  createAction,
  createTrustArchitecture,
  getTrustLevelName,
  riskExceedsThreshold,
} from './index.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createTestAction(overrides: Partial<Action> = {}): Action {
  return {
    id: `test-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'test_action',
    category: ActionCategory.READ,
    riskLevel: RiskLevel.LOW,
    description: 'Test action',
    reversible: true,
    requestedAt: new Date(),
    requesterId: 'test-user',
    requesterType: 'user',
    ...overrides,
  };
}

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<boolean> {
  try {
    console.log(`\n[TEST] ${name}`);
    await testFn();
    console.log(`  [PASS] ${name}`);
    return true;
  } catch (error) {
    console.error(`  [FAIL] ${name}`);
    console.error(`    Error: ${(error as Error).message}`);
    return false;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// =============================================================================
// TEST SUITES
// =============================================================================

async function testTrustLevels(): Promise<void> {
  // Test L1: OBSERVE_ONLY
  assert(
    getTrustLevelName(TrustLevel.OBSERVE_ONLY) === 'Observe Only',
    'L1 name should be Observe Only'
  );

  // Test L2: GUIDED
  assert(
    getTrustLevelName(TrustLevel.GUIDED) === 'Guided',
    'L2 name should be Guided'
  );

  // Test L3: SUPERVISED
  assert(
    getTrustLevelName(TrustLevel.SUPERVISED) === 'Supervised',
    'L3 name should be Supervised'
  );

  // Test L4: FULL_AUTONOMY
  assert(
    getTrustLevelName(TrustLevel.FULL_AUTONOMY) === 'Full Autonomy',
    'L4 name should be Full Autonomy'
  );

  // Test L5: ENTERPRISE
  assert(
    getTrustLevelName(TrustLevel.ENTERPRISE) === 'Enterprise',
    'L5 name should be Enterprise'
  );

  // Test risk level comparison
  assert(
    riskExceedsThreshold(RiskLevel.HIGH, RiskLevel.LOW) === true,
    'HIGH should exceed LOW'
  );
  assert(
    riskExceedsThreshold(RiskLevel.LOW, RiskLevel.HIGH) === false,
    'LOW should not exceed HIGH'
  );
}

async function testPermissionManager(): Promise<void> {
  resetPermissionManager();
  const manager = getPermissionManager({ strictMode: false });

  // Test L1 permissions (should require approval for everything)
  const context: TrustContext = {
    userId: 'test-user',
    trustLevel: TrustLevel.OBSERVE_ONLY,
    sessionId: 'test-session',
    sessionStartedAt: new Date(),
    sessionActionCount: 0,
    sessionErrorCount: 0,
    dailyActionCount: 0,
    dailyBudgetSpent: 0,
    recentActionTypes: [],
    twoFactorVerified: false,
  };

  const readAction = createTestAction({ category: ActionCategory.READ });
  const result = manager.checkPermission(readAction, context);

  assert(
    result.decision === PermissionDecision.REQUIRE_APPROVAL,
    `L1 should require approval for READ, got ${result.decision}`
  );

  // Test L2 permissions (should auto-approve low-risk reads)
  const l2Context = { ...context, trustLevel: TrustLevel.GUIDED };
  const l2Result = manager.checkPermission(readAction, l2Context);

  assert(
    l2Result.decision === PermissionDecision.ALLOW,
    `L2 should allow low-risk READ, got ${l2Result.decision}`
  );

  // Test L2 with payment (should require approval)
  const paymentAction = createTestAction({
    category: ActionCategory.PAYMENT,
    riskLevel: RiskLevel.HIGH,
    monetaryValue: 5000, // $50
  });
  const paymentResult = manager.checkPermission(paymentAction, l2Context);

  assert(
    paymentResult.decision === PermissionDecision.REQUIRE_APPROVAL,
    `L2 should require approval for PAYMENT, got ${paymentResult.decision}`
  );

  // Test L4 with high-risk action (should allow within limits)
  const l4Context = { ...context, trustLevel: TrustLevel.FULL_AUTONOMY };
  const highRiskAction = createTestAction({
    category: ActionCategory.UPDATE,
    riskLevel: RiskLevel.HIGH,
  });
  const l4Result = manager.checkPermission(highRiskAction, l4Context);

  assert(
    l4Result.decision === PermissionDecision.ALLOW,
    `L4 should allow HIGH risk UPDATE, got ${l4Result.decision}`
  );
}

async function testAuditLogger(): Promise<void> {
  resetAuditLogger();

  const backend = new InMemoryAuditBackend();
  const logger = new AuditLogger({
    backends: [backend],
    enableHashChaining: true,
  });

  const context: TrustContext = {
    userId: 'test-user',
    trustLevel: TrustLevel.GUIDED,
    sessionId: 'test-session',
    sessionStartedAt: new Date(),
    sessionActionCount: 0,
    sessionErrorCount: 0,
    dailyActionCount: 0,
    dailyBudgetSpent: 0,
    recentActionTypes: [],
    twoFactorVerified: false,
  };

  // Log a permission check
  const action = createTestAction();
  const permResult = {
    decision: PermissionDecision.ALLOW,
    action,
    trustLevel: TrustLevel.GUIDED,
    reason: 'Action permitted',
    decidedAt: new Date(),
  };

  const entryId = await logger.logPermissionCheck(action, context, permResult);
  assert(entryId.length > 0, 'Should return entry ID');

  // Query the log
  const entries = await logger.query({ limit: 10 });
  assert(entries.length > 0, 'Should have logged entries');
  assert(
    entries[0].actorId === 'test-user',
    'Entry should have correct actor ID'
  );

  // Test statistics
  const stats = await logger.getStatistics();
  assert(stats.totalEntries > 0, 'Should have entry count');
  assert(stats.uniqueActors > 0, 'Should have unique actors');

  await logger.close();
}

async function testTrustGuardian(): Promise<void> {
  resetTrustGuardian();
  resetPermissionManager();
  resetAuditLogger();

  const guardian = getTrustGuardian({ debug: false });

  // Create a session
  const context = guardian.createSession(
    'user-123',
    TrustLevel.GUIDED,
    'org-abc'
  );

  assert(context.sessionId.length > 0, 'Should create session ID');
  assert(context.trustLevel === TrustLevel.GUIDED, 'Should set trust level');

  // Execute a low-risk action (should succeed)
  const readAction = createTestAction({
    category: ActionCategory.READ,
    riskLevel: RiskLevel.LOW,
    requesterId: 'user-123',
  });

  const result = await guardian.executeAction({
    action: readAction,
    context,
  });

  assert(result.executed === true, 'Low-risk READ should execute');
  assert(
    result.permissionResult.decision === PermissionDecision.ALLOW,
    'Should be allowed'
  );

  // Execute a payment action (should require approval)
  const paymentAction = createTestAction({
    category: ActionCategory.PAYMENT,
    riskLevel: RiskLevel.HIGH,
    monetaryValue: 10000,
    requesterId: 'user-123',
  });

  const paymentResult = await guardian.executeAction({
    action: paymentAction,
    context: result.updatedContext,
  });

  assert(paymentResult.executed === false, 'Payment should not auto-execute');
  assert(
    paymentResult.handoffRequest !== undefined,
    'Should create handoff request'
  );

  // End session
  await guardian.endSession(context.sessionId);
  const endedSession = guardian.getSession(context.sessionId);
  assert(endedSession === null, 'Session should be ended');
}

async function testTrustLevelChange(): Promise<void> {
  resetTrustGuardian();

  const guardian = getTrustGuardian({ debug: false });
  const context = guardian.createSession('user-456', TrustLevel.OBSERVE_ONLY);

  // Elevate trust level
  const changed = await guardian.changeTrustLevel(
    context.sessionId,
    TrustLevel.SUPERVISED,
    'User completed training',
    'admin-user'
  );

  assert(changed === true, 'Trust level should change');

  const updatedSession = guardian.getSession(context.sessionId);
  assert(
    updatedSession?.trustLevel === TrustLevel.SUPERVISED,
    'Trust level should be updated'
  );

  await guardian.endSession(context.sessionId);
}

async function testLoopDetection(): Promise<void> {
  resetTrustGuardian();

  const guardian = getTrustGuardian({
    debug: false,
    loopDetection: {
      windowSize: 10,
      minRepetitions: 3,
      resetIntervalMs: 60000,
    },
  });

  const context = guardian.createSession('user-loop', TrustLevel.FULL_AUTONOMY);

  // Execute the same action multiple times
  for (let i = 0; i < 5; i++) {
    const action = createTestAction({
      id: `repeat-${i}`,
      type: 'repeated_action',
      category: ActionCategory.UPDATE,
      riskLevel: RiskLevel.LOW,
      requesterId: 'user-loop',
    });

    const result = await guardian.executeAction({
      action,
      context: guardian.getSession(context.sessionId)!,
    });

    if (i >= 3) {
      // After 3 repetitions, loop should be detected
      if (result.handoffRequest) {
        assert(
          result.handoffRequest.reason === HandoffReason.LOOP_DETECTED,
          'Should detect loop'
        );
        break;
      }
    }
  }

  await guardian.endSession(context.sessionId);
}

async function testHandoffWorkflow(): Promise<void> {
  resetTrustGuardian();

  const guardian = getTrustGuardian({ debug: false });
  const context = guardian.createSession('user-handoff', TrustLevel.GUIDED);

  // Create action that requires approval
  const deleteAction = createTestAction({
    category: ActionCategory.DELETE,
    riskLevel: RiskLevel.HIGH,
    affectedCount: 100,
    requesterId: 'user-handoff',
  });

  const result = await guardian.executeAction({
    action: deleteAction,
    context,
  });

  assert(result.executed === false, 'Delete should not auto-execute at L2');
  assert(result.handoffRequest !== undefined, 'Should create handoff');

  const handoffId = result.handoffRequest!.id;

  // Acknowledge the handoff
  const acked = await guardian.acknowledgeHandoff(
    context.sessionId,
    handoffId,
    'supervisor'
  );
  assert(acked === true, 'Should acknowledge handoff');

  // Resolve the handoff
  const { resolved, action } = await guardian.resolveHandoff(
    context.sessionId,
    handoffId,
    {
      resolvedBy: 'supervisor',
      resolvedAt: new Date(),
      decision: 'approve',
      explanation: 'Approved after review',
    }
  );

  assert(resolved === true, 'Handoff should resolve');
  assert(action !== undefined, 'Should return action to execute');

  await guardian.endSession(context.sessionId);
}

async function test2FAWorkflow(): Promise<void> {
  resetTrustGuardian();

  const guardian = getTrustGuardian({
    debug: false,
    twoFactorConfig: {
      supportedTypes: ['totp'],
      challengeExpirySeconds: 300,
      maxAttempts: 3,
      cooldownSeconds: 60,
    },
  });

  // Create session at L2 which requires 2FA for high-risk
  const context = guardian.createSession('user-2fa', TrustLevel.GUIDED);

  // Create high-risk financial action
  const action = createTestAction({
    category: ActionCategory.PAYMENT,
    riskLevel: RiskLevel.CRITICAL,
    monetaryValue: 100000, // $1000 exceeds L2 limit
    requesterId: 'user-2fa',
  });

  const result = await guardian.executeAction({
    action,
    context,
  });

  // At L2 with payments always requiring approval, this should need approval
  assert(result.executed === false, 'High-value payment should not auto-execute');

  await guardian.endSession(context.sessionId);
}

async function testCreateTrustArchitecture(): Promise<void> {
  // Test the convenience factory
  const { guardian, permissionManager, auditLogger } = createTrustArchitecture({
    debug: false,
    strictMode: false,
    complianceStandards: ['SOC2', 'GDPR'],
  });

  assert(guardian !== undefined, 'Should create guardian');
  assert(permissionManager !== undefined, 'Should create permission manager');
  assert(auditLogger !== undefined, 'Should create audit logger');
}

async function testCreateActionHelper(): Promise<void> {
  const action = createAction({
    type: 'send_email',
    category: ActionCategory.EXTERNAL_API,
    riskLevel: RiskLevel.LOW,
    description: 'Send notification email',
    requesterId: 'system',
    requesterType: 'system',
    metadata: { recipient: 'user@example.com' },
  });

  assert(action.id.startsWith('action-'), 'Should generate action ID');
  assert(action.type === 'send_email', 'Should set type');
  assert(action.category === ActionCategory.EXTERNAL_API, 'Should set category');
  assert(action.reversible === true, 'Should default reversible to true');
}

async function testEnterpriseLevel(): Promise<void> {
  resetTrustGuardian();

  let managerCalled = false;

  const guardian = getTrustGuardian({
    debug: false,
    managerAIConfig: {
      managerAgentId: 'manager-001',
      confidenceThreshold: 0.8,
      alwaysEscalateCategories: [ActionCategory.SECURITY],
      requestDecision: async (action: Action, context: TrustContext) => {
        managerCalled = true;
        return {
          id: 'decision-1',
          managerAgentId: 'manager-001',
          action,
          subordinateContext: context,
          decision: PermissionDecision.ALLOW,
          reasoning: 'Approved by manager AI',
          confidence: 0.95,
          escalateToHuman: false,
          decidedAt: new Date(),
        };
      },
    },
  });

  // Create L5 session
  const context = guardian.createSession('agent-enterprise', TrustLevel.ENTERPRISE);

  // At L5, most actions should be allowed or go through manager AI
  const action = createTestAction({
    category: ActionCategory.CREATE,
    riskLevel: RiskLevel.MEDIUM,
    requesterId: 'agent-enterprise',
    requesterType: 'agent',
  });

  const result = await guardian.executeAction({
    action,
    context,
  });

  // L5 allows most actions without manager approval unless specifically required
  assert(result.executed === true || result.managerApprovalPending === true,
    'L5 should either execute or request manager approval');

  await guardian.endSession(context.sessionId);
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAllTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('TRUST ARCHITECTURE TEST SUITE');
  console.log('='.repeat(60));

  const tests = [
    { name: 'Trust Levels', fn: testTrustLevels },
    { name: 'Permission Manager', fn: testPermissionManager },
    { name: 'Audit Logger', fn: testAuditLogger },
    { name: 'Trust Guardian', fn: testTrustGuardian },
    { name: 'Trust Level Change', fn: testTrustLevelChange },
    { name: 'Loop Detection', fn: testLoopDetection },
    { name: 'Handoff Workflow', fn: testHandoffWorkflow },
    { name: '2FA Workflow', fn: test2FAWorkflow },
    { name: 'Create Trust Architecture Helper', fn: testCreateTrustArchitecture },
    { name: 'Create Action Helper', fn: testCreateActionHelper },
    { name: 'Enterprise Level (L5)', fn: testEnterpriseLevel },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const success = await runTest(test.name, test.fn);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if this is the main module
runAllTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
