-- 0006_security_hardening.sql: authentication throttling and one-time challenges

CREATE TABLE IF NOT EXISTS auth_attempts (
    attempt_key     TEXT PRIMARY KEY,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    locked_until    INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_updated ON auth_attempts(updated_at);

CREATE TABLE IF NOT EXISTS auth_challenges (
    nonce           TEXT PRIMARY KEY,
    expires_at      INTEGER NOT NULL,
    used_at         INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry ON auth_challenges(expires_at);
