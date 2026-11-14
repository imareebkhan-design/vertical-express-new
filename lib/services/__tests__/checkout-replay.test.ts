import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { placeOrder } from "../checkout";

/**
 * An idempotent replay of an order still awaiting payment hands back its
 * Razorpay order (closure-loop review, P1). It used to return
 * `requiresPaymentConfirmation` with no gateway order, the client read that as
 * a COD/test order and sent the customer to the confirmation page of an order
 * nobody had paid for.
 */

const USER = randomUUID();
const TAG = `RPL${Date.now() % 1_000_000}`;
const ADDRESS = { label: "site", name: "Replay Test", phone: "9876543210", line1: "Plot 1", line2: null, landmark: null, city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" };

async function order(suffix: string, status: "pending_payment" | "confirmed", gatewayOrderId: string | null) {
  const key = `${TAG}-${suffix}-key`;
  const o = await db.order.create({
    data: {
      orderNo: `${TAG}-${suffix}`, userId: USER, address: ADDRESS, status, paymentMethod: "razorpay",
      subtotalPaise: 12000, totalPaise: 12000, idempotencyKey: key,
    },
  });
  await db.payment.create({ data: { orderId: o.id, gateway: "razorpay", amountPaise: 12000, status: "created", gatewayOrderId } });
  return { key, orderNo: o.orderNo };
}

const replay = (key: string) =>
  placeOrder({ userId: USER, addressId: randomUUID(), paymentMethod: "razorpay", idempotencyKey: key });

before(async () => {
  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
});

after(async () => {
  await db.payment.deleteMany({ where: { order: { userId: USER } } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.user.deleteMany({ where: { id: USER } });
});

test("a replay of an order awaiting payment returns its Razorpay order and amount", async () => {
  const gw = `order_${TAG}`;
  const { key, orderNo } = await order("PENDING", "pending_payment", gw);
  const r = await replay(key);
  assert.equal(r.orderNo, orderNo);
  assert.equal(r.requiresPaymentConfirmation, true);
  assert.equal(r.gatewayOrderId, gw, "the client needs this to reopen payment instead of 'confirming'");
  assert.equal(r.amountPaise, 12000);
});

test("a replay of a confirmed order asks for no payment and carries no gateway order", async () => {
  const { key } = await order("DONE", "confirmed", `order_${TAG}-done`);
  const r = await replay(key);
  assert.equal(r.requiresPaymentConfirmation, false);
  assert.equal(r.gatewayOrderId, undefined);
});
