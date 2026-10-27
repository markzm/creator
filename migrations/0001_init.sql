-- 001_init.sql: Creator v6 core database schema

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    nickname        TEXT NOT NULL DEFAULT '未命名创作者',
    avatar_url      TEXT NOT NULL DEFAULT '',
    bio             TEXT NOT NULL DEFAULT '',
    presence_focus  TEXT NOT NULL DEFAULT '',
    last_seen_at    INTEGER NOT NULL DEFAULT 0,
    is_admin        INTEGER NOT NULL DEFAULT 0,
    is_disabled     INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash      TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent      TEXT NOT NULL DEFAULT '',
    ip_addr         TEXT NOT NULL DEFAULT '',
    expires_at      INTEGER NOT NULL,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS invites (
    code            TEXT PRIMARY KEY,
    max_uses        INTEGER NOT NULL DEFAULT 1,
    used_count      INTEGER NOT NULL DEFAULT 0,
    expires_at      INTEGER,
    created_by      TEXT NOT NULL DEFAULT 'cli',
    created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_docs (
    user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rev             INTEGER NOT NULL DEFAULT 1,
    doc_json        TEXT NOT NULL,
    byte_size       INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_revisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rev             INTEGER NOT NULL,
    byte_size       INTEGER NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    doc_json        TEXT NOT NULL,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_user_time ON doc_revisions(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS world_shares (
    id              TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_name      TEXT NOT NULL DEFAULT '',
    kind            TEXT NOT NULL DEFAULT 'world',
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',
    draft_code      TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shares_created ON world_shares(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_shares_user_created ON world_shares(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS password_resets (
    token_hash      TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at      INTEGER NOT NULL,
    used            INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);
