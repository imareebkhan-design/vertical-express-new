import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { advanceShipment, assignShipment, confirmDelivery } from "@/lib/services/admin/shipments-write";
import {
  canTransitionShipment,
  nextShipmentStatuses,
  generateDeliveryCode,
} from "@/lib/shipment-flow";

/**
 * The first code that moves a shipment.
 *
 * `Shipment` has been write-once since the model was added — created at
 * `pending` inside the checkout transaction and never advanced. Every field the
 * fulfilment loop needs was already on the row and permanently null:
 * `dispatchedAt`, `deliveredAt`, `deliveryCode`, `warehouseId`. That is ISS-009,
 * and it is why the dispatch board has nothing to dispatch and the tracking
 * timeline never leaves its first stage.
 */
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const ACTOR = { id: "", email: "zzz-ship@demo.invalid" };

let seq = 0;
const uniq = () => `zzz-ship-${Date.now()}-${seq++}`;

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

async function scratchShipment(): Promise<{ shipmentId: string; orderId: string }> {
  const user = { id: await ownUser() };
  const warehouse = await db.warehouse.findFirst({ select: { id: true } });
  assert.ok(user && warehouse, "the demo database has no user or warehouse to attach to");
  ACTOR.id = user.id;

  const order = await db.order.create({
    data: {
      orderNo: uniq(),
      userId: user.id,
      status: "confirmed",
      subtotalPaise: 10000,
      discountPaise: 0,
      deliveryFeePaise: 0,
      taxPaise: 0,
      totalPaise: 10000,
      paymentMethod: "razorpay",
      address: {},
      warehouseId: warehouse.id,
    },
  });

  const shipment = await db.shipment.create({
    data: {
      orderId: order.id,
      sequence: 1,
      speedClass: "express",
      status: "pending",
      warehouseId: warehouse.id,
    },
  });
  return { shipmentId: shipment.id, orderId: order.id };
}

/** A driver to hand goods to. Dispatch refuses without one. */
async function scratchDriver(): Promise<string> {
  const d = await db.driver.create({
    data: { name: "Scratch Rider", phone: uniq(), isActive: true },
  });
  return d.id;
}

/** Assign a driver so a dispatch is allowed to proceed. */
async function withDriver(shipmentId: string): Promise<string> {
  const driverId = await scratchDriver();
  const res = await assignShipment({ shipmentId, driverId, actor: ACTOR });
  assert.equal(res.ok, true, "could not assign a driver to the scratch shipment");
  return driverId;
}

async function cleanup() {
  /* Scoped to the scratch shipments' own ids. This used to delete every audit
     row of type "shipment", which would take real shipments' trail with it the
     moment the demo seed has any. */
  const scratch = await db.shipment.findMany({
    where: { order: { orderNo: { startsWith: "zzz-ship-" } } },
    select: { id: true },
  });
  await db.auditLog.deleteMany({
    where: { entityType: "shipment", entityId: { in: scratch.map((s) => s.id) } },
  });
  await db.order.deleteMany({ where: { orderNo: { startsWith: "zzz-ship-" } } });
  await db.driver.deleteMany({ where: { name: "Scratch Rider" } });
  await db.vehicle.deleteMany({ where: { registration: { startsWith: "ZZZ-" } } });
}

test("the whole forward path is legal and each step is refused out of order", () => {
  const journey = ["pending", "packed", "out_for_delivery", "delivered"] as const;
  for (let i = 0; i < journey.length - 1; i++) {
    assert.ok(
      canTransitionShipment(journey[i], journey[i + 1]),
      `${journey[i]} -> ${journey[i + 1]} is refused, so nothing can ever be delivered`
    );
  }

  /* Skipping a stage means a shipment marked delivered that was never packed. */
  assert.equal(canTransitionShipment("pending", "delivered"), false);
  assert.equal(canTransitionShipment("pending", "out_for_delivery"), false);

  /* No route back. Once goods are on a vehicle, "unpack it" is a physical act
     with a physical record, not a dropdown. */
  assert.equal(canTransitionShipment("out_for_delivery", "packed"), false);
  assert.equal(canTransitionShipment("delivered", "out_for_delivery"), false);

  for (const terminal of ["delivered", "cancelled"] as const) {
    assert.deepEqual(nextShipmentStatuses(terminal), [], `${terminal} is not terminal`);
  }
});

