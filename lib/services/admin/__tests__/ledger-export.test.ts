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
