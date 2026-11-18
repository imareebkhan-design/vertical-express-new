import test from "node:test";
import assert from "node:assert/strict";
import { liveSteps, storefrontLines, uncoveredReasons, STATUS_MEANING, type LiveInput, type StorefrontInput } from "@/lib/product-live";
import type { CatalogState } from "@/lib/catalog-explain";

/**
 * The product page's checklist. It decides nothing, so what matters is that it
 * never says "done" for something the publish check refuses, never hides a
 * reason it does not recognise, and points each open step at a real place.
 */

const done: LiveInput = {
  slug: "opc-53",
  hasLeadPhoto: true,
  leadPhotoApproved: true,
  licenceUnattested: false,
  identityConfirmed: true,
  variants: [{ sku: "VE-OPC", name: "50 kg bag", isDefault: true, pricePaise: 40_000, compareAtPaise: 42_000, hasStockRecord: true }],
  deliverySpeed: "scheduled",
  taxConfigured: true,
  categoryName: "Cement",
  reviewCurrent: true,
  reviewOnFile: true,
};
const open = (over: Partial<LiveInput>) => liveSteps({ ...done, ...over }).filter((s) => !s.done).map((s) => s.key);

test("a finished product has nothing left, and no step still offers an action", () => {
  assert.deepEqual(open({}), []);
  assert.deepEqual(liveSteps(done).filter((s) => s.action !== null).map((s) => s.key), ["photo"], "only 'change photo' remains on offer");
});

test("each missing thing opens exactly its own step", () => {
  assert.deepEqual(open({ hasLeadPhoto: false, leadPhotoApproved: false }), ["photo", "approval"]);
  assert.deepEqual(open({ leadPhotoApproved: false }), ["approval"]);
  assert.deepEqual(open({ identityConfirmed: false }), ["approval"]);
  assert.deepEqual(open({ licenceUnattested: true }), ["approval"]);
  assert.deepEqual(open({ variants: [{ ...done.variants[0], compareAtPaise: null }] }), ["price"]);
  assert.deepEqual(open({ variants: [{ ...done.variants[0], compareAtPaise: 39_000 }] }), ["price"]);
  assert.deepEqual(open({ variants: [{ ...done.variants[0], pricePaise: 0 }] }), ["price"]);
  assert.deepEqual(open({ variants: [{ ...done.variants[0], isDefault: false }] }), ["price"]);
  assert.deepEqual(open({ variants: [{ ...done.variants[0], hasStockRecord: false }] }), ["stock"]);
  assert.deepEqual(open({ deliverySpeed: null }), ["delivery"]);
  assert.deepEqual(open({ taxConfigured: false }), ["tax"]);
  assert.deepEqual(open({ reviewCurrent: false }), ["review"]);
});

test("a product with no pack at all is not reported as priced or stocked", () => {
  assert.deepEqual(open({ variants: [] }), ["price", "stock"]);
});

