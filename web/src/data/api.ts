import type { CocreationProject, CreatorProfile, DocV6, NotificationItem, SettingComment, StudioPreferences } from '../core/schema/types';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar: string;
  bio: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isMuted?: boolean;
  mutedReason?: string;
  isDisabled?: boolean;
  customPrefs?: StudioPreferences;
  lastSeenAt?: number;
  createdAt?: number;
}

export interface ChallengeResponse {
  question: string;
  token: string;
  registerMode: 'open' | 'invite' | 'closed';
  smtpEnabled: boolean;
}

export interface SyncGetResponse {
  data: DocV6;
  rev: number;
  updatedAt: number;
}

export interface SyncPutResponse {
  rev: number;
  updatedAt: number;
}

export interface SyncConflictPayload {
  error: string;
  serverData: DocV6;
  serverRev: number;
  updatedAt: number;
}

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiConflictError extends ApiError {
  serverData: DocV6;
  serverRev: number;
  updatedAt: number;

  constructor(payload: SyncConflictPayload) {
    super(payload.error || 'Sync revision conflict', 409, payload);
    this.name = 'ApiConflictError';
    this.serverData = payload.serverData;
    this.serverRev = payload.serverRev;
    this.updatedAt = payload.updatedAt;
  }
}

export interface RevisionMeta {
  id: number;
  rev: number;
  byteSize: number;
  summary: string;
  createdAt: number;
}

export interface RevisionDetail extends RevisionMeta {
  data: DocV6;
}

export interface LobbyUser {
  id: number;
  name: string;
  avatar: string;
  bio: string;
  focus: string;
  lastSeen: number;
  isOnline: boolean;
}

export interface WorldShareItem {
  id: string | number;
  userId: number;
  ownerName: string;
  kind: 'world' | 'org' | 'char' | 'article' | string;
  title: string;
  summary: string;
  content: string;
  draftCode?: string;
  visibility: 'public' | 'private';
  entityId?: string;
  tags?: string;
  wordCount?: number;
  canonStatus?: 'canon' | 'doujin';
  cocreationId?: string;
  canonRequested?: boolean;
  tachiEUrl?: string;
  canonReview?: 'none' | 'pending' | 'approved' | 'rejected';
  reviewedBy?: number;
  reviewedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

/** What the server tells us about a stored custom AI config: never the key itself. */
export interface CloudAIConfigMeta {
  provider: UserAIConfig['provider'];
  baseUrl?: string;
  model?: string;
  hasKey: boolean;
  apiKeyMasked?: string;
}

export interface GlobalDashboardStats {
  totalUsers: number;
  onlineUsers: number;
  totalPublicShares: number;
  kindCounts: Record<string, number>;
  totalPublicWords: number;
  totalSyncedWords: number;
  recentCreations: WorldShareItem[];
  activeCreators: LobbyUser[];
}

export interface UserAIConfig {
  provider: 'public' | 'deepseek' | 'siliconflow' | 'openrouter' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface AIPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hint: string;
}

export interface AIStatusResponse {
  publicReady: boolean;
  freeModels: string[];
  presets: AIPreset[];
}

export interface AIGenerateRequest {
  task: 'field_gen' | 'entity_gen' | 'article_write' | 'article_continue' | 'article_summary';
  fieldId?: string;
  fieldLabel?: string;
  entityKind?: string;
  entityData?: Record<string, string>;
  currentText?: string;
  prompt?: string;
  context?: string;
  customAi?: UserAIConfig;
  preferences?: StudioPreferences;
}

export interface AIGenerateResponse {
  content: string;
  model: string;
  usedAi: 'public' | 'custom';
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers
  });

  if (res.status === 204) {
    return null as unknown as T;
  }

  let body: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    try {
      body = await res.text();
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    if (res.status === 409 && body && body.serverData) {
      throw new ApiConflictError(body as SyncConflictPayload);
    }
    const msg =
      (body && typeof body === 'object' && (body.error || body.message)) ||
      (typeof body === 'string' && body) ||
      `HTTP ${res.status}`;
    throw new ApiError(String(msg), res.status, body);
  }

  return body as T;
}

