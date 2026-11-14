/**
 * Which payment row is "the order's payment", and which are extra captures.
 *
 * An order normally has one payment row: created when the order is placed and
 * reused by every retry. A second row appears only when a different payment is
 * captured for an order that is already paid (ISS-075) — money that needs a
 * refund, recorded rather than dropped. A reader that takes the newest row
 * would then show the refund-bound payment as the order's own and hide the one
 * that actually paid for it. Pure; safe on server and client.
 */
export function splitOrderPayments<P extends { id: string; status: string; createdAt: Date }>(
  payments: readonly P[]
): { primary: P | null; secondCaptures: P[] } {
  if (payments.length === 0) return { primary: null, secondCaptures: [] };
  const byAge = [...payments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const primary = byAge[0];
  return { primary, secondCaptures: byAge.slice(1).filter((p) => p.status === "captured") };
}
