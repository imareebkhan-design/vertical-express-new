import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyIdToken } from "@/lib/auth/firebase-admin";
import { resolveUserFromToken } from "@/lib/auth/current-user";

/**
 * Who is calling `/api/v1`?
 *
 * THE PROBLEM THIS SOLVES
 *
 * Every existing surface answers that question with `getAuthUserId()`, which
 * reads the `__session` httpOnly cookie. That works for the browser and cannot
 * work for the native app: React Native has no cookie jar, and an httpOnly
 * cookie is by definition unreadable by the client that would have to resend
 * it. The app holds something else — a Firebase ID token, refreshed by the
 * Firebase SDK on the device — and the natural place for it is the
 * `Authorization: Bearer` header.
 *
 * So this is a second *transport* for identity, deliberately, and it is the
 * only thing about it that is second. Verification is the same
 * `verifyIdToken()` the rest of the application would use, checking Google's
 * signing keys, the issuer, the audience, the expiry and revocation. Resolution
 * to a local row is the same `resolveUserFromToken()` the cookie path uses, so
 * account linking, the takeover guard in `link-policy.ts` and the
 * identity-conflict handling all apply here untouched and cannot drift.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 *   - It does not mint a session cookie. A cookie is a browser concept and an
 *     app holding one would gain nothing.
 *   - It does not accept a session cookie as a fallback. A route that takes
 *     either is a route where a cross-site request can act as the customer;
 *     `app/api/auth/session/route.ts` explains that the current CSRF protection
 *     is structural — SameSite=Lax and no CORS — and a bearer-only API keeps it
 *     that way by having nothing ambient to abuse.
 *   - It does not replace `getAuthUserId()` anywhere. The web is untouched.
 *
 * ON SECRETS. Nothing here is readable by the app. The device sends a token it
 * already has; the server holds the service-account credentials that verify it.
 * `FIREBASE_PRIVATE_KEY` never leaves the server, and an `EXPO_PUBLIC_*`
 * variable could not carry it even if someone tried.
 */

/** Verifies a raw ID token. Injected in tests; production has exactly one. */
export type TokenVerifier = (idToken: string) => Promise<DecodedIdToken | null>;

/** Longer than a Firebase ID token ever is; a cheap ceiling before any work. */
const MAX_TOKEN_LENGTH = 4096;

export type ApiIdentity =
  | { authenticated: true; userId: string }
  | { authenticated: false; reason: "no_token" | "bad_token" | "no_account" };

/** Pull the token out of `Authorization: Bearer <token>`, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const token = match[1].trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

/**
 * Resolve the caller to a local user id.
 *
 * The three failures are distinguished here and deliberately collapsed into one
 * 401 at the edge: telling an unauthenticated caller whether their token was
 * absent, forged or merely unknown to us narrows the search for whoever is
 * guessing. The distinction is kept for logs and tests, not for the response.
 *
 * `verify` exists so the route can be driven in a test without a Firebase
 * service account. Production passes nothing and gets the real verifier; there
 * is exactly one call site and `cart-api.test.ts` asserts it stays that way.
 */
export async function resolveApiIdentity(
  request: Request,
  verify: TokenVerifier = verifyIdToken
): Promise<ApiIdentity> {
  const token = bearerToken(request);
  if (!token) return { authenticated: false, reason: "no_token" };

  const decoded = await verify(token);
  if (!decoded) return { authenticated: false, reason: "bad_token" };

  const userId = await resolveUserFromToken(decoded);
  if (!userId) return { authenticated: false, reason: "no_account" };

  return { authenticated: true, userId };
}
