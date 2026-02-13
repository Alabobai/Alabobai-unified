/**
 * Alabobai Reliability Engine - Test Suite
 *
 * Demonstrates usage of all reliability components
 */

// @ts-nocheck - Test file may require @types/jest installation
/* eslint-disable */

import {
  ReliabilityEngine,
  createReliabilityEngine,
  SourceQuality,
  createConfidenceScorer,
  createFactChecker,
  createConsistencyManager,
  createTimeoutProtector,
  createCheckpointManager,
} from './index.js';

// ============================================================================
// UNIT TEST EXAMPLES
// ============================================================================

describe('ConfidenceScorer', () => {
  const scorer = createConfidenceScorer();

  test('scores response with high-quality sources', async () => {
    const score = await scorer.scoreResponse(
      'The capital of France is Paris. According to official French government data, Paris has a population of approximately 2.2 million people as of 2023.',
      {
        query: 'What is the capital of France?',
        sources: [
          {
            url: 'https://www.gouvernement.fr/paris',
            domain: 'gouvernement.fr',
            type: 'GOVERNMENT',
            quality: SourceQuality.GOVERNMENT,
            verified: true,
          },
        ],
        domain: 'geography',
      }
    );

    expect(score.overall).toBeGreaterThan(60);
    expect(score.grade).toMatch(/[ABC]/);
    expect(score.factors.sourceQuality).toBeGreaterThan(80);
  });

  test('scores response with low-quality sources', async () => {
    const score = await scorer.scoreResponse(
      'I think the capital might be Paris but I am not sure.',
      {
        query: 'What is the capital of France?',
        sources: [],
      }
    );

    expect(score.overall).toBeLessThan(60);
    expect(score.factors.hedging).toBeLessThan(100);
    expect(score.warnings.length).toBeGreaterThan(0);
  });

  test('classifies sources correctly', () => {
    const academic = scorer.classifySource('https://arxiv.org/abs/1234.5678');
    expect(academic.type).toBe('ACADEMIC');
    expect(academic.quality).toBe(SourceQuality.ACADEMIC);

    const reddit = scorer.classifySource('https://www.reddit.com/r/test');
    expect(reddit.type).toBe('FORUM_GENERAL');
    expect(reddit.quality).toBe(SourceQuality.FORUM_GENERAL);
  });
});

describe('FactChecker', () => {
  const factChecker = createFactChecker();

  test('extracts claims from text', async () => {
    const report = await factChecker.checkResponse(
      'In 2023, the global population exceeded 8 billion. Scientists in a study found that regular exercise improves sleep quality.',
      { domain: 'science' }
    );

    expect(report.claims.length).toBeGreaterThan(0);
    expect(report.claims.some(c => c.type === 'statistical')).toBe(true);
    expect(report.claims.some(c => c.type === 'scientific')).toBe(true);
  });

  test('identifies opinion vs factual claims', async () => {
    const report = await factChecker.checkResponse(
      'JavaScript should be considered the best programming language. Python was created in 1991.',
      { domain: 'technology' }
    );

    const opinions = report.claims.filter(c => c.type === 'opinion');
    const factual = report.claims.filter(c => c.type !== 'opinion');

    expect(opinions.length).toBeGreaterThan(0);
    expect(factual.length).toBeGreaterThan(0);
  });
});

describe('ConsistencyManager', () => {
  const consistencyManager = createConsistencyManager();

  test('creates and manages profiles', () => {
    const profile = consistencyManager.createProfile(
      'test-profile',
      'claude-sonnet-4-20250514',
      'You are a helpful assistant.'
    );

    expect(profile.id).toBeDefined();
    expect(profile.modelVersion.model).toBe('claude-sonnet-4');
    expect(profile.config.seed).toBeDefined();

    const retrieved = consistencyManager.getProfile(profile.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test-profile');
  });

  test('tracks execution consistency', async () => {
    const profile = consistencyManager.createProfile(
      'consistency-test',
      'claude-sonnet-4-20250514',
      'Answer concisely.'
    );

    // Record first execution
    await consistencyManager.recordExecution(
      profile.id,
      'What is 2+2?',
      'The answer is 4.',
      100,
      { input: 10, output: 5, total: 15 }
    );

    // Record second execution with same input
    await consistencyManager.recordExecution(
      profile.id,
      'What is 2+2?',
      'The answer is 4.',
      95,
      { input: 10, output: 5, total: 15 }
    );

    // Check consistency
    const check = await consistencyManager.checkConsistency(
      profile.id,
      'What is 2+2?',
      'The answer is 4.'
    );

    expect(check.isConsistent).toBe(true);
    expect(check.similarity).toBe(100);
  });
});

describe('TimeoutProtector', () => {
  const timeoutProtector = createTimeoutProtector({
    defaultTimeout: 1000,
    retryAttempts: 1,
  });

  test('executes within timeout', async () => {
    const result = await timeoutProtector.executeWithTimeout(
      'fast-operation',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      },
      { timeout: 500 }
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.elapsed).toBeLessThan(500);
  });

  test('handles timeout with fallback', async () => {
    const result = await timeoutProtector.executeWithTimeout(
      'slow-operation',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return 'never-reached';
      },
      {
        timeout: 100,
        fallback: async () => 'fallback-response',
      }
    );

    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(result.data).toBe('fallback-response');
  });

  test('provides guaranteed 60-second execution', async () => {
    const result = await timeoutProtector.executeGuaranteed(
      'guaranteed-op',
      async () => 'quick-result'
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe('quick-result');
  });
});

