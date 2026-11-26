/**
 * How a deleted customer's row is marked, without a schema change.
 *
 * A deleted account keeps its `users` row — orders, payments and refunds point
 * at it and are kept as tax records — but loses its phone, email and Clerk id.
 * Its `firebase_uid` is rewritten to one of two markers:
 *
 *   `deletion-pending:<uid>`  the database part is done; the Firebase sign-in
 *                             has not been deleted yet (retry outstanding)
 *   `deleted:<uid>`           both parts are done
 *
 * WHY NOT A BLANK `firebase_uid`
 *
 * A blank link already means something else: a pre-Firebase row that sign-in
 * may claim when a verified phone or email matches (`mayClaimRow` in
 * link-policy.ts). Reusing it would make a deleted customer indistinguishable
 * from an unclaimed legacy one, and — worse — would leave nothing to stop the
 * old Firebase session from provisioning a fresh row on its next request.
 *
 * WHY A PREFIX IS SAFE
 *
 * Firebase's generated uids are alphanumeric; this application never mints
 * custom uids. A colon therefore never occurs in a live link. Checked against
 * staging (13 users) and the 19 Nov production backup (5 users) on 22 Nov
 * 2026: every `firebase_uid` was a 28-character alphanumeric uid and no row
 * lacked one.
 *
 * The original uid is kept inside the marker so that (a) a still-valid token
 * for that uid can be recognised and refused rather than re-provisioned, and
 * (b) a failed Firebase deletion can be retried. A Firebase uid is a random
 * identifier, not contact data; once the Firebase user is deleted it refers to
 * nothing.
 */

export const DELETION_PENDING_PREFIX = "deletion-pending:";
export const DELETED_PREFIX = "deleted:";

export type AccountLinkState = "live" | "deletion_pending" | "deleted";

export function pendingMarker(uid: string): string {
  return `${DELETION_PENDING_PREFIX}${uid}`;
}

export function deletedMarker(uid: string): string {
  return `${DELETED_PREFIX}${uid}`;
}

/** The state an account's `firebase_uid` column describes. A blank link is a live (unclaimed) account. */
export function linkState(firebaseUid: string | null): AccountLinkState {
  if (firebaseUid?.startsWith(DELETION_PENDING_PREFIX)) return "deletion_pending";
  if (firebaseUid?.startsWith(DELETED_PREFIX)) return "deleted";
  return "live";
}

/** True for an account that has been deleted, whether or not its Firebase sign-in is gone yet. */
export function isDeletedAccount(firebaseUid: string | null): boolean {
  return linkState(firebaseUid) !== "live";
}

/** The original Firebase uid inside a marker, or null for a live link. */
export function uidFromMarker(firebaseUid: string | null): string | null {
  if (!firebaseUid) return null;
  if (firebaseUid.startsWith(DELETION_PENDING_PREFIX)) return firebaseUid.slice(DELETION_PENDING_PREFIX.length);
  if (firebaseUid.startsWith(DELETED_PREFIX)) return firebaseUid.slice(DELETED_PREFIX.length);
  return null;
}

/** What ops screens show where a deleted customer's name, phone or email would be. */
export const DELETED_CUSTOMER_LABEL = "Deleted customer";

/**
 * Set only by the website's delete action once deletion has fully finished,
 * so /delete-account can say so after the session is gone. httpOnly and
 * short-lived; another site or a crafted link cannot set it.
 */
export const DELETION_DONE_COOKIE = "__ve_account_deleted";
