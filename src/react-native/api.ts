import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getAuth, signInWithCustomToken } from '@react-native-firebase/auth';
import type {
  RequestOtpPayload,
  RequestOtpResponse,
  VerifyOtpPayload,
  VerifyOtpResponse,
} from '../shared';

/**
 * Dispatches a 6-digit OTP code to the provided email.
 */
export async function requestEmailOtp(email: string): Promise<RequestOtpResponse> {
  const functions = getFunctions();
  const callable = httpsCallable<RequestOtpPayload, RequestOtpResponse>(
    functions,
    'requestEmailOtp'
  );
  const result = await callable({ email: email.trim().toLowerCase() });
  return result.data;
}

/**
 * Verifies the code and returns the Firebase custom auth token.
 */
export async function verifyEmailOtp(email: string, code: string): Promise<string> {
  const functions = getFunctions();
  const callable = httpsCallable<VerifyOtpPayload, VerifyOtpResponse>(
    functions,
    'verifyEmailOtp'
  );
  const result = await callable({
    email: email.trim().toLowerCase(),
    code: code.trim(),
  });
  return result.data.customToken;
}

/**
 * Verifies the code and signs in with the minted custom token.
 * After this resolves, the standard Firebase Auth session is active
 * (token persistence, refresh, onAuthStateChanged).
 */
export async function signInWithEmailOtp(email: string, code: string): Promise<void> {
  const customToken = await verifyEmailOtp(email, code);
  await signInWithCustomToken(getAuth(), customToken);
}
