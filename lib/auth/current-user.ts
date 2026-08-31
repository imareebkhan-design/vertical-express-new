import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Resolves the signed-in Clerk user to this application's own `User` row.
 *
 * Clerk owns identity — phone number, OTP delivery, sessions. The database owns
 * everything that hangs off a customer: addresses, carts, orders, wallet. Those
 * are joined by `users.id`, a UUID, and Clerk's id is a `user_...` string, so
 * the two are bridged by `users.clerk_id` rather than by retyping a primary key
 * that a half-dozen foreign keys already point at.
 *
 * The row is created on first authenticated request rather than by a webhook.
 * A webhook is the better long-term answer for profile changes — see the
 * `clerk-webhooks` skill — but it cannot be the only path: a webhook that is
 * late, retried, or dropped would leave a signed-in customer with no row and a
 * checkout that fails for no visible reason. Creating on demand means the row
 * exists exactly when something needs it.
 *
 * Returns the local UUID, so every existing caller keeps working unchanged.
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (existing) return existing.id;

  return provisionUser(clerkId);
}

/**
 * Creates the local row for a Clerk user we have not seen before.
 *
 * Phone is the identifier this market signs in with, so it is what we store and
 * what an existing row is matched on — someone who ordered before auth moved to
 * Clerk keeps their orders, because the phone number is the same.
 */
async function provisionUser(clerkId: string): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  const phone = user.primaryPhoneNumber?.phoneNumber ?? null;
  const email = user.primaryEmailAddress?.emailAddress ?? null;

  /* Claim a pre-existing row rather than orphaning its orders. Matched on the
     identifier the customer actually signed in with. */
  const priorRow = phone
    ? await db.user.findUnique({ where: { phone }, select: { id: true, clerkId: true } })
    : email
      ? await db.user.findUnique({ where: { email }, select: { id: true, clerkId: true } })
      : null;

  if (priorRow && !priorRow.clerkId) {
    await db.user.update({ where: { id: priorRow.id }, data: { clerkId } });
    return priorRow.id;
  }
  if (priorRow) return priorRow.id;

  const created = await db.user.create({
    data: { id: randomUUID(), clerkId, phone, email },
    select: { id: true },
  });
  return created.id;
}

/** True when a request carries a signed-in session. */
export async function isSignedIn(): Promise<boolean> {
  const { userId } = await auth();
  return userId !== null;
}
