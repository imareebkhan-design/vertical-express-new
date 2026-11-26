import { formatPaise } from "@/lib/money";
import { orderTotals, type TotalsInput } from "@/lib/order-display";

/**
 * The printable order summary's two statements of fact (audit F3, 31 Oct 2026).
 *
 * Payment is read from the payment records, never inferred from the order's
 * fulfilment status: a confirmed or delivered COD order has not thereby been
 * paid. Money lines come from `orderTotals`, whose subtotal is already after
 * the coupon, so the saving is a note and never subtracted a second time. An
 * order without per-line tax snapshots shows what was stored, labelled as such,
 * instead of a freshly computed 18%.
 */

type PaymentFacts = {
  status: string;
  amountPaise: number;
  refunds: { status: string; amountPaise: number }[];
};

export function summaryPayment(method: string, payments: PaymentFacts[]): string {
  const received = payments
    .filter((p) => p.status === "captured" || p.status === "refunded")
    .reduce((n, p) => n + p.amountPaise, 0);
  const refunds = payments.flatMap((p) => p.refunds);
  const refunded = refunds.filter((r) => r.status === "processed").reduce((n, r) => n + r.amountPaise, 0);
  const inFlight = refunds.filter((r) => r.status === "requested" || r.status === "pending").reduce((n, r) => n + r.amountPaise, 0);

  if (received > 0) {
    return [
      `Paid online: ${formatPaise(received)}`,
      refunded > 0 ? `Refunded: ${formatPaise(refunded)}` : null,
      inFlight > 0 ? `Refund in progress: ${formatPaise(inFlight)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (payments.some((p) => p.status === "authorized")) return "Payment authorised; capture not yet recorded";
  return method === "cod" ? "Pay on delivery — cash not yet collected" : "Payment not recorded";
}

export function summaryTotals(order: TotalsInput, hasSnapshots: boolean) {
  const view = orderTotals(order);
  let note: string | null = null;
  if (!hasSnapshots) {
    note = view.reconciles
      ? "Older order: the stored amounts are shown; the per-item tax breakdown was not recorded."
      : "Older order: the stored amounts are shown; the per-item tax breakdown was not recorded and these lines do not add up to the total charged.";
  } else if (!view.reconciles) {
    note = "The stored breakdown does not add up to the total charged. Please contact support.";
  }
  return { ...view, note };
}
