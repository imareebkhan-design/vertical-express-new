import "server-only";
import { DEAD_ORDER_STATES } from "@/lib/services/checkout";
import type { Prisma } from "@/prisma/generated/client/client";

/**
 * What the console means by a paid order when it adds up money.
 *
 * An order counts when a payment on it is captured and the order still stands.
 * That is deliberately narrower than "not cancelled", which is what Today and
 * the customer screens used to sum (RPT-01): an order sitting in
 * `pending_payment` has taken nobody's money.
 *
 * Left out, and why:
 *  - a dead order (cancelled, refund initiated, refunded). Its capture is owed
 *    back and sits on Payments under "Refund required"; it is not revenue.
 *  - cash on delivery. No row records cash being handed over, so there is
 *    nothing to count. COD is switched off; if the owner turns it on, counting
 *    it needs a collection record first, not an assumption here.
 *
 * An order paid twice is counted once, at its own total: the second capture is
 * a refund owed (`listDuplicateCaptures`), not extra revenue.
 */
export const PAID_ORDER_WHERE = {
  status: { notIn: [...DEAD_ORDER_STATES] },
  payments: { some: { status: "captured" } },
} satisfies Prisma.OrderWhereInput;

/** The same rule for an order already loaded with its captured payments. */
export function isPaidOrder(o: { status: string; payments: unknown[] }): boolean {
  return !(DEAD_ORDER_STATES as readonly string[]).includes(o.status) && o.payments.length > 0;
}
