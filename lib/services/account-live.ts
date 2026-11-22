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
