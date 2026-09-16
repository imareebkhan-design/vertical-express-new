import { NextResponse } from "next/server";
import type { ActionErrorCode, ActionResult } from "@/lib/validators";

/**
 * The JSON envelope every `/api/v1` route answers with.
 *
 * WHY THE SAME SHAPE AS ActionResult
 *
 * The web already has one answer to "did that work" — the `ActionResult`
 * discriminated union in `lib/validators`, returned by all 44 Server Actions
 * and read by every component that calls one. Inventing a second shape for the
 * native app would mean every screen ported from the web has to be rewritten
 * around a different error contract, and every new rule would have to be
 * written twice.
 *
 * So the wire format IS `ActionResult`, serialised. A component that today
 * reads `res.ok` and `res.error.code` reads the same thing tomorrow whether the
 * value came from a Server Action or from `fetch`.
 *
 * What the HTTP layer adds on top is the status code, because a mobile client
 * legitimately wants to branch on 401 before it has parsed a body — to refresh
 * a token and retry, for instance.
 */

/**
 * The status each error code answers with.
 *
 * Exhaustive over `ActionErrorCode` by construction: `Record` makes a missing
 * key a type error, so adding a code to the union without deciding its status
 * fails `tsc` rather than silently returning 500.
 */
export const STATUS_FOR_CODE: Record<ActionErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  /* 409, not 400. The request was well-formed and the customer is allowed to
     make it; it collides with the current state of the warehouse, and it may
     succeed unchanged an hour from now. That is precisely Conflict, and it
     tells a client "retry later" where 400 says "you sent rubbish". */
  OUT_OF_STOCK: 409,
  ONLY_X_LEFT: 409,
  /* 422: the values parse, the combination is refused. */
  PINCODE_UNSERVICEABLE: 422,
  COUPON_INVALID: 422,
  /* 402 Payment Required. Worth knowing when reading logs: Vercel's own edge
     returns 402 with an `x-vercel-error: DEPLOYMENT_DISABLED` header when a
     project is suspended for billing, which is a different thing entirely and
     never reaches this code. The header tells them apart. */
  PAYMENT_FAILED: 402,
  RATE_LIMITED: 429,
  CONFLICT: 409,
};

/** A successful response. 200 unless the caller says otherwise. */
export function apiOk<T>(data: T, status = 200): NextResponse {
  const body: ActionResult<T> = { ok: true, data };
  return NextResponse.json(body, { status });
}

/**
 * A structured failure.
 *
 * `metadata` carries whatever the caller needs to act — the available quantity
 * on a stock refusal, for instance. It must never carry anything the customer
 * may not see: this body goes to a device.
 */
export function apiFail(
  code: ActionErrorCode,
  message: string,
  options?: { field?: string; metadata?: unknown; headers?: Record<string, string> }
): NextResponse {
  const body: ActionResult<never> = {
    ok: false,
    error: { code, message, field: options?.field, metadata: options?.metadata },
  };
  return NextResponse.json(body, {
    status: STATUS_FOR_CODE[code],
    headers: options?.headers,
  });
}

/** Send an `ActionResult` produced elsewhere, mapping its code to a status. */
export function apiResult<T>(result: ActionResult<T>): NextResponse {
  if (result.ok) return apiOk(result.data);
  return apiFail(result.error.code, result.error.message, {
    field: result.error.field,
    metadata: result.error.metadata,
  });
}
