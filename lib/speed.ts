/**
 * What we tell a customer about how fast something arrives.
 *
 * Pure, and deliberately outside the chip component. The rule is domain logic —
 * it decides whether a promise is made at all — and it could not be tested where
 * it was, because importing the component drags in lucide-react and React
 * context that the server-side test runner cannot load. A rule that governs a
 * delivery promise and cannot be tested is the wrong rule in the wrong place.
 *
 * Same reasoning as lib/link-policy.ts and lib/shipment-plan.ts: the decision
 * lives apart from the thing that renders it.
 */
export type SpeedClass = "express" | "scheduled" | "leadtime" | "seasonal";

/**
 * How fast this product actually moves.
 *
 * The category is the rule and the product is the exception. `Category.isBulk`
 * gets it right for most of the catalogue — every cement heavy, every switch
 * fast — and breaks at the edges: a 5 kg bag of white cement does not need a
 * truck, and a 40-piece box of tiles does.
 *
 * `override` is `Product.deliverySpeed`, set by whoever listed the product. Null
 * means "use the category", which is what almost every row should say — an
 * override is a decision somebody made, not a value that got inherited.
 */
export function speedClassFor(
  isBulk: boolean,
  override?: "express" | "scheduled" | null
): SpeedClass {
  if (override) return override;
  return isBulk ? "scheduled" : "express";
}

/**
 * The wording for a speed class.
 *
 * NO NUMBER UNLESS SOMEBODY SET ONE.
 *
 * `etaMinutes` used to default to 60, so eight call sites that passed nothing
 * rendered "60 min" — the unverified delivery claim (ISS-054), materialised at
 * render time rather than written anywhere. It survived every copy sweep
 * because it is not copy: grepping the pages for "60 minutes" finds nothing.
 *
 * A window is a promise and a promise belongs to the owner. It is set on
 * /admin/settings and flows in from serviceability data. Absent, this says what
 * is true — this one is fast — and stops.
 */
export function speedLabel(speed: SpeedClass, etaMinutes?: number | null): string {
  if (speed === "scheduled") return "Heavy — by truck";
  if (speed === "seasonal") return "Seasonal";

  if (etaMinutes === null || etaMinutes === undefined) {
    return speed === "express" ? "Fast" : "Lead time";
  }

  return `${etaMinutes} min`;
}

/**
 * Whether an order needs a truck.
 *
 * The vehicle is decided by the heaviest thing in the order, not by the
 * majority of its lines: one bag of cement among nine boxes of screws still
 * needs a truck. Counting that order as fast would understate the truck load,
 * which is the number the reporting chart exists to show rising through winter.
 *
 * Pure and separate from the reporting query because the failure it prevents —
 * a mixed order counted on both sides, or on the wrong one — cannot be shown
 * from seeded data that happens to contain no mixed orders.
 */
export function orderNeedsTruck(
  lines: { isBulk: boolean; override?: "express" | "scheduled" | null }[]
): boolean {
  return lines.some((l) => speedClassFor(l.isBulk, l.override) === "scheduled");
}
