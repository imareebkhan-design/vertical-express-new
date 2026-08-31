import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

/**
 * The Firebase Admin app, used only to verify ID tokens server-side.
 *
 * Why the Admin SDK rather than decoding the JWT ourselves: verification has to
 * check the signature against Google's rotating public keys, the issuer, the
 * audience and the expiry. Getting any one of those wrong turns "is this person
 * signed in" into "does this string look about right", which is the whole ball
 * game. The SDK does it correctly and caches the keys.
 *
 * Credentials come from a service account. There is no fallback to an
 * unauthenticated client: a token verifier that cannot verify must fail loudly,
 * not wave requests through — the same rule the payment gateway follows
 * (ISS-002).
 */
let cached: App | null = null;

function adminApp(): App {
  if (cached) return cached;
  if (getApps().length > 0) {
    cached = getApp();
    return cached;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  /* Newlines survive a .env round trip as the two characters \n, so they have
     to be turned back into real newlines or the PEM parse fails with an error
     that says nothing about newlines. */
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY. Refusing to verify " +
        "tokens without credentials."
    );
  }

  cached = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return cached;
}

/**
 * Verifies a Firebase ID token and returns its claims.
 *
 * `checkRevoked` is on: a session that has been revoked — password changed,
 * account disabled, admin action — stops working on the next request rather
 * than lingering for the remaining life of the token.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
  try {
    return await getAuth(adminApp()).verifyIdToken(idToken, true);
  } catch {
    /* A bad, expired or revoked token is a signed-out request, not an error to
       propagate. The reason is deliberately not surfaced to the caller — it
       would tell an attacker which part of the token they got wrong. */
    return null;
  }
}

export { adminApp };
