import { formatPaise } from "@/lib/money";
import { deliveryFeeLabel } from "@/lib/checkout-display";
import type { CheckoutTotals } from "@/lib/services/checkout";

export type SummaryTotals = Pick<
  CheckoutTotals,
  "subtotalPaise" | "taxPaise" | "discountPaise" | "deliveryFeePaise" | "totalPaise" | "serviceable"
>;

/**
 * The breakdown rows of a checkout summary — shared by the desktop and phone
 * checkouts so the two cannot disagree about arithmetic again.
 *
 * Read `computeTotals` carefully: `subtotalPaise` is the TAXABLE value (after
 * the coupon, excluding GST) and `totalPaise = subtotalPaise + taxPaise +
 * deliveryFeePaise`. Prices are GST-inclusive, so what a customer recognises as
 * the subtotal is the items at their shelf prices before the coupon:
 * `subtotalPaise + taxPaise + discountPaise` — exact, because the server takes
 * each line's taxable value as its inclusive price minus its extracted tax.
 *
 * So the rows read: Subtotal − Discount + Delivery = Total, with GST shown as
 * what it is — included in the subtotal, not added to it. Every figure comes
 * from the server's own totals; nothing is recomputed from client state.
 *
 * Renders `<div><dt/><dd/></div>` rows for the caller's `<dl>`.
 */
export function CheckoutSummaryLines({
  totals,
  variant,
}: {
  totals: SummaryTotals;
  variant: "desktop" | "phone";
}) {
  const phone = variant === "phone";
  const row = phone ? "flex justify-between text-ink/70" : "flex justify-between";
  const label = phone ? undefined : "text-neutral-500";
  const itemsPaise = totals.subtotalPaise + totals.taxPaise + totals.discountPaise;
  const delivery = deliveryFeeLabel(totals);

  return (
    <>
      <div className={row}>
        <dt className={label}>Subtotal</dt>
        <dd>{formatPaise(itemsPaise)}</dd>
      </div>
      {totals.discountPaise > 0 && (
        <div className={phone ? "flex justify-between text-ink" : "flex justify-between text-success"}>
          <dt>{phone ? "Coupon Discount" : "Discount"}</dt>
          <dd>-{formatPaise(totals.discountPaise)}</dd>
        </div>
      )}
      {totals.taxPaise > 0 && (
        <div className={row}>
          {/* Included in the subtotal, not added to it; and a blended rate
              over mixed items (cement 28%, most else 18%) is nobody's rate. */}
          <dt className={label}>GST (included)</dt>
          <dd>{formatPaise(totals.taxPaise)}</dd>
        </div>
      )}
      <div className={row}>
        <dt className={label}>{phone ? "Delivery Charges" : "Delivery"}</dt>
        <dd className={delivery === "FREE" ? (phone ? "font-bold text-ink" : "text-success") : ""}>
          {delivery}
        </dd>
      </div>
    </>
  );
}
