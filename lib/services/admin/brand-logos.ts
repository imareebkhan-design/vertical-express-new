import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { sniffImage, type StoreObject } from "@/lib/services/admin/product-images";

/**
 * Brand logos from the console (issue #7).
 *
 * A logo is not the same right as a name. Being able to say "we stock UltraTech"
 * does not license UltraTech's artwork (ISS-044), so a logo is stored only when
 * the operator declares, for this upload, that the business may use it, and
 * names the licence or agreement it is used under. Both land in the audit row
 * with the file's SHA-256, who uploaded it and the URL it replaced, so "why is
 * this logo here?" has an answer later. A source link is optional (a file from
 * the operator's own computer has none).
 *
 * Files: raster only (JPEG, PNG, WebP), sniffed from the bytes, never trusted
 * from the name or the browser; no SVG, which can carry script. Stored under
 * their SHA-256, so the object behind a URL never changes and re-uploading the
 * same file is a no-op.
 *
 * Where it shows: the admin console (Brands list and the product form's brand
 * picker). No storefront surface renders `Brand.logoUrl` today, so storing a
 * logo publishes nothing to customers.
 */

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MIN_LOGO_EDGE = 64;

type Actor = { id: string; email: string };

export type BrandLogoResult =
  | { ok: true; logoUrl: string; unchanged: boolean }
  | {
      ok: false;
      code: "NOT_FOUND" | "TOO_LARGE" | "NOT_AN_IMAGE" | "TOO_SMALL" | "UNREADABLE" | "RIGHTS_REQUIRED" | "LICENCE_REQUIRED" | "BAD_SOURCE" | "STORE_FAILED";
      detail?: string;
    };

function validSource(sourceUrl: string): boolean {
  if (!sourceUrl) return true;
  try {
    const u = new URL(sourceUrl);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function uploadBrandLogo(
  params: {
    brandSlug: string;
    bytes: Uint8Array;
    rightsConfirmed: boolean;
    licence: string;
    sourceUrl?: string;
    actor: Actor;
  },
  deps: { store: StoreObject; imageBase: string }
): Promise<BrandLogoResult> {
  if (!params.rightsConfirmed) return { ok: false, code: "RIGHTS_REQUIRED" };
  const licence = params.licence.trim();
  if (licence.length < 3 || licence.length > 200) return { ok: false, code: "LICENCE_REQUIRED" };
  const sourceUrl = params.sourceUrl?.trim() ?? "";
  if (sourceUrl.length > 500 || !validSource(sourceUrl)) return { ok: false, code: "BAD_SOURCE" };

  const brand = await db.brand.findUnique({ where: { slug: params.brandSlug }, select: { id: true, slug: true, logoUrl: true } });
  if (!brand) return { ok: false, code: "NOT_FOUND" };
  if (params.bytes.length > MAX_LOGO_BYTES) return { ok: false, code: "TOO_LARGE" };
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
  if (Math.min(width, height) < MIN_LOGO_EDGE) return { ok: false, code: "TOO_SMALL" };

  const sha256 = createHash("sha256").update(params.bytes).digest("hex");
  const base = deps.imageBase.replace(/\/$/, "");
  const path = `brands/${brand.slug}/logo-${sha256}.${kind.ext}`;
  const logoUrl = `${base}/${path}`;
  if (brand.logoUrl === logoUrl) return { ok: true, logoUrl, unchanged: true };

  try {
    await deps.store(path, params.bytes, kind.contentType);
  } catch (e) {
    return { ok: false, code: "STORE_FAILED", detail: e instanceof Error ? e.message.slice(0, 80) : "unknown" };
  }

  await db.$transaction(async (tx) => {
    await tx.brand.update({ where: { id: brand.id }, data: { logoUrl } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: params.actor.id,
      action: "brand.logo_set",
      entityType: "brand",
      entityId: brand.id,
      before: { logoUrl: brand.logoUrl },
      after: {
        logoUrl,
        sha256,
        width,
        height,
        contentType: kind.contentType,
        licence,
        sourceUrl: sourceUrl || null,
        rightsDeclaredBy: params.actor.email,
      },
    });
  });
  return { ok: true, logoUrl, unchanged: false };
}

/** Take a brand's logo off. The stored file is kept (the bucket is create-only for
 *  the app), and the audit row records the URL removed so it can be put back. */
export async function removeBrandLogo(brandSlug: string, actor: Actor): Promise<"missing" | "unchanged" | "removed"> {
  return db.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<{ id: string; logoUrl: string | null }[]>`
      SELECT id, logo_url AS "logoUrl" FROM brands WHERE slug = ${brandSlug} FOR UPDATE`;
    if (!before) return "missing";
    if (!before.logoUrl) return "unchanged";
    await tx.brand.update({ where: { id: before.id }, data: { logoUrl: null } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "brand.logo_removed",
      entityType: "brand",
      entityId: before.id,
      before: { logoUrl: before.logoUrl },
      after: { logoUrl: null, removedBy: actor.email },
    });
    return "removed";
  });
}
