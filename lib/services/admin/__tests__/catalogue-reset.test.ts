import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { createProduct } from "@/lib/services/admin/product-create";
import { getPackingSlip } from "@/lib/services/shipments";
import { listStockMovements } from "@/lib/services/inventory-movements";
import { adminListStock } from "@/lib/services/admin/stock";
import { listAdminOrders } from "@/lib/services/admin/orders-list";
import { parseOrdersQuery } from "@/lib/admin-orders-query";
import { purchasedSku, skuForDisplay } from "@/lib/retired-sku";
import {
  applyCatalogueReset,
  databaseIdentity,
  catalogueFingerprint,
  catalogueResetInForce,
  planCatalogueReset,
  restoreCatalogueReset,
  ResetRefused,
  type ResetRecovery,
} from "@/lib/services/admin/catalogue-reset";

/**
 * The one-time catalogue reset.
 *
 * The products made here are back-dated to 2001 and the cutoff is mid-2001, so
 * the reset sees only them and the rest of the test database is never in its
 * plan. What is tested is what the owner is trusting it with: that the plan
 * writes nothing; that anything history points at is archived rather than
 * deleted; that old orders still resolve; that the same real product can be
 * listed again under its own name; that the database must match the approved
 * manifest; and that a restore puts back exactly what was there.
 */

const CUTOFF = new Date("2001-06-01T00:00:00Z");
const OLD = new Date("2001-01-15T00:00:00Z");
const P = "zzz-reset";
const QA = "qa-staging-zzz-reset";
const NONE = new Set<string>();
let userId = "";
const ids: Record<string, string> = {};
const variantIds: Record<string, string> = {};

async function cleanup() {
  const products = await db.product.findMany({
    where: { OR: [{ slug: { startsWith: P } }, { slug: { startsWith: QA } }] },
    select: { id: true, variants: { select: { id: true } } },
  });
  const pids = products.map((p) => p.id);
  const vids = products.flatMap((p) => p.variants.map((v) => v.id));
  await db.shipment.deleteMany({ where: { order: { orderNo: { startsWith: "ZZZRESET" } } } });
  await db.order.deleteMany({ where: { orderNo: { startsWith: "ZZZRESET" } } });
  await db.productEnquiry.deleteMany({ where: { productId: { in: pids } } });
  await db.stockMovement.deleteMany({ where: { variantId: { in: vids } } });
  await db.inventory.deleteMany({ where: { variantId: { in: vids } } });
  await db.wishlistItem.deleteMany({ where: { productId: { in: pids } } });
  await db.product.deleteMany({ where: { id: { in: pids } } });
  await db.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: pids } }, { action: { in: ["catalogue.reset_applied", "catalogue.reset_restored", "catalogue.reset_retired", "catalogue.reset_removed"] } }] },
  });
}

