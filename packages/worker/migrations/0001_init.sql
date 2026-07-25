-- Migration 0001: Initial schema
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',      -- 'admin' | 'user'
  default_currency TEXT NOT NULL DEFAULT 'AED',
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                     -- 'expense' | 'income'
  icon TEXT NOT NULL DEFAULT '📌',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,                        -- NULL for system categories
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,                     -- 'expense' | 'income'
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  category_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  location_name TEXT,
  lat REAL,
  lng REAL,
  is_reimbursable INTEGER NOT NULL DEFAULT 0,
  reimbursed_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'personal',  -- 'personal' | 'shared'
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  original_name TEXT,
  content_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  date TEXT NOT NULL,
  base TEXT NOT NULL,
  target TEXT NOT NULL,
  rate REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, base, target)
);

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_members (
  id TEXT PRIMARY KEY,
  account_owner_id TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',    -- 'member' | 'viewer'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_owner_id) REFERENCES users(id),
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  UNIQUE(account_owner_id, member_user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at ON transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- Default system config
INSERT OR IGNORE INTO system_config (key, value) VALUES ('registration_open', 'true');

-- System expense categories
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e1', '车辆', 'expense', 'car', 1, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e2', '餐费', 'expense', 'utensils', 2, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e3', '通讯网络', 'expense', 'wifi', 3, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e4', '快递', 'expense', 'truck', 4, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e5', '物料', 'expense', 'package', 5, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e6', '劳保', 'expense', 'shield', 6, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e7', '维修', 'expense', 'tool', 7, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e8', '办公', 'expense', 'printer', 8, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e9', '水电', 'expense', 'bulb', 9, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e10', '差旅', 'expense', 'plane', 10, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e11', '其他', 'expense', 'dots', 99, 1);

-- System income categories
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-i1', '工资', 'income', 'cash', 1, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-i2', '红包', 'income', 'gift', 2, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-i3', '其他', 'income', 'dots', 99, 1);