test("a shipment advances, and the timestamps follow the goods", async (t) => {
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();

  const packed = await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });
  assert.equal(packed.ok, true);

  let row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "packed");
  assert.equal(row.dispatchedAt, null, "packing is not dispatching");
  assert.equal(row.deliveryCode, null, "a code must not exist while the goods are in the warehouse");

  await withDriver(shipmentId);
  const out = await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });
  assert.equal(out.ok, true);

  row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "out_for_delivery");
  assert.ok(row.dispatchedAt, "dispatchedAt was not stamped when the goods left");
  assert.match(row.deliveryCode ?? "", /^\d{6}$/, "no six-digit handover code was issued");
  assert.equal(row.deliveredAt, null);

  const code = row.deliveryCode;
  const done = await advanceShipment({ shipmentId, to: "delivered", actor: ACTOR });
  assert.equal(done.ok, true);

  row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "delivered");
  assert.ok(row.deliveredAt, "deliveredAt was not stamped");
  assert.equal(
    row.deliveryCode,
    code,
    "the code changed after the customer was given it, so theirs would not match"
  );
});

test("an illegal move changes nothing at all", async (t) => {
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();

  const res = await advanceShipment({ shipmentId, to: "delivered", actor: ACTOR });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "illegal_transition");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "pending", "an illegal move still moved the row");

  const audits = await db.auditLog.count({ where: { entityId: shipmentId } });
  assert.equal(audits, 0, "a refused move wrote an audit row");
});

test("two operators dispatching at the same moment produce one dispatch", async (t) => {
  /* This is the test that exercises the `updateMany` guard, and getting there
     took two attempts worth recording.
   *
   * The first version staged the race: commit the competing dispatch, then call
   * the service. That never reached the guard — `advanceShipment` re-reads the
   * status first, saw `out_for_delivery`, and refused with
   * `illegal_transition` before writing anything. A passing test that proved
   * nothing about concurrency, which is the exact failure two earlier
   * concurrency tests on this project already had.
   *
   * Concurrent calls do reach it. Both read `packed` — the read is outside the
   * transaction — and both then attempt a write guarded on `status: "packed"`.
   * One matches a row and one matches none. Verified to fail when the guard is
   * dropped from the where clause: both dispatch, and the second overwrites the
   * code the customer was already given. */
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });
  await withDriver(shipmentId);

  const [a, b] = await Promise.all([
    advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR }),
    advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR }),
  ]);

  const succeeded = [a, b].filter((r) => r.ok);
  assert.equal(
    succeeded.length,
    1,
    `${succeeded.length} of two concurrent dispatches succeeded — the guard did not hold`
  );
  const refused = [a, b].find((r) => !r.ok);
  assert.equal(refused && refused.ok === false && refused.reason, "raced");

  /* One dispatch, one code, one audit trail. */
  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "out_for_delivery");
  assert.equal(
    row.deliveryCode,
    succeeded[0].ok === true ? succeeded[0].deliveryCode : null,
    "the row carries a different code from the one the winning call returned"
  );

  const dispatches = await db.auditLog.count({
    where: { entityId: shipmentId, action: "shipment.status_changed" },
  });
  assert.equal(dispatches, 2, "expected one audit row for packing and one for dispatch");
  const assignments = await db.auditLog.count({
    where: { entityId: shipmentId, action: "shipment.assigned" },
  });
  assert.equal(assignments, 1, "the driver assignment left no trace");
});

test("dispatching something already dispatched is refused before it writes", async (t) => {
  /* The sequential case, which is what an operator double-clicking actually
     hits. Distinct from the race above: here the re-read sees the new status
     and the move is simply illegal. */
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });
  await withDriver(shipmentId);
  const first = await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });
  assert.equal(first.ok, true);
  const code = first.ok === true ? first.deliveryCode : null;

  const second = await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });
  assert.equal(second.ok, false, "a second dispatch succeeded");
  assert.equal(second.ok === false && second.reason, "illegal_transition");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(
    row.deliveryCode,
    code,
    "the second attempt overwrote the code the customer already has"
  );
});

