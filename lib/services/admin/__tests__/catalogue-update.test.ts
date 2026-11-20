import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { parseStockCounts, parseVariantUpdates, STOCK_COUNT_HEADER, VARIANT_UPDATE_HEADER } from "@/lib/catalogue-update-csv";
import {
  applyStockCounts,
  applyVariantUpdates,
  exportVariantSheet,
  planStockCounts,
  planVariantUpdates,
  sha256,
} from "../catalogue-update";
import { sellableReasons } from "../publish-guard";

/**
 * Enriching existing catalogue products from a file, against disposable local
 * fixtures shaped like staging's: a draft family with no variants (the master
 * import), a catalogue-only family with an approved photo and no variants, and
 * a family with an inactive reference-priced variant and no MRP.
 */
const tag = randomUUID().slice(0, 8);
const ADMIN = { id: randomUUID(), email: "ops-update@test.example" };
const ids: Record<string, string> = {};
const slug = (x: string) => `cu-${tag}-${x}`;
const sku = (x: string) => `CU-${tag}-${x}`.toUpperCase();

const vfile = (...rows: string[]) => [VARIANT_UPDATE_HEADER.join(","), ...rows].join("\n");
const sfile = (...rows: string[]) => [STOCK_COUNT_HEADER.join(","), ...rows].join("\n");

async function plan(text: string) {
  return planVariantUpdates(db, parseVariantUpdates(text));
}
async function apply(text: string) {
  const parsed = parseVariantUpdates(text);
  const p = await planVariantUpdates(db, parsed);
  return { plan: p, result: await applyVariantUpdates(parsed, p.digest, ADMIN, { sha256: sha256(text) }) };
}
async function applyStock(text: string) {
  const parsed = parseStockCounts(text);
  const p = await planStockCounts(db, parsed);
  return { plan: p, result: await applyStockCounts(parsed, p.digest, ADMIN, { sha256: sha256(text) }) };
}
const variantsOf = (x: string) =>
  db.productVariant.findMany({
    where: { product: { slug: slug(x) } }, orderBy: { sku: "asc" },
    select: { sku: true, name: true, pricePaise: true, compareAtPaise: true, isDefault: true, isActive: true },
  });

before(async () => {
  const category = await db.category.findFirstOrThrow({ where: { slug: "general-hardware-tools" }, select: { id: true } });
  ids.brand = (await db.brand.create({ data: { slug: `cu-brand-${tag}`, name: `CU Brand ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `CU WH ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const mk = (x: string, status: "draft" | "catalog_only") =>
    db.product.create({ data: { slug: slug(x), title: `CU ${tag} ${x}`, status, brandId: ids.brand, categoryId: category.id, unitLabel: "per bag" } });
  ids.draft = (await mk("draft", "draft")).id;
  ids.catalog = (await mk("catalog", "catalog_only")).id;
  ids.ref = (await mk("ref", "draft")).id;
  await db.productImage.create({
    data: { productId: ids.catalog, url: `https://example.test/${tag}.webp`, alt: "photo", isPrimary: true, licence: "manufacturer-official-dealer-use",
      sha256: "c".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT", approvedAt: new Date(), approvedBy: "test", approvalReason: "fixture" },
  });
  await db.productVariant.create({ data: { productId: ids.ref, sku: sku("ref"), name: "50 kg bag", pricePaise: 39500, compareAtPaise: null, isActive: false } });
});

after(async () => {
  const pid = [ids.draft, ids.catalog, ids.ref];
  const vids = (await db.productVariant.findMany({ where: { productId: { in: pid } }, select: { id: true } })).map((v) => v.id);
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...pid, ...vids] } }, { actorId: ADMIN.id }] } });
  await db.stockMovement.deleteMany({ where: { variantId: { in: vids } } });
  await db.inventory.deleteMany({ where: { variantId: { in: vids } } });
  await db.productImage.deleteMany({ where: { productId: { in: pid } } });
  await db.productVariant.deleteMany({ where: { productId: { in: pid } } });
  await db.product.deleteMany({ where: { id: { in: pid } } });
  await db.warehouse.deleteMany({ where: { id: ids.warehouse } });
  await db.brand.deleteMany({ where: { id: ids.brand } });
});

test("parser: every problem at once, nothing guessed", () => {
  const r = parseVariantUpdates(vfile(
    `${slug("draft")},${sku("a")},,maybe,,385,,,`,
    `,bad sku!,x,,500,600,,,`,
    `${slug("draft")},${sku("a")},50 kg,,500,500,,,src`,
  ));
  const msgs = r.issues.map((i) => `${i.line}:${i.column}`);
  for (const want of ["2:make_default", "2:mrp_rupees", "2:variant_name", "3:product_slug", "3:sku", "3:price_rupees", "4:sku"]) {
    assert.ok(msgs.includes(want), `${want} missing from ${msgs.join(" ")}`);
  }
  assert.equal(r.rows.length, 0);
  assert.equal(parseVariantUpdates("wrong,header").issues[0].column, "header");
});

