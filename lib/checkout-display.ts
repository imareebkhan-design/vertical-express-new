import { formatPaise } from "@/lib/money";

/**
 * The delivery line of a checkout summary.
 *
 * The server reports a 0 delivery fee both when delivery is free and when the
 * pincode is not served at all (no fee because no delivery). Only
 * `serviceable` tells them apart, so a 0 is "FREE" only for a site we deliver
 * to. Shared by the desktop and phone checkouts so the two cannot drift.
 */
export function deliveryFeeLabel(
  totals: { serviceable: boolean; deliveryFeePaise: number } | null
): string {
  if (!totals || !totals.serviceable) return "—";
  return totals.deliveryFeePaise === 0 ? "FREE" : formatPaise(totals.deliveryFeePaise);
}
