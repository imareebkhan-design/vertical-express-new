/**
 * Customer-facing order number: `VE-<year>-<base36 ms timestamp><4 hex>`.
 *
 * The 4-hex suffix comes from a cryptographic source (`crypto.randomInt` by
 * default), not `Math.random`, so the number cannot be worked out from the time
 * an order was placed. The number is a reference, not an access token: every
 * read of an order is still scoped to its owner. Both inputs are injectable so
 * the format and the randomness source can be tested.
 */
import { randomInt as cryptoRandomInt } from "node:crypto";

export function generateOrderNumber(
  now: Date = new Date(),
  randomInt: (min: number, max: number) => number = cryptoRandomInt
): string {
  const year = now.getFullYear();
  const ts = now.getTime().toString(36).toUpperCase();
  const rand = randomInt(0, 0x10000).toString(16).toUpperCase().padStart(4, "0");
  return `VE-${year}-${ts}${rand}`;
}
