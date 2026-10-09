import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma, ProductEnquiryStatus } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { publicProductWhere } from "@/lib/catalog-policy";

/**
 * Product enquiries — "Enquire about this product" on catalog-only listings.
 *
 * A catalog-only product has no price to sell from, so the customer's only next
 * step is to ask. The enquiry lands in the admin queue (app/admin/enquiries).
 * No email/WhatsApp notification is sent: no business contact detail or
 * notification policy is confirmed (owner decision, 9 Oct 2026).
 *
 * The product is re-read here, never trusted from the client: title and brand
 * are snapshots of the database row, and an enquiry is refused for anything
 * the storefront would not show as catalog-only right now.
 */

/** Products a customer may enquire about: exactly the public catalog-only set
 *  (lib/catalog-policy.ts — recorded identity + primary photo approval, active taxonomy). */
export function enquirableProductWhere(): Prisma.ProductWhereInput {
  return { AND: [publicProductWhere(), { status: "catalog_only" }] };
}

/** A double tap or a resubmitted form within this window returns the first enquiry. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export const ENQUIRY_STATUSES = ["new", "contacted", "quoted", "closed", "spam"] as const satisfies readonly ProductEnquiryStatus[];

export interface CreateProductEnquiryInput {
  productId: string;
  name: string;
  phone: string;
  quantity?: string | null;
  message?: string | null;
  userId?: string | null;
}

export type CreateProductEnquiryResult =
  | { ok: true; enquiryNo: string; duplicate: boolean }
  | { ok: false; reason: "NOT_ENQUIRABLE" };

function newEnquiryNo(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `ENQ-${ymd}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createProductEnquiry(input: CreateProductEnquiryInput): Promise<CreateProductEnquiryResult> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, AND: [enquirableProductWhere()] },
      select: { id: true, title: true, brand: { select: { name: true } } },
    });
    if (!product) return { ok: false as const, reason: "NOT_ENQUIRABLE" as const };

    const recent = await tx.productEnquiry.findFirst({
      where: { productId: product.id, phone: input.phone, createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      select: { enquiryNo: true },
    });
    if (recent) return { ok: true as const, enquiryNo: recent.enquiryNo, duplicate: true };

    const created = await tx.productEnquiry.create({
      data: {
        enquiryNo: newEnquiryNo(),
        productId: product.id,
        productTitle: product.title,
        brandName: product.brand.name,
        userId: input.userId ?? null,
        name: input.name,
        phone: input.phone,
        quantity: input.quantity || null,
        message: input.message || null,
      },
      select: { enquiryNo: true },
    });
    return { ok: true as const, enquiryNo: created.enquiryNo, duplicate: false };
  });
}

export async function listProductEnquiries(status?: ProductEnquiryStatus, take = 100) {
  return db.productEnquiry.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, enquiryNo: true, productTitle: true, brandName: true, name: true, phone: true,
      quantity: true, message: true, status: true, adminNotes: true, createdAt: true,
      product: { select: { slug: true } },
    },
  });
}

export type SetEnquiryStatusResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "UNCHANGED" };

/** Admin status change, audited in the same transaction. The caller has already checked admin rights. */
export async function setProductEnquiryStatus(
  adminUserId: string,
  enquiryId: string,
  status: ProductEnquiryStatus,
  adminNotes?: string | null
): Promise<SetEnquiryStatusResult> {
  return db.$transaction(async (tx) => {
    const current = await tx.productEnquiry.findUnique({ where: { id: enquiryId }, select: { status: true, adminNotes: true } });
    if (!current) return { ok: false as const, reason: "NOT_FOUND" as const };
    const notes = adminNotes === undefined ? current.adminNotes : adminNotes || null;
    if (current.status === status && notes === current.adminNotes) return { ok: false as const, reason: "UNCHANGED" as const };
    await tx.productEnquiry.update({ where: { id: enquiryId }, data: { status, adminNotes: notes } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: adminUserId,
      action: "product_enquiry.status_changed",
      entityType: "product_enquiry",
      entityId: enquiryId,
      before: { status: current.status, adminNotes: current.adminNotes },
      after: { status, adminNotes: notes },
    });
    return { ok: true as const };
  });
}
