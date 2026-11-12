import { onCall, HttpsError } from 'firebase-functions/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  CODE_LENGTH,
  DEFAULT_COLLECTION,
  MAX_ATTEMPTS,
  OTP_ERROR_CODES,
  attemptsMessage,
  isValidEmail,
  isOtpCode,
  normalizeEmail,
  type VerifyOtpOptions,
  type VerifyOtpPayload,
  type VerifyOtpResponse,
} from '../shared';
import { hashOtpCode, isOtpHashMatch } from './crypto';

/**
 * Factory for the `verifyEmailOtp` callable.
 *
 * Returns a ready-to-register Firebase callable function:
 *
 * ```ts
 * exports.verifyEmailOtp = createVerifyEmailOtp({
 *   secret: defineSecret('OTP_SECRET'),
 *   provision: async (email) => {
 *     const { user } = await resolveOrCreateUser(email, { emailVerified: true });
 *     return user.uid;
 *   },
 * });
 * ```
 */
export function createVerifyEmailOtp(options: VerifyOtpOptions) {
  const collection = options.collection ?? DEFAULT_COLLECTION;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;

  return onCall<VerifyOtpPayload, Promise<VerifyOtpResponse>>(
    {
      enforceAppCheck: options.enforceAppCheck ?? false,
    },
    async (request) => {
      const rawEmail = request.data?.email;
      const rawCode = request.data?.code;

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

      if (!rawCode || typeof rawCode !== 'string') {
        throw new HttpsError(
          OTP_ERROR_CODES.InvalidArgument,
          'Verification code is required.'
        );
      }

      const code = rawCode.trim();
      if (!isOtpCode(code, CODE_LENGTH)) {
        throw new HttpsError(
          OTP_ERROR_CODES.InvalidArgument,
          `Verification code must be exactly ${CODE_LENGTH} digits.`
        );
      }

      const db = getFirestore();
      const otpDocRef = db.collection(collection).doc(email);

      let verificationError: HttpsError | null = null;

      await db.runTransaction(async (transaction) => {
        const otpSnap = await transaction.get(otpDocRef);

        if (!otpSnap.exists) {
          verificationError = new HttpsError(
            OTP_ERROR_CODES.NotFound,
            'No active verification code found for this email. Please request a new code.'
          );
          return;
        }

        const otpData = otpSnap.data();
        const now = Date.now();

        // 1. Expiration check
        if (otpData?.expiresAt && now > otpData.expiresAt) {
          transaction.delete(otpDocRef);
          verificationError = new HttpsError(
            OTP_ERROR_CODES.DeadlineExceeded,
            'This verification code has expired. Please request a new code.'
          );
          return;
        }

        // 2. Max attempts check
        const currentAttempts = otpData?.attempts || 0;
        if (currentAttempts >= maxAttempts) {
          transaction.delete(otpDocRef);
          verificationError = new HttpsError(
            OTP_ERROR_CODES.ResourceExhausted,
            'Too many incorrect attempts. Please request a new verification code.'
          );
          return;
        }

        // 3. Timing-safe hash validation
        const isMatch = isOtpHashMatch(
          otpData?.hash || '',
          hashOtpCode(email, code, options.secret)
        );

        if (!isMatch) {
          const newAttempts = currentAttempts + 1;

          if (newAttempts >= maxAttempts) {
            transaction.delete(otpDocRef);
            verificationError = new HttpsError(
              OTP_ERROR_CODES.ResourceExhausted,
              'Too many incorrect attempts. Please request a new verification code.'
            );
          } else {
            transaction.update(otpDocRef, { attempts: newAttempts });
            verificationError = new HttpsError(
              OTP_ERROR_CODES.InvalidArgument,
              attemptsMessage(maxAttempts - newAttempts)
            );
          }
          return;
        }

        // 4. Valid code → delete inside the transaction (single-use, atomic)
        transaction.delete(otpDocRef);
      });

      if (verificationError) {
        throw verificationError;
      }

      // 5. Project-specific user resolution & provisioning
      const uid = await options.provision(email);

      // 6. Mint a Firebase custom token for the client to sign in with
      const customToken = await getAuth().createCustomToken(uid);

      return {
        status: 'success' as const,
        customToken,
      };
    }
  );
}
