import "server-only";
import { db } from "@/lib/db";
import { isCancellable } from "@/lib/order-flow";
import { releaseCouponRedemption } from "@/lib/services/coupon-eligibility";
import type { Prisma } from "@/prisma/generated/client/client";
import { settleCapturedPayment } from "@/lib/services/checkout";
import { getPaymentProvider, PaymentConfigError, type CapturedLookup } from "@/lib/services/payments";
import { captureException, triggerAlert } from "@/lib/observability";

export type { CapturedLookup };

export interface OrderAddressSnapshot {
  label: string;
  name: string;
  phone: string;
  /**
   * Where to send updates about *this order*. Optional, and not an identity.
   *
   * The market signs in by phone, and a phone sign-in carries no email — so
   * `emailOrderConfirmation` returned early and the customer most likely to
   * order was the one who heard nothing back. Checkout now offers a field.
   *
   * It lives on the order rather than on `User` for two reasons. `User.email`
   * is `@unique`, so writing a typed address there can collide with somebody
   * else's account; and an unverified address attached to an identity is
   * exactly the hazard `getAdminUser`'s `email_verified` check exists to stop.
   * "Where to send this receipt" is a different claim from "who this is", and
   * only the first one is being made here.
   */
  email?: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  /** What the driver needs at the gate. Snapshotted with the order. */
  accessNote?: string | null;
  /** The customer's confirmed delivery pin, when they dropped one. */
  latitude?: number | null;
  longitude?: number | null;
  city: string;
  state: string;
  pincode: string;
}

const orderInclude = {
  /* The product slug rides along so a past order can link back to the product
     and "Order again" can open it — the item row itself only snapshots text. */
  items: { include: { variant: { select: { product: { select: { slug: true } } } } } },
  statusEvents: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function getOrderByNo(userId: string, orderNo: string): Promise<OrderWithDetails | null> {
  return db.order.findFirst({
    where: { orderNo, userId },
    include: orderInclude,
  });
}

/**
 * Recover an order from the idempotency key the client sent when placing it.
 *
 * Read-only, and scoped to the caller: the key alone identifies nothing, the
 * pair (customer, key) does — the same pair the unique constraint protects. A
 * key belonging to somebody else's order is indistinguishable from no order.
 * This exists so a client that lost the response to `placeOrder` can learn
 * whether the order was created without submitting a second one.
 */
export async function getOrderByIdempotencyKey(userId: string, idempotencyKey: string): Promise<OrderWithDetails | null> {
  return db.order.findFirst({
    where: { idempotencyKey, userId },
    include: orderInclude,
  });
}

export async function listOrders(userId: string, page = 1, perPage = 10) {
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        items: { include: { variant: { select: { product: { select: { slug: true } } } } } },
        payments: { take: 1, orderBy: { createdAt: "desc" } },
        /* How the order travels — a list row must not state one arrival for
           an order that also has a truck shipment. */
        shipments: { select: { sequence: true, speedClass: true, status: true }, orderBy: { sequence: "asc" } },
      },
    }),
    db.order.count({ where: { userId } }),
  ]);
  return { orders, total, page, perPage };
}

/** Helper to safely release/restock inventory for an order, scoped to its warehouse. */
export async function releaseOrderInventory(
  tx: Prisma.TransactionClient,
  orderId: string,
  warehouseId?: string | null
) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    const inv = await tx.inventory.findFirst({
      where: {
        variantId: item.variantId,
        ...(warehouseId ? { warehouseId } : {}),
      },
    });
    if (inv) {
      await tx.inventory.update({
        where: { id: inv.id },
        data: { qtyOnHand: { increment: item.qty } },
      });
    }
  }
}

/**
 * Whether money is recorded or held against this order.
 *
 * Conservative on purpose: any `captured` or `authorized` payment row counts,
 * whatever the order's payment method says and whichever attempt it was (an
 * earlier success is not undone by a newer failed retry). An online order also
 * reaches `confirmed` only through a captured payment (`settleCapturedPayment`).
 * A cash-on-delivery order is unpaid before dispatch — unless a payment row
 * says otherwise, in which case the label loses.
 */
function hasFunds(order: { status: string; paymentMethod: string; payments: { status: string }[] }): boolean {
  if (order.payments.some((p) => p.status === "captured" || p.status === "authorized")) return true;
  return order.paymentMethod !== "cod" && order.status === "confirmed";
}

