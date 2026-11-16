import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getBiData } from "../bi";

/**
 * The money on Reports (audit RPT-02 and PAY-14, roadmap C-8).
 *
 * Gross sales, GST and delivery income were summed over every order in the
 * period, cancelled and unpaid included. Refunds were read from an order
 * status nothing sets, so they were always zero, and "cash flow" was net sales
 * less that zero. A settlement figure was net sales times 0.98.
 *
 * Every order here is placed in March 2020, a month no other test writes to,
 * so the figures for that window are exactly these fixtures.
 */
const START = new Date("2020-03-01T00:00:00.000Z");
const END = new Date("2020-03-31T23:59:59.000Z");
const PREV_DAY = new Date("2020-02-10T06:00:00.000Z");
const DAY = new Date("2020-03-10T06:00:00.000Z");

let userId: string;
let variantId: string;
const orderIds: string[] = [];

type Pay = { status: "created" | "captured" | "failed" | "refunded"; refund?: "processed" | "failed" | "pending" };

async function order(opts: {
  status: "pending_payment" | "confirmed" | "delivered" | "cancelled";
  placedAt?: Date;
  payments: Pay[];
  paymentMethod?: "razorpay" | "cod";
}) {
  /* 2 x ₹500 goods, ₹90 tax, ₹40 delivery, ₹30 off: ₹1,100 charged. */
  const o = await db.order.create({
    data: {
      orderNo: `ZZZBI-${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status: opts.status,
      paymentMethod: opts.paymentMethod ?? "razorpay",
      subtotalPaise: 100_000,
      taxPaise: 9_000,
      deliveryFeePaise: 4_000,
      discountPaise: 3_000,
      totalPaise: 110_000,
      placedAt: opts.placedAt ?? DAY,
      items: {
        create: [{ variantId, title: "BI money fixture", variantName: "Default", unitPricePaise: 50_000, qty: 2, lineTotalPaise: 100_000, totalPaise: 100_000 }],
      },
      payments: {
        create: opts.payments.map((p) => ({
          gateway: "razorpay" as const,
          gatewayOrderId: `order_${randomUUID().slice(0, 14)}`,
          gatewayPaymentId: `pay_${randomUUID().slice(0, 14)}`,
          amountPaise: 110_000,
          status: p.status,
          createdAt: opts.placedAt ?? DAY,
        })),
      },
    },
    include: { payments: { orderBy: { id: "asc" } } },
  });
  orderIds.push(o.id);
  for (const [i, p] of opts.payments.entries()) {
    if (!p.refund) continue;
    await db.paymentRefund.create({
      data: {
        paymentId: o.payments[i].id,
        orderId: o.id,
        amountPaise: 110_000,
        status: p.refund,
        reason: "test",
        actorEmail: "ops@example.test",
        createdAt: opts.placedAt ?? DAY,
      },
    });
  }
  return o;
}

before(async () => {
  userId = (
    await db.user.create({ data: { id: randomUUID(), phone: `+9194${String(Math.random()).slice(2, 10)}` }, select: { id: true } })
  ).id;
  const variant = await db.productVariant.findFirst({ select: { id: true } });
  assert.ok(variant, "the seeded catalogue has no variant");
  variantId = variant.id;

  await order({ status: "confirmed", payments: [{ status: "captured" }] }); // paid
  await order({ status: "delivered", payments: [{ status: "failed" }, { status: "captured" }] }); // paid on the retry
  await order({ status: "pending_payment", payments: [{ status: "created" }] }); // never paid
  await order({ status: "cancelled", payments: [{ status: "created" }] }); // cancelled, unpaid
  await order({ status: "cancelled", payments: [{ status: "refunded", refund: "processed" }] }); // paid, cancelled, refunded
  await order({ status: "cancelled", payments: [{ status: "captured", refund: "failed" }] }); // paid, cancelled, refund failed
  await order({ status: "delivered", paymentMethod: "cod", payments: [] }); // cash on delivery
  await order({ status: "confirmed", placedAt: PREV_DAY, payments: [{ status: "captured" }] }); // previous period, paid
  await order({ status: "pending_payment", placedAt: PREV_DAY, payments: [{ status: "created" }] }); // previous period, unpaid
});

after(async () => {
  await db.paymentRefund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: userId } });
});

const report = () => getBiData({ startDate: START, endDate: END });

test("sales money is summed over paid orders only", async () => {
  const { sales } = await report();
  assert.equal(sales.ordersCount, 7, "every order placed in the period is still counted as an order");
  assert.equal(sales.paidOrdersCount, 2);
  assert.equal(sales.grossSalesPaise, 200_000, "a cancelled or unpaid order is in gross sales");
  assert.equal(sales.gstPaise, 18_000, "a cancelled or unpaid order is in GST collected");
  assert.equal(sales.shippingPaise, 8_000);
  assert.equal(sales.discountsPaise, 6_000);
  assert.equal(sales.netSalesPaise, 220_000, "net sales is not what the paid orders were charged");
  assert.equal(sales.aovPaise, 110_000, "the average is not per paid order");
});

test("the daily series adds up to the totals and puts the sale on its IST day", async () => {
  const { sales } = await report();
  assert.equal(sales.dailySales.reduce((n, d) => n + d.net, 0), sales.netSalesPaise);
  assert.equal(sales.dailySales.reduce((n, d) => n + d.gross, 0), sales.grossSalesPaise);
  assert.equal(sales.dailySales.find((d) => d.label === "2020-03-10")?.net, 220_000);
  /* 20:00 UTC on the 10th is 01:30 on the 11th in Srinagar. */
  const late = await order({ status: "confirmed", placedAt: new Date("2020-03-10T20:00:00.000Z"), payments: [{ status: "captured" }] });
  const again = await report();
  assert.equal(again.sales.dailySales.find((d) => d.label === "2020-03-11")?.net, 110_000);
  await db.payment.deleteMany({ where: { orderId: late.id } });
  await db.orderItem.deleteMany({ where: { orderId: late.id } });
  await db.order.delete({ where: { id: late.id } });
});

test("refunds are the processed refund rows, not an order status", async () => {
  const { sales, finance } = await report();
  assert.equal(finance.refundsPaise, 110_000, "a processed refund is missing, or a failed one is counted");
  assert.equal(sales.refundsPaise, finance.refundsPaise);
});

test("cash flow is money captured less money refunded, from the ledger", async () => {
  const { finance } = await report();
  /* Captured in the period: the two paid orders, the one later refunded, and
     the one whose refund failed. Four captures of ₹1,100, one refunded. */
  assert.equal(finance.cashFlowPaise, 4 * 110_000 - 110_000);
  assert.equal(finance.revenuePaise, 220_000);
  assert.equal(finance.outstandingPaise, 110_000, "the one order still awaiting payment");
});

test("no settlement figure is invented", async () => {
  const { finance } = await report();
  assert.equal(finance.gatewaySettlementPaise, null, "a settlement amount needs Razorpay's fee, which is not recorded");
});

test("growth compares paid sales with paid sales", async () => {
  /* The comparison window is the 30 days before 1 March: one paid order and
     one unpaid. ₹2,200 against ₹1,100 is +100%; counting the unpaid order
     would make it 0%. */
  const { sales } = await report();
  assert.equal(sales.growthPct, 100);
});

test("a product on an unpaid or cancelled order was not sold", async () => {
  const { products, customers } = await report();
  const sold = products.topSelling.find((p) => p.title === "BI money fixture");
  assert.ok(sold);
  assert.equal(sold.qty, 4, "two paid orders of two units");
  assert.equal(sold.revenuePaise, 200_000);
  const me = customers.topCustomers.find((c) => c.totalSpentPaise === 220_000);
  assert.ok(me, "customer spend is not the paid orders' total");
  assert.equal(me.ordersCount, 2);
});

test("the order filters reach the ledger figures too", async () => {
  const none = await getBiData({ startDate: START, endDate: END, couponCode: "NO-SUCH-COUPON" });
  assert.equal(none.sales.netSalesPaise, 0);
  assert.equal(none.finance.refundsPaise, 0);
  assert.equal(none.finance.cashFlowPaise, 0);
});