test("preview writes nothing and classifies create, update, invalid and conflict rows", async () => {
  const before = await db.productVariant.count({ where: { productId: { in: [ids.draft, ids.catalog, ids.ref] } } });
  const p = await plan(vfile(
    `${slug("draft")},${sku("d50")},50 kg bag,,490,490,,,Owner pack photo 2026-11-02`,
    `${slug("ref")},${sku("ref")},,,490,490,,395,ACC price list Nov 2026`,
    `${slug("missing")},${sku("x")},1 unit,,100,100,,,src`,
  ));
  assert.deepEqual(p.rows.map((r) => r.action), ["create", "update", "invalid"]);
  assert.equal(p.applicable, false);
  const moved = await plan(vfile(`${slug("catalog")},${sku("ref")},1 unit,,100,100,,,src`));
  assert.equal(moved.rows[0].action, "conflict", "a SKU on another product is never moved");
  assert.equal(await db.productVariant.count({ where: { productId: { in: [ids.draft, ids.catalog, ids.ref] } } }), before);
});

test("a file with any bad row applies nothing", async () => {
  const { result } = await apply(vfile(
    `${slug("draft")},${sku("d50")},50 kg bag,,490,490,,,Owner pack photo`,
    `${slug("draft")},${sku("d25")},25 kg bag,,250,260,,,Owner pack photo`,
  ));
  assert.equal(result.ok, false);
  assert.deepEqual(await variantsOf("draft"), []);
});

test("multiple variants on an existing draft family: created at MRP, first one leads, URL and photo untouched", async () => {
  const text = vfile(
    `${slug("draft")},${sku("d50")},50 kg bag,,490,490,,,Owner pack photo 2026-11-02`,
    `${slug("draft")},${sku("d25")},25 kg bag,,260,260,,,Owner pack photo 2026-11-02`,
    `${slug("catalog")},${sku("c1")},1 unit,yes,1200,1200,,,Manufacturer list 2026`,
  );
  const { result } = await apply(text);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.ok && result.created, 3);
  assert.deepEqual(await variantsOf("draft"), [
    { sku: sku("d25"), name: "25 kg bag", pricePaise: 26000, compareAtPaise: 26000, isDefault: false, isActive: true },
    { sku: sku("d50"), name: "50 kg bag", pricePaise: 49000, compareAtPaise: 49000, isDefault: true, isActive: true },
  ]);
  const cat = await db.product.findUniqueOrThrow({ where: { id: ids.catalog }, select: { slug: true, status: true, images: { select: { approvalStatus: true } } } });
  assert.equal(cat.slug, slug("catalog"));
  assert.equal(cat.status, "catalog_only", "a file never publishes");
  assert.equal(cat.images[0].approvalStatus, "APPROVED_EXACT", "photo approval preserved");
  const audit = await db.auditLog.findMany({ where: { actorId: ADMIN.id, action: "catalogue.variant_added" } });
  assert.equal(audit.length, 3);
  assert.ok(audit.every((a) => (a.after as { mrpEvidence?: string }).mrpEvidence));
});

test("the same file again is unchanged and writes nothing", async () => {
  const text = vfile(
    `${slug("draft")},${sku("d50")},50 kg bag,,490,490,,,Owner pack photo 2026-11-02`,
  );
  const p = await plan(text);
  assert.equal(p.rows[0].action, "conflict", "a new-SKU row for a SKU that now exists is refused, not duplicated");
  const exported = await exportVariantSheet(db, { slugs: [slug("draft")] });
  const again = await plan(exported);
  assert.deepEqual(again.rows.map((r) => r.action), ["unchanged", "unchanged"]);
  assert.equal(again.applicable, false);
  assert.equal(await db.productVariant.count({ where: { productId: ids.draft } }), 2);
});

test("an explicit discount keeps the MRP; a price above MRP is refused", async () => {
  const { result } = await apply(vfile(`${slug("draft")},${sku("d50")},,,490,465,490,490,`));
  assert.ok(result.ok);
  const d50 = (await variantsOf("draft")).find((v) => v.sku === sku("d50"))!;
  assert.deepEqual([d50.pricePaise, d50.compareAtPaise], [46500, 49000]);
  const above = parseVariantUpdates(vfile(`${slug("draft")},${sku("d50")},,,490,500,490,465,`));
  assert.match(above.issues[0].message, /cannot be above the MRP/);
});

