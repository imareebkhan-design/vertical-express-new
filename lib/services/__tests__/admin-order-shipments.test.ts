import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { adminGetOrder } from "@/lib/services/admin/manage";

/**
 * The console's order page has to show the physical half of the order.
 *
 * It showed what was bought and nothing about how it reaches anybody — no
 * shipments, no delivery code, no warehouse. That is most of what a dispatcher
 * opens the page for, and the delivery code in particular is the number read
 * out when a customer rings to say the driver does not have one.
 *
 * This pins the loader: shipments come back, in sequence order, with their
 * codes and their lines. An order page that silently returned none would look
 * exactly like an order that has not been split yet.
 */
const made: { orders: string[]; users: string[] } = { orders: [], users: [] };

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
});

test("the admin order loader returns shipments, in order, with their codes", async () => {
  const user = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  made.users.push(user.id);

  const orderNo = `ADM-${Date.now()}`;
  const order = await db.order.create({
    data: {
      orderNo,
      userId: user.id,
      status: "confirmed",
      subtotalPaise: 10000, taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0, totalPaise: 10000,
      paymentMethod: "cod",
      address: { name: "Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      shipments: {
        create: [
          /* Created out of order on purpose — the page renders them as a
             sequence and must not depend on insertion order. */
          { sequence: 2, speedClass: "scheduled", status: "pending", deliveryCode: "8391" },
          { sequence: 1, speedClass: "express", status: "packed", deliveryCode: "4172" },
        ],
      },
    },
    select: { id: true },
  });
  made.orders.push(order.id);

  const loaded = await adminGetOrder(orderNo);
  assert.ok(loaded, "the order must load");
  assert.equal(loaded.shipments.length, 2, "both shipments must come back");
  assert.deepEqual(
    loaded.shipments.map((s) => s.sequence),
    [1, 2],
    "shipments must arrive in sequence, not insertion order"
  );
  assert.equal(loaded.shipments[0].deliveryCode, "4172", "the gate code must be readable");
});
