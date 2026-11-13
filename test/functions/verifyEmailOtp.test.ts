import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError, type CallableFunction, type CallableRequest } from 'firebase-functions/https';
import { createMockFirestore, installFirestoreMock, type MockFirestore } from './test-mocks';
import { generateOtpCode, hashOtpCode } from '../../src/functions/crypto';

vi.mock('firebase-admin/firestore', () => {
  const g = globalThis as unknown as { __mockFirestore: MockFirestore };
  return {
    getFirestore: () => g.__mockFirestore.db,
  };
});

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    createCustomToken: vi.fn(async (uid: string) => `custom-token-for:${uid}`),
  }),
}));

import { createVerifyEmailOtp } from '../../src/functions/verifyEmailOtp';
import {
  OTP_ERROR_CODES,
  type VerifyOtpPayload,
  type VerifyOtpResponse,
} from '../../src/shared';

type Handler = CallableFunction<VerifyOtpPayload, Promise<VerifyOtpResponse>>;

const invoke = (fn: Handler, data: unknown) =>
  fn.run({ data } as unknown as CallableRequest<VerifyOtpPayload>);

const call = async (fn: Handler, data: unknown): Promise<VerifyOtpResponse | HttpsError> =>
  invoke(fn, data).catch((e: unknown) => e as HttpsError);

const TEST_SECRET = 'test-otp-secret';

function seedOtpDoc(
  mock: MockFirestore,
  email: string,
  code: string,
  overrides: Record<string, unknown> = {},
  secret: string = TEST_SECRET
) {
  const now = Date.now();
  mock.store.set(`auth_otps/${email}`, {
    hash: hashOtpCode(email, code, secret),
    attempts: 0,
    expiresAt: now + 600_000,
    lastSentAt: now,
    ...overrides,
  });
}

