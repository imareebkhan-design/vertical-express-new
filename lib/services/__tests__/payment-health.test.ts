import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { adminPaymentHealth } from "@/lib/services/admin/stock";

/**
 * The payments screen's health figures.
 *
 * One of them matters more than the others: a payment marked `captured` whose
 * HMAC signature never verified means the gateway said one thing and our own
 * check said another. That is the shape of a forged callback, and it is exactly
 * what `signatureVerified` exists to record — so the console has to surface it
 * rather than average it away into "captured today".
 */
const made: { orders: string[]; users: string[] } = { orders: [], users: [] };

async function payment(status: "captured" | "failed" | "created", verified: boolean, amountPaise: number) {
  const user = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  made.users.push(user.id);

  const order = await db.order.create({
    data: {
      orderNo: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      status: "confirmed",
      subtotalPaise: amountPaise, taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0, totalPaise: amountPaise,
      paymentMethod: "razorpay",
      address: { name: "Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      payments: {
        create: [{ gateway: "razorpay", amountPaise, status, signatureVerified: verified }],
      },
    },
    select: { id: true },
  });
  made.orders.push(order.id);
}

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
});

test("captured today sums only captured payments", async () => {
  const before = await adminPaymentHealth();

  await payment("captured", true, 250000); // ₹2,500
  await payment("captured", true, 150000); // ₹1,500
  await payment("failed", false, 900000);  // not captured
  await payment("created", false, 700000); // never completed

  const after = await adminPaymentHealth();
  assert.equal(after.capturedPaise - before.capturedPaise, 400000);
  assert.equal(after.capturedCount - before.capturedCount, 2);
  assert.equal(after.failedCount - before.failedCount, 1);
});

test("a capture whose signature never verified is surfaced separately", async () => {
  /* THE ONE THAT MATTERS. The gateway said captured; our HMAC check disagreed.
     Folding it into "captured today" would hide the only row on the screen that
     should stop somebody's morning. */
  const before = await adminPaymentHealth();

  await payment("captured", false, 500000);

  const after = await adminPaymentHealth();
  assert.equal(
    after.unverifiedCapturedCount - before.unverifiedCapturedCount,
    1,
    "an unverified capture must be counted on its own"
  );
  assert.equal(
    after.capturedPaise - before.capturedPaise,
    500000,
    "it still counts toward the day's total — it is not excluded, it is flagged"
  );
});
