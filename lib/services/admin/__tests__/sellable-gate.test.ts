import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { sellableReasons } from "../publish-guard";
import { createProduct } from "../product-create";

/**
 * The commercial readiness gate (catalog_only → published). Every requirement
 * is checked on its own: a product complete in all respects passes, and
 * removing any single input produces that input's reason. A listing created
 * straight into `published` that fails the gate leaves nothing behind.
 */
const tag = randomUUID().slice(0, 8);
const ids: Record<string, string> = {};
const TAXED = "general-hardware-tools"; // has an explicit HSN/GST mapping in lib/services/tax.ts

async function complete(x: string, opts: { taxed?: boolean; photo?: boolean; stock?: boolean; mrp?: number | null; price?: number } = {}) {
  const p = await db.product.create({
    data: { slug: `sg-${tag}-${x}`, title: `SG ${tag} ${x}`, status: "catalog_only", brandId: ids.brand, categoryId: opts.taxed === false ? ids.untaxed : ids.taxed },
  });
  const v = await db.productVariant.create({
    data: { productId: p.id, sku: `SG-${tag}-${x}`, name: "Default", pricePaise: opts.price ?? 120000, compareAtPaise: opts.mrp === undefined ? 150000 : opts.mrp, isDefault: true },
  });
  if (opts.stock !== false) await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 0 } });
  if (opts.photo !== false) {
    await db.productImage.create({ data: { productId: p.id, url: `https://example.test/${x}.webp`, alt: x, isPrimary: true, licence: "manufacturer-official-dealer-use", sha256: "b".repeat(64) } });
  }
  return p.id;
}

before(async () => {
  const taxed = await db.category.findUnique({ where: { slug: TAXED } });
  assert.ok(taxed, `${TAXED} must exist in the test database`);
  ids.taxed = taxed.id;
  ids.untaxed = (await db.category.create({ data: { slug: `sg-untaxed-${tag}`, name: `SG Untaxed ${tag}` } })).id;
  ids.brand = (await db.brand.create({ data: { slug: `sg-brand-${tag}`, name: `SG Brand ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `SG WH ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
});

after(async () => {
  const products = await db.product.findMany({ where: { slug: { startsWith: `sg-${tag}-` } }, select: { id: true } });
  const pid = products.map((p) => p.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: pid } } });
  await db.stockMovement.deleteMany({ where: { variant: { productId: { in: pid } } } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: { in: pid } } });
  await db.productVariant.deleteMany({ where: { productId: { in: pid } } });
  await db.product.deleteMany({ where: { id: { in: pid } } });
  await db.warehouse.deleteMany({ where: { id: ids.warehouse } });
  await db.brand.deleteMany({ where: { id: ids.brand } });
  await db.category.deleteMany({ where: { id: ids.untaxed } });
});

test("a product complete in every respect is sellable", async () => {
  assert.deepEqual(await sellableReasons(db, await complete("ok")), []);
});

test("MRP is optional", async () => {
  assert.deepEqual(await sellableReasons(db, await complete("nomrp", { mrp: null })), []);
});

test("each missing input is reported on its own", async () => {
  const cases: [string, Parameters<typeof complete>[1], RegExp][] = [
    ["nophoto", { photo: false }, /photo/],
    ["nostock", { stock: false }, /stock record/],
    ["notax", { taxed: false }, /HSN\/GST/],
    ["badmrp", { mrp: 100000 }, /MRP is below/],
    ["zeroprice", { price: 0, mrp: null }, /price above zero/],
  ];
  for (const [x, opts, re] of cases) {
    const reasons = await sellableReasons(db, await complete(x, opts));
    assert.ok(reasons.some((r) => re.test(r)), `${x}: ${reasons.join(" | ")}`);
  }
});

test("an inactive brand blocks selling", async () => {
  const id = await complete("brandoff");
  await db.brand.update({ where: { id: ids.brand }, data: { isActive: false } });
  try {
    assert.ok((await sellableReasons(db, id)).some((r) => /brand is inactive/.test(r)));
  } finally {
    await db.brand.update({ where: { id: ids.brand }, data: { isActive: true } });
  }
});

test("a listing created straight into published that fails the gate writes nothing", async () => {
  const slug = `sg-${tag}-direct`;
  const res = await createProduct(
    {
      title: `SG ${tag} direct`, slug, brandId: ids.brand, categoryId: ids.taxed, description: null,
      unitLabel: "per piece", deliverySpeed: null, status: "published", express: { eligible: false, pincodes: [] },
      variant: { name: "Default", sku: `SG-${tag}-DIRECT`, pricePaise: 99900, compareAtPaise: null },
      openingStock: { warehouseId: ids.warehouse, qty: 5 },
    },
    { id: randomUUID(), email: "gate@test.example" }
  );
  assert.equal(res.ok, false);
  assert.ok(!res.ok && res.error === "not_sellable" && res.reasons.some((r) => /photo/.test(r)));
  assert.equal(await db.product.count({ where: { slug } }), 0, "rolled back");
  assert.equal(await db.productVariant.count({ where: { sku: `SG-${tag}-DIRECT` } }), 0);
});
