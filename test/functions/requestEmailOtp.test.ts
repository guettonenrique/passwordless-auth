import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError, type CallableFunction, type CallableRequest } from 'firebase-functions/https';
import { createMockFirestore, installFirestoreMock, type MockFirestore } from './test-mocks';
import { hashOtpCode } from '../../src/functions/crypto';

vi.mock('firebase-admin/firestore', () => {
  const g = globalThis as unknown as { __mockFirestore: MockFirestore };
  return {
    getFirestore: () => g.__mockFirestore.db,
    FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  };
});

const sendgridMocks = vi.hoisted(() => ({
  setApiKey: vi.fn(),
  send: vi.fn(async () => {}),
}));
vi.mock('@sendgrid/mail', () => ({ default: sendgridMocks }));

import { createRequestEmailOtp } from '../../src/functions/requestEmailOtp';
import {
  OTP_ERROR_CODES,
  type OtpEmail,
  type RequestOtpOptions,
  type RequestOtpPayload,
  type RequestOtpResponse,
} from '../../src/shared';

const NOW = Date.now();

type Handler = CallableFunction<RequestOtpPayload, Promise<RequestOtpResponse>>;

const invoke = (fn: Handler, data: unknown) =>
  fn.run({ data } as unknown as CallableRequest<RequestOtpPayload>);

/** Runs the handler, resolving to the thrown HttpsError instead of rejecting. */
const call = async (fn: Handler, data: unknown): Promise<RequestOtpResponse | HttpsError> =>
  invoke(fn, data).catch((e: unknown) => e as HttpsError);

const TEST_SECRET = 'test-otp-secret';

