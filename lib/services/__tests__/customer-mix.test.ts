import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { adminCustomerMix } from "@/lib/services/admin/stock";

/**
 * Repeat rate is the number that says whether this business works.
 *
 * A construction supplier lives on the same contractor coming back every
 * fortnight, not on acquisition. Which makes the denominator the whole
 * argument: counting customers who have never ordered would move the figure
 * with marketing spend rather than with the product, and it would fall every
 * time a campaign ran well.
 *
 * So only customers who have ordered are counted, and cancelled orders do not
 * make somebody a customer.
 */
const made: { users: string[]; orders: string[] } = { users: [], orders: [] };

async function customer(orderStatuses: string[]) {
  const u = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  made.users.push(u.id);

  for (const status of orderStatuses) {
    const o = await db.order.create({
      data: {
        orderNo: `MIX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: u.id,
        status: status as never,
        subtotalPaise: 1000, taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0, totalPaise: 1000,
        paymentMethod: "cod",
        address: { name: "S", phone: "9876543210", line1: "P", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      },
      select: { id: true },
    });
    made.orders.push(o.id);
  }
  return u.id;
}

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.profile.deleteMany({ where: { userId: { in: made.users } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
});

test("repeat rate counts only customers who have actually ordered", async () => {
  const before = await adminCustomerMix();

  await customer([]);                            // never ordered — not a denominator
  await customer(["delivered"]);                 // ordered once
  await customer(["delivered", "delivered"]);    // came back

  const after = await adminCustomerMix();
  assert.equal(after.orderingCustomers - before.orderingCustomers, 2, "the never-ordered customer is excluded");
  assert.equal(after.repeatCustomers - before.repeatCustomers, 1);
});

test("a cancelled order does not make somebody a returning customer", async () => {
  /* Otherwise the figure improves every time an order falls through, which is
     exactly backwards. */
  const before = await adminCustomerMix();

  await customer(["delivered", "cancelled"]);

  const after = await adminCustomerMix();
  assert.equal(after.orderingCustomers - before.orderingCustomers, 1);
  assert.equal(
    after.repeatCustomers - before.repeatCustomers,
    0,
    "one real order plus one cancelled is not a repeat customer"
  );
});

test("buyer type that was never asked is its own bucket", async () => {
  /* The onboarding question is skippable, so most rows will be unknown for a
     while. Folding those into homeowners would report a made-up mix. */
  const before = await adminCustomerMix();

  const id = await customer([]);
  await db.profile.create({ data: { userId: id, buyerType: "contractor" } });

  const after = await adminCustomerMix();
  assert.equal(after.mix.contractor - before.mix.contractor, 1);
  assert.equal(after.mix.homeowner - before.mix.homeowner, 0, "an unanswered question is not a homeowner");
});
