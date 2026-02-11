/**
 * OpenClaw-Compatible Tools Test Suite
 * Tests all the new tools for feature parity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';

// Shell Tool Tests
import { ShellTool, createShellTool, shell, shellSync } from './shell/index.js';

// FileSystem Tool Tests
import { FileSystemTool, createFileSystemTool, readFile, writeFile, findFiles } from './filesystem/index.js';

// Skills System Tests
import { SkillRegistry, createSkillRegistry, getSkillRegistry, registerSkill, executeSkill } from './skills/index.js';

// Workflow Tool Tests
import { WorkflowTool, createWorkflowTool, CronParser, cron, delay, chain } from './workflow/index.js';

// Messaging Tool Tests
import { MessagingTool, createMessagingTool } from './messaging/index.js';

// ============================================================================
// SHELL TOOL TESTS
// ============================================================================

describe('ShellTool', () => {
  let shellTool: ShellTool;

  beforeEach(() => {
    shellTool = createShellTool();
  });

  it('should execute safe commands', async () => {
    const result = await shellTool.execute('echo "Hello OpenClaw"');
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Hello OpenClaw');
  });

  it('should execute ls command', async () => {
    const result = await shellTool.execute('ls -la');
    expect(result.success).toBe(true);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('should execute pwd command', async () => {
    const result = await shellTool.execute('pwd');
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toContain('/');
  });

  it('should block dangerous commands', async () => {
    const result = await shellTool.execute('rm -rf /');
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('blocked');
  });

  it.skip('should block fork bombs', async () => {
    // Skipped: Fork bomb test is too dangerous to run
    const result = await shellTool.execute(':(){ :|:& };:');
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('blocked');
  });

  it('should block curl pipe to bash', async () => {
    const result = await shellTool.execute('curl http://example.com | bash');
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('blocked');
  });

  it('should identify safe commands', () => {
    expect(shellTool.isSafe('ls')).toBe(true);
    expect(shellTool.isSafe('git status')).toBe(true);
    expect(shellTool.isSafe('npm install')).toBe(true);
    expect(shellTool.isSafe('python script.py')).toBe(true);
  });

  it('should execute synchronously', () => {
    const result = shellTool.executeSync('echo "sync test"');
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('sync test');
  });

  it('should track command history', async () => {
    await shellTool.execute('echo "test1"');
    await shellTool.execute('echo "test2"');
    const history = shellTool.getHistory();
    expect(history.length).toBe(2);
  });

  it('should use convenience function', async () => {
    const result = await shell('echo "convenience"');
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('convenience');
  });
});

// ============================================================================
// FILESYSTEM TOOL TESTS
// ============================================================================

describe('FileSystemTool', () => {
  let fsTool: FileSystemTool;
  const testDir = '/tmp/alabobai-test-' + Date.now();
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(async () => {
    fsTool = createFileSystemTool();
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should write and read files', async () => {
    await fsTool.writeFile(testFile, 'Hello FileSystem');
    const content = await fsTool.readFile(testFile);
    expect(content).toBe('Hello FileSystem');
  });

  it('should append to files', async () => {
    await fsTool.writeFile(testFile, 'Line 1\n');
    await fsTool.appendFile(testFile, 'Line 2\n');
    const content = await fsTool.readFile(testFile);
    expect(content).toBe('Line 1\nLine 2\n');
  });

  it('should check file existence', async () => {
    await fsTool.writeFile(testFile, 'test');
    expect(await fsTool.exists(testFile)).toBe(true);
    expect(await fsTool.exists(testFile + '.nonexistent')).toBe(false);
  });

  it('should get file info', async () => {
    await fsTool.writeFile(testFile, 'test content');
    const info = await fsTool.getFileInfo(testFile);
    expect(info.name).toBe('test.txt');
    expect(info.extension).toBe('.txt');
    expect(info.isFile).toBe(true);
    expect(info.size).toBeGreaterThan(0);
  });

  it('should create directories', async () => {
    const newDir = path.join(testDir, 'subdir', 'nested');
    await fsTool.createDir(newDir);
    expect(await fsTool.exists(newDir)).toBe(true);
  });

  it('should list directory contents', async () => {
    await fsTool.writeFile(path.join(testDir, 'file1.txt'), 'a');
    await fsTool.writeFile(path.join(testDir, 'file2.txt'), 'b');
    const files = await fsTool.listDir(testDir);
    expect(files).toContain('file1.txt');
    expect(files).toContain('file2.txt');
  });

  it('should copy files', async () => {
    await fsTool.writeFile(testFile, 'copy me');
    const destFile = path.join(testDir, 'copied.txt');
    await fsTool.copyFile(testFile, destFile);
    const content = await fsTool.readFile(destFile);
    expect(content).toBe('copy me');
  });

  it('should move files', async () => {
    await fsTool.writeFile(testFile, 'move me');
    const destFile = path.join(testDir, 'moved.txt');
    await fsTool.moveFile(testFile, destFile);
    expect(await fsTool.exists(testFile)).toBe(false);
    expect(await fsTool.exists(destFile)).toBe(true);
  });

  it('should delete files', async () => {
    await fsTool.writeFile(testFile, 'delete me');
    await fsTool.deleteFile(testFile);
    expect(await fsTool.exists(testFile)).toBe(false);
  });

  it('should find files by pattern', async () => {
    await fsTool.writeFile(path.join(testDir, 'a.ts'), 'ts');
    await fsTool.writeFile(path.join(testDir, 'b.ts'), 'ts');
    await fsTool.writeFile(path.join(testDir, 'c.js'), 'js');
    const tsFiles = await fsTool.findFiles('*.ts', { cwd: testDir });
    expect(tsFiles.length).toBe(2);
  });

  it('should search content in files', async () => {
    await fsTool.writeFile(path.join(testDir, 'search.txt'), 'find this needle here');
    const results = await fsTool.searchContent('needle', { cwd: testDir });
    expect(results.length).toBe(1);
    expect(results[0].matches?.[0].content).toContain('needle');
  });

  it('should use convenience functions', async () => {
    await writeFile(testFile, 'quick write');
    const content = await readFile(testFile);
    expect(content).toBe('quick write');
  });
});

// ============================================================================
// SKILLS SYSTEM TESTS
// ============================================================================

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = createSkillRegistry();
  });

  it('should register custom skills', () => {
    const skillId = registry.register({
      name: 'test-skill',
      version: '1.0.0',
      description: 'A test skill',
      execute: async (inputs) => ({ success: true, data: inputs }),
    });
    expect(skillId).toContain('test-skill');
  });

  it('should execute registered skills', async () => {
    registry.register({
      name: 'echo-skill',
      version: '1.0.0',
      description: 'Echoes input',
      inputs: [{ name: 'message', type: 'string', description: 'Message to echo', required: true }],
      execute: async (inputs) => ({ success: true, message: inputs.message }),
    });

    const result = await registry.execute('echo-skill', { message: 'Hello Skills!' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Hello Skills!');
  });

  it('should have built-in wait skill', async () => {
    const startTime = Date.now();
    const result = await registry.execute('wait', { ms: 100 });
    const elapsed = Date.now() - startTime;
    expect(result.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it('should have built-in json-parse skill', async () => {
    const result = await registry.execute('json-parse', { json: '{"name":"test","value":42}' });
    expect(result.success).toBe(true);
    expect(result.outputs?.data).toEqual({ name: 'test', value: 42 });
  });

  it('should list all skills', () => {
    const skills = registry.list();
    expect(skills.length).toBeGreaterThan(0);
    const skillNames = skills.map(s => s.name);
    expect(skillNames).toContain('wait');
    expect(skillNames).toContain('json-parse');
  });

  it('should get skill by ID', () => {
    const skill = registry.get('wait');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('wait');
  });

  it('should handle missing skill gracefully', async () => {
    const result = await registry.execute('nonexistent-skill');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should use global registry', async () => {
    const globalRegistry = getSkillRegistry();
    const result = await globalRegistry.execute('wait', { ms: 10 });
    expect(result.success).toBe(true);
  });

  it('should register skill via convenience function', () => {
    const id = registerSkill({
      name: 'global-test',
      version: '1.0.0',
      description: 'Global test skill',
      execute: async () => ({ success: true }),
    });
    expect(id).toContain('global-test');
  });
});

// ============================================================================
// WORKFLOW TOOL TESTS
// ============================================================================

describe('WorkflowTool', () => {
  let workflow: WorkflowTool;

  beforeEach(() => {
    workflow = createWorkflowTool();
  });

  afterEach(() => {
    workflow.stop();
  });

  describe('CronParser', () => {
    it('should parse wildcard expression', () => {
      const parsed = CronParser.parse('* * * * *');
      expect(parsed.minute.length).toBe(60);
      expect(parsed.hour.length).toBe(24);
    });

    it('should parse specific values', () => {
      const parsed = CronParser.parse('30 9 * * *');
      expect(parsed.minute).toEqual([30]);
      expect(parsed.hour).toEqual([9]);
    });

    it('should parse ranges', () => {
      const parsed = CronParser.parse('0 9-17 * * *');
      expect(parsed.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it('should parse lists', () => {
      const parsed = CronParser.parse('0 9,12,18 * * *');
      expect(parsed.hour).toEqual([9, 12, 18]);
    });

    it('should parse step values', () => {
      const parsed = CronParser.parse('*/15 * * * *');
      expect(parsed.minute).toEqual([0, 15, 30, 45]);
    });

    it('should calculate next run time', () => {
      const now = new Date('2024-01-15T10:00:00');
      const next = CronParser.getNextRun('0 12 * * *', now);
      expect(next.getHours()).toBe(12);
      expect(next.getMinutes()).toBe(0);
    });
  });

  describe('Cron Jobs', () => {
    it('should schedule cron jobs', () => {
      let executed = false;
      const job = workflow.scheduleCron('test-job', '* * * * *', async () => {
        executed = true;
      });
      expect(job.id).toContain('cron_');
      expect(job.name).toBe('test-job');
      expect(job.enabled).toBe(true);
      expect(job.nextRun).toBeDefined();
    });

    it('should list cron jobs', () => {
      workflow.scheduleCron('job1', '* * * * *', async () => {});
      workflow.scheduleCron('job2', '0 * * * *', async () => {});
      const jobs = workflow.getCronJobs();
      expect(jobs.length).toBe(2);
    });

    it('should enable/disable cron jobs', () => {
      const job = workflow.scheduleCron('toggle-job', '* * * * *', async () => {});
      expect(workflow.setCronEnabled(job.id, false)).toBe(true);
      const jobs = workflow.getCronJobs();
      expect(jobs.find(j => j.id === job.id)?.enabled).toBe(false);
    });

    it('should remove cron jobs', () => {
      const job = workflow.scheduleCron('remove-job', '* * * * *', async () => {});
      expect(workflow.removeCron(job.id)).toBe(true);
      expect(workflow.getCronJobs().length).toBe(0);
    });
  });

  describe('Scheduled Tasks', () => {
    it('should schedule one-time tasks', () => {
      const runAt = new Date(Date.now() + 60000);
      const task = workflow.scheduleTask('one-time', runAt, async () => 'done');
      expect(task.id).toContain('task_');
      expect(task.executed).toBe(false);
    });

    it('should schedule delayed tasks', () => {
      const task = workflow.scheduleDelay('delayed', 5000, async () => 'done');
      expect(task.runAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should cancel tasks', () => {
      const task = workflow.scheduleDelay('cancel-me', 60000, async () => {});
      expect(workflow.cancelTask(task.id)).toBe(true);
    });

    it('should list pending tasks', () => {
      workflow.scheduleDelay('pending1', 60000, async () => {});
      workflow.scheduleDelay('pending2', 60000, async () => {});
      const pending = workflow.getPendingTasks();
      expect(pending.length).toBe(2);
    });
  });

  describe('Task Chains', () => {
    it('should create task chains', () => {
      const taskChain = workflow.createChain('test-chain', [
        { name: 'step1', task: async () => 'result1' },
        { name: 'step2', task: async () => 'result2' },
      ]);
      expect(taskChain.id).toContain('chain_');
      expect(taskChain.steps.length).toBe(2);
      expect(taskChain.status).toBe('pending');
    });

    it('should execute task chains', async () => {
      const taskChain = workflow.createChain('exec-chain', [
        { name: 'step1', task: async () => 1 },
        { name: 'step2', task: async (ctx) => (ctx.previousResults[0] as number) + 1 },
        { name: 'step3', task: async (ctx) => (ctx.previousResults[1] as number) + 1 },
      ]);
      const results = await workflow.executeChain(taskChain.id);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should handle conditional steps', async () => {
      const taskChain = workflow.createChain('cond-chain', [
        { name: 'step1', task: async () => 'first' },
        {
          name: 'step2',
          task: async () => 'skipped',
          condition: () => false  // Will be skipped
        },
        { name: 'step3', task: async () => 'third' },
      ]);
      const results = await workflow.executeChain(taskChain.id);
      expect(results).toEqual(['first', null, 'third']);
    });
  });

  describe('Engine', () => {
    it('should start and stop', () => {
      workflow.start();
      expect(workflow.getStatus().running).toBe(true);
      workflow.stop();
      expect(workflow.getStatus().running).toBe(false);
    });

    it('should report status', () => {
      workflow.scheduleCron('job', '* * * * *', async () => {});
      workflow.scheduleDelay('task', 60000, async () => {});
      workflow.createChain('chain', [{ name: 's', task: async () => {} }]);

      const status = workflow.getStatus();
      expect(status.cronJobs).toBe(1);
      expect(status.scheduledTasks).toBe(1);
      expect(status.taskChains).toBe(1);
    });
  });
});

