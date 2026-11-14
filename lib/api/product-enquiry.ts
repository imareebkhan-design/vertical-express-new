import "server-only";
import type { NextResponse } from "next/server";
import { apiFail, apiOk } from "@/lib/api/response";
import { readJson, type ApiDeps } from "@/lib/api/authed";
import { resolveApiIdentity } from "@/lib/auth/api-identity";
import { getClientIp } from "@/lib/services/rate-limit";
import { db } from "@/lib/db";
import { submitProductEnquiry } from "@/lib/services/product-enquiry-submit";

/**
 * POST /api/v1/products/[slug]/enquiry — the Expo app's "Enquire about this
 * product". Same service as the web action. Sign-in optional: a bearer token
 * links the enquiry to the user; an invalid token is ignored (never trusted).
 */
export async function handleProductEnquiry(request: Request, slug: string, deps: ApiDeps = {}): Promise<NextResponse> {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return apiFail("VALIDATION", "Send the enquiry as JSON");

  const product = await db.product.findUnique({ where: { slug }, select: { id: true } });
  if (!product) return apiFail("NOT_FOUND", "This product is not available for enquiries");

  const identity = await resolveApiIdentity(request, deps.verify);
  const r = await submitProductEnquiry(
    { ...(body as Record<string, unknown>), productId: product.id },
    { ip: getClientIp(request), userId: identity.authenticated ? identity.userId : null }
  );
  if (!r.ok) return apiFail(r.code, r.message);
  return apiOk({ enquiryNo: r.enquiryNo }, 201);
}
