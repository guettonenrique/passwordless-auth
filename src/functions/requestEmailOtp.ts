import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  CODE_LENGTH,
  DEFAULT_COLLECTION,
  OTP_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
  cooldownMessage,
  buildOtpEmail,
  isValidEmail,
  normalizeEmail,
  OTP_ERROR_CODES,
  type RequestOtpOptions,
  type RequestOtpPayload,
  type RequestOtpResponse,
} from '../shared';
import {
  collectSecretParams,
  generateOtpCode,
  hashOtpCode,
} from './crypto';
import { createSendgridSender } from './senders/sendgrid';

/**
 * Factory for the `requestEmailOtp` callable.
 *
 * Returns a ready-to-register Firebase callable function:
 *
 * ```ts
 * exports.requestEmailOtp = createRequestEmailOtp({
 *   appName: 'MyApp',
 *   secret: defineSecret('OTP_SECRET'),
 *   sendgrid: { apiKey: defineSecret('SENDGRID_API_KEY'), fromEmail, fromName },
 * });
 * ```
 */
export function createRequestEmailOtp(options: RequestOtpOptions) {
  const collection = options.collection ?? DEFAULT_COLLECTION;
  const cooldownMs = options.cooldownMs ?? RESEND_COOLDOWN_MS;
  const expiryMs = options.expiryMs ?? OTP_EXPIRY_MS;

  const sendEmail =
    options.sendEmail ??
    (() => {
      if (!options.sendgrid) {
        throw new Error(
          'createRequestEmailOtp: provide either `sendgrid` options or a custom `sendEmail`.'
        );
      }
      return createSendgridSender(options.sendgrid);
    })();

  const secrets = collectSecretParams(options.secret, options.sendgrid?.apiKey);

  return onCall<RequestOtpPayload, Promise<RequestOtpResponse>>(
    {
      enforceAppCheck: options.enforceAppCheck ?? false,
      ...(secrets.length > 0 ? { secrets: secrets.map((s) => s.name) } : {}),
    },
    async (request) => {
      const rawEmail = request.data?.email;

      if (!rawEmail || typeof rawEmail !== 'string') {
        throw new HttpsError(OTP_ERROR_CODES.InvalidArgument, 'Email is required.');
      }

      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) {
        throw new HttpsError(
          OTP_ERROR_CODES.InvalidArgument,
          'Please enter a valid email address.'
        );
      }

      const db = getFirestore();
      const otpDocRef = db.collection(collection).doc(email);
      const existingSnap = await otpDocRef.get();

      const now = Date.now();

      // Enforce the resend cooldown
      if (existingSnap.exists) {
        const data = existingSnap.data();
        const lastSentAt = data?.lastSentAt || 0;
        const elapsed = now - lastSentAt;
        if (elapsed < cooldownMs) {
          throw new HttpsError(
            OTP_ERROR_CODES.ResourceExhausted,
            cooldownMessage(cooldownMs - elapsed)
          );
        }
      }

      const code = generateOtpCode(CODE_LENGTH);
      const codeHash = hashOtpCode(email, code, options.secret);

      await otpDocRef.set({
        hash: codeHash,
        attempts: 0,
        expiresAt: now + expiryMs,
        lastSentAt: now,
        createdAt: FieldValue.serverTimestamp(),
      });

      const composed = buildOtpEmail({
        to: email,
        appName: options.appName,
        code,
        expiresMinutes: Math.round(expiryMs / 60000),
      });

      try {
        await sendEmail(composed);
      } catch (err) {
        console.error('Failed to send OTP email:', err);
        // Clean up the created OTP document if delivery fails
        await otpDocRef.delete().catch(() => null);
        throw new HttpsError(
          OTP_ERROR_CODES.Internal,
          'Failed to deliver verification code email. Please try again.'
        );
      }

      return {
        status: 'success' as const,
        message: 'Verification code sent.',
      };
    }
  );
}
