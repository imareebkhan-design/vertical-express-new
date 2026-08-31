import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Session handling and route protection.
 *
 * Clerk replaces the Supabase session refresh that used to run here. What has
 * not changed is the request-id header: every request gets one, it is threaded
 * into the structured logs, and it is how a customer's report is traced back to
 * a specific server action. That must keep working regardless of who issues
 * sessions.
 *
 * /admin is also gated server-side in its own layout against the admin
 * allowlist. This is defence in depth — an unauthenticated request is bounced
 * before any admin code runs.
 */
const isProtected = createRouteMatcher(["/account(.*)", "/checkout(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  if (isProtected(request)) {
    const { userId } = await auth();
    if (!userId) {
      /* Carry the intended destination so sign-in returns the customer to the
         checkout they were in the middle of, not to the home page. */
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
});

export const config = {
  matcher: [
    // Skip static assets and Next internals; run on pages and server actions.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path — must be matched for the handshake to work.
    "/__clerk/:path*",
  ],
};