test("the write is guarded on the status it read, in one statement", () => {
  /* The property the staged race depends on. A read-then-write would pass that
     test only by luck of timing. */
  const src = readFileSync(
    join(ROOT, "lib/services/admin/shipments-write.ts"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(
    src,
    /updateMany\(\{\s*where:\s*\{\s*id:\s*shipmentId,\s*status:\s*from\b/,
    "the shipment write is no longer guarded on the status it read"
  );
});

test("cancelling puts the goods back and says so separately", async (t) => {
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();

  const res = await advanceShipment({ shipmentId, to: "cancelled", actor: ACTOR });
  assert.equal(res.ok, true);

  const actions = (
    await db.auditLog.findMany({ where: { entityId: shipmentId }, select: { action: true } })
  ).map((a) => a.action);

  assert.ok(
    actions.includes("shipment.status_changed"),
    "the cancellation was not recorded"
  );
  assert.ok(
    actions.includes("inventory.released"),
    "stock moved back with no separate record — a different kind of loss to investigate"
  );
});

test("the handover code is not written into the audit trail", async (t) => {
  /* It is a credential the customer reads out at their gate. An append-only log
     every operator can read is the wrong place for it. */
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });
  await withDriver(shipmentId);
  const out = await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });
  assert.equal(out.ok, true);

  const code = out.ok === true ? out.deliveryCode : null;
  assert.match(code ?? "", /^\d{6}$/);

  const rows = await db.auditLog.findMany({ where: { entityId: shipmentId } });
  const dumped = JSON.stringify(rows);
  assert.ok(!dumped.includes(code!), "the delivery code was written into the audit log");
});

test("the code is uniform over the whole range, including leading zeros", () => {
  /* padStart, not a 100000..999999 range: a code that can never start with a
     zero has 10% fewer values and a guessable shape. */
  assert.equal(generateDeliveryCode(() => 0), "000000");
  assert.equal(generateDeliveryCode(() => 7), "000007");
  assert.equal(generateDeliveryCode(() => 999_999), "999999");
});


test("goods do not leave without a name against them", async (t) => {
  /* The one rule here that is a decision rather than a mechanism. A dispatch
     with no driver issues a delivery code that proves nothing, because there is
     nobody it was given to. */
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });

  const res = await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });
  assert.equal(res.ok, false, "a shipment was dispatched with no driver");
  assert.equal(res.ok === false && res.reason, "no_driver");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "packed", "the refused dispatch still moved the row");
  assert.equal(row.deliveryCode, null, "a code was issued for a dispatch that did not happen");
});

test("a vehicle is optional; a rider on their own bike is a real case", async (t) => {
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  const driverId = await scratchDriver();

  const res = await assignShipment({ shipmentId, driverId, actor: ACTOR });
  assert.equal(res.ok, true, "assignment required a vehicle");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.driverId, driverId);
  assert.equal(row.vehicleId, null);
});

test("an inactive driver cannot be assigned", async (t) => {
  /* Somebody who has left must not still be receiving goods. */
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  const driverId = await scratchDriver();
  await db.driver.update({ where: { id: driverId }, data: { isActive: false } });

  const res = await assignShipment({ shipmentId, driverId, actor: ACTOR });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "driver_unavailable");
});

test("a shipment already on the road cannot have its driver rewritten", async (t) => {
  /* Reassigning after dispatch rewrites who took the goods, which is the one
     fact proof of delivery depends on. */
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });
  const firstDriver = await withDriver(shipmentId);
  await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });

  const other = await scratchDriver();
  const res = await assignShipment({ shipmentId, driverId: other, actor: ACTOR });
  assert.equal(res.ok, false, "a dispatched shipment was reassigned");
  assert.equal(res.ok === false && res.reason, "already_gone");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.driverId, firstDriver, "the driver of record changed after dispatch");
});

/* ---- Proof of delivery ---------------------------------------------------
 *
 * `advanceShipment` moved a shipment to `delivered` with no check at all — the
 * six-digit code was issued at dispatch and then nothing ever asked for it.
 * That made the whole handover ceremonial: a code the customer reads out that
 * nobody verifies is theatre.
 */

/** Dispatch a scratch shipment and return its live code. */
async function dispatched(): Promise<{ shipmentId: string; code: string }> {
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });
  await withDriver(shipmentId);
  const out = await advanceShipment({ shipmentId, to: "out_for_delivery", actor: ACTOR });
  assert.equal(out.ok, true);
  const code = out.ok === true ? out.deliveryCode : null;
  assert.match(code ?? "", /^\d{6}$/);
  return { shipmentId, code: code! };
}

