import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { applyImageImport, itemProblem } from "@/lib/services/admin/product-image-import";

/**
 * Product photos from the console (handover, 19 Oct 2026).
 *
 * Until now a photo reached a product only through an engineer's import plan.
 * This lets staff upload one, choose which photo leads, and remove one — and
 * changes nothing about what a customer may see:
 *   - an uploaded photo is attached through the same import service as every
 *     other photo, so it starts REVIEW_REQUIRED with no identity approval and
 *     is invisible to customers until approved in /admin/catalogue-approvals;
 *   - the file is stored under its SHA-256, so re-uploading the same picture is
 *     a no-op, and a stored object never changes under an approval;
 *   - the licence and source are required, exactly as for imported photos; in
 *     production only an attested licence is shown (lib/catalog-policy.ts).
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MIN_IMAGE_EDGE = 300;

export type ImageKind = { ext: "jpg" | "png" | "webp"; contentType: "image/jpeg" | "image/png" | "image/webp" };

/** The real type of a file, from its first bytes — never from the name or the browser's claim. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return { ext: "png", contentType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

/** Where an image is stored, given the configured public base, e.g. https://storage.googleapis.com/<bucket>. */
export function bucketFromImageBase(imageBase: string): string {
  const url = new URL(imageBase);
  if (url.hostname !== "storage.googleapis.com") throw new Error("IMAGE_BASE_NOT_GCS");
  const bucket = url.pathname.split("/").filter(Boolean)[0];
  if (!bucket) throw new Error("IMAGE_BASE_NO_BUCKET");
  return bucket;
}

export type StoreObject = (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;

export type UploadResult =
  | { ok: true; imageId: string | null; alreadyAttached: boolean; isPrimary: boolean }
  | {
      ok: false;
      code: "NOT_FOUND" | "TOO_LARGE" | "NOT_AN_IMAGE" | "TOO_SMALL" | "UNREADABLE" | "INVALID" | "CONFLICT" | "STORE_FAILED";
      detail?: string;
    };

export async function uploadProductImage(
  params: {
    productSlug: string;
    bytes: Uint8Array;
    alt: string;
    licence: string;
    sourceUrl: string;
    makePrimary: boolean;
    actor: { id: string | null; email: string };
  },
  deps: { store: StoreObject; imageBase: string }
): Promise<UploadResult> {
  const product = await db.product.findUnique({
    where: { slug: params.productSlug },
    select: { id: true, slug: true, images: { select: { id: true, sha256: true, isPrimary: true, sortOrder: true } } },
  });
  if (!product) return { ok: false, code: "NOT_FOUND" };
  if (params.bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: "TOO_LARGE" };
  const kind = sniffImage(params.bytes);
  if (!kind) return { ok: false, code: "NOT_AN_IMAGE" };

  let width: number;
  let height: number;
  try {
    const meta = await sharp(params.bytes).metadata();
    if (!meta.width || !meta.height) return { ok: false, code: "UNREADABLE" };
    width = meta.width;
    height = meta.height;
  } catch {
    return { ok: false, code: "UNREADABLE" };
  }
  if (Math.min(width, height) < MIN_IMAGE_EDGE) return { ok: false, code: "TOO_SMALL" };

  const sha256 = createHash("sha256").update(params.bytes).digest("hex");
  const existing = product.images.find((i) => i.sha256 === sha256);
  if (existing) return { ok: true, imageId: existing.id, alreadyAttached: true, isPrimary: existing.isPrimary };

  const base = deps.imageBase.replace(/\/$/, "");
  const path = `products/${product.slug}/upload-${sha256}.${kind.ext}`;
  const hasPrimary = product.images.some((i) => i.isPrimary);
  const isPrimary = params.makePrimary && !hasPrimary;

  const item = {
    slug: product.slug,
    url: `${base}/${path}`,
    alt: params.alt.trim(),
    sortOrder: Math.max(0, ...product.images.map((i) => i.sortOrder + 1)),
    isPrimary,
    sourceUrl: params.sourceUrl.trim(),
    licence: params.licence.trim(),
    width,
    height,
    sha256,
  };
  // Validate everything the import service checks BEFORE writing to storage.
  const problem = itemProblem(item, base);
  if (problem) return { ok: false, code: "INVALID", detail: problem };

  try {
    await deps.store(path, params.bytes, kind.contentType);
  } catch (e) {
    return { ok: false, code: "STORE_FAILED", detail: e instanceof Error ? e.message.slice(0, 80) : "unknown" };
  }

  const applied = await applyImageImport([item], base, { id: params.actor.id });
  if (!applied.ok) {
    const reason = applied.plan.conflicts[0]?.reason ?? applied.plan.invalid[0]?.reason ?? "conflict";
    return { ok: false, code: "CONFLICT", detail: reason };
  }
  const row = await db.productImage.findFirst({ where: { productId: product.id, sha256 }, select: { id: true } });
  return { ok: true, imageId: row?.id ?? null, alreadyAttached: false, isPrimary };
}

/** Make one of a product's photos the one that leads. Audited. */
export async function setPrimaryImage(
  imageId: string,
  actor: { id: string | null; email: string }
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  return db.$transaction(async (tx) => {
    const image = await tx.productImage.findUnique({ where: { id: imageId }, select: { id: true, productId: true, isPrimary: true } });
    if (!image) return { ok: false as const, code: "NOT_FOUND" as const };
    if (image.isPrimary) return { ok: true as const };
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${image.productId}::uuid FOR UPDATE`;
    const before = await tx.productImage.findFirst({ where: { productId: image.productId, isPrimary: true }, select: { id: true } });
    await tx.productImage.updateMany({ where: { productId: image.productId, isPrimary: true }, data: { isPrimary: false } });
    await tx.productImage.update({ where: { id: image.id }, data: { isPrimary: true } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "product.primary_image_changed",
      entityType: "product",
      entityId: image.productId,
      before: { primaryImageId: before?.id ?? null },
      after: { primaryImageId: image.id, by: actor.email },
    });
    return { ok: true as const };
  });
}

/**
 * Detach a photo from a product. The stored file is kept (it is addressed by
 * its hash and may be attached elsewhere); the audit row keeps what was removed.
 */
export async function removeProductImage(
  imageId: string,
  actor: { id: string | null; email: string }
): Promise<{ ok: true; wasPrimary: boolean } | { ok: false; code: "NOT_FOUND" }> {
  return db.$transaction(async (tx) => {
    const image = await tx.productImage.findUnique({ where: { id: imageId } });
    if (!image) return { ok: false as const, code: "NOT_FOUND" as const };
    await tx.productImage.delete({ where: { id: imageId } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "product.image_removed",
      entityType: "product",
      entityId: image.productId,
      before: {
        imageId: image.id,
        url: image.url,
        sha256: image.sha256,
        licence: image.licence,
        isPrimary: image.isPrimary,
        approvalStatus: image.approvalStatus,
      },
      after: { by: actor.email },
    });
    return { ok: true as const, wasPrimary: image.isPrimary };
  });
}
