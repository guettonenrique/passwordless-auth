import { randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { CODE_LENGTH } from '../shared';

/**
 * Node-only crypto helpers. These live in the `functions` entry (not `shared`)
 * because they import `node:crypto`, which must never be bundled into the
 * React Native entry.
 */

/** Generates a cryptographically secure numeric code of `length` digits. */
export function generateOtpCode(length: number = CODE_LENGTH): string {
  return randomInt(10 ** (length - 1), 10 ** length).toString();
}

/** SHA-256 hex digest of `email:code` — the value stored in Firestore. */
export function hashOtpCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

/** Timing-safe comparison of two hex digests. */
export function isOtpHashMatch(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'utf-8');
  const actual = Buffer.from(actualHex, 'utf-8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
