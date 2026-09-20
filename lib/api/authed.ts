import "server-only";
import type { NextResponse } from "next/server";
import { resolveApiIdentity, type TokenVerifier } from "@/lib/auth/api-identity";
import { rateLimit, getClientIp } from "@/lib/services/rate-limit";
import { apiFail } from "@/lib/api/response";
import { runWithContext } from "@/lib/observability";

/**
 * The preamble every authenticated `/api/v1` route repeats: rate-limit, resolve
 * the bearer token to a local user, open a request context.
 *
 * It is `handleAddCartItem`'s opening moves, lifted so the other routes do not
 * each carry a copy. The order is the same and matters for the same reason: the
 * limiter runs before identity, because verifying a token costs a signature
 * check and a database read and an unauthenticated caller is exactly who would
 * want to spend those for us.
 *
 * `verify` exists only so tests can drive a handler without a Firebase service
 * account. Route files pass nothing.
 */
export interface ApiDeps {
  verify?: TokenVerifier;
}

export interface ApiCtx {
  userId: string;
  requestId: string;
}

/** Per-IP ceiling for reads and writes alike. Generous on purpose. */
const LIMIT = { hits: 240, windowMs: 60 * 1000 };

export async function withApiUser(
  request: Request,
  bucket: string,
  deps: ApiDeps,
  run: (ctx: ApiCtx) => Promise<NextResponse>
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") || `api-${crypto.randomUUID()}`;

  const limit = await rateLimit(`api-${bucket}:${getClientIp(request)}`, LIMIT.hits, LIMIT.windowMs);
  if (!limit.allowed) {
    return apiFail("RATE_LIMITED", "Too many requests. Try again shortly.", {
      headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  const identity = await resolveApiIdentity(request, deps.verify);
  if (!identity.authenticated) {
    return apiFail("UNAUTHENTICATED", "Sign in to continue");
  }

  return runWithContext({ requestId, userId: identity.userId }, () =>
    run({ userId: identity.userId, requestId })
  );
}

/** Rate-limit only, for the public catalogue reads. */
export async function withApiPublic(
  request: Request,
  bucket: string,
  run: () => Promise<NextResponse>
): Promise<NextResponse> {
  const limit = await rateLimit(`api-${bucket}:${getClientIp(request)}`, LIMIT.hits, LIMIT.windowMs);
  if (!limit.allowed) {
    return apiFail("RATE_LIMITED", "Too many requests. Try again shortly.", {
      headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }
  return run();
}

/** A JSON body, or null when it is absent or malformed. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
