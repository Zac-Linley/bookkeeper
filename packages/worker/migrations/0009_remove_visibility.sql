-- Migration 0009: Remove unused visibility column from transactions
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0009_remove_visibility.sql --remote

ALTER TABLE transactions DROP COLUMN visibility;
