import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleFunction, ScheduledEvent } from 'firebase-functions/scheduler';
import { createMockFirestore, installFirestoreMock, type MockFirestore } from './test-mocks';

vi.mock('firebase-admin/firestore', () => {
  const g = globalThis as unknown as { __mockFirestore: MockFirestore };
  return {
    getFirestore: () => g.__mockFirestore.db,
  };
});

import { createCleanupExpiredOtps } from '../../src/functions/cleanupExpiredOtps';
import type { CleanupOtpOptions } from '../../src/shared';

const EVENT: ScheduledEvent = { scheduleTime: new Date().toISOString() };

describe('createCleanupExpiredOtps', () => {
  let mock: MockFirestore;

  beforeEach(() => {
    mock = createMockFirestore();
    installFirestoreMock(mock);
  });

  const run = (options: Record<string, unknown> = {}) =>
    (createCleanupExpiredOtps(options as CleanupOtpOptions) as ScheduleFunction).run(EVENT);

  it('deletes only expired docs', async () => {
    const now = Date.now();
    mock.store.set('auth_otps/expired@x.com', { hash: 'a', expiresAt: now - 1, attempts: 0, lastSentAt: now - 600_000 });
    mock.store.set('auth_otps/live@x.com', { hash: 'b', expiresAt: now + 600_000, attempts: 0, lastSentAt: now });

    await run();

    expect(mock.store.has('auth_otps/expired@x.com')).toBe(false);
    expect(mock.store.has('auth_otps/live@x.com')).toBe(true);
  });

  it('is a no-op on an empty collection', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run();

    expect(mock.store.size).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('drains more than one batch (batchSize respected)', async () => {
    const now = Date.now();
    // 5 expired docs, batch of 2 → 3 queries to drain
    for (let i = 0; i < 5; i++) {
      mock.store.set(`auth_otps/u${i}@x.com`, { hash: 'h', expiresAt: now - 1, attempts: 0, lastSentAt: now });
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run({ batchSize: 2 });

    // assert before mockRestore() — restore also clears the call history
    expect([...mock.store.keys()].filter((k) => k.startsWith('auth_otps/')).length).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('[passwordless-auth] deleted 5 expired OTP doc(s)');
    logSpy.mockRestore();
  });

  it('honors a custom collection', async () => {
    const now = Date.now();
    mock.store.set('other_otps/e@x.com', { hash: 'h', expiresAt: now - 1, attempts: 0, lastSentAt: now });
    mock.store.set('auth_otps/keep@x.com', { hash: 'h', expiresAt: now - 1, attempts: 0, lastSentAt: now });

    await run({ collection: 'other_otps' });

    expect(mock.store.has('other_otps/e@x.com')).toBe(false);
    expect(mock.store.has('auth_otps/keep@x.com')).toBe(true);
  });
});