async function product(key: string, slug: string, opts: { stock?: number; created?: Date } = {}) {
  const [brand, category, warehouse] = await Promise.all([
    db.brand.findFirstOrThrow({ select: { id: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
    db.warehouse.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);
  const sku = slug.toUpperCase();
  const res = await createProduct(
    {
      title: `Zzz Reset ${key}`, slug, brandId: brand.id, categoryId: category.id, description: null, unitLabel: "per bag",
      deliverySpeed: null, status: "draft",
      variant: { name: "50 kg bag", sku, pricePaise: 40_000, compareAtPaise: 42_000 },
      openingStock: { warehouseId: warehouse.id, qty: opts.stock ?? 0 }, express: { eligible: false, pincodes: [] },
    },
    { id: userId, email: "owner@example.test" }
  );
  assert.equal(res.ok, true);
  const p = await db.product.update({
    where: { slug }, data: { createdAt: opts.created ?? OLD, status: "published" }, select: { id: true, variants: { select: { id: true } } },
  });
  ids[key] = p.id;
  variantIds[key] = p.variants[0].id;
}

let shipmentId = "";
async function order(key: string, status: "cancelled" | "confirmed") {
  return db.order.create({
    data: {
      orderNo: `ZZZRESET${randomUUID().slice(0, 8)}`, userId, address: {}, status, paymentMethod: "dummy",
      subtotalPaise: 40_000, totalPaise: 40_000,
      items: { create: [{ variantId: variantIds[key], title: `Zzz Reset ${key}`, variantName: "50 kg bag", unitPricePaise: 40_000, qty: 1, lineTotalPaise: 40_000 }] },
    },
  });
}

before(async () => {
  await cleanup();
  userId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  await product("ordered", `${P}-ordered`);
  const o = await order("ordered", "cancelled");
  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: o.id }, select: { id: true } });
  shipmentId = (await db.shipment.create({
    data: { orderId: o.id, sequence: 1, speedClass: "scheduled", items: { create: [{ orderItemId: line.id, qty: 1 }] } },
    select: { id: true },
  })).id;
  await product("stocked", `${P}-stocked`, { stock: 12 });
  await product("plain", `${P}-plain`);
  const wishlist = await db.wishlist.create({ data: { userId }, select: { id: true } });
  await db.wishlistItem.create({ data: { wishlistId: wishlist.id, productId: ids.plain } });
  const cart = await db.cart.create({ data: { userId }, select: { id: true } });
  await db.cartItem.create({ data: { cartId: cart.id, variantId: variantIds.plain, qty: 2 } });
  await product("open", `${P}-open`);
  await order("open", "confirmed");
  await product("qa", `${QA}-item`);
  await product("new", `${P}-new`, { created: new Date() });
});

after(async () => {
  await cleanup();
  await db.cart.deleteMany({ where: { userId } });
  await db.wishlist.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
});

const entry = (plan: Awaited<ReturnType<typeof planCatalogueReset>>, key: string) => plan.entries.find((e) => e.id === ids[key]);

let recovery: ResetRecovery | null = null;
let fingerprintBefore: Record<string, string> = {};

test("the plan writes nothing, and classifies each product by what refers to it", async () => {
  const before = await catalogueFingerprint();
  const plan = await planCatalogueReset(CUTOFF, NONE);
  assert.deepEqual(await catalogueFingerprint(), before, "producing the manifest changed the database");

  assert.equal(plan.entries.length, 5, "the plan reached beyond the products made before the cutoff");
  assert.equal(entry(plan, "new"), undefined, "a product made after the cutoff was considered");
  assert.equal(entry(plan, "ordered")?.action, "retire");
  assert.match(entry(plan, "ordered")?.reason ?? "", /1 order line/);
  assert.equal(entry(plan, "stocked")?.action, "retire");
  assert.match(entry(plan, "stocked")?.reason ?? "", /stock movement.*on hand/);
  assert.equal(entry(plan, "plain")?.action, "remove");
  assert.equal(entry(plan, "plain")?.references.cartLines, 1);
  assert.equal(entry(plan, "open")?.action, "exclude");
  assert.match(entry(plan, "open")?.reason ?? "", /still open/);
  assert.equal(entry(plan, "qa")?.action, "exclude");
  assert.equal(entry(plan, "qa")?.source, "qa_fixture");
  assert.equal(entry(plan, "ordered")?.source, "dashboard_or_csv");
  assert.equal(entry(plan, "ordered")?.retiredSlug, `${P}-ordered--legacy-20010601`);
  assert.deepEqual(entry(plan, "ordered")?.retiredSkus, { [`${P}-ORDERED`.toUpperCase()]: `${P}-ORDERED--LEGACY-20010601`.toUpperCase() });
  assert.match(plan.digest, /^[a-f0-9]{64}$/);
});

test("apply refuses a database that no longer matches the approved manifest, and writes nothing", async () => {
  const plan = await planCatalogueReset(CUTOFF, NONE);
  await db.productEnquiry.create({
    data: { enquiryNo: `ZZZ-${randomUUID().slice(0, 8)}`, productId: ids.plain, productTitle: "x", brandName: "x", name: "Test", phone: "9000000000" },
  });
  const before = await catalogueFingerprint();
  let captured = false;
  await assert.rejects(
    applyCatalogueReset({ cutoff: CUTOFF, seedSlugs: NONE, approvedDigest: plan.digest, approvedDatabaseId: (await databaseIdentity(db)).id, onRecovery: () => { captured = true; } }),
    (e: unknown) => e instanceof ResetRefused && /does not match this database/.test(e.message)
  );
  assert.equal(captured, false, "a recovery file was produced for a refused apply");
  assert.deepEqual(await catalogueFingerprint(), before);
  await db.productEnquiry.deleteMany({ where: { productId: ids.plain } });
});

test("apply archives what history refers to, removes the rest, and keeps everything else", async () => {
  fingerprintBefore = await catalogueFingerprint();
  const plan = await planCatalogueReset(CUTOFF, NONE);
  const res = await applyCatalogueReset({ cutoff: CUTOFF, seedSlugs: NONE, approvedDigest: plan.digest, approvedDatabaseId: (await databaseIdentity(db)).id, onRecovery: (r) => { recovery = r; } });
  assert.deepEqual(res, { digest: plan.digest, retired: 2, removed: 1, excluded: 2 });
  assert.ok(recovery);

  const ordered = await db.product.findUniqueOrThrow({ where: { id: ids.ordered }, select: { status: true, slug: true, variants: { select: { sku: true } } } });
  assert.deepEqual(ordered, { status: "archived", slug: `${P}-ordered--legacy-20010601`, variants: [{ sku: "ZZZ-RESET-ORDERED--LEGACY-20010601" }] });
  assert.equal(await db.product.count({ where: { id: ids.plain } }), 0, "the unreferenced product is still there");
  assert.equal(await db.wishlistItem.count({ where: { productId: ids.plain } }), 0, "a wishlist entry was left pointing at nothing");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: ids.open }, select: { status: true } })).status, "published", "an excluded product was touched");
  assert.equal(await db.product.count({ where: { id: { in: [ids.ordered, ids.stocked] }, AND: [catalogListingWhere()] } }), 0);

  /* The cancelled order still reads: its line, its snapshot, and the variant it points at. */
  const line = await db.orderItem.findFirstOrThrow({
    where: { variantId: variantIds.ordered }, select: { title: true, unitPricePaise: true, variant: { select: { product: { select: { status: true } } } } },
  });
  assert.deepEqual(line, { title: "Zzz Reset ordered", unitPricePaise: 40_000, variant: { product: { status: "archived" } } });
  /* The stock ledger still adds up for the archived product. */
  assert.equal(await db.stockMovement.count({ where: { variantId: variantIds.stocked } }), 1);

  /* Historical records show the code that was sold, not the retired one. */
  const slip = await getPackingSlip(shipmentId);
  assert.equal(slip?.lines[0].sku, "ZZZ-RESET-ORDERED", "the packing slip printed the retired code");
  const detailSku = (await db.orderItem.findFirstOrThrow({ where: { variantId: variantIds.ordered }, select: { variant: { select: { sku: true } } } })).variant.sku;
  assert.deepEqual(purchasedSku(detailSku), { code: "ZZZ-RESET-ORDERED", retiredOn: "2001-06-01" });
  const ledger = await listStockMovements(1, 500);
  const moved = ledger.rows.find((m) => m.variant.sku === "ZZZ-RESET-STOCKED--LEGACY-20010601");
  assert.ok(moved, "the archived product's movement left the ledger");
  assert.equal(skuForDisplay(moved.variant.sku), "ZZZ-RESET-STOCKED (retired listing)");
  const stock = await adminListStock("all", 1, 1000);
  assert.equal(stock.rows.find((r) => r.variantId === variantIds.stocked)?.sku, "ZZZ-RESET-STOCKED (retired listing)");
  /* An operator searching orders by the code on the bag still finds the order. */
  const found = await listAdminOrders(parseOrdersQuery({ q: "ZZZ-RESET-ORDERED", tab: "all" }));
  assert.ok(found.rows.some((x) => x.orderNo.startsWith("ZZZRESET")), "searching by the sold code no longer finds the order");

  assert.equal(await catalogueResetInForce(), true);
  assert.equal(await db.auditLog.count({ where: { action: "catalogue.reset_retired", entityId: { in: [ids.ordered, ids.stocked] } } }), 2);
  assert.equal(await db.auditLog.count({ where: { action: "catalogue.reset_removed", entityId: ids.plain } }), 1);
});