test("the right code delivers the shipment and records that there was proof", async (t) => {
  t.after(cleanup);
  const { shipmentId, code } = await dispatched();

  const res = await confirmDelivery({ shipmentId, code, actor: ACTOR });
  assert.equal(res.ok, true);

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "delivered");
  assert.ok(row.deliveredAt);

  const rows = await db.auditLog.findMany({ where: { entityId: shipmentId } });
  const dumped = JSON.stringify(rows);
  assert.ok(dumped.includes("delivery_code"), "the delivery was not recorded as proven");
  assert.ok(!dumped.includes(code), "the code itself reached the audit trail");
});

test("a wrong code delivers nothing", async (t) => {
  t.after(cleanup);
  const { shipmentId, code } = await dispatched();
  const wrong = code === "000000" ? "111111" : "000000";

  const res = await confirmDelivery({ shipmentId, code: wrong, actor: ACTOR });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "rejected");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "out_for_delivery", "a wrong code still delivered the goods");
  assert.equal(row.deliveredAt, null);
});

test("a shipment that does not exist is rejected the same way a wrong code is", async (t) => {
  /* Telling them apart tells an attacker which shipment ids are real and which
     are in the air right now. */
  t.after(cleanup);
  const res = await confirmDelivery({
    shipmentId: "00000000-0000-0000-0000-000000000000",
    code: "123456",
    actor: ACTOR,
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "rejected");
});

test("a shipment still in the warehouse cannot be confirmed delivered", async (t) => {
  t.after(cleanup);
  const { shipmentId } = await scratchShipment();
  await advanceShipment({ shipmentId, to: "packed", actor: ACTOR });

  const res = await confirmDelivery({ shipmentId, code: "123456", actor: ACTOR });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "rejected");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "packed");
});

test("guessing is capped before a million values can be tried", async (t) => {
  /* Six digits is 10^6, which a script exhausts in minutes. Five attempts per
     fifteen minutes, matching the OTP bucket (DEC-016) rather than inventing a
     second answer to the same question. */
  t.after(cleanup);
  const { shipmentId, code } = await dispatched();
  const wrong = code === "000000" ? "111111" : "000000";

  const reasons: string[] = [];
  for (let i = 0; i < 7; i++) {
    const r = await confirmDelivery({ shipmentId, code: wrong, actor: ACTOR });
    reasons.push(r.ok ? "ok" : r.reason);
  }

  assert.ok(
    reasons.includes("rate_limited"),
    `seven wrong codes were all accepted for checking: ${reasons.join(", ")}`
  );

  /* And the real code is refused too once the cap is hit — otherwise the cap
     only slows an attacker down between windows. */
  const afterCap = await confirmDelivery({ shipmentId, code, actor: ACTOR });
  assert.equal(afterCap.ok, false);
  assert.equal(afterCap.ok === false && afterCap.reason, "rate_limited");

  const row = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assert.equal(row.status, "out_for_delivery");
});

test("marking delivered without a code is possible and is recorded as unproven", async (t) => {
  /* A customer who was not there to read the code has to be handled somehow.
     Both paths exist; the trail distinguishes them, because "delivered" with
     and without somebody confirming it are different claims. WHEN an operator
     may do this is a policy question and is the owner's. */
  t.after(cleanup);
  const { shipmentId } = await dispatched();

  const res = await advanceShipment({ shipmentId, to: "delivered", actor: ACTOR });
  assert.equal(res.ok, true);

  const rows = await db.auditLog.findMany({ where: { entityId: shipmentId } });
  const dumped = JSON.stringify(rows);
  assert.ok(dumped.includes('"proof":"none"'), "an unproven delivery was not marked as such");
  assert.ok(!dumped.includes("delivery_code"), "an unproven delivery claims proof it does not have");
});

test("the code comparison does not short-circuit on length", () => {
  /* `timingSafeEqual` throws on unequal lengths, so a length check in front of
     it leaks the expected length through an early return. */
  const src = readFileSync(
    join(ROOT, "lib/services/admin/shipments-write.ts"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, " ");

  assert.match(src, /timingSafeEqual\(/, "the code is no longer compared in constant time");
  const fn = /function constantTimeEquals[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, "the comparison helper has gone");
  assert.ok(
    !/if\s*\([^)]*length[^)]*\)\s*return/.test(fn[0]),
    "the comparison returns early on a length mismatch, which leaks the expected length"
  );
});
