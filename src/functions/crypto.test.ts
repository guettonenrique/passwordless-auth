import { describe, expect, it } from 'vitest';
import { generateOtpCode, hashOtpCode, isOtpHashMatch } from './crypto';

describe('generateOtpCode', () => {
  it('produces exactly 6 digits in [100000, 999999]', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThan(1000000);
    }
  });

  it('is not constant (sanity: distinct values over time)', () => {
    const values = new Set(Array.from({ length: 100 }, () => generateOtpCode()));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('hashOtpCode', () => {
  const SECRET = 'test-hmac-secret';

  it('uses HMAC-SHA256 when secret is provided (deterministic, 64 hex chars)', () => {
    const h1 = hashOtpCode('a@b.com', '123456', SECRET);
    const h2 = hashOtpCode('a@b.com', '123456', SECRET);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to plain SHA-256 when secret is omitted', () => {
    const h1 = hashOtpCode('a@b.com', '123456');
    const h2 = hashOtpCode('a@b.com', '123456');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(hashOtpCode('a@b.com', '123456', SECRET));
  });

  it('changes with email, code, or secret', () => {
    const base = hashOtpCode('a@b.com', '123456', SECRET);
    expect(hashOtpCode('a@b.com', '123457', SECRET)).not.toBe(base);
    expect(hashOtpCode('x@b.com', '123456', SECRET)).not.toBe(base);
    expect(hashOtpCode('a@b.com', '123456', 'different-secret')).not.toBe(base);

    const fallbackBase = hashOtpCode('a@b.com', '123456');
    expect(hashOtpCode('a@b.com', '123457')).not.toBe(fallbackBase);
    expect(hashOtpCode('x@b.com', '123456')).not.toBe(fallbackBase);
  });

  it('accepts string, getter function, and Firebase Secret object forms', () => {
    const expected = hashOtpCode('a@b.com', '123456', SECRET);
    expect(hashOtpCode('a@b.com', '123456', () => SECRET)).toBe(expected);
    expect(hashOtpCode('a@b.com', '123456', { value: () => SECRET })).toBe(expected);
  });

  it('throws when a provided secret resolves to an empty string', () => {
    expect(() => hashOtpCode('a@b.com', '123456', '')).toThrow(
      /OTP secret must resolve to a non-empty string/
    );
    expect(() => hashOtpCode('a@b.com', '123456', () => '')).toThrow(
      /OTP secret must resolve to a non-empty string/
    );
  });
});

describe('isOtpHashMatch', () => {
  it('matches identical digests, rejects different ones', () => {
    const h = hashOtpCode('a@b.com', '123456', 'test-hmac-secret');
    expect(isOtpHashMatch(h, h)).toBe(true);
    expect(isOtpHashMatch(h, hashOtpCode('a@b.com', '000000', 'test-hmac-secret'))).toBe(false);
  });

  it('rejects length mismatches without throwing', () => {
    expect(isOtpHashMatch('ab', 'abcd')).toBe(false);
    expect(isOtpHashMatch('', '')).toBe(true);
  });
});
