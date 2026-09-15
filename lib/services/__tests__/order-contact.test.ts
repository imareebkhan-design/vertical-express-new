import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/services/checkout";
import type { OrderAddressSnapshot } from "@/lib/services/orders";

/**
 * Where an order's confirmation goes.
 *
 * THE GAP THIS CLOSES
 *
 * `emailOrderConfirmation` opened with `if (!toEmail) return`, reading
 * `user.email`. A phone sign-in carries no email — and phone is this market's
 * default identity — so the customer most likely to order was the one who
 * heard nothing back at all. There is no SMS channel yet: SMS in India needs
 * DLT registration, which is paperwork with a lead time, not code.
 *
 * So checkout asks for an address, optionally, and stores it **on the order**.
 * Not on the user: `User.email` is `@unique`, so writing a typed address there
 * can collide with somebody else's account, and an unverified address attached
 * to an identity is exactly what `getAdminUser`'s `email_verified` check exists
 * to refuse. "Where to send this receipt" and "who this is" are different
 * claims and only the first is being made.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

let seq = 0;

/** A phone-only customer, which is the case that was broken. */
async function scratchPhoneCustomer() {
  /* The variant with the most stock, not an arbitrary one. Each test here
     places a real order, so an arbitrary pick drains and the third test fails
     with OUT_OF_STOCK — which says nothing about what it is testing. */
  const inventory = await db.inventory.findFirstOrThrow({
    where: { variant: { isActive: true }, qtyOnHand: { gt: 50 } },
    orderBy: { qtyOnHand: "desc" },
    select: { variantId: true },
  });
  const variant = { id: inventory.variantId };
  const pincode = await db.serviceablePincode.findFirstOrThrow({
    where: { isActive: true },
    select: { pincode: true },
  });

  const user = await db.user.create({
    data: {
      /* `User.id` carries no database default — it is the Firebase uid in
         production, supplied by the caller. */
      id: randomUUID(),
      phone: `+9199${String(Date.now()).slice(-8)}${seq++}`,
      /* The whole point: no email on the account. */
      email: null,
      role: "customer",
      cart: { create: { items: { create: { variantId: variant.id, qty: 1 } } } },
      addresses: {
        create: {
          label: "site",
          name: "ZZZ Contact Test",
          phone: "+919000000999",
          line1: "Plot 1",
          city: "Srinagar",
          state: "Jammu & Kashmir",
          pincode: pincode.pincode.trim(),
          isDefault: true,
        },
      },
    },
    include: { addresses: true },
  });

  return { userId: user.id, addressId: user.addresses[0].id };
}

async function cleanup() {
  const users = await db.user.findMany({
    where: { profile: { is: { fullName: { startsWith: "ZZZ Contact" } } } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.order.deleteMany({ where: { address: { path: ["name"], equals: "ZZZ Contact Test" } } });
  if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { addresses: { some: { name: "ZZZ Contact Test" } } } });
}

test("a phone-only customer's typed address is stored on the order", async (t) => {
  t.after(cleanup);
  const { userId, addressId } = await scratchPhoneCustomer();

  const res = await placeOrder({
    userId,
    addressId,
    paymentMethod: "cod",
    contactEmail: "site.office@example.invalid",
  });

  const order = await db.order.findFirstOrThrow({
    where: { orderNo: res.orderNo },
    select: { address: true },
  });
  const addr = order.address as unknown as OrderAddressSnapshot;
  assert.equal(
    addr.email,
    "site.office@example.invalid",
    "the address the customer typed did not reach the order, so the receipt has nowhere to go"
  );
});

test("the account is not quietly given an email it never verified", async (t) => {
  /* `User.email` is unique and is an identity claim. Writing a typed address
     there could collide with somebody else's account, and an unverified
     address on an identity is what the admin gate refuses by design. */
  t.after(cleanup);
  const { userId, addressId } = await scratchPhoneCustomer();

  await placeOrder({
    userId,
    addressId,
    paymentMethod: "cod",
    contactEmail: "someone.else@example.invalid",
  });

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  assert.equal(user.email, null, "an unverified address was written onto the user record");
});

test("no address given leaves the order exactly as it was before", async (t) => {
  /* The field is optional and an order must never be blocked on it. An absent
     key has to read the same as it always did for accounts that have an email
     of their own. */
  t.after(cleanup);
  const { userId, addressId } = await scratchPhoneCustomer();

  const res = await placeOrder({ userId, addressId, paymentMethod: "cod" });

  const order = await db.order.findFirstOrThrow({
    where: { orderNo: res.orderNo },
    select: { address: true },
  });
  const addr = order.address as unknown as OrderAddressSnapshot;
  assert.ok(!("email" in addr), "an email key was written when none was given");
  assert.equal(addr.pincode.length, 6, "the rest of the snapshot is intact");
});

test("the confirmation prefers the order's address over the account's", () => {
  /* Source order matters: the account email is the fallback, not the source.
     Reading `user.email` first would send a phone customer's receipt nowhere
     while an address sat on the order. */
  const src = readFileSync(join(ROOT, "actions/checkout.ts"), "utf8");
  assert.match(
    src,
    /const toEmail = addr\?\.email \?\? accountEmail/,
    "the confirmation no longer prefers the address stored on the order"
  );
  assert.ok(
    !/async function emailOrderConfirmation\([^)]*\)\s*\{\s*if \(!toEmail\) return;/.test(src),
    "the early return on the account email is back — a phone customer gets nothing again"
  );
});

test("both checkout surfaces send the coupon they charged for", () => {
  /* ISS-011, found again on the mobile view. That screen applies a coupon and
     renders the discounted total, then placed the order without the code — so
     the customer saw one price and was charged another. It was fixed on the
     desktop view and left here, on the surface this market actually uses.
     Verified to fail when `couponCode` is removed from either call. */
  for (const rel of [
    "components/shop/checkout-view.tsx",
    "components/mobile/checkout/mobile-checkout-view.tsx",
  ]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const call = /placeOrder\(\{[\s\S]*?\}\)/.exec(src);
    assert.ok(call, `${rel} no longer calls placeOrder`);
    assert.match(
      call[0],
      /couponCode/,
      `${rel} shows a discounted total and places the order without the coupon — ` +
        `the customer is charged a price they were not shown`
    );
    assert.match(
      call[0],
      /contactEmail/,
      `${rel} does not pass the contact address, so a phone-only customer hears nothing`
    );
  }
});
