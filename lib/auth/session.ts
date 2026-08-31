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
export async function createSessionCookie(idToken: string): Promise<string | null> {
  const auth = getAuth(adminApp());
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    const issuedMsAgo = Date.now() - decoded.auth_time * 1000;
    if (issuedMsAgo > 5 * 60 * 1000) return null;

    return await auth.createSessionCookie(idToken, { expiresIn: MAX_AGE_MS });
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

