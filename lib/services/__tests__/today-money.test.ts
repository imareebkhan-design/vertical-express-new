import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomInt, randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { istDayStart, istTodayStart } from "@/lib/ist";
import { getOpsToday } from "@/lib/services/admin/today";
import { getOpsExceptions } from "@/lib/services/admin/exceptions";
import { adminCustomerDetail, adminListCustomers, adminPaymentHealth } from "@/lib/services/admin/stock";
import { listCapturedPaymentsOnDeadOrders, listDuplicateCaptures } from "@/lib/services/checkout";

/**
 * The money figures on Today and the customer screens (audit RPT-01, RPT-03;
 * roadmap B-2).
 *
 * Three things were wrong. "Revenue today" summed every order that was not
 * cancelled, so an order nobody had paid for counted. "Today" began at the
 * server's midnight, which on a UTC host is 5:30 AM in Srinagar. And money that
 * had to go back (a capture on a cancelled order, a second capture, a refund
 * that failed) was shown only on Payments, never on the screen an operator
 * opens first.
 *
 * The figures are asserted as differences around rows this file creates,
 * because the database also holds whatever other test files left in it.
 */

const NOW = new Date();
const START = istTodayStart(NOW);
const orderIds: string[] = [];
let userId: string;

before(async () => {
  userId = (
    await db.user.create({
      data: { id: randomUUID(), phone: `+9195${String(randomInt(0, 100_000_000)).padStart(8, "0")}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await db.paymentRefund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: userId } });
});

type PaymentSeed = { status: "created" | "captured" | "failed" | "refunded"; createdAt?: Date };

async function order(opts: {
  status: "pending_payment" | "confirmed" | "delivered" | "cancelled";
  totalPaise: number;
  placedAt?: Date;
  paymentMethod?: "razorpay" | "cod";
  payments?: PaymentSeed[];
}) {
  const o = await db.order.create({
    data: {
      orderNo: `ZZZTM-${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status: opts.status,
      paymentMethod: opts.paymentMethod ?? "razorpay",
      subtotalPaise: opts.totalPaise,
      totalPaise: opts.totalPaise,
      placedAt: opts.placedAt ?? NOW,
      payments: {
        create: (opts.payments ?? []).map((p) => ({
          gateway: "razorpay" as const,
          gatewayOrderId: `order_${randomUUID().slice(0, 14)}`,
          gatewayPaymentId: `pay_${randomUUID().slice(0, 14)}`,
          amountPaise: opts.totalPaise,
          status: p.status,
          ...(p.createdAt ? { createdAt: p.createdAt } : {}),
        })),
      },
    },
    include: { payments: { orderBy: { createdAt: "asc" } } },
  });
  orderIds.push(o.id);
  return o;
}

const exception = async (titlePattern: RegExp) => (await getOpsExceptions()).found.find((e) => titlePattern.test(e.title));
const leadingCount = (title: string | undefined) => (title ? Number(title.match(/^(\d+)/)?.[1] ?? 0) : 0);

test("the IST day starts at 18:30 UTC of the previous date, not at the server's midnight", () => {
  /* 00:30 on 16 Nov in Srinagar is 19:00 on 15 Nov UTC. */
  const justAfterMidnightIst = new Date("2026-11-15T19:00:00.000Z");
  assert.equal(istTodayStart(justAfterMidnightIst).toISOString(), "2026-11-15T18:30:00.000Z");
  /* 23:30 on 15 Nov in Srinagar is still the 15th. */
  const lateEveningIst = new Date("2026-11-15T18:00:00.000Z");
  assert.equal(istTodayStart(lateEveningIst).toISOString(), "2026-11-14T18:30:00.000Z");
  assert.equal(istTodayStart(lateEveningIst).getTime(), istDayStart("2026-11-15").getTime());
});

test("an order nobody has paid for is an order today, and is not revenue", async () => {
  const before = await getOpsToday(NOW);
  await order({ status: "pending_payment", totalPaise: 70_000, payments: [{ status: "created" }] });
  await order({ status: "pending_payment", totalPaise: 30_000, payments: [{ status: "failed" }] });
  const after = await getOpsToday(NOW);

  assert.equal(after.ordersToday - before.ordersToday, 2, "both were placed today");
  assert.equal(after.paidOrdersToday, before.paidOrdersToday, "neither is paid");
  assert.equal(after.revenueTodayPaise, before.revenueTodayPaise, "unpaid orders added to revenue");
});

test("a paid order counts once at its own total, even when it was paid twice", async () => {
  const before = await getOpsToday(NOW);
  await order({ status: "confirmed", totalPaise: 45_000, payments: [{ status: "captured" }] });
  await order({
    status: "confirmed",
    totalPaise: 20_000,
    payments: [{ status: "captured", createdAt: new Date(NOW.getTime() - 60_000) }, { status: "captured" }],
  });
  const after = await getOpsToday(NOW);

  assert.equal(after.paidOrdersToday - before.paidOrdersToday, 2);
  assert.equal(after.revenueTodayPaise - before.revenueTodayPaise, 65_000, "the second capture is a refund owed, not revenue");
});

test("a cancelled order is not revenue, whether or not its money was captured", async () => {
  const before = await getOpsToday(NOW);
  await order({ status: "cancelled", totalPaise: 90_000, payments: [{ status: "captured" }] });
  await order({ status: "cancelled", totalPaise: 10_000, payments: [{ status: "created" }] });
  const after = await getOpsToday(NOW);

  assert.equal(after.paidOrdersToday, before.paidOrdersToday);
  assert.equal(after.revenueTodayPaise, before.revenueTodayPaise);
});

test("a cash-on-delivery order is not counted as paid: nothing records the cash", async () => {
  const before = await getOpsToday(NOW);
  await order({ status: "delivered", totalPaise: 55_000, paymentMethod: "cod" });
  const after = await getOpsToday(NOW);

  assert.equal(after.ordersToday - before.ordersToday, 1);
  assert.equal(after.revenueTodayPaise, before.revenueTodayPaise);
});

test("today begins at IST midnight: the last instant of yesterday is out, the first of today is in", async () => {
  const before = await getOpsToday(NOW);
  await order({
    status: "confirmed",
    totalPaise: 11_000,
    placedAt: new Date(START.getTime() - 1),
    payments: [{ status: "captured" }],
  });
  const afterYesterday = await getOpsToday(NOW);
  assert.equal(afterYesterday.ordersToday, before.ordersToday, "an order from IST yesterday counted as today");
  assert.equal(afterYesterday.revenueTodayPaise, before.revenueTodayPaise);

  await order({ status: "confirmed", totalPaise: 12_000, placedAt: START, payments: [{ status: "captured" }] });
  const afterToday = await getOpsToday(NOW);
  assert.equal(afterToday.ordersToday - before.ordersToday, 1);
  assert.equal(afterToday.revenueTodayPaise - before.revenueTodayPaise, 12_000);
});

test("the Payments figures use the same IST day", async () => {
  const before = await adminPaymentHealth(NOW);
  await order({
    status: "confirmed",
    totalPaise: 13_000,
    placedAt: new Date(START.getTime() - 1),
    payments: [{ status: "captured", createdAt: new Date(START.getTime() - 1) }],
  });
  await order({ status: "confirmed", totalPaise: 14_000, placedAt: START, payments: [{ status: "captured", createdAt: START }] });
  const after = await adminPaymentHealth(NOW);

  assert.equal(after.capturedCount - before.capturedCount, 1);
  assert.equal(after.capturedPaise - before.capturedPaise, 14_000);
});

test("customer value is what the customer paid for; the order count is what they placed", async () => {
  /* A customer of this test's own, so the figures are exact. */
  const own = userId;
  const list = (await adminListCustomers(1, 200)).rows.find((r) => r.id === own);
  const detail = await adminCustomerDetail(own);
  assert.ok(list && detail, "the test customer is not on the first page of the list");

  const mine = await db.order.findMany({
    where: { userId: own },
    select: { status: true, totalPaise: true, payments: { where: { status: "captured" }, select: { id: true } } },
  });
  const placed = mine.filter((o) => o.status !== "cancelled" && o.status !== "refunded");
  const paid = placed.filter((o) => o.payments.length > 0);
  const paidTotal = paid.reduce((n, o) => n + o.totalPaise, 0);
  assert.ok(placed.length > paid.length && paid.length > 0, "the fixtures no longer include both paid and unpaid orders");

  assert.equal(detail.lifetimePaise, paidTotal, "lifetime value includes an order that was not paid for");
  assert.equal(list.lifetimePaise, paidTotal, "the list and the detail page disagree");
  assert.equal(detail.orderCount, placed.length);
  assert.equal(list.orderCount, placed.length);
  assert.equal(detail.averageOrderPaise, Math.round(paidTotal / paid.length), "the average is not per paid order");
});

test("a capture on a cancelled order is on Today, with the number Payments shows", async () => {
  /* The cancelled-with-capture order above is already one of these. */
  const onDead = (await listCapturedPaymentsOnDeadOrders()).length;
  assert.ok(onDead > 0);
  const entry = await exception(/captured on a cancelled order$/);
  assert.ok(entry, "Today says nothing about money captured on a cancelled order");
  assert.equal(entry.severity, "bad");
  assert.equal(entry.href, "/admin/payments#refund-required");
  assert.equal(leadingCount(entry.title), onDead);

  const late = await order({ status: "cancelled", totalPaise: 5_000, payments: [{ status: "captured" }] });
  assert.equal(leadingCount((await exception(/captured on a cancelled order$/))?.title), onDead + 1);

  /* Refunded in full: the money went back, so it is no longer an exception. */
  await db.payment.update({ where: { id: late.payments[0].id }, data: { status: "refunded" } });
  assert.equal(leadingCount((await exception(/captured on a cancelled order$/))?.title), onDead);
});

test("an order paid twice is on Today, with the number Payments shows", async () => {
  const dup = (await listDuplicateCaptures()).length;
  assert.ok(dup > 0, "the twice-paid fixture is missing");
  const entry = await exception(/paid for more than once$/);
  assert.ok(entry, "Today says nothing about a second capture");
  assert.equal(entry.severity, "bad");
  assert.equal(leadingCount(entry.title), dup);
});

test("a failed refund is on Today until a retry is in flight or the money is back", async () => {
  const beforeCount = leadingCount((await exception(/refunds? ha(s|ve) failed$/))?.title);
  const o = await order({ status: "cancelled", totalPaise: 8_000, payments: [{ status: "captured" }] });
  const refund = (status: "failed" | "pending" | "processed") =>
    db.paymentRefund.create({
      data: { paymentId: o.payments[0].id, orderId: o.id, amountPaise: 8_000, status, reason: "test", actorEmail: "ops@example.test" },
    });

  await refund("failed");
  const failed = await exception(/refunds? ha(s|ve) failed$/);
  assert.ok(failed, "Today says nothing about a failed refund");
  assert.equal(failed.severity, "bad");
  assert.equal(failed.href, "/admin/payments#refunds");
  assert.equal(leadingCount(failed.title), beforeCount + 1);

  /* A second failure on the same payment is still one payment's money. */
  await refund("failed");
  assert.equal(leadingCount((await exception(/refunds? ha(s|ve) failed$/))?.title), beforeCount + 1);

  /* Retried and waiting on the gateway: no longer "failed", it is in flight. */
  const retry = await refund("pending");
  assert.equal(leadingCount((await exception(/refunds? ha(s|ve) failed$/))?.title), beforeCount);

  /* The retry went through and the payment is refunded. */
  await db.paymentRefund.update({ where: { id: retry.id }, data: { status: "processed" } });
  await db.payment.update({ where: { id: o.payments[0].id }, data: { status: "refunded" } });
  assert.equal(leadingCount((await exception(/refunds? ha(s|ve) failed$/))?.title), beforeCount);
});
