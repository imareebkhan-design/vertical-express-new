import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getDispatchBoard } from "@/lib/services/shipments";

/**
 * The dispatch board shows what is still in the warehouse.
 *
 * Two things it must get right, because both are decisions a person acts on
 * within minutes: a shipment already on the road is not waiting to be loaded,
 * and the oldest one comes first. On a dispatch board the thing that has waited
 * longest is the thing about to become a phone call, so ordering is not
 * cosmetic.
 */
const made: { orders: string[]; users: string[] } = { orders: [], users: [] };

async function shipment(status: string, speedClass: string, createdAt?: Date) {
  const user = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  made.users.push(user.id);

  const order = await db.order.create({
    data: {
      orderNo: `DSP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      status: "confirmed",
      subtotalPaise: 10000, taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0, totalPaise: 10000,
      paymentMethod: "razorpay",
      address: { name: "Hyderpora Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      shipments: {
        create: [{
          sequence: 1,
          speedClass: speedClass as never,
          status: status as never,
          ...(createdAt ? { createdAt } : {}),
        }],
      },
    },
    select: { id: true },
  });
  made.orders.push(order.id);
  return order.id;
}

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
});

test("only shipments still in the warehouse appear", async () => {
  const before = await getDispatchBoard();
  const n = before.express.length + before.scheduled.length;

  await shipment("pending", "express");
  await shipment("packed", "scheduled");
  await shipment("out_for_delivery", "express"); // gone
  await shipment("delivered", "scheduled");      // done
  await shipment("cancelled", "express");        // never happening

  const after = await getDispatchBoard();
  assert.equal(
    after.express.length + after.scheduled.length - n,
    2,
    "a shipment on the road or already delivered is not waiting to be loaded"
  );
});

test("express and heavy are separate lanes", async () => {
  /* The one lane distinction that is real: express leaves from the store,
     heavy goes on a truck. They are loaded by different people. */
  const before = await getDispatchBoard();

  await shipment("pending", "express");
  await shipment("pending", "scheduled");

  const after = await getDispatchBoard();
  assert.equal(after.express.length - before.express.length, 1);
  assert.equal(after.scheduled.length - before.scheduled.length, 1);
});

test("the longest wait comes first", async () => {
  /* Not cosmetic. The oldest shipment is the one about to become a complaint,
     and a dispatcher reads top-down. */
  const old = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const recent = new Date(Date.now() - 5 * 60 * 1000);

  await shipment("pending", "express", recent);
  await shipment("pending", "express", old);

  const board = await getDispatchBoard();
  const times = board.express.map((s) => new Date(s.waitingSince).getTime());
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted, "the board must be ordered oldest first");
});