export const api = {
  // Auth
  getChallenge(): Promise<ChallengeResponse> {
    return requestJson<ChallengeResponse>('/api/auth/challenge');
  },

  register(payload: {
    email: string;
    password: string;
    inviteCode?: string;
    challengeToken?: string;
    challengeAnswer?: string;
  }): Promise<{ user: AuthUser }> {
    return requestJson<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  login(payload: { email: string; password: string }): Promise<{ user: AuthUser }> {
    return requestJson<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  // Profile & Avatar
  getMe(): Promise<{ user: AuthUser }> {
    return requestJson<{ user: AuthUser }>('/api/me');
  },

  updateMe(payload: { name?: string; avatar?: string; bio?: string }): Promise<{ user: AuthUser }> {
    return requestJson<{ user: AuthUser }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },

  uploadAvatar(blob: Blob): Promise<{ avatar: string; user: AuthUser }> {
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.jpg');
    return requestJson<{ avatar: string; user: AuthUser }>('/api/me/avatar', {
      method: 'POST',
      body: fd
    });
  },

  // Cloud Sync & Revisions
  getSync(): Promise<SyncGetResponse | null> {
    return requestJson<SyncGetResponse | null>('/api/sync');
  },

  putSync(data: DocV6, baseRev: number): Promise<SyncPutResponse> {
    return requestJson<SyncPutResponse>('/api/sync', {
      method: 'PUT',
      body: JSON.stringify({ data, baseRev })
    });
  },

  getRevisions(): Promise<{ revisions: RevisionMeta[] }> {
    return requestJson<{ revisions: RevisionMeta[] }>('/api/sync/revisions');
  },

  getRevisionDetail(id: number): Promise<RevisionDetail> {
    return requestJson<RevisionDetail>(`/api/sync/revisions/${id}`);
  },

  // Presence, Lobby & World Shares
  postPresence(focus: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/presence', {
      method: 'POST',
      body: JSON.stringify({ focus })
    });
  },

  getLobbyUsers(): Promise<{ users: LobbyUser[] }> {
    return requestJson<{ users: LobbyUser[] }>('/api/lobby/users');
  },

  getGlobalStats(): Promise<GlobalDashboardStats> {
    return requestJson<GlobalDashboardStats>('/api/stats/global');
  },

  getShares(params?: {
    owner?: 'me';
    visibility?: 'all' | 'public' | 'private';
    kind?: string;
    q?: string;
    /** Keyset cursor: `createdAt` (unix seconds) of the last item ... */
    before?: number;
    /** ... and its id, so rows sharing a second are neither skipped nor repeated. */
    beforeId?: string;
    limit?: number;
    /** Feed rows omit `content` by default; pass true to include it. */
    full?: boolean;
  }): Promise<{
    shares: WorldShareItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.owner) qs.set('owner', params.owner);
    if (params?.visibility) qs.set('visibility', params.visibility);
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.q) qs.set('q', params.q);
    if (params?.before) qs.set('before', String(params.before));
    if (params?.beforeId) qs.set('beforeId', params.beforeId);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.full) qs.set('full', '1');
    const qStr = qs.toString();
    return requestJson<{ shares: WorldShareItem[] }>(`/api/shares${qStr ? '?' + qStr : ''}`);
  },

  getShareDetail(id: string | number): Promise<{ share: WorldShareItem }> {
    return requestJson<{ share: WorldShareItem }>(`/api/shares/${id}`);
  },

  createShare(payload: {
    id?: string;
    entityId?: string;
    kind?: string;
    title: string;
    summary: string;
    content: string;
    draftCode?: string;
    visibility?: 'public' | 'private';
    tags?: string;
  }): Promise<{ share: WorldShareItem }> {
    return requestJson<{ share: WorldShareItem }>('/api/shares', {
      method: 'POST',
      body: JSON.stringify({
        id: payload.id,
        entityId: payload.entityId || '',
        kind: payload.kind || 'world',
        title: payload.title,
        summary: payload.summary,
        content: payload.content,
        draftCode: payload.draftCode || '',
        visibility: payload.visibility || 'public',
        tags: payload.tags || ''
      })
    });
  },

  updateShareVisibility(id: string | number, visibility: 'public' | 'private'): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/shares/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility })
    });
  },

  deleteShare(id: string | number): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/shares/${id}`, {
      method: 'DELETE'
    });
  },

  // AI Service
  getAIStatus(): Promise<AIStatusResponse> {
    return requestJson<AIStatusResponse>('/api/ai/status');
  },

  generateAI(payload: AIGenerateRequest): Promise<AIGenerateResponse> {
    return requestJson<AIGenerateResponse>('/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  testAIConnection(payload: UserAIConfig): Promise<{ ok: boolean; message: string }> {
    return requestJson<{ ok: boolean; message: string }>('/api/ai/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getUserAIConfig(): Promise<{ customAi?: CloudAIConfigMeta | null; preferences?: StudioPreferences }> {
    return requestJson<{ customAi?: CloudAIConfigMeta | null; preferences?: StudioPreferences }>('/api/me/ai-config');
  },

  /** Partial update: only the parts present are written server-side. */
  updateUserAIConfig(payload: {
    customAi?: UserAIConfig;
    preferences?: StudioPreferences;
    clearKey?: boolean;
  }): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/me/ai-config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  // Reference Materials
  getReferenceMaterials(): Promise<DocV6 | null> {
    return requestJson<DocV6 | null>('/api/reference-materials').catch(() => null);
  },

  updateReferenceMaterials(doc: DocV6): Promise<{ status: string; message: string }> {
    return requestJson<{ status: string; message: string }>('/api/admin/reference-materials', {
      method: 'PUT',
      body: JSON.stringify(doc)
    });
  },

  // Anime AI Paint
  paintAnime(payload: {
    prompt: string;
    style?: string;
    aspectRatio?: string;
    charName?: string;
    features?: string;
  }): Promise<{ imageUrl: string; prompt: string; style: string; usedModel: string }> {
    return requestJson('/api/ai/paint', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Comments & Discussions
  getComments(shareId: string | number): Promise<{ comments: SettingComment[] }> {
    return requestJson<{ comments: SettingComment[] }>(`/api/shares/${shareId}/comments`);
  },

  addComment(shareId: string | number, content: string, parentId?: number): Promise<{ comment: SettingComment }> {
    return requestJson<{ comment: SettingComment }>(`/api/shares/${shareId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId: parentId || 0 })
    });
  },

  toggleCommentLike(commentId: number): Promise<{ liked: boolean; likeCount: number }> {
    return requestJson<{ liked: boolean; likeCount: number }>(`/api/comments/${commentId}/like`, {
      method: 'POST'
    });
  },

  deleteComment(commentId: number): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/comments/${commentId}`, {
      method: 'DELETE'
    });
  },

  // Notifications
  getNotifications(limit?: number): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
    return requestJson<{ notifications: NotificationItem[]; unreadCount: number }>(`/api/notifications?limit=${limit || 30}`);
  },

  markNotificationsRead(): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/notifications/read-all', {
      method: 'POST'
    });
  },

  markNotificationRead(id: number): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/notifications/${id}/read`, {
      method: 'POST'
    });
  },

  // Co-creation
  getCocreationProjects(opts?: { mine?: boolean; limit?: number }): Promise<{ projects: CocreationProject[] }> {
    const qs = new URLSearchParams();
    if (opts?.mine) qs.set('mine', '1');
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const q = qs.toString();
    return requestJson<{ projects: CocreationProject[] }>(`/api/cocreation/projects${q ? '?' + q : ''}`);
  },

  getCocreationProject(projectId: string): Promise<{ project: CocreationProject }> {
    return requestJson<{ project: CocreationProject }>(`/api/cocreation/projects/${encodeURIComponent(projectId)}`);
  },

  createCocreationProject(payload: {
    worldId: string;
    worldTitle: string;
    summary: string;
    admins: string[];
  }): Promise<{ project: CocreationProject; unresolved: string[] }> {
    return requestJson<{ project: CocreationProject; unresolved: string[] }>('/api/cocreation/projects', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateCocreationProject(
    projectId: string,
    patch: { summary?: string; isOpenDoujin?: boolean }
  ): Promise<{ ok: boolean; project: CocreationProject }> {
    return requestJson<{ ok: boolean; project: CocreationProject }>(`/api/cocreation/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
  },

  /** Replace project admins. Emails are resolved server-side; unknown ones come back in `unresolved`. */
  updateCocreationAdmins(
    projectId: string,
    payload: { emails?: string[]; userIds?: number[] }
  ): Promise<{ ok: boolean; unresolved: string[]; project: CocreationProject }> {
    return requestJson<{ ok: boolean; unresolved: string[]; project: CocreationProject }>(
      `/api/cocreation/projects/${encodeURIComponent(projectId)}/admins`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
  },

  getCanonQueue(
    projectId: string,
    status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending'
  ): Promise<{ shares: WorldShareItem[] }> {
    return requestJson<{ shares: WorldShareItem[] }>(
      `/api/cocreation/projects/${encodeURIComponent(projectId)}/queue?status=${status}`
    );
  },

  requestCanon(shareId: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/cocreation/shares/${shareId}/request-canon`, {
      method: 'POST'
    });
  },

  approveCanon(shareId: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/cocreation/shares/${shareId}/approve-canon`, {
      method: 'POST'
    });
  },

  rejectCanon(shareId: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/cocreation/shares/${shareId}/reject-canon`, {
      method: 'POST'
    });
  },

  // Creator Profile
  getCreatorProfile(userId: number): Promise<CreatorProfile> {
    return requestJson<CreatorProfile>(`/api/lobby/creator-profile?user_id=${userId}`);
  },

  // Admin Management
  getAdminUsers(): Promise<{ users: AuthUser[] }> {
    return requestJson<{ users: AuthUser[] }>('/api/admin/users');
  },

  setAdminUserRole(userId: number, isAdmin: boolean): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ isAdmin })
    });
  },

  setAdminUserMute(userId: number, isMuted: boolean, reason?: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/admin/users/${userId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ isMuted, reason: reason || '' })
    });
  },

  setAdminUserStatus(userId: number, isDisabled: boolean): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/admin/users/${userId}/status`, {
      method: 'POST',
      body: JSON.stringify({ isDisabled })
    });
  },

  liftAdminUserPenalties(userId: number): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/admin/users/${userId}/lift`, {
      method: 'POST'
    });
  },

  addReferenceExample(kind: string, item: any): Promise<{ ok: boolean; message: string }> {
    return requestJson<{ ok: boolean; message: string }>('/api/admin/reference-materials/item', {
      method: 'POST',
      body: JSON.stringify({ kind, item })
    });
  },

  deleteReferenceExample(kind: string, id: string): Promise<{ ok: boolean; message: string }> {
    return requestJson<{ ok: boolean; message: string }>(
      `/api/admin/reference-materials/item?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
      {
        method: 'DELETE'
      }
    );
  }
};
