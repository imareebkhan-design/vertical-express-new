import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

/**
 * Attaching prepared product photographs (Task 6).
 *
 * The input is a plan built outside the app from QA-approved images only
 * (docs/catalog/images-v1). This service decides nothing about which picture is
 * right — it only refuses to write anything inconsistent:
 *  - every slug must name an existing product; unknown slugs are reported, never created;
 *  - every image needs an https URL under the configured image host, a licence,
 *    real dimensions and a SHA-256; at most one primary per product;
 *  - a picture already attached (same product + SHA-256) is skipped, so a re-run is a no-op;
 *  - a product that already has a primary image from elsewhere is a conflict, not
 *    silently demoted.
 * Applying writes all images and one audit row per product in a single transaction.
 * Product status is untouched: attaching a picture never publishes anything.
 */

export interface ImagePlanItem {
  slug: string;
  url: string;
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
  sourceUrl: string;
  licence: string;
  width: number;
  height: number;
  sha256: string;
}

export interface ImageImportPlan {
  attach: (ImagePlanItem & { productId: string })[];
  already: { slug: string; sha256: string }[];
  missingProducts: string[];
  invalid: { slug: string; reason: string }[];
  conflicts: { slug: string; reason: string }[];
}

const SHA = /^[0-9a-f]{64}$/;

export function itemProblem(item: ImagePlanItem, imageBase: string): string | null {
  if (!item.slug) return "missing slug";
  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return "url is not a URL";
  }
  if (url.protocol !== "https:") return "url must be https";
  if (!item.url.startsWith(imageBase.replace(/\/?$/, "/"))) return "url is not under the configured image host";
  if (!item.alt?.trim()) return "missing alt text";
  if (!item.licence?.trim()) return "missing licence";
  if (!item.sourceUrl?.startsWith("https://")) return "missing https source URL";
  for (const [k, v] of [["width", item.width], ["height", item.height], ["sortOrder", item.sortOrder]] as const) {
    if (!Number.isInteger(v) || v < (k === "sortOrder" ? 0 : 1)) return `bad ${k}`;
  }
  if (!SHA.test(item.sha256)) return "sha256 must be 64 lowercase hex characters";
  return null;
}

export async function planImageImport(items: ImagePlanItem[], imageBase: string): Promise<ImageImportPlan> {
  const plan: ImageImportPlan = { attach: [], already: [], missingProducts: [], invalid: [], conflicts: [] };
  if (!/^https:\/\//.test(imageBase)) throw new Error("imageBase must be an https URL");

  const bySlug = new Map<string, ImagePlanItem[]>();
  for (const it of items) {
    const problem = itemProblem(it, imageBase);
    if (problem) plan.invalid.push({ slug: it.slug, reason: problem });
    else bySlug.set(it.slug, [...(bySlug.get(it.slug) ?? []), it]);
  }

  const products = await db.product.findMany({
    where: { slug: { in: [...bySlug.keys()] } },
    select: { id: true, slug: true, images: { select: { sha256: true, isPrimary: true } } },
  });
  const found = new Map(products.map((p) => [p.slug, p]));

  for (const [slug, its] of bySlug) {
    const product = found.get(slug);
    if (!product) {
      plan.missingProducts.push(slug);
      continue;
    }
    if (its.filter((i) => i.isPrimary).length > 1) {
      plan.conflicts.push({ slug, reason: "more than one primary image in the plan" });
      continue;
    }
    if (new Set(its.map((i) => i.sha256)).size !== its.length) {
      plan.conflicts.push({ slug, reason: "the same picture appears twice in the plan" });
      continue;
    }
    const existing = new Set(product.images.map((i) => i.sha256).filter((s): s is string => !!s));
    const foreignPrimary = product.images.some((i) => i.isPrimary && (!i.sha256 || !its.some((x) => x.sha256 === i.sha256)));
    const fresh = its.filter((i) => !existing.has(i.sha256));
    if (fresh.some((i) => i.isPrimary) && foreignPrimary) {
      plan.conflicts.push({ slug, reason: "product already has a primary image from elsewhere" });
      continue;
    }
    for (const i of its) {
      if (existing.has(i.sha256)) plan.already.push({ slug, sha256: i.sha256 });
      else plan.attach.push({ ...i, productId: product.id });
    }
  }
  return plan;
}

/** Applies a plan only if it is free of invalid items, missing products and conflicts. */
export async function applyImageImport(items: ImagePlanItem[], imageBase: string, actor: { id: string | null }) {
  const plan = await planImageImport(items, imageBase);
  if (plan.invalid.length || plan.missingProducts.length || plan.conflicts.length) {
    return { ok: false as const, plan };
  }
  const byProduct = new Map<string, typeof plan.attach>();
  for (const a of plan.attach) byProduct.set(a.productId, [...(byProduct.get(a.productId) ?? []), a]);

  await db.$transaction(async (tx) => {
    for (const [productId, imgs] of byProduct) {
      await tx.productImage.createMany({
        data: imgs.map((i) => ({
          productId,
          url: i.url,
          alt: i.alt,
          sortOrder: i.sortOrder,
          isPrimary: i.isPrimary,
          sourceUrl: i.sourceUrl,
          licence: i.licence,
          width: i.width,
          height: i.height,
          sha256: i.sha256,
        })),
      });
      await recordAudit(tx, {
        actorType: actor.id ? "admin" : "system",
        actorId: actor.id,
        action: "product.images_attached",
        entityType: "product",
        entityId: productId,
        after: { images: imgs.map((i) => ({ sha256: i.sha256, isPrimary: i.isPrimary, licence: i.licence })) },
      });
    }
  }, { timeout: 120_000 });
  return { ok: true as const, plan, attached: plan.attach.length, products: byProduct.size };
}
