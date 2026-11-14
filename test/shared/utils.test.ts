import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  isValidEmail,
  isOtpCode,
  cooldownMessage,
  attemptsMessage,
} from '../../src/shared/utils';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('applies NFC normalization so composed/decomposed forms match', () => {
    // "ä" as a single precomposed codepoint (NFC) vs "a" + combining diaeresis (NFD)
    const nfc = `user@ex\u00e4mple.com`;
    const nfd = `user@exa\u0308mple.com`;
    expect(normalizeEmail(nfd)).toBe(normalizeEmail(nfc));
    expect(normalizeEmail(nfd)).toBe(`user@ex\u00e4mple.com`);
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses, case-insensitively', () => {
    expect(isValidEmail('user@domain.com')).toBe(true);
    expect(isValidEmail('USER@DOMAIN.COM')).toBe(true);
    expect(isValidEmail(' first.last+tag@sub.domain.org ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('plainaddress')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user @domain.com')).toBe(false);
    expect(isValidEmail('user@domain')).toBe(false);
  });

  it('accepts an address at exactly the 254-char limit and rejects longer ones', () => {
    const domain = 'example.com'; // 11 chars
    const atSign = '@'; // 1 char
    const localAtLimit = 'a'.repeat(254 - domain.length - atSign.length);
    expect(isValidEmail(`${localAtLimit}@${domain}`)).toBe(true);

    const localOverLimit = 'a'.repeat(254 - domain.length - atSign.length + 1);
    expect(isValidEmail(`${localOverLimit}@${domain}`)).toBe(false);
  });
});

describe('isOtpCode', () => {
  it('accepts exactly 6 digits by default', () => {
    expect(isOtpCode('123456')).toBe(true);
    expect(isOtpCode('000000')).toBe(true);
  });

  it('rejects wrong lengths, letters, and whitespace', () => {
    expect(isOtpCode('12345')).toBe(false);
    expect(isOtpCode('1234567')).toBe(false);
    expect(isOtpCode('12a456')).toBe(false);
    expect(isOtpCode(' 123456')).toBe(false);
  });

  it('honors a custom length', () => {
    expect(isOtpCode('1234', 4)).toBe(true);
    expect(isOtpCode('12345', 4)).toBe(false);
  });
});

describe('cooldownMessage', () => {
  it('is plural for >1 second', () => {
    expect(cooldownMessage(5000)).toBe('Please wait 5 seconds before requesting a new code.');
  });

  it('is singular for exactly 1 second', () => {
    expect(cooldownMessage(1000)).toBe('Please wait 1 second before requesting a new code.');
  });

  it('rounds up partial seconds', () => {
    expect(cooldownMessage(1)).toBe('Please wait 1 second before requesting a new code.');
  });
});

describe('attemptsMessage', () => {
  it('is plural', () => {
    expect(attemptsMessage(3)).toBe('Invalid verification code. You have 3 attempts remaining.');
  });

  it('is singular for 1', () => {
    expect(attemptsMessage(1)).toBe('Invalid verification code. You have 1 attempt remaining.');
  });
});
