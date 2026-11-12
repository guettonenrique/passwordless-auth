import { describe, expect, it } from 'vitest';
import { buildOtpEmail } from '../../src/shared/email-template';

const baseInput = {
  to: 'user@example.com',
  appName: 'Acme',
  code: '123456',
  expiresMinutes: 10,
};

describe('buildOtpEmail', () => {
  it('returns a fully composed email addressed to the recipient', () => {
    const email = buildOtpEmail(baseInput);
    expect(email.to).toBe('user@example.com');
    expect(email.subject).toBe('Acme - Your verification code is 123456');
    expect(email.text).toContain('123456');
    expect(email.text).toContain('valid for 10 minutes');
    expect(email.html).toContain('<!DOCTYPE html>');
    expect(email.html).toContain('123456');
  });

  it('embeds the expiry minutes in the HTML copy', () => {
    const email = buildOtpEmail({ ...baseInput, expiresMinutes: 15 });
    expect(email.html).toContain('15 minutes');
  });

  it('escapes HTML-special characters in the app name (injection guard)', () => {
    const email = buildOtpEmail({ ...baseInput, appName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('is deterministic for identical input', () => {
    expect(buildOtpEmail(baseInput)).toEqual(buildOtpEmail(baseInput));
  });
});
