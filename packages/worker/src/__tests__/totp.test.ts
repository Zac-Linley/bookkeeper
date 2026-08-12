import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, generateSecret, verifyTotp } from '../totp';

// RFC 6238 test vector: ASCII secret "12345678901234567890"
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP', () => {
  it('encodes and decodes base32', () => {
    const bytes = new TextEncoder().encode('12345678901234567890');
    expect(base32Encode(bytes)).toBe(RFC_SECRET);
    expect(new TextDecoder().decode(base32Decode(RFC_SECRET))).toBe('12345678901234567890');
  });

  it('generates a 32-char base32 secret', () => {
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('matches RFC 6238 vectors (6-digit SHA-1)', async () => {
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [t, code] of vectors) {
      expect(await verifyTotp(RFC_SECRET, code, 0, t * 1000)).toBe(true);
    }
  });

  it('rejects wrong codes and non-6-digit input', async () => {
    expect(await verifyTotp(RFC_SECRET, '000000', 0, 59 * 1000)).toBe(false);
    expect(await verifyTotp(RFC_SECRET, '12345', 0, 59 * 1000)).toBe(false);
  });

  it('accepts a code one step away within the window', async () => {
    // At T=89 (counter 2), the counter-1 code (T=59) should still pass with window=1
    expect(await verifyTotp(RFC_SECRET, '287082', 1, 89 * 1000)).toBe(true);
  });
});
