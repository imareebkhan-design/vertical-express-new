import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";
import { sellableReasons } from "@/lib/services/admin/publish-guard";
import {
  prepareUatTestApprovals, revertUatTestApprovals, UAT_APPROVAL_ACTION, UAT_APPROVER, UAT_IMAGE_LICENCE,
} from "@/lib/services/admin/uat-approvals";

const HASH = "a".repeat(64);
const sha = async () => HASH;
const rollback = new Error("rollback test");

/** One seeded product with an MRP on its variant, put back to the unapproved seed state. */
async function unapprovedProductWithMrp(tx: Prisma.TransactionClient) {
  const v = await tx.productVariant.findFirstOrThrow({
    where: {
      isActive: true, compareAtPaise: { gt: 0 },
      product: { status: "published", slug: { not: { startsWith: "qa-staging-" } }, category: { slug: "painting" }, images: { some: { isPrimary: true } } },
    },
    include: { product: true },
  });
  const w = await tx.warehouse.findFirstOrThrow({ where: { isActive: true } });
  await tx.inventory.upsert({
    where: { variantId_warehouseId: { variantId: v.id, warehouseId: w.id } },
    create: { variantId: v.id, warehouseId: w.id, qtyOnHand: 50 }, update: { qtyOnHand: 50, qtyReserved: 0 },
  });
  /* A discount below MRP, like the seed; then the photo back to "needs review". */
  await tx.productVariant.update({ where: { id: v.id }, data: { pricePaise: v.compareAtPaise! - 100 } });
  const img = await tx.productImage.findFirstOrThrow({ where: { productId: v.productId, isPrimary: true } });
  await tx.productImage.update({ where: { id: img.id }, data: { sha256: null, licence: null } });
  await tx.product.update({ where: { id: v.productId }, data: { identityConfirmed: false, identityApprovedAt: null, identityApprovedBy: null, identityApprovalReason: null } });
  return { variantId: v.id, productId: v.productId, slug: v.product.slug, mrp: v.compareAtPaise!, imageId: img.id };
}

test("UAT approvals price at stored MRP, label every approval as test-only, and leave the product sellable", async () => {
  await assert.rejects(db.$transaction(async tx => {
    const t = await unapprovedProductWithMrp(tx);
    assert.notDeepEqual(await sellableReasons(tx, t.productId), []);

    const result = await prepareUatTestApprovals(tx, sha);
    assert.ok(result.approved.includes(t.slug));

    const v = await tx.productVariant.findUniqueOrThrow({ where: { id: t.variantId } });
    assert.equal(v.pricePaise, t.mrp, "selling price equals the stored MRP — no discount");
    const p = await tx.product.findUniqueOrThrow({ where: { id: t.productId } });
    assert.equal(p.identityApprovedBy, UAT_APPROVER);
    assert.equal((p.commercialReview as { approvedBy: string }).approvedBy, UAT_APPROVER);
    const img = await tx.productImage.findUniqueOrThrow({ where: { id: t.imageId } });
    assert.equal(img.licence, UAT_IMAGE_LICENCE);
    assert.equal(img.sha256, HASH);
    assert.equal(img.approvedBy, UAT_APPROVER);
    assert.deepEqual(await sellableReasons(tx, t.productId), []);
    assert.equal(await tx.auditLog.count({ where: { action: UAT_APPROVAL_ACTION, entityId: t.productId } }), 1);
    throw rollback;
  }, { timeout: 60_000 }), e => e === rollback);
});

test("UAT approvals are idempotent and never touch a product without an MRP", async () => {
  await assert.rejects(db.$transaction(async tx => {
    const t = await unapprovedProductWithMrp(tx);
    const noMrp = await tx.productVariant.findFirstOrThrow({
      where: { isActive: true, productId: { not: t.productId }, product: { status: "published", slug: { not: { startsWith: "qa-staging-" } } } },
    });
    await tx.productVariant.update({ where: { id: noMrp.id }, data: { compareAtPaise: null } });
    const priceBefore = (await tx.productVariant.findUniqueOrThrow({ where: { id: noMrp.id } })).pricePaise;

    const first = await prepareUatTestApprovals(tx, sha);
    assert.ok(first.approved.includes(t.slug));
    assert.equal((await tx.productVariant.findUniqueOrThrow({ where: { id: noMrp.id } })).pricePaise, priceBefore);

    /* A tester buys stock and the price is edited afterwards: a rerun changes nothing. */
    await tx.productVariant.update({ where: { id: t.variantId }, data: { pricePaise: t.mrp - 1 } });
    const again = await prepareUatTestApprovals(tx, sha);
    assert.equal(again.approved.length, 0);
    assert.ok(again.alreadyApproved.includes(t.slug));
    assert.equal((await tx.productVariant.findUniqueOrThrow({ where: { id: t.variantId } })).pricePaise, t.mrp - 1);
    assert.equal(await tx.auditLog.count({ where: { action: UAT_APPROVAL_ACTION, entityId: t.productId } }), 1);
    throw rollback;
  }, { timeout: 60_000 }), e => e === rollback);
});

test("Reverting UAT approvals restores the prior price, photo and identity state", async () => {
  await assert.rejects(db.$transaction(async tx => {
    const t = await unapprovedProductWithMrp(tx);
    const before = {
      price: (await tx.productVariant.findUniqueOrThrow({ where: { id: t.variantId } })).pricePaise,
      image: await tx.productImage.findUniqueOrThrow({ where: { id: t.imageId }, select: { sha256: true, licence: true, approvalStatus: true, approvedBy: true } }),
      identity: (await tx.product.findUniqueOrThrow({ where: { id: t.productId } })).identityConfirmed,
    };
    await prepareUatTestApprovals(tx, sha);
    const reverted = await revertUatTestApprovals(tx);
    assert.ok(reverted.includes(t.slug));
    assert.equal((await tx.productVariant.findUniqueOrThrow({ where: { id: t.variantId } })).pricePaise, before.price);
    assert.deepEqual(
      await tx.productImage.findUniqueOrThrow({ where: { id: t.imageId }, select: { sha256: true, licence: true, approvalStatus: true, approvedBy: true } }),
      before.image,
    );
    assert.equal((await tx.product.findUniqueOrThrow({ where: { id: t.productId } })).identityConfirmed, before.identity);
    assert.deepEqual(await revertUatTestApprovals(tx), [], "a second revert does nothing");
    /* After a revert, the initializer may run again. */
    assert.ok((await prepareUatTestApprovals(tx, sha)).approved.includes(t.slug));
    throw rollback;
  }, { timeout: 60_000 }), e => e === rollback);
});
