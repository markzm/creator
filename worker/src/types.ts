export interface Env {
  DB: D1Database;
  AVATARS?: R2Bucket;
  ASSETS: Fetcher;
  REGISTER_MODE?: string;
  SECRET_KEY?: string;
  ALLOWED_AI_HOSTS?: string;
  OPENROUTER_API_KEY?: string;
  AI_PUBLIC_MINUTE?: string;
  AI_PUBLIC_DAILY?: string;
  AI_CUSTOM_MINUTE?: string;
  AI_MAX_INPUT_BYTES?: string;
  AI_MAX_OUTPUT_TOKENS?: string;
  AI_TIMEOUT_SECONDS?: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  nickname: string;
  avatar_url: string;
  bio: string;
  presence_focus: string;
  last_seen_at: number;
  is_admin: number;
  is_super_admin?: number;
  is_disabled: number;
  is_muted?: number;
  muted_reason?: string;
  ai_config_enc?: string;
  custom_prefs_json?: string;
  created_at: number;
  updated_at: number;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar: string;
  bio: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isMuted: boolean;
  mutedReason?: string;
  isDisabled: boolean;
  customPrefs?: any;
  lastSeenAt?: number;
  createdAt?: number;
}

export function toAuthUser(row: UserRow): AuthUser {
  let customPrefs: any = undefined;
  if (row.custom_prefs_json) {
    try {
      customPrefs = JSON.parse(row.custom_prefs_json);
    } catch {
      // ignore
    }
  }
  return {
    id: row.id,
    email: row.email,
    name: row.nickname || '未命名创作者',
    avatar: row.avatar_url || '',
    bio: row.bio || '',
    isAdmin: Boolean(row.is_admin),
    isSuperAdmin: Boolean(row.is_super_admin),
    isMuted: Boolean(row.is_muted),
    mutedReason: row.muted_reason || '',
    isDisabled: Boolean(row.is_disabled),
    customPrefs,
    lastSeenAt: row.last_seen_at || 0,
    createdAt: row.created_at || 0
  };
}
