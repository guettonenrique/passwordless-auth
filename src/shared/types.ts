// ============================================================================
// Payloads (App -> Backend)
// ============================================================================

export interface RequestOtpPayload {
  email: string;
}

export interface VerifyOtpPayload {
  email: string;
  code: string;
}

// ============================================================================
// Responses (Backend -> App)
// ============================================================================

export interface RequestOtpResponse {
  status: 'success';
  message: string;
}

export interface VerifyOtpResponse {
  status: 'success';
  /** Firebase custom auth token — exchange with signInWithCustomToken. */
  customToken: string;
}

// ============================================================================
// Backend option types
// ============================================================================

/** A fully composed OTP email, ready to dispatch. */
export interface OtpEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Delivers the OTP email. The default implementation sends via SendGrid;
 * projects can replace it entirely (custom provider, or a console-logging
 * sender during development).
 */
export type OtpEmailSender = (email: OtpEmail) => Promise<void>;

/** Inputs for {@link buildOtpEmail}. */
export interface OtpEmailInput {
  to: string;
  appName: string;
  /** The plaintext 6-digit code — only ever passed to the sender, never persisted. */
  code: string;
  /** Code lifetime in minutes, for the email copy. */
  expiresMinutes: number;
}

export interface SendgridSenderOptions {
  /**
   * The API key, resolved per call. Accepts a plain string, a getter
   * function (`defineSecret('X').value`), or a Firebase params Secret
   * object (`defineSecret('X')`) directly.
   */
  apiKey: string | (() => string) | { value: () => string };
  fromEmail: string;
  fromName: string;
}

/** Base options shared by the request/verify factories. */
export interface BaseOtpOptions {
  /** Firestore collection holding pending OTPs. Default: `auth_otps`. */
  collection?: string;
  /** Resend cooldown in ms. Default: 60_000. */
  cooldownMs?: number;
  /** Code lifetime in ms. Default: 600_000 (10 minutes). */
  expiryMs?: number;
  /** Failed verifications before the code is invalidated. Default: 5. */
  maxAttempts?: number;
  /** Enforce App Check on the callable. Default: false (flip true in production). */
  enforceAppCheck?: boolean;
}

export interface RequestOtpOptions extends BaseOtpOptions {
  /** Brand name used in the email subject and body. Required. */
  appName: string;
  /** Replace the default SendGrid delivery entirely. */
  sendEmail?: OtpEmailSender;
  /** SendGrid sender config; required unless `sendEmail` is provided. */
  sendgrid?: SendgridSenderOptions;
}

/**
 * Resolves (and, if needed, creates) the auth user for an email, returning
 * the uid the custom token will be minted for. This is the one required
 * project-specific hook — it owns the app's user schema.
 */
export type OtpProvisioner = (email: string) => Promise<string>;

export interface VerifyOtpOptions extends BaseOtpOptions {
  /** Required. Creates or resolves the user and returns their uid. */
  provision: OtpProvisioner;
}

export interface CleanupOtpOptions {
  /** Cloud Scheduler cron. Default: `every 15 minutes`. */
  schedule?: string;
  /** Collection to clean. Default: `auth_otps`. */
  collection?: string;
  /** Writes per batch. Default: 400 (Firestore limit is 500). */
  batchSize?: number;
}

// ============================================================================
// Stored document shape (Firestore `auth_otps/{email}`)
// ============================================================================

export interface OtpDocumentData {
  /** SHA-256 hex of `email:code`. The plaintext code is never stored. */
  hash: string;
  /** Failed guess counter. */
  attempts: number;
  /** Expiry as epoch milliseconds. */
  expiresAt: number;
  /** Last dispatch as epoch milliseconds (drives the resend cooldown). */
  lastSentAt: number;
  createdAt?: unknown;
}

// ============================================================================
// Error codes (HttpsError status codes used by the factories)
// ============================================================================

export const OTP_ERROR_CODES = {
  InvalidArgument: 'invalid-argument',
  NotFound: 'not-found',
  DeadlineExceeded: 'deadline-exceeded',
  ResourceExhausted: 'resource-exhausted',
  Internal: 'internal',
} as const;

export type OtpErrorCode = (typeof OTP_ERROR_CODES)[keyof typeof OTP_ERROR_CODES];
