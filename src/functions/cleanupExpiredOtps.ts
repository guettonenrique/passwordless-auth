import { onSchedule } from 'firebase-functions/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import {
  CLEANUP_BATCH_SIZE,
  DEFAULT_CLEANUP_SCHEDULE,
  DEFAULT_COLLECTION,
  type CleanupOtpOptions,
} from '../shared';

/**
 * Factory for the scheduled function that reaps expired OTP docs.
 *
 * `requestEmailOtp` writes `auth_otps/{email}` before sending the email, and
 * the doc is only removed on a successful verify, the final failed attempt,
 * or a verify attempt made after expiry. A user who requests a code and never
 * enters it orphans the doc — dead data, but it accumulates one per email
 * seen. This function deletes every doc whose `expiresAt` has passed, on a
 * timer, so the collection stays bounded with no manual intervention.
 *
 * ```ts
 * exports.cleanupExpiredOtps = createCleanupExpiredOtps();
 * ```
 *
 * The drain loop re-runs the filtered query until it is empty (deleting in
 * batches) rather than cursor-paginating: the docs we delete are exactly the
 * ones the query matches, so the shrinking result set is trivially correct —
 * and the final empty query is the certificate that nothing expired remains.
 */
export function createCleanupExpiredOtps(options: CleanupOtpOptions = {}) {
  const schedule = options.schedule ?? DEFAULT_CLEANUP_SCHEDULE;
  const collection = options.collection ?? DEFAULT_COLLECTION;
  const batchSize = options.batchSize ?? CLEANUP_BATCH_SIZE;

  return onSchedule(schedule, async () => {
    const db = getFirestore();
    const now = Date.now();

    let deleted = 0;

    for (;;) {
      const snap = await db
        .collection(collection)
        .where('expiresAt', '<', now)
        .limit(batchSize)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      deleted += snap.docs.length;
    }

    if (deleted > 0) {
      console.log(`[passwordless-auth] deleted ${deleted} expired OTP doc(s)`);
    }
  });
}