/**
 * Customer cancellation, while still pre-fulfilment; releases stock.
 *
 * Refuses an order paid online (`PAID_NOT_CANCELLABLE`). Cancelling one would
 * restock it and keep the money: nothing refunds — the refund path is
 * unreachable by design until the owner sets a refund policy
 * (lib/order-flow.ts, ISS-025). Unpaid orders stay cancellable.
 */
export async function cancelOrder(
  userId: string,
  orderNo: string,
  reason: string,
  deps: { findCaptured?: (gatewayOrderId: string) => Promise<CapturedLookup | null> } = {}
) {
  const order = await db.order.findFirst({
    where: { orderNo, userId },
    include: { items: true, payments: { select: { status: true } } },
  });
  if (!order) throw new Error("NOT_FOUND");
  /* Was its own list of statuses, which happened to agree with ORDER_FLOW and
     was free to drift from it. Derived from the machine now — see
     lib/order-flow.ts. */
  if (!isCancellable(order.status)) {
    throw new Error("NOT_CANCELLABLE");
  }
  if (hasFunds(order)) {
    throw new Error("PAID_NOT_CANCELLABLE");
  }

  /* E5: "awaiting payment" here may only mean the confirmation never reached
     us (browser closed, network dropped, webhook late). For an order with a
     Razorpay order, ask Razorpay before cancelling — after the ownership check
     above, outside any transaction. Cancel only on a definite "nothing
     captured"; anything uncertain refuses with guidance, never "unpaid".
     COD and gateway-less orders have no Razorpay order and are not asked.

     This narrows the lost-callback gap; it cannot close it. A capture that
     lands at Razorpay after this lookup (a payment completing in another tab,
     a bank's late authorization) still meets a cancelled order. That capture
     is recorded by the webhook as a late payment on the refund worklist with a
     `late_payment_captured` alert (`settleCapturedPayment`) — if the webhook
     arrives. Nothing refunds automatically. */
  if (order.status === "pending_payment") {
    const check = await reconcileWithGateway(order, { context: "cancel", findCaptured: deps.findCaptured });
    if (check === "settled" || check === "late") throw new Error("PAID_NOT_CANCELLABLE");
    if (check === "authorized") throw new Error("PAYMENT_IN_PROGRESS");
    if (check === "unknown" || check === "unconfigured") throw new Error("PAYMENT_STATUS_UNKNOWN");
  }

  await db.$transaction(async (tx) => {
    /* Guarded on the status read above, in one statement — this, not the
       payment read, is what makes the check safe against a concurrent payment.
       Every writer that records a capture on a pending order
       (`settleCapturedPayment`) moves the order out of
       `pending_payment` in the same transaction, and the expiry cron cancels
       with the same compare-and-set. So whichever commits first wins the row;
       a cancel that loses changes nothing and throws. Nothing writes an
       `authorized` payment today; if something ever did without moving the
       order, this guarantee would need that writer to join the protocol. */
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: "cancelled", cancelledReason: reason },
    });
    if (moved.count !== 1) throw new Error("NOT_CANCELLABLE");
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: "cancelled", note: reason, actorUserId: userId },
    });
    // Restock to the specific warehouse where stock was reserved.
    await releaseOrderInventory(tx, order.id, order.warehouseId);
    await releaseCouponRedemption(tx, order.id);
  });
}

/** Copy a past order's items back into the active cart. */
export async function reorder(userId: string, orderNo: string) {
  const order = await db.order.findFirst({ where: { orderNo, userId }, include: { items: true } });
  if (!order) throw new Error("NOT_FOUND");

  const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  for (const item of order.items) {
    // Skip variants that no longer exist / are inactive.
    const variant = await db.productVariant.findFirst({ where: { id: item.variantId, isActive: true } });
    if (!variant) continue;
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
      update: { qty: { increment: item.qty } },
      create: { cartId: cart.id, variantId: item.variantId, qty: item.qty },
    });
  }
}

export type GatewayCheck = "settled" | "late" | "not_captured" | "authorized" | "unknown" | "unconfigured";

