import test from "node:test";
import assert from "node:assert/strict";
import { explainCatalogState, type CatalogStateSnapshot, type ReasonCode } from "@/lib/catalog-explain";

/**
 * The explainer on its own: one complete product, then each input broken in
 * turn, so every reason code is produced by exactly the input it names.
 * Agreement with the real storefront query is tested against the database in
 * lib/services/__tests__/catalog-explain-parity.test.ts.
 */

const NOW = new Date("2026-11-09T00:00:00Z");

function complete(over: Partial<CatalogStateSnapshot> = {}): CatalogStateSnapshot {
  return {
    slug: "opc-53-test",
    status: "published",
    identityConfirmed: true,
    identityApprovedAt: NOW,
    identityApprovedBy: "reviewer",
    identityApprovalReason: "Checked against the bag",
    commercialReview: { approvedBy: "owner" },
    brand: { isActive: true },
    category: { isActive: true },
    images: [{
      licence: "manufacturer-official-dealer-use", sourceVerified: true, identityApproved: true,
      approvalStatus: "APPROVED_EXACT", severity: null, approvedAt: NOW, approvedBy: "reviewer",
      approvalReason: "Exact pack", sha256: "a".repeat(64),
    }],
    variants: [{ isDefault: true, isActive: true, pricePaise: 45000, inventory: [{ warehouse: { isActive: true } }] }],
    ...over,
  };
}

const OPEN = { orderingOpen: true, strict: true, commercialIssues: [] as string[] };
const codes = (s: ReturnType<typeof explainCatalogState>) => s.reasons.map((r) => r.code);

test("a complete published product is visible and bought when ordering is open", () => {
  assert.deepEqual(explainCatalogState(complete(), OPEN), { visible: true, purchasable: true, action: "buy", reasons: [] });
});

test("catalogue mode: the same product is visible but takes an enquiry", () => {
  const s = explainCatalogState(complete(), { ...OPEN, orderingOpen: false });
  assert.equal(s.visible, true);
  assert.equal(s.action, "enquire");
  assert.deepEqual(codes(s), ["ORDERING_CLOSED"]);
  assert.equal(s.reasons[0].layer, "commerce");
});

test("without a commercial check, purchasability is unknown rather than guessed", () => {
  const s = explainCatalogState(complete(), { orderingOpen: true, strict: true });
  assert.equal(s.purchasable, null);
  assert.equal(s.action, "unknown");
});

test("a failing commercial check keeps the product visible and explains the refusal", () => {
  const s = explainCatalogState(complete(), { ...OPEN, commercialIssues: ["SKU-1: variant or price has changed since commercial review"] });
  assert.equal(s.visible, true);
  assert.equal(s.action, "enquire");
  assert.equal(s.reasons[0].code, "COMMERCIAL_CHECK_FAILED");
  assert.match(s.reasons[0].detail ?? "", /changed since commercial review/);
});

const hidden: [string, Partial<CatalogStateSnapshot>, ReasonCode][] = [
  ["draft", { status: "draft" }, "STATUS_DRAFT"],
  ["archived", { status: "archived" }, "STATUS_ARCHIVED"],
  ["category off", { category: { isActive: false } }, "CATEGORY_HIDDEN"],
  ["brand off", { brand: { isActive: false } }, "BRAND_HIDDEN"],
  ["staging test slug", { slug: "qa-staging-checkout-item" }, "QA_FIXTURE_IN_STRICT"],
  ["identity unconfirmed", { identityConfirmed: false }, "IDENTITY_UNCONFIRMED"],
  ["identity approver blank", { identityApprovedBy: "" }, "IDENTITY_UNCONFIRMED"],
  ["no primary photo", { images: [] }, "PHOTO_UNAPPROVED"],
  ["no commercial review", { commercialReview: null }, "NO_COMMERCIAL_REVIEW"],
  ["review with blank approver", { commercialReview: { approvedBy: "" } }, "NO_COMMERCIAL_REVIEW"],
  ["no default variant", { variants: [{ isDefault: false, isActive: true, pricePaise: 100, inventory: [{ warehouse: { isActive: true } }] }] }, "NO_ACTIVE_DEFAULT_VARIANT"],
  ["zero-priced extra SKU", { variants: [
    { isDefault: true, isActive: true, pricePaise: 100, inventory: [{ warehouse: { isActive: true } }] },
    { isDefault: false, isActive: true, pricePaise: 0, inventory: [{ warehouse: { isActive: true } }] },
  ] }, "VARIANT_PRICE_INVALID"],
  ["stock only at a closed warehouse", { variants: [{ isDefault: true, isActive: true, pricePaise: 100, inventory: [{ warehouse: { isActive: false } }] }] }, "NO_STOCK_RECORD"],
];

