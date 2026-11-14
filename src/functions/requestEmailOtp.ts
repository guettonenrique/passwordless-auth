import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  CODE_LENGTH,
  DEFAULT_COLLECTION,
  OTP_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
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
      enforceAppCheck: options.enforceAppCheck ?? true,
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

      let code = '';
      let codeHash = '';
      let throttled = false;

      await db.runTransaction(async (transaction) => {
        const existingSnap = await transaction.get(otpDocRef);
        const now = Date.now();

        // Enforce the resend cooldown atomically. When active we skip the send
        // and return the same success shape as a real dispatch, so callers can't
        // use the response to tell whether a code was recently requested for this
        // email (no liveness/recency oracle). Clients drive their own countdown.
        if (existingSnap.exists) {
          const data = existingSnap.data();
          const lastSentAt = data?.lastSentAt || 0;
          const elapsed = now - lastSentAt;
          if (elapsed < cooldownMs) {
            throttled = true;
            return;
          }
        }

        code = generateOtpCode(CODE_LENGTH);
        codeHash = hashOtpCode(email, code, options.secret);

        transaction.set(otpDocRef, {
          hash: codeHash,
          attempts: 0,
          expiresAt: now + expiryMs,
          lastSentAt: now,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      if (throttled) {
        return {
          status: 'success' as const,
          message: 'Verification code sent.',
        };
      }

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
        // Clean up the created OTP document only if it has not been replaced by a newer request
        await db
          .runTransaction(async (transaction) => {
            const snap = await transaction.get(otpDocRef);
            if (snap.exists && snap.data()?.hash === codeHash) {
              transaction.delete(otpDocRef);
            }
          })
          .catch(() => null);
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
