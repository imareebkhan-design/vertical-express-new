/**
 * Which identifier, if any, a newly-authenticated identity may use to claim an
 * existing customer row.
 *
 * This is the account-takeover surface, so it is a pure function with no
 * database and no Firebase SDK — it can be tested directly, exhaustively, and
 * without a sign-in. `provisionUser()` in current-user.ts consults it and does
 * nothing clever of its own.
 *
 * TWO RULES, AND THE REASON FOR EACH
 *
 * 1. Only an identifier Firebase has VERIFIED may claim a row. An unverified
 *    email proves nothing — email/password sign-up sets `email` long before
 *    anyone demonstrates they can read that inbox, so linking on it would let
 *    an attacker claim a stranger's orders by typing their address.
 *
 * 2. Only like for like. A verified phone may claim a row matched by phone; a
 *    verified email a row matched by email. Never across. Otherwise someone
 *    who signs in by phone inherits an account that was only ever reached by
 *    email, which is the same takeover wearing a different hat.
 *
 * The cost is that a customer who used Google yesterday and phone today may end
 * up with two rows. That is annoying and support can merge it deliberately.
 * Merging automatically is not recoverable.
 */

/** The claims this policy reads off a Firebase ID token. */
export interface IdentityClaims {
  uid: string;
  /** Present only when Firebase verified it — the phone provider needs the OTP. */
  phoneNumber?: string | null;
  email?: string | null;
  emailVerified?: boolean;
}

export type LinkClaim =
  | { kind: "phone"; value: string }
  | { kind: "email"; value: string }
  | { kind: "none" };

/**
 * The single identifier this identity is allowed to claim a row by.
 *
 * Phone outranks email: it is the stronger proof — possession of a handset that
 * received an OTP, versus a mailbox that may itself be compromised — and it is
 * how this market signs in.
 */
export function claimableIdentifier(claims: IdentityClaims): LinkClaim {
  const phone = normalisePhone(claims.phoneNumber);
  if (phone) return { kind: "phone", value: phone };

  if (claims.emailVerified === true && claims.email && claims.email.trim()) {
    return { kind: "email", value: claims.email.trim().toLowerCase() };
  }

  return { kind: "none" };
}

/**
 * Whether this identity may take over the row it matched.
 *
 * A row with no uid is unclaimed and may be adopted. A row already bound to a
 * different uid is a conflict — two identities asserting one identifier — and
 * the answer is a separate row, never a handover.
 */
export function mayClaimRow(
  claim: LinkClaim,
  row: { firebaseUid: string | null } | null,
  uid: string
): boolean {
  if (claim.kind === "none") return false;
  if (!row) return false;
  if (row.firebaseUid === null) return true;
  return row.firebaseUid === uid;
}

/** Trims and rejects anything that is not a plausible E.164 number. */
function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\+[1-9]\d{6,14}$/.test(trimmed) ? trimmed : null;
}
