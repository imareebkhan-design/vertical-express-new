import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getOpsToday } from "@/lib/services/admin/today";

/**
 * The two figures a dispatcher runs the morning from.
 *
 * "Shipments to dispatch" decides how many runs go out; "COD to collect"
 * decides how much cash float goes on the vehicles. Both are new — the Today
 * screen showed neither, though the artboard leads with them and the Shipment
 * model has carried the data all along.
 *
 * What they must not do is count the wrong things. A shipment already out for
 * delivery is not waiting to be dispatched, and a delivered or cancelled order
 * is not cash anybody will be handed today. Counting either would send a driver
 * out with the wrong float, which is a real-world problem rather than a
 * cosmetic one.
 */
const made: { orders: string[]; users: string[] } = { orders: [], users: [] };

async function order(status: string, paymentMethod: "cod" | "razorpay", totalPaise: number, shipments: string[]) {
  const user = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  made.users.push(user.id);

  const o = await db.order.create({
    data: {
      orderNo: `OPS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      status: status as never,
      subtotalPaise: totalPaise, taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0, totalPaise,
      paymentMethod,
      address: { name: "Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      shipments: {
        create: shipments.map((st, i) => ({ sequence: i + 1, speedClass: "express", status: st as never })),
      },
    },
    select: { id: true },
  });
  made.orders.push(o.id);
}

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
});

test("only shipments still in the warehouse count as waiting to dispatch", async () => {
  const before = (await getOpsToday()).shipmentsToDispatch;

  await order("confirmed", "razorpay", 100000, ["pending", "packed"]);   // both waiting
  await order("out_for_delivery", "razorpay", 100000, ["out_for_delivery"]); // already gone
  await order("delivered", "razorpay", 100000, ["delivered"]);            // done

  const after = (await getOpsToday()).shipmentsToDispatch;
  assert.equal(after - before, 2, "a shipment already on the road is not waiting to be loaded");
});

test("COD to collect counts only cash a driver will actually be handed", async () => {
  const before = (await getOpsToday()).codToCollectPaise;

  await order("confirmed", "cod", 500000, ["pending"]);        // ₹5,000 — counts
  await order("out_for_delivery", "cod", 300000, ["out_for_delivery"]); // ₹3,000 — counts
  await order("delivered", "cod", 900000, ["delivered"]);      // already collected
  await order("cancelled", "cod", 700000, ["pending"]);        // never happening
  await order("confirmed", "razorpay", 400000, ["pending"]);   // already paid online

  const after = (await getOpsToday()).codToCollectPaise;
  assert.equal(
    after - before,
    800000,
    "only undelivered COD orders are cash the driver will be handed today"
  );
});
