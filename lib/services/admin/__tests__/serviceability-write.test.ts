import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { savePincode, bulkSavePincodes, createCity, setCityLive, includePincodes, setPincodeIncluded, listServiceAreas } from "@/lib/services/admin/serviceability-write";
import { checkServiceability } from "@/lib/services/serviceability";
import { liveTestCityId } from "@/test-support/service-city";
import { db } from "@/lib/db";

/**
 * Editing where we deliver.
 *
 * This table decides whether checkout can take an order at all, what delivery
 * costs, and whether cash is offered. The screen was read-only with a note
 * saying it needed an audit trail first, so the tests here are mostly about the
 * trail being inseparable from the change and the bulk path being all-or-
 * nothing.
 */
const PIN_A = "199901";
const PIN_B = "199902";
const PIN_C = "199903";

async function cleanup() {
  const rows = await db.serviceablePincode.findMany({
    where: { pincode: { in: [PIN_A, PIN_B, PIN_C] } },
    select: { id: true },
  });
  await db.auditLog.deleteMany({ where: { entityId: { in: rows.map((r) => r.id) } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: { in: [PIN_A, PIN_B, PIN_C] } } });
}

async function warehouse() {
  const w = await db.warehouse.findFirst({ select: { id: true, name: true } });
  assert.ok(w, "no warehouse to attach a pincode to");
  return w;
}

async function auditFor(pincode: string) {
  const row = await db.serviceablePincode.findUnique({
    where: { pincode },
    select: { id: true },
  });
  if (!row) return [];
  return db.auditLog.findMany({
    where: { entityId: row.id, entityType: "ServiceablePincode" },
    orderBy: { createdAt: "desc" },
  });
}

test("adding a pincode records who added it", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();
  const actor = randomUUID();

  const r = await savePincode(
    { pincode: PIN_A, cityId: await liveTestCityId(), area: null, warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 4900, codAllowed: false, isActive: true },
    actor
  );
  assert.equal(r.created, true);

  const audit = await auditFor(PIN_A);
  assert.equal(audit.length, 1, "adding a pincode left no audit row");
  assert.equal(audit[0].action, "serviceability.added");
  assert.equal(audit[0].actorId, actor);
});

test("an edit records only what moved", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();
  const actor = randomUUID();

  await savePincode(
    { pincode: PIN_A, cityId: await liveTestCityId(), area: null, warehouseId: w.id, etaMinutes: 60, deliveryFeePaise: 4900, codAllowed: true, isActive: true },
    actor
  );
  await savePincode(
    { pincode: PIN_A, cityId: await liveTestCityId(), area: null, warehouseId: w.id, etaMinutes: 60, deliveryFeePaise: 9900, codAllowed: true, isActive: true },
    actor
  );

  const audit = await auditFor(PIN_A);
  assert.equal(audit.length, 2);
  const latest = audit[0];
  assert.equal(latest.action, "serviceability.updated");

  /* Only the fee moved. A whole-row diff would bury it among four fields that
     did not change, and "who put the fee up" is the question this log exists
     to answer. */
  const before = latest.before as Record<string, unknown>;
  const after = latest.after as Record<string, unknown>;
  assert.equal(before.deliveryFeePaise, 4900);
  assert.equal(after.deliveryFeePaise, 9900);
  assert.ok(!("codAllowed" in after), "an unchanged field was recorded as a change");
  assert.ok(!("etaMinutes" in after), "an unchanged field was recorded as a change");
});

test("saving with nothing changed writes no audit row", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();
  const actor = randomUUID();
  const edit = {
    pincode: PIN_A,
    cityId: await liveTestCityId(),
    area: null,
    warehouseId: w.id,
    etaMinutes: 0,
    deliveryFeePaise: 0,
    codAllowed: false,
    isActive: true,
  };

  await savePincode(edit, actor);
  const second = await savePincode(edit, actor);

  assert.equal(second.changed, false);
  /* Otherwise the log fills with "saved, no change" and buries the entries
     that matter. */
  assert.equal((await auditFor(PIN_A)).length, 1, "a no-op save wrote an audit row");
});

