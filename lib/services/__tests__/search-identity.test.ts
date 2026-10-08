import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { listProducts } from "../catalog";
import { getSuggestions } from "../search";

const suffix = `${Date.now()}-${process.pid}`;
const productIds: string[] = [];
const categoryIds: string[] = [];
const brandIds: string[] = [];
const synonymIds: string[] = [];
after(async () => {
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.category.deleteMany({ where: { id: { in: categoryIds } } });
  await db.brand.deleteMany({ where: { id: { in: brandIds } } });
  await db.synonym.deleteMany({ where: { id: { in: synonymIds } } });
});

test("ACC and TMT retain product identity in results and suggestions, while drafts stay hidden", async () => {
  const brand = await db.brand.create({ data: { name: `ACC ${suffix}`, slug: `acc-identity-${suffix}` } });
  const other = await db.brand.create({ data: { name: `Fixture ${suffix}`, slug: `fixture-identity-${suffix}` } });
  brandIds.push(brand.id, other.id);
  const accessories = await db.category.create({ data: { name: `Kitchen Accessories ${suffix}`, slug: `accessories-identity-${suffix}` } });
  const building = await db.category.create({ data: { name: `Building Supplies ${suffix}`, slug: `building-identity-${suffix}` } });
  categoryIds.push(accessories.id, building.id);
  const create = async (name: string, brandId: string, categoryId: string, status: "published" | "draft" = "published") => {
    const p = await db.product.create({ data: { title: name, slug: `identity-${productIds.length}-${suffix}`, brandId, categoryId, status,
      variants: { create: { sku: `identity-${productIds.length}-${suffix}`, name: "Test unit", pricePaise: 10000, isDefault: true } } } });
    productIds.push(p.id); return p;
  };
  const cement = await create("Gold Cement", brand.id, building.id);
  const basket = await create("Kitchen Pull Out Basket", other.id, accessories.id);
  const sink = await create("Stainless Steel Kitchen Sink", other.id, accessories.id);
  const rod = await create("Steel Rod Reinforcement", other.id, building.id);
  const draft = await create("ACC Unreleased Cement", brand.id, building.id, "draft");
  // Preserve an existing local synonym instead of overwriting shared fixtures.
  if (!await db.synonym.findUnique({ where: { word: "tmt" } })) {
    const s = await db.synonym.create({ data: { word: "tmt", synonyms: "steel,steel bar,steel rod,iron rod,rebar" } });
    synonymIds.push(s.id);
  }
  const acc = await listProducts({ search: "ACC", perPage: 100 });
  assert.ok(acc.items.some(p => p.id === cement.id));
  assert.ok(!acc.items.some(p => [basket.id, sink.id, draft.id].includes(p.id)));
  const accSuggestions = await getSuggestions("ACC");
  assert.ok(accSuggestions.products.some(p => p.slug === cement.slug));
  assert.ok(!accSuggestions.products.some(p => [basket.slug, sink.slug, draft.slug].includes(p.slug)));
  assert.ok(!accSuggestions.categories.some(c => c.slug === accessories.slug));
  const tmt = await listProducts({ search: "TMT", perPage: 100 });
  assert.ok(tmt.items.some(p => p.id === rod.id));
  assert.ok(!tmt.items.some(p => p.id === sink.id));
  const tmtSuggestions = await getSuggestions("TMT");
  assert.ok(tmtSuggestions.products.some(p => p.slug === rod.slug));
  assert.ok(!tmtSuggestions.products.some(p => p.slug === sink.slug));
  const steel = await listProducts({ search: "steel", perPage: 100 });
  assert.ok(steel.items.some(p => p.id === sink.id), "the broad material query still permits a steel sink");
});
