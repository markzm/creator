-- 002_v65_ai_articles_visibility.sql: Creator v6.5 AI, Articles, Visibility & Preferences

-- Alter table world_shares
ALTER TABLE world_shares ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE world_shares ADD COLUMN entity_id TEXT NOT NULL DEFAULT '';
ALTER TABLE world_shares ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE world_shares ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE world_shares ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- Alter table users
ALTER TABLE users ADD COLUMN ai_config_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN custom_prefs_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_shares_vis_kind ON world_shares(visibility, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_user_vis ON world_shares(user_id, visibility, created_at DESC);
