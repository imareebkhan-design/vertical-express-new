import "server-only";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth/session";

/**
 * Resolves the signed-in Firebase user to this application's own `User` row.
 *
 * Firebase owns identity — phone numbers, OTP delivery, Google sign-in,
 * sessions. The database owns everything that hangs off a customer: addresses,
 * carts, orders, wallet. Those join on `users.id`, a UUID, and Firebase's id is
 * a `uid` string, so the two are bridged by `users.firebase_uid` rather than by
 * retyping a primary key that a half-dozen foreign keys already point at.
 *
 * This function's signature has now survived Supabase → Clerk → Firebase
 * without changing. That is the point of it: 36 call sites never learned which
 * provider is in use.
 */
export async function getAuthUserId(): Promise<string | null> {
  const token = await readSession();
  if (!token) return null;

  const existing = await db.user.findUnique({
    where: { firebaseUid: token.uid },
    select: { id: true },
  });
  if (existing) return existing.id;

  return provisionUser(token);
}

/**
 * Creates — or safely claims — the local row for a Firebase user we have not
 * seen before.
 *
 * ON LINKING, WHICH IS WHERE THE ACCOUNT-TAKEOVER RISK LIVES
 *
 * An earlier version of this function claimed any row whose phone *or* email
 * matched, whichever the new identity happened to carry. That is a takeover
 * vector: someone signing in with a phone number could inherit the orders,
 * addresses and wallet of an account that had only ever been reached by email,
 * and vice versa. It was harmless only because `users` was empty.
 *
 * Two rules close it:
 *
 *   1. Only link on an identifier Firebase itself has VERIFIED. An unverified
 *      email on a token proves nothing — anyone can type an address into a
 *      sign-up form.
 *   2. Only link like for like. A verified phone may claim a row matched by
 *      phone. A verified email may claim a row matched by email. Never across.
 *
 * The cost is that someone who used Google yesterday and phone today may end up
 * with two accounts. That is annoying and recoverable. Merging them
 * automatically is neither.
 */
async function provisionUser(token: DecodedIdToken): Promise<string | null> {
  const uid = token.uid;

  /* `phone_number` is only present when Firebase verified it — the phone
     provider cannot complete without the OTP. `email_verified` has to be
     checked explicitly, because email/password sign-up sets an email long
     before anyone proves they can read it. */
  const verifiedPhone = typeof token.phone_number === "string" ? token.phone_number : null;
  const verifiedEmail = token.email_verified === true && typeof token.email === "string"
    ? token.email
    : null;
  const unverifiedEmail = typeof token.email === "string" ? token.email : null;

  const claimable = verifiedPhone
    ? await db.user.findUnique({
        where: { phone: verifiedPhone },
        select: { id: true, firebaseUid: true },
      })
    : verifiedEmail
      ? await db.user.findUnique({
          where: { email: verifiedEmail },
          select: { id: true, firebaseUid: true },
        })
      : null;

  if (claimable) {
    if (!claimable.firebaseUid) {
      await db.user.update({ where: { id: claimable.id }, data: { firebaseUid: uid } });
      return claimable.id;
    }
    /* The row already belongs to a different Firebase identity. Two identities
       claiming one phone number is a conflict, not a merge — return the new
       identity's own row instead of handing over someone else's. */
    if (claimable.firebaseUid !== uid) {
      return createFreshUser(uid, verifiedPhone, unverifiedEmail);
    }
    return claimable.id;
  }

  return createFreshUser(uid, verifiedPhone, unverifiedEmail);
}

/**
 * Writes a new row. The unique constraints on phone and email are the real
 * guard here — under a race two concurrent first requests would otherwise both
 * insert, so a conflict falls back to reading whoever won.
 */
async function createFreshUser(
  uid: string,
  phone: string | null,
  email: string | null
): Promise<string | null> {
  try {
    const created = await db.user.create({
      data: { id: randomUUID(), firebaseUid: uid, phone, email },
      select: { id: true },
    });
    return created.id;
  } catch {
    const raced = await db.user.findUnique({
      where: { firebaseUid: uid },
      select: { id: true },
    });
    return raced?.id ?? null;
  }
}

/** True when a request carries a valid session. */
export async function isSignedIn(): Promise<boolean> {
  return (await readSession()) !== null;
}
