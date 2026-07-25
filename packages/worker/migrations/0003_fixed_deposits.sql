-- Migration 0003: Fixed deposits (定期存款)
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0003_fixed_deposits.sql --remote

CREATE TABLE IF NOT EXISTS fixed_deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  interest_rate REAL NOT NULL,               -- 年利率 (%)
  interest_frequency TEXT NOT NULL DEFAULT 'maturity',  -- maturity / monthly / quarterly
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  term_months INTEGER,
  expected_interest REAL,
  last_interest_date TEXT,
  next_interest_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',     -- active / matured / withdrawn
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS deposit_interests (
  id TEXT PRIMARY KEY,
  deposit_id TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (deposit_id) REFERENCES fixed_deposits(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fd_user ON fixed_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_fd_status ON fixed_deposits(status);
CREATE INDEX IF NOT EXISTS idx_fd_maturity ON fixed_deposits(maturity_date);
CREATE INDEX IF NOT EXISTS idx_di_deposit ON deposit_interests(deposit_id);

-- New system categories for deposits
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-e12', '投资', 'expense', 'pig-money', 12, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-i4', '投资本金', 'income', 'cash', 4, 1);
INSERT OR IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES ('cat-sys-i5', '投资收益', 'income', 'coin', 5, 1);
