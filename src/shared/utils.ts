import { CODE_LENGTH } from './constants';

/** Deliberately simple RFC-ish check — mirrors the client-side pre-check. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase an email so doc keys and hash inputs always match. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_REGEX.test(normalizeEmail(raw));
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
