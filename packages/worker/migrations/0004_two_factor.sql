-- Migration 0004: Two-factor auth + email verification codes
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0004_two_factor.sql --remote

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vc_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_vc_expires ON verification_codes(expires_at);

-- 2FA + SMTP config
INSERT OR IGNORE INTO system_config (key, value) VALUES ('two_factor_enabled', 'false');
INSERT OR IGNORE INTO system_config (key, value) VALUES ('smtp_sender', 'noreply@bookkeeper.local');