test("a bulk import applies every row and audits each", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();
  const actor = randomUUID();

  const res = await bulkSavePincodes(
    [
      { pincode: PIN_A, warehouseCode: w.name, etaMinutes: 0, deliveryFeePaise: 4900, codAllowed: false, isActive: true },
      { pincode: PIN_B, warehouseCode: w.name, etaMinutes: 0, deliveryFeePaise: 4900, codAllowed: false, isActive: true },
    ],
    actor,
    await liveTestCityId()
  );

  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.result.created, 2);
  assert.equal((await auditFor(PIN_A)).length, 1);
  assert.equal((await auditFor(PIN_B)).length, 1);
});

test("an unknown warehouse fails the whole file, not part of it", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();
  const actor = randomUUID();

  const res = await bulkSavePincodes(
    [
      { pincode: PIN_A, warehouseCode: w.name, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, isActive: true },
      { pincode: PIN_B, warehouseCode: "NO-SUCH-WAREHOUSE", etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, isActive: true },
    ],
    actor,
    await liveTestCityId()
  );

  assert.equal(res.ok, false, "a file naming an unknown warehouse was applied");

  /* THE POINT. The first row was perfectly valid and must still not be
     applied — half a coverage change leaves the map in a state nobody chose
     and nobody can see. */
  assert.equal(
    await db.serviceablePincode.count({ where: { pincode: { in: [PIN_A, PIN_B] } } }),
    0,
    "a rejected file still wrote one of its rows"
  );
});

test("a bulk import re-run changes nothing the second time", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();
  const actor = randomUUID();
  const rows = [
    { pincode: PIN_A, warehouseCode: w.name, etaMinutes: 0, deliveryFeePaise: 4900, codAllowed: false, isActive: true },
  ];

  await bulkSavePincodes(rows, actor, await liveTestCityId());
  const again = await bulkSavePincodes(rows, actor, await liveTestCityId());

  assert.equal(again.ok, true);
  if (again.ok) {
    assert.equal(again.result.unchanged, 1, "re-uploading the same file rewrote rows");
    assert.equal(again.result.created + again.result.updated, 0);
  }
  assert.equal((await auditFor(PIN_A)).length, 1, "an idempotent re-upload wrote audit noise");
});

test("a blank ETA stays absent rather than becoming a promise", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await warehouse();

  /* The schema defaults etaMinutes to 60. Writing 0 explicitly must survive
     that default, or every pincode added here quietly carries an unverified
     sixty-minute promise. */
  await savePincode(
    { pincode: PIN_A, cityId: await liveTestCityId(), area: null, warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, isActive: true },
    randomUUID()
  );

  const row = await db.serviceablePincode.findUnique({ where: { pincode: PIN_A } });
  assert.equal(row?.etaMinutes, 0, "the schema default overwrote an explicit 'no promise'");
});

/* ------------------------------------------------------------------------ */
/* Cities: go live / switch off, include / exclude (15 Oct 2026)             */
/* ------------------------------------------------------------------------ */

const PIN_D = "999051";
const PIN_E = "999052";

async function freshCity(tag: string) {
  const name = `ZZZ City ${tag} ${randomUUID().slice(0, 6)}`;
  const r = await createCity({ name, state: "Delhi" }, randomUUID());
  assert.equal(r.ok, true);
  return r.ok ? r.value.id : "";
}
async function cleanupCities() {
  const rows = await db.serviceablePincode.findMany({ where: { pincode: { in: [PIN_D, PIN_E] } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: rows.map((r) => r.id) } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: { in: [PIN_D, PIN_E] } } });
  const cities = await db.serviceCity.findMany({ where: { name: { startsWith: "ZZZ City " } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: cities.map((c) => c.id) } } });
  await db.serviceCity.deleteMany({ where: { id: { in: cities.map((c) => c.id) } } });
}

