import "server-only";
import { db } from "@/lib/db";
import { checkServiceability } from "@/lib/services/serviceability";
import { SETTING_KEYS, readSetting } from "@/lib/services/settings";
import { speedClassOf, type ShipmentSpeedClass } from "@/lib/shipment-plan";

/**
 * Whether a cart can be delivered on the 60-minute run, and what that costs.
 *
 * THE RULE, as the owner set it
 *
 *   A product is express-eligible or it is not — decided when it is listed.
 *   If it is eligible, it is eligible in named pincodes, also set at listing.
 *   Express to a pincode that offers it is charged.
 *   If a cart mixes an eligible item with one that is not, the whole order can
 *   go standard instead, together, at no extra delivery charge.
 *
 * So the customer is choosing between speed for part of the order and one
 * arrival for all of it. That is the choice Blinkit and Amazon both present
 * when a basket straddles two fulfilment speeds, and it is the honest one here:
 * the alternative is silently splitting an order somebody wanted in one piece.
 *
 * WHAT IS NOT DECIDED HERE
 *
 * The express fee is a price, so it is the owner's. It comes from `settings`
 * and there is no fallback: unset means express cannot be offered, because
 * offering a paid service without a price is how a customer is charged a
 * number nobody chose. `available` is false with reason "no_price" until it is
 * set, which is a visible, explainable state rather than a free express
 * delivery nobody costed.
 *
 * Standard delivery keeps the fee it already had, from ServiceablePincode.
 */

export type ExpressUnavailableReason =
  | "not_serviceable"
  | "no_price"
  | "no_eligible_items"
  | "mixed_cart";

export interface ExpressOption {
  /** True only when every condition holds and a price exists. */
  available: boolean;
  /** Why not, when it is not. Rendered to the customer, so it must be specific. */
  reason?: ExpressUnavailableReason;
  /** What express costs for this delivery, in paise. Null when unavailable. */
  feePaise: number | null;
  /** Variant ids in the cart that can go express to this pincode. */
  eligibleVariantIds: string[];
  /** Variant ids that cannot, and so decide whether the cart is mixed. */
  ineligibleVariantIds: string[];
}

/** A cart line, reduced to what this decision needs. */
export interface ExpressCartLine {
  variantId: string;
  productId: string;
  /**
   * How the line travels (`speedClassOf`). A truck line is never on the express
   * run, whatever its listing says — checkout always passes these. Absent means
   * the caller did not say, and the listing alone decides (older callers).
   */
  categoryIsBulk?: boolean;
  deliverySpeed?: ShipmentSpeedClass | null;
}

const travelsByTruck = (l: ExpressCartLine) =>
  l.categoryIsBulk !== undefined && speedClassOf({ categoryIsBulk: l.categoryIsBulk, deliverySpeed: l.deliverySpeed }) === "scheduled";

/**
 * Which of these products may go express to this pincode.
 *
 * Both halves must agree: the product carries `expressEligible`, and a row
 * names this pincode. An eligible product with no pincode rows is eligible
 * nowhere, which is the correct reading of "we could, but we do not yet".
 */
export async function expressEligibleProductIds(
  productIds: string[],
  pincode: string
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();

  const rows = await db.productExpressPincode.findMany({
    where: {
      pincode,
      productId: { in: productIds },
      product: { expressEligible: true, status: "published" },
    },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

/** The express fee for one delivery, in paise. Null when the owner has not set one. */
export async function expressFeePaise(): Promise<number | null> {
  const raw = await readSetting(SETTING_KEYS.expressFeePaise);
  if (!raw) return null;

  /* Deliberately strict. A malformed setting is not a reason to fall back to a
     plausible number — the same rule the cashback rate follows. */
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve the express option for a cart against a delivery pincode.
 *
 * Never throws for an ordinary "no": an unserviceable pincode, an unpriced
 * express service and a cart with nothing eligible are all normal answers, and
 * the caller renders each differently.
 */
export async function resolveExpressOption(
  lines: ExpressCartLine[],
  pincode: string
): Promise<ExpressOption> {
  const none = (reason: ExpressUnavailableReason): ExpressOption => ({
    available: false,
    reason,
    feePaise: null,
    eligibleVariantIds: [],
    ineligibleVariantIds: lines.map((l) => l.variantId),
  });

  const svc = await checkServiceability(pincode);
  if (!svc.serviceable) return none("not_serviceable");

  const eligibleProducts = await expressEligibleProductIds(
    [...new Set(lines.map((l) => l.productId))],
    pincode
  );

  /* E7: the listing's express switch is not enough on its own. Listing lets any
     product be ticked, and a truck line goes on the truck (`planShipments`) —
     offering and charging the express run for it would promise a delivery the
     order is never sent on. */
  const onRun = (l: ExpressCartLine) => eligibleProducts.has(l.productId) && !travelsByTruck(l);
  const eligibleVariantIds = lines.filter(onRun).map((l) => l.variantId);
  const ineligibleVariantIds = lines.filter((l) => !onRun(l)).map((l) => l.variantId);

  if (eligibleVariantIds.length === 0) {
    return { ...none("no_eligible_items"), ineligibleVariantIds };
  }

  const fee = await expressFeePaise();
  if (fee === null) {
    return { ...none("no_price"), eligibleVariantIds, ineligibleVariantIds };
  }

  /* A mixed cart still *offers* express — on the eligible part. The customer
     chooses; this reports what is possible rather than deciding for them. The
     reason is carried so the checkout can say "2 of 3 items" instead of an
     unexplained partial delivery. */
  return {
    available: true,
    reason: ineligibleVariantIds.length > 0 ? "mixed_cart" : undefined,
    feePaise: fee,
    eligibleVariantIds,
    ineligibleVariantIds,
  };
}
