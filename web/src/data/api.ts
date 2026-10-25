import type { DocV6 } from '../core/schema/types';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar: string;
  bio: string;
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
  id: number;
  userId: number;
  ownerName: string;
  kind: string;
  title: string;
  summary: string;
  content: string;
  draftCode: string;
  createdAt: number;
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

  // Presence & Lobby
  postPresence(focus: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/presence', {
      method: 'POST',
      body: JSON.stringify({ focus })
    });
  },

  getLobbyUsers(): Promise<{ users: LobbyUser[] }> {
    return requestJson<{ users: LobbyUser[] }>('/api/lobby/users');
  },

  getShares(params?: { owner?: 'me'; before?: number; limit?: number }): Promise<{
    shares: WorldShareItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.owner) qs.set('owner', params.owner);
    if (params?.before) qs.set('before', String(params.before));
    if (params?.limit) qs.set('limit', String(params.limit));
    const qStr = qs.toString();
    return requestJson<{ shares: WorldShareItem[] }>(`/api/shares${qStr ? '?' + qStr : ''}`);
  },

  createShare(payload: {
    kind?: string;
    title: string;
    summary: string;
    content: string;
    draftCode?: string;
  }): Promise<{ share: WorldShareItem }> {
    return requestJson<{ share: WorldShareItem }>('/api/shares', {
      method: 'POST',
      body: JSON.stringify({
        kind: payload.kind || 'world',
        title: payload.title,
        summary: payload.summary,
        content: payload.content,
        draftCode: payload.draftCode || ''
      })
    });
  },

  deleteShare(id: number): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/shares/${id}`, {
      method: 'DELETE'
    });
  }
};
