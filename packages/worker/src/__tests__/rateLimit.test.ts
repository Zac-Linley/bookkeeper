import { describe, it, expect } from 'vitest';
import { isRateLimited, recordFailure, clearFailures } from '../rateLimit';

type AttemptRow = {
  email: string;
  ip: string;
  action: string;
  attempts: number;
  locked_until: string | null;
  updated_at: string;
};

function createFakeDb() {
  const store = new Map<string, AttemptRow>();
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: (string | number | null)[]) {
          return {
            async first<T>(): Promise<T | null> {
              const [email, ip, action] = args as [string, string, string];
              const row = store.get(`${email}|${ip}|${action}`);
              if (sql.includes('AND locked_until > ?')) {
                const nowIso = args[3] as string;
                if (row?.locked_until && row.locked_until > nowIso) return { locked_until: row.locked_until } as T;
                return null;
              }
              if (sql.includes('SELECT attempts, updated_at')) {
                if (!row) return null;
                return { attempts: row.attempts, updated_at: row.updated_at } as T;
              }
              return null;
            },
            async run() {
              const [email, ip, action, attempts, lockedUntil, updatedAt] = args as [string, string, string, number, string | null, string];
              const key = `${email}|${ip}|${action}`;
              if (sql.includes('INSERT INTO login_attempts')) {
                store.set(key, { email, ip, action, attempts, locked_until: lockedUntil, updated_at: updatedAt });
              } else if (sql.includes('DELETE FROM login_attempts')) {
                store.delete(key);
              }
            },
          };
        },
      };
    },
  };
  return { db, store };
}

describe('rate limiting', () => {
  it('locks after 5 failures within the window', async () => {
    const { db } = createFakeDb();
    for (let i = 0; i < 5; i++) {
      await recordFailure(db, 'user@example.com', '1.2.3.4', 'login');
    }
    expect(await isRateLimited(db, 'user@example.com', '1.2.3.4', 'login')).toBe(true);
  });

  it('allows access before the threshold', async () => {
    const { db } = createFakeDb();
    await recordFailure(db, 'user@example.com', '1.2.3.4', 'login');
    await recordFailure(db, 'user@example.com', '1.2.3.4', 'login');
    expect(await isRateLimited(db, 'user@example.com', '1.2.3.4', 'login')).toBe(false);
  });

  it('keeps separate counters per action and per IP', async () => {
    const { db } = createFakeDb();
    for (let i = 0; i < 5; i++) {
      await recordFailure(db, 'user@example.com', '1.2.3.4', '2fa');
    }
    expect(await isRateLimited(db, 'user@example.com', '1.2.3.4', '2fa')).toBe(true);
    expect(await isRateLimited(db, 'user@example.com', '1.2.3.4', 'login')).toBe(false);
    expect(await isRateLimited(db, 'user@example.com', '5.6.7.8', '2fa')).toBe(false);
  });

  it('resets the counter after the window elapses', async () => {
    const { db, store } = createFakeDb();
    await recordFailure(db, 'user@example.com', '1.2.3.4', 'login');
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    store.set('user@example.com|1.2.3.4|login', {
      email: 'user@example.com', ip: '1.2.3.4', action: 'login',
      attempts: 4, locked_until: null, updated_at: stale,
    });
    await recordFailure(db, 'user@example.com', '1.2.3.4', 'login');
    expect(await isRateLimited(db, 'user@example.com', '1.2.3.4', 'login')).toBe(false);
  });

  it('clears failures on success', async () => {
    const { db } = createFakeDb();
    for (let i = 0; i < 5; i++) {
      await recordFailure(db, 'user@example.com', '1.2.3.4', 'login');
    }
    await clearFailures(db, 'user@example.com', '1.2.3.4', 'login');
    expect(await isRateLimited(db, 'user@example.com', '1.2.3.4', 'login')).toBe(false);
  });
});