/**
 * Ask Razorpay whether a pending order was in fact paid, and settle it if so.
 *
 * Used where our own record says "not paid yet" but a lost browser callback or
 * a late webhook may mean otherwise: the payment-window expiry (ISS-074) and a
 * customer's "Complete payment" (E5). One implementation, so the two cannot
 * disagree about what the gateway said.
 *
 *   captured at the order's amount -> settled via `settleCapturedPayment`
 *                                      ("settled", or "late" if the order died
 *                                      meanwhile — recorded for refund there)
 *   captured at another amount     -> alert, "unknown" (never settled)
 *   authorized, capture pending    -> "authorized" (money held: neither paid nor unpaid)
 *   lookup failed / timed out      -> alert, "unknown"
 *   nothing captured               -> "not_captured"
 *   no gateway in this process     -> alert, "unconfigured" — a Razorpay order
 *                                     exists but cannot be asked about. Expiry and
 *                                     cancel leave the order alone; retry offers
 *                                     checkout as before (which itself needs the gateway)
 *
 * Only Razorpay payment rows are asked about: a row from another gateway (the
 * dummy's instantly-settled `dummy_…` orders, COD) has no Razorpay order.
 *
 * The gateway call is made outside any transaction; settlement is its own
 * short compare-and-set transaction, safe against a racing callback/webhook.
 */
export async function reconcileWithGateway(
  order: { id: string; orderNo: string },
  opts: {
    context: "expiry" | "retry" | "cancel";
    findCaptured?: (gatewayOrderId: string) => Promise<CapturedLookup | null>;
  }
): Promise<GatewayCheck> {
  let unconfigured = false;
  const findCaptured =
    opts.findCaptured ?? ((gw: string) => getPaymentProvider("razorpay").findCapturedPayment(gw));
  const gatewayPayments = await db.payment.findMany({
    where: { orderId: order.id, gateway: "razorpay", gatewayOrderId: { not: null }, status: { not: "captured" } },
    select: { id: true, gatewayOrderId: true, amountPaise: true },
  });
  for (const p of gatewayPayments) {
    let found: CapturedLookup | null;
    try {
      found = await findCaptured(p.gatewayOrderId!);
    } catch (e) {
      if (e instanceof PaymentConfigError) {
        /* This process cannot ask Razorpay: the order may be paid, and we
           cannot tell. Not left to the startup guard (assertPaymentConfig) —
           the service holds the invariant itself. The alert carries the
           configuration error, which names settings, never their values. */
        if (!unconfigured) {
          triggerAlert(
            `${opts.context}_gateway_unconfigured`,
            "Razorpay is not configured in this process, so a pending Razorpay order could not be checked; left as it is. Set the Razorpay keys for this environment.",
            { orderNo: order.orderNo, configError: e.message }
          );
        }
        unconfigured = true;
        continue;
      }
      captureException(e, { orderNo: order.orderNo, stage: `${opts.context}_gateway_lookup` });
      triggerAlert(
        `${opts.context}_gateway_lookup_failed`,
        "Could not ask the gateway whether a pending order was paid; left pending",
        { orderNo: order.orderNo }
      );
      return "unknown";
    }
    if (!found) continue;
    if (found.status === "authorized") return "authorized";
    if (found.amountPaise !== p.amountPaise) {
      triggerAlert(
        `${opts.context}_capture_amount_mismatch`,
        "Gateway reports a capture of a different amount; order left pending",
        { orderNo: order.orderNo, expected: p.amountPaise, received: found.amountPaise }
      );
      return "unknown";
    }
    const outcome = await settleCapturedPayment({
      paymentId: p.id,
      orderId: order.id,
      orderNo: order.orderNo,
      amountPaise: p.amountPaise,
      gatewayPaymentId: found.gatewayPaymentId,
      source: `${opts.context}_check`,
      note: {
        expiry: "Payment captured at Razorpay before the payment window closed (found by the expiry check)",
        retry: "Payment captured at Razorpay; confirmed when the customer returned to pay (found by the gateway check)",
        cancel: "Payment captured at Razorpay; confirmed when the customer asked to cancel, so the order was not cancelled (found by the gateway check)",
      }[opts.context],
    });
    return outcome === "late_recorded" || outcome === "late_already_recorded" ? "late" : "settled";
  }
  return unconfigured ? "unconfigured" : "not_captured";
}

