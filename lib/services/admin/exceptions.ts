import "server-only";
import { db } from "@/lib/db";
import { SETTING_KEYS, parseFlag, readSettings } from "@/lib/services/settings";

/**
 * What is wrong right now — the "Exceptions" panel of artboard 1.
 *
 * The rest of the dashboard tells a dispatcher how much work there is. This
 * tells them what is broken, which is a different question and the one that
 * ruins a day. It is deliberately a *computed* list: five plausible-looking
 * rows drawn on a screen would be read as five real problems, and somebody
 * would go and act on one.
 *
 * So every entry here comes from something the database or the environment can
 * actually answer, and the checks that cannot yet be run are returned as
 * `unwatchable` — named, so the panel can say what it is not looking at rather
 * than implying it looked and found nothing.
 */
export type Severity = "bad" | "warn" | "info";

export interface OpsException {
  severity: Severity;
  title: string;
  detail: string;
  href?: string;
}

export interface OpsExceptions {
  found: OpsException[];
  /** Checks the artboard specifies that nothing can currently perform. */
  unwatchable: { title: string; needs: string }[];
}

export async function getOpsExceptions(): Promise<OpsExceptions> {
  const [settings, outOfStock, lowStock, staleOrders, pincodeCount] = await Promise.all([
    readSettings(),
    db.inventory.count({ where: { qtyOnHand: { lte: 0 } } }),
    /* At or below the reorder point but not yet empty — the window in which
       ordering more still helps. */
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM inventory
      WHERE qty_on_hand > 0 AND qty_on_hand <= low_stock_threshold`,
    db.order.count({
      where: {
        status: "pending_payment",
        placedAt: { lt: new Date(Date.now() - 60 * 60_000) },
      },
    }),
    db.serviceablePincode.count({ where: { isActive: true } }),
  ]);

  const found: OpsException[] = [];

  /**
   * The gateway. ISS-002 is the reason this panel leads with it: a dummy
   * gateway confirms orders with no money taken, and every other number on the
   * dashboard is downstream of that being true.
   */
  const gateway = process.env.PAYMENT_GATEWAY;
  if (gateway !== "razorpay-live") {
    found.push({
      severity: "bad",
      title: `Payment gateway is ${gateway ?? "unset"}`,
      detail:
        "Orders can confirm with no money taken. Every revenue figure in the console " +
        "is a figure for money that may not exist. ISS-002.",
      href: "/admin/payments",
    });
  }

  if (pincodeCount === 0) {
    found.push({
      severity: "bad",
      title: "No serviceable pincode is active",
      detail: "Checkout will reject every address. Nothing can be sold.",
      href: "/admin/serviceability",
    });
  }

  if (outOfStock > 0) {
    found.push({
      severity: "warn",
      title: `${outOfStock} ${outOfStock === 1 ? "line is" : "lines are"} out of stock`,
      detail: "These variants cannot be bought at the warehouses holding them.",
      href: "/admin/inventory",
    });
  }

  const low = Number(lowStock[0]?.count ?? 0);
  if (low > 0) {
    found.push({
      severity: "warn",
      title: `${low} ${low === 1 ? "line is" : "lines are"} at or below the reorder point`,
      detail:
        "Still sellable, and this is the window in which ordering more helps. " +
        "Whether a purchase order is already open cannot be checked — there is no " +
        "purchase-order model.",
      href: "/admin/inventory",
    });
  }

  if (staleOrders > 0) {
    found.push({
      severity: "warn",
      title: `${staleOrders} ${staleOrders === 1 ? "order has" : "orders have"} been awaiting payment for over an hour`,
      detail: "Stock is held against them. Either the payment failed quietly or the customer walked away.",
      href: "/admin/orders",
    });
  }

  /* Settings whose absence is a live problem rather than a preference. */
  if (!settings[SETTING_KEYS.gstin]) {
    found.push({
      severity: "warn",
      title: "No GSTIN is set",
      detail: "Invoices carry no registration number, so they are not tax invoices.",
      href: "/admin/settings",
    });
  }
  if (parseFlag(settings[SETTING_KEYS.codEnabled])) {
    found.push({
      severity: "warn",
      title: "Cash on delivery is on",
      detail:
        "There is no driver float, no record of what is handed over at the gate and " +
        "no daily reconciliation. Cash collected has nowhere to be accounted for.",
      href: "/admin/settings",
    });
  }

  /* Order matters: a dispatcher reads the top of this list first. */
  const rank: Record<Severity, number> = { bad: 0, warn: 1, info: 2 };
  found.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    found,
    unwatchable: [
      { title: "A delivery slot sold to capacity", needs: "delivery slots, which do not exist" },
      { title: "A slot with no vehicle assigned", needs: "vehicles and drivers, which do not exist" },
      {
        title: "Shipments packed without batch capture",
        needs: "a shipment model and batch capture at goods receipt",
      },
      {
        title: "A low line with no purchase order open",
        needs: "a purchase-order model",
      },
    ],
  };
}
