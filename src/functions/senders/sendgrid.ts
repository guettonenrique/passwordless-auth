import type { OtpEmailSender, SendgridSenderOptions } from '../../shared';

/**
 * Default email delivery via SendGrid.
 *
 * `@sendgrid/mail` is imported lazily (dynamic import, not a static import)
 * because it is an *optional* peer dependency — projects that pass a custom
 * `sendEmail` must not need SendGrid installed at all.
 */
const resolveApiKey = (key: SendgridSenderOptions['apiKey']): string => {
  if (typeof key === 'string') return key;
  if (typeof key === 'function') return key();
  return key.value();
};

export function createSendgridSender(options: SendgridSenderOptions): OtpEmailSender {
  return async (email) => {
    const sgMail = (await import('@sendgrid/mail')).default;
    sgMail.setApiKey(resolveApiKey(options.apiKey));

    await sgMail.send({
      to: email.to,
      from: { email: options.fromEmail, name: options.fromName },
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  };
}
