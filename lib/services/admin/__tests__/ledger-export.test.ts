import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { handleLedgerExport } from "@/lib/services/admin/ledger-export";

const day = "2037-05-04";
const request = (value: string) => new Request(`http://localhost/admin/payments/export?day=${value}`);
const admin = { id: randomUUID(), email: "qa@example.invalid" };

test("requires operator access and rejects invalid dates", async () => {
  assert.equal((await handleLedgerExport(request(day), async () => null)).status, 403);
  assert.equal((await handleLedgerExport(request("2037-02-31"), async () => admin)).status, 400);
});

test("exports payment and refund rows by their own IST creation dates", async () => {
  const user = await db.user.create({ data: { id: randomUUID() } });
  const id = randomUUID();
  try {
    const order = await db.order.create({ data: { id, orderNo: `QA-${id}`, userId: user.id,
      address: {}, paymentMethod: "razorpay", subtotalPaise: 19900, totalPaise: 19900 } });
    const payment = await db.payment.create({ data: { orderId: id, gateway: "razorpay", amountPaise: 19900,
      gatewayPaymentId: "pay_" + id, status: "refunded", createdAt: new Date("2037-05-03T18:30:00Z") } });
    await db.paymentRefund.create({ data: { paymentId: payment.id, orderId: id, amountPaise: 19900,
      reason: "internal reason", actorEmail: admin.email, status: "processed", gatewayRefundId: "rfnd_" + id,
      createdAt: new Date("2037-05-04T18:29:59Z") } });
    await db.payment.create({ data: { orderId: id, gateway: "razorpay", amountPaise: 99,
      createdAt: new Date("2037-05-04T18:30:00Z") } });
    const response = await handleLedgerExport(request(day), async () => admin);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const csv = await response.text();
    const rows = csv.split("\r\n").filter(line => line.includes(order.orderNo));
    assert.equal(rows.length, 2);
    assert.ok(rows[0].includes('"payment"') && rows[0].includes(payment.id));
    assert.ok(rows[1].includes('"refund"') && rows[1].includes("rfnd_" + id) && rows[1].includes('"19900","processed"'));
    assert.ok(!csv.includes(admin.email) && !csv.includes("internal reason"));
    assert.ok(await db.auditLog.findFirst({ where: { action: "payments.exported", actorId: admin.id } }));
  } finally {
    await db.auditLog.deleteMany({ where: { action: "payments.exported", actorId: admin.id } });
    await db.paymentRefund.deleteMany({ where: { orderId: id } });
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.order.deleteMany({ where: { id } });
    await db.user.delete({ where: { id: user.id } });
  }
});

test("refuses a non-operator before reading the request or the database", async () => {
  // A request whose every property throws: reaching the day parser — which
  // sits before the only database read — would turn this 403 into a throw.
  const untouchable = new Proxy({}, { get() { throw new Error("request was read before the access check"); } });
  const response = await handleLedgerExport(untouchable as Request, async () => null);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Admin access required" });
  assert.equal(response.headers.get("Content-Disposition"), null);
});

/** One payment and one refund on an otherwise empty IST day, for a customer with real-looking details. */
const limitDay = "2037-07-15";
const customer = { name: "Ledger Fixture Customer", line1: "14 Fixture Lane", city: "Fixtureabad" };
async function withLedgerDay(run: (rows: { orderNo: string; paymentId: string; refundId: string;
  phone: string; email: string; actor: { id: string; email: string } }) => Promise<void>) {
  const id = randomUUID();
  const actor = { id: randomUUID(), email: `ops-${id}@example.invalid` };
  const phone = "+9170" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const email = `customer-${id}@example.invalid`;
  const user = await db.user.create({ data: { id: randomUUID(), phone, email } });
  try {
    const order = await db.order.create({ data: { id, orderNo: `QA-${id}`, userId: user.id,
      address: { ...customer, phone, pincode: "190001" },
      paymentMethod: "razorpay", subtotalPaise: 19900, totalPaise: 19900 } });
    const payment = await db.payment.create({ data: { orderId: id, gateway: "razorpay", amountPaise: 19900,
      gatewayPaymentId: "pay_" + id, status: "refunded", createdAt: new Date("2037-07-15T04:00:00Z") } });
    const refund = await db.paymentRefund.create({ data: { paymentId: payment.id, orderId: id, amountPaise: 19900,
      reason: "private refund reason", actorEmail: actor.email, status: "processed",
      gatewayRefundId: "rfnd_" + id, createdAt: new Date("2037-07-15T05:00:00Z") } });
    await run({ orderNo: order.orderNo, paymentId: payment.id, refundId: refund.id, phone, email, actor });
  } finally {
    await db.auditLog.deleteMany({ where: { action: "payments.exported", actorId: actor.id } });
    await db.paymentRefund.deleteMany({ where: { orderId: id } });
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.order.deleteMany({ where: { id } });
    await db.user.delete({ where: { id: user.id } });
  }
}

test("refuses a day over the row limit without exporting or auditing anything", async () => {
  await withLedgerDay(async ({ orderNo, paymentId, refundId, actor }) => {
    const response = await handleLedgerExport(request(limitDay), async () => actor, 1);
    assert.equal(response.status, 413);
    assert.equal(response.headers.get("Content-Disposition"), null);
    assert.ok(!(response.headers.get("Content-Type") ?? "").includes("text/csv"));
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { error: "This day exceeds the export row limit." });
    for (const leaked of [orderNo, paymentId, refundId, "created_at_utc", "pay_", "rfnd_"]) {
      assert.ok(!body.includes(leaked), `413 body must not contain ${leaked}`);
    }
    assert.equal(await db.auditLog.count({ where: { action: "payments.exported", actorId: actor.id } }), 0);
  });
});

test("exports a day exactly at the row limit, with no customer or operator details", async () => {
  await withLedgerDay(async ({ orderNo, paymentId, refundId, phone, email, actor }) => {
    const response = await handleLedgerExport(request(limitDay), async () => actor, 2);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Disposition"), `attachment; filename="payments-refunds-${limitDay}-IST.csv"`);
    const csv = await response.text();
    const lines = csv.split("\r\n").filter(Boolean);
    assert.equal(lines[0], "created_at_utc,type,row_id,order_no,payment_id,gateway_order_id,gateway_payment_id,gateway_refund_id,amount_paise,status,updated_at_utc");
    const rows = lines.filter(line => line.includes(orderNo));
    assert.equal(rows.length, 2);
    assert.ok(rows[0].includes('"payment"') && rows[0].includes(paymentId));
    assert.ok(rows[1].includes('"refund"') && rows[1].includes(refundId));
    for (const secret of [customer.name, customer.line1, customer.city, phone, phone.slice(3), email,
      "private refund reason", actor.email]) {
      assert.ok(!csv.includes(secret), `CSV must not contain ${secret}`);
    }
    const audits = await db.auditLog.findMany({ where: { action: "payments.exported", actorId: actor.id } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].after, { rows: 2, day: limitDay });
  });
});