test("the same real product can be listed again under its own name and item code", async () => {
  const [brand, category] = await Promise.all([db.brand.findFirstOrThrow({ select: { id: true } }), db.category.findFirstOrThrow({ select: { id: true } })]);
  const res = await createProduct(
    {
      title: "Zzz Reset ordered, relisted", slug: `${P}-ordered`, brandId: brand.id, categoryId: category.id, description: null,
      unitLabel: "per bag", deliverySpeed: null, status: "draft",
      variant: { name: "50 kg bag", sku: "ZZZ-RESET-ORDERED", pricePaise: 41_000, compareAtPaise: 42_000 },
      openingStock: null, express: { eligible: false, pincodes: [] },
    },
    { id: userId, email: "owner@example.test" }
  );
  assert.deepEqual(res, { ok: true, slug: `${P}-ordered` });
  /* The old order still points at the old, archived variant — not at the new listing. */
  const line = await db.orderItem.findFirstOrThrow({ where: { variantId: variantIds.ordered }, select: { variant: { select: { sku: true } } } });
  assert.equal(line.variant.sku, "ZZZ-RESET-ORDERED--LEGACY-20010601");

  /* With the old name taken again, restore refuses and names the clash rather than failing half-way. */
  assert.ok(recovery);
  await assert.rejects(restoreCatalogueReset(recovery), (e: unknown) => e instanceof ResetRefused && /zzz-reset-ordered is now used by/.test(e.message));
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: ids.ordered }, select: { status: true } })).status, "archived", "a refused restore changed something");

  const relisted = await db.product.findUniqueOrThrow({ where: { slug: `${P}-ordered` }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: relisted.id } });
  await db.product.delete({ where: { id: relisted.id } });
});

