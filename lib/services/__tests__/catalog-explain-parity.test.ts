import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { explainProducts } from "@/lib/services/catalog-state";
import { addItem } from "@/lib/services/cart";

/**
 * PARITY: the console's explanation must agree with what the storefront
 * actually serves. For a set of products that each fail one gate (and some
 * that pass), the ids `catalogListingWhere()` returns must be exactly the ids
 * `explainProducts` calls visible — in both commerce modes, under production
 * and non-production catalogue rules. A change to either rule that is not
 * made to the other fails here.
 */

const tag = randomUUID().slice(0, 8);
const ids = { category: "", hiddenCategory: "", brand: "", hiddenBrand: "", warehouse: "", closedWarehouse: "" };
const products = new Map<string, string>();
const NOW = new Date();

type Shape = {
  status?: "draft" | "catalog_only" | "published" | "archived";
  slug?: string;
  category?: "hidden";
  brand?: "hidden";
  identity?: false;
  photo?: false | "unattested" | "P1" | "not-primary";
  review?: false;
  variants?: { isDefault: boolean; isActive?: boolean; pricePaise: number; stock?: "none" | "closed" }[];
};

async function make(name: string, s: Shape = {}) {
  const slug = s.slug ?? `parity-${tag}-${name}`;
  const p = await db.product.create({ data: {
    slug, title: `Parity ${tag} ${name}`, status: s.status ?? "published",
    brandId: s.brand === "hidden" ? ids.hiddenBrand : ids.brand,
    categoryId: s.category === "hidden" ? ids.hiddenCategory : ids.category,
    unitLabel: "per bag", deliverySpeed: "scheduled",
    ...(s.identity === false ? {} : {
      identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic parity fixture",
    }),
  } });
  products.set(name, p.id); // before anything else can fail, so cleanup finds it
  for (const [i, v] of (s.variants ?? [{ isDefault: true, pricePaise: 45000 }]).entries()) {
    const row = await db.productVariant.create({ data: {
      productId: p.id, sku: `PAR-${tag}-${name}-${i}`, name: `Pack ${i}`, pricePaise: v.pricePaise,
      compareAtPaise: v.pricePaise > 0 ? v.pricePaise : null, isDefault: v.isDefault, isActive: v.isActive ?? true,
    } });
    if (v.stock !== "none") {
      await db.inventory.create({ data: { variantId: row.id, warehouseId: v.stock === "closed" ? ids.closedWarehouse : ids.warehouse, qtyOnHand: 5 } });
    }
  }
  if (s.photo !== false) {
    await db.productImage.create({ data: {
      productId: p.id, url: `https://example.test/${slug}.webp`, alt: name, isPrimary: s.photo !== "not-primary",
      licence: s.photo === "unattested" ? "synthetic-test-only" : "manufacturer-official-dealer-use",
      sha256: "c".repeat(64), sourceVerified: true,
      // A P1 finding cannot carry an identity approval (database check constraint).
      ...(s.photo === "P1"
        ? { identityApproved: false, approvalStatus: "REVIEW_REQUIRED" as const, severity: "P1" as const }
        : { identityApproved: true, approvalStatus: "APPROVED_EXACT" as const, severity: null }),
      approvedAt: NOW, approvedBy: "test-reviewer", approvalReason: "Synthetic parity fixture",
    } });
  }
  // Last: variant writes clear any earlier review (database trigger).
  if (s.review !== false) {
    await db.product.update({ where: { id: p.id }, data: { commercialReview: { approvedBy: "test-reviewer", reason: "Synthetic parity fixture" } } });
  }
}

