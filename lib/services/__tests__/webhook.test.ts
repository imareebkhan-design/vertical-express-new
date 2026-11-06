import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { db } from "@/lib/db";
import { POST } from "@/app/api/webhooks/razorpay/route";
import { NextRequest } from "next/server";

const WEBHOOK_SECRET = "test_webhook_secret_value";
const TEST_USER_ID = crypto.randomUUID();
const TEST_ORDER_ID = crypto.randomUUID();
const TEST_ORDER_NO = `TEST-ORDER-${Date.now()}`;
const GATEWAY_ORDER_ID = `order_test_${Date.now()}`;
const EXPECTED_AMOUNT_PAISE = 100000; // ₹1,000.00
const PAYMENT_RECORD_ID = crypto.randomUUID();

let originalWebhookSecret: string | undefined;

before(async () => {
  originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  // Insert mock User
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      phone: "+919999999999",
      email: `test_webhook_${crypto.randomUUID()}@example.com`,
    },
  });

  // Insert mock Order in pending_payment state
  await db.order.create({
    data: {
      id: TEST_ORDER_ID,
      orderNo: TEST_ORDER_NO,
      userId: TEST_USER_ID,
      address: {
        label: "Home",
        name: "Test User",
        phone: "+919999999999",
        line1: "Line 1",
        city: "Srinagar",
        state: "Jammu & Kashmir",
        pincode: "190001",
      },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: EXPECTED_AMOUNT_PAISE,
      discountPaise: 0,
      taxPaise: 0,
      deliveryFeePaise: 0,
      totalPaise: EXPECTED_AMOUNT_PAISE,
    },
  });

  // Insert mock Payment in created state
  await db.payment.create({
    data: {
      id: PAYMENT_RECORD_ID,
      orderId: TEST_ORDER_ID,
      gateway: "razorpay",
      gatewayOrderId: GATEWAY_ORDER_ID,
      amountPaise: EXPECTED_AMOUNT_PAISE,
      status: "created",
    },
  });
});

after(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;

  // Clean up mock records
  await db.payment.deleteMany({ where: { orderId: TEST_ORDER_ID } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: TEST_ORDER_ID } });
  await db.order.delete({ where: { id: TEST_ORDER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } });
});

// Helper to generate a signed NextRequest shaped like a real Razorpay delivery:
// the event id travels in the `x-razorpay-event-id` HEADER, never in the body.
function createSignedRequest(payload: object, signatureSecret = WEBHOOK_SECRET, eventId?: string): NextRequest {
  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", signatureSecret)
    .update(rawBody)
    .digest("hex");

  return new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "x-razorpay-signature": signature,
      ...(eventId ? { "x-razorpay-event-id": eventId } : {}),
      "x-request-id": crypto.randomUUID(),
      "content-type": "application/json",
    },
    body: rawBody,
  });
}

test("Test 1 — Webhook verification with exact amount updates payment and order status to confirmed", async () => {
  const gatewayPaymentId = `pay_exact_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_exact_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          amount: EXPECTED_AMOUNT_PAISE, // Exact matches expected amount
        },
      },
    },
  };

  const req = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res = await POST(req);

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");

  // Check DB state
  const updatedPayment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(updatedPayment?.status, "captured");
  assert.equal(updatedPayment?.gatewayPaymentId, gatewayPaymentId);

  const updatedOrder = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(updatedOrder?.status, "confirmed");
});

test("Test 2 — Webhook verification with lower amount rejects payment and order remains pending_payment", async () => {
  // Revert payment status back to created for this test
  await db.payment.update({ where: { id: PAYMENT_RECORD_ID }, data: { status: "created", gatewayPaymentId: null } });
  await db.order.update({ where: { id: TEST_ORDER_ID }, data: { status: "pending_payment" } });

  const gatewayPaymentId = `pay_lower_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_lower_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          amount: 1, // Only 1 Paise, lower than 100000 Paise
        },
      },
    },
  };

  const req = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res = await POST(req);

  assert.equal(res.status, 400);

  // Check DB status was NOT updated
  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "created");

  const order = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(order?.status, "pending_payment");
});

test("Test 3 — Webhook verification with higher amount rejects payment and order remains pending_payment", async () => {
  const gatewayPaymentId = `pay_higher_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_higher_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          amount: EXPECTED_AMOUNT_PAISE + 1, // Higher than expected
        },
      },
    },
  };

  const req = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res = await POST(req);

  assert.equal(res.status, 400);

  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "created");
});

test("Test 4 — Webhook verification with missing amount rejects payment", async () => {
  const gatewayPaymentId = `pay_missing_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_missing_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          // amount field is missing
        },
      },
    },
  };

  const req = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res = await POST(req);

  assert.equal(res.status, 400);
});

