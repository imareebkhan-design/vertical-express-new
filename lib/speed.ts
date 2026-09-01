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

/** Derives the speed class from the data the catalogue actually carries. */
export function speedClassFor(isBulk: boolean): SpeedClass {
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