for (const [name, over, code] of hidden) {
  test(`hidden: ${name} → ${code}`, () => {
    const s = explainCatalogState(complete(over), OPEN);
    assert.equal(s.visible, false);
    assert.equal(s.action, "hidden");
    assert.deepEqual(codes(s), [code]);
    assert.equal(s.reasons[0].blocks, "visibility");
  });
}

test("every reason that applies is reported, not just the first", () => {
  const s = explainCatalogState(complete({ status: "draft", category: { isActive: false }, brand: { isActive: false } }), OPEN);
  assert.deepEqual(codes(s), ["STATUS_DRAFT", "CATEGORY_HIDDEN", "BRAND_HIDDEN"]);
});

test("an inactive variant's problems do not count; an inactive default does", () => {
  const retired = { isDefault: false, isActive: false, pricePaise: 0, inventory: [] };
  assert.equal(explainCatalogState(complete({ variants: [...complete().variants, retired] }), OPEN).visible, true);
  const s = explainCatalogState(complete({ variants: [{ ...complete().variants[0], isActive: false }] }), OPEN);
  assert.deepEqual(codes(s), ["NO_ACTIVE_DEFAULT_VARIANT"]);
});

test("photo: licence is required only under production rules, and says so", () => {
  const unattested = complete({ images: [{ ...complete().images[0], licence: "uat-test-only" }] });
  assert.deepEqual(codes(explainCatalogState(unattested, OPEN)), ["PHOTO_LICENCE_UNATTESTED"]);
  assert.equal(explainCatalogState(unattested, { ...OPEN, strict: false }).visible, true);
  const p1 = complete({ images: [{ ...complete().images[0], severity: "P1" }] });
  assert.deepEqual(codes(explainCatalogState(p1, OPEN)), ["PHOTO_UNAPPROVED"]);
  const limited = complete({ images: [{ ...complete().images[0], approvalStatus: "APPROVED_WITH_LIMITATION", severity: "P3" }] });
  assert.equal(explainCatalogState(limited, OPEN).visible, true);
});

test("staging test products are visible outside production rules", () => {
  assert.equal(explainCatalogState(complete({ slug: "qa-staging-checkout-item" }), { ...OPEN, strict: false }).visible, true);
});

test("catalogue-only: shown with an enquiry in catalogue mode, hidden while ordering is open", () => {
  const p = complete({ status: "catalog_only", commercialReview: null, variants: [] });
  const catalogue = explainCatalogState(p, { orderingOpen: false, strict: true });
  assert.equal(catalogue.visible, true);
  assert.equal(catalogue.action, "enquire");
  assert.deepEqual(codes(catalogue), ["NOT_PUBLISHED", "ORDERING_CLOSED"]);
  const open = explainCatalogState(p, OPEN);
  assert.equal(open.visible, false);
  assert.deepEqual(codes(open), ["STATUS_CATALOG_ONLY_NOT_SHOWN"]);
});

test("catalogue mode does not rescue an incomplete published product", () => {
  const s = explainCatalogState(complete({ commercialReview: null }), { orderingOpen: false, strict: true });
  assert.equal(s.visible, false);
  assert.deepEqual(codes(s), ["NO_COMMERCIAL_REVIEW"]);
});