test("Test 5 — Webhook verification with non-integer amount rejects payment", async () => {
  const gatewayPaymentId = `pay_float_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_float_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          amount: 100000.5, // Float value
        },
      },
    },
  };

  const req = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res = await POST(req);

  assert.equal(res.status, 400);
});

test("Test 6 — Webhook idempotency prevents processing duplicate valid events", async () => {
  // Reset database state first
  await db.payment.update({ where: { id: PAYMENT_RECORD_ID }, data: { status: "created", gatewayPaymentId: null, gatewayEventId: null } });
  await db.order.update({ where: { id: TEST_ORDER_ID }, data: { status: "pending_payment" } });

  const gatewayPaymentId = `pay_dup_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_dup_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          amount: EXPECTED_AMOUNT_PAISE,
        },
      },
    },
  };

  // First request
  const req1 = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res1 = await POST(req1);
  assert.equal(res1.status, 200);

  // Check state updated to captured
  const paymentAfter1 = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(paymentAfter1?.status, "captured");
  assert.equal(paymentAfter1?.gatewayEventId, eventId);

  // Set order status to a non-pending state so we can detect duplicate runs
  await db.order.update({ where: { id: TEST_ORDER_ID }, data: { status: "delivered" } });

  // Second duplicate request
  const req2 = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res2 = await POST(req2);
  assert.equal(res2.status, 200);

  const data2 = await res2.json();
  assert.equal(data2.status, "already_processed");

  // Verify order was NOT downgraded from delivered back to confirmed
  const orderAfter2 = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(orderAfter2?.status, "delivered");
});

test("Test 7 — Webhook verification with wrong amount and valid signature fails amount check", async () => {
  // Reset payment status back to created for this test
  await db.payment.update({ where: { id: PAYMENT_RECORD_ID }, data: { status: "created", gatewayPaymentId: null } });
  await db.order.update({ where: { id: TEST_ORDER_ID }, data: { status: "pending_payment" } });

  const gatewayPaymentId = `pay_wrong_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_wrong_${crypto.randomUUID().slice(0, 8)}`;

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: GATEWAY_ORDER_ID,
          amount: 500, // Valid signature will cover this payload, but amount is wrong (500 vs 100000)
        },
      },
    },
  };

  // Sign request with correct webhook secret
  const req = createSignedRequest(payload, WEBHOOK_SECRET, eventId);
  const res = await POST(req);

  assert.equal(res.status, 400);

  // Check DB status was NOT updated
  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "created");
});

/* ── Event id comes from the `x-razorpay-event-id` header (real Razorpay behaviour) ── */

async function resetState(orderStatus: "pending_payment" | "cancelled" = "pending_payment") {
  await db.payment.update({
    where: { id: PAYMENT_RECORD_ID },
    data: { status: "created", gatewayPaymentId: null, gatewayEventId: null },
  });
  await db.order.update({ where: { id: TEST_ORDER_ID }, data: { status: orderStatus } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: TEST_ORDER_ID } });
}

function capturedPayload(gatewayPaymentId: string, extra: object = {}) {
  return {
    event: "payment.captured",
    ...extra,
    payload: { payment: { entity: { id: gatewayPaymentId, order_id: GATEWAY_ORDER_ID, amount: EXPECTED_AMOUNT_PAISE } } },
  };
}

const confirmEvents = () =>
  db.orderStatusEvent.count({ where: { orderId: TEST_ORDER_ID, toStatus: "confirmed" } });

test("Test 8 — header event id is stored, and a replay of the same header id is deduplicated", async () => {
  await resetState();
  const payId = `pay_hdr_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_hdr_${crypto.randomUUID().slice(0, 8)}`;

  const res1 = await POST(createSignedRequest(capturedPayload(payId), WEBHOOK_SECRET, eventId));
  assert.equal(res1.status, 200);
  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "captured");
  assert.equal(payment?.gatewayEventId, eventId);

  const res2 = await POST(createSignedRequest(capturedPayload(payId), WEBHOOK_SECRET, eventId));
  assert.equal(res2.status, 200);
  assert.equal((await res2.json()).status, "already_processed");
  assert.equal(await confirmEvents(), 1);
});

test("Test 9 — payment.captured then order.paid (distinct header ids) confirms exactly once", async () => {
  await resetState();
  const payId = `pay_pair_${crypto.randomUUID().slice(0, 8)}`;
  const capturedId = `evt_cap_${crypto.randomUUID().slice(0, 8)}`;
  const orderPaidId = `evt_paid_${crypto.randomUUID().slice(0, 8)}`;

  const res1 = await POST(createSignedRequest(capturedPayload(payId), WEBHOOK_SECRET, capturedId));
  assert.equal(res1.status, 200);

  const orderPaid = {
    event: "order.paid",
    payload: {
      payment: { entity: { id: payId, order_id: GATEWAY_ORDER_ID, amount: EXPECTED_AMOUNT_PAISE } },
      order: { entity: { id: GATEWAY_ORDER_ID, amount_paid: EXPECTED_AMOUNT_PAISE } },
    },
  };
  const res2 = await POST(createSignedRequest(orderPaid, WEBHOOK_SECRET, orderPaidId));
  assert.equal(res2.status, 200);

  const order = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(order?.status, "confirmed");
  assert.equal(await confirmEvents(), 1);
  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "captured");
  assert.equal(payment?.gatewayEventId, capturedId, "first settling event keeps its id");
});

