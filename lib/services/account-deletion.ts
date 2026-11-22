import "server-only";
import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/prisma/generated/client/client";
import { adminApp } from "@/lib/auth/firebase-admin";
import { operatorEmail } from "@/lib/services/admin/authz";
import { CONTACT } from "@/lib/data";
import { formatPaise } from "@/lib/money";
import { log, triggerAlert } from "@/lib/observability";
import {
  deletedMarker,
  linkState,
  pendingMarker,
  uidFromMarker,
} from "@/lib/auth/deletion-marker";

/**
 * Customer self-serve account deletion (Apple 5.1.1(v), Google Play account
 * deletion policy), as agreed with the owner on 22 Nov 2026:
 *
 *  - Immediate, no grace period, no ops step.
 *  - REFUSED while anything is unsettled — an order in progress, a refund or
 *    return still open, a service booking still open, or money in the wallet —
 *    with the specific reason and what to do about it. Nothing is cancelled or
 *    refunded on the customer's behalf; those rules are the owner's.
 *  - Staff and delivery-partner accounts are refused outright.
 *  - What the customer owns is deleted; transaction records (orders, payments,
 *    refunds and their tax figures, wallet history, service bookings) are kept,
 *    as the privacy policy says: "except for records we are legally required to
 *    keep". The kept order rows carry the delivery name/phone/address snapshot
 *    the invoice is drawn from.
 *
 * TWO PHASES, BECAUSE FIREBASE IS NOT IN OUR TRANSACTION
 *
 *   1. One database transaction: lock the user row, re-check eligibility under
 *      the lock, delete what the customer owns, strip phone/email/Clerk id, and
 *      rewrite the sign-in link to `deletion-pending:<uid>`.
 *   2. Delete the Firebase user. On success the link becomes `deleted:<uid>`.
 *
 * If phase 2 fails the row stays `deletion-pending:` — durable state saying
 * exactly what is left. The customer is told it is not finished (never that it
 * succeeded); calling again resumes at phase 2, and the cron route retries any
 * that are left. Meanwhile `resolveUserFromToken` refuses the old uid, so the
 * still-valid session cannot re-provision an account.
 *
 * CONCURRENCY
 *
 * Phase 1 takes `FOR UPDATE` on the user row before reading anything. Checkout
 * and the cashback credit take `FOR SHARE` on the same row inside their own
 * transactions and refuse a deleted account (`assertAccountLive`). So either
 * the checkout commits first — and phase 1, reading after the lock is granted,
 * sees its order and refuses — or phase 1 commits first and the checkout sees
 * the marker and refuses. Same for a wallet credit.
 */

export type BlockerCode =
  | "STAFF_ACCOUNT"
  | "DRIVER_ACCOUNT"
  | "ORDER_IN_PROGRESS"
  | "REFUND_IN_PROGRESS"
  | "RETURN_IN_PROGRESS"
  | "BOOKING_IN_PROGRESS"
  | "WALLET_BALANCE";

export type DeletionBlocker = {
  code: BlockerCode;
  /** What is in the way, in the customer's words. */
  message: string;
  /** What the customer can do about it. */
  resolve: string;
  /** The order it concerns, so a client can link straight to it. */
  orderNo?: string;
};

/** Order states that mean goods or money are still moving. */
const OPEN_ORDER_STATUSES = ["pending_payment", "confirmed", "packed", "out_for_delivery"] as const;
const OPEN_RETURN_STATUSES = ["requested", "under_review", "inspecting", "approved"] as const;
const OPEN_REFUND_STATUSES = ["requested", "pending"] as const;
const OPEN_BOOKING_STATUSES = ["received", "scheduled", "visited", "quoted", "in_progress"] as const;

