-- 003_v66_cocreation_admin_discussions.sql: Co-creation, Admin, Mute, Comments, Notifications, Anime Art

-- User table additions
ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN is_muted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN muted_reason TEXT NOT NULL DEFAULT '';

-- World shares additions
ALTER TABLE world_shares ADD COLUMN canon_status TEXT NOT NULL DEFAULT 'canon'; -- 'canon' or 'doujin'
ALTER TABLE world_shares ADD COLUMN cocreation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE world_shares ADD COLUMN canon_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE world_shares ADD COLUMN tachi_e_url TEXT NOT NULL DEFAULT '';
ALTER TABLE world_shares ADD COLUMN author_id INTEGER NOT NULL DEFAULT 0;

-- Comments / Discussion Group
CREATE TABLE IF NOT EXISTS setting_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id        TEXT NOT NULL,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name       TEXT NOT NULL DEFAULT '',
    user_avatar     TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL,
    parent_id       INTEGER NOT NULL DEFAULT 0,
    like_count      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_share ON setting_comments(share_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_user ON setting_comments(user_id);

-- Comment Likes
CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id      INTEGER NOT NULL REFERENCES setting_comments(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (comment_id, user_id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL DEFAULT 0,
    sender_name     TEXT NOT NULL DEFAULT '',
    type            TEXT NOT NULL, -- 'doujin_created', 'canon_requested', 'canon_approved', 'comment_reply', 'comment_liked', 'admin_alert'
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    target_id       TEXT NOT NULL DEFAULT '',
    target_kind     TEXT NOT NULL DEFAULT '',
    is_read         INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at DESC);

-- Co-creation Projects
CREATE TABLE IF NOT EXISTS cocreation_projects (
    id              TEXT PRIMARY KEY,
    world_id        TEXT NOT NULL,
    world_title     TEXT NOT NULL,
    owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_name      TEXT NOT NULL DEFAULT '',
    admins_json     TEXT NOT NULL DEFAULT '[]', -- JSON array of admin user emails / names
    summary         TEXT NOT NULL DEFAULT '',
    is_open_doujin  INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cocreation_owner ON cocreation_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_cocreation_world ON cocreation_projects(world_id);
