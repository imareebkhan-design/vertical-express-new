/**
 * Audit trail — ISS-015.
 *
 * The whole value of an audit log is that it cannot be absent when it matters.
 * These tests pin the two properties that make it trustworthy:
 *
 *   1. Every audited mutation writes EXACTLY ONE row, with correct before/after.
 *   2. The row shares the mutation's transaction — so a failed mutation leaves
 *      no audit row, and a successful one can never lack it.
 *
 * Property 2 is the one worth having: an audit written after the fact goes
 * missing precisely when something has gone wrong.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { advanceOrderStatus, advanceBookingStatus } from "../admin/manage";
import { recordAudit } from "../audit";

const TEST_USER = randomUUID();
const ADMIN_USER = randomUUID();
let warehouseId: string;
let orderId: string;
let bookingId: string;
let serviceId: string;
let serviceCategorySlug: string;

before(async () => {
  await db.user.createMany({
    data: [
      { id: TEST_USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`, email: `audit_${randomUUID()}@example.com` },
      { id: ADMIN_USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`, email: `auditadmin_${randomUUID()}@example.com` },
    ],
  });

  const wh = await db.warehouse.create({
    data: { name: "Audit Test Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = wh.id;

  const order = await db.order.create({
    data: {
      orderNo: `AUDIT-${Date.now()}`,
      userId: TEST_USER,
      warehouseId,
      status: "confirmed",
      subtotalPaise: 10000,
      taxPaise: 0,
      deliveryFeePaise: 0,
      discountPaise: 0,
      totalPaise: 10000,
      paymentMethod: "cod",
      address: {
        name: "Audit Buyer",
        phone: "9876543210",
        line1: "Plot 1",
        city: "Srinagar",
        state: "Jammu & Kashmir",
        pincode: "190001",
      },
    },
  });
  orderId = order.id;

  // The seed carries neither service categories nor services, and
  // Service.categorySlug is a foreign key — so the fixture owns both.
  const cat = await db.serviceCategory.create({
    data: {
      slug: `audit-cat-${Date.now()}`,
      name: "Audit Test Category",
      blurb: "Fixture",
      iconKey: "wrench",
    },
  });
  serviceCategorySlug = cat.slug;
  const service = await db.service.create({
    data: {
      slug: `audit-service-${Date.now()}`,
      categorySlug: cat.slug,
      name: "Audit Test Service",
    },
  });
  serviceId = service.id;
  const booking = await db.booking.create({
    data: {
      bookingNo: `AUDIT-BK-${Date.now()}`,
      serviceId,
      userId: TEST_USER,
      name: "Audit Booker",
      phone: "9876543210",
      scope: "Audit fixture",
      status: "received",
    },
  });
  bookingId = booking.id;
});

after(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { in: [ADMIN_USER, TEST_USER] } } });
  const ids = [orderId, bookingId].filter(Boolean) as string[];
  if (ids.length) await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  if (orderId) await db.orderStatusEvent.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { userId: TEST_USER } });
  await db.booking.deleteMany({ where: { userId: TEST_USER } });
  if (serviceId) await db.service.delete({ where: { id: serviceId } });
  if (serviceCategorySlug) await db.serviceCategory.delete({ where: { slug: serviceCategorySlug } });
  if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: [TEST_USER, ADMIN_USER] } } });
});

test("Audit: an order status change writes exactly one row with correct before/after", async () => {
  await advanceOrderStatus(ADMIN_USER, orderId, "packed");

  const rows = await db.auditLog.findMany({
    where: { entityType: "order", entityId: orderId, action: "order.status_changed" },
  });

  assert.equal(rows.length, 1, "exactly one audit row per transition");
  assert.equal(rows[0].actorType, "admin");
  assert.equal(rows[0].actorId, ADMIN_USER);
  assert.deepEqual(rows[0].before, { status: "confirmed" });
  assert.deepEqual(rows[0].after, { status: "packed" });
});

test("Audit: a rejected transition writes no row at all", async () => {
  const before = await db.auditLog.count({ where: { entityId: orderId } });

  // packed -> delivered is not a legal forward step.
  await assert.rejects(
    () => advanceOrderStatus(ADMIN_USER, orderId, "delivered"),
    /INVALID_TRANSITION/
  );

  const after = await db.auditLog.count({ where: { entityId: orderId } });
  assert.equal(after, before, "a refused mutation must leave no audit trace");
});

test("Audit: a booking status change is validated and audited", async () => {
  await advanceBookingStatus(ADMIN_USER, bookingId, "scheduled");

  const rows = await db.auditLog.findMany({
    where: { entityType: "booking", entityId: bookingId },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].before, { status: "received" });
  assert.deepEqual(rows[0].after, { status: "scheduled" });

  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  assert.equal(booking?.status, "scheduled");
});

test("Audit: an illegal booking transition is refused and leaves no trace", async () => {
  const before = await db.auditLog.count({ where: { entityId: bookingId } });

  // scheduled -> completed skips the flow; this was previously allowed.
  await assert.rejects(
    () => advanceBookingStatus(ADMIN_USER, bookingId, "completed"),
    /INVALID_TRANSITION/
  );

  const after = await db.auditLog.count({ where: { entityId: bookingId } });
  assert.equal(after, before);
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  assert.equal(booking?.status, "scheduled", "status must be unchanged");
});

test("Audit: the row shares the mutation's transaction and rolls back with it", async () => {
  const before = await db.auditLog.count({ where: { entityType: "rollback_probe" } });

  await assert.rejects(() =>
    db.$transaction(async (tx) => {
      await recordAudit(tx, {
        actorType: "system",
        action: "probe.written",
        entityType: "rollback_probe",
        entityId: orderId,
      });
      throw new Error("FORCED_ROLLBACK");
    })
  );

  const after = await db.auditLog.count({ where: { entityType: "rollback_probe" } });
  assert.equal(after, before, "audit row must not survive a rolled-back transaction");
});