describe('createRequestEmailOtp', () => {
  let mock: MockFirestore;
  const sentEmails: OtpEmail[] = [];
  const sendEmail = vi.fn(async (email: OtpEmail) => {
    sentEmails.push(email);
  });

  beforeEach(() => {
    mock = createMockFirestore();
    installFirestoreMock(mock);
    sentEmails.length = 0;
    sendEmail.mockClear();
  });

  const factory = (extra: Partial<RequestOtpOptions> = {}) =>
    createRequestEmailOtp({ appName: 'TestApp', secret: TEST_SECRET, sendEmail, ...extra });

  it('writes a valid OTP doc and delivers the composed email', async () => {
    const res = await invoke(factory(), { email: ' User@Example.com ' });

    expect(res).toEqual({ status: 'success', message: 'Verification code sent.' });

    // doc keyed by normalized email
    const doc = mock.store.get('auth_otps/user@example.com');
    expect(doc).toBeDefined();
    expect(doc!.attempts).toBe(0);
    const lastSentAt = doc!.lastSentAt as number;
    expect(lastSentAt).toBeGreaterThan(NOW - 5000);
    expect(doc!.expiresAt).toBe(lastSentAt + 600_000);
    expect(doc!.createdAt).toBe('__server_timestamp__');

    // email delivered with a 6-digit code, and the stored hash matches it
    expect(sentEmails).toHaveLength(1);
    const codeMatch = /code is (\d{6})$/.exec(sentEmails[0]!.subject);
    expect(codeMatch).not.toBeNull();
    const code = codeMatch![1]!;
    expect(code).toHaveLength(6);
    expect(doc!.hash).toBe(hashOtpCode('user@example.com', code, TEST_SECRET));
    expect(sentEmails[0]!.to).toBe('user@example.com');
    expect(sentEmails[0]!.html).toContain(code);
  });

  it('rejects missing or malformed emails without side effects', async () => {
    const missing = await call(factory(), {});
    expect(missing).toBeInstanceOf(HttpsError);
    expect((missing as HttpsError).code).toBe(OTP_ERROR_CODES.InvalidArgument);

    const malformed = await call(factory(), { email: 'not-an-email' });
    expect((malformed as HttpsError).code).toBe(OTP_ERROR_CODES.InvalidArgument);

    expect(mock.store.size).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('enforces the 60s resend cooldown with an accurate countdown', async () => {
    // simulate a doc sent 30s ago
    mock.store.set('auth_otps/a@b.com', {
      hash: 'x',
      attempts: 0,
      expiresAt: Date.now() + 600_000,
      lastSentAt: Date.now() - 30_000,
    });

    const err = await call(factory(), { email: 'a@b.com' });
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.ResourceExhausted);
    expect((err as HttpsError).message).toBe(
      'Please wait 30 seconds before requesting a new code.'
    );
  });

  it('allows a resend once the cooldown has elapsed', async () => {
    mock.store.set('auth_otps/a@b.com', {
      hash: 'x',
      attempts: 9,
      expiresAt: Date.now() - 1,
      lastSentAt: Date.now() - 61_000,
    });

    await invoke(factory(), { email: 'a@b.com' });
    const doc = mock.store.get('auth_otps/a@b.com');
    expect(doc!.attempts).toBe(0); // fresh doc
    expect(sentEmails).toHaveLength(1);
  });

  it('deletes the doc and throws internal when delivery fails', async () => {
    const failing = createRequestEmailOtp({
      appName: 'TestApp',
      secret: TEST_SECRET,
      sendEmail: async () => {
        throw new Error('sendgrid down');
      },
    });

    const err = await call(failing, { email: 'a@b.com' });
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe(OTP_ERROR_CODES.Internal);
    expect(mock.store.has('auth_otps/a@b.com')).toBe(false);
  });

  it('falls back to plain SHA-256 when secret is omitted', async () => {
    const noSecretFactory = createRequestEmailOtp({ appName: 'TestApp', sendEmail });
    await invoke(noSecretFactory, { email: 'a@b.com' });

    const doc = mock.store.get('auth_otps/a@b.com');
    const codeMatch = /code is (\d{6})$/.exec(sentEmails[0]!.subject);
    const code = codeMatch![1]!;
    expect(doc!.hash).toBe(hashOtpCode('a@b.com', code));
    expect(doc!.hash).not.toBe(hashOtpCode('a@b.com', code, TEST_SECRET));
  });

  it('fails fast at factory time when neither sendgrid nor sendEmail is given', () => {
    expect(() =>
      createRequestEmailOtp({ appName: 'TestApp' } as RequestOtpOptions)
    ).toThrow(/provide either `sendgrid` options or a custom `sendEmail`/);
  });

  it('resolves the sendgrid key from string, getter, and params Secret forms', async () => {
    const { createSendgridSender } = await import('../../src/functions/senders/sendgrid');
    const email = { to: 'a@b.com', subject: 's', text: 't', html: 'h' };

    await createSendgridSender({ apiKey: 'plain-key', fromEmail: 'f@x.com', fromName: 'F' })(email);
    expect(sendgridMocks.setApiKey).toHaveBeenLastCalledWith('plain-key');

    await createSendgridSender({ apiKey: () => 'fn-key', fromEmail: 'f@x.com', fromName: 'F' })(email);
    expect(sendgridMocks.setApiKey).toHaveBeenLastCalledWith('fn-key');

    await createSendgridSender({
      apiKey: { value: () => 'secret-key' },
      fromEmail: 'f@x.com',
      fromName: 'F',
    })(email);
    expect(sendgridMocks.setApiKey).toHaveBeenLastCalledWith('secret-key');

    expect(sendgridMocks.send).toHaveBeenCalledTimes(3);
  });

  it('honors custom collection/cooldown/expiry options', async () => {
    await invoke(
      factory({ collection: 'custom_otps', cooldownMs: 120_000, expiryMs: 300_000 }),
      { email: 'a@b.com' }
    );

    const doc = mock.store.get('custom_otps/a@b.com');
    expect(doc).toBeDefined();
    const customLastSentAt = doc!.lastSentAt as number;
    expect(doc!.expiresAt).toBe(customLastSentAt + 300_000);
    expect(sentEmails[0]!.html).toContain('5 minutes');
  });

  it('auto-binds Firebase SecretParam objects from secret and sendgrid.apiKey onto onCall options', () => {
    const fn = createRequestEmailOtp({
      appName: 'TestApp',
      secret: { name: 'CUSTOM_OTP_HMAC', value: () => TEST_SECRET },
      sendgrid: {
        apiKey: { name: 'SENDGRID_API_KEY', value: () => 'sg-key' },
        fromEmail: 'f@x.com',
        fromName: 'F',
      },
    }) as unknown as { __endpoint?: { secretEnvironmentVariables?: { key: string }[] } };

    expect(fn.__endpoint?.secretEnvironmentVariables).toEqual([
      { key: 'CUSTOM_OTP_HMAC' },
      { key: 'SENDGRID_API_KEY' },
    ]);
  });
});
