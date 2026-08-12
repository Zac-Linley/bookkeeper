-- Migration 0011: Idempotency uniqueness + performance indexes
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0011_indexes.sql --remote

-- Prevent duplicate transactions under concurrent requests with the same idempotency key
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Performance indexes for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_tx_user_occurred ON transactions(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tx ON attachments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_members_owner ON account_members(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_members_member ON account_members(member_user_id);
