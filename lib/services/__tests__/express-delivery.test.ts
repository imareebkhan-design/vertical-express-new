import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  resolveExpressOption,
  expressEligibleProductIds,
  expressFeePaise,
} from "@/lib/services/express-delivery";
import { SETTING_KEYS } from "@/lib/services/settings";

/**
 * The 60-minute run, as the owner set the rule.
 *
 *   A product is express-eligible or not — decided when it is listed.
 *   If eligible, it is eligible in named pincodes, also set at listing.
 *   Express to a pincode that offers it is charged.
 *   A cart mixing an eligible item with one that is not can go standard
 *   instead, together, at no extra delivery charge.
 *
 * Both halves have to agree. An eligible product with no pincode rows is
 * eligible nowhere, which is the correct reading of "we could, but we do not
 * yet" — and is the state every product is in until somebody lists one.
 *
 * The fee is a price, so it is the owner's and there is no fallback. Unset
 * means express is not offered, not that it is free: a paid service without a
 * price charges a number nobody chose, and a free one is a standing cost
 * nobody agreed to.
 */

const PIN_SERVED = "190002";
const PIN_OTHER = "190014";

let seq = 0;
const uniq = () => `zzz-exp-${Date.now()}-${seq++}`;

async function scratchProduct(opts: {
  eligible: boolean;
  pincodes: string[];
}): Promise<{ productId: string; variantId: string }> {
  const brand = await db.brand.findFirst({ select: { id: true } });
  const category = await db.category.findFirst({ select: { id: true } });
  assert.ok(brand && category, "the demo catalogue has no brand or category to attach to");

  const slug = uniq();
  const product = await db.product.create({
    data: {
      slug,
      title: `Scratch ${slug}`,
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per bag",
      status: "published",
      expressEligible: opts.eligible,
      expressPincodes: {
        create: opts.pincodes.map((pincode) => ({ pincode })),
      },
    },
  });
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      name: "default",
      sku: uniq(),
      pricePaise: 10000,
      isDefault: true,
      isActive: true,
    },
  });
  return { productId: product.id, variantId: variant.id };
}

async function setFee(paise: string | null) {
  if (paise === null) {
    await db.setting.deleteMany({ where: { key: SETTING_KEYS.expressFeePaise } });
    return;
  }
  await db.setting.upsert({
    where: { key: SETTING_KEYS.expressFeePaise },
    create: { key: SETTING_KEYS.expressFeePaise, value: paise },
    update: { value: paise },
  });
}

async function cleanup() {
  await db.product.deleteMany({ where: { slug: { startsWith: "zzz-exp-" } } });
  await setFee(null);
}

test("a pincode the product does not name gets no express", async (t) => {
  t.after(cleanup);
  await setFee("4900");
  const { productId, variantId } = await scratchProduct({
    eligible: true,
    pincodes: [PIN_SERVED],
  });

  const here = await resolveExpressOption([{ variantId, productId }], PIN_SERVED);
  assert.equal(here.available, true, "the pincode it names must be offered");

  const elsewhere = await resolveExpressOption([{ variantId, productId }], PIN_OTHER);
  assert.equal(elsewhere.available, false);
  assert.equal(elsewhere.reason, "no_eligible_items");
});

test("eligible with no pincodes is eligible nowhere", async (t) => {
  /* The state every product starts in. Listing a product must not silently
     promise an hour everywhere just because the switch defaults on somewhere. */
  t.after(cleanup);
  await setFee("4900");
  const { productId, variantId } = await scratchProduct({ eligible: true, pincodes: [] });

  const res = await resolveExpressOption([{ variantId, productId }], PIN_SERVED);
  assert.equal(res.available, false);
  assert.equal(res.reason, "no_eligible_items");
});

test("the switch wins over the pincode list", async (t) => {
  /* Turning express off keeps the pincodes, so it can be turned back on
     without setting them up again — but off must mean off in the meantime. */
  t.after(cleanup);
  await setFee("4900");
  const { productId, variantId } = await scratchProduct({
    eligible: false,
    pincodes: [PIN_SERVED],
  });

  const ids = await expressEligibleProductIds([productId], PIN_SERVED);
  assert.equal(ids.has(productId), false, "an ineligible product is offered express");

  const res = await resolveExpressOption([{ variantId, productId }], PIN_SERVED);
  assert.equal(res.available, false);
  assert.equal(res.reason, "no_eligible_items");

  const rows = await db.productExpressPincode.count({ where: { productId } });
  assert.equal(rows, 1, "turning express off discarded the pincode list");
});

test("express is not offered until it has a price", async (t) => {
  /* The whole reason this returns a reason rather than a boolean. Unset is not
     free — it is not offered, and the checkout can say so. */
  t.after(cleanup);
  await setFee(null);
  const { productId, variantId } = await scratchProduct({
    eligible: true,
    pincodes: [PIN_SERVED],
  });

  assert.equal(await expressFeePaise(), null);

  const res = await resolveExpressOption([{ variantId, productId }], PIN_SERVED);
  assert.equal(res.available, false);
  assert.equal(res.reason, "no_price", "an unpriced express service was offered anyway");
  assert.equal(res.feePaise, null);

  /* And a malformed price is unset, not a guess. */
  for (const bad of ["0", "-100", "4900.5", "free", ""]) {
    await setFee(bad);
    assert.equal(await expressFeePaise(), null, `"${bad}" resolved to a usable fee`);
  }
});

