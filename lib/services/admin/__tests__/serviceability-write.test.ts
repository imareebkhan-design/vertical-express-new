import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { savePincode, bulkSavePincodes } from "@/lib/services/admin/serviceability-write";
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
    { pincode: PIN_A, warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 4900, codAllowed: false, isActive: true },
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
    { pincode: PIN_A, warehouseId: w.id, etaMinutes: 60, deliveryFeePaise: 4900, codAllowed: true, isActive: true },
    actor
  );
  await savePincode(
    { pincode: PIN_A, warehouseId: w.id, etaMinutes: 60, deliveryFeePaise: 9900, codAllowed: true, isActive: true },
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
    actor
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
    actor
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

  await bulkSavePincodes(rows, actor);
  const again = await bulkSavePincodes(rows, actor);

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
    { pincode: PIN_A, warehouseId: w.id, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, isActive: true },
    randomUUID()
  );

  const row = await db.serviceablePincode.findUnique({ where: { pincode: PIN_A } });
  assert.equal(row?.etaMinutes, 0, "the schema default overwrote an explicit 'no promise'");
});