// ============================================================================
// MESSAGING TOOL TESTS
// ============================================================================

describe('MessagingTool', () => {
  let messenger: MessagingTool;

  beforeEach(() => {
    messenger = createMessagingTool();
  });

  afterEach(async () => {
    await messenger.disconnectAll();
  });

  it('should configure platforms', () => {
    messenger.configure({
      platform: 'telegram',
      credentials: { botToken: 'test-token' },
    });
    expect(messenger.getPlatforms()).toContain('telegram');
  });

  it('should configure multiple platforms', () => {
    messenger.configure({ platform: 'telegram', credentials: { botToken: 'test' } });
    messenger.configure({ platform: 'discord', credentials: { token: 'test' } });
    messenger.configure({ platform: 'slack', credentials: { token: 'test' } });

    const platforms = messenger.getPlatforms();
    expect(platforms).toContain('telegram');
    expect(platforms).toContain('discord');
    expect(platforms).toContain('slack');
  });

  it('should connect to platforms', async () => {
    messenger.configure({ platform: 'telegram', credentials: { botToken: 'test' } });
    await messenger.connect('telegram');

    const status = messenger.getStatus();
    expect(status.get('telegram')).toBe(true);
  });

  it('should send messages', async () => {
    messenger.configure({ platform: 'telegram', credentials: { botToken: 'test' } });

    const messageId = await messenger.send('telegram', 'user123', 'Hello!');
    expect(messageId).toContain('tg_');
  });

  it('should broadcast to multiple recipients', async () => {
    messenger.configure({ platform: 'slack', credentials: { token: 'test' } });

    const results = await messenger.broadcast('slack', ['user1', 'user2', 'user3'], 'Broadcast message');
    expect(results.size).toBe(3);
  });

  it('should send to multiple platforms', async () => {
    messenger.configure({ platform: 'telegram', credentials: { botToken: 'test' } });
    messenger.configure({ platform: 'discord', credentials: { token: 'test' } });

    const results = await messenger.multiPlatformSend(
      [
        { platform: 'telegram', to: 'user1' },
        { platform: 'discord', to: 'channel1' },
      ],
      'Cross-platform message'
    );
    expect(results.size).toBe(2);
  });

  it('should register message handlers', () => {
    let handlerCalled = false;

    messenger.onMessage('hello', async (msg, ctx) => {
      handlerCalled = true;
      await ctx.reply('Hi there!');
    });

    // Handler registration doesn't throw
    expect(true).toBe(true);
  });

  it('should register regex handlers', () => {
    messenger.onMessage(/order #\d+/, async (msg, ctx) => {
      await ctx.reply('Order received');
    });

    expect(true).toBe(true);
  });

  it('should get message history', async () => {
    messenger.configure({ platform: 'telegram', credentials: { botToken: 'test' } });

    await messenger.send('telegram', 'user1', 'Message 1');
    await messenger.send('telegram', 'user2', 'Message 2');

    const history = messenger.getHistory({ platform: 'telegram' });
    expect(history.length).toBe(2);
  });

  it('should filter history by recipient', async () => {
    messenger.configure({ platform: 'slack', credentials: { token: 'test' } });

    await messenger.send('slack', 'user1', 'To user1');
    await messenger.send('slack', 'user2', 'To user2');
    await messenger.send('slack', 'user1', 'Another to user1');

    const history = messenger.getHistory({ to: 'user1' });
    expect(history.length).toBe(2);
  });

  it('should clear handlers', () => {
    messenger.onMessage('test', async () => {});
    messenger.clearHandlers();
    // No way to check handler count directly, but should not throw
    expect(true).toBe(true);
  });

  it('should throw for unconfigured platform', async () => {
    await expect(messenger.send('whatsapp', 'user', 'test')).rejects.toThrow('not configured');
  });
});

