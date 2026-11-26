import "server-only";
import type { NextResponse } from "next/server";
import { withApiUser, readJson, type ApiDeps } from "@/lib/api/authed";
import { apiFail, apiOk } from "@/lib/api/response";
import { bearerToken, type TokenVerifier } from "@/lib/auth/api-identity";
import { verifyIdToken, verifyIdTokenAllowingRevoked } from "@/lib/auth/firebase-admin";
import { isDeletedUid } from "@/lib/auth/current-user";
import { rateLimit, getClientIp } from "@/lib/services/rate-limit";
import { runWithContext } from "@/lib/observability";
import {
  deleteAccount,
  getDeletionStatus,
  type FirebaseAccountOps,
} from "@/lib/services/account-deletion";

/**
 * GET  /api/v1/me/deletion  — may this account be deleted, and if not, why not;
 *                             plus what is deleted and what is kept.
 * POST /api/v1/me/deletion  { confirm: true } — delete it.
 *
 * Rules: lib/services/account-deletion.ts, shared with the website.
 */

export async function handleGetDeletionStatus(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "me-del-get", deps, async ({ userId }) => {
    const status = await getDeletionStatus(userId);
    if (!status) return apiFail("NOT_FOUND", "Account not found");
    return apiOk(status);
  });
}

/** Deletion is rare and irreversible; a tight ceiling costs nobody anything. */
const DELETE_LIMIT = { hits: 10, windowMs: 60 * 1000 };

export const PENDING_MESSAGE =
  "Your details have been removed, but we couldn't finish closing your sign-in. We'll keep retrying automatically — or tap Try again. Your account isn't fully deleted until this finishes.";

export async function handleDeleteAccount(
  request: Request,
  deps: { verify?: TokenVerifier; verifyAllowingRevoked?: TokenVerifier; firebase?: FirebaseAccountOps } = {}
): Promise<NextResponse> {
  const limit = await rateLimit(`api-me-del:${getClientIp(request)}`, DELETE_LIMIT.hits, DELETE_LIMIT.windowMs);
  if (!limit.allowed) {
    return apiFail("RATE_LIMITED", "Too many requests. Try again shortly.", {
      headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  const body = (await readJson(request)) as { confirm?: unknown } | null;
  if (body?.confirm !== true) return apiFail("VALIDATION", "Confirm that you want to delete your account", { field: "confirm" });

  const token = bearerToken(request);
  if (!token) return apiFail("UNAUTHENTICATED", "Sign in to continue");

  /* A live account needs a fully valid token. A revoked one is accepted only to
     finish a deletion already marked pending (see verifyIdTokenAllowingRevoked). */
  let decoded = await (deps.verify ?? verifyIdToken)(token);
  if (!decoded) {
    const revokedOk = await (deps.verifyAllowingRevoked ?? verifyIdTokenAllowingRevoked)(token);
    if (revokedOk && (await isDeletedUid(revokedOk.uid))) decoded = revokedOk;
  }
  if (!decoded) return apiFail("UNAUTHENTICATED", "Sign in to continue");
  const uid = decoded.uid;

  const requestId = request.headers.get("x-request-id") || `api-${crypto.randomUUID()}`;
  return runWithContext({ requestId }, async () => {
    const result = await deleteAccount(uid, { firebase: deps.firebase });
    switch (result.status) {
      case "deleted":
        return apiOk({ status: "deleted" as const });
      case "blocked":
        return apiFail("CONFLICT", "This account can't be deleted yet.", { metadata: { blockers: result.blockers } });
      case "pending":
        return apiFail("UNAVAILABLE", PENDING_MESSAGE, { metadata: { status: "pending" } });
      case "not_found":
        return apiFail("NOT_FOUND", "Account not found");
    }
  });
}
