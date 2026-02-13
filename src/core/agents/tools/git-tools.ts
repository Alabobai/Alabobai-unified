/**
 * Alabobai Code Builder Agent - Git Tools
 * Safe Git operations for version control
 *
 * Features:
 * - Status, diff, log
 * - Commit, branch, checkout
 * - NO destructive operations (force push, reset --hard)
 * - Safe by default
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import type { OllamaTool } from '../../llm/types.js';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface GitToolsConfig {
  projectRoot: string;
  userName?: string;
  userEmail?: string;
  allowPush?: boolean;
  allowForcePush?: boolean; // Always false for safety
  timeout?: number;
}

export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export interface GitFileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: Date;
  body?: string;
}

export interface GitDiff {
  files: GitDiffFile[];
  stats: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  };
}

export interface GitDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  hunks?: GitDiffHunk[];
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  upstream?: string;
  lastCommit?: string;
}

// ============================================================================
// GIT TOOLS CLASS
// ============================================================================

export class GitTools extends EventEmitter {
  private config: GitToolsConfig;
  private isInitialized: boolean = false;

  constructor(config: GitToolsConfig) {
    super();
    this.config = {
      allowPush: false, // Disabled by default for safety
      allowForcePush: false, // ALWAYS false
      timeout: 30000,
      ...config,
    };
    // Force safety: never allow force push
    this.config.allowForcePush = false;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Check if the project is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git('rev-parse --git-dir');
      this.isInitialized = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.git('init');

    if (this.config.userName) {
      await this.git(`config user.name "${this.config.userName}"`);
    }
    if (this.config.userEmail) {
      await this.git(`config user.email "${this.config.userEmail}"`);
    }

    this.isInitialized = true;
    this.emit('repo-initialized', { path: this.config.projectRoot });
  }

  // ============================================================================
  // STATUS OPERATIONS
  // ============================================================================

  /**
   * Get the current git status
   */
  async status(): Promise<GitStatus> {
    const branch = await this.getCurrentBranch();
    const statusOutput = await this.git('status --porcelain=v1');

    const staged: GitFileStatus[] = [];
    const unstaged: GitFileStatus[] = [];
    const untracked: string[] = [];

    for (const line of statusOutput.split('\n').filter(Boolean)) {
      const index = line[0];
      const worktree = line[1];
      const filePath = line.substring(3).trim();

      if (index === '?' && worktree === '?') {
        untracked.push(filePath);
      } else {
        if (index !== ' ' && index !== '?') {
          staged.push({
            path: filePath,
            status: this.parseStatusCode(index),
          });
        }
        if (worktree !== ' ' && worktree !== '?') {
          unstaged.push({
            path: filePath,
            status: this.parseStatusCode(worktree),
          });
        }
      }
    }

    // Get ahead/behind
    const { ahead, behind } = await this.getAheadBehind();

    // Check for conflicts
    const hasConflicts = await this.hasConflicts();

    return {
      branch,
      isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      staged,
      unstaged,
      untracked,
      ahead,
      behind,
      hasConflicts,
    };
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git('branch --show-current');
      return branch.trim() || 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  /**
   * Check if there are merge conflicts
   */
  async hasConflicts(): Promise<boolean> {
    try {
      const output = await this.git('diff --name-only --diff-filter=U');
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // DIFF OPERATIONS
  // ============================================================================

  /**
   * Get diff of changes
   */
  async diff(options?: { staged?: boolean; file?: string; commit?: string }): Promise<GitDiff> {
    let command = 'diff';

    if (options?.staged) {
      command += ' --cached';
    }
    if (options?.commit) {
      command += ` ${options.commit}^..${options.commit}`;
    }
    if (options?.file) {
      command += ` -- "${options.file}"`;
    }

    command += ' --numstat';

    const numstat = await this.git(command);
    const files: GitDiffFile[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const line of numstat.split('\n').filter(Boolean)) {
      const [additions, deletions, filePath] = line.split('\t');
      const add = additions === '-' ? 0 : parseInt(additions);
      const del = deletions === '-' ? 0 : parseInt(deletions);

      totalInsertions += add;
      totalDeletions += del;

      files.push({
        path: filePath,
        status: 'modified',
        additions: add,
        deletions: del,
      });
    }

    return {
      files,
      stats: {
        insertions: totalInsertions,
        deletions: totalDeletions,
        filesChanged: files.length,
      },
    };
  }

  /**
   * Get detailed diff with content
   */
  async diffContent(options?: { staged?: boolean; file?: string }): Promise<string> {
    let command = 'diff';

    if (options?.staged) {
      command += ' --cached';
    }
    if (options?.file) {
      command += ` -- "${options.file}"`;
    }

    return await this.git(command);
  }

  // ============================================================================
  // LOG OPERATIONS
  // ============================================================================

  /**
   * Get commit log
   */
  async log(options?: { count?: number; file?: string; since?: string }): Promise<GitCommit[]> {
    const count = options?.count ?? 20;
    const format = '%H|%h|%s|%an|%ae|%aI|%b{{END}}';

    let command = `log -${count} --format="${format}"`;

    if (options?.file) {
      command += ` -- "${options.file}"`;
    }
    if (options?.since) {
      command += ` --since="${options.since}"`;
    }

    const output = await this.git(command);
    const commits: GitCommit[] = [];

    for (const entry of output.split('{{END}}').filter(Boolean)) {
      const lines = entry.trim().split('\n');
      if (lines.length === 0 || !lines[0]) continue;

      const [hash, shortHash, message, author, email, dateStr] = lines[0].split('|');
      const body = lines.slice(1).join('\n').trim();

      commits.push({
        hash,
        shortHash,
        message,
        author,
        email,
        date: new Date(dateStr),
        body: body || undefined,
      });
    }

    return commits;
  }

  /**
   * Get a specific commit
   */
  async show(commitHash: string): Promise<GitCommit & { diff: string }> {
    const format = '%H|%h|%s|%an|%ae|%aI|%b';
    const output = await this.git(`show ${commitHash} --format="${format}"`);

    const lines = output.split('\n');
    const [hash, shortHash, message, author, email, dateStr] = lines[0].split('|');

    // Find where diff starts
    const diffStart = lines.findIndex(l => l.startsWith('diff --git'));
    const body = lines.slice(1, diffStart > 0 ? diffStart : undefined).join('\n').trim();
    const diff = diffStart > 0 ? lines.slice(diffStart).join('\n') : '';

    return {
      hash,
      shortHash,
      message,
      author,
      email,
      date: new Date(dateStr),
      body: body || undefined,
      diff,
    };
  }

  // ============================================================================
  // STAGING OPERATIONS
  // ============================================================================

  /**
   * Stage files for commit
   */
  async add(files: string | string[]): Promise<void> {
    const fileList = Array.isArray(files) ? files : [files];

    for (const file of fileList) {
      await this.git(`add "${file}"`);
    }

    this.emit('files-staged', { files: fileList });
  }

  /**
   * Stage all changes
   */
  async addAll(): Promise<void> {
    await this.git('add -A');
    this.emit('all-staged');
  }

  /**
   * Unstage files
   */
  async unstage(files: string | string[]): Promise<void> {
    const fileList = Array.isArray(files) ? files : [files];

    for (const file of fileList) {
      await this.git(`reset HEAD "${file}"`);
    }

    this.emit('files-unstaged', { files: fileList });
  }

  /**
   * Discard changes to a file (restore to last commit)
   */
  async discardChanges(file: string): Promise<void> {
    await this.git(`checkout -- "${file}"`);
    this.emit('changes-discarded', { file });
  }

  // ============================================================================
  // COMMIT OPERATIONS
  // ============================================================================

  /**
   * Create a commit
   */
  async commit(message: string, options?: { all?: boolean }): Promise<GitCommit> {
    let command = 'commit';

    if (options?.all) {
      command += ' -a';
    }

    // Use a file for the message to avoid shell escaping issues
    command += ` -m "${message.replace(/"/g, '\\"')}"`;

    await this.git(command);

    // Get the commit we just made
    const commits = await this.log({ count: 1 });
    const commit = commits[0];

    this.emit('committed', { commit });
    return commit;
  }

  /**
   * Amend the last commit (only message, not files)
   */
  async amendMessage(newMessage: string): Promise<GitCommit> {
    await this.git(`commit --amend -m "${newMessage.replace(/"/g, '\\"')}"`);

    const commits = await this.log({ count: 1 });
    const commit = commits[0];

    this.emit('commit-amended', { commit });
    return commit;
  }

  // ============================================================================
  // BRANCH OPERATIONS
  // ============================================================================

  /**
   * List all branches
   */
  async listBranches(): Promise<GitBranch[]> {
    const output = await this.git('branch -a --format="%(refname:short)|%(upstream:short)|%(objectname:short)|%(HEAD)"');

    const branches: GitBranch[] = [];
    const currentBranch = await this.getCurrentBranch();

    for (const line of output.split('\n').filter(Boolean)) {
      const [name, upstream, lastCommit, head] = line.split('|');

      if (name.startsWith('remotes/')) {
        continue; // Skip remote branches in the list
      }

      branches.push({
        name,
        current: head === '*' || name === currentBranch,
        upstream: upstream || undefined,
        lastCommit,
      });
    }

    return branches;
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string, checkout: boolean = false): Promise<void> {
    await this.git(`branch "${name}"`);

    if (checkout) {
      await this.checkout(name);
    }

    this.emit('branch-created', { name });
  }

  /**
   * Switch to a branch
   */
  async checkout(branch: string, create: boolean = false): Promise<void> {
    const flag = create ? '-b' : '';
    await this.git(`checkout ${flag} "${branch}"`);

    this.emit('branch-switched', { branch });
  }

  /**
   * Delete a branch (not the current one, not with uncommitted changes)
   */
  async deleteBranch(name: string): Promise<void> {
    const current = await this.getCurrentBranch();
    if (name === current) {
      throw new Error('Cannot delete the current branch');
    }

    // Use -d (not -D) to prevent deleting unmerged branches
    await this.git(`branch -d "${name}"`);

    this.emit('branch-deleted', { name });
  }

  // ============================================================================
  // REMOTE OPERATIONS (LIMITED FOR SAFETY)
  // ============================================================================

  /**
   * Fetch from remote (safe operation)
   */
  async fetch(remote: string = 'origin'): Promise<void> {
    await this.git(`fetch ${remote}`);
    this.emit('fetched', { remote });
  }

  /**
   * Pull from remote (with rebase for clean history)
   */
  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    const currentBranch = branch || await this.getCurrentBranch();
    await this.git(`pull --rebase ${remote} ${currentBranch}`);
    this.emit('pulled', { remote, branch: currentBranch });
  }

  /**
   * Push to remote (only if allowed in config)
   */
  async push(remote: string = 'origin', branch?: string): Promise<void> {
    if (!this.config.allowPush) {
      throw new Error('Push is disabled for safety. Enable in config if needed.');
    }

    const currentBranch = branch || await this.getCurrentBranch();
    await this.git(`push ${remote} ${currentBranch}`);
    this.emit('pushed', { remote, branch: currentBranch });
  }

  /**
   * List remotes
   */
  async listRemotes(): Promise<{ name: string; url: string }[]> {
    const output = await this.git('remote -v');
    const remotes: Map<string, string> = new Map();

    for (const line of output.split('\n').filter(Boolean)) {
      const [name, url] = line.split(/\s+/);
      if (!remotes.has(name)) {
        remotes.set(name, url);
      }
    }

    return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
  }

  // ============================================================================
  // STASH OPERATIONS
  // ============================================================================

  /**
   * Stash current changes
   */
  async stash(message?: string): Promise<void> {
    const command = message ? `stash push -m "${message}"` : 'stash push';
    await this.git(command);
    this.emit('stashed', { message });
  }

  /**
   * Apply the latest stash
   */
  async stashPop(): Promise<void> {
    await this.git('stash pop');
    this.emit('stash-popped');
  }

  /**
   * List stashes
   */
  async stashList(): Promise<{ index: number; message: string }[]> {
    const output = await this.git('stash list');
    const stashes: { index: number; message: string }[] = [];

    for (const line of output.split('\n').filter(Boolean)) {
      const match = line.match(/stash@\{(\d+)\}:\s*(.+)/);
      if (match) {
        stashes.push({
          index: parseInt(match[1]),
          message: match[2],
        });
      }
    }

    return stashes;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async git(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${command}`, {
        cwd: this.config.projectRoot,
        timeout: this.config.timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(execError.stderr || execError.message || 'Git command failed');
    }
  }

  private parseStatusCode(code: string): GitFileStatus['status'] {
    const statusMap: Record<string, GitFileStatus['status']> = {
      A: 'added',
      M: 'modified',
      D: 'deleted',
      R: 'renamed',
      C: 'copied',
    };
    return statusMap[code] || 'modified';
  }

  private async getAheadBehind(): Promise<{ ahead: number; behind: number }> {
    try {
      const output = await this.git('rev-list --left-right --count @{upstream}...HEAD');
      const [behind, ahead] = output.trim().split(/\s+/).map(n => parseInt(n) || 0);
      return { ahead, behind };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }
}

// ============================================================================
// TOOL DEFINITIONS FOR LLM
// ============================================================================

export const gitToolDefinitions: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get the current git status including staged, unstaged, and untracked files.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Get the diff of changes. Can show staged or unstaged changes.',
      parameters: {
        type: 'object',
        properties: {
          staged: {
            type: 'string',
            description: 'Show staged changes only (true/false)',
          },
          file: {
            type: 'string',
            description: 'Show diff for a specific file only',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Get the commit history.',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'string',
            description: 'Number of commits to show (default: 20)',
          },
          file: {
            type: 'string',
            description: 'Show commits for a specific file',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for commit.',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'string',
            description: 'Comma-separated list of files to stage, or "." for all',
          },
        },
        required: ['files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Create a commit with the staged changes.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The commit message',
          },
          all: {
            type: 'string',
            description: 'Stage all tracked files before committing (true/false)',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch_list',
      description: 'List all branches.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch_create',
      description: 'Create a new branch.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the new branch',
          },
          checkout: {
            type: 'string',
            description: 'Switch to the new branch (true/false)',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_checkout',
      description: 'Switch to a different branch.',
      parameters: {
        type: 'object',
        properties: {
          branch: {
            type: 'string',
            description: 'Name of the branch to switch to',
          },
          create: {
            type: 'string',
            description: 'Create the branch if it does not exist (true/false)',
          },
        },
        required: ['branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_stash',
      description: 'Stash current changes.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Optional stash message',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_stash_pop',
      description: 'Apply and remove the latest stash.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createGitTools(config: GitToolsConfig): GitTools {
  return new GitTools(config);
}

export default GitTools;
