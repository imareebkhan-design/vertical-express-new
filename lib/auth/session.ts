import "server-only";
import { cookies } from "next/headers";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { adminApp } from "@/lib/auth/firebase-admin";

/**
 * Server-side sessions for Firebase Auth.
 *
 * Firebase ID tokens live for an hour and are refreshed in the browser, which
 * suits a client-rendered app and suits a server-rendered one badly: a Server
 * Component cannot ask the SDK to refresh. Firebase's answer is a session
 * cookie — minted from an ID token by the Admin SDK, `httpOnly`, and verifiable
 * on the server with no round trip to Google.
 *
 * That is what makes `getAuthUserId()` work unchanged in Server Components,
 * Server Actions and route handlers, which is the whole point of keeping that
 * abstraction through a third identity provider.
 */
import { SESSION_COOKIE as COOKIE, SESSION_MAX_AGE_MS as MAX_AGE_MS } from "@/lib/auth/session-cookie";

/**
 * Exchanges a freshly minted ID token for a session cookie.
 *
 * The ID token is verified first, and only if it was issued in the last five
 * minutes. Firebase requires this: it means a stolen long-lived ID token cannot
 * be upgraded into a two-week session.
 */
export async function createSessionCookie(
  idToken: string
): Promise<{ cookie: string; token: DecodedIdToken } | null> {
  const auth = getAuth(adminApp());
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    const issuedMsAgo = Date.now() - decoded.auth_time * 1000;
    if (issuedMsAgo > 5 * 60 * 1000) return null;

    /* The verified identity comes back too: sign-in merges the guest cart into
       this customer's (E8), and must not re-read an identity it just verified. */
    return { cookie: await auth.createSessionCookie(idToken, { expiresIn: MAX_AGE_MS }), token: decoded };
  } catch {
    return null;
  }
}

/** Reads and verifies the session cookie. Null for any signed-out request. */
export async function readSession(): Promise<DecodedIdToken | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value) return null;

  try {
    /* checkRevoked: a disabled account or a password change invalidates the
       session on the next request rather than in two weeks' time. */
    return await getAuth(adminApp()).verifySessionCookie(value, true);
  } catch {
    return null;
  }
}

/**
 * Whether the session cookie is signed by Firebase and unexpired — checked
 * locally, WITHOUT the revocation round trip `readSession` makes.
 *
 * For one purpose only: sending a visitor whose cookie is plainly dead (expired,
 * malformed, forged) to sign-in *early*, before a page starts streaming. It may
 * only ever turn somebody away. It must never be used to let anybody in — a
 * revoked session passes this and is refused by `readSession` as before.
 */
export async function hasPlausibleSession(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  try {
    await getAuth(adminApp()).verifySessionCookie(value, false);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revokes every session this customer has, on every device.
 *
 * Clearing the cookie only removes it from the browser doing the clearing. The
 * cookie itself stays cryptographically valid for its full fourteen days, so a
 * copied one survives an ordinary sign-out — which is exactly the case where
 * signing out is the thing you urgently want to work.
 *
 * `revokeRefreshTokens` moves the account's `tokensValidAfterTime` to now.
 * `readSession` already verifies with `checkRevoked: true`, which compares a
 * cookie's issue time against that stamp, so every outstanding session — this
 * browser, the old laptop, the lost phone — stops resolving on its next
 * request. No extra bookkeeping, and nothing to keep in sync.
 *
 * Deliberately NOT what ordinary sign-out does: signing out on a phone should
 * not sign the same person out on their laptop.
 */
export async function revokeAllSessions(uid: string): Promise<void> {
  await getAuth(adminApp()).revokeRefreshTokens(uid);
}
