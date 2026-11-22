import "server-only";
import type { Prisma } from "@/prisma/generated/client/client";
import { linkState } from "@/lib/auth/deletion-marker";

/**
 * The guard checkout and the cashback credit run inside their own transactions
 * (see "CONCURRENCY" in account-deletion.ts).
 *
 * It takes FOR SHARE on the user row, which waits for an account deletion that
 * holds FOR UPDATE, and refuses an account that has been deleted. Several
 * checkouts can hold FOR SHARE together; only deletion is serialised against
 * them.
 */
export class AccountDeletedError extends Error {
  constructor() {
    super("ACCOUNT_DELETED");
    this.name = "AccountDeletedError";
  }
}

export async function assertAccountLive(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ firebase_uid: string | null }[]>`
    SELECT firebase_uid FROM users WHERE id = ${userId}::uuid FOR SHARE`;
  if (rows.length === 0 || linkState(rows[0].firebase_uid) !== "live") throw new AccountDeletedError();
}

/**
 * Runs a write of customer-owned data (an address, the cart, the wishlist, the
 * profile) under the same FOR SHARE lock, so it cannot land on an account
 * after deletion has purged it: if deletion committed first this throws
 * ACCOUNT_DELETED and nothing is written; if the write commits first,
 * deletion (FOR UPDATE) waits for it and then purges it.
 */
export async function withLiveAccount<T>(
  db: { $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>) => Promise<R> },
  userId: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    await assertAccountLive(tx, userId);
    return write(tx);
  });
}

/** For writes that may simply drop the link instead (a product enquiry is a lead anyone may send). */
export async function isAccountLive(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  try {
    await assertAccountLive(tx, userId);
    return true;
  } catch (e) {
    if (e instanceof AccountDeletedError) return false;
    throw e;
  }
}
