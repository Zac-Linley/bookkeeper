-- Migration 0007: Add needs_invoice flag to transactions
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0007_needs_invoice.sql --remote

ALTER TABLE transactions ADD COLUMN needs_invoice INTEGER NOT NULL DEFAULT 0;
