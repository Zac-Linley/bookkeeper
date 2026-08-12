// Password hashing: PBKDF2 (per-user salt, 100k iterations) with
// backward-compatible verification for the legacy SHA-256 + fixed salt scheme.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_PREFIX = 'pbkdf2$';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time comparison to avoid leaking hash equality via timing.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function deriveKey(password: string, saltHex: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export function isPbkdf2Hash(hash: string): boolean {
  return hash.startsWith(PBKDF2_PREFIX);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);
  const derived = await deriveKey(password, saltHex, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${saltHex}$${derived}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isPbkdf2Hash(stored)) {
    const [, iterStr, saltHex, expectedHex] = stored.split('$');
    const iterations = parseInt(iterStr, 10);
    if (!iterations || !saltHex || !expectedHex) return false;
    const derived = await deriveKey(password, saltHex, iterations);
    return timingSafeEqualHex(derived, expectedHex);
  }

  // Legacy scheme: SHA-256(password + fixed salt), stored as plain hex.
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + 'bookkeeper-salt'));
  const legacy = toHex(new Uint8Array(hashBuffer));
  return timingSafeEqualHex(legacy, stored);
}
