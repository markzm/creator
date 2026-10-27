-- 0005_v68_site_settings.sql: Global site configuration and reference materials storage
CREATE TABLE IF NOT EXISTS site_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
