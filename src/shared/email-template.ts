import type { OtpEmail, OtpEmailInput } from './types';

/**
 * Builds a fully composed OTP email { to, subject, text, html }.
 *
 * Inline HTML (no SendGrid dynamic template) on purpose: zero template
 * management per project, and the look is good enough for a code-delivery
 * email. Projects with a branded template should pass their own `sendEmail`
 * instead of customizing this builder.
 */
export function buildOtpEmail(input: OtpEmailInput): OtpEmail {
  const { to, appName, code, expiresMinutes } = input;

  const subject = `${appName} - Your verification code is ${code}`;

  const text =
    `Your verification code for ${appName} is: ${code}\n\n` +
    `This code is valid for ${expiresMinutes} minutes.\n` +
    `If you did not request this, please ignore this email.`;

  const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${escapeHtml(subject)}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                  <tr>
                    <td style="padding: 32px 32px 16px 32px; text-align: center;">
                      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #1e293b;">${escapeHtml(appName)}</h1>
                      <p style="margin: 0; font-size: 15px; color: #64748b;">Sign in to your account</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 16px 32px 24px 32px; text-align: center;">
                      <p style="margin: 0; margin-bottom: 16px; font-size: 14px; color: #475569;">Enter this 6-digit code in the app to continue:</p>
                      <div style="display: inline-block; background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 16px 32px; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace;">
                        ${escapeHtml(code)}
                      </div>
                      <p style="margin: 16px 0 0 0; font-size: 13px; color: #94a3b8;">
                        This code will expire in <strong>${expiresMinutes} minutes</strong>.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        If you did not request this verification code, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

  return { to, subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