/** How many stale orders one expiry run takes (ISS-078). */
export const EXPIRY_BATCH_SIZE = 20;
/**
 * How long a claim holds. An order the expiry examined less than this long ago
 * is not claimed again — by this run's successor or by an overlapping run — so
 * two workers do not ask Razorpay about the same order at once, and a worker
 * that died mid-order hands the order back when the lease lapses. Meant to
 * outlast one order's examination: an order has one unsettled Razorpay payment
 * row (created at placement; a second capture is recorded already captured), so
 * one lookup (10 s timeout) plus short transactions. An examination that
 * outlasted it could be repeated by another worker — a second lookup, never a
 * second cancel or release (the cancel is a compare-and-set). Shorter than the
 * 5-minute cron interval, so a blocked order is re-checked on every run that
 * has room for it.
 */
export const EXPIRY_CLAIM_LEASE_MS = 2 * 60 * 1000;
/** A run stops claiming new orders after this long; the rest wait for the next run. */
export const EXPIRY_RUN_BUDGET_MS = 120 * 1000;

/**
 * Automatically cancels stale `pending_payment` orders older than maxAgeMinutes
 * (default 15 mins) and releases their reserved inventory back to qtyOnHand.
 *
 * QUEUE PROGRESS (ISS-078). Some stale orders must stay pending — Razorpay
 * holds an authorized payment, the lookup failed, the amount mismatched, or the
 * gateway is not configured here. Reading "the first 20 stale orders" with no
 * order and no memory let 20 such orders be re-read on every run while every
 * order behind them — including unpaid ones that should release their stock and
 * coupon use — was never reached.
 *
 * Each run now:
 *   1. selects at most EXPIRY_BATCH_SIZE stale pending orders not examined in
 *      the last EXPIRY_CLAIM_LEASE_MS, never-examined first, then the
 *      least-recently examined, then the oldest (`expiryCheckedAt` NULLS FIRST,
 *      `placedAt`, `id`) — one indexed, bounded query;
 *   2. claims each order just before working on it, by a conditional update
 *      that sets `expiryCheckedAt = now` only if nobody claimed it within the
 *      lease (so overlapping runs do not repeat each other's lookups while a
 *      claim holds; a run that loses a claim skips that order);
 *   3. asks the gateway and then cancels or leaves it exactly as before.
 * An order left pending has just had `expiryCheckedAt` set, so it moves behind
 * every order examined less recently.
 *
 * What this establishes (lib/services/__tests__/expiry-queue-progress.test.ts):
 *   - Per run: at most EXPIRY_BATCH_SIZE orders; no new claim once
 *     EXPIRY_RUN_BUDGET_MS has passed (measured from before the selection), so
 *     a run lasts about the budget plus one order's examination (one lookup,
 *     10 s timeout, and its transactions, which have no timeout of their own).
 *   - Progress: a run examines the first order it selected unless an
 *     overlapping run holds that order's claim — even when the budget then
 *     stops it (only a selection query that alone outlasts the budget examines
 *     nothing). An order a run did not reach carries no claim and keeps its
 *     place; the next run starts from it.
 *   - Order: never-examined orders oldest first, then the least recently
 *     claimed. A never-examined order is therefore reached once the
 *     never-examined stale orders placed before it have been examined — orders
 *     that become stale later queue behind it. Blocked orders are re-examined
 *     after their lease, in turn; nothing is cancelled on missing information.
 * The number of RUNS that takes is not fixed. With N claimable orders and none
 * arriving, ceil(N / EXPIRY_BATCH_SIZE) runs suffice only when each run
 * examines a full batch. Fewer per run when:
 *   - the budget runs out — a slow or failing gateway (by arithmetic, not
 *     test: if every lookup hits the 10 s timeout, about a dozen orders fit in
 *     one run; the test shows one per run when each order is slow enough);
 *   - runs overlap — they share the queue: no order is looked up twice while its
 *     claim holds, but together they may examine no more than one run would
 *     (an order with no Razorpay payment is not claimed; both may reach it, and
 *     the compare-and-set cancels it once);
 *   - a worker dies after claiming — the order is not examined, is claimable
 *     again after EXPIRY_CLAIM_LEASE_MS, and its claim counts as an examination:
 *     it goes behind every order examined less recently (it loses its place;
 *     its stock and coupon use are untouched until it is examined);
 *   - new orders become stale — never examined, they go ahead of every order
 *     already examined and left pending (not ahead of an older never-examined one).
 * And runs happen only as often as the scheduler calls the cron route.
 * Stock and coupon use are released exactly once whatever overlaps; a cancel
 * that throws still moves the order to the back (unless that update fails too).
 */
