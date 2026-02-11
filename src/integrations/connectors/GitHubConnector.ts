/**
 * GitHub Connector - Repos, PRs, Issues, Actions Integration
 * Full OAuth 2.0 flow with comprehensive API coverage
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface GitHubCredentials {
  accessToken: string;
  tokenType: string;
  scope: string[];
  expiresAt?: number;
  refreshToken?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  url: string;
  company: string | null;
  location: string | null;
  bio: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  url: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  topics: string[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  owner: { login: string; id: number; avatarUrl: string };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  stateReason?: 'completed' | 'not_planned' | 'reopened' | null;
  url: string;
  htmlUrl: string;
  labels: Array<{ id: number; name: string; color: string }>;
  assignees: Array<{ login: string; id: number }>;
  milestone: { id: number; title: string; number: number } | null;
  user: { login: string; id: number };
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  url: string;
  htmlUrl: string;
  diffUrl: string;
  head: { ref: string; sha: string; repo: { fullName: string } };
  base: { ref: string; sha: string; repo: { fullName: string } };
  user: { login: string; id: number };
  labels: Array<{ id: number; name: string; color: string }>;
  assignees: Array<{ login: string; id: number }>;
  reviewers: Array<{ login: string; id: number }>;
  milestone: { id: number; title: string; number: number } | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  comments: number;
  reviewComments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  mergedBy: { login: string; id: number } | null;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  htmlUrl: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  parents: Array<{ sha: string; url: string }>;
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  url: string;
  htmlUrl: string;
  workflowId: number;
  headBranch: string;
  headSha: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
  runAttempt: number;
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  url: string;
  htmlUrl: string;
  tarballUrl: string;
  zipballUrl: string;
  author: { login: string; id: number };
  createdAt: string;
  publishedAt: string | null;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    downloadCount: number;
    browserDownloadUrl: string;
  }>;
}

export interface CreateIssueOptions {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface CreatePullRequestOptions {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
  maintainerCanModify?: boolean;
}

export interface CreateReleaseOptions {
  tagName: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  targetCommitish?: string;
  generateReleaseNotes?: boolean;
}

export interface WebhookEvent {
  id: string;
  type: string;
  action?: string;
  repository?: { fullName: string };
  sender?: { login: string };
  payload: Record<string, unknown>;
}

// ============================================================================
// GITHUB CONNECTOR CLASS
// ============================================================================

export class GitHubConnector extends EventEmitter {
  private credentials: GitHubCredentials | null = null;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private webhookSecret?: string;

  private readonly API_BASE = 'https://api.github.com';
  private readonly AUTH_URL = 'https://github.com/login/oauth/authorize';
  private readonly TOKEN_URL = 'https://github.com/login/oauth/access_token';

  constructor(config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    webhookSecret?: string;
  }) {
    super();
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.webhookSecret = config.webhookSecret;
  }

  // ==========================================================================
  // OAUTH FLOW
  // ==========================================================================

  getAuthorizationUrl(scopes: string[], state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      ...(state && { state })
    });

    return `${this.AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GitHubCredentials> {
    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`OAuth exchange failed: ${data.error_description || data.error}`);
    }

    this.credentials = {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope.split(','),
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined
    };

    this.emit('authenticated', { scopes: this.credentials.scope });
    return this.credentials;
  }

  setCredentials(credentials: GitHubCredentials): void {
    this.credentials = credentials;
  }

  getCredentials(): GitHubCredentials | null {
    return this.credentials;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.credentials) {
      throw new Error('Not authenticated');
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers
      }
    });

    // Handle rate limiting
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    if (remaining === '0') {
      const resetDate = new Date(parseInt(reset || '0') * 1000);
      throw new Error(`Rate limit exceeded. Resets at ${resetDate.toISOString()}`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`GitHub API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  private async paginate<T>(endpoint: string, maxPages = 10): Promise<T[]> {
    const results: T[] = [];
    let url = endpoint.includes('?')
      ? `${endpoint}&per_page=100`
      : `${endpoint}?per_page=100`;
    let page = 0;

    while (url && page < maxPages) {
      const response = await fetch(url.startsWith('http') ? url : `${this.API_BASE}${url}`, {
        headers: {
          Authorization: `Bearer ${this.credentials!.accessToken}`,
          Accept: 'application/vnd.github+json'
        }
      });

      if (!response.ok) break;

      const data = await response.json();
      results.push(...(Array.isArray(data) ? data : []));

      // Get next page from Link header
      const linkHeader = response.headers.get('Link');
      const nextLink = linkHeader?.split(',').find(l => l.includes('rel="next"'));
      url = nextLink ? nextLink.match(/<([^>]+)>/)?.[1] || '' : '';
      page++;
    }

    return results;
  }

  // ==========================================================================
  // USER OPERATIONS
  // ==========================================================================

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const data = await this.request<Record<string, unknown>>('/user');
    return this.transformUser(data);
  }

  async getUser(username: string): Promise<GitHubUser> {
    const data = await this.request<Record<string, unknown>>(`/users/${username}`);
    return this.transformUser(data);
  }

  private transformUser(data: Record<string, unknown>): GitHubUser {
    return {
      id: data.id as number,
      login: data.login as string,
      name: data.name as string | null,
      email: data.email as string | null,
      avatarUrl: data.avatar_url as string,
      url: data.url as string,
      company: data.company as string | null,
      location: data.location as string | null,
      bio: data.bio as string | null,
      publicRepos: data.public_repos as number,
      followers: data.followers as number,
      following: data.following as number,
      createdAt: data.created_at as string
    };
  }

  // ==========================================================================
  // REPOSITORY OPERATIONS
  // ==========================================================================

  async listRepositories(options: {
    type?: 'all' | 'owner' | 'member';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    affiliation?: string;
  } = {}): Promise<GitHubRepository[]> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.sort) params.set('sort', options.sort);
    if (options.direction) params.set('direction', options.direction);
    if (options.affiliation) params.set('affiliation', options.affiliation);

    const data = await this.paginate<Record<string, unknown>>(`/user/repos?${params}`);
    return data.map(repo => this.transformRepository(repo));
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const data = await this.request<Record<string, unknown>>(`/repos/${owner}/${repo}`);
    return this.transformRepository(data);
  }

  async createRepository(options: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
    gitignoreTemplate?: string;
    licenseTemplate?: string;
  }): Promise<GitHubRepository> {
    const data = await this.request<Record<string, unknown>>('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: options.name,
        description: options.description,
        private: options.private,
        auto_init: options.autoInit,
        gitignore_template: options.gitignoreTemplate,
        license_template: options.licenseTemplate
      })
    });
    return this.transformRepository(data);
  }

  async forkRepository(owner: string, repo: string, organization?: string): Promise<GitHubRepository> {
    const data = await this.request<Record<string, unknown>>(`/repos/${owner}/${repo}/forks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(organization ? { organization } : {})
    });
    return this.transformRepository(data);
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}`, { method: 'DELETE' });
  }

  private transformRepository(data: Record<string, unknown>): GitHubRepository {
    const owner = data.owner as Record<string, unknown>;
    return {
      id: data.id as number,
      name: data.name as string,
      fullName: data.full_name as string,
      description: data.description as string | null,
      private: data.private as boolean,
      fork: data.fork as boolean,
      url: data.url as string,
      htmlUrl: data.html_url as string,
      cloneUrl: data.clone_url as string,
      sshUrl: data.ssh_url as string,
      defaultBranch: data.default_branch as string,
      language: data.language as string | null,
      stargazersCount: data.stargazers_count as number,
      forksCount: data.forks_count as number,
      openIssuesCount: data.open_issues_count as number,
      topics: (data.topics as string[]) || [],
      visibility: data.visibility as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      pushedAt: data.pushed_at as string,
      owner: {
        login: owner.login as string,
        id: owner.id as number,
        avatarUrl: owner.avatar_url as string
      }
    };
  }

  // ==========================================================================
  // BRANCH OPERATIONS
  // ==========================================================================

  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const data = await this.paginate<Record<string, unknown>>(`/repos/${owner}/${repo}/branches`);
    return data.map(branch => ({
      name: branch.name as string,
      commit: branch.commit as { sha: string; url: string },
      protected: branch.protected as boolean
    }));
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<GitHubBranch> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/branches/${branch}`
    );
    return {
      name: data.name as string,
      commit: data.commit as { sha: string; url: string },
      protected: data.protected as boolean
    };
  }

  async createBranch(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha
      })
    });
  }

  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'DELETE'
    });
  }

  // ==========================================================================
  // ISSUE OPERATIONS
  // ==========================================================================

  async listIssues(owner: string, repo: string, options: {
    state?: 'open' | 'closed' | 'all';
    labels?: string;
    assignee?: string;
    milestone?: string | number;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
  } = {}): Promise<GitHubIssue[]> {
    const params = new URLSearchParams();
    if (options.state) params.set('state', options.state);
    if (options.labels) params.set('labels', options.labels);
    if (options.assignee) params.set('assignee', options.assignee);
    if (options.milestone) params.set('milestone', options.milestone.toString());
    if (options.sort) params.set('sort', options.sort);
    if (options.direction) params.set('direction', options.direction);

    const data = await this.paginate<Record<string, unknown>>(
      `/repos/${owner}/${repo}/issues?${params}`
    );
    // Filter out PRs (they're included in issues endpoint)
    return data
      .filter(issue => !issue.pull_request)
      .map(issue => this.transformIssue(issue));
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`
    );
    return this.transformIssue(data);
  }

  async createIssue(owner: string, repo: string, options: CreateIssueOptions): Promise<GitHubIssue> {
    const data = await this.request<Record<string, unknown>>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    return this.transformIssue(data);
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: Partial<CreateIssueOptions> & { state?: 'open' | 'closed'; stateReason?: string }
  ): Promise<GitHubIssue> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          state_reason: updates.stateReason
        })
      }
    );
    return this.transformIssue(data);
  }

  async closeIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    reason: 'completed' | 'not_planned' = 'completed'
  ): Promise<GitHubIssue> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'closed', stateReason: reason });
  }

  async addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<{ id: number; body: string; user: { login: string } }> {
    return this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
  }

  async addIssueLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<Array<{ id: number; name: string; color: string }>> {
    return this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels })
    });
  }

  private transformIssue(data: Record<string, unknown>): GitHubIssue {
    const user = data.user as Record<string, unknown>;
    const milestone = data.milestone as Record<string, unknown> | null;
    return {
      id: data.id as number,
      number: data.number as number,
      title: data.title as string,
      body: data.body as string | null,
      state: data.state as 'open' | 'closed',
      stateReason: data.state_reason as 'completed' | 'not_planned' | 'reopened' | null,
      url: data.url as string,
      htmlUrl: data.html_url as string,
      labels: (data.labels as Array<{ id: number; name: string; color: string }>) || [],
      assignees: ((data.assignees as Array<Record<string, unknown>>) || []).map(a => ({
        login: a.login as string,
        id: a.id as number
      })),
      milestone: milestone ? {
        id: milestone.id as number,
        title: milestone.title as string,
        number: milestone.number as number
      } : null,
      user: { login: user.login as string, id: user.id as number },
      comments: data.comments as number,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      closedAt: data.closed_at as string | null
    };
  }

  // ==========================================================================
  // PULL REQUEST OPERATIONS
  // ==========================================================================

  async listPullRequests(owner: string, repo: string, options: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    direction?: 'asc' | 'desc';
  } = {}): Promise<GitHubPullRequest[]> {
    const params = new URLSearchParams();
    if (options.state) params.set('state', options.state);
    if (options.head) params.set('head', options.head);
    if (options.base) params.set('base', options.base);
    if (options.sort) params.set('sort', options.sort);
    if (options.direction) params.set('direction', options.direction);

    const data = await this.paginate<Record<string, unknown>>(
      `/repos/${owner}/${repo}/pulls?${params}`
    );
    return data.map(pr => this.transformPullRequest(pr));
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`
    );
    return this.transformPullRequest(data);
  }

  async createPullRequest(
    owner: string,
    repo: string,
    options: CreatePullRequestOptions
  ): Promise<GitHubPullRequest> {
    const data = await this.request<Record<string, unknown>>(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        draft: options.draft,
        maintainer_can_modify: options.maintainerCanModify
      })
    });
    return this.transformPullRequest(data);
  }

  async updatePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    updates: { title?: string; body?: string; state?: 'open' | 'closed'; base?: string }
  ): Promise<GitHubPullRequest> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }
    );
    return this.transformPullRequest(data);
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      sha?: string;
    } = {}
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    return this.request(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_title: options.commitTitle,
        commit_message: options.commitMessage,
        merge_method: options.mergeMethod || 'merge',
        sha: options.sha
      })
    });
  }

  async requestReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[],
    teamReviewers?: string[]
  ): Promise<GitHubPullRequest> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewers, team_reviewers: teamReviewers })
      }
    );
    return this.transformPullRequest(data);
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>> {
    return this.paginate(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{ id: number; user: { login: string }; state: string; body: string }>> {
    return this.paginate(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);
  }

  async createPullRequestReview(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      body?: string;
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      comments?: Array<{ path: string; position?: number; body: string; line?: number; side?: 'LEFT' | 'RIGHT' }>;
    }
  ): Promise<{ id: number; state: string; body: string }> {
    return this.request(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
  }

  private transformPullRequest(data: Record<string, unknown>): GitHubPullRequest {
    const user = data.user as Record<string, unknown>;
    const head = data.head as Record<string, unknown>;
    const base = data.base as Record<string, unknown>;
    const headRepo = head.repo as Record<string, unknown>;
    const baseRepo = base.repo as Record<string, unknown>;
    const milestone = data.milestone as Record<string, unknown> | null;
    const mergedBy = data.merged_by as Record<string, unknown> | null;

    return {
      id: data.id as number,
      number: data.number as number,
      title: data.title as string,
      body: data.body as string | null,
      state: data.state as 'open' | 'closed',
      draft: data.draft as boolean,
      merged: data.merged as boolean,
      mergeable: data.mergeable as boolean | null,
      url: data.url as string,
      htmlUrl: data.html_url as string,
      diffUrl: data.diff_url as string,
      head: {
        ref: head.ref as string,
        sha: head.sha as string,
        repo: { fullName: headRepo.full_name as string }
      },
      base: {
        ref: base.ref as string,
        sha: base.sha as string,
        repo: { fullName: baseRepo.full_name as string }
      },
      user: { login: user.login as string, id: user.id as number },
      labels: (data.labels as Array<{ id: number; name: string; color: string }>) || [],
      assignees: ((data.assignees as Array<Record<string, unknown>>) || []).map(a => ({
        login: a.login as string,
        id: a.id as number
      })),
      reviewers: ((data.requested_reviewers as Array<Record<string, unknown>>) || []).map(r => ({
        login: r.login as string,
        id: r.id as number
      })),
      milestone: milestone ? {
        id: milestone.id as number,
        title: milestone.title as string,
        number: milestone.number as number
      } : null,
      additions: data.additions as number,
      deletions: data.deletions as number,
      changedFiles: data.changed_files as number,
      commits: data.commits as number,
      comments: data.comments as number,
      reviewComments: data.review_comments as number,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      closedAt: data.closed_at as string | null,
      mergedAt: data.merged_at as string | null,
      mergedBy: mergedBy ? { login: mergedBy.login as string, id: mergedBy.id as number } : null
    };
  }

  // ==========================================================================
  // COMMIT OPERATIONS
  // ==========================================================================

  async listCommits(owner: string, repo: string, options: {
    sha?: string;
    path?: string;
    author?: string;
    since?: string;
    until?: string;
  } = {}): Promise<GitHubCommit[]> {
    const params = new URLSearchParams();
    if (options.sha) params.set('sha', options.sha);
    if (options.path) params.set('path', options.path);
    if (options.author) params.set('author', options.author);
    if (options.since) params.set('since', options.since);
    if (options.until) params.set('until', options.until);

    const data = await this.paginate<Record<string, unknown>>(
      `/repos/${owner}/${repo}/commits?${params}`
    );
    return data.map(commit => this.transformCommit(commit));
  }

  async getCommit(owner: string, repo: string, ref: string): Promise<GitHubCommit> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/commits/${ref}`
    );
    return this.transformCommit(data);
  }

  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<{ aheadBy: number; behindBy: number; commits: GitHubCommit[]; files: Array<{ filename: string; status: string }> }> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/compare/${base}...${head}`
    );
    return {
      aheadBy: data.ahead_by as number,
      behindBy: data.behind_by as number,
      commits: ((data.commits as Array<Record<string, unknown>>) || []).map(c => this.transformCommit(c)),
      files: (data.files as Array<{ filename: string; status: string }>) || []
    };
  }

  private transformCommit(data: Record<string, unknown>): GitHubCommit {
    const commit = data.commit as Record<string, unknown>;
    const author = commit.author as Record<string, unknown>;
    const committer = commit.committer as Record<string, unknown>;

    return {
      sha: data.sha as string,
      message: commit.message as string,
      url: data.url as string,
      htmlUrl: data.html_url as string,
      author: {
        name: author.name as string,
        email: author.email as string,
        date: author.date as string
      },
      committer: {
        name: committer.name as string,
        email: committer.email as string,
        date: committer.date as string
      },
      parents: (data.parents as Array<{ sha: string; url: string }>) || [],
      stats: data.stats as { additions: number; deletions: number; total: number } | undefined,
      files: data.files as Array<{ filename: string; status: string; additions: number; deletions: number }> | undefined
    };
  }

  // ==========================================================================
  // WORKFLOW OPERATIONS
  // ==========================================================================

  async listWorkflows(owner: string, repo: string): Promise<Array<{ id: number; name: string; path: string; state: string }>> {
    const data = await this.request<{ workflows: Array<{ id: number; name: string; path: string; state: string }> }>(
      `/repos/${owner}/${repo}/actions/workflows`
    );
    return data.workflows;
  }

  async listWorkflowRuns(owner: string, repo: string, options: {
    workflowId?: number | string;
    branch?: string;
    event?: string;
    status?: string;
  } = {}): Promise<GitHubWorkflowRun[]> {
    const endpoint = options.workflowId
      ? `/repos/${owner}/${repo}/actions/workflows/${options.workflowId}/runs`
      : `/repos/${owner}/${repo}/actions/runs`;

    const params = new URLSearchParams();
    if (options.branch) params.set('branch', options.branch);
    if (options.event) params.set('event', options.event);
    if (options.status) params.set('status', options.status);

    const data = await this.request<{ workflow_runs: Array<Record<string, unknown>> }>(
      `${endpoint}?${params}`
    );

    return data.workflow_runs.map(run => ({
      id: run.id as number,
      name: run.name as string,
      status: run.status as 'queued' | 'in_progress' | 'completed',
      conclusion: run.conclusion as 'success' | 'failure' | 'cancelled' | 'skipped' | null,
      url: run.url as string,
      htmlUrl: run.html_url as string,
      workflowId: run.workflow_id as number,
      headBranch: run.head_branch as string,
      headSha: run.head_sha as string,
      event: run.event as string,
      createdAt: run.created_at as string,
      updatedAt: run.updated_at as string,
      runNumber: run.run_number as number,
      runAttempt: run.run_attempt as number
    }));
  }

  async triggerWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    await this.request<void>(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, inputs })
      }
    );
  }

  async cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
    await this.request<void>(
      `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
      { method: 'POST' }
    );
  }

  async rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
    await this.request<void>(
      `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`,
      { method: 'POST' }
    );
  }

  // ==========================================================================
  // RELEASE OPERATIONS
  // ==========================================================================

  async listReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
    const data = await this.paginate<Record<string, unknown>>(`/repos/${owner}/${repo}/releases`);
    return data.map(release => this.transformRelease(release));
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
    const data = await this.request<Record<string, unknown>>(
      `/repos/${owner}/${repo}/releases/latest`
    );
    return this.transformRelease(data);
  }

  async createRelease(owner: string, repo: string, options: CreateReleaseOptions): Promise<GitHubRelease> {
    const data = await this.request<Record<string, unknown>>(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: options.tagName,
        name: options.name,
        body: options.body,
        draft: options.draft,
        prerelease: options.prerelease,
        target_commitish: options.targetCommitish,
        generate_release_notes: options.generateReleaseNotes
      })
    });
    return this.transformRelease(data);
  }

  async deleteRelease(owner: string, repo: string, releaseId: number): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}/releases/${releaseId}`, {
      method: 'DELETE'
    });
  }

  private transformRelease(data: Record<string, unknown>): GitHubRelease {
    const author = data.author as Record<string, unknown>;
    return {
      id: data.id as number,
      tagName: data.tag_name as string,
      name: data.name as string | null,
      body: data.body as string | null,
      draft: data.draft as boolean,
      prerelease: data.prerelease as boolean,
      url: data.url as string,
      htmlUrl: data.html_url as string,
      tarballUrl: data.tarball_url as string,
      zipballUrl: data.zipball_url as string,
      author: { login: author.login as string, id: author.id as number },
      createdAt: data.created_at as string,
      publishedAt: data.published_at as string | null,
      assets: ((data.assets as Array<Record<string, unknown>>) || []).map(asset => ({
        id: asset.id as number,
        name: asset.name as string,
        size: asset.size as number,
        downloadCount: asset.download_count as number,
        browserDownloadUrl: asset.browser_download_url as string
      }))
    };
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const crypto = require('crypto');
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  parseWebhookEvent(headers: Record<string, string>, payload: string): WebhookEvent {
    const signature = headers['x-hub-signature-256'];
    if (signature && !this.verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const data = JSON.parse(payload);
    const event: WebhookEvent = {
      id: headers['x-github-delivery'],
      type: headers['x-github-event'],
      action: data.action,
      repository: data.repository ? { fullName: data.repository.full_name } : undefined,
      sender: data.sender ? { login: data.sender.login } : undefined,
      payload: data
    };

    this.emit('webhook', event);
    return event;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createGitHubConnector(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webhookSecret?: string;
}): GitHubConnector {
  return new GitHubConnector(config);
}

export default GitHubConnector;