test("a mixed cart offers express on the eligible part and says so", async (t) => {
  /* The owner's case: two items, one cannot make the hour. Express stays
     available for what can, and the caller is told the cart is mixed so it can
     offer "everything together on standard" as the alternative rather than
     splitting the order without asking. */
  t.after(cleanup);
  await setFee("4900");
  const fast = await scratchProduct({ eligible: true, pincodes: [PIN_SERVED] });
  const slow = await scratchProduct({ eligible: false, pincodes: [] });

  const res = await resolveExpressOption(
    [
      { variantId: fast.variantId, productId: fast.productId },
      { variantId: slow.variantId, productId: slow.productId },
    ],
    PIN_SERVED
  );

  assert.equal(res.available, true);
  assert.equal(res.reason, "mixed_cart");
  assert.deepEqual(res.eligibleVariantIds, [fast.variantId]);
  assert.deepEqual(res.ineligibleVariantIds, [slow.variantId]);
  assert.equal(res.feePaise, 4900);
});

test("an unserviceable pincode is refused before anything else is asked", async (t) => {
  /* Cheapest correct answer, and the one that must not be confused with "no
     eligible items" — the customer needs to know we do not deliver there at
     all, not that these particular products are slow. */
  t.after(cleanup);
  await setFee("4900");
  const { productId, variantId } = await scratchProduct({
    eligible: true,
    pincodes: ["999999"],
  });

  const res = await resolveExpressOption([{ variantId, productId }], "999999");
  assert.equal(res.available, false);
  assert.equal(res.reason, "not_serviceable");
});

test("an empty cart asks for nothing", async (t) => {
  t.after(cleanup);
  await setFee("4900");
  const res = await resolveExpressOption([], PIN_SERVED);
  assert.equal(res.available, false);
  assert.equal(res.reason, "no_eligible_items");
});

/* ---- Reaching it from checkout ------------------------------------------
 *
 * `resolveExpressOption` was built and tested and nothing asked it, so no
 * customer could choose the 60-minute run however eligible their basket was.
 * These cover the half that was missing: computeTotals charging for it, and
 * refusing to charge when it is not on offer.
 */

import { computeTotals } from "@/lib/services/checkout";
import { getCartSummary } from "@/lib/services/cart";

async function cartFor(variantId: string, userId: string) {
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
  const cart = await db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await db.cartItem.create({ data: { cartId: cart.id, variantId, qty: 1 } });
  return getCartSummary(userId, null);
}

test("choosing express adds its fee to what is owed", async (t) => {
  t.after(cleanup);
  await setFee("4900");
  const { productId, variantId } = await scratchProduct({
    eligible: true,
    pincodes: [PIN_SERVED],
  });
  /* Stock, so the cart will hold it. */
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });
  await db.inventory.create({ data: { variantId, warehouseId: wh.id, qtyOnHand: 10 } });
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  const cart = await cartFor(variantId, user.id);
  assert.equal(cart.lines.length, 1, "the scratch product did not reach the cart");
  assert.equal(cart.lines[0].productId, productId, "the cart line carries no productId");

  const standard = await computeTotals(cart, PIN_SERVED, null, null, user.id, false);
  const express = await computeTotals(cart, PIN_SERVED, null, null, user.id, true);

  assert.equal(standard.expressChosen, false);
  assert.equal(express.expressChosen, true, "express was asked for and not applied");
  assert.equal(
    express.deliveryFeePaise - standard.deliveryFeePaise,
    4900,
    "the express fee was not charged"
  );
  assert.equal(
    express.totalPaise - standard.totalPaise,
    4900,
    "the express fee did not reach the total"
  );

  await db.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
});

test("asking for express when it is not on offer is quietly standard", async (t) => {
  /* The client cannot name what it pays. Asking for a service that is not
     available must not charge for one. */
  t.after(cleanup);
  await setFee(null); // no price set — express is not offered at all
  const { variantId } = await scratchProduct({ eligible: true, pincodes: [PIN_SERVED] });
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });
  await db.inventory.create({ data: { variantId, warehouseId: wh.id, qtyOnHand: 10 } });
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  const cart = await cartFor(variantId, user.id);
  const asked = await computeTotals(cart, PIN_SERVED, null, null, user.id, true);

  assert.equal(asked.express.available, false);
  assert.equal(asked.express.reason, "no_price");
  assert.equal(asked.expressChosen, false, "express was charged with no price set");

  const standard = await computeTotals(cart, PIN_SERVED, null, null, user.id, false);
  assert.equal(
    asked.deliveryFeePaise,
    standard.deliveryFeePaise,
    "asking for an unavailable express changed the price"
  );

  await db.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
});

test("the express fee survives the free-delivery threshold", async (t) => {
  /* The threshold zeroes the STANDARD fee over ₹500 — itself a rule nobody
     chose (ISS-030). Express is a paid upgrade the customer asked for, and
     nothing the owner has said makes it free above a spend. Flagged rather
     than assumed either way; this pins the behaviour so the decision is
     visible if it is ever revisited. */
  t.after(cleanup);
  await setFee("4900");
  const { variantId } = await scratchProduct({ eligible: true, pincodes: [PIN_SERVED] });
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });
  await db.inventory.create({ data: { variantId, warehouseId: wh.id, qtyOnHand: 100 } });
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  /* Well over the ₹500 threshold: 100 units at ₹100 each. */
  await db.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
  const cart0 = await db.cart.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  await db.cartItem.create({ data: { cartId: cart0.id, variantId, qty: 100 } });
  const cart = await getCartSummary(user.id, null);
  assert.equal(cart.qualifiesFreeDelivery, true, "the cart did not clear the threshold");

  const standard = await computeTotals(cart, PIN_SERVED, null, null, user.id, false);
  const express = await computeTotals(cart, PIN_SERVED, null, null, user.id, true);

  assert.equal(standard.deliveryFeePaise, 0, "the threshold did not zero the standard fee");
  assert.equal(
    express.deliveryFeePaise,
    4900,
    "the free-delivery threshold gave away the express upgrade"
  );

  await db.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
});
