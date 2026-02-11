/**
 * Linear Connector - Issue Tracking, Project Management
 * GraphQL API with OAuth 2.0 or API Key authentication
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface LinearConfig {
  apiKey: string;
}

export interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  active: boolean;
  admin: boolean;
  createdAt: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  private: boolean;
  timezone: string;
  issueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  state: 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  progress: number;
  targetDate: string | null;
  startDate: string | null;
  lead: LinearUser | null;
  teams: LinearTeam[];
  createdAt: string;
  updatedAt: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number; // 0: No priority, 1: Urgent, 2: High, 3: Medium, 4: Low
  priorityLabel: string;
  state: {
    id: string;
    name: string;
    color: string;
    type: string;
  };
  assignee: LinearUser | null;
  creator: LinearUser | null;
  team: LinearTeam;
  project: LinearProject | null;
  parent: { id: string; identifier: string; title: string } | null;
  labels: Array<{ id: string; name: string; color: string }>;
  estimate: number | null;
  dueDate: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
}

export interface LinearCycle {
  id: string;
  name: string;
  number: number;
  startsAt: string;
  endsAt: string;
  progress: number;
  completedAt: string | null;
  team: LinearTeam;
  issues: { totalCount: number };
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  description: string | null;
  isGroup: boolean;
  parent: { id: string; name: string } | null;
  team: LinearTeam | null;
  createdAt: string;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  color: string;
  type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  position: number;
  team: LinearTeam;
}

export interface CreateIssueOptions {
  teamId: string;
  title: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  projectId?: string;
  parentId?: string;
  labelIds?: string[];
  estimate?: number;
  dueDate?: string;
  cycleId?: string;
}

export interface CreateProjectOptions {
  name: string;
  teamIds: string[];
  description?: string;
  icon?: string;
  color?: string;
  state?: 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  targetDate?: string;
  startDate?: string;
  leadId?: string;
}

// ============================================================================
// LINEAR CONNECTOR CLASS
// ============================================================================

export class LinearConnector extends EventEmitter {
  private apiKey: string;

  private readonly API_URL = 'https://api.linear.app/graphql';

  constructor(config: LinearConfig) {
    super();
    this.apiKey = config.apiKey;
  }

  private async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Linear API error: ${data.errors.map((e: { message: string }) => e.message).join(', ')}`);
    }

    return data.data;
  }

  // ==========================================================================
  // USER OPERATIONS
  // ==========================================================================

  async getViewer(): Promise<LinearUser> {
    const data = await this.query<{ viewer: Record<string, unknown> }>(`
      query {
        viewer {
          id
          name
          displayName
          email
          avatarUrl
          active
          admin
          createdAt
        }
      }
    `);

    return this.transformUser(data.viewer);
  }

  async listUsers(): Promise<LinearUser[]> {
    const data = await this.query<{ users: { nodes: Array<Record<string, unknown>> } }>(`
      query {
        users {
          nodes {
            id
            name
            displayName
            email
            avatarUrl
            active
            admin
            createdAt
          }
        }
      }
    `);

    return data.users.nodes.map(u => this.transformUser(u));
  }

  private transformUser(data: Record<string, unknown>): LinearUser {
    return {
      id: data.id as string,
      name: data.name as string,
      displayName: data.displayName as string,
      email: data.email as string,
      avatarUrl: data.avatarUrl as string | null,
      active: data.active as boolean,
      admin: data.admin as boolean,
      createdAt: data.createdAt as string
    };
  }

  // ==========================================================================
  // TEAM OPERATIONS
  // ==========================================================================

  async listTeams(): Promise<LinearTeam[]> {
    const data = await this.query<{ teams: { nodes: Array<Record<string, unknown>> } }>(`
      query {
        teams {
          nodes {
            id
            name
            key
            description
            icon
            color
            private
            timezone
            issueCount
            createdAt
            updatedAt
          }
        }
      }
    `);

    return data.teams.nodes.map(t => this.transformTeam(t));
  }

  async getTeam(teamId: string): Promise<LinearTeam> {
    const data = await this.query<{ team: Record<string, unknown> }>(`
      query GetTeam($id: String!) {
        team(id: $id) {
          id
          name
          key
          description
          icon
          color
          private
          timezone
          issueCount
          createdAt
          updatedAt
        }
      }
    `, { id: teamId });

    return this.transformTeam(data.team);
  }

  async createTeam(options: {
    name: string;
    key?: string;
    description?: string;
    icon?: string;
    color?: string;
    timezone?: string;
  }): Promise<LinearTeam> {
    const data = await this.query<{
      teamCreate: { success: boolean; team: Record<string, unknown> }
    }>(`
      mutation CreateTeam($input: TeamCreateInput!) {
        teamCreate(input: $input) {
          success
          team {
            id
            name
            key
            description
            icon
            color
            private
            timezone
            issueCount
            createdAt
            updatedAt
          }
        }
      }
    `, {
      input: {
        name: options.name,
        key: options.key,
        description: options.description,
        icon: options.icon,
        color: options.color,
        timezone: options.timezone
      }
    });

    if (!data.teamCreate.success) {
      throw new Error('Failed to create team');
    }

    this.emit('team_created', { teamId: data.teamCreate.team.id });
    return this.transformTeam(data.teamCreate.team);
  }

  private transformTeam(data: Record<string, unknown>): LinearTeam {
    return {
      id: data.id as string,
      name: data.name as string,
      key: data.key as string,
      description: data.description as string | null,
      icon: data.icon as string | null,
      color: data.color as string | null,
      private: data.private as boolean,
      timezone: data.timezone as string,
      issueCount: data.issueCount as number,
      createdAt: data.createdAt as string,
      updatedAt: data.updatedAt as string
    };
  }

  // ==========================================================================
  // ISSUE OPERATIONS
  // ==========================================================================

  async createIssue(options: CreateIssueOptions): Promise<LinearIssue> {
    const data = await this.query<{
      issueCreate: { success: boolean; issue: Record<string, unknown> }
    }>(`
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            description
            priority
            priorityLabel
            url
            state { id name color type }
            assignee { id name displayName email avatarUrl active admin createdAt }
            creator { id name displayName email avatarUrl active admin createdAt }
            team { id name key }
            project { id name }
            parent { id identifier title }
            labels { nodes { id name color } }
            estimate
            dueDate
            createdAt
            updatedAt
            completedAt
            canceledAt
          }
        }
      }
    `, {
      input: {
        teamId: options.teamId,
        title: options.title,
        description: options.description,
        priority: options.priority,
        stateId: options.stateId,
        assigneeId: options.assigneeId,
        projectId: options.projectId,
        parentId: options.parentId,
        labelIds: options.labelIds,
        estimate: options.estimate,
        dueDate: options.dueDate,
        cycleId: options.cycleId
      }
    });

    if (!data.issueCreate.success) {
      throw new Error('Failed to create issue');
    }

    this.emit('issue_created', { issueId: data.issueCreate.issue.id });
    return this.transformIssue(data.issueCreate.issue);
  }

  async getIssue(issueId: string): Promise<LinearIssue> {
    const data = await this.query<{ issue: Record<string, unknown> }>(`
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          priorityLabel
          url
          state { id name color type }
          assignee { id name displayName email avatarUrl active admin createdAt }
          creator { id name displayName email avatarUrl active admin createdAt }
          team { id name key description icon color private timezone issueCount createdAt updatedAt }
          project { id name }
          parent { id identifier title }
          labels { nodes { id name color } }
          estimate
          dueDate
          createdAt
          updatedAt
          completedAt
          canceledAt
        }
      }
    `, { id: issueId });

    return this.transformIssue(data.issue);
  }

  async updateIssue(issueId: string, updates: {
    title?: string;
    description?: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
    projectId?: string;
    labelIds?: string[];
    estimate?: number;
    dueDate?: string;
  }): Promise<LinearIssue> {
    const data = await this.query<{
      issueUpdate: { success: boolean; issue: Record<string, unknown> }
    }>(`
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            title
            description
            priority
            priorityLabel
            url
            state { id name color type }
            assignee { id name displayName email avatarUrl active admin createdAt }
            creator { id name displayName email avatarUrl active admin createdAt }
            team { id name key description icon color private timezone issueCount createdAt updatedAt }
            project { id name }
            parent { id identifier title }
            labels { nodes { id name color } }
            estimate
            dueDate
            createdAt
            updatedAt
            completedAt
            canceledAt
          }
        }
      }
    `, { id: issueId, input: updates });

    if (!data.issueUpdate.success) {
      throw new Error('Failed to update issue');
    }

    this.emit('issue_updated', { issueId });
    return this.transformIssue(data.issueUpdate.issue);
  }

  async deleteIssue(issueId: string): Promise<void> {
    const data = await this.query<{ issueDelete: { success: boolean } }>(`
      mutation DeleteIssue($id: String!) {
        issueDelete(id: $id) {
          success
        }
      }
    `, { id: issueId });

    if (!data.issueDelete.success) {
      throw new Error('Failed to delete issue');
    }

    this.emit('issue_deleted', { issueId });
  }

  async listIssues(options?: {
    teamId?: string;
    projectId?: string;
    assigneeId?: string;
    stateId?: string;
    first?: number;
    after?: string;
  }): Promise<{ issues: LinearIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
    const filters: string[] = [];
    if (options?.teamId) filters.push(`team: { id: { eq: "${options.teamId}" } }`);
    if (options?.projectId) filters.push(`project: { id: { eq: "${options.projectId}" } }`);
    if (options?.assigneeId) filters.push(`assignee: { id: { eq: "${options.assigneeId}" } }`);
    if (options?.stateId) filters.push(`state: { id: { eq: "${options.stateId}" } }`);

    const filterString = filters.length > 0 ? `filter: { ${filters.join(', ')} }` : '';

    const data = await this.query<{
      issues: {
        nodes: Array<Record<string, unknown>>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      }
    }>(`
      query ListIssues($first: Int, $after: String) {
        issues(first: $first, after: $after, ${filterString}) {
          nodes {
            id
            identifier
            title
            description
            priority
            priorityLabel
            url
            state { id name color type }
            assignee { id name displayName email avatarUrl active admin createdAt }
            creator { id name displayName email avatarUrl active admin createdAt }
            team { id name key description icon color private timezone issueCount createdAt updatedAt }
            project { id name }
            parent { id identifier title }
            labels { nodes { id name color } }
            estimate
            dueDate
            createdAt
            updatedAt
            completedAt
            canceledAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, {
      first: options?.first || 50,
      after: options?.after
    });

    return {
      issues: data.issues.nodes.map(i => this.transformIssue(i)),
      pageInfo: data.issues.pageInfo
    };
  }

  async searchIssues(query: string, options?: {
    teamId?: string;
    first?: number;
  }): Promise<LinearIssue[]> {
    const data = await this.query<{
      issueSearch: { nodes: Array<Record<string, unknown>> }
    }>(`
      query SearchIssues($query: String!, $first: Int) {
        issueSearch(query: $query, first: $first) {
          nodes {
            id
            identifier
            title
            description
            priority
            priorityLabel
            url
            state { id name color type }
            assignee { id name displayName email avatarUrl active admin createdAt }
            team { id name key }
            createdAt
            updatedAt
          }
        }
      }
    `, {
      query,
      first: options?.first || 25
    });

    return data.issueSearch.nodes.map(i => this.transformIssue(i));
  }

  private transformIssue(data: Record<string, unknown>): LinearIssue {
    const state = data.state as Record<string, unknown>;
    const assignee = data.assignee as Record<string, unknown> | null;
    const creator = data.creator as Record<string, unknown> | null;
    const team = data.team as Record<string, unknown>;
    const project = data.project as Record<string, unknown> | null;
    const parent = data.parent as Record<string, unknown> | null;
    const labels = (data.labels as { nodes: Array<Record<string, unknown>> })?.nodes || [];

    return {
      id: data.id as string,
      identifier: data.identifier as string,
      title: data.title as string,
      description: data.description as string | null,
      priority: data.priority as number,
      priorityLabel: data.priorityLabel as string,
      state: {
        id: state.id as string,
        name: state.name as string,
        color: state.color as string,
        type: state.type as string
      },
      assignee: assignee ? this.transformUser(assignee) : null,
      creator: creator ? this.transformUser(creator) : null,
      team: this.transformTeam(team),
      project: project ? {
        id: project.id as string,
        name: project.name as string,
        description: null,
        icon: null,
        color: null,
        state: 'started',
        progress: 0,
        targetDate: null,
        startDate: null,
        lead: null,
        teams: [],
        createdAt: '',
        updatedAt: ''
      } : null,
      parent: parent ? {
        id: parent.id as string,
        identifier: parent.identifier as string,
        title: parent.title as string
      } : null,
      labels: labels.map(l => ({
        id: l.id as string,
        name: l.name as string,
        color: l.color as string
      })),
      estimate: data.estimate as number | null,
      dueDate: data.dueDate as string | null,
      url: data.url as string,
      createdAt: data.createdAt as string,
      updatedAt: data.updatedAt as string,
      completedAt: data.completedAt as string | null,
      canceledAt: data.canceledAt as string | null
    };
  }

  // ==========================================================================
  // PROJECT OPERATIONS
  // ==========================================================================

  async createProject(options: CreateProjectOptions): Promise<LinearProject> {
    const data = await this.query<{
      projectCreate: { success: boolean; project: Record<string, unknown> }
    }>(`
      mutation CreateProject($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project {
            id
            name
            description
            icon
            color
            state
            progress
            targetDate
            startDate
            lead { id name displayName email avatarUrl active admin createdAt }
            teams { nodes { id name key } }
            createdAt
            updatedAt
          }
        }
      }
    `, {
      input: {
        name: options.name,
        teamIds: options.teamIds,
        description: options.description,
        icon: options.icon,
        color: options.color,
        state: options.state,
        targetDate: options.targetDate,
        startDate: options.startDate,
        leadId: options.leadId
      }
    });

    if (!data.projectCreate.success) {
      throw new Error('Failed to create project');
    }

    this.emit('project_created', { projectId: data.projectCreate.project.id });
    return this.transformProject(data.projectCreate.project);
  }

  async listProjects(options?: {
    teamId?: string;
    first?: number;
  }): Promise<LinearProject[]> {
    const filterString = options?.teamId
      ? `filter: { accessibleTeams: { id: { eq: "${options.teamId}" } } }`
      : '';

    const data = await this.query<{
      projects: { nodes: Array<Record<string, unknown>> }
    }>(`
      query ListProjects($first: Int) {
        projects(first: $first, ${filterString}) {
          nodes {
            id
            name
            description
            icon
            color
            state
            progress
            targetDate
            startDate
            lead { id name displayName email avatarUrl active admin createdAt }
            teams { nodes { id name key description icon color private timezone issueCount createdAt updatedAt } }
            createdAt
            updatedAt
          }
        }
      }
    `, { first: options?.first || 50 });

    return data.projects.nodes.map(p => this.transformProject(p));
  }

  async getProject(projectId: string): Promise<LinearProject> {
    const data = await this.query<{ project: Record<string, unknown> }>(`
      query GetProject($id: String!) {
        project(id: $id) {
          id
          name
          description
          icon
          color
          state
          progress
          targetDate
          startDate
          lead { id name displayName email avatarUrl active admin createdAt }
          teams { nodes { id name key description icon color private timezone issueCount createdAt updatedAt } }
          createdAt
          updatedAt
        }
      }
    `, { id: projectId });

    return this.transformProject(data.project);
  }

  private transformProject(data: Record<string, unknown>): LinearProject {
    const lead = data.lead as Record<string, unknown> | null;
    const teams = (data.teams as { nodes: Array<Record<string, unknown>> })?.nodes || [];

    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string | null,
      icon: data.icon as string | null,
      color: data.color as string | null,
      state: data.state as LinearProject['state'],
      progress: data.progress as number,
      targetDate: data.targetDate as string | null,
      startDate: data.startDate as string | null,
      lead: lead ? this.transformUser(lead) : null,
      teams: teams.map(t => this.transformTeam(t)),
      createdAt: data.createdAt as string,
      updatedAt: data.updatedAt as string
    };
  }

  // ==========================================================================
  // LABEL OPERATIONS
  // ==========================================================================

  async createLabel(options: {
    teamId: string;
    name: string;
    color?: string;
    description?: string;
  }): Promise<LinearLabel> {
    const data = await this.query<{
      issueLabelCreate: { success: boolean; issueLabel: Record<string, unknown> }
    }>(`
      mutation CreateLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
            color
            description
            isGroup
            parent { id name }
            team { id name key }
            createdAt
          }
        }
      }
    `, {
      input: {
        teamId: options.teamId,
        name: options.name,
        color: options.color,
        description: options.description
      }
    });

    if (!data.issueLabelCreate.success) {
      throw new Error('Failed to create label');
    }

    return this.transformLabel(data.issueLabelCreate.issueLabel);
  }

  async listLabels(teamId?: string): Promise<LinearLabel[]> {
    const filterString = teamId ? `filter: { team: { id: { eq: "${teamId}" } } }` : '';

    const data = await this.query<{
      issueLabels: { nodes: Array<Record<string, unknown>> }
    }>(`
      query ListLabels {
        issueLabels(${filterString}) {
          nodes {
            id
            name
            color
            description
            isGroup
            parent { id name }
            team { id name key description icon color private timezone issueCount createdAt updatedAt }
            createdAt
          }
        }
      }
    `);

    return data.issueLabels.nodes.map(l => this.transformLabel(l));
  }

  private transformLabel(data: Record<string, unknown>): LinearLabel {
    const parent = data.parent as Record<string, unknown> | null;
    const team = data.team as Record<string, unknown> | null;

    return {
      id: data.id as string,
      name: data.name as string,
      color: data.color as string,
      description: data.description as string | null,
      isGroup: data.isGroup as boolean,
      parent: parent ? {
        id: parent.id as string,
        name: parent.name as string
      } : null,
      team: team ? this.transformTeam(team) : null,
      createdAt: data.createdAt as string
    };
  }

  // ==========================================================================
  // WORKFLOW STATE OPERATIONS
  // ==========================================================================

  async listWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
    const data = await this.query<{
      workflowStates: { nodes: Array<Record<string, unknown>> }
    }>(`
      query ListWorkflowStates($teamId: String!) {
        workflowStates(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
            color
            type
            position
            team { id name key description icon color private timezone issueCount createdAt updatedAt }
          }
        }
      }
    `, { teamId });

    return data.workflowStates.nodes.map(s => ({
      id: s.id as string,
      name: s.name as string,
      color: s.color as string,
      type: s.type as LinearWorkflowState['type'],
      position: s.position as number,
      team: this.transformTeam(s.team as Record<string, unknown>)
    }));
  }

  // ==========================================================================
  // CYCLE OPERATIONS
  // ==========================================================================

  async createCycle(options: {
    teamId: string;
    name?: string;
    startsAt: string;
    endsAt: string;
  }): Promise<LinearCycle> {
    const data = await this.query<{
      cycleCreate: { success: boolean; cycle: Record<string, unknown> }
    }>(`
      mutation CreateCycle($input: CycleCreateInput!) {
        cycleCreate(input: $input) {
          success
          cycle {
            id
            name
            number
            startsAt
            endsAt
            progress
            completedAt
            team { id name key }
            issues { totalCount }
          }
        }
      }
    `, {
      input: {
        teamId: options.teamId,
        name: options.name,
        startsAt: options.startsAt,
        endsAt: options.endsAt
      }
    });

    if (!data.cycleCreate.success) {
      throw new Error('Failed to create cycle');
    }

    return this.transformCycle(data.cycleCreate.cycle);
  }

  async listCycles(teamId: string): Promise<LinearCycle[]> {
    const data = await this.query<{
      cycles: { nodes: Array<Record<string, unknown>> }
    }>(`
      query ListCycles($teamId: String!) {
        cycles(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
            number
            startsAt
            endsAt
            progress
            completedAt
            team { id name key description icon color private timezone issueCount createdAt updatedAt }
            issues { totalCount }
          }
        }
      }
    `, { teamId });

    return data.cycles.nodes.map(c => this.transformCycle(c));
  }

  private transformCycle(data: Record<string, unknown>): LinearCycle {
    const team = data.team as Record<string, unknown>;
    const issues = data.issues as { totalCount: number };

    return {
      id: data.id as string,
      name: data.name as string,
      number: data.number as number,
      startsAt: data.startsAt as string,
      endsAt: data.endsAt as string,
      progress: data.progress as number,
      completedAt: data.completedAt as string | null,
      team: this.transformTeam(team),
      issues: { totalCount: issues.totalCount }
    };
  }

  // ==========================================================================
  // WEBHOOK OPERATIONS
  // ==========================================================================

  async createWebhook(options: {
    url: string;
    label?: string;
    teamId?: string;
    resourceTypes?: string[];
    allPublicTeams?: boolean;
  }): Promise<{ id: string; url: string; enabled: boolean }> {
    const data = await this.query<{
      webhookCreate: { success: boolean; webhook: Record<string, unknown> }
    }>(`
      mutation CreateWebhook($input: WebhookCreateInput!) {
        webhookCreate(input: $input) {
          success
          webhook {
            id
            url
            enabled
          }
        }
      }
    `, {
      input: {
        url: options.url,
        label: options.label,
        teamId: options.teamId,
        resourceTypes: options.resourceTypes,
        allPublicTeams: options.allPublicTeams
      }
    });

    if (!data.webhookCreate.success) {
      throw new Error('Failed to create webhook');
    }

    return {
      id: data.webhookCreate.webhook.id as string,
      url: data.webhookCreate.webhook.url as string,
      enabled: data.webhookCreate.webhook.enabled as boolean
    };
  }

  // ==========================================================================
  // STANDARD SETUP FOR NEW COMPANY
  // ==========================================================================

  async setupNewCompany(options: {
    teamName: string;
    teamKey?: string;
  }): Promise<{
    team: LinearTeam;
    labels: LinearLabel[];
    states: LinearWorkflowState[];
  }> {
    // Create team
    const team = await this.createTeam({
      name: options.teamName,
      key: options.teamKey,
      timezone: 'America/Los_Angeles'
    });

    // Create standard labels
    const defaultLabels = [
      { name: 'bug', color: '#eb5757' },
      { name: 'feature', color: '#5e6ad2' },
      { name: 'improvement', color: '#26b5ce' },
      { name: 'documentation', color: '#4ea7fc' },
      { name: 'urgent', color: '#f2c94c' },
      { name: 'blocked', color: '#f87171' }
    ];

    const labels = await Promise.all(
      defaultLabels.map(label =>
        this.createLabel({
          teamId: team.id,
          name: label.name,
          color: label.color
        })
      )
    );

    // Get workflow states
    const states = await this.listWorkflowStates(team.id);

    this.emit('company_setup_complete', { teamId: team.id });

    return { team, labels, states };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createLinearConnector(config: LinearConfig): LinearConnector {
  return new LinearConnector(config);
}

export default LinearConnector;
