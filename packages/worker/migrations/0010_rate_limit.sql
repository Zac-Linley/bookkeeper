-- Migration 0010: Login/2FA/register rate limiting
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0010_rate_limit.sql --remote

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'login',   -- 'login' | '2fa' | 'register'
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (email, ip, action)
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until);
