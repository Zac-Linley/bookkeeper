-- Migration 0008: Add transaction audit log and idempotency support

-- Audit log for transaction edits
CREATE TABLE IF NOT EXISTS transaction_logs (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- Add idempotency key to prevent duplicate submissions
ALTER TABLE transactions ADD COLUMN idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