before(async () => {
  ids.category = (await db.category.create({ data: { slug: `parity-${tag}`, name: `Parity ${tag}` } })).id;
  ids.hiddenCategory = (await db.category.create({ data: { slug: `parity-off-${tag}`, name: `Parity off ${tag}`, isActive: false } })).id;
  ids.brand = (await db.brand.create({ data: { slug: `parity-${tag}`, name: `Parity ${tag}` } })).id;
  ids.hiddenBrand = (await db.brand.create({ data: { slug: `parity-off-${tag}`, name: `Parity off ${tag}`, isActive: false } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `Parity ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  ids.closedWarehouse = (await db.warehouse.create({ data: { name: `Parity closed ${tag}`, city: "Srinagar", pincode: "190001", isActive: false } })).id;

  await make("complete");
  await make("unattested-photo", { photo: "unattested" });
  await make("qa", { slug: `qa-staging-parity-${tag}` });
  await make("draft", { status: "draft" });
  await make("archived", { status: "archived" });
  await make("catalogue-only", { status: "catalog_only", review: false, variants: [] });
  await make("catalogue-only-no-photo", { status: "catalog_only", review: false, variants: [], photo: false });
  await make("no-review", { review: false });
  await make("no-default", { variants: [{ isDefault: false, pricePaise: 45000 }] });
  await make("retired-default", { variants: [{ isDefault: true, isActive: false, pricePaise: 45000 }, { isDefault: false, pricePaise: 45000 }] });
  await make("zero-extra", { variants: [{ isDefault: true, pricePaise: 45000 }, { isDefault: false, pricePaise: 0 }] });
  await make("retired-zero-extra", { variants: [{ isDefault: true, pricePaise: 45000 }, { isDefault: false, isActive: false, pricePaise: 0, stock: "none" }] });
  await make("closed-warehouse", { variants: [{ isDefault: true, pricePaise: 45000, stock: "closed" }] });
  await make("no-stock-record", { variants: [{ isDefault: true, pricePaise: 45000, stock: "none" }] });
  await make("hidden-category", { category: "hidden" });
  await make("hidden-brand", { brand: "hidden" });
  await make("unconfirmed", { identity: false });
  await make("p1-photo", { photo: "P1" });
  await make("no-primary-photo", { photo: "not-primary" });
});

after(async () => {
  const all = [...products.values()];
  await db.inventory.deleteMany({ where: { variant: { productId: { in: all } } } });
  await db.productImage.deleteMany({ where: { productId: { in: all } } });
  await db.productVariant.deleteMany({ where: { productId: { in: all } } });
  await db.product.deleteMany({ where: { id: { in: all } } });
  await db.warehouse.deleteMany({ where: { id: { in: [ids.warehouse, ids.closedWarehouse] } } });
  await db.brand.deleteMany({ where: { id: { in: [ids.brand, ids.hiddenBrand] } } });
  await db.category.deleteMany({ where: { id: { in: [ids.category, ids.hiddenCategory] } } });
});

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

const nameOf = (id: string) => [...products].find(([, v]) => v === id)?.[0] ?? id;

for (const mode of ["transactional", "catalogue"] as const) {
  for (const deploy of ["production", "development"] as const) {
    test(`explainer agrees with the storefront query: ${mode}, ${deploy} rules`, async () => {
      // strictCatalogue(): production → true; development on a non-production build → false.
      await withEnv({ COMMERCE_MODE: mode, VE_DEPLOY_ENV: deploy, NODE_ENV: "test", PAYMENT_GATEWAY: undefined }, async () => {
        const all = [...products.values()];
        const listed = await db.product.findMany({ where: { AND: [{ id: { in: all } }, catalogListingWhere()] }, select: { id: true } });
        const explained = await explainProducts(all);
        assert.equal(explained.size, all.length);
        const fromQuery = listed.map((r) => nameOf(r.id)).sort();
        const fromExplainer = [...explained].filter(([, s]) => s.visible).map(([id]) => nameOf(id)).sort();
        assert.deepEqual(fromExplainer, fromQuery);
        // The fixtures exercise both sides of the rule in every combination.
        assert.ok(fromQuery.includes("complete"));
        assert.ok(fromQuery.length < all.length);
        for (const [id, s] of explained) if (!s.visible) assert.ok(s.reasons.length > 0, `${nameOf(id)} is hidden with no reason`);
      });
    });
  }
}

test("ordering open: a listed product failing the full commercial check is reported as refused, matching the cart", async () => {
  await withEnv({ COMMERCE_MODE: "transactional", VE_DEPLOY_ENV: "development", NODE_ENV: "test", PAYMENT_GATEWAY: undefined }, async () => {
    const s = (await explainProducts([products.get("complete")!])).get(products.get("complete")!)!;
    // The synthetic review is deliberately minimal, so the full commercial check refuses it.
    assert.equal(s.visible, true);
    assert.equal(s.action, "refused", "listed with Add to cart, refused by the cart");
    assert.ok(s.reasons.every((r) => r.code === "COMMERCIAL_CHECK_FAILED"));
    // And the cart really does refuse it.
    const variant = await db.productVariant.findFirstOrThrow({ where: { productId: products.get("complete")!, isDefault: true } });
    const anonId = randomUUID();
    try {
      await assert.rejects(addItem(null, anonId, variant.id, 1), /not for sale/);
    } finally {
      await db.cart.deleteMany({ where: { anonId } });
    }
  });
});
