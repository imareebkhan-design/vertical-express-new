import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { POST } from "@/app/api/webhooks/razorpay/route";
import { listPaymentExceptions, countPaymentExceptions } from "@/lib/services/payment-exceptions";
import { getOpsExceptions } from "@/lib/services/admin/exceptions";

/**
 * Roadmap A-3: a correctly signed capture the webhook cannot settle is money
 * Razorpay holds that this database does not account for. Before A-3 it raised
 * a log alert and stored nothing (an amount mismatch also answered 400, so
 * Razorpay retried for hours). Now it is recorded — once, by the unique key on
 * (gateway payment id, reason) — and acknowledged with 200, and an operator can
 * see it on the Payments screen and on Today.
 */

const SECRET = "test_webhook_secret_exceptions";
const RUN = crypto.randomUUID().slice(0, 8);
const USER_ID = crypto.randomUUID();
const ORDER_ID = crypto.randomUUID();
const ORDER_NO = `TEST-EXC-${RUN}`;
const GATEWAY_ORDER_ID = `order_exc_${RUN}`;
const PAYMENT_ID = crypto.randomUUID();
const EXPECTED = 250000;

let originalSecret: string | undefined;

before(async () => {
  originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  await db.user.create({ data: { id: USER_ID, phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  await db.order.create({
    data: {
      id: ORDER_ID,
      orderNo: ORDER_NO,
      userId: USER_ID,
      address: { name: "Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: EXPECTED,
      totalPaise: EXPECTED,
    },
  });
  await db.payment.create({
    data: { id: PAYMENT_ID, orderId: ORDER_ID, gateway: "razorpay", gatewayOrderId: GATEWAY_ORDER_ID, amountPaise: EXPECTED, status: "created" },
  });
});

after(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  await db.paymentException.deleteMany({ where: { gatewayPaymentId: { contains: RUN } } });
  await db.paymentException.deleteMany({ where: { orderId: ORDER_ID } });
  await db.payment.deleteMany({ where: { orderId: ORDER_ID } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: ORDER_ID } });
  await db.orderEmail.deleteMany({ where: { orderId: ORDER_ID } });
  await db.order.delete({ where: { id: ORDER_ID } });
  await db.user.delete({ where: { id: USER_ID } });
});

function signed(payload: object, opts: { secret?: string; eventId?: string; noSignature?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", opts.secret ?? SECRET).update(body).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      ...(opts.noSignature ? {} : { "x-razorpay-signature": signature }),
      ...(opts.eventId ? { "x-razorpay-event-id": opts.eventId } : {}),
      "content-type": "application/json",
    },
    body,
  });
}

function capture(payId: string, orderId: string | undefined, amount: number, event = "payment.captured") {
  return {
    event,
    payload: { payment: { entity: { id: payId, ...(orderId ? { order_id: orderId } : {}), amount, currency: "INR" } } },
  };
}

const id = (p: string) => `${p}_${RUN}_${crypto.randomUUID().slice(0, 6)}`;
const rowsFor = (gatewayPaymentId: string) => db.paymentException.findMany({ where: { gatewayPaymentId } });

/** Counts alerts of one type written while `fn` runs (triggerAlert logs FATAL to console.error). */
async function alertsDuring(type: string, fn: () => Promise<unknown>) {
  let n = 0;
  const spy = mock.method(console, "error", (line: unknown) => {
    if (typeof line === "string" && line.includes('"alert-notifier"') && line.includes(`"${type}"`)) n++;
  });
  try {
    await fn();
  } finally {
    spy.mock.restore();
  }
  return n;
}

async function resetPayment() {
  await db.payment.update({ where: { id: PAYMENT_ID }, data: { status: "created", gatewayPaymentId: null, gatewayEventId: null } });
  await db.order.update({ where: { id: ORDER_ID }, data: { status: "pending_payment" } });
}

