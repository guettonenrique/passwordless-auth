// Firebase Cloud Functions entry.
// Import from '@guettonenrique/passwordless-auth/functions' in your project's
// functions/src/index.ts and register the returned handlers as exports.

export { createRequestEmailOtp } from './requestEmailOtp';
export { createVerifyEmailOtp } from './verifyEmailOtp';
export { createCleanupExpiredOtps } from './cleanupExpiredOtps';
export { createSendgridSender } from './senders/sendgrid';
export { generateOtpCode, hashOtpCode, isOtpHashMatch } from './crypto';

