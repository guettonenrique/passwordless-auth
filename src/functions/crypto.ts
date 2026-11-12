import { randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CODE_LENGTH, type SecretInput } from '../shared';

/**
 * Node-only crypto helpers. These live in the `functions` entry (not `shared`)
 * because they import `node:crypto`, which must never be bundled into the
 * React Native entry.
 */

/** Resolves a `SecretInput` (plain string, getter, or Firebase `defineSecret`) at call time. */
export function resolveSecret(secret: SecretInput): string {
  const value =
    typeof secret === 'string'
      ? secret
      : typeof secret === 'function'
        ? secret()
        : secret?.value?.();

  if (!value || typeof value !== 'string') {
    throw new Error('OTP secret must resolve to a non-empty string.');
  }
  return value;
}

/** Generates a cryptographically secure numeric code of `length` digits. */
export function generateOtpCode(length: number = CODE_LENGTH): string {
  return randomInt(10 ** (length - 1), 10 ** length).toString();
}

/**
 * Hex digest of `email:code` — the value stored in Firestore.
 * Uses `HMAC-SHA256` keyed with `secret` when provided; falls back to `SHA-256` when omitted.
 */
export function hashOtpCode(email: string, code: string, secret?: SecretInput): string {
  const payload = `${email}:${code}`;
  if (secret !== undefined) {
    return createHmac('sha256', resolveSecret(secret)).update(payload).digest('hex');
  }
  return createHash('sha256').update(payload).digest('hex');
}

/** Timing-safe comparison of two hex digests. */
export function isOtpHashMatch(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'utf-8');
  const actual = Buffer.from(actualHex, 'utf-8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
