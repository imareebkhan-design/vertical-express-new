"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/services/admin/authz";
import { recordCatalogueApproval, recordBatchApproval, type ApprovalInput, type BatchApprovalItem } from "@/lib/services/admin/catalogue-approval";
import { type ActionResult, fail, succeed } from "@/lib/validators";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record the signed-in admin's decision for ONE product. The approver is the session, never the payload. */
export async function adminRecordCatalogueApproval(input: ApprovalInput): Promise<ActionResult<{ public: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admins only");
  if (!UUID.test(String(input?.productId)) || !UUID.test(String(input?.imageId))) return fail("VALIDATION", "Unknown product or image");
  if (!/^[a-f0-9]{64}$/.test(String(input.expectedImageSha256)) || Number.isNaN(Date.parse(String(input.expectedProductUpdatedAt)))) {
    return fail("VALIDATION", "Reload the page and review again");
  }
  if (!["CONFIRMED", "REJECTED"].includes(input.identity)) return fail("VALIDATION", "Choose an identity decision");
  if (!["APPROVED_EXACT", "APPROVED_WITH_LIMITATION", "REJECTED"].includes(input.image)) return fail("VALIDATION", "Choose an image decision");
  const clip = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
  const r = await recordCatalogueApproval(admin.id, {
    productId: input.productId,
    imageId: input.imageId,
    expectedImageSha256: input.expectedImageSha256,
    expectedProductUpdatedAt: input.expectedProductUpdatedAt,
    identity: input.identity,
    image: input.image,
    severity: input.severity === "P2" || input.severity === "P3" ? input.severity : null,
    packDecision: clip(input.packDecision, 500),
    evidence: String(input.evidence ?? "").slice(0, 1000),
    limitations: clip(input.limitations, 1000),
  });
  if (!r.ok) return fail(r.code, r.message);
  revalidatePath("/admin/catalogue-approvals");
  return succeed({ public: r.public });
}

/** The signed-in admin approves several products at once (each recorded as its own decision). */
export async function adminRecordBatchApproval(input: {
  items: BatchApprovalItem[];
  evidence: string;
}): Promise<ActionResult<{ approved: string[]; failed: { productId: string; message: string }[] }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admins only");
  const items = Array.isArray(input?.items) ? input.items.slice(0, 50) : [];
  if (items.length === 0) return fail("VALIDATION", "Tick at least one product");
  for (const it of items) {
    if (!UUID.test(String(it?.productId)) || !UUID.test(String(it?.imageId))) return fail("VALIDATION", "Unknown product or image");
    if (!/^[a-f0-9]{64}$/.test(String(it.expectedImageSha256)) || Number.isNaN(Date.parse(String(it.expectedProductUpdatedAt)))) {
      return fail("VALIDATION", "Reload the page and review again");
    }
  }
  const r = await recordBatchApproval(
    admin.id,
    items.map((it) => ({ ...it, packDecision: it.packDecision == null ? null : String(it.packDecision).slice(0, 500) })),
    String(input.evidence ?? "").slice(0, 1000)
  );
  revalidatePath("/admin/catalogue-approvals");
  return succeed(r);
}