test("an unmatched capture stores one row with its gateway facts and answers 200", async () => {
  const payId = id("pay_unm");
  const rzpOrder = id("order_unknown");
  const eventId = id("evt_unm");
  let res!: Response;
  const alerts = await alertsDuring("webhook_capture_unmatched", async () => {
    res = await POST(signed(capture(payId, rzpOrder, 4200), { eventId }));
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "unmatched_recorded");
  assert.equal(alerts, 1, "first sight alerts");

  const rows = await rowsFor(payId);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.reason, "unmatched");
  assert.equal(row.gatewayOrderId, rzpOrder);
  assert.equal(row.gatewayEventId, eventId);
  assert.equal(row.amountPaise, 4200);
  assert.equal(row.currency, "INR");
  assert.equal(row.event, "payment.captured");
  assert.equal(row.orderId, null);
  assert.equal(row.expectedAmountPaise, null);
  assert.ok(row.receivedAt instanceof Date);
});

test("a replay of an unmatched capture stores nothing new, answers 200 and does not alert again", async () => {
  const payId = id("pay_unm_replay");
  const rzpOrder = id("order_unknown");
  const eventId = id("evt_unm_replay");
  await POST(signed(capture(payId, rzpOrder, 9900), { eventId }));

  let replay!: Response;
  let otherEvent!: Response;
  const alerts = await alertsDuring("webhook_capture_unmatched", async () => {
    replay = await POST(signed(capture(payId, rzpOrder, 9900), { eventId }));
    /* order.paid for the same payment, with its own event id, is the same money. */
    otherEvent = await POST(signed(capture(payId, rzpOrder, 9900, "order.paid"), { eventId: id("evt_paid") }));
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, "already_recorded");
  assert.equal(otherEvent.status, 200);
  assert.equal(alerts, 0, "a replay must not alert again");
  assert.equal((await rowsFor(payId)).length, 1);
});

test("an amount mismatch stores one row with both amounts and the claimed order, answers 200 and settles nothing", async () => {
  await resetPayment();
  const payId = id("pay_mis");
  const eventId = id("evt_mis");
  let res!: Response;
  const alerts = await alertsDuring("webhook_amount_mismatch", async () => {
    res = await POST(signed(capture(payId, GATEWAY_ORDER_ID, EXPECTED - 100), { eventId }));
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "amount_mismatch_recorded");
  assert.equal(alerts, 1);

  const rows = await rowsFor(payId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, "amount_mismatch");
  assert.equal(rows[0].amountPaise, EXPECTED - 100);
  assert.equal(rows[0].expectedAmountPaise, EXPECTED);
  assert.equal(rows[0].orderId, ORDER_ID);
  assert.equal(rows[0].gatewayOrderId, GATEWAY_ORDER_ID);
  assert.equal(rows[0].gatewayEventId, eventId);

  const payment = await db.payment.findUniqueOrThrow({ where: { id: PAYMENT_ID } });
  assert.equal(payment.status, "created", "a mismatch never settles");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: ORDER_ID } })).status, "pending_payment");
});