describe('CheckpointManager', () => {
  test('creates and restores checkpoints', async () => {
    const checkpointManager = await createCheckpointManager({
      storageDir: '/tmp/alabobai-test-checkpoints',
    });

    const state = {
      conversation: {
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
          { id: '2', role: 'assistant', content: 'Hi there!', timestamp: new Date() },
        ],
        context: { topic: 'greeting' },
      },
      tasks: [],
      agents: [],
      memory: { shortTerm: {}, longTerm: {} },
    };

    const checkpoint = await checkpointManager.createCheckpoint(
      'test-session',
      state,
      'manual',
      'Test checkpoint'
    );

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.label).toBe('Test checkpoint');

    const restored = await checkpointManager.restoreCheckpoint(checkpoint.id);
    expect(restored.conversation.messages.length).toBe(2);
    expect(restored.conversation.context.topic).toBe('greeting');
  });
});

describe('ReliabilityEngine Integration', () => {
  test('executes with full reliability checks', async () => {
    const engine = await createReliabilityEngine({
      globalSettings: {
        enabled: true,
        strictMode: false,
        minConfidenceThreshold: 30,
        enableAutoCheckpoint: false,
        autoCheckpointInterval: 60000,
        logLevel: 'error',
      },
    });

    const response = await engine.execute(
      {
        id: 'test-request-1',
        sessionId: 'test-session',
        input: 'What is the speed of light?',
        operation: 'test-query',
        requireFactCheck: true,
        requireConsistency: false,
        domain: 'science',
      },
      async () => 'The speed of light in a vacuum is approximately 299,792 kilometers per second (186,282 miles per second).'
    );

    expect(response.success).toBe(true);
    expect(response.confidence.overall).toBeGreaterThan(0);
    expect(response.factCheckReport).toBeDefined();
    expect(response.metadata.elapsed).toBeGreaterThan(0);

    // Generate report
    const report = engine.generateReport('test-session');
    expect(report.totalRequests).toBe(1);
  });

  test('handles timeout gracefully', async () => {
    const engine = await createReliabilityEngine({
      timeout: {
        defaultTimeout: 100,
        retryAttempts: 0,
      },
      globalSettings: {
        enabled: true,
        strictMode: false,
        minConfidenceThreshold: 0,
        enableAutoCheckpoint: false,
        autoCheckpointInterval: 60000,
        logLevel: 'error',
      },
    });

    const response = await engine.execute(
      {
        id: 'test-timeout',
        sessionId: 'timeout-session',
        input: 'This will timeout',
        operation: 'slow-operation',
        requireFactCheck: false,
        requireConsistency: false,
        timeout: 50,
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return 'never';
      }
    );

    expect(response.success).toBe(true);
    expect(response.warnings.some(w => w.toLowerCase().includes('timed out'))).toBe(true);
  });
});

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Basic usage with LLM
 */
async function exampleBasicUsage() {
  const engine = await createReliabilityEngine();

  // Simulate LLM call
  const mockLLMCall = async () => {
    return 'The Eiffel Tower is located in Paris, France. It was completed in 1889.';
  };

  const response = await engine.executeReliable(
    'session-123',
    'Where is the Eiffel Tower?',
    mockLLMCall,
    { domain: 'geography' }
  );

  console.log('Confidence:', response.confidence.overall);
  console.log('Grade:', response.confidence.grade);
  console.log('Warnings:', response.warnings);
}

/**
 * Example: Using consistency profiles
 */
async function exampleConsistencyProfile() {
  const engine = await createReliabilityEngine();

  // Create a profile for reproducible results
  const profile = engine.createConsistencyProfile(
    'math-assistant',
    'claude-sonnet-4-20250514',
    'You are a precise math assistant. Always show your work.',
    {
      temperature: 0,
      seed: 42,
    }
  );

  // Use the profile for consistent results
  const response = await engine.execute(
    {
      id: 'math-1',
      sessionId: 'math-session',
      input: 'Solve: 2x + 5 = 15',
      operation: 'math-solve',
      profileId: profile.id,
      requireFactCheck: false,
      requireConsistency: true,
    },
    async () => 'To solve 2x + 5 = 15:\n1. Subtract 5: 2x = 10\n2. Divide by 2: x = 5'
  );

  console.log('Consistent:', response.consistencyCheck?.isConsistent);
}

/**
 * Example: Checkpoint management
 */
async function exampleCheckpoints() {
  const engine = await createReliabilityEngine();

  // Start auto-checkpointing
  engine.startAutoCheckpoint('user-session');

  // Update state as conversation progresses
  engine.updateState('user-session', {
    conversation: {
      messages: [
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
      ],
      context: {},
    },
    tasks: [],
    agents: [],
    memory: { shortTerm: {}, longTerm: {} },
  });

  // Create manual milestone
  const checkpoint = await engine.createCheckpoint('user-session', 'Before important operation');

  // Later: restore if needed
  if (checkpoint) {
    const restored = await engine.restoreCheckpoint(checkpoint.id);
    console.log('Restored to:', checkpoint.label);
  }

  // Cleanup
  engine.stopAutoCheckpoint('user-session');
}

// Export examples for documentation
export const examples = {
  exampleBasicUsage,
  exampleConsistencyProfile,
  exampleCheckpoints,
};
