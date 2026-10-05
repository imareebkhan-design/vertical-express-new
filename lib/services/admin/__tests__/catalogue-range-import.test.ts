import test, { after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { applyRangeImport, planRangeImport, type RangeCatalogue } from "@/lib/services/admin/catalogue-range-import";
import { unpublishableReason } from "@/lib/services/admin/publish-guard";
import { getProductBySlug, brandsForSearchEntry } from "@/lib/services/catalog";
import { getSuggestions } from "@/lib/services/search";

/**
 * The master catalogue goes in as draft ranges: no variant, price, stock or image,
 * new brands and categories inactive, nothing existing touched, and a second run
 * a no-op. A range must stay unpublishable and invisible to customers.
 */
const RUN = `zzz-rng-${Date.now()}`;
const SHA = "a".repeat(64);
let existingBrandId = "";
let existingCatSlug = "";

function catalogue(): RangeCatalogue {
  return {
    version: "test", sourceId: RUN, sourceSha256: SHA,
    taxonomy: { categories: [
      { slug: existingCatSlug, name: "Existing", group: "civil_interiors" },
      { slug: `${RUN}-cat`, name: `${RUN} New Category`, group: "tools" },
    ] },
    brands: [
      { display: `${RUN} Existing Brand`, slug: `${RUN}-existing-brand` },
      { display: `${RUN} Zebrand`, slug: `${RUN}-zebrand` },
    ],
    families: [
      { slug: `${RUN}-a`, title: `${RUN} Zebrand Cement`, brand: `${RUN} Zebrand`, series: null, category: existingCatSlug,
        productType: "Cement", sourceRows: [8, 9], originalRanges: ["ve-range-x"], declaredOptions: ["PPC", "OPC"],
        sourceTypes: ["PPC", "OPC"], dbVariants: 0, price: null, stock: null },
      { slug: `${RUN}-b`, title: `${RUN} Existing Brand Drill`, brand: `${RUN} Existing Brand`, series: null, category: `${RUN}-cat`,
        productType: "Drills", sourceRows: [333], originalRanges: [], declaredOptions: [], sourceTypes: [],
        dbVariants: 0, price: null, stock: null },
    ],
  };
}

test.before(async () => {
  const c = await db.category.findFirstOrThrow({ where: { isActive: true }, select: { slug: true } });
  existingCatSlug = c.slug;
  /* Matched by name case-insensitively, under a different slug: must be reused, not duplicated. */
  existingBrandId = (await db.brand.create({ data: { slug: `${RUN}-eb-other-slug`, name: `${RUN} EXISTING BRAND`, isActive: true } })).id;
});

after(async () => {
  const products = await db.product.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const brands = await db.brand.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const cats = await db.category.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [...products, ...brands, ...cats].map((r) => r.id) } } });
  await db.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
  await db.brand.deleteMany({ where: { id: { in: brands.map((b) => b.id) } } });
  await db.category.deleteMany({ where: { id: { in: cats.map((c) => c.id) } } });
});

test("plan: reuses an existing category and a case-insensitively matching brand; writes nothing", async () => {
  const plan = await planRangeImport(catalogue());
  assert.deepEqual(plan.categories.reuse, [existingCatSlug]);
  assert.deepEqual(plan.categories.create.map((c) => c.slug), [`${RUN}-cat`]);
  assert.deepEqual(plan.brands.reuse, [`${RUN}-existing-brand`]);
  assert.deepEqual(plan.brands.create.map((b) => b.slug), [`${RUN}-zebrand`]);
  assert.equal(plan.products.create.length, 2);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(await db.product.count({ where: { slug: { startsWith: RUN } } }), 0);
});

test("apply: draft ranges, inactive new taxonomy, no variants/stock/images, provenance audited, existing untouched", async () => {
  const before = await db.brand.findUniqueOrThrow({ where: { id: existingBrandId } });
  const res = await applyRangeImport(catalogue(), SHA);
  assert.deepEqual(res.created, { categories: 1, brands: 1, products: 2 });

  const products = await db.product.findMany({
    where: { slug: { startsWith: RUN } },
    include: { variants: true, images: true, brand: true, category: true },
    orderBy: { slug: "asc" },
  });
  assert.equal(products.length, 2);
  for (const p of products) {
    assert.equal(p.status, "draft");
    assert.equal(p.variants.length, 0);
    assert.equal(p.images.length, 0);
    assert.equal(p.specs, null);
  }
  assert.equal(products[1].brand.id, existingBrandId, "reused the existing brand, not a near-duplicate");
  assert.equal((await db.brand.findFirstOrThrow({ where: { slug: `${RUN}-zebrand` } })).isActive, false);
  assert.equal((await db.category.findFirstOrThrow({ where: { slug: `${RUN}-cat` } })).isActive, false);
  assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: existingBrandId } }), before, "existing brand not modified");
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: products[0].id, action: "catalogue.range_imported" } });
  assert.deepEqual((audit.after as { sourceRows: number[] }).sourceRows, [8, 9]);
});

test("rerun is a no-op", async () => {
  const plan = await planRangeImport(catalogue());
  assert.equal(plan.categories.create.length + plan.brands.create.length + plan.products.create.length, 0);
  assert.equal(plan.products.reuse.length, 2);
  const res = await applyRangeImport(catalogue(), SHA);
  assert.deepEqual(res.created, { categories: 0, brands: 0, products: 0 });
  assert.equal(await db.product.count({ where: { slug: { startsWith: RUN } } }), 2);
});

test("a slug already used with a different brand is a conflict, and nothing is written", async () => {
  const cat = catalogue();
  cat.families[0] = { ...cat.families[0], brand: `${RUN} Existing Brand` };
  cat.families.push({ ...cat.families[1], slug: `${RUN}-c`, title: `${RUN} Never Written` });
  const plan = await planRangeImport(cat);
  assert.equal(plan.conflicts.length, 1);
  await assert.rejects(applyRangeImport(cat, SHA), /nothing was written/);
  assert.equal(await db.product.count({ where: { slug: `${RUN}-c` } }), 0);
});

test("a range cannot be published and is invisible to customers", async () => {
  const p = await db.product.findFirstOrThrow({ where: { slug: `${RUN}-a` } });
  assert.match((await unpublishableReason(db, p.id)) ?? "", /active variant with a price/);
  assert.equal(await getProductBySlug(`${RUN}-a`), null);
  const s = await getSuggestions(`${RUN} Zebrand`);
  assert.equal(s.products.length + s.brands.length, 0);
  assert.equal((await brandsForSearchEntry(500)).some((b) => b.slug.startsWith(RUN)), false);
});

test("the guard allows a product once it has an active priced variant", async () => {
  const p = await db.product.findFirstOrThrow({ where: { slug: `${RUN}-b` } });
  await db.productVariant.create({ data: { productId: p.id, sku: `${RUN}-sku-0`, name: "free", pricePaise: 0 } });
  assert.notEqual(await unpublishableReason(db, p.id), null, "a zero price is not a price");
  await db.productVariant.create({ data: { productId: p.id, sku: `${RUN}-sku-1`, name: "inactive", pricePaise: 100, isActive: false } });
  assert.notEqual(await unpublishableReason(db, p.id), null, "an inactive variant cannot be bought");
  await db.productVariant.create({ data: { productId: p.id, sku: `${RUN}-sku-2`, name: "priced", pricePaise: 100 } });
  assert.equal(await unpublishableReason(db, p.id), null);
  await db.productVariant.deleteMany({ where: { productId: p.id } });
});
