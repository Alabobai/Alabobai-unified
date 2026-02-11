/**
 * Google Connector - Gmail, Calendar, Drive Integration
 * Full OAuth 2.0 flow with secure credential management
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
  tokenType: string;
}

export interface GoogleEmail {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size: number; attachmentId?: string };
    }>;
  };
  sizeEstimate: number;
  historyId: string;
  internalDate: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; responseStatus: string }>;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
  organizer: { email: string; displayName?: string };
  recurrence?: string[];
  conferenceData?: {
    entryPoints: Array<{ entryPointType: string; uri: string }>;
  };
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
  owners?: Array<{ displayName: string; emailAddress: string }>;
  shared: boolean;
  trashed: boolean;
  thumbnailLink?: string;
}

export interface GmailSendOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: Array<{ filename: string; content: Buffer; mimeType: string }>;
  replyTo?: string;
  threadId?: string;
}

export interface CalendarEventOptions {
  summary: string;
  description?: string;
  location?: string;
  start: Date | string;
  end: Date | string;
  timeZone?: string;
  attendees?: string[];
  sendNotifications?: boolean;
  addConference?: boolean;
  recurrence?: string[];
}

export interface DriveUploadOptions {
  name: string;
  content: Buffer | string;
  mimeType: string;
  parentFolderId?: string;
  description?: string;
  starred?: boolean;
}

export interface SyncState {
  gmail: { historyId?: string; lastSync?: number };
  calendar: { syncToken?: string; lastSync?: number };
  drive: { startPageToken?: string; lastSync?: number };
}

// ============================================================================
// GOOGLE CONNECTOR CLASS
// ============================================================================

export class GoogleConnector extends EventEmitter {
  private credentials: GoogleCredentials | null = null;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private syncState: SyncState = {
    gmail: {},
    calendar: {},
    drive: {}
  };

  private readonly GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
  private readonly CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
  private readonly DRIVE_API = 'https://www.googleapis.com/drive/v3';
  private readonly OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

  constructor(config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }) {
    super();
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
  }

  // ==========================================================================
  // OAUTH FLOW
  // ==========================================================================

  getAuthorizationUrl(scopes: string[], state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      ...(state && { state })
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleCredentials> {
    const response = await fetch(this.OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OAuth exchange failed: ${error.error_description || error.error}`);
    }

    const data = await response.json();
    this.credentials = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope.split(' '),
      tokenType: data.token_type
    };

    this.emit('authenticated', { scopes: this.credentials.scope });
    return this.credentials;
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.credentials?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(this.OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.credentials.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    this.credentials = {
      ...this.credentials,
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000
    };

    this.emit('token_refreshed');
  }

  setCredentials(credentials: GoogleCredentials): void {
    this.credentials = credentials;
  }

  getCredentials(): GoogleCredentials | null {
    return this.credentials;
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Not authenticated');
    }

    if (Date.now() >= this.credentials.expiresAt - 60000) {
      await this.refreshAccessToken();
    }

    return this.credentials.accessToken;
  }

  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.ensureValidToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  // ==========================================================================
  // GMAIL OPERATIONS
  // ==========================================================================

  async listEmails(options: {
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  } = {}): Promise<{ messages: GoogleEmail[]; nextPageToken?: string }> {
    const params = new URLSearchParams();
    if (options.query) params.set('q', options.query);
    if (options.maxResults) params.set('maxResults', options.maxResults.toString());
    if (options.labelIds) params.set('labelIds', options.labelIds.join(','));
    if (options.pageToken) params.set('pageToken', options.pageToken);

    const listResponse = await this.request<{
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    }>(`${this.GMAIL_API}/users/me/messages?${params}`);

    if (!listResponse.messages?.length) {
      return { messages: [], nextPageToken: undefined };
    }

    // Fetch full message details in parallel
    const messages = await Promise.all(
      listResponse.messages.map(m =>
        this.request<GoogleEmail>(`${this.GMAIL_API}/users/me/messages/${m.id}`)
      )
    );

    return { messages, nextPageToken: listResponse.nextPageToken };
  }

  async getEmail(messageId: string): Promise<GoogleEmail> {
    return this.request<GoogleEmail>(
      `${this.GMAIL_API}/users/me/messages/${messageId}`
    );
  }

  async sendEmail(options: GmailSendOptions): Promise<{ id: string; threadId: string }> {
    const boundary = `boundary_${Date.now()}`;
    const headers: string[] = [
      `To: ${options.to.join(', ')}`,
      `Subject: ${options.subject}`,
      `MIME-Version: 1.0`
    ];

    if (options.cc?.length) headers.push(`Cc: ${options.cc.join(', ')}`);
    if (options.bcc?.length) headers.push(`Bcc: ${options.bcc.join(', ')}`);
    if (options.replyTo) headers.push(`Reply-To: ${options.replyTo}`);

    let rawMessage: string;

    if (options.attachments?.length || options.htmlBody) {
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

      const parts: string[] = [headers.join('\r\n'), ''];

      // Text part
      parts.push(`--${boundary}`);
      parts.push('Content-Type: text/plain; charset="UTF-8"');
      parts.push('');
      parts.push(options.body);

      // HTML part if provided
      if (options.htmlBody) {
        parts.push(`--${boundary}`);
        parts.push('Content-Type: text/html; charset="UTF-8"');
        parts.push('');
        parts.push(options.htmlBody);
      }

      // Attachments
      for (const att of options.attachments || []) {
        parts.push(`--${boundary}`);
        parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
        parts.push('Content-Transfer-Encoding: base64');
        parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
        parts.push('');
        parts.push(att.content.toString('base64'));
      }

      parts.push(`--${boundary}--`);
      rawMessage = parts.join('\r\n');
    } else {
      headers.push('Content-Type: text/plain; charset="UTF-8"');
      rawMessage = headers.join('\r\n') + '\r\n\r\n' + options.body;
    }

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return this.request<{ id: string; threadId: string }>(
      `${this.GMAIL_API}/users/me/messages/send`,
      {
        method: 'POST',
        body: JSON.stringify({
          raw: encodedMessage,
          ...(options.threadId && { threadId: options.threadId })
        })
      }
    );
  }

  async modifyLabels(
    messageId: string,
    addLabelIds: string[],
    removeLabelIds: string[]
  ): Promise<GoogleEmail> {
    return this.request<GoogleEmail>(
      `${this.GMAIL_API}/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        body: JSON.stringify({ addLabelIds, removeLabelIds })
      }
    );
  }

  async archiveEmail(messageId: string): Promise<GoogleEmail> {
    return this.modifyLabels(messageId, [], ['INBOX']);
  }

  async trashEmail(messageId: string): Promise<GoogleEmail> {
    return this.request<GoogleEmail>(
      `${this.GMAIL_API}/users/me/messages/${messageId}/trash`,
      { method: 'POST' }
    );
  }

  async listLabels(): Promise<Array<{ id: string; name: string; type: string }>> {
    const response = await this.request<{
      labels: Array<{ id: string; name: string; type: string }>;
    }>(`${this.GMAIL_API}/users/me/labels`);
    return response.labels;
  }

  // ==========================================================================
  // CALENDAR OPERATIONS
  // ==========================================================================

  async listCalendars(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
    const response = await this.request<{
      items: Array<{ id: string; summary: string; primary?: boolean }>;
    }>(`${this.CALENDAR_API}/users/me/calendarList`);
    return response.items;
  }

  async listEvents(options: {
    calendarId?: string;
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    query?: string;
    singleEvents?: boolean;
    orderBy?: 'startTime' | 'updated';
    pageToken?: string;
  } = {}): Promise<{ events: GoogleCalendarEvent[]; nextPageToken?: string }> {
    const calendarId = options.calendarId || 'primary';
    const params = new URLSearchParams();

    if (options.timeMin) params.set('timeMin', options.timeMin.toISOString());
    if (options.timeMax) params.set('timeMax', options.timeMax.toISOString());
    if (options.maxResults) params.set('maxResults', options.maxResults.toString());
    if (options.query) params.set('q', options.query);
    if (options.singleEvents) params.set('singleEvents', 'true');
    if (options.orderBy) params.set('orderBy', options.orderBy);
    if (options.pageToken) params.set('pageToken', options.pageToken);

    const response = await this.request<{
      items: GoogleCalendarEvent[];
      nextPageToken?: string;
    }>(`${this.CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);

    return { events: response.items || [], nextPageToken: response.nextPageToken };
  }

  async getEvent(eventId: string, calendarId = 'primary'): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      `${this.CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
    );
  }

  async createEvent(options: CalendarEventOptions, calendarId = 'primary'): Promise<GoogleCalendarEvent> {
    const event: Record<string, unknown> = {
      summary: options.summary,
      description: options.description,
      location: options.location,
      start: this.formatEventTime(options.start, options.timeZone),
      end: this.formatEventTime(options.end, options.timeZone),
      recurrence: options.recurrence
    };

    if (options.attendees?.length) {
      event.attendees = options.attendees.map(email => ({ email }));
    }

    if (options.addConference) {
      event.conferenceData = {
        createRequest: {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      };
    }

    const params = new URLSearchParams();
    if (options.sendNotifications) params.set('sendUpdates', 'all');
    if (options.addConference) params.set('conferenceDataVersion', '1');

    return this.request<GoogleCalendarEvent>(
      `${this.CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        method: 'POST',
        body: JSON.stringify(event)
      }
    );
  }

  async updateEvent(
    eventId: string,
    updates: Partial<CalendarEventOptions>,
    calendarId = 'primary'
  ): Promise<GoogleCalendarEvent> {
    const event: Record<string, unknown> = {};

    if (updates.summary) event.summary = updates.summary;
    if (updates.description) event.description = updates.description;
    if (updates.location) event.location = updates.location;
    if (updates.start) event.start = this.formatEventTime(updates.start, updates.timeZone);
    if (updates.end) event.end = this.formatEventTime(updates.end, updates.timeZone);
    if (updates.attendees) {
      event.attendees = updates.attendees.map(email => ({ email }));
    }

    return this.request<GoogleCalendarEvent>(
      `${this.CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(event)
      }
    );
  }

  async deleteEvent(eventId: string, calendarId = 'primary'): Promise<void> {
    await this.request<void>(
      `${this.CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'DELETE' }
    );
  }

  async getFreeBusy(
    timeMin: Date,
    timeMax: Date,
    calendars: string[] = ['primary']
  ): Promise<Record<string, Array<{ start: string; end: string }>>> {
    const response = await this.request<{
      calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
    }>(`${this.CALENDAR_API}/freeBusy`, {
      method: 'POST',
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendars.map(id => ({ id }))
      })
    });

    return Object.fromEntries(
      Object.entries(response.calendars).map(([id, data]) => [id, data.busy])
    );
  }

  private formatEventTime(
    time: Date | string,
    timeZone?: string
  ): { dateTime: string; timeZone?: string } | { date: string } {
    if (typeof time === 'string') {
      // Check if it's a date-only string (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
        return { date: time };
      }
      return { dateTime: time, timeZone };
    }
    return { dateTime: time.toISOString(), timeZone };
  }

  // ==========================================================================
  // DRIVE OPERATIONS
  // ==========================================================================

  async listFiles(options: {
    query?: string;
    folderId?: string;
    maxResults?: number;
    orderBy?: string;
    pageToken?: string;
    fields?: string;
    trashed?: boolean;
  } = {}): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams();

    let query = options.query || '';
    if (options.folderId) {
      query = query
        ? `${query} and '${options.folderId}' in parents`
        : `'${options.folderId}' in parents`;
    }
    if (options.trashed !== undefined) {
      query = query
        ? `${query} and trashed = ${options.trashed}`
        : `trashed = ${options.trashed}`;
    }

    if (query) params.set('q', query);
    if (options.maxResults) params.set('pageSize', options.maxResults.toString());
    if (options.orderBy) params.set('orderBy', options.orderBy);
    if (options.pageToken) params.set('pageToken', options.pageToken);

    params.set('fields', options.fields ||
      'nextPageToken,files(id,name,mimeType,parents,webViewLink,webContentLink,size,createdTime,modifiedTime,owners,shared,trashed,thumbnailLink)');

    const response = await this.request<{
      files: GoogleDriveFile[];
      nextPageToken?: string;
    }>(`${this.DRIVE_API}/files?${params}`);

    return { files: response.files || [], nextPageToken: response.nextPageToken };
  }

  async getFile(fileId: string): Promise<GoogleDriveFile> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,parents,webViewLink,webContentLink,size,createdTime,modifiedTime,owners,shared,trashed,thumbnailLink'
    });

    return this.request<GoogleDriveFile>(`${this.DRIVE_API}/files/${fileId}?${params}`);
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const token = await this.ensureValidToken();

    const response = await fetch(`${this.DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async uploadFile(options: DriveUploadOptions): Promise<GoogleDriveFile> {
    const token = await this.ensureValidToken();
    const boundary = `boundary_${Date.now()}`;

    const metadata = {
      name: options.name,
      mimeType: options.mimeType,
      parents: options.parentFolderId ? [options.parentFolderId] : undefined,
      description: options.description,
      starred: options.starred
    };

    const content = typeof options.content === 'string'
      ? Buffer.from(options.content)
      : options.content;

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${options.mimeType}`,
      'Content-Transfer-Encoding: base64',
      '',
      content.toString('base64'),
      `--${boundary}--`
    ].join('\r\n');

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return response.json();
  }

  async createFolder(name: string, parentFolderId?: string): Promise<GoogleDriveFile> {
    return this.request<GoogleDriveFile>(`${this.DRIVE_API}/files`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined
      })
    });
  }

  async moveFile(fileId: string, newParentId: string, oldParentId?: string): Promise<GoogleDriveFile> {
    const params = new URLSearchParams({ addParents: newParentId });
    if (oldParentId) params.set('removeParents', oldParentId);

    return this.request<GoogleDriveFile>(
      `${this.DRIVE_API}/files/${fileId}?${params}`,
      { method: 'PATCH' }
    );
  }

  async copyFile(fileId: string, name?: string, parentFolderId?: string): Promise<GoogleDriveFile> {
    return this.request<GoogleDriveFile>(`${this.DRIVE_API}/files/${fileId}/copy`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        parents: parentFolderId ? [parentFolderId] : undefined
      })
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request<void>(`${this.DRIVE_API}/files/${fileId}`, {
      method: 'DELETE'
    });
  }

  async shareFile(
    fileId: string,
    email: string,
    role: 'reader' | 'commenter' | 'writer' | 'owner',
    sendNotification = true
  ): Promise<void> {
    const params = new URLSearchParams({
      sendNotificationEmail: sendNotification.toString()
    });

    await this.request<void>(`${this.DRIVE_API}/files/${fileId}/permissions?${params}`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'user',
        role,
        emailAddress: email
      })
    });
  }

  // ==========================================================================
  // SYNC OPERATIONS
  // ==========================================================================

  async syncGmail(): Promise<{
    added: GoogleEmail[];
    deleted: string[];
    historyId: string;
  }> {
    if (!this.syncState.gmail.historyId) {
      // Initial sync - get current history ID
      const profile = await this.request<{ historyId: string }>(
        `${this.GMAIL_API}/users/me/profile`
      );
      this.syncState.gmail.historyId = profile.historyId;
      this.syncState.gmail.lastSync = Date.now();
      return { added: [], deleted: [], historyId: profile.historyId };
    }

    try {
      const response = await this.request<{
        history?: Array<{
          messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
          messagesDeleted?: Array<{ message: { id: string } }>;
        }>;
        historyId: string;
      }>(`${this.GMAIL_API}/users/me/history?startHistoryId=${this.syncState.gmail.historyId}`);

      const addedIds = new Set<string>();
      const deletedIds = new Set<string>();

      for (const h of response.history || []) {
        h.messagesAdded?.forEach(m => addedIds.add(m.message.id));
        h.messagesDeleted?.forEach(m => deletedIds.add(m.message.id));
      }

      // Fetch full details for added messages
      const added = await Promise.all(
        Array.from(addedIds)
          .filter(id => !deletedIds.has(id))
          .map(id => this.getEmail(id))
      );

      this.syncState.gmail.historyId = response.historyId;
      this.syncState.gmail.lastSync = Date.now();

      this.emit('gmail_synced', { added: added.length, deleted: deletedIds.size });

      return {
        added,
        deleted: Array.from(deletedIds),
        historyId: response.historyId
      };
    } catch (error: unknown) {
      // History ID expired, need full resync
      if (error instanceof Error && error.message.includes('404')) {
        this.syncState.gmail.historyId = undefined;
        return this.syncGmail();
      }
      throw error;
    }
  }

  async syncCalendar(calendarId = 'primary'): Promise<{
    events: GoogleCalendarEvent[];
    syncToken: string;
  }> {
    const params = new URLSearchParams();

    if (this.syncState.calendar.syncToken) {
      params.set('syncToken', this.syncState.calendar.syncToken);
    } else {
      // Initial sync - get events from past month
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 1);
      params.set('timeMin', timeMin.toISOString());
    }

    try {
      const response = await this.request<{
        items: GoogleCalendarEvent[];
        nextSyncToken: string;
      }>(`${this.CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);

      this.syncState.calendar.syncToken = response.nextSyncToken;
      this.syncState.calendar.lastSync = Date.now();

      this.emit('calendar_synced', { events: response.items.length });

      return { events: response.items, syncToken: response.nextSyncToken };
    } catch (error: unknown) {
      // Sync token expired
      if (error instanceof Error && error.message.includes('410')) {
        this.syncState.calendar.syncToken = undefined;
        return this.syncCalendar(calendarId);
      }
      throw error;
    }
  }

  async syncDrive(): Promise<{
    changes: Array<{ fileId: string; removed: boolean; file?: GoogleDriveFile }>;
    startPageToken: string;
  }> {
    if (!this.syncState.drive.startPageToken) {
      const response = await this.request<{ startPageToken: string }>(
        `${this.DRIVE_API}/changes/startPageToken`
      );
      this.syncState.drive.startPageToken = response.startPageToken;
      this.syncState.drive.lastSync = Date.now();
      return { changes: [], startPageToken: response.startPageToken };
    }

    const response = await this.request<{
      changes: Array<{
        fileId: string;
        removed: boolean;
        file?: GoogleDriveFile;
      }>;
      newStartPageToken: string;
    }>(`${this.DRIVE_API}/changes?pageToken=${this.syncState.drive.startPageToken}&fields=changes(fileId,removed,file(id,name,mimeType,parents,modifiedTime)),newStartPageToken`);

    this.syncState.drive.startPageToken = response.newStartPageToken;
    this.syncState.drive.lastSync = Date.now();

    this.emit('drive_synced', { changes: response.changes.length });

    return { changes: response.changes, startPageToken: response.newStartPageToken };
  }

  getSyncState(): SyncState {
    return { ...this.syncState };
  }

  resetSyncState(): void {
    this.syncState = { gmail: {}, calendar: {}, drive: {} };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createGoogleConnector(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): GoogleConnector {
  return new GoogleConnector(config);
}

export default GoogleConnector;
