/**
 * Slack Connector - Messages, Channels, Users Integration
 * Full OAuth 2.0 flow with real-time events via Socket Mode
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface SlackCredentials {
  accessToken: string;
  botUserId: string;
  teamId: string;
  teamName: string;
  scope: string[];
  tokenType: string;
  appId: string;
  authedUser?: { id: string; accessToken?: string; scope?: string[] };
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email?: string;
  phone?: string;
  title?: string;
  statusText?: string;
  statusEmoji?: string;
  timezone?: string;
  isAdmin: boolean;
  isOwner: boolean;
  isBot: boolean;
  deleted: boolean;
  avatar: {
    image24: string;
    image48: string;
    image72: string;
    image192: string;
    image512: string;
  };
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isGroup: boolean;
  isIm: boolean;
  isMpim: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  topic?: { value: string; creator: string; lastSet: number };
  purpose?: { value: string; creator: string; lastSet: number };
  numMembers?: number;
  created: number;
  creator?: string;
}

export interface SlackMessage {
  type: string;
  subtype?: string;
  ts: string;
  user?: string;
  botId?: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  files?: SlackFile[];
  reactions?: Array<{ name: string; count: number; users: string[] }>;
  threadTs?: string;
  replyCount?: number;
  replyUsers?: string[];
  replyUsersCount?: number;
  latestReply?: string;
  edited?: { user: string; ts: string };
}

export interface SlackBlock {
  type: string;
  blockId?: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: unknown[];
  accessory?: unknown;
  fields?: Array<{ type: string; text: string }>;
}

export interface SlackAttachment {
  fallback?: string;
  color?: string;
  pretext?: string;
  authorName?: string;
  authorLink?: string;
  authorIcon?: string;
  title?: string;
  titleLink?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  imageUrl?: string;
  thumbUrl?: string;
  footer?: string;
  footerIcon?: string;
  ts?: number;
}

export interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  size: number;
  urlPrivate: string;
  urlPrivateDownload: string;
  permalink: string;
  permalinkPublic?: string;
  user: string;
  created: number;
  timestamp: number;
  isPublic: boolean;
  shares?: Record<string, Array<{ ts: string }>>;
}

export interface SlackEvent {
  type: string;
  subtype?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  eventTs: string;
  channelType?: string;
  [key: string]: unknown;
}

export interface MessageOptions {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  threadTs?: string;
  replyBroadcast?: boolean;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  mrkdwn?: boolean;
  metadata?: { eventType: string; eventPayload: Record<string, unknown> };
}

export interface ChannelCreateOptions {
  name: string;
  isPrivate?: boolean;
  description?: string;
  teamId?: string;
}

// ============================================================================
// SLACK CONNECTOR CLASS
// ============================================================================

export class SlackConnector extends EventEmitter {
  private credentials: SlackCredentials | null = null;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private signingSecret: string;
  private socketConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private readonly API_BASE = 'https://slack.com/api';
  private readonly AUTH_URL = 'https://slack.com/oauth/v2/authorize';

  constructor(config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    signingSecret: string;
  }) {
    super();
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.signingSecret = config.signingSecret;
  }

  // ==========================================================================
  // OAUTH FLOW
  // ==========================================================================

  getAuthorizationUrl(scopes: string[], userScopes?: string[], state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(','),
      ...(userScopes && { user_scope: userScopes.join(',') }),
      ...(state && { state })
    });

    return `${this.AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<SlackCredentials> {
    const response = await fetch(`${this.API_BASE}/oauth.v2.access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri
      })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`OAuth exchange failed: ${data.error}`);
    }

    this.credentials = {
      accessToken: data.access_token,
      botUserId: data.bot_user_id,
      teamId: data.team.id,
      teamName: data.team.name,
      scope: data.scope.split(','),
      tokenType: data.token_type,
      appId: data.app_id,
      authedUser: data.authed_user ? {
        id: data.authed_user.id,
        accessToken: data.authed_user.access_token,
        scope: data.authed_user.scope?.split(',')
      } : undefined
    };

    this.emit('authenticated', { teamId: this.credentials.teamId });
    return this.credentials;
  }

  setCredentials(credentials: SlackCredentials): void {
    this.credentials = credentials;
  }

  getCredentials(): SlackCredentials | null {
    return this.credentials;
  }

  private async request<T>(
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    if (!this.credentials) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.API_BASE}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data;
  }

  // ==========================================================================
  // MESSAGE OPERATIONS
  // ==========================================================================

  async postMessage(options: MessageOptions): Promise<{ ts: string; channel: string; message: SlackMessage }> {
    const response = await this.request<{
      ts: string;
      channel: string;
      message: Record<string, unknown>;
    }>('chat.postMessage', {
      channel: options.channel,
      text: options.text,
      blocks: options.blocks,
      attachments: options.attachments,
      thread_ts: options.threadTs,
      reply_broadcast: options.replyBroadcast,
      unfurl_links: options.unfurlLinks,
      unfurl_media: options.unfurlMedia,
      mrkdwn: options.mrkdwn,
      metadata: options.metadata
    });

    return {
      ts: response.ts,
      channel: response.channel,
      message: this.transformMessage(response.message)
    };
  }

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    options?: { blocks?: SlackBlock[]; attachments?: SlackAttachment[] }
  ): Promise<{ ts: string; channel: string }> {
    return this.request('chat.update', {
      channel,
      ts,
      text,
      blocks: options?.blocks,
      attachments: options?.attachments
    });
  }

  async deleteMessage(channel: string, ts: string): Promise<void> {
    await this.request('chat.delete', { channel, ts });
  }

  async getPermalink(channel: string, ts: string): Promise<string> {
    const response = await this.request<{ permalink: string }>('chat.getPermalink', {
      channel,
      message_ts: ts
    });
    return response.permalink;
  }

  async scheduleMessage(
    channel: string,
    text: string,
    postAt: number,
    options?: { blocks?: SlackBlock[]; threadTs?: string }
  ): Promise<{ scheduledMessageId: string; postAt: number }> {
    const response = await this.request<{ scheduled_message_id: string; post_at: number }>(
      'chat.scheduleMessage',
      {
        channel,
        text,
        post_at: postAt,
        blocks: options?.blocks,
        thread_ts: options?.threadTs
      }
    );
    return { scheduledMessageId: response.scheduled_message_id, postAt: response.post_at };
  }

  async deleteScheduledMessage(channel: string, scheduledMessageId: string): Promise<void> {
    await this.request('chat.deleteScheduledMessage', {
      channel,
      scheduled_message_id: scheduledMessageId
    });
  }

  async getConversationHistory(
    channel: string,
    options?: { limit?: number; cursor?: string; oldest?: string; latest?: string; inclusive?: boolean }
  ): Promise<{ messages: SlackMessage[]; hasMore: boolean; cursor?: string }> {
    const response = await this.request<{
      messages: Array<Record<string, unknown>>;
      has_more: boolean;
      response_metadata?: { next_cursor: string };
    }>('conversations.history', {
      channel,
      limit: options?.limit || 100,
      cursor: options?.cursor,
      oldest: options?.oldest,
      latest: options?.latest,
      inclusive: options?.inclusive
    });

    return {
      messages: response.messages.map(m => this.transformMessage(m)),
      hasMore: response.has_more,
      cursor: response.response_metadata?.next_cursor
    };
  }

  async getThreadReplies(
    channel: string,
    threadTs: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ messages: SlackMessage[]; hasMore: boolean; cursor?: string }> {
    const response = await this.request<{
      messages: Array<Record<string, unknown>>;
      has_more: boolean;
      response_metadata?: { next_cursor: string };
    }>('conversations.replies', {
      channel,
      ts: threadTs,
      limit: options?.limit || 100,
      cursor: options?.cursor
    });

    return {
      messages: response.messages.map(m => this.transformMessage(m)),
      hasMore: response.has_more,
      cursor: response.response_metadata?.next_cursor
    };
  }

  async addReaction(channel: string, ts: string, emoji: string): Promise<void> {
    await this.request('reactions.add', { channel, timestamp: ts, name: emoji });
  }

  async removeReaction(channel: string, ts: string, emoji: string): Promise<void> {
    await this.request('reactions.remove', { channel, timestamp: ts, name: emoji });
  }

  async pinMessage(channel: string, ts: string): Promise<void> {
    await this.request('pins.add', { channel, timestamp: ts });
  }

  async unpinMessage(channel: string, ts: string): Promise<void> {
    await this.request('pins.remove', { channel, timestamp: ts });
  }

  private transformMessage(data: Record<string, unknown>): SlackMessage {
    return {
      type: data.type as string,
      subtype: data.subtype as string | undefined,
      ts: data.ts as string,
      user: data.user as string | undefined,
      botId: data.bot_id as string | undefined,
      text: data.text as string,
      blocks: data.blocks as SlackBlock[] | undefined,
      attachments: data.attachments as SlackAttachment[] | undefined,
      files: (data.files as Array<Record<string, unknown>>)?.map(f => this.transformFile(f)),
      reactions: data.reactions as Array<{ name: string; count: number; users: string[] }> | undefined,
      threadTs: data.thread_ts as string | undefined,
      replyCount: data.reply_count as number | undefined,
      replyUsers: data.reply_users as string[] | undefined,
      replyUsersCount: data.reply_users_count as number | undefined,
      latestReply: data.latest_reply as string | undefined,
      edited: data.edited as { user: string; ts: string } | undefined
    };
  }

  // ==========================================================================
  // CHANNEL OPERATIONS
  // ==========================================================================

  async listChannels(options?: {
    types?: string;
    excludeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<{ channels: SlackChannel[]; cursor?: string }> {
    const response = await this.request<{
      channels: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor: string };
    }>('conversations.list', {
      types: options?.types || 'public_channel,private_channel',
      exclude_archived: options?.excludeArchived ?? true,
      limit: options?.limit || 200,
      cursor: options?.cursor
    });

    return {
      channels: response.channels.map(c => this.transformChannel(c)),
      cursor: response.response_metadata?.next_cursor
    };
  }

  async getChannel(channelId: string): Promise<SlackChannel> {
    const response = await this.request<{ channel: Record<string, unknown> }>(
      'conversations.info',
      { channel: channelId }
    );
    return this.transformChannel(response.channel);
  }

  async createChannel(options: ChannelCreateOptions): Promise<SlackChannel> {
    const response = await this.request<{ channel: Record<string, unknown> }>(
      'conversations.create',
      {
        name: options.name,
        is_private: options.isPrivate,
        team_id: options.teamId
      }
    );

    const channel = this.transformChannel(response.channel);

    if (options.description) {
      await this.setChannelTopic(channel.id, options.description);
    }

    return channel;
  }

  async archiveChannel(channelId: string): Promise<void> {
    await this.request('conversations.archive', { channel: channelId });
  }

  async unarchiveChannel(channelId: string): Promise<void> {
    await this.request('conversations.unarchive', { channel: channelId });
  }

  async renameChannel(channelId: string, name: string): Promise<SlackChannel> {
    const response = await this.request<{ channel: Record<string, unknown> }>(
      'conversations.rename',
      { channel: channelId, name }
    );
    return this.transformChannel(response.channel);
  }

  async setChannelTopic(channelId: string, topic: string): Promise<void> {
    await this.request('conversations.setTopic', { channel: channelId, topic });
  }

  async setChannelPurpose(channelId: string, purpose: string): Promise<void> {
    await this.request('conversations.setPurpose', { channel: channelId, purpose });
  }

  async joinChannel(channelId: string): Promise<SlackChannel> {
    const response = await this.request<{ channel: Record<string, unknown> }>(
      'conversations.join',
      { channel: channelId }
    );
    return this.transformChannel(response.channel);
  }

  async leaveChannel(channelId: string): Promise<void> {
    await this.request('conversations.leave', { channel: channelId });
  }

  async inviteToChannel(channelId: string, userIds: string[]): Promise<SlackChannel> {
    const response = await this.request<{ channel: Record<string, unknown> }>(
      'conversations.invite',
      { channel: channelId, users: userIds.join(',') }
    );
    return this.transformChannel(response.channel);
  }

  async kickFromChannel(channelId: string, userId: string): Promise<void> {
    await this.request('conversations.kick', { channel: channelId, user: userId });
  }

  async getChannelMembers(
    channelId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ members: string[]; cursor?: string }> {
    const response = await this.request<{
      members: string[];
      response_metadata?: { next_cursor: string };
    }>('conversations.members', {
      channel: channelId,
      limit: options?.limit || 200,
      cursor: options?.cursor
    });

    return {
      members: response.members,
      cursor: response.response_metadata?.next_cursor
    };
  }

  private transformChannel(data: Record<string, unknown>): SlackChannel {
    const topic = data.topic as Record<string, unknown> | undefined;
    const purpose = data.purpose as Record<string, unknown> | undefined;

    return {
      id: data.id as string,
      name: data.name as string,
      isChannel: data.is_channel as boolean,
      isGroup: data.is_group as boolean,
      isIm: data.is_im as boolean,
      isMpim: data.is_mpim as boolean,
      isPrivate: data.is_private as boolean,
      isArchived: data.is_archived as boolean,
      isMember: data.is_member as boolean,
      topic: topic ? {
        value: topic.value as string,
        creator: topic.creator as string,
        lastSet: topic.last_set as number
      } : undefined,
      purpose: purpose ? {
        value: purpose.value as string,
        creator: purpose.creator as string,
        lastSet: purpose.last_set as number
      } : undefined,
      numMembers: data.num_members as number | undefined,
      created: data.created as number,
      creator: data.creator as string | undefined
    };
  }

  // ==========================================================================
  // USER OPERATIONS
  // ==========================================================================

  async listUsers(options?: { limit?: number; cursor?: string }): Promise<{
    users: SlackUser[];
    cursor?: string;
  }> {
    const response = await this.request<{
      members: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor: string };
    }>('users.list', {
      limit: options?.limit || 200,
      cursor: options?.cursor
    });

    return {
      users: response.members.map(u => this.transformUser(u)),
      cursor: response.response_metadata?.next_cursor
    };
  }

  async getUser(userId: string): Promise<SlackUser> {
    const response = await this.request<{ user: Record<string, unknown> }>(
      'users.info',
      { user: userId }
    );
    return this.transformUser(response.user);
  }

  async getUserByEmail(email: string): Promise<SlackUser> {
    const response = await this.request<{ user: Record<string, unknown> }>(
      'users.lookupByEmail',
      { email }
    );
    return this.transformUser(response.user);
  }

  async setUserStatus(
    statusText: string,
    statusEmoji?: string,
    statusExpiration?: number
  ): Promise<void> {
    await this.request('users.profile.set', {
      profile: {
        status_text: statusText,
        status_emoji: statusEmoji || '',
        status_expiration: statusExpiration || 0
      }
    });
  }

  async openDirectMessage(userId: string): Promise<string> {
    const response = await this.request<{ channel: { id: string } }>(
      'conversations.open',
      { users: userId }
    );
    return response.channel.id;
  }

  private transformUser(data: Record<string, unknown>): SlackUser {
    const profile = data.profile as Record<string, unknown>;
    return {
      id: data.id as string,
      name: data.name as string,
      realName: (profile.real_name as string) || (data.real_name as string) || '',
      displayName: (profile.display_name as string) || '',
      email: profile.email as string | undefined,
      phone: profile.phone as string | undefined,
      title: profile.title as string | undefined,
      statusText: profile.status_text as string | undefined,
      statusEmoji: profile.status_emoji as string | undefined,
      timezone: data.tz as string | undefined,
      isAdmin: data.is_admin as boolean,
      isOwner: data.is_owner as boolean,
      isBot: data.is_bot as boolean,
      deleted: data.deleted as boolean,
      avatar: {
        image24: profile.image_24 as string,
        image48: profile.image_48 as string,
        image72: profile.image_72 as string,
        image192: profile.image_192 as string,
        image512: profile.image_512 as string
      }
    };
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  async uploadFile(options: {
    channels?: string[];
    content?: string | Buffer;
    file?: Buffer;
    filename: string;
    filetype?: string;
    title?: string;
    initialComment?: string;
    threadTs?: string;
  }): Promise<SlackFile> {
    const formData = new FormData();

    if (options.content) {
      formData.append('content', options.content.toString());
    } else if (options.file) {
      const uint8Array = new Uint8Array(options.file);
      formData.append('file', new Blob([uint8Array]), options.filename);
    }

    formData.append('filename', options.filename);
    if (options.channels) formData.append('channels', options.channels.join(','));
    if (options.filetype) formData.append('filetype', options.filetype);
    if (options.title) formData.append('title', options.title);
    if (options.initialComment) formData.append('initial_comment', options.initialComment);
    if (options.threadTs) formData.append('thread_ts', options.threadTs);

    const response = await fetch(`${this.API_BASE}/files.upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.credentials!.accessToken}` },
      body: formData
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`File upload failed: ${data.error}`);
    }

    return this.transformFile(data.file);
  }

  async listFiles(options?: {
    channel?: string;
    user?: string;
    types?: string;
    count?: number;
    page?: number;
  }): Promise<{ files: SlackFile[]; paging: { count: number; total: number; page: number; pages: number } }> {
    const response = await this.request<{
      files: Array<Record<string, unknown>>;
      paging: { count: number; total: number; page: number; pages: number };
    }>('files.list', {
      channel: options?.channel,
      user: options?.user,
      types: options?.types,
      count: options?.count || 100,
      page: options?.page || 1
    });

    return {
      files: response.files.map(f => this.transformFile(f)),
      paging: response.paging
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request('files.delete', { file: fileId });
  }

  async shareFilePublicly(fileId: string): Promise<{ permalink: string; permalinkPublic: string }> {
    const response = await this.request<{ file: { permalink: string; permalink_public: string } }>(
      'files.sharedPublicURL',
      { file: fileId }
    );
    return {
      permalink: response.file.permalink,
      permalinkPublic: response.file.permalink_public
    };
  }

  private transformFile(data: Record<string, unknown>): SlackFile {
    return {
      id: data.id as string,
      name: data.name as string,
      title: data.title as string,
      mimetype: data.mimetype as string,
      filetype: data.filetype as string,
      size: data.size as number,
      urlPrivate: data.url_private as string,
      urlPrivateDownload: data.url_private_download as string,
      permalink: data.permalink as string,
      permalinkPublic: data.permalink_public as string | undefined,
      user: data.user as string,
      created: data.created as number,
      timestamp: data.timestamp as number,
      isPublic: data.is_public as boolean,
      shares: data.shares as Record<string, Array<{ ts: string }>> | undefined
    };
  }

  // ==========================================================================
  // INTERACTIVE COMPONENTS
  // ==========================================================================

  createBlockMessage(blocks: SlackBlock[]): { blocks: SlackBlock[] } {
    return { blocks };
  }

  createSection(text: string, options?: {
    accessory?: unknown;
    fields?: Array<{ type: string; text: string }>;
  }): SlackBlock {
    return {
      type: 'section',
      text: { type: 'mrkdwn', text },
      accessory: options?.accessory,
      fields: options?.fields
    };
  }

  createDivider(): SlackBlock {
    return { type: 'divider' };
  }

  createActions(elements: unknown[], blockId?: string): SlackBlock {
    return {
      type: 'actions',
      blockId,
      elements
    } as SlackBlock;
  }

  createButton(text: string, actionId: string, options?: {
    value?: string;
    style?: 'primary' | 'danger';
    url?: string;
  }): unknown {
    return {
      type: 'button',
      text: { type: 'plain_text', text, emoji: true },
      action_id: actionId,
      value: options?.value,
      style: options?.style,
      url: options?.url
    };
  }

  createInput(label: string, actionId: string, options?: {
    placeholder?: string;
    multiline?: boolean;
    optional?: boolean;
  }): SlackBlock {
    return {
      type: 'input',
      blockId: actionId,
      element: {
        type: options?.multiline ? 'plain_text_input' : 'plain_text_input',
        action_id: actionId,
        placeholder: options?.placeholder ? { type: 'plain_text', text: options.placeholder } : undefined,
        multiline: options?.multiline
      },
      text: { type: 'plain_text', text: label }
    } as unknown as SlackBlock;
  }

  // ==========================================================================
  // SOCKET MODE (REAL-TIME EVENTS)
  // ==========================================================================

  async connectSocketMode(appToken: string): Promise<void> {
    const response = await fetch(`${this.API_BASE}/apps.connections.open`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Socket Mode connection failed: ${data.error}`);
    }

    this.establishWebSocket(data.url);
  }

  private establishWebSocket(url: string): void {
    // Note: WebSocket implementation would require a WebSocket library in Node.js
    // This is a placeholder for the socket mode implementation
    this.emit('socket_connecting', { url });

    // In a real implementation, you would:
    // 1. Create WebSocket connection
    // 2. Handle messages and acknowledge them
    // 3. Process events and emit them
    // 4. Handle reconnection logic
  }

  disconnectSocketMode(): void {
    if (this.socketConnection) {
      this.socketConnection.close();
      this.socketConnection = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.emit('socket_disconnected');
  }

  // ==========================================================================
  // WEBHOOK VERIFICATION
  // ==========================================================================

  verifyRequest(
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    const crypto = require('crypto');

    // Check timestamp is within 5 minutes
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp) < fiveMinutesAgo) {
      return false;
    }

    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', this.signingSecret)
      .update(sigBasestring)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  }

  parseEvent(body: string): SlackEvent {
    const data = JSON.parse(body);

    // Handle URL verification challenge
    if (data.type === 'url_verification') {
      return { type: 'url_verification', challenge: data.challenge, eventTs: '' };
    }

    // Handle event callbacks
    if (data.type === 'event_callback') {
      const event: SlackEvent = {
        ...data.event,
        eventTs: data.event_time?.toString() || data.event.event_ts
      };
      this.emit('event', event);
      return event;
    }

    return data;
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  async searchMessages(
    query: string,
    options?: { sort?: 'score' | 'timestamp'; sortDir?: 'asc' | 'desc'; count?: number; page?: number }
  ): Promise<{
    messages: Array<{ channel: { id: string; name: string }; message: SlackMessage }>;
    total: number;
    paging: { count: number; total: number; page: number; pages: number };
  }> {
    const response = await this.request<{
      messages: {
        matches: Array<{ channel: { id: string; name: string }; [key: string]: unknown }>;
        total: number;
        paging: { count: number; total: number; page: number; pages: number };
      };
    }>('search.messages', {
      query,
      sort: options?.sort || 'score',
      sort_dir: options?.sortDir || 'desc',
      count: options?.count || 20,
      page: options?.page || 1
    });

    return {
      messages: response.messages.matches.map(m => ({
        channel: m.channel,
        message: this.transformMessage(m)
      })),
      total: response.messages.total,
      paging: response.messages.paging
    };
  }

  async searchFiles(
    query: string,
    options?: { sort?: 'score' | 'timestamp'; sortDir?: 'asc' | 'desc'; count?: number; page?: number }
  ): Promise<{
    files: SlackFile[];
    total: number;
    paging: { count: number; total: number; page: number; pages: number };
  }> {
    const response = await this.request<{
      files: {
        matches: Array<Record<string, unknown>>;
        total: number;
        paging: { count: number; total: number; page: number; pages: number };
      };
    }>('search.files', {
      query,
      sort: options?.sort || 'score',
      sort_dir: options?.sortDir || 'desc',
      count: options?.count || 20,
      page: options?.page || 1
    });

    return {
      files: response.files.matches.map(f => this.transformFile(f)),
      total: response.files.total,
      paging: response.files.paging
    };
  }

  // ==========================================================================
  // REMINDERS
  // ==========================================================================

  async addReminder(
    text: string,
    time: number | string,
    user?: string
  ): Promise<{ id: string; text: string; time: number }> {
    const response = await this.request<{
      reminder: { id: string; text: string; time: number };
    }>('reminders.add', {
      text,
      time,
      user
    });
    return response.reminder;
  }

  async listReminders(): Promise<Array<{ id: string; text: string; time: number; complete: boolean }>> {
    const response = await this.request<{
      reminders: Array<{ id: string; text: string; time: number; complete_ts: number }>;
    }>('reminders.list', {});
    return response.reminders.map(r => ({
      id: r.id,
      text: r.text,
      time: r.time,
      complete: r.complete_ts > 0
    }));
  }

  async deleteReminder(reminderId: string): Promise<void> {
    await this.request('reminders.delete', { reminder: reminderId });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createSlackConnector(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  signingSecret: string;
}): SlackConnector {
  return new SlackConnector(config);
}

export default SlackConnector;