test("restore puts back exactly what was there, and a second restore changes nothing", async () => {
  assert.ok(recovery);
  const res = await restoreCatalogueReset(recovery);
  assert.deepEqual(res, { retiredRestored: 2, removedRestored: 1, alreadyInPlace: 0 });
  assert.deepEqual(await catalogueFingerprint(), fingerprintBefore, "the restored catalogue differs from the one before the reset");
  assert.equal(await catalogueResetInForce(), false);

  const again = await restoreCatalogueReset(recovery);
  assert.deepEqual(again, { retiredRestored: 0, removedRestored: 0, alreadyInPlace: 3 });
  assert.deepEqual(await catalogueFingerprint(), fingerprintBefore);
});

const thisDb = async () => (await databaseIdentity(db)).id;
const apply = async (onRecovery: (r: ResetRecovery) => void, digest?: string, dbId?: string) =>
  applyCatalogueReset({
    cutoff: CUTOFF, seedSlugs: NONE,
    approvedDigest: digest ?? (await planCatalogueReset(CUTOFF, NONE)).digest,
    approvedDatabaseId: dbId ?? (await thisDb()), onRecovery,
  });

test("an edit to a product after the manifest refuses the apply, even one that changes no classification", async () => {
  const plan = await planCatalogueReset(CUTOFF, NONE);
  await db.productVariant.update({ where: { id: variantIds.plain }, data: { pricePaise: 40_100 } });
  await assert.rejects(apply(() => {}, plan.digest), (e: unknown) => e instanceof ResetRefused && /does not match this database/.test(e.message));
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: ids.ordered }, select: { status: true } })).status, "published");
});

test("a manifest approved for another database is refused, though its digest matches", async () => {
  const plan = await planCatalogueReset(CUTOFF, NONE);
  await assert.rejects(
    apply(() => {}, plan.digest, "localhost:localhost:5432/some_other_copy"),
    (e: unknown) => e instanceof ResetRefused && /approved for localhost:localhost:5432\/some_other_copy/.test(e.message)
  );
});

test("restore checks the database, the names it wrote, and leaves later edits alone on a second run", async () => {
  let rec: ResetRecovery | null = null;
  await apply((r) => { rec = r; });
  assert.ok(rec);
  const recovery = rec as ResetRecovery;
  assert.equal(await catalogueResetInForce(), true);

  /* Another database's file is refused. */
  await assert.rejects(
    restoreCatalogueReset({ ...recovery, database: { ...recovery.database, id: "supabase:aaaaaaaaaaaaaaaaaaaa/postgres" } }),
    (e: unknown) => e instanceof ResetRefused && /belongs to supabase:/.test(e.message)
  );

  /* A name this reset did not write is refused, and nothing is restored. */
  await db.product.update({ where: { id: ids.ordered }, data: { slug: `${P}-ordered-renamed-by-hand` } });
  await assert.rejects(restoreCatalogueReset(recovery), (e: unknown) => e instanceof ResetRefused && /which this reset did not write/.test(e.message));
  assert.equal(await db.product.count({ where: { id: ids.plain } }), 0, "a refused restore inserted a removed product");
  await db.product.update({ where: { id: ids.ordered }, data: { slug: `${P}-ordered--legacy-20010601` } });

  assert.deepEqual(await restoreCatalogueReset(recovery), { retiredRestored: 2, removedRestored: 1, alreadyInPlace: 0 });
  assert.equal(await catalogueResetInForce(), false);

  /* A later edit to a restored product survives a second restore. */
  await db.product.update({ where: { id: ids.plain }, data: { description: "edited after the restore" } });
  const before = await db.product.findUniqueOrThrow({ where: { id: ids.plain }, select: { updatedAt: true, commercialReview: true, description: true } });
  assert.deepEqual(await restoreCatalogueReset(recovery), { retiredRestored: 0, removedRestored: 0, alreadyInPlace: 3 });
  assert.deepEqual(await db.product.findUniqueOrThrow({ where: { id: ids.plain }, select: { updatedAt: true, commercialReview: true, description: true } }), before);
});

test("the plan says what customers will still see after the reset", async () => {
  const plan = await planCatalogueReset(CUTOFF, NONE);
  const slugs = plan.remainingVisible.map((p) => p.slug);
  /* Excluded products still visible are listed with the reason they were kept. */
  for (const p of plan.remainingVisible) assert.ok(p.why.length > 0);
  assert.ok(!slugs.includes(`${P}-ordered`) && !slugs.includes(`${P}-plain`), "a product the reset retires or removes is reported as remaining");
  assert.ok(Object.keys(plan.preservedContent).includes("categories") && Object.keys(plan.preservedContent).includes("settings"));
});
