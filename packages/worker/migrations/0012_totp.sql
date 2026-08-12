-- Migration 0012: TOTP two-factor authentication
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0012_totp.sql --remote

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