/** Shown before confirmation, by the website and the app alike, so the two cannot disagree. */
export const DELETION_EXPLAINER = {
  deleted: [
    "The phone number and email address on your account",
    "Your name, company name and GSTIN",
    "Your saved delivery sites and access notes",
    "Your cart and saved items",
    "Product enquiries you sent us",
    "Your Vertical Express sign-in",
  ],
  kept: [
    "Orders, payments, refunds and the tax on them. Tax law requires us to keep these records. Each order keeps the delivery name, phone and address it was placed with, because the invoice is drawn from them.",
    "Your wallet history, so the ledger still adds up. The balance must be zero.",
    "Service booking records.",
  ],
  after:
    "You will be signed out everywhere. If you sign in again later, even with the same phone number, you will start a new, empty account — your past orders will not be shown to it.",
} as const;

type DbClient = Prisma.TransactionClient | typeof db;

type LockedUser = {
  id: string;
  firebase_uid: string | null;
  phone: string | null;
  email: string | null;
  role: string;
};

async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<LockedUser | null> {
  const rows = await tx.$queryRaw<LockedUser[]>`
    SELECT id::text AS id, firebase_uid, phone, email, role::text AS role
    FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  return rows[0] ?? null;
}

/** Everything in the way of deleting this account. Empty means it may be deleted. */
export async function findBlockers(
  client: DbClient,
  user: { id: string; phone: string | null; email: string | null; role: string; firebaseUid: string | null },
  opts: { lockWallet?: boolean } = {}
): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = [];

  if (user.role !== "customer" || (user.email && operatorEmail({ email: user.email, email_verified: true }))) {
    blockers.push({
      code: "STAFF_ACCOUNT",
      message: "This is a Vertical Express staff account, so it can't be deleted here.",
      resolve: "Ask the owner to remove your staff access first.",
    });
  }

  const uid = user.firebaseUid && linkState(user.firebaseUid) === "live" ? user.firebaseUid : null;
  const driverWhere: Prisma.DriverWhereInput[] = [];
  if (uid) driverWhere.push({ firebaseUid: uid });
  if (user.phone) driverWhere.push({ phone: user.phone });
  if (driverWhere.length > 0 && (await client.driver.findFirst({ where: { OR: driverWhere }, select: { id: true } }))) {
    blockers.push({
      code: "DRIVER_ACCOUNT",
      message: "This phone number is on our delivery-partner roster.",
      resolve: `Ask the operations team to take you off the roster first, or email ${CONTACT.email}.`,
    });
  }

  const openOrders = await client.order.findMany({
    where: { userId: user.id, status: { in: [...OPEN_ORDER_STATUSES] } },
    select: { orderNo: true, status: true },
    orderBy: { placedAt: "asc" },
  });
  for (const o of openOrders) {
    blockers.push(
      o.status === "pending_payment"
        ? {
            code: "ORDER_IN_PROGRESS",
            orderNo: o.orderNo,
            message: `Order #${o.orderNo} is waiting for payment.`,
            resolve: "Cancel it from the order's page, or wait for the payment window to close — an unpaid order is cancelled automatically. Don't pay for it if you no longer want it.",
          }
        : {
            code: "ORDER_IN_PROGRESS",
            orderNo: o.orderNo,
            message: `Order #${o.orderNo} is still being fulfilled.`,
            resolve: "You can delete your account once it has been delivered or cancelled.",
          }
    );
  }

  const refunding = await client.order.findMany({
    where: {
      userId: user.id,
      OR: [{ status: "refund_initiated" }, { refunds: { some: { status: { in: [...OPEN_REFUND_STATUSES] } } } }],
    },
    select: { orderNo: true },
  });
  for (const o of refunding) {
    blockers.push({
      code: "REFUND_IN_PROGRESS",
      orderNo: o.orderNo,
      message: `A refund for order #${o.orderNo} is still being processed.`,
      resolve: `You can delete your account once the refund is complete. If it seems stuck, email ${CONTACT.email} with the order number.`,
    });
  }

  const returning = await client.returnRequest.findMany({
    where: { order: { userId: user.id }, status: { in: [...OPEN_RETURN_STATUSES] } },
    select: { order: { select: { orderNo: true } } },
  });
  for (const r of returning) {
    blockers.push({
      code: "RETURN_IN_PROGRESS",
      orderNo: r.order.orderNo,
      message: `Your return for order #${r.order.orderNo} is still open.`,
      resolve: `You can delete your account once the return is closed. Email ${CONTACT.email} with the order number to ask about it.`,
    });
  }

  const bookings = await client.booking.findMany({
    where: { userId: user.id, status: { in: [...OPEN_BOOKING_STATUSES] } },
    select: { bookingNo: true },
  });
  for (const b of bookings) {
    blockers.push({
      code: "BOOKING_IN_PROGRESS",
      message: `Service booking ${b.bookingNo} is still open.`,
      resolve: `Email ${CONTACT.email} with the booking number to close or cancel it first.`,
    });
  }

  const wallet = opts.lockWallet && "$queryRaw" in client
    ? (await (client as Prisma.TransactionClient).$queryRaw<{ balance_paise: number }[]>`
        SELECT balance_paise FROM wallets WHERE user_id = ${user.id}::uuid FOR UPDATE`)[0]
    : await client.wallet.findUnique({ where: { userId: user.id }, select: { balancePaise: true } }).then((w) => (w ? { balance_paise: w.balancePaise } : undefined));
  const balance = wallet?.balance_paise ?? 0;
  if (balance !== 0) {
    blockers.push({
      code: "WALLET_BALANCE",
      message: `You have ${formatPaise(balance)} in your Vertical Express wallet.`,
      /* Owner decision, 22 Nov 2026: settlement is case by case through support.
         Deletion stays blocked for any nonzero balance; no payout is promised
         here and there is no payout record type. */
      resolve: `Email ${CONTACT.email} about your wallet balance. You can delete your account once it shows ₹0.`,
    });
  }

  return blockers;
}