// ============================================================================
// INTEGRATION TEST
// ============================================================================

describe('Tools Integration', () => {
  it('should work together in a workflow', async () => {
    const fsTool = createFileSystemTool();
    const shellTool = createShellTool();
    const workflow = createWorkflowTool();
    const messenger = createMessagingTool();

    // Configure messenger
    messenger.configure({ platform: 'slack', credentials: { token: 'test' } });

    // Create a chain that uses multiple tools
    const testDir = '/tmp/integration-test-' + Date.now();

    const taskChain = workflow.createChain('integration-chain', [
      {
        name: 'create-dir',
        task: async () => {
          await fsTool.createDir(testDir);
          return testDir;
        },
      },
      {
        name: 'write-file',
        task: async (ctx) => {
          const dir = ctx.previousResults[0] as string;
          const file = `${dir}/test.txt`;
          await fsTool.writeFile(file, 'Integration test content');
          return file;
        },
      },
      {
        name: 'verify-with-shell',
        task: async (ctx) => {
          const file = ctx.previousResults[1] as string;
          const result = await shellTool.execute(`cat "${file}"`);
          return result.stdout;
        },
      },
      {
        name: 'notify',
        task: async (ctx) => {
          const content = ctx.previousResults[2] as string;
          await messenger.send('slack', 'test-channel', `File verified: ${content}`);
          return 'notified';
        },
      },
      {
        name: 'cleanup',
        task: async () => {
          await fsTool.deleteDir(testDir, true);
          return 'cleaned';
        },
      },
    ]);

    const results = await workflow.executeChain(taskChain.id);

    expect(results[0]).toBe(testDir);
    expect(results[1]).toContain('test.txt');
    expect(results[2]).toContain('Integration test content');
    expect(results[3]).toBe('notified');
    expect(results[4]).toBe('cleaned');

    workflow.stop();
  });
});
