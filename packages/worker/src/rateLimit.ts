// Simple D1-backed rate limiting for auth endpoints.
// Keyed by (email, ip, action); locks the key after MAX_ATTEMPTS within the window.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

type DB = {
  prepare: (sql: string) => {
    bind: (...args: (string | number | null)[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
};

function parseDbDate(value: string): number {
  // D1 default datetime('now') is 'YYYY-MM-DD HH:MM:SS' (UTC); JS writes ISO strings.
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  return new Date(normalized).getTime();
}

export async function isRateLimited(db: DB, email: string, ip: string, action = 'login'): Promise<boolean> {
  const row = await db.prepare(
    'SELECT locked_until FROM login_attempts WHERE email = ? AND ip = ? AND action = ? AND locked_until > ?'
  ).bind(email.toLowerCase(), ip, action, new Date().toISOString()).first<{ locked_until: string }>();
  return !!row;
}

export async function recordFailure(db: DB, email: string, ip: string, action = 'login'): Promise<void> {
  const now = new Date();
  const row = await db.prepare(
    'SELECT attempts, updated_at FROM login_attempts WHERE email = ? AND ip = ? AND action = ?'
  ).bind(email.toLowerCase(), ip, action).first<{ attempts: number; updated_at: string }>();

  let attempts = 1;
  let lockedUntil: string | null = null;
  if (row) {
    const withinWindow = now.getTime() - parseDbDate(row.updated_at) < WINDOW_MS;
    attempts = withinWindow ? (row.attempts || 0) + 1 : 1;
    if (attempts >= MAX_ATTEMPTS) {
      lockedUntil = new Date(now.getTime() + LOCK_MS).toISOString();
      attempts = 0;
    }
  }

  await db.prepare(
    `INSERT INTO login_attempts (email, ip, action, attempts, locked_until, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email, ip, action) DO UPDATE SET
       attempts = excluded.attempts,
       locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`
  ).bind(email.toLowerCase(), ip, action, attempts, lockedUntil, now.toISOString()).run();
}

export async function clearFailures(db: DB, email: string, ip: string, action = 'login'): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE email = ? AND ip = ? AND action = ?')
    .bind(email.toLowerCase(), ip, action).run();
}

export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') || 'unknown';
}
