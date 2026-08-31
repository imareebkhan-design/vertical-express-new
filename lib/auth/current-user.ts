import "server-only";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { claimableIdentifier, mayClaimRow } from "@/lib/auth/link-policy";
import { log } from "@/lib/observability";

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
 *
 * Exported only so lib/__tests__/account-linking.test.ts can drive it against a
 * real database with synthetic tokens. link-policy.ts proves the decision; this
 * is the wiring around it — which lookup runs, and whether the update is
 * actually guarded — and that is not provable from the pure function alone.
 */
export async function provisionUser(token: DecodedIdToken): Promise<string | null> {
  const uid = token.uid;
  const email = typeof token.email === "string" ? token.email : null;

  /* The decision is lib/auth/link-policy.ts — a pure function with its own
     tests, because this is the path that would hand one customer another
     customer's orders. Nothing clever happens here. */
  const claim = claimableIdentifier({
    uid,
    phoneNumber: typeof token.phone_number === "string" ? token.phone_number : null,
    email,
    emailVerified: token.email_verified === true,
  });

  const phone = claim.kind === "phone" ? claim.value : null;

  if (claim.kind !== "none") {
    const row =
      claim.kind === "phone"
        ? await db.user.findUnique({
            where: { phone: claim.value },
            select: { id: true, firebaseUid: true },
          })
        : await db.user.findUnique({
            where: { email: claim.value },
            select: { id: true, firebaseUid: true },
          });

    if (mayClaimRow(claim, row, uid) && row) {
      if (row.firebaseUid === null) {
        await db.user.update({ where: { id: row.id }, data: { firebaseUid: uid } });
      }
      return row.id;
    }
  }

  return createFreshUser(uid, phone, email);
}

/**
 * Writes a new row for an identity that could not claim an existing one.
 *
 * TWO DIFFERENT CONFLICTS ARRIVE HERE, AND THEY NEED OPPOSITE ANSWERS
 *
 *   1. A genuine race — two concurrent first requests for the same new uid.
 *      One insert wins; the loser should read back the winner's row.
 *
 *   2. The identifier is spoken for. `provisionUser` has already decided this
 *      identity may NOT have that row (an unverified email, or a phone bound to
 *      a different uid). But `phone` and `email` are unique, so inserting a
 *      second row carrying the same value is impossible.
 *
 * Case 2 used to fall into case 1's handler: the insert violated the
 * constraint, the fallback looked for this uid, found nothing, and returned
 * null. The customer had authenticated with Firebase perfectly well and held a
 * valid session cookie, and the application treated them as signed out — on
 * every subsequent attempt, permanently, with no error to explain it. Safe, in
 * that nobody inherited anybody's orders; also completely unusable.
 *
 * So a claimed identifier now yields an account WITHOUT that identifier. The
 * customer gets in; the phone or email stays with whoever holds it. It is
 * recorded loudly because two accounts for one number is a support problem, and
 * support cannot merge what nobody told them about.
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
    /* Case 1: somebody else inserted this uid first. */
    const raced = await db.user.findUnique({
      where: { firebaseUid: uid },
      select: { id: true },
    });
    if (raced) return raced.id;

    /* Case 2: the identifier belongs to another account. Retry without it
       rather than leaving a fully-authenticated customer with no row. */
    if (phone === null && email === null) return null;

    log("WARN", {
      service: "auth-service",
      event: "identity_conflict_account_created_without_identifier",
      metadata: {
        /* The identifier itself is deliberately absent — it belongs to somebody
           else, and this line goes to a log aggregator. The uid is enough for
           support to find both accounts. */
        uid,
        withheld: phone !== null ? "phone" : "email",
      },
    });

    try {
      const fallback = await db.user.create({
        data: { id: randomUUID(), firebaseUid: uid, phone: null, email: null },
        select: { id: true },
      });
      return fallback.id;
    } catch {
      return (
        await db.user.findUnique({ where: { firebaseUid: uid }, select: { id: true } })
      )?.id ?? null;
    }
  }
}

/**
 * The signed-in customer's row, for the few call sites that need more than the
 * id — chiefly the ones that send an email.
 *
 * The email comes from Postgres, not from the Firebase token, because Postgres
 * is the source of truth for customer data and because a phone-only customer
 * has no email on their token at all. A customer who later adds an address in
 * their account should have order mail follow it without Firebase knowing.
 */
export async function getAuthUser(): Promise<{
  id: string;
  email: string | null;
  phone: string | null;
} | null> {
  const id = await getAuthUserId();
  if (!id) return null;
  return db.user.findUnique({
    where: { id },
    select: { id: true, email: true, phone: true },
  });
}

/** True when a request carries a valid session. */
export async function isSignedIn(): Promise<boolean> {
  return (await readSession()) !== null;
}