export type DeletionStatus =
  | { state: "eligible"; explainer: typeof DELETION_EXPLAINER }
  | { state: "blocked"; blockers: DeletionBlocker[]; explainer: typeof DELETION_EXPLAINER };

/** For the confirmation screen: may this account be deleted, and if not, why not. Read-only. */
export async function getDeletionStatus(userId: string): Promise<DeletionStatus | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, email: true, role: true, firebaseUid: true },
  });
  if (!user || linkState(user.firebaseUid) !== "live") return null;
  const blockers = await findBlockers(db, user);
  return blockers.length === 0
    ? { state: "eligible", explainer: DELETION_EXPLAINER }
    : { state: "blocked", blockers, explainer: DELETION_EXPLAINER };
}

export type FirebaseAccountOps = {
  /** Deletes the Firebase user. Must treat "no such user" as success. */
  deleteUser: (uid: string) => Promise<void>;
};

export const firebaseAccountOps: FirebaseAccountOps = {
  async deleteUser(uid) {
    const auth = getAuth(adminApp());
    try {
      /* Revoking first makes every refresh token for this uid dead even if the
         delete below then fails: the session ends now, not in an hour. */
      await auth.revokeRefreshTokens(uid);
      await auth.deleteUser(uid);
    } catch (e) {
      if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "auth/user-not-found") return;
      throw e;
    }
  },
};

export type DeletionResult =
  | { status: "deleted" }
  | { status: "blocked"; blockers: DeletionBlocker[] }
  /** The database part is done, the Firebase sign-in is not. Never reported as success. */
  | { status: "pending" }
  | { status: "not_found" };

/**
 * Deletes the account that `uid` signs in to. Safe to call again: a
 * `deletion-pending` account resumes at the Firebase step, a deleted one
 * reports deleted.
 *
 * `uid` comes from a verified token or session, never from the client body.
 */