describe('createVerifyEmailOtp', () => {
  let mock: MockFirestore;
  const provision = vi.fn(async (email: string) => `uid-of:${email}`);

  beforeEach(() => {
    mock = createMockFirestore();
    installFirestoreMock(mock);
    provision.mockClear();
  });

  const handler: Handler = createVerifyEmailOtp({ secret: TEST_SECRET, provision });

  it('verifies a correct code: deletes doc, provisions user, mints token', async () => {
    const code = '424242';
    seedOtpDoc(mock, 'a@b.com', code);

    const res = await invoke(handler, { email: ' A@B.com ', code: ` ${code} ` });

    expect(res).toEqual({ status: 'success', customToken: 'custom-token-for:uid-of:a@b.com' });
    expect(mock.store.has('auth_otps/a@b.com')).toBe(false);
    expect(provision).toHaveBeenCalledTimes(1);
    expect(provision).toHaveBeenCalledWith('a@b.com');
  });

  it('rejects a wrong code and increments attempts with remaining-count copy', async () => {
    seedOtpDoc(mock, 'a@b.com', '111111');

    const err = await call(handler, { email: 'a@b.com', code: '222222' });
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.InvalidArgument);
    expect((err as HttpsError).message).toBe(
      'Invalid verification code. You have 4 attempts remaining.'
    );
    expect(mock.store.get('auth_otps/a@b.com')!.attempts).toBe(1);
    expect(provision).not.toHaveBeenCalled();
  });

  it('invalidates the code on the 5th wrong attempt', async () => {
    seedOtpDoc(mock, 'a@b.com', '111111', { attempts: 4 });

    const err = await call(handler, { email: 'a@b.com', code: '222222' });
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.ResourceExhausted);
    expect(mock.store.has('auth_otps/a@b.com')).toBe(false);
    expect(provision).not.toHaveBeenCalled();
  });

  it('rejects an exhausted code without incrementing further', async () => {
    seedOtpDoc(mock, 'a@b.com', '111111', { attempts: 5 });

    const err = await call(handler, { email: 'a@b.com', code: '111111' });
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.ResourceExhausted);
    expect(mock.store.has('auth_otps/a@b.com')).toBe(false);
  });

  it('rejects an expired code, deletes the doc, and returns the same error as a missing doc', async () => {
    seedOtpDoc(mock, 'a@b.com', '111111', { expiresAt: Date.now() - 1 });

    const err = await call(handler, { email: 'a@b.com', code: '111111' });
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.NotFound);
    expect((err as HttpsError).message).toBe(
      'Invalid or expired verification code. Please request a new code.'
    );
    expect(mock.store.has('auth_otps/a@b.com')).toBe(false);
    expect(provision).not.toHaveBeenCalled();
  });

  it('rejects when no OTP doc exists with the unified missing/expired error', async () => {
    const err = await call(handler, { email: 'nobody@b.com', code: '111111' });
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.NotFound);
    expect((err as HttpsError).message).toBe(
      'Invalid or expired verification code. Please request a new code.'
    );
    expect(provision).not.toHaveBeenCalled();
  });

  it('validates input shape before touching Firestore', async () => {
    const noEmail = await call(handler, { code: '123456' });
    expect((noEmail as HttpsError).code).toBe(OTP_ERROR_CODES.InvalidArgument);

    const badCode = await call(handler, { email: 'a@b.com', code: '12a45' });
    expect((badCode as HttpsError).code).toBe(OTP_ERROR_CODES.InvalidArgument);
    expect((badCode as HttpsError).message).toBe('Verification code must be exactly 6 digits.');

    const shortCode = await call(handler, { email: 'a@b.com', code: '12345' });
    expect((shortCode as HttpsError).code).toBe(OTP_ERROR_CODES.InvalidArgument);

    expect(mock.store.size).toBe(0);
  });

  it('generates codes whose hashes the verifier accepts (crypto round-trip)', async () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
    seedOtpDoc(mock, 'a@b.com', code);

    const res = await invoke(handler, { email: 'a@b.com', code });
    expect(res.status).toBe('success');
  });

  it('falls back to plain SHA-256 verification when secret is omitted', async () => {
    const code = '654321';
    const now = Date.now();
    mock.store.set('auth_otps/a@b.com', {
      hash: hashOtpCode('a@b.com', code),
      attempts: 0,
      expiresAt: now + 600_000,
      lastSentAt: now,
    });

    const fallbackHandler = createVerifyEmailOtp({ provision });
    const res = await invoke(fallbackHandler, { email: 'a@b.com', code });
    expect(res.status).toBe('success');
  });

  it('wraps unexpected provisioning errors in an internal HttpsError while passing intentional HttpsErrors through', async () => {
    seedOtpDoc(mock, 'a@b.com', '111111');
    provision.mockRejectedValueOnce(new Error('db timeout'));

    const internalErr = await call(handler, { email: 'a@b.com', code: '111111' });
    expect(internalErr).toBeInstanceOf(HttpsError);
    expect((internalErr as HttpsError).code).toBe(OTP_ERROR_CODES.Internal);
    expect((internalErr as HttpsError).message).toBe(
      'Failed to complete sign-in. Please request a new verification code.'
    );

    seedOtpDoc(mock, 'a@b.com', '222222');
    provision.mockRejectedValueOnce(new HttpsError('permission-denied', 'Account suspended.'));

    const customErr = await call(handler, { email: 'a@b.com', code: '222222' });
    expect(customErr).toBeInstanceOf(HttpsError);
    expect((customErr as HttpsError).code).toBe('permission-denied');
    expect((customErr as HttpsError).message).toBe('Account suspended.');
  });

  it('auto-binds Firebase SecretParam objects from secret onto onCall options', () => {
    const fn = createVerifyEmailOtp({
      secret: { name: 'CUSTOM_OTP_HMAC', value: () => TEST_SECRET },
      provision,
    }) as unknown as { __endpoint?: { secretEnvironmentVariables?: { key: string }[] } };

    expect(fn.__endpoint?.secretEnvironmentVariables).toEqual([
      { key: 'CUSTOM_OTP_HMAC' },
    ]);
  });
});
