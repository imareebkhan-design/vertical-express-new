/**
 * Pincode parsing, shared by the listing form and the action behind it.
 *
 * This lived in `actions/listing.ts` as a plain exported function, which
 * **fails the production build**: that file carries "use server", and every
 * export from a Server Actions file must be an async function. Turbopack
 * rejects it with "Server Actions must be async functions."
 *
 * Nothing local caught it. `tsc`, `lint` and the test suite all passed — it is
 * a Next.js constraint rather than a type error — and the dev server compiles
 * routes lazily, so the only route that imports it (`/admin/listing`, behind
 * the owner's Google sign-in) was never loaded. It would have surfaced first on
 * Vercel, as a failed deploy.
 *
 * Pure and client-safe on purpose: the listing form runs the same check while
 * you type, and it had its own copy of the regex. One rule, one place.
 */

/**
 * Six digits beginning 19 — Jammu & Kashmir.
 *
 * The shop delivers in Srinagar only. A 110054 typed out of habit is a Delhi
 * pincode, and accepting it would put a row in `product_express_pincodes`
 * promising sixty-minute delivery to a city we do not serve. The serviceability
 * CSV import applies the same rule for the same reason.
 */
export const JK_PINCODE = /^19\d{4}$/;

export interface PincodeList {
  /** Usable, de-duplicated, in the order first seen. */
  valid: string[];
  /** Everything rejected, kept verbatim so the message can quote it back. */
  invalid: string[];
}

/** Split a typed pincode list into the ones we can use and the ones we cannot. */
export function parsePincodeList(raw: string): PincodeList {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const token of raw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
    if (JK_PINCODE.test(token)) valid.push(token);
    else invalid.push(token);
  }
  return { valid: [...new Set(valid)], invalid };
}
