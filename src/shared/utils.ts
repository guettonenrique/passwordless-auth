import { CODE_LENGTH } from './constants';

/** Deliberately simple RFC-ish check — mirrors the client-side pre-check. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * RFC 5321 total-length limit for a mailbox address. We cap on the normalized
 * value so over-long input fails fast as `invalid-argument` instead of blowing
 * up inside the Firestore write (doc IDs are limited to 1500 bytes).
 */
const MAX_EMAIL_LENGTH = 254;

/**
 * Canonicalizes an email so doc keys and hash inputs always match:
 * NFC-normalize (collapse composed/decomposed Unicode), trim, lowercase.
 * NFC matters because mobile keyboards and OS autofill frequently emit NFD
 * forms of accented characters — without it, two visually identical addresses
 * would map to different OTP doc keys.
 */
export function normalizeEmail(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const normalized = normalizeEmail(raw);
  return normalized.length <= MAX_EMAIL_LENGTH && EMAIL_REGEX.test(normalized);
}

export function isOtpCode(value: string, length: number = CODE_LENGTH): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value);
}

/**
 * Formats the resend-cooldown error message exactly as the backend emits it.
 * Exported so mobile copy (if ever shown manually) cannot drift from it.
 */
export function cooldownMessage(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before requesting a new code.`;
}

/** Formats the remaining-attempts message for a wrong-code rejection. */
export function attemptsMessage(remaining: number): string {
  return `Invalid verification code. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`;
}
