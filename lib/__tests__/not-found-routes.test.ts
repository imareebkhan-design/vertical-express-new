import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { productForPage } from "@/app/(shop)/product/[slug]/data";
import { categoryForPage } from "@/app/(shop)/category/[slug]/data";

/**
 * W-16: an unknown product or category is a real 404.
 *
 * The page's own `notFound()` ran inside `loading.tsx`'s Suspense boundary,
 * after the 200 had been sent. `layout.tsx` in each segment now decides
 * existence first, from these lookups; a miss there is a 404 before anything
 * streams. This pins what the layouts decide on. The HTTP status itself was
 * measured on a production build (docs/WEB_APP_AUDIT.md, Batch 4 status) —
 * `next/navigation` does not load under this runner's `react-server`
 * condition, so the layout is not called here.
 */

test("an unknown product or category slug finds nothing — the layouts' 404", async () => {
  assert.equal(await productForPage("no-such-product-w16"), null);
  assert.equal(await categoryForPage("no-such-category-w16"), null);
});

test("a published product and an active category are found — the page renders", async () => {
  const product = await db.product.findFirst({ where: { status: "published" }, select: { slug: true } });
  const category = await db.category.findFirst({ where: { isActive: true }, select: { slug: true } });
  assert.ok(product && category, "the seed provides a published product and an active category");
  assert.equal((await productForPage(product.slug))?.slug, product.slug);
  assert.equal((await categoryForPage(category.slug))?.slug, category.slug);
});

test("a product that is not published is not found, as the page already treated it", async () => {
  const hidden = await db.product.findFirst({ where: { status: { not: "published" } }, select: { slug: true } });
  if (!hidden) return; // the seed may hold none; nothing to assert then
  assert.equal(await productForPage(hidden.slug), null);
});
