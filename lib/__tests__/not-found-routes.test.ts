import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { productForPage } from "@/app/(shop)/product/[slug]/data";
import { categoryForPage } from "@/app/(shop)/category/[slug]/data";
import { createApprovedCatalogueFixture } from "../../test-support/catalogue-fixtures";

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

test("an explicitly approved product and its active category are found", async (t) => {
  const fixture = await createApprovedCatalogueFixture();
  t.after(() => fixture.cleanup());
  const { product, category } = fixture;
  assert.equal((await productForPage(product.slug))?.slug, product.slug);
  assert.equal((await categoryForPage(category.slug))?.slug, category.slug);
});

test("a draft product is not found even with approval evidence", async (t) => {
  const fixture = await createApprovedCatalogueFixture();
  t.after(() => fixture.cleanup());
  await db.product.update({ where: { id: fixture.product.id }, data: { status: "draft" } });
  assert.equal(await productForPage(fixture.product.slug), null);
});
