import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { listCapturedPaymentsOnDeadOrders, listDuplicateCaptures } from "@/lib/services/checkout";
import { checkRefundWithGateway, isDefiniteRefusal, requestRefund } from "@/lib/services/refunds";
import type { GatewayRefund, RefundAccepted } from "@/lib/services/payments";

/**
 * Refunds of money that was never owed (ISS-025).
 *
 * Invariants:
 *   - Razorpay is asked at most once per payment while a refund is in flight;
 *   - only a definite refusal frees a payment for another attempt;
 *   - a payment becomes `refunded` only when processed refunds cover it;
 *   - a live order's only payment is never refundable here (that is policy);
 *   - the webhook and the dashboard reconcile into the same rows.
 */

const WEBHOOK_SECRET = "test-webhook-secret-not-real";
const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
let userId: string;
const orderIds: string[] = [];

before(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  userId = (
    await db.user.create({ data: { id: randomUUID(), firebaseUid: `uid-refund-${randomUUID().slice(0, 8)}`, phone: `+9196${String(Math.random()).slice(2, 10)}` } })
  ).id;
});

after(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret;
  await db.paymentRefund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.auditLog.deleteMany({ where: { entityType: "payment", action: { startsWith: "payment.refund" } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.delete({ where: { id: userId } });
});

async function makeOrder(opts: { status?: "cancelled" | "confirmed"; captures?: number; amount?: number } = {}) {
  const amount = opts.amount ?? 39800;
  const order = await db.order.create({
    data: {
      orderNo: `ZZZRF-${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status: opts.status ?? "cancelled",
      paymentMethod: "razorpay",
      subtotalPaise: amount,
      totalPaise: amount,
    },
  });
  orderIds.push(order.id);
  const payments = [];
  for (let i = 0; i < (opts.captures ?? 1); i++) {
    payments.push(
      await db.payment.create({
        data: {
          orderId: order.id,
          gateway: "razorpay",
          gatewayOrderId: `order_${randomUUID().slice(0, 14)}`,
          gatewayPaymentId: `pay_${randomUUID().slice(0, 14)}`,
          amountPaise: amount,
          status: "captured",
          signatureVerified: true,
          createdAt: new Date(Date.now() - (10 - i) * 1000),
        },
      })
    );
  }
  return { order, payments, amount };
}

type Call = { paymentId: string; amount: number; receipt?: string };
function gateway(answer: (c: Call) => Promise<RefundAccepted> | RefundAccepted) {
  const calls: Call[] = [];
  return {
    calls,
    provider: {
      async refundPayment(paymentId: string, amount: number, receipt?: string) {
        const c = { paymentId, amount, receipt };
        calls.push(c);
        return answer(c);
      },
    },
  };
}
const accepted = (status: "processed" | "pending" = "processed") => () => ({ refundId: `rfnd_${randomUUID().slice(0, 14)}`, status });

function refundHook(event: string, entity: Record<string, unknown>) {
  const raw = JSON.stringify({ event, payload: { refund: { entity }, payment: { entity: { id: entity.payment_id } } } });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return webhook(
    new NextRequest("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      body: raw,
      headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": `evt_${randomUUID().slice(0, 10)}` },
    })
  );
}

const REASON = "Order cancelled after payment was captured";
const ADMIN = { actorEmail: "ops@example.test" };

test("a captured payment on a cancelled order is refunded in full, recorded, and leaves the worklist", async () => {
  const { payments, amount } = await makeOrder();
  const gw = gateway(accepted("processed"));
  const out = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw);
  assert.equal(out.ok, true);
  assert.equal(gw.calls.length, 1);
  assert.equal(gw.calls[0].paymentId, payments[0].gatewayPaymentId);
  assert.equal(gw.calls[0].amount, amount);
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  assert.equal(gw.calls[0].receipt, row.id, "the receipt is our row id, so the webhook can find it");
  assert.equal(row.status, "processed");
  assert.equal(row.reason, REASON);
  assert.ok(row.gatewayRefundId);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "refunded");
  const audit = await db.auditLog.findMany({ where: { entityId: payments[0].id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(audit.map((a) => a.action), ["payment.refund_requested", "payment.refund_processed"]);
  assert.ok(!(await listCapturedPaymentsOnDeadOrders()).some((p) => p.id === payments[0].id));
});

test("a live order's only payment is not refundable here, and Razorpay is never asked", async () => {
  const { payments } = await makeOrder({ status: "confirmed" });
  const gw = gateway(accepted());
  const out = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw);
  assert.deepEqual(out, { ok: false, code: "NOT_OWED" });
  assert.equal(gw.calls.length, 0);
  assert.equal(await db.paymentRefund.count({ where: { paymentId: payments[0].id } }), 0);
});

test("on a twice-paid live order, the second capture is refundable and the first is not", async () => {
  const { payments } = await makeOrder({ status: "confirmed", captures: 2 });
  assert.ok((await listDuplicateCaptures()).some((p) => p.id === payments[1].id));
  const gw = gateway(accepted());
  assert.deepEqual(await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw), { ok: false, code: "NOT_OWED" });
  const second = await requestRefund({ paymentId: payments[1].id, reason: REASON, ...ADMIN }, gw);
  assert.equal(second.ok, true);
  assert.equal(gw.calls.length, 1);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "captured");
  assert.ok(!(await listDuplicateCaptures()).some((p) => p.id === payments[1].id));
});

test("two operators refunding the same payment at once ask Razorpay exactly once", async () => {
  const { payments } = await makeOrder();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const gw = gateway(async () => {
    await gate;
    return accepted()();
  });
  const a = requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw);
  const b = requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw);
  await new Promise((r) => setTimeout(r, 200));
  release();
  const results = await Promise.all([a, b]);
  assert.equal(gw.calls.length, 1);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(results.some((r) => !r.ok && r.code === "IN_FLIGHT"));
  assert.equal(await db.paymentRefund.count({ where: { paymentId: payments[0].id } }), 1);
});

test("a definite refusal frees the payment; a retry then succeeds", async () => {
  const { payments } = await makeOrder();
  const refused = gateway(() => {
    throw new Error("RAZORPAY_REFUND_FAILED:400");
  });
  const out = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, refused);
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.code, "GATEWAY_REFUSED");
  assert.equal((await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } })).status, "failed");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "captured");
  const retry = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gateway(accepted()));
  assert.equal(retry.ok, true);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "refunded");
});

test("an unknown outcome keeps the refund in flight; Razorpay's record then settles it", async () => {
  const { payments, amount } = await makeOrder();
  const timeout = gateway(() => {
    throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  });
  const out = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, timeout);
  assert.equal(!out.ok && out.code, "OUTCOME_UNKNOWN");
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  assert.equal(row.status, "requested", "an unknown outcome must not free the payment");
  const again = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gateway(accepted()));
  assert.deepEqual(again, { ok: false, code: "IN_FLIGHT" }, "a second refund while the first may have gone through");

  const found: GatewayRefund = { refundId: `rfnd_${randomUUID().slice(0, 14)}`, status: "processed", amountPaise: amount };
  const checked = await checkRefundWithGateway(
    row.id,
    { provider: { findRefund: async (pid, receipt) => (pid === payments[0].gatewayPaymentId && receipt === row.id ? found : null) } },
    { actorType: "admin" }
  );
  assert.deepEqual(checked, { status: "processed", found: true });
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "refunded");
});

test("no record at Razorpay frees the payment only after ten minutes", async () => {
  const { payments } = await makeOrder();
  await requestRefund(
    { paymentId: payments[0].id, reason: REASON, ...ADMIN },
    gateway(() => {
      throw new Error("RAZORPAY_REFUND_FAILED:503");
    })
  );
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  const none = { provider: { findRefund: async () => null } };
  assert.deepEqual(await checkRefundWithGateway(row.id, { ...none, now: new Date(row.createdAt.getTime() + 60_000) }, { actorType: "admin" }), {
    status: "requested",
    found: false,
  });
  assert.deepEqual(
    await checkRefundWithGateway(row.id, { ...none, now: new Date(row.createdAt.getTime() + 11 * 60_000) }, { actorType: "admin" }),
    { status: "failed", found: false }
  );
  assert.equal((await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gateway(accepted()))).ok, true);
});

test("a pending refund is completed by the webhook, once, however often it is delivered", async () => {
  const { payments, amount } = await makeOrder();
  const gw = gateway(accepted("pending"));
  await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw);
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  assert.equal(row.status, "pending");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "captured");
  const entity = { id: row.gatewayRefundId, payment_id: payments[0].gatewayPaymentId, amount, status: "processed", receipt: row.id };
  for (let i = 0; i < 2; i++) {
    const res = await refundHook("refund.processed", entity);
    assert.equal(res.status, 200);
  }
  assert.equal((await db.paymentRefund.findUniqueOrThrow({ where: { id: row.id } })).status, "processed");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "refunded");
  assert.equal(await db.auditLog.count({ where: { entityId: payments[0].id, action: "payment.refund_processed" } }), 1);
});

test("a refund Razorpay later reports failed leaves the money owed and the payment refundable again", async () => {
  const { payments, amount } = await makeOrder();
  await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gateway(accepted("pending")));
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  await refundHook("refund.failed", { id: row.gatewayRefundId, payment_id: payments[0].gatewayPaymentId, amount, status: "failed", receipt: row.id });
  assert.equal((await db.paymentRefund.findUniqueOrThrow({ where: { id: row.id } })).status, "failed");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "captured");
  assert.ok((await listCapturedPaymentsOnDeadOrders()).some((p) => p.id === payments[0].id), "back on the worklist");
});

test("a refund made in the Razorpay dashboard is recorded and closes the payment", async () => {
  const { payments, amount } = await makeOrder();
  const res = await refundHook("refund.processed", {
    id: `rfnd_${randomUUID().slice(0, 14)}`,
    payment_id: payments[0].gatewayPaymentId,
    amount,
    status: "processed",
    receipt: null,
  });
  assert.deepEqual(await res.json(), { status: "refund_recorded_external" });
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  assert.equal(row.actorEmail, "razorpay-dashboard");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "refunded");
});

test("a part-refund made in the dashboard is recorded but leaves the rest owed", async () => {
  const { payments, amount } = await makeOrder();
  await refundHook("refund.processed", {
    id: `rfnd_${randomUUID().slice(0, 14)}`,
    payment_id: payments[0].gatewayPaymentId,
    amount: amount - 10000,
    status: "processed",
    receipt: null,
  });
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "captured");
  const gw = gateway(accepted());
  const out = await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gw);
  assert.equal(out.ok, true);
  assert.equal(gw.calls[0].amount, 10000, "only what is still owed is refunded");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "refunded");
});

test("a webhook whose amount disagrees with the request changes nothing", async () => {
  const { payments, amount } = await makeOrder();
  await requestRefund({ paymentId: payments[0].id, reason: REASON, ...ADMIN }, gateway(accepted("pending")));
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payments[0].id } });
  await refundHook("refund.processed", { id: row.gatewayRefundId, payment_id: payments[0].gatewayPaymentId, amount: amount - 100, status: "processed", receipt: row.id });
  assert.equal((await db.paymentRefund.findUniqueOrThrow({ where: { id: row.id } })).status, "pending");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payments[0].id } })).status, "captured");
});

test("an unsigned refund webhook is refused", async () => {
  const raw = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: {} } } });
  const res = await webhook(
    new NextRequest("http://localhost/api/webhooks/razorpay", { method: "POST", body: raw, headers: { "x-razorpay-signature": "0".repeat(64) } })
  );
  assert.equal(res.status, 400);
});

test("a refund needs a written reason", async () => {
  const { payments } = await makeOrder();
  const gw = gateway(accepted());
  assert.deepEqual(await requestRefund({ paymentId: payments[0].id, reason: " short ", ...ADMIN }, gw), { ok: false, code: "INVALID_REASON" });
  assert.equal(gw.calls.length, 0);
});

test("which gateway errors are definite refusals", () => {
  assert.equal(isDefiniteRefusal(new Error("RAZORPAY_REFUND_FAILED:400")), true);
  assert.equal(isDefiniteRefusal(new Error("RAZORPAY_REFUND_NOT_ACCEPTED:failed")), true);
  assert.equal(isDefiniteRefusal(new Error("RAZORPAY_REFUND_FAILED:429")), false);
  assert.equal(isDefiniteRefusal(new Error("RAZORPAY_REFUND_FAILED:408")), false);
  assert.equal(isDefiniteRefusal(new Error("RAZORPAY_REFUND_FAILED:502")), false);
  assert.equal(isDefiniteRefusal(new Error("RAZORPAY_REFUND_NOT_ACCEPTED:unknown")), false);
  assert.equal(isDefiniteRefusal(Object.assign(new Error("aborted"), { name: "TimeoutError" })), false);
});
