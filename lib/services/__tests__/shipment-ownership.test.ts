import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getShipmentsForOrder } from "@/lib/services/shipments";

/**
 * The tracking screen shows the delivery code — the number a driver is asked for
 * at the gate before handing over the material. It is the one field in the
 * customer-facing app whose leak has a physical consequence, and order numbers
 * are sequential and guessable.
 *
 * So ownership is enforced inside the query rather than checked after it, and
 * this is the proof. A `findFirst` that dropped `userId` would pass every other
 * test in the suite and hand a stranger somebody else's code.
 */
const created: { users: string[]; orders: string[] } = { users: [], orders: [] };

async function makeCustomerWithOrder(orderNo: string) {
  const user = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  created.users.push(user.id);

  const order = await db.order.create({
    data: {
      orderNo,
      userId: user.id,
      status: "confirmed",
      subtotalPaise: 10000,
      taxPaise: 0,
      deliveryFeePaise: 0,
      discountPaise: 0,
      totalPaise: 10000,
      paymentMethod: "cod",
      address: { name: "Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      shipments: {
        create: [
          { sequence: 1, speedClass: "express", status: "out_for_delivery", deliveryCode: "4172" },
        ],
      },
    },
    select: { id: true },
  });
  created.orders.push(order.id);

  return { userId: user.id, orderNo };
}

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: created.orders } } });
  await db.user.deleteMany({ where: { id: { in: created.users } } });
});

test("the owner gets their shipments and their delivery code", async () => {
  const { userId, orderNo } = await makeCustomerWithOrder(`TRK-${Date.now()}-A`);

  const result = await getShipmentsForOrder(userId, orderNo);
  assert.ok(result, "the owner must be able to read their own order");
  assert.equal(result.shipments.length, 1);
  assert.equal(result.shipments[0].deliveryCode, "4172");
});

test("ANOTHER CUSTOMER GETS NOTHING, even with the exact order number", async () => {
  /* The whole point. Guessing an order number must not be enough. */
  const { orderNo } = await makeCustomerWithOrder(`TRK-${Date.now()}-B`);
  const stranger = await makeCustomerWithOrder(`TRK-${Date.now()}-C`);

  const result = await getShipmentsForOrder(stranger.userId, orderNo);
  assert.equal(result, null, "a stranger must not read another customer's shipments");
});

test("a missing order and someone else's order are indistinguishable", async () => {
  /* Both null. Returning a different shape for "exists but not yours" would
     confirm the order number is real, which is half of what an attacker
     enumerating them wants. */
  const { userId } = await makeCustomerWithOrder(`TRK-${Date.now()}-D`);

  const notMine = await getShipmentsForOrder(userId, `TRK-${Date.now()}-NEVER-EXISTED`);
  assert.equal(notMine, null);
});
