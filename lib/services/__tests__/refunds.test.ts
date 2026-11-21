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

for (const outcome of ["pending", "refused", "processed"] as const) {
  test(`refund-request audit records a claim, not settled money: gateway ${outcome}`, async () => {
    const { payments, amount } = await makeOrder();
    const paymentId = payments[0].id;
    const gw = gateway(async () => {
      // The request event already exists before we receive any gateway answer.
      const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: paymentId, action: "payment.refund_requested" } });
      assert.deepEqual(audit.before, { availableToRequestPaise: amount });
      const refund = await db.paymentRefund.findFirstOrThrow({ where: { paymentId } });
      assert.deepEqual(audit.after, {
        refundId: refund.id, availableToRequestPaise: 0, requestedPaise: amount,
        refundStatus: "requested", basis: "dead_order", reason: REASON, by: ADMIN.actorEmail,
      });
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status, "captured");
      assert.equal(refund.status, "requested");
      if (outcome === "refused") throw new Error("RAZORPAY_REFUND_FAILED:400");
      return accepted(outcome)();
    });
    const result = await requestRefund({ paymentId, reason: REASON, ...ADMIN }, gw);
    assert.equal(result.ok, outcome !== "refused");
    const audit = await db.auditLog.findMany({ where: { entityId: paymentId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(audit.map((a) => a.action), ["payment.refund_requested", `payment.refund_${outcome}`]);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status,
      outcome === "processed" ? "refunded" : "captured");
    const refund = await db.paymentRefund.findFirstOrThrow({ where: { paymentId } });
    assert.equal(refund.status, outcome === "refused" ? "failed" : outcome);
    if (outcome !== "refused") {
      assert.deepEqual(audit[1].before, { refundStatus: "requested" });
      assert.equal((audit[1].after as { refundStatus: string }).refundStatus, outcome);
    }
  });
}

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

/** Wait for the actual database lock dependency before starting the next writer. */
async function waitForBlockedRefundWriter(holder: number): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity WHERE datname = current_database()
        AND ${holder}::int = ANY(pg_blocking_pids(pid))`;
    if (rows.length) return rows[0].pid;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for a refund writer");
}

for (const first of ["processed", "pending"] as const) {
  test(`concurrent webhook and manual refund writers: ${first} commits first`, async () => {
    const { payments: [payment], amount } = await makeOrder();
    await requestRefund({ paymentId: payment.id, reason: REASON, ...ADMIN }, gateway(() => { throw new Error("TIMEOUT"); }));
    const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payment.id } });
    const refundId = `rfnd_${randomUUID()}`;
    const processed = () => refundHook("refund.processed", {
      id: refundId, receipt: row.id, payment_id: payment.gatewayPaymentId, amount, status: "processed",
    });
    const pending = () => checkRefundWithGateway(row.id, {
      provider: { findRefund: async () => ({ refundId, amountPaise: amount, status: "pending" }) },
    }, { actorType: "admin" });
    let hook!: ReturnType<typeof processed>;
    let check!: ReturnType<typeof pending>;
    await db.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ pid: number }[]>`
        SELECT pg_backend_pid() AS pid FROM payment_refunds WHERE id = ${row.id}::uuid FOR UPDATE`;
      if (first === "processed") hook = processed(); else check = pending();
      const firstWriter = await waitForBlockedRefundWriter(lock.pid);
      if (first === "processed") check = pending(); else hook = processed();
      await waitForBlockedRefundWriter(firstWriter);
    }, { timeout: 15000 });
    assert.equal((await hook).status, 200);
    assert.deepEqual(await check, { status: first, found: true });
    const latest = await db.paymentRefund.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(latest.status, "processed");
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
    const events = await db.auditLog.findMany({ where: { entityId: payment.id, action: "payment.refund_processed" } });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].before, { refundStatus: first === "processed" ? "requested" : "pending" });
  });
}

for (const reply of ["pending", "refused", "timeout"] as const) {
  test(`processed webhook committed before the provider's ${reply} reply wins`, async () => {
    const { payments: [payment], amount } = await makeOrder();
    const refundId = `rfnd_${randomUUID()}`;
    const result = await requestRefund({ paymentId: payment.id, reason: REASON, ...ADMIN }, gateway(async ({ receipt }) => {
      const hook = await refundHook("refund.processed", { id: refundId, receipt, payment_id: payment.gatewayPaymentId, amount, status: "processed" });
      assert.equal(hook.status, 200);
      if (reply === "refused") throw new Error("RAZORPAY_REFUND_FAILED:400");
      if (reply === "timeout") throw new Error("RAZORPAY_REFUND_FAILED:503");
      return { refundId, status: "pending" };
    }));
    const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payment.id } });
    assert.deepEqual(result, { ok: true, status: "processed", refundId: row.id });
    assert.equal(row.status, "processed");
    assert.equal(row.failure, null);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
    const audit = await db.auditLog.findMany({ where: { entityId: payment.id }, select: { action: true } });
    assert.deepEqual(audit.map(a => a.action).sort(), ["payment.refund_processed", "payment.refund_requested"]);
  });
}