test("a replay of an amount mismatch stores nothing new, answers 200 and does not alert again", async () => {
  await resetPayment();
  const payId = id("pay_mis_replay");
  const eventId = id("evt_mis_replay");
  await POST(signed(capture(payId, GATEWAY_ORDER_ID, EXPECTED + 1), { eventId }));
  let replay!: Response;
  const alerts = await alertsDuring("webhook_amount_mismatch", async () => {
    replay = await POST(signed(capture(payId, GATEWAY_ORDER_ID, EXPECTED + 1), { eventId }));
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, "already_recorded");
  assert.equal(alerts, 0);
  assert.equal((await rowsFor(payId)).length, 1);
});

test("concurrent deliveries of the same event produce exactly one row and one alert", async () => {
  const payId = id("pay_race");
  const rzpOrder = id("order_race");
  const eventId = id("evt_race");
  let responses: Response[] = [];
  const alerts = await alertsDuring("webhook_capture_unmatched", async () => {
    responses = await Promise.all(
      Array.from({ length: 6 }, () => POST(signed(capture(payId, rzpOrder, 7000), { eventId })))
    );
  });
  for (const r of responses) assert.equal(r.status, 200);
  const statuses = await Promise.all(responses.map(async (r) => (await r.json()).status));
  assert.equal(statuses.filter((s) => s === "unmatched_recorded").length, 1);
  assert.equal(statuses.filter((s) => s === "already_recorded").length, 5);
  assert.equal(alerts, 1);
  assert.equal((await rowsFor(payId)).length, 1);
});

test("a bad or missing signature is rejected and stores nothing", async () => {
  const payId = id("pay_badsig");
  const bad = await POST(signed(capture(payId, id("order_x"), 5000), { secret: "not_the_secret", eventId: id("evt") }));
  assert.equal(bad.status, 400);
  const missing = await POST(signed(capture(payId, id("order_x"), 5000), { noSignature: true, eventId: id("evt") }));
  assert.equal(missing.status, 400);
  assert.equal((await rowsFor(payId)).length, 0);
});

test("if recording fails the webhook does not answer 200, and alerts", async () => {
  /* A real database refusal, scoped to this one payment id: a temporary CHECK
     constraint rejects the insert. (Prisma's model delegates cannot be stubbed
     with mock.method.) Dropped in `finally`, and before Razorpay's retry. */
  const payId = id("pay_fail");
  const rzpOrder = id("order_fail");
  const eventId = id("evt_fail");
  const constraint = `test_reject_${RUN}`;
  await db.$executeRawUnsafe(
    `ALTER TABLE payment_exceptions ADD CONSTRAINT "${constraint}" CHECK (gateway_payment_id <> '${payId}') NOT VALID`
  );
  let res!: Response;
  let alerts = 0;
  try {
    alerts = await alertsDuring("webhook_exception_record_failed", async () => {
      res = await POST(signed(capture(payId, rzpOrder, 3100), { eventId }));
    });
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE payment_exceptions DROP CONSTRAINT IF EXISTS "${constraint}"`);
  }
  assert.notEqual(res.status, 200, "Razorpay must retry");
  assert.equal(res.status, 500);
  assert.equal(alerts, 1);
  assert.equal((await rowsFor(payId)).length, 0);

  /* Razorpay's retry, once the database accepts the row, records it. */
  const retry = await POST(signed(capture(payId, rzpOrder, 3100), { eventId }));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).status, "unmatched_recorded");
  assert.equal((await rowsFor(payId)).length, 1);
});

test("a signed capture with no Razorpay order id that no payment here knows is recorded as unmatched", async () => {
  const payId = id("pay_noorder");
  const res = await POST(signed(capture(payId, undefined, 1500), { eventId: id("evt_noorder") }));
  assert.equal(res.status, 200);
  const rows = await rowsFor(payId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, "unmatched");
  assert.equal(rows[0].gatewayOrderId, null);
});

test("a normal matched capture still settles and creates no exception row", async () => {
  await resetPayment();
  const payId = id("pay_ok");
  const res = await POST(signed(capture(payId, GATEWAY_ORDER_ID, EXPECTED), { eventId: id("evt_ok") }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "ok");
  const payment = await db.payment.findUniqueOrThrow({ where: { id: PAYMENT_ID } });
  assert.equal(payment.status, "captured");
  assert.equal(payment.gatewayPaymentId, payId);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: ORDER_ID } })).status, "confirmed");
  assert.equal((await rowsFor(payId)).length, 0);
});

test("the Needs investigation list and the Today count read back what was stored", async () => {
  const mine = await db.paymentException.findMany({ where: { gatewayPaymentId: { contains: RUN } } });
  assert.ok(mine.length >= 6, "earlier tests recorded rows");

  const list = await listPaymentExceptions(1000);
  for (const row of mine) {
    const shown = list.find((x) => x.id === row.id);
    assert.ok(shown, `${row.gatewayPaymentId} is missing from the list`);
    assert.equal(shown.reason, row.reason);
    assert.equal(shown.amountPaise, row.amountPaise);
    assert.equal(shown.gatewayPaymentId, row.gatewayPaymentId);
    if (row.reason === "amount_mismatch") {
      assert.equal(shown.order?.orderNo, ORDER_NO, "the claimed order is linked");
      assert.equal(shown.expectedAmountPaise, EXPECTED);
    } else {
      assert.equal(shown.order, null);
    }
  }
  /* Newest first. */
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].receivedAt >= list[i].receivedAt);
  /* No customer data in what the screen reads. */
  for (const key of ["phone", "email", "address", "userId"]) assert.ok(!(key in list[0]), `list exposes ${key}`);

  const total = await countPaymentExceptions();
  assert.equal(total, await db.paymentException.count());
  const { found } = await getOpsExceptions();
  const entry = found.find((e) => e.href === "/admin/payments#needs-investigation");
  assert.ok(entry, "Today does not show the count");
  assert.equal(entry.severity, "bad");
  assert.match(entry.title, new RegExp(`^${total} captured payments? needs? investigation$`));
});
