import type { DocV6, StudioPreferences } from '../core/schema/types';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar: string;
  bio: string;
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
  createdAt: number;
  updatedAt?: number;
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
    before?: number | string;
    limit?: number;
  }): Promise<{
    shares: WorldShareItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.owner) qs.set('owner', params.owner);
    if (params?.visibility) qs.set('visibility', params.visibility);
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.q) qs.set('q', params.q);
    if (params?.before) qs.set('before', String(params.before));
    if (params?.limit) qs.set('limit', String(params.limit));
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

  getUserAIConfig(): Promise<{ customAi?: UserAIConfig; preferences?: StudioPreferences }> {
    return requestJson<{ customAi?: UserAIConfig; preferences?: StudioPreferences }>('/api/me/ai-config');
  },

  updateUserAIConfig(payload: { customAi?: UserAIConfig; preferences?: StudioPreferences }): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/me/ai-config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
};
