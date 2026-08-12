import { describe, it, expect } from 'vitest';
import { hashPassword, isPbkdf2Hash, verifyPassword } from '../password';

async function legacySha256Hash(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + 'bookkeeper-salt'));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('password hashing', () => {
  it('hashes with PBKDF2 format and verifies correctly', async () => {
    const hash = await hashPassword('secret123');
    expect(isPbkdf2Hash(hash)).toBe(true);
    expect(hash.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects wrong passwords', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong-pass', hash)).toBe(false);
  });

  it('uses a unique salt per hash', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    expect(h1).not.toBe(h2);
  });

  it('verifies legacy SHA-256 hashes (backward compatibility)', async () => {
    const legacy = await legacySha256Hash('old-password');
    expect(isPbkdf2Hash(legacy)).toBe(false);
    expect(await verifyPassword('old-password', legacy)).toBe(true);
    expect(await verifyPassword('wrong-password', legacy)).toBe(false);
  });
});
