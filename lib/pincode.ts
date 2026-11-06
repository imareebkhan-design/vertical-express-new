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

/**
 * Any Indian pincode: six digits, not starting 0. Service areas are per city
 * now (15 Oct 2026), so the serviceability screen takes any pincode and the
 * operator chooses which city it belongs to. `JK_PINCODE` above still guards
 * the product express list, which is Srinagar-only.
 */
export const INDIA_PINCODE = /^[1-9]\d{5}$/;

/** Largest range accepted in one go — a typo like 110001-119999 is refused, not applied. */
export const MAX_PINCODE_RANGE = 200;

/**
 * Parse a typed list for the service-areas screen: pincodes separated by
 * spaces, commas or new lines, and inclusive ranges like `110001-110010`.
 */
export function parseServicePincodes(raw: string): PincodeList & { tooLarge: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const tooLarge: string[] = [];
  for (const token of raw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
    const range = /^(\d{6})-(\d{6})$/.exec(token);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (!INDIA_PINCODE.test(range[1]) || !INDIA_PINCODE.test(range[2]) || b < a) invalid.push(token);
      else if (b - a + 1 > MAX_PINCODE_RANGE) tooLarge.push(token);
      else for (let n = a; n <= b; n++) valid.push(String(n));
    } else if (INDIA_PINCODE.test(token)) valid.push(token);
    else invalid.push(token);
  }
  return { valid: [...new Set(valid)], invalid, tooLarge };
}
