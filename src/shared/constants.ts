/**
 * Single source of truth for the OTP contract.
 *
 * Backend factories and mobile components both read these as their defaults,
 * so the UI cooldown and the backend rate limit cannot drift apart silently.
 * A project may override them via factory options — if it does, override the
 * SAME value on both sides (e.g. a custom cooldownMs in the backend factory
 * AND as the `cooldownMs` prop on the mobile modal).
 */

/** Number of digits in an OTP code. */
export const CODE_LENGTH = 6;

/** Minimum time between two code requests for the same email. */
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

/** Lifetime of an issued code. */
export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/** Failed verifications allowed per code before it is invalidated. */
export const MAX_ATTEMPTS = 5;

/** Firestore collection that stores pending OTPs (doc id = email). */
export const DEFAULT_COLLECTION = 'auth_otps';

/** Default schedule for the cleanup function that reaps expired docs. */
export const DEFAULT_CLEANUP_SCHEDULE = 'every 15 minutes';

/** Writes per batch in the cleanup drain loop (Firestore limit is 500). */
export const CLEANUP_BATCH_SIZE = 400;