for (const first of ["webhook", "manual check"] as const) {
  test(`processed webhook and an absent lookup converge when ${first} commits first`, async () => {
    const { payments: [payment], amount } = await makeOrder();
    await requestRefund({ paymentId: payment.id, reason: REASON, ...ADMIN }, gateway(() => { throw new Error("TIMEOUT"); }));
    const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payment.id } });
    const entity = { id: `rfnd_${randomUUID()}`, receipt: row.id, payment_id: payment.gatewayPaymentId, amount, status: "processed" };
    const hook = async () => assert.equal((await refundHook("refund.processed", entity)).status, 200);
    const check = await checkRefundWithGateway(row.id, {
      now: new Date(row.createdAt.getTime() + 11 * 60_000),
      provider: { findRefund: async () => {
        if (first === "webhook") await hook();
        return null;
      } },
    }, { actorType: "admin" });
    assert.deepEqual(check, first === "webhook" ? { status: "processed", found: true } : { status: "failed", found: false });
    await Promise.all([hook(), hook()]);
    assert.equal((await db.paymentRefund.findUniqueOrThrow({ where: { id: row.id } })).status, "processed");
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
    const auditCount = (action: string) => db.auditLog.count({ where: { entityId: payment.id, action } });
    assert.equal(await auditCount("payment.refund_processed"), 1);
    assert.equal(await auditCount("payment.refund_not_at_gateway"), first === "manual check" ? 1 : 0);
  });
}

test("a lookup outage leaves the outstanding refund claimed", async () => {
  const { payments: [payment] } = await makeOrder();
  const params = { paymentId: payment.id, reason: REASON, ...ADMIN };
  await requestRefund(params, gateway(() => { throw new Error("TIMEOUT"); }));
  const row = await db.paymentRefund.findFirstOrThrow({ where: { paymentId: payment.id } });
  await assert.rejects(checkRefundWithGateway(row.id, {
    now: new Date(row.createdAt.getTime() + 11 * 60_000),
    provider: { findRefund: async () => { throw new Error("RAZORPAY_LOOKUP_UNREADABLE"); } },
  }, { actorType: "admin" }), /LOOKUP_UNREADABLE/);
  assert.equal((await db.paymentRefund.findUniqueOrThrow({ where: { id: row.id } })).status, "requested");
  const retry = gateway(accepted());
  assert.deepEqual(await requestRefund(params, retry), { ok: false, code: "IN_FLIGHT" });
  assert.equal(retry.calls.length, 0);
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

test("two distinct processed dashboard refunds together cover one payment exactly", async () => {
  const { payments: [payment], amount } = await makeOrder();
  const parts = [1000, amount - 1000].map(value => ({
    id: `rfnd_${randomUUID()}`, payment_id: payment.gatewayPaymentId, status: "processed", amount: value,
  }));
  await Promise.all(parts.map(async part => assert.equal((await refundHook("refund.processed", part)).status, 200)));
  const rows = await db.paymentRefund.findMany({ where: { paymentId: payment.id } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.status === "processed"));
  assert.equal(rows.reduce((sum, row) => sum + row.amountPaise, 0), amount);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
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
