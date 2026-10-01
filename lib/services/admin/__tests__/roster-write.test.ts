import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  createDriver,
  createVehicle,
  setDriverActive,
  setVehicleActive,
  listRoster,
  normalisePhone,
} from "@/lib/services/admin/roster-write";
import { assignShipment } from "@/lib/services/admin/shipments-write";

/**
 * Creating and retiring the roster.
 *
 * The dispatch board could assign a driver from the moment `Driver` landed and
 * nothing could create one — on a fresh database the dropdown was empty and
 * every dispatch refused, because dispatch requires a driver. The feature was
 * unreachable by anybody who had not seeded the table by hand.
 */

let seq = 0;
const uniq = () => `zzz-roster-${Date.now()}-${seq++}`;

/* The file's own user. The seed creates none; borrowing "whichever user
   exists" passed only because an earlier test file happened to leave one
   behind, and failed when this file ran alone on a fresh database. No phone or
   email, so nothing unique can collide. Deleted after the file's own cleanups. */
let OWN_USER: string | null = null;
async function ownUser(): Promise<string> {
  OWN_USER ??= (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  return OWN_USER;
}
after(async () => {
  if (OWN_USER) await db.user.deleteMany({ where: { id: OWN_USER } });
});

let ACTOR = { id: "", email: "zzz-roster@demo.invalid" };

async function actor() {
  if (!ACTOR.id) {
    ACTOR = { ...ACTOR, id: await ownUser() };
  }
  return ACTOR;
}

async function cleanup() {
  await db.driver.deleteMany({ where: { name: { startsWith: "ZZZ Driver" } } });
  await db.vehicle.deleteMany({ where: { registration: { startsWith: "ZZZR" } } });
  await db.auditLog.deleteMany({ where: { entityType: { in: ["driver", "vehicle"] } } });
}

test("a bare ten-digit number becomes an Indian one, and a full number is left alone", () => {
  /* Srinagar numbers get typed as ten bare digits. Rewriting a number somebody
     typed in full would corrupt it — the same rule sign-in applies. */
  assert.equal(normalisePhone("9876543210"), "+919876543210");
  assert.equal(normalisePhone("098765 43210"), "+919876543210");
  assert.equal(normalisePhone("+919876543210"), "+919876543210");
  assert.equal(normalisePhone("+447700900123"), "+447700900123", "a foreign number was rewritten");
});

test("a driver can be created and is immediately assignable", async (t) => {
  t.after(cleanup);
  const a = await actor();

  const res = await createDriver({ name: "ZZZ Driver One", phone: uniq(), actor: a });
  assert.equal(res.ok, true);

  const roster = await listRoster();
  assert.ok(
    roster.drivers.some((d) => d.id === (res.ok === true ? res.id : "") && d.isActive),
    "the new driver is not on the roster as active"
  );

  const audits = await db.auditLog.count({
    where: { entityType: "driver", action: "driver.created" },
  });
  assert.ok(audits >= 1, "creating a driver left no trace");
});

test("two people cannot hold the same number", async (t) => {
  /* The unique constraint is the guarantee; the check is the message. */
  t.after(cleanup);
  const a = await actor();
  const phone = uniq();

  assert.equal((await createDriver({ name: "ZZZ Driver A", phone, actor: a })).ok, true);
  const second = await createDriver({ name: "ZZZ Driver B", phone, actor: a });
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.reason, "duplicate");
});

test("retiring a driver keeps their history and takes them out of dispatch", async (t) => {
  /* Never deleted: a driver who carried shipments is referenced by every one of
     them, and removing the row turns a delivered order into one nobody took. */
  t.after(cleanup);
  const a = await actor();

  const made = await createDriver({ name: "ZZZ Driver Retire", phone: uniq(), actor: a });
  assert.equal(made.ok, true);
  const driverId = made.ok === true ? made.id : "";

  assert.equal((await setDriverActive({ driverId, isActive: false, actor: a })).ok, true);

  const row = await db.driver.findUniqueOrThrow({ where: { id: driverId } });
  assert.equal(row.isActive, false, "the driver was not retired");
  assert.equal(row.name, "ZZZ Driver Retire", "the row was deleted rather than retired");

  /* And the dispatch path refuses them, which is the point of retiring. */
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });
  const order = await db.order.create({
    data: {
      orderNo: uniq(), userId: a.id, status: "confirmed", subtotalPaise: 100,
      discountPaise: 0, deliveryFeePaise: 0, taxPaise: 0, totalPaise: 100,
      paymentMethod: "razorpay", address: {}, warehouseId: wh.id,
    },
  });
  const shipment = await db.shipment.create({
    data: { orderId: order.id, sequence: 1, speedClass: "express", status: "pending", warehouseId: wh.id },
  });

  const assigned = await assignShipment({ shipmentId: shipment.id, driverId, actor: a });
  assert.equal(assigned.ok, false, "a retired driver was assigned a shipment");
  assert.equal(assigned.ok === false && assigned.reason, "driver_unavailable");

  await db.order.deleteMany({ where: { id: order.id } });
});

test("retiring twice records one change, not two clicks", async (t) => {
  /* Guarded on the opposite state, the same shape the coupon pause uses. */
  t.after(cleanup);
  const a = await actor();
  const made = await createDriver({ name: "ZZZ Driver Twice", phone: uniq(), actor: a });
  const driverId = made.ok === true ? made.id : "";

  await setDriverActive({ driverId, isActive: false, actor: a });
  await setDriverActive({ driverId, isActive: false, actor: a });

  const retirements = await db.auditLog.count({
    where: { entityId: driverId, action: "driver.retired" },
  });
  assert.equal(retirements, 1, `expected one retirement in the trail, found ${retirements}`);
});

test("a plate is stored one way, so the unique constraint means something", async (t) => {
  /* Plates are written and read in upper case. Storing them two ways makes the
     constraint useless and lets one vehicle exist twice. */
  t.after(cleanup);
  const a = await actor();
  const plate = `ZZZR${Date.now() % 100000}`;

  assert.equal((await createVehicle({ registration: plate.toLowerCase(), kind: "bike", actor: a })).ok, true);

  const row = await db.vehicle.findFirstOrThrow({ where: { registration: plate.toUpperCase() } });
  assert.equal(row.registration, plate.toUpperCase(), "the plate was not normalised");

  const dupe = await createVehicle({ registration: plate.toLowerCase(), kind: "van", actor: a });
  assert.equal(dupe.ok, false, "the same plate was accepted twice in different cases");
});

test("a vehicle can be retired and reinstated, and both are recorded", async (t) => {
  t.after(cleanup);
  const a = await actor();
  const made = await createVehicle({
    registration: `ZZZR${(Date.now() + 1) % 100000}`,
    kind: "truck",
    actor: a,
  });
  const vehicleId = made.ok === true ? made.id : "";

  await setVehicleActive({ vehicleId, isActive: false, actor: a });
  await setVehicleActive({ vehicleId, isActive: true, actor: a });

  const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  assert.equal(row.isActive, true);

  const actions = (
    await db.auditLog.findMany({ where: { entityId: vehicleId }, select: { action: true } })
  ).map((r) => r.action);
  assert.ok(actions.includes("vehicle.retired"), "retiring was not recorded");
  assert.ok(actions.includes("vehicle.reinstated"), "reinstating was not recorded");
});

test("something that does not exist cannot be retired", async (t) => {
  t.after(cleanup);
  const a = await actor();
  const res = await setDriverActive({
    driverId: "00000000-0000-0000-0000-000000000000",
    isActive: false,
    actor: a,
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "not_found");
});