test("every open step except tax links to where it is fixed, on this product's page or a real screen", () => {
  const all = liveSteps({ ...done, hasLeadPhoto: false, leadPhotoApproved: false, identityConfirmed: false, variants: [], deliverySpeed: null, taxConfigured: false, reviewCurrent: false, reviewOnFile: false });
  for (const s of all) {
    assert.equal(s.done, false);
    if (s.key === "tax") {
      assert.equal(s.href, null, "the tax step offers a link, but no screen can set a GST rate");
      assert.match(s.detail, /developer/);
    } else {
      assert.match(s.href ?? "", /^\/admin\/products\/opc-53#(photos|approval|pricing|stock|basics|review)$/);
      assert.ok(s.action, `${s.key} has no action label`);
    }
  }
  /* Approval cannot be recorded before there is a photo, so it points at the photo. */
  assert.equal(all.find((s) => s.key === "approval")?.href, "/admin/products/opc-53#photos");
});

test("a review that went stale reads differently from one never recorded", () => {
  const stale = liveSteps({ ...done, reviewCurrent: false, reviewOnFile: true }).find((s) => s.key === "review");
  const never = liveSteps({ ...done, reviewCurrent: false, reviewOnFile: false }).find((s) => s.key === "review");
  assert.match(stale?.detail ?? "", /no longer matches/);
  assert.match(never?.detail ?? "", /Nobody has recorded/);
});

test("the publish check's own reasons are all covered by a step; an unfamiliar one is shown, never dropped", () => {
  /* The exact strings sellableReasons and validateCommercialReadiness produce today. */
  const known = [
    "No active default variant", "The default variant has no selling price above zero", "An active variant has no selling price above zero",
    "An active variant has no MRP recorded", "An MRP is below its selling price", "No stock record for the default variant (enter opening stock, even 0)",
    "No confirmed HSN/GST for category cement", "No approved exact product photo as the primary image",
    "Confirmed identity and an approved primary image are required", "Explicit owner commercial review is missing or incomplete",
    "Unit/pack review does not match the product", "Delivery classification has not been confirmed for this product",
    "Owner tax review does not match an explicit checkout tax mapping", "Each active SKU requires one explicit pack review",
    "VE-OPC: variant or price has changed since commercial review", "Exactly one active default variant is required",
    "VE-OPC: explicit stock at an active warehouse is required (zero is allowed)", "VE-OPC: stock state is inconsistent",
  ];
  assert.deepEqual(uncoveredReasons(known), []);
  assert.deepEqual(uncoveredReasons([...known, "A rule added next month"]), ["A rule added next month"]);
});

const shown: CatalogState = { visible: true, purchasable: true, action: "buy", reasons: [] };
const front: StorefrontInput = {
  status: "published", state: shown, categoryName: "Cement", categoryActive: true, brandName: "UltraTech", brandActive: true,
  availableUnits: 40, orderingOpen: true, serviceablePincodes: 12,
};

test("published, in stock, in a delivery area, ordering open: customers can buy it", () => {
  const r = storefrontLines(front);
  assert.equal(r.headline, "Customers can see this product and buy it.");
  assert.ok(r.lines.every((l) => l.tone === "ok"));
});

test("zero stock, no delivery area, or catalogue mode each stop a purchase and say which", () => {
  const stock = storefrontLines({ ...front, availableUnits: 0 });
  assert.equal(stock.headline, "Customers can see this product but cannot buy it yet.");
  assert.deepEqual(stock.lines.filter((l) => l.tone === "no").map((l) => l.label), ["Stock"]);

  const area = storefrontLines({ ...front, serviceablePincodes: 0 });
  assert.deepEqual(area.lines.filter((l) => l.tone === "no").map((l) => l.label), ["Delivery area"]);

  const catalogue = storefrontLines({
    ...front, orderingOpen: false,
    state: { visible: true, purchasable: false, action: "enquire", reasons: [{ code: "ORDERING_CLOSED", layer: "commerce", blocks: "purchase", message: "x" }] },
  });
  assert.equal(catalogue.headline, "Customers can see this product and send an enquiry. They cannot buy it.");
  assert.equal(catalogue.lines.find((l) => l.label === "Ordering")?.tone, "note");
});

test("a category switched off in Launch control hides a published product and links there", () => {
  const r = storefrontLines({
    ...front, categoryActive: false,
    state: { visible: false, purchasable: false, action: "hidden", reasons: [{ code: "CATEGORY_HIDDEN", layer: "exposure", blocks: "visibility", message: "The category is switched off" }] },
  });
  assert.equal(r.headline, "Customers cannot see this product.");
  const category = r.lines.find((l) => l.label === "Category");
  assert.equal(category?.tone, "no");
  assert.equal(category?.href, "/admin/launch-control");
});

test("a draft says only that it is not shown; stock and delivery are not claimed for it", () => {
  const r = storefrontLines({
    ...front, status: "draft",
    state: { visible: false, purchasable: false, action: "hidden", reasons: [{ code: "STATUS_DRAFT", layer: "exposure", blocks: "visibility", message: "The product is a draft" }] },
  });
  assert.equal(r.headline, "Customers cannot see this product.");
  assert.deepEqual(r.lines.map((l) => l.label), ["Shown to customers", "Category", "Brand", "Ordering"]);
});

test("the four statuses each have an operator-language meaning", () => {
  assert.deepEqual(Object.keys(STATUS_MEANING).sort(), ["archived", "catalog_only", "draft", "published"]);
  assert.match(STATUS_MEANING.archived.meaning, /old orders/);
  assert.match(STATUS_MEANING.catalog_only.meaning, /Never sold/);
});
