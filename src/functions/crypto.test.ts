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
  it('is deterministic and 64 hex chars', () => {
    const h1 = hashOtpCode('a@b.com', '123456');
    const h2 = hashOtpCode('a@b.com', '123456');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with either email or code (salting effect)', () => {
    const base = hashOtpCode('a@b.com', '123456');
    expect(hashOtpCode('a@b.com', '123457')).not.toBe(base);
    expect(hashOtpCode('x@b.com', '123456')).not.toBe(base);
  });
});

describe('isOtpHashMatch', () => {
  it('matches identical digests, rejects different ones', () => {
    const h = hashOtpCode('a@b.com', '123456');
    expect(isOtpHashMatch(h, h)).toBe(true);
    expect(isOtpHashMatch(h, hashOtpCode('a@b.com', '000000'))).toBe(false);
  });

  it('rejects length mismatches without throwing', () => {
    expect(isOtpHashMatch('ab', 'abcd')).toBe(false);
    expect(isOtpHashMatch('', '')).toBe(true);
  });
});