export async function deleteAccount(
  uid: string,
  deps: { firebase?: FirebaseAccountOps } = {}
): Promise<DeletionResult> {
  const firebase = deps.firebase ?? firebaseAccountOps;

  const row = await db.user.findFirst({
    where: { firebaseUid: { in: [uid, pendingMarker(uid), deletedMarker(uid)] } },
    select: { id: true, firebaseUid: true },
  });
  if (!row) return { status: "not_found" };
  if (linkState(row.firebaseUid) === "deleted") return { status: "deleted" };

  if (linkState(row.firebaseUid) === "live") {
    const phase1 = await db.$transaction(async (tx): Promise<{ ok: true } | { ok: false; blockers: DeletionBlocker[] } | { ok: "gone" }> => {
      const locked = await lockUser(tx, row.id);
      if (!locked || locked.firebase_uid !== uid) return { ok: "gone" };

      const blockers = await findBlockers(
        tx,
        { id: locked.id, phone: locked.phone, email: locked.email, role: locked.role, firebaseUid: locked.firebase_uid },
        { lockWallet: true }
      );
      if (blockers.length > 0) return { ok: false, blockers };

      await purgeOwnedData(tx, locked.id);
      await tx.user.update({
        where: { id: locked.id },
        data: { phone: null, email: null, clerkId: null, firebaseUid: pendingMarker(uid) },
      });
      return { ok: true };
    });

    if (phase1.ok === "gone") return deleteAccount(uid, deps);
    if (phase1.ok === false) return { status: "blocked", blockers: phase1.blockers };
    log("INFO", { service: "account-deletion", event: "account_data_deleted", metadata: { userId: row.id } });
  }

  return finishFirebaseDeletion(row.id, uid, firebase);
}

/** What the customer owns outright. Orders, payments, refunds, wallet ledger and bookings are kept. */
async function purgeOwnedData(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.address.deleteMany({ where: { userId } });
  await tx.cart.deleteMany({ where: { userId } });
  await tx.wishlist.deleteMany({ where: { userId } });
  await tx.profile.deleteMany({ where: { userId } });
  await tx.productEnquiry.deleteMany({ where: { userId } });
}

async function finishFirebaseDeletion(userId: string, uid: string, firebase: FirebaseAccountOps): Promise<DeletionResult> {
  try {
    await firebase.deleteUser(uid);
  } catch (e) {
    log("ERROR", {
      service: "account-deletion",
      event: "firebase_delete_failed",
      metadata: { userId, error: e instanceof Error ? e.message : String(e) },
    });
    return { status: "pending" };
  }

  await db.$transaction(async (tx) => {
    /* A request already in flight when phase 1 committed could have written an
       address or a cart line after the purge. The account is unreachable now,
       so sweep once more before declaring it done. */
    await purgeOwnedData(tx, userId);
    await tx.user.updateMany({
      where: { id: userId, firebaseUid: pendingMarker(uid) },
      data: { firebaseUid: deletedMarker(uid) },
    });
  });
  log("INFO", { service: "account-deletion", event: "account_deleted", metadata: { userId } });
  return { status: "deleted" };
}

/**
 * Retries the Firebase step for accounts left `deletion-pending`. Run from the
 * cron route; a failure here is logged and retried next run.
 */
export async function retryPendingDeletions(
  deps: { firebase?: FirebaseAccountOps; limit?: number } = {}
): Promise<{ checked: number; finished: number }> {
  const firebase = deps.firebase ?? firebaseAccountOps;
  const pending = await db.user.findMany({
    where: { firebaseUid: { startsWith: "deletion-pending:" } },
    select: { id: true, firebaseUid: true },
    take: deps.limit ?? 25,
  });
  let finished = 0;
  for (const p of pending) {
    const uid = uidFromMarker(p.firebaseUid);
    if (!uid) continue;
    const r = await finishFirebaseDeletion(p.id, uid, firebase);
    if (r.status === "deleted") finished += 1;
  }
  if (pending.length > 0 && finished < pending.length) {
    triggerAlert(
      "account_deletion_firebase_pending",
      `${pending.length - finished} deleted account(s) still have a Firebase sign-in after retry.`
    );
  }
  return { checked: pending.length, finished };
}

export { AccountDeletedError, assertAccountLive } from "@/lib/services/account-live";
