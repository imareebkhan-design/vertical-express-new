import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import {
  createDriver,
  setDriverActive,
  updateDriver,
  releaseDriverLogin,
  listRosterDetailed,
} from "@/lib/services/admin/roster-write";
import { assignShipment, advanceShipment } from "@/lib/services/admin/shipments-write";
import { resolveDriver } from "@/lib/services/tracking";

/**
 * A driver's whole life on the roster: hired, first app sign-in binds their
 * verified phone, edited, retired (loses driver mode), reinstated, app login
 * released for a lost phone. Nobody is deleted; every change is audited.
 */
const tag = randomUUID().slice(0, 8);
let actorId = "";
let warehouseId = "";
let userId = "";
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const token = (uid: string, phone_number: string) => ({ uid, phone_number }) as unknown as DecodedIdToken;
const actor = () => ({ id: actorId, email: "zzz-lifecycle@demo.invalid" });

before(async () => {
  actorId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  userId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ LIFE ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
});

after(async () => {
  const drivers = await db.driver.findMany({ where: { name: { startsWith: `ZZZ Life ${tag}` } }, select: { id: true } });
  const ids = drivers.map((d) => d.id);
  const orders = await db.order.findMany({ where: { orderNo: { startsWith: `ZZZLIFE-${tag}` } }, select: { id: true } });
  const shipments = await db.shipment.findMany({ where: { orderId: { in: orders.map((o) => o.id) } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...shipments.map((s) => s.id)] } } });
  await db.shipmentLiveLocation.deleteMany({ where: { shipmentId: { in: shipments.map((s) => s.id) } } });
  await db.shipment.deleteMany({ where: { id: { in: shipments.map((s) => s.id) } } });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.driver.deleteMany({ where: { id: { in: ids } } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: [actorId, userId] } } });
});

let n = 0;
async function newDriver(name = "A") {
  const p = phone();
  const r = await createDriver({ name: `ZZZ Life ${tag} ${name}`, phone: p, actor: actor() });
  assert.equal(r.ok, true);
  return { id: r.ok ? r.id : "", phone: `+91${p}` };
}
async function packedShipment() {
  const order = await db.order.create({
    data: {
      orderNo: `ZZZLIFE-${tag}-${n++}`, userId, status: "confirmed", subtotalPaise: 100, totalPaise: 100,
      paymentMethod: "razorpay", warehouseId,
      address: { name: "Bilal", phone: "+919800000000", line1: "12 Link Road", city: "Srinagar", pincode: "190005" },
    },
  });
  return (await db.shipment.create({ data: { orderId: order.id, sequence: 1, speedClass: "express", status: "packed", warehouseId } })).id;
}

test("first verified sign-in binds the driver; a different account with the same number is refused", async () => {
  const d = await newDriver("Bind");
  const first = await resolveDriver(token(`uid-a-${tag}`, d.phone));
  assert.equal(first?.driverId, d.id);
  assert.equal(await resolveDriver(token(`uid-b-${tag}`, d.phone)), null, "a second account rebound silently");
  assert.equal((await resolveDriver(token(`uid-a-${tag}`, d.phone)))?.driverId, d.id, "the bound account still works");
  const row = (await listRosterDetailed()).drivers.find((x) => x.id === d.id);
  assert.equal(row?.appLinked, true);
  assert.equal("firebaseUid" in (row ?? {}), false, "the Firebase uid must not reach the screen");
});

test("an unknown number is not a driver", async () => {
  assert.equal(await resolveDriver(token(`uid-x-${tag}`, `+91${phone()}`)), null);
});

test("retiring removes driver access at once; reinstating restores it", async () => {
  const d = await newDriver("Retire");
  assert.ok(await resolveDriver(token(`uid-r-${tag}`, d.phone)));
  await setDriverActive({ driverId: d.id, isActive: false, actor: actor() });
  assert.equal(await resolveDriver(token(`uid-r-${tag}`, d.phone)), null);
  await setDriverActive({ driverId: d.id, isActive: true, actor: actor() });
  assert.ok(await resolveDriver(token(`uid-r-${tag}`, d.phone)));
});

test("edit: name always; phone only before the first app sign-in; duplicates refused; audited", async () => {
  const d = await newDriver("Edit");
  const other = await newDriver("Other");
  const p2 = phone();
  assert.deepEqual(await updateDriver({ driverId: d.id, name: `ZZZ Life ${tag} Edited`, phone: p2, actor: actor() }), { ok: true, id: d.id });
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: d.id, action: "driver.updated" } });
  assert.equal((audit.after as { phone: string }).phone, `+91${p2}`);
  assert.deepEqual(await updateDriver({ driverId: d.id, name: `ZZZ Life ${tag} Edited`, phone: other.phone, actor: actor() }), { ok: false, reason: "duplicate" });
  await resolveDriver(token(`uid-e-${tag}`, `+91${p2}`));
  assert.deepEqual(await updateDriver({ driverId: d.id, name: `ZZZ Life ${tag} Edited`, phone: phone(), actor: actor() }), { ok: false, reason: "bound" });
  assert.deepEqual(await updateDriver({ driverId: d.id, name: `ZZZ Life ${tag} Renamed`, phone: `+91${p2}`, actor: actor() }), { ok: true, id: d.id }, "a bound driver can still be renamed");
  assert.deepEqual(await updateDriver({ driverId: randomUUID(), name: "x y", phone: phone(), actor: actor() }), { ok: false, reason: "not_found" });
});

test("release app login: refused while out on a delivery; otherwise unbinds with a reason, and the next sign-in binds afresh", async () => {
  const d = await newDriver("Release");
  await resolveDriver(token(`uid-old-${tag}`, d.phone));
  const shipmentId = await packedShipment();
  assert.equal((await assignShipment({ shipmentId, driverId: d.id, actor: actor() })).ok, true);
  assert.equal((await advanceShipment({ shipmentId, to: "out_for_delivery", actor: actor() })).ok, true);
  assert.deepEqual(await releaseDriverLogin({ driverId: d.id, reason: "phone lost", actor: actor() }), { ok: false, reason: "on_delivery" });

  await advanceShipment({ shipmentId, to: "cancelled", actor: actor() });
  assert.deepEqual(await releaseDriverLogin({ driverId: d.id, reason: "phone lost", actor: actor() }), { ok: true, id: d.id });
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: d.id, action: "driver.login_released" } });
  assert.equal((audit.after as { reason: string }).reason, "phone lost");
  assert.equal(await resolveDriver(token(`uid-old-${tag}`, d.phone)).then((r) => r?.driverId), d.id, "re-binds on next verified sign-in");
  assert.equal(await resolveDriver(token(`uid-third-${tag}`, d.phone)), null, "and is pinned again");
});

test("the detailed roster counts assigned and delivered work", async () => {
  const d = await newDriver("Counts");
  const shipmentId = await packedShipment();
  await assignShipment({ shipmentId, driverId: d.id, actor: actor() });
  const row = (await listRosterDetailed()).drivers.find((x) => x.id === d.id);
  assert.equal(row?.shipments.length, 1);
  assert.equal(row?.shipments[0].status, "packed");
  assert.equal(row?.deliveredCount, 0);
  assert.equal(row?.appLinked, false);
});