test("a new city starts off: its included pincodes are not sold until it goes live", async (t) => {
  t.after(cleanupCities);
  await cleanupCities();
  const w = await warehouse();
  const city = await freshCity("off");
  const inc = await includePincodes(city, [PIN_D], { warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, area: "Trial" }, randomUUID());
  assert.equal(inc.ok, true);
  assert.equal((await checkServiceability(PIN_D)).serviceable, false, "a city that is not live sold a pincode");

  assert.equal((await setCityLive(city, true, randomUUID())).ok, true);
  const live = await checkServiceability(PIN_D);
  assert.equal(live.serviceable, true);
  assert.equal(live.state, "Delhi", "GST place of supply comes from the served city");

  /* Off again: stops at once, and keeps the list and terms for next time. */
  await setCityLive(city, false, randomUUID());
  assert.equal((await checkServiceability(PIN_D)).serviceable, false);
  const row = await db.serviceablePincode.findUnique({ where: { pincode: PIN_D } });
  assert.equal(row?.isActive, true, "switching a city off must not rewrite its pincodes");
  assert.equal(row?.area, "Trial");
});

test("exclude one pincode inside a live city; re-include restores it", async (t) => {
  t.after(cleanupCities);
  await cleanupCities();
  const w = await warehouse();
  const city = await freshCity("excl");
  await setCityLive(city, true, randomUUID());
  await includePincodes(city, [PIN_D, PIN_E], { warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 4900, codAllowed: false, area: null }, randomUUID());
  assert.equal((await setPincodeIncluded(PIN_E, false, randomUUID())).ok, true);
  assert.equal((await checkServiceability(PIN_D)).serviceable, true);
  assert.equal((await checkServiceability(PIN_E)).serviceable, false);
  await setPincodeIncluded(PIN_E, true, randomUUID());
  const back = await checkServiceability(PIN_E);
  assert.equal(back.serviceable, true);
  assert.equal(back.deliveryFeePaise, 4900, "re-including kept its terms");
  const area = (await listServiceAreas()).find((c) => c.id === city);
  assert.equal(area?.included, 2);
  assert.equal(area?.excluded, 0);
});

test("a pincode in another city is refused, never silently moved — whole call", async (t) => {
  t.after(cleanupCities);
  await cleanupCities();
  const w = await warehouse();
  const a = await freshCity("a");
  const b = await freshCity("b");
  await includePincodes(a, [PIN_D], { warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, area: null }, randomUUID());
  const r = await includePincodes(b, [PIN_E, PIN_D], { warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, area: null }, randomUUID());
  assert.equal(r.ok, false);
  assert.equal((await db.serviceablePincode.findUnique({ where: { pincode: PIN_D } }))?.cityId, a);
  assert.equal(await db.serviceablePincode.count({ where: { pincode: PIN_E } }), 0, "half the call applied");
  const bulk = await bulkSavePincodes(
    [{ pincode: PIN_D, warehouseCode: w.name, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, isActive: true }],
    randomUUID(),
    b
  );
  assert.equal(bulk.ok, false, "a file for one city moved a pincode out of another");
});

test("city changes are audited; duplicate names refused", async (t) => {
  t.after(cleanupCities);
  await cleanupCities();
  const actor = randomUUID();
  const name = `ZZZ City dup ${randomUUID().slice(0, 6)}`;
  const r = await createCity({ name, state: "Maharashtra" }, actor);
  assert.equal(r.ok, true);
  assert.equal((await createCity({ name: name.toUpperCase(), state: "Maharashtra" }, actor)).ok, false);
  if (!r.ok) return;
  await setCityLive(r.value.id, true, actor);
  await setCityLive(r.value.id, true, actor);
  const audit = await db.auditLog.findMany({ where: { entityId: r.value.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(audit.map((a) => a.action), ["service_city.added", "service_city.live"], "a no-op go-live wrote noise");
});
