-- 004_v67_permissions_members.sql: co-creation membership, canon review state machine, indexes

CREATE TABLE IF NOT EXISTS cocreation_members (
    project_id  TEXT NOT NULL REFERENCES cocreation_projects(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'admin',
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cocreation_members_user ON cocreation_members(user_id);

INSERT OR IGNORE INTO cocreation_members (project_id, user_id, role, created_at)
    SELECT id, owner_id, 'owner', created_at FROM cocreation_projects;

ALTER TABLE world_shares ADD COLUMN canon_review TEXT NOT NULL DEFAULT 'none';
ALTER TABLE world_shares ADD COLUMN reviewed_by INTEGER NOT NULL DEFAULT 0;
ALTER TABLE world_shares ADD COLUMN reviewed_at INTEGER NOT NULL DEFAULT 0;

UPDATE world_shares SET canon_review = 'pending' WHERE canon_requested = 1 AND canon_status = 'doujin';
UPDATE world_shares SET canon_review = 'approved' WHERE canon_status = 'canon' AND cocreation_id <> '' AND canon_review = 'none';

CREATE INDEX IF NOT EXISTS idx_shares_cocreation ON world_shares(cocreation_id, canon_review, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_public_feed ON world_shares(visibility, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON setting_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_dedupe ON notifications(user_id, sender_id, type, target_id, created_at DESC);
