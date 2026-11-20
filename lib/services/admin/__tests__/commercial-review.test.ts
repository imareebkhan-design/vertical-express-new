import test, { after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { currentOffer, recordCommercialReview } from "@/lib/services/admin/commercial-review";
import { validateCommercialReadiness } from "@/lib/services/admin/commercial-readiness";
import { createApprovedCatalogueFixture } from "@/test-support/catalogue-fixtures";

/**
 * A price change clears the commercial review (database trigger) and the
 * product stops selling. Until 13 Nov 2026 nothing in the console could record
 * the review again — only QA/UAT scripts — so every routine price change needed
 * a developer. These pin the console path: it records exactly the offer the
 * operator saw, refuses one they did not see, and invents nothing.
 */
const ACTOR = { id: null, email: "owner@example.test" };
const REASON = "Checked against the supplier price list";
const cleanups: (() => Promise<void>)[] = [];
after(async () => { for (const c of cleanups.reverse()) await c(); });

async function fixture() {
  const f = await createApprovedCatalogueFixture();
  cleanups.push(async () => {
    await db.auditLog.deleteMany({ where: { entityId: { in: [f.product.id, f.variant.id] } } });
    await f.cleanup();
  });
  return f;
}
const listed = (id: string) => db.product.count({ where: { AND: [catalogListingWhere(), { id }] } });
/* A plain write, as any price control ends in; the database trigger does the clearing. */
const reprice = (variantId: string, pricePaise: number, compareAtPaise: number | null) =>
  db.productVariant.update({ where: { id: variantId }, data: { pricePaise, compareAtPaise } });

test("a price change takes the product off sale; recording the review puts it back, for exactly the new price", async () => {
  const f = await fixture();
  assert.deepEqual(await validateCommercialReadiness(db, f.product.id), []);
  await reprice(f.variant.id, 12500, 13000);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).commercialReview, null, "the trigger cleared it");
  assert.equal(await listed(f.product.id), 0);
  assert.ok((await validateCommercialReadiness(db, f.product.id)).length > 0);

  const seen = (await currentOffer(db, f.product.id))!;
  assert.deepEqual(await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: REASON, seen }), { ok: true, remaining: [] });

  assert.deepEqual(await validateCommercialReadiness(db, f.product.id), []);
  assert.equal(await listed(f.product.id), 1);
  const review = (await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).commercialReview as Record<string, unknown>;
  assert.equal(review.approvedBy, "owner@example.test");
  assert.equal(review.reason, REASON);
  assert.deepEqual((review.variants as { pricePaise: number; compareAtPaise: number }[]).map((v) => [v.pricePaise, v.compareAtPaise]), [[12500, 13000]]);

  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: f.product.id, action: "catalogue.commercial_review_recorded" } });
  assert.equal((audit.after as { approvedBy: string }).approvedBy, "owner@example.test");
  assert.deepEqual(audit.before, { review: null });
});

test("a review of a price the operator did not see is refused, and nothing is recorded", async () => {
  const f = await fixture();
  await reprice(f.variant.id, 12500, null);
  const seen = (await currentOffer(db, f.product.id))!;
  await reprice(f.variant.id, 99900, null); // someone else, another tab
  assert.deepEqual(await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: REASON, seen }), { ok: false, code: "STALE" });
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).commercialReview, null);
  assert.equal(await db.auditLog.count({ where: { entityId: f.product.id, action: "catalogue.commercial_review_recorded" } }), 0);
});

test("a tampered 'seen' cannot make the stored review say anything but what is stored", async () => {
  const f = await fixture();
  await reprice(f.variant.id, 12500, null);
  const seen = (await currentOffer(db, f.product.id))!;
  const forged = { ...seen, gstRatePct: 5, variants: seen.variants.map((v) => ({ ...v, pricePaise: 1 })) };
  assert.deepEqual(await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: REASON, seen: forged }), { ok: false, code: "STALE" });
});

test("a reason is required", async () => {
  const f = await fixture();
  const seen = (await currentOffer(db, f.product.id))!;
  assert.deepEqual(await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: "ok", seen }), { ok: false, code: "REASON_REQUIRED" });
});

test("no delivery class, or no tax mapping for the category: refused, never defaulted", async () => {
  const f = await fixture();
  await db.product.update({ where: { id: f.product.id }, data: { deliverySpeed: null } });
  let seen = (await currentOffer(db, f.product.id))!;
  let r = await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: REASON, seen });
  assert.equal(r.ok, false);
  assert.match((r as { detail?: string }).detail ?? "", /delivery class/);

  const untaxed = await db.category.create({ data: { slug: `zzz-untaxed-${Date.now()}`, name: "ZZZ untaxed" } });
  cleanups.push(async () => { await db.category.delete({ where: { id: untaxed.id } }); });
  await db.product.update({ where: { id: f.product.id }, data: { deliverySpeed: "scheduled", categoryId: untaxed.id } });
  seen = (await currentOffer(db, f.product.id))!;
  assert.equal(seen.gstRatePct, null);
  r = await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: REASON, seen });
  assert.equal(r.ok, false);
  assert.match((r as { detail?: string }).detail ?? "", /HSN and GST/);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).commercialReview, null);
  await db.product.update({ where: { id: f.product.id }, data: { categoryId: f.category.id } });
});

test("recording a review does not approve anything else: an unconfirmed identity still stops the sale, and is reported", async () => {
  const f = await fixture();
  await reprice(f.variant.id, 12500, null);
  await db.product.update({ where: { id: f.product.id }, data: { identityConfirmed: false } });
  const seen = (await currentOffer(db, f.product.id))!;
  const r = await recordCommercialReview({ productId: f.product.id, actor: ACTOR, reason: REASON, seen });
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.remaining.some((m) => /identity/i.test(m)));
  assert.equal(await listed(f.product.id), 0);
});
