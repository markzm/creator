-- Requires exactly one existing, active super administrator. Never elect an account here.
CREATE TABLE _super_admin_preflight (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _super_admin_preflight
SELECT CASE WHEN COUNT(*) = 1 AND MIN(is_admin) = 1 AND MAX(is_disabled) = 0
  AND MAX(is_muted) = 0 AND MIN(is_super_admin) = 1 THEN 1 ELSE 0 END FROM users WHERE is_super_admin <> 0;
DROP TABLE _super_admin_preflight;

CREATE UNIQUE INDEX idx_single_super_admin ON users(is_super_admin) WHERE is_super_admin = 1;
CREATE TRIGGER protect_super_admin_update BEFORE UPDATE ON users
WHEN OLD.is_super_admin = 1 AND
 (NEW.id <> OLD.id OR NEW.is_super_admin <> 1 OR NEW.is_admin <> 1 OR NEW.is_disabled <> 0 OR NEW.is_muted <> 0)
BEGIN SELECT RAISE(ABORT, 'The existing super administrator is locked'); END;
CREATE TRIGGER protect_super_admin_delete BEFORE DELETE ON users WHEN OLD.is_super_admin = 1
BEGIN SELECT RAISE(ABORT, 'The existing super administrator cannot be deleted'); END;
CREATE TRIGGER protect_super_admin_assignment BEFORE UPDATE OF is_super_admin ON users
WHEN OLD.is_super_admin = 0 AND NEW.is_super_admin <> 0
BEGIN SELECT RAISE(ABORT, 'Super administrator cannot be assigned'); END;
-- REPLACE may delete a conflicting row without firing DELETE triggers. Block it before insertion.
CREATE TRIGGER protect_super_admin_insert BEFORE INSERT ON users
WHEN NEW.is_super_admin <> 0 OR EXISTS (
 SELECT 1 FROM users WHERE is_super_admin = 1 AND (id = NEW.id OR email = NEW.email COLLATE NOCASE)
)
BEGIN SELECT RAISE(ABORT, 'The existing super administrator cannot be replaced or assigned'); END;


ALTER TABLE world_shares ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_docs ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';

CREATE TABLE admin_content_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id INTEGER NOT NULL REFERENCES users(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),
 target_kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 action TEXT NOT NULL,
 base_rev INTEGER NOT NULL,
 before_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_admin_audit_owner ON admin_content_audit(owner_id, created_at DESC, id DESC);

-- One durable quota/lease row per principal; reservations use conditional UPSERT RETURNING.
CREATE TABLE ai_usage (
 principal TEXT PRIMARY KEY,
 minute INTEGER NOT NULL,
 minute_count INTEGER NOT NULL DEFAULT 0,
 day INTEGER NOT NULL,
 day_count INTEGER NOT NULL DEFAULT 0,
 lease_id TEXT NOT NULL DEFAULT '',
 lease_until INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_usage_updated ON ai_usage(updated_at);
CREATE INDEX idx_users_active_enabled ON users(is_disabled, last_seen_at DESC, id DESC);
CREATE INDEX idx_shares_project_feed ON world_shares(cocreation_id, visibility, created_at DESC, id DESC);
CREATE TRIGGER cleanup_deleted_share AFTER DELETE ON world_shares BEGIN
 DELETE FROM setting_comments WHERE share_id = OLD.id;
 DELETE FROM notifications WHERE target_kind = 'share' AND target_id = OLD.id;
END;