test("Test 10 — invalid signature is rejected even with a valid-looking header event id", async () => {
  await resetState();
  const eventId = `evt_badsig_${crypto.randomUUID().slice(0, 8)}`;
  const res = await POST(createSignedRequest(capturedPayload("pay_badsig"), "not_the_secret", eventId));
  assert.equal(res.status, 400);

  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "created");
  assert.equal(payment?.gatewayEventId, null);
  const order = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(order?.status, "pending_payment");
});

test("Test 11 — stale payment.failed after capture cannot downgrade the captured payment", async () => {
  await resetState();
  const payId = `pay_stale_${crypto.randomUUID().slice(0, 8)}`;
  const capturedId = `evt_cap_${crypto.randomUUID().slice(0, 8)}`;
  await POST(createSignedRequest(capturedPayload(payId), WEBHOOK_SECRET, capturedId));

  const failed = {
    event: "payment.failed",
    payload: { payment: { entity: { id: `pay_failedattempt_${crypto.randomUUID().slice(0, 6)}`, order_id: GATEWAY_ORDER_ID, amount: EXPECTED_AMOUNT_PAISE, status: "failed" } } },
  };
  const res = await POST(createSignedRequest(failed, WEBHOOK_SECRET, `evt_fail_${crypto.randomUUID().slice(0, 8)}`));
  assert.equal(res.status, 200);

  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "captured");
  assert.equal(payment?.gatewayPaymentId, payId);
  assert.equal(payment?.gatewayEventId, capturedId);
  const order = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(order?.status, "confirmed");
});

test("Test 12 — missing event id (no header, no body) still settles once and a replay cannot double-settle", async () => {
  await resetState();
  const payId = `pay_noid_${crypto.randomUUID().slice(0, 8)}`;

  const res1 = await POST(createSignedRequest(capturedPayload(payId)));
  assert.equal(res1.status, 200);
  const res2 = await POST(createSignedRequest(capturedPayload(payId)));
  assert.equal(res2.status, 200);

  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "captured");
  assert.equal(payment?.gatewayEventId, null);
  const order = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(order?.status, "confirmed");
  assert.equal(await confirmEvents(), 1, "order-state guard absorbs the replay");
});

test("Test 13 — header event id wins over a conflicting body event_id", async () => {
  await resetState();
  const payId = `pay_conflict_${crypto.randomUUID().slice(0, 8)}`;
  const headerId = `evt_header_${crypto.randomUUID().slice(0, 8)}`;
  const bodyId = `evt_body_${crypto.randomUUID().slice(0, 8)}`;

  const res = await POST(createSignedRequest(capturedPayload(payId, { event_id: bodyId }), WEBHOOK_SECRET, headerId));
  assert.equal(res.status, 200);
  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.gatewayEventId, headerId);

  const replay = await POST(createSignedRequest(capturedPayload(payId, { event_id: bodyId }), WEBHOOK_SECRET, headerId));
  assert.equal((await replay.json()).status, "already_processed");
});

test("Test 14 — late capture on a cancelled order is recorded, not settled, and its header id dedupes a retry", async () => {
  await resetState("cancelled");
  const payId = `pay_late_${crypto.randomUUID().slice(0, 8)}`;
  const eventId = `evt_late_${crypto.randomUUID().slice(0, 8)}`;

  const res1 = await POST(createSignedRequest(capturedPayload(payId), WEBHOOK_SECRET, eventId));
  assert.equal(res1.status, 200);
  assert.equal((await res1.json()).status, "late_payment_recorded");

  const payment = await db.payment.findUnique({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(payment?.status, "captured");
  assert.equal(payment?.gatewayEventId, eventId);
  const order = await db.order.findUnique({ where: { id: TEST_ORDER_ID } });
  assert.equal(order?.status, "cancelled");

  const res2 = await POST(createSignedRequest(capturedPayload(payId), WEBHOOK_SECRET, eventId));
  assert.equal((await res2.json()).status, "already_processed");
  assert.equal((await db.order.findUnique({ where: { id: TEST_ORDER_ID } }))?.status, "cancelled");
});

test("Test 15 — an event with no payment id and an unknown order id settles nothing", async () => {
  /* Before the fix the lookup was OR[{gatewayOrderId: unknown}, {gatewayPaymentId: undefined}];
     Prisma drops the undefined field, the empty condition matches every payment,
     and findFirst could settle an unrelated order. */
  await resetState();
  const payload = {
    event: "order.paid",
    payload: { order: { entity: { id: `order_unknown_${Date.now()}`, amount_paid: EXPECTED_AMOUNT_PAISE, amount: EXPECTED_AMOUNT_PAISE } } },
  };
  await POST(createSignedRequest(payload, WEBHOOK_SECRET, `evt_unknown_${Date.now()}`));
  const order = await db.order.findUniqueOrThrow({ where: { id: TEST_ORDER_ID } });
  const payment = await db.payment.findUniqueOrThrow({ where: { id: PAYMENT_RECORD_ID } });
  assert.equal(order.status, "pending_payment", "an unrelated order was not confirmed");
  assert.equal(payment.status, "created", "an unrelated payment was not captured");
});
