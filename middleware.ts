import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";

/**
 * Route protection and the request-id header.
 *
 * This checks only for the *presence* of the session cookie, not its validity.
 * That is deliberate: verifying a Firebase session cookie needs the Admin SDK,
 * which does not run on the Edge runtime, and forcing this file onto Node would
 * put a cold start in front of every request including static assets.
 *
 * Presence is enough for what middleware is for — redirecting a signed-out
 * visitor to sign-in instead of showing them an empty account page. It is NOT
 * the security boundary. Every protected page and every server action resolves
 * identity through getAuthUserId(), which verifies the cookie properly and
 * returns null for a forged one. A fabricated cookie gets you a redirect to a
 * page that then treats you as signed out.
 *
 * /admin is additionally gated in its own layout against the admin allowlist.
 */
const PROTECTED = [/^\/account(\/|$)/, /^\/checkout(\/|$)/, /^\/admin(\/|$)/];

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const { pathname } = request.nextUrl;
  if (PROTECTED.some((p) => p.test(pathname)) && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    /* Carry the destination so sign-in returns the customer to the checkout
       they were in the middle of, not to the home page. */
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
    "/(api|trpc)(.*)",
  ],
};
