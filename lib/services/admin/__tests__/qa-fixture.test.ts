import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { publicProductWhere } from "@/lib/catalog-policy";
import { upsertQaFixture, archiveQaFixture } from "../qa-fixture";
import { QA_FIXTURE_PRODUCT_SLUG, QA_FIXTURE_APPROVER, isQaFixtureSlug } from "@/lib/catalog/qa-fixture-ids";
import { qaTargetRefusal, STAGING_REF, LOCAL_TEST_REF } from "@/lib/catalog/qa-target";
import { spawnSync } from "node:child_process";

/**
 * The staging checkout QA fixture: sellable through the real gate, labelled as
 * synthetic everywhere, never public where real money moves, archived (not
 * deleted) on cleanup, and its script refuses anything but staging.
 */
let warehouseId: string;
let categorySlug: string;
const savedGateway = process.env.PAYMENT_GATEWAY;

before(async () => {
  warehouseId = (await db.warehouse.create({ data: { name: `QA fixture test ${randomUUID().slice(0, 6)}`, city: "Srinagar", pincode: "190001" } })).id;
  const cat = await db.category.findFirstOrThrow({ where: { isActive: true, slug: { in: Object.keys(CATEGORY_TAX_CONFIGS) } }, select: { slug: true } });
  categorySlug = cat.slug;
});

after(async () => {
  process.env.PAYMENT_GATEWAY = savedGateway;
  const p = await db.product.findUnique({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, select: { id: true } });
  if (p) {
    await db.inventory.deleteMany({ where: { variant: { productId: p.id } } });
    await db.productVariant.deleteMany({ where: { productId: p.id } });
    await db.productImage.deleteMany({ where: { productId: p.id } });
    await db.product.delete({ where: { id: p.id } });
  }
  await db.brand.deleteMany({ where: { slug: "qa-staging-brand" } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

const isPublic = async () => !!(await db.product.findFirst({ where: { slug: QA_FIXTURE_PRODUCT_SLUG, AND: [publicProductWhere()] }, select: { id: true } }));

/** Runs the committed `npm run qa:fixture` exactly as an operator would. */
function runScript(args: string[], env: Record<string, string | undefined> = {}) {
  const r = spawnSync("npm", ["run", "-s", "qa:fixture", "--", ...args], {
    env: { ...process.env, NODE_PATH: undefined, ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("npm run qa:fixture resolves its imports as committed (dry run on the disposable DB writes nothing)", () => {
  const r = runScript([`--expect-ref=${LOCAL_TEST_REF}`, `--category=${categorySlug}`, `--warehouse-id=${warehouseId}`, "--price-paise=19900", "--stock=20"]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /QA fixture is sellable \(published\)/);
  assert.match(r.out, /DRY RUN — rolled back/);
});

test("created through the real gate: published, sellable, labelled synthetic", async () => {
  const r = await db.$transaction((tx) => upsertQaFixture(tx, { categorySlug, warehouseId, pricePaise: 19900, stock: 20 }));
  assert.deepEqual(r.sellable, []);
  const p = await db.product.findUniqueOrThrow({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, include: { images: true } });
  assert.equal(p.status, "published");
  assert.match(p.title, /QA TEST ITEM — staging only, not for sale/);
  assert.equal(p.identityApprovedBy, QA_FIXTURE_APPROVER);
  assert.equal(p.images[0].approvedBy, QA_FIXTURE_APPROVER);
  assert.ok(isQaFixtureSlug(p.slug));
  process.env.PAYMENT_GATEWAY = "dummy";
  assert.equal(await isPublic(), true);
});

test("never public where the live gateway is configured", async () => {
  process.env.PAYMENT_GATEWAY = "razorpay-live";
  assert.equal(await isPublic(), false);
  process.env.PAYMENT_GATEWAY = "dummy";
});

test("refuses a category without a confirmed tax mapping and non-positive values", async () => {
  await assert.rejects(db.$transaction((tx) => upsertQaFixture(tx, { categorySlug: "no-such-tax-category", warehouseId, pricePaise: 100, stock: 1 })));
  await assert.rejects(db.$transaction((tx) => upsertQaFixture(tx, { categorySlug, warehouseId, pricePaise: 0, stock: 1 })));
});

test("cleanup archives and deactivates; nothing deleted", async () => {
  assert.equal(await db.$transaction((tx) => archiveQaFixture(tx)), true);
  const p = await db.product.findUniqueOrThrow({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, include: { variants: true } });
  assert.equal(p.status, "archived");
  assert.equal(p.variants.every((v) => !v.isActive), true);
  assert.equal(await isPublic(), false);
});

test("the script refuses anything but staging", () => {
  const STAGING = `postgresql://postgres.${STAGING_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
  const PROD = "postgresql://postgres.gsfslnxvwmrgulzqypdp:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
  assert.equal(qaTargetRefusal(STAGING, STAGING_REF, {}), null);
  assert.ok(qaTargetRefusal(PROD, STAGING_REF, {}));
  assert.ok(qaTargetRefusal(PROD, "gsfslnxvwmrgulzqypdp", {}));
  assert.ok(qaTargetRefusal(STAGING, undefined, {}));
  assert.ok(qaTargetRefusal("postgresql://me@localhost/x", STAGING_REF, {}));
  assert.ok(qaTargetRefusal(STAGING, STAGING_REF, { PAYMENT_GATEWAY: "razorpay-live" }));
});

test("local-test rehearsal: only a local database explicitly marked disposable", () => {
  const LOCAL = "postgresql://me@localhost:5432/ve_test";
  const STAGING = `postgresql://postgres.${STAGING_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
  const PROD = "postgresql://postgres.gsfslnxvwmrgulzqypdp:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
  const marked = { VE_TEST_DATABASE: "1" };
  assert.equal(qaTargetRefusal(LOCAL, LOCAL_TEST_REF, marked), null);
  assert.equal(qaTargetRefusal("postgresql://me@127.0.0.1/ve_test", LOCAL_TEST_REF, marked), null);
  assert.ok(qaTargetRefusal(LOCAL, LOCAL_TEST_REF, {}), "unmarked local database");
  assert.ok(qaTargetRefusal(STAGING, LOCAL_TEST_REF, marked), "staging is not a rehearsal target");
  assert.ok(qaTargetRefusal(PROD, LOCAL_TEST_REF, marked), "production is not a rehearsal target");
  assert.ok(qaTargetRefusal("postgresql://me@db.example.com/x", LOCAL_TEST_REF, marked), "remote non-Supabase host");
  assert.ok(qaTargetRefusal(LOCAL, LOCAL_TEST_REF, { ...marked, PAYMENT_GATEWAY: "razorpay-live" }));
});

test("the script itself refuses an unmarked target before touching the database", () => {
  const r = runScript([`--expect-ref=${LOCAL_TEST_REF}`, "--category=x", "--warehouse-id=x", "--price-paise=1", "--stock=1"], { VE_TEST_DATABASE: "" });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /requires VE_TEST_DATABASE=1/);
});
