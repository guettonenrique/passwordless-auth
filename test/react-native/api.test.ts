import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted keeps the shared mocks above the (hoisted) vi.mock factories.
// httpsCallable(fn, name) returns a callable: payload => { data }.
const mocks = vi.hoisted(() => {
  const returnedCallable = vi.fn();
  const httpsCallable = vi.fn(() => returnedCallable);
  const getFunctions = vi.fn(() => ({ __functions: true }));
  const getAuth = vi.fn(() => ({ __auth: true }));
  const signInWithCustomToken = vi.fn(async () => ({}));
  return {
    returnedCallable,
    httpsCallable,
    getFunctions,
    getAuth,
    signInWithCustomToken,
  };
});

vi.mock('@react-native-firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  httpsCallable: mocks.httpsCallable,
}));

vi.mock('@react-native-firebase/auth', () => ({
  getAuth: mocks.getAuth,
  signInWithCustomToken: mocks.signInWithCustomToken,
}));

import { requestEmailOtp, verifyEmailOtp, signInWithEmailOtp } from '../../src/react-native/api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestEmailOtp', () => {
  it('normalizes the email, calls the right function, returns the payload', async () => {
    mocks.returnedCallable.mockResolvedValueOnce({
      data: { status: 'success', message: 'Verification code sent.' },
    });
    const res = await requestEmailOtp('  Foo@Bar.COM ');

    expect(mocks.getFunctions).toHaveBeenCalled();
    expect(mocks.httpsCallable).toHaveBeenCalledWith({ __functions: true }, 'requestEmailOtp');
    expect(mocks.returnedCallable).toHaveBeenCalledWith({ email: 'foo@bar.com' });
    expect(res).toEqual({ status: 'success', message: 'Verification code sent.' });
  });
});

describe('verifyEmailOtp', () => {
  it('returns the custom token, normalizing email and trimming the code', async () => {
    mocks.returnedCallable.mockResolvedValueOnce({
      data: { status: 'success', customToken: 'tok-123' },
    });
    const token = await verifyEmailOtp(' A@B.COM ', ' 123456 ');

    expect(mocks.httpsCallable).toHaveBeenCalledWith({ __functions: true }, 'verifyEmailOtp');
    expect(mocks.returnedCallable).toHaveBeenCalledWith({ email: 'a@b.com', code: '123456' });
    expect(token).toBe('tok-123');
  });
});

describe('signInWithEmailOtp', () => {
  it('verifies then signs in with the minted token', async () => {
    mocks.returnedCallable.mockResolvedValueOnce({
      data: { status: 'success', customToken: 'tok-456' },
    });
    await signInWithEmailOtp('a@b.com', '123456');

    expect(mocks.returnedCallable).toHaveBeenCalledWith({ email: 'a@b.com', code: '123456' });
    expect(mocks.signInWithCustomToken).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithCustomToken).toHaveBeenCalledWith({ __auth: true }, 'tok-456');
  });

  it('does not sign in when verification fails (error propagates to the UI)', async () => {
    mocks.returnedCallable.mockRejectedValueOnce(
      new Error(
        '[functions/verifyEmailOtp] 16 INVALID_ARGUMENT: Invalid verification code. You have 4 attempts remaining.'
      )
    );

    await expect(signInWithEmailOtp('a@b.com', '000000')).rejects.toThrow(
      /Invalid verification code. You have 4 attempts remaining\./
    );
    expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
  });
});
