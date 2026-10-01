import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, readSession, revokeAllSessions } from "@/lib/auth/session";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/session-cookie";
import { rateLimit } from "@/lib/services/rate-limit";
import { completeSignInCart, GUEST_CART_COOKIE } from "@/lib/services/cart-merge";
import { cookies } from "next/headers";
import { log } from "@/lib/observability";

/**
 * Exchanges a Firebase ID token for an httpOnly session cookie, and clears it
 * on sign-out.
 *
 * The browser holds the ID token; the server holds the session. Nothing here
 * trusts the client beyond the token itself, which is verified against
 * Firebase's signing keys before a cookie is issued — a forged or expired token
 * produces no session.
 *
 * The cookie is httpOnly so client script cannot read it, which is what stops a
 * cross-site script from lifting a two-week session.
 *
 * ON CSRF. There is no CSRF token, and it would add nothing. The cookie is
 * SameSite=Lax, and this route sends no CORS headers — so a cross-origin POST
 * of `application/json` fails its preflight and never reaches the handler. The
 * protection is structural rather than a shared secret, which is worth knowing
 * if anyone ever adds permissive CORS here: that single change would open
 * login-CSRF, where an attacker signs a victim into the attacker's account.
 */
const bodySchema = z.object({ idToken: z.string().min(1).max(4096) });

export async function POST(request: Request) {
  /**
   * Token verification is cheap but not free, and this route is unauthenticated
   * by definition — anyone can call it. The bucket is per-IP because there is
   * no identity to key on until the token verifies.
   *
   * Fails OPEN, unlike the OTP bucket in DEC-016. That bucket guards spending:
   * each send costs money and reaches somebody's handset, so refusing when the
   * limiter is down is the safe answer. This one guards CPU. Refusing here
   * while the limiter is unreachable would lock every customer out of signing
   * in to protect nothing that matters.
   */
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limit = await rateLimit(`session-exchange:${ip}`, 30, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const session = await createSessionCookie(parsed.data.idToken);
  if (!session) {
    /* Deliberately unspecific: distinguishing "expired" from "forged" from
       "issued too long ago" tells an attacker which part to fix. */
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  /* E8: what the customer put in the basket before signing in joins their cart.
     Never blocks sign-in — a failed merge changes nothing, keeps the guest
     cookie, and the next cart request retries (actions/cart.ts). */
  const anonId = (await cookies()).get(GUEST_CART_COOKIE)?.value ?? null;
  const merge = await completeSignInCart(session.token, anonId);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
  if (merge.clearCookie) {
    response.cookies.set(GUEST_CART_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
  return response;
}

/**
 * Sign-out. `?scope=all` additionally revokes every session on every device.
 *
 * Plain sign-out clears this browser's cookie and nothing else — signing out on
 * a phone should not sign the same person out on their laptop. But that leaves
 * the cookie itself valid for its full fourteen days, so a copied one survives.
 * `scope=all` closes that by revoking the Firebase refresh tokens, which makes
 * `readSession`'s `checkRevoked` reject every outstanding cookie.
 *
 * Revocation needs a valid session to identify whose tokens to revoke. A caller
 * without one still gets the cookie cleared and a 200 — there is nothing to
 * revoke, and reporting the difference would tell an unauthenticated caller
 * whether a session existed.
 */
export async function DELETE(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");

  if (scope === "all") {
    const token = await readSession();
    if (token) {
      try {
        await revokeAllSessions(token.uid);
      } catch (err) {
        /* Clearing this browser still happens below. Failing the whole request
           would leave the customer signed in here as well as everywhere else,
           which is the worse of the two outcomes. */
        log("ERROR", {
          service: "auth-service",
          event: "revoke_all_sessions_failed",
          metadata: { uid: token.uid, error: err instanceof Error ? err.message : "unknown" },
        });
      }
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
