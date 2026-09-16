import "server-only";
import type { NextResponse } from "next/server";
import { addItem, getCartSummary } from "@/lib/services/cart";
import { cartItemInputSchema } from "@/lib/validators";
import { classifyCartError } from "@/lib/cart-errors";
import { resolveApiIdentity, type TokenVerifier } from "@/lib/auth/api-identity";
import { rateLimit, getClientIp } from "@/lib/services/rate-limit";
import { apiFail, apiOk, apiResult } from "@/lib/api/response";
import { runWithContext, trackEvent, MetricsTracker, captureException } from "@/lib/observability";

/**
 * POST /api/v1/cart/items — the first HTTP door onto existing business logic.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The storefront performs this operation through `addToCart` in
 * `actions/cart.ts`, a Server Action. A Server Action is a React Server
 * Components transport, not an endpoint: it is invoked by the framework with an
 * opaque action id and an RSC-encoded body, and there is no supported way for a
 * React Native client to call one. The application has 44 of them and 6 HTTP
 * routes, and that ratio — not the UI, not the styling — is what stands between
 * the Expo app and real data.
 *
 * This is the first of the 44 to get an HTTP equivalent, chosen because it
 * exercises the whole stack end to end (authentication, validation, a
 * database write, a business refusal with numbers in it) while touching nothing
 * irreversible.
 *
 * WHAT IT IS NOT
 *
 * It is not a reimplementation. The stock rules, the tier pricing, the
 * warehouse resolution and the free-delivery meter all stay in
 * `lib/services/cart.ts`, and the classification of a refusal stays in
 * `lib/cart-errors.ts`, shared with the Server Action. If this file ever starts
 * deciding what the customer may buy, the migration has gone wrong.
 *
 * ON GUEST CARTS. The web lets a signed-out visitor hold a cart, keyed by an
 * anonymous id in an httpOnly cookie. That mechanism cannot cross to the app —
 * see `lib/auth/api-identity.ts` — and inventing a device-scoped guest identity
 * is a design decision with its own privacy and merge questions, not something
 * to slip into a proof of architecture. So this endpoint requires a signed-in
 * customer and says so with a 401. Guest carts are Stage 2B's problem, named
 * rather than quietly dropped.
 */

/** Per-IP ceiling. Generous: a customer tapping "add" repeatedly is normal. */
const RATE_LIMIT = { hits: 120, windowMs: 60 * 1000 };

/** Injected only by tests. Production supplies nothing and gets the real one. */
export interface AddCartItemDeps {
  verify?: TokenVerifier;
}

export async function handleAddCartItem(
  request: Request,
  deps: AddCartItemDeps = {}
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") || `api-${crypto.randomUUID()}`;

  /* Before identity, because verifying a token costs a network-cached
     signature check and a database read, and an unauthenticated caller is
     exactly who would want to spend those for us. Fails open, like the other
     CPU-guarding buckets: a limiter outage must not close the shop. */
  const limit = await rateLimit(`api-cart-add:${getClientIp(request)}`, RATE_LIMIT.hits, RATE_LIMIT.windowMs);
  if (!limit.allowed) {
    return apiFail("RATE_LIMITED", "Too many requests. Try again shortly.", {
      headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  const identity = await resolveApiIdentity(request, deps.verify);
  if (!identity.authenticated) {
    /* One message for all three reasons — absent, forged, unknown. Naming which
       one tells whoever is guessing which part to fix. */
    return apiFail("UNAUTHENTICATED", "Sign in to add items to your cart");
  }

  const userId = identity.userId;

  return runWithContext({ requestId, userId }, async () => {
    const metric = new MetricsTracker("cart-service");

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiFail("VALIDATION", "Expected a JSON body");
    }

    /* The same schema the Server Action validates against, so the two surfaces
       cannot disagree about what a valid item is. */
    const parsed = cartItemInputSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return apiFail("VALIDATION", "Invalid item", {
        field: first?.path.join(".") || undefined,
        /* Field-level detail so a client can mark the offending input rather
           than showing one opaque message. Zod issues carry no user data. */
        metadata: { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      });
    }

    const { variantId, qty } = parsed.data;

    try {
      await addItem(userId, null, variantId, qty);
    } catch (error: unknown) {
      captureException(error, { variantId, qty });
      /* Shared with `addToCart`. A stock refusal keeps its code and its
         numbers; anything else becomes NOT_FOUND. */
      return apiResult(classifyCartError(error, qty));
    }

    trackEvent("add_to_cart", { variantId, qty, surface: "api" });
    const summary = await getCartSummary(userId, null);
    metric.end("add_to_cart_success");

    /* 200, not 201. The addressable resource is the cart, which already
       existed and is returned whole; no new URL is created for the caller to
       follow, and the client needs the recomputed totals in the same round
       trip — on a degrading 4G connection in Srinagar a second request to read
       back the cart is the thing that makes the button feel broken. */
    return apiOk(summary);
  });
}
