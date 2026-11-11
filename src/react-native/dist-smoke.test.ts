import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';

/**
 * Loads the BUILT dist artifacts — what real consumers actually get.
 * Skips when dist/ has not been built (run `npm run build` first; CI builds
 * before testing).
 *
 * The RN-only third-party deps are mocked exactly like in the unit tests: in
 * a real app Metro resolves them; in plain Node they would pull in
 * react-native's Flow-annotated entrypoint.
 */

vi.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: (props: { children: unknown }) => props.children,
}));

vi.mock('lucide-react-native', () => ({
  Mail: () => null,
  X: () => null,
  AlertCircle: () => null,
  ArrowLeft: () => null,
}));

vi.mock('@react-native-firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => async () => ({}),
}));

vi.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({}),
  signInWithCustomToken: async () => ({}),
}));

// cwd-independent: resolved relative to this file (src/react-native/ → ../../dist)
const distRoot = new URL('../../dist/', import.meta.url).pathname;
const hasDist =
  existsSync(`${distRoot}react-native/index.js`) && existsSync(`${distRoot}functions/index.cjs`);

describe.skipIf(!hasDist)('built dist artifacts', () => {
  it('react-native ESM entry loads and exports the public API', async () => {
    const mod = await import(`${distRoot}react-native/index.js`);
    expect(typeof mod.requestEmailOtp).toBe('function');
    expect(typeof mod.verifyEmailOtp).toBe('function');
    expect(typeof mod.signInWithEmailOtp).toBe('function');
    expect(typeof mod.OtpInput).toBe('function');
    expect(typeof mod.EmailOtpModal).toBe('function');
  });

  it('functions CJS entry loads and exports the factories', async () => {
    const mod = await import(`${distRoot}functions/index.cjs`);
    expect(typeof mod.createRequestEmailOtp).toBe('function');
    expect(typeof mod.createVerifyEmailOtp).toBe('function');
    expect(typeof mod.createCleanupExpiredOtps).toBe('function');
    expect(typeof mod.createSendgridSender).toBe('function');
  });

  it('shared ESM entry works standalone', async () => {
    const mod = await import(`${distRoot}shared/index.js`);
    expect(mod.RESEND_COOLDOWN_MS).toBe(60_000);
    expect(mod.isValidEmail('a@b.co')).toBe(true);
    expect(typeof mod.buildOtpEmail).toBe('function');
  });
});