test("a stale export is a conflict, and nothing overwrites the newer price", async () => {
  /* The export said ₹490/₹490; the shop is now ₹465 after the discount above. */
  const p = await plan(vfile(`${slug("draft")},${sku("d50")},,,490,480,490,490,`));
  assert.equal(p.rows[0].action, "conflict");
  assert.match(p.rows[0].message!, /Changed since your export/);
});

test("an MRP change needs its evidence; a reference-priced variant without MRP gets one", async () => {
  const noEvidence = await plan(vfile(`${slug("ref")},${sku("ref")},,,490,490,,395,`));
  assert.equal(noEvidence.rows[0].action, "invalid");
  const { result } = await apply(vfile(`${slug("ref")},${sku("ref")},,,490,490,,395,ACC dealer list 2026-11-02`));
  assert.ok(result.ok);
  const [ref] = await variantsOf("ref");
  assert.deepEqual([ref.pricePaise, ref.compareAtPaise, ref.isActive], [49000, 49000, false], "activation is not a file's decision");
});

test("a plan that changed between preview and apply writes nothing", async () => {
  const text = vfile(`${slug("draft")},${sku("d25")},,,260,250,260,260,`);
  const parsed = parseVariantUpdates(text);
  const previewed = await planVariantUpdates(db, parsed);
  await db.productVariant.update({ where: { sku: sku("d25") }, data: { pricePaise: 25500 } }); // another operator
  const res = await applyVariantUpdates(parsed, previewed.digest, ADMIN, { sha256: sha256(text) });
  assert.equal(res.ok, false);
  assert.equal((await variantsOf("draft")).find((v) => v.sku === sku("d25"))!.pricePaise, 25500);
});

test("make_default moves the lead to another variant", async () => {
  const { result } = await apply(vfile(`${slug("draft")},${sku("d25")},,yes,260,255,260,255,`));
  assert.ok(result.ok, JSON.stringify(result));
  const vs = await variantsOf("draft");
  assert.deepEqual(vs.map((v) => [v.sku, v.isDefault]), [[sku("d25"), true], [sku("d50"), false]]);
});

test("stock: an opening count creates the record once; the same count again changes nothing", async () => {
  const wh = `CU WH ${tag}`;
  const text = sfile(`${sku("d50")},${wh},40,,opening count`, `${sku("d25")},${wh},0,,opening count`);
  const first = await applyStock(text);
  assert.ok(first.result.ok, JSON.stringify(first.result));
  const second = await planStockCounts(db, parseStockCounts(text));
  assert.deepEqual(second.rows.map((r) => r.action), ["unchanged", "unchanged"], "the same count is not added a second time");
  assert.equal(second.applicable, false);
  const inv = await db.inventory.findMany({ where: { warehouseId: ids.warehouse }, orderBy: { qtyOnHand: "asc" }, select: { qtyOnHand: true, qtyReserved: true } });
  assert.deepEqual(inv, [{ qtyOnHand: 0, qtyReserved: 0 }, { qtyOnHand: 40, qtyReserved: 0 }]);
  const repeat = await planStockCounts(db, parseStockCounts(sfile(`${sku("d50")},${wh},40,40,`)));
  assert.equal(repeat.rows[0].action, "unchanged");
  assert.equal(await db.stockMovement.count({ where: { warehouseId: ids.warehouse } }), 2);
});

test("stock: a recount sets on-hand, never touches reservations, and refuses a count below them", async () => {
  const wh = `CU WH ${tag}`;
  const v = await db.productVariant.findUniqueOrThrow({ where: { sku: sku("d50") }, select: { id: true } });
  await db.inventory.update({ where: { variantId_warehouseId: { variantId: v.id, warehouseId: ids.warehouse } }, data: { qtyReserved: 5 } });
  const low = await planStockCounts(db, parseStockCounts(sfile(`${sku("d50")},${wh},3,40,`)));
  assert.equal(low.rows[0].action, "invalid");
  const stale = await planStockCounts(db, parseStockCounts(sfile(`${sku("d50")},${wh},30,38,`)));
  assert.equal(stale.rows[0].action, "conflict");
  const { result } = await applyStock(sfile(`${sku("d50")},${wh},30,40,shelf recount`));
  assert.ok(result.ok);
  const inv = await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId: v.id, warehouseId: ids.warehouse } } });
  assert.deepEqual([inv.qtyOnHand, inv.qtyReserved], [30, 5]);
  const m = await db.stockMovement.findFirstOrThrow({ where: { variantId: v.id }, orderBy: { createdAt: "desc" } });
  assert.deepEqual([m.qtyDelta, m.qtyAfter, m.reason], [-10, 30, "recount"]);
});

test("publication stays a separate, gated step: price and stock alone do not make a product sellable", async () => {
  const reasons = await sellableReasons(db, ids.draft);
  assert.ok(reasons.some((r) => /photo/.test(r)), reasons.join(" | "));
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: ids.draft } })).status, "draft");
});