export async function cleanupExpiredPendingOrders(
  maxAgeMinutes = 15,
  deps: {
    /** Injected in tests; defaults to asking the active Razorpay gateway. */
    findCaptured?: (gatewayOrderId: string) => Promise<CapturedLookup | null>;
    /** Injected in tests to move time; defaults to the wall clock (ms). */
    now?: () => number;
    /** Injected in tests; defaults to EXPIRY_RUN_BUDGET_MS. */
    runBudgetMs?: number;
  } = {}
): Promise<number> {
  const now = deps.now ?? (() => Date.now());
  const runBudgetMs = deps.runBudgetMs ?? EXPIRY_RUN_BUDGET_MS;
  const startedAt = now();
  const cutoff = new Date(startedAt - maxAgeMinutes * 60 * 1000);
  const findCaptured =
    deps.findCaptured ?? ((gw: string) => getPaymentProvider("razorpay").findCapturedPayment(gw));

  const claimable = (at: number) => ({
    status: "pending_payment" as const,
    placedAt: { lte: cutoff },
    OR: [{ expiryCheckedAt: null }, { expiryCheckedAt: { lt: new Date(at - EXPIRY_CLAIM_LEASE_MS) } }],
  });

  const staleOrders = await db.order.findMany({
    where: claimable(startedAt),
    orderBy: [{ expiryCheckedAt: { sort: "asc", nulls: "first" } }, { placedAt: "asc" }, { id: "asc" }],
    include: {
      items: true,
      /* The Razorpay payments `reconcileWithGateway` would ask about. None means
         there is nothing to ask: the order can only cancel, never block. */
      payments: {
        where: { gateway: "razorpay", gatewayOrderId: { not: null }, status: { not: "captured" } },
        select: { id: true },
      },
    },
    take: EXPIRY_BATCH_SIZE,
  });

  let cancelledCount = 0;

  for (const order of staleOrders) {
    const at = now();
    /* Out of time: stop before claiming — an unclaimed order waits for the next
       run at the front of the queue, not behind a lease. */
    if (at - startedAt > runBudgetMs) break;
    /* Claim it, or leave it to whoever did — needed only where a gateway lookup
       follows (the external, slow, possibly-blocking step). The same statement
       is the round-robin step: examined now, it goes to the back of the queue.
       An order with nothing to ask about goes straight to the compare-and-set
       cancel below, exactly as before; two runs racing it still cancel it once. */
    if (order.payments.length > 0) {
      const claimed = await db.order.updateMany({
        where: { id: order.id, ...claimable(at) },
        data: { expiryCheckedAt: new Date(at) },
      });
      if (claimed.count !== 1) continue;
    }

    /* ISS-074: ask the gateway before cancelling. A capture whose browser
       callback was lost and whose webhook is late exists only at Razorpay;
       cancelling on the local status alone cancelled paid orders. Never cancel
       on missing information ("unknown" waits for the next run), nor while the
       bank holds an authorized payment ("authorized" waits for its capture or
       its release), nor when this process cannot ask Razorpay at all
       ("unconfigured": alerted, left pending — the same rule as a customer's
       cancel). Only a definite "nothing captured" — or an order with no
       Razorpay order to ask about — expires. */
    const found = await reconcileWithGateway(order, { context: "expiry", findCaptured });
    if (found !== "not_captured") continue;

    try {
      await db.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: "pending_payment" },
          data: { status: "cancelled", cancelledReason: "Payment window expired (15 min)" },
        });

        if (updated.count > 0) {
          await tx.orderStatusEvent.create({
            data: {
              orderId: order.id,
              fromStatus: "pending_payment",
              toStatus: "cancelled",
              note: "Stale pending_payment auto-cancelled after 15 minutes",
            },
          });

          await releaseOrderInventory(tx, order.id, order.warehouseId);
          await releaseCouponRedemption(tx, order.id);
          cancelledCount++;
        }
      });
    } catch {
      /* Continue cleanup loop if single order fails — and rotate it, so an order
         whose cancel keeps failing cannot hold a place at the front every run. */
      await db.order
        .updateMany({ where: { id: order.id, status: "pending_payment" }, data: { expiryCheckedAt: new Date(at) } })
        .catch(() => {});
    }
  }

  return cancelledCount;
}
